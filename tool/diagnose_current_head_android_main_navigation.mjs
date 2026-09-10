#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
import {
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';

export const currentHeadAndroidApplicationId = 'com.shareittoo.app';
const applicationId = currentHeadAndroidApplicationId;
const remoteUiDump = '/sdcard/sit-main-navigation-diagnostic.xml';
const navigationChecks = Object.freeze([
  Object.freeze({
    label: 'Entdecken',
    requiredAll: [],
    requiredAny: ['Jetzt suchen', 'Standort aktualisieren'],
  }),
  Object.freeze({
    label: 'Mietkorb',
    requiredAll: ['Gemerkt'],
    requiredAny: ['Im Mietkorb – noch nicht reserviert', 'Dein Mietkorb', 'Mietkorb'],
  }),
  Object.freeze({
    label: 'Buchungen',
    requiredAll: ['Meine Buchungen'],
    requiredAny: [],
  }),
  Object.freeze({
    label: 'Nachrichten',
    requiredAll: ['Nachrichten-Einstellungen'],
    requiredAny: ['Noch keine Nachrichten', 'Keine aktiven Nachrichten', 'Nachrichten'],
  }),
  Object.freeze({
    label: 'Mein SIT',
    requiredAll: ['Meine Anzeigen', 'Mietanfragen', 'Abmelden'],
    requiredAny: [],
  }),
]);

function fail(message) {
  throw new Error(message);
}

export function defaultCurrentHeadAndroidCommandRunner(file, args, { binary = false } = {}) {
  return execFileSync(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function currentHeadAndroidAdb(commandRunner, adbPath, device, args, { binary = false } = {}) {
  try {
    const result = commandRunner(adbPath, ['-s', device.serial, ...args], { binary });
    return binary ? Buffer.from(result) : String(result).trim();
  } catch {
    fail('ADB main-navigation command failed without exposing the device identifier.');
  }
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || buildNumber === null) {
    fail('Installed ShareItToo version could not be verified.');
  }
  return { versionName, buildNumber };
}

export function assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'window', 'policy'],
  );
  if (/keyguardShowing=true|isStatusBarKeyguard=true|\bmIsShowing=true\b|\bshowing=true\b/u.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
}

export function verifyCurrentHeadAndroidInstalledCandidate(
  commandRunner,
  adbPath,
  device,
  candidate,
) {
  const packagePaths = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'path', applicationId],
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
  if (packagePaths.length !== 1 || !packagePaths[0].startsWith('/data/app/')) {
    fail('Installed ShareItToo package is not the exact direct-APK candidate.');
  }
  const installedSha256 = sha256Bytes(currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'cat', packagePaths[0]],
    { binary: true },
  ));
  if (installedSha256 !== candidate.android.apkSha256) {
    fail('Installed ShareItToo APK does not match the current-head candidate.');
  }
  const installed = parseInstalledPackage(
    currentHeadAndroidAdb(
      commandRunner,
      adbPath,
      device,
      ['shell', 'dumpsys', 'package', applicationId],
    ),
  );
  if (installed.versionName !== candidate.versionName
      || installed.buildNumber !== candidate.buildNumber) {
    fail('Installed ShareItToo version does not match the current-head candidate.');
  }
  return { ...installed, delivery: 'direct-apk', apkSha256: installedSha256 };
}

export function launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device) {
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'am', 'force-stop', applicationId],
  );
  const result = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'monkey',
    '-p',
    applicationId,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);
  if (!/Events injected:\s*1/u.test(result)) {
    fail('The current-head ShareItToo candidate did not launch.');
  }
}

export function dumpCurrentHeadAndroidUi(commandRunner, adbPath, device) {
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'uiautomator', 'dump', remoteUiDump],
  );
  try {
    return currentHeadAndroidAdb(
      commandRunner,
      adbPath,
      device,
      ['exec-out', 'cat', remoteUiDump],
    );
  } finally {
    try {
      currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'rm', '-f', remoteUiDump],
      );
    } catch {
      // The hierarchy is transient, is overwritten on the next run and never
      // enters repository evidence or console output.
    }
  }
}

function xmlValue(value) {
  return String(value)
    .replace(/&#(\d+);/gu, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal) => (
      String.fromCodePoint(Number.parseInt(hexadecimal, 16))
    ))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function currentHeadAndroidNodeAttribute(node, name) {
  const value = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u').exec(node)?.[1];
  return value === undefined ? null : xmlValue(value);
}

export function currentHeadAndroidNamedNodes(hierarchy, label) {
  const matchesLabel = (value) => value?.split('\n').some((line) => (
    line === label
      || (line.startsWith(label) && /[\s,.:;!?–—-]/u.test(line[label.length] ?? ''))
  )) === true;
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? []).filter((node) => (
    matchesLabel(currentHeadAndroidNodeAttribute(node, 'text'))
      || matchesLabel(currentHeadAndroidNodeAttribute(node, 'content-desc'))
  ));
}

// A UI dump can contain private account and listing content. Return only a
// closed vocabulary derived from the navigation labels we already require, so
// a physical test can explain a stop without retaining or printing that dump.
export function classifyCurrentHeadAndroidMainNavigationAbsence(hierarchy) {
  const navigationCount = navigationChecks.filter((check) => (
    currentHeadAndroidNamedNodes(hierarchy, check.label).length >= 1
  )).length;
  if (String(hierarchy).includes('content-desc="Benachrichtigung:')) {
    return 'system-notification-overlay';
  }
  if (currentHeadAndroidNamedNodes(hierarchy, 'Bitte zuerst anmelden').length >= 1) {
    return 'unauthenticated-session';
  }
  if (navigationCount === 0) return 'bottom-navigation-absent';
  if (navigationCount < navigationChecks.length) return 'bottom-navigation-incomplete';
  return 'navigation-labels-present-surface-pending';
}

function tapBottomNavigationLabel(commandRunner, adbPath, device, hierarchy, label) {
  const candidates = currentHeadAndroidNamedNodes(hierarchy, label)
    .map((node) => {
      const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
        currentHeadAndroidNodeAttribute(node, 'bounds'),
      );
      if (bounds === null) return null;
      const [, x1, y1, x2, y2] = bounds.map(Number);
      return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
    })
    .filter((value) => value !== null)
    .sort((left, right) => right.y - left.y);
  if (candidates.length === 0) {
    fail(`The ${label} bottom-navigation destination is unavailable.`);
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'tap',
    String(candidates[0].x),
    String(candidates[0].y),
  ]);
}

export async function waitForCurrentHeadAndroidMainNavigation({
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let lastAbsence = 'not-yet-observed';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(600);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    lastAbsence = classifyCurrentHeadAndroidMainNavigationAbsence(hierarchy);
    if (lastAbsence === 'system-notification-overlay') {
      currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'input', 'keyevent', '4'],
      );
      continue;
    }
    if (navigationChecks.every((check) => (
      currentHeadAndroidNamedNodes(hierarchy, check.label).length >= 1
    ))) {
      return hierarchy;
    }
  }
  fail(`The current-head ShareItToo main navigation did not appear (${lastAbsence}).`);
}

async function openAndVerifyNavigation({
  commandRunner,
  adbPath,
  device,
  check,
  wait,
}) {
  let hierarchy = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapBottomNavigationLabel(commandRunner, adbPath, device, hierarchy, check.label);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(600);
    hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const allPresent = check.requiredAll.every((value) => (
      currentHeadAndroidNamedNodes(hierarchy, value).length >= 1
    ));
    const anyPresent = check.requiredAny.length === 0
      || check.requiredAny.some((value) => (
        currentHeadAndroidNamedNodes(hierarchy, value).length >= 1
      ));
    if (allPresent
        && anyPresent
        && currentHeadAndroidNamedNodes(hierarchy, 'Bitte zuerst anmelden').length === 0) return;
  }
  fail(`The authenticated ${check.label} navigation surface did not appear.`);
}

export function restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device) {
  try {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    tapBottomNavigationLabel(commandRunner, adbPath, device, hierarchy, 'Entdecken');
  } catch {
    try {
      launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    } catch {
      // A bounded restoration failure cannot hide the primary diagnostic
      // result. The app remains stopped or on the last read-only surface.
    }
  }
}

export async function diagnoseCurrentHeadAndroidMainNavigation({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  try {
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    for (const check of navigationChecks) {
      await openAndVerifyNavigation({ commandRunner, adbPath, device, check, wait });
    }
  } finally {
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
  return {
    schemaVersion: 1,
    kind: 'android-current-head-authenticated-main-navigation-diagnostic',
    status: 'passed-bounded-authenticated-main-navigation-diagnostic',
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
      apkSha256: installed.apkSha256,
    },
    device: deviceSummary,
    tests: Object.fromEntries(navigationChecks.map((check) => [
      check.label,
      { status: 'passed', result: 'authenticated-read-only-surface' },
    ])),
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      authenticatedMainNavigationPassed: true,
      bookingFlowPassed: false,
      messageSent: false,
      cartMutationPerformed: false,
      accountMutationPerformed: false,
      loginPerformed: false,
      logoutPerformed: false,
      realPushPassed: false,
      manualTalkBackTraversalPassed: false,
      accountIdentityRecorded: false,
      lockCodeUsed: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  };
}

export function parseMainNavigationArguments(values) {
  let currentHead = false;
  let adbPath = 'adb';
  let candidateDirectory = null;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--current-head') {
      currentHead = true;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (!currentHead) fail('The main-navigation diagnostic requires --current-head.');
  return { currentHead, adbPath, candidateDirectory };
}

async function run() {
  const args = parseMainNavigationArguments(process.argv.slice(2));
  const candidate = args.candidateDirectory === null
    ? await loadCurrentHeadAndroidDeviceCandidate()
    : validateCurrentPrivateAndroidCandidate(await validatePrivateAndroidReleaseArchive({
      candidateDirectory: args.candidateDirectory,
    }));
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = await diagnoseCurrentHeadAndroidMainNavigation({
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'Current-head Android main-navigation diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
