#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  canonicalAndroidSigningCertificateSha256,
  currentHeadAndroidApplicationId,
  readCurrentHeadAndroidReleaseIdentity,
} from './validate_current_head_android_release_archive.mjs';
import { inspectAndroidApkCertificate } from './install_current_head_android_candidate_update.mjs';

function fail(message) {
  throw new Error(message);
}

function defaultCommandRunner(file, args, options = {}) {
  return execFileSync(file, args, {
    encoding: options.binary === true ? undefined : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(commandRunner, adbPath, device, args, options = {}) {
  try {
    return commandRunner(adbPath, ['-s', device.serial, ...args], options);
  } catch {
    fail('Sanitized ADB audit command failed.');
  }
}

function optionalAdb(commandRunner, adbPath, device, args) {
  try {
    return String(commandRunner(adbPath, ['-s', device.serial, ...args])).trim();
  } catch {
    return '';
  }
}

export function parseInstalledPackageAudit(output) {
  const value = String(output);
  const versionName = /^\s*versionName=([^\s]+)\s*$/mu.exec(value)?.[1] ?? null;
  const versionCode = /^\s*versionCode=(\d+)\b/mu.exec(value)?.[1] ?? null;
  const minSdk = /^\s*versionCode=\d+\s+minSdk=(\d+)\s+targetSdk=(\d+)\b/mu.exec(value);
  if (versionName === null || versionCode === null || minSdk === null) {
    fail('Installed package identity is incomplete.');
  }
  return {
    versionName,
    versionCode,
    minSdk: Number(minSdk[1]),
    targetSdk: Number(minSdk[2]),
  };
}

export function parseDataStorageAudit(output) {
  const lines = String(output).trim().split(/\r?\n/u).filter(Boolean);
  const fields = lines.at(-1)?.trim().split(/\s+/u) ?? [];
  const totalKiB = Number(fields[1]);
  const availableKiB = Number(fields[3]);
  const usedPercent = Number(String(fields[4] ?? '').replace(/%$/u, ''));
  if (!Number.isSafeInteger(totalKiB) || totalKiB <= 0
      || !Number.isSafeInteger(availableKiB) || availableKiB < 0
      || !Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) {
    fail('Device storage summary is invalid.');
  }
  return { totalKiB, availableKiB, usedPercent };
}

export function parseBatteryAudit(output) {
  const value = String(output);
  const level = Number(/^\s*level:\s*(\d+)\s*$/mu.exec(value)?.[1]);
  const status = Number(/^\s*status:\s*(\d+)\s*$/mu.exec(value)?.[1]);
  const temperatureTenths = Number(/^\s*temperature:\s*(\d+)\s*$/mu.exec(value)?.[1]);
  const statuses = new Map([
    [1, 'unknown'],
    [2, 'charging'],
    [3, 'discharging'],
    [4, 'not-charging'],
    [5, 'full'],
  ]);
  if (!Number.isInteger(level) || level < 0 || level > 100
      || !statuses.has(status)
      || !Number.isInteger(temperatureTenths) || temperatureTenths < 0) {
    fail('Device battery summary is invalid.');
  }
  return {
    levelPercent: level,
    status: statuses.get(status),
    temperatureC: temperatureTenths / 10,
  };
}

export function parseDebugApkIdentity(output) {
  const value = String(output);
  const match = /package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'/u
    .exec(value);
  if (match === null) fail('Current-worktree debug APK identity is invalid.');
  return {
    applicationId: match[1],
    versionCode: match[2],
    versionName: match[3],
  };
}

function installedApkBytes(commandRunner, adbPath, device, packagePaths) {
  const basePath = packagePaths.find((path) => /(?:^|\/)base\.apk$/u.test(path))
    ?? (packagePaths.length === 1 ? packagePaths[0] : null);
  if (basePath === null || !basePath.startsWith('/data/app/')) {
    fail('Installed package base APK is unavailable.');
  }
  return Buffer.from(adb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'cat', basePath],
    { binary: true },
  ));
}

function certificateFromBytes(bytes, certificateInspector) {
  const directory = mkdtempSync(join(tmpdir(), 'sit-r1-installed-apk-'));
  chmodSync(directory, 0o700);
  const path = join(directory, 'installed.apk');
  try {
    writeFileSync(path, bytes, { mode: 0o600 });
    chmodSync(path, 0o600);
    return certificateInspector(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function auditAndroidDeviceR1({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  expectedIdentity,
  debugApkPath,
  certificateInspector,
  debugIdentityInspector,
  capturedAt = new Date().toISOString(),
}) {
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  const packageOutput = String(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'package', currentHeadAndroidApplicationId],
  ));
  const installed = parseInstalledPackageAudit(packageOutput);
  const packagePaths = String(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'path', currentHeadAndroidApplicationId],
  ))
    .split(/\r?\n/u)
    .map((line) => line.replace(/^package:/u, '').trim())
    .filter(Boolean);
  if (packagePaths.length === 0) fail('ShareItToo package is not installed.');

  const installedCertificate = certificateFromBytes(
    installedApkBytes(commandRunner, adbPath, device, packagePaths),
    certificateInspector,
  );
  const debugCertificate = certificateInspector(debugApkPath);
  const debugIdentity = debugIdentityInspector(debugApkPath);
  const processOutput = optionalAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pidof', currentHeadAndroidApplicationId],
  );
  const processCount = processOutput === ''
    ? 0
    : processOutput.split(/\s+/u).filter((value) => /^\d+$/u.test(value)).length;
  const storage = parseDataStorageAudit(String(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'df', '-k', '/data'],
  )));
  const battery = parseBatteryAudit(String(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'battery'],
  )));
  const bootCompleted = String(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'getprop', 'sys.boot_completed'],
  )).trim() === '1';

  const exactPackageIdentity = debugIdentity.applicationId === currentHeadAndroidApplicationId
    && debugIdentity.versionName === expectedIdentity.versionName
    && debugIdentity.versionCode === expectedIdentity.buildNumber;
  const installedUsesCanonicalSigning = installedCertificate
    === canonicalAndroidSigningCertificateSha256;
  const debugSignatureMatchesInstalled = debugCertificate === installedCertificate;
  const candidateStrictlyNewer = BigInt(debugIdentity.versionCode) > BigInt(installed.versionCode);
  const safeInstallEligible = exactPackageIdentity
    && installedUsesCanonicalSigning
    && debugSignatureMatchesInstalled
    && candidateStrictlyNewer;

  return {
    schemaVersion: 1,
    kind: 'sit-48h-r1-pixel-safe-device-audit',
    status: safeInstallEligible
      ? 'safe-current-debug-update-eligible'
      : 'audit-complete-install-blocked',
    capturedAt,
    device: deviceSummary,
    package: {
      applicationId: currentHeadAndroidApplicationId,
      present: true,
      versionName: installed.versionName,
      versionCode: installed.versionCode,
      minSdk: installed.minSdk,
      targetSdk: installed.targetSdk,
      installedUsesCanonicalSigning,
      packagePathCount: packagePaths.length,
    },
    process: {
      running: processCount > 0,
      processCount,
    },
    storage,
    health: {
      adbAuthorized: true,
      bootCompleted,
      battery,
      basicHealthPassed: bootCompleted && storage.availableKiB > 512 * 1024,
    },
    currentSourceDebugCandidate: {
      versionName: debugIdentity.versionName,
      versionCode: debugIdentity.versionCode,
      exactPackageIdentity,
      strictlyNewerThanInstalled: candidateStrictlyNewer,
      signatureMatchesInstalled: debugSignatureMatchesInstalled,
      safeInstallEligible,
    },
    installDecision: {
      result: safeInstallEligible ? 'eligible-not-performed' : 'PHYSICAL_ACTION_REQUIRED',
      exactPackageIdentityVerified: exactPackageIdentity,
      signingCompatibilityVerified: debugSignatureMatchesInstalled,
      nonDestructiveUpdateVerified: safeInstallEligible,
      uninstallOrResetNeeded: !debugSignatureMatchesInstalled,
      noUserConfirmationNeeded: safeInstallEligible ? 'not-yet-proven' : 'not-evaluated',
      existingUserDataPreservationVerified: false,
      rollbackDocumented: false,
      installAttempted: false,
    },
    boundaries: {
      deviceMutationPerformed: false,
      installPerformed: false,
      uninstallPerformed: false,
      dataResetPerformed: false,
      deviceUnlockedOrBypassed: false,
      privateMediaRead: false,
      containsRawDeviceIdentifiers: false,
      containsCertificateDigests: false,
      containsPrivateFilesystemPaths: false,
    },
  };
}

function resolveBuildTool(root, tool) {
  const localProperties = resolve(root, 'android', 'local.properties');
  const sdkRoot = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? (/^sdk\.dir=(.+)$/mu.exec(readFileSync(localProperties, 'utf8'))?.[1])
    ?? resolve(homedir(), 'Library', 'Android', 'sdk');
  const buildTools = resolve(sdkRoot, 'build-tools');
  const versions = readdirSync(buildTools).sort((left, right) => (
    left.localeCompare(right, undefined, { numeric: true })
  ));
  const path = resolve(buildTools, versions.at(-1) ?? '', tool);
  if (!existsSync(path)) fail(`Android ${tool} is unavailable.`);
  return path;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const adbPath = process.env.SIT_ADB_PATH ?? 'adb';
  const apksignerPath = resolveBuildTool(root, 'apksigner');
  const aaptPath = resolveBuildTool(root, 'aapt');
  const debugApkPath = resolve(root, 'build', 'app', 'outputs', 'flutter-apk', 'app-debug.apk');
  if (!existsSync(debugApkPath)) fail('Current-worktree debug APK is unavailable.');
  const devices = parseAdbDevices(String(defaultCommandRunner(adbPath, ['devices', '-l'])));
  const device = selectSinglePhysicalDevice(devices);
  const expectedIdentity = readCurrentHeadAndroidReleaseIdentity({ root });
  const result = auditAndroidDeviceR1({
    adbPath,
    device,
    expectedIdentity,
    debugApkPath,
    certificateInspector: (path) => inspectAndroidApkCertificate({
      apkPath: path,
      apksignerPath,
    }),
    debugIdentityInspector: (path) => parseDebugApkIdentity(String(
      defaultCommandRunner(aaptPath, ['dump', 'badging', path]),
    )),
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) run();
