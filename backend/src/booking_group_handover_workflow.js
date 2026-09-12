import crypto from 'node:crypto';

import {
  bookingGroupHandoverPolicies,
  buildBookingGroupItemHandoverState,
  buildSharedBookingGroupAppointments,
  deriveBookingGroupOperationalState,
} from './booking_group_handover_domain.js';
import { BookingWorkflowError } from './booking_workflow.js';

function safeText(value, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function identifier(value, code) {
  const candidate = safeText(value);
  if (!candidate || !/^[A-Za-z0-9_.:-]+$/u.test(candidate)) {
    throw new BookingWorkflowError(400, code);
  }
  return candidate;
}

function idempotencyKey(value) {
  const candidate = safeText(value);
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)) {
    throw new BookingWorkflowError(400, 'invalid_idempotency_key');
  }
  return candidate;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function publicAppointment(row) {
  return Object.freeze({
    id: row.id,
    type: row.appointment_type,
    scheduledAt: new Date(row.scheduled_at).toISOString(),
    timezone: row.rental_timezone,
    exactAddressDisclosed: false,
  });
}

async function lockedFinalGroup(client, bookingGroupId) {
  const result = await client.query(
    `SELECT grp.id, grp.owner_id, grp.renter_id, grp.starts_at, grp.ends_at,
            grp.rental_timezone, grp.handover_location_key,
            event.to_state, event.group_quote_id, event.group_quote_hash,
            quote.item_count
       FROM booking_groups AS grp
       JOIN LATERAL (
         SELECT state.to_state, state.group_quote_id, state.group_quote_hash
           FROM booking_group_state_events AS state
          WHERE state.booking_group_id = grp.id
          ORDER BY state.event_sequence DESC
          LIMIT 1
       ) AS event ON true
       JOIN booking_group_quotes AS quote
         ON quote.id = event.group_quote_id
        AND quote.quote_hash = event.group_quote_hash
      WHERE grp.id = $1
      FOR UPDATE OF grp`,
    [bookingGroupId],
  );
  if (!result.rowCount) throw new BookingWorkflowError(404, 'booking_group_not_found');
  return result.rows[0];
}

function assertParticipant(group, actorId) {
  if (![group.owner_id, group.renter_id].includes(actorId)) {
    throw new BookingWorkflowError(403, 'booking_group_forbidden');
  }
}

function assertFinalAcceptance(group) {
  if (!['owner_accepted', 'counteroffer_accepted'].includes(group.to_state)) {
    throw new BookingWorkflowError(409, 'booking_group_not_finally_accepted');
  }
}

async function hasSystemRiskHold(client, group) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM user_suspensions
        WHERE user_id = ANY($1::text[])
          AND scope = 'account' AND lifted_at IS NULL
          AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
     ) AS held`,
    [[group.owner_id, group.renter_id]],
  );
  return result.rows[0]?.held === true;
}

async function startCommand(client, { key, actorId, groupId }) {
  const requestHash = hashJson({ bookingGroupId: groupId });
  const inserted = await client.query(
    `INSERT INTO booking_group_appointment_commands (
       idempotency_key, actor_id, booking_group_id, request_hash
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [key, actorId, groupId, requestHash],
  );
  if (inserted.rowCount) return null;
  const existing = await client.query(
    `SELECT actor_id, booking_group_id, request_hash,
            response_payload, completed_at
       FROM booking_group_appointment_commands
      WHERE idempotency_key = $1
      FOR UPDATE`,
    [key],
  );
  const command = existing.rows[0];
  if (!command || command.actor_id !== actorId || command.booking_group_id !== groupId
    || command.request_hash !== requestHash) {
    throw new BookingWorkflowError(409, 'idempotency_key_reused');
  }
  if (!command.completed_at || !command.response_payload) {
    throw new BookingWorkflowError(409, 'booking_group_appointment_command_in_progress');
  }
  return Object.freeze({ ...command.response_payload, replayed: true });
}

async function completeCommand(client, key, response) {
  await client.query(
    `UPDATE booking_group_appointment_commands
        SET response_payload = $2::jsonb, completed_at = now()
      WHERE idempotency_key = $1`,
    [key, JSON.stringify(response)],
  );
}

async function storedAppointments(client, groupId) {
  const result = await client.query(
    `SELECT id, appointment_type, scheduled_at, rental_timezone,
            handover_location_key
       FROM booking_group_appointments
      WHERE booking_group_id = $1
      ORDER BY appointment_type`,
    [groupId],
  );
  return result.rows.map(publicAppointment);
}

function appointmentResponse(group, appointments, { replayed, alreadyScheduled = false }) {
  return Object.freeze({
    bookingGroupId: group.id,
    groupQuoteId: group.group_quote_id,
    groupQuoteHash: group.group_quote_hash,
    operationalState: 'ready',
    policies: bookingGroupHandoverPolicies,
    location: {
      compatibility: 'same_exact_location_internal',
      exactAddressDisclosed: false,
    },
    appointments,
    itemEvidenceScope: 'booking_position',
    replayed,
    alreadyScheduled,
  });
}

export async function bindBookingGroupPositionToV52Booking(client, {
  actor,
  bookingGroupId,
  groupPositionId,
  bookingId,
}) {
  const groupId = identifier(bookingGroupId, 'invalid_booking_group_identifier');
  const positionId = identifier(groupPositionId, 'invalid_booking_group_position_identifier');
  const itemBookingId = identifier(bookingId, 'invalid_booking_identifier');
  const group = await lockedFinalGroup(client, groupId);
  assertParticipant(group, actor.id);
  assertFinalAcceptance(group);
  const source = await client.query(
    `SELECT quote_position.id AS group_quote_position_id,
            quote_position.group_position_id, quote_position.listing_id,
            quote_position.booking_quote_id, quote_position.booking_quote_hash,
            contract.id AS platform_contract_id
       FROM booking_group_quote_positions AS quote_position
       JOIN platform_contracts AS contract
         ON contract.booking_id = $4
        AND contract.quote_id = quote_position.booking_quote_id
        AND contract.quote_hash = quote_position.booking_quote_hash
      WHERE quote_position.booking_group_id = $1
        AND quote_position.group_quote_id = $2
        AND quote_position.group_position_id = $3`,
    [groupId, group.group_quote_id, positionId, itemBookingId],
  );
  if (!source.rowCount) {
    throw new BookingWorkflowError(409, 'booking_group_item_v52_contract_not_found');
  }
  const item = source.rows[0];
  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO booking_group_position_booking_bindings (
         booking_group_id, group_quote_id, group_quote_hash,
         group_quote_position_id, group_position_id, listing_id,
         booking_id, platform_contract_id, booking_quote_id,
         booking_quote_hash, bound_by_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING
       RETURNING id, created_at`,
      [
        groupId, group.group_quote_id, group.group_quote_hash,
        item.group_quote_position_id, item.group_position_id, item.listing_id,
        itemBookingId, item.platform_contract_id, item.booking_quote_id,
        item.booking_quote_hash, actor.id,
      ],
    );
  } catch (error) {
    if (error?.code === '23514') {
      throw new BookingWorkflowError(409, 'booking_group_item_binding_invalid');
    }
    throw error;
  }
  if (inserted.rowCount) {
    await client.query(
      `INSERT INTO audit_log (
         actor_id, actor_role, action, resource_type, resource_id, metadata
       ) VALUES (
         $1, $2, 'booking_group.item_v52_booking_bound',
         'booking_group_position', $3, $4::jsonb
       )`,
      [actor.id, actor.role ?? 'user', positionId, JSON.stringify({
        bookingGroupId: groupId,
        bookingId: itemBookingId,
        platformContractId: item.platform_contract_id,
        groupQuoteId: group.group_quote_id,
      })],
    );
    return Object.freeze({
      id: inserted.rows[0].id,
      bookingGroupId: groupId,
      groupPositionId: positionId,
      bookingId: itemBookingId,
      platformContractId: item.platform_contract_id,
      replayed: false,
    });
  }
  const existing = await client.query(
    `SELECT id, booking_id, platform_contract_id
       FROM booking_group_position_booking_bindings
      WHERE booking_group_id = $1 AND group_position_id = $2`,
    [groupId, positionId],
  );
  const row = existing.rows[0];
  if (!row || row.booking_id !== itemBookingId
    || row.platform_contract_id !== item.platform_contract_id) {
    throw new BookingWorkflowError(409, 'booking_group_item_binding_changed');
  }
  return Object.freeze({
    id: row.id,
    bookingGroupId: groupId,
    groupPositionId: positionId,
    bookingId: itemBookingId,
    platformContractId: item.platform_contract_id,
    replayed: true,
  });
}

export async function scheduleBookingGroupAppointments(client, {
  actor,
  bookingGroupId,
  idempotencyKey: rawKey,
}) {
  const groupId = identifier(bookingGroupId, 'invalid_booking_group_identifier');
  const key = idempotencyKey(rawKey);
  const group = await lockedFinalGroup(client, groupId);
  assertParticipant(group, actor.id);
  assertFinalAcceptance(group);
  const replay = await startCommand(client, { key, actorId: actor.id, groupId });
  if (replay) return replay;
  if (await hasSystemRiskHold(client, group)) {
    throw new BookingWorkflowError(409, 'booking_group_system_risk_hold');
  }
  const existing = await storedAppointments(client, groupId);
  if (existing.length) {
    if (existing.length !== 2) {
      throw new BookingWorkflowError(409, 'booking_group_appointment_set_incomplete');
    }
    const response = appointmentResponse(group, existing, {
      replayed: false,
      alreadyScheduled: true,
    });
    await completeCommand(client, key, response);
    return response;
  }
  const bindingCount = await client.query(
    `SELECT count(*)::int AS count
       FROM booking_group_position_booking_bindings
      WHERE booking_group_id = $1 AND group_quote_id = $2
        AND group_quote_hash = $3`,
    [groupId, group.group_quote_id, group.group_quote_hash],
  );
  if (Number(bindingCount.rows[0]?.count ?? 0) !== Number(group.item_count)) {
    throw new BookingWorkflowError(409, 'booking_group_item_bindings_incomplete');
  }
  const appointments = buildSharedBookingGroupAppointments({
    bookingGroupId: groupId,
    groupQuoteId: group.group_quote_id,
    groupQuoteHash: group.group_quote_hash,
    startsAt: group.starts_at,
    endsAt: group.ends_at,
    timezone: group.rental_timezone,
    handoverLocationKey: group.handover_location_key,
    createdById: actor.id,
    commandKey: key,
  });
  for (const appointment of appointments) {
    await client.query(
      `INSERT INTO booking_group_appointments (
         id, booking_group_id, group_quote_id, group_quote_hash,
         appointment_type, scheduled_at, rental_timezone,
         handover_location_key, evidence_policy, chat_policy,
         timer_policy, address_policy, created_by_id, command_key
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        appointment.id, appointment.bookingGroupId, appointment.groupQuoteId,
        appointment.groupQuoteHash, appointment.appointmentType,
        appointment.scheduledAt, appointment.timezone,
        appointment.handoverLocationKey, appointment.policies.evidence,
        appointment.policies.chat, appointment.policies.timers,
        appointment.policies.address, appointment.createdById,
        appointment.commandKey,
      ],
    );
  }
  const stored = await storedAppointments(client, groupId);
  const response = appointmentResponse(group, stored, { replayed: false });
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES (
       $1, $2, 'booking_group.shared_appointments_scheduled',
       'booking_group', $3, $4::jsonb
     )`,
    [actor.id, actor.role ?? 'user', groupId, JSON.stringify({
      groupQuoteId: group.group_quote_id,
      groupQuoteHash: group.group_quote_hash,
      appointmentCount: 2,
      itemCount: Number(group.item_count),
      exactAddressStored: false,
      evidenceScope: 'booking_position',
    })],
  );
  await completeCommand(client, key, response);
  return response;
}

export async function getBookingGroupHandoverReturn(client, {
  actorId,
  bookingGroupId,
}) {
  const groupId = identifier(bookingGroupId, 'invalid_booking_group_identifier');
  const group = await lockedFinalGroup(client, groupId);
  assertParticipant(group, actorId);
  const systemRiskHold = await hasSystemRiskHold(client, group);
  const appointmentRows = await storedAppointments(client, groupId);
  const positionRows = await client.query(
    `SELECT quote_position.id AS group_quote_position_id,
            quote_position.group_position_id, quote_position.listing_id,
            binding.booking_id, binding.platform_contract_id,
            booking.workflow_status, booking.return_state, booking.return_t0,
            booking.return_report_deadline, booking.return_clarification_deadline,
            thread.id AS thread_id
       FROM booking_group_quote_positions AS quote_position
       LEFT JOIN booking_group_position_booking_bindings AS binding
         ON binding.group_quote_position_id = quote_position.id
       LEFT JOIN bookings AS booking ON booking.id = binding.booking_id
       LEFT JOIN message_threads AS thread ON thread.booking_id = binding.booking_id
      WHERE quote_position.booking_group_id = $1
        AND quote_position.group_quote_id = $2
      ORDER BY quote_position.sort_order`,
    [groupId, group.group_quote_id],
  );
  const bookingIds = positionRows.rows.map((row) => row.booking_id).filter(Boolean);
  let evidence = { rows: [] };
  let confirmations = { rows: [] };
  let returnCases = { rows: [] };
  if (bookingIds.length) {
    evidence = await client.query(
      `SELECT evidence_id, booking_id, segment, evidence_kind, semantic_slot,
              upload_id, upload_sha256, observed_at
         FROM v52_condition_evidence_bindings
        WHERE booking_id = ANY($1::text[])
        ORDER BY booking_id, segment, semantic_slot, observed_at`,
      [bookingIds],
    );
    confirmations = await client.query(
      `SELECT confirmation_id, booking_id, segment, decision,
              presenter_evidence_set_sha256, presenter_photo_count,
              deviation_photo_count, confirmed_at
         FROM v52_condition_confirmation_bindings
        WHERE booking_id = ANY($1::text[])
        ORDER BY booking_id, segment, confirmed_at`,
      [bookingIds],
    );
    returnCases = await client.query(
      `SELECT id, booking_id, reason_code, contested_authorized_minor,
              undisputed_releasable_minor, response_due_at,
              next_status_update_due_at
         FROM v52_return_cases
        WHERE booking_id = ANY($1::text[])
        ORDER BY booking_id, created_at DESC`,
      [bookingIds],
    );
  }
  const items = positionRows.rows.map((position) => buildBookingGroupItemHandoverState({
    position,
    evidenceRows: evidence.rows.filter((row) => row.booking_id === position.booking_id),
    confirmationRows: confirmations.rows.filter((row) => row.booking_id === position.booking_id),
    returnCase: returnCases.rows.find((row) => row.booking_id === position.booking_id) ?? null,
  }));
  const boundItemCount = bookingIds.length;
  return Object.freeze({
    bookingGroupId: groupId,
    groupState: group.to_state,
    groupQuoteId: group.group_quote_id,
    groupQuoteHash: group.group_quote_hash,
    operationalState: deriveBookingGroupOperationalState({
      systemRiskHold,
      requiredItemCount: Number(group.item_count),
      boundItemCount,
      appointmentCount: appointmentRows.length,
    }),
    systemRiskHold,
    policies: bookingGroupHandoverPolicies,
    sharedAppointments: appointmentRows,
    location: {
      compatibility: 'same_exact_location_internal',
      exactAddressDisclosed: false,
    },
    requiredItemCount: Number(group.item_count),
    boundItemCount,
    items,
    groupNeedsReview: null,
    itemReviewIsolation: true,
  });
}
