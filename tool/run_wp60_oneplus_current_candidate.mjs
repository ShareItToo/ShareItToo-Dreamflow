#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  classifyAdbTransport,
  parseInstalledOnePlusPackage,
  parsePlayInstaller,
} from './inspect_oneplus_play_internal_baseline.mjs';
import {
  preflightOnePlusPlayInternalCandidate,
} from './preflight_oneplus_play_internal_candidate.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  runOnePlusPlayInternalOwnerSmoke,
} from './run_oneplus_play_internal_owner_smoke.mjs';
import {
  validateWp60OnePlusCurrentCandidate,
} from './validate_wp60_oneplus_current_candidate.mjs';

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
    fail('Sanitized WP60 OnePlus inspection command failed.');
  }
}

function verifiedPackagePaths(output) {
  const paths = String(output)
    .split(/\r?\n/u)
    .map((line) => line.replace(/^package:/u, '').trim())
    .filter(Boolean);
  if (paths.length === 0
      || paths.some((path) => !path.startsWith('/data/app/'))
      || paths.filter((path) => path.endsWith('/base.apk')).length !== 1) {
    fail('Installed ShareItToo Play split paths are missing or ambiguous.');
  }
  return paths;
}

function continuityMarkersAvailable(output) {
  const value = String(output);
  if (!/^\s*firstInstallTime=.+?\s*$/mu.test(value)
      || !/\bceDataInode=\d+\b/u.test(value)) {
    fail('OnePlus package continuity markers are unavailable.');
  }
  return true;
}

export function parseWp60OnePlusArguments(values) {
  let adbPath = process.env.SIT_ADB_PATH ?? 'adb';
  let mode = null;
  let releaseConfirmed = false;
  let ownerWindowConfirmed = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (value === '--mode') {
      mode = values[index + 1] ?? fail('--mode requires inspect, verify or lifecycle.');
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
  if (!['inspect', 'verify', 'lifecycle'].includes(mode)) {
    fail('WP60 mode must be inspect, verify or lifecycle.');
  }
  if (!releaseConfirmed || !ownerWindowConfirmed) {
    fail('WP60 OnePlus work remains closed until both exact gates are supplied.');
  }
  return Object.freeze({
    adbPath,
    mode,
    releaseGoConfirmed: true,
    ownerWindowConfirmed: true,
  });
}

export function inspectWp60OnePlusInstall({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  expectedCandidate,
  previousVersionCode,
  allowedTransports = ['usb', 'wireless-adb'],
  capturedAt = new Date().toISOString(),
} = {}) {
  const transport = classifyAdbTransport(device);
  if (!Array.isArray(allowedTransports)
      || !allowedTransports.includes(transport)
      || allowedTransports.some((value) => !['usb', 'wireless-adb'].includes(value))) {
    fail('The OnePlus is not connected through an explicitly allowed ADB transport.');
  }
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  if (!/oneplus/iu.test(deviceSummary.manufacturer)) {
    fail('The connected physical Android phone is not identified as OnePlus.');
  }

  const packageOutput = adb(commandRunner, adbPath, device, [
    'shell', 'dumpsys', 'package', expectedCandidate.applicationId,
  ]);
  const installed = parseInstalledOnePlusPackage(packageOutput);
  if (installed.versionName !== expectedCandidate.versionName
      || ![previousVersionCode, expectedCandidate.versionCode].includes(installed.versionCode)) {
    fail('The OnePlus contains neither the exact previous nor current Play Internal build.');
  }
  const current = installed.versionCode === expectedCandidate.versionCode;
  if (current
      && (installed.minSdk !== expectedCandidate.minSdk
        || installed.targetSdk !== expectedCandidate.targetSdk)) {
    fail('The current OnePlus candidate SDK identity is inconsistent.');
  }
  const paths = verifiedPackagePaths(adb(commandRunner, adbPath, device, [
    'shell', 'pm', 'path', expectedCandidate.applicationId,
  ]));
  const installerPackageName = parsePlayInstaller(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'list', 'packages', '-i', expectedCandidate.applicationId],
  ), expectedCandidate.applicationId);
  continuityMarkersAvailable(packageOutput);
  const processOutput = adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pidof', expectedCandidate.applicationId],
    { optional: true },
  );
  const processCount = processOutput === ''
    ? 0
    : processOutput.split(/\s+/u).filter((value) => /^\d+$/u.test(value)).length;

  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-wp60-oneplus-current-play-install-inspection',
    status: current
      ? 'passed-current-candidate-play-delivery-read-only'
      : 'play-update-required-previous-candidate-preserved',
    capturedAt,
    device: deviceSummary,
    transport: Object.freeze({
      type: transport,
      rawAddressRecorded: false,
      rawDeviceIdentifierRecorded: false,
    }),
    installedApplication: Object.freeze({
      applicationId: expectedCandidate.applicationId,
      versionName: installed.versionName,
      versionCode: installed.versionCode,
      minSdk: installed.minSdk,
      targetSdk: installed.targetSdk,
      installerPackageName,
      packagePathCount: paths.length,
      processRunning: processCount > 0,
      processCount,
      continuityMarkersAvailable: true,
      artifactSourceHead: current ? expectedCandidate.artifactSourceHead : null,
      expectedAabSha256: current ? expectedCandidate.aabSha256 : null,
      exactAabBinaryEquivalenceClaimed: false,
      playAppSigningCertificateVerifiedInThisRun: false,
      functionalBehaviorClaimed: false,
    }),
    readiness: Object.freeze({
      currentCandidatePresent: current,
      googlePlayUpdateRequired: !current,
      updateMechanism: 'google-play-only',
      exactCurrentPreflightMayBegin: current,
      lifecycleMayBegin: current,
    }),
    boundaries: Object.freeze({
      appLaunched: false,
      processStopped: false,
      appInstalledOrUpdated: false,
      appUninstalled: false,
      appDataReset: false,
      networkChanged: false,
      permissionChanged: false,
      accountContentInspected: false,
      screenshotCaptured: false,
      logcatCaptured: false,
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

export function runWp60OnePlusMode({
  mode,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  binding,
  releaseGoConfirmed = false,
  ownerWindowConfirmed = false,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (releaseGoConfirmed !== true || ownerWindowConfirmed !== true) {
    fail('WP60 OnePlus work is not authorized before both exact gates.');
  }
  const expectedCandidate = {
    applicationId: binding.applicationId,
    versionName: binding.versionName,
    versionCode: binding.versionCode,
    minSdk: binding.minSdk,
    targetSdk: binding.targetSdk,
    artifactSourceHead: binding.artifactSourceHead,
    aabSha256: binding.aabSha256,
  };
  if (mode === 'inspect') {
    return inspectWp60OnePlusInstall({
      commandRunner,
      adbPath,
      device,
      expectedCandidate,
      previousVersionCode: binding.previousVersionCode,
      allowedTransports: binding.allowedAdbTransports,
      capturedAt,
    });
  }
  if (mode === 'verify') {
    return preflightOnePlusPlayInternalCandidate({
      commandRunner,
      adbPath,
      device,
      expectedCandidate,
      releaseGoConfirmed,
      capturedAt,
      allowedTransports: binding.allowedAdbTransports,
    });
  }
  if (mode === 'lifecycle') {
    return runOnePlusPlayInternalOwnerSmoke({
      commandRunner,
      adbPath,
      device,
      expectedCandidate,
      releaseGoConfirmed,
      ownerWindowConfirmed,
      capturedAt,
      allowedTransports: binding.allowedAdbTransports,
    });
  }
  fail('WP60 mode must be inspect, verify or lifecycle.');
}

function run() {
  const args = parseWp60OnePlusArguments(process.argv.slice(2));
  const binding = validateWp60OnePlusCurrentCandidate();
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const evidence = runWp60OnePlusMode({
    ...args,
    binding,
    device,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP60 OnePlus work failed.'}\n`);
    process.exitCode = 1;
  }
}
