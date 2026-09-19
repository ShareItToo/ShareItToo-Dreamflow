import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://localhost/fixture';
process.env.JWT_SECRET ??= crypto.randomBytes(48).toString('base64url');
process.env.PUSH_TRANSPORT = 'disabled';

const {
  buildFcmMessageForTest,
  isInvalidFcmTokenErrorForTest,
  sendPushToUser,
  transactionalPushContractForTest,
  V52_PUSH_BODY,
  V52_PUSH_CONTRACT_VERSION,
  V52_PUSH_TITLE,
} = await import('../src/push_sender.js');

test('FCM messages expose only the neutral V5.2 lock-screen contract', () => {
  const message = buildFcmMessageForTest(
    { token: 'device-token' },
    'booking_confirmed',
    { nowMs: Date.UTC(2026, 7, 20, 10, 0, 0) },
  );

  assert.equal(message.token, 'device-token');
  assert.deepEqual(message.notification, {
    title: V52_PUSH_TITLE,
    body: V52_PUSH_BODY,
  });
  assert.deepEqual(message.data, {
    contract: V52_PUSH_CONTRACT_VERSION,
    route: 'notifications',
  });
  assert.equal(message.android.priority, 'high');
  assert.equal(message.android.ttl, 60 * 60 * 1000);
  assert.equal(message.android.notification.icon, 'ic_stat_shareittoo_v2');
  assert.equal(
    message.android.notification.clickAction,
    'com.shareittoo.app.SIT_NOTIFICATION_CLICK',
  );
  assert.equal(message.apns.headers['apns-priority'], '10');
  assert.equal(
    message.apns.headers['apns-expiration'],
    String(Math.floor(Date.UTC(2026, 7, 20, 10, 0, 0) / 1000) + 60 * 60),
  );
  assert.equal(message.apns.payload.aps.category, 'SIT_TRANSACTIONAL_UPDATE');
});

test('transactional push kinds use short event-specific TTLs', () => {
  assert.equal(transactionalPushContractForTest('message_received').ttlSeconds, 15 * 60);
  assert.equal(transactionalPushContractForTest('booking_requested').ttlSeconds, 60 * 60);
  assert.equal(transactionalPushContractForTest('support_case_update').ttlSeconds, 60 * 60);
  assert.equal(transactionalPushContractForTest('return_case_opened').ttlSeconds, 6 * 60 * 60);
  assert.equal(transactionalPushContractForTest('booking_completed').ttlSeconds, 24 * 60 * 60);
});

test('every notification producer kind is allowlisted and marketing fails closed', () => {
  for (const kind of [
    'booking_requested',
    'booking_accepted',
    'booking_confirmed',
    'booking_active',
    'booking_returned',
    'booking_completed',
    'booking_declined',
    'booking_cancelled',
    'booking_refunded',
    'booking_disputed',
    'platform_withdrawal_received',
    'return_confirmation_reminder',
    'return_confirmation_window_closed',
    'return_report_window_closed',
    'return_case_opened',
    'return_case_response_due',
    'return_case_status_update',
    'support_case_update',
    'message_received',
    'payment_confirmed',
    'payout_sent',
    'payment_failed',
  ]) {
    assert.ok(transactionalPushContractForTest(kind).ttlSeconds > 0, kind);
  }
  assert.throws(
    () => transactionalPushContractForTest('marketing_campaign'),
    (error) => error?.code === 'push_kind_not_allowlisted',
  );
});

test('support push contains no case identifier, address, amount or damage detail', () => {
  const message = buildFcmMessageForTest(
    { token: 'device-token' },
    'support_case_update',
    { nowMs: Date.UTC(2026, 7, 22, 8, 0, 0) },
  );
  assert.deepEqual(message.data, {
    contract: V52_PUSH_CONTRACT_VERSION,
    route: 'notifications',
  });
  assert.deepEqual(message.notification, {
    title: 'Neue ShareItToo-Aktualisierung',
    body: 'In der App ansehen.',
  });
  const serialized = JSON.stringify(message);
  for (const sensitive of [
    '11111111-1111-4111-8111-111111111111',
    'Musterstraße',
    '99,99',
    'Schadensdetail',
  ]) {
    assert.doesNotMatch(serialized, new RegExp(sensitive, 'u'));
  }
});

test('disabled delivery still reports the exact TTL contract without provider traffic', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rowCount: 1,
        rows: [{ token: 'never-sent', token_hash: 'a'.repeat(64) }],
      };
    },
  };
  const result = await sendPushToUser(client, {
    userId: 'user-1',
    eventKey: 'message:private-id',
    kind: 'message_received',
  });
  assert.equal(result.outcome, 'suppressed');
  assert.equal(result.provider, 'disabled');
  assert.equal(result.ttlSeconds, 15 * 60);
  assert.equal(result.contractVersion, 'v52');
  assert.equal(calls.length, 1);
});

test('invalid-token classification is narrow and transient errors remain retryable', () => {
  assert.equal(isInvalidFcmTokenErrorForTest({
    code: 'messaging/invalid-registration-token',
  }), true);
  assert.equal(isInvalidFcmTokenErrorForTest({
    code: 'messaging/registration-token-not-registered',
  }), true);
  assert.equal(isInvalidFcmTokenErrorForTest({
    code: 'messaging/internal-error',
  }), false);
});
