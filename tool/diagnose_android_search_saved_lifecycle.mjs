#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  bindExactRole,
  containsAllLabels,
  openMainDestination,
  tapLabel,
  waitForHierarchy,
} from './diagnose_android_email_verified_two_role_product_journey.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  activateStagingEmailVerifiedJourneyFixture,
  prepareStagingEmailVerifiedTwoRoleJourney,
  readEmailVerifiedJourneyVault,
  retireStagingEmailVerifiedTwoRoleJourney,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const toolsCategory = 'Werkzeuge & Kleingeräte';

function fail(message) {
  throw new Error(message);
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 300
      || /(?:@|https?:\/\/|\/Users\/|\bn22-|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|fixture identifier)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

function pointForNode(node, label) {
  const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

export function tapPrivateNamedNode({
  commandRunner,
  adbPath,
  device,
  hierarchy,
  privateLabel,
  safeLabel,
}) {
  const nodes = currentHeadAndroidNamedNodes(hierarchy, privateLabel);
  if (nodes.length !== 1) fail(`The sanitized ${safeLabel} action is unavailable.`);
  const point = pointForNode(nodes[0], safeLabel);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

function normalizedLabelNodes(hierarchy, label) {
  const normalized = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
  const target = normalized(label);
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? []).filter((node) => (
    [
      currentHeadAndroidNodeAttribute(node, 'text'),
      currentHeadAndroidNodeAttribute(node, 'content-desc'),
    ].some((value) => normalized(value) === target)
  ));
}

export function normalizedAndroidLabelVisible(hierarchy, label) {
  return normalizedLabelNodes(hierarchy, label).length > 0;
}

export function exactSearchListingDetailVisible(hierarchy, title) {
  return normalizedAndroidLabelVisible(hierarchy, title)
    && containsAllLabels(hierarchy, ['Heilbronn, Deutschland', 'Verfügbarkeit prüfen']);
}

function tapNormalizedLabel(commandRunner, adbPath, device, hierarchy, label) {
  const nodes = normalizedLabelNodes(hierarchy, label);
  if (nodes.length !== 1) fail('The sanitized normalized-label action is unavailable.');
  const point = pointForNode(nodes[0], 'normalized-label');
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

function queryEditorNode(hierarchy) {
  const named = currentHeadAndroidNamedNodes(hierarchy, 'Was suchst du?')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText');
  if (named.length === 1) return named[0];
  const anchor = currentHeadAndroidNamedNodes(hierarchy, 'Was')
    .map((node) => ({ node, ...pointForNode(node, 'search-query anchor') }))[0]
    ?? fail('The sanitized search-query anchor is unavailable.');
  const editable = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .map((node) => ({ node, ...pointForNode(node, 'search-query editor') }))
    .filter((node) => Math.abs(node.y - anchor.y) <= 90);
  if (editable.length !== 1) fail('The sanitized search-query editor is unavailable.');
  return editable[0].node;
}

export function manualSearchFormVisible(hierarchy) {
  if (!containsAllLabels(
    hierarchy,
    ['Was', 'Kategorie', 'Alle Kategorien', 'Suchen'],
  )) {
    return false;
  }
  try {
    queryEditorNode(hierarchy);
    return true;
  } catch {
    return false;
  }
}

export function manualSearchQueryUnfocused(hierarchy) {
  try {
    return currentHeadAndroidNodeAttribute(queryEditorNode(hierarchy), 'focused') !== 'true';
  } catch {
    return false;
  }
}

async function settledSearchResults({
  commandRunner,
  adbPath,
  device,
  wait,
  title,
  expectedFavoriteLabel,
}) {
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 48,
    label: 'exact filtered search result',
    predicate: (hierarchy) => (
      containsAllLabels(hierarchy, ['Suchergebnisse', title, expectedFavoriteLabel])
        && currentHeadAndroidNamedNodes(hierarchy, `Anzeige öffnen: ${title}`).length === 1
        && !hierarchy.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(hierarchy, 'Suche nicht erreichbar').length === 0
    ),
  });
}

export async function openExactSearch({
  vaultFile,
  expectedSaved,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private search title is unavailable.');
  const runId = vault.runId;
  if (!/^[a-z0-9-]{10,80}$/u.test(runId)) {
    fail('The private search term is not safely input-compatible.');
  }
  await bindExactRole({
    vault,
    role: 'renter',
    commandRunner,
    adbPath,
    device,
    wait,
  });
  let hierarchy = await openMainDestination({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Entdecken',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'settled public catalog',
    predicate: (value) => (
      containsAllLabels(value, ['Entdecken', 'Jetzt suchen'])
        && !value.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(value, 'Anzeigen konnten nicht geladen werden.').length === 0
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Jetzt suchen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'manual search form',
    predicate: manualSearchFormVisible,
  });
  const queryNode = queryEditorNode(hierarchy);
  const queryPoint = pointForNode(queryNode, 'search-query editor');
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(queryPoint.x), String(queryPoint.y),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', runId,
  ]);
  await wait(350);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '4',
  ]);
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'search category selector',
    predicate: (value) => containsAllLabels(value, ['Alle Kategorien', 'Suchen']),
  });
  // Android Back can hide the keyboard while retaining TextField focus. Tap
  // the static category label first so the suggestion overlay is removed by
  // the app's focus listener before the picker action is attempted.
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Kategorie');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'unfocused search query',
    predicate: (value) => (
      manualSearchFormVisible(value) && manualSearchQueryUnfocused(value)
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Alle Kategorien');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'search category choice',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, 'Alle Kategorien').length > 0
        && normalizedAndroidLabelVisible(value, toolsCategory)
    ),
  });
  tapNormalizedLabel(commandRunner, adbPath, device, hierarchy, toolsCategory);
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'filtered search form',
    predicate: (value) => containsAllLabels(value, [toolsCategory, 'Suchen']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Suchen');
  const favoriteLabel = expectedSaved
    ? `Aus Gemerkt entfernen: ${title}`
    : `Unter Gemerkt speichern: ${title}`;
  hierarchy = await settledSearchResults({
    commandRunner,
    adbPath,
    device,
    wait,
    title,
    expectedFavoriteLabel: favoriteLabel,
  });
  return { hierarchy, title, favoriteLabel };
}

async function searchOpenAndSaveOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let { hierarchy, title, favoriteLabel } = await openExactSearch({
    vaultFile,
    expectedSaved: false,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapPrivateNamedNode({
    commandRunner,
    adbPath,
    device,
    hierarchy,
    privateLabel: `Anzeige öffnen: ${title}`,
    safeLabel: 'exact search-result open',
  });
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'exact listing detail',
    predicate: (value) => exactSearchListingDetailVisible(value, title),
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
  hierarchy = await settledSearchResults({
    commandRunner,
    adbPath,
    device,
    wait,
    title,
    expectedFavoriteLabel: favoriteLabel,
  });
  tapPrivateNamedNode({
    commandRunner,
    adbPath,
    device,
    hierarchy,
    privateLabel: favoriteLabel,
    safeLabel: 'exact save action',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'wishlist selection',
    predicate: (value) => containsAllLabels(
      value,
      ['In welcher Merkliste speichern?', 'Für später'],
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Für später');
  await settledSearchResults({
    commandRunner,
    adbPath,
    device,
    wait,
    title,
    expectedFavoriteLabel: `Aus Gemerkt entfernen: ${title}`,
  });
  return Object.freeze({
    status: 'pixel-renter-search-filter-open-save-passed',
    exactRenterPrincipal: true,
    exactUniqueQuery: true,
    exactCoarseCategoryFilter: true,
    exactListingDetailOpened: true,
    savedToBuiltInLaterList: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function openLaterFolder({
  vault,
  role,
  bind,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  if (bind) {
    await bindExactRole({ vault, role, commandRunner, adbPath, device, wait });
  } else {
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
    const profile = await openMainDestination({
      commandRunner, adbPath, device, wait, label: 'Mein SIT',
    });
    const account = vault.accounts.find((entry) => entry.role === role)
      ?? fail('The exact saved-state principal is unavailable.');
    const other = vault.accounts.find((entry) => entry.role !== role)
      ?? fail('The opposite saved-state principal is unavailable.');
    if (currentHeadAndroidNamedNodes(profile, account.displayName).length !== 1
        || currentHeadAndroidNamedNodes(profile, other.displayName).length !== 0) {
      fail('The preserved Pixel session does not match the exact expected principal.');
    }
  }
  let hierarchy = await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Mietkorb',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'settled saved-items surface',
    predicate: (value) => (
      containsAllLabels(value, ['Mietkorb', 'Gemerkt', 'Für später'])
        && !value.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(
          value,
          'Gespeicherte Daten konnten nicht geladen werden',
        ).length === 0
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Für später');
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'settled later wishlist',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, 'Für später').length > 0
        && !value.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(value, 'Merkliste konnte nicht geladen werden').length === 0
    ),
  });
}

async function verifyLaterFolderTruth({
  vaultFile,
  role,
  present,
  bind,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private saved-state title is unavailable.');
  let hierarchy = await openLaterFolder({
    vault, role, bind, commandRunner, adbPath, device, wait,
  });
  let stable = 0;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    await wait(350);
    hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (hierarchy.includes('class="android.widget.ProgressBar"')
        || currentHeadAndroidNamedNodes(hierarchy, 'Merkliste konnte nicht geladen werden').length > 0) {
      stable = 0;
      continue;
    }
    const found = currentHeadAndroidNamedNodes(hierarchy, title).length > 0;
    if (found === present) {
      stable += 1;
      if (stable >= 3) {
        return Object.freeze({
          status: present
            ? `pixel-${role}-saved-item-present-stably`
            : `pixel-${role}-saved-item-absent-stably`,
          exactPrincipal: true,
          stableSettledObservations: 3,
          containsAccountIdentity: false,
          containsFixtureIdentifier: false,
        });
      }
    } else {
      stable = 0;
    }
  }
  fail(`The exact ${role} saved-item truth did not settle safely.`);
}

async function removeSavedOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let { hierarchy, title, favoriteLabel } = await openExactSearch({
    vaultFile,
    expectedSaved: true,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapPrivateNamedNode({
    commandRunner,
    adbPath,
    device,
    hierarchy,
    privateLabel: favoriteLabel,
    safeLabel: 'exact saved-item management action',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'saved-item management',
    predicate: (value) => containsAllLabels(value, ['Gemerkt', 'Aus Gemerkt entfernen']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Aus Gemerkt entfernen');
  await settledSearchResults({
    commandRunner,
    adbPath,
    device,
    wait,
    title,
    expectedFavoriteLabel: `Unter Gemerkt speichern: ${title}`,
  });
  return Object.freeze({
    status: 'pixel-renter-exact-saved-item-removed',
    exactRenterPrincipal: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

export async function runAndroidSearchSavedLifecycle({
  candidate,
  deviceSummary,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  const required = [
    'prepare',
    'activate',
    'searchOpenAndSave',
    'verifyRestartPersistence',
    'verifyOtherPrincipalIsolation',
    'verifyRenterRestored',
    'removeSaved',
    'verifyRemoved',
    'retire',
    'restoreOwner',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The Pixel search-and-saved lifecycle operations are incomplete.');
  }
  let prepared = null;
  let primaryFailure = null;
  let cleanupFailure = null;
  let retirement = null;
  let restored = false;
  let closed = false;
  const stage = async (name, operation) => {
    try {
      return await operation();
    } catch (error) {
      fail(`Stage ${name} failed: ${sanitizedFailure(error)}`);
    }
  };
  try {
    prepared = await stage('prepare', () => operations.prepare());
    const activated = await stage('activate', () => operations.activate(prepared));
    const saved = await stage(
      'search-open-save',
      () => operations.searchOpenAndSave(prepared),
    );
    const persisted = await stage(
      'restart-persistence',
      () => operations.verifyRestartPersistence(prepared),
    );
    const isolated = await stage(
      'other-principal-isolation',
      () => operations.verifyOtherPrincipalIsolation(prepared),
    );
    const restoredRenter = await stage(
      'renter-restored',
      () => operations.verifyRenterRestored(prepared),
    );
    const removed = await stage('remove', () => operations.removeSaved(prepared));
    const absent = await stage('verify-removed', () => operations.verifyRemoved(prepared));
    if (activated?.status !== 'isolated-product-journey-fixture-active'
        || saved?.status !== 'pixel-renter-search-filter-open-save-passed'
        || persisted?.status !== 'pixel-renter-saved-item-present-stably'
        || isolated?.status !== 'pixel-owner-saved-item-absent-stably'
        || restoredRenter?.status !== 'pixel-renter-saved-item-present-stably'
        || removed?.status !== 'pixel-renter-exact-saved-item-removed'
        || absent?.status !== 'pixel-renter-saved-item-absent-stably') {
      fail('The Pixel search-and-saved lifecycle did not close exactly.');
    }
    closed = true;
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (prepared !== null) {
      try {
        retirement = await operations.retire(prepared);
      } catch (error) {
        cleanupFailure = error;
      }
    }
    try {
      restored = await operations.restoreOwner() === true;
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (primaryFailure !== null) {
    if (cleanupFailure !== null) {
      fail(`${sanitizedFailure(primaryFailure)} Cleanup also failed safely: ${sanitizedFailure(cleanupFailure)}.`);
    }
    throw primaryFailure;
  }
  if (cleanupFailure !== null) throw cleanupFailure;
  if (!closed
      || retirement?.status !== 'email-verified-two-role-product-journey-retired'
      || restored !== true) {
    fail('The Pixel search-and-saved lifecycle cleanup did not close exactly.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-search-saved-lifecycle',
    status: 'passed-pixel-search-saved-lifecycle',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      apkSha256: candidate.android?.apkSha256 ?? candidate.apkSha256,
    },
    device: deviceSummary,
    tests: {
      exactUniqueSearch: 'passed',
      exactCoarseCategoryFilter: 'passed',
      exactListingDetailOpen: 'passed',
      builtInLaterWishlistSave: 'passed',
      processRestartPersistence: 'passed-three-stable-settled-observations',
      accountIsolation: 'passed-other-principal-three-stable-settled-observations',
      renterRestorePersistence: 'passed-three-stable-settled-observations',
      exactRelatedSavedAssignmentRemoved: 'passed',
      removedStateStable: 'passed-three-stable-settled-observations',
      cleanup: 'passed-listing-ended-publicly-hidden',
      protectedOwnerSessionRestored: true,
    },
    boundaries: {
      physicalPixelOnly: true,
      onePlusContacted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      monetaryEffectMinor: 0,
      bookingCreated: false,
      contractCreated: false,
      reservationCreated: false,
      listingLeftActive: false,
      unrelatedSavedItemsChanged: false,
      productionChanged: false,
      googlePlayChanged: false,
      publicRegistrationChanged: false,
      realMoneyUsed: false,
      containsAccountIdentity: false,
      containsSecrets: false,
      containsTokens: false,
      containsFixtureIdentifiers: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceVaultFile = resolve(
    argumentValue(args, '--source-vault-file') ?? fail('--source-vault-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('--candidate-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const candidate = await validatePrivateAndroidReleaseArchive({ candidateDirectory });
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  const operations = {
    prepare: () => prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile }),
    activate: ({ vaultFile }) => activateStagingEmailVerifiedJourneyFixture({ vaultFile }),
    searchOpenAndSave: ({ vaultFile }) => searchOpenAndSaveOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    verifyRestartPersistence: ({ vaultFile }) => verifyLaterFolderTruth({
      vaultFile,
      role: 'renter',
      present: true,
      bind: false,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyOtherPrincipalIsolation: ({ vaultFile }) => verifyLaterFolderTruth({
      vaultFile,
      role: 'owner',
      present: false,
      bind: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyRenterRestored: ({ vaultFile }) => verifyLaterFolderTruth({
      vaultFile,
      role: 'renter',
      present: true,
      bind: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    removeSaved: ({ vaultFile }) => removeSavedOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    verifyRemoved: ({ vaultFile }) => verifyLaterFolderTruth({
      vaultFile,
      role: 'renter',
      present: false,
      bind: false,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    retire: ({ vaultFile }) => retireStagingEmailVerifiedTwoRoleJourney({ vaultFile }),
    restoreOwner: async () => {
      const source = readEmailVerifiedJourneyVault(sourceVaultFile).vault;
      const bound = await bindExactRole({
        vault: source,
        role: 'owner',
        commandRunner,
        adbPath,
        device,
        wait,
      });
      return currentHeadAndroidNamedNodes(bound.hierarchy, bound.account.displayName).length === 1
        && currentHeadAndroidNamedNodes(bound.hierarchy, bound.other.displayName).length === 0;
    },
  };
  const evidence = await runAndroidSearchSavedLifecycle({
    candidate,
    deviceSummary,
    operations,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
