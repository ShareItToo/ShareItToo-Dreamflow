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
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  verifyCurrentHeadAndroidInstalledCandidate,
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
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const editSuffix = '_WP18';

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

function titleEditorNode(hierarchy, expectedValue) {
  const editable = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const labelled = new Set(currentHeadAndroidNamedNodes(hierarchy, 'Titel'));
  const matches = editable.filter((node) => labelled.has(node)
    || [
      currentHeadAndroidNodeAttribute(node, 'text'),
      currentHeadAndroidNodeAttribute(node, 'content-desc'),
    ].filter(Boolean).some((value) => value.includes(expectedValue)));
  if (matches.length !== 1) fail('The sanitized listing title editor is unavailable.');
  return matches[0];
}

export function ownerListingSurfaceClassification(
  hierarchy,
  exactTitle,
  expectedStatusLabel,
) {
  const count = (label) => currentHeadAndroidNamedNodes(hierarchy, label).length;
  return [
    `my-listings-${count('Meine Anzeigen')}`,
    `drafts-tab-${count('für später gespeichert')}`,
    `title-${count(exactTitle)}`,
    `status-action-${count('Status ändern')}`,
    `expected-status-${count(expectedStatusLabel)}`,
    `load-failed-${count('Deine Anzeigen konnten nicht sicher geladen werden.')}`,
    `empty-active-${count('Du hast noch keine aktive Anzeige.')}`,
    `empty-draft-${count('Du hast noch keine Anzeige für später gespeichert.')}`,
    `progress-${String(hierarchy).includes('class="android.widget.ProgressBar"') ? 1 : 0}`,
  ].join('_');
}

async function findOrScroll({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  label,
  attempts = 42,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '540', '1660', '540', '430', '260',
    ]);
    await wait(260);
  }
  fail(`The sanitized ${label} action is unavailable after bounded scrolling.`);
}

const listingEditFailureTitles = Object.freeze(new Map([
  ['Bitte Felder prüfen', 'required-fields-incomplete'],
  ['Privatstatus bestaetigen', 'private-status-unconfirmed'],
  ['Kategorie im Privat-Pilot nicht zugelassen', 'category-not-allowed'],
  ['Unterkategorie nicht zugelassen', 'subcategory-not-allowed'],
  ['Serverseitig gespeichert', 'remote-accepted-local-refresh-failed'],
  ['Speicherstatus unklar', 'outcome-unknown'],
  ['Speichern abgelehnt', 'server-rejected'],
  ['Lokaler Stand nicht verfügbar', 'local-state-unavailable'],
]));

async function waitForSavedEdit({
  commandRunner,
  adbPath,
  device,
  wait,
  editedTitle,
  attempts = 48,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(650);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (containsAllLabels(hierarchy, ['Änderungen wurden gespeichert', 'OK'])) {
      return Object.freeze({ hierarchy, confirmationDialogVisible: true });
    }
    // MyListings reloads the exact server-backed owner collection before it
    // presents the owned confirmation dialog. The dialog can therefore be
    // skipped safely by an interrupted post-frame callback even though the
    // editor already returned successfully. Accept the exact updated draft
    // surface as UI truth; the caller still verifies owner and public server
    // state independently before any later lifecycle action.
    if (containsAllLabels(
      hierarchy,
      [editedTitle, 'Entwurf', 'Status ändern'],
    )) {
      return Object.freeze({ hierarchy, confirmationDialogVisible: false });
    }
    for (const [title, code] of listingEditFailureTitles) {
      if (currentHeadAndroidNamedNodes(hierarchy, title).length > 0) {
        fail(`The Pixel listing edit stopped at sanitized outcome ${code}.`);
      }
    }
  }
  fail('The sanitized saved listing edit confirmation surface did not appear.');
}

async function openOwnerListings({
  vault,
  title,
  draft,
  expectedStatusLabel,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const owner = await bindExactRole({
    vault,
    role: 'owner',
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapLabel(commandRunner, adbPath, device, owner.hierarchy, 'Meine Anzeigen');
  let hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'owner listings',
    predicate: (value) => containsAllLabels(value, ['Meine Anzeigen', 'für später gespeichert']),
  });
  if (draft) {
    tapLabel(commandRunner, adbPath, device, hierarchy, 'für später gespeichert');
  }
  try {
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      attempts: 36,
      label: 'exact owner lifecycle listing',
      predicate: (value) => containsAllLabels(
        value,
        [title, 'Status ändern', expectedStatusLabel],
      ),
    });
  } catch (error) {
    try {
      const observed = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      fail(
        'The sanitized exact owner lifecycle listing failed with surface '
        + `classification ${ownerListingSurfaceClassification(
          observed,
          title,
          expectedStatusLabel,
        )}.`,
      );
    } catch (classificationError) {
      if (classificationError?.message?.startsWith(
        'The sanitized exact owner lifecycle listing failed with surface classification ',
      )) {
        throw classificationError;
      }
      throw error;
    }
  }
  return hierarchy;
}

async function editDraftOnPixel({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const title = vault.realTwoRoleJourney?.title
    ?? fail('The private lifecycle title is unavailable.');
  const editedTitle = `${title}${editSuffix}`;
  let hierarchy = await openOwnerListings({
    vault,
    title,
    draft: true,
    expectedStatusLabel: 'Entwurf',
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapClosestToLabel(commandRunner, adbPath, device, hierarchy, 'Status ändern', title);
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'draft edit action',
    predicate: (value) => containsAllLabels(value, ['Status ändern', 'Bearbeiten']),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Bearbeiten');
  hierarchy = await findOrScroll({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'listing title editor',
    predicate: (value) => {
      try {
        titleEditorNode(value, title);
        return true;
      } catch {
        return false;
      }
    },
  });
  const editor = titleEditorNode(hierarchy, title);
  const point = pointForNode(editor, 'listing title editor');
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '123',
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', editSuffix,
  ]);
  await wait(350);
  const editedHierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  const editedEditor = titleEditorNode(editedHierarchy, editedTitle);
  const editorTruth = [
    currentHeadAndroidNodeAttribute(editedEditor, 'text'),
    currentHeadAndroidNodeAttribute(editedEditor, 'content-desc'),
  ].filter(Boolean).join('\n');
  if (!editorTruth.includes(editedTitle)) {
    fail('The Pixel listing title edit was not applied exactly.');
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '4',
  ]);
  await wait(300);
  hierarchy = await findOrScroll({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'save listing edit',
    predicate: (value) => currentHeadAndroidNamedNodes(
      value,
      'Bearbeitung speichern',
    ).length > 0,
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, 'Bearbeitung speichern');
  const saved = await waitForSavedEdit({
    commandRunner,
    adbPath,
    device,
    wait,
    editedTitle,
  });
  hierarchy = saved.hierarchy;
  if (saved.confirmationDialogVisible) {
    tapLabel(commandRunner, adbPath, device, hierarchy, 'OK');
  }
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 36,
    label: 'edited owner draft',
    predicate: (value) => containsAllLabels(value, [editedTitle, 'Entwurf', 'Status ändern']),
  });
  return Object.freeze({
    status: 'pixel-owner-draft-edit-saved',
    editedTitle,
    exactOwnerPrincipal: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

async function ownerListingActionOnPixel({
  vaultFile,
  title,
  expectedBefore,
  action,
  expectedAfter,
  draft = false,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  let hierarchy = await openOwnerListings({
    vault,
    title,
    draft,
    expectedStatusLabel: expectedBefore,
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapClosestToLabel(commandRunner, adbPath, device, hierarchy, 'Status ändern', title);
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: `${action} listing action`,
    predicate: (value) => containsAllLabels(value, ['Status ändern', action]),
  });
  tapLabel(commandRunner, adbPath, device, hierarchy, action);
  if (action === 'Veröffentlichen') {
    let publication = null;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await wait(650);
      hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      if (containsAllLabels(hierarchy, ['Anzeige veröffentlicht', 'OK'])) {
        publication = Object.freeze({ hierarchy, confirmationDialogVisible: true });
        break;
      }
      // The owner collection is reloaded from the server before the optional
      // success dialog. Exact title plus status is therefore sufficient UI
      // truth if that owned dialog is not mounted; the following API check is
      // still mandatory before renter visibility is evaluated.
      if (containsAllLabels(hierarchy, [title, expectedAfter, 'Status ändern'])) {
        publication = Object.freeze({ hierarchy, confirmationDialogVisible: false });
        break;
      }
      for (const failureTitle of [
        'Serverseitig verarbeitet',
        'Änderungsstatus unklar',
        'Änderung abgelehnt',
        'Lokaler Stand nicht verfügbar',
      ]) {
        if (currentHeadAndroidNamedNodes(hierarchy, failureTitle).length > 0) {
          fail('The Pixel listing publication stopped at a safe failure outcome.');
        }
      }
    }
    if (publication === null) {
      // Success messages are useful feedback, but not durable truth. If the
      // owned dialog is absent, require an exact active/public server result
      // and then reopen the owner collection to prove the same active item in
      // a freshly loaded UI before continuing.
      try {
        await verifyServerLifecycleState({
          vaultFile,
          title,
          expectedStatus: 'active',
          publicVisible: true,
        });
        hierarchy = await openOwnerListings({
          vault: readEmailVerifiedJourneyVault(vaultFile).vault,
          title,
          draft: false,
          expectedStatusLabel: expectedAfter,
          commandRunner,
          adbPath,
          device,
          wait,
        });
        publication = Object.freeze({
          hierarchy,
          confirmationDialogVisible: false,
        });
      } catch {
        fail('The listing publication did not reach exact owner UI and server truth.');
      }
    }
    hierarchy = publication.hierarchy;
    if (publication.confirmationDialogVisible) {
      tapLabel(commandRunner, adbPath, device, hierarchy, 'OK');
    }
  }
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 48,
    label: `${expectedAfter} owner listing state`,
    predicate: (value) => containsAllLabels(value, [title, expectedAfter, 'Status ändern']),
  });
  return Object.freeze({
    status: `pixel-owner-listing-${action === 'Veröffentlichen' ? 'published' : expectedAfter.toLowerCase()}`,
    exactOwnerPrincipal: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
  });
}

function catalogSettled(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Entdecken').length > 0
    && currentHeadAndroidNamedNodes(hierarchy, 'Jetzt suchen').length > 0
    && !hierarchy.includes('class="android.widget.ProgressBar"')
    && currentHeadAndroidNamedNodes(hierarchy, 'Anzeigen konnten nicht geladen werden.').length === 0;
}

async function verifyRenterCatalogOnPixel({
  vaultFile,
  title,
  visible,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
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
  let stableAbsence = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, 'Anzeigen konnten nicht geladen werden.').length > 0) {
      fail('The renter catalog failed to load safely.');
    }
    if (!catalogSettled(hierarchy)) continue;
    const present = currentHeadAndroidNamedNodes(hierarchy, title).length > 0;
    if (visible && present) {
      return Object.freeze({
        status: 'pixel-renter-listing-visible',
        exactRenterPrincipal: true,
        containsAccountIdentity: false,
        containsFixtureIdentifier: false,
      });
    }
    if (!visible && !present) {
      stableAbsence += 1;
      if (stableAbsence >= 3) {
        return Object.freeze({
          status: 'pixel-renter-listing-hidden-stably',
          exactRenterPrincipal: true,
          containsAccountIdentity: false,
          containsFixtureIdentifier: false,
        });
      }
    } else {
      stableAbsence = 0;
    }
  }
  fail(`The renter catalog did not reach the expected ${visible ? 'visible' : 'hidden'} listing truth.`);
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value)
    ? value
    : null;
}

async function apiRequest(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
  expected = [200],
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging lifecycle API path is invalid.');
  }
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  if (!expected.includes(response.status)) {
    const code = safeError(value?.error);
    fail(`Staging ${method} lifecycle request failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return value;
}

async function ownerToken(fetchImpl, vault) {
  const owner = vault.accounts.find((entry) => entry.role === 'owner')
    ?? fail('The private lifecycle owner is unavailable.');
  const value = await apiRequest(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: owner.email, password: owner.password },
  });
  if (typeof value?.accessToken !== 'string' || value.accessToken.length < 20) {
    fail('The lifecycle owner login did not return a usable session.');
  }
  return value.accessToken;
}

async function verifyServerLifecycleState({
  vaultFile,
  title,
  expectedStatus,
  publicVisible,
  fetchImpl = globalThis.fetch,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const listingId = vault.realTwoRoleJourney?.listingId
    ?? fail('The private lifecycle listing is unavailable.');
  const token = await ownerToken(fetchImpl, vault);
  const mine = await apiRequest(fetchImpl, '/listings/mine', { token });
  const listing = (mine?.listings ?? []).find((entry) => entry?.id === listingId);
  if (listing?.title !== title
      || listing.status !== expectedStatus
      || listing.isActive !== (expectedStatus === 'active')) {
    fail('The exact owner listing did not reach the expected server lifecycle truth.');
  }
  const catalog = await apiRequest(
    fetchImpl,
    `/listings?q=${encodeURIComponent(title)}&sort=newest&limit=100`,
  );
  const publicMatch = (catalog?.listings ?? []).find((entry) => entry?.id === listingId);
  if ((publicMatch !== undefined) !== publicVisible
      || (publicVisible && publicMatch?.title !== title)) {
    fail('The public catalog does not match the exact listing lifecycle truth.');
  }
  const catalogRevision = Number(listing.catalogRevision);
  if (!Number.isSafeInteger(catalogRevision) || catalogRevision < 1) {
    fail('The listing catalog revision is invalid.');
  }
  return Object.freeze({
    status: `server-listing-${expectedStatus}-${publicVisible ? 'public' : 'private'}`,
    listingStatus: expectedStatus,
    publicVisible,
    catalogRevision,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
    containsToken: false,
  });
}

export async function runAndroidListingLifecycle({
  candidate,
  deviceSummary,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  const required = [
    'prepare',
    'editDraft',
    'verifyDraft',
    'publish',
    'verifyPublished',
    'verifyRenterVisibleBeforePause',
    'pause',
    'verifyPaused',
    'verifyRenterHiddenWhilePaused',
    'reactivate',
    'verifyReactivated',
    'verifyRenterVisibleAfterReactivate',
    'end',
    'verifyEnded',
    'verifyRenterHiddenAfterEnd',
    'retire',
    'restoreOwner',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The Pixel listing-lifecycle operations are incomplete.');
  }
  let prepared = null;
  let result = null;
  let retirement = null;
  let restored = false;
  let primaryFailure = null;
  let cleanupFailure = null;
  const stage = async (name, operation) => {
    try {
      return await operation();
    } catch (error) {
      fail(`Stage ${name} failed: ${sanitizedFailure(error)}`);
    }
  };
  try {
    prepared = await stage('prepare', () => operations.prepare());
    const edited = await stage('edit-draft', () => operations.editDraft(prepared));
    const draft = await stage('verify-draft', () => operations.verifyDraft(prepared, edited));
    const publishedUi = await stage('publish', () => operations.publish(prepared, edited));
    const published = await stage('verify-published', () => operations.verifyPublished(prepared, edited));
    const visibleBeforePause = await stage(
      'renter-visible-before-pause',
      () => operations.verifyRenterVisibleBeforePause(prepared, edited),
    );
    const pausedUi = await stage('pause', () => operations.pause(prepared, edited));
    const paused = await stage('verify-paused', () => operations.verifyPaused(prepared, edited));
    const hiddenWhilePaused = await stage(
      'renter-hidden-while-paused',
      () => operations.verifyRenterHiddenWhilePaused(prepared, edited),
    );
    const reactivatedUi = await stage(
      'reactivate',
      () => operations.reactivate(prepared, edited),
    );
    const reactivated = await stage(
      'verify-reactivated',
      () => operations.verifyReactivated(prepared, edited),
    );
    const visibleAfterReactivate = await stage(
      'renter-visible-after-reactivate',
      () => operations.verifyRenterVisibleAfterReactivate(prepared, edited),
    );
    const endedUi = await stage('end', () => operations.end(prepared, edited));
    const ended = await stage('verify-ended', () => operations.verifyEnded(prepared, edited));
    const hiddenAfterEnd = await stage(
      'renter-hidden-after-end',
      () => operations.verifyRenterHiddenAfterEnd(prepared, edited),
    );
    const revisions = [draft, published, paused, reactivated, ended]
      .map((entry) => entry.catalogRevision);
    if (edited.status !== 'pixel-owner-draft-edit-saved'
        || publishedUi.status !== 'pixel-owner-listing-published'
        || visibleBeforePause.status !== 'pixel-renter-listing-visible'
        || pausedUi.status !== 'pixel-owner-listing-pausiert'
        || hiddenWhilePaused.status !== 'pixel-renter-listing-hidden-stably'
        || reactivatedUi.status !== 'pixel-owner-listing-aktiv'
        || visibleAfterReactivate.status !== 'pixel-renter-listing-visible'
        || endedUi.status !== 'pixel-owner-listing-beendet'
        || hiddenAfterEnd.status !== 'pixel-renter-listing-hidden-stably'
        || revisions.some((revision, index) => index > 0 && revision <= revisions[index - 1])) {
      fail('The Pixel listing lifecycle did not close exactly.');
    }
    result = Object.freeze({
      edited,
      revisions,
    });
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
  if (retirement?.status !== 'email-verified-two-role-product-journey-retired'
      || restored !== true || result === null) {
    fail('The Pixel listing-lifecycle cleanup did not close exactly.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-listing-lifecycle',
    status: 'passed-pixel-listing-lifecycle',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      apkSha256: candidate.apkSha256,
    },
    device: deviceSummary,
    tests: {
      distinctEmailVerifiedPrincipals: 'passed',
      draftEditThroughPixelUi: 'passed-server-confirmed',
      publishThroughPixelUi: 'passed-server-and-public-catalog-confirmed',
      renterVisibilityBeforePause: 'passed',
      pauseThroughPixelUi: 'passed-server-confirmed-publicly-hidden',
      renterHiddenWhilePaused: 'passed-three-stable-settled-observations',
      reactivateThroughPixelUi: 'passed-server-confirmed-publicly-visible',
      renterVisibilityAfterReactivate: 'passed',
      endThroughPixelUi: 'passed-server-confirmed-publicly-hidden',
      renterHiddenAfterEnd: 'passed-three-stable-settled-observations',
      catalogRevisionStrictlyAdvanced: true,
      cleanup: 'passed-listing-ended',
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
  const titleFor = ({ vaultFile }) => {
    const { vault } = readEmailVerifiedJourneyVault(vaultFile);
    return `${vault.realTwoRoleJourney.title}${editSuffix}`;
  };
  const operations = {
    prepare: () => prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile }),
    editDraft: ({ vaultFile }) => editDraftOnPixel({
      vaultFile, commandRunner, adbPath, device, wait,
    }),
    verifyDraft: ({ vaultFile }) => verifyServerLifecycleState({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedStatus: 'draft',
      publicVisible: false,
    }),
    publish: ({ vaultFile }) => ownerListingActionOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedBefore: 'Entwurf',
      action: 'Veröffentlichen',
      expectedAfter: 'Aktiv',
      draft: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyPublished: ({ vaultFile }) => verifyServerLifecycleState({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedStatus: 'active',
      publicVisible: true,
    }),
    verifyRenterVisibleBeforePause: ({ vaultFile }) => verifyRenterCatalogOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      visible: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    pause: ({ vaultFile }) => ownerListingActionOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedBefore: 'Aktiv',
      action: 'Pausieren',
      expectedAfter: 'Pausiert',
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyPaused: ({ vaultFile }) => verifyServerLifecycleState({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedStatus: 'paused',
      publicVisible: false,
    }),
    verifyRenterHiddenWhilePaused: ({ vaultFile }) => verifyRenterCatalogOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      visible: false,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    reactivate: ({ vaultFile }) => ownerListingActionOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedBefore: 'Pausiert',
      action: 'Aktivieren',
      expectedAfter: 'Aktiv',
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyReactivated: ({ vaultFile }) => verifyServerLifecycleState({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedStatus: 'active',
      publicVisible: true,
    }),
    verifyRenterVisibleAfterReactivate: ({ vaultFile }) => verifyRenterCatalogOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      visible: true,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    end: ({ vaultFile }) => ownerListingActionOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedBefore: 'Aktiv',
      action: 'Beenden',
      expectedAfter: 'Beendet',
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    verifyEnded: ({ vaultFile }) => verifyServerLifecycleState({
      vaultFile,
      title: titleFor({ vaultFile }),
      expectedStatus: 'ended',
      publicVisible: false,
    }),
    verifyRenterHiddenAfterEnd: ({ vaultFile }) => verifyRenterCatalogOnPixel({
      vaultFile,
      title: titleFor({ vaultFile }),
      visible: false,
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
  const evidence = await runAndroidListingLifecycle({
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
