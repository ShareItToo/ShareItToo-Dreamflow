import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateV51Cancellation,
  evaluateV51WithdrawalEffect,
  v51CancellationAmounts,
  v51ShortNoticeGraceDeadline,
  v52ActualLossAmounts,
} from '../src/v51_termination_domain.js';

test('V5.1 cancellation keeps 24-hour and exact 60-minute grace rules', () => {
  assert.equal(v51ShortNoticeGraceDeadline({
    contractConfirmedAt: '2026-09-01T15:00:00Z',
    rentalStartAt: '2026-09-01T20:00:00Z',
  }).toISOString(), '2026-09-01T16:00:00.000Z');
  assert.equal(evaluateV51Cancellation({
    contractConfirmedAt: '2026-09-01T15:00:00Z',
    rentalStartAt: '2026-09-01T20:00:00Z',
    cancelAt: '2026-09-01T15:59:59Z',
  }).rentRefundBasisPoints, 10000);
  assert.equal(evaluateV51Cancellation({
    rentalStartAt: '2026-09-02T20:00:00Z',
    cancelAt: '2026-09-01T20:00:00Z',
  }).rentRefundBasisPoints, 10000);
});

test('under 24 hours retains half rent and only ten percent fee on retained rent', () => {
  const decision = evaluateV51Cancellation({
    contractConfirmedAt: '2026-09-01T15:00:00Z',
    rentalStartAt: '2026-09-01T20:00:00Z',
    cancelAt: '2026-09-01T17:00:00Z',
  });
  assert.equal(decision.rentRefundBasisPoints, 5000);
  assert.deepEqual(v51CancellationAmounts({
    rentalSubtotalMinor: 10001,
    platformFeeMinor: 1000,
    rentRefundBasisPoints: decision.rentRefundBasisPoints,
  }), {
    rentalSubtotalMinor: 10001,
    rentRefundBasisPoints: 5000,
    rentRefundMinor: 5001,
    rentRetainedMinor: 5000,
    platformFeeMinor: 1000,
    sitFeeRefundMinor: 500,
    sitFeeRetainedMinor: 500,
  });
});

test('after start and no-show never produce a fixed 100-percent penalty', () => {
  for (const noShow of [false, true]) {
    const decision = evaluateV51Cancellation({
      rentalStartAt: '2026-09-01T20:00:00Z',
      cancelAt: '2026-09-01T20:30:00Z',
      noShow,
    });
    assert.equal(decision.calculationStatus, 'pending_actual_loss_assessment');
    assert.equal(decision.rentRefundBasisPoints, null);
    assert.equal(decision.requiresActualLossAssessment, true);
  }
});

test('V5.2 actual loss deducts savings and replacement rental and honors lower or zero loss', () => {
  assert.deepEqual(v52ActualLossAmounts({
    rentalSubtotalMinor: 10000,
    platformFeeMinor: 1000,
    ownerClaimedLossMinor: 9000,
    savedExpenseMinor: 1000,
    replacementRentalMinor: 2500,
    provenLowerLossMinor: 4000,
  }), {
    rentalSubtotalMinor: 10000,
    ownerClaimedLossMinor: 9000,
    savedExpenseMinor: 1000,
    replacementRentalMinor: 2500,
    provenLowerLossMinor: 4000,
    rentRetainedMinor: 4000,
    rentRefundMinor: 6000,
    platformFeeMinor: 1000,
    sitFeeRetainedMinor: 400,
    sitFeeRefundMinor: 600,
  });
  assert.equal(v52ActualLossAmounts({
    rentalSubtotalMinor: 10000,
    platformFeeMinor: 1000,
    ownerClaimedLossMinor: 50000,
    savedExpenseMinor: 0,
    replacementRentalMinor: 0,
  }).rentRetainedMinor, 10000);
  assert.equal(v52ActualLossAmounts({
    rentalSubtotalMinor: 10000,
    platformFeeMinor: 1000,
    ownerClaimedLossMinor: 9000,
    savedExpenseMinor: 0,
    replacementRentalMinor: 0,
    provenLowerLossMinor: 0,
  }).rentRetainedMinor, 0);
});

test('withdrawal before handover ends booking and creates two full obligations', () => {
  const effect = evaluateV51WithdrawalEffect({
    workflowStatus: 'confirmed',
    rentalStartAt: '2026-09-02T10:00:00Z',
    rentalEndAt: '2026-09-04T10:00:00Z',
    rentalSubtotalMinor: 10000,
    platformFeeMinor: 1000,
  });
  assert.equal(effect.bookingWorkflowStatus, 'cancelled');
  assert.equal(effect.rentRefund.amountDueMinor, 10000);
  assert.equal(effect.rentRefund.debtorRole, 'owner');
  assert.equal(effect.sitFeeRefund.amountDueMinor, 1000);
  assert.equal(effect.sitFeeRefund.debtorRole, 'sit');
  assert.equal(effect.returnRequired, false);
});

test('withdrawal after handover requires return and computes rent only after confirmation', () => {
  const pending = evaluateV51WithdrawalEffect({
    workflowStatus: 'active',
    rentalStartAt: '2026-09-01T10:00:00Z',
    rentalEndAt: '2026-09-03T10:00:00Z',
    rentalSubtotalMinor: 10000,
    platformFeeMinor: 1000,
  });
  assert.equal(pending.bookingWorkflowStatus, 'withdrawalReturnRequired');
  assert.equal(pending.rentRefund.status, 'calculation_pending');
  assert.equal(pending.sitFeeRefund.amountDueMinor, 1000);

  const returned = evaluateV51WithdrawalEffect({
    workflowStatus: 'returned',
    rentalStartAt: '2026-09-01T10:00:00Z',
    rentalEndAt: '2026-09-03T10:00:00Z',
    confirmedReturnAt: '2026-09-02T10:00:00Z',
    rentalSubtotalMinor: 10000,
    platformFeeMinor: 1000,
  });
  assert.equal(returned.rentRefund.usedRentMinor, 5000);
  assert.equal(returned.rentRefund.amountDueMinor, 5000);
  assert.equal(returned.sitFeeRefund.amountDueMinor, 1000);
});
