#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  loadCurrentHeadAndroidDeviceCandidate,
} from './validate_current_head_android_candidate.mjs';

function fail(message) {
  throw new Error(message);
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function defaultCommandRunner(file, args, { binary = false } = {}) {
  return execFileSync(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(commandRunner, adbPath, device, args, { binary = false } = {}) {
  try {
    const result = commandRunner(adbPath, ['-s', device.serial, ...args], { binary });
    return binary ? Buffer.from(result) : String(result).trim();
  } catch {
    fail('ADB restart diagnostic command failed without exposing the device identifier.');
  }
}

function assertDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true|\bmIsShowing=true\b|\bshowing=true\b/u.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
}

function parsePackageSnapshot(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/mu.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/mu.exec(output)?.[1] ?? null;
  const firstInstallTime = /^\s*firstInstallTime=(.+?)\s*$/mu.exec(output)?.[1] ?? null;
  const ceDataInode = /\bceDataInode=(\d+)\b/u.exec(output)?.[1] ?? null;
  if ([versionName, buildNumber, firstInstallTime, ceDataInode].some((value) => value === null)) {
    fail('Installed ShareItToo package identity or preservation markers are unavailable.');
  }
  return { versionName, buildNumber, firstInstallTime, ceDataInode };
}

function readInstalledSnapshot(commandRunner, adbPath, device, candidate) {
  const packagePaths = adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'path', candidate.applicationId],
  )
    .split(/\r?\n/u)
    .map((line) => line.replace(/^package:/u, '').trim())
    .filter(Boolean);
  if (packagePaths.length !== 1 || !packagePaths[0].startsWith('/data/app/')) {
    fail('Installed ShareItToo package path is missing or ambiguous.');
  }
  const bytes = adb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'cat', packagePaths[0]],
    { binary: true },
  );
  const apkSha256 = sha256Bytes(bytes);
  if (apkSha256 !== candidate.android.apkSha256) {
    fail('Installed ShareItToo APK does not match the current-head candidate.');
  }
  const packageState = parsePackageSnapshot(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'package', candidate.applicationId]),
  );
  if (packageState.versionName !== candidate.versionName
      || packageState.buildNumber !== candidate.buildNumber) {
    fail('Installed ShareItToo version does not match the current-head candidate.');
  }
  return { ...packageState, apkSha256 };
}

function processIsRunning(commandRunner, adbPath, device, applicationId) {
  let output;
  try {
    output = String(commandRunner(
      adbPath,
      ['-s', device.serial, 'shell', 'pidof', applicationId],
      { binary: false },
    )).trim();
  } catch {
    const state = adb(commandRunner, adbPath, device, ['get-state']);
    if (state !== 'device') fail('The Android device disconnected during the restart diagnostic.');
    return false;
  }
  if (!/^\d+(?:\s+\d+)*$/u.test(output)) {
    fail('Android returned an invalid app-process state.');
  }
  return true;
}

function launch(commandRunner, adbPath, device, applicationId) {
  const result = adb(commandRunner, adbPath, device, [
    'shell',
    'monkey',
    '-p',
    applicationId,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);
  if (!/Events injected:\s*1/u.test(result)) {
    fail('Android did not confirm the ShareItToo launcher event.');
  }
}

export function diagnoseCurrentHeadAndroidRestart({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  capturedAt = new Date().toISOString(),
}) {
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const before = readInstalledSnapshot(commandRunner, adbPath, device, candidate);
  let relaunchConfirmed = false;
  try {
    adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', candidate.applicationId]);
    if (processIsRunning(commandRunner, adbPath, device, candidate.applicationId)) {
      fail('ShareItToo process remained active after force-stop.');
    }
    launch(commandRunner, adbPath, device, candidate.applicationId);
    if (!processIsRunning(commandRunner, adbPath, device, candidate.applicationId)) {
      fail('ShareItToo process did not restart after the launcher event.');
    }
    relaunchConfirmed = true;
  } finally {
    if (!relaunchConfirmed) {
      try {
        launch(commandRunner, adbPath, device, candidate.applicationId);
      } catch {
        // Preserve the original fail-closed result. No diagnostic result is
        // emitted when the convenience relaunch cannot be confirmed.
      }
    }
  }
  const after = readInstalledSnapshot(commandRunner, adbPath, device, candidate);
  if (after.firstInstallTime !== before.firstInstallTime
      || after.ceDataInode !== before.ceDataInode) {
    fail('ShareItToo install or credential-encrypted data identity changed across restart.');
  }

  return {
    schemaVersion: 1,
    kind: 'android-current-head-process-restart-diagnostic',
    status: 'passed-bounded-process-restart-diagnostic',
    capturedAt,
    candidate: {
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
      apkSha256: candidate.android.apkSha256,
    },
    device: deviceSummary,
    tests: {
      exactInstalledCandidate: { status: 'passed', result: 'version-and-apk-hash-match' },
      processAbsentAfterForceStop: { status: 'passed', result: 'no-running-process' },
      launcherProcessRestarted: { status: 'passed', result: 'running-after-launcher-event' },
      installIdentityPreserved: { status: 'passed', result: 'first-install-time-unchanged' },
      dataContainerIdentityPreserved: { status: 'passed', result: 'ce-data-inode-unchanged' },
    },
    boundaries: {
      fullPilotScenarioA14Passed: false,
      authenticatedSessionClaimed: false,
      pendingSubmissionTested: false,
      serverReconciliationTested: false,
      storeInstallationGateSatisfied: false,
      screenshotsCaptured: false,
      uiHierarchyCaptured: false,
      accountContentInspected: false,
      userDataReset: false,
      appUninstalled: false,
      networkChanged: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsProcessIdentifiers: false,
      containsPersonalAccountData: false,
      realMoneyUsed: false,
      productionChanged: false,
      storeChanged: false,
    },
  };
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
  const args = parseArguments(process.argv.slice(2));
  const candidate = await loadCurrentHeadAndroidDeviceCandidate();
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = diagnoseCurrentHeadAndroidRestart({
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Current-head Android restart diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
