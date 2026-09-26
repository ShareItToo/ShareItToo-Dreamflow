#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  currentHeadAndroidAdb,
  defaultCurrentHeadAndroidCommandRunner,
  verifyCurrentHeadAndroidInstalledCandidate,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectAndroidApkCertificate,
  installCurrentHeadAndroidCandidateUpdate,
  parseAndroidInstalledPackageSnapshot,
  preflightCurrentHeadAndroidCandidateUpdate,
} from './install_current_head_android_candidate_update.mjs';
import {
  validateAndroidLocalQaCandidate,
} from './validate_android_local_qa_candidate.mjs';
import {
  validateCurrentHeadAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';
import {
  validatePf14bCurrentHeadAndroidTouchTarget,
} from './validate_pf14b_current_head_android_touch_target.mjs';

const localQaCommit = '13359f209857690d53feeaff1bab3eca40bdbb48';
const rollbackCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const applicationId = 'com.shareittoo.app';

function fail(message) {
  throw new Error(message);
}

function resolveApksigner(root) {
  const localProperties = resolve(root, 'android', 'local.properties');
  const configured = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? (existsSync(localProperties)
      ? /^sdk\.dir=(.+)$/mu.exec(readFileSync(localProperties, 'utf8'))?.[1]
      : undefined)
    ?? resolve(homedir(), 'Library', 'Android', 'sdk');
  const buildTools = resolve(configured, 'build-tools');
  if (!existsSync(buildTools)) fail('Android build-tools directory is unavailable.');
  const versions = readdirSync(buildTools).sort((left, right) => (
    left.localeCompare(right, undefined, { numeric: true })
  ));
  const path = resolve(buildTools, versions.at(-1) ?? '', 'apksigner');
  if (!existsSync(path)) fail('Android apksigner is unavailable.');
  return path;
}

function allTrue(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === true);
}

export function buildAndroidLocalQaUpdateGateEvidence({
  preflight,
  candidate,
  rollback,
  priorUpdate,
  deviceSummary,
  capturedAt = new Date().toISOString(),
}) {
  if (preflight?.status !== 'eligible-no-device-write-performed'
      || preflight.applicationId !== applicationId
      || candidate?.applicationId !== applicationId
      || candidate.buildNumber !== '2026082303'
      || candidate.commit !== localQaCommit
      || candidate.apiBaseUrl !== 'http://127.0.0.1:18080/api/v1'
      || candidate.configuration?.requiredLocalBackendProvider !== 'mock'
      || candidate.configuration?.externalProviderAllowed !== false
      || candidate.configuration?.realMoneyAllowed !== false
      || candidate.configuration?.productionAllowed !== false
      || candidate.configuration?.publicRegistrationAllowed !== false
      || candidate.configuration?.publicReleaseAllowed !== false) {
    fail('R2 local QA candidate or read-only update preflight is invalid.');
  }
  if (rollback?.applicationId !== applicationId
      || rollback.buildNumber !== '2026082302'
      || rollback.commit !== rollbackCommit
      || rollback.signingCertificateSha256 !== candidate.signingCertificateSha256
      || priorUpdate?.buildNumber !== '2026082302'
      || priorUpdate.dataPreservingDirectUpdate !== true
      || priorUpdate.stageAReady !== false) {
    fail('R2 rollback archive or previous data-preserving update proof is invalid.');
  }
  if (deviceSummary?.physical !== true
      || deviceSummary.containsRawDeviceIdentifier !== false) {
    fail('R2 requires one sanitized physical-device summary.');
  }
  const conditions = Object.freeze({
    exactPackageIdentity: preflight.conditions.exactPackageIdentity === true,
    signatureCompatibleWithInstalledApp: preflight.conditions
      .candidateSignatureMatchesArchiveAndInstalledApp === true,
    nonDestructiveReplaceInstallEligible: preflight.conditions.strictlyNewerBuild === true
      && preflight.conditions.replaceInstallOnly === true,
    uninstallOrResetNotRequired: preflight.conditions.uninstallOrResetRequired === false,
    ownerPinOrSystemConfirmationNotExpected: preflight.conditions.deviceAlreadyUnlocked === true
      && priorUpdate.dataPreservingDirectUpdate === true,
    dataPreservationHasFailClosedPostChecks: preflight.conditions
      .postInstallDataIdentityVerificationRequired === true,
    rollbackArchiveAndProcedureVerified: rollback.privacyScan === 'passed'
      && rollback.releaseChannel === 'internal',
  });
  if (!allTrue(conditions)) fail('R2 seven-condition update gate is not fully green.');
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-r2-android-local-qa-update-gate',
    status: 'eligible-seven-conditions-green-no-device-write-yet',
    capturedAt,
    source: Object.freeze({
      branch: 'codex/master-workflow-20260808',
      candidateCommit: localQaCommit,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      applicationId,
    }),
    device: Object.freeze({ ...deviceSummary }),
    route: Object.freeze({
      delivery: 'direct-adb-replace',
      localBackend: 'adb-reverse-tcp-18080',
      provider: 'mock',
      rollbackBuildNumber: rollback.buildNumber,
      rollbackProcedure: 'owner-only-canonical-archive-replace-downgrade-if-needed',
    }),
    conditions,
    boundaries: Object.freeze({
      storeInstallationGateSatisfied: false,
      aabCreatedForLocalQa: false,
      providerCallPerformed: false,
      apiBillingCreated: false,
      productionChanged: false,
      cloudChanged: false,
      paymentChanged: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
      containsSigningDigests: false,
    }),
  });
}

export function sanitizeAndroidLocalQaInstallEvidence({ gate, install }) {
  if (gate?.status !== 'eligible-seven-conditions-green-no-device-write-yet'
      || install?.status !== 'passed-data-preserving-direct-update'
      || install.candidate?.applicationId !== applicationId
      || install.candidate?.buildNumber !== '2026082303'
      || install.update?.firstInstallTimePreserved !== true
      || install.update?.ceDataInodePreserved !== true
      || install.update?.candidateSignatureMatchedInstalledApp !== true
      || install.update?.installedCandidateHashMatches !== true
      || install.update?.foregroundActivityVerified !== true
      || install.boundaries?.uninstallUsed !== false
      || install.boundaries?.dataResetUsed !== false
      || install.boundaries?.downgradeUsed !== false) {
    fail('R2 install did not satisfy the fail-closed data-preservation contract.');
  }
  return Object.freeze({
    ...gate,
    status: 'passed-data-preserving-local-qa-update',
    update: Object.freeze({
      installedVersionBefore: install.update.installedVersionBefore,
      installedVersionAfter: install.update.installedVersionAfter,
      method: install.update.method,
      strictlyNewerBuildInstalled: install.update.strictlyNewerBuildInstalled,
      candidateSignatureMatchedInstalledApp: true,
      installedCandidateHashMatches: true,
      firstInstallTimePreserved: true,
      ceDataInodePreserved: true,
      foregroundActivityVerified: true,
      uninstallUsed: false,
      dataResetUsed: false,
      downgradeUsed: false,
    }),
  });
}

async function loadArtifacts(root) {
  const candidate = await validateAndroidLocalQaCandidate({
    root,
    expectedCommit: localQaCommit,
    includePrivateArtifact: true,
  });
  const rollback = await validateCurrentHeadAndroidReleaseArchive({
    root,
    expectedIdentity: {
      versionName: '1.0.0',
      buildNumber: '2026082302',
      commit: rollbackCommit,
    },
  });
  const priorUpdate = validatePf14bCurrentHeadAndroidTouchTarget({ root });
  return { candidate, rollback, priorUpdate };
}

function parseArguments(values) {
  let install = false;
  let verifyInstalled = false;
  let adbPath = 'adb';
  let apksignerPath;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--install') {
      install = true;
    } else if (values[index] === '--verify-installed') {
      verifyInstalled = true;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--apksigner') {
      apksignerPath = values[index + 1] ?? fail('--apksigner requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (install && verifyInstalled) fail('--install and --verify-installed are mutually exclusive.');
  return { install, verifyInstalled, adbPath, apksignerPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const { candidate, rollback, priorUpdate } = await loadArtifacts(root);
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({
    commandRunner: defaultCurrentHeadAndroidCommandRunner,
    adbPath: args.adbPath,
    device,
  });
  const apksignerPath = resolve(args.apksignerPath ?? resolveApksigner(root));
  const certificateInspector = (apkPath) => inspectAndroidApkCertificate({
    apkPath,
    apksignerPath,
  });
  if (args.verifyInstalled) {
    const exact = verifyCurrentHeadAndroidInstalledCandidate(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      {
        ...candidate,
        android: Object.freeze({ apkSha256: candidate.apkSha256 }),
      },
    );
    const userId = currentHeadAndroidAdb(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      ['shell', 'am', 'get-current-user'],
    ).trim();
    const packageDump = currentHeadAndroidAdb(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      ['shell', 'dumpsys', 'package', applicationId],
    );
    const packageState = parseAndroidInstalledPackageSnapshot(packageDump, userId);
    const firstInstallPredatesR2 = packageState.firstInstallTime < '2026-08-24 00:00:00';
    if (exact.buildNumber !== candidate.buildNumber
        || exact.versionName !== candidate.versionName
        || packageState.ceDataInode === '0'
        || !firstInstallPredatesR2) {
      fail('Installed R2 candidate or preserved Android app-data identity is invalid.');
    }
    const launch = currentHeadAndroidAdb(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      ['shell', 'am', 'start', '-W', '-n', `${applicationId}/.MainActivity`],
    );
    if (!/^Status:\s*ok\s*$/mu.test(launch)
        || !/^Activity:\s*com\.shareittoo\.app\//mu.test(launch)) {
      fail('Installed R2 candidate did not complete a deterministic activity start.');
    }
    const activities = currentHeadAndroidAdb(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      ['shell', 'dumpsys', 'activity', 'activities'],
    );
    if (!/(?:mResumedActivity|topResumedActivity).*com\.shareittoo\.app\//u.test(activities)) {
      fail('Installed R2 candidate did not become the foreground activity.');
    }
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      kind: 'sit-r2-installed-local-qa-independent-verification',
      status: 'passed-installed-archive-and-data-identity-verification',
      capturedAt: new Date().toISOString(),
      source: {
        branch: 'codex/master-workflow-20260808',
        candidateCommit: localQaCommit,
        versionName: candidate.versionName,
        buildNumber: candidate.buildNumber,
        applicationId,
      },
      device: deviceSummary,
      checks: {
        exactArchiveBytesInstalled: true,
        canonicalSigningRelationshipInheritedFromVerifiedArchive: true,
        firstInstallTimePredatesR2Update: true,
        nonzeroAppDataInodePresent: true,
        foregroundActivityVerified: true,
      },
      boundaries: {
        secondInstallPerformed: false,
        uninstallUsed: false,
        dataResetUsed: false,
        storeInstallationGateSatisfied: false,
        containsRawDeviceIdentifiers: false,
        containsPrivateFilesystemPaths: false,
        containsSigningDigests: false,
      },
    }, null, 2)}\n`);
    return;
  }
  const preflight = preflightCurrentHeadAndroidCandidateUpdate({
    adbPath: args.adbPath,
    device,
    candidate,
    certificateInspector,
  });
  const gate = buildAndroidLocalQaUpdateGateEvidence({
    preflight,
    candidate,
    rollback,
    priorUpdate,
    deviceSummary,
  });
  if (!args.install) {
    process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
    return;
  }
  const installed = installCurrentHeadAndroidCandidateUpdate({
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    certificateInspector,
  });
  process.stdout.write(`${JSON.stringify(sanitizeAndroidLocalQaInstallEvidence({
    gate,
    install: installed,
  }), null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'R2 Android local QA update preparation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
