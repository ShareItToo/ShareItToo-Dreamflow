#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedApplicationId = 'com.shareittoo.app';
const expectedApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function sha256(value, label) {
  const normalized = nonEmptyString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    fail(`${label} must be a SHA-256 digest.`);
  }
  return normalized;
}

function safeDisplayValue(value, label) {
  const normalized = nonEmptyString(value, label).replace(/\s+/g, ' ').trim();
  if (normalized.length > 120 || /[^\x20-\x7e\u00a0-\uffff]/u.test(normalized)) {
    fail(`${label} contains unsupported characters.`);
  }
  return normalized;
}

async function hashFile(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

function privateRegularFile(path, label) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    fail(`${label} is missing.`);
  }
  if (!stat.isFile() || stat.size === 0) {
    fail(`${label} must be a non-empty regular file.`);
  }
  if ((stat.mode & 0o077) !== 0) {
    fail(`${label} must not be readable or writable by group or others.`);
  }
}

function uniqueArtifact(directory, extension) {
  const matches = readdirSync(directory)
    .filter((name) => name.endsWith(extension))
    .map((name) => resolve(directory, name));
  if (matches.length !== 1) {
    fail(`Candidate archive must contain exactly one ${extension} artifact.`);
  }
  return matches[0];
}

export async function validateCandidateArchive({ root, candidateDirectory }) {
  const deviceManifest = object(
    JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8')),
    'store/device-validation.json',
  );
  const candidate = object(deviceManifest.candidate, 'candidate');
  const expectedAndroid = object(candidate.android, 'candidate.android');
  const manifestPath = resolve(candidateDirectory, 'manifest.json');
  const privacyPath = resolve(candidateDirectory, 'privacy-scan.json');
  const apkPath = uniqueArtifact(candidateDirectory, '.apk');
  const aabPath = uniqueArtifact(candidateDirectory, '.aab');

  for (const [path, label] of [
    [manifestPath, 'candidate manifest'],
    [privacyPath, 'candidate privacy report'],
    [apkPath, 'candidate APK'],
    [aabPath, 'candidate AAB'],
  ]) {
    privateRegularFile(path, label);
  }

  const manifest = object(JSON.parse(readFileSync(manifestPath, 'utf8')), 'candidate manifest');
  const privacy = object(JSON.parse(readFileSync(privacyPath, 'utf8')), 'candidate privacy report');
  const expectedIdentity = {
    applicationId: expectedApplicationId,
    versionName: nonEmptyString(candidate.versionName, 'candidate.versionName'),
    versionCode: nonEmptyString(candidate.buildNumber, 'candidate.buildNumber'),
    commit: nonEmptyString(candidate.commit, 'candidate.commit'),
    apiBaseUrl: expectedApiBaseUrl,
  };

  if (!/^\d{10}$/.test(expectedIdentity.versionCode) || !/^[a-f0-9]{40}$/i.test(expectedIdentity.commit)) {
    fail('Device manifest candidate build number or commit is invalid.');
  }
  if (candidate.applicationId !== expectedApplicationId || candidate.firebaseConfigured !== true) {
    fail('Device manifest must identify the Firebase-configured ShareItToo Android candidate.');
  }
  if (candidate.apiBaseUrl !== expectedApiBaseUrl || candidate.stripeLivemode !== false) {
    fail('Device manifest candidate must remain on isolated staging with Stripe livemode disabled.');
  }

  for (const [key, expected] of Object.entries(expectedIdentity)) {
    const manifestKey = key === 'versionCode' ? 'versionCode' : key;
    if (manifest[manifestKey] !== expected) {
      fail(`Candidate manifest ${manifestKey} does not match store/device-validation.json.`);
    }
    if (privacy.identity?.[key] !== expected) {
      fail(`Privacy report identity.${key} does not match store/device-validation.json.`);
    }
  }
  if (manifest.channel !== candidate.releaseChannel || manifest.firebaseConfigured !== true) {
    fail('Candidate manifest channel or Firebase state does not match the device manifest.');
  }
  if (manifest.androidBinaryPrivacyScan !== 'passed' || privacy.status !== 'passed') {
    fail('Android binary privacy scan must be passed before device preparation.');
  }
  if (!Array.isArray(privacy.findings) || privacy.findings.length !== 0) {
    fail('Android binary privacy report contains findings.');
  }

  const [apkDigest, aabDigest, privacyDigest] = await Promise.all([
    hashFile(apkPath),
    hashFile(aabPath),
    hashFile(privacyPath),
  ]);
  const expectedApk = sha256(expectedAndroid.apkSha256, 'candidate.android.apkSha256');
  const expectedAab = sha256(expectedAndroid.aabSha256, 'candidate.android.aabSha256');
  const expectedCertificate = sha256(
    expectedAndroid.signingCertificateSha256,
    'candidate.android.signingCertificateSha256',
  );
  if (apkDigest !== expectedApk || manifest.apkSha256 !== expectedApk || privacy.artifacts?.apk?.sha256 !== expectedApk) {
    fail('Candidate APK SHA-256 does not match all release records.');
  }
  if (aabDigest !== expectedAab || manifest.aabSha256 !== expectedAab || privacy.artifacts?.aab?.sha256 !== expectedAab) {
    fail('Candidate AAB SHA-256 does not match all release records.');
  }
  if (privacyDigest !== sha256(manifest.androidBinaryPrivacyReportSha256, 'privacy report SHA-256')) {
    fail('Candidate privacy report SHA-256 does not match the candidate manifest.');
  }
  if (manifest.signingCertificateSha256 !== expectedCertificate) {
    fail('Candidate signing certificate does not match the device manifest.');
  }

  return {
    applicationId: expectedApplicationId,
    bundleId: nonEmptyString(candidate.bundleId, 'candidate.bundleId'),
    versionName: expectedIdentity.versionName,
    buildNumber: expectedIdentity.versionCode,
    commit: expectedIdentity.commit,
    releaseChannel: candidate.releaseChannel,
    apiBaseUrl: expectedApiBaseUrl,
    firebaseConfigured: true,
    paymentMode: nonEmptyString(candidate.paymentMode, 'candidate.paymentMode'),
    stripeLivemode: false,
    apkSha256: apkDigest,
    aabSha256: aabDigest,
    signingCertificateSha256: expectedCertificate,
    privacyScan: 'passed',
    apkPath,
    aabPath,
  };
}

export function parseAdbDevices(output) {
  const devices = [];
  for (const line of String(output).split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('*')) continue;
    const fields = trimmed.split(/\s+/);
    if (fields.length < 2) continue;
    const serial = fields[0];
    if (!/^[A-Za-z0-9._:-]+$/.test(serial)) fail('ADB returned an unsafe device identifier.');
    const attributes = {};
    for (const field of fields.slice(2)) {
      const separator = field.indexOf(':');
      if (separator > 0) attributes[field.slice(0, separator)] = field.slice(separator + 1);
    }
    devices.push({ serial, state: fields[1], attributes });
  }
  return devices;
}

function isEmulator(device) {
  const signature = [device.serial, device.attributes.product, device.attributes.model, device.attributes.device]
    .filter(Boolean)
    .join(' ');
  return /(^|\b)emulator-|sdk_gphone|android_sdk|generic_x86|simulator/i.test(signature);
}

export function selectSinglePhysicalDevice(devices) {
  const onlinePhysical = devices.filter((device) => device.state === 'device' && !isEmulator(device));
  if (onlinePhysical.length === 1) return onlinePhysical[0];
  if (onlinePhysical.length > 1) {
    fail('More than one authorized physical Android device is connected; keep exactly one connected for an unambiguous test.');
  }
  const unauthorized = devices.filter((device) => device.state === 'unauthorized').length;
  if (unauthorized > 0) {
    fail('An Android device is connected but not authorized; confirm the USB-debugging trust prompt on the phone.');
  }
  const offline = devices.filter((device) => device.state === 'offline').length;
  if (offline > 0) {
    fail('An Android device is connected but offline; reconnect it and confirm USB debugging.');
  }
  if (devices.some((device) => device.state === 'device' && isEmulator(device))) {
    fail('Only an Android emulator is available; B11 requires a physical Android phone.');
  }
  fail('No authorized physical Android device detected. Connect one phone and enable USB debugging.');
}

function defaultCommandRunner(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(commandRunner, adbPath, device, args) {
  try {
    return String(commandRunner(adbPath, ['-s', device.serial, ...args])).trim();
  } catch {
    fail('ADB device command failed. Reconnect the phone, confirm USB debugging, and retry.');
  }
}

function deviceProperty(commandRunner, adbPath, device, property, label) {
  return safeDisplayValue(adb(commandRunner, adbPath, device, ['shell', 'getprop', property]), label);
}

export function inspectPhysicalDevice({ commandRunner = defaultCommandRunner, adbPath = 'adb', device }) {
  const manufacturer = deviceProperty(commandRunner, adbPath, device, 'ro.product.manufacturer', 'device manufacturer');
  const model = deviceProperty(commandRunner, adbPath, device, 'ro.product.model', 'device model');
  const osVersion = deviceProperty(commandRunner, adbPath, device, 'ro.build.version.release', 'Android version');
  const apiLevel = deviceProperty(commandRunner, adbPath, device, 'ro.build.version.sdk', 'Android API level');
  const securityPatch = deviceProperty(commandRunner, adbPath, device, 'ro.build.version.security_patch', 'Android security patch');
  if (!/^\d+$/.test(apiLevel) || !/^\d{4}-\d{2}-\d{2}$/.test(securityPatch)) {
    fail('Android device returned an invalid API level or security patch date.');
  }
  return {
    platform: 'android',
    physical: true,
    manufacturer,
    model,
    osVersion,
    apiLevel: Number(apiLevel),
    securityPatch,
    containsRawDeviceIdentifier: false,
  };
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const versionCode = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || versionCode === null) {
    fail('Installed ShareItToo package version could not be verified.');
  }
  return { versionName, versionCode };
}

export function installAndLaunchCandidate({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  candidate,
  capturedAt = new Date().toISOString(),
}) {
  const installResult = adb(commandRunner, adbPath, device, [
    'install',
    '--no-streaming',
    '-r',
    candidate.apkPath,
  ]);
  if (!/(^|\n)Success\s*$/m.test(installResult)) {
    fail('ADB did not confirm successful APK installation.');
  }
  const packagePath = adb(commandRunner, adbPath, device, ['shell', 'pm', 'path', candidate.applicationId]);
  if (!packagePath.startsWith('package:')) fail('Installed ShareItToo package path is unavailable.');
  const installed = parseInstalledPackage(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'package', candidate.applicationId]),
  );
  if (installed.versionName !== candidate.versionName || installed.versionCode !== candidate.buildNumber) {
    fail('Installed ShareItToo package version does not match the verified candidate.');
  }
  const launchResult = adb(commandRunner, adbPath, device, [
    'shell',
    'monkey',
    '-p',
    candidate.applicationId,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);
  if (!/Events injected:\s*1/.test(launchResult)) {
    fail('Android did not confirm the first ShareItToo launch event.');
  }
  const activities = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'activity', 'activities']);
  const escapedApplicationId = candidate.applicationId.replaceAll('.', '\\.');
  if (!new RegExp(`(?:mResumedActivity|topResumedActivity|ResumedActivity:).*${escapedApplicationId}/`).test(activities)) {
    fail('ShareItToo did not become the verified foreground activity after launch.');
  }

  return {
    schemaVersion: 1,
    kind: 'android-direct-device-smoke',
    status: 'installed-launched-pending-manual-matrix',
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
      apkSha256: candidate.apkSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
      privacyScan: candidate.privacyScan,
    },
    installation: {
      method: 'direct-apk-diagnostic',
      installed: true,
      installedVersionVerified: true,
      installedBuildVerified: true,
      foregroundActivityVerified: true,
      firstLaunchEvent: 'passed',
      storeInstallationGateSatisfied: false,
    },
    boundaries: {
      manualFunctionalMatrixPassed: false,
      playInternalInstallPassed: false,
      realPushPassed: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
      syntheticAccountsOnly: true,
    },
    nextRequired: [
      'manual Android Wi-Fi owner matrix',
      'manual Android hotspot renter matrix',
      'controlled FCM foreground/background/terminated delivery',
      'Google Play Internal installation of the same unchanged build',
    ],
  };
}

function parseArguments(values) {
  let candidateDirectory = null;
  let adbPath = 'adb';
  let install = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (value === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (value === '--install') {
      install = true;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return { candidateDirectory, adbPath, install };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const deviceManifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
  const buildNumber = nonEmptyString(deviceManifest.candidate?.buildNumber, 'candidate.buildNumber');
  const commit = nonEmptyString(deviceManifest.candidate?.commit, 'candidate.commit');
  const candidateDirectory = resolve(
    args.candidateDirectory ??
      resolve(homedir(), 'Library', 'Application Support', 'ShareItToo', 'release', 'android', `${buildNumber}-${commit}`),
  );
  const candidate = await validateCandidateArchive({ root, candidateDirectory });
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });

  if (!args.install) {
    console.log(JSON.stringify({
      status: 'ready-for-explicit-install',
      candidate: {
        ...candidate,
        apkPath: basename(candidate.apkPath),
        aabPath: basename(candidate.aabPath),
      },
      device: deviceSummary,
      boundaries: {
        installationPerformed: false,
        containsSecrets: false,
        containsRawDeviceIdentifiers: false,
      },
    }, null, 2));
    return;
  }

  const evidence = installAndLaunchCandidate({ adbPath: args.adbPath, device, candidate });
  evidence.device = deviceSummary;
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
