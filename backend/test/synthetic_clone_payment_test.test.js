import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';
import http from 'node:http';
import { createSyntheticCloneBookingLane, registerSyntheticCloneBookingLaneRoutes } from '../src/synthetic_clone_booking_lane.js';
import { assertSyntheticPaymentTestEnvelope, SYNTHETIC_PAYMENT_NOTICE } from '../src/synthetic_clone_payment_test.js';

const ownerId = '00000000-0000-4000-8000-000000000011';
const renterId = '00000000-0000-4000-8000-000000000012';
const runId = 'wp255-20260929120000-aabbccdd';
const envelope = { requested: '1', cloneEnabled: true, localQa: true, deploymentEnvironment: 'test', bindHost: '127.0.0.1', transport: 'memory', livemode: false };
function fixture(enabled = true) {
  const lane = createSyntheticCloneBookingLane({ enabled: true, deploymentEnvironment: 'test', targetKind: 'clone', datasetId: 'wp255-green-clone-payment-test', runId, ownerId, renterId, secret: 'synthetic-local-only-secret-long-enough', ...(enabled ? { paymentTestEnvelope: envelope } : {}) });
  const booking = lane.createBooking({ actorId: renterId, listingId: 'synthetic_clone_listing_wp255' });
  const command = (action, extra = {}, key = `synthetic-key-${action}`) => lane.paymentTest.execute({ actorId: renterId, bookingId: booking.id, body: { runId, key, action, ...extra } });
  return { lane, booking, command };
}
const selection = { method: 'synthetic', scenario: 'challenge_then_capture' };

test('payment gate defaults off and rejects every unsafe envelope axis', () => {
  assert.equal(assertSyntheticPaymentTestEnvelope(), false);
  assert.equal(fixture(false).lane.paymentTest, null);
  assert.equal(assertSyntheticPaymentTestEnvelope(envelope), true);
  for (const patch of [{ requested: 'true' }, { requested: '' }, { cloneEnabled: false }, { localQa: false }, { deploymentEnvironment: 'staging' }, { deploymentEnvironment: 'production' }, { bindHost: '0.0.0.0' }, { bindHost: '::1' }, { transport: 'stripe' }, { livemode: true }]) {
    assert.throws(() => assertSyntheticPaymentTestEnvelope({ ...envelope, ...patch }));
  }
  assert.throws(() => createSyntheticCloneBookingLane({ enabled: true, deploymentEnvironment: 'clone', targetKind: 'clone', datasetId: 'wp255-green-clone-payment-test', runId, ownerId, renterId, secret: 'synthetic-local-only-secret-long-enough', paymentTestEnvelope: envelope }), /clone_environment_mismatch/u);
});

test('server owns challenge, capture, refund and replay without changing clone booking', () => {
  const { lane, booking, command } = fixture();
  const before = lane.getBooking({ actorId: ownerId, bookingId: booking.id });
  assert.equal(command('select', selection).payment.status, 'ready');
  assert.equal(command('submit').payment.status, 'requires_action');
  const captured = command('confirm');
  assert.equal(captured.payment.status, 'captured');
  assert.equal(captured.payment.capturedMinor, 6600);
  assert.equal(captured.quote.platformFeeMinor, 600);
  assert.equal(captured.marker.persistentNotice, SYNTHETIC_PAYMENT_NOTICE);
  assert.equal(captured.marker.monetaryEffectMinor, 0);
  assert.equal(captured.payout, null);
  const refunded = command('refund');
  assert.equal(refunded.payment.status, 'refunded');
  assert.equal(refunded.payment.refundedMinor, 6600);
  assert.deepEqual(command('refund'), { ...refunded, replayed: true });
  assert.deepEqual(command('confirm'), { ...captured, replayed: true });
  const ownerRead = lane.paymentTest.read({ actorId: ownerId, bookingId: booking.id, requestedRunId: runId });
  assert.equal(ownerRead.payment.status, 'refunded');
  assert.equal(ownerRead.audit.length, 4);
  assert.deepEqual(lane.getBooking({ actorId: ownerId, bookingId: booking.id }), before);
  assert.equal(lane.status().sideEffects.payment, false);
  assert.equal(lane.status().sideEffects.notification, false);
  const cleanup = lane.cleanup({ actorId: ownerId });
  assert.equal(cleanup.paymentTest.enabled, false);
  for (const field of ['states', 'commands', 'auditEvents']) assert.equal(cleanup.paymentTest[field], 0);
  assert.throws(() => command('refund'), /synthetic_payment_cleaned/u);
});

test('safe decline is terminal and cannot be forged into capture or refund', () => {
  const { command } = fixture();
  command('select', { ...selection, scenario: 'decline' });
  const declined = command('submit');
  assert.equal(declined.payment.status, 'failed');
  assert.equal(declined.payment.capturedMinor, 0);
  assert.throws(() => command('confirm'), /transition_invalid/u);
  assert.throws(() => command('refund'), /transition_invalid/u);
  assert.throws(() => command('select', { ...selection, status: 'captured' }, 'synthetic-forged-status'), /command_invalid/u);
  assert.throws(() => command('select', { ...selection, amountMinor: 1 }, 'synthetic-forged-amount'), /command_invalid/u);
  command('select', selection, 'synthetic-second-attempt');
  assert.equal(command('submit', {}, 'synthetic-second-submit').payment.status, 'requires_action');
});

test('exact principal, run, booking and idempotency payload are fenced', () => {
  const { lane, booking, command } = fixture();
  command('select', selection);
  assert.throws(() => command('select', { ...selection, scenario: 'decline' }), /idempotency_collision/u);
  assert.throws(() => command('submit', { runId: 'different-run' }), /run_mismatch/u);
  assert.throws(() => command('submit', {}, 'short'), /key_invalid/u);
  for (const actorId of [ownerId, 'outsider']) {
    assert.throws(() => lane.paymentTest.execute({ actorId, bookingId: booking.id, body: { runId, key: 'synthetic-owner-forgery', action: 'submit' } }));
  }
  assert.throws(() => lane.paymentTest.read({ actorId: renterId, bookingId: '00000000-0000-4000-8000-000000000099', requestedRunId: runId }));
  const second = lane.createBooking({ actorId: renterId, listingId: 'synthetic_clone_listing_wp255' });
  assert.throws(() => lane.paymentTest.execute({ actorId: renterId, bookingId: second.id, body: { runId, key: 'synthetic-key-select', action: 'select', ...selection } }), /idempotency_collision/u);
});

test('run resources are bounded while exact replay remains available at the limit', () => {
  const { lane, command } = fixture();
  for (let index = 0; index < 100; index += 1) {
    command('select', { ...selection, scenario: 'decline' }, `synthetic-select-${index}`);
    command('submit', {}, `synthetic-submit-${index}`);
  }
  assert.equal(lane.paymentTest.capability().commands, 200);
  assert.equal(command('submit', {}, 'synthetic-submit-99').replayed, true);
  assert.throws(() => command('select', selection, 'synthetic-over-limit'), /run_limit/u);
  const cleanup = lane.cleanup({ actorId: renterId });
  assert.equal(cleanup.paymentTest.commands, 0);
  assert.equal(cleanup.paymentTest.auditEvents, 0);
});

test('real loopback HTTP routes authenticate and return server-owned status; default has no route', async () => {
  for (const enabled of [false, true]) {
    const { lane, booking } = fixture(enabled);
    const app = express(); app.use(express.json());
    const requireAuth = (req, res, next) => {
      const actor = req.get('Authorization');
      if (![ownerId, renterId].includes(actor)) return res.status(401).json({ error: 'authentication_required' });
      req.auth = { userId: actor }; next();
    };
    registerSyntheticCloneBookingLaneRoutes(app, { lane, requireAuth, requireActiveAccount: (_req, _res, next) => next() });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}/v1/synthetic-clone/bookings/${booking.id}/payment-test`;
      assert.equal((await fetch(`${base}?runId=${runId}`)).status, enabled ? 401 : 404);
      if (!enabled) continue;
      const headers = { authorization: renterId, 'content-type': 'application/json' };
      for (const [action, extra] of [['select', selection], ['submit', {}], ['confirm', {}], ['refund', {}], ['refund', {}]]) {
        const response = await fetch(`${base}/commands`, { method: 'POST', headers, body: JSON.stringify({ runId, key: `synthetic-http-${action}`, action, ...extra }) });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
      const result = await (await fetch(`${base}?runId=${runId}`, { headers: { authorization: ownerId } })).json();
      assert.equal(result.payment.status, 'refunded');
      assert.equal(result.audit.length, 4);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  }
});

test('adapter import graph cannot load database, provider or network modules', () => {
  const visited = new Set();
  function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = readFileSync(url, 'utf8');
    assert.doesNotMatch(source, /\bimport\s*\(|\bfetch\s*\(|\brequire\s*\(/u);
    assert.doesNotMatch(source, /\bimport\s*['"]/u);
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const path = match[1];
      if (path === 'node:crypto') continue;
      assert.ok(path.startsWith('./'), `nonlocal dependency: ${path}`);
      assert.doesNotMatch(path, /(?:db|provider|payment_workflow|notifications)\.js$/u);
      visit(new URL(path, url));
    }
  }
  visit(new URL('../src/synthetic_clone_payment_test.js', import.meta.url));
  assert.ok(visited.size > 1);
});
