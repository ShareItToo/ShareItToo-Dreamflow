#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { diagnoseAndroidAuthenticatedSession } from './diagnose_android_authenticated_session.mjs';
import { diagnoseCurrentHeadAndroidLegalRoutes } from './diagnose_current_head_android_legal_routes.mjs';
import {
  defaultCurrentHeadAndroidCommandRunner,
  diagnoseCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import { diagnoseCurrentHeadAndroidLargeTextMainNavigation } from './diagnose_current_head_android_large_text_main_navigation.mjs';
import { diagnoseCurrentHeadAndroidRestart } from './diagnose_current_head_android_restart.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import { validateCurrentHeadAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';
import { validatePf14bCurrentHeadAndroidTouchTarget } from './validate_pf14b_current_head_android_touch_target.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pf14bEvidencePath =
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json';
const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';
const expectedNavigationLabels = Object.freeze([
  'Entdecken',
  'Mietkorb',
  'Buchungen',
  'Nachrichten',
  'Mein SIT',
]);
const expectedLegalLabels = Object.freeze([
  'Impressum',
  'Datenschutz',
  'AGB',
  'Community‑Regeln',
  'Gebühren & Zahlungsbedingungen',
  'Stornierungsbedingungen',
  'Haftungsausschluss',
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function trueKeys(value) {
  return Object.entries(value ?? {})
    .filter(([, state]) => state === true)
    .map(([key]) => key)
    .sort();
}

function assertCandidateBinding(result, candidate, label) {
  if (!exact(result.candidate, {
    applicationId: candidate.applicationId,
    bundleId: candidate.bundleId,
    versionName: candidate.versionName,
    buildNumber: candidate.buildNumber,
    commit: candidate.commit,
    releaseChannel: candidate.releaseChannel,
    apiBaseUrl: candidate.apiBaseUrl,
    firebaseConfigured: candidate.firebaseConfigured,
    paymentMode: candidate.paymentMode,
    stripeLivemode: candidate.stripeLivemode,
    ...(label === 'restart' ? { apkSha256: candidate.android.apkSha256 } : {}),
  })) {
    fail(`PF16 ${label} result is not bound to the exact candidate.`);
  }
}

function assertDirectInstall(result, candidate, label) {
  if (result.installed?.packageIdentityVerified !== true
      || result.installed.versionName !== candidate.versionName
      || result.installed.buildNumber !== candidate.buildNumber
      || result.installed.delivery !== 'direct-apk'
      || result.installed.apkSha256 !== candidate.android.apkSha256) {
    fail(`PF16 ${label} result is not bound to the installed direct APK.`);
  }
}

function assertTestsPassed(result, labels, label) {
  if (!exact(Object.keys(result.tests ?? {}), labels)
      || !Object.values(result.tests).every((test) => test.status === 'passed')) {
    fail(`PF16 ${label} checks are incomplete.`);
  }
}

function assertTrueBoundaryKeys(result, expected, label) {
  if (!exact(trueKeys(result.boundaries), [...expected].sort())) {
    fail(`PF16 ${label} boundaries are invalid or overstated.`);
  }
}

export async function loadPf16CurrentCandidate({ repositoryRoot = root } = {}) {
  const evidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, pf14bEvidencePath),
    'utf8',
  ));
  const pf14b = validatePf14bCurrentHeadAndroidTouchTarget({
    root: repositoryRoot,
    evidence,
  });
  if (pf14b.candidateCommit !== expectedCommit
      || pf14b.buildNumber !== expectedBuildNumber
      || pf14b.dataPreservingDirectUpdate !== true
      || pf14b.stageAReady !== false) {
    fail('PF16 requires the exact fail-closed PF14B candidate evidence.');
  }
  const candidateDirectory = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'release',
    'android',
    `${expectedBuildNumber}-${expectedCommit}`,
  );
  const archive = await validateCurrentHeadAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
    expectedIdentity: {
      versionName: evidence.source.versionName,
      buildNumber: expectedBuildNumber,
      commit: expectedCommit,
    },
  });
  if (archive.apkSha256 !== evidence.signedCandidate.apkSha256
      || archive.aabSha256 !== evidence.signedCandidate.aabSha256
      || archive.privacyReportSha256 !== evidence.signedCandidate.privacyReportSha256) {
    fail('PF16 private archive hashes do not match PF14B evidence.');
  }
  const candidate = Object.freeze({
    ...archive,
    paymentMode: 'memory',
    stripeLivemode: false,
  });
  return Object.freeze({ candidate, archive });
}

export async function runPf16CurrentCandidateReadOnlyRegression({
  candidate,
  archive,
  device,
  deviceSummary,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  restartDiagnostic = diagnoseCurrentHeadAndroidRestart,
  authenticatedSessionDiagnostic = diagnoseAndroidAuthenticatedSession,
  mainNavigationDiagnostic = diagnoseCurrentHeadAndroidMainNavigation,
  legalRoutesDiagnostic = diagnoseCurrentHeadAndroidLegalRoutes,
  largeTextDiagnostic = diagnoseCurrentHeadAndroidLargeTextMainNavigation,
} = {}) {
  const common = { adbPath, device, deviceSummary, candidate, capturedAt };
  const restart = await restartDiagnostic(common);
  const session = await authenticatedSessionDiagnostic({ ...common, archive });
  const offline = await authenticatedSessionDiagnostic({
    ...common,
    archive,
    networkCondition: 'offline',
  });
  const navigation = await mainNavigationDiagnostic(common);
  const legal = await legalRoutesDiagnostic(common);
  const largeText = await largeTextDiagnostic(common);

  for (const [label, result] of [
    ['restart', restart],
    ['session', session],
    ['offline', offline],
    ['navigation', navigation],
    ['legal', legal],
    ['large-text', largeText],
  ]) {
    if (!exact(result.device, deviceSummary)) {
      fail(`PF16 ${label} device summary drifted.`);
    }
    assertCandidateBinding(result, candidate, label);
  }
  if (restart.status !== 'passed-bounded-process-restart-diagnostic') {
    fail('PF16 process restart did not pass.');
  }
  assertTrueBoundaryKeys(restart, [], 'restart');

  for (const [label, result] of [['session', session], ['offline', offline]]) {
    if (result.status !== 'passed-bounded-authenticated-session-diagnostic') {
      fail(`PF16 ${label} authenticated session did not pass.`);
    }
    assertDirectInstall(result, candidate, label);
    assertTestsPassed(
      result,
      ['authenticatedProfileAccess', 'coldStartSessionRestore'],
      label,
    );
    assertTrueBoundaryKeys(result, ['directDiagnosticOnly'], label);
  }
  if (!exact(offline.network, {
    condition: 'offline',
    onlinePrecondition: 'passed',
    wifiDisabled: true,
    mobileDataDisabled: true,
    connectivityGate: 'passed-no-connectivity',
    networkRestored: 'passed-online',
  })) {
    fail('PF16 offline transport restoration is incomplete.');
  }

  if (navigation.status !== 'passed-bounded-authenticated-main-navigation-diagnostic') {
    fail('PF16 main navigation did not pass.');
  }
  assertDirectInstall(navigation, candidate, 'navigation');
  assertTestsPassed(navigation, expectedNavigationLabels, 'navigation');
  assertTrueBoundaryKeys(
    navigation,
    ['directDiagnosticOnly', 'authenticatedMainNavigationPassed'],
    'navigation',
  );

  if (legal.status !== 'passed-bounded-authenticated-legal-route-diagnostic') {
    fail('PF16 legal routes did not pass.');
  }
  assertDirectInstall(legal, candidate, 'legal');
  assertTestsPassed(legal, expectedLegalLabels, 'legal');
  assertTrueBoundaryKeys(
    legal,
    ['directDiagnosticOnly', 'authenticatedLegalRoutesPassed'],
    'legal',
  );

  if (largeText.status
        !== 'passed-bounded-authenticated-large-text-main-navigation-diagnostic'
      || largeText.configuration?.targetFontScale !== 2
      || largeText.configuration.fontScaleAtLeast200PercentDuringDiagnostic !== true
      || largeText.configuration.exactPreviousFontScaleRestored !== true) {
    fail('PF16 large-text navigation or setting restoration did not pass.');
  }
  assertDirectInstall(largeText, candidate, 'large-text');
  assertTestsPassed(largeText, expectedNavigationLabels, 'large-text');
  assertTrueBoundaryKeys(
    largeText,
    ['directDiagnosticOnly', 'authenticatedMainNavigationAtLargeTextPassed'],
    'large-text',
  );

  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-pf16-current-candidate-read-only-physical-regression',
    status: 'passed-current-candidate-read-only-physical-regression',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      paymentMode: candidate.paymentMode,
      stripeLivemode: candidate.stripeLivemode,
      privateArchiveVerified: true,
      exactInstalledApkVerified: true,
    },
    device: deviceSummary,
    checks: {
      processRestart: 'passed-data-identity-preserved',
      authenticatedColdStart: 'passed-two-cycles',
      offlineColdStartAndRecovery: 'passed-online-offline-online',
      mainNavigation: {
        status: 'passed',
        destinationCount: expectedNavigationLabels.length,
      },
      legalRoutes: {
        status: 'passed-technical-reachability-only',
        documentCount: expectedLegalLabels.length,
      },
      largeTextMainNavigation: {
        status: 'passed-semantic-reachability-only',
        targetFontScale: 2,
        destinationCount: expectedNavigationLabels.length,
        previousFontScale: largeText.configuration.previousFontScale,
        restoredFontScale: largeText.configuration.restoredFontScale,
        exactPreviousFontScaleRestored: true,
      },
    },
    releaseGate: {
      directInternalCandidate: true,
      googlePlayDistribution: false,
      manualVisualReview: false,
      manualTalkBackTraversal: false,
      completeDeviceMatrix: false,
      storeSubmissionAllowed: false,
      publicActivationAllowed: false,
      realMoneyAllowed: false,
      stageAReady: false,
      decision: 'hold-no-go',
    },
    boundaries: {
      loginPerformed: false,
      logoutPerformed: false,
      accountMutationPerformed: false,
      cartMutationPerformed: false,
      bookingFlowPassed: false,
      messageSent: false,
      supportSubmitted: false,
      withdrawalOpened: false,
      paymentChanged: false,
      productionChanged: false,
      storeChanged: false,
      cloudChanged: false,
      vpsChanged: false,
      dnsChanged: false,
      publicReleasePerformed: false,
      realPushPassed: false,
      talkBackSettingModified: false,
      manualVisualReviewClaimed: false,
      manualTalkBackClaimed: false,
      screenshotCaptured: false,
      rawHierarchyRetained: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
      containsNetworkIdentifiers: false,
    },
  });
}

function parseArguments(values) {
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { adbPath };
}

async function run() {
  const { adbPath } = parseArguments(process.argv.slice(2));
  const { candidate, archive } = await loadPf16CurrentCandidate();
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const evidence = await runPf16CurrentCandidateReadOnlyRegression({
    candidate,
    archive,
    device,
    deviceSummary,
    adbPath,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'PF16 current-candidate read-only regression failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
