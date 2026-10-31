#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  classifyAdbTransport,
  parseInstalledOnePlusPackage,
  parsePlayInstaller,
} from './inspect_oneplus_play_internal_baseline.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(
  root,
  'store/google-play/rw20-current-internal-candidate-manifest.json',
);
const releaseGo = 'GOOGLE_PLAY_INTERNAL_RELEASE_GO';

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
    fail('Sanitized OnePlus candidate preflight command failed.');
  }
}

function packagePaths(output) {
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

export function parseOnePlusCandidatePreflightArguments(values) {
  let adbPath = 'adb';
  let confirmed = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (value === '--confirm-release-go') {
      const confirmation = values[index + 1]
        ?? fail('--confirm-release-go requires the exact owner gate.');
      if (confirmation !== releaseGo) {
        fail('The exact Google Play Internal release gate was not supplied.');
      }
      confirmed = true;
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  if (!confirmed) {
    fail('OnePlus candidate preflight remains closed until the exact release gate is supplied.');
  }
  return { adbPath, releaseGoConfirmed: true };
}

export function preflightOnePlusPlayInternalCandidate({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  expectedCandidate,
  releaseGoConfirmed = false,
  capturedAt = new Date().toISOString(),
  allowedTransports = ['wireless-adb'],
} = {}) {
  if (releaseGoConfirmed !== true) {
    fail('OnePlus candidate preflight is not authorized before the release gate.');
  }
  const transport = classifyAdbTransport(device);
  if (!Array.isArray(allowedTransports)
      || allowedTransports.length === 0
      || allowedTransports.some((value) => !['usb', 'wireless-adb'].includes(value))) {
    fail('Allowed OnePlus ADB transports are invalid.');
  }
  if (!allowedTransports.includes(transport)) {
    if (allowedTransports.length === 1 && allowedTransports[0] === 'wireless-adb') {
      fail('Exactly one OnePlus phone must be connected through Wireless debugging.');
    }
    fail('The OnePlus is not connected through an explicitly allowed ADB transport.');
  }
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  if (!/oneplus/iu.test(deviceSummary.manufacturer)) {
    fail('The connected physical Android phone is not identified as OnePlus.');
  }

  const installed = parseInstalledOnePlusPackage(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'package', expectedCandidate.applicationId],
  ));
  if (installed.versionName !== expectedCandidate.versionName
      || installed.versionCode !== expectedCandidate.versionCode
      || installed.minSdk !== expectedCandidate.minSdk
      || installed.targetSdk !== expectedCandidate.targetSdk) {
    fail('The OnePlus does not contain the exact expected Play Internal candidate.');
  }
  const paths = packagePaths(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'path', expectedCandidate.applicationId],
  ));
  const installerPackageName = parsePlayInstaller(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'list', 'packages', '-i', expectedCandidate.applicationId],
  ), expectedCandidate.applicationId);
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

  return {
    schemaVersion: 1,
    kind: 'rw20b-oneplus-play-internal-candidate-read-only-preflight',
    status: 'passed-exact-version-play-delivery-read-only-preflight',
    capturedAt,
    authorization: {
      releaseGoConfirmed: true,
      confirmationValueRecorded: false,
    },
    device: deviceSummary,
    transport: {
      type: transport,
      rawAddressRecorded: false,
      rawDeviceIdentifierRecorded: false,
    },
    installedApplication: {
      applicationId: expectedCandidate.applicationId,
      versionName: installed.versionName,
      versionCode: installed.versionCode,
      minSdk: installed.minSdk,
      targetSdk: installed.targetSdk,
      installerPackageName,
      packagePathCount: paths.length,
      processRunning: processCount > 0,
      processCount,
      artifactSourceHead: expectedCandidate.artifactSourceHead,
      expectedAabSha256: expectedCandidate.aabSha256,
      exactAabBinaryEquivalenceClaimed: false,
      playAppSigningCertificateVerified: false,
      functionalBehaviorClaimed: false,
    },
    readiness: {
      exactPackageVersionAndPlayDeliveryObserved: true,
      nonDestructiveManualMatrixMayBegin: true,
      authenticatedMatrixMayBegin: false,
      authenticatedMatrixBlocker: 'owner-provided-synthetic-test-session-required',
    },
    boundaries: {
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
    },
  };
}

function run() {
  const args = parseOnePlusCandidatePreflightArguments(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const evidence = preflightOnePlusPlayInternalCandidate({
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
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'OnePlus candidate preflight failed.'}\n`);
    process.exitCode = 1;
  }
}
