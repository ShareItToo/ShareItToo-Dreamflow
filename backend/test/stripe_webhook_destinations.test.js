import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { stripeSignatureHeader } from '../src/payment_domain.js';
import { StripeProvider } from '../src/stripe_provider.js';

// Synthetic fixtures only. The actual SDK verifies signatures locally; no
// provider credential, network request, database or payment is used.
const snapshotSecret = 'whsec_snapshotunitfixture';
const connectSecret = 'whsec_connectunitfixture';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'stripe';
process.env.STRIPE_SECRET_KEY = 'rk_test_localunitfixture';
process.env.STRIPE_WEBHOOK_SECRET = snapshotSecret;
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = connectSecret;
process.env.STRIPE_LIVEMODE = 'false';
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
