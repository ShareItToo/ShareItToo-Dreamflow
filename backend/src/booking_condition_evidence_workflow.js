import { BookingConfirmationError } from './booking_confirmation_domain.js';
import {
  bindV52ConditionConfirmation,
  bindV52ConditionEvidence,
} from './v52_handover_return_workflow.js';

const SEGMENTS = new Set(['pickup', 'return']);
const DECISIONS = new Set(['confirmed', 'deviation_recorded']);
const SOURCES = new Set(['camera', 'gallery', 'browser_picker']);

function segment(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!SEGMENTS.has(normalized)) {
    throw new BookingConfirmationError(400, 'invalid_condition_evidence_segment');
  }
  return normalized;
}

function actorRole(booking, actorId) {
  if (booking.owner_id === actorId) return 'owner';
  if (booking.renter_id === actorId) return 'renter';
  throw new BookingConfirmationError(403, 'booking_forbidden');
}

function expectedRoles(selectedSegment) {
  return selectedSegment === 'pickup'
    ? { presenter: 'owner', verifier: 'renter' }
    : { presenter: 'renter', verifier: 'owner' };
}

function assertWorkflowState(booking, selectedSegment) {
  const expected = selectedSegment === 'pickup' ? 'accepted' : 'active';
  if (booking.workflow_status !== expected) {
    throw new BookingConfirmationError(409, 'condition_evidence_wrong_booking_state');
  }
}

export function parseConditionEvidence(raw, { booking, actorId }) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BookingConfirmationError(400, 'invalid_condition_evidence');
  }
  const selectedSegment = segment(raw.segment);
  assertWorkflowState(booking, selectedSegment);
  const role = actorRole(booking, actorId);
  const roles = expectedRoles(selectedSegment);
  const kind = typeof raw.kind === 'string' ? raw.kind.trim() : '';
  const expectedKind = role === roles.presenter
    ? 'presenter_photo'
    : role === roles.verifier
      ? 'counterparty_deviation'
      : null;
  if (kind !== expectedKind) {
    throw new BookingConfirmationError(403, 'condition_evidence_role_mismatch');
  }
  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  if (!SOURCES.has(source)) {
    throw new BookingConfirmationError(400, 'invalid_condition_evidence_source');
  }
  return Object.freeze({
    segment: selectedSegment,
    kind,
    actorRole: role,
    source,
    semanticSlot: typeof raw.semanticSlot === 'string'
      ? raw.semanticSlot.trim()
      : '',
    requiredUploadPurpose: selectedSegment === 'pickup'
      ? 'handover_evidence'
      : 'return_evidence',
  });
}

export async function recordConditionEvidenceForMessage(client, {
  bookingId,
  actorId,
  messageId,
  attachments,
  evidence,
}) {
  if (!evidence) return;
  if (!Array.isArray(attachments) || attachments.length !== 1) {
    throw new BookingConfirmationError(400, 'condition_evidence_requires_one_photo');
  }
  const inserted = await client.query(
    `INSERT INTO booking_condition_evidence (
       booking_id, segment, evidence_kind, actor_role, actor_id,
       upload_id, message_id, source
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [
      bookingId,
      evidence.segment,
      evidence.kind,
      evidence.actorRole,
      actorId,
      attachments[0].id,
      messageId,
      evidence.source,
    ],
  );
  await bindV52ConditionEvidence(client, {
    evidenceId: inserted.rows[0].id,
    bookingId,
    actorId,
    evidence,
    attachment: attachments[0],
    observedAt: inserted.rows[0].created_at,
  });
}

async function lockedBooking(client, bookingId) {
  const result = await client.query(
    `SELECT id, owner_id, renter_id, workflow_status
       FROM bookings
      WHERE id = $1
      FOR UPDATE`,
    [bookingId],
  );
  if (!result.rowCount) throw new BookingConfirmationError(404, 'booking_not_found');
  return result.rows[0];
}

async function evidenceCounts(client, { bookingId, selectedSegment }) {
  const result = await client.query(
    `SELECT evidence_kind, count(*)::integer AS count,
            bool_or(source <> 'camera') AS non_camera_used
       FROM booking_condition_evidence
      WHERE booking_id = $1 AND segment = $2
      GROUP BY evidence_kind`,
    [bookingId, selectedSegment],
  );
  const counts = {
    presenterPhotos: 0,
    deviationPhotos: 0,
    presenterNonCameraUsed: false,
  };
  for (const row of result.rows) {
    if (row.evidence_kind === 'presenter_photo') {
      counts.presenterPhotos = Number(row.count);
      counts.presenterNonCameraUsed = row.non_camera_used === true;
    }
    if (row.evidence_kind === 'counterparty_deviation') counts.deviationPhotos = Number(row.count);
  }
  return counts;
}

export async function getConditionEvidenceSummary(client, { actor, bookingId, rawSegment }) {
  const booking = await lockedBooking(client, bookingId);
  const selectedSegment = segment(rawSegment);
  actorRole(booking, actor.id);
  const counts = await evidenceCounts(client, { bookingId, selectedSegment });
  const confirmation = await client.query(
    `SELECT verifier_role, verifier_user_id, decision, presenter_photo_count,
            deviation_photo_count, created_at
       FROM booking_condition_confirmations
      WHERE booking_id = $1 AND segment = $2`,
    [bookingId, selectedSegment],
  );
  const row = confirmation.rows[0] ?? null;
  return Object.freeze({
    segment: selectedSegment,
    ...counts,
    counterpartyConfirmation: row ? {
      verifierRole: row.verifier_role,
      verifierUserId: row.verifier_user_id,
      decision: row.decision,
      presenterPhotoCount: Number(row.presenter_photo_count),
      deviationPhotoCount: Number(row.deviation_photo_count),
      createdAt: new Date(row.created_at).toISOString(),
    } : null,
    participantUserIds: [booking.owner_id, booking.renter_id],
  });
}

export async function recordConditionConfirmation(client, {
  actor,
  bookingId,
  raw,
}) {
  const booking = await lockedBooking(client, bookingId);
  const selectedSegment = segment(raw?.segment);
  assertWorkflowState(booking, selectedSegment);
  const role = actorRole(booking, actor.id);
  const roles = expectedRoles(selectedSegment);
  if (role !== roles.verifier) {
    throw new BookingConfirmationError(403, 'condition_confirmation_counterparty_required');
  }
  const decision = typeof raw?.decision === 'string' ? raw.decision.trim() : '';
  if (!DECISIONS.has(decision)) {
    throw new BookingConfirmationError(400, 'invalid_condition_confirmation_decision');
  }
  const counts = await evidenceCounts(client, { bookingId, selectedSegment });
  if (counts.presenterPhotos < 4) {
    throw new BookingConfirmationError(409, 'presenter_photo_set_incomplete');
  }
  if (decision === 'deviation_recorded' && counts.deviationPhotos < 1) {
    throw new BookingConfirmationError(409, 'deviation_photo_required');
  }
  if (decision === 'confirmed' && counts.deviationPhotos > 0) {
    throw new BookingConfirmationError(409, 'deviation_decision_required');
  }
  const inserted = await client.query(
    `INSERT INTO booking_condition_confirmations (
       booking_id, segment, verifier_role, verifier_user_id, decision,
       presenter_photo_count, deviation_photo_count
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (booking_id, segment, verifier_role) DO NOTHING
     RETURNING id, booking_id, segment, verifier_role, verifier_user_id,
               decision, presenter_photo_count, deviation_photo_count, created_at`,
    [
      bookingId,
      selectedSegment,
      role,
      actor.id,
      decision,
      counts.presenterPhotos,
      counts.deviationPhotos,
    ],
  );
  if (!inserted.rowCount) {
    const existing = await client.query(
      `SELECT id, booking_id, segment, verifier_role, verifier_user_id,
              decision, presenter_photo_count, deviation_photo_count, created_at
         FROM booking_condition_confirmations
        WHERE booking_id = $1 AND segment = $2 AND verifier_role = $3`,
      [bookingId, selectedSegment, role],
    );
    const row = existing.rows[0];
    if (!row || row.verifier_user_id !== actor.id || row.decision !== decision) {
      throw new BookingConfirmationError(409, 'condition_confirmation_already_recorded');
    }
    await bindV52ConditionConfirmation(client, {
      confirmation: row,
      bookingId,
    });
    return {
      confirmation: row,
      replayed: true,
      participantUserIds: [booking.owner_id, booking.renter_id],
    };
  }
  await bindV52ConditionConfirmation(client, {
    confirmation: inserted.rows[0],
    bookingId,
  });
  return {
    confirmation: inserted.rows[0],
    replayed: false,
    participantUserIds: [booking.owner_id, booking.renter_id],
  };
}

export async function assertConditionEvidenceReadyForVerification(client, {
  bookingId,
  selectedSegment,
  verifierUserId,
}) {
  const counts = await evidenceCounts(client, { bookingId, selectedSegment });
  if (counts.presenterPhotos < 4) {
    throw new BookingConfirmationError(409, 'presenter_photo_set_incomplete');
  }
  const confirmation = await client.query(
    `SELECT decision, verifier_user_id, deviation_photo_count
       FROM booking_condition_confirmations
      WHERE booking_id = $1 AND segment = $2`,
    [bookingId, selectedSegment],
  );
  const row = confirmation.rows[0];
  if (!row || row.verifier_user_id !== verifierUserId) {
    throw new BookingConfirmationError(409, 'condition_confirmation_required');
  }
  if (row.decision === 'deviation_recorded'
      && (Number(row.deviation_photo_count) < 1 || counts.deviationPhotos < 1)) {
    throw new BookingConfirmationError(409, 'deviation_photo_required');
  }
  return true;
}
