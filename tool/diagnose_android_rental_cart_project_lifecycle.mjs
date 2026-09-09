#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  bindExactRole,
  containsAllLabels,
  openMainDestination,
  tapClosestToLabel,
  tapLabel,
  waitForHierarchy,
} from './diagnose_android_email_verified_two_role_product_journey.mjs';
import {
  exactSearchListingDetailVisible,
  normalizedAndroidLabelVisible,
  openExactSearch,
  tapPrivateNamedNode,
} from './diagnose_android_search_saved_lifecycle.mjs';
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
  cleanupStagingEmailVerifiedRentalCartLifecycle,
  inspectStagingEmailVerifiedRentalCartLifecycle,
  prepareStagingEmailVerifiedRentalCartLifecycle,
  prepareStagingEmailVerifiedTwoRoleJourney,
  readEmailVerifiedJourneyVault,
  retireStagingEmailVerifiedTwoRoleJourney,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

function fail(message) {
  throw new Error(message);
}

export const selectedIntentRemoteSettle = Object.freeze({
  attempts: 40,
  intervalMs: 650,
});

// AppPopup.toast is intentionally visible for only two seconds. Start the
// first UIAutomator snapshot promptly so a cold hierarchy dump cannot consume
// the complete acknowledgement window before the assertion observes it.
export const cartAcknowledgementProbe = Object.freeze({
  attempts: 24,
  intervalMs: 75,
});

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

function tapNode(commandRunner, adbPath, device, node, label) {
  const point = pointForNode(node, label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

export function selectableCalendarDayNode(hierarchy, day) {
  const candidates = currentHeadAndroidNamedNodes(hierarchy, String(day))
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  return candidates.length === 1 ? candidates[0] : null;
}

const calendarMonthsDe = Object.freeze([
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]);

export function firstServerEligibleRentalDate(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
}

export function calendarMonthLabel(value) {
  return `${calendarMonthsDe[value.getMonth()]} ${value.getFullYear()}`;
}

export function nextCalendarMonthActionNode(hierarchy, currentMonthLabel) {
  const anchor = currentHeadAndroidNamedNodes(hierarchy, currentMonthLabel)[0];
  if (anchor === undefined) return null;
  const anchorPoint = pointForNode(anchor, 'calendar month');
  const candidates = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true')
    .map((node) => ({ node, ...pointForNode(node, 'calendar month navigation') }))
    .filter((node) => node.x > anchorPoint.x && Math.abs(node.y - anchorPoint.y) <= 90)
    .toSorted((left, right) => left.x - right.x);
  return candidates[0]?.node ?? null;
}

function enabledButtonVisible(hierarchy, label) {
  return currentHeadAndroidNamedNodes(hierarchy, label).some(
    (node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false',
  );
}

export function selectedIntentSurfaceState(hierarchy, title) {
  const exactInitialDetail = exactSearchListingDetailVisible(hierarchy, title);
  const exactSelectedDetail = normalizedAndroidLabelVisible(hierarchy, title)
    && currentHeadAndroidNamedNodes(hierarchy, 'Heilbronn, Deutschland').length > 0;
  const cartAction = currentHeadAndroidNamedNodes(hierarchy, 'In den Mietkorb').length > 0;
  if (exactSelectedDetail && cartAction) return 'ready';
  if (currentHeadAndroidNamedNodes(hierarchy, 'Zeitraum nicht verfügbar').length > 0) {
    return 'server-reported-unavailable';
  }
  if (containsAllLabels(hierarchy, ['Verfügbarkeit prüfen', 'Zeitraum', 'Weiter'])) {
    return hierarchy.includes('class="android.widget.ProgressBar"')
      ? 'availability-check-running'
      : 'availability-selection-still-open';
  }
  if (exactInitialDetail || exactSelectedDetail) return 'exact-detail-without-cart-action';
  if (cartAction) return 'cart-action-without-exact-detail';
  return 'unknown';
}

export function selectedIntentDetailSettled(hierarchy, title) {
  return selectedIntentSurfaceState(hierarchy, title) === 'ready'
    && currentHeadAndroidNamedNodes(
      hierarchy,
      'Im Mietkorb – noch nicht reserviert',
    ).length === 0;
}

function nodesContainingNormalizedLabel(hierarchy, label) {
  const normalized = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
  const target = normalized(label);
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? []).filter((node) => (
    ['text', 'content-desc'].some((attribute) => (
      normalized(currentHeadAndroidNodeAttribute(node, attribute)).includes(target)
    ))
  ));
}

async function waitForListingDetail({
  title,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'exact rental-cart listing detail',
    predicate: (hierarchy) => exactSearchListingDetailVisible(hierarchy, title),
  });
}

async function addExactIntentTwiceOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
  now = new Date(),
}) {
  const search = await openExactSearch({
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
    hierarchy: search.hierarchy,
    privateLabel: `Anzeige öffnen: ${search.title}`,
    safeLabel: 'exact rental-cart listing open',
  });
  let hierarchy = await waitForListingDetail({
    title: search.title,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Verfügbarkeit prüfen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'rental-duration calendar',
    predicate: (value) => containsAllLabels(
      value,
      ['Verfügbarkeit prüfen', 'Zeitraum', 'Kalender', 'Weiter'],
    ),
  });
  const eligibleDate = firstServerEligibleRentalDate(now);
  if (eligibleDate.getMonth() !== now.getMonth()
      || eligibleDate.getFullYear() !== now.getFullYear()) {
    const nextMonth = nextCalendarMonthActionNode(hierarchy, calendarMonthLabel(now));
    if (nextMonth === null) fail('The sanitized next-month rental action is unavailable.');
    tapNode(commandRunner, adbPath, device, nextMonth, 'next-month rental');
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'next rental month',
      predicate: (value) => currentHeadAndroidNamedNodes(
        value,
        calendarMonthLabel(eligibleDate),
      ).length === 1,
    });
  }
  const dayNode = selectableCalendarDayNode(hierarchy, eligibleDate.getDate());
  if (dayNode === null) fail('The sanitized first eligible rental action is unavailable.');
  tapNode(commandRunner, adbPath, device, dayNode, 'first eligible rental');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'one-day rental selection',
    predicate: (value) => (
      containsAllLabels(value, ['1 Miettag', 'Weiter'])
        && enabledButtonVisible(value, 'Weiter')
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Weiter');
  try {
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      attempts: selectedIntentRemoteSettle.attempts,
      intervalMs: selectedIntentRemoteSettle.intervalMs,
      label: 'selected non-reserving listing intent',
      predicate: (value) => selectedIntentSurfaceState(value, search.title) === 'ready',
    });
  } catch {
    const state = selectedIntentSurfaceState(
      dumpCurrentHeadAndroidUi(commandRunner, adbPath, device),
      search.title,
    );
    fail(`The sanitized selected listing intent state is ${state}.`);
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    tapLabel(commandRunner, adbPath, device, hierarchy, 'In den Mietkorb');
    await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      attempts: cartAcknowledgementProbe.attempts,
      intervalMs: cartAcknowledgementProbe.intervalMs,
      label: 'non-reserving cart acknowledgement',
      predicate: (value) => (
        currentHeadAndroidNamedNodes(
          value,
          'Im Mietkorb – noch nicht reserviert',
        ).length > 0
          && currentHeadAndroidNamedNodes(
            value,
            'Speichern im Mietkorb konnte nicht bestätigt werden',
          ).length === 0
      ),
    });
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      attempts: 16,
      intervalMs: 250,
      label: 'listing detail after cart acknowledgement',
      predicate: (value) => selectedIntentDetailSettled(value, search.title),
    });
  }
  return Object.freeze({
    status: 'pixel-renter-identical-cart-intent-submitted-twice',
    exactRenterPrincipal: true,
    acknowledgements: 2,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function verifyPreservedRole({
  vault,
  role,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  const profile = await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Mein SIT',
  });
  const account = vault.accounts.find((entry) => entry.role === role)
    ?? fail('The exact preserved cart principal is unavailable.');
  const other = vault.accounts.find((entry) => entry.role !== role)
    ?? fail('The opposite preserved cart principal is unavailable.');
  if (currentHeadAndroidNamedNodes(profile, account.displayName).length !== 1
      || currentHeadAndroidNamedNodes(profile, other.displayName).length !== 0) {
    fail('The preserved Pixel session does not match the exact cart principal.');
  }
}

async function settledCartTruth({
  vaultFile,
  role,
  present,
  projectAssigned = false,
  bind,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private rental-cart title is unavailable.');
  const projectTitle = vault.rentalCartLifecycle?.projectTitle
    ?? fail('The private rental-cart project title is unavailable.');
  if (bind) {
    await bindExactRole({ vault, role, commandRunner, adbPath, device, wait });
  } else {
    await verifyPreservedRole({ vault, role, commandRunner, adbPath, device, wait });
  }
  await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Mietkorb',
  });
  let stable = 0;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await wait(350);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (hierarchy.includes('class="android.widget.ProgressBar"')
        || currentHeadAndroidNamedNodes(
          hierarchy,
          'Gespeicherte Daten konnten nicht geladen werden',
        ).length > 0) {
      stable = 0;
      continue;
    }
    const itemVisible = currentHeadAndroidNamedNodes(hierarchy, title).length > 0;
    const projectVisible = currentHeadAndroidNamedNodes(hierarchy, projectTitle).length > 0;
    const exact = itemVisible === present
      && (!present || containsAllLabels(hierarchy, [
        'Im Mietkorb – noch nicht reserviert',
        'Verfügbarkeit und Preis werden vor jeder Anfrage neu geprüft.',
      ]))
      && (!projectAssigned || projectVisible);
    if (exact) {
      stable += 1;
      if (stable >= 3) {
        return Object.freeze({
          status: present
            ? `pixel-${role}-cart-intent-${projectAssigned ? 'project-assigned-' : ''}present-stably`
            : `pixel-${role}-cart-intent-absent-stably`,
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
  fail(`The exact ${role} rental-cart truth did not settle safely.`);
}

function firstEnabledEditor(hierarchy) {
  const editors = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  return editors.length === 1 ? editors[0] : null;
}

function tapBottommostPrivateLabel({
  hierarchy,
  privateLabel,
  safeLabel,
  commandRunner,
  adbPath,
  device,
}) {
  const nodes = currentHeadAndroidNamedNodes(hierarchy, privateLabel);
  if (nodes.length === 0) fail(`The sanitized ${safeLabel} action is unavailable.`);
  const selected = nodes
    .map((node) => ({ node, ...pointForNode(node, safeLabel) }))
    .toSorted((left, right) => right.y - left.y)[0];
  tapNode(commandRunner, adbPath, device, selected.node, safeLabel);
}

export function rentalCartItemProjectVisible(hierarchy, listingTitle, projectTitle) {
  const listingPoints = currentHeadAndroidNamedNodes(hierarchy, listingTitle)
    .map((node) => pointForNode(node, 'exact rental-cart listing'));
  const projectPoints = nodesContainingNormalizedLabel(hierarchy, projectTitle)
    .map((node) => pointForNode(node, 'exact rental-cart project'));
  return listingPoints.some((listing) => projectPoints.some(
    (project) => Math.abs(project.y - listing.y) <= 140,
  ));
}

export function rentalCartItemActionVisible(hierarchy, listingTitle, actionLabel) {
  const listingPoints = currentHeadAndroidNamedNodes(hierarchy, listingTitle)
    .map((node) => pointForNode(node, 'exact rental-cart listing'));
  const actionPoints = currentHeadAndroidNamedNodes(hierarchy, actionLabel)
    .map((node) => pointForNode(node, 'exact rental-cart action'));
  return listingPoints.some((listing) => actionPoints.some(
    (action) => Math.abs(action.y - listing.y) <= 160,
  ));
}

async function createAndAssignProjectOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private rental-cart title is unavailable.');
  const projectTitle = vault.rentalCartLifecycle?.projectTitle
    ?? fail('The private rental-cart project title is unavailable.');
  let hierarchy = await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Mietkorb',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'rental-cart project action',
    predicate: (value) => containsAllLabels(
      value,
      ['Im Mietkorb – noch nicht reserviert', 'Projekt anlegen'],
    ),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Projekt anlegen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'new rental-cart project dialog',
    predicate: (value) => (
      containsAllLabels(value, ['Neues Projekt', 'Erstellen'])
        && firstEnabledEditor(value) !== null
    ),
  });
  tapNode(
    commandRunner,
    adbPath,
    device,
    firstEnabledEditor(hierarchy),
    'rental-cart project editor',
  );
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', projectTitle.replaceAll(' ', '%s'),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '4',
  ]);
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'completed rental-cart project draft',
    predicate: (value) => containsAllLabels(value, ['Neues Projekt', 'Erstellen']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Erstellen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'server-confirmed rental-cart project',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, projectTitle).length > 0
        && currentHeadAndroidNamedNodes(value, 'Projekt zuordnen').length > 0
        && !value.includes('class="android.widget.ProgressBar"')
    ),
  });
  tapClosestToLabel(
    commandRunner,
    adbPath,
    device,
    hierarchy,
    'Projekt zuordnen',
    title,
  );
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'rental-cart project assignment sheet',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, 'Projekt zuordnen').length > 0
        && currentHeadAndroidNamedNodes(value, projectTitle).length > 0
    ),
  });
  tapBottommostPrivateLabel({
    hierarchy,
    privateLabel: projectTitle,
    safeLabel: 'exact rental-cart project assignment',
    commandRunner,
    adbPath,
    device,
  });
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'assigned rental-cart project',
    predicate: (value) => (
      rentalCartItemProjectVisible(value, title, projectTitle)
        && currentHeadAndroidNamedNodes(value, 'Projekt zuordnen').length > 0
        && !value.includes('class="android.widget.ProgressBar"')
    ),
  });
  return Object.freeze({
    status: 'pixel-renter-project-created-and-assigned',
    exactRenterPrincipal: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function removeExactCartIntentOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private rental-cart title is unavailable.');
  let hierarchy = await openMainDestination({
    commandRunner, adbPath, device, wait, label: 'Mietkorb',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'exact rental-cart removal action',
    predicate: (value) => rentalCartItemActionVisible(
      value,
      title,
      'Aus Mietkorb entfernen',
    ),
  });
  tapClosestToLabel(
    commandRunner,
    adbPath,
    device,
    hierarchy,
    'Aus Mietkorb entfernen',
    title,
  );
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'removed exact rental-cart intent',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, title).length === 0
        && !value.includes('class="android.widget.ProgressBar"')
        && currentHeadAndroidNamedNodes(
          value,
          'Entfernen des Artikels konnte nicht bestätigt werden',
        ).length === 0
    ),
  });
  return Object.freeze({
    status: 'pixel-renter-exact-cart-intent-removed',
    exactRenterPrincipal: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

export async function runAndroidRentalCartProjectLifecycle({
  candidate,
  deviceSummary,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  const required = [
    'prepare',
    'activate',
    'captureBaseline',
    'addTwice',
    'inspectSingleIntent',
    'verifyCart',
    'createAndAssignProject',
    'inspectProjectAssignment',
    'verifyRestartPersistence',
    'verifyOtherPrincipalIsolation',
    'verifyRenterRestored',
    'removeIntent',
    'verifyRemoved',
    'cleanupCart',
    'retire',
    'restoreOwner',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The Pixel rental-cart project lifecycle operations are incomplete.');
  }
  let prepared = null;
  let baselineCaptured = false;
  let primaryFailure = null;
  let cleanupFailure = null;
  let cartCleanup = null;
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
    const baseline = await stage(
      'capture-cart-baseline',
      () => operations.captureBaseline(prepared),
    );
    baselineCaptured = baseline?.status === 'isolated-rental-cart-baseline-captured';
    const added = await stage('add-identical-intent-twice', () => operations.addTwice(prepared));
    const single = await stage(
      'inspect-single-intent',
      () => operations.inspectSingleIntent(prepared),
    );
    const visible = await stage('verify-cart', () => operations.verifyCart(prepared));
    const assigned = await stage(
      'create-assign-project',
      () => operations.createAndAssignProject(prepared),
    );
    const assignment = await stage(
      'inspect-project-assignment',
      () => operations.inspectProjectAssignment(prepared),
    );
    const persisted = await stage(
      'restart-persistence',
      () => operations.verifyRestartPersistence(prepared),
    );
    const isolated = await stage(
      'other-principal-isolation',
      () => operations.verifyOtherPrincipalIsolation(prepared),
    );
    const renter = await stage(
      'renter-restored',
      () => operations.verifyRenterRestored(prepared),
    );
    const removed = await stage('remove-intent', () => operations.removeIntent(prepared));
    const absent = await stage('verify-removed', () => operations.verifyRemoved(prepared));
    if (activated?.status !== 'isolated-product-journey-fixture-active'
        || !baselineCaptured
        || added?.status !== 'pixel-renter-identical-cart-intent-submitted-twice'
        || single?.status !== 'isolated-rental-cart-single-intent-server-confirmed'
        || visible?.status !== 'pixel-renter-cart-intent-present-stably'
        || assigned?.status !== 'pixel-renter-project-created-and-assigned'
        || assignment?.status !== 'isolated-rental-cart-project-server-confirmed'
        || persisted?.status !== 'pixel-renter-cart-intent-project-assigned-present-stably'
        || isolated?.status !== 'pixel-owner-cart-intent-absent-stably'
        || renter?.status !== 'pixel-renter-cart-intent-project-assigned-present-stably'
        || removed?.status !== 'pixel-renter-exact-cart-intent-removed'
        || absent?.status !== 'pixel-renter-cart-intent-absent-stably') {
      fail('The Pixel rental-cart project lifecycle did not close exactly.');
    }
    closed = true;
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (prepared !== null && baselineCaptured) {
      try {
        cartCleanup = await operations.cleanupCart(prepared);
      } catch (error) {
        cleanupFailure = error;
      }
    }
    if (prepared !== null) {
      try {
        retirement = await operations.retire(prepared);
      } catch (error) {
        cleanupFailure ??= error;
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
      || cartCleanup?.status !== 'isolated-rental-cart-baseline-restored'
      || retirement?.status !== 'email-verified-two-role-product-journey-retired'
      || restored !== true) {
    fail('The Pixel rental-cart project lifecycle cleanup did not close exactly.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-rental-cart-project-lifecycle',
    status: 'passed-pixel-rental-cart-project-lifecycle',
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
      exactIntentSubmittedTwice: 'passed-two-physical-acknowledgements',
      exactServerIntentCount: 1,
      stableIdempotentIntent: 'passed-stable-sha256-client-id',
      nonReservingTruth: 'passed-cart-false-request-count-zero',
      projectCreateAssign: 'passed-ui-and-server-confirmed',
      processRestartPersistence: 'passed-three-stable-settled-observations',
      accountIsolation: 'passed-other-principal-three-stable-settled-observations',
      renterRestorePersistence: 'passed-three-stable-settled-observations',
      exactIntentRemoved: 'passed-ui-confirmed',
      unrelatedCartBaselineRestored: true,
      cleanup: 'passed-cart-baseline-restored-listing-ended-publicly-hidden',
      protectedOwnerSessionRestored: true,
    },
    boundaries: {
      physicalPixelOnly: true,
      onePlusContacted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      monetaryEffectMinor: 0,
      bookingCreated: false,
      rentalRequestCreated: false,
      contractCreated: false,
      reservationCreated: false,
      listingLeftActive: false,
      unrelatedCartDataChanged: false,
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
  const wait = (milliseconds) => new Promise(
    (resolvePromise) => setTimeout(resolvePromise, milliseconds),
  );
  const operations = {
    prepare: () => prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile }),
    activate: ({ vaultFile }) => activateStagingEmailVerifiedJourneyFixture({ vaultFile }),
    captureBaseline: ({ vaultFile }) => prepareStagingEmailVerifiedRentalCartLifecycle({
      vaultFile,
    }),
    addTwice: ({ vaultFile }) => addExactIntentTwiceOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    inspectSingleIntent: ({ vaultFile }) => inspectStagingEmailVerifiedRentalCartLifecycle({
      vaultFile,
    }),
    verifyCart: ({ vaultFile }) => settledCartTruth({
      vaultFile,
      role: 'renter',
      present: true,
      bind: false,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    createAndAssignProject: ({ vaultFile }) => createAndAssignProjectOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    inspectProjectAssignment: ({ vaultFile }) => (
      inspectStagingEmailVerifiedRentalCartLifecycle({
        vaultFile,
        expectedProjectAssignment: true,
      })
    ),
    verifyRestartPersistence: ({ vaultFile }) => settledCartTruth({
      vaultFile,
      role: 'renter',
      present: true,
      projectAssigned: true,
      bind: false,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyOtherPrincipalIsolation: ({ vaultFile }) => settledCartTruth({
      vaultFile,
      role: 'owner',
      present: false,
      bind: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyRenterRestored: ({ vaultFile }) => settledCartTruth({
      vaultFile,
      role: 'renter',
      present: true,
      projectAssigned: true,
      bind: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    removeIntent: ({ vaultFile }) => removeExactCartIntentOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    verifyRemoved: ({ vaultFile }) => settledCartTruth({
      vaultFile,
      role: 'renter',
      present: false,
      bind: false,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    cleanupCart: ({ vaultFile }) => cleanupStagingEmailVerifiedRentalCartLifecycle({
      vaultFile,
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
  const evidence = await runAndroidRentalCartProjectLifecycle({
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
