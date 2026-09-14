import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'memory';
process.env.STRIPE_LIVEMODE = 'false';
process.env.PUBLIC_COMPLIANCE_APPROVED = 'false';
process.env.FINANCIAL_DOCUMENTS_LIVE_ISSUANCE_APPROVED = 'false';
process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.FIREBASE_PHONE_VERIFICATION_ENABLED = 'false';
process.env.FIREBASE_CRASH_REPORT_DELETION_ENABLED = 'false';
process.env.PUSH_TRANSPORT = 'memory';
process.env.MAIL_TRANSPORT = 'memory';
process.env.SIT_LISTING_AI_PROVIDER = 'mock';
process.env.SIT_LISTING_AI_BUDGET_CENTS = '0';

const {
  createConnectOnboarding,
  createPaymentCheckout,
  refundPayment,
  reviewFailedPayout,
  stripeProvider,
} = await import('../src/payment_workflow.js');
const { requestHash } = await import('../src/payment_domain.js');
const { pool } = await import('../src/db.js');

after(() => pool.end());

const workflowSource = fs.readFileSync(
  new URL('../src/payment_workflow.js', import.meta.url),
  'utf8',
);

function compactSql(sql) {
  return String(sql).replace(/\s+/gu, ' ').trim();
}

function transactionClient(queryHandler) {
  const statements = [];
  return {
    statements,
    client: {
      async query(sql, parameters = []) {
        const statement = compactSql(sql);
        statements.push({ statement, parameters });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
          return { rowCount: 0, rows: [] };
        }
        if (statement.includes('pg_advisory_xact_lock')) {
          return { rowCount: 1, rows: [{}] };
        }
        return queryHandler(statement, parameters);
      },
      release() {},
    },
  };
}

function useTransactionClients(t, fixtures) {
  let index = 0;
  t.mock.method(pool, 'connect', async () => {
    const fixture = fixtures[index];
    index += 1;
    if (!fixture) throw new Error('unexpected_wp150_completion_transaction');
    return fixture.client;
  });
}

function assertNoStatement(fixtures, pattern) {
  const statements = fixtures.flatMap(({ statements }) => (
    statements.map(({ statement }) => statement)
  ));
  assert.equal(
    statements.some((statement) => pattern.test(statement)),
    false,
    statements.join('\n'),
  );
}

function assertCheckoutAdvisoryPrecedesStateLocks(fixture, bookingId) {
  const advisoryIndex = fixture.statements.findIndex(({ statement, parameters }) => (
    statement.includes('pg_advisory_xact_lock')
    && parameters[0] === `payment-checkout:${bookingId}`
  ));
  const stateLockIndex = fixture.statements.findIndex(({ statement }) => (
    statement.includes('payment_commands')
    || statement.includes('FROM bookings AS booking')
    || statement.includes('FROM payments')
  ));
  assert.ok(advisoryIndex >= 0, 'checkout advisory lock is missing');
  assert.ok(stateLockIndex > advisoryIndex, 'checkout state lock preceded advisory lock');
}

function connectReceipt(account) {
  return {
    exists: true,
    ready: true,
    onboardingRequired: false,
    country: account.country,
    currency: account.default_currency,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    transfersCapability: account.transfers_capability,
    accountApiVersion: account.account_api_version,
    recipientTransfersStatus: account.recipient_transfers_status,
    dashboard: account.dashboard_type,
    feeCollection: account.fees_collector,
    negativeBalanceLiability: account.losses_collector,
    disabledReason: account.disabled_reason,
    requirements: account.requirements,
    livemode: account.livemode,
    updatedAt: new Date(account.updated_at).toISOString(),
  };
}

function checkoutPaymentReceipt(payment, overrides = {}) {
  return {
    id: payment.id,
    bookingId: payment.booking_id,
    status: payment.status,
    amountMinor: Number(payment.amount_minor),
    capturedMinor: Number(payment.captured_minor),
    refundedMinor: Number(payment.refunded_minor),
    transferredMinor: Number(payment.transferred_minor),
    platformFeeMinor: Number(payment.platform_fee_minor),
    ownerPayoutMinor: Number(payment.owner_payout_minor),
    currency: payment.currency,
    failureCode: payment.failure_code,
    checkoutExpiresAt: payment.checkout_expires_at
      ? new Date(payment.checkout_expires_at).toISOString()
      : null,
    capturedAt: payment.captured_at ? new Date(payment.captured_at).toISOString() : null,
    livemode: payment.livemode,
    updatedAt: new Date(payment.updated_at).toISOString(),
    ...overrides,
  };
}

test('admin payout cancellation completes the command through the object contract and original actor', async (t) => {
  const admin = { id: 'wp150-review-admin', role: 'admin' };
  const originalActorId = 'wp150-original-payout-actor';
  const payoutId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0150';
  const paymentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0150';
  const bookingId = 'wp150-admin-cancel-booking';
  const commandKey = 'wp150-admin-cancel-command';
  const amountMinor = 3000;
  const command = {
    idempotency_key: commandKey,
    actor_id: originalActorId,
    command_type: 'payment.release',
    request_hash: requestHash({ paymentId, amountMinor }),
    booking_id: bookingId,
    payment_id: paymentId,
    response_payload: null,
    response_payload_sha256: null,
    completed_at: null,
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
    response_payload_hash_valid: false,
  };
  const payout = {
    id: payoutId,
    idempotency_key: commandKey,
    payment_id: paymentId,
    booking_id: bookingId,
    payee_id: 'wp150-owner',
    status: 'failed',
    failure_code: 'resource_missing',
    amount_minor: String(amountMinor),
    currency: 'EUR',
    payment_status: 'captured',
    payment_amount_minor: '3300',
    rental_subtotal_minor: '3000',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    security_deposit_minor: '0',
    captured_minor: '3300',
    refunded_minor: '0',
    transferred_minor: '0',
    payment_currency: 'EUR',
    provider_payment_id: 'pi_wp150_admin_cancel',
    provider_checkout_session_id: 'cs_wp150_admin_cancel',
    provider_charge_id: 'ch_wp150_admin_cancel',
    provider_customer_id: 'cus_wp150_admin_cancel',
    provider_payment_method_id: null,
    transfer_group: `booking_${bookingId}`,
    payment_failure_code: null,
    payment_checkout_expires_at: new Date('2026-09-14T10:30:00.000Z'),
    payment_captured_at: new Date('2026-09-14T09:00:00.000Z'),
    payment_livemode: false,
    payment_created_at: new Date('2026-09-14T08:55:00.000Z'),
    payment_updated_at: new Date('2026-09-14T09:05:00.000Z'),
  };
  let completionParameters;
  const transaction = transactionClient(async (statement, parameters) => {
    if (statement.includes('pg_advisory_xact_lock')) {
      return { rowCount: 1, rows: [{}] };
    }
    if (statement.includes('FROM payouts AS payout JOIN payments AS payment')) {
      return { rowCount: 1, rows: [payout] };
    }
    if (statement.includes('FROM payment_commands AS command')) {
      assert.deepEqual(parameters, [commandKey]);
      return { rowCount: 1, rows: [command] };
    }
    if (statement.startsWith('UPDATE payouts SET status = $2')) {
      assert.deepEqual(parameters, [
        payoutId,
        'cancelled',
        'manual_cancel_authorized',
      ]);
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('UPDATE payment_commands SET response_payload')) {
      completionParameters = parameters;
      return { rowCount: 1, rows: [{ idempotency_key: commandKey }] };
    }
    if (statement.startsWith('INSERT INTO audit_log')) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected_wp150_admin_cancel_sql:${statement}`);
  });
  t.mock.method(pool, 'query', async (sql, parameters = []) => {
    const statement = compactSql(sql);
    assert.match(statement, /^SELECT payout\.payment_id FROM payouts AS payout/u);
    assert.deepEqual(parameters, [payoutId]);
    return { rowCount: 1, rows: [{ payment_id: paymentId }] };
  });
  useTransactionClients(t, [transaction]);

  const result = await reviewFailedPayout({
    actor: admin,
    payoutId,
    action: 'cancel',
    reasonCode: 'provider_resource_missing',
  });

  assert.equal(result.payout.status, 'cancelled');
  assert.equal(result.payment.id, paymentId);
  assert.equal(result.replayed, false);
  assert.deepEqual(completionParameters?.slice(0, 2), [commandKey, paymentId]);
  assert.equal(JSON.parse(completionParameters?.[2] ?? '{}').payout.status, 'cancelled');
  assert.equal(completionParameters?.length, 5);
  assert.deepEqual(completionParameters?.slice(3), [0, 0]);
  assert.equal(
    transaction.statements.filter(({ statement }) => (
      statement.includes('FROM payment_commands AS command')
    )).length,
    2,
  );
});

test('admin payout cancellation wiring preserves the object-call contract and command actor', () => {
  const review = workflowSource.slice(
    workflowSource.indexOf('export async function reviewFailedPayout'),
    workflowSource.indexOf('export async function reconcilePaymentLifecycle'),
  );
  assert.match(
    review,
    /await completeCommand\(client, \{[\s\S]{0,240}key: payout\.idempotency_key,[\s\S]{0,240}actorId: command\.actor_id,[\s\S]{0,240}request: expectedRequest,[\s\S]{0,240}settlementSnapshot: \{[\s\S]{0,160}refundedMinor: response\.payment\.refundedMinor,[\s\S]{0,120}transferredMinor: response\.payment\.transferredMinor,[\s\S]{0,80}\}\);/u,
  );
  assert.doesNotMatch(review, /completeCommand\(client,\s*payout\.idempotency_key/u);
});

test('concurrent Connect completion returns the stored response without duplicate audit', async (t) => {
  const actor = {
    id: 'wp150-connect-owner',
    role: 'user',
    email: 'owner@example.invalid',
  };
  const key = 'wp150-connect-completion-race';
  const request = { country: 'DE', currency: 'EUR' };
  const incomplete = {
    idempotency_key: key,
    actor_id: actor.id,
    command_type: 'connect.onboard',
    request_hash: requestHash(request),
    booking_id: null,
    payment_id: null,
    response_payload: null,
    response_payload_sha256: null,
    completed_at: null,
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const account = {
    user_id: actor.id,
    provider_account_id: 'acct_wp150_connect_owner',
    country: 'DE',
    default_currency: 'EUR',
    details_submitted: true,
    charges_enabled: false,
    payouts_enabled: true,
    transfers_capability: 'active',
    requirements: {},
    disabled_reason: null,
    livemode: false,
    account_api_version: 'v2',
    dashboard_type: 'express',
    fees_collector: 'application',
    losses_collector: 'application',
    recipient_transfers_status: 'active',
    updated_at: new Date('2026-09-14T09:30:00.000Z'),
  };
  const storedResponse = {
    account: connectReceipt(account),
    onboardingUrl: 'https://stored.example.invalid/connect',
    expiresAt: '2026-09-14T11:00:00.000Z',
    providerMode: 'memory',
    replayed: false,
  };
  const completed = {
    ...incomplete,
    completed_at: new Date('2026-09-14T10:00:00.000Z'),
    completion_integrity_version: 1,
    response_payload: storedResponse,
    response_payload_sha256: 'a'.repeat(64),
    response_payload_hash_valid: true,
  };
  const begin = transactionClient(async (statement) => {
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')) {
      return { rowCount: 1, rows: [incomplete] };
    }
    throw new Error(`unexpected_wp150_connect_begin_sql:${statement}`);
  });
  const completion = transactionClient(async (statement) => {
    if (statement.includes('FROM payment_commands AS command')) {
      return { rowCount: 1, rows: [completed] };
    }
    throw new Error(`unexpected_wp150_connect_completion_sql:${statement}`);
  });
  t.mock.method(pool, 'query', async (sql, parameters = []) => {
    const statement = compactSql(sql);
    assert.equal(statement, 'SELECT * FROM stripe_connect_accounts WHERE user_id = $1');
    assert.deepEqual(parameters, [actor.id]);
    return { rowCount: 1, rows: [account] };
  });
  useTransactionClients(t, [begin, completion]);
  const linkCall = t.mock.method(stripeProvider, 'createAccountLink', async () => ({
    url: 'https://new.example.invalid/connect',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  const accountCall = t.mock.method(
    stripeProvider,
    'createConnectedAccount',
    async () => { throw new Error('unexpected_wp150_connected_account_creation'); },
  );

  const result = await createConnectOnboarding({
    actor,
    raw: request,
    key,
  });

  assert.deepEqual(result, { ...storedResponse, replayed: true });
  assert.equal(linkCall.mock.callCount(), 1);
  assert.equal(accountCall.mock.callCount(), 0);
  assertNoStatement([completion], /^(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/iu);
  assertNoStatement([begin, completion], /INSERT INTO audit_log/iu);
});

test('concurrent Checkout completion returns the stored response without payment rewrite or audit', async (t) => {
  const actor = {
    id: 'wp150-checkout-renter',
    role: 'user',
    email: 'renter@example.invalid',
    profile: { displayName: 'WP150 renter' },
  };
  const ownerId = 'wp150-checkout-owner';
  const bookingId = 'wp150-checkout-booking';
  const paymentId = 'cccccccc-cccc-4ccc-8ccc-cccccccc0150';
  const key = 'wp150-checkout-completion-race';
  const request = { bookingId };
  const checkoutExpiresAt = new Date(Date.now() + 40 * 60_000);
  const incomplete = {
    idempotency_key: key,
    actor_id: actor.id,
    command_type: 'payment.checkout',
    request_hash: requestHash(request),
    booking_id: bookingId,
    payment_id: null,
    response_payload: null,
    response_payload_sha256: null,
    completed_at: null,
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const booking = {
    id: bookingId,
    renter_id: actor.id,
    owner_id: ownerId,
    workflow_status: 'payment_pending',
    simulation_only: false,
    quoted_total_minor: '3300',
    rental_subtotal_minor: '3000',
    owner_payout_minor: '3000',
    currency: 'EUR',
    provider_account_id: 'acct_wp150_checkout_owner',
    account_api_version: 'v2',
    recipient_transfers_status: 'active',
    payouts_enabled: true,
    dashboard_type: 'express',
    fees_collector: 'application',
    losses_collector: 'application',
    listing_payload: {},
  };
  const payment = {
    id: paymentId,
    booking_id: bookingId,
    status: 'created',
    amount_minor: '3300',
    rental_subtotal_minor: '3000',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    security_deposit_minor: '0',
    captured_minor: '0',
    refunded_minor: '0',
    transferred_minor: '0',
    currency: 'EUR',
    failure_code: null,
    captured_at: null,
    checkout_command_key: key,
    checkout_expires_at: checkoutExpiresAt,
    transfer_group: `booking_${bookingId}`,
    livemode: false,
    updated_at: new Date(),
  };
  const storedResponse = {
    payment: checkoutPaymentReceipt(payment),
    checkoutUrl: 'https://stored.example.invalid/checkout',
    providerMode: 'memory',
    replayed: false,
  };
  const completed = {
    ...incomplete,
    payment_id: paymentId,
    completed_at: new Date(),
    completion_integrity_version: 1,
    response_payload: storedResponse,
    response_payload_sha256: 'b'.repeat(64),
    response_payload_hash_valid: true,
  };
  const prepare = transactionClient(async (statement, parameters) => {
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')) {
      return { rowCount: 1, rows: [incomplete] };
    }
    if (statement.includes('FROM bookings AS booking')) {
      return { rowCount: 1, rows: [booking] };
    }
    if (statement.startsWith('SELECT * FROM payments')) {
      return { rowCount: 1, rows: [payment] };
    }
    if (statement.startsWith('UPDATE payment_commands SET payment_id')) {
      assert.deepEqual(parameters, [key, paymentId]);
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected_wp150_checkout_prepare_sql:${statement}`);
  });
  const completion = transactionClient(async (statement, parameters) => {
    if (statement.includes('FROM payment_commands AS command')) {
      assert.deepEqual(parameters, [key]);
      return { rowCount: 1, rows: [completed] };
    }
    throw new Error(`unexpected_wp150_checkout_completion_sql:${statement}`);
  });
  t.mock.method(pool, 'query', async (sql, parameters = []) => {
    const statement = compactSql(sql);
    assert.equal(statement, 'SELECT * FROM stripe_customers WHERE user_id = $1');
    assert.deepEqual(parameters, [actor.id]);
    return {
      rowCount: 1,
      rows: [{ user_id: actor.id, provider_customer_id: 'cus_wp150_checkout_renter' }],
    };
  });
  useTransactionClients(t, [prepare, completion]);
  const checkoutCall = t.mock.method(stripeProvider, 'createPaymentCheckout', async () => ({
    id: 'cs_wp150_new_race_response',
    payment_intent: 'pi_wp150_new_race_response',
    url: 'https://new.example.invalid/checkout',
    expires_at: Math.floor(checkoutExpiresAt.getTime() / 1000),
  }));

  const result = await createPaymentCheckout({ actor, bookingId, key });

  assert.deepEqual(result, { ...storedResponse, replayed: true });
  assert.equal(checkoutCall.mock.callCount(), 1);
  assertCheckoutAdvisoryPrecedesStateLocks(prepare, bookingId);
  assertCheckoutAdvisoryPrecedesStateLocks(completion, bookingId);
  assertNoStatement([completion], /^(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/iu);
  assertNoStatement([prepare, completion], /^UPDATE payments\b/iu);
  assertNoStatement([prepare, completion], /INSERT INTO audit_log/iu);
});

test('early completed Connect replay without integrity version fails closed', async (t) => {
  const actor = {
    id: 'wp150-connect-integrity-owner',
    role: 'user',
    email: 'connect-integrity@example.invalid',
  };
  const key = 'wp150-connect-missing-integrity';
  const request = { country: 'DE', currency: 'EUR' };
  const account = {
    country: 'DE',
    default_currency: 'EUR',
    details_submitted: true,
    charges_enabled: false,
    payouts_enabled: true,
    transfers_capability: 'active',
    requirements: {},
    disabled_reason: null,
    livemode: false,
    account_api_version: 'v2',
    recipient_transfers_status: 'active',
    dashboard_type: 'express',
    fees_collector: 'application',
    losses_collector: 'application',
    updated_at: new Date('2026-09-14T09:30:00.000Z'),
  };
  const completed = {
    idempotency_key: key,
    actor_id: actor.id,
    command_type: 'connect.onboard',
    request_hash: requestHash(request),
    booking_id: null,
    payment_id: null,
    response_payload: {
      account: connectReceipt(account),
      onboardingUrl: 'https://stored.example.invalid/connect-integrity',
      expiresAt: '2026-09-14T11:00:00.000Z',
      providerMode: 'memory',
      replayed: false,
    },
    response_payload_sha256: 'c'.repeat(64),
    response_payload_hash_valid: true,
    completed_at: new Date('2026-09-14T10:00:00.000Z'),
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const transaction = transactionClient(async (statement) => {
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 0, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')
        || statement.includes('FROM payment_commands AS command')) {
      return { rowCount: 1, rows: [completed] };
    }
    throw new Error(`unexpected_wp150_connect_integrity_sql:${statement}`);
  });
  useTransactionClients(t, [transaction]);
  const directDatabase = t.mock.method(
    pool,
    'query',
    async () => { throw new Error('unexpected_wp150_connect_integrity_database_call'); },
  );
  const provider = t.mock.method(
    stripeProvider,
    'createAccountLink',
    async () => { throw new Error('unexpected_wp150_connect_integrity_provider_call'); },
  );

  await assert.rejects(
    createConnectOnboarding({ actor, raw: request, key }),
    (error) => error?.status === 409
      && error?.code === 'payment_command_replay_integrity_mismatch',
  );
  assert.equal(directDatabase.mock.callCount(), 0);
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(transaction.statements.at(-1)?.statement, 'ROLLBACK');
});

test('early completed Checkout replay with false response semantics fails closed', async (t) => {
  const actor = {
    id: 'wp150-checkout-integrity-renter',
    role: 'user',
    email: 'checkout-integrity@example.invalid',
  };
  const bookingId = 'wp150-checkout-integrity-booking';
  const paymentId = 'dddddddd-dddd-4ddd-8ddd-dddddddd0150';
  const key = 'wp150-checkout-false-semantics';
  const payment = {
    id: paymentId,
    booking_id: bookingId,
    status: 'created',
    amount_minor: '3300',
    captured_minor: '0',
    refunded_minor: '0',
    transferred_minor: '0',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    currency: 'EUR',
    failure_code: null,
    checkout_expires_at: new Date(Date.now() + 40 * 60_000),
    captured_at: null,
    livemode: false,
    updated_at: new Date('2026-09-14T10:00:00.000Z'),
  };
  const completed = {
    idempotency_key: key,
    actor_id: actor.id,
    command_type: 'payment.checkout',
    request_hash: requestHash({ bookingId }),
    booking_id: bookingId,
    payment_id: paymentId,
    response_payload: {
      payment: checkoutPaymentReceipt(payment, { id: 'different-payment-id' }),
      checkoutUrl: 'https://stored.example.invalid/checkout-integrity',
      providerMode: 'memory',
      replayed: false,
    },
    response_payload_sha256: 'd'.repeat(64),
    response_payload_hash_valid: true,
    completed_at: new Date('2026-09-14T10:00:00.000Z'),
    completion_integrity_version: 1,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const transaction = transactionClient(async (statement) => {
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 0, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')
        || statement.includes('FROM payment_commands AS command')) {
      return { rowCount: 1, rows: [completed] };
    }
    if (statement.startsWith('SELECT * FROM payments WHERE id = $1')) {
      return { rowCount: 1, rows: [payment] };
    }
    throw new Error(`unexpected_wp150_checkout_integrity_sql:${statement}`);
  });
  useTransactionClients(t, [transaction]);
  const directDatabase = t.mock.method(
    pool,
    'query',
    async () => { throw new Error('unexpected_wp150_checkout_integrity_database_call'); },
  );
  const provider = t.mock.method(
    stripeProvider,
    'createPaymentCheckout',
    async () => { throw new Error('unexpected_wp150_checkout_integrity_provider_call'); },
  );

  await assert.rejects(
    createPaymentCheckout({ actor, bookingId, key }),
    (error) => error?.status === 409
      && error?.code === 'payment_command_replay_integrity_mismatch',
  );
  assert.equal(directDatabase.mock.callCount(), 0);
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(transaction.statements.at(-1)?.statement, 'ROLLBACK');
});

test('concurrent Refund finalization replays the owner-bound completed result without financial DML', async (t) => {
  const actor = { id: 'wp150-refund-admin', role: 'admin' };
  const ownerId = 'wp150-refund-owner';
  const bookingId = 'wp150-refund-race-booking';
  const paymentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0150';
  const refundId = 'ffffffff-ffff-4fff-8fff-ffffffff0150';
  const ledgerId = '99999999-9999-4999-8999-999999990150';
  const key = 'wp150-refund-completion-race';
  const reason = 'wp150_concurrent_refund';
  const amountMinor = 1650;
  const providerRefundId = 're_wp150_concurrent_refund';
  const paymentUpdatedAt = new Date('2026-09-14T10:10:00.000Z');
  const initialPayment = {
    id: paymentId,
    booking_id: bookingId,
    owner_id: ownerId,
    renter_id: 'wp150-refund-renter',
    workflow_status: 'completed',
    status: 'captured',
    amount_minor: '3300',
    captured_minor: '3300',
    refunded_minor: '0',
    refunded_owner_minor: '0',
    transferred_minor: '0',
    rental_subtotal_minor: '3000',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    security_deposit_minor: '0',
    currency: 'EUR',
    failure_code: null,
    provider_charge_id: 'ch_wp150_concurrent_refund',
    transfer_group: `booking_${bookingId}`,
    checkout_expires_at: new Date('2026-09-14T10:45:00.000Z'),
    captured_at: new Date('2026-09-14T09:00:00.000Z'),
    livemode: false,
    updated_at: paymentUpdatedAt,
  };
  const createdRefund = {
    id: refundId,
    payment_id: paymentId,
    idempotency_key: key,
    status: 'created',
    amount_minor: String(amountMinor),
    currency: 'EUR',
    reason,
    provider_refund_id: null,
    provider_charge_id: initialPayment.provider_charge_id,
    owner_share_minor: '1500',
    platform_share_minor: '150',
    reverse_transfer: false,
    refund_platform_fee: true,
    livemode: false,
  };
  const succeededRefund = {
    ...createdRefund,
    status: 'succeeded',
    provider_refund_id: providerRefundId,
    succeeded_at: new Date('2026-09-14T10:10:00.000Z'),
  };
  const completedPayment = {
    ...initialPayment,
    status: 'partially_refunded',
    refunded_minor: String(amountMinor),
  };
  const storedResponse = {
    refund: {
      id: refundId,
      status: 'succeeded',
      amountMinor,
      currency: 'EUR',
    },
    payment: checkoutPaymentReceipt(completedPayment),
    replayed: false,
  };
  const incompleteCommand = {
    idempotency_key: key,
    actor_id: actor.id,
    command_type: 'payment.refund',
    request_hash: requestHash({ paymentId, amountMinor, reason }),
    booking_id: bookingId,
    payment_id: paymentId,
    response_payload: null,
    response_payload_sha256: null,
    response_payload_hash_valid: false,
    completed_at: null,
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const completedCommand = {
    ...incompleteCommand,
    response_payload: storedResponse,
    response_payload_sha256: 'e'.repeat(64),
    response_payload_hash_valid: true,
    completed_at: new Date('2026-09-14T10:10:00.000Z'),
    completion_integrity_version: 1,
    settlement_refunded_minor: String(amountMinor),
    settlement_transferred_minor: '0',
  };
  const ledger = {
    id: ledgerId,
    idempotency_key: `${key}:refund-ledger`,
    booking_id: bookingId,
    payment_id: paymentId,
    refund_id: refundId,
    payout_id: null,
    transaction_type: 'payment_refunded',
    currency: 'EUR',
    provider_reference: providerRefundId,
  };
  const ledgerEntries = [
    {
      account_code: 'owner_payable',
      account_owner_id: ownerId,
      debit_minor: '1500',
      credit_minor: '0',
    },
    {
      account_code: 'platform_revenue',
      account_owner_id: null,
      debit_minor: '150',
      credit_minor: '0',
    },
    {
      account_code: 'stripe_clearing',
      account_owner_id: null,
      debit_minor: '0',
      credit_minor: String(amountMinor),
    },
  ];

  const preparation = transactionClient(async (statement, parameters) => {
    if (statement.includes('FROM payments AS payment')
        && statement.includes('LEFT JOIN LATERAL')) {
      assert.deepEqual(parameters, [paymentId]);
      return { rowCount: 1, rows: [initialPayment] };
    }
    if (statement.includes('FROM payment_commands AS command')) {
      assert.deepEqual(parameters, [key]);
      return { rowCount: 0, rows: [] };
    }
    if (statement.startsWith('SELECT 1 FROM payouts')
        || statement.startsWith('SELECT 1 FROM disputes')
        || statement.startsWith('SELECT 1 FROM dispute_transfer_recoveries')
        || (statement.startsWith('SELECT 1 FROM refunds')
          && statement.includes("status = 'failed'"))) {
      return { rowCount: 0, rows: [] };
    }
    if (statement.startsWith('SELECT idempotency_key FROM refunds')) {
      return { rowCount: 0, rows: [] };
    }
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')) {
      return { rowCount: 1, rows: [incompleteCommand] };
    }
    if (statement === 'SELECT * FROM refunds WHERE idempotency_key = $1') {
      return { rowCount: 0, rows: [] };
    }
    if (statement.startsWith('INSERT INTO refunds')) {
      return { rowCount: 1, rows: [createdRefund] };
    }
    if (statement.includes('FROM refund_transfer_reversals WHERE refund_id = $1')) {
      return {
        rowCount: 1,
        rows: [{ count: 0, amount_minor: '0', succeeded_minor: '0' }],
      };
    }
    if (statement.startsWith('SELECT id, provider_transfer_id, amount_minor, reversed_minor FROM payouts')) {
      return { rowCount: 0, rows: [] };
    }
    throw new Error(`unexpected_wp150_refund_prepare_sql:${statement}`);
  });
  const finalization = transactionClient(async (statement, parameters) => {
    if (statement.startsWith('SELECT payment.*, booking.owner_id,')) {
      assert.match(statement, /JOIN bookings AS booking ON booking\.id = payment\.booking_id/u);
      assert.deepEqual(parameters, [paymentId, refundId, key]);
      return {
        rowCount: 1,
        rows: [{
          ...completedPayment,
          refund_status: 'succeeded',
          stored_provider_refund_id: providerRefundId,
          command_completed_at: completedCommand.completed_at,
          command_response_payload: storedResponse,
        }],
      };
    }
    if (statement.includes('FROM payment_commands AS command')) {
      assert.deepEqual(parameters, [key]);
      return { rowCount: 1, rows: [completedCommand] };
    }
    if (statement.startsWith('SELECT * FROM refunds')) {
      assert.deepEqual(parameters, [key, paymentId]);
      return { rowCount: 1, rows: [succeededRefund] };
    }
    if (statement.startsWith('SELECT * FROM ledger_transactions')) {
      assert.deepEqual(parameters, [refundId]);
      return { rowCount: 1, rows: [ledger] };
    }
    if (statement.startsWith('SELECT account_code, account_owner_id')) {
      assert.deepEqual(parameters, [ledgerId]);
      return { rowCount: ledgerEntries.length, rows: ledgerEntries };
    }
    throw new Error(`unexpected_wp150_refund_final_sql:${statement}`);
  });
  useTransactionClients(t, [preparation, finalization]);
  const directDatabase = t.mock.method(
    pool,
    'query',
    async () => { throw new Error('unexpected_wp150_refund_direct_database_call'); },
  );
  const providerLookup = t.mock.method(
    stripeProvider,
    'findRefund',
    async () => { throw new Error('unexpected_wp150_refund_lookup'); },
  );
  const providerCreate = t.mock.method(stripeProvider, 'createRefund', async () => ({
    id: providerRefundId,
    charge: initialPayment.provider_charge_id,
    amount: amountMinor,
    currency: 'eur',
    status: 'succeeded',
    livemode: false,
    metadata: {
      sit_booking_id: bookingId,
      sit_payment_id: paymentId,
      sit_refund_id: refundId,
      currency: 'EUR',
    },
  }));

  const result = await refundPayment({
    actor,
    paymentId,
    amountMinor,
    reason,
    key,
  });

  assert.deepEqual(result, { ...storedResponse, replayed: true });
  assert.equal(providerCreate.mock.callCount(), 1);
  assert.equal(providerLookup.mock.callCount(), 0);
  assert.equal(directDatabase.mock.callCount(), 0);
  assertNoStatement(
    [finalization],
    /^(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/iu,
  );
  assert.equal(finalization.statements.at(-1)?.statement, 'COMMIT');
});

test('different checkout key aliases the trusted canonical command under one lock order', async (t) => {
  const actor = {
    id: 'wp150-checkout-alias-renter',
    role: 'user',
    email: 'checkout-alias@example.invalid',
  };
  const bookingId = 'wp150-checkout-alias-booking';
  const paymentId = '12121212-1212-4212-8212-121212120150';
  const canonicalKey = 'wp150-checkout-canonical-k0';
  const aliasKey = 'wp150-checkout-alias-k1';
  const request = { bookingId };
  const checkoutExpiresAt = new Date(Date.now() + 40 * 60_000);
  const booking = {
    id: bookingId,
    renter_id: actor.id,
    owner_id: 'wp150-checkout-alias-owner',
    workflow_status: 'payment_pending',
    simulation_only: false,
    quoted_total_minor: '3300',
    rental_subtotal_minor: '3000',
    owner_payout_minor: '3000',
    currency: 'EUR',
    provider_account_id: 'acct_wp150_checkout_alias_owner',
    account_api_version: 'v2',
    recipient_transfers_status: 'active',
    payouts_enabled: true,
    dashboard_type: 'express',
    fees_collector: 'application',
    losses_collector: 'application',
    listing_payload: {},
  };
  const payment = {
    id: paymentId,
    booking_id: bookingId,
    status: 'created',
    amount_minor: '3300',
    rental_subtotal_minor: '3000',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    security_deposit_minor: '0',
    captured_minor: '0',
    refunded_minor: '0',
    transferred_minor: '0',
    currency: 'EUR',
    failure_code: null,
    captured_at: null,
    checkout_command_key: canonicalKey,
    checkout_expires_at: checkoutExpiresAt,
    transfer_group: `booking_${bookingId}`,
    livemode: false,
    updated_at: new Date('2026-09-14T10:20:00.000Z'),
  };
  const canonicalResponse = {
    payment: checkoutPaymentReceipt(payment),
    checkoutUrl: 'https://stored.example.invalid/checkout-canonical',
    providerMode: 'memory',
    replayed: false,
  };
  const canonicalCommand = {
    idempotency_key: canonicalKey,
    actor_id: actor.id,
    command_type: 'payment.checkout',
    request_hash: requestHash(request),
    booking_id: bookingId,
    payment_id: paymentId,
    response_payload: canonicalResponse,
    response_payload_sha256: 'f'.repeat(64),
    response_payload_hash_valid: true,
    completed_at: new Date('2026-09-14T10:20:00.000Z'),
    completion_integrity_version: 1,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const aliasCommand = {
    idempotency_key: aliasKey,
    actor_id: actor.id,
    command_type: 'payment.checkout',
    request_hash: requestHash(request),
    booking_id: bookingId,
    payment_id: null,
    response_payload: null,
    response_payload_sha256: null,
    response_payload_hash_valid: false,
    completed_at: null,
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  let completionParameters;
  const aliasing = transactionClient(async (statement, parameters) => {
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')) {
      assert.deepEqual(parameters, [aliasKey]);
      return { rowCount: 1, rows: [aliasCommand] };
    }
    if (statement.includes('FROM bookings AS booking')) {
      return { rowCount: 1, rows: [booking] };
    }
    if (statement.startsWith('SELECT * FROM payments')) {
      return { rowCount: 1, rows: [payment] };
    }
    if (statement.includes('FROM payment_commands AS command')) {
      if (parameters[0] === canonicalKey) {
        return { rowCount: 1, rows: [canonicalCommand] };
      }
      assert.deepEqual(parameters, [aliasKey]);
      return { rowCount: 1, rows: [aliasCommand] };
    }
    if (statement.startsWith('UPDATE payment_commands SET payment_id')) {
      assert.deepEqual(parameters, [aliasKey, paymentId]);
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('UPDATE payment_commands SET response_payload')) {
      completionParameters = parameters;
      return { rowCount: 1, rows: [{ idempotency_key: aliasKey }] };
    }
    throw new Error(`unexpected_wp150_checkout_alias_sql:${statement}`);
  });
  useTransactionClients(t, [aliasing]);
  const directDatabase = t.mock.method(
    pool,
    'query',
    async () => { throw new Error('unexpected_wp150_checkout_alias_database_call'); },
  );
  const provider = t.mock.method(
    stripeProvider,
    'createPaymentCheckout',
    async () => { throw new Error('unexpected_wp150_checkout_alias_provider_call'); },
  );

  const result = await createPaymentCheckout({
    actor,
    bookingId,
    key: aliasKey,
  });

  assert.deepEqual(result, { ...canonicalResponse, replayed: true });
  assert.equal(directDatabase.mock.callCount(), 0);
  assert.equal(provider.mock.callCount(), 0);
  assert.deepEqual(completionParameters?.slice(0, 2), [aliasKey, paymentId]);
  assert.deepEqual(JSON.parse(completionParameters?.[2] ?? '{}'), canonicalResponse);
  assert.deepEqual(completionParameters?.slice(3), [null, null]);
  assertCheckoutAdvisoryPrecedesStateLocks(aliasing, bookingId);
  assertNoStatement([aliasing], /^UPDATE payments\b|INSERT INTO audit_log/iu);
  assert.equal(aliasing.statements.at(-1)?.statement, 'COMMIT');
});
