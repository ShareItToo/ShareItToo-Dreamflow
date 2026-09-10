#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';
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
  prepareStagingEmailVerifiedTwoRoleJourney,
  readEmailVerifiedJourneyVault,
  retireStagingEmailVerifiedTwoRoleJourney,
  runStagingEmailVerifiedTwoRoleSimulation,
  verifyStagingEmailVerifiedJourneyPublished,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';
import { diagnoseAndroidControlledFcm } from './diagnose_android_controlled_fcm.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function fail(message) {
  throw new Error(message);
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 300
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|fixture identifier)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

const ownerPublishUiSubphases = new Set([
  'read-vault',
  'bind-owner',
  'open-my-listings',
  'wait-owner-listings',
  'open-saved-listings',
  'wait-exact-draft',
  'open-status-dialog',
  'wait-publish-action',
  'submit-publish',
  'observe-confirmation',
]);

export async function runOwnerPublishUiSubphase({ label, operation } = {}) {
  if (!ownerPublishUiSubphases.has(label) || typeof operation !== 'function') {
    fail('The owner-publish UI subphase contract is invalid.');
  }
  try {
    return await operation();
  } catch (error) {
    fail(
      `Owner-publish subphase ${label} failed safely: ${sanitizedFailure(error)}.`,
    );
  }
}

export async function retryIdempotentPixelState(operation) {
  if (typeof operation !== 'function') {
    fail('The idempotent Pixel state operation is unavailable.');
  }
  let lastFailure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastFailure = error;
    }
  }
  throw lastFailure;
}

export async function restoreExactRoleWithBoundedRetries({
  operation,
  wait = async () => {},
  attempts = 3,
} = {}) {
  if (typeof operation !== 'function' || typeof wait !== 'function'
      || !Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
    fail('The exact-role restoration retry contract is invalid.');
  }
  let lastFailure = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await operation() === true) return true;
      lastFailure = new Error('The exact role was not restored.');
    } catch (error) {
      lastFailure = error;
    }
    if (attempt + 1 < attempts) await wait(750);
  }
  throw lastFailure;
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

function matchingPoints(hierarchy, label) {
  return currentHeadAndroidNamedNodes(hierarchy, label).map((node) => ({
    node,
    ...pointForNode(node, label),
  }));
}

export function tapLabel(commandRunner, adbPath, device, hierarchy, label, {
  chooseLast = false,
  chooseBottom = false,
} = {}) {
  const points = matchingPoints(hierarchy, label);
  if (points.length === 0) fail(`The sanitized ${label} action is unavailable.`);
  const ordered = chooseBottom
    ? points.toSorted((left, right) => right.y - left.y)
    : points;
  const point = chooseLast ? ordered.at(-1) : ordered[0];
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

export function tapClosestToLabel(
  commandRunner,
  adbPath,
  device,
  hierarchy,
  actionLabel,
  anchorLabel,
) {
  const anchor = matchingPoints(hierarchy, anchorLabel)[0]
    ?? fail(`The sanitized ${anchorLabel} anchor is unavailable.`);
  const action = matchingPoints(hierarchy, actionLabel)
    .toSorted((left, right) => Math.abs(left.y - anchor.y) - Math.abs(right.y - anchor.y))[0]
    ?? fail(`The sanitized ${actionLabel} action is unavailable.`);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(action.x), String(action.y),
  ]);
}

export async function waitForHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  attempts = 30,
  intervalMs = 650,
  label,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

async function observeHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  attempts = 10,
  intervalMs = 250,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return true;
  }
  return false;
}

export function containsAllLabels(hierarchy, labels) {
  return labels.every((label) => currentHeadAndroidNamedNodes(hierarchy, label).length > 0);
}

export function ownerNonBindingDetailVisible(hierarchy) {
  return currentHeadAndroidNamedNodes(
    hierarchy,
    'Pilot-Simulation · Kommende Vermietung',
  ).length > 0
    && hierarchy.includes('kein Vertrag, keine Reservierung und keine Zahlung');
}

export function renterNonBindingDetailVisible(hierarchy) {
  return currentHeadAndroidNamedNodes(
    hierarchy,
    'Pilot-Simulation · Kommende Buchung',
  ).length > 0
    && currentHeadAndroidNamedNodes(
      hierarchy,
      'Unverbindliche Pilot-Simulation',
    ).length > 0
    && hierarchy.includes('Zahlung entfällt.')
    && hierarchy.includes('keinen Vertrag, keine Reservierung, keine Auszahlung und keine Erstattung');
}

export function renterBookingChatVisible(hierarchy, exactListingTitle) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Nachrichten-Einstellungen').length > 0
    && currentHeadAndroidNamedNodes(hierarchy, `· ${exactListingTitle}`).length === 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Bestätigt').length > 0;
}

export function renterBookingChatSurfaceClassification(hierarchy, exactListingTitle) {
  const count = (label) => currentHeadAndroidNamedNodes(hierarchy, label).length;
  return [
    `settings-${count('Nachrichten-Einstellungen')}`,
    `title-${count(`· ${exactListingTitle}`)}`,
    `confirmed-${count('Bestätigt')}`,
    `chat-${count('Chat')}`,
    `completed-${count('Abgeschlossen')}`,
    `load-failed-${count('Nachrichten konnten nicht sicher geladen werden.')}`,
    `empty-${count('Noch keine Nachrichten')}`,
    `active-tab-${count('Aktiv')}`,
    `archived-tab-${count('Archiviert')}`,
  ].join('_');
}

export async function openMainDestination({
  commandRunner,
  adbPath,
  device,
  wait,
  label,
}) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapLabel(commandRunner, adbPath, device, main, label, { chooseBottom: true });
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: `${label} destination`,
    predicate: (hierarchy) => currentHeadAndroidNamedNodes(hierarchy, label).length > 0,
  });
}

export async function bindExactRole({
  vault,
  role,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const account = vault.accounts.find((entry) => entry.role === role)
    ?? fail('The exact email-verified product-journey role is unavailable.');
  const other = vault.accounts.find((entry) => entry.role !== role)
    ?? fail('The opposite email-verified product-journey role is unavailable.');
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  let guestEstablished = false;
  try {
    guestEstablished = await retryIdempotentPixelState(
      () => ensureAndroidGuestSession({
        commandRunner,
        adbPath,
        device,
        wait,
      }),
    ) === true;
  } catch {
    fail(`The exact ${role} Pixel guest-reset surface did not appear.`);
  }
  if (!guestEstablished) {
    fail(`The exact ${role} Pixel guest session could not be established.`);
  }
  let sessionRestored = false;
  try {
    sessionRestored = await retryIdempotentPixelState(() => restoreSyntheticSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account,
      })) === true;
  } catch {
    fail(`The exact ${role} Pixel login-restore surface did not appear.`);
  }
  if (!sessionRestored) {
    fail(`The exact ${role} Pixel session could not be established.`);
  }
  let profile;
  try {
    profile = await openMainDestination({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'Mein SIT',
    });
  } catch {
    fail(`The exact ${role} Pixel profile surface did not appear.`);
  }
  const exact = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: `${role} principal`,
    predicate: (hierarchy) => (
      currentHeadAndroidNamedNodes(hierarchy, account.displayName).length === 1
        && currentHeadAndroidNamedNodes(hierarchy, other.displayName).length === 0
        && currentHeadAndroidNamedNodes(hierarchy, 'Abmelden').length > 0
    ),
  });
  return { hierarchy: exact, account, other };
}

async function publishOwnerDraftOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = await runOwnerPublishUiSubphase({
    label: 'read-vault',
    operation: async () => readEmailVerifiedJourneyVault(vaultFile),
  });
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private product-journey title is unavailable.');
  const owner = await runOwnerPublishUiSubphase({
    label: 'bind-owner',
    operation: () => bindExactRole({
      vault,
      role: 'owner',
      commandRunner,
      adbPath,
      device,
      wait,
    }),
  });
  await runOwnerPublishUiSubphase({
    label: 'open-my-listings',
    operation: async () => tapLabel(
      commandRunner,
      adbPath,
      device,
      owner.hierarchy,
      'Meine Anzeigen',
    ),
  });
  let hierarchy = await runOwnerPublishUiSubphase({
    label: 'wait-owner-listings',
    operation: () => waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'owner listings',
      predicate: (value) => containsAllLabels(value, ['Meine Anzeigen', 'für später gespeichert']),
    }),
  });
  await runOwnerPublishUiSubphase({
    label: 'open-saved-listings',
    operation: async () => tapLabel(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      'für später gespeichert',
    ),
  });
  hierarchy = await runOwnerPublishUiSubphase({
    label: 'wait-exact-draft',
    operation: () => waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'exact owner draft',
      predicate: (value) => containsAllLabels(value, [title, 'Status ändern']),
    }),
  });
  await runOwnerPublishUiSubphase({
    label: 'open-status-dialog',
    operation: async () => tapClosestToLabel(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      'Status ändern',
      title,
    ),
  });
  hierarchy = await runOwnerPublishUiSubphase({
    label: 'wait-publish-action',
    operation: () => waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'owner draft action',
      predicate: (value) => containsAllLabels(value, ['Status ändern', 'Veröffentlichen']),
    }),
  });
  await runOwnerPublishUiSubphase({
    label: 'submit-publish',
    operation: async () => tapLabel(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      'Veröffentlichen',
    ),
  });
  // The success UI is intentionally a two-second toast. It is useful visual
  // evidence when sampled, but it must not become a timing prerequisite. The
  // next phase binds success to the durable authenticated listing response and
  // public catalog instead.
  const successConfirmationVisible = await runOwnerPublishUiSubphase({
    label: 'observe-confirmation',
    operation: () => observeHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      predicate: (value) => currentHeadAndroidNamedNodes(value, 'Anzeige veröffentlicht').length > 0,
      attempts: 8,
      intervalMs: 180,
    }),
  });
  await wait(900);
  return Object.freeze({
    status: 'pixel-owner-draft-publish-submitted',
    exactOwnerPrincipal: true,
    ownerDialogActionUsed: true,
    successConfirmationVisible,
    durableSuccessVerifiedByNextServerPhase: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function verifyOwnerAcceptedSurface({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney.title;
  const owner = await bindExactRole({
    vault,
    role: 'owner',
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapLabel(commandRunner, adbPath, device, owner.hierarchy, 'Mietanfragen');
  let hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'owner requests hub',
    predicate: (value) => containsAllLabels(value, ['Mietanfragen', 'Kommend']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Kommend');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'owner accepted simulation card',
    predicate: (value) => containsAllLabels(value, [title, 'Pilot-Simulation']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, title);
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'owner non-binding detail',
    predicate: ownerNonBindingDetailVisible,
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
  return Object.freeze({
    status: 'pixel-owner-accepted-non-binding-surface-passed',
    exactOwnerPrincipal: true,
    cardTruth: 'Pilot-Simulation',
    detailTruth: 'no-contract-no-reservation-no-payment',
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function verifyRenterProductSurfaces({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney.title;
  await bindExactRole({
    vault,
    role: 'renter',
    commandRunner,
    adbPath,
    device,
    wait,
  });
  await openMainDestination({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Entdecken',
  });
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'renter public listing discovery',
    predicate: (value) => currentHeadAndroidNamedNodes(value, title).length > 0,
    attempts: 36,
  });

  let hierarchy = await openMainDestination({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Buchungen',
  });
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'renter bookings hub',
    predicate: (value) => containsAllLabels(value, ['Meine Buchungen', 'Kommend']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Kommend');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'renter accepted simulation card',
    predicate: (value) => containsAllLabels(value, [title, 'Pilot-Simulation']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, title);
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'renter non-binding detail',
    predicate: renterNonBindingDetailVisible,
  });

  hierarchy = await openMainDestination({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Nachrichten',
  });
  try {
    await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'renter booking chat',
      predicate: (value) => renterBookingChatVisible(value, title),
    });
  } catch (error) {
    try {
      const observed = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      fail(
        `The sanitized renter booking chat failed with surface classification ${renterBookingChatSurfaceClassification(observed, title)}.`,
      );
    } catch (classificationError) {
      if (classificationError?.message?.startsWith(
        'The sanitized renter booking chat failed with surface classification ',
      )) {
        throw classificationError;
      }
      throw error;
    }
  }
  return Object.freeze({
    status: 'pixel-renter-product-surfaces-passed',
    exactRenterPrincipal: true,
    ownerPrincipalAbsentAfterSwitch: true,
    publicListingVisible: true,
    cardTruth: 'Pilot-Simulation',
    detailTruth: 'no-contract-no-reservation-no-payment',
    chatVisible: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

export async function runAndroidEmailVerifiedTwoRoleProductJourney({
  candidate,
  deviceSummary,
  operations,
  deviceProfile = 'pixel',
  capturedAt = new Date().toISOString(),
} = {}) {
  if (!['pixel', 'oneplus'].includes(deviceProfile)) {
    fail('The physical Android product-journey device profile is invalid.');
  }
  if (deviceProfile === 'oneplus'
      && (deviceSummary?.physical !== true
        || deviceSummary?.model !== 'CPH2581'
        || !/^oneplus$/iu.test(String(deviceSummary?.manufacturer ?? '')))) {
    fail('The OnePlus product journey requires the exact physical CPH2581 device.');
  }
  const onePlus = deviceProfile === 'oneplus';
  const required = [
    'prepare',
    'publishOwnerDraft',
    'verifyPublished',
    'simulate',
    'verifyFcm',
    'verifyOwner',
    'verifyRenter',
    'retire',
    'restoreOwner',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The Pixel two-role product-journey operations are incomplete.');
  }
  let prepared = null;
  let publish = null;
  let published = null;
  let simulation = null;
  let controlledFcm = null;
  let owner = null;
  let renter = null;
  let retirement = null;
  let restored = false;
  let primaryFailure = null;
  let primaryFailurePhase = null;
  let cleanupFailure = null;
  let cleanupFailurePhase = null;
  let activePhase = 'prepare';
  try {
    prepared = await operations.prepare();
    activePhase = 'owner-publish-ui';
    publish = await operations.publishOwnerDraft(prepared);
    activePhase = 'server-publish-verify';
    published = await operations.verifyPublished(prepared);
    activePhase = 'simulation';
    simulation = await operations.simulate(prepared);
    activePhase = 'fcm';
    controlledFcm = await operations.verifyFcm(prepared);
    activePhase = 'owner-surface';
    owner = await operations.verifyOwner(prepared);
    activePhase = 'renter-surface';
    renter = await operations.verifyRenter(prepared);
  } catch (error) {
    primaryFailure = error;
    primaryFailurePhase = activePhase;
  } finally {
    if (prepared !== null) {
      try {
        retirement = await operations.retire(prepared);
      } catch (error) {
        cleanupFailure = error;
        cleanupFailurePhase = 'retire';
      }
    }
    try {
      restored = await operations.restoreOwner() === true;
    } catch (error) {
      cleanupFailure ??= error;
      cleanupFailurePhase ??= 'restore-owner';
    }
  }
  if (primaryFailure !== null) {
    if (cleanupFailure !== null) {
      fail(
        `Product-journey phase ${primaryFailurePhase} failed safely: `
        + `${sanitizedFailure(primaryFailure)} Cleanup also failed safely in `
        + `${cleanupFailurePhase}: ${sanitizedFailure(cleanupFailure)}.`,
      );
    }
    fail(
      `Product-journey phase ${primaryFailurePhase} failed safely: `
      + `${sanitizedFailure(primaryFailure)}.`,
    );
  }
  if (cleanupFailure !== null) {
    fail(
      `Product-journey cleanup phase ${cleanupFailurePhase} failed safely: `
      + `${sanitizedFailure(cleanupFailure)}.`,
    );
  }
  if (publish?.status !== 'pixel-owner-draft-publish-submitted'
      || published?.status !== 'pixel-owner-publish-server-confirmed'
      || simulation?.status !== 'email-verified-two-role-simulation-ready-for-pixel-review'
      || controlledFcm?.evidence?.status !== 'delivery-passed-icon-visual-review-pending'
      || owner?.status !== 'pixel-owner-accepted-non-binding-surface-passed'
      || renter?.status !== 'pixel-renter-product-surfaces-passed'
      || retirement?.status !== 'email-verified-two-role-product-journey-retired'
      || restored !== true) {
    fail('The Pixel email-verified two-role product journey did not close exactly.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: onePlus
      ? 'android-oneplus-email-verified-two-role-product-journey'
      : 'android-email-verified-two-role-product-journey',
    status: onePlus
      ? 'passed-oneplus-email-verified-two-role-product-journey'
      : 'passed-pixel-email-verified-two-role-product-journey',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.apkSha256,
    },
    device: deviceSummary,
    tests: {
      distinctEmailVerifiedPrincipals: 'passed',
      ...(onePlus
        ? { ownerDraftPublishThroughOnePlusUi: 'passed-server-confirmed-active' }
        : { ownerDraftPublishThroughPixelUi: 'passed-server-confirmed-active' }),
      ownerPublishFeedback: publish.successConfirmationVisible === true
        ? 'transient-toast-observed-and-server-confirmed'
        : 'durable-server-and-public-catalog-confirmed',
      renterPublicDiscovery: 'passed',
      requestAcceptance: 'passed-non-binding-simulation',
      controlledFcm: 'passed-foreground-background-terminated',
      controlledFcmNotificationIcon: 'private-visual-review-pending',
      controlledFcmNotificationIconSha256:
        controlledFcm.evidence.tests.notificationIconVisual.privateDiagnosticScreenshotSha256,
      ownerPresentation: owner.cardTruth,
      renterPresentation: renter.cardTruth,
      chatVisibility: 'passed-renter-visible',
      principalSwitchIsolation: 'passed-owner-absent-under-renter',
      cleanup: 'passed-booking-cancelled-listing-ended',
      protectedOwnerSessionRestored: true,
    },
    boundaries: {
      physicalPixelOnly: !onePlus,
      physicalOnePlusOnly: onePlus,
      onePlusContacted: onePlus,
      emailLinksWerePreviouslyOwnerConfirmed: true,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      monetaryEffectMinor: 0,
      contractCreated: false,
      reservationCreated: false,
      listingLeftActive: false,
      testBookingLeftActive: false,
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
  const privateArtifactDirectory = resolve(
    argumentValue(args, '--private-artifact-dir')
      ?? fail('--private-artifact-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const deviceProfile = argumentValue(args, '--device-profile') ?? 'pixel';
  if (!['pixel', 'oneplus'].includes(deviceProfile)) {
    fail('--device-profile must be pixel or oneplus.');
  }
  const candidateArchive = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const candidate = {
    ...candidateArchive,
    paymentMode: 'memory',
    stripeLivemode: false,
  };
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
  const operations = {
    prepare: () => prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile }),
    publishOwnerDraft: ({ vaultFile }) => publishOwnerDraftOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    verifyPublished: ({ vaultFile }) => verifyStagingEmailVerifiedJourneyPublished({ vaultFile }),
    simulate: ({ vaultFile }) => runStagingEmailVerifiedTwoRoleSimulation({ vaultFile }),
    verifyFcm: ({ vaultFile }) => diagnoseAndroidControlledFcm({
      vaultFile,
      privateArtifactDirectory,
      commandRunner,
      adbPath,
      device,
      deviceSummary,
      candidate,
      archive: candidateArchive,
      wait,
    }),
    verifyOwner: ({ vaultFile }) => verifyOwnerAcceptedSurface({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    verifyRenter: ({ vaultFile }) => verifyRenterProductSurfaces({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    retire: ({ vaultFile }) => retireStagingEmailVerifiedTwoRoleJourney({ vaultFile }),
    restoreOwner: () => restoreExactRoleWithBoundedRetries({
      wait,
      operation: async () => {
        const source = readEmailVerifiedJourneyVault(sourceVaultFile).vault;
        const bound = await bindExactRole({
          vault: source,
          role: 'owner',
          commandRunner,
          adbPath,
          device,
          wait,
        });
        return currentHeadAndroidNamedNodes(
          bound.hierarchy,
          bound.account.displayName,
        ).length === 1
          && currentHeadAndroidNamedNodes(
            bound.hierarchy,
            bound.other.displayName,
          ).length === 0;
      },
    }),
  };
  const evidence = await runAndroidEmailVerifiedTwoRoleProductJourney({
    candidate,
    deviceSummary,
    operations,
    deviceProfile,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
