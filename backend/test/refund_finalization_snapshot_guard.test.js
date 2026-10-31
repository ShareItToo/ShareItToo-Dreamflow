import assert from 'node:assert/strict';
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

const { refundPayment, stripeProvider } = await import('../src/payment_workflow.js');
const { requestHash } = await import('../src/payment_domain.js');
const { pool } = await import('../src/db.js');

after(() => pool.end());

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
        return queryHandler(statement, parameters);
      },
      release() {},
    },
  };
}

function assertNoSettlementWrite(fixtures) {
  const statements = fixtures.flatMap((fixture) => (
    fixture.statements.map(({ statement }) => statement)
  ));
  for (const forbidden of [
    /^UPDATE payments\b/iu,
    /^INSERT INTO ledger_transactions\b/iu,
    /^INSERT INTO ledger_entries\b/iu,
    /^UPDATE payment_commands\b/iu,
  ]) {
    assert.equal(
      statements.some((statement) => forbidden.test(statement)),
      false,
      statements.join('\n'),
    );
  }
}

function financialFenceResult(statement, parameters, { paymentId, ownerId, renterId }) {
  if (statement.startsWith('SELECT booking.owner_id, booking.renter_id')
      && statement.includes('FROM payments AS payment')) {
    assert.deepEqual(parameters, [paymentId]);
    return { rowCount: 1, rows: [{ owner_id: ownerId, renter_id: renterId }] };
  }
  if (statement.includes('pg_advisory_xact_lock')) {
    assert.ok([
      `account-financial:${ownerId}`,
      `account-financial:${renterId}`,
    ].includes(parameters[0]));
    return { rowCount: 1, rows: [] };
  }
  if (statement.startsWith('SELECT id, account_status, deactivated_at')
      && statement.includes('FROM users')) {
    assert.deepEqual(parameters, [[ownerId, renterId].sort()]);
    return {
      rowCount: 2,
      rows: [ownerId, renterId].sort().map((id) => ({
        id,
        account_status: 'active',
        deactivated_at: null,
      })),
    };
  }
  return null;
}

function refundTruthRow(paymentId, { providerPending = false } = {}) {
  return {
    payment_id: paymentId,
    untrusted_refund_count: 0,
    invalid_refund_count: 0,
    active_refund_count: providerPending ? 0 : 1,
    terminal_refund_count: 0,
    provider_observation_review_count: 0,
    provider_bound_local_pending_count: providerPending ? 1 : 0,
    provider_bound_local_review_count: 0,
    settled_refund_count: 0,
    settled_refund_minor: '0',
    settled_owner_refund_minor: '0',
    settled_refund_within_capture: true,
    refund_cache_matches_settlement: true,
    refund_status_matches_settlement: true,
    refund_truth_status: 'pending',
  };
}

const driftCases = [
  {
    label: 'same-total persisted refund split drift',
    refund: { owner_share_minor: '1499', platform_share_minor: '151' },
  },
  {
    label: 'payment refunded snapshot drift',
    payment: { refunded_minor: '1' },
  },
  {
    label: 'payment captured snapshot drift',
    payment: { captured_minor: '3299' },
  },
  {
    label: 'payment transferred snapshot drift',
    payment: { transferred_minor: '1' },
  },
  {
    label: 'concurrent provider funds withdrawal',
    finalizationConflict: 'dispute',
    expectedCode: 'provider_refund_dispute_conflict',
  },
  {
    label: 'concurrent dispute transfer recovery',
    finalizationConflict: 'recovery',
    expectedCode: 'provider_refund_transfer_recovery_conflict',
  },
];

for (const drift of driftCases) {
  test(`provider success cannot finalize after ${drift.label}`, async (t) => {
    const actor = { id: 'wp151-snapshot-admin', role: 'admin' };
    const ownerId = 'wp151-snapshot-owner';
    const renterId = 'wp151-snapshot-renter';
    const bookingId = 'wp151-snapshot-booking';
    const paymentId = '15151515-1515-4515-8515-151515151516';
    const refundId = '25252525-2525-4525-8525-252525252526';
    const key = `wp151-snapshot-${drift.label.replaceAll(' ', '-')}`;
    const reason = 'wp151_snapshot_guard';
    const amountMinor = 1650;
    const payment = {
      id: paymentId,
      booking_id: bookingId,
      owner_id: ownerId,
      renter_id: renterId,
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
      provider_charge_id: 'ch_wp151_snapshot_guard',
      transfer_group: `booking_${bookingId}`,
      livemode: false,
      updated_at: new Date('2026-09-14T13:00:00.000Z'),
    };
    const refund = {
      id: refundId,
      payment_id: paymentId,
      idempotency_key: key,
      status: 'pending',
      amount_minor: String(amountMinor),
      currency: 'EUR',
      reason,
      provider_refund_id: null,
      provider_charge_id: payment.provider_charge_id,
      owner_share_minor: '1500',
      platform_share_minor: '150',
      reverse_transfer: false,
      failure_code: null,
      succeeded_at: null,
      legacy_refund_platform_fee_claim: null,
      provider_refund_model: 'separate_charge_manual_transfer_reversal_v1',
      local_settlement_status: 'pending',
      local_settled_at: null,
      local_settlement_error_code: null,
      provider_observation_status: 'none',
      provider_observation_reference: null,
      provider_observation_error_code: null,
      provider_observed_at: null,
      livemode: false,
    };
    const command = {
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
    let providerSucceeded = false;
    const fenceContext = { paymentId, ownerId, renterId };

    const preparation = transactionClient(async (statement, parameters) => {
      const fence = financialFenceResult(statement, parameters, fenceContext);
      if (fence) return fence;
      if (statement.startsWith('SELECT payment.*, booking.owner_id')
          && statement.includes('0::bigint AS refunded_owner_minor')) {
        assert.deepEqual(parameters, [paymentId]);
        return { rowCount: 1, rows: [payment] };
      }
      if (statement.includes('FROM payment_commands AS command')) {
        assert.deepEqual(parameters, [key]);
        return { rowCount: 1, rows: [command] };
      }
      if (statement.startsWith('SELECT 1 FROM refunds')
          && statement.includes('legacy_refund_platform_fee_claim')) {
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
        return { rowCount: 1, rows: [{ idempotency_key: key }] };
      }
      if (statement === 'SELECT * FROM refunds WHERE idempotency_key = $1') {
        return { rowCount: 1, rows: [refund] };
      }
      if (statement === 'SELECT * FROM sit_payment_refund_truth WHERE payment_id = $1') {
        assert.deepEqual(parameters, [paymentId]);
        return { rowCount: 1, rows: [refundTruthRow(paymentId)] };
      }
      if (statement.includes('FROM refund_transfer_reversals WHERE refund_id = $1')) {
        return {
          rowCount: 1,
          rows: [{ count: 0, amount_minor: '0', succeeded_minor: '0' }],
        };
      }
      if (statement.startsWith(
        'SELECT id, provider_transfer_id, amount_minor, reversed_minor FROM payouts',
      )) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`unexpected_wp151_snapshot_prepare_sql:${statement}`);
    });
    const providerPersistence = transactionClient(async (statement, parameters) => {
      const fence = financialFenceResult(statement, parameters, fenceContext);
      if (fence) return fence;
      if (statement.startsWith('SELECT payment.*, booking.owner_id')
          && statement.includes('to_jsonb(refund) AS current_refund')) {
        assert.deepEqual(parameters, [paymentId, refundId]);
        return {
          rowCount: 1,
          rows: [{ ...payment, current_refund: refund }],
        };
      }
      if (statement.startsWith('UPDATE refunds')
          && statement.includes("status = 'succeeded'")) {
        assert.deepEqual(parameters, [refundId, 're_wp151_snapshot_guard']);
        return {
          rowCount: 1,
          rows: [{
            ...refund,
            status: 'succeeded',
            provider_refund_id: 're_wp151_snapshot_guard',
            succeeded_at: new Date('2026-09-14T13:01:00.000Z'),
          }],
        };
      }
      if (statement.startsWith('INSERT INTO audit_log')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected_wp151_snapshot_provider_persistence_sql:${statement}`);
    });
    const finalization = transactionClient(async (statement, parameters) => {
      const fence = financialFenceResult(statement, parameters, fenceContext);
      if (fence) return fence;
      if (statement.startsWith('SELECT payment.*, booking.owner_id,')) {
        assert.equal(providerSucceeded, true);
        assert.deepEqual(parameters, [paymentId, refundId, key]);
        return {
          rowCount: 1,
          rows: [{
            ...payment,
            ...drift.payment,
            current_refund: {
              ...refund,
              ...drift.refund,
              status: 'succeeded',
              provider_refund_id: 're_wp151_snapshot_guard',
              succeeded_at: new Date('2026-09-14T13:01:00.000Z'),
            },
            command_completed_at: null,
            command_response_payload: null,
          }],
        };
      }
      if (statement === 'SELECT * FROM sit_payment_refund_truth WHERE payment_id = $1') {
        assert.deepEqual(parameters, [paymentId]);
        return {
          rowCount: 1,
          rows: [refundTruthRow(paymentId, { providerPending: true })],
        };
      }
      if (statement.includes('AS active_provider_dispute')
          && statement.includes('AS active_transfer_recovery')) {
        assert.deepEqual(parameters, [paymentId]);
        return {
          rowCount: 1,
          rows: [{
            active_provider_dispute: drift.finalizationConflict === 'dispute',
            active_transfer_recovery: drift.finalizationConflict === 'recovery',
          }],
        };
      }
      throw new Error(`unexpected_wp151_snapshot_finalize_sql:${statement}`);
    });
    const settlementReview = transactionClient(async (statement, parameters) => {
      if (statement.startsWith('UPDATE refunds')
          && statement.includes("local_settlement_status = 'needs_review'")) {
        assert.deepEqual(parameters, [
          refundId,
          drift.expectedCode ?? 'provider_refund_local_state_mismatch',
        ]);
        return { rowCount: 1, rows: [{ id: refundId }] };
      }
      if (statement.startsWith('INSERT INTO audit_log')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected_wp151_snapshot_settlement_review_sql:${statement}`);
    });
    const fixtures = [preparation, providerPersistence, finalization, settlementReview];
    let fixtureIndex = 0;
    t.mock.method(pool, 'connect', async () => {
      const fixture = fixtures[fixtureIndex];
      fixtureIndex += 1;
      if (!fixture) throw new Error('unexpected_wp151_snapshot_transaction');
      return fixture.client;
    });
    const providerLookup = t.mock.method(stripeProvider, 'findRefund', async () => {
      providerSucceeded = true;
      return {
        id: 're_wp151_snapshot_guard',
        charge: payment.provider_charge_id,
        amount: amountMinor,
        currency: 'eur',
        status: 'succeeded',
        livemode: false,
        metadata: {
          sit_booking_id: bookingId,
          sit_payment_id: paymentId,
          sit_refund_id: refundId,
          sit_refund_model: refund.provider_refund_model,
          currency: 'EUR',
        },
      };
    });
    const providerCreate = t.mock.method(
      stripeProvider,
      'createRefund',
      async () => { throw new Error('unexpected_wp151_snapshot_provider_create'); },
    );

    await assert.rejects(
      refundPayment({ actor, paymentId, amountMinor, reason, key }),
      (error) => error?.status === 409
        && error?.code === (drift.expectedCode ?? 'provider_refund_local_state_mismatch'),
    );

    assert.equal(providerLookup.mock.callCount(), 1);
    assert.equal(providerCreate.mock.callCount(), 0);
    assert.equal(fixtureIndex, 4);
    assert.equal(preparation.statements.at(-1)?.statement, 'COMMIT');
    assert.equal(providerPersistence.statements.at(-1)?.statement, 'COMMIT');
    assert.equal(finalization.statements.at(-1)?.statement, 'ROLLBACK');
    assert.equal(settlementReview.statements.at(-1)?.statement, 'COMMIT');
    assert.equal(
      providerPersistence.statements.some(({ statement }) => (
        statement.startsWith('UPDATE refunds')
          && statement.includes("status = 'succeeded'")
      )),
      true,
    );
    assert.equal(
      settlementReview.statements.some(({ statement }) => (
        statement.startsWith('UPDATE refunds')
          && statement.includes("local_settlement_status = 'needs_review'")
      )),
      true,
    );
    assert.equal(
      fixtures.flatMap(({ statements }) => statements)
        .some(({ statement }) => /UPDATE refunds SET status = 'failed'/iu.test(statement)),
      false,
    );
    assertNoSettlementWrite(fixtures);
  });
}
