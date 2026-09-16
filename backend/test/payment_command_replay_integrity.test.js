import assert from 'node:assert/strict';
import test from 'node:test';

import { requestHash } from '../src/payment_domain.js';
import {
  validateCompletedPayoutCommandReplay,
  validateCompletedRefundCommandReplay,
} from '../src/payment_workflow.js';

const actorId = 'wp150-synthetic-admin';
const bookingId = 'wp150-synthetic-booking';
const paymentId = '11111111-1111-4111-8111-111111111150';
const refundId = '22222222-2222-4222-8222-222222222150';
const payoutId = '33333333-3333-4333-8333-333333333150';
const refundLedgerId = '44444444-4444-4444-8444-444444444150';
const payoutLedgerId = '55555555-5555-4555-8555-555555555150';
const refundKey = 'wp150-completed-refund';
const payoutKey = 'wp150-completed-payout';
const refundReason = 'wp150_synthetic_refund';
const ownerId = 'wp150-synthetic-owner';

function paymentRow(overrides = {}) {
  return {
    id: paymentId,
    booking_id: bookingId,
    owner_id: ownerId,
    status: 'partially_refunded',
    amount_minor: '3300',
    captured_minor: '3300',
    refunded_minor: '1650',
    transferred_minor: '0',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    currency: 'EUR',
    failure_code: null,
    provider_charge_id: 'ch_wp150_synthetic',
    transfer_group: 'booking_wp150_synthetic',
    livemode: false,
    ...overrides,
  };
}

function refundLedgerEntries({
  amountMinor = 1650,
  ownerShareMinor = 1500,
  platformShareMinor = 150,
} = {}) {
  return [
    {
      account_code: 'owner_payable',
      account_owner_id: ownerId,
      debit_minor: String(ownerShareMinor),
      credit_minor: '0',
    },
    {
      account_code: 'platform_revenue',
      account_owner_id: null,
      debit_minor: String(platformShareMinor),
      credit_minor: '0',
    },
    {
      account_code: 'stripe_clearing',
      account_owner_id: null,
      debit_minor: '0',
      credit_minor: String(amountMinor),
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
    status: 'partially_refunded',
    amountMinor: 3300,
    capturedMinor: 3300,
    refundedMinor: 1650,
    transferredMinor: 0,
    platformFeeMinor: 300,
    ownerPayoutMinor: 3000,
    currency: 'EUR',
    failureCode: null,
    checkoutExpiresAt: '2026-09-14T09:45:00.000Z',
    capturedAt: '2026-09-14T09:15:00.000Z',
    livemode: false,
    updatedAt: '2026-09-14T09:30:00.000Z',
    ...overrides,
  };
}

function refundArguments({ full = false } = {}) {
  const amountMinor = full ? 3300 : 1650;
  const ownerShareMinor = full ? 3000 : 1500;
  const platformShareMinor = full ? 300 : 150;
  const receiptStatus = full ? 'refunded' : 'partially_refunded';
  const payment = paymentRow({
    status: receiptStatus,
    refunded_minor: String(amountMinor),
  });
  const refund = {
    id: refundId,
    idempotency_key: refundKey,
    payment_id: paymentId,
    status: 'succeeded',
    amount_minor: String(amountMinor),
    currency: 'EUR',
    reason: refundReason,
    provider_refund_id: 're_wp150_synthetic',
    provider_charge_id: payment.provider_charge_id,
    owner_share_minor: String(ownerShareMinor),
    platform_share_minor: String(platformShareMinor),
    legacy_refund_platform_fee_claim: null,
    provider_refund_model: 'separate_charge_manual_transfer_reversal_v1',
    succeeded_at: new Date('2026-09-14T09:30:00.000Z'),
    failure_code: null,
    local_settlement_status: 'completed',
    local_settled_at: new Date('2026-09-14T09:30:01.000Z'),
    local_settlement_error_code: null,
    provider_observation_status: 'none',
    livemode: false,
  };
  const response = {
    refund: {
      id: refundId,
      status: 'succeeded',
      amountMinor,
      currency: 'EUR',
    },
    payment: paymentReceipt({
      status: receiptStatus,
      refundedMinor: amountMinor,
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
  };
  return {
    command: {
      idempotency_key: refundKey,
      command_type: 'payment.refund',
      actor_id: actorId,
      payment_id: paymentId,
      booking_id: bookingId,
      request_hash: requestHash({
        paymentId,
        amountMinor,
        reason: refundReason,
      }),
      completed_at: new Date('2026-09-14T09:30:00.000Z'),
      response_payload: response,
      response_payload_hash_valid: true,
      completion_integrity_version: 1,
      settlement_refunded_minor: String(amountMinor),
      settlement_transferred_minor: '0',
    },
    payment,
    refund,
    ledger,
    ledgers: [ledger],
    ledgerEntries: refundLedgerEntries({ amountMinor, ownerShareMinor, platformShareMinor }),
    actorId,
    paymentId,
    key: refundKey,
    amountMinor,
    reason: refundReason,
  };
}

function payoutArguments({ state = 'paid', refundedMinor = 0 } = {}) {
  const cancelled = state === 'cancelled';
  const receiptStatus = refundedMinor === 0 ? 'captured' : 'partially_refunded';
  const payment = paymentRow({
    status: receiptStatus,
    refunded_minor: String(refundedMinor),
    transferred_minor: cancelled ? '0' : '3000',
  });
  const payout = {
    id: payoutId,
    idempotency_key: payoutKey,
    payment_id: paymentId,
    booking_id: bookingId,
    payee_id: payment.owner_id,
    status: state,
    amount_minor: '3000',
    currency: 'EUR',
    provider_connected_account_id: 'acct_wp150_synthetic',
    provider_transfer_id: cancelled ? null : 'tr_wp150_synthetic',
    paid_at: cancelled ? null : new Date('2026-09-14T09:35:00.000Z'),
    livemode: false,
  };
  const response = {
    payout: cancelled
      ? { id: payoutId, status: 'cancelled' }
      : { id: payoutId, status: 'paid', amountMinor: 3000, currency: 'EUR' },
    payment: paymentReceipt({
      status: receiptStatus,
      refundedMinor,
      transferredMinor: cancelled ? 0 : 3000,
    }),
    replayed: false,
  };
  const ledger = cancelled ? null : {
    id: payoutLedgerId,
    idempotency_key: `${payoutKey}:transfer-ledger`,
    booking_id: bookingId,
    payment_id: paymentId,
    refund_id: null,
    payout_id: payoutId,
    transaction_type: 'owner_transfer',
    currency: 'EUR',
    provider_reference: payout.provider_transfer_id,
  };
  return {
    command: {
      idempotency_key: payoutKey,
      command_type: 'payment.release',
      actor_id: actorId,
      payment_id: paymentId,
      booking_id: bookingId,
      request_hash: requestHash({ paymentId, amountMinor: 3000 }),
      completed_at: new Date('2026-09-14T09:35:00.000Z'),
      response_payload: response,
      response_payload_hash_valid: true,
      completion_integrity_version: 1,
      settlement_refunded_minor: String(refundedMinor),
      settlement_transferred_minor: cancelled ? '0' : '3000',
    },
    payment,
    payout,
    ledger,
    ledgers: cancelled ? [] : [ledger],
    ledgerEntries: cancelled ? [] : transferLedgerEntries(),
    actorId,
    paymentId,
    key: payoutKey,
  };
}

function cloned(value) {
  return structuredClone(value);
}

function assertIntegrityFailure(operation, label) {
  assert.throws(operation, (error) => (
    error?.status === 409
    && error?.code === 'payment_command_replay_integrity_mismatch'
  ), label);
}

test('completed refund receipt is accepted only with every durable binding intact', () => {
  const valid = refundArguments();
  assert.equal(
    validateCompletedRefundCommandReplay(valid),
    valid.command.response_payload,
  );
  const full = refundArguments({ full: true });
  assert.equal(
    validateCompletedRefundCommandReplay(full),
    full.command.response_payload,
  );

  const partialAggregateClaimedAsFull = cloned(valid);
  partialAggregateClaimedAsFull.command.response_payload.payment.status = 'refunded';
  assertIntegrityFailure(
    () => validateCompletedRefundCommandReplay(partialAggregateClaimedAsFull),
    'partial refund aggregate claimed as refunded',
  );
  const fullAggregateClaimedAsPartial = cloned(full);
  fullAggregateClaimedAsPartial.command.response_payload.payment.status = 'partially_refunded';
  assertIntegrityFailure(
    () => validateCompletedRefundCommandReplay(fullAggregateClaimedAsPartial),
    'full refund aggregate claimed as partially refunded',
  );

  const corruptions = [
    ['requested amount', (value) => { value.amountMinor = 1600; }],
    ['reason hash', (value) => { value.reason = 'different_reason'; }],
    ['command key', (value) => { value.command.idempotency_key = 'different-command-key'; }],
    ['command type', (value) => { value.command.command_type = 'payment.release'; }],
    ['command actor', (value) => { value.command.actor_id = 'different-admin'; }],
    ['command payment', (value) => { value.command.payment_id = 'different-payment'; }],
    ['command booking', (value) => { value.command.booking_id = 'different-booking'; }],
    ['command request hash', (value) => { value.command.request_hash = '0'.repeat(64); }],
    ['command completion clock', (value) => { value.command.completed_at = null; }],
    ['command response digest', (value) => { value.command.response_payload_hash_valid = false; }],
    ['legacy completion version', (value) => { value.command.completion_integrity_version = null; }],
    ['refund settlement snapshot', (value) => { value.command.settlement_refunded_minor = '1649'; }],
    ['transfer settlement snapshot', (value) => { value.command.settlement_transferred_minor = '1'; }],
    ['response replay flag', (value) => { value.command.response_payload.replayed = true; }],
    ['response extra field', (value) => { value.command.response_payload.unexpected = true; }],
    ['response refund id', (value) => { value.command.response_payload.refund.id = 'different-refund'; }],
    ['response refund status', (value) => { value.command.response_payload.refund.status = 'pending'; }],
    ['response refund amount', (value) => { value.command.response_payload.refund.amountMinor = 1; }],
    ['response refund currency', (value) => { value.command.response_payload.refund.currency = 'USD'; }],
    ['receipt payment id', (value) => { value.command.response_payload.payment.id = 'different-payment'; }],
    ['receipt booking id', (value) => { value.command.response_payload.payment.bookingId = 'different-booking'; }],
    ['receipt status', (value) => { value.command.response_payload.payment.status = ''; }],
    ['receipt amount', (value) => { value.command.response_payload.payment.amountMinor = 1; }],
    ['receipt captured amount', (value) => { value.command.response_payload.payment.capturedMinor = 1; }],
    ['receipt refunded amount', (value) => { value.command.response_payload.payment.refundedMinor = 3301; }],
    ['receipt transferred amount', (value) => { value.command.response_payload.payment.transferredMinor = 3001; }],
    ['receipt platform fee', (value) => { value.command.response_payload.payment.platformFeeMinor = 1; }],
    ['receipt owner amount', (value) => { value.command.response_payload.payment.ownerPayoutMinor = 1; }],
    ['receipt currency', (value) => { value.command.response_payload.payment.currency = 'USD'; }],
    ['receipt mode', (value) => { value.command.response_payload.payment.livemode = true; }],
    ['receipt failure shape', (value) => { value.command.response_payload.payment.failureCode = {}; }],
    ['receipt checkout clock', (value) => { value.command.response_payload.payment.checkoutExpiresAt = 'invalid'; }],
    ['receipt capture clock', (value) => { value.command.response_payload.payment.capturedAt = 'invalid'; }],
    ['receipt update clock', (value) => { value.command.response_payload.payment.updatedAt = 'invalid'; }],
    ['refund key', (value) => { value.refund.idempotency_key = 'different-refund-key'; }],
    ['refund payment', (value) => { value.refund.payment_id = 'different-payment'; }],
    ['refund status', (value) => { value.refund.status = 'pending'; }],
    ['refund currency', (value) => { value.refund.currency = 'USD'; }],
    ['refund mode', (value) => { value.refund.livemode = true; }],
    ['refund provider model', (value) => { value.refund.provider_refund_model = 'legacy'; }],
    ['refund legacy provider claim', (value) => {
      value.refund.legacy_refund_platform_fee_claim = true;
    }],
    ['refund provider id', (value) => { value.refund.provider_refund_id = ''; }],
    ['refund charge id', (value) => { value.refund.provider_charge_id = 'different-charge'; }],
    ['refund completion clock', (value) => { value.refund.succeeded_at = null; }],
    ['refund local settlement status', (value) => {
      value.refund.local_settlement_status = 'pending';
    }],
    ['refund local settlement clock', (value) => { value.refund.local_settled_at = null; }],
    ['refund local settlement error', (value) => {
      value.refund.local_settlement_error_code = 'ledger_mismatch';
    }],
    ['refund provider observation', (value) => {
      value.refund.provider_observation_status = 'needs_review';
    }],
    ['refund split', (value) => { value.refund.owner_share_minor = '1499'; }],
    ['missing ledger', (value) => { value.ledger = null; }],
    ['ledger key', (value) => { value.ledger.idempotency_key = 'different-ledger'; }],
    ['ledger booking', (value) => { value.ledger.booking_id = 'different-booking'; }],
    ['ledger payment', (value) => { value.ledger.payment_id = 'different-payment'; }],
    ['ledger refund', (value) => { value.ledger.refund_id = 'different-refund'; }],
    ['ledger payout', (value) => { value.ledger.payout_id = payoutId; }],
    ['ledger type', (value) => { value.ledger.transaction_type = 'owner_transfer'; }],
    ['ledger currency', (value) => { value.ledger.currency = 'USD'; }],
    ['ledger provider reference', (value) => { value.ledger.provider_reference = 'different-refund'; }],
    ['competing refund ledger transaction', (value) => {
      value.ledgers.push({
        ...value.ledger,
        id: '66666666-6666-4666-8666-666666666150',
        idempotency_key: 'competing-refund-ledger',
      });
    }],
    ['missing ledger entry', (value) => { value.ledgerEntries.shift(); }],
    ['additional ledger entry', (value) => {
      value.ledgerEntries.push({
        account_code: 'unexpected_account',
        account_owner_id: null,
        debit_minor: '1',
        credit_minor: '0',
      });
    }],
    ['wrong ledger entry', (value) => { value.ledgerEntries[1].account_code = 'wrong_account'; }],
    ['wrong ledger owner', (value) => { value.ledgerEntries[0].account_owner_id = 'different-owner'; }],
    ['wrong ledger amount', (value) => { value.ledgerEntries[0].debit_minor = '1499'; }],
  ];
  for (const [label, mutate] of corruptions) {
    const changed = cloned(valid);
    mutate(changed);
    assertIntegrityFailure(
      () => validateCompletedRefundCommandReplay(changed),
      label,
    );
  }
});

test('paid payout receipt survives a later reversal but no binding corruption', () => {
  const paid = payoutArguments();
  assert.equal(
    validateCompletedPayoutCommandReplay(paid),
    paid.command.response_payload,
  );

  const reversed = payoutArguments({ state: 'reversed' });
  assert.equal(
    validateCompletedPayoutCommandReplay(reversed),
    reversed.command.response_payload,
  );
  const partiallyRefunded = payoutArguments({ refundedMinor: 300 });
  assert.equal(
    validateCompletedPayoutCommandReplay(partiallyRefunded),
    partiallyRefunded.command.response_payload,
  );

  const capturedWithRefundAggregate = cloned(paid);
  capturedWithRefundAggregate.command.response_payload.payment.refundedMinor = 300;
  assertIntegrityFailure(
    () => validateCompletedPayoutCommandReplay(capturedWithRefundAggregate),
    'captured payout receipt has a refund aggregate',
  );
  const partiallyRefundedWithoutAggregate = cloned(partiallyRefunded);
  partiallyRefundedWithoutAggregate.command.response_payload.payment.refundedMinor = 0;
  assertIntegrityFailure(
    () => validateCompletedPayoutCommandReplay(partiallyRefundedWithoutAggregate),
    'partially-refunded payout receipt has no refund aggregate',
  );

  const corruptions = [
    ['legacy completion version', (value) => { value.command.completion_integrity_version = null; }],
    ['refund settlement snapshot', (value) => { value.command.settlement_refunded_minor = '1'; }],
    ['transfer settlement snapshot', (value) => { value.command.settlement_transferred_minor = '2999'; }],
    ['response payout id', (value) => { value.command.response_payload.payout.id = 'different-payout'; }],
    ['response payout status', (value) => { value.command.response_payload.payout.status = 'pending'; }],
    ['response payout amount', (value) => { value.command.response_payload.payout.amountMinor = 1; }],
    ['response payout currency', (value) => { value.command.response_payload.payout.currency = 'USD'; }],
    ['response payout extra field', (value) => { value.command.response_payload.payout.unexpected = true; }],
    ['payout key', (value) => { value.payout.idempotency_key = 'different-payout-key'; }],
    ['payout payment', (value) => { value.payout.payment_id = 'different-payment'; }],
    ['payout booking', (value) => { value.payout.booking_id = 'different-booking'; }],
    ['payout payee', (value) => { value.payout.payee_id = 'different-owner'; }],
    ['payout status', (value) => { value.payout.status = 'pending'; }],
    ['payout currency', (value) => { value.payout.currency = 'USD'; }],
    ['payout mode', (value) => { value.payout.livemode = true; }],
    ['payout account', (value) => { value.payout.provider_connected_account_id = ''; }],
    ['payout transfer', (value) => { value.payout.provider_transfer_id = ''; }],
    ['payout paid clock', (value) => { value.payout.paid_at = null; }],
    ['missing ledger', (value) => { value.ledger = null; }],
    ['ledger key', (value) => { value.ledger.idempotency_key = 'different-ledger'; }],
    ['ledger booking', (value) => { value.ledger.booking_id = 'different-booking'; }],
    ['ledger payment', (value) => { value.ledger.payment_id = 'different-payment'; }],
    ['ledger refund', (value) => { value.ledger.refund_id = refundId; }],
    ['ledger payout', (value) => { value.ledger.payout_id = 'different-payout'; }],
    ['ledger type', (value) => { value.ledger.transaction_type = 'payment_refunded'; }],
    ['ledger currency', (value) => { value.ledger.currency = 'USD'; }],
    ['ledger provider reference', (value) => { value.ledger.provider_reference = 'different-transfer'; }],
    ['competing payout ledger transaction', (value) => {
      value.ledgers.push({
        ...value.ledger,
        id: '77777777-7777-4777-8777-777777777150',
        idempotency_key: 'competing-payout-ledger',
      });
    }],
    ['missing ledger entry', (value) => { value.ledgerEntries.shift(); }],
    ['additional ledger entry', (value) => {
      value.ledgerEntries.push({
        account_code: 'unexpected_account',
        account_owner_id: null,
        debit_minor: '1',
        credit_minor: '0',
      });
    }],
    ['wrong ledger entry', (value) => { value.ledgerEntries[1].account_code = 'wrong_account'; }],
    ['wrong ledger owner', (value) => { value.ledgerEntries[0].account_owner_id = 'different-owner'; }],
    ['wrong ledger amount', (value) => { value.ledgerEntries[0].debit_minor = '2999'; }],
  ];
  for (const [label, mutate] of corruptions) {
    const changed = cloned(paid);
    mutate(changed);
    assertIntegrityFailure(
      () => validateCompletedPayoutCommandReplay(changed),
      label,
    );
  }
});

test('human-cancelled payout receipt requires a cancelled row and no transfer ledger', () => {
  const cancelled = payoutArguments({ state: 'cancelled' });
  assert.equal(cancelled.ledger, null);
  assert.deepEqual(cancelled.ledgers, []);
  assert.deepEqual(cancelled.ledgerEntries, []);
  assert.equal(
    validateCompletedPayoutCommandReplay(cancelled),
    cancelled.command.response_payload,
  );

  for (const [label, mutate] of [
    ['cancel response has paid fields', (value) => { value.command.response_payload.payout.amountMinor = 3000; }],
    ['row is not cancelled', (value) => { value.payout.status = 'failed'; }],
    ['provider transfer exists', (value) => { value.payout.provider_transfer_id = 'tr_unexpected'; }],
    ['paid clock exists', (value) => { value.payout.paid_at = new Date(); }],
    ['owner transfer ledger exists', (value) => {
      value.ledger = payoutArguments().ledger;
    }],
    ['owner transfer transaction exists', (value) => {
      value.ledgers = payoutArguments().ledgers;
    }],
    ['owner transfer ledger entries exist', (value) => {
      value.ledgerEntries = payoutArguments().ledgerEntries;
    }],
  ]) {
    const changed = cloned(cancelled);
    mutate(changed);
    assertIntegrityFailure(
      () => validateCompletedPayoutCommandReplay(changed),
      label,
    );
  }
});
