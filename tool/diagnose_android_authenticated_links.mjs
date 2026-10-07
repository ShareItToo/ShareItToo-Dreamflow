#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from './prepare_android_device_test.mjs';

const applicationId = 'com.shareittoo.app';
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const remoteUiDump = '/sdcard/sit-authenticated-links-diagnostic.xml';
const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function safeFixtureIdentifier(value, label) {
  const normalized = nonEmptyString(value, label);
  if (normalized.length > 120 || !/^[A-Za-z0-9_.:-]+$/.test(normalized)) {
    fail(`${label} is not a safe fixture identifier.`);
  }
  return normalized;
}

function readPrivateFixture(vaultFile) {
  if (typeof vaultFile !== 'string' || !isAbsolute(vaultFile)) {
    fail('The synthetic account vault must be an absolute path.');
  }
  const canonical = realpathSync(vaultFile);
  const rel = relative(repositoryRoot, canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail('The synthetic account vault must remain outside the repository.');
  }
  let vault;
  let descriptor;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
      fail('The synthetic account vault must be a private, regular file.');
    }
    vault = JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch {
    fail('The synthetic account vault is invalid.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const roles = Array.isArray(vault?.accounts)
    ? vault.accounts.map((account) => account?.role).sort()
    : [];
  const booking = vault?.syntheticBooking;
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || vault?.status !== 'synthetic-booking-completed'
      || roles.join(',') !== 'owner,renter'
      || booking?.workflowStatus !== 'completed'
      || booking?.paymentMode !== 'memory'
      || booking?.stripeLivemode !== false
      || booking?.paymentEndpointCalled !== false) {
    fail('The vault is not a completed, isolated Staging role fixture.');
  }
  return {
    listingId: safeFixtureIdentifier(booking.listingId, 'listing fixture'),
    bookingId: safeFixtureIdentifier(booking.bookingId, 'booking fixture'),
    threadId: safeFixtureIdentifier(booking.threadId, 'thread fixture'),
    title: nonEmptyString(booking.title, 'fixture title'),
  };
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
    fail('ADB authenticated-link command failed without exposing the device identifier.');
  }
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || buildNumber === null) fail('Installed ShareItToo version could not be verified.');
  return { versionName, buildNumber };
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
      commandRunner, adbPath, device,
      ['exec-out', 'cat', packagePaths[0]],
      { binary: true },
    ));
    if (installedSha256 !== archive.apkSha256 || installedSha256 !== candidate.android.apkSha256) {
      fail('Installed ShareItToo APK does not match the verified candidate.');
    }
    return { ...installed, delivery: 'direct-apk', apkSha256: installedSha256 };
  }
  const basePackages = packagePaths.filter((value) => value.endsWith('/base.apk'));
  if (basePackages.length !== 1 || packagePaths.some((value) => (
    !value.endsWith('/base.apk') && !/\/split_[^/]+\.apk$/u.test(value)
  ))) {
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

function startLink(commandRunner, adbPath, device, uri) {
  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const result = adb(commandRunner, adbPath, device, [
    'shell', 'am', 'start', '-W',
    '-a', 'android.intent.action.VIEW',
    '-c', 'android.intent.category.BROWSABLE',
    '-p', applicationId,
    '-d', uri,
  ]);
  if (!/Status:\s*ok/.test(result) || !result.includes(applicationId)) {
    fail('Android did not route the expected authenticated ShareItToo link to the app.');
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
      // The fixed remote file is overwritten and its private UI content is
      // never copied into evidence or console output.
    }
  }
}

async function waitForPrivateSurface({ commandRunner, adbPath, device, predicate, wait, label }) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await wait(800);
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return;
  }
  fail(`The expected authenticated ShareItToo ${label} link surface did not appear.`);
}

function containsAny(value, expected) {
  return expected.some((candidate) => value.includes(candidate));
}

function restoreCandidate(commandRunner, adbPath, device) {
  try {
    adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
    adb(commandRunner, adbPath, device, [
      'shell', 'monkey', '-p', applicationId,
      '-c', 'android.intent.category.LAUNCHER', '1',
    ]);
  } catch {
    // The diagnostic is already complete. A final convenience launch cannot
    // turn a passed private-surface verification into a false failure.
  }
}

export async function diagnoseAndroidAuthenticatedLinks({
  vaultFile,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  archive,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const fixture = readPrivateFixture(vaultFile);
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate, archive);

  try {
    startLink(commandRunner, adbPath, device,
      `${stagingApiBaseUrl}/open/listing/${encodeURIComponent(fixture.listingId)}`);
    await waitForPrivateSurface({
      commandRunner, adbPath, device,
      predicate: (hierarchy) => hierarchy.includes(fixture.title)
        && !containsAny(hierarchy, ['Anzeige nicht verfügbar', 'Bitte zuerst anmelden']),
      wait,
      label: 'listing',
    });

    startLink(commandRunner, adbPath, device,
      `${stagingApiBaseUrl}/open/booking/${encodeURIComponent(fixture.bookingId)}`);
    await waitForPrivateSurface({
      commandRunner, adbPath, device,
      predicate: (hierarchy) => hierarchy.includes(fixture.title)
        && containsAny(hierarchy, ['Abgeschlossen', 'Buchungsdetails', 'Mietdetails', 'Buchung'])
        && !containsAny(hierarchy, ['Buchung nicht verfügbar', 'Bitte zuerst anmelden']),
      wait,
      label: 'booking',
    });

    startLink(commandRunner, adbPath, device,
      `shareittoo://chat/${encodeURIComponent(fixture.threadId)}`);
    await waitForPrivateSurface({
      commandRunner, adbPath, device,
      predicate: (hierarchy) => hierarchy.includes(fixture.title)
        && containsAny(hierarchy, ['Der Buchungs-Chat ist geöffnet', 'Nachricht', 'Chat', 'Abgeschlossen'])
        && !containsAny(hierarchy, ['Bitte zuerst anmelden', 'Nach der Anmeldung öffnen wir']),
      wait,
      label: 'chat',
    });
  } finally {
    restoreCandidate(commandRunner, adbPath, device);
  }

  return {
    schemaVersion: 1,
    kind: 'android-authenticated-deep-link-diagnostic',
    status: 'passed-bounded-authenticated-deep-link-diagnostic',
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
    tests: {
      authenticatedHttpsListing: { status: 'passed', result: 'synthetic-listing-visible' },
      authenticatedHttpsBooking: { status: 'passed', result: 'completed-booking-visible' },
      authenticatedCustomSchemeChat: { status: 'passed', result: 'booking-chat-visible' },
    },
    boundaries: {
      syntheticAccountsOnly: true,
      directDiagnosticOnly: installed.delivery === 'direct-apk',
      storeInstallationGateSatisfied: installed.delivery === 'google-play-split',
      fullDeviceMatrixPassed: false,
      wifiOnlyDiagnostic: true,
      hotspotPassed: false,
      authenticatedDeepLinksPassed: true,
      realPushPassed: false,
      manualTalkBackTraversalPassed: false,
      iosTestFlightPassed: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      messageSent: false,
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
  const manifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
  const candidate = manifest.candidate;
  const candidateDirectory = resolve(
    args.candidateDirectory ?? resolve(
      homedir(), 'Library', 'Application Support', 'ShareItToo', 'release', 'android',
      `${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')}-${nonEmptyString(candidate.commit, 'candidate.commit')}`,
    ),
  );
  const archive = await validateCandidateArchive({ root, candidateDirectory });
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = await diagnoseAndroidAuthenticatedLinks({
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
