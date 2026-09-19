import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { refundNotificationTruthTrusted } from '../src/notifications.js';

const source = readFileSync(
  new URL('../src/notifications.js', import.meta.url),
  'utf8',
);

test('non-refund delivery does not perform a refund-truth lookup', async () => {
  const database = {
    async query() {
      throw new Error('unexpected_refund_truth_query');
    },
  };
  assert.equal(await refundNotificationTruthTrusted({
    kind: 'payment_confirmed',
    booking_id: 'booking-1',
  }, database), true);
});

test('refund delivery requires the exact event-bound canonical provider success', async () => {
  const observed = [];
  const database = {
    async query(sql, parameters) {
      observed.push({ sql: String(sql), parameters });
      return { rows: [{ trusted: false }] };
    },
  };
  assert.equal(await refundNotificationTruthTrusted({
    kind: 'booking_refunded',
    booking_id: 'booking-1',
    event_key: 'refund:refund-1:succeeded',
  }, database), false);
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].parameters, [
    'booking-1',
    'separate_charge_manual_transfer_reversal_v1',
    'refund:refund-1:succeeded',
  ]);
  assert.match(
    observed[0].sql,
    /\$3 = 'refund:' \|\| refund\.id::text \|\| ':succeeded'/u,
  );
  assert.match(observed[0].sql, /refund\.status = 'succeeded'/u);
  assert.match(observed[0].sql, /refund\.provider_refund_id IS NOT NULL/u);
  assert.match(observed[0].sql, /refund\.succeeded_at IS NOT NULL/u);
  assert.match(observed[0].sql, /refund\.failure_code IS NULL/u);
  assert.match(observed[0].sql, /refund\.provider_refund_model = \$2/u);
  assert.match(observed[0].sql, /refund\.legacy_refund_platform_fee_claim IS NULL/u);
  assert.match(observed[0].sql, /JOIN sit_payment_refund_truth AS refund_truth/u);
  assert.match(
    observed[0].sql,
    /refund_truth\.refund_truth_status = 'providerBound'/u,
  );
});

test('legacy queued refund notifications are suppressed with an explicit review marker', () => {
  assert.match(
    source,
    /if \(!await refundNotificationTruthTrusted\(row\)\)[\s\S]*outcome: 'suppressed'/u,
  );
  assert.match(source, /provider: 'refund_truth_guard'/u);
  assert.match(source, /sourceTruthStatus: 'historical_unverified'/u);
  assert.match(source, /needsReview: true/u);
});
