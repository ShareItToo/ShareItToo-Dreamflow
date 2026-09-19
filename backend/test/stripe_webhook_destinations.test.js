import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { stripeSignatureHeader } from '../src/payment_domain.js';
import { StripeProvider } from '../src/stripe_provider.js';

// Synthetic fixtures only. The actual SDK verifies signatures locally; no
// provider credential, network request, database or payment is used.
const snapshotSecret = 'whsec_snapshotunitfixture';
const connectSecret = 'whsec_connectunitfixture';
process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'stripe';
process.env.STRIPE_SECRET_KEY = 'rk_test_localunitfixture';
process.env.STRIPE_WEBHOOK_SECRET = snapshotSecret;
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = connectSecret;
process.env.STRIPE_LIVEMODE = 'false';
process.env.PAYMENT_PILOT_USER_IDS = 'synthetic-admin,synthetic-owner,synthetic-renter';
process.env.PAYMENT_SANDBOX_AUTHORIZATION_ID = 'WP146-AUTH-WEBHOOK-001';
process.env.PAYMENT_SANDBOX_AUTH_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
process.env.PAYMENT_SANDBOX_AUTH_EXPIRES_AT = new Date(Date.now() + 60 * 60_000).toISOString();
const { verifyAndApplyWebhook, stripeProvider } = await import('../src/payment_workflow.js');
const { pool } = await import('../src/db.js');

function payload(thin, overrides = {}) {
  return JSON.stringify({
    id: thin ? 'evt_thin_fixture' : 'evt_snapshot_fixture',
    object: thin ? 'v2.core.event' : 'event',
    type: thin ? 'v2.core.account[requirements].updated' : 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    ...(thin
      ? { related_object: { id: 'acct_fixture', type: 'v2.core.account' } }
      : { data: { object: { id: 'pi_fixture' } } }),
    ...overrides,
  });
}

function parse(body, signedWith, configuredConnectSecret = connectSecret) {
  const provider = new StripeProvider({ mode: 'stripe', secretKey: 'rk_test_localunitfixture' });
  return provider.parseWebhookEvent({
    rawBody: Buffer.from(body),
    signatureHeader: stripeSignatureHeader({ payload: body, secret: signedWith }),
    webhookSecret: snapshotSecret,
    connectWebhookSecret: configuredConnectSecret,
  });
}

test('real Stripe SDK accepts each event family only with its own destination secret', () => {
  for (const thin of [false, true]) {
    const body = payload(thin);
    assert.equal(parse(body, thin ? connectSecret : snapshotSecret).id,
      thin ? 'evt_thin_fixture' : 'evt_snapshot_fixture');
    assert.throws(() => parse(body, thin ? snapshotSecret : connectSecret),
      (error) => error.status === 400 && error.code === 'invalid_webhook_signature');
  }
});

test('missing thin secret never falls back to snapshot verification', () => {
  assert.throws(() => parse(payload(true), snapshotSecret, ''),
    (error) => error.code === 'webhook_destination_not_configured');
});

test('changing event family or raw payload invalidates the signature', () => {
  const provider = new StripeProvider({ mode: 'stripe', secretKey: 'rk_test_localunitfixture' });
  const body = payload(true);
  const signatureHeader = stripeSignatureHeader({ payload: body, secret: connectSecret });
  for (const changed of [body.replace('acct_fixture', 'acct_other'),
    body.replace('v2.core.account[requirements].updated', 'payment_intent.succeeded')]) {
    assert.throws(() => provider.parseWebhookEvent({
      rawBody: Buffer.from(changed), signatureHeader,
      webhookSecret: snapshotSecret, connectWebhookSecret: connectSecret,
    }), (error) => error.code === 'invalid_webhook_signature');
  }
});

test('workflow rejects wrong destination and live/unspecified mode before any API or DB work', async (t) => {
  const reads = t.mock.method(stripeProvider, 'retrieveConnectedAccount', async () => {
    throw new Error('unexpected provider read');
  });
  const db = t.mock.method(pool, 'query', async () => { throw new Error('unexpected database write'); });
  for (const [body, signingSecret, code] of [
    [payload(true), snapshotSecret, 'invalid_webhook_signature'],
    [payload(false), connectSecret, 'invalid_webhook_signature'],
    [payload(true, { livemode: true }), connectSecret, 'provider_livemode_mismatch'],
    [payload(true, { livemode: undefined }), connectSecret, 'provider_livemode_mismatch'],
    [payload(false, { livemode: true }), snapshotSecret, 'provider_livemode_mismatch'],
    [payload(false, { livemode: undefined }), snapshotSecret, 'provider_livemode_mismatch'],
  ]) {
    await assert.rejects(verifyAndApplyWebhook(Buffer.from(body),
      stripeSignatureHeader({ payload: body, secret: signingSecret })),
    (error) => error.code === code);
  }
  assert.equal(reads.mock.callCount(), 0);
  assert.equal(db.mock.callCount(), 0);
});

test('signed technical sandbox event is a main-destination no-op, unsigned metadata is rejected', async (t) => {
  const body = payload(false, {
    id: 'evt_technical_main_noop',
    data: { object: { id: 'pi_technical', metadata: { sit_flow: 'technical_sandbox' } } },
  });
  const db = t.mock.method(pool, 'query', async () => {
    throw new Error('technical main no-op must not touch payment DB');
  });
  assert.deepEqual(await verifyAndApplyWebhook(
    Buffer.from(body),
    stripeSignatureHeader({ payload: body, secret: snapshotSecret }),
    { allowTechnicalSandboxNoop: true },
  ), { received: true, ignored: true });
  await assert.rejects(
    verifyAndApplyWebhook(Buffer.from(body), 't=1,v1=forged', { allowTechnicalSandboxNoop: true }),
    (error) => error.code === 'invalid_webhook_signature',
  );
  assert.equal(db.mock.callCount(), 0);
});

test('verified thin workflow retrieves the account and keeps original raw payload for deduplication', async (t) => {
  const body = payload(true);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const queries = [];
  let delivered = false;
  const reads = t.mock.method(stripeProvider, 'retrieveConnectedAccount', async (id) => {
    assert.equal(id, 'acct_fixture');
    return { id, object: 'v2.core.account', closed: true };
  });
  t.mock.method(pool, 'query', async (sql, args) => {
    if (sql.startsWith('SELECT user_id FROM stripe_connect_accounts')) {
      assert.equal(args[0], 'acct_fixture');
      return { rowCount: 1, rows: [{ user_id: 'synthetic-owner' }] };
    }
    if (sql.startsWith('SELECT payload_sha256')) {
      return { rowCount: 1, rows: [{ payload_sha256: hash }] };
    }
    assert.match(sql, /INSERT INTO payment_provider_events/u);
    assert.equal(args[2], 'acct_fixture');
    assert.equal(args[4], hash);
    return { rowCount: delivered ? 0 : 1, rows: [] };
  });
  t.mock.method(pool, 'connect', async () => ({
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql.startsWith('SELECT * FROM payment_provider_events')) {
        return { rows: [{ payload_sha256: hash, status: delivered ? 'processed' : 'received' }] };
      }
      if (sql.startsWith('SELECT user_id FROM stripe_connect_accounts')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  }));
  assert.deepEqual(await verifyAndApplyWebhook(Buffer.from(body),
    stripeSignatureHeader({ payload: body, secret: connectSecret })),
  { duplicate: false, status: 'processed' });
  assert.equal(reads.mock.callCount(), 1);
  const update = queries.find(({ sql }) => sql.startsWith('UPDATE stripe_connect_accounts'));
  assert.equal(update.args[0], 'acct_fixture');
  assert.equal(update.args[3], false);
  assert.equal(update.args[4], 'restricted');
  assert.equal(queries.at(-1).sql, 'COMMIT');
  delivered = true;
  assert.deepEqual(await verifyAndApplyWebhook(Buffer.from(body),
    stripeSignatureHeader({ payload: body, secret: connectSecret })),
  { duplicate: true, status: 'processed' });
  assert.equal(queries.filter(({ sql }) => sql.startsWith('UPDATE stripe_connect_accounts')).length, 1);
});

test('connect cohort rejection happens before any provider account retrieval', async (t) => {
  const body = payload(true, { id: 'evt_unknown_cohort' });
  const reads = t.mock.method(stripeProvider, 'retrieveConnectedAccount', async () => {
    throw new Error('provider read must not happen');
  });
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT user_id FROM stripe_connect_accounts')) {
      return { rowCount: 0, rows: [] };
    }
    throw new Error('database mutation must not happen');
  });
  await assert.rejects(
    verifyAndApplyWebhook(Buffer.from(body),
      stripeSignatureHeader({ payload: body, secret: connectSecret })),
    (error) => error.code === 'connected_account_not_in_pilot_cohort',
  );
  assert.equal(reads.mock.callCount(), 0);
});

test('mapped recovery event remains processable after active cohort removal', async (t) => {
  const body = payload(false, {
    id: 'evt_recovery_after_cohort_removal',
    type: 'customer.updated',
    account: 'acct_recovery_fixture',
    data: { object: { id: 'cus_recovery_fixture', object: 'customer' } },
  });
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const queries = [];
  t.mock.method(pool, 'query', async (sql, args) => {
    queries.push({ sql, args });
    if (sql.startsWith('SELECT user_id FROM stripe_connect_accounts')) {
      return { rowCount: 1, rows: [{ user_id: 'synthetic-recovery-removed' }] };
    }
    if (sql.startsWith('INSERT INTO payment_provider_events')) {
      assert.equal(args[0], 'evt_recovery_after_cohort_removal');
      return { rowCount: 1, rows: [{ provider_event_id: args[0] }] };
    }
    throw new Error(`unexpected pool query: ${sql}`);
  });
  t.mock.method(pool, 'connect', async () => ({
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT * FROM payment_provider_events')) {
        return { rows: [{ payload_sha256: hash, status: 'received' }], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE payment_provider_events')) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected transaction query: ${sql}`);
    },
    release() {},
  }));
  assert.deepEqual(await verifyAndApplyWebhook(Buffer.from(body),
    stripeSignatureHeader({ payload: body, secret: snapshotSecret })),
  { duplicate: false, status: 'ignored' });
  assert.equal(queries.some(({ sql }) => sql.startsWith('UPDATE stripe_connect_accounts')), false);
});
