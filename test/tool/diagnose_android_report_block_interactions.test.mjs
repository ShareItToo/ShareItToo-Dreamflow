import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactListingLongPressCommand,
  classifyReportBlockLifecycleObservation,
  exactMessageCardVisible,
  hasExactOwnerBlockConfirmation,
  longPressExactListing,
} from '../../tool/diagnose_android_report_block_interactions.mjs';

const label = 'WP72 exact synthetic listing';

function node({ name = label, bounds = '[120,300][920,700]', enabled = 'true' } = {}) {
  return `<node text="" content-desc="${name}" enabled="${enabled}" bounds="${bounds}" />`;
}

function observation() {
  return {
    candidateMatched: true,
    report: {
      screenBoundToExactListing: true,
      beforeExactTargetCount: 0,
      reasonCode: 'fraud_or_deception',
      uiSuccess: true,
      afterExactTargetCount: 1,
      serverStatusAccepted: true,
    },
    block: {
      beforeExactOwnerCount: 0,
      uiSuccess: true,
      afterExactOwnerCount: 1,
      exactListingHidden: true,
      otherSameOwnerListingHidden: true,
      blockedUsersEntryVisible: true,
    },
    unblock: {
      uiSuccess: true,
      afterExactOwnerCount: 0,
      emptyStateVisible: true,
      exactListingVisibleAgain: true,
    },
    messageIsolation: {
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
    },
    cleanup: {
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
    },
  };
}

test('builds one deterministic stationary long press on the exact listing node', () => {
  assert.deepEqual(buildExactListingLongPressCommand(`<hierarchy>${node()}</hierarchy>`, label), [
    'shell', 'input', 'swipe', '520', '500', '520', '500', '1200',
  ]);
});

test('selects the unique smallest exact-label region from Flutter merged semantics', () => {
  const title = node({ bounds: '[120,300][920,700]' });
  const mergedCard = node({ bounds: '[40,240][1040,1200]' });
  assert.deepEqual(
    buildExactListingLongPressCommand(`<hierarchy>${mergedCard}${title}</hierarchy>`, label),
    ['shell', 'input', 'swipe', '520', '500', '520', '500', '1200'],
  );
});

test('refuses missing, disabled, ambiguous and invalid listing targets', () => {
  assert.throws(() => buildExactListingLongPressCommand('<hierarchy />', label), /missing or ambiguous/u);
  assert.throws(
    () => buildExactListingLongPressCommand(`<hierarchy>${node({ enabled: 'false' })}</hierarchy>`, label),
    /missing or ambiguous/u,
  );
  assert.throws(
    () => buildExactListingLongPressCommand(`<hierarchy>${node()}${node()}</hierarchy>`, label),
    /missing or ambiguous/u,
  );
  assert.throws(
    () => buildExactListingLongPressCommand(`<hierarchy>${node({ bounds: '[1,1][1,1]' })}</hierarchy>`, label),
    /empty bounds/u,
  );
});

test('executes only the deterministic exact-node long press', () => {
  const calls = [];
  const result = longPressExactListing({
    commandRunner(file, args) {
      calls.push({ file, args });
      return '';
    },
    adbPath: '/private/adb',
    device: { serial: 'redacted-device' },
    hierarchy: `<hierarchy>${node()}</hierarchy>`,
    exactListingLabel: label,
  });
  assert.deepEqual(result, {
    exactTargetCount: 1,
    gesture: 'stationary-long-press',
    durationMs: 1200,
  });
  assert.deepEqual(calls, [{
    file: '/private/adb',
    args: [
      '-s', 'redacted-device', 'shell', 'input', 'swipe',
      '520', '500', '520', '500', '1200',
    ],
  }]);
});

test('recognizes the owner-bound confirmation and listing-bound message card', () => {
  const confirmation = `<hierarchy>${node({ name: 'SIT Test Vermieter blockieren?' })}${node({ name: 'Abbrechen' })}${node({ name: 'Blockieren' })}</hierarchy>`;
  assert.equal(hasExactOwnerBlockConfirmation(confirmation, 'SIT Test Vermieter'), true);
  assert.equal(hasExactOwnerBlockConfirmation(confirmation, 'Anderer Vermieter'), false);
  assert.equal(
    exactMessageCardVisible(
      `<hierarchy>${node({ name: `${label}\nAbgeschlossen\nKontrollierter Testchat` })}</hierarchy>`,
      label,
    ),
    true,
  );
});

test('accepts exact physical report, block, unblock, visibility and cleanup truth', () => {
  assert.deepEqual(classifyReportBlockLifecycleObservation(observation()), {
    status: 'passed-exact-candidate-pixel-report-block-unblock-visibility',
    physicalReportPassed: true,
    physicalBlockCyclePassed: true,
    visibilityIsolationPassed: true,
    physicalMessageIsolationPassed: true,
    directMessageSendAttemptedDuringBlock: false,
    cleanupPassed: true,
  });
});

test('rejects missing report readback and unsafe message-proof promotion', () => {
  const missingReport = observation();
  missingReport.report.afterExactTargetCount = 0;
  assert.throws(
    () => classifyReportBlockLifecycleObservation(missingReport),
    /report observation/u,
  );

  const overclaim = observation();
  overclaim.messageIsolation.directMessageSendAttemptedDuringBlock = true;
  assert.throws(
    () => classifyReportBlockLifecycleObservation(overclaim),
    /overstated or ambiguous/u,
  );
});

test('rejects incomplete reversible cleanup', () => {
  const changed = observation();
  changed.cleanup.temporaryBlockRemoved = false;
  assert.throws(
    () => classifyReportBlockLifecycleObservation(changed),
    /cleanup is incomplete/u,
  );
});
