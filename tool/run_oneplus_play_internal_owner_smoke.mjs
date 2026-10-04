#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  preflightOnePlusPlayInternalCandidate,
} from './preflight_oneplus_play_internal_candidate.mjs';
import {
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(
  root,
  'store/google-play/rw20-current-internal-candidate-manifest.json',
);
const releaseGo = 'GOOGLE_PLAY_INTERNAL_RELEASE_GO';
const ownerWindowGo = 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO';

function fail(message) {
  throw new Error(message);
}

function defaultCommandRunner(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(commandRunner, adbPath, device, args, { optional = false } = {}) {
  try {
    return String(commandRunner(adbPath, ['-s', device.serial, ...args])).trim();
  } catch {
    if (optional) return '';
    fail('Sanitized OnePlus owner-window smoke command failed.');
  }
}

function parsePackageContinuity(output) {
  const value = String(output);
  const firstInstallTime = /^\s*firstInstallTime=(.+?)\s*$/mu.exec(value)?.[1] ?? null;
  const ceDataInode = /\bceDataInode=(\d+)\b/u.exec(value)?.[1] ?? null;
  if (firstInstallTime === null || ceDataInode === null) {
    fail('OnePlus package continuity markers are unavailable.');
  }
  return Object.freeze({ firstInstallTime, ceDataInode });
}

function processId(commandRunner, adbPath, device, applicationId) {
  const value = adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pidof', applicationId],
    { optional: true },
  );
  if (value === '') return null;
  if (!/^\d+(?:\s+\d+)*$/u.test(value)) {
    fail('OnePlus returned an invalid app-process state.');
  }
  return value.split(/\s+/u)[0];
}

function isForeground(commandRunner, adbPath, device, applicationId) {
  const value = adb(commandRunner, adbPath, device, [
    'shell', 'dumpsys', 'activity', 'activities',
  ]);
  const escaped = applicationId.replaceAll('.', '\\.');
  return new RegExp(
    `(?:mResumedActivity|topResumedActivity)[^\\n]*${escaped}\\/`,
    'u',
  ).test(value);
}

function assertAlreadyUnlocked(commandRunner, adbPath, device) {
  const value = adb(commandRunner, adbPath, device, [
    'shell', 'dumpsys', 'window', 'policy',
  ]);
  if (/keyguardShowing=true|isStatusBarKeyguard=true|\bmIsShowing=true\b|\bshowing=true\b/u
    .test(value)) {
    fail('The OnePlus is locked. Unlock it manually; this runner never enters a passcode.');
  }
}

function launch(commandRunner, adbPath, device, applicationId) {
  const value = adb(commandRunner, adbPath, device, [
    'shell', 'am', 'start', '-W', '-n', `${applicationId}/.MainActivity`,
  ]);
  if (!/^Status:\s*ok\s*$/mu.test(value)
      || !new RegExp(`^Activity:\\s*${applicationId.replaceAll('.', '\\.')}\/`, 'mu')
        .test(value)) {
    fail('The OnePlus did not confirm the bounded ShareItToo activity start.');
  }
}

export function parseOnePlusOwnerSmokeArguments(values) {
  let adbPath = 'adb';
  let releaseConfirmed = false;
  let ownerWindowConfirmed = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (value === '--confirm-release-go') {
      if (values[index + 1] !== releaseGo) {
        fail('The exact Google Play Internal release gate was not supplied.');
      }
      releaseConfirmed = true;
      index += 1;
    } else if (value === '--confirm-owner-window') {
      if (values[index + 1] !== ownerWindowGo) {
        fail('The exact personal-device owner-window gate was not supplied.');
      }
      ownerWindowConfirmed = true;
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  if (!releaseConfirmed || !ownerWindowConfirmed) {
    fail('OnePlus owner smoke remains closed until both exact gates are supplied.');
  }
  return {
    adbPath,
    releaseGoConfirmed: true,
    ownerWindowConfirmed: true,
  };
}

export function runOnePlusPlayInternalOwnerSmoke({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  expectedCandidate,
  releaseGoConfirmed = false,
  ownerWindowConfirmed = false,
  capturedAt = new Date().toISOString(),
  allowedTransports = ['wireless-adb'],
} = {}) {
  if (releaseGoConfirmed !== true || ownerWindowConfirmed !== true) {
    fail('OnePlus owner smoke is not authorized before both exact gates.');
  }

  const preflight = preflightOnePlusPlayInternalCandidate({
    commandRunner,
    adbPath,
    device,
    expectedCandidate,
    releaseGoConfirmed,
    capturedAt,
    allowedTransports,
  });
  assertAlreadyUnlocked(commandRunner, adbPath, device);

  const applicationId = expectedCandidate.applicationId;
  const before = parsePackageContinuity(adb(commandRunner, adbPath, device, [
    'shell', 'dumpsys', 'package', applicationId,
  ]));
  const initialProcessWasRunning = processId(
    commandRunner,
    adbPath,
    device,
    applicationId,
  ) !== null;
  let mutationStarted = false;

  try {
    mutationStarted = true;
    adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
    if (processId(commandRunner, adbPath, device, applicationId) !== null) {
      fail('ShareItToo remained running after the bounded force-stop.');
    }

    launch(commandRunner, adbPath, device, applicationId);
    const coldProcess = processId(commandRunner, adbPath, device, applicationId);
    if (coldProcess === null || !isForeground(commandRunner, adbPath, device, applicationId)) {
      fail('ShareItToo did not reach the foreground after the bounded cold start.');
    }

    launch(commandRunner, adbPath, device, applicationId);
    if (processId(commandRunner, adbPath, device, applicationId) !== coldProcess
        || !isForeground(commandRunner, adbPath, device, applicationId)) {
      fail('ShareItToo warm start did not preserve process and foreground state.');
    }

    adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '3']);
    if (processId(commandRunner, adbPath, device, applicationId) !== coldProcess
        || isForeground(commandRunner, adbPath, device, applicationId)) {
      fail('ShareItToo background transition was not observed safely.');
    }

    launch(commandRunner, adbPath, device, applicationId);
    if (processId(commandRunner, adbPath, device, applicationId) !== coldProcess
        || !isForeground(commandRunner, adbPath, device, applicationId)) {
      fail('ShareItToo did not resume safely from the background.');
    }
  } catch (error) {
    if (mutationStarted) {
      try {
        launch(commandRunner, adbPath, device, applicationId);
      } catch {
        // Keep the primary fail-closed result. This best-effort convenience
        // launch can never convert a partial run into passing evidence.
      }
    }
    throw error;
  }

  const after = parsePackageContinuity(adb(commandRunner, adbPath, device, [
    'shell', 'dumpsys', 'package', applicationId,
  ]));
  if (after.firstInstallTime !== before.firstInstallTime
      || after.ceDataInode !== before.ceDataInode) {
    fail('OnePlus install or app-data identity changed during the smoke run.');
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'rw20c-oneplus-play-internal-owner-window-smoke',
    status: 'passed-bounded-nondestructive-process-lifecycle-smoke',
    capturedAt,
    authorization: Object.freeze({
      releaseGoConfirmed: true,
      ownerWindowConfirmed: true,
      confirmationValuesRecorded: false,
    }),
    candidate: Object.freeze({
      applicationId,
      versionName: preflight.installedApplication.versionName,
      versionCode: preflight.installedApplication.versionCode,
      minSdk: preflight.installedApplication.minSdk,
      targetSdk: preflight.installedApplication.targetSdk,
      installerPackageName: preflight.installedApplication.installerPackageName,
      artifactSourceHead: preflight.installedApplication.artifactSourceHead,
      expectedAabSha256: preflight.installedApplication.expectedAabSha256,
      exactAabBinaryEquivalenceClaimed: false,
      playAppSigningCertificateVerified: false,
    }),
    device: preflight.device,
    transport: preflight.transport,
    observations: Object.freeze({
      exactVersionAndPlayDelivery: 'passed',
      phoneAlreadyUnlocked: 'passed',
      processAbsentAfterBoundedStop: 'passed',
      coldStartToForeground: 'passed',
      warmStartSameProcess: 'passed',
      backgroundSameProcess: 'passed',
      foregroundResumeSameProcess: 'passed',
      installIdentityPreserved: 'passed',
      appDataIdentityPreserved: 'passed',
      initialProcessWasRunning,
    }),
    limitations: Object.freeze({
      functionalScreenBehaviorClaimed: false,
      authenticatedSessionClaimed: false,
      accountIsolationClaimed: false,
      networkTransitionClaimed: false,
      accessibilityClaimed: false,
      repeatedStabilityClaimed: false,
      cleanInstallClaimed: false,
    }),
    boundaries: Object.freeze({
      appLaunched: true,
      processStopped: true,
      homeKeyPressed: true,
      appInstalledOrUpdated: false,
      appUninstalled: false,
      appDataReset: false,
      networkChanged: false,
      permissionChanged: false,
      globalSettingChanged: false,
      accountContentInspected: false,
      uiHierarchyCaptured: false,
      screenshotCaptured: false,
      logcatCaptured: false,
      processIdentifierRecorded: false,
      storeChanged: false,
      testerListChanged: false,
      productionChanged: false,
      paymentChanged: false,
      providerChanged: false,
      containsSecrets: false,
      containsTesterIdentity: false,
      containsRawDeviceIdentifier: false,
      containsNetworkAddress: false,
    }),
  });
}

function run() {
  const args = parseOnePlusOwnerSmokeArguments(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const evidence = runOnePlusPlayInternalOwnerSmoke({
    adbPath: args.adbPath,
    device,
    expectedCandidate: {
      applicationId: manifest.candidate.applicationId,
      versionName: manifest.candidate.versionName,
      versionCode: manifest.candidate.versionCode,
      minSdk: manifest.candidate.minSdkVersion,
      targetSdk: manifest.candidate.targetSdkVersion,
      artifactSourceHead: manifest.provenance.artifactSourceHead,
      aabSha256: manifest.artifact.aabSha256,
    },
    releaseGoConfirmed: args.releaseGoConfirmed,
    ownerWindowConfirmed: args.ownerWindowConfirmed,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'OnePlus owner smoke failed.'}\n`);
    process.exitCode = 1;
  }
}
