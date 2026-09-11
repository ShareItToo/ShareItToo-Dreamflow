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
const remoteUiDump = '/sdcard/sit-offline-realtime.xml';
const offlineMessage = 'Kontrollierte SIT Staging-Pushprüfung (offline).';
const offlineNetworkSampleIntervalMs = 500;
const offlineNetworkStableWindowMs = 5_000;
const offlineNetworkStableSamples = Math.ceil(
  offlineNetworkStableWindowMs / offlineNetworkSampleIntervalMs,
);
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
    fail('ADB offline/realtime command failed without exposing the device identifier.');
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
      // A later run safely overwrites the fixed hierarchy path.
    }
  }
}

function startChatLink(commandRunner, adbPath, device, threadId) {
  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const result = adb(commandRunner, adbPath, device, [
    'shell', 'am', 'start', '-W',
    '-a', 'android.intent.action.VIEW',
    '-c', 'android.intent.category.BROWSABLE',
    '-p', applicationId,
    '-d', `shareittoo://chat/${encodeURIComponent(threadId)}`,
  ]);
  if (!/Status:\s*ok/.test(result) || !result.includes(applicationId)) {
    fail('Android did not route the expected authenticated chat link to ShareItToo.');
  }
}

async function waitFor(predicate, { attempts, intervalMs, wait }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await wait(intervalMs);
  }
  return false;
}

function processId(commandRunner, adbPath, device) {
  return adb(commandRunner, adbPath, device, ['shell', 'pidof', applicationId]);
}

function wifiEnabled(commandRunner, adbPath, device) {
  return /^Wifi is enabled\b/m.test(adb(commandRunner, adbPath, device, ['shell', 'cmd', 'wifi', 'status']));
}

function wifiConnected(commandRunner, adbPath, device) {
  return /^Wifi is connected to /m.test(adb(commandRunner, adbPath, device, ['shell', 'cmd', 'wifi', 'status']));
}

function mobileDataEnabled(commandRunner, adbPath, device) {
  return adb(commandRunner, adbPath, device, ['shell', 'settings', 'get', 'global', 'mobile_data']) === '1';
}

export function telephonyDataDisconnected(registry) {
  const states = [...String(registry).matchAll(/mDataConnectionState=(-?\d+)/g)]
    .map((match) => Number(match[1]));
  return states.length > 0 && states.every((state) => state !== 2);
}

export function activeDefaultNetworkAbsent(connectivity) {
  const value = /^Active default network:\s*(.*)$/m.exec(String(connectivity))?.[1]?.trim();
  return value === 'none';
}

export function visibleMessageOccurrenceCount(hierarchy, message) {
  if (typeof hierarchy !== 'string' || typeof message !== 'string' || message === '') return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const next = hierarchy.indexOf(message, cursor);
    if (next < 0) return count;
    count += 1;
    cursor = next + message.length;
  }
}

function mobileDataDisconnected(commandRunner, adbPath, device) {
  const registry = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'telephony.registry']);
  return telephonyDataDisconnected(registry);
}

function defaultNetworkAbsent(commandRunner, adbPath, device) {
  const connectivity = adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'connectivity'],
  );
  return activeDefaultNetworkAbsent(connectivity);
}

function setNetwork(commandRunner, adbPath, device, { wifi, mobileData }) {
  adb(commandRunner, adbPath, device, ['shell', 'svc', 'wifi', wifi ? 'enable' : 'disable']);
  adb(commandRunner, adbPath, device, ['shell', 'svc', 'data', mobileData ? 'enable' : 'disable']);
}

function appForeground(commandRunner, adbPath, device) {
  const activities = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'activity', 'activities']);
  return /topResumedActivity=.*com\.shareittoo\.app\/.MainActivity/.test(activities);
}

export function isExpectedForegroundPushPopup(hierarchy) {
  return typeof hierarchy === 'string'
    && hierarchy.includes('Benachrichtigung:')
    && hierarchy.includes('content-desc="Öffnen"')
    && hierarchy.includes(v52ForegroundPushTitle)
    && hierarchy.includes(v52ForegroundPushBody);
}

function dismissExpectedForegroundPushPopup(
  commandRunner,
  adbPath,
  device,
  hierarchy,
) {
  if (!isExpectedForegroundPushPopup(hierarchy)) return false;
  if (!appForeground(commandRunner, adbPath, device)) return false;
  adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
  return true;
}

function packageCrashEntries(commandRunner, adbPath, device, pid) {
  const log = adb(commandRunner, adbPath, device, ['logcat', '-d', '--pid', pid, '-v', 'brief', '*:E']);
  return log.split(/\r?\n/).filter((line) => /FATAL EXCEPTION|Fatal signal/.test(line)).length;
}

export function selectOfflineRealtimeFixture(vault) {
  const bindingFixture = vault?.syntheticBooking;
  const nonBindingFixture = vault?.nonBindingSimulation;
  if (bindingFixture?.workflowStatus === 'accepted'
      && bindingFixture.paymentMode === 'memory'
      && bindingFixture.stripeLivemode === false
      && bindingFixture.paymentEndpointCalled === false) {
    return Object.freeze({ ...bindingFixture, nonBinding: false });
  }
  if (nonBindingFixture?.status === 'accepted-chat-ready'
      && nonBindingFixture.availabilityUnaffected === true
      && nonBindingFixture.paymentReadRejected === true
      && nonBindingFixture.stripeLivemode === false
      && nonBindingFixture.paymentEndpointCalled === false
      && typeof vault?.realTwoRoleJourney?.title === 'string'
      && vault.realTwoRoleJourney.title.trim() !== '') {
    return Object.freeze({
      ...nonBindingFixture,
      workflowStatus: 'accepted',
      paymentMode: 'memory',
      title: vault.realTwoRoleJourney.title,
      nonBinding: true,
    });
  }
  return null;
}

export async function diagnoseAndroidOfflineRealtime({
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
  const fixture = selectOfflineRealtimeFixture(vault);
  if (!fixture) {
    fail('The private synthetic booking is not safe for the offline/realtime diagnostic.');
  }
  const threadId = nonEmptyString(fixture.threadId, 'syntheticBooking.threadId');
  const signedInRole = nonEmptyString(vault.accounts?.[0]?.role, 'accounts[0].role');
  const senderRole = signedInRole === 'owner' ? 'renter' : 'owner';

  const originalNetwork = {
    wifi: wifiEnabled(commandRunner, adbPath, device),
    mobileData: mobileDataEnabled(commandRunner, adbPath, device),
  };
  let networkRestored = false;
  let phase = 'open-authenticated-chat';
  let foregroundPushPopupAbsentBeforeSend = false;
  let offlineMessageBaselineCount = 0;
  let offlineMessageRecoveredCount = 0;
  try {
    startChatLink(commandRunner, adbPath, device, threadId);
    const chatPreloaded = await waitFor(() => {
      const hierarchy = dumpUi(commandRunner, adbPath, device);
      const expectedChatVisible = hierarchy.includes(
        nonEmptyString(fixture.title, 'syntheticBooking.title'),
      )
        && hierarchy.includes('Nachricht…')
        && !hierarchy.includes('Bitte zuerst anmelden');
      if (expectedChatVisible && !isExpectedForegroundPushPopup(hierarchy)) {
        foregroundPushPopupAbsentBeforeSend = true;
        offlineMessageBaselineCount = visibleMessageOccurrenceCount(
          hierarchy,
          offlineMessage,
        );
        return true;
      }
      return false;
    }, { attempts: 16, intervalMs: 700, wait });
    if (!chatPreloaded) fail('The authenticated chat did not preload before the offline window.');

    phase = 'capture-process-before-offline';
    const pidBefore = nonEmptyString(processId(commandRunner, adbPath, device), 'app process');
    phase = 'disable-device-network';
    setNetwork(commandRunner, adbPath, device, { wifi: false, mobileData: false });
    phase = 'confirm-device-network-off';
    let consecutiveOfflineSamples = 0;
    const offlineState = await waitFor(
      () => {
        const confirmed = !wifiEnabled(commandRunner, adbPath, device)
          && mobileDataDisconnected(commandRunner, adbPath, device)
          && defaultNetworkAbsent(commandRunner, adbPath, device);
        consecutiveOfflineSamples = confirmed ? consecutiveOfflineSamples + 1 : 0;
        return consecutiveOfflineSamples >= offlineNetworkStableSamples;
      },
      {
        attempts: offlineNetworkStableSamples + 20,
        intervalMs: offlineNetworkSampleIntervalMs,
        wait,
      },
    );
    if (!offlineState) {
      fail('The bounded device network-off state did not remain continuously stable.');
    }

    phase = 'send-controlled-offline-message';
    const sent = await sender({ vaultFile, senderRole, diagnosticKind: 'offline' });
    if (sent?.status !== 'synthetic-booking-diagnostic-message-sent'
        || sent?.paymentEndpointCalled !== false || sent?.stripeLivemode !== false) {
      fail('The controlled Staging offline message was not accepted safely.');
    }
    phase = 'observe-offline-message-absence';
    await wait(15_000);
    if (visibleMessageOccurrenceCount(
      dumpUi(commandRunner, adbPath, device),
      offlineMessage,
    ) > offlineMessageBaselineCount) {
      fail('The new message appeared before network restoration.');
    }

    phase = 'restore-device-network';
    setNetwork(commandRunner, adbPath, device, originalNetwork);
    phase = 'confirm-device-network-restored';
    const transportRestored = await waitFor(
      () => (!originalNetwork.wifi || wifiConnected(commandRunner, adbPath, device))
        && mobileDataEnabled(commandRunner, adbPath, device) === originalNetwork.mobileData,
      { attempts: 45, intervalMs: 700, wait },
    );
    if (!transportRestored) fail('The original Android network state did not return.');
    networkRestored = true;

    phase = 'observe-realtime-recovery';
    let foregroundPushPopupsDismissed = 0;
    const recoveredInChat = await waitFor(
      () => {
        const hierarchy = dumpUi(commandRunner, adbPath, device);
        const currentCount = visibleMessageOccurrenceCount(hierarchy, offlineMessage);
        if (currentCount > offlineMessageBaselineCount) {
          offlineMessageRecoveredCount = currentCount;
          return true;
        }
        if (dismissExpectedForegroundPushPopup(
          commandRunner,
          adbPath,
          device,
          hierarchy,
        )) {
          foregroundPushPopupsDismissed += 1;
        }
        return false;
      },
      { attempts: 45, intervalMs: 700, wait },
    );
    if (!recoveredInChat) fail('The controlled message did not appear after realtime recovery.');
    phase = 'verify-process-survival';
    const pidAfter = nonEmptyString(processId(commandRunner, adbPath, device), 'recovered app process');
    const processIdentityStable = pidAfter === pidBefore;
    if (!processIdentityStable || !appForeground(commandRunner, adbPath, device)) {
      fail('The app process or foreground chat did not survive the offline/realtime recovery.');
    }
    phase = 'verify-crash-buffer';
    const crashEntries = packageCrashEntries(commandRunner, adbPath, device, pidAfter);
    if (crashEntries !== 0) fail('A package fatal entry was observed during the offline/realtime recovery.');

    return {
      schemaVersion: 1,
      kind: 'android-offline-realtime-diagnostic',
      status: 'passed-bounded-offline-realtime-diagnostic',
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
        authenticatedChatPreloaded: { status: 'passed', result: 'chat-visible-before-offline-window' },
        messageHiddenWhileOffline: { status: 'passed', result: 'new-message-absent-during-15-second-offline-window' },
        sameProcessRealtimeRecovery: { status: 'passed', result: 'new-message-visible-after-network-restoration' },
        originalNetworkRestored: { status: 'passed', result: 'wifi-and-mobile-data-restored-to-original-state' },
      },
      diagnostic: {
        offlineWindowSeconds: 15,
        offlineNetworkStableWindowSeconds: offlineNetworkStableWindowMs / 1_000,
        offlineNetworkStableSamples,
        appProcessSurvived: true,
        processIdentityStable: true,
        appForegroundAfterRecovery: true,
        packageCrashBufferEntries: 0,
        networkRestored: true,
        foregroundPushPopupsDismissed,
        foregroundPushPopupAbsentBeforeSend,
        visibleOfflineMessageBaselineCount: offlineMessageBaselineCount,
        visibleOfflineMessageRecoveredCount: offlineMessageRecoveredCount,
      },
      boundaries: {
        syntheticAccountsOnly: true,
        directDiagnosticOnly: installed.delivery === 'direct-apk',
        storeInstallationGateSatisfied: installed.delivery === 'google-play-split',
        fullDeviceMatrixPassed: false,
        wifiOnlyDiagnostic: true,
        hotspotPassed: false,
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
    };
  } catch (error) {
    if (error instanceof Error
        && error.message === 'ADB logout-lifecycle command failed without exposing the device identifier.') {
      fail(`The offline/realtime device command failed safely during ${phase}.`);
    }
    throw error;
  } finally {
    if (!networkRestored) {
      try {
        setNetwork(commandRunner, adbPath, device, originalNetwork);
      } catch {
        // The caller receives the original diagnostic failure. A separate
        // read-only network check must follow if restoration itself failed.
      }
    }
  }
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
  const evidence = await diagnoseAndroidOfflineRealtime({
    vaultFile,
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
