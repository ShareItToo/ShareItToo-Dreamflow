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
  // The settings-row label is also the privacy screen's app-bar title. Its
  // presence alone cannot prove navigation occurred, so anchor this surface
  // check to the first unique privacy section. The lower data-export section
  // has its own current-page diagnostic so it can never be skipped because a
  // long scroll competes with the process execution boundary.
  Object.freeze({ entry: 'Datenschutz-Infos', markers: ['Öffentliche Informationen'] }),
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
  return inspectAccountEntryFromSettings({ commandRunner, adbPath, device, check, wait });
}

async function verifyAccountSettingsRoot({ commandRunner, adbPath, device, wait }) {
  return waitForMarkers({
    commandRunner,
    adbPath,
    device,
    markers: ['Kontoeinstellungen', 'PROFIL', 'SICHERHEIT'],
    wait,
    label: 'account settings root',
  });
}

async function inspectAccountEntryFromSettings({ commandRunner, adbPath, device, check, wait }) {
  await verifyAccountSettingsRoot({ commandRunner, adbPath, device, wait });
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

async function returnToAccountSettingsRoot({ commandRunner, adbPath, device, wait }) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '4',
  ]);
  await verifyAccountSettingsRoot({ commandRunner, adbPath, device, wait });
}

export function summarizeN28AccountSupportSettingsPreparation({
  candidate,
  deviceSummary,
  sourceDrift,
  capturedAt,
}) {
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-account-support-settings-preparation',
    status: 'prepared-read-only-account-settings-root',
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
      accountSettingsRootVisible: true,
      entryVerified: false,
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
    fail('N28 account/support preparation evidence contains private or credential-shaped material.');
  }
  return result;
}

export function summarizeN28PrivacyDataExportFromCurrent({
  candidate,
  deviceSummary,
  sourceDrift,
  scrollsUsed,
  capturedAt,
}) {
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  if (!Number.isInteger(scrollsUsed) || scrollsUsed < 0 || scrollsUsed > 4) {
    fail('The privacy data-export diagnostic has an invalid bounded scroll count.');
  }
  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-privacy-data-export-visibility-diagnostic',
    status: 'passed-read-only-privacy-data-export-visible',
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
      currentPrivacySurfaceVerified: true,
      dataExportSectionVisible: true,
      boundedReadOnlyScrollsUsed: scrollsUsed,
    },
    boundaries: {
      readOnly: true,
      privacyExportRequested: false,
      exportPasswordEntered: false,
      exportFileCreated: false,
      exportShared: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('N28 privacy data-export evidence contains private or credential-shaped material.');
  }
  return result;
}

export function summarizeN28HelpCenterPreparation({
  candidate,
  deviceSummary,
  sourceDrift,
  capturedAt,
}) {
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-help-center-preparation',
    status: 'prepared-read-only-help-center',
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
      helpCenterVisible: true,
      supportEntryVerified: false,
    },
    boundaries: {
      readOnly: true,
      supportSubmitted: false,
      supportCaseOpened: false,
      messageSent: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('N28 help-center preparation evidence contains private or credential-shaped material.');
  }
  return result;
}

export function summarizeN28HelpSupportFromCurrent({
  candidate,
  deviceSummary,
  sourceDrift,
  scrollsUsed,
  capturedAt,
}) {
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  if (!Number.isInteger(scrollsUsed) || scrollsUsed < 0 || scrollsUsed > 8) {
    fail('The help support diagnostic has an invalid bounded scroll count.');
  }
  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-help-support-visibility-diagnostic',
    status: 'passed-read-only-help-support-visible',
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
      currentHelpCenterVerified: true,
      supportEntryVisible: true,
      boundedReadOnlyScrollsUsed: scrollsUsed,
    },
    boundaries: {
      readOnly: true,
      supportSubmitted: false,
      supportCaseOpened: false,
      messageSent: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('N28 help support evidence contains private or credential-shaped material.');
  }
  return result;
}

export function summarizeN28AccountSupportSurfaces({
  candidate,
  deviceSummary,
  sourceDrift,
  surfaces,
  helpSupportEntryReachable,
  checks = accountChecks,
  accountSettingsRootRetained = false,
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
          ...(accountSettingsRootRetained === true
            ? { accountSettingsRootRetainedAfterEntryDiagnostic: true }
            : {}),
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
  prepareSettings = false,
  fromCurrentSettings = false,
  retainSettingsRoot = false,
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
  if (prepareSettings && (fromCurrentSettings || selectedChecks.length !== accountChecks.length)) {
    fail('Account settings preparation cannot include an entry diagnostic.');
  }
  if (fromCurrentSettings && selectedChecks.length !== 1) {
    fail('An existing account settings root can verify exactly one account entry.');
  }
  if (retainSettingsRoot && !fromCurrentSettings) {
    fail('Retaining an account settings root requires an existing root and exactly one entry.');
  }
  const complete = selectedChecks.length === accountChecks.length;
  const surfaces = {};
  let preparedSettingsRoot = false;
  let retainedSettingsRoot = false;
  try {
    if (prepareSettings) {
      await openProfileSearchResult({
        commandRunner,
        adbPath,
        device,
        query: 'Kontoeinstellungen',
        destinationMarkers: ['Kontoeinstellungen', 'PROFIL', 'SICHERHEIT'],
        wait,
      });
      preparedSettingsRoot = true;
      return summarizeN28AccountSupportSettingsPreparation({
        candidate,
        deviceSummary,
        sourceDrift,
        capturedAt,
      });
    }
    for (const check of selectedChecks) {
      surfaces[check.entry] = fromCurrentSettings
        ? await inspectAccountEntryFromSettings({ commandRunner, adbPath, device, check, wait })
        : await inspectAccountEntry({ commandRunner, adbPath, device, check, wait });
    }
    if (retainSettingsRoot) {
      await returnToAccountSettingsRoot({ commandRunner, adbPath, device, wait });
      retainedSettingsRoot = true;
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
      accountSettingsRootRetained: retainedSettingsRoot,
      capturedAt,
    });
  } finally {
    if ((!prepareSettings || !preparedSettingsRoot) && !retainedSettingsRoot) {
      restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
    }
  }
}

export async function diagnoseN28PrivacyDataExportFromCurrent({
  root,
  candidateDirectory,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
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

  try {
    await waitForMarkers({
      commandRunner,
      adbPath,
      device,
      markers: ['Öffentliche Informationen', 'Private Informationen'],
      wait,
      label: 'current privacy information surface',
      attempts: 4,
    });
    let scrollsUsed = 0;
    for (; scrollsUsed <= 4; scrollsUsed += 1) {
      const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      if (currentHeadAndroidNamedNodes(hierarchy, 'Datenexport').length > 0) {
        return summarizeN28PrivacyDataExportFromCurrent({
          candidate,
          deviceSummary,
          sourceDrift,
          scrollsUsed,
          capturedAt,
        });
      }
      if (scrollsUsed === 4) break;
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'input', 'swipe', '720', '2450', '720', '650', '600',
      ]);
      await wait(600);
    }
    fail('The read-only Datenexport section was not reachable within four verified privacy scrolls.');
  } finally {
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

export async function prepareN28HelpCenter({
  root,
  candidateDirectory,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const archive = await validatePrivateAndroidReleaseArchive({ root, candidateDirectory });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const paths = collectCurrentCandidateDriftPaths({ root, candidateCommit: candidate.commit });
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(paths);
  const device = selectSinglePhysicalDevice(parseAdbDevices(commandRunner(adbPath, ['devices', '-l'])));
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  let prepared = false;
  try {
    await openProfileSearchResult({
      commandRunner,
      adbPath,
      device,
      query: 'Hilfe-Center',
      destinationMarkers: ['Hilfe-Center', 'Finde schnell Antworten'],
      wait,
    });
    prepared = true;
    return summarizeN28HelpCenterPreparation({ candidate, deviceSummary, sourceDrift, capturedAt });
  } finally {
    if (!prepared) restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

export async function diagnoseN28HelpSupportFromCurrent({
  root,
  candidateDirectory,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const archive = await validatePrivateAndroidReleaseArchive({ root, candidateDirectory });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const paths = collectCurrentCandidateDriftPaths({ root, candidateCommit: candidate.commit });
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(paths);
  const device = selectSinglePhysicalDevice(parseAdbDevices(commandRunner(adbPath, ['devices', '-l'])));
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  try {
    await waitForMarkers({
      commandRunner,
      adbPath,
      device,
      markers: ['Hilfe-Center', 'Finde schnell Antworten'],
      wait,
      label: 'current help center surface',
      attempts: 4,
    });
    let scrollsUsed = 0;
    for (; scrollsUsed <= 8; scrollsUsed += 1) {
      const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      if (currentHeadAndroidNamedNodes(hierarchy, 'Support kontaktieren').length > 0) {
        return summarizeN28HelpSupportFromCurrent({
          candidate,
          deviceSummary,
          sourceDrift,
          scrollsUsed,
          capturedAt,
        });
      }
      if (scrollsUsed === 8) break;
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'input', 'swipe', '720', '2450', '720', '650', '600',
      ]);
      await wait(600);
    }
    fail('The read-only support entry was not reachable within eight verified help-center scrolls.');
  } finally {
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

export function parseN28AccountSupportSurfaceArguments(values) {
  let candidateDirectory = null;
  let adbPath = 'adb';
  let onlyEntry = null;
  let prepareSettings = false;
  let fromCurrentSettings = false;
  let retainSettingsRoot = false;
  let privacyDataExportFromCurrent = false;
  let prepareHelpCenter = false;
  let helpSupportFromCurrent = false;
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
    } else if (values[index] === '--prepare-settings') {
      prepareSettings = true;
    } else if (values[index] === '--from-current-settings') {
      fromCurrentSettings = true;
    } else if (values[index] === '--retain-settings-root') {
      retainSettingsRoot = true;
    } else if (values[index] === '--privacy-data-export-from-current') {
      privacyDataExportFromCurrent = true;
    } else if (values[index] === '--prepare-help-center') {
      prepareHelpCenter = true;
    } else if (values[index] === '--help-support-from-current') {
      helpSupportFromCurrent = true;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  if (prepareSettings && (fromCurrentSettings || onlyEntry !== null)) {
    fail('--prepare-settings cannot be combined with an account entry diagnostic.');
  }
  if (fromCurrentSettings && onlyEntry === null) {
    fail('--from-current-settings requires --only with one exact account entry.');
  }
  if (retainSettingsRoot && !fromCurrentSettings) {
    fail('--retain-settings-root requires --from-current-settings with one exact account entry.');
  }
  if (privacyDataExportFromCurrent && (prepareSettings || fromCurrentSettings || retainSettingsRoot || onlyEntry !== null)) {
    fail('--privacy-data-export-from-current cannot be combined with an account settings diagnostic.');
  }
  const specialModes = [
    prepareSettings,
    privacyDataExportFromCurrent,
    prepareHelpCenter,
    helpSupportFromCurrent,
  ].filter(Boolean).length;
  if (specialModes > 1 || ((prepareHelpCenter || helpSupportFromCurrent) && (fromCurrentSettings || retainSettingsRoot || onlyEntry !== null))) {
    fail('A help-center diagnostic cannot be combined with another account/support diagnostic mode.');
  }
  return {
    candidateDirectory: resolve(candidateDirectory), adbPath, onlyEntry, prepareSettings, fromCurrentSettings, retainSettingsRoot, privacyDataExportFromCurrent, prepareHelpCenter, helpSupportFromCurrent,
  };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseN28AccountSupportSurfaceArguments(process.argv.slice(2));
  const result = args.privacyDataExportFromCurrent
    ? await diagnoseN28PrivacyDataExportFromCurrent({ root, ...args })
    : args.prepareHelpCenter
      ? await prepareN28HelpCenter({ root, ...args })
      : args.helpSupportFromCurrent
        ? await diagnoseN28HelpSupportFromCurrent({ root, ...args })
        : await diagnoseN28CurrentCandidateAndroidAccountSupportSurfaces({
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
