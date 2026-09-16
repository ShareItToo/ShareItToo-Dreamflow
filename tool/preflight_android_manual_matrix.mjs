#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const applicationId = 'com.shareittoo.app';
const allowedCells = new Set(['android-wifi-owner', 'android-hotspot-renter']);

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export function parsePackageIdentity(output) {
  const versionName = /^\s*versionName=([^\s]+)$/mu.exec(output)?.[1] ?? null;
  const versionCode = /^\s*versionCode=(\d+)\b/mu.exec(output)?.[1] ?? null;
  return { versionName, versionCode };
}

export function parseInstallerPackage(output) {
  const installer = /\binstaller=([^\s]+)\b/u.exec(output)?.[1] ?? null;
  return installer === 'null' ? null : installer;
}

export function parseActiveTransport(output) {
  const activeNetwork = /Active default network:\s*(\d+)/iu.exec(output)?.[1]
    ?? /mActiveDefaultNetwork=(\d+)/iu.exec(output)?.[1]
    ?? null;
  if (activeNetwork === null) return null;
  const networkLine = output.split(/\r?\n/u).find((line) =>
    line.includes('NetworkAgentInfo')
      && new RegExp(`(?:network\\{|Network\\()?${activeNetwork}\\b`, 'iu').test(line));
  if (networkLine === undefined) return null;
  return ['WIFI', 'CELLULAR', 'ETHERNET', 'VPN']
    .find((transport) => networkLine.includes(transport)) ?? null;
}

export function wifiNetworkFingerprint(output, routeOutput = '') {
  const ssid = /^\s*SSID:\s*(.+)$/mu.exec(output)?.[1]?.trim() ?? '';
  const privateNetworkSignature = ssid !== '' && ssid !== '<unknown ssid>'
    ? `ssid:${ssid}`
    : routeOutput.trim() === ''
      ? null
      : `route:${routeOutput.trim().replace(/\s+/gu, ' ')}`;
  if (privateNetworkSignature === null) return null;
  return createHash('sha256').update(privateNetworkSignature).digest('hex').slice(0, 16);
}

export function parseFontScale(output) {
  const value = Number.parseFloat(output.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isTalkBackEnabled(output) {
  return /talkback/iu.test(output) && output.trim() !== 'null';
}

export function buildManualMatrixReadiness({
  cellId,
  candidate,
  packageDump,
  installerOutput,
  connectivityDump,
  wifiStatus,
  routeStatus = '',
  fontScaleOutput,
  accessibilityServices,
  baselineNetworkFingerprint = null,
  confirmedHotspot = false,
}) {
  if (!allowedCells.has(cellId)) fail('Unsupported Android device-matrix cell.');
  const identity = parsePackageIdentity(packageDump);
  const installerPackage = parseInstallerPackage(installerOutput);
  const activeTransport = parseActiveTransport(connectivityDump);
  const networkFingerprint = wifiNetworkFingerprint(wifiStatus, routeStatus);
  const fontScale = parseFontScale(fontScaleOutput);
  const talkBackEnabled = isTalkBackEnabled(accessibilityServices);
  const hotspotCell = cellId === 'android-hotspot-renter';
  const expectedVersionName = nonEmptyString(candidate.versionName, 'candidate.versionName');
  const expectedBuildNumber = nonEmptyString(candidate.buildNumber, 'candidate.buildNumber');
  const blockers = [];

  if (identity.versionName !== expectedVersionName || identity.versionCode !== expectedBuildNumber) {
    blockers.push('exact-candidate-not-installed');
  }
  if (installerPackage !== 'com.android.vending') {
    blockers.push('play-internal-install-not-proven');
  }
  if (activeTransport !== 'WIFI') {
    blockers.push('wifi-transport-not-active');
  }
  if (hotspotCell) {
    if (confirmedHotspot !== true) blockers.push('hotspot-not-manually-confirmed');
    if (!/^[a-f0-9]{16}$/u.test(baselineNetworkFingerprint ?? '')) {
      blockers.push('baseline-network-fingerprint-missing');
    } else if (networkFingerprint === null || networkFingerprint === baselineNetworkFingerprint) {
      blockers.push('hotspot-network-change-not-proven');
    }
  }
  if (!talkBackEnabled) blockers.push('talkback-not-enabled');
  if (fontScale === null || fontScale < 2) blockers.push('font-scale-below-200-percent');

  return {
    schemaVersion: 1,
    kind: 'android-manual-matrix-preflight',
    status: blockers.length === 0 ? 'ready-for-manual-matrix' : 'pending-prerequisites',
    cellId,
    candidate: {
      applicationId,
      versionName: expectedVersionName,
      buildNumber: expectedBuildNumber,
    },
    observed: {
      exactCandidateInstalled: identity.versionName === expectedVersionName
        && identity.versionCode === expectedBuildNumber,
      playInternalInstaller: installerPackage === 'com.android.vending',
      activeTransport,
      networkFingerprint,
      networkChangedFromBaseline: hotspotCell
        ? networkFingerprint !== null && networkFingerprint !== baselineNetworkFingerprint
        : null,
      hotspotManuallyConfirmed: hotspotCell ? confirmedHotspot === true : null,
      talkBackEnabled,
      fontScaleAtLeast200Percent: fontScale !== null && fontScale >= 2,
    },
    blockers,
    boundaries: {
      manualMatrixPassed: false,
      evidenceWritten: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsRawNetworkNames: false,
      containsRawNetworkRoutes: false,
    },
  };
}

function parseArguments(values) {
  let cellId = null;
  let adbPath = 'adb';
  let baselineNetworkFingerprint = null;
  let confirmedHotspot = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--cell') {
      cellId = values[index + 1] ?? fail('--cell requires a value.');
      index += 1;
    } else if (value === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (value === '--baseline-network-fingerprint') {
      baselineNetworkFingerprint = values[index + 1]
        ?? fail('--baseline-network-fingerprint requires a value.');
      index += 1;
    } else if (value === '--confirm-hotspot') {
      confirmedHotspot = true;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  if (!allowedCells.has(cellId)) {
    fail('--cell must be android-wifi-owner or android-hotspot-renter.');
  }
  return { cellId, adbPath, baselineNetworkFingerprint, confirmedHotspot };
}

function adb(adbPath, serial, args) {
  try {
    return execFileSync(adbPath, ['-s', serial, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail('ADB device inspection failed.');
  }
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
  const candidate = manifest.candidate ?? fail('Device candidate is missing.');
  const devices = parseAdbDevices(execFileSync(args.adbPath, ['devices', '-l'], { encoding: 'utf8' }));
  const device = selectSinglePhysicalDevice(devices);
  const report = buildManualMatrixReadiness({
    ...args,
    candidate,
    packageDump: adb(args.adbPath, device.serial, ['shell', 'dumpsys', 'package', applicationId]),
    installerOutput: adb(args.adbPath, device.serial, ['shell', 'pm', 'list', 'packages', '-i', applicationId]),
    connectivityDump: adb(args.adbPath, device.serial, ['shell', 'dumpsys', 'connectivity']),
    wifiStatus: adb(args.adbPath, device.serial, ['shell', 'cmd', 'wifi', 'status']),
    routeStatus: adb(
      args.adbPath,
      device.serial,
      ['shell', 'ip', 'route', 'show', 'dev', 'wlan0'],
    ),
    fontScaleOutput: adb(args.adbPath, device.serial, ['shell', 'settings', 'get', 'system', 'font_scale']),
    accessibilityServices: adb(
      args.adbPath,
      device.serial,
      ['shell', 'settings', 'get', 'secure', 'enabled_accessibility_services'],
    ),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'ready-for-manual-matrix') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
