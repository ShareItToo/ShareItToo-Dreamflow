import { evaluateV51Cancellation } from './v51_termination_domain.js';
import { addReturnPolicyCalendarDays } from './return_calendar_policy.js';

const HOUR_MS = 60 * 60 * 1000;

function instant(value, code) {
  const result = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error(code);
  return result;
}

function iso(value) {
  return value ? value.toISOString() : null;
}

export function resolveReturnT0({
  scheduledReturnAt,
  mutuallyConfirmedChangedReturnAt = null,
  mutuallyConfirmedActualReturnAt = null,
}) {
  return instant(
    mutuallyConfirmedActualReturnAt
      ?? mutuallyConfirmedChangedReturnAt
      ?? scheduledReturnAt,
    'invalid_return_t0',
  );
}

export function evaluateReturnTimeline({
  scheduledReturnAt,
  mutuallyConfirmedChangedReturnAt = null,
  mutuallyConfirmedActualReturnAt = null,
  ownerConfirmed = false,
  renterConfirmed = false,
  substantiatedCaseOpenedAt = null,
  now = new Date(),
  reportWindowHours = 48,
  missingConfirmationDays = 5,
  timezone = 'Europe/Berlin',
}) {
  const t0 = resolveReturnT0({
    scheduledReturnAt,
    mutuallyConfirmedChangedReturnAt,
    mutuallyConfirmedActualReturnAt,
  });
  const current = instant(now, 'invalid_current_time');
  const reportDeadline = new Date(t0.getTime() + reportWindowHours * HOUR_MS);
  const clarificationDeadline = addReturnPolicyCalendarDays(
    t0,
    missingConfirmationDays,
    timezone,
  );
  const bothConfirmed = ownerConfirmed && renterConfirmed;

  if (substantiatedCaseOpenedAt) {
    const t1 = instant(substantiatedCaseOpenedAt, 'invalid_case_opened_at');
    return Object.freeze({
      state: 'needsReview',
      t0: iso(t0),
      t1: iso(t1),
      reportDeadline: iso(reportDeadline),
      clarificationDeadline: iso(clarificationDeadline),
      responseDueAt: iso(addReturnPolicyCalendarDays(t1, 5, timezone)),
      nextStatusUpdateDueAt: iso(addReturnPolicyCalendarDays(t1, 7, timezone)),
      // Only the substantiated contested portion remains held. The undisputed
      // owner share becomes releasable after the ordinary report window.
      payoutInstructionDueAt: iso(reportDeadline),
    });
  }

  if (!bothConfirmed && current < clarificationDeadline) {
    return Object.freeze({
      state: 'awaitingReturnConfirmation',
      t0: iso(t0),
      t1: null,
      reportDeadline: iso(reportDeadline),
      clarificationDeadline: iso(clarificationDeadline),
      responseDueAt: null,
      nextStatusUpdateDueAt: null,
      payoutInstructionDueAt: iso(clarificationDeadline),
    });
  }

  if (bothConfirmed && current < reportDeadline) {
    return Object.freeze({
      state: 'reportWindowOpen',
      t0: iso(t0),
      t1: null,
      reportDeadline: iso(reportDeadline),
      clarificationDeadline: iso(clarificationDeadline),
      responseDueAt: null,
      nextStatusUpdateDueAt: null,
      payoutInstructionDueAt: iso(reportDeadline),
    });
  }

  const due = bothConfirmed ? reportDeadline : clarificationDeadline;
  return Object.freeze({
    state: 'payoutEligible',
    t0: iso(t0),
    t1: null,
    reportDeadline: iso(reportDeadline),
    clarificationDeadline: iso(clarificationDeadline),
    responseDueAt: null,
    nextStatusUpdateDueAt: null,
    payoutInstructionDueAt: iso(due),
  });
}

export function splitAuthorizedBookingAmount({
  authorizedBookingMinor,
  contestedAuthorizedMinor = 0,
  allegedDamageMinor = 0,
}) {
  if (!Number.isSafeInteger(authorizedBookingMinor) || authorizedBookingMinor < 0) {
    throw new Error('invalid_authorized_booking_amount');
  }
  const contested = Number.isSafeInteger(contestedAuthorizedMinor)
    ? Math.min(authorizedBookingMinor, Math.max(0, contestedAuthorizedMinor))
    : 0;
  return Object.freeze({
    authorizedBookingMinor,
    contestedAuthorizedMinor: contested,
    undisputedReleasableMinor: authorizedBookingMinor - contested,
    // Alleged physical damage is evidence only and can never become a new
    // charge or be offset against the authorized rental amount here.
    allegedDamageMinorRecordedOnly:
      Number.isSafeInteger(allegedDamageMinor) && allegedDamageMinor > 0
        ? allegedDamageMinor
        : 0,
    additionalChargeMinor: 0,
  });
}

export function shortNoticeGraceDeadline({
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
    confirmed.getTime() + graceMinutes * 60 * 1000,
    starts.getTime(),
  ));
}

export function evaluateCancellation({
  rentalStartAt,
  cancelAt = new Date(),
  contractConfirmedAt = null,
  actor = 'renter',
  noShow = false,
  shortNoticeHours = 24,
  graceMinutes = 60,
  shortNoticeRefundBasisPoints = 5000,
}) {
  const decision = evaluateV51Cancellation({
    rentalStartAt,
    cancelAt,
    contractConfirmedAt,
    actor,
    noShow,
    shortNoticeHours,
    graceMinutes,
  });
  return Object.freeze({
    ...decision,
    refundBasisPoints: decision.rentRefundBasisPoints,
  });
}

export function cancellationAmounts({ totalMinor, refundBasisPoints }) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new Error('invalid_total_amount');
  }
  if (!Number.isSafeInteger(refundBasisPoints)
      || refundBasisPoints < 0
      || refundBasisPoints > 10000) {
    throw new Error('invalid_refund_basis_points');
  }
  const refundMinor = Math.floor((totalMinor * refundBasisPoints + 5000) / 10000);
  return Object.freeze({
    totalMinor,
    refundBasisPoints,
    refundMinor,
    retainedMinor: totalMinor - refundMinor,
  });
}

export function isBookingChatOpen({
  bookingActive = false,
  returnState = 'not_started',
  now = new Date(),
  reportDeadline = null,
  clarificationDeadline = null,
  caseClosedAt = null,
}) {
  if (bookingActive) return true;
  if (returnState === 'needsReview') return caseClosedAt == null;
  const current = instant(now, 'invalid_current_time');
  // Missing confirmation remains neutral through its five-calendar-day
  // clarification window, but it does not extend direct participant chat.
  // New issues after the 48-hour report window belong in Support.
  return reportDeadline
    ? current <= instant(reportDeadline, 'invalid_chat_deadline')
    : false;
}
