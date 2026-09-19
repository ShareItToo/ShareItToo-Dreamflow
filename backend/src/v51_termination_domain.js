const HOUR_MS = 60 * 60 * 1000;

function instant(value, code) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(code);
  return parsed;
}

function minor(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function iso(value) {
  return value == null ? null : instant(value, 'invalid_time').toISOString();
}

export function v51ShortNoticeGraceDeadline({
  contractConfirmedAt,
  rentalStartAt,
  shortNoticeHours = 24,
  graceMinutes = 60,
}) {
  const confirmed = instant(contractConfirmedAt, 'invalid_contract_confirmation');
  const starts = instant(rentalStartAt, 'invalid_rental_start');
  if (starts <= confirmed) return null;
  if (starts.getTime() - confirmed.getTime() >= shortNoticeHours * HOUR_MS) {
    return null;
  }
  return new Date(Math.min(
    starts.getTime(),
    confirmed.getTime() + graceMinutes * 60 * 1000,
  ));
}

export function evaluateV51Cancellation({
  rentalStartAt,
  cancelAt = new Date(),
  contractConfirmedAt = null,
  actor = 'renter',
  noShow = false,
  replacementRentalMinor = 0,
  savedExpenseMinor = 0,
  provenLowerLossMinor = null,
  shortNoticeHours = 24,
  graceMinutes = 60,
}) {
  const starts = instant(rentalStartAt, 'invalid_rental_start');
  const cancelled = instant(cancelAt, 'invalid_cancellation_time');
  if (actor === 'owner') {
    return Object.freeze({
      calculationStatus: 'final',
      rentRefundBasisPoints: 10000,
      reasonCode: 'owner_cancellation_full_refund',
      freeCancellationUntil: null,
      requiresActualLossAssessment: false,
    });
  }

  if (noShow || cancelled >= starts) {
    const adjustments = [replacementRentalMinor, savedExpenseMinor];
    if (!adjustments.every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error('invalid_actual_loss_adjustment');
    }
    if (provenLowerLossMinor != null
        && (!Number.isSafeInteger(provenLowerLossMinor) || provenLowerLossMinor < 0)) {
      throw new Error('invalid_proven_lower_loss');
    }
    return Object.freeze({
      calculationStatus: 'pending_actual_loss_assessment',
      rentRefundBasisPoints: null,
      reasonCode: noShow
        ? 'no_show_actual_loss_assessment_required'
        : 'after_start_actual_loss_assessment_required',
      freeCancellationUntil: null,
      requiresActualLossAssessment: true,
      replacementRentalMinor,
      savedExpenseMinor,
      provenLowerLossMinor,
    });
  }

  const grace = contractConfirmedAt
    ? v51ShortNoticeGraceDeadline({
        contractConfirmedAt,
        rentalStartAt: starts,
        shortNoticeHours,
        graceMinutes,
      })
    : null;
  if (grace && cancelled <= grace) {
    return Object.freeze({
      calculationStatus: 'final',
      rentRefundBasisPoints: 10000,
      reasonCode: 'short_notice_grace_full_refund',
      freeCancellationUntil: iso(grace),
      requiresActualLossAssessment: false,
    });
  }
  if (starts.getTime() - cancelled.getTime() >= shortNoticeHours * HOUR_MS) {
    return Object.freeze({
      calculationStatus: 'final',
      rentRefundBasisPoints: 10000,
      reasonCode: 'at_least_24_hours_full_refund',
      freeCancellationUntil: null,
      requiresActualLossAssessment: false,
    });
  }
  return Object.freeze({
    calculationStatus: 'final',
    rentRefundBasisPoints: 5000,
    reasonCode: 'less_than_24_hours_fifty_percent_retained',
    freeCancellationUntil: null,
    requiresActualLossAssessment: false,
  });
}

export function v51CancellationAmounts({
  rentalSubtotalMinor,
  platformFeeMinor,
  rentRefundBasisPoints,
  platformFeeRateBasisPoints = 1000,
}) {
  const rental = minor(rentalSubtotalMinor, 'invalid_rental_subtotal');
  const fee = minor(platformFeeMinor, 'invalid_platform_fee');
  if (!Number.isSafeInteger(rentRefundBasisPoints)
      || rentRefundBasisPoints < 0
      || rentRefundBasisPoints > 10000) {
    throw new Error('invalid_rent_refund_basis_points');
  }
  if (!Number.isSafeInteger(platformFeeRateBasisPoints)
      || platformFeeRateBasisPoints < 0
      || platformFeeRateBasisPoints > 10000) {
    throw new Error('invalid_platform_fee_rate');
  }
  const rentRefundMinor = Math.floor(
    (rental * rentRefundBasisPoints + 5000) / 10000,
  );
  const rentRetainedMinor = rental - rentRefundMinor;
  const sitFeeRetainedMinor = Math.min(
    fee,
    Math.floor((rentRetainedMinor * platformFeeRateBasisPoints + 5000) / 10000),
  );
  return Object.freeze({
    rentalSubtotalMinor: rental,
    rentRefundBasisPoints,
    rentRefundMinor,
    rentRetainedMinor,
    platformFeeMinor: fee,
    sitFeeRefundMinor: fee - sitFeeRetainedMinor,
    sitFeeRetainedMinor,
  });
}

export function v52ActualLossAmounts({
  rentalSubtotalMinor,
  platformFeeMinor,
  ownerClaimedLossMinor,
  savedExpenseMinor,
  replacementRentalMinor,
  provenLowerLossMinor = null,
  platformFeeRateBasisPoints = 1000,
}) {
  const rental = minor(rentalSubtotalMinor, 'invalid_rental_subtotal');
  const fee = minor(platformFeeMinor, 'invalid_platform_fee');
  const claimed = minor(ownerClaimedLossMinor, 'invalid_owner_claimed_loss');
  const saved = minor(savedExpenseMinor, 'invalid_saved_expense');
  const replacement = minor(replacementRentalMinor, 'invalid_replacement_rental');
  const lower = provenLowerLossMinor == null
    ? null
    : minor(provenLowerLossMinor, 'invalid_proven_lower_loss');
  if (!Number.isSafeInteger(platformFeeRateBasisPoints)
      || platformFeeRateBasisPoints < 0
      || platformFeeRateBasisPoints > 10000) {
    throw new Error('invalid_platform_fee_rate');
  }
  const lossAfterDeductionsMinor = Math.max(0, claimed - saved - replacement);
  const rentRetainedMinor = Math.min(
    rental,
    lower == null ? lossAfterDeductionsMinor : Math.min(lossAfterDeductionsMinor, lower),
  );
  const sitFeeRetainedMinor = Math.min(
    fee,
    Math.floor((rentRetainedMinor * platformFeeRateBasisPoints + 5000) / 10000),
  );
  return Object.freeze({
    rentalSubtotalMinor: rental,
    ownerClaimedLossMinor: claimed,
    savedExpenseMinor: saved,
    replacementRentalMinor: replacement,
    provenLowerLossMinor: lower,
    rentRetainedMinor,
    rentRefundMinor: rental - rentRetainedMinor,
    platformFeeMinor: fee,
    sitFeeRetainedMinor,
    sitFeeRefundMinor: fee - sitFeeRetainedMinor,
  });
}

export function evaluateV51WithdrawalEffect({
  workflowStatus,
  rentalStartAt,
  rentalEndAt,
  confirmedReturnAt = null,
  rentalSubtotalMinor,
  platformFeeMinor,
  now = new Date(),
}) {
  const beforeHandover = new Set([
    'draft',
    'requested',
    'accepted',
    'payment_pending',
    'confirmed',
  ]);
  const rental = minor(rentalSubtotalMinor, 'invalid_rental_subtotal');
  const fee = minor(platformFeeMinor, 'invalid_platform_fee');
  if (beforeHandover.has(workflowStatus)) {
    return Object.freeze({
      phase: 'before_handover',
      bookingWorkflowStatus: 'cancelled',
      rentRefund: Object.freeze({
        status: 'required',
        amountDueMinor: rental,
        maximumMinor: rental,
        debtorRole: 'owner',
      }),
      sitFeeRefund: Object.freeze({
        status: 'required',
        amountDueMinor: fee,
        maximumMinor: fee,
        debtorRole: 'sit',
      }),
      returnRequired: false,
    });
  }

  const starts = instant(rentalStartAt, 'invalid_rental_start');
  const ends = instant(rentalEndAt, 'invalid_rental_end');
  if (starts >= ends) throw new Error('invalid_rental_period');
  const returned = confirmedReturnAt == null
    ? null
    : instant(confirmedReturnAt, 'invalid_confirmed_return');
  let rentRefund;
  if (!returned) {
    rentRefund = Object.freeze({
      status: 'calculation_pending',
      amountDueMinor: null,
      maximumMinor: rental,
      debtorRole: 'owner',
    });
  } else {
    const effectiveReturn = Math.min(ends.getTime(), Math.max(starts.getTime(), returned.getTime()));
    const usedMs = effectiveReturn - starts.getTime();
    const durationMs = ends.getTime() - starts.getTime();
    const usedRentMinor = Math.min(rental, Math.ceil(rental * usedMs / durationMs));
    rentRefund = Object.freeze({
      status: 'required',
      amountDueMinor: rental - usedRentMinor,
      maximumMinor: rental,
      debtorRole: 'owner',
      usedRentMinor,
      confirmedReturnAt: returned.toISOString(),
    });
  }
  return Object.freeze({
    phase: 'after_handover',
    bookingWorkflowStatus: returned ? workflowStatus : 'withdrawalReturnRequired',
    rentRefund,
    sitFeeRefund: Object.freeze({
      status: 'required',
      amountDueMinor: fee,
      maximumMinor: fee,
      debtorRole: 'sit',
    }),
    returnRequired: returned == null,
    withdrawalReceivedAt: instant(now, 'invalid_withdrawal_time').toISOString(),
  });
}
