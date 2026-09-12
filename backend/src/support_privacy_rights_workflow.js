import crypto from 'node:crypto';

import {
  normalizePrivacyDeadlineExtension,
  normalizePrivacyIdentityVerification,
  privacyRightsResponseDeadline,
} from './support_privacy_rights_domain.js';
import {
  SupportCaseError,
  supportCaseIdempotencyKey,
} from './support_case_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function safeLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new SupportCaseError(400, 'support_limit_invalid');
  }
  return parsed;
}

function shapePrivacyRightsRequest(row, { staff = false } = {}) {
  const activeLegalHoldCount = Number(row.active_legal_hold_count ?? 0);
  const base = {
    id: row.id,
    caseId: row.case_id,
    caseNumber: row.human_readable_case_number ?? null,
    requestVersion: row.request_version,
    requestKind: row.request_kind,
    identityStatus: row.identity_status,
    identityVerifiedAt: iso(row.identity_verified_at),
    processingStatus: row.processing_status,
    receivedAt: iso(row.received_at),
    firstResponseDueAt: iso(row.first_response_due_at),
    responseDueAt: iso(row.response_due_at),
    reminderAt: iso(row.reminder_at),
    deadlinePolicyVersion: row.deadline_policy_version,
    extensionRecorded: Number(row.extension_count) === 1,
    erasureExecutionAllowed: false,
    disclosureAllowed: false,
    externalDeliveryEnabled: false,
    version: Number(row.lock_version),
  };
  if (!staff) {
    return Object.freeze({
      ...base,
      legalHoldReviewRequired: row.request_kind === 'erasure'
        && activeLegalHoldCount > 0,
    });
  }
  return Object.freeze({
    ...base,
    subjectUserId: row.subject_user_id,
    activeLegalHoldCount,
    currentOwnerRole: row.current_owner_role ?? null,
    caseStatus: row.case_status ?? null,
    casePriority: row.case_priority ?? null,
  });
}

async function writeAudit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_privacy_rights_request', $4, $5::jsonb)`,
    [actor.id, actor.role, action, resourceId, JSON.stringify(metadata)],
  );
}

export async function createPrivacyRightsRequestForCase(client, {
  caseRecord,
  privacyRightsRequest,
  subjectUserId,
  now,
}) {
  if (!privacyRightsRequest) return null;
  const firstResponseDueAt = privacyRightsResponseDeadline(now, 1);
  const reminderAt = new Date(firstResponseDueAt.getTime() - (72 * 60 * 60 * 1000));
  const result = await client.query(
    `INSERT INTO support_privacy_rights_requests (
       id, case_id, subject_user_id, request_version, request_kind,
       identity_status, processing_status, received_at,
       first_response_due_at, response_due_at, reminder_at,
       deadline_policy_version, extension_count, lock_version,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       'pending', 'identity_pending', $6,
       $7, $7, $8,
       'gdpr-art12-conservative-calendar-month-v1', 0, 1,
       $6, $6
     ) RETURNING *`,
    [
      crypto.randomUUID(),
      caseRecord.id,
      subjectUserId,
      privacyRightsRequest.version,
      privacyRightsRequest.requestKind,
      now,
      firstResponseDueAt,
      reminderAt,
    ],
  );
  return result.rows[0];
}

export async function getPrivacyRightsRequestForCase(client, {
  actor,
  caseId,
  staff = false,
}) {
  if (!actor?.id || !['user', 'support', 'admin'].includes(actor.role)) {
    throw new SupportCaseError(403, 'support_privacy_rights_request_forbidden');
  }
  if (staff && !['support', 'admin'].includes(actor.role)) {
    throw new SupportCaseError(403, 'support_privacy_rights_request_forbidden');
  }
  const result = await client.query(
    `SELECT privacy_request.*,
            support_case.human_readable_case_number,
            support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role,
            (SELECT count(*)::int FROM account_legal_holds AS legal_hold
              WHERE legal_hold.user_id = privacy_request.subject_user_id
                AND legal_hold.released_at IS NULL) AS active_legal_hold_count
       FROM support_privacy_rights_requests AS privacy_request
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE privacy_request.case_id::text = $1
        AND ($2::boolean OR privacy_request.subject_user_id = $3)`,
    [caseId, staff, actor.id],
  );
  if (!result.rowCount) {
    throw new SupportCaseError(404, 'support_privacy_rights_request_not_found');
  }
  return shapePrivacyRightsRequest(result.rows[0], { staff });
}

export async function verifyPrivacyRightsRequestIdentity(client, {
  actor,
  sessionId,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'user' || !actor.id || !sessionId) {
    throw new SupportCaseError(403, 'support_privacy_identity_verification_forbidden');
  }
  const normalized = normalizePrivacyIdentityVerification(raw);
  const key = supportCaseIdempotencyKey(
    idempotencyKey,
    'support.privacy_rights.identity.verify',
  );
  const replay = await client.query(
    `SELECT privacy_request.*, support_case.human_readable_case_number,
            (SELECT count(*)::int FROM account_legal_holds AS legal_hold
              WHERE legal_hold.user_id = privacy_request.subject_user_id
                AND legal_hold.released_at IS NULL) AS active_legal_hold_count
       FROM support_privacy_identity_verifications AS verification
       JOIN support_privacy_rights_requests AS privacy_request
         ON privacy_request.id = verification.privacy_request_id
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE verification.idempotency_key = $1
        AND verification.subject_user_id = $2`,
    [key, actor.id],
  );
  if (replay.rowCount) {
    if (replay.rows[0].case_id.toString() !== caseId) {
      throw new SupportCaseError(409, 'support_idempotency_scope_mismatch');
    }
    return Object.freeze({
      privacyRightsRequest: shapePrivacyRightsRequest(replay.rows[0]),
      replayed: true,
    });
  }

  const current = await client.query(
    `SELECT privacy_request.*, support_case.human_readable_case_number
       FROM support_privacy_rights_requests AS privacy_request
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE privacy_request.case_id::text = $1
        AND privacy_request.subject_user_id = $2
      FOR UPDATE OF privacy_request`,
    [caseId, actor.id],
  );
  if (!current.rowCount) {
    throw new SupportCaseError(404, 'support_privacy_rights_request_not_found');
  }
  const row = current.rows[0];
  if (Number(row.lock_version) !== normalized.expectedVersion) {
    throw new SupportCaseError(409, 'support_privacy_version_conflict', {
      currentVersion: Number(row.lock_version),
    });
  }
  if (row.identity_status !== 'pending'
      || row.processing_status !== 'identity_pending') {
    throw new SupportCaseError(409, 'support_privacy_identity_already_verified');
  }
  const verificationId = crypto.randomUUID();
  await client.query(
    `INSERT INTO support_privacy_identity_verifications (
       id, privacy_request_id, subject_user_id, session_id,
       verification_method, idempotency_key, verified_at
     ) VALUES ($1, $2, $3, $4, 'account_password', $5, $6)`,
    [verificationId, row.id, actor.id, sessionId, key, now],
  );
  const updated = await client.query(
    `UPDATE support_privacy_rights_requests
        SET identity_status = 'verified',
            identity_verified_at = $2,
            identity_verification_session_id = $3,
            processing_status = 'under_review',
            lock_version = lock_version + 1,
            updated_at = GREATEST($2, updated_at + INTERVAL '1 microsecond')
      WHERE id = $1
      RETURNING *`,
    [row.id, now, sessionId],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, 'support.privacy_rights.identity_verified', 'user', $2,
       'support_privacy_identity_verification', $3, $4::jsonb,
       false, 'user_visible', $5, 'sit-api', $6
     )`,
    [
      row.case_id,
      actor.id,
      verificationId,
      JSON.stringify({
        identityStatus: 'verified',
        verificationMethod: 'account_password',
        deadlineShifted: false,
      }),
      `${key}:event`,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.privacy_rights_identity_verified',
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      verificationMethod: 'account_password',
      deadlineShifted: false,
    },
  });
  return Object.freeze({
    privacyRightsRequest: shapePrivacyRightsRequest({
      ...updated.rows[0],
      human_readable_case_number: row.human_readable_case_number,
    }),
    replayed: false,
  });
}

export async function recordPrivacyRightsDeadlineExtension(client, {
  actor,
  sessionId,
  staffElevationId,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin' || !actor.id || !sessionId || !staffElevationId) {
    throw new SupportCaseError(403, 'support_privacy_extension_admin_required');
  }
  const normalized = normalizePrivacyDeadlineExtension(raw);
  const key = supportCaseIdempotencyKey(
    idempotencyKey,
    'support.privacy_rights.deadline.extend',
  );
  const replay = await client.query(
    `SELECT privacy_request.*, support_case.human_readable_case_number,
            support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role,
            (SELECT count(*)::int FROM account_legal_holds AS legal_hold
              WHERE legal_hold.user_id = privacy_request.subject_user_id
                AND legal_hold.released_at IS NULL) AS active_legal_hold_count
       FROM support_privacy_deadline_extensions AS extension
       JOIN support_privacy_rights_requests AS privacy_request
         ON privacy_request.id = extension.privacy_request_id
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE extension.idempotency_key = $1 AND extension.recorded_by = $2`,
    [key, actor.id],
  );
  if (replay.rowCount) {
    if (replay.rows[0].case_id.toString() !== caseId) {
      throw new SupportCaseError(409, 'support_idempotency_scope_mismatch');
    }
    return Object.freeze({
      privacyRightsRequest: shapePrivacyRightsRequest(replay.rows[0], { staff: true }),
      replayed: true,
    });
  }

  const current = await client.query(
    `SELECT privacy_request.*, support_case.human_readable_case_number,
            support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role
       FROM support_privacy_rights_requests AS privacy_request
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE privacy_request.case_id::text = $1
      FOR UPDATE OF privacy_request`,
    [caseId],
  );
  if (!current.rowCount) {
    throw new SupportCaseError(404, 'support_privacy_rights_request_not_found');
  }
  const row = current.rows[0];
  if (Number(row.lock_version) !== normalized.expectedVersion) {
    throw new SupportCaseError(409, 'support_privacy_version_conflict', {
      currentVersion: Number(row.lock_version),
    });
  }
  if (row.processing_status === 'completed'
      || Number(row.extension_count) !== 0
      || now > new Date(row.first_response_due_at)) {
    throw new SupportCaseError(409, 'support_privacy_extension_not_available');
  }
  const extendedDueAt = privacyRightsResponseDeadline(row.received_at, 3);
  const reminderAt = new Date(extendedDueAt.getTime() - (72 * 60 * 60 * 1000));
  const extensionId = crypto.randomUUID();
  await client.query(
    `INSERT INTO support_privacy_deadline_extensions (
       id, privacy_request_id, previous_due_at, extended_due_at,
       user_facing_reason, recorded_by, recorded_session_id,
       staff_elevation_id, idempotency_key, recorded_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      extensionId,
      row.id,
      row.response_due_at,
      extendedDueAt,
      normalized.userFacingReason,
      actor.id,
      sessionId,
      staffElevationId,
      key,
      now,
    ],
  );
  const updated = await client.query(
    `UPDATE support_privacy_rights_requests
        SET response_due_at = $2,
            reminder_at = $3,
            extension_count = 1,
            lock_version = lock_version + 1,
            updated_at = GREATEST($4, updated_at + INTERVAL '1 microsecond')
      WHERE id = $1
      RETURNING *`,
    [row.id, extendedDueAt, reminderAt, now],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       transition_reason, structured_payload, automation_used, visibility,
       idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'support.privacy_rights.deadline_extended', 'admin', $2,
       'support_privacy_deadline_extension', $3, $4, $5::jsonb,
       false, 'user_visible', $6, 'sit-api', $7
     )`,
    [
      row.case_id,
      actor.id,
      extensionId,
      normalized.userFacingReason,
      JSON.stringify({
        previousDueAt: iso(row.response_due_at),
        extendedDueAt: iso(extendedDueAt),
        reasonProvided: true,
        externalNotificationSent: false,
      }),
      `${key}:event`,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.privacy_rights_deadline_extended',
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      previousDueAt: iso(row.response_due_at),
      extendedDueAt: iso(extendedDueAt),
      reasonLength: normalized.userFacingReason.length,
      externalNotificationSent: false,
    },
  });
  return Object.freeze({
    privacyRightsRequest: shapePrivacyRightsRequest({
      ...updated.rows[0],
      human_readable_case_number: row.human_readable_case_number,
      case_status: row.case_status,
      case_priority: row.case_priority,
      current_owner_role: row.current_owner_role,
    }, { staff: true }),
    replayed: false,
  });
}

export async function listPrivacyRightsQueue(client, {
  actor,
  limit = 100,
} = {}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_privacy_queue_admin_required');
  }
  const result = await client.query(
    `SELECT privacy_request.*,
            support_case.human_readable_case_number,
            support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role,
            (SELECT count(*)::int FROM account_legal_holds AS legal_hold
              WHERE legal_hold.user_id = privacy_request.subject_user_id
                AND legal_hold.released_at IS NULL) AS active_legal_hold_count
       FROM support_privacy_rights_requests AS privacy_request
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE privacy_request.processing_status <> 'completed'
        AND support_case.operating_mode IN ('simulation', 'internal_testing')
      ORDER BY privacy_request.response_due_at, privacy_request.received_at,
               privacy_request.id
      LIMIT $1`,
    [safeLimit(limit)],
  );
  return result.rows.map((row) => shapePrivacyRightsRequest(row, { staff: true }));
}

export async function reconcilePrivacyRightsDeadlinesWithClient(client, {
  now = new Date(),
  limit = 100,
} = {}) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) {
    throw new SupportCaseError(400, 'support_privacy_deadline_time_invalid');
  }
  const candidates = await client.query(
    `SELECT privacy_request.id, privacy_request.case_id,
            privacy_request.request_kind, privacy_request.identity_status,
            privacy_request.processing_status, privacy_request.response_due_at,
            privacy_request.reminder_at, privacy_request.lock_version,
            support_case.status AS case_status
       FROM support_privacy_rights_requests AS privacy_request
       JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
      WHERE privacy_request.processing_status <> 'completed'
        AND support_case.status NOT IN ('resolved', 'closed')
        AND support_case.operating_mode IN ('simulation', 'internal_testing')
        AND privacy_request.reminder_at <= $1
      ORDER BY privacy_request.response_due_at, privacy_request.id
      FOR UPDATE OF privacy_request SKIP LOCKED
      LIMIT $2`,
    [current, safeLimit(limit)],
  );
  let alertsCreated = 0;
  let deadlineNear = 0;
  let deadlineOverdue = 0;
  for (const row of candidates.rows) {
    const overdue = new Date(row.response_due_at) < current;
    const eventType = overdue
      ? 'support.privacy_rights.deadline_overdue'
      : 'support.privacy_rights.deadline_near';
    if (overdue) deadlineOverdue += 1;
    else deadlineNear += 1;
    const key = `support-privacy-deadline:v1:${eventType}:${iso(row.response_due_at)}`;
    const inserted = await client.query(
      `INSERT INTO support_case_events (
         case_id, event_type, actor_type, actor_id, entity_type, entity_id,
         structured_payload, automation_used, visibility, idempotency_key,
         source_system, created_at
       ) VALUES (
         $1, $2, 'service', NULL, 'support_privacy_rights_request', $3,
         $4::jsonb, true, 'internal', $5,
         'sit-support-deadline-watchdog', $6
       ) ON CONFLICT (case_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        row.case_id,
        eventType,
        row.id,
        JSON.stringify({
          requestKind: row.request_kind,
          identityStatus: row.identity_status,
          caseStatus: row.case_status,
          responseDueAt: iso(row.response_due_at),
          externalNotificationSent: false,
        }),
        key,
        current,
      ],
    );
    alertsCreated += inserted.rowCount;
  }
  return Object.freeze({
    inspected: candidates.rowCount,
    alertsCreated,
    deadlineNear,
    deadlineOverdue,
    externalNotificationsSent: 0,
  });
}
