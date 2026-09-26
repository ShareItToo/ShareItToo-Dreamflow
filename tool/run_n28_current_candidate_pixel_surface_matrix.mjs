#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  diagnoseAndroidAuthenticatedSession,
} from './diagnose_android_authenticated_session.mjs';
import {
  diagnoseAndroidMainNavigationTouchTargets,
} from './diagnose_android_main_navigation_touch_targets.mjs';
import {
  diagnoseCurrentHeadAndroidLargeTextMainNavigation,
} from './diagnose_current_head_android_large_text_main_navigation.mjs';
import {
  diagnoseCurrentHeadAndroidLegalRoutes,
} from './diagnose_current_head_android_legal_routes.mjs';
import {
  defaultCurrentHeadAndroidCommandRunner,
  diagnoseCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  diagnoseCurrentHeadAndroidRestart,
} from './diagnose_current_head_android_restart.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  canonicalAndroidSigningCertificateSha256,
  currentHeadAndroidApplicationId,
  currentHeadAndroidStagingApiBaseUrl,
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const mobileSourcePattern = /^(?:lib\/|android\/|assets\/|pubspec\.yaml$|pubspec\.lock$)/u;

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} does not match the verified private candidate.`);
}

function digest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    fail(`${label} is not a lowercase SHA-256 digest.`);
  }
  return value;
}

export function validateCurrentPrivateAndroidCandidate(archive) {
  same(archive?.applicationId, currentHeadAndroidApplicationId, 'application ID');
  same(archive?.bundleId, currentHeadAndroidApplicationId, 'bundle ID');
  if (typeof archive?.versionName !== 'string'
      || !/^\d+\.\d+\.\d+$/u.test(archive.versionName)) {
    fail('Version name is not a canonical semantic version.');
  }
  if (typeof archive?.buildNumber !== 'string'
      || !/^\d{10}$/u.test(archive.buildNumber)) {
    fail('Build number is not a ten-digit Android version code.');
  }
  if (typeof archive?.commit !== 'string'
      || !/^[a-f0-9]{40}$/u.test(archive.commit)) {
    fail('Candidate commit is not a full lowercase Git digest.');
  }
  same(archive?.apiBaseUrl, currentHeadAndroidStagingApiBaseUrl, 'API base URL');
  same(archive?.firebaseConfigured, true, 'Firebase configuration');
  same(archive?.releaseChannel, 'internal', 'release channel');
  same(archive?.privacyScan, 'passed', 'binary privacy scan');
  const apkSha256 = digest(archive?.apkSha256, 'APK SHA-256');
  const aabSha256 = digest(archive?.aabSha256, 'AAB SHA-256');
  const certificateSha256 = digest(
    archive?.signingCertificateSha256,
    'signing certificate SHA-256',
  );
  same(archive?.android?.apkSha256, apkSha256, 'Android APK SHA-256');
  same(archive?.android?.aabSha256, aabSha256, 'Android AAB SHA-256');
  same(
    archive?.android?.signingCertificateSha256,
    certificateSha256,
    'Android signing certificate SHA-256',
  );
  same(
    certificateSha256,
    canonicalAndroidSigningCertificateSha256,
    'canonical signing certificate SHA-256',
  );
  return Object.freeze({
    applicationId: archive.applicationId,
    bundleId: archive.bundleId,
    versionName: archive.versionName,
    buildNumber: archive.buildNumber,
    commit: archive.commit,
    releaseChannel: archive.releaseChannel,
    apiBaseUrl: archive.apiBaseUrl,
    firebaseConfigured: archive.firebaseConfigured,
    paymentMode: 'memory',
    stripeLivemode: false,
    android: Object.freeze({
      apkSha256,
      aabSha256,
      signingCertificateSha256: certificateSha256,
    }),
  });
}

// Retained as a compatibility export for the immutable historical N28 evidence
// validator. Runtime acceptance is no longer bound to the old N28 build.
export const validateN28FrozenCandidate = validateCurrentPrivateAndroidCandidate;

export function assertCurrentCandidateNoPostCandidateMobileSourceDrift(paths) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
    fail('Post-candidate paths must be a string array.');
  }
  const changed = paths.filter((path) => mobileSourcePattern.test(path));
  if (changed.length > 0) {
    fail('Android application source changed after the verified private candidate.');
  }
  return Object.freeze({ changedPathCount: paths.length, mobileSourceChanged: false });
}

export const assertN28NoPostCandidateMobileSourceDrift =
  assertCurrentCandidateNoPostCandidateMobileSourceDrift;

function gitPaths(gitRunner, root, args) {
  return String(gitRunner('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }))
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function collectCurrentCandidateDriftPaths({
  root,
  candidateCommit,
  gitRunner = execFileSync,
}) {
  if (typeof candidateCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(candidateCommit)) {
    fail('Candidate commit is invalid for source-drift collection.');
  }
  gitRunner('git', ['merge-base', '--is-ancestor', candidateCommit, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return [...new Set([
    ...gitPaths(gitRunner, root, ['diff', '--name-only', `${candidateCommit}..HEAD`]),
    ...gitPaths(gitRunner, root, ['diff', '--name-only']),
    ...gitPaths(gitRunner, root, ['diff', '--cached', '--name-only']),
    ...gitPaths(gitRunner, root, ['ls-files', '--others', '--exclude-standard']),
  ])].toSorted();
}

function assertLane(evidence, kind, status, label, candidate) {
  same(evidence?.kind, kind, `${label} kind`);
  same(evidence?.status, status, `${label} status`);
  same(evidence?.candidate?.applicationId, candidate.applicationId, `${label} application ID`);
  same(evidence?.candidate?.buildNumber, candidate.buildNumber, `${label} build number`);
  same(evidence?.candidate?.commit, candidate.commit, `${label} candidate commit`);
  same(evidence?.installed?.buildNumber, candidate.buildNumber, `${label} installed build number`);
  same(evidence?.installed?.delivery, 'direct-apk', `${label} delivery`);
  same(
    evidence?.installed?.apkSha256,
    candidate.android.apkSha256,
    `${label} installed APK SHA-256`,
  );
}

export function summarizeCurrentCandidateSurfaceMatrix({
  candidate,
  deviceSummary,
  sourceDrift,
  session,
  navigation,
  legal,
  largeText,
  touchTargets,
  restart,
  capturedAt,
}) {
  assertLane(
    session,
    'android-authenticated-session-diagnostic',
    'passed-bounded-authenticated-session-diagnostic',
    'session',
    candidate,
  );
  assertLane(
    navigation,
    'android-current-head-authenticated-main-navigation-diagnostic',
    'passed-bounded-authenticated-main-navigation-diagnostic',
    'navigation',
    candidate,
  );
  assertLane(
    legal,
    'android-current-head-authenticated-legal-route-diagnostic',
    'passed-bounded-authenticated-legal-route-diagnostic',
    'legal',
    candidate,
  );
  assertLane(
    largeText,
    'android-current-head-authenticated-large-text-main-navigation-diagnostic',
    'passed-bounded-authenticated-large-text-main-navigation-diagnostic',
    'large text',
    candidate,
  );
  assertLane(
    touchTargets,
    'android-current-head-main-navigation-touch-target-diagnostic',
    'passed-physical-200-percent-touch-target-geometry',
    'touch targets',
    candidate,
  );
  same(
    restart?.kind,
    'android-current-head-process-restart-diagnostic',
    'restart kind',
  );
  same(
    restart?.status,
    'passed-bounded-process-restart-diagnostic',
    'restart status',
  );
  same(restart?.candidate?.applicationId, candidate.applicationId, 'restart application ID');
  same(restart?.candidate?.buildNumber, candidate.buildNumber, 'restart build number');
  same(restart?.candidate?.commit, candidate.commit, 'restart candidate commit');
  same(session?.tests?.authenticatedProfileAccess?.status, 'passed', 'authenticated profile access');
  same(session?.tests?.coldStartSessionRestore?.status, 'passed', 'cold-start session restore');
  same(navigation?.boundaries?.authenticatedMainNavigationPassed, true, 'main navigation');
  same(legal?.boundaries?.authenticatedLegalRoutesPassed, true, 'legal routes');
  same(legal?.boundaries?.professionalLegalApprovalPassed, false, 'professional legal approval');
  same(
    largeText?.boundaries?.authenticatedMainNavigationAtLargeTextPassed,
    true,
    'large-text navigation',
  );
  same(largeText?.configuration?.exactPreviousFontScaleRestored, true, 'font-scale restoration');
  same(
    touchTargets?.configuration?.exactPreviousFontScaleRestored,
    true,
    'touch-target font-scale restoration',
  );
  same(touchTargets?.touchTargets?.allTargetsAtLeast48Dp, true, 'minimum touch targets');
  same(touchTargets?.touchTargets?.allTargetsWithinDisplay, true, 'touch targets within display');
  same(
    touchTargets?.touchTargets?.allTargetsPairwiseNonOverlapping,
    true,
    'non-overlapping touch targets',
  );
  const restartChecks = Object.values(restart?.tests ?? {});
  if (restartChecks.length !== 5
      || restartChecks.some((check) => check?.status !== 'passed')) {
    fail('N28 must verify the complete bounded process-restart set.');
  }
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  if (Object.keys(navigation?.tests ?? {}).length !== 5) fail('N28 must verify all five main destinations.');
  if (Object.keys(largeText?.tests ?? {}).length !== 5) fail('N28 must verify all five large-text destinations.');
  if (Object.keys(legal?.tests ?? {}).length < 6) fail('N28 must verify the complete read-only legal set.');

  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-surface-matrix-diagnostic',
    status: 'passed-session-navigation-legal-accessibility-restart-core',
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
      apkSha256: candidate.android.apkSha256,
      signingCertificateSha256: candidate.android.signingCertificateSha256,
      postCandidateChangedPathCount: sourceDrift.changedPathCount,
      mobileSourceChangedAfterCandidate: sourceDrift.mobileSourceChanged,
    },
    device: deviceSummary,
    tests: {
      authenticatedColdStartSession: 'passed',
      mainNavigationDestinationCount: 5,
      legalDocumentCount: Object.keys(legal.tests).length,
      largeTextDestinationCount: 5,
      exactPreviousFontScaleRestored: true,
      minimumMainNavigationTouchTargetDp: 48,
      processRestartCheckCount: restartChecks.length,
    },
    boundaries: {
      readOnlySurfaceMatrix: true,
      directApkOnly: true,
      storeMatrixClaimed: false,
      supportSubmitted: false,
      messageSent: false,
      bookingCreated: false,
      listingMutated: false,
      accountMutated: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      productionChanged: false,
      onePlusContacted: false,
      professionalLegalApprovalClaimed: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
    },
  };
  const serialized = JSON.stringify(result);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(serialized)) {
    fail('N28 surface evidence contains private or credential-shaped material.');
  }
  return result;
}

export const summarizeN28SurfaceMatrix = summarizeCurrentCandidateSurfaceMatrix;

export async function runCurrentCandidatePixelSurfaceMatrix({
  root,
  candidateDirectory,
  adbPath = 'adb',
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  archiveValidator = validatePrivateAndroidReleaseArchive,
  deviceInspector = inspectPhysicalDevice,
  sessionDiagnostic = diagnoseAndroidAuthenticatedSession,
  navigationDiagnostic = diagnoseCurrentHeadAndroidMainNavigation,
  legalDiagnostic = diagnoseCurrentHeadAndroidLegalRoutes,
  largeTextDiagnostic = diagnoseCurrentHeadAndroidLargeTextMainNavigation,
  touchTargetDiagnostic = diagnoseAndroidMainNavigationTouchTargets,
  restartDiagnostic = diagnoseCurrentHeadAndroidRestart,
  gitRunner = execFileSync,
  capturedAt = new Date().toISOString(),
}) {
  const archive = await archiveValidator({ root, candidateDirectory });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const paths = collectCurrentCandidateDriftPaths({
    root,
    candidateCommit: candidate.commit,
    gitRunner,
  });
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(paths);
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = deviceInspector({ adbPath, device });
  const common = { commandRunner, adbPath, device, deviceSummary, candidate, capturedAt };
  const session = await sessionDiagnostic({ ...common, archive: { apkSha256: candidate.android.apkSha256 } });
  const navigation = await navigationDiagnostic(common);
  const legal = await legalDiagnostic(common);
  const largeText = await largeTextDiagnostic(common);
  const touchTargets = await touchTargetDiagnostic(common);
  const restart = restartDiagnostic(common);
  return summarizeCurrentCandidateSurfaceMatrix({
    candidate,
    deviceSummary,
    sourceDrift,
    session,
    navigation,
    legal,
    largeText,
    touchTargets,
    restart,
    capturedAt,
  });
}

export const runN28CurrentCandidatePixelSurfaceMatrix =
  runCurrentCandidatePixelSurfaceMatrix;

function parseArguments(values) {
  let candidateDirectory = null;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  return { candidateDirectory: resolve(candidateDirectory), adbPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const result = await runCurrentCandidatePixelSurfaceMatrix({ root, ...args });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N28 Pixel surface matrix failed.'}\n`);
    process.exitCode = 1;
  }
}
