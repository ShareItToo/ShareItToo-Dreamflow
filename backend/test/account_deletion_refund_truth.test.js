import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.MAIL_TRANSPORT = 'memory';
process.env.PUSH_TRANSPORT = 'disabled';
process.env.PAYMENT_TRANSPORT = 'memory';

const {
  accountDeletionPreflight,
  publicNotification,
} = await import('../src/app.js');

test('account deletion blocks legacy or noncanonical refund provider truth', async () => {
  const calls = [];
  const result = await accountDeletionPreflight({
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('AS active_bookings')) {
        return {
          rowCount: 1,
          rows: [{
            active_bookings: 0,
            open_payouts: 0,
            active_payments: 0,
            open_refund_reversals: 0,
            open_refunds: 1,
            open_disputes: 0,
            open_reports: 0,
            support_case_records: 0,
            active_legal_holds: 0,
          }],
        };
      }
      if (sql.includes('WITH target_bookings AS')) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error('unexpected_query');
    },
  }, 'user-1');

  assert.equal(result.canDelete, false);
  assert.deepEqual(result.blockers, [{
    id: 'open_refunds',
    label: 'Offene oder zu prüfende Erstattung',
    count: 1,
  }]);
  assert.deepEqual(calls[0].values, ['user-1']);
  assert.match(calls[0].sql, /JOIN sit_payment_refund_truth AS refund_truth/u);
  assert.match(
    calls[0].sql,
    /refund_truth\.refund_truth_status IN \('pending', 'needsReview'\)/u,
  );
});

test('notification readback neutralizes an unverified historical refund without mutating it', () => {
  const stored = {
    id: 'notification-1',
    category: 'payments',
    kind: 'booking_refunded',
    priority: 3,
    title: 'Erstattung bestätigt',
    body: 'Die Erstattung wurde veranlasst.',
    entity_type: 'payment',
    entity_id: 'booking-1',
    booking_id: 'booking-1',
    thread_id: null,
    action_url: '/payments/booking-1',
    payload: { ctaLabel: 'Erstattung ansehen' },
    read_at: null,
    archived_at: null,
    created_at: new Date('2026-09-14T10:00:00.000Z'),
    source_truth_status: 'historical_unverified',
  };

  const shaped = publicNotification(stored);
  assert.equal(shaped.title, 'Erstattungsstatus nicht bestätigt');
  assert.equal(shaped.body.includes('bestätigten Anbieterstatus'), true);
  assert.equal(shaped.body.includes('wurde veranlasst'), false);
  assert.equal(shaped.sourceTruthStatus, 'historical_unverified');
  assert.equal(shaped.needsReview, true);
  assert.equal(shaped.payload.sourceTruthStatus, 'historical_unverified');
  assert.equal(shaped.payload.needsReview, true);
  assert.equal(stored.title, 'Erstattung bestätigt');
  assert.equal(stored.payload.needsReview, undefined);
});

test('notification endpoint derives provider-bound truth from exact canonical refund evidence', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /notification\.kind <> 'booking_refunded'[\s\S]*notification\.event_key =[\s\S]*'refund:' \|\| refund\.id::text \|\| ':succeeded'[\s\S]*refund\.status = 'succeeded'[\s\S]*refund\.provider_refund_id IS NOT NULL[\s\S]*refund\.succeeded_at IS NOT NULL[\s\S]*refund\.failure_code IS NULL[\s\S]*refund\.provider_refund_model = \$5[\s\S]*refund\.legacy_refund_platform_fee_claim IS NULL/u);
  assert.match(source, /\[req\.auth\.userId, includeArchived, before, limit, trustedRefundProviderModel\]/u);
});
