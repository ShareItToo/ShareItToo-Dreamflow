import assert from 'node:assert/strict';
import test, { after } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'memory';
process.env.STRIPE_LIVEMODE = 'false';
process.env.PAYMENTS_ENABLED = 'true';
const { getBookingPayment } = await import('../src/payment_workflow.js');
const { pool } = await import('../src/db.js');
after(() => pool.end());

function row(status) {
  const refunded = status === 'refunded' ? 6600 : status === 'partially_refunded' ? 3300 : 0;
  return {
    id: 'synthetic-payment', booking_id: 'synthetic-booking',
    owner_id: 'synthetic-owner', renter_id: 'synthetic-renter',
    workflow_status: 'completed', simulation_only: false, status,
    booking_total_minor: 6600, booking_rental_subtotal_minor: 6000,
    booking_owner_payout_minor: 6000, booking_currency: 'EUR',
    amount_minor: 6600, captured_minor: status === 'requires_action' ? 0 : 6600,
    refunded_minor: refunded, transferred_minor: 0, platform_fee_minor: 600,
    owner_payout_minor: 6000, currency: 'EUR', livemode: false,
    updated_at: '2026-09-29T12:00:00Z',
    payout_id: null, available_at: null, paid_at: null,
    refund_truth_status: refunded ? 'providerBound' : 'none',
    untrusted_refund_count: '0', invalid_refund_count: '0', active_refund_count: '0',
    terminal_refund_count: '0', provider_observation_review_count: '0',
    provider_bound_local_pending_count: '0', provider_bound_local_review_count: '0',
    settled_refund_count: refunded ? '1' : '0', settled_refund_minor: String(refunded),
    settled_owner_refund_minor: refunded === 6600 ? '6000' : refunded === 3300 ? '3000' : '0',
    settled_refund_within_capture: true, refund_cache_matches_settlement: true,
    refund_status_matches_settlement: true,
  };
}

for (const status of ['requires_action', 'captured', 'partially_refunded', 'refunded']) {
  test(`memory ${status} projection is identical for both parties and repeat reads`, async (t) => {
    const query = t.mock.method(pool, 'query', async (sql, args) => {
      assert.match(sql, /^SELECT /u);
      assert.deepEqual(args, ['synthetic-booking']);
      return { rowCount: 1, rows: [row(status)] };
    });
    const read = (id) => getBookingPayment({ actor: { id, role: 'user' }, bookingId: 'synthetic-booking' });
    const owner = await read('synthetic-owner');
    assert.deepEqual(await read('synthetic-renter'), owner);
    assert.deepEqual(await read('synthetic-owner'), owner);
    assert.equal(owner.payment.status, status);
    assert.equal(owner.payment.livemode, false);
    assert.equal(owner.payment.refundedMinor, row(status).refunded_minor);
    assert.equal(owner.payout, null); // Completion alone is not a payout receipt.
    assert.equal(query.mock.callCount(), 3);
  });
}

test('memory projection rejects nonparties and nonbinding simulations', async (t) => {
  let value = row('captured');
  t.mock.method(pool, 'query', async () => ({ rowCount: 1, rows: [value] }));
  await assert.rejects(getBookingPayment({ actor: { id: 'outsider' }, bookingId: 'synthetic-booking' }), { code: 'payment_forbidden' });
  value = { ...value, simulation_only: true };
  await assert.rejects(getBookingPayment({ actor: { id: 'synthetic-owner' }, bookingId: 'synthetic-booking' }), { code: 'pilot_simulation_payment_forbidden' });
});
