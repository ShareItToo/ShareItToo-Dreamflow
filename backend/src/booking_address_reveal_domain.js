export const bookingAddressRevealVersion = 'v52_booking_address_reveal_v1';

const eligibleWorkflowStatuses = new Set([
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'withdrawalReturnRequired',
  'returned',
]);

export class BookingAddressRevealError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function participant(value, ownerId, renterId) {
  return value === ownerId || value === renterId;
}

export function bookingLocalDate(instant, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return '';
  }
}

export function evaluateBookingAddressReveal({
  ownerId,
  renterId,
  workflowStatus,
  rentalStartDate,
  rentalEndDate,
  rentalTimezone,
  flowTimePayload,
  segment,
  safetyHold,
  exactAddress,
  now = new Date(),
}) {
  if (!['pickup', 'return'].includes(segment)) {
    throw new BookingAddressRevealError(400, 'booking_address_segment_invalid');
  }

  const hidden = (reason, extra = {}) => Object.freeze({
    version: bookingAddressRevealVersion,
    segment,
    result: 'hidden',
    reason,
    exactAddressReturned: false,
    ...extra,
  });

  if (!eligibleWorkflowStatuses.has(workflowStatus)) {
    return hidden('booking_state_ineligible');
  }
  if (safetyHold === true) return hidden('safety_review_required');

  const prefix = segment === 'pickup' ? 'handover' : 'return';
  const appointmentText = text(flowTimePayload?.[`${prefix}TimeIso`], 80);
  const requestedBy = text(flowTimePayload?.[`${prefix}TimeRequestedByUserId`], 120);
  const confirmedBy = text(flowTimePayload?.[`${prefix}TimeConfirmedByUserId`], 120);
  const confirmedAtText = text(flowTimePayload?.[`${prefix}TimeConfirmedAt`], 80);
  const appointment = new Date(appointmentText);
  const confirmedAt = new Date(confirmedAtText);
  const expectedDate = segment === 'pickup'
    ? text(rentalStartDate, 10)
    : text(rentalEndDate, 10);

  if (flowTimePayload?.[`${prefix}TimeConfirmed`] !== true
      || !participant(requestedBy, ownerId, renterId)
      || !participant(confirmedBy, ownerId, renterId)
      || requestedBy === confirmedBy
      || !Number.isFinite(appointment.getTime())
      || !Number.isFinite(confirmedAt.getTime())
      || !expectedDate
      || bookingLocalDate(appointment, rentalTimezone) !== expectedDate) {
    return hidden('appointment_not_counterparty_confirmed');
  }

  const appointmentAt = appointment.toISOString();
  const revealFrom = new Date(appointment.getTime() - (6 * 60 * 60 * 1000));
  const timing = {
    appointmentAt,
    revealFromAt: revealFrom.toISOString(),
    confirmedAt: confirmedAt.toISOString(),
  };
  if (now.getTime() < revealFrom.getTime()) {
    return hidden('reveal_window_not_open', timing);
  }

  const address = text(exactAddress, 500);
  if (!address) return hidden('exact_address_unavailable', timing);

  return Object.freeze({
    version: bookingAddressRevealVersion,
    segment,
    result: 'revealed',
    reason: 'counterparty_confirmed_window_open',
    exactAddressReturned: true,
    exactAddress: address,
    ...timing,
  });
}

export function bookingAddressAuditMetadata({ visibility, workflowStatus, safetyHold }) {
  return Object.freeze({
    version: bookingAddressRevealVersion,
    segment: visibility.segment,
    result: visibility.result,
    reason: visibility.reason,
    workflowStatus,
    appointmentAt: visibility.appointmentAt ?? null,
    revealFromAt: visibility.revealFromAt ?? null,
    safetyHold: safetyHold === true,
    exactAddressReturned: visibility.exactAddressReturned === true,
  });
}
