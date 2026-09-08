#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const handoffPath = resolve(
  root,
  'store/google-play/rw20a-internal-draft-oneplus-handoff.json',
);

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
    fail('Sanitized OnePlus ADB baseline command failed.');
  }
}

export function classifyAdbTransport(device) {
  if (typeof device?.serial !== 'string') fail('ADB transport identity is unavailable.');
  if (device.attributes?.usb) return 'usb';
  if (/^(?:\d{1,3}\.){3}\d{1,3}:\d+$/u.test(device.serial)
      || /_adb-tls-connect\._tcp$/u.test(device.serial)) {
    return 'wireless-adb';
  }
  return 'unknown';
}

export function parseInstalledOnePlusPackage(output) {
  const value = String(output);
  const versionName = /^\s*versionName=([^\s]+)\s*$/mu.exec(value)?.[1] ?? null;
  const version = /^\s*versionCode=(\d+)\s+minSdk=(\d+)\s+targetSdk=(\d+)\b/mu.exec(value);
  if (versionName === null || version === null) {
    fail('Installed ShareItToo package identity is incomplete.');
  }
  return {
    versionName,
    versionCode: version[1],
    minSdk: Number(version[2]),
    targetSdk: Number(version[3]),
  };
}

export function parsePlayInstaller(output, applicationId) {
  const matches = String(output)
    .split(/\r?\n/u)
    .map((line) => /^package:([^\s]+)\s+installer=([^\s]+)$/u.exec(line.trim()))
    .filter((match) => match !== null && match[1] === applicationId);
  if (matches.length !== 1) {
    fail('Installed ShareItToo package source is unavailable.');
  }
  if (matches[0][2] !== 'com.android.vending') {
    fail('Installed ShareItToo package was not delivered by Google Play.');
  }
  return 'com.android.vending';
}

export function inspectOnePlusPlayInternalBaseline({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  expectedActive,
  futureCandidate,
  capturedAt = new Date().toISOString(),
  requireWireless = true,
} = {}) {
  const transport = classifyAdbTransport(device);
  if (requireWireless && transport !== 'wireless-adb') {
    fail('Exactly one OnePlus phone must be connected through Wireless debugging.');
  }
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  if (!/oneplus/iu.test(deviceSummary.manufacturer)) {
    fail('The connected physical Android phone is not identified as OnePlus.');
  }

  const packageState = parseInstalledOnePlusPackage(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'package', expectedActive.applicationId],
  ));
  if (packageState.versionName !== expectedActive.versionName
      || packageState.versionCode !== expectedActive.versionCode) {
    fail('The OnePlus does not contain the expected active Play Internal baseline.');
  }
  const packagePaths = adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'path', expectedActive.applicationId],
  )
    .split(/\r?\n/u)
    .map((line) => line.replace(/^package:/u, '').trim())
    .filter(Boolean);
  if (packagePaths.length === 0
      || packagePaths.some((path) => !path.startsWith('/data/app/'))
      || packagePaths.filter((path) => path.endsWith('/base.apk')).length !== 1) {
    fail('Installed ShareItToo Play split paths are missing or ambiguous.');
  }
  const installerPackageName = parsePlayInstaller(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'list', 'packages', '-i', expectedActive.applicationId],
  ), expectedActive.applicationId);
  const processOutput = adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pidof', expectedActive.applicationId],
    { optional: true },
  );
  const processCount = processOutput === ''
    ? 0
    : processOutput.split(/\s+/u).filter((value) => /^\d+$/u.test(value)).length;

  return {
    schemaVersion: 1,
    kind: 'rw20a-oneplus-play-internal-read-only-baseline',
    status: 'passed-active-internal-install-baseline-only',
    capturedAt,
    device: deviceSummary,
    transport: {
      type: transport,
      rawAddressRecorded: false,
      rawDeviceIdentifierRecorded: false,
    },
    installedApplication: {
      applicationId: expectedActive.applicationId,
      versionName: packageState.versionName,
      versionCode: packageState.versionCode,
      minSdk: packageState.minSdk,
      targetSdk: packageState.targetSdk,
      installerPackageName,
      packagePathCount: packagePaths.length,
      processRunning: processCount > 0,
      processCount,
      exactBinaryHashClaimed: false,
      functionalBehaviorClaimed: false,
    },
    futureCandidate: {
      versionName: futureCandidate.versionName,
      versionCode: futureCandidate.versionCode,
      installed: false,
      releaseActivated: false,
      tested: false,
    },
    nextAllowedStep: 'manual-nondestructive-baseline-matrix-on-active-build',
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
      releaseActivated: false,
      testerListChanged: false,
      productionChanged: false,
      paymentChanged: false,
      providerChanged: false,
      containsSecrets: false,
      containsTesterIdentity: false,
      containsRawDeviceIdentifier: false,
      containsNetworkAddress: false
    }
  };
}

function run() {
  const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
  const adbPath = process.env.SIT_ADB_PATH ?? 'adb';
  const devices = parseAdbDevices(defaultCommandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const evidence = inspectOnePlusPlayInternalBaseline({
    adbPath,
    device,
    expectedActive: {
      applicationId: handoff.candidate.applicationId,
      versionName: handoff.playState.activeInternalRelease.applicationVersionName,
      versionCode: handoff.playState.activeInternalRelease.versionCode,
    },
    futureCandidate: {
      versionName: handoff.candidate.versionName,
      versionCode: handoff.candidate.versionCode,
    },
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'OnePlus baseline failed.'}\n`);
    process.exitCode = 1;
  }
}
