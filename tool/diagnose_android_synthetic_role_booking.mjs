#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import { runSyntheticRoleBookingLifecycle } from './run_staging_synthetic_booking.mjs';
import {
  validateCurrentHeadAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const applicationId = 'com.shareittoo.app';

function fail(message) {
  throw new Error(message);
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
    fail('ADB role-booking diagnostic command failed without exposing the device identifier.');
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

function assertDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true/.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
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

export async function diagnoseAndroidSyntheticRoleBooking({
  vaultFile,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  archive,
  capturedAt = new Date().toISOString(),
  lifecycleRunner = runSyntheticRoleBookingLifecycle,
}) {
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate, archive);
  const lifecycle = await lifecycleRunner({ vaultFile });
  if (lifecycle?.status !== 'passed-bounded-synthetic-role-booking-lifecycle'
      || lifecycle?.paymentEndpointCalled !== false
      || lifecycle?.stripeLivemode !== false
      || lifecycle?.confirmations?.pickup?.status !== 'passed'
      || lifecycle.confirmations.pickup.presenterRole !== 'owner'
      || lifecycle.confirmations.pickup.verifierRole !== 'renter'
      || lifecycle.confirmations.pickup.verificationVersion !== 3
      || lifecycle?.confirmations?.return?.status !== 'passed'
      || lifecycle.confirmations.return.presenterRole !== 'renter'
      || lifecycle.confirmations.return.verifierRole !== 'owner'
      || lifecycle.confirmations.return.verificationVersion !== 3) {
    fail('The bounded Staging role-booking lifecycle did not pass safely.');
  }
  return {
    schemaVersion: 1,
    kind: 'android-synthetic-role-booking-diagnostic',
    status: 'passed-bounded-synthetic-role-booking-diagnostic',
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
    },
    installed: {
      packageIdentityVerified: true,
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
    backendFixture: {
      accountCount: 2,
      roles: ['owner', 'renter'],
      registration: 'public-staging-accepted',
      verification: 'isolated-staging-fixture',
      listingStatus: 'active',
      workflow: [...lifecycle.workflow],
      confirmations: {
        pickup: {
          status: 'passed',
          presenterRole: 'owner',
          verifierRole: 'renter',
          verificationVersion: 3,
        },
        return: {
          status: 'passed',
          presenterRole: 'renter',
          verifierRole: 'owner',
          verificationVersion: 3,
        },
      },
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
    tests: {
      ownerRequestVisibility: {
        status: lifecycle.tests.ownerRequestVisibility.status,
        result: lifecycle.tests.ownerRequestVisibility.result,
      },
      renterUpcomingVisibility: {
        status: lifecycle.tests.renterUpcomingVisibility.status,
        result: lifecycle.tests.renterUpcomingVisibility.result,
      },
      renterRunningVisibility: {
        status: lifecycle.tests.renterRunningVisibility.status,
        result: lifecycle.tests.renterRunningVisibility.result,
      },
      renterCompletedVisibility: {
        status: lifecycle.tests.renterCompletedVisibility.status,
        result: lifecycle.tests.renterCompletedVisibility.result,
      },
    },
    boundaries: {
      syntheticAccountsOnly: true,
      directDiagnosticOnly: installed.delivery === 'direct-apk',
      storeInstallationGateSatisfied: installed.delivery === 'google-play-split',
      fullDeviceMatrixPassed: false,
      wifiOnlyDiagnostic: true,
      hotspotPassed: false,
      authenticatedDeepLinksPassed: false,
      realPushPassed: false,
      manualTalkBackTraversalPassed: false,
      iosTestFlightPassed: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      lockCodeUsed: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  };
}

function parseArguments(values) {
  let candidateDirectory = null;
  let vaultFile = null;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--vault-file') {
      vaultFile = values[index + 1] ?? fail('--vault-file requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (vaultFile === null) fail('--vault-file is required.');
  return { candidateDirectory, vaultFile, adbPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  if (args.candidateDirectory === null) {
    fail('--candidate-dir is required for an exact current-head role-booking diagnostic.');
  }
  const candidateDirectory = resolve(args.candidateDirectory);
  const archive = await validateCurrentHeadAndroidReleaseArchive({
    root,
    candidateDirectory,
  });
  const candidate = {
    ...archive,
    paymentMode: 'memory',
    stripeLivemode: false,
  };
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = await diagnoseAndroidSyntheticRoleBooking({
    vaultFile: args.vaultFile,
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    archive,
  });
  console.log(JSON.stringify(evidence, null, 2));
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
