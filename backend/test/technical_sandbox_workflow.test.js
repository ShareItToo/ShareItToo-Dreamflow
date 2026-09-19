import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTechnicalSandboxWebhook,
  createTechnicalSandboxCheckout,
  getTechnicalSandboxRun,
  technicalSandboxCapabilitiesFor,
  technicalSandboxConfigRevision,
  technicalSandboxRequestFingerprint,
  validateTechnicalSandboxReceipt,
  validateTechnicalSandboxWebhook,
} from '../src/technical_sandbox_workflow.js';
import { StripeProvider } from '../src/stripe_provider.js';
import { config } from '../src/config.js';

const now = new Date('2026-09-19T10:00:00.000Z');
const runId = 'technical_sandbox_12345678901234567890';
const userId = 'synthetic_sandbox_user_owner';
const configuration = Object.freeze({
  available: true,
  killSwitch: false,
  provider: 'stripe',
  mode: 'test',
  amountMinor: 100,
  currency: 'EUR',
  maxRunsPerUser24h: 3,
  authorizationId: 'wp266-sandbox-auth-001',
  authorizationIssuedAt: new Date('2026-09-19T09:00:00.000Z'),
  authorizationExpiresAt: new Date('2026-09-20T09:00:00.000Z'),
  expectedAccountId: 'acct_synthetic1234',
  webhookSecret: 'whsec_synthetic_secret_1234',
  allowlistedUserIds: [userId, 'synthetic_sandbox_user_renter'],
  syntheticEmailDomain: 'example.invalid',
});

function metadata() {
  return {
    sit_flow: 'technical_sandbox',
    technical_sandbox_run_id: runId,
    technical_sandbox_user_id: userId,
    technical_sandbox_authorization_id: configuration.authorizationId,
    technical_sandbox_config_revision: technicalSandboxConfigRevision(configuration),
  };
}

function receiptFixture(overrides = {}) {
  const shared = metadata();
  return {
    session: {
      id: 'cs_test_technical',
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: runId,
      payment_intent: 'pi_test_technical',
      amount_total: 100,
      currency: 'eur',
      livemode: false,
      metadata: shared,
      ...overrides.session,
    },
    paymentIntent: {
      id: 'pi_test_technical',
      object: 'payment_intent',
      status: 'succeeded',
      amount: 100,
      currency: 'eur',
      livemode: false,
      metadata: shared,
      ...overrides.paymentIntent,
    },
    accountId: overrides.accountId ?? configuration.expectedAccountId,
    accountLivemode: overrides.accountLivemode ?? false,
  };
}

test('capabilities are synthetic, fixed and unavailable to foreign users or disabled config', () => {
  const allowed = technicalSandboxCapabilitiesFor(userId, configuration);
  assert.deepEqual(allowed, {
    technicalSandboxAvailable: true,
    provider: 'stripe',
    mode: 'test',
    professionalReview: false,
    amountMinor: 100,
    currency: 'EUR',
    maxRunsPerUser24h: 3,
    syntheticOnly: true,
    liveMoney: false,
    bookingEffect: false,
    ledgerEffect: false,
    connectEffect: false,
  });
  assert.equal(technicalSandboxCapabilitiesFor('real-user', configuration).technicalSandboxAvailable, false);
  assert.equal(technicalSandboxCapabilitiesFor(userId, { ...configuration, available: false }).mode, 'disabled');
  assert.equal(technicalSandboxCapabilitiesFor(userId, {
    ...configuration,
    available: false,
    reason: 'authorization_expired',
    authorizationExpiresAt: new Date('2026-09-19T09:59:59.000Z'),
  }).technicalSandboxAvailable, false);
});

test('receipt validation requires exact test account, fixed amount, metadata and successful readback', () => {
  assert.equal(validateTechnicalSandboxReceipt({ ...receiptFixture(), runId, userId, configuration }).valid, true);
  for (const tamper of [
    { accountId: 'acct_foreign_1234' },
    { accountLivemode: true },
    { session: { amount_total: 101 } },
    { paymentIntent: { currency: 'usd' } },
    { session: { livemode: true } },
    { session: { payment_status: 'unpaid' } },
    { paymentIntent: { status: 'requires_payment_method' } },
    { session: { metadata: { ...metadata(), technical_sandbox_user_id: 'synthetic_sandbox_user_renter' } } },
  ]) {
    assert.equal(validateTechnicalSandboxReceipt({ ...receiptFixture(tamper), runId, userId, configuration }).valid, false);
  }
});

test('webhook binding accepts a verified direct account event but rejects foreign/mode/flow/replay bindings', () => {
  const valid = {
    id: 'evt_technical_001',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { metadata: { ...metadata() } } },
  };
  assert.equal(validateTechnicalSandboxWebhook(valid, configuration, { signatureVerified: true }).runId, runId);
  assert.throws(
    () => validateTechnicalSandboxWebhook({ ...valid, account: 'acct_foreign_1234' }, configuration, { signatureVerified: true }),
    (error) => error.code === 'technical_sandbox_webhook_account_invalid',
  );
  assert.throws(
    () => validateTechnicalSandboxWebhook(valid, configuration),
    (error) => error.code === 'technical_sandbox_webhook_account_unverified',
  );
  for (const event of [
    { ...valid, livemode: true },
    { ...valid, type: 'charge.succeeded' },
    { ...valid, data: { object: { metadata: { ...metadata(), sit_flow: 'payment' } } } },
    { ...valid, data: { object: { metadata: { ...metadata(), technical_sandbox_user_id: 'real-user' } } } },
  ]) {
    assert.throws(() => validateTechnicalSandboxWebhook(event, configuration, { signatureVerified: true }));
  }
});

function fakeDatabase({ existing = null, count = 0 } = {}) {
  const state = { row: existing, count, queries: [] };
  const client = {
    async query(sql, params = []) {
      state.queries.push(sql);
      if (sql.startsWith('SELECT * FROM technical_sandbox_runs WHERE idempotency_key')) {
        return state.row ? { rowCount: 1, rows: [state.row] } : { rowCount: 0, rows: [] };
      }
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT count(*)')) return { rowCount: 1, rows: [{ count: state.count }] };
      if (sql.startsWith('INSERT INTO technical_sandbox_runs')) {
        state.row = {
          id: runId,
          user_id: userId,
          idempotency_key: params[2],
          authorization_id: params[3],
          status: 'pending',
          amount_minor: 100,
          currency: 'EUR',
          synthetic_email: 'technical-sandbox+106dcbffb7567cdbc320@example.invalid',
          checkout_expires_at: new Date('2026-09-19T10:30:00.000Z'),
          provider_session_id: null,
          metadata: JSON.parse(params[8]),
        };
        return { rowCount: 1, rows: [state.row] };
      }
      if (sql.startsWith('UPDATE technical_sandbox_runs')) {
        state.row = { ...state.row, provider_session_id: params[1], provider_livemode: params[2], provider_session_status: params[3] };
        return { rowCount: 1, rows: [state.row] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const databasePool = { query: client.query.bind(client) };
  return {
    state,
    databasePool,
    transaction: async (fn) => fn(client),
  };
}

test('checkout creation uses isolated table, user cap lock and stable replay without booking/payment writes', async () => {
  const db = fakeDatabase();
  const provider = new StripeProvider({ mode: 'memory', livemode: false });
  const first = await createTechnicalSandboxCheckout({
    actor: { id: userId },
    key: 'technical-sandbox:key-00000001',
    configuration,
    provider,
    databasePool: db.databasePool,
    transaction: db.transaction,
    now,
    successUrl: 'https://example.invalid/success',
    cancelUrl: 'https://example.invalid/cancel',
  });
  assert.equal(first.status, 'pending');
  assert.equal(first.replayed, false);
  assert.match(first.checkoutUrl, /[?&]run_id=technical_sandbox_/u);
  assert.equal(db.state.queries.some((sql) => /\b(payments|bookings|ledger|connect)\b/iu.test(sql)), false);
  const replayProvider = {
    calls: 0,
    async createTechnicalSandboxCheckout() { this.calls += 1; throw new Error('must not recreate existing provider session'); },
    async retrieveTechnicalSandboxCheckout() { this.calls += 1; throw new Error('pending is not success'); },
  };
  const replay = await createTechnicalSandboxCheckout({
    actor: { id: userId },
    key: 'technical-sandbox:key-00000001',
    configuration,
    provider: replayProvider,
    databasePool: db.databasePool,
    transaction: db.transaction,
    now,
  });
  assert.equal(replay.status, 'pending');
  assert.equal(replay.replayed, true);
  assert.equal(replayProvider.calls, 1);
  const capped = fakeDatabase({ count: 3 });
  await assert.rejects(
    () => createTechnicalSandboxCheckout({
      actor: { id: userId },
      key: 'technical-sandbox:key-00000002',
      configuration,
      provider,
      databasePool: capped.databasePool,
      transaction: capped.transaction,
      now,
    }),
    (error) => error.code === 'technical_sandbox_run_limit_reached',
  );
  assert.equal(capped.state.queries.some((sql) => sql.startsWith('SELECT pg_advisory_xact_lock')), true);
});

test('default technical checkout redirects use the public API base path', async () => {
  const db = fakeDatabase();
  const memoryProvider = new StripeProvider({ mode: 'memory', livemode: false });
  let request;
  const provider = {
    async createTechnicalSandboxCheckout(input) {
      request = input;
      return memoryProvider.createTechnicalSandboxCheckout(input);
    },
  };
  await createTechnicalSandboxCheckout({
    actor: { id: userId },
    key: 'technical-sandbox:key-00000009',
    configuration,
    provider,
    databasePool: db.databasePool,
    transaction: db.transaction,
    now,
  });
  assert.equal(request.successUrl, `${config.publicBaseUrl}/payments/technical-sandbox/success`);
  assert.equal(request.cancelUrl, `${config.publicBaseUrl}/payments/technical-sandbox/cancel`);
});

test('attached open checkout resumes only with an exact provider binding', async () => {
  const row = {
    id: runId,
    user_id: userId,
    status: 'pending',
    amount_minor: 100,
    currency: 'EUR',
    synthetic_email: 'technical-sandbox+106dcbffb7567cdbc320@example.invalid',
    provider_session_id: 'cs_open_technical',
    checkout_expires_at: new Date('2026-09-19T10:30:00.000Z'),
  };
  const openSession = {
    id: 'cs_open_technical',
    object: 'checkout.session',
    status: 'open',
    payment_status: 'unpaid',
    client_reference_id: runId,
    customer_email: row.synthetic_email,
    amount_total: 100,
    currency: 'eur',
    livemode: false,
    url: 'https://checkout.stripe.com/c/pay/cs_open_technical',
    metadata: metadata(),
  };
  const baseProvider = {
    async retrieveTechnicalSandboxCheckout() {
      return { session: openSession, accountId: configuration.expectedAccountId, accountLivemode: false };
    },
  };
  const databasePool = { async query() { return { rowCount: 1, rows: [row] }; } };
  const valid = await getTechnicalSandboxRun({ actor: { id: userId }, runId, configuration, provider: baseProvider, databasePool });
  assert.equal(valid.checkoutUrl, openSession.url);
  const invalid = await getTechnicalSandboxRun({
    actor: { id: userId },
    runId,
    configuration,
    provider: {
      async retrieveTechnicalSandboxCheckout() {
        return { session: { ...openSession, customer_email: 'foreign@example.invalid' }, accountId: 'acct_foreign1234', accountLivemode: true };
      },
    },
    databasePool,
  });
  assert.equal(invalid.checkoutUrl, null);
});

test('a replay with stale authorization/fingerprint is rejected before provider work', async () => {
  const db = fakeDatabase({
    existing: {
      id: runId,
      user_id: userId,
      idempotency_key: 'technical-sandbox:key-00000001',
      authorization_id: 'old-auth',
      metadata: { flow: 'technical_sandbox', configRevision: 'old', requestFingerprint: 'old' },
      provider_session_id: null,
    },
  });
  const provider = { async createTechnicalSandboxCheckout() { throw new Error('must not call provider'); } };
  await assert.rejects(
    () => createTechnicalSandboxCheckout({
      actor: { id: userId },
      key: 'technical-sandbox:key-00000001',
      configuration,
      provider,
      databasePool: db.databasePool,
      transaction: db.transaction,
      now,
    }),
    (error) => error.code === 'technical_sandbox_replay_binding_conflict',
  );
  assert.equal(technicalSandboxRequestFingerprint({ userId, configuration }).length, 64);
});

test('lost provider response is recoverable with the same idempotency key', async () => {
  const db = fakeDatabase();
  const memoryProvider = new StripeProvider({ mode: 'memory', livemode: false });
  let calls = 0;
  const provider = {
    async createTechnicalSandboxCheckout(input) {
      calls += 1;
      if (calls === 1) throw new Error('simulated lost response');
      return memoryProvider.createTechnicalSandboxCheckout(input);
    },
  };
  await assert.rejects(() => createTechnicalSandboxCheckout({
    actor: { id: userId },
    key: 'technical-sandbox:key-00000003',
    configuration,
    provider,
    databasePool: db.databasePool,
    transaction: db.transaction,
    now,
  }));
  const recovered = await createTechnicalSandboxCheckout({
    actor: { id: userId },
    key: 'technical-sandbox:key-00000003',
    configuration,
    provider,
    databasePool: db.databasePool,
    transaction: db.transaction,
    now,
  });
  assert.equal(calls, 2);
  assert.match(recovered.checkoutUrl, /run_id=technical_sandbox_/u);
});

test('provider-session attachment is compare-and-set when another recovery wins', async () => {
  const db = fakeDatabase();
  const provider = new StripeProvider({ mode: 'memory', livemode: false });
  const concurrentRow = {
    id: runId,
    user_id: userId,
    status: 'pending',
    amount_minor: 100,
    currency: 'EUR',
    synthetic_email: 'technical-sandbox+106dcbffb7567cdbc320@example.invalid',
    checkout_expires_at: new Date('2026-09-19T10:30:00.000Z'),
    provider_session_id: 'cs_other_winner',
  };
  const originalQuery = db.databasePool.query;
  const casPool = {
    async query(sql, params) {
      if (sql.startsWith('UPDATE technical_sandbox_runs')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT * FROM technical_sandbox_runs WHERE id =')) {
        return { rowCount: 1, rows: [concurrentRow] };
      }
      return originalQuery(sql, params);
    },
  };
  await assert.rejects(() => createTechnicalSandboxCheckout({
    actor: { id: userId },
    key: 'technical-sandbox:key-00000004',
    configuration,
    provider,
    databasePool: casPool,
    transaction: db.transaction,
    now,
  }), (error) => error.code === 'technical_sandbox_run_attach_conflict');
  assert.equal(db.state.queries.some((sql) => sql.includes('provider_session_id IS NULL')), false);
});

test('receipt CAS miss rereads the current paid truth instead of returning stale pending', async () => {
  let reads = 0;
  const pending = {
    id: runId,
    user_id: userId,
    status: 'pending',
    amount_minor: 100,
    currency: 'EUR',
    provider_session_id: 'cs_test_technical',
    checkout_expires_at: new Date('2026-09-19T10:30:00.000Z'),
  };
  const paid = { ...pending, status: 'paid', provider_payment_intent_id: 'pi_test_technical' };
  const databasePool = {
    async query() {
      reads += 1;
      return { rowCount: 1, rows: [reads === 1 ? pending : paid] };
    },
  };
  const transaction = async (fn) => fn({
    async query() { return { rowCount: 0, rows: [] }; },
  });
  const result = await getTechnicalSandboxRun({
    actor: { id: userId },
    runId,
    configuration,
    provider: {
      async retrieveTechnicalSandboxCheckout() {
        return receiptFixture();
      },
    },
    databasePool,
    transaction,
  });
  assert.equal(result.status, 'paid');
  assert.equal(result.receipt.providerPaymentIntentId, 'pi_test_technical');
  assert.equal(reads, 2);
});

test('expired provider readback closes the run without manufacturing success', async () => {
  const row = {
    id: runId,
    user_id: userId,
    status: 'pending',
    amount_minor: 100,
    currency: 'EUR',
    provider_session_id: 'cs_test_expired',
    checkout_expires_at: new Date('2026-09-19T10:30:00.000Z'),
  };
  const result = await getTechnicalSandboxRun({
    actor: { id: userId },
    runId,
    configuration,
    provider: {
      async retrieveTechnicalSandboxCheckout() {
        const fixture = receiptFixture();
        return {
          ...fixture,
          session: {
          ...fixture.session,
            id: 'cs_test_expired',
            status: 'expired',
            payment_status: 'unpaid',
          },
          accountId: configuration.expectedAccountId,
          accountLivemode: false,
        };
      },
    },
    databasePool: { async query() { return { rowCount: 1, rows: [row] }; } },
    transaction: async (fn) => fn({
      async query() {
        return { rowCount: 1, rows: [{ ...row, status: 'expired', provider_session_status: 'expired' }] };
      },
    }),
  });
  assert.equal(result.status, 'expired');
  assert.equal(result.receipt, null);
  assert.equal(result.checkoutUrl, null);
});

test('raw webhook application rejects fabricated JSON and duplicate payload mutation', async () => {
  const valid = {
    id: 'evt_technical_002',
    type: 'checkout.session.completed',
    livemode: false,
    account: configuration.expectedAccountId,
    data: { object: { metadata: { ...metadata() } } },
  };
  await assert.rejects(
    () => applyTechnicalSandboxWebhook({
      event: valid,
      rawPayload: JSON.stringify(valid),
      configuration,
      signatureVerified: true,
    }),
    (error) => error.code === 'technical_sandbox_webhook_raw_payload_required',
  );
});
