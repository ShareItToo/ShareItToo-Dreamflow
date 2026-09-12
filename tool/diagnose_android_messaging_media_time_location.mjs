#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  runStagingNonBindingSimulation,
} from './run_staging_non_binding_simulation.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const safeDeviceFilename = 'SIT-WP21-SAFE.png';
const safeDeviceFile = `/sdcard/Download/${safeDeviceFilename}`;
const safeLocationInput = 'SIT Testweg 1, 74072 Heilbronn';

function fail(message) {
  throw new Error(message);
}

function stagedError(message, stage) {
  const error = new Error(message);
  error.sitStage = stage;
  return error;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 320
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|fixture identifier|device serial)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

function bounds(node, label) {
  const match = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (match === null) fail(`The sanitized ${label} bounds are invalid.`);
  const box = {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
  if (!(box.right > box.left && box.bottom > box.top)) {
    fail(`The sanitized ${label} bounds are empty.`);
  }
  return box;
}

const composerOffsetsInLogicalPixels = Object.freeze({
  camera: 174,
  gallery: 126,
  schedule: 78,
  location: 30,
});

export function parseAndroidDisplayScale(output) {
  const value = nonEmpty(String(output), 'Android display density');
  const override = /Override density:\s*(\d+)/u.exec(value);
  const physical = /Physical density:\s*(\d+)/u.exec(value);
  const density = Number(override?.[1] ?? physical?.[1]);
  const scale = density / 160;
  if (!Number.isFinite(scale) || scale < 1 || scale > 5) {
    fail('The Android display density is invalid.');
  }
  return scale;
}

function activeEditFieldNodes(hierarchy) {
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? []).filter((node) => (
    currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText'
      && currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false'
  ));
}

export function composerActionPoint(hierarchy, action, deviceScale = 1) {
  const offset = composerOffsetsInLogicalPixels[action];
  if (offset === undefined) fail('The requested composer action is invalid.');
  const named = currentHeadAndroidNamedNodes(hierarchy, 'Nachricht…');
  const nodes = named.length > 0
    ? named
    : activeEditFieldNodes(hierarchy);
  if (nodes.length !== 1) {
    fail('The exact active message composer is unavailable.');
  }
  const field = bounds(nodes[0], 'message composer');
  if (!Number.isFinite(deviceScale) || deviceScale < 1 || deviceScale > 5) {
    fail('The exact active message composer scale is invalid.');
  }
  const point = {
    x: Math.round(field.left - (offset * deviceScale)),
    y: Math.floor((field.top + field.bottom) / 2),
  };
  if (point.x < 20 || point.y < 20) {
    fail('The requested composer action is outside the visible display.');
  }
  return Object.freeze(point);
}

function tapComposerAction(commandRunner, adbPath, device, hierarchy, action) {
  const deviceScale = parseAndroidDisplayScale(currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'wm', 'density'],
  ));
  const point = composerActionPoint(hierarchy, action, deviceScale);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
  return point;
}

export function uniqueClickableNodeContaining(hierarchy, exactNeedle) {
  const needle = nonEmpty(exactNeedle, 'The exact node needle');
  const matches = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true')
    .filter((node) => [
      currentHeadAndroidNodeAttribute(node, 'text'),
      currentHeadAndroidNodeAttribute(node, 'content-desc'),
    ].some((value) => typeof value === 'string' && value.includes(needle)));
  if (matches.length !== 1) {
    fail('The exact composite clickable row is not uniquely available.');
  }
  return matches[0];
}

function tapUniqueCompositeRow(
  commandRunner,
  adbPath,
  device,
  hierarchy,
  exactNeedle,
) {
  const node = uniqueClickableNodeContaining(hierarchy, exactNeedle);
  const box = bounds(node, 'exact composite clickable row');
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap',
    String(Math.floor((box.left + box.right) / 2)),
    String(Math.floor((box.top + box.bottom) / 2)),
  ]);
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value)
    ? value
    : null;
}

async function apiRequest(path, {
  token = null,
  method = 'GET',
  body = undefined,
  expected = [200],
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A WP21 Staging API path is invalid.');
  }
  // This owner-only physical-device diagnostic intentionally sends its
  // protected fixture inputs only to the fixed non-production SIT origin;
  // every dynamic resource identifier is encoded before it reaches `path`.
  // SIT-INTENTIONAL-EGRESS: reviewed and regression-bound.
  const response = await fetch(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw === '' ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  if (!expected.includes(response.status)) {
    const code = safeError(value?.error);
    fail(`Staging ${method} request failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return { status: response.status, value };
}

async function login(account) {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  const token = response.value?.accessToken;
  if (typeof token !== 'string' || token.length < 20) {
    fail(`The ${account.role} WP21 Staging session is unavailable.`);
  }
  return token;
}

function roleAccount(vault, role) {
  return vault.accounts.find((account) => account.role === role)
    ?? fail(`The ${role} WP21 role is unavailable.`);
}

function exactJourney(vault) {
  const journey = vault.realTwoRoleJourney;
  const simulation = vault.nonBindingSimulation;
  if (journey?.kind !== 'sit-staging-email-verified-two-role-product-journey'
      || journey.status !== 'synthetic-fixture-active'
      || simulation?.status !== 'accepted-chat-ready'
      || typeof simulation.threadId !== 'string'
      || typeof simulation.bookingId !== 'string') {
    fail('The isolated WP21 two-role message fixture is not ready.');
  }
  return { journey, simulation };
}

async function messageSnapshot(vaultFile) {
  const vault = readEmailVerifiedJourneyVault(vaultFile).vault;
  const { simulation } = exactJourney(vault);
  const [ownerToken, renterToken] = await Promise.all([
    login(roleAccount(vault, 'owner')),
    login(roleAccount(vault, 'renter')),
  ]);
  const [owner, renter, flow] = await Promise.all([
    apiRequest(
      `/message-threads/${encodeURIComponent(simulation.threadId)}/messages?limit=100`,
      { token: ownerToken },
    ),
    apiRequest(
      `/message-threads/${encodeURIComponent(simulation.threadId)}/messages?limit=100`,
      { token: renterToken },
    ),
    apiRequest(
      `/bookings/${encodeURIComponent(simulation.bookingId)}/flow-time`,
      { token: ownerToken },
    ),
  ]);
  const ownerMessages = Array.isArray(owner.value?.messages) ? owner.value.messages : null;
  const renterMessages = Array.isArray(renter.value?.messages) ? renter.value.messages : null;
  if (ownerMessages === null || renterMessages === null) {
    fail('The WP21 server message truth is malformed.');
  }
  const project = (messages) => messages.map((message) => ({
    id: message?.id,
    senderId: message?.senderId,
    text: message?.text,
    attachmentCount: Array.isArray(message?.attachments) ? message.attachments.length : 0,
  }));
  const ownerProjection = project(ownerMessages);
  const renterProjection = project(renterMessages);
  return {
    messageCount: ownerProjection.length,
    sameParticipantProjection:
      JSON.stringify(ownerProjection) === JSON.stringify(renterProjection),
    attachmentMessages: ownerProjection.filter(
      (message) => message.text === 'Foto hinzugefügt' && message.attachmentCount === 1,
    ),
    locationMessages: ownerProjection.filter(
      (message) => typeof message.text === 'string' && message.text.includes('LOCATION_SHARE|'),
    ),
    flow: flow.value?.state,
  };
}

function textIncludes(hierarchy, text) {
  return typeof hierarchy === 'string' && hierarchy.includes(text);
}

export function containsWp21LocationGateFeedback(hierarchy) {
  return textIncludes(hierarchy, 'Standortfreigabe noch gesperrt');
}

export function containsExactWp21MessageState(hierarchy, labels) {
  if (!Array.isArray(labels) || labels.length === 0
      || labels.some((label) => typeof label !== 'string' || label.length === 0)) {
    fail('The exact WP21 message-state labels are invalid.');
  }
  return labels.every((label) => textIncludes(hierarchy, label));
}

export function isExactWp21AddressEntrySurface(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Adresse teilen').length > 0
    && activeEditFieldNodes(hierarchy).length === 1;
}

export function classifySyntheticImagePickerSurface(hierarchy) {
  const value = String(hierarchy);
  const packages = new Set(
    (value.match(/<node\b[^>]*>/gu) ?? [])
      .map((node) => currentHeadAndroidNodeAttribute(node, 'package'))
      .filter((entry) => typeof entry === 'string' && entry.length > 0),
  );
  return Object.freeze({
    app: packages.has('com.shareittoo.app'),
    documentsUi: packages.has('com.google.android.documentsui'),
    mediaPicker: [...packages].some((entry) => (
      entry === 'com.google.android.providers.media.module'
        || entry.includes('photopicker')
    )),
    photoSheet: containsAllLabels(value, ['Foto hinzufügen', 'Aus Galerie wählen']),
    locationSheet: containsAllLabels(value, ['Standort teilen', 'Adresse teilen']),
    messagesSettings: textIncludes(value, 'Nachrichten-Einstellungen'),
    mainNavigation: containsAllLabels(value, [
      'Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT',
    ]),
    safeFilename: textIncludes(value, safeDeviceFilename),
    activeEditFields: activeEditFieldNodes(value).length,
  });
}

export function shouldRetrySyntheticGalleryTap(classification, attempt) {
  return (attempt === 2 || attempt === 5)
    && classification.app === true
    && classification.activeEditFields === 1
    && classification.photoSheet !== true
    && classification.locationSheet !== true
    && classification.mainNavigation !== true;
}

function dismissExternalImagePickerIfOpen({
  commandRunner,
  adbPath,
  device,
}) {
  const observed = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  const classification = classifySyntheticImagePickerSurface(observed);
  if (!classification.documentsUi && !classification.mediaPicker) return false;
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', 'KEYCODE_BACK',
  ]);
  return true;
}

function syntheticImagePickerFailure(classification, actionPoint) {
  return [
    'The sanitized WP21 synthetic image picker surface did not appear with classification',
    `app-${classification.app ? 1 : 0}`,
    `documents-${classification.documentsUi ? 1 : 0}`,
    `media-${classification.mediaPicker ? 1 : 0}`,
    `sheet-${classification.photoSheet ? 1 : 0}`,
    `location-${classification.locationSheet ? 1 : 0}`,
    `settings-${classification.messagesSettings ? 1 : 0}`,
    `navigation-${classification.mainNavigation ? 1 : 0}`,
    `file-${classification.safeFilename ? 1 : 0}`,
    `edit-fields-${classification.activeEditFields}.`,
    `tap-${actionPoint.x}-${actionPoint.y}.`,
  ].join(' ');
}

async function openExactChat({
  vault,
  role,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let stage = 'validate-private-journey';
  try {
    const { journey } = exactJourney(vault);
    stage = `bind-${role}-principal`;
    await bindExactRole({ vault, role, commandRunner, adbPath, device, wait });
    stage = `open-${role}-messages-destination`;
    let hierarchy = await openMainDestination({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'Nachrichten',
    });
    const inExactThread = (value) => (
      textIncludes(value, journey.title)
        && currentHeadAndroidNamedNodes(value, 'Bestätigt').length > 0
        && activeEditFieldNodes(value).length === 1
    );
    if (inExactThread(hierarchy)) return hierarchy;
    stage = `wait-${role}-thread-row`;
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: `${role} exact WP21 thread row`,
      predicate: (value) => textIncludes(value, journey.title),
      attempts: 40,
    });
    stage = `tap-${role}-thread-row`;
    tapUniqueCompositeRow(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      journey.title,
    );
    stage = `wait-${role}-exact-chat`;
    return await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: `${role} exact WP21 chat`,
      predicate: inExactThread,
      attempts: 40,
    });
  } catch (error) {
    if (stage === `wait-${role}-exact-chat`) {
      try {
        const observed = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
        const editFields = activeEditFieldNodes(observed).length;
        throw stagedError(
          `The exact WP21 chat failed during ${stage} with surface classification settings-${currentHeadAndroidNamedNodes(observed, 'Nachrichten-Einstellungen').length} title-${textIncludes(observed, exactJourney(vault).journey.title) ? 'present' : 'absent'} confirmed-${currentHeadAndroidNamedNodes(observed, 'Bestätigt').length} edit-fields-${editFields}.`,
          stage,
        );
      } catch (classificationError) {
        if (typeof classificationError?.message === 'string'
            && classificationError.message.includes('surface classification')) {
          throw classificationError;
        }
      }
    }
    throw stagedError(
      `The exact WP21 chat failed during ${stage}: ${sanitizedFailure(error)}.`,
      stage,
    );
  }
}

async function waitForMessageText({
  commandRunner,
  adbPath,
  device,
  wait,
  text,
  label,
  attempts = 70,
}) {
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts,
    intervalMs: 650,
    label,
    predicate: (hierarchy) => textIncludes(hierarchy, text),
  });
}

async function submitDefaultTimeProposal({
  hierarchy,
  segmentLabel,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let stage = 'tap-time-action';
  try {
    tapComposerAction(commandRunner, adbPath, device, hierarchy, 'schedule');
    stage = 'wait-time-coordination';
    let next = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'WP21 time coordination',
      predicate: (value) => containsAllLabels(value, ['Zeitabstimmung', segmentLabel]),
    });
    stage = 'tap-time-segment';
    tapLabel(commandRunner, adbPath, device, next, segmentLabel);
    stage = 'wait-time-picker';
    next = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: `WP21 ${segmentLabel} picker`,
      predicate: (value) => containsAllLabels(value, [
        `${segmentLabel} wählen`,
        'Uhrzeit anfragen',
      ]),
    });
    stage = 'tap-time-request';
    tapLabel(commandRunner, adbPath, device, next, 'Uhrzeit anfragen');
    stage = 'wait-time-request-message';
    return await waitForMessageText({
      commandRunner,
      adbPath,
      device,
      wait,
      text: `${segmentLabel} angefragt`,
      label: `WP21 ${segmentLabel} request`,
    });
  } catch (error) {
    throw stagedError(
      `The WP21 time proposal failed during ${stage}: ${sanitizedFailure(error)}.`,
      stage,
    );
  }
}

async function acceptTimeProposal({
  hierarchy,
  segmentLabel,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let stage = 'wait-counterparty-time-request';
  try {
    const ready = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: `WP21 ${segmentLabel} counterparty request`,
      attempts: 70,
      intervalMs: 650,
      predicate: (value) => containsExactWp21MessageState(value, [
        `${segmentLabel} angefragt`,
      ]),
    });
    stage = 'tap-counterparty-time-action';
    tapComposerAction(commandRunner, adbPath, device, ready, 'schedule');
    stage = 'wait-counterparty-time-coordination';
    let next = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'WP21 counterparty time coordination',
      predicate: (value) => containsAllLabels(value, ['Zeitabstimmung', segmentLabel]),
    });
    stage = 'tap-counterparty-time-segment';
    tapLabel(commandRunner, adbPath, device, next, segmentLabel);
    stage = 'wait-counterparty-time-action';
    next = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: `WP21 ${segmentLabel} counterparty action`,
      predicate: (value) => containsAllLabels(value, [
        `${segmentLabel} verwalten`,
        'Annehmen',
      ]),
    });
    stage = 'tap-counterparty-accept';
    tapLabel(commandRunner, adbPath, device, next, 'Annehmen');
    stage = 'wait-counterparty-confirmation';
    return await waitForMessageText({
      commandRunner,
      adbPath,
      device,
      wait,
      text: `${segmentLabel} bestätigt`,
      label: `WP21 ${segmentLabel} confirmation`,
    });
  } catch (error) {
    throw stagedError(
      `The WP21 time confirmation failed during ${stage}: ${sanitizedFailure(error)}.`,
      stage,
    );
  }
}

async function sendSyntheticAttachment({
  hierarchy,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const freshHierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  const galleryPoint = tapComposerAction(
    commandRunner,
    adbPath,
    device,
    freshHierarchy,
    'gallery',
  );
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(250);
    const observed = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (containsAllLabels(observed, ['Foto hinzufügen', 'Aus Galerie wählen'])) {
      tapLabel(
        commandRunner,
        adbPath,
        device,
        observed,
        'Aus Galerie wählen',
      );
      break;
    }
    if (textIncludes(observed, safeDeviceFilename)) break;
    const classification = classifySyntheticImagePickerSurface(observed);
    if (shouldRetrySyntheticGalleryTap(classification, attempt)) {
      tapComposerAction(
        commandRunner,
        adbPath,
        device,
        observed,
        'gallery',
      );
    }
  }
  let next;
  try {
    next = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'WP21 synthetic image picker',
      attempts: 40,
      predicate: (value) => textIncludes(value, safeDeviceFilename),
    });
  } catch {
    const observed = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    fail(syntheticImagePickerFailure(
      classifySyntheticImagePickerSurface(observed),
      galleryPoint,
    ));
  }
  tapLabel(commandRunner, adbPath, device, next, safeDeviceFilename);
  next = await waitForMessageText({
    commandRunner,
    adbPath,
    device,
    wait,
    text: 'Foto hinzugefügt',
    label: 'WP21 attachment delivery',
    attempts: 85,
  });
  return next;
}

async function verifyLocationFailClosed({
  hierarchy,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let stage = 'tap-location-action';
  try {
    tapComposerAction(commandRunner, adbPath, device, hierarchy, 'location');
    stage = 'wait-location-choice';
    let next = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP21 location choice',
    predicate: (value) => containsAllLabels(value, ['Standort teilen', 'Adresse teilen']),
    });
    stage = 'tap-address-choice';
    tapLabel(commandRunner, adbPath, device, next, 'Adresse teilen');
    stage = 'wait-address-entry';
    next = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP21 synthetic address entry',
    predicate: isExactWp21AddressEntrySurface,
    });
    stage = 'enter-synthetic-address';
    const entry = bounds(
    activeEditFieldNodes(next)[0],
    'synthetic address entry',
    );
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap',
    String(Math.floor((entry.left + entry.right) / 2)),
    String(Math.floor((entry.top + entry.bottom) / 2)),
    ]);
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', safeLocationInput.replaceAll(' ', '%s'),
    ]);
    stage = 'wait-address-continuation';
    next = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP21 synthetic address continuation',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Weiter').length === 1,
    });
    stage = 'tap-address-continuation';
    tapLabel(commandRunner, adbPath, device, next, 'Weiter');
    stage = 'wait-location-preview';
    next = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP21 location preview',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Nur teilen').length === 1,
    });
    stage = 'tap-location-share';
    tapLabel(commandRunner, adbPath, device, next, 'Nur teilen');
    stage = 'wait-location-server-gate';
    return await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'WP21 server-gated location result',
    attempts: 40,
    intervalMs: 650,
    predicate: containsWp21LocationGateFeedback,
    });
  } catch (error) {
    throw stagedError(
      `The WP21 location gate failed during ${stage}: ${sanitizedFailure(error)}.`,
      stage,
    );
  }
}

function exactFlowState(flow) {
  return flow !== null && typeof flow === 'object' && !Array.isArray(flow)
    && flow.handoverTimeConfirmed === true
    && flow.returnTimeConfirmed === true
    && typeof flow.handoverTimeRequested === 'string'
    && flow.handoverTimeRequested.length > 0
    && typeof flow.returnTimeRequested === 'string'
    && flow.returnTimeRequested.length > 0
    && Number.isSafeInteger(Number(flow.flowTimeRevision))
    && Number(flow.flowTimeRevision) >= 4;
}

export function summarizeMessagingMediaTimeLocation({
  candidate,
  deviceSummary,
  sourceDrift,
  afterAttachment,
  afterTimes,
  afterLocation,
  coldRestartVisible,
  ownerRestored,
  retired,
  capturedAt = new Date().toISOString(),
}) {
  if (candidate?.paymentMode !== 'memory' || candidate?.stripeLivemode !== false
      || sourceDrift?.mobileSourceChanged !== false
      || afterAttachment?.sameParticipantProjection !== true
      || afterAttachment?.attachmentMessages?.length !== 1
      || afterAttachment?.locationMessages?.length !== 0
      || afterTimes?.sameParticipantProjection !== true
      || afterTimes?.attachmentMessages?.length !== 1
      || !exactFlowState(afterTimes?.flow)
      || afterLocation?.messageCount !== afterTimes?.messageCount
      || afterLocation?.locationMessages?.length !== 0
      || afterLocation?.sameParticipantProjection !== true
      || coldRestartVisible !== true
      || ownerRestored !== true
      || retired?.status !== 'email-verified-two-role-product-journey-retired'
      || retired.bookingCancelled !== true
      || retired.listingEnded !== true) {
    fail('The WP21 Pixel messaging acceptance is incomplete.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-wp21-pixel-messaging-media-time-location',
    status: 'pixel-attachment-and-two-party-times-passed-location-gate-closed',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.android.apkSha256,
      signingCertificateSha256: candidate.android.signingCertificateSha256,
    },
    device: deviceSummary,
    tests: {
      syntheticImageSelectedThroughPixel: 'passed',
      privateAttachmentServerConfirmedExactlyOnce: 'passed',
      counterpartyAttachmentVisibility: 'passed',
      handoverTimeProposalAndCounterpartyConfirmation: 'passed',
      returnTimeProposalAndCounterpartyConfirmation: 'passed',
      participantServerProjectionEquality: 'passed',
      terminatedProcessMessagePersistence: 'passed',
      exactLocationBeforeRevealWindow: 'blocked-by-server-as-required',
      locationMessageCreatedBeforeRevealWindow: false,
      protectedOwnerSessionRestored: true,
      cleanup: 'passed-booking-cancelled-listing-ended-device-file-removed',
    },
    boundaries: {
      physicalPixelOnly: true,
      onePlusContacted: false,
      syntheticMediaOnly: true,
      privateLocationRecordedInEvidence: false,
      exactLocationSharedBeforeServerGate: false,
      bindingWorkflowStarted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      monetaryEffectMinor: 0,
      contractCreated: false,
      reservationCreated: false,
      productionChanged: false,
      googlePlayChanged: false,
      providerConfigurationChanged: false,
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

export async function runWp21Lifecycle({
  operations,
  candidate,
  deviceSummary,
  sourceDrift,
}) {
  const required = [
    'prepare',
    'activate',
    'simulate',
    'exercise',
    'retire',
    'restoreOwner',
    'removeDeviceFile',
  ];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The WP21 lifecycle operations are incomplete.');
  }
  let prepared = null;
  let exercised = null;
  let retired = null;
  let ownerRestored = false;
  let primaryFailure = null;
  let cleanupFailure = null;
  let cleanupStage = 'remove-synthetic-device-file';
  let stage = 'prepare-isolated-fixture';
  try {
    prepared = await operations.prepare();
    stage = 'activate-isolated-listing';
    await operations.activate(prepared);
    stage = 'create-non-binding-two-role-chat';
    await operations.simulate(prepared);
    stage = 'exercise-pixel-message-surfaces';
    exercised = await operations.exercise(prepared);
  } catch (error) {
    primaryFailure = stagedError(
      `The WP21 lifecycle failed during ${stage}: ${sanitizedFailure(error)}.`,
      error?.sitStage ? `${stage}/${error.sitStage}` : stage,
    );
  } finally {
    try {
      await operations.removeDeviceFile();
    } catch (error) {
      cleanupFailure = error;
    }
    if (prepared !== null) {
      cleanupStage = 'retire-isolated-fixture';
      try {
        retired = await operations.retire(prepared);
      } catch (error) {
        cleanupFailure ??= error;
      }
    }
    cleanupStage = 'restore-protected-owner';
    try {
      ownerRestored = await operations.restoreOwner() === true;
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (primaryFailure !== null) {
    if (cleanupFailure !== null) {
      throw stagedError(
        `${sanitizedFailure(primaryFailure)} Cleanup failed during ${cleanupStage}: ${sanitizedFailure(cleanupFailure)}.`,
        `${primaryFailure.sitStage}/cleanup-${cleanupStage}`,
      );
    }
    throw primaryFailure;
  }
  if (cleanupFailure !== null) {
    throw stagedError(
      `The WP21 lifecycle cleanup failed during ${cleanupStage}: ${sanitizedFailure(cleanupFailure)}.`,
      `cleanup-${cleanupStage}`,
    );
  }
  return summarizeMessagingMediaTimeLocation({
    candidate,
    deviceSummary,
    sourceDrift,
    ...exercised,
    ownerRestored,
    retired,
  });
}

async function exercisePixelMessaging({
  vaultFile,
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let stage = 'read-isolated-vault';
  try {
    if (dismissExternalImagePickerIfOpen({ commandRunner, adbPath, device })) {
      await wait(500);
    }
    const vault = readEmailVerifiedJourneyVault(vaultFile).vault;
    exactJourney(vault);
    stage = 'copy-synthetic-image';
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'push',
      resolve(repositoryRoot, 'assets/images/shareittoo_app_icon_master.png'),
      safeDeviceFile,
    ]);
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'am', 'broadcast',
      '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
      '-d', `file://${safeDeviceFile}`,
    ]);

    stage = 'open-owner-chat';
    let hierarchy = await openExactChat({
      vault,
      role: 'owner',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'send-synthetic-attachment';
    hierarchy = await sendSyntheticAttachment({
      hierarchy,
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'verify-attachment-server-truth';
    const afterAttachment = await messageSnapshot(vaultFile);
    if (afterAttachment.attachmentMessages.length !== 1
        || afterAttachment.sameParticipantProjection !== true) {
      fail('The synthetic WP21 attachment is not exactly once visible to both participants.');
    }

    stage = 'submit-handover-time';
    hierarchy = await submitDefaultTimeProposal({
      hierarchy,
      segmentLabel: 'Übergabezeit',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'open-renter-chat';
    hierarchy = await openExactChat({
      vault,
      role: 'renter',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'renter WP21 attachment and handover proposal',
      attempts: 70,
      intervalMs: 650,
      predicate: (value) => containsExactWp21MessageState(value, [
        'Foto hinzugefügt',
        'Übergabezeit angefragt',
      ]),
    });
    stage = 'accept-handover-time';
    hierarchy = await acceptTimeProposal({
      hierarchy,
      segmentLabel: 'Übergabezeit',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'submit-return-time';
    hierarchy = await submitDefaultTimeProposal({
      hierarchy,
      segmentLabel: 'Rückgabezeit',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'reopen-owner-chat';
    hierarchy = await openExactChat({
      vault,
      role: 'owner',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'accept-return-time';
    hierarchy = await acceptTimeProposal({
      hierarchy,
      segmentLabel: 'Rückgabezeit',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    stage = 'verify-two-party-time-server-truth';
    const afterTimes = await messageSnapshot(vaultFile);
    if (!exactFlowState(afterTimes.flow)) {
      fail('The two-party WP21 handover and return times are not server-confirmed.');
    }

    stage = 'verify-location-server-gate';
    await verifyLocationFailClosed({
      hierarchy,
      commandRunner,
      adbPath,
      device,
      wait,
    });
    const afterLocation = await messageSnapshot(vaultFile);
    if (afterLocation.messageCount !== afterTimes.messageCount
        || afterLocation.locationMessages.length !== 0) {
      fail('The server-gated WP21 location attempt created an unexpected message.');
    }

    stage = 'verify-terminated-process-persistence';
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'am', 'force-stop', 'com.shareittoo.app',
    ]);
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    await waitForCurrentHeadAndroidMainNavigation({
      commandRunner,
      adbPath,
      device,
      wait,
    });
    hierarchy = await openExactChat({
      vault,
      role: 'owner',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'terminated-process WP21 message state',
      attempts: 70,
      intervalMs: 650,
      predicate: (value) => containsExactWp21MessageState(value, [
        'Foto hinzugefügt',
        'Übergabezeit bestätigt',
        'Rückgabezeit bestätigt',
      ]),
    });
    const coldRestartVisible = true;
    return {
      afterAttachment,
      afterTimes,
      afterLocation,
      coldRestartVisible,
    };
  } catch (error) {
    throw stagedError(
      `The Pixel exercise failed during ${stage}: ${sanitizedFailure(error)}.`,
      error?.sitStage ? `${stage}/${error.sitStage}` : stage,
    );
  }
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceVaultFile = resolve(
    argumentValue(args, '--source-vault-file')
      ?? fail('--source-vault-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir')
      ?? fail('--candidate-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const archive = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const candidate = {
    ...validateCurrentPrivateAndroidCandidate(archive),
    paymentMode: 'memory',
    stripeLivemode: false,
  };
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(
    collectCurrentCandidateDriftPaths({
      root: repositoryRoot,
      candidateCommit: candidate.commit,
    }),
  );
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
  const wait = (milliseconds) => new Promise(
    (resolvePromise) => setTimeout(resolvePromise, milliseconds),
  );
  if (dismissExternalImagePickerIfOpen({ commandRunner, adbPath, device })) {
    await wait(500);
  }
  const source = readEmailVerifiedJourneyVault(sourceVaultFile).vault;
  const operations = {
    prepare: () => prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile }),
    activate: ({ vaultFile }) => activateStagingEmailVerifiedJourneyFixture({ vaultFile }),
    simulate: ({ vaultFile }) => runStagingNonBindingSimulation({ vaultFile }),
    exercise: ({ vaultFile }) => exercisePixelMessaging({
      vaultFile,
      commandRunner,
      adbPath,
      device,
      wait,
    }),
    retire: ({ vaultFile }) => retireStagingEmailVerifiedTwoRoleJourney({ vaultFile }),
    restoreOwner: async () => {
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
    removeDeviceFile: async () => {
      if (dismissExternalImagePickerIfOpen({ commandRunner, adbPath, device })) {
        await wait(500);
      }
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'rm', '-f', safeDeviceFile,
      ]);
    },
  };
  const evidence = await runWp21Lifecycle({
    operations,
    candidate,
    deviceSummary,
    sourceDrift,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const stage = typeof error?.sitStage === 'string'
        && /^[a-z0-9/-]+$/u.test(error.sitStage)
      ? `WP21 stage ${error.sitStage}: `
      : '';
    process.stderr.write(`ERROR: ${stage}${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
