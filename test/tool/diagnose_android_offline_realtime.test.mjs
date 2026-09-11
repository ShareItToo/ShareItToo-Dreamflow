import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeDefaultNetworkAbsent,
  isExpectedForegroundPushPopup,
  selectOfflineRealtimeFixture,
  telephonyDataDisconnected,
  visibleMessageOccurrenceCount,
} from '../../tool/diagnose_android_offline_realtime.mjs';

test('requires Android to release the active default network before offline send', () => {
  assert.equal(activeDefaultNetworkAbsent('Active default network: none\n'), true);
  assert.equal(activeDefaultNetworkAbsent('Active default network: 124\n'), false);
  assert.equal(activeDefaultNetworkAbsent('Current Networks:\n'), false);
});

test('recognizes only the privacy-preserving V5.2 foreground popup', () => {
  const hierarchy = [
    '<node content-desc="Benachrichtigung: Neue ShareItToo-Aktualisierung. In der App ansehen." />',
    '<node content-desc="Öffnen" />',
  ].join('');

  assert.equal(isExpectedForegroundPushPopup(hierarchy), true);
  assert.equal(
    isExpectedForegroundPushPopup(
      '<node content-desc="Benachrichtigung: Neue Nachricht. Eine Nachricht ist da." />'
        + '<node content-desc="Öffnen" />',
    ),
    false,
  );
  assert.equal(
    isExpectedForegroundPushPopup(
      '<node content-desc="Neue ShareItToo-Aktualisierung" />'
        + '<node content-desc="In der App ansehen." />',
    ),
    false,
  );
});

test('treats Android 17 no-service state minus one as disconnected', () => {
  assert.equal(telephonyDataDisconnected(
    'mDataConnectionState=-1\nmDataConnectionState=-1',
  ), true);
  assert.equal(telephonyDataDisconnected(
    'mDataConnectionState=-1\nmDataConnectionState=2',
  ), false);
  assert.equal(telephonyDataDisconnected('no telephony data state'), false);
});

test('counts a repeated diagnostic message against the pre-send baseline', () => {
  const message = 'Kontrollierte SIT Staging-Pushprüfung (offline).';
  assert.equal(visibleMessageOccurrenceCount(`<node content-desc="${message}" />`, message), 1);
  assert.equal(
    visibleMessageOccurrenceCount(
      `<node content-desc="${message}" /><node content-desc="${message}" />`,
      message,
    ),
    2,
  );
  assert.equal(visibleMessageOccurrenceCount('<node content-desc="andere Nachricht" />', message), 0);
});

test('accepts a payment-free non-binding conversation without weakening binding validation', () => {
  const safe = selectOfflineRealtimeFixture({
    realTwoRoleJourney: { title: 'SIT Rollenprüfung current' },
    nonBindingSimulation: {
      status: 'accepted-chat-ready',
      availabilityUnaffected: true,
      paymentReadRejected: true,
      stripeLivemode: false,
      paymentEndpointCalled: false,
      threadId: 'thread',
    },
  });
  assert.equal(safe?.workflowStatus, 'accepted');
  assert.equal(safe?.paymentMode, 'memory');
  assert.equal(safe?.nonBinding, true);
  assert.equal(selectOfflineRealtimeFixture({
    realTwoRoleJourney: { title: 'SIT Rollenprüfung current' },
    nonBindingSimulation: {
      status: 'accepted-chat-ready',
      availabilityUnaffected: false,
      paymentReadRejected: true,
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
  }), null);
});
