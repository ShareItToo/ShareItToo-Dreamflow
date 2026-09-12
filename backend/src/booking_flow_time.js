import crypto from 'node:crypto';

import { bookingLocalDate } from './booking_address_reveal_domain.js';
import { resolveZonedCalendarInstant } from './return_calendar_policy.js';

const allowedWorkflowStatuses = Object.freeze([
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'returned',
]);

export class BookingFlowTimeError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function safeText(value, maxLength = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= maxLength ? text : '';
}

function prefixForSegment(segment) {
  if (segment === 'pickup') return 'handover';
  if (segment === 'return') return 'return';
  throw new BookingFlowTimeError(400, 'invalid_flow_time_segment');
}

function assertParticipant({ actorId, ownerId, renterId }) {
  if (actorId !== ownerId && actorId !== renterId) {
    throw new BookingFlowTimeError(403, 'booking_flow_time_forbidden');
  }
}

function assertWorkflowStatus(status) {
  if (!allowedWorkflowStatuses.includes(status)) {
    throw new BookingFlowTimeError(409, 'booking_flow_time_unavailable', { status });
  }
}

export function normalizeBookingFlowTimeState(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  return {
    handoverTimeRequested: safeText(source.handoverTimeRequested, 120),
    returnTimeRequested: safeText(source.returnTimeRequested, 120),
    handoverTimeIso: safeText(source.handoverTimeIso, 80),
    returnTimeIso: safeText(source.returnTimeIso, 80),
    handoverTimeRequestedByUserId: safeText(source.handoverTimeRequestedByUserId, 120),
    returnTimeRequestedByUserId: safeText(source.returnTimeRequestedByUserId, 120),
    handoverTimeConfirmed: source.handoverTimeConfirmed === true,
    returnTimeConfirmed: source.returnTimeConfirmed === true,
    handoverTimeConfirmedByUserId: safeText(source.handoverTimeConfirmedByUserId, 120),
    returnTimeConfirmedByUserId: safeText(source.returnTimeConfirmedByUserId, 120),
    handoverTimeConfirmedAt: safeText(source.handoverTimeConfirmedAt, 80),
    returnTimeConfirmedAt: safeText(source.returnTimeConfirmedAt, 80),
    flowTimeRevision: Number.isSafeInteger(Number(source.flowTimeRevision))
      ? Number(source.flowTimeRevision)
      : 0,
  };
}

export function bookingFlowTimeSystemMessage({
  action,
  segment,
  state,
  changed = false,
}) {
  const prefix = prefixForSegment(segment);
  const label = safeText(state?.[`${prefix}TimeRequested`], 120);
  if (!label) throw new BookingFlowTimeError(409, 'flow_time_proposal_missing');
  const flowLabel = segment === 'return' ? 'Rückgabezeit' : 'Übergabezeit';
  const icon = segment === 'return' ? '🔄' : '📦';
  if (action === 'propose') {
    return `${icon} ${flowLabel} ${changed ? 'geändert' : 'angefragt'}: ${label} Uhr`;
  }
  if (action === 'confirm') {
    return `${icon} ${flowLabel} bestätigt: ${label} Uhr`;
  }
  throw new BookingFlowTimeError(400, 'invalid_flow_time_action');
}

export function normalizeBookingFlowTimeProposal({
  raw,
  rentalStartDate,
  rentalEndDate,
  rentalTimezone = 'Europe/Berlin',
}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (safeText(input.action, 32) !== 'propose') return input;
  const hasLocalDate = Object.hasOwn(input, 'localDate');
  const hasLocalTime = Object.hasOwn(input, 'localTime');
  if (!hasLocalDate && !hasLocalTime) return input;
  const segment = safeText(input.segment, 16);
  prefixForSegment(segment);
  const localDate = safeText(input.localDate, 10);
  const localTime = safeText(input.localTime, 5);
  const expectedDate = segment === 'pickup' ? rentalStartDate : rentalEndDate;
  if (localDate !== expectedDate || !/^\d{4}-\d{2}-\d{2}$/u.test(localDate)
      || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(localTime)) {
    throw new BookingFlowTimeError(400, 'flow_time_outside_booking_date');
  }
  let instant;
  try {
    instant = resolveZonedCalendarInstant({
      date: localDate,
      time: localTime,
      timezone: rentalTimezone,
    });
  } catch {
    throw new BookingFlowTimeError(400, 'invalid_flow_time_proposal');
  }
  if (bookingLocalDate(instant, rentalTimezone) !== expectedDate) {
    throw new BookingFlowTimeError(400, 'flow_time_outside_booking_date');
  }
  const dateProbe = new Date(`${localDate}T00:00:00.000Z`);
  const weekdays = Object.freeze([
    'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag',
  ]);
  return {
    ...input,
    label: `${weekdays[dateProbe.getUTCDay()]}, ${localTime}`,
    timeIso: instant.toISOString(),
  };
}

export function applyBookingFlowTimeAction({
  payload,
  actorId,
  ownerId,
  renterId,
  workflowStatus,
  rentalStartDate,
  rentalEndDate,
  rentalTimezone = 'Europe/Berlin',
  raw,
  now = new Date(),
}) {
  assertParticipant({ actorId, ownerId, renterId });
  assertWorkflowStatus(workflowStatus);
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const action = safeText(input.action, 32);
  const segment = safeText(input.segment, 16);
  const prefix = prefixForSegment(segment);
  const state = normalizeBookingFlowTimeState(payload);
  const previousRequested = safeText(state[`${prefix}TimeRequested`], 120);

  if (action === 'propose') {
    const label = safeText(input.label, 120);
    const timeIso = safeText(input.timeIso, 80);
    const parsed = Date.parse(timeIso);
    if (!label || !Number.isFinite(parsed)) {
      throw new BookingFlowTimeError(400, 'invalid_flow_time_proposal');
    }
    const expectedDate = segment === 'pickup' ? rentalStartDate : rentalEndDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate ?? '')
        || bookingLocalDate(new Date(parsed), rentalTimezone) !== expectedDate) {
      throw new BookingFlowTimeError(400, 'flow_time_outside_booking_date');
    }
    state[`${prefix}TimeRequested`] = label;
    state[`${prefix}TimeIso`] = new Date(parsed).toISOString();
    state[`${prefix}TimeRequestedByUserId`] = actorId;
    state[`${prefix}TimeConfirmed`] = false;
    state[`${prefix}TimeConfirmedByUserId`] = '';
    state[`${prefix}TimeConfirmedAt`] = '';
  } else if (action === 'confirm') {
    const requested = safeText(state[`${prefix}TimeRequested`], 120);
    const requestedBy = safeText(state[`${prefix}TimeRequestedByUserId`], 120);
    if (!requested || !requestedBy) {
      throw new BookingFlowTimeError(409, 'flow_time_proposal_missing');
    }
    if (requestedBy === actorId) {
      throw new BookingFlowTimeError(409, 'flow_time_counterparty_confirmation_required');
    }
    state[`${prefix}TimeConfirmed`] = true;
    state[`${prefix}TimeConfirmedByUserId`] = actorId;
    state[`${prefix}TimeConfirmedAt`] = now.toISOString();
  } else {
    throw new BookingFlowTimeError(400, 'invalid_flow_time_action');
  }

  state.flowTimeRevision += 1;
  return {
    payload: { ...(payload ?? {}), ...state },
    state,
    eventType: `booking.flow_time.${action}`,
    eventMetadata: { segment, action, flowTimeRevision: state.flowTimeRevision },
    systemMessage: bookingFlowTimeSystemMessage({
      action,
      segment,
      state,
      changed: action === 'propose' && previousRequested.length > 0,
    }),
  };
}

async function lockedBooking(client, bookingId) {
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.workflow_status, booking.workflow_version,
            booking.rental_start_date::text AS rental_start_date_text,
            booking.rental_end_date::text AS rental_end_date_text,
            booking.rental_timezone, request.payload
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.id = $1
     FOR UPDATE OF booking, request`,
    [bookingId],
  );
  if (!result.rowCount) throw new BookingFlowTimeError(404, 'booking_not_found');
  const row = result.rows[0];
  if (Number(row.workflow_version) !== 1) {
    throw new BookingFlowTimeError(409, 'booking_requires_b6_revalidation');
  }
  return row;
}

export async function getBookingFlowTime(client, { actorId, bookingId }) {
  const result = await client.query(
    `SELECT booking.owner_id, booking.renter_id, booking.workflow_status,
            booking.workflow_version, request.payload
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) throw new BookingFlowTimeError(404, 'booking_not_found');
  const row = result.rows[0];
  assertParticipant({ actorId, ownerId: row.owner_id, renterId: row.renter_id });
  if (Number(row.workflow_version) !== 1) {
    throw new BookingFlowTimeError(409, 'booking_requires_b6_revalidation');
  }
  assertWorkflowStatus(row.workflow_status);
  return normalizeBookingFlowTimeState(row.payload);
}

export async function updateBookingFlowTime(client, {
  actor,
  bookingId,
  raw,
  idempotencyKey,
}) {
  const eventKey = safeText(idempotencyKey, 160);
  if (!eventKey || !/^[A-Za-z0-9_.:-]{8,160}$/.test(eventKey)) {
    throw new BookingFlowTimeError(400, 'invalid_idempotency_key');
  }
  const row = await lockedBooking(client, bookingId);
  assertParticipant({ actorId: actor.id, ownerId: row.owner_id, renterId: row.renter_id });

  const existingEvent = await client.query(
    'SELECT booking_id, actor_id, metadata FROM booking_events WHERE idempotency_key = $1',
    [eventKey],
  );
  if (existingEvent.rowCount) {
    const event = existingEvent.rows[0];
    if (event.booking_id !== bookingId || event.actor_id !== actor.id) {
      throw new BookingFlowTimeError(409, 'idempotency_key_reused');
    }
    return { state: normalizeBookingFlowTimeState(row.payload), replayed: true, participantUserIds: [row.owner_id, row.renter_id] };
  }

  const threadResult = await client.query(
    `SELECT id
     FROM message_threads
     WHERE booking_id = $1 OR request_id = $1
     ORDER BY CASE WHEN booking_id = $1 THEN 0 ELSE 1 END
     LIMIT 1
     FOR UPDATE`,
    [bookingId],
  );
  if (!threadResult.rowCount) {
    throw new BookingFlowTimeError(409, 'booking_chat_unavailable');
  }

  const normalizedRaw = normalizeBookingFlowTimeProposal({
    raw,
    rentalStartDate: row.rental_start_date_text,
    rentalEndDate: row.rental_end_date_text,
    rentalTimezone: row.rental_timezone,
  });
  const applied = applyBookingFlowTimeAction({
    payload: row.payload,
    actorId: actor.id,
    ownerId: row.owner_id,
    renterId: row.renter_id,
    workflowStatus: row.workflow_status,
    rentalStartDate: row.rental_start_date_text,
    rentalEndDate: row.rental_end_date_text,
    rentalTimezone: row.rental_timezone,
    raw: normalizedRaw,
  });
  await client.query(
    'UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1',
    [bookingId, JSON.stringify(applied.payload)],
  );
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, idempotency_key, metadata
     ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [bookingId, actor.id, applied.eventType, eventKey, JSON.stringify(applied.eventMetadata)],
  );
  const messageId = `message_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO messages (
       id, thread_id, sender_id, sender_type, body, is_read,
       client_message_id, message_version, created_at
     ) VALUES ($1, $2, NULL, 'system', $3, true, $4, 1, now())`,
    [
      messageId,
      threadResult.rows[0].id,
      applied.systemMessage,
      `system:flow-time:${eventKey}`,
    ],
  );
  await client.query(
    'UPDATE message_threads SET last_message_at = now() WHERE id = $1',
    [threadResult.rows[0].id],
  );
  return {
    state: applied.state,
    replayed: false,
    participantUserIds: [row.owner_id, row.renter_id],
  };
}
