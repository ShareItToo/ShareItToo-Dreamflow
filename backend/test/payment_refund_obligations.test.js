import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRefundObligationSnapshot } from '../src/payment_refund_obligations.js';

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
  });
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
