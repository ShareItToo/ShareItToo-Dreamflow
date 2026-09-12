import crypto from 'node:crypto';

import { resolveReturnT0 } from './private_pilot_return_domain.js';
import { addReturnPolicyCalendarDays, returnPolicyTimeZone } from './return_calendar_policy.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_.:-]{8,240}$/;
const PRESENTER_SLOTS = Object.freeze(['overview', 'detail', 'accessories', 'critical']);
const RETURN_REASON_CODES = new Set(['damage', 'no_show', 'wrong_item', 'behavior', 'other']);

export class V52HandoverReturnError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function text(value, maximum, code, { minimum = 1 } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new V52HandoverReturnError(400, code);
  }
  return normalized;
}

function idempotencyKey(value) {
  const normalized = text(value, 240, 'invalid_idempotency_key', { minimum: 8 });
  if (!IDEMPOTENCY_PATTERN.test(normalized)) {
    throw new V52HandoverReturnError(400, 'invalid_idempotency_key');
  }
  return normalized;
}

function exactMinor(value, code) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new V52HandoverReturnError(400, code);
  }
  return normalized;
}

function instant(value, code) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new V52HandoverReturnError(409, code);
  }
  return parsed;
}

function normalizedUploadIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new V52HandoverReturnError(400, 'v52_return_case_evidence_required');
  }
  const ids = value.map((entry) => text(
    entry,
    80,
    'v52_return_case_evidence_invalid',
  )).sort();
  if (new Set(ids).size !== ids.length || ids.some((entry) => !UUID_PATTERN.test(entry))) {
    throw new V52HandoverReturnError(400, 'v52_return_case_evidence_invalid');
  }
  return ids;
}

function assertBindingIntegrity(row) {
  if (!String(row.contract_version ?? '').startsWith('V5.2-')
      || row.document_key !== 'handover_return_damage'
      || row.document_version !== row.contract_version
      || row.document_locale !== row.contract_locale
      || !HASH_PATTERN.test(row.content_sha256 ?? '')
      || sha256(row.content_text ?? '') !== row.content_sha256
      || row.quote_id !== row.persisted_quote_id
      || row.quote_hash !== row.persisted_quote_hash
      || Number(row.quoted_total_minor) !== Number(row.quote_total_minor)) {
    throw new V52HandoverReturnError(409, 'v52_handover_contract_binding_invalid');
  }
}

async function bookingBinding(client, bookingId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.workflow_status, booking.ends_at, booking.return_t0,
            booking.quoted_total_minor, booking.currency, booking.rental_timezone,
            request.payload AS booking_payload,
            contract.id AS platform_contract_id, contract.contract_version,
            contract.locale AS contract_locale, contract.quote_id,
            contract.quote_hash, contract.handover_return_damage_snapshot_id,
            document.document_key, document.document_version,
            document.locale AS document_locale, document.content_text,
            document.content_sha256,
            quote.id AS persisted_quote_id, quote.quote_hash AS persisted_quote_hash,
            quote.total_minor AS quote_total_minor
       FROM bookings AS booking
       JOIN rental_requests AS request ON request.id = booking.id
       LEFT JOIN platform_contracts AS contract ON contract.booking_id = booking.id
       LEFT JOIN legal_document_snapshots AS document
         ON document.id = contract.handover_return_damage_snapshot_id
       LEFT JOIN booking_quotes AS quote
         ON quote.id = contract.quote_id AND quote.quote_hash = contract.quote_hash
      WHERE booking.id = $1
      ${lock ? 'FOR UPDATE OF booking, request' : ''}`,
    [bookingId],
  );
  if (!result.rowCount) throw new V52HandoverReturnError(404, 'booking_not_found');
  const row = result.rows[0];
  if (!String(row.contract_version ?? '').startsWith('V5.2-')) return null;
  assertBindingIntegrity(row);
  return row;
}

function expectedRole(segment, kind) {
  if (segment === 'pickup') return kind === 'presenter_photo' ? 'owner' : 'renter';
  if (segment === 'return') return kind === 'presenter_photo' ? 'renter' : 'owner';
  throw new V52HandoverReturnError(400, 'invalid_condition_evidence_segment');
}

function semanticSlot(value, kind) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (kind === 'counterparty_deviation') {
    if (normalized !== 'deviation') {
      throw new V52HandoverReturnError(400, 'v52_deviation_evidence_slot_invalid');
    }
    return normalized;
  }
  if (!PRESENTER_SLOTS.includes(normalized)) {
    throw new V52HandoverReturnError(400, 'v52_presenter_evidence_slot_required');
  }
  return normalized;
}

function assertProcessedUpload(attachment) {
  if (!attachment
      || attachment.contentScanStatus !== 'passed'
      || !HASH_PATTERN.test(attachment.contentSha256 ?? '')) {
    throw new V52HandoverReturnError(400, 'v52_condition_evidence_not_processed');
  }
}

async function presenterEvidenceSet(client, bookingId, segment) {
  const result = await client.query(
    `SELECT evidence_id, upload_id, upload_purpose, upload_sha256, semantic_slot,
            actor_role, actor_id, source
       FROM v52_condition_evidence_bindings
      WHERE booking_id = $1 AND segment = $2
        AND evidence_kind = 'presenter_photo'
      ORDER BY semantic_slot, upload_id`,
    [bookingId, segment],
  );
  const bySlot = new Map(result.rows.map((row) => [row.semantic_slot, row]));
  if (result.rowCount !== 4 || PRESENTER_SLOTS.some((slot) => !bySlot.has(slot))) {
    throw new V52HandoverReturnError(409, 'v52_presenter_photo_set_incomplete');
  }
  const canonical = PRESENTER_SLOTS.map((slot) => {
    const row = bySlot.get(slot);
    return {
      slot,
      evidenceId: row.evidence_id,
      uploadId: row.upload_id,
      uploadPurpose: row.upload_purpose,
      uploadSha256: row.upload_sha256,
      actorRole: row.actor_role,
      actorId: row.actor_id,
      source: row.source,
    };
  });
  return Object.freeze({
    rows: Object.freeze(PRESENTER_SLOTS.map((slot) => bySlot.get(slot))),
    sha256: sha256(JSON.stringify(canonical)),
  });
}

export async function bindV52ConditionEvidence(client, {
  evidenceId,
  bookingId,
  actorId,
  evidence,
  attachment,
  observedAt = new Date(),
}) {
  const binding = await bookingBinding(client, bookingId);
  if (!binding) return null;
  assertProcessedUpload(attachment);
  const slot = semanticSlot(evidence.semanticSlot, evidence.kind);
  const uploadPurpose = evidence.segment === 'pickup'
    ? 'handover_evidence'
    : (evidence.segment === 'return' ? 'return_evidence' : null);
  if (uploadPurpose === null
      || evidence.requiredUploadPurpose !== uploadPurpose) {
    throw new V52HandoverReturnError(400, 'v52_condition_evidence_purpose_mismatch');
  }
  if (expectedRole(evidence.segment, evidence.kind) !== evidence.actorRole
      || actorId !== (evidence.actorRole === 'owner' ? binding.owner_id : binding.renter_id)) {
    throw new V52HandoverReturnError(403, 'v52_condition_evidence_role_mismatch');
  }
  try {
    const inserted = await client.query(
      `INSERT INTO v52_condition_evidence_bindings (
         evidence_id, booking_id, platform_contract_id,
         handover_return_damage_snapshot_id, quote_id, quote_hash,
         contract_version, locale, segment, evidence_kind, semantic_slot,
         actor_role, actor_id, upload_id, upload_purpose, upload_sha256,
         source, observed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18
       ) RETURNING evidence_id, semantic_slot, upload_sha256`,
      [
        evidenceId,
        bookingId,
        binding.platform_contract_id,
        binding.handover_return_damage_snapshot_id,
        binding.quote_id,
        binding.quote_hash,
        binding.contract_version,
        binding.contract_locale,
        evidence.segment,
        evidence.kind,
        slot,
        evidence.actorRole,
        actorId,
        attachment.id,
        uploadPurpose,
        attachment.contentSha256,
        evidence.source,
        observedAt,
      ],
    );
    return inserted.rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      throw new V52HandoverReturnError(409, 'v52_condition_evidence_slot_already_recorded');
    }
    throw error;
  }
}

export async function bindV52ConditionConfirmation(client, {
  confirmation,
  bookingId,
}) {
  const binding = await bookingBinding(client, bookingId);
  if (!binding) return null;
  const set = await presenterEvidenceSet(client, bookingId, confirmation.segment);
  const deviation = await client.query(
    `SELECT count(*)::integer AS count
       FROM v52_condition_evidence_bindings
      WHERE booking_id = $1 AND segment = $2
        AND evidence_kind = 'counterparty_deviation'`,
    [bookingId, confirmation.segment],
  );
  const deviationCount = Number(deviation.rows[0]?.count ?? 0);
  if ((confirmation.decision === 'confirmed' && deviationCount !== 0)
      || (confirmation.decision === 'deviation_recorded' && deviationCount < 1)) {
    throw new V52HandoverReturnError(409, 'v52_condition_confirmation_evidence_mismatch');
  }
  const inserted = await client.query(
    `INSERT INTO v52_condition_confirmation_bindings (
       confirmation_id, booking_id, platform_contract_id,
       handover_return_damage_snapshot_id, quote_id, quote_hash,
       contract_version, locale, segment, verifier_role, verifier_user_id,
       decision, presenter_evidence_set_sha256, presenter_photo_count,
       deviation_photo_count, confirmed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 4, $14, $15
     ) ON CONFLICT (confirmation_id) DO NOTHING
     RETURNING confirmation_id, presenter_evidence_set_sha256`,
    [
      confirmation.id,
      bookingId,
      binding.platform_contract_id,
      binding.handover_return_damage_snapshot_id,
      binding.quote_id,
      binding.quote_hash,
      binding.contract_version,
      binding.contract_locale,
      confirmation.segment,
      confirmation.verifier_role,
      confirmation.verifier_user_id,
      confirmation.decision,
      set.sha256,
      deviationCount,
      confirmation.created_at,
    ],
  );
  if (inserted.rowCount) return inserted.rows[0];
  const existing = await client.query(
    `SELECT confirmation_id, presenter_evidence_set_sha256
       FROM v52_condition_confirmation_bindings
      WHERE confirmation_id = $1`,
    [confirmation.id],
  );
  if (!existing.rowCount || existing.rows[0].presenter_evidence_set_sha256 !== set.sha256) {
    throw new V52HandoverReturnError(409, 'v52_condition_confirmation_replay_mismatch');
  }
  return existing.rows[0];
}

export async function bindV52ConfirmationChallenge(client, {
  challengeId,
  bookingId,
  segment,
  presenterRole,
  presenterUserId,
  issuedAt,
}) {
  const binding = await bookingBinding(client, bookingId);
  if (!binding) return null;
  const set = await presenterEvidenceSet(client, bookingId, segment);
  const inserted = await client.query(
    `INSERT INTO v52_confirmation_challenge_bindings (
       challenge_id, booking_id, platform_contract_id,
       handover_return_damage_snapshot_id, quote_id, quote_hash,
       contract_version, locale, segment, presenter_role,
       presenter_user_id, presenter_evidence_set_sha256, issued_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
     ) RETURNING presenter_evidence_set_sha256`,
    [
      challengeId,
      bookingId,
      binding.platform_contract_id,
      binding.handover_return_damage_snapshot_id,
      binding.quote_id,
      binding.quote_hash,
      binding.contract_version,
      binding.contract_locale,
      segment,
      presenterRole,
      presenterUserId,
      set.sha256,
      issuedAt,
    ],
  );
  return inserted.rows[0];
}

export async function assertV52ChallengeEvidenceSet(client, {
  challengeId,
  bookingId,
  segment,
}) {
  const challenge = await client.query(
    `SELECT presenter_evidence_set_sha256
       FROM v52_confirmation_challenge_bindings
      WHERE challenge_id = $1 AND booking_id = $2 AND segment = $3`,
    [challengeId, bookingId, segment],
  );
  if (!challenge.rowCount) {
    const binding = await bookingBinding(client, bookingId);
    if (binding) {
      throw new V52HandoverReturnError(409, 'v52_confirmation_challenge_binding_missing');
    }
    return null;
  }
  const set = await presenterEvidenceSet(client, bookingId, segment);
  if (challenge.rows[0].presenter_evidence_set_sha256 !== set.sha256) {
    throw new V52HandoverReturnError(409, 'v52_confirmation_evidence_set_changed');
  }
  return set.sha256;
}

export async function recordV52ConfirmationVerification(client, {
  challengeId,
  bookingId,
  segment,
  verifierUserId,
  verifierRole,
  verifiedAt,
}) {
  const setHash = await assertV52ChallengeEvidenceSet(client, {
    challengeId,
    bookingId,
    segment,
  });
  if (!setHash) return null;
  const confirmation = await client.query(
    `SELECT confirmation.id
       FROM booking_condition_confirmations AS confirmation
       JOIN v52_condition_confirmation_bindings AS binding
         ON binding.confirmation_id = confirmation.id
      WHERE confirmation.booking_id = $1 AND confirmation.segment = $2
        AND confirmation.verifier_user_id = $3
        AND binding.presenter_evidence_set_sha256 = $4`,
    [bookingId, segment, verifierUserId, setHash],
  );
  if (!confirmation.rowCount) {
    throw new V52HandoverReturnError(409, 'v52_condition_confirmation_binding_required');
  }
  const eventKey = `v52-confirmation-verified:${challengeId}`;
  const inserted = await client.query(
    `INSERT INTO v52_confirmation_verification_events (
       challenge_id, confirmation_id, booking_id, verifier_user_id,
       verifier_role, presenter_evidence_set_sha256, verification_method,
       verified_at, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, 'server_challenge', $7, $8)
     ON CONFLICT (challenge_id) DO NOTHING
     RETURNING id`,
    [
      challengeId,
      confirmation.rows[0].id,
      bookingId,
      verifierUserId,
      verifierRole,
      setHash,
      verifiedAt,
      eventKey,
    ],
  );
  if (inserted.rowCount) return inserted.rows[0];
  const existing = await client.query(
    `SELECT verifier_user_id, presenter_evidence_set_sha256
       FROM v52_confirmation_verification_events
      WHERE challenge_id = $1`,
    [challengeId],
  );
  if (!existing.rowCount
      || existing.rows[0].verifier_user_id !== verifierUserId
      || existing.rows[0].presenter_evidence_set_sha256 !== setHash) {
    throw new V52HandoverReturnError(409, 'v52_confirmation_verification_replay_mismatch');
  }
  return existing.rows[0];
}

function returnT0(row) {
  if (row.return_t0) return instant(row.return_t0, 'v52_return_t0_invalid');
  const payload = row.booking_payload && typeof row.booking_payload === 'object'
    ? row.booking_payload
    : {};
  const requestedLabel = typeof payload.returnTimeRequested === 'string'
    ? payload.returnTimeRequested.trim()
    : '';
  const requestedBy = payload.returnTimeRequestedByUserId;
  const confirmedBy = payload.returnTimeConfirmedByUserId;
  const changedReturn = payload.returnTimeConfirmed === true
    && requestedLabel.length > 0
    && [row.owner_id, row.renter_id].includes(requestedBy)
    && [row.owner_id, row.renter_id].includes(confirmedBy)
    && requestedBy !== confirmedBy
    && Number.isFinite(Date.parse(payload.returnTimeConfirmedAt ?? ''))
    ? payload.returnTimeIso
    : null;
  return resolveReturnT0({
    scheduledReturnAt: row.ends_at,
    mutuallyConfirmedChangedReturnAt: changedReturn,
  });
}

function caseShape(row, evidenceUploadIds, { replayed }) {
  return Object.freeze({
    returnCase: Object.freeze({
      id: row.id,
      bookingCaseId: row.booking_case_id,
      reportId: row.report_id,
      bookingId: row.booking_id,
      status: 'needsReview',
      reasonCode: row.reason_code,
      reasonDetails: row.reason_details,
      t0: new Date(row.t0).toISOString(),
      t1: new Date(row.t1).toISOString(),
      reportDeadline: new Date(row.report_deadline).toISOString(),
      responseDueAt: new Date(row.response_due_at).toISOString(),
      nextStatusUpdateDueAt: new Date(row.next_status_update_due_at).toISOString(),
      deadlineTimezone: row.deadline_timezone,
      deadlinePolicyVersion: Number(row.deadline_policy_version),
      authorizedBookingMinor: Number(row.authorized_booking_minor),
      contestedAuthorizedMinor: Number(row.contested_authorized_minor),
      undisputedReleasableMinor: Number(row.undisputed_releasable_minor),
      additionalChargeMinor: 0,
      evidenceUploadIds: Object.freeze([...evidenceUploadIds]),
    }),
    participantUserIds: Object.freeze([row.owner_id, row.renter_id]),
    replayed,
  });
}

async function existingReturnCase(client, key, actorId, bookingId, commandSha256) {
  const result = await client.query(
    `SELECT return_case.*, booking.owner_id, booking.renter_id
       FROM v52_return_cases AS return_case
       JOIN bookings AS booking ON booking.id = return_case.booking_id
      WHERE return_case.idempotency_key = $1`,
    [key],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (row.booking_id !== bookingId
      || row.opened_by !== actorId
      || row.command_sha256 !== commandSha256) {
    throw new V52HandoverReturnError(409, 'idempotency_key_reused');
  }
  const evidence = await client.query(
    `SELECT upload_id::text FROM v52_return_case_evidence
      WHERE return_case_id = $1 ORDER BY upload_id`,
    [row.id],
  );
  return caseShape(row, evidence.rows.map((entry) => entry.upload_id), { replayed: true });
}

export async function openV52ReturnCase(client, {
  actor,
  bookingId,
  raw,
  idempotencyKey: rawIdempotencyKey,
  now = new Date(),
}) {
  const key = idempotencyKey(rawIdempotencyKey);
  const reasonCode = text(raw?.reasonCode, 120, 'v52_return_case_reason_code_invalid');
  if (!RETURN_REASON_CODES.has(reasonCode)) {
    throw new V52HandoverReturnError(400, 'v52_return_case_reason_code_invalid');
  }
  const reasonDetails = text(
    raw?.details,
    4000,
    'v52_return_case_details_required',
    { minimum: 10 },
  );
  const evidenceUploadIds = normalizedUploadIds(raw?.evidenceUploadIds);
  const contestedAuthorizedMinor = exactMinor(
    raw?.contestedAuthorizedMinor,
    'v52_return_case_contested_amount_invalid',
  );
  const commandSha256 = sha256(JSON.stringify({
    bookingId,
    reasonCode,
    reasonDetails,
    evidenceUploadIds,
    contestedAuthorizedMinor,
  }));
  const replay = await existingReturnCase(
    client,
    key,
    actor.id,
    bookingId,
    commandSha256,
  );
  if (replay) return replay;

  const binding = await bookingBinding(client, bookingId, { lock: true });
  if (!binding) throw new V52HandoverReturnError(409, 'v52_return_case_contract_required');
  const actorRole = actor.id === binding.owner_id
    ? 'owner'
    : (actor.id === binding.renter_id ? 'renter' : null);
  if (!actorRole) throw new V52HandoverReturnError(403, 'v52_return_case_forbidden');
  if (!['active', 'completed'].includes(binding.workflow_status)) {
    throw new V52HandoverReturnError(409, 'v52_return_case_wrong_booking_state');
  }

  const openedAt = instant(now, 'v52_return_case_time_invalid');
  const t0 = returnT0(binding);
  const deadlineTimezone = returnPolicyTimeZone(binding.rental_timezone);
  const reportDeadline = new Date(t0.getTime() + 48 * 60 * 60 * 1000);
  if (openedAt < t0) {
    throw new V52HandoverReturnError(409, 'v52_return_report_window_not_open');
  }
  if (openedAt > reportDeadline) {
    throw new V52HandoverReturnError(409, 'v52_return_report_window_closed');
  }
  const authorizedBookingMinor = Number(binding.quoted_total_minor);
  if (!Number.isSafeInteger(authorizedBookingMinor)
      || authorizedBookingMinor < 0
      || contestedAuthorizedMinor > authorizedBookingMinor) {
    throw new V52HandoverReturnError(409, 'v52_return_case_amount_exceeds_authorization');
  }

  const evidence = await client.query(
    `SELECT upload.id, upload.content_sha256
       FROM uploads AS upload
       LEFT JOIN report_evidence AS existing ON existing.upload_id = upload.id
      WHERE upload.owner_id = $1
        AND upload.visibility = 'private'
        AND upload.purpose = 'report_evidence'
        AND upload.content_scan_status = 'passed'
        AND upload.content_sha256 ~ '^[0-9a-f]{64}$'
        AND existing.upload_id IS NULL
        AND upload.id::text = ANY($2::text[])
      FOR UPDATE OF upload`,
    [actor.id, evidenceUploadIds],
  );
  if (evidence.rowCount !== evidenceUploadIds.length) {
    throw new V52HandoverReturnError(400, 'v52_return_case_evidence_not_owned');
  }
  const active = await client.query(
    `SELECT id FROM booking_cases
      WHERE booking_id = $1 AND status <> 'closed'
      FOR UPDATE`,
    [bookingId],
  );
  if (active.rowCount) {
    throw new V52HandoverReturnError(409, 'v52_active_return_case_exists');
  }
  const recorded = await client.query(
    `SELECT id FROM v52_return_cases
      WHERE booking_id = $1
      FOR UPDATE`,
    [bookingId],
  );
  if (recorded.rowCount) {
    throw new V52HandoverReturnError(409, 'v52_return_case_already_recorded');
  }
  const activeReport = await client.query(
    `SELECT id FROM reports
      WHERE reporter_id = $1 AND target_type = 'booking' AND target_id = $2
        AND status IN ('open', 'triaged', 'investigating', 'actioned')
      FOR UPDATE`,
    [actor.id, bookingId],
  );
  if (activeReport.rowCount) {
    throw new V52HandoverReturnError(409, 'v52_active_booking_report_exists');
  }

  const reportId = crypto.randomUUID();
  const bookingCaseId = crypto.randomUUID();
  const returnCaseId = crypto.randomUUID();
  const responseDueAt = addReturnPolicyCalendarDays(openedAt, 5, deadlineTimezone);
  const nextStatusUpdateDueAt = addReturnPolicyCalendarDays(openedAt, 7, deadlineTimezone);
  const undisputedReleasableMinor = authorizedBookingMinor - contestedAuthorizedMinor;

  await client.query(
    `INSERT INTO reports (
       id, reporter_id, target_type, target_id, reason_code, details,
       status, priority, reporter_reference, last_event_at
     ) VALUES ($1, $2, 'booking', $3, $4, $5, 'open', 'normal',
               'v52_return_case', $6)`,
    [reportId, actor.id, bookingId, reasonCode, reasonDetails, openedAt],
  );
  await client.query(
    `INSERT INTO report_evidence (report_id, upload_id)
     SELECT $1, unnest($2::uuid[])`,
    [reportId, evidenceUploadIds],
  );
  await client.query(
    `INSERT INTO moderation_case_events (
       report_id, actor_id, actor_role, event_type, to_status,
       metadata, idempotency_key, created_at
     ) VALUES ($1, $2, $3, 'report_created', 'open', $4::jsonb, $5, $6)`,
    [
      reportId,
      actor.id,
      actor.role,
      JSON.stringify({ evidenceCount: evidence.rowCount, source: 'v52_return_case' }),
      `v52-return-case-report:${returnCaseId}`,
      openedAt,
    ],
  );
  await client.query(
    `INSERT INTO booking_cases (
       id, booking_id, opened_by, opened_at, reason, substantiated,
       status, contested_authorized_minor, undisputed_releasable_minor,
       response_due_at, next_status_update_due_at, metadata
     ) VALUES ($1, $2, $3, $4, $5, true, 'needsReview', $6, $7, $8, $9, $10::jsonb)`,
    [
      bookingCaseId,
      bookingId,
      actor.id,
      openedAt,
      reasonDetails,
      contestedAuthorizedMinor,
      undisputedReleasableMinor,
      responseDueAt,
      nextStatusUpdateDueAt,
      JSON.stringify({ reportId, reasonCode, source: 'v52_return_case' }),
    ],
  );
  const inserted = await client.query(
    `INSERT INTO v52_return_cases (
       id, booking_case_id, report_id, booking_id, platform_contract_id,
       handover_return_damage_snapshot_id, quote_id, quote_hash,
       contract_version, locale, opened_by, opened_by_role, reason_code,
       reason_details, t0, t1, report_deadline, response_due_at,
       next_status_update_due_at, deadline_timezone, deadline_policy_version,
       authorized_booking_minor,
       contested_authorized_minor, undisputed_releasable_minor,
       additional_charge_minor, idempotency_key, command_sha256
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, 2, $21, $22, $23, 0, $24, $25
     ) RETURNING *`,
    [
      returnCaseId,
      bookingCaseId,
      reportId,
      bookingId,
      binding.platform_contract_id,
      binding.handover_return_damage_snapshot_id,
      binding.quote_id,
      binding.quote_hash,
      binding.contract_version,
      binding.contract_locale,
      actor.id,
      actorRole,
      reasonCode,
      reasonDetails,
      t0,
      openedAt,
      reportDeadline,
      responseDueAt,
      nextStatusUpdateDueAt,
      deadlineTimezone,
      authorizedBookingMinor,
      contestedAuthorizedMinor,
      undisputedReleasableMinor,
      key,
      commandSha256,
    ],
  );
  for (const upload of evidence.rows) {
    await client.query(
      `INSERT INTO v52_return_case_evidence (
         return_case_id, upload_id, upload_purpose, upload_sha256
       ) VALUES ($1, $2, 'report_evidence', $3)`,
      [returnCaseId, upload.id, upload.content_sha256],
    );
  }
  await client.query(
    `INSERT INTO v52_return_case_events (
       return_case_id, actor_id, actor_role, event_type, occurred_at,
       idempotency_key, metadata
     ) VALUES ($1, $2, $3, 'opened', $4, $5, $6::jsonb)`,
    [
      returnCaseId,
      actor.id,
      actorRole,
      openedAt,
      `v52-return-case-opened:${returnCaseId}`,
      JSON.stringify({
        reportId,
        bookingCaseId,
        evidenceCount: evidence.rowCount,
        additionalChargeMinor: 0,
      }),
    ],
  );

  const payload = binding.booking_payload && typeof binding.booking_payload === 'object'
    ? { ...binding.booking_payload }
    : {};
  payload.needsReview = true;
  payload.reviewReason = reasonDetails;
  payload.reviewSource = 'v52_return_case';
  payload.reviewRequestedAt = openedAt.toISOString();
  payload.reviewEvidenceReferences = evidenceUploadIds.map((id) => `upload:${id}`);
  payload.returnCaseOpenedAt = openedAt.toISOString();
  payload.returnState = 'needsReview';
  payload.returnT0 = t0.toISOString();
  payload.returnReportDeadline = reportDeadline.toISOString();
  payload.returnClarificationDeadline = new Date(
    addReturnPolicyCalendarDays(t0, 5, deadlineTimezone),
  ).toISOString();
  payload.payoutInstructionDueAt = reportDeadline.toISOString();
  payload.contestedAuthorizedMinor = contestedAuthorizedMinor;
  payload.undisputedReleasableMinor = undisputedReleasableMinor;
  payload.allegedDamageMinorRecordedOnly = 0;
  payload.additionalChargeMinor = 0;
  await client.query(
    `UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1`,
    [bookingId, JSON.stringify(payload)],
  );
  await client.query(
    `UPDATE bookings
        SET return_t0 = $2, return_state = 'needsReview',
            return_report_deadline = $3,
            return_clarification_deadline = $4,
            payout_instruction_due_at = $3,
            version = version + 1, updated_at = now()
      WHERE id = $1`,
    [
      bookingId,
      t0,
      reportDeadline,
      payload.returnClarificationDeadline,
    ],
  );
  await client.query(
    `INSERT INTO booking_events (
       booking_id, actor_id, event_type, idempotency_key, metadata
     ) VALUES ($1, $2, 'booking.v52_return_case_opened', $3, $4::jsonb)`,
    [
      bookingId,
      actor.id,
      `v52-return-case-booking:${returnCaseId}`,
      JSON.stringify({
        returnCaseId,
        bookingCaseId,
        reportId,
        t0: t0.toISOString(),
        t1: openedAt.toISOString(),
        contestedAuthorizedMinor,
        undisputedReleasableMinor,
        additionalChargeMinor: 0,
      }),
    ],
  );
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, 'booking.v52_return_case_opened', 'booking', $3, $4::jsonb)`,
    [
      actor.id,
      actor.role,
      bookingId,
      JSON.stringify({
        returnCaseId,
        reportId,
        evidenceCount: evidence.rowCount,
        additionalChargeMinor: 0,
      }),
    ],
  );

  return caseShape(
    { ...inserted.rows[0], owner_id: binding.owner_id, renter_id: binding.renter_id },
    evidenceUploadIds,
    { replayed: false },
  );
}
