import crypto from 'node:crypto';

import { bookingLocalDate } from './booking_address_reveal_domain.js';
import {
  handoverExceptionAuditMetadata,
  HandoverExceptionError,
  handoverExceptionFingerprint,
  handoverExceptionIdempotencyKey,
  handoverExceptionVersion,
  normalizeHandoverExceptionInput,
} from './handover_exception_domain.js';
import {
  supportIntakeScopeVersion,
  supportPacketVersion,
  supportSafetyGuidanceVersion,
  supportSafetyTriageVersion,
} from './support_case_domain.js';
import { createSupportCase } from './support_case_workflow.js';

const eligibleWorkflowStatuses = new Set(['accepted', 'confirmed']);

function bookingIdentifier(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 120 || !/^[A-Za-z0-9_.:-]+$/u.test(normalized)) {
    throw new HandoverExceptionError(404, 'booking_not_found');
  }
  return normalized;
}

function supportSummary(normalized) {
  const prefix = {
    item_mismatch: 'Bei der Übergabe wurde ein wesentlich abweichender Artikel gemeldet.',
    offplatform_deposit_request: 'Bei der Übergabe wurde eine externe Kaution oder Sicherheitszahlung verlangt.',
    party_no_show: 'Die Gegenpartei wurde zum bestätigten Übergabetermin als nicht anwesend gemeldet.',
  }[normalized.kind];
  return `${prefix} ${normalized.details}`;
}

function internalCaseIdempotencyKey(normalized, key) {
  const digest = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  return `handover_exception_${normalized.kind}_${digest.slice(0, 32)}`;
}

function confirmedPickupAppointment(row, now) {
  const payload = row.payload ?? {};
  const appointment = new Date(payload.handoverTimeIso);
  const confirmedAt = new Date(payload.handoverTimeConfirmedAt);
  const requestedBy = typeof payload.handoverTimeRequestedByUserId === 'string'
    ? payload.handoverTimeRequestedByUserId.trim()
    : '';
  const confirmedBy = typeof payload.handoverTimeConfirmedByUserId === 'string'
    ? payload.handoverTimeConfirmedByUserId.trim()
    : '';
  const participantIds = new Set([row.owner_id, row.renter_id]);
  if (payload.handoverTimeConfirmed !== true
      || !participantIds.has(requestedBy)
      || !participantIds.has(confirmedBy)
      || requestedBy === confirmedBy
      || !Number.isFinite(appointment.getTime())
      || !Number.isFinite(confirmedAt.getTime())
      || bookingLocalDate(appointment, row.rental_timezone) !== row.rental_start_date_text) {
    throw new HandoverExceptionError(
      409,
      'handover_exception_counterparty_confirmed_appointment_required',
    );
  }
  if (now.getTime() < appointment.getTime()) {
    throw new HandoverExceptionError(409, 'handover_exception_appointment_not_reached');
  }
  return appointment;
}

async function bookingBinding(client, bookingId, actorId) {
  const selected = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.listing_id, booking.workflow_status,
            booking.workflow_version,
            booking.rental_start_date::text AS rental_start_date_text,
            booking.rental_timezone, request.payload
       FROM bookings AS booking
       JOIN rental_requests AS request ON request.id = booking.id
      WHERE booking.id = $1
      FOR UPDATE OF booking, request`,
    [bookingId],
  );
  const row = selected.rows[0];
  if (!row || (row.owner_id !== actorId && row.renter_id !== actorId)) {
    throw new HandoverExceptionError(404, 'booking_not_found');
  }
  if (Number(row.workflow_version) !== 1
      || !eligibleWorkflowStatuses.has(row.workflow_status)) {
    throw new HandoverExceptionError(409, 'handover_exception_booking_state_ineligible');
  }
  return row;
}

async function noShowContactAttempts(client, { bookingId, actorId, appointment, now }) {
  const result = await client.query(
    `SELECT count(*)::integer AS contact_attempt_count
       FROM messages AS message
       JOIN message_threads AS thread ON thread.id = message.thread_id
      WHERE COALESCE(thread.booking_id, thread.request_id) = $1
        AND message.sender_type = 'user'
        AND message.sender_id = $2
        AND message.created_at >= $3
        AND message.created_at <= $4`,
    [bookingId, actorId, appointment, now],
  );
  const count = Number(result.rows[0]?.contact_attempt_count ?? 0);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new HandoverExceptionError(409, 'handover_exception_in_app_contact_required');
  }
  return count;
}

export async function reportHandoverException(client, {
  actor,
  bookingId: rawBookingId,
  raw,
  idempotencyKey: rawIdempotencyKey,
  now = new Date(),
}) {
  if (!actor?.id || actor.role !== 'user') {
    throw new HandoverExceptionError(403, 'handover_exception_reporter_forbidden');
  }
  const bookingId = bookingIdentifier(rawBookingId);
  const normalized = normalizeHandoverExceptionInput(raw);
  const idempotencyKey = handoverExceptionIdempotencyKey(rawIdempotencyKey);
  const requestId = `booking.handover_exception:${idempotencyKey}`;
  const requestFingerprint = handoverExceptionFingerprint({
    bookingId,
    actorId: actor.id,
    normalized,
  });
  const prior = await client.query(
    `SELECT resource_id, metadata
       FROM audit_log
      WHERE actor_id = $1 AND request_id = $2
        AND action = 'booking.handover_exception_reported'`,
    [actor.id, requestId],
  );
  if (prior.rowCount) {
    if (prior.rows[0].resource_id !== bookingId
        || prior.rows[0].metadata?.requestFingerprint !== requestFingerprint) {
      throw new HandoverExceptionError(409, 'handover_exception_idempotency_conflict');
    }
    const replay = await createSupportCase(client, {
      actor,
      raw: {
        caseType: normalized.route.caseType,
        caseSubType: normalized.route.caseSubType,
        summary: supportSummary(normalized),
        immediateDanger: false,
        safetyTriage: {
          version: supportSafetyTriageVersion,
          packetVersion: supportPacketVersion,
          guidanceVersion: supportSafetyGuidanceVersion,
          immediateDanger: false,
          guidanceShown: false,
        },
        issueScope: {
          version: supportIntakeScopeVersion,
          singleIssueConfirmed: true,
          separationGuidanceShown: false,
        },
        linkedBookingId: bookingId,
      },
      idempotencyKey: internalCaseIdempotencyKey(normalized, idempotencyKey),
      operatingMode: 'simulation',
      specializedIntakeAuthority: 'handover_exception_workflow',
      now,
    });
    return Object.freeze({
      ...replay,
      replayed: true,
      exceptionReceipt: prior.rows[0].metadata,
    });
  }

  const booking = await bookingBinding(client, bookingId, actor.id);
  let contactAttemptCount = 0;
  let counterpartyConfirmedAppointment = false;
  if (normalized.kind === 'party_no_show') {
    const appointment = confirmedPickupAppointment(booking, now);
    counterpartyConfirmedAppointment = true;
    contactAttemptCount = await noShowContactAttempts(client, {
      bookingId,
      actorId: actor.id,
      appointment,
      now,
    });
  }

  const created = await createSupportCase(client, {
    actor,
    raw: {
      caseType: normalized.route.caseType,
      caseSubType: normalized.route.caseSubType,
      summary: supportSummary(normalized),
      immediateDanger: false,
      safetyTriage: {
        version: supportSafetyTriageVersion,
        packetVersion: supportPacketVersion,
        guidanceVersion: supportSafetyGuidanceVersion,
        immediateDanger: false,
        guidanceShown: false,
      },
      issueScope: {
        version: supportIntakeScopeVersion,
        singleIssueConfirmed: true,
        separationGuidanceShown: false,
      },
      linkedBookingId: bookingId,
      linkedListingId: booking.listing_id,
    },
    idempotencyKey: internalCaseIdempotencyKey(normalized, idempotencyKey),
    operatingMode: 'simulation',
    specializedIntakeAuthority: 'handover_exception_workflow',
    now,
  });
  if (created.supportCase.priority !== normalized.route.priority) {
    throw new HandoverExceptionError(409, 'handover_exception_server_route_invalid');
  }
  const exceptionReceipt = handoverExceptionAuditMetadata({
    normalized,
    supportCaseId: created.supportCase.id,
    workflowStatus: booking.workflow_status,
    contactAttemptCount,
    counterpartyConfirmedAppointment,
    requestFingerprint,
  });
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id,
       request_id, metadata, created_at
     ) VALUES (
       $1, 'user', 'booking.handover_exception_reported', 'booking', $2,
       $3, $4::jsonb, $5
     )`,
    [actor.id, bookingId, requestId, JSON.stringify(exceptionReceipt), now],
  );
  return Object.freeze({
    ...created,
    exceptionReceipt,
  });
}

export { HandoverExceptionError, handoverExceptionVersion };
