import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'memory';
const { getPublicPaymentLanding } = await import('../src/payment_workflow.js');
const { pool } = await import('../src/db.js');

test('public payment landing derives coarse truth from durable state only', async (t) => {
  const query = t.mock.method(pool, 'query', async (_sql, args) => {
    assert.equal(args[0], 'booking-truth');
    return {
      rowCount: 1,
      rows: [{ workflow_status: 'confirmed', simulation_only: false, status: 'captured' }],
    };
  });
  assert.deepEqual(await getPublicPaymentLanding('booking-truth'), { state: 'confirmed' });
  assert.equal(query.mock.callCount(), 1);
});

test('public payment landing never treats an absent or failed payment as success', async (t) => {
  const query = t.mock.method(pool, 'query', async (_sql, args) => ({
    rowCount: args[0] === 'booking-failed' ? 1 : 0,
    rows: args[0] === 'booking-failed'
      ? [{ workflow_status: 'payment_pending', simulation_only: false, status: 'failed' }]
      : [],
  }));
  assert.deepEqual(await getPublicPaymentLanding('booking-failed'), { state: 'failed' });
  assert.deepEqual(await getPublicPaymentLanding('unknown-booking'), { state: 'unknown' });
});
