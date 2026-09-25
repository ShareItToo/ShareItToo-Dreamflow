import { bookingLocalDate } from './booking_address_reveal_domain.js';
import { postgresDateText } from './postgres_date.js';

export const bookingTimeSnapshotVersion = 'booking-time-v1';

export class BookingTimeSnapshotError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function text(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function exactInstant(value, code) {
  const candidate = text(value, 80);
  // An explicit offset is required. Date-only and floating local times are
  // not safe evidence for a binding appointment.
  if (!candidate || !/[zZ]|[+-]\d{2}:?\d{2}$/u.test(candidate)) {
    throw new BookingTimeSnapshotError(code);
  }
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) throw new BookingTimeSnapshotError(code);
  return parsed;
}

export function normalizeBookingTimeSnapshot({
  raw,
  rentalStartDate,
  rentalEndDate,
  rentalTimezone,
  required = false,
}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const input = source.timeSnapshot && typeof source.timeSnapshot === 'object'
    && !Array.isArray(source.timeSnapshot)
    ? source.timeSnapshot
    : source;
  const handoverAt = input.handoverAt;
  const returnAt = input.returnAt;
  const hasHandover = handoverAt != null && text(handoverAt, 80) !== '';
  const hasReturn = returnAt != null && text(returnAt, 80) !== '';
  if (!hasHandover && !hasReturn) {
    if (required) throw new BookingTimeSnapshotError('booking_exact_times_required');
    return null;
  }
  if (!hasHandover || !hasReturn) {
    throw new BookingTimeSnapshotError('booking_exact_times_pair_required');
  }
  const handover = exactInstant(handoverAt, 'booking_handover_time_invalid');
  const returned = exactInstant(returnAt, 'booking_return_time_invalid');
  if (handover >= returned) {
    throw new BookingTimeSnapshotError('booking_exact_times_order_invalid');
  }
  const timezone = text(rentalTimezone, 120);
  if (!timezone
      || bookingLocalDate(handover, timezone) !== text(rentalStartDate, 10)
      || bookingLocalDate(returned, timezone) !== text(rentalEndDate, 10)) {
    throw new BookingTimeSnapshotError('booking_exact_times_outside_rental_dates');
  }
  const version = text(input.version ?? input.timeSnapshotVersion, 80) || bookingTimeSnapshotVersion;
  if (version !== bookingTimeSnapshotVersion) {
    throw new BookingTimeSnapshotError('booking_exact_times_version_unsupported');
  }
  return Object.freeze({
    version,
    handoverAt: handover.toISOString(),
    returnAt: returned.toISOString(),
    timezone,
  });
}

export function bookingTimeSnapshotFromRow(row) {
  if (!row?.handover_at && !row?.return_at && !row?.time_snapshot_version) return null;
  // node-postgres decodes timestamptz columns to Date objects. Keep strict
  // string/offset validation for external request payloads, but canonicalize
  // trusted DB-row instants before passing them through the same validator.
  const databaseInstant = (value, code) => {
    if (!(value instanceof Date)) return value;
    if (!Number.isFinite(value.getTime())) throw new BookingTimeSnapshotError(code);
    return value.toISOString();
  };
  const databaseDate = (value) => {
    try {
      return postgresDateText(value);
    } catch {
      throw new BookingTimeSnapshotError('booking_exact_times_outside_rental_dates');
    }
  };
  return normalizeBookingTimeSnapshot({
    raw: {
      handoverAt: databaseInstant(row.handover_at, 'booking_handover_time_invalid'),
      returnAt: databaseInstant(row.return_at, 'booking_return_time_invalid'),
      timeSnapshotVersion: row.time_snapshot_version,
    },
    rentalStartDate: databaseDate(row.rental_start_date),
    rentalEndDate: databaseDate(row.rental_end_date),
    rentalTimezone: row.rental_timezone,
    required: true,
  });
}

export function assertSameBookingTimeSnapshot(expected, actual) {
  if ((expected == null) !== (actual == null)
      || (expected && (
        expected.version !== actual.version
        || expected.handoverAt !== actual.handoverAt
        || expected.returnAt !== actual.returnAt
        || expected.timezone !== actual.timezone
      ))) {
    throw new BookingTimeSnapshotError('booking_exact_times_changed');
  }
  return actual;
}
