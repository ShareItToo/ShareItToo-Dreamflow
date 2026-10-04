#!/usr/bin/env node

import {
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
} from './diagnose_current_head_android_main_navigation.mjs';

const exactLongPressDurationMs = 1200;

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function geometry(node) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (match === null) fail('The exact listing node has invalid bounds.');
  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);
  if (right <= left || bottom <= top) fail('The exact listing node has empty bounds.');
  return {
    x: Math.floor((left + right) / 2),
    y: Math.floor((top + bottom) / 2),
    area: (right - left) * (bottom - top),
  };
}

export function buildExactListingLongPressCommand(hierarchy, exactListingLabel) {
  if (typeof hierarchy !== 'string' || hierarchy.length === 0
      || typeof exactListingLabel !== 'string' || exactListingLabel.length < 8) {
    fail('The exact listing long-press input is invalid.');
  }
  const candidates = currentHeadAndroidNamedNodes(hierarchy, exactListingLabel)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .map((node) => geometry(node))
    .toSorted((left, right) => left.area - right.area);
  if (candidates.length === 0
      || (candidates.length > 1 && candidates[0].area === candidates[1].area)) {
    fail('The exact listing long-press target is missing or ambiguous.');
  }
  // Flutter exposes both the title semantics node and a larger merged card
  // node. The smallest unique exact-label region is the stable title target.
  const point = candidates[0];
  return Object.freeze([
    'shell', 'input', 'swipe',
    String(point.x), String(point.y), String(point.x), String(point.y),
    String(exactLongPressDurationMs),
  ]);
}

export function longPressExactListing({
  commandRunner,
  adbPath,
  device,
  hierarchy,
  exactListingLabel,
} = {}) {
  if (typeof commandRunner !== 'function') fail('An ADB command runner is required.');
  const command = buildExactListingLongPressCommand(hierarchy, exactListingLabel);
  currentHeadAndroidAdb(commandRunner, adbPath, device, command);
  return Object.freeze({
    exactTargetCount: 1,
    gesture: 'stationary-long-press',
    durationMs: exactLongPressDurationMs,
  });
}

export function hasExactOwnerBlockConfirmation(hierarchy, ownerDisplayName) {
  if (typeof hierarchy !== 'string' || hierarchy.length === 0
      || typeof ownerDisplayName !== 'string' || ownerDisplayName.length < 3) {
    return false;
  }
  return currentHeadAndroidNamedNodes(hierarchy, `${ownerDisplayName} blockieren?`).length === 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Abbrechen').length === 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Blockieren').length >= 1;
}

export function exactMessageCardVisible(hierarchy, exactListingLabel) {
  return typeof hierarchy === 'string'
    && typeof exactListingLabel === 'string'
    && currentHeadAndroidNamedNodes(hierarchy, exactListingLabel).length > 0;
}

export function classifyReportBlockLifecycleObservation(value) {
  if (value?.candidateMatched !== true) {
    fail('The report/block observation is not bound to the exact candidate.');
  }
  if (!exact(value.report, {
    screenBoundToExactListing: true,
    beforeExactTargetCount: 0,
    reasonCode: 'fraud_or_deception',
    uiSuccess: true,
    afterExactTargetCount: 1,
    serverStatusAccepted: true,
  })) {
    fail('The physical report observation is incomplete or ambiguous.');
  }
  if (!exact(value.block, {
    beforeExactOwnerCount: 0,
    uiSuccess: true,
    afterExactOwnerCount: 1,
    exactListingHidden: true,
    otherSameOwnerListingHidden: true,
    blockedUsersEntryVisible: true,
  })) {
    fail('The physical block observation is incomplete or ambiguous.');
  }
  if (!exact(value.unblock, {
    uiSuccess: true,
    afterExactOwnerCount: 0,
    emptyStateVisible: true,
    exactListingVisibleAgain: true,
  })) {
    fail('The physical unblock observation is incomplete or ambiguous.');
  }
  if (!exact(value.messageIsolation, {
    directBackendLifecyclePreviouslyProven: true,
    upcomingAcceptedBookingBlockRejectedByUi: true,
    nonBindingBookingCancelledBeforeBlock: true,
    contractCreated: false,
    paymentCreated: false,
    reservationCreated: false,
    exactChatVisibleBeforeBlock: true,
    exactCancelledChatVisibleBeforeBlock: true,
    exactChatAbsentFromAllDuringBlock: true,
    serverActiveThreadCountDuringBlock: 0,
    directMessageSendAttemptedDuringBlock: false,
    postUnblockChatRestorationClaimed: false,
  })) {
    fail('The message-isolation evidence boundary is overstated or ambiguous.');
  }
  if (!exact(value.cleanup, {
    freshListingEnded: true,
    freshListingRemovedFromPublicCatalog: true,
    olderSameOwnerSyntheticListingEnded: true,
    olderSameOwnerSyntheticListingRemovedFromPublicCatalog: true,
    messageIsolationListingEnded: true,
    messageIsolationListingRemovedFromPublicCatalog: true,
    temporaryBlockRemoved: true,
    moderationReportRetainedAsAudit: true,
    allDiagnosticSessionsRevoked: true,
    protectedOwnerSessionRestored: true,
    paymentEndpointCalled: false,
    monetaryEffectMinor: 0,
  })) {
    fail('The report/block cleanup is incomplete or ambiguous.');
  }
  return Object.freeze({
    status: 'passed-exact-candidate-pixel-report-block-unblock-visibility',
    physicalReportPassed: true,
    physicalBlockCyclePassed: true,
    visibilityIsolationPassed: true,
    physicalMessageIsolationPassed: true,
    directMessageSendAttemptedDuringBlock: false,
    cleanupPassed: true,
  });
}
