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
import {
  loadCurrentHeadAndroidDeviceCandidate,
} from './validate_current_head_android_candidate.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const applicationId = 'com.shareittoo.app';
const remoteUiDump = '/sdcard/sit-authenticated-session-diagnostic.xml';

function fail(message) {
  throw new Error(message);
}

export function bindAuthenticatedSessionCandidateArchive(archive) {
  if (archive?.applicationId !== applicationId
      || archive?.bundleId !== applicationId
      || archive?.releaseChannel !== 'internal'
      || archive?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || archive?.firebaseConfigured !== true
      || archive?.privacyScan !== 'passed'
      || archive?.android?.apkSha256 !== archive?.apkSha256
      || archive?.android?.aabSha256 !== archive?.aabSha256
      || archive?.android?.signingCertificateSha256
        !== archive?.signingCertificateSha256) {
    fail('The private authenticated-session candidate archive is not an exact signed Internal Staging candidate.');
  }
  return Object.freeze({
    ...archive,
    paymentMode: 'memory',
    stripeLivemode: false,
  });
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
    fail('ADB authenticated-session command failed without exposing the device identifier.');
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
  if (/keyguardShowing=true|isStatusBarKeyguard=true|\bmIsShowing=true\b|\bshowing=true\b/u.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
}

function readBinarySetting(commandRunner, adbPath, device, key) {
  const value = adb(commandRunner, adbPath, device, [
    'shell',
    'settings',
    'get',
    'global',
    key,
  ]);
  if (value !== '0' && value !== '1') {
    fail('The Android network state could not be read safely.');
  }
  return value === '1';
}

async function setNetworkToggle({
  commandRunner,
  adbPath,
  device,
  service,
  setting,
  enabled,
  verifySetting = true,
  wait,
}) {
  adb(commandRunner, adbPath, device, [
    'shell',
    'svc',
    service,
    enabled ? 'enable' : 'disable',
  ]);
  if (!verifySetting) {
    await wait(500);
    return;
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (readBinarySetting(commandRunner, adbPath, device, setting) === enabled) return;
    await wait(300);
  }
  fail('The Android network toggle did not reach the requested safe state.');
}

function canReachInternet(commandRunner, adbPath, device) {
  try {
    commandRunner(adbPath, [
      '-s',
      device.serial,
      'shell',
      'ping',
      '-c',
      '1',
      '-W',
      '1',
      '1.1.1.1',
    ]);
    return true;
  } catch {
    return false;
  }
}

async function waitForNoConnectivity({ commandRunner, adbPath, device, wait }) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!canReachInternet(commandRunner, adbPath, device)) return;
    await wait(500);
  }
  fail('The bounded offline gate still had Internet connectivity.');
}

async function waitForConnectivity({ commandRunner, adbPath, device, wait }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (canReachInternet(commandRunner, adbPath, device)) return;
    await wait(500);
  }
  fail('The original Android network did not regain Internet connectivity.');
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
    return {
      ...installed,
      delivery: 'direct-apk',
      apkSha256: installedSha256,
    };
  }

  const basePackages = packagePaths.filter((value) => value.endsWith('/base.apk'));
  const splitPackagesValid = packagePaths.every((value) => (
    value.endsWith('/base.apk') || /\/split_[^/]+\.apk$/u.test(value)
  ));
  if (basePackages.length !== 1 || !splitPackagesValid) {
    fail('Installed ShareItToo Play package split set is missing or ambiguous.');
  }
  const installerOutput = adb(commandRunner, adbPath, device, [
    'shell',
    'pm',
    'list',
    'packages',
    '-i',
    applicationId,
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

function dumpUi(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'uiautomator', 'dump', remoteUiDump]);
  try {
    return adb(commandRunner, adbPath, device, ['exec-out', 'cat', remoteUiDump]);
  } finally {
    try {
      adb(commandRunner, adbPath, device, ['shell', 'rm', '-f', remoteUiDump]);
    } catch {
      // Never mask the diagnostic result. The fixed remote file is overwritten
      // and its raw UI content is never copied into evidence or console output.
    }
  }
}

function xmlValue(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attribute(tag, name) {
  const value = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? null : xmlValue(value);
}

function namedNodes(hierarchy, label) {
  const matchesLabel = (value) => value?.split('\n').some((line) => line === label
    || line.startsWith(`${label},`)
    || line.startsWith(`${label} `)) === true;
  return (String(hierarchy).match(/<node[^>]*>/g) ?? []).filter((tag) => (
    matchesLabel(attribute(tag, 'text')) || matchesLabel(attribute(tag, 'content-desc'))
  ));
}

const discoverNavigationLabels = ['Entdecken', 'Erkunden'];
const accountNavigationLabels = ['Mein SIT', 'Profil'];

function availableNavigationLabel(hierarchy, labels) {
  return labels.find((label) => namedNodes(hierarchy, label).length >= 1) ?? null;
}

function nodeCenter(tag, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attribute(tag, 'bounds') ?? '');
  if (!bounds) fail(`The sanitized ${label} action has invalid bounds.`);
  const values = bounds.slice(1).map(Number);
  return {
    x: Math.round((values[0] + values[2]) / 2),
    y: Math.round((values[1] + values[3]) / 2),
  };
}

async function waitForHierarchy({
  commandRunner,
  adbPath,
  device,
  predicate,
  failFastPredicate = null,
  failFastMessage = null,
  wait,
}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(750);
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    if (hierarchy.includes('content-desc="Benachrichtigung:')) {
      // A queued foreground push can legitimately cover the navigation after
      // launch. Dismiss only that explicitly labelled transient SIT dialog;
      // never guess at arbitrary dialogs or record its message content.
      adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
      continue;
    }
    if (predicate(hierarchy)) return hierarchy;
    // A valid persisted session can briefly render the guest profile while
    // the remote profile hydration finishes after a cold start. Only treat a
    // fail-fast surface as authoritative after the full bounded wait window.
    if (attempt === 7 && failFastPredicate?.(hierarchy)) {
      fail(failFastMessage ?? 'The authenticated-session diagnostic stopped at a safe manual checkpoint.');
    }
  }
  fail('The expected sanitized authenticated ShareItToo surface did not appear.');
}

function hasMainNavigation(hierarchy) {
  return availableNavigationLabel(hierarchy, discoverNavigationLabels) !== null
    && namedNodes(hierarchy, 'Nachrichten').length >= 1
    && availableNavigationLabel(hierarchy, accountNavigationLabels) !== null;
}

function hasAuthenticatedProfile(hierarchy) {
  return ['Meine Anzeigen', 'Mietanfragen', 'Abmelden'].every((label) => namedNodes(hierarchy, label).length >= 1)
    && namedNodes(hierarchy, 'Anmelden').length === 0
    && namedNodes(hierarchy, 'Konto erstellen').length === 0;
}

function hasGuestProfile(hierarchy) {
  return namedNodes(hierarchy, 'Anmelden').length >= 1
    && namedNodes(hierarchy, 'Konto erstellen').length >= 1;
}

function tapSingleNamedNode(commandRunner, adbPath, device, hierarchy, label) {
  const enabled = namedNodes(hierarchy, label).filter((tag) => attribute(tag, 'enabled') !== 'false');
  const clickable = enabled.filter((tag) => attribute(tag, 'clickable') === 'true');
  const matches = clickable.length ? clickable : enabled;
  if (matches.length !== 1) fail(`The sanitized ${label} action is missing or ambiguous.`);
  const center = nodeCenter(matches[0], label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'tap', String(center.x), String(center.y)]);
}

function launchCandidate(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const result = adb(commandRunner, adbPath, device, [
    'shell',
    'monkey',
    '-p',
    applicationId,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);
  if (!/Events injected:\s*1/.test(result)) fail('Android did not confirm the ShareItToo launch event.');
}

async function verifyAuthenticatedProfileCycle({ commandRunner, adbPath, device, wait }) {
  launchCandidate(commandRunner, adbPath, device);
  const main = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: hasMainNavigation,
    wait,
  });
  tapSingleNamedNode(
    commandRunner,
    adbPath,
    device,
    main,
    availableNavigationLabel(main, accountNavigationLabels) ?? 'Mein SIT',
  );
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: hasAuthenticatedProfile,
    failFastPredicate: hasGuestProfile,
    failFastMessage: 'The Pixel is still signed out. Sign in manually; this diagnostic never enters review credentials.',
    wait,
  });
}

function restoreExplore(commandRunner, adbPath, device) {
  try {
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    tapSingleNamedNode(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      availableNavigationLabel(hierarchy, discoverNavigationLabels) ?? 'Entdecken',
    );
  } catch {
    // The verification is already complete. A final convenience navigation
    // failure must not turn a passed session diagnostic into a false failure.
  }
}

export async function diagnoseAndroidAuthenticatedSession({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  archive,
  networkCondition = null,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate, archive);
  let network = null;
  if (networkCondition !== null && networkCondition !== 'offline') {
    fail('Only the bounded offline network condition is supported.');
  }

  if (networkCondition === 'offline') {
    const wifiInitiallyEnabled = readBinarySetting(
      commandRunner,
      adbPath,
      device,
      'wifi_on',
    );
    const mobileDataInitiallyEnabled = readBinarySetting(
      commandRunner,
      adbPath,
      device,
      'mobile_data',
    );
    if (!canReachInternet(commandRunner, adbPath, device)) {
      fail('The bounded offline diagnostic requires an online starting state.');
    }
    try {
      await setNetworkToggle({
        commandRunner,
        adbPath,
        device,
        service: 'wifi',
        setting: 'wifi_on',
        enabled: false,
        wait,
      });
      await setNetworkToggle({
        commandRunner,
        adbPath,
        device,
        service: 'data',
        setting: 'mobile_data',
        enabled: false,
        verifySetting: false,
        wait,
      });
      await waitForNoConnectivity({ commandRunner, adbPath, device, wait });
      await verifyAuthenticatedProfileCycle({ commandRunner, adbPath, device, wait });
      await verifyAuthenticatedProfileCycle({ commandRunner, adbPath, device, wait });
    } finally {
      restoreExplore(commandRunner, adbPath, device);
      await setNetworkToggle({
        commandRunner,
        adbPath,
        device,
        service: 'wifi',
        setting: 'wifi_on',
        enabled: wifiInitiallyEnabled,
        wait,
      });
      await setNetworkToggle({
        commandRunner,
        adbPath,
        device,
        service: 'data',
        setting: 'mobile_data',
        enabled: mobileDataInitiallyEnabled,
        verifySetting: false,
        wait,
      });
      await waitForConnectivity({ commandRunner, adbPath, device, wait });
    }
    network = {
      condition: 'offline',
      onlinePrecondition: 'passed',
      wifiDisabled: true,
      mobileDataDisabled: true,
      connectivityGate: 'passed-no-connectivity',
      networkRestored: 'passed-online',
    };
  } else {
    try {
      await verifyAuthenticatedProfileCycle({ commandRunner, adbPath, device, wait });
      await verifyAuthenticatedProfileCycle({ commandRunner, adbPath, device, wait });
    } finally {
      restoreExplore(commandRunner, adbPath, device);
    }
  }

  return {
    schemaVersion: 1,
    kind: 'android-authenticated-session-diagnostic',
    status: 'passed-bounded-authenticated-session-diagnostic',
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
      authenticatedProfileAccess: { status: 'passed', result: 'authenticated-actions-present' },
      coldStartSessionRestore: { status: 'passed', result: 'authenticated-profile-restored-after-force-stop' },
    },
    ...(network === null ? {} : { network }),
    boundaries: {
      directDiagnosticOnly: installed.delivery === 'direct-apk',
      storeInstallationGateSatisfied: installed.delivery === 'google-play-split',
      syntheticRoleMatrixPassed: false,
      bookingFlowPassed: false,
      authenticatedDeepLinksPassed: false,
      realPushPassed: false,
      manualTalkBackTraversalPassed: false,
      lockCodeUsed: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  };
}

export function parseAuthenticatedSessionArguments(values) {
  let candidateDirectory = null;
  let adbPath = 'adb';
  let networkCondition = null;
  let currentHead = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--network') {
      networkCondition = values[index + 1] ?? fail('--network requires a value.');
      if (networkCondition !== 'offline') fail('--network only supports offline.');
      index += 1;
    } else if (values[index] === '--current-head') {
      currentHead = true;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (currentHead && candidateDirectory !== null) {
    fail('--current-head cannot be combined with --candidate-dir.');
  }
  return { candidateDirectory, adbPath, networkCondition, currentHead };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseAuthenticatedSessionArguments(process.argv.slice(2));
  let candidate;
  let archive;
  if (args.currentHead) {
    candidate = await loadCurrentHeadAndroidDeviceCandidate();
    archive = Object.freeze({ apkSha256: candidate.android.apkSha256 });
  } else {
    const candidateDirectory = resolve(
      args.candidateDirectory
        ?? fail('--candidate-dir is required unless --current-head is used.'),
    );
    archive = await validatePrivateAndroidReleaseArchive({
      root,
      candidateDirectory,
    });
    candidate = bindAuthenticatedSessionCandidateArchive(archive);
  }
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = await diagnoseAndroidAuthenticatedSession({
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    archive,
    networkCondition: args.networkCondition,
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
