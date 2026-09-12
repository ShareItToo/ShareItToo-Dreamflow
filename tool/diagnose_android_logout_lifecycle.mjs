#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from './prepare_android_device_test.mjs';
import { sendSyntheticBookingDiagnosticMessage } from './run_staging_synthetic_booking.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const applicationId = 'com.shareittoo.app';
const remoteUiDump = '/sdcard/sit-logout-lifecycle.xml';
const v52ForegroundPushTitle = 'Neue ShareItToo-Aktualisierung';
const v52ForegroundPushBody = 'In der App ansehen.';

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
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
    fail('ADB logout-lifecycle command failed without exposing the device identifier.');
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
      commandRunner, adbPath, device, ['exec-out', 'cat', packagePaths[0]], { binary: true },
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

function assertDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true/.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
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
      // A later run overwrites the fixed temporary hierarchy path.
    }
  }
}

function decodeXml(value) {
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
  const raw = new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  return raw === undefined ? null : decodeXml(raw);
}

function namedNodes(hierarchy, label) {
  const matchesLabel = (value) => value?.split('\n').some((line) => line === label
    || line.startsWith(`${label},`)
    || line.startsWith(`${label} `)) === true;
  return [...hierarchy.matchAll(/<node\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter((tag) => matchesLabel(attribute(tag, 'text'))
      || matchesLabel(attribute(tag, 'content-desc'))
      || matchesLabel(attribute(tag, 'hint')));
}

export function isV52ForegroundPushPopup(hierarchy) {
  return typeof hierarchy === 'string'
    && hierarchy.includes('content-desc="Benachrichtigung:')
    && hierarchy.includes('content-desc="Öffnen"')
    && hierarchy.includes(v52ForegroundPushTitle)
    && hierarchy.includes(v52ForegroundPushBody);
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

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, { chooseLast = false } = {}) {
  const enabled = namedNodes(hierarchy, label).filter((tag) => attribute(tag, 'enabled') !== 'false');
  const clickable = enabled.filter((tag) => attribute(tag, 'clickable') === 'true');
  const matches = clickable.length ? clickable : enabled;
  if (matches.length === 0) fail(`The sanitized ${label} action is missing.`);
  const center = nodeCenter(chooseLast ? matches.at(-1) : matches[0], label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'tap', String(center.x), String(center.y)]);
}

function inputText(commandRunner, adbPath, device, hierarchy, label, value) {
  if (!/^[A-Za-z0-9._+@-]+$/.test(value)) fail(`The private ${label} fixture is not safe for bounded ADB input.`);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'text', value]);
}

async function waitForHierarchy({ commandRunner, adbPath, device, predicate, wait, attempts = 16 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(650);
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    const notificationPermissionPrompt = hierarchy.includes(
      'resource-id="com.android.permissioncontroller:id/permission_allow_button"',
    ) && hierarchy.includes('text="ShareItToo erlauben, dir Benachrichtigungen zu senden?"');
    if (notificationPermissionPrompt) {
      tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Erlauben');
      // Android 16 can return to the launcher after the permission controller
      // closes. Relaunch only the verified ShareItToo package before resuming.
      launchCandidate(commandRunner, adbPath, device);
      continue;
    }
    // Only close ShareItToo's exact privacy-preserving foreground-push
    // surface. An unrelated or newer dialog must remain untouched and make
    // the bounded diagnostic fail visibly instead of mutating global UI state.
    if (isV52ForegroundPushPopup(hierarchy)) {
      adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
      continue;
    }
    if (predicate(hierarchy)) return hierarchy;
  }
  fail('The expected sanitized ShareItToo surface did not appear.');
}

function hasMainNavigation(hierarchy) {
  return availableNavigationLabel(hierarchy, discoverNavigationLabels) !== null
    && namedNodes(hierarchy, 'Nachrichten').length >= 1
    && availableNavigationLabel(hierarchy, accountNavigationLabels) !== null;
}

function hasAuthenticatedProfile(hierarchy) {
  return ['Meine Anzeigen', 'Mietanfragen', 'Abmelden'].every((label) => namedNodes(hierarchy, label).length >= 1)
    && namedNodes(hierarchy, 'Anmelden').length === 0;
}

function hasGuestProfile(hierarchy) {
  return namedNodes(hierarchy, 'Anmelden').length >= 1
    && namedNodes(hierarchy, 'Konto erstellen').length >= 1;
}

export function hasEnteredNamedLoginInput(hierarchy, label) {
  return namedNodes(hierarchy, label).some((tag) => (
    attribute(tag, 'class') === 'android.widget.EditText'
    && (attribute(tag, 'text') ?? '').length > 0
  ));
}

function hasProtectedChatGate(hierarchy) {
  return hierarchy.includes('Bitte zuerst anmelden')
    && hierarchy.includes('Anmelden')
    && !hierarchy.includes('Nachricht senden');
}

function launchCandidate(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const result = adb(commandRunner, adbPath, device, [
    'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1',
  ]);
  if (!/Events injected:\s*1/.test(result)) fail('Android did not confirm the ShareItToo launch event.');
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
    fail('Android did not route the expected logged-out ShareItToo link to the app.');
  }
}

function processPresent(commandRunner, adbPath, device) {
  try {
    return adb(commandRunner, adbPath, device, ['shell', 'pidof', applicationId]).length > 0;
  } catch {
    return false;
  }
}

function notificationCount(commandRunner, adbPath, device) {
  const output = adb(commandRunner, adbPath, device, ['shell', 'cmd', 'notification', 'list']);
  return output.split(/\r?\n/).filter((line) => line.includes(`|${applicationId}|`)).length;
}

async function waitFor(predicate, { attempts, intervalMs, wait }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await wait(intervalMs);
  }
  return false;
}

export async function sendOppositeRoleMessage(vaultFile, signedInRole, sender) {
  if (!['owner', 'renter'].includes(signedInRole)) {
    fail('The signed-in synthetic role is invalid.');
  }
  const senderRole = signedInRole === 'owner' ? 'renter' : 'owner';
  const result = await sender({ vaultFile, senderRole, diagnosticKind: 'logout' });
  if (result?.status !== 'synthetic-booking-diagnostic-message-sent'
      || result?.paymentEndpointCalled !== false
      || result?.stripeLivemode !== false) {
    fail('The controlled Staging diagnostic message was not accepted safely.');
  }
}

export function isAndroidSoftwareKeyboardShown(inputMethodState) {
  const value = String(inputMethodState);
  return /\bmInputShown=true\b/u.test(value)
    && /\bmIsInputViewShown=true\b/u.test(value);
}

export async function dismissAndroidSoftwareKeyboard({
  commandRunner,
  adbPath,
  device,
  wait,
  attempts = 12,
  intervalMs = 250,
  readInputMethodState = (runner, path, target) => adb(
    runner,
    path,
    target,
    ['shell', 'dumpsys', 'input_method'],
  ),
  pressBack = (runner, path, target) => adb(
    runner,
    path,
    target,
    ['shell', 'input', 'keyevent', '4'],
  ),
}) {
  if (!isAndroidSoftwareKeyboardShown(readInputMethodState(commandRunner, adbPath, device))) {
    return true;
  }
  pressBack(commandRunner, adbPath, device);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isAndroidSoftwareKeyboardShown(readInputMethodState(commandRunner, adbPath, device))) {
      return true;
    }
    if (attempt + 1 < attempts) await wait(intervalMs);
  }
  return false;
}

async function openProfile({ commandRunner, adbPath, device, wait }) {
  launchCandidate(commandRunner, adbPath, device);
  const main = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: hasMainNavigation,
    wait,
    // A cold physical device can legitimately need longer than ten seconds
    // to settle its authenticated Staging catalog before the bottom
    // navigation becomes inspectable. Keep the wait bounded, but do not turn
    // normal network-backed startup latency into a false guest-reset failure.
    attempts: 36,
  });
  tapNamedNode(
    commandRunner,
    adbPath,
    device,
    main,
    availableNavigationLabel(main, accountNavigationLabels) ?? 'Mein SIT',
  );
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => hasAuthenticatedProfile(hierarchy) || hasGuestProfile(hierarchy),
    wait,
    attempts: 36,
  });
}

export async function restoreSyntheticSession({ commandRunner, adbPath, device, wait, account }) {
  const guest = await openProfile({ commandRunner, adbPath, device, wait });
  if (hasAuthenticatedProfile(guest)) return true;
  tapNamedNode(commandRunner, adbPath, device, guest, 'Anmelden');
  const form = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => namedNodes(hierarchy, 'E-Mail').length >= 1
      && namedNodes(hierarchy, 'Passwort').length >= 1,
    wait,
  });
  inputText(commandRunner, adbPath, device, form, 'E-Mail', nonEmptyString(account.email, 'account.email'));
  const passwordForm = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => hasEnteredNamedLoginInput(hierarchy, 'E-Mail'),
    wait,
    attempts: 12,
  });
  inputText(commandRunner, adbPath, device, passwordForm, 'Passwort', nonEmptyString(account.password, 'account.password'));
  if (isAndroidSoftwareKeyboardShown(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'input_method']),
  )) {
    adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
    await wait(350);
  }
  const submitForm = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => hasEnteredNamedLoginInput(hierarchy, 'E-Mail')
      && hasEnteredNamedLoginInput(hierarchy, 'Passwort')
      && namedNodes(hierarchy, 'Anmelden').some(
        (tag) => attribute(tag, 'clickable') === 'true' && attribute(tag, 'enabled') !== 'false',
      ),
    wait,
    attempts: 12,
  });
  tapNamedNode(commandRunner, adbPath, device, submitForm, 'Anmelden', { chooseLast: true });
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: hasMainNavigation,
    wait,
    attempts: 36,
  });
  const restored = await openProfile({ commandRunner, adbPath, device, wait });
  return hasAuthenticatedProfile(restored);
}

export async function ensureAndroidGuestSession({ commandRunner, adbPath, device, wait }) {
  const profile = await openProfile({ commandRunner, adbPath, device, wait });
  if (hasGuestProfile(profile)) return true;
  tapNamedNode(commandRunner, adbPath, device, profile, 'Abmelden');
  const confirmation = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => hierarchy.includes('Abmelden?') && hierarchy.includes('Abbrechen'),
    wait,
  });
  tapNamedNode(commandRunner, adbPath, device, confirmation, 'Abmelden', { chooseLast: true });
  await waitForHierarchy({ commandRunner, adbPath, device, predicate: hasGuestProfile, wait, attempts: 24 });
  return true;
}

export async function diagnoseAndroidLogoutLifecycle({
  vaultFile,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  archive,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  sender = sendSyntheticBookingDiagnosticMessage,
}) {
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate, archive);
  const vault = JSON.parse(readFileSync(vaultFile, 'utf8'));
  const account = vault.accounts?.[0] ?? fail('The private synthetic account fixture is unavailable.');
  const threadId = nonEmptyString(vault.syntheticBooking?.threadId, 'syntheticBooking.threadId');

  let processAbsent = false;
  let observedNotificationCountBefore = null;
  let observedNotificationCountAfter = null;
  let diagnosticFailure = null;
  try {
    let profile = await openProfile({ commandRunner, adbPath, device, wait });
    if (!hasAuthenticatedProfile(profile)) {
      const preflightRestored = await restoreSyntheticSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account,
      });
      if (!preflightRestored) fail('The Pixel could not restore the private synthetic Staging session.');
      profile = await openProfile({ commandRunner, adbPath, device, wait });
    }
    tapNamedNode(commandRunner, adbPath, device, profile, 'Abmelden');
    const confirmation = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      predicate: (hierarchy) => hierarchy.includes('Abmelden?') && hierarchy.includes('Abbrechen'),
      wait,
    });
    tapNamedNode(commandRunner, adbPath, device, confirmation, 'Abmelden', { chooseLast: true });
    await waitForHierarchy({ commandRunner, adbPath, device, predicate: hasGuestProfile, wait, attempts: 24 });

    const guestAfterRestart = await openProfile({ commandRunner, adbPath, device, wait });
    if (!hasGuestProfile(guestAfterRestart)) fail('The guest profile did not persist after the cold start.');

    startLink(commandRunner, adbPath, device, `shareittoo://chat/${encodeURIComponent(threadId)}`);
    await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      predicate: hasProtectedChatGate,
      wait,
      attempts: 18,
    });

    adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
    processAbsent = await waitFor(
      () => !processPresent(commandRunner, adbPath, device),
      { attempts: 10, intervalMs: 300, wait },
    );
    if (!processAbsent) fail('The ShareItToo process did not stop before the post-logout probe.');
    observedNotificationCountBefore = notificationCount(commandRunner, adbPath, device);
    await sendOppositeRoleMessage(vaultFile, account.role, sender);
    await wait(35_000);
    observedNotificationCountAfter = notificationCount(commandRunner, adbPath, device);
    if (observedNotificationCountAfter !== observedNotificationCountBefore) {
      fail('A ShareItToo notification appeared after the synthetic session was logged out.');
    }
  } catch (error) {
    diagnosticFailure = error;
  }

  const sessionRestored = await restoreSyntheticSession({
    commandRunner,
    adbPath,
    device,
    wait,
    account,
  });
  if (!sessionRestored) {
    fail('The private synthetic Staging session could not be restored after the logout probe.');
  }
  if (diagnosticFailure !== null) throw diagnosticFailure;

  return {
    evidence: {
      schemaVersion: 1,
      kind: 'android-logout-lifecycle-diagnostic',
      status: 'passed-bounded-logout-lifecycle-diagnostic',
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
        uiLogout: { status: 'passed', result: 'logout-confirmed-and-session-cleared' },
        coldStartGuestPersistence: { status: 'passed', result: 'guest-profile-restored-after-process-restart' },
        protectedChatAfterLogout: { status: 'passed', result: 'authentication-required-private-content-hidden' },
        postLogoutProcessAbsentPush: { status: 'passed', result: 'controlled-message-created-no-device-notification' },
      },
      notificationProbe: {
        processAbsent: true,
        messageAccepted: true,
        observedNotificationCountBefore,
        observedNotificationCountAfter,
        notificationCountUnchanged: true,
        observationSeconds: 35,
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
        controlledPushSuppressionPassed: true,
        manualTalkBackTraversalPassed: false,
        iosTestFlightPassed: false,
        paymentEndpointCalled: false,
        stripeLivemode: false,
        messageSent: true,
        lockCodeUsed: false,
        accountIdentityRecorded: false,
        containsPersonalAccountData: false,
        containsSecrets: false,
        containsRawDeviceIdentifiers: false,
        containsReviewCredentials: false
      }
    },
    sessionRestored,
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
  return { candidateDirectory, vaultFile, adbPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const vaultFile = resolve(args.vaultFile ?? fail('--vault-file is required.'));
  let candidate;
  let archive;
  if (args.candidateDirectory !== null) {
    archive = await validatePrivateAndroidReleaseArchive({
      root,
      candidateDirectory: resolve(args.candidateDirectory),
    });
    candidate = Object.freeze({ ...archive, paymentMode: 'memory', stripeLivemode: false });
  } else {
    const deviceManifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
    candidate = deviceManifest.candidate;
    const candidateDirectory = resolve(
      homedir(),
      'Library',
      'Application Support',
      'ShareItToo',
      'release',
      'android',
      `${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')}-${nonEmptyString(candidate.commit, 'candidate.commit')}`,
    );
    archive = await validateCandidateArchive({ root, candidateDirectory });
  }
  const devices = parseAdbDevices(defaultCommandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const result = await diagnoseAndroidLogoutLifecycle({
    vaultFile,
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    archive,
  });
  console.log(JSON.stringify(result, null, 2));
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
