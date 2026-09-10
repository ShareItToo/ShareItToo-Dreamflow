#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  restoreCurrentHeadAndroidExplore,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';

const accountChecks = Object.freeze([
  Object.freeze({ entry: 'Profilinformationen', markers: ['Profilinformationen', 'Profilbild'] }),
  Object.freeze({ entry: 'Kontaktinformationen', markers: ['Kontaktinformationen', 'Telefonnummer'] }),
  Object.freeze({ entry: 'Passwort ändern', markers: ['Sicherheit', 'Passwort'] }),
  Object.freeze({
    entry: 'Zahlungsmethoden',
    markers: ['Zahlungsmethoden', 'Noch nicht freigeschaltet'],
    providerHold: true,
  }),
  Object.freeze({
    entry: 'Auszahlungsmethoden',
    markers: ['Auszahlungskonto', 'Auszahlungen noch nicht freigeschaltet'],
    providerHold: true,
  }),
  Object.freeze({ entry: 'Rechnungen & Belege', markers: ['Rechnungen & Belege'] }),
  Object.freeze({
    entry: 'Benachrichtigungen',
    markers: ['Benachrichtigungseinstellungen', 'Gerätedienste'],
  }),
  Object.freeze({ entry: 'Blockierte Nutzer', markers: ['Blockierte Nutzer'] }),
  Object.freeze({ entry: 'Datenschutz-Infos', markers: ['Datenschutz-Infos', 'Datenexport'] }),
]);
const accountCheckByEntry = new Map(accountChecks.map((check) => [check.entry, check]));

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N28 value.`);
}

function center(node, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

function tapNamed(commandRunner, adbPath, device, hierarchy, label) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const nodes = clickable.length > 0 ? clickable : enabled;
  if (nodes.length !== 1) fail(`The sanitized ${label} action is missing or ambiguous.`);
  const point = center(nodes[0], label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

async function waitForMarkers({
  commandRunner,
  adbPath,
  device,
  markers,
  wait,
  label,
  attempts = 30,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (markers.every((marker) => currentHeadAndroidNamedNodes(hierarchy, marker).length > 0)) {
      return hierarchy;
    }
  }
  fail(`The read-only ${label} surface did not appear.`);
}

async function findByScrolling({
  commandRunner,
  adbPath,
  device,
  label,
  wait,
  requireUnique = true,
}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const count = currentHeadAndroidNamedNodes(hierarchy, label).length;
    if ((requireUnique && count === 1) || (!requireUnique && count >= 1)) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '750', '450',
    ]);
    await wait(450);
  }
  fail(`The read-only ${label} entry was not reachable.`);
}

async function openProfileSearchResult({
  commandRunner,
  adbPath,
  device,
  query,
  destinationMarkers,
  wait,
}) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner, adbPath, device, wait,
  });
  tapNamed(commandRunner, adbPath, device, main, 'Mein SIT');
  const profile = await waitForMarkers({
    commandRunner,
    adbPath,
    device,
    markers: ['Meine Anzeigen', 'Mietanfragen', 'Abmelden', 'Suchen'],
    wait,
    label: 'authenticated profile',
  });
  tapNamed(commandRunner, adbPath, device, profile, 'Suchen');
  await waitForMarkers({
    commandRunner,
    adbPath,
    device,
    markers: ['Suche schließen'],
    wait,
    label: 'profile search',
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', query,
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '66',
  ]);
  return waitForMarkers({
    commandRunner,
    adbPath,
    device,
    markers: destinationMarkers,
    wait,
    label: query,
  });
}

async function inspectAccountEntry({ commandRunner, adbPath, device, check, wait }) {
  await openProfileSearchResult({
    commandRunner,
    adbPath,
    device,
    query: 'Kontoeinstellungen',
    destinationMarkers: ['Kontoeinstellungen', 'PROFIL', 'SICHERHEIT'],
    wait,
  });
  const hierarchy = await findByScrolling({
    commandRunner, adbPath, device, label: check.entry, wait,
  });
  tapNamed(commandRunner, adbPath, device, hierarchy, check.entry);
  await waitForMarkers({
    commandRunner,
    adbPath,
    device,
    markers: [check.markers[0]],
    wait,
    label: check.entry,
    attempts: 40,
  });
  for (const marker of check.markers.slice(1)) {
    await findByScrolling({
      commandRunner, adbPath, device, label: marker, wait, requireUnique: false,
    });
  }
  return Object.freeze({
    status: 'passed',
    result: check.providerHold === true
      ? 'read-only-staging-provider-hold-visible'
      : 'authenticated-read-only-surface-reachable',
  });
}

export function summarizeN28AccountSupportSurfaces({
  candidate,
  deviceSummary,
  sourceDrift,
  surfaces,
  helpSupportEntryReachable,
  checks = accountChecks,
  capturedAt,
}) {
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  if (!Array.isArray(checks)
      || checks.length === 0
      || checks.some((check) => !accountCheckByEntry.has(check?.entry))
      || new Set(checks.map((check) => check.entry)).size !== checks.length) {
    fail('The requested account/support diagnostic scope is invalid.');
  }
  const selectedChecks = checks.map((check) => accountCheckByEntry.get(check.entry));
  const complete = selectedChecks.length === accountChecks.length;
  const expectedEntries = selectedChecks.map((check) => check.entry);
  same(Object.keys(surfaces ?? {}).length, expectedEntries.length, 'account surface count');
  for (const entry of expectedEntries) {
    same(surfaces?.[entry]?.status, 'passed', `${entry} surface status`);
  }
  for (const check of selectedChecks.filter((entry) => entry.providerHold === true)) {
    same(
      surfaces?.[check.entry]?.result,
      'read-only-staging-provider-hold-visible',
      `${check.entry} provider hold`,
    );
  }
  if (complete) same(helpSupportEntryReachable, true, 'help and support entry');

  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-account-support-surface-diagnostic',
    status: complete
      ? 'passed-account-support-read-only-provider-holds-confirmed'
      : 'passed-account-support-read-only-surface-subset',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      apkSha256: candidate.android.apkSha256,
      mobileSourceChangedAfterCandidate: sourceDrift.mobileSourceChanged,
    },
    device: deviceSummary,
    tests: {
      accountSurfaceCount: expectedEntries.length,
      surfaces,
      ...(complete
        ? {
          helpCenterReachable: true,
          supportEntryReachableWithoutSubmission: true,
          paymentProviderHoldVisible: true,
          payoutProviderHoldVisible: true,
        }
        : {
          completeAccountSupportMatrixPassed: false,
          accountEntriesTested: expectedEntries,
        }),
    },
    boundaries: {
      readOnly: true,
      supportSubmitted: false,
      notificationPreferenceChanged: false,
      deviceServiceChanged: false,
      profileChanged: false,
      contactDataChanged: false,
      passwordChanged: false,
      accountDeleted: false,
      userUnblocked: false,
      privacyExportRequested: false,
      paymentEndpointCalled: false,
      payoutOnboardingOpened: false,
      invoiceDownloaded: false,
      phoneVerificationRequested: false,
      messageSent: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('N28 account/support evidence contains private or credential-shaped material.');
  }
  return result;
}

export async function diagnoseN28CurrentCandidateAndroidAccountSupportSurfaces({
  root,
  candidateDirectory,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  checks = accountChecks,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const archive = await validatePrivateAndroidReleaseArchive({ root, candidateDirectory });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const paths = collectCurrentCandidateDriftPaths({
    root,
    candidateCommit: candidate.commit,
  });
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(paths);
  const device = selectSinglePhysicalDevice(parseAdbDevices(
    commandRunner(adbPath, ['devices', '-l']),
  ));
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);

  if (!Array.isArray(checks)
      || checks.length === 0
      || checks.some((check) => !accountCheckByEntry.has(check?.entry))
      || new Set(checks.map((check) => check.entry)).size !== checks.length) {
    fail('The requested account/support diagnostic scope is invalid.');
  }
  const selectedChecks = checks.map((check) => accountCheckByEntry.get(check.entry));
  const complete = selectedChecks.length === accountChecks.length;
  const surfaces = {};
  try {
    for (const check of selectedChecks) {
      surfaces[check.entry] = await inspectAccountEntry({
        commandRunner, adbPath, device, check, wait,
      });
    }
    if (complete) {
      await openProfileSearchResult({
        commandRunner,
        adbPath,
        device,
        query: 'Hilfe-Center',
        destinationMarkers: ['Hilfe-Center'],
        wait,
      });
      await findByScrolling({
        commandRunner,
        adbPath,
        device,
        label: 'Support kontaktieren',
        wait,
        requireUnique: false,
      });
    }
    return summarizeN28AccountSupportSurfaces({
      candidate,
      deviceSummary,
      sourceDrift,
      surfaces,
      helpSupportEntryReachable: complete,
      checks: selectedChecks,
      capturedAt,
    });
  } finally {
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

function parseArguments(values) {
  let candidateDirectory = null;
  let adbPath = 'adb';
  let onlyEntry = null;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--only') {
      onlyEntry = values[index + 1] ?? fail('--only requires one exact account entry.');
      if (!accountCheckByEntry.has(onlyEntry)) {
        fail('--only must name one supported account entry.');
      }
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  return { candidateDirectory: resolve(candidateDirectory), adbPath, onlyEntry };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const result = await diagnoseN28CurrentCandidateAndroidAccountSupportSurfaces({
    root,
    ...args,
    ...(args.onlyEntry === null ? {} : { checks: [accountCheckByEntry.get(args.onlyEntry)] }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N28 account/support diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
