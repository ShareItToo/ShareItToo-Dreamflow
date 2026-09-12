import crypto from 'node:crypto';

import { config } from './config.js';
import {
  assertReportTransition,
  ModerationDomainError,
  moderationIdempotencyKey,
  normalizeHarassmentBlockReportInput,
  normalizeReportInput,
  normalizeReviewInput,
  shapeReview,
  shapeStaffUser,
} from './moderation_domain.js';
import { blockUser } from './message_workflow.js';
import { verifyPassword } from './security.js';
import { persistModerationDecision } from './moderation_decision_workflow.js';
import { provisionalAccountMeasureNotice } from './moderation_account_measure_domain.js';

export class ModerationWorkflowError extends ModerationDomainError {}

function text(value, maximum = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function integer(value, fallback, { minimum = 0, maximum = 200 } = {}) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ModerationWorkflowError(400, code);
  }
  return { ...value };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function audit(client, {
  actor,
  action,
  resourceType,
  resourceId,
  requestId = null,
  metadata = {},
}) {
  if (requestId === null) {
    await client.query(
      `INSERT INTO audit_log (
         actor_id, actor_role, action, resource_type, resource_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        actor?.id ?? null,
        actor?.role ?? 'system',
        action,
        resourceType,
        resourceId,
        JSON.stringify(metadata),
      ],
    );
    return;
  }
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, request_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      actor?.id ?? null,
      actor?.role ?? 'system',
      action,
      resourceType,
      resourceId,
      requestId,
      JSON.stringify(metadata),
    ],
  );
}

function reportShape(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reasonCode: row.reason_code,
    details: row.details,
    priority: row.priority,
    reference: row.reporter_reference,
    status: row.status,
    resolution: row.resolution ?? {},
    reporterId: row.reporter_id,
    assignedTo: row.assigned_to,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
  };
}

function legalHoldShape(row) {
  return {
    id: row.id,
    userId: row.user_id,
    reasonCode: row.reason_code,
    placedBy: row.placed_by,
    createdAt: new Date(row.created_at).toISOString(),
    releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
    releasedBy: row.released_by ?? null,
    releaseReasonCode: row.release_reason_code ?? null,
  };
}

async function assertReportTarget(client, actorId, report) {
  if (report.targetType === 'user') {
    const result = await client.query('SELECT id FROM users WHERE id = $1 AND deactivated_at IS NULL', [report.targetId]);
    if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_target_not_found');
    if (report.targetId === actorId) throw new ModerationWorkflowError(400, 'cannot_report_self');
    return;
  }
  if (report.targetType === 'listing') {
    const result = await client.query('SELECT owner_id FROM listings WHERE id = $1', [report.targetId]);
    if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_target_not_found');
    if (result.rows[0].owner_id === actorId) throw new ModerationWorkflowError(400, 'cannot_report_own_listing');
    return;
  }
  if (report.targetType === 'booking') {
    const result = await client.query('SELECT owner_id, renter_id FROM bookings WHERE id = $1', [report.targetId]);
    if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_target_not_found');
    if (![result.rows[0].owner_id, result.rows[0].renter_id].includes(actorId)) {
      throw new ModerationWorkflowError(403, 'report_target_forbidden');
    }
    return;
  }
  if (report.targetType === 'message') {
    const result = await client.query(
      `SELECT message.sender_id, thread.user1_id, thread.user2_id
       FROM messages AS message
       JOIN message_threads AS thread ON thread.id = message.thread_id
       WHERE message.id = $1`,
      [report.targetId],
    );
    if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_target_not_found');
    if (![result.rows[0].user1_id, result.rows[0].user2_id].includes(actorId)) {
      throw new ModerationWorkflowError(403, 'report_target_forbidden');
    }
    if (result.rows[0].sender_id === actorId) throw new ModerationWorkflowError(400, 'cannot_report_own_message');
    return;
  }
  const result = await client.query(
    `SELECT id FROM reviews WHERE id::text = $1 AND moderation_status = 'published'`,
    [report.targetId],
  );
  if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_target_not_found');
}

async function bindEvidence(client, { actorId, reportId, uploadIds }) {
  if (!uploadIds.length) return [];
  const result = await client.query(
    `SELECT id, storage_name, thumbnail_storage_name, mime_type, byte_size
     FROM uploads
     WHERE owner_id = $1 AND purpose = 'report_evidence' AND visibility = 'private'
       AND id::text = ANY($2::text[])
     FOR UPDATE`,
    [actorId, uploadIds],
  );
  if (result.rowCount !== uploadIds.length) {
    throw new ModerationWorkflowError(400, 'report_evidence_not_owned');
  }
  await client.query(
    `INSERT INTO report_evidence (report_id, upload_id)
     SELECT $1, unnest($2::uuid[])`,
    [reportId, uploadIds],
  );
  return result.rows;
}

export async function createReport(client, {
  actor,
  raw,
  idempotencyKey,
  allowProtectedHarassment = false,
}) {
  const report = normalizeReportInput(raw);
  if (report.targetType === 'user'
      && report.reasonCode === 'harassment'
      && !allowProtectedHarassment) {
    throw new ModerationWorkflowError(409, 'harassment_requires_block_report_path');
  }
  await assertReportTarget(client, actor.id, report);
  const existing = await client.query(
    `SELECT * FROM reports
     WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3
       AND status IN ('open', 'triaged', 'investigating', 'actioned')
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [actor.id, report.targetType, report.targetId],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.reason_code !== report.reasonCode) {
      throw new ModerationWorkflowError(409, 'active_report_already_exists', { reportId: row.id });
    }
    return { report: reportShape(row), replayed: true };
  }
  const inserted = await client.query(
    `INSERT INTO reports (
       reporter_id, target_type, target_id, reason_code, details,
       priority, reporter_reference, last_event_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     RETURNING *`,
    [
      actor.id, report.targetType, report.targetId, report.reasonCode,
      report.details, report.priority, report.reporterReference,
    ],
  );
  const row = inserted.rows[0];
  const evidence = await bindEvidence(client, {
    actorId: actor.id,
    reportId: row.id,
    uploadIds: report.evidenceUploadIds,
  });
  const eventKey = idempotencyKey
    ? moderationIdempotencyKey(idempotencyKey, 'report.create')
    : `report.create:${row.id}`;
  await client.query(
    `INSERT INTO moderation_case_events (
       report_id, actor_id, actor_role, event_type, to_status, metadata, idempotency_key
     ) VALUES ($1, $2, $3, 'report_created', 'open', $4::jsonb, $5)`,
    [row.id, actor.id, actor.role, JSON.stringify({ evidenceCount: evidence.length }), eventKey],
  );
  await audit(client, {
    actor,
    action: 'report.created',
    resourceType: 'report',
    resourceId: row.id,
    metadata: { targetType: row.target_type, targetId: row.target_id, evidenceCount: evidence.length },
  });
  return { report: reportShape(row), replayed: false };
}

function harassmentRequestFingerprint(report) {
  return crypto.createHash('sha256').update(JSON.stringify({
    targetUserId: report.targetId,
    immediateDanger: false,
    details: report.details,
    reference: report.reporterReference,
    evidenceUploadIds: [...report.evidenceUploadIds].sort(),
  })).digest('hex');
}

function harassmentProtectionShape({ directContactBlocked }) {
  return Object.freeze({
    directContactBlocked,
    neutralReviewRequired: true,
    guiltDetermined: false,
    moderationAccountMeasureTaken: false,
    externalActionTaken: false,
  });
}

async function directContactBlockIsActive(client, blockerId, blockedId) {
  const activeBlock = await client.query(
    `SELECT 1 FROM user_blocks
      WHERE blocker_id = $1 AND blocked_id = $2 AND unblocked_at IS NULL`,
    [blockerId, blockedId],
  );
  return activeBlock.rowCount === 1;
}

export async function createHarassmentBlockReport(client, {
  actor,
  raw,
  idempotencyKey,
}) {
  const reportInput = normalizeHarassmentBlockReportInput(raw);
  const requestId = moderationIdempotencyKey(
    idempotencyKey,
    'report.harassment_block',
  );
  const requestFingerprint = harassmentRequestFingerprint(reportInput);

  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [actor.id]);
  const prior = await client.query(
    `SELECT report.*, receipt.metadata
       FROM audit_log AS receipt
       JOIN reports AS report ON report.id::text = receipt.resource_id
      WHERE receipt.actor_id = $1
        AND receipt.action = 'report.harassment_blocked_for_reporter'
        AND receipt.request_id = $2
      LIMIT 1`,
    [actor.id, requestId],
  );
  if (prior.rowCount) {
    if (prior.rows[0].metadata?.requestFingerprint !== requestFingerprint) {
      throw new ModerationWorkflowError(409, 'harassment_block_report_idempotency_conflict');
    }
    return {
      report: reportShape(prior.rows[0]),
      protection: harassmentProtectionShape({
        directContactBlocked: await directContactBlockIsActive(
          client,
          actor.id,
          prior.rows[0].target_id,
        ),
      }),
      replayed: true,
    };
  }

  const activeReport = await client.query(
    `SELECT report.*, receipt.metadata AS protection_metadata
       FROM reports AS report
       LEFT JOIN LATERAL (
         SELECT metadata
           FROM audit_log
          WHERE action = 'report.harassment_blocked_for_reporter'
            AND resource_type = 'report'
            AND resource_id = report.id::text
          ORDER BY id DESC
          LIMIT 1
       ) AS receipt ON true
      WHERE report.reporter_id = $1
        AND report.target_type = 'user'
        AND report.target_id = $2
        AND report.reason_code = 'harassment'
        AND report.status IN ('open', 'triaged', 'investigating', 'actioned')
      ORDER BY report.created_at DESC
      LIMIT 1
      FOR UPDATE OF report`,
    [actor.id, reportInput.targetId],
  );
  let created;
  if (activeReport.rowCount) {
    const active = activeReport.rows[0];
    if (active.protection_metadata) {
      if (active.protection_metadata.requestFingerprint !== requestFingerprint) {
        throw new ModerationWorkflowError(
          409,
          'active_harassment_block_report_already_exists',
          { reportId: active.id },
        );
      }
      return {
        report: reportShape(active),
        protection: harassmentProtectionShape({
          directContactBlocked: await directContactBlockIsActive(
            client,
            actor.id,
            active.target_id,
          ),
        }),
        replayed: true,
      };
    }
    const existingEvidence = await client.query(
      `SELECT upload_id::text AS upload_id
         FROM report_evidence
        WHERE report_id = $1
        ORDER BY upload_id::text`,
      [active.id],
    );
    const sameExistingPayload = active.priority === reportInput.priority
      && active.details === reportInput.details
      && active.reporter_reference === reportInput.reporterReference
      && JSON.stringify(existingEvidence.rows.map((row) => row.upload_id))
        === JSON.stringify([...reportInput.evidenceUploadIds].sort());
    if (!sameExistingPayload) {
      throw new ModerationWorkflowError(
        409,
        'active_harassment_report_requires_review',
        { reportId: active.id },
      );
    }
    created = { report: reportShape(active), replayed: true };
  } else {
    created = await createReport(client, {
      actor,
      raw: {
        targetType: reportInput.targetType,
        targetId: reportInput.targetId,
        reasonCode: reportInput.reasonCode,
        priority: reportInput.priority,
        details: reportInput.details,
        reference: reportInput.reporterReference,
        evidenceUploadIds: reportInput.evidenceUploadIds,
      },
      idempotencyKey,
      allowProtectedHarassment: true,
    });
  }
  await blockUser(client, {
    actor,
    blockedId: reportInput.targetId,
    reasonCode: 'harassment_reporter_protection',
  });
  await audit(client, {
    actor,
    action: 'report.harassment_blocked_for_reporter',
    resourceType: 'report',
    resourceId: created.report.id,
    requestId,
    metadata: {
      reasonCode: 'harassment',
      immediateDanger: false,
      directContactBlocked: true,
      neutralReviewRequired: true,
      guiltDetermined: false,
      moderationAccountMeasureTaken: false,
      externalActionTaken: false,
      requestFingerprint,
    },
  });
  return {
    report: created.report,
    protection: harassmentProtectionShape({ directContactBlocked: true }),
    replayed: false,
  };
}

export async function listMyReports(client, actorId) {
  const result = await client.query(
    `SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [actorId],
  );
  return result.rows.map(reportShape);
}

export async function createStaffElevation(client, { actor, sessionId, currentPassword }) {
  if (!['support', 'admin'].includes(actor.role)) {
    throw new ModerationWorkflowError(403, 'staff_role_required');
  }
  const result = await client.query(
    `SELECT password_hash, email_verified_at FROM users WHERE id = $1 FOR UPDATE`,
    [actor.id],
  );
  const row = result.rows[0];
  if (!row?.email_verified_at) throw new ModerationWorkflowError(403, 'verified_email_required');
  if (!row.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new ModerationWorkflowError(401, 'invalid_credentials');
  }
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.staffElevationMinutes * 60_000);
  await client.query(
    `UPDATE staff_elevations SET revoked_at = COALESCE(revoked_at, now())
     WHERE user_id = $1 AND session_id = $2 AND revoked_at IS NULL`,
    [actor.id, sessionId],
  );
  await client.query(
    `INSERT INTO staff_elevations (user_id, session_id, token_hash, role, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor.id, sessionId, hashToken(token), actor.role, expiresAt],
  );
  await audit(client, {
    actor,
    action: 'staff.elevation_created',
    resourceType: 'auth_session',
    resourceId: sessionId,
    metadata: { expiresAt: expiresAt.toISOString() },
  });
  return { token, expiresAt: expiresAt.toISOString(), role: actor.role };
}

export async function verifyStaffElevation(client, { actor, sessionId, token }) {
  if (!['support', 'admin'].includes(actor?.role)) {
    throw new ModerationWorkflowError(403, 'staff_role_required');
  }
  if (!token || typeof token !== 'string' || token.length > 500) {
    throw new ModerationWorkflowError(401, 'staff_step_up_required');
  }
  const result = await client.query(
    `UPDATE staff_elevations
     SET last_used_at = now()
     WHERE token_hash = $1 AND user_id = $2 AND session_id = $3
       AND role = $4 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id, expires_at`,
    [hashToken(token), actor.id, sessionId, actor.role],
  );
  if (!result.rowCount) throw new ModerationWorkflowError(401, 'invalid_or_expired_staff_step_up');
  return { id: result.rows[0].id, expiresAt: new Date(result.rows[0].expires_at).toISOString() };
}

export async function staffOverview(client) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM reports WHERE status IN ('open', 'triaged', 'investigating', 'actioned')) AS active_reports,
       (SELECT count(*)::int FROM reports WHERE priority IN ('high', 'urgent') AND status IN ('open', 'triaged', 'investigating')) AS priority_reports,
       (SELECT count(*)::int FROM user_suspensions WHERE lifted_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())) AS active_suspensions,
       (SELECT count(*)::int FROM listings WHERE moderation_status <> 'active') AS moderated_listings,
       (SELECT count(*)::int FROM disputes WHERE status IN ('open', 'investigating', 'waiting_for_user')) AS open_disputes`,
  );
  const row = result.rows[0];
  return {
    activeReports: row.active_reports,
    priorityReports: row.priority_reports,
    activeSuspensions: row.active_suspensions,
    moderatedListings: row.moderated_listings,
    openDisputes: row.open_disputes,
  };
}

export async function listStaffReports(client, { status, priority, limit, offset }) {
  const safeLimit = integer(limit, 50, { minimum: 1, maximum: 200 });
  const safeOffset = integer(offset, 0, { minimum: 0, maximum: 100_000 });
  const result = await client.query(
    `SELECT report.*, reporter.profile->>'displayName' AS reporter_name,
            assignee.profile->>'displayName' AS assignee_name,
            (SELECT count(*)::int FROM report_evidence WHERE report_id = report.id) AS evidence_count
     FROM reports AS report
     JOIN users AS reporter ON reporter.id = report.reporter_id
     LEFT JOIN users AS assignee ON assignee.id = report.assigned_to
     WHERE ($1::text IS NULL OR report.status = $1)
       AND ($2::text IS NULL OR report.priority = $2)
     ORDER BY CASE report.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
              report.created_at ASC
     LIMIT $3 OFFSET $4`,
    [text(status, 30) || null, text(priority, 20) || null, safeLimit, safeOffset],
  );
  return result.rows.map((row) => ({
    ...reportShape(row),
    reporterName: row.reporter_name || 'Mitglied',
    assigneeName: row.assignee_name || null,
    evidenceCount: row.evidence_count,
  }));
}

export async function getStaffReport(client, reportId) {
  const result = await client.query(
    `SELECT report.*, reporter.profile->>'displayName' AS reporter_name,
            assignee.profile->>'displayName' AS assignee_name
     FROM reports AS report
     JOIN users AS reporter ON reporter.id = report.reporter_id
     LEFT JOIN users AS assignee ON assignee.id = report.assigned_to
     WHERE report.id::text = $1`,
    [reportId],
  );
  if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_not_found');
  const events = await client.query(
    `SELECT id, actor_id, actor_role, event_type, from_status, to_status, note, metadata, created_at
     FROM moderation_case_events WHERE report_id = $1 ORDER BY created_at, id`,
    [result.rows[0].id],
  );
  const evidence = await client.query(
    `SELECT upload.id, upload.mime_type, upload.byte_size, upload.created_at
     FROM report_evidence AS evidence
     JOIN uploads AS upload ON upload.id = evidence.upload_id
     WHERE evidence.report_id = $1 ORDER BY evidence.created_at`,
    [result.rows[0].id],
  );
  return {
    ...reportShape(result.rows[0]),
    reporterName: result.rows[0].reporter_name || 'Mitglied',
    assigneeName: result.rows[0].assignee_name || null,
    evidence: evidence.rows.map((row) => ({
      id: row.id,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    events: events.rows.map((row) => ({
      id: Number(row.id),
      actorId: row.actor_id,
      actorRole: row.actor_role,
      type: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      note: row.note,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
}

export async function updateStaffReport(client, { actor, reportId, raw, idempotencyKey }) {
  const candidate = object(raw, 'invalid_report_update');
  const key = moderationIdempotencyKey(idempotencyKey, 'report.update');
  const replay = await client.query(
    `SELECT report_id FROM moderation_case_events WHERE idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) return { report: await getStaffReport(client, replay.rows[0].report_id), replayed: true };
  const locked = await client.query('SELECT * FROM reports WHERE id::text = $1 FOR UPDATE', [reportId]);
  if (!locked.rowCount) throw new ModerationWorkflowError(404, 'report_not_found');
  const row = locked.rows[0];
  const nextStatus = text(candidate.status, 30) || row.status;
  const nextAssignee = candidate.assignedTo === undefined
    ? row.assigned_to
    : (text(candidate.assignedTo, 120) || null);
  const note = text(candidate.note, 8000) || null;
  const resolution = candidate.resolution === undefined ? row.resolution : object(candidate.resolution, 'invalid_report_resolution');
  let bookingCaseResolution = null;
  if (nextStatus === 'closed' && row.target_type === 'booking') {
    const booking = await client.query(
      `SELECT booking.quoted_total_minor, request.payload
       FROM bookings AS booking
       JOIN rental_requests AS request ON request.id = booking.id
       WHERE booking.id = $1 FOR UPDATE OF booking, request`,
      [row.target_id],
    );
    if (!booking.rowCount) throw new ModerationWorkflowError(404, 'booking_not_found');
    const authorizedRefundMinor = Number(resolution?.authorizedRefundMinor);
    const totalMinor = Number(booking.rows[0].quoted_total_minor);
    if (!Number.isSafeInteger(authorizedRefundMinor)
        || authorizedRefundMinor < 0
        || authorizedRefundMinor > totalMinor) {
      throw new ModerationWorkflowError(400, 'booking_case_refund_amount_required', {
        min: 0,
        max: totalMinor,
      });
    }
    bookingCaseResolution = {
      authorizedRefundMinor,
      authorizedOwnerRetainedMinor: totalMinor - authorizedRefundMinor,
      resolvedAt: new Date().toISOString(),
      resolvedBy: actor.id,
    };
  }
  if (nextStatus !== row.status) {
    assertReportTransition({ role: actor.role, fromStatus: row.status, toStatus: nextStatus, resolution });
  }
  if (nextAssignee !== row.assigned_to) {
    const assignee = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role IN ('support', 'admin') AND account_status = 'active'`,
      [nextAssignee],
    );
    if (nextAssignee && !assignee.rowCount) throw new ModerationWorkflowError(400, 'invalid_report_assignee');
  }
  let eventType = 'staff_note';
  if (nextStatus !== row.status) eventType = 'status_changed';
  else if (nextAssignee !== row.assigned_to) eventType = 'assigned';
  else if (!note) throw new ModerationWorkflowError(400, 'empty_report_update');
  await client.query(
    `UPDATE reports
     SET status = $2, assigned_to = $3, resolution = $4::jsonb,
         last_event_at = now(),
         closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, now()) ELSE NULL END
     WHERE id = $1`,
    [row.id, nextStatus, nextAssignee, JSON.stringify(resolution)],
  );
  if (bookingCaseResolution) {
    const request = await client.query(
      'SELECT payload FROM rental_requests WHERE id = $1 FOR UPDATE',
      [row.target_id],
    );
    const payload = object(request.rows[0]?.payload, 'invalid_stored_booking');
    payload.needsReview = false;
    payload.returnState = 'closed';
    payload.returnCaseClosedAt = bookingCaseResolution.resolvedAt;
    payload.contestedAuthorizedMinor = 0;
    payload.returnCaseResolution = bookingCaseResolution;
    payload.payoutInstructionDueAt = bookingCaseResolution.resolvedAt;
    await client.query(
      'UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1',
      [row.target_id, JSON.stringify(payload)],
    );
    await client.query(
      `UPDATE bookings
       SET return_state = 'closed', payout_instruction_due_at = $2,
           version = version + 1
       WHERE id = $1`,
      [row.target_id, bookingCaseResolution.resolvedAt],
    );
    await client.query(
      `UPDATE booking_cases
       SET status = 'closed', closed_at = COALESCE(closed_at, $2),
           metadata = metadata || $3::jsonb
       WHERE booking_id = $1 AND status <> 'closed'`,
      [
        row.target_id,
        bookingCaseResolution.resolvedAt,
        JSON.stringify({ resolution: bookingCaseResolution }),
      ],
    );
  }
  await client.query(
    `INSERT INTO moderation_case_events (
       report_id, actor_id, actor_role, event_type, from_status, to_status, note, metadata, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      row.id, actor.id, actor.role, eventType, row.status, nextStatus, note,
      JSON.stringify({ assignedFrom: row.assigned_to, assignedTo: nextAssignee }), key,
    ],
  );
  await client.query(
    `INSERT INTO moderation_actions (
       report_id, actor_id, actor_role, action_type, target_type, target_id,
       reason_code, before_state, after_state, idempotency_key
     ) VALUES ($1::uuid, $2, $3, 'report_transitioned', 'report', $1::uuid::text, $4, $5::jsonb, $6::jsonb, $7)`,
    [
      row.id, actor.id, actor.role, text(candidate.reasonCode, 120) || 'case_management',
      JSON.stringify({ status: row.status, assignedTo: row.assigned_to }),
      JSON.stringify({ status: nextStatus, assignedTo: nextAssignee }), `${key}:action`,
    ],
  );
  let issuedDecision = null;
  if (nextStatus !== row.status && ['actioned', 'dismissed', 'closed'].includes(nextStatus)) {
    issuedDecision = await persistModerationDecision(client, {
      actor,
      recipientUserId: row.reporter_id,
      reportId: row.id,
      targetType: 'report',
      targetId: row.id,
      measureType: 'report_resolution',
      measureState: nextStatus,
      raw: candidate.decision,
      idempotencyKey: `${key}:decision`,
    });
  }
  await audit(client, {
    actor,
    action: 'moderation.report_updated',
    resourceType: 'report',
    resourceId: row.id,
    metadata: { fromStatus: row.status, toStatus: nextStatus, eventType },
  });
  return {
    report: await getStaffReport(client, row.id),
    decision: issuedDecision?.decision ?? null,
    replayed: false,
  };
}

export async function setUserSuspension(client, { actor, userId, raw, idempotencyKey }) {
  if (actor.role !== 'admin') throw new ModerationWorkflowError(403, 'admin_role_required');
  if (actor.id === userId) throw new ModerationWorkflowError(400, 'cannot_suspend_self');
  const candidate = object(raw, 'invalid_suspension');
  const scope = text(candidate.scope, 30) || 'account';
  if (!['account', 'listing', 'booking', 'messaging', 'payout'].includes(scope)) {
    throw new ModerationWorkflowError(400, 'invalid_suspension_scope');
  }
  const reasonCode = text(candidate.reasonCode, 120);
  if (!reasonCode) throw new ModerationWorkflowError(400, 'suspension_reason_required');
  const key = moderationIdempotencyKey(idempotencyKey, 'user.suspend');
  const existing = await client.query('SELECT * FROM user_suspensions WHERE idempotency_key = $1', [key]);
  if (existing.rowCount) return { suspension: existing.rows[0], replayed: true };
  const target = await client.query(
    `SELECT id, role, account_status, deactivated_at
       FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  if (!target.rowCount) throw new ModerationWorkflowError(404, 'user_not_found');
  if (target.rows[0].role !== 'user') throw new ModerationWorkflowError(409, 'staff_suspension_requires_emergency_process');
  if (target.rows[0].deactivated_at || target.rows[0].account_status !== 'active') {
    throw new ModerationWorkflowError(409, 'suspension_target_not_active');
  }
  const reportId = text(candidate.reportId, 80) || null;
  if (reportId) {
    const report = await client.query('SELECT id FROM reports WHERE id::text = $1', [reportId]);
    if (!report.rowCount) throw new ModerationWorkflowError(404, 'report_not_found');
  }
  const endsAt = candidate.endsAt ? new Date(candidate.endsAt) : null;
  if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= new Date())) {
    throw new ModerationWorkflowError(400, 'invalid_suspension_end');
  }
  if (scope === 'account' && candidate.provisional !== true) {
    throw new ModerationWorkflowError(409, 'account_suspension_approval_required');
  }
  if (scope === 'account' && !endsAt) {
    throw new ModerationWorkflowError(400, 'provisional_account_suspension_end_required');
  }
  if (scope === 'account') {
    const active = await client.query(
      `SELECT id FROM user_suspensions
        WHERE user_id = $1 AND scope = 'account' AND lifted_at IS NULL
          AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
        LIMIT 1`,
      [userId],
    );
    if (active.rowCount) {
      throw new ModerationWorkflowError(409, 'account_suspension_already_active');
    }
  }
  const decision = await persistModerationDecision(client, {
    actor,
    recipientUserId: userId,
    reportId,
    targetType: 'user',
    targetId: userId,
    measureType: scope === 'account' ? 'account_suspension' : 'scope_suspension',
    measureState: scope,
    raw: candidate.decision,
    idempotencyKey: `${key}:decision`,
    expectedStatement: {
      durationType: endsAt ? 'fixed' : 'until_reversed',
      endsAt,
    },
    measureContext: scope === 'account'
      ? {
          status: 'provisional',
          noGuiltDetermination: true,
          userFacingNotice: provisionalAccountMeasureNotice,
          accountSuspensionProposalId: null,
        }
      : null,
  });
  const inserted = await client.query(
    `INSERT INTO user_suspensions (
       user_id, imposed_by, scope, reason_code, note, ends_at, report_id,
       idempotency_key, measure_status, no_guilt_determination,
       user_facing_notice, moderation_decision_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      userId,
      actor.id,
      scope,
      reasonCode,
      text(candidate.note, 8000) || null,
      endsAt,
      reportId,
      key,
      scope === 'account' ? 'provisional' : 'scope',
      scope === 'account',
      scope === 'account' ? provisionalAccountMeasureNotice : null,
      decision.decision.id,
    ],
  );
  if (scope === 'account') {
    await client.query('UPDATE users SET account_status = \'suspended\' WHERE id = $1', [userId]);
    await client.query(
      `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = 'account_suspended'
       WHERE user_id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = 'account_suspended'
       WHERE user_id = $1`,
      [userId],
    );
  }
  await client.query(
    `INSERT INTO moderation_actions (
       report_id, actor_id, actor_role, action_type, target_type, target_id,
       reason_code, before_state, after_state, idempotency_key
     ) VALUES ($1::uuid, $2, $3, 'user_suspended', 'user', $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      reportId, actor.id, actor.role, userId, reasonCode,
      JSON.stringify({ accountStatus: target.rows[0].account_status }),
      JSON.stringify({
        scope,
        endsAt: endsAt?.toISOString() ?? null,
        measureStatus: scope === 'account' ? 'provisional' : 'scope',
        noGuiltDetermination: scope === 'account',
      }),
      `${key}:action`,
    ],
  );
  if (reportId) {
    await client.query(
      `INSERT INTO moderation_case_events (
         report_id, actor_id, actor_role, event_type, note, metadata, idempotency_key
       ) VALUES ($1::uuid, $2, $3, 'moderation_action', $4, $5::jsonb, $6)`,
      [reportId, actor.id, actor.role, text(candidate.note, 8000) || null, JSON.stringify({ scope, userId }), `${key}:event`],
    );
  }
  await audit(client, {
    actor,
    action: 'moderation.user_suspended',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      scope,
      reportId,
      endsAt: endsAt?.toISOString() ?? null,
      measureStatus: scope === 'account' ? 'provisional' : 'scope',
      noGuiltDetermination: scope === 'account',
    },
  });
  return { suspension: inserted.rows[0], decision: decision.decision, replayed: false };
}

export async function liftUserSuspension(client, {
  actor,
  suspensionId,
  raw,
  idempotencyKey,
  issuedAt = new Date(),
}) {
  if (actor.role !== 'admin') throw new ModerationWorkflowError(403, 'admin_role_required');
  const candidate = object(raw ?? {}, 'invalid_suspension_lift');
  const key = moderationIdempotencyKey(idempotencyKey, 'user.suspension.lift');
  const replay = await client.query('SELECT id FROM moderation_actions WHERE idempotency_key = $1', [`${key}:action`]);
  const locked = await client.query('SELECT * FROM user_suspensions WHERE id::text = $1 FOR UPDATE', [suspensionId]);
  if (!locked.rowCount) throw new ModerationWorkflowError(404, 'suspension_not_found');
  const row = locked.rows[0];
  if (replay.rowCount || row.lifted_at) return { suspension: row, replayed: true };
  await client.query(
    `UPDATE user_suspensions SET lifted_at = now(), lifted_by = $2 WHERE id = $1`,
    [row.id, actor.id],
  );
  if (row.scope === 'account') {
    const active = await client.query(
      `SELECT 1 FROM user_suspensions
       WHERE user_id = $1 AND scope = 'account' AND id <> $2
         AND lifted_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) LIMIT 1`,
      [row.user_id, row.id],
    );
    if (!active.rowCount) {
      await client.query(
        `UPDATE users SET account_status = 'active'
         WHERE id = $1 AND account_status = 'suspended' AND deactivated_at IS NULL`,
        [row.user_id],
      );
    }
  }
  await client.query(
    `INSERT INTO moderation_actions (
       report_id, actor_id, actor_role, action_type, target_type, target_id,
       reason_code, before_state, after_state, idempotency_key
     ) VALUES ($1, $2, $3, 'user_suspension_lifted', 'user', $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      row.report_id, actor.id, actor.role, row.user_id,
      text(candidate.reasonCode, 120) || 'restriction_lifted',
      JSON.stringify({ suspensionId: row.id, lifted: false }),
      JSON.stringify({ suspensionId: row.id, lifted: true }), `${key}:action`,
    ],
  );
  if (row.report_id) {
    await client.query(
      `INSERT INTO moderation_case_events (
         report_id, actor_id, actor_role, event_type, note, metadata, idempotency_key
       ) VALUES ($1, $2, $3, 'moderation_reversed', $4, $5::jsonb, $6)`,
      [row.report_id, actor.id, actor.role, text(candidate.note, 8000) || null, JSON.stringify({ suspensionId: row.id }), `${key}:event`],
    );
  }
  const decision = await persistModerationDecision(client, {
    actor,
    recipientUserId: row.user_id,
    reportId: row.report_id,
    targetType: 'user',
    targetId: row.user_id,
    measureType: 'measure_reversal',
    measureState: `suspension_lifted:${row.scope}`,
    raw: candidate.decision,
    idempotencyKey: `${key}:decision`,
    issuedAt,
    expectedStatement: { durationType: 'not_applicable', endsAt: null },
  });
  await audit(client, {
    actor,
    action: 'moderation.user_suspension_lifted',
    resourceType: 'user',
    resourceId: row.user_id,
    metadata: { suspensionId: row.id, scope: row.scope },
  });
  return {
    suspension: { ...row, lifted_at: new Date(), lifted_by: actor.id },
    decision: decision.decision,
    replayed: false,
  };
}

export async function createAccountLegalHold(client, { actor, userId, raw, idempotencyKey }) {
  if (actor.role !== 'admin') throw new ModerationWorkflowError(403, 'admin_role_required');
  const candidate = object(raw, 'invalid_legal_hold');
  const reasonCode = text(candidate.reasonCode, 120).toLowerCase();
  if (!reasonCode || !/^[a-z0-9_.:-]+$/.test(reasonCode)) {
    throw new ModerationWorkflowError(400, 'legal_hold_reason_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'account.legal_hold');
  const replay = await client.query(
    'SELECT * FROM account_legal_holds WHERE idempotency_key = $1',
    [key],
  );
  if (replay.rowCount) return { legalHold: legalHoldShape(replay.rows[0]), replayed: true };

  const target = await client.query(
    'SELECT id, role, deactivated_at FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  if (!target.rowCount || target.rows[0].deactivated_at) {
    throw new ModerationWorkflowError(404, 'user_not_found');
  }
  if (target.rows[0].role !== 'user') {
    throw new ModerationWorkflowError(409, 'staff_legal_hold_requires_emergency_process');
  }
  const active = await client.query(
    'SELECT id FROM account_legal_holds WHERE user_id = $1 AND released_at IS NULL FOR UPDATE',
    [userId],
  );
  if (active.rowCount) throw new ModerationWorkflowError(409, 'active_legal_hold_exists');

  const inserted = await client.query(
    `INSERT INTO account_legal_holds (
       user_id, reason_code, note, placed_by, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, reasonCode, text(candidate.note, 8000) || null, actor.id, key],
  );
  await audit(client, {
    actor,
    action: 'privacy.account_legal_hold_created',
    resourceType: 'user',
    resourceId: userId,
    metadata: { legalHoldId: inserted.rows[0].id, reasonCode },
  });
  return { legalHold: legalHoldShape(inserted.rows[0]), replayed: false };
}

export async function releaseAccountLegalHold(client, { actor, legalHoldId, raw, idempotencyKey }) {
  if (actor.role !== 'admin') throw new ModerationWorkflowError(403, 'admin_role_required');
  const candidate = object(raw, 'invalid_legal_hold_release');
  const reasonCode = text(candidate.reasonCode, 120).toLowerCase();
  if (!reasonCode || !/^[a-z0-9_.:-]+$/.test(reasonCode)) {
    throw new ModerationWorkflowError(400, 'legal_hold_release_reason_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'account.legal_hold.release');
  const locked = await client.query(
    'SELECT * FROM account_legal_holds WHERE id::text = $1 FOR UPDATE',
    [legalHoldId],
  );
  if (!locked.rowCount) throw new ModerationWorkflowError(404, 'legal_hold_not_found');
  const row = locked.rows[0];
  if (row.released_at) {
    if (row.release_idempotency_key === key) {
      return { legalHold: legalHoldShape(row), replayed: true };
    }
    throw new ModerationWorkflowError(409, 'legal_hold_already_released');
  }

  const updated = await client.query(
    `UPDATE account_legal_holds
     SET released_at = now(), released_by = $2, release_reason_code = $3,
         release_idempotency_key = $4
     WHERE id = $1
     RETURNING *`,
    [row.id, actor.id, reasonCode, key],
  );
  await audit(client, {
    actor,
    action: 'privacy.account_legal_hold_released',
    resourceType: 'user',
    resourceId: row.user_id,
    metadata: { legalHoldId: row.id, reasonCode },
  });
  return { legalHold: legalHoldShape(updated.rows[0]), replayed: false };
}

export async function listAccountLegalHolds(client, { actor, userId = null, active = null, limit, offset }) {
  if (actor.role !== 'admin') throw new ModerationWorkflowError(403, 'admin_role_required');
  const normalizedUserId = text(userId, 120) || null;
  const activeOnly = active === true || active === 'true';
  const releasedOnly = active === false || active === 'false';
  const result = await client.query(
    `SELECT * FROM account_legal_holds
     WHERE ($1::text IS NULL OR user_id = $1)
       AND (NOT $2::boolean OR released_at IS NULL)
       AND (NOT $3::boolean OR released_at IS NOT NULL)
     ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
    [
      normalizedUserId,
      activeOnly,
      releasedOnly,
      integer(limit, 50, { minimum: 1, maximum: 200 }),
      integer(offset, 0, { minimum: 0, maximum: 100_000 }),
    ],
  );
  return result.rows.map(legalHoldShape);
}

export async function setListingModeration(client, {
  actor,
  listingId,
  raw,
  idempotencyKey,
  issuedAt = new Date(),
}) {
  if (actor.role !== 'admin') throw new ModerationWorkflowError(403, 'admin_role_required');
  const candidate = object(raw, 'invalid_listing_moderation');
  const status = text(candidate.status, 30);
  if (!['active', 'hidden', 'removed'].includes(status)) {
    throw new ModerationWorkflowError(400, 'invalid_listing_moderation_status');
  }
  const reasonCode = text(candidate.reasonCode, 120);
  if (!reasonCode) throw new ModerationWorkflowError(400, 'moderation_reason_required');
  const key = moderationIdempotencyKey(idempotencyKey, 'listing.moderation');
  const replay = await client.query('SELECT id FROM moderation_actions WHERE idempotency_key = $1', [`${key}:action`]);
  const locked = await client.query('SELECT * FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
  if (!locked.rowCount) throw new ModerationWorkflowError(404, 'listing_not_found');
  if (replay.rowCount) return { listingId, status: locked.rows[0].moderation_status, replayed: true };
  const before = locked.rows[0].moderation_status;
  const reportId = text(candidate.reportId, 80) || null;
  if (reportId) {
    const report = await client.query('SELECT id FROM reports WHERE id::text = $1', [reportId]);
    if (!report.rowCount) throw new ModerationWorkflowError(404, 'report_not_found');
  }
  const decision = await persistModerationDecision(client, {
    actor,
    recipientUserId: locked.rows[0].owner_id,
    reportId,
    targetType: 'listing',
    targetId: listingId,
    measureType: status === 'active' ? 'measure_reversal' : 'listing_restriction',
    measureState: status,
    raw: candidate.decision,
    idempotencyKey: `${key}:decision`,
    issuedAt,
    expectedStatement: {
      durationType: status === 'active' ? 'not_applicable' : 'until_reversed',
      endsAt: null,
    },
  });
  const firstRestriction = before === 'active' && status !== 'active';
  const restoredStatus = before === 'active'
    ? locked.rows[0].status
    : (locked.rows[0].moderation_previous_status || 'paused');
  const restoredActive = before === 'active'
    ? locked.rows[0].is_active === true
    : (locked.rows[0].moderation_previous_is_active === true && restoredStatus === 'active');
  const operationalStatus = status === 'active'
    ? restoredStatus
    : (status === 'removed' ? 'ended' : 'paused');
  const operationalActive = status === 'active' ? restoredActive : false;
  await client.query(
    `UPDATE listings
     SET moderation_status = $2, moderation_reason_code = $3,
         moderation_previous_status = CASE
           WHEN $5 THEN status WHEN $2 = 'active' THEN NULL ELSE moderation_previous_status END,
         moderation_previous_is_active = CASE
           WHEN $5 THEN is_active WHEN $2 = 'active' THEN NULL ELSE moderation_previous_is_active END,
         status = $6, is_active = $7,
         payload = jsonb_set(
           jsonb_set(payload, '{status}', to_jsonb($6::text), true),
           '{isActive}', to_jsonb($7::boolean), true
         ),
         catalog_revision = catalog_revision + 1,
         moderated_at = now(), moderated_by = $4
     WHERE id = $1`,
    [listingId, status, reasonCode, actor.id, firstRestriction, operationalStatus, operationalActive],
  );
  await client.query(
    `INSERT INTO moderation_actions (
       report_id, actor_id, actor_role, action_type, target_type, target_id,
       reason_code, before_state, after_state, idempotency_key
     ) VALUES ($1::uuid, $2, $3, 'listing_status_changed', 'listing', $4,
               $5, $6::jsonb, $7::jsonb, $8)`,
    [
      reportId, actor.id, actor.role, listingId, reasonCode,
      JSON.stringify({
        moderationStatus: before,
        listingStatus: locked.rows[0].status,
        isActive: locked.rows[0].is_active,
      }),
      JSON.stringify({
        moderationStatus: status,
        listingStatus: operationalStatus,
        isActive: operationalActive,
      }),
      `${key}:action`,
    ],
  );
  if (reportId) {
    await client.query(
      `INSERT INTO moderation_case_events (
         report_id, actor_id, actor_role, event_type, note, metadata, idempotency_key
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7)`,
      [reportId, actor.id, actor.role, status === 'active' ? 'moderation_reversed' : 'moderation_action', text(candidate.note, 8000) || null, JSON.stringify({ listingId, from: before, to: status }), `${key}:event`],
    );
  }
  await audit(client, {
    actor,
    action: 'moderation.listing_status_changed',
    resourceType: 'listing', resourceId: listingId,
    metadata: { from: before, to: status, reportId },
  });
  return { listingId, status, decision: decision.decision, replayed: false };
}

export async function createBookingReview(client, { actor, bookingId, raw }) {
  const candidate = normalizeReviewInput(raw);
  const booking = await client.query(
    `SELECT booking.*, listing.id AS resolved_listing_id
     FROM bookings AS booking JOIN listings AS listing ON listing.id = booking.listing_id
     WHERE booking.id = $1 FOR UPDATE OF booking`,
    [bookingId],
  );
  if (!booking.rowCount) throw new ModerationWorkflowError(404, 'booking_not_found');
  const row = booking.rows[0];
  if (![row.owner_id, row.renter_id].includes(actor.id)) throw new ModerationWorkflowError(403, 'booking_forbidden');
  if (row.workflow_status !== 'completed' || row.status !== 'completed') {
    throw new ModerationWorkflowError(409, 'review_requires_completed_booking');
  }
  const direction = actor.id === row.renter_id ? 'renter_to_owner' : 'owner_to_renter';
  const revieweeId = actor.id === row.renter_id ? row.owner_id : row.renter_id;
  if (candidate.direction !== direction) throw new ModerationWorkflowError(400, 'invalid_review_direction');
  const blocked = await client.query(
    `SELECT 1 FROM reports
     WHERE target_type = 'booking' AND target_id = $1
       AND status IN ('open', 'triaged', 'investigating', 'actioned')
     UNION ALL
     SELECT 1 FROM disputes WHERE booking_id = $1
       AND status IN ('open', 'investigating', 'waiting_for_user')
     LIMIT 1`,
    [bookingId],
  );
  if (blocked.rowCount) throw new ModerationWorkflowError(409, 'review_blocked_by_open_case');
  const existing = await client.query(
    'SELECT * FROM reviews WHERE booking_id = $1 AND reviewer_id = $2',
    [bookingId, actor.id],
  );
  if (existing.rowCount) return { review: shapeReview(existing.rows[0]), replayed: true };
  const inserted = await client.query(
    `INSERT INTO reviews (
       booking_id, listing_id, reviewer_id, reviewee_id, direction,
       rating, body, criteria, review_version, moderation_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 1, 'published')
     RETURNING *`,
    [bookingId, row.resolved_listing_id, actor.id, revieweeId, direction, candidate.rating, candidate.body, JSON.stringify(candidate.criteria)],
  );
  await client.query(
    `UPDATE users AS account SET profile = jsonb_set(
       jsonb_set(account.profile, '{avgRating}', to_jsonb(summary.average_rating), true),
       '{reviewCount}', to_jsonb(summary.review_count), true
     )
     FROM (
       SELECT reviewee_id, round(avg(rating), 1) AS average_rating, count(*)::int AS review_count
       FROM reviews WHERE reviewee_id = $1 AND moderation_status = 'published' GROUP BY reviewee_id
     ) AS summary
     WHERE account.id = summary.reviewee_id`,
    [revieweeId],
  );
  await audit(client, {
    actor,
    action: 'review.created',
    resourceType: 'review',
    resourceId: inserted.rows[0].id,
    metadata: { bookingId, listingId: row.resolved_listing_id, revieweeId, direction },
  });
  return { review: shapeReview(inserted.rows[0]), replayed: false };
}

export async function listPublishedReviews(client, { revieweeId = null, listingId = null, bookingId = null }) {
  const result = await client.query(
    `SELECT review.*, reviewer.profile->>'displayName' AS reviewer_name
     FROM reviews AS review
     JOIN users AS reviewer ON reviewer.id = review.reviewer_id
     WHERE review.moderation_status = 'published'
       AND ($1::text IS NULL OR review.reviewee_id = $1)
       AND ($2::text IS NULL OR review.listing_id = $2)
       AND ($3::text IS NULL OR review.booking_id = $3)
     ORDER BY review.created_at DESC LIMIT 200`,
    [revieweeId, listingId, bookingId],
  );
  return result.rows.map((row) => ({ ...shapeReview(row), reviewerName: row.reviewer_name || 'Mitglied' }));
}

export async function listStaffUsers(client, { role, limit, offset }) {
  const safeLimit = integer(limit, 50, { minimum: 1, maximum: 200 });
  const safeOffset = integer(offset, 0, { minimum: 0, maximum: 100_000 });
  const result = await client.query(
    `SELECT id, email, role, account_status, email_verified_at, created_at, profile
     FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset],
  );
  return result.rows.map((row) => shapeStaffUser(row, role));
}

export async function listStaffListings(client, { limit, offset }) {
  const result = await client.query(
    `SELECT id, owner_id, title, status, is_active, moderation_status,
            moderation_reason_code, created_at
     FROM listings ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [integer(limit, 50, { minimum: 1, maximum: 200 }), integer(offset, 0, { minimum: 0, maximum: 100_000 })],
  );
  return result.rows.map((row) => ({
    id: row.id, ownerId: row.owner_id, title: row.title, status: row.status,
    isActive: row.is_active, moderationStatus: row.moderation_status,
    moderationReasonCode: row.moderation_reason_code,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function listStaffBookings(client, { limit, offset }) {
  const result = await client.query(
    `SELECT id, listing_id, owner_id, renter_id, status, workflow_status,
            currency, quoted_total_minor, created_at
     FROM bookings ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [integer(limit, 50, { minimum: 1, maximum: 200 }), integer(offset, 0, { minimum: 0, maximum: 100_000 })],
  );
  return result.rows.map((row) => ({
    id: row.id, listingId: row.listing_id, ownerId: row.owner_id, renterId: row.renter_id,
    status: row.status, workflowStatus: row.workflow_status, currency: row.currency,
    quotedTotalMinor: Number(row.quoted_total_minor), createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function listStaffPayments(client, { limit, offset }) {
  const result = await client.query(
    `SELECT id, booking_id, status, currency, amount_minor, captured_minor,
            refunded_minor, transferred_minor, livemode, created_at
     FROM payments ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [integer(limit, 50, { minimum: 1, maximum: 200 }), integer(offset, 0, { minimum: 0, maximum: 100_000 })],
  );
  return result.rows.map((row) => ({
    id: row.id, bookingId: row.booking_id, status: row.status, currency: row.currency,
    amountMinor: Number(row.amount_minor), capturedMinor: Number(row.captured_minor),
    refundedMinor: Number(row.refunded_minor), transferredMinor: Number(row.transferred_minor),
    livemode: row.livemode, createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function listStaffAudit(client, { limit, offset }) {
  const result = await client.query(
    `SELECT id, actor_id, actor_role, action, resource_type, resource_id, metadata, created_at
     FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [integer(limit, 100, { minimum: 1, maximum: 500 }), integer(offset, 0, { minimum: 0, maximum: 100_000 })],
  );
  return result.rows.map((row) => ({
    id: Number(row.id), actorId: row.actor_id, actorRole: row.actor_role,
    action: row.action, resourceType: row.resource_type, resourceId: row.resource_id,
    metadata: row.metadata ?? {}, createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function getStaffEvidence(client, uploadId) {
  const result = await client.query(
    `SELECT upload.storage_name, upload.mime_type, upload.byte_size
     FROM uploads AS upload JOIN report_evidence AS evidence ON evidence.upload_id = upload.id
     WHERE upload.id::text = $1`,
    [uploadId],
  );
  if (!result.rowCount) throw new ModerationWorkflowError(404, 'report_evidence_not_found');
  return result.rows[0];
}
