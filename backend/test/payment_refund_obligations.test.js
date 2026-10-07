import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateRefundObligationSnapshot,
  refundObligationSnapshotsForBookings,
} from '../src/payment_refund_obligations.js';

test('refund obligations block payout while unresolved or economically outstanding', () => {
  assert.deepEqual(evaluateRefundObligationSnapshot({
    withdrawal_obligation_count: 2,
    withdrawal_unresolved_count: 1,
    withdrawal_due_minor: 300,
    cancellation_obligation_count: 0,
    cancellation_unresolved_count: 0,
    cancellation_due_minor: 0,
    actual_loss_unresolved_count: 0,
    succeeded_refund_minor: 300,
  }), {
    blocked: true,
    conflictingFamilies: false,
    unresolved: true,
    outstandingMinor: 0,
    dueMinor: 300,
    succeededRefundMinor: 300,
    providerTruthNeedsReview: false,
    untrustedRefundCount: 0,
    unresolvedRefundCount: 0,
  });
  assert.equal(evaluateRefundObligationSnapshot({
    withdrawal_obligation_count: 0,
    withdrawal_unresolved_count: 0,
    withdrawal_due_minor: 0,
    cancellation_obligation_count: 2,
    cancellation_unresolved_count: 0,
    cancellation_due_minor: 500,
    actual_loss_unresolved_count: 0,
    succeeded_refund_minor: 499,
  }).blocked, true);
});

test('refund obligations release only after one unambiguous family is fully refunded', () => {
  assert.deepEqual(evaluateRefundObligationSnapshot({
    withdrawal_obligation_count: 0,
    withdrawal_unresolved_count: 0,
    withdrawal_due_minor: 0,
    cancellation_obligation_count: 2,
    cancellation_unresolved_count: 0,
    cancellation_due_minor: 500,
    actual_loss_unresolved_count: 0,
    succeeded_refund_minor: 500,
  }), {
    blocked: false,
    conflictingFamilies: false,
    unresolved: false,
    outstandingMinor: 0,
    dueMinor: 500,
    succeededRefundMinor: 500,
    providerTruthNeedsReview: false,
    untrustedRefundCount: 0,
    unresolvedRefundCount: 0,
  });
});

test('legacy or otherwise untrusted refund truth blocks the obligation snapshot', () => {
  assert.deepEqual(evaluateRefundObligationSnapshot({
    withdrawal_obligation_count: 1,
    withdrawal_unresolved_count: 0,
    withdrawal_due_minor: 500,
    cancellation_obligation_count: 0,
    cancellation_unresolved_count: 0,
    cancellation_due_minor: 0,
    actual_loss_unresolved_count: 0,
    succeeded_refund_minor: 500,
    untrusted_refund_count: 1,
  }), {
    blocked: true,
    conflictingFamilies: false,
    unresolved: true,
    outstandingMinor: 0,
    dueMinor: 500,
    succeededRefundMinor: 500,
    providerTruthNeedsReview: true,
    untrustedRefundCount: 1,
    unresolvedRefundCount: 0,
  });
});

test('refund snapshots sum only canonical provider truth and surface untrusted rows', async () => {
  const calls = [];
  const snapshots = await refundObligationSnapshotsForBookings({
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rowCount: 1,
        rows: [{
          booking_id: 'booking-1',
          withdrawal_obligation_count: 0,
          withdrawal_unresolved_count: 0,
          withdrawal_due_minor: 0,
          cancellation_obligation_count: 0,
          cancellation_unresolved_count: 0,
          cancellation_due_minor: 0,
          actual_loss_unresolved_count: 0,
          succeeded_refund_minor: 0,
          untrusted_refund_count: 1,
        }],
      };
    },
  }, { bookingId: 'booking-1' });

  assert.equal(snapshots[0].blocked, true);
  assert.equal(snapshots[0].providerTruthNeedsReview, true);
  assert.deepEqual(calls[0].values, ['booking-1', null]);
  assert.match(calls[0].sql, /JOIN sit_payment_refund_truth AS refund_truth/u);
  assert.match(calls[0].sql, /refund_truth\.settled_refund_minor/u);
  assert.match(
    calls[0].sql,
    /refund_truth\.refund_truth_status IN \('pending', 'needsReview'\)/u,
  );
});

test('conflicting obligation families and unresolved actual loss fail closed', () => {
  const base = {
    withdrawal_obligation_count: 1,
    withdrawal_unresolved_count: 0,
    withdrawal_due_minor: 100,
    cancellation_obligation_count: 1,
    cancellation_unresolved_count: 0,
    cancellation_due_minor: 100,
    actual_loss_unresolved_count: 0,
    succeeded_refund_minor: 200,
  };
  assert.equal(evaluateRefundObligationSnapshot(base).conflictingFamilies, true);
  assert.equal(evaluateRefundObligationSnapshot({
    ...base,
    withdrawal_obligation_count: 0,
    withdrawal_due_minor: 0,
    actual_loss_unresolved_count: 1,
  }).unresolved, true);
  assert.throws(
    () => evaluateRefundObligationSnapshot({ ...base, succeeded_refund_minor: -1 }),
    (error) => error.code === 'refund_obligation_state_invalid',
  );
});
