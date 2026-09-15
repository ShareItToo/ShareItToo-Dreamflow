import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const RealDate = Date;
const authorizationIssuedAt = new RealDate(RealDate.now() - 60_000);
const authorizationExpiresAt = new RealDate(RealDate.now() + 60 * 60_000);

process.env.NODE_ENV = 'test';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'stripe';
process.env.STRIPE_SECRET_KEY = ['rk', 'test', 'wp150syntheticfixture'].join('_');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_wp150syntheticfixture';
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_wp150connectfixture';
delete process.env.STRIPE_SECRET_KEY_FILE;
delete process.env.STRIPE_WEBHOOK_SECRET_FILE;
delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET_FILE;
process.env.STRIPE_LIVEMODE = 'false';
process.env.PAYMENT_PILOT_USER_IDS = 'wp150-synthetic-admin';
process.env.PAYMENT_SANDBOX_AUTHORIZATION_ID = 'WP150-AUTH-EXPIRY-TEST';
process.env.PAYMENT_SANDBOX_AUTH_ISSUED_AT = authorizationIssuedAt.toISOString();
process.env.PAYMENT_SANDBOX_AUTH_EXPIRES_AT = authorizationExpiresAt.toISOString();
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
  refundPayment,
  releasePayout,
  stripeProvider,
} = await import('../src/payment_workflow.js');
const { requestHash } = await import('../src/payment_domain.js');
const { pool } = await import('../src/db.js');

after(() => pool.end());

const actor = Object.freeze({
  id: 'wp150-synthetic-admin',
  role: 'admin',
});
const bookingId = 'wp150-expiry-booking';
const paymentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa150';
const refundId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb150';
const payoutId = 'cccccccc-cccc-4ccc-8ccc-ccccccccc150';
const refundLedgerId = 'dddddddd-dddd-4ddd-8ddd-ddddddddd150';
const payoutLedgerId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeee150';
const refundKey = 'wp150-expired-refund-replay';
const payoutKey = 'wp150-expired-payout-replay';
const refundReason = 'wp150_expired_replay';
const ownerId = 'wp150-expiry-owner';

function paymentRow(overrides = {}) {
  return {
    id: paymentId,
    booking_id: bookingId,
    owner_id: ownerId,
    renter_id: 'wp150-expiry-renter',
    workflow_status: 'completed',
    status: 'captured',
    amount_minor: '3300',
    captured_minor: '3300',
    refunded_minor: '0',
    transferred_minor: '0',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    currency: 'EUR',
    failure_code: null,
    provider_charge_id: 'ch_wp150_expiry',
    transfer_group: 'booking_wp150_expiry',
    livemode: false,
    updated_at: new RealDate('2026-09-14T09:40:00.000Z'),
    ...overrides,
  };
}

function refundLedgerEntries() {
  return [
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
      credit_minor: '1650',
    },
  ];
}

function transferLedgerEntries() {
  return [
    {
      account_code: 'owner_payable',
      account_owner_id: ownerId,
      debit_minor: '3000',
      credit_minor: '0',
    },
    {
      account_code: 'stripe_clearing',
      account_owner_id: null,
      debit_minor: '0',
      credit_minor: '3000',
    },
  ];
}

function paymentReceipt(overrides = {}) {
  return {
    id: paymentId,
    bookingId,
    status: 'captured',
    amountMinor: 3300,
    capturedMinor: 3300,
    refundedMinor: 0,
    transferredMinor: 0,
    platformFeeMinor: 300,
    ownerPayoutMinor: 3000,
    currency: 'EUR',
    failureCode: null,
    checkoutExpiresAt: '2026-09-14T09:45:00.000Z',
    capturedAt: '2026-09-14T09:15:00.000Z',
    livemode: false,
    updatedAt: '2026-09-14T09:40:00.000Z',
    ...overrides,
  };
}

function completedRefundScenario(overrides = {}) {
  const payment = paymentRow({
    status: 'partially_refunded',
    refunded_minor: '1650',
  });
  const refund = {
    id: refundId,
    idempotency_key: refundKey,
    payment_id: paymentId,
    status: 'succeeded',
    amount_minor: '1650',
    currency: 'EUR',
    reason: refundReason,
    provider_refund_id: 're_wp150_expiry',
    provider_charge_id: payment.provider_charge_id,
    owner_share_minor: '1500',
    platform_share_minor: '150',
    legacy_refund_platform_fee_claim: null,
    provider_refund_model: 'separate_charge_manual_transfer_reversal_v1',
    succeeded_at: new RealDate('2026-09-14T09:40:00.000Z'),
    failure_code: null,
    local_settlement_status: 'completed',
    local_settled_at: new RealDate('2026-09-14T09:40:01.000Z'),
    local_settlement_error_code: null,
    provider_observation_status: 'none',
    livemode: false,
  };
  const response = {
    refund: {
      id: refundId,
      status: 'succeeded',
      amountMinor: 1650,
      currency: 'EUR',
    },
    payment: paymentReceipt({
      status: 'partially_refunded',
      refundedMinor: 1650,
    }),
    replayed: false,
  };
  const ledger = {
    id: refundLedgerId,
    idempotency_key: `${refundKey}:refund-ledger`,
    booking_id: bookingId,
    payment_id: paymentId,
    refund_id: refundId,
    payout_id: null,
    transaction_type: 'payment_refunded',
    currency: 'EUR',
    provider_reference: refund.provider_refund_id,
    ...overrides.ledger,
  };
  return {
    payment,
    command: {
      idempotency_key: refundKey,
      command_type: 'payment.refund',
      actor_id: actor.id,
      payment_id: paymentId,
      booking_id: bookingId,
      request_hash: requestHash({ paymentId, amountMinor: 1650, reason: refundReason }),
      completed_at: new RealDate('2026-09-14T09:40:00.000Z'),
      response_payload: response,
      response_payload_hash_valid: true,
      completion_integrity_version: 1,
      settlement_refunded_minor: '1650',
      settlement_transferred_minor: '0',
      ...overrides.command,
    },
    refund: { ...refund, ...overrides.refund },
    ledger,
    ledgers: overrides.ledgers ?? [ledger],
    ledgerEntries: overrides.ledgerEntries ?? refundLedgerEntries(),
    refundTruth: overrides.refundTruth,
  };
}

function completedPayoutScenario(overrides = {}) {
  const payment = paymentRow({ transferred_minor: '3000' });
  const payout = {
    id: payoutId,
    idempotency_key: payoutKey,
    payment_id: paymentId,
    booking_id: bookingId,
    payee_id: payment.owner_id,
    status: 'paid',
    amount_minor: '3000',
    currency: 'EUR',
    provider_connected_account_id: 'acct_wp150_expiry',
    provider_transfer_id: 'tr_wp150_expiry',
    paid_at: new RealDate('2026-09-14T09:42:00.000Z'),
    livemode: false,
  };
  const response = {
    payout: {
      id: payoutId,
      status: 'paid',
      amountMinor: 3000,
      currency: 'EUR',
    },
    payment: paymentReceipt({ transferredMinor: 3000 }),
    replayed: false,
  };
  const ledger = {
    id: payoutLedgerId,
    idempotency_key: `${payoutKey}:transfer-ledger`,
    booking_id: bookingId,
    payment_id: paymentId,
    refund_id: null,
    payout_id: payoutId,
    transaction_type: 'owner_transfer',
    currency: 'EUR',
    provider_reference: payout.provider_transfer_id,
    ...overrides.ledger,
  };
  return {
    payment,
    command: {
      idempotency_key: payoutKey,
      command_type: 'payment.release',
      actor_id: actor.id,
      payment_id: paymentId,
      booking_id: bookingId,
      request_hash: requestHash({ paymentId, amountMinor: 3000 }),
      completed_at: new RealDate('2026-09-14T09:42:00.000Z'),
      response_payload: response,
      response_payload_hash_valid: true,
      completion_integrity_version: 1,
      settlement_refunded_minor: '0',
      settlement_transferred_minor: '3000',
      ...overrides.command,
    },
    payout: { ...payout, ...overrides.payout },
    ledger,
    ledgers: overrides.ledgers ?? [ledger],
    ledgerEntries: overrides.ledgerEntries ?? transferLedgerEntries(),
    refundTruth: overrides.refundTruth,
  };
}

function refundTruthRow(scenario) {
  const settledRefund = scenario.refund?.status === 'succeeded'
    && scenario.refund?.local_settlement_status === 'completed';
  const defaults = settledRefund
    ? {
        refund_truth_status: 'providerBound',
        settled_refund_count: '1',
        settled_refund_minor: scenario.refund.amount_minor,
        settled_owner_refund_minor: scenario.refund.owner_share_minor,
      }
    : {
        refund_truth_status: 'none',
        settled_refund_count: '0',
        settled_refund_minor: '0',
        settled_owner_refund_minor: '0',
      };
  return {
    payment_id: scenario.payment.id,
    untrusted_refund_count: '0',
    invalid_refund_count: '0',
    active_refund_count: '0',
    terminal_refund_count: '0',
    provider_observation_review_count: '0',
    provider_bound_local_pending_count: '0',
    provider_bound_local_review_count: '0',
    settled_refund_within_capture: true,
    refund_cache_matches_settlement: true,
    refund_status_matches_settlement: true,
    ...defaults,
    ...scenario.refundTruth,
  };
}

function needsReviewRefundTruth({ untrusted = false } = {}) {
  return {
    refund_truth_status: 'needsReview',
    untrusted_refund_count: untrusted ? '1' : '0',
    invalid_refund_count: untrusted ? '0' : '1',
    settled_refund_count: '0',
    settled_refund_minor: '0',
    settled_owner_refund_minor: '0',
    refund_cache_matches_settlement: false,
    refund_status_matches_settlement: false,
  };
}

function transactionClient(scenario) {
  const statements = [];
  const client = {
    async query(sql, parameters = []) {
      const statement = String(sql).replace(/\s+/gu, ' ').trim();
      statements.push(statement);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
        return { rowCount: 0, rows: [] };
      }
      if (statement.includes('pg_advisory_xact_lock')) {
        return { rowCount: 1, rows: [{}] };
      }
      if (statement.includes('FROM users')
          && statement.includes('id = ANY($1::text[])')) {
        const ids = parameters[0];
        return {
          rowCount: ids.length,
          rows: ids.map((id) => ({
            id,
            account_status: 'active',
            deactivated_at: null,
          })),
        };
      }
      if (statement.startsWith('SELECT * FROM sit_payment_refund_truth')) {
        assert.deepEqual(parameters, [scenario.payment.id]);
        return { rowCount: 1, rows: [refundTruthRow(scenario)] };
      }
      if (statement.includes('FROM payments AS payment')) {
        return { rowCount: 1, rows: [scenario.payment] };
      }
      if (statement.includes('FROM payment_commands AS command')) {
        return scenario.command == null
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [scenario.command] };
      }
      if (statement.startsWith('SELECT * FROM refunds')) {
        if (statement.includes('idempotency_key = $1')
            && parameters[0] !== scenario.refund?.idempotency_key) {
          return { rowCount: 0, rows: [] };
        }
        return scenario.refund == null
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [scenario.refund] };
      }
      if (statement.startsWith('SELECT * FROM payouts')) {
        return scenario.payout == null
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [scenario.payout] };
      }
      if (statement.includes("WHERE refund_id = $1 AND transaction_type = 'payment_refunded'")) {
        assert.deepEqual(parameters, [scenario.refund?.id ?? null]);
        return { rowCount: scenario.ledgers.length, rows: scenario.ledgers };
      }
      if (statement.includes("WHERE payout_id = $1 AND transaction_type = 'owner_transfer'")) {
        assert.deepEqual(parameters, [scenario.payout?.id ?? null]);
        return { rowCount: scenario.ledgers.length, rows: scenario.ledgers };
      }
      if (statement.includes('FROM ledger_entries WHERE transaction_id')) {
        assert.deepEqual(parameters, [scenario.ledger.id]);
        return { rowCount: scenario.ledgerEntries.length, rows: scenario.ledgerEntries };
      }
      if (statement.startsWith('SELECT 1 FROM payouts')
          || statement.startsWith('SELECT 1 FROM disputes')
          || statement.startsWith('SELECT 1 FROM dispute_transfer_recoveries')
          || statement.startsWith('SELECT idempotency_key FROM refunds')) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`unexpected_wp150_sql:${statement.slice(0, 120)}`);
    },
    release() {},
  };
  return { client, statements };
}

function useClients(t, scenarios) {
  const fixtures = scenarios.map(transactionClient);
  let index = 0;
  t.mock.method(pool, 'connect', async () => {
    const fixture = fixtures[index];
    index += 1;
    if (!fixture) throw new Error('unexpected_wp150_transaction');
    return fixture.client;
  });
  return fixtures;
}

function expireSandboxClock(t) {
  const fixedTime = authorizationExpiresAt.getTime() + 1;
  class ExpiredDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedTime] : args));
    }

    static now() {
      return fixedTime;
    }
  }
  globalThis.Date = ExpiredDate;
  t.after(() => { globalThis.Date = RealDate; });
}

const outboundProviderMethods = Object.freeze([
  'createRefund',
  'findRefund',
  'createTransfer',
  'findTransfer',
  'reverseTransfer',
  'findTransferReversal',
]);

function rejectOutboundProviderCalls(t) {
  return outboundProviderMethods.map((name) => t.mock.method(
    stripeProvider,
    name,
    async () => { throw new Error(`unexpected_wp150_provider_call:${name}`); },
  ));
}

function assertReadOnlyTransactions(fixtures) {
  const statements = fixtures.flatMap((fixture) => fixture.statements);
  assert.equal(
    statements.some((statement) => /^(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/iu.test(statement)),
    false,
    statements.join('\n'),
  );
}

function assertNoProviderCalls(mocks) {
  assert.ok(mocks.every((mock) => mock.mock.callCount() === 0));
}

test('expired Stripe sandbox authorization still returns bound completed results read-only', async (t) => {
  expireSandboxClock(t);
  const refund = completedRefundScenario();
  const payout = completedPayoutScenario();
  const fixtures = useClients(t, [refund, payout]);
  const providerMocks = rejectOutboundProviderCalls(t);

  assert.deepEqual(await refundPayment({
    actor,
    paymentId,
    amountMinor: 1650,
    reason: refundReason,
    key: refundKey,
  }), {
    ...refund.command.response_payload,
    replayed: true,
  });
  assert.deepEqual(await releasePayout({
    actor,
    paymentId,
    key: payoutKey,
  }), {
    ...payout.command.response_payload,
    replayed: true,
  });

  assertReadOnlyTransactions(fixtures);
  assertNoProviderCalls(providerMocks);
  assert.ok(fixtures.every(({ statements }) => statements.at(-1) === 'COMMIT'));
});

test('malformed completed results fail closed after expiry without provider or mutation', async (t) => {
  expireSandboxClock(t);
  const refund = completedRefundScenario({
    ledgerEntries: [],
    refundTruth: needsReviewRefundTruth(),
  });
  const payout = completedPayoutScenario({
    ledgerEntries: transferLedgerEntries().map((entry, index) => (
      index === 0 ? { ...entry, account_owner_id: 'different-owner' } : entry
    )),
  });
  const competingRefund = completedRefundScenario();
  competingRefund.ledgers.push({
    ...competingRefund.ledger,
    id: 'ffffffff-ffff-4fff-8fff-fffffffff150',
    idempotency_key: 'competing-expired-refund-ledger',
  });
  competingRefund.refundTruth = needsReviewRefundTruth();
  const competingPayout = completedPayoutScenario();
  competingPayout.ledgers.push({
    ...competingPayout.ledger,
    id: '99999999-9999-4999-8999-999999999150',
    idempotency_key: 'competing-expired-payout-ledger',
  });
  const legacyRefund = completedRefundScenario({
    refund: {
      legacy_refund_platform_fee_claim: true,
      provider_refund_model: null,
    },
    refundTruth: needsReviewRefundTruth({ untrusted: true }),
  });
  const fixtures = useClients(
    t,
    [refund, payout, competingRefund, competingPayout, legacyRefund],
  );
  const providerMocks = rejectOutboundProviderCalls(t);

  for (const { operation, code } of [
    {
      operation: () => refundPayment({
        actor,
        paymentId,
        amountMinor: 1650,
        reason: refundReason,
        key: refundKey,
      }),
      code: 'payment_command_replay_integrity_mismatch',
    },
    {
      operation: () => releasePayout({ actor, paymentId, key: payoutKey }),
      code: 'payment_command_replay_integrity_mismatch',
    },
    {
      operation: () => refundPayment({
        actor,
        paymentId,
        amountMinor: 1650,
        reason: refundReason,
        key: refundKey,
      }),
      code: 'payment_command_replay_integrity_mismatch',
    },
    {
      operation: () => releasePayout({ actor, paymentId, key: payoutKey }),
      code: 'payment_command_replay_integrity_mismatch',
    },
    {
      operation: () => refundPayment({
        actor,
        paymentId,
        amountMinor: 1650,
        reason: refundReason,
        key: refundKey,
      }),
      code: 'payment_command_replay_integrity_mismatch',
    },
  ]) {
    await assert.rejects(operation(), (error) => (
      error?.status === 409
      && error?.code === code
    ));
  }

  assertReadOnlyTransactions(fixtures);
  assertNoProviderCalls(providerMocks);
  assert.ok(fixtures.every(({ statements }) => statements.at(-1) === 'ROLLBACK'));
});

test('fresh and incomplete refund or payout commands remain blocked after expiry', async (t) => {
  expireSandboxClock(t);
  const incompleteRefund = completedRefundScenario({
    command: {
      completed_at: null,
      response_payload: null,
      response_payload_hash_valid: false,
      completion_integrity_version: null,
      settlement_refunded_minor: null,
      settlement_transferred_minor: null,
    },
  });
  const incompletePayout = completedPayoutScenario({
    command: {
      completed_at: null,
      response_payload: null,
      response_payload_hash_valid: false,
      completion_integrity_version: null,
      settlement_refunded_minor: null,
      settlement_transferred_minor: null,
    },
  });
  const cases = [
    {
      scenario: { ...completedRefundScenario(), command: null },
      operation: () => refundPayment({
        actor,
        paymentId,
        amountMinor: 1650,
        reason: refundReason,
        key: refundKey,
      }),
    },
    {
      scenario: incompleteRefund,
      operation: () => refundPayment({
        actor,
        paymentId,
        amountMinor: 1650,
        reason: refundReason,
        key: refundKey,
      }),
    },
    {
      scenario: { ...completedPayoutScenario(), command: null },
      operation: () => releasePayout({ actor, paymentId, key: payoutKey }),
    },
    {
      scenario: incompletePayout,
      operation: () => releasePayout({ actor, paymentId, key: payoutKey }),
    },
  ];
  const fixtures = useClients(t, cases.map((entry) => entry.scenario));
  const providerMocks = rejectOutboundProviderCalls(t);

  for (const entry of cases) {
    await assert.rejects(entry.operation(), (error) => (
      error?.status === 503
      && error?.code === 'payment_sandbox_authorization_expired'
    ));
  }

  assertReadOnlyTransactions(fixtures);
  assertNoProviderCalls(providerMocks);
  assert.ok(fixtures.every(({ statements }) => statements.at(-1) === 'ROLLBACK'));
});

test('fresh refund and payout commands reject untrusted central refund truth read-only', async (t) => {
  const refundScenario = {
    ...completedRefundScenario(),
    command: null,
    refundTruth: needsReviewRefundTruth({ untrusted: true }),
  };
  const payoutScenario = {
    ...completedPayoutScenario(),
    command: null,
    refundTruth: needsReviewRefundTruth({ untrusted: true }),
  };
  const fixtures = useClients(t, [refundScenario, payoutScenario]);
  const providerMocks = rejectOutboundProviderCalls(t);

  for (const operation of [
    () => refundPayment({
      actor,
      paymentId,
      amountMinor: 1650,
      reason: refundReason,
      key: 'wp151-fresh-refund-over-legacy-history',
    }),
    () => releasePayout({
      actor,
      paymentId,
      key: 'wp151-fresh-payout-over-legacy-history',
    }),
  ]) {
    await assert.rejects(operation(), (error) => (
      error?.status === 409
      && error?.code === 'refund_truth_needs_review'
    ));
  }

  assertReadOnlyTransactions(fixtures);
  assertNoProviderCalls(providerMocks);
  assert.ok(fixtures.every(({ statements }) => statements.at(-1) === 'ROLLBACK'));
});
