#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from './prepare_android_device_test.mjs';
import { sendSyntheticBookingDiagnosticMessage } from './run_staging_synthetic_booking.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const applicationId = 'com.shareittoo.app';
const remoteUiDump = '/sdcard/sit-controlled-fcm.xml';
const v52ForegroundPushTitle = 'Neue ShareItToo-Aktualisierung';
const v52ForegroundPushBody = 'In der App ansehen.';

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
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
    fail('ADB controlled-FCM command failed without exposing the device identifier.');
  }
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || buildNumber === null) fail('Installed ShareItToo version could not be verified.');
  return { versionName, buildNumber };
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function verifyInstalledCandidate(commandRunner, adbPath, device, candidate, archive) {
  const packagePaths = adb(commandRunner, adbPath, device, ['shell', 'pm', 'path', applicationId])
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
  if (packagePaths.length === 0 || packagePaths.some((value) => !value.startsWith('/data/app/'))) {
    fail('Installed ShareItToo package path is missing or ambiguous.');
  }
  const installed = parseInstalledPackage(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'package', applicationId]),
  );
  if (installed.versionName !== candidate.versionName || installed.buildNumber !== candidate.buildNumber) {
    fail('Installed ShareItToo version does not match the verified candidate.');
  }

  if (packagePaths.length === 1) {
    const installedSha256 = sha256Bytes(adb(
      commandRunner,
      adbPath,
      device,
      ['exec-out', 'cat', packagePaths[0]],
      { binary: true },
    ));
    if (installedSha256 !== archive.apkSha256 || installedSha256 !== candidate.android.apkSha256) {
      fail('Installed ShareItToo APK does not match the verified candidate.');
    }
    return { ...installed, delivery: 'direct-apk', apkSha256: installedSha256 };
  }

  const basePackages = packagePaths.filter((value) => value.endsWith('/base.apk'));
  const splitPackagesValid = packagePaths.every((value) => (
    value.endsWith('/base.apk') || /\/split_[^/]+\.apk$/u.test(value)
  ));
  if (basePackages.length !== 1 || !splitPackagesValid) {
    fail('Installed ShareItToo Play package split set is missing or ambiguous.');
  }
  const installerOutput = adb(commandRunner, adbPath, device, [
    'shell', 'pm', 'list', 'packages', '-i', applicationId,
  ]);
  if (!/\binstaller=com\.android\.vending\b/u.test(installerOutput)) {
    fail('Installed ShareItToo split package was not delivered by Google Play.');
  }
  return {
    ...installed,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: packagePaths.length,
  };
}

function assertDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true/.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
}

function notificationCount(commandRunner, adbPath, device) {
  const output = adb(commandRunner, adbPath, device, ['shell', 'cmd', 'notification', 'list']);
  return output.split(/\r?\n/).filter((line) => line.includes(`|${applicationId}|`)).length;
}

function processPresent(commandRunner, adbPath, device) {
  try {
    return adb(commandRunner, adbPath, device, ['shell', 'pidof', applicationId]).length > 0;
  } catch {
    return false;
  }
}

function dumpUi(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'uiautomator', 'dump', remoteUiDump]);
  try {
    return adb(commandRunner, adbPath, device, ['exec-out', 'cat', remoteUiDump]);
  } finally {
    try {
      adb(commandRunner, adbPath, device, ['shell', 'rm', '-f', remoteUiDump]);
    } catch {
      // A later run overwrites the fixed temporary hierarchy path.
    }
  }
}

export function foregroundPushContractVisible(uiHierarchy) {
  return typeof uiHierarchy === 'string'
    && uiHierarchy.includes(v52ForegroundPushTitle)
    && uiHierarchy.includes(v52ForegroundPushBody);
}

async function waitFor(predicate, { attempts = 30, intervalMs = 700, wait }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await wait(intervalMs);
  }
  return false;
}

async function sendPair(vaultFile, diagnosticKind, sender) {
  for (const senderRole of ['owner', 'renter']) {
    const result = await sender({ vaultFile, senderRole, diagnosticKind });
    if (result?.status !== 'synthetic-booking-diagnostic-message-sent'
        || result?.paymentEndpointCalled !== false
        || result?.stripeLivemode !== false) {
      fail('The controlled Staging diagnostic message was not accepted safely.');
    }
  }
}

export async function diagnoseAndroidControlledFcm({
  vaultFile,
  privateArtifactDirectory,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  archive,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  sender = sendSyntheticBookingDiagnosticMessage,
}) {
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate, archive);

  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  adb(commandRunner, adbPath, device, [
    'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1',
  ]);
  await wait(3500);
  await sendPair(vaultFile, 'foreground', sender);
  const foregroundVisible = await waitFor(() => {
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    return foregroundPushContractVisible(hierarchy);
  }, { attempts: 30, intervalMs: 500, wait });
  if (!foregroundVisible) fail('The foreground FCM banner did not become visible.');

  adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await wait(1200);
  const backgroundBefore = notificationCount(commandRunner, adbPath, device);
  await sendPair(vaultFile, 'background', sender);
  const backgroundVisible = await waitFor(
    () => notificationCount(commandRunner, adbPath, device) > backgroundBefore,
    { attempts: 35, intervalMs: 700, wait },
  );
  if (!backgroundVisible) fail('The background FCM system notification did not become visible.');
  const backgroundAfter = notificationCount(commandRunner, adbPath, device);

  adb(commandRunner, adbPath, device, ['shell', 'am', 'kill', applicationId]);
  const processStopped = await waitFor(
    () => !processPresent(commandRunner, adbPath, device),
    { attempts: 12, intervalMs: 300, wait },
  );
  if (!processStopped) fail('The ShareItToo process did not stop before the terminated-process probe.');
  const terminatedBefore = notificationCount(commandRunner, adbPath, device);
  await sendPair(vaultFile, 'terminated', sender);
  const terminatedVisible = await waitFor(
    () => notificationCount(commandRunner, adbPath, device) > terminatedBefore,
    { attempts: 35, intervalMs: 700, wait },
  );
  if (!terminatedVisible) fail('The terminated-process FCM system notification did not become visible.');
  const terminatedAfter = notificationCount(commandRunner, adbPath, device);

  adb(commandRunner, adbPath, device, ['shell', 'cmd', 'statusbar', 'expand-notifications']);
  await wait(1400);
  const screenshot = adb(commandRunner, adbPath, device, ['exec-out', 'screencap', '-p'], { binary: true });
  if (screenshot.length < 10_000) fail('The controlled notification screenshot is invalid.');
  mkdirSync(privateArtifactDirectory, { recursive: true, mode: 0o700 });
  chmodSync(privateArtifactDirectory, 0o700);
  const screenshotPath = resolve(privateArtifactDirectory, 'controlled-fcm-notification-shade.png');
  writeFileSync(screenshotPath, screenshot, { mode: 0o600 });
  chmodSync(screenshotPath, 0o600);
  adb(commandRunner, adbPath, device, ['shell', 'cmd', 'statusbar', 'collapse']);

  return {
    evidence: {
      schemaVersion: 1,
      kind: 'android-controlled-fcm-diagnostic',
      status: 'delivery-passed-icon-visual-review-pending',
      capturedAt,
      candidate: {
        applicationId: candidate.applicationId,
        versionName: candidate.versionName,
        buildNumber: candidate.buildNumber,
        commit: candidate.commit,
        apkSha256: candidate.android.apkSha256,
        apiBaseUrl: candidate.apiBaseUrl,
        stripeLivemode: candidate.stripeLivemode,
      },
      installed: {
        applicationId,
        versionName: installed.versionName,
        buildNumber: installed.buildNumber,
        delivery: installed.delivery,
        ...(installed.apkSha256 === undefined ? {} : { apkSha256: installed.apkSha256 }),
        ...(installed.installerPackageName === undefined
          ? {}
          : {
              installerPackageName: installed.installerPackageName,
              splitCount: installed.splitCount,
            }),
      },
      device: deviceSummary,
      tests: {
        foregroundPushDelivery: {
          status: 'passed',
          result: 'foreground-fcm-banner-visible',
        },
        backgroundPushDelivery: {
          status: 'passed',
          result: 'android-system-notification-visible',
          observedNotificationRecordsBefore: backgroundBefore,
          observedNotificationRecordsAfter: backgroundAfter,
        },
        terminatedProcessPushDelivery: {
          status: 'passed',
          result: 'process-absent-before-send-and-android-system-notification-visible-after-send',
          observedNotificationRecordsBefore: terminatedBefore,
          observedNotificationRecordsAfter: terminatedAfter,
        },
        notificationIconVisual: {
          status: 'review-pending',
          result: 'private-notification-shade-capture-created',
          privateDiagnosticScreenshotSha256: createHash('sha256').update(screenshot).digest('hex'),
          privateDiagnosticScreenshotCommitted: false,
          privateDiagnosticScreenshotAssumedSensitive: true,
          privateDiagnosticScreenshotMayContainUnrelatedNotifications: true,
          privateDiagnosticScreenshotDistributionAllowed: false,
        },
      },
      boundaries: {
        directDiagnosticOnly: installed.delivery === 'direct-apk',
        storeInstallationGateSatisfied: installed.delivery === 'google-play-split',
        fullFcmMatrixPassed: false,
        productionPushSent: false,
        paymentEndpointCalled: false,
        stripeLivemode: false,
        syntheticAccountsOnly: true,
        lockCodeUsed: false,
        accountIdentityRecorded: false,
        repositoryEvidenceContainsPersonalAccountData: false,
        containsSecrets: false,
        containsRawDeviceIdentifiers: false,
        containsReviewCredentials: false,
      },
    },
    privateScreenshotPath: screenshotPath,
  };
}

function parseArguments(values) {
  let candidateDirectory = null;
  let vaultFile = null;
  let privateArtifactDirectory = null;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--vault-file') {
      vaultFile = values[index + 1] ?? fail('--vault-file requires a path.');
      index += 1;
    } else if (values[index] === '--private-artifact-dir') {
      privateArtifactDirectory = values[index + 1] ?? fail('--private-artifact-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (vaultFile === null) fail('--vault-file is required.');
  return { candidateDirectory, vaultFile, privateArtifactDirectory, adbPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  let candidate;
  let archive;
  let candidateDirectory;
  if (args.candidateDirectory !== null) {
    candidateDirectory = resolve(args.candidateDirectory);
    archive = await validatePrivateAndroidReleaseArchive({ root, candidateDirectory });
    candidate = Object.freeze({ ...archive, paymentMode: 'memory', stripeLivemode: false });
  } else {
    const deviceManifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
    candidate = deviceManifest.candidate;
    candidateDirectory = resolve(
      homedir(),
      'Library',
      'Application Support',
      'ShareItToo',
      'release',
      'android',
      `${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')}-${nonEmptyString(candidate.commit, 'candidate.commit')}`,
    );
    archive = await validateCandidateArchive({ root, candidateDirectory });
  }
  const privateArtifactDirectory = resolve(args.privateArtifactDirectory ?? resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'device-diagnostics',
    `android-${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')}`,
  ));
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const result = await diagnoseAndroidControlledFcm({
    vaultFile: args.vaultFile,
    privateArtifactDirectory,
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    archive,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (typeof process !== 'undefined'
    && process.argv?.[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
