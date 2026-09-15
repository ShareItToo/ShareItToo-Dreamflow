import {
  newHumanReadableAppealNumber,
  normalizeSupportAppealInput,
  supportAppealIdempotencyKey,
  supportAppealNextUpdateAt,
} from './support_appeal_domain.js';
import { SupportCaseError } from './support_case_domain.js';

const supportCaseTimeZone = 'Europe/Berlin';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function display(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: supportCaseTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function shapeAppeal(row, actor) {
  const actorId = typeof actor === 'string' ? actor : actor?.id;
  const privilegedOutcomeViewer = actor && typeof actor === 'object'
    && ['admin', 'staff'].includes(actor.role);
  const terminal = ['upheld', 'modified', 'reversed', 'closed'].includes(row.status);
  return Object.freeze({
    id: row.id,
    reviewNumber: row.human_readable_appeal_number,
    originalCaseNumber: row.case_number,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    submittedDisplay: display(row.submitted_at),
    nextUpdateAt: iso(row.next_update_at ?? row.case_next_update_at),
    nextUpdateDisplay: display(row.next_update_at ?? row.case_next_update_at),
    materialSummary: row.submitted_by === actorId
      ? 'Deine Begründung wurde vollständig und sicher aufgenommen.'
      : 'Ein begründeter Überprüfungsantrag wurde sicher aufgenommen.',
    interimEffect: 'Der Antrag selbst löst keine automatische Änderung oder externe Maßnahme aus.',
    reviewOwnerAssigned: row.reviewer_id != null,
    independentReview: row.independence_flag === true,
    outcome: terminal ? (row.outcome ?? null) : null,
    outcomeReason: terminal && (row.submitted_by === actorId || privilegedOutcomeViewer)
      ? (row.outcome_reason ?? null)
      : null,
    communicatedAt: terminal ? iso(row.communicated_at) : null,
    externalMessageSent: false,
    timezone: supportCaseTimeZone,
  });
}

function appealOutcome(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_appeal_resolution_invalid');
  }
  const outcome = typeof raw.outcome === 'string' ? raw.outcome.trim().toLowerCase() : '';
  if (!['upheld', 'modified', 'reversed'].includes(outcome)) {
    throw new SupportCaseError(400, 'support_appeal_outcome_invalid');
  }
  const outcomeReason = typeof raw.outcomeReason === 'string'
    ? raw.outcomeReason.trim()
    : '';
  if (outcomeReason.length < 3 || outcomeReason.length > 8000) {
    throw new SupportCaseError(400, 'support_appeal_outcome_reason_required');
  }
  const implementationChanges = raw.implementationChanges ?? [];
  if (!Array.isArray(implementationChanges) || implementationChanges.length > 20
      || implementationChanges.some((entry) => typeof entry !== 'object'
        || entry === null || Array.isArray(entry))) {
    throw new SupportCaseError(400, 'support_appeal_implementation_changes_invalid');
  }
  if (outcome !== 'upheld' && implementationChanges.length === 0) {
    throw new SupportCaseError(400, 'support_appeal_implementation_changes_required');
  }
  return Object.freeze({ outcome, outcomeReason, implementationChanges });
}

async function writeAudit(client, {
  actor,
  appealId,
  caseId,
  decisionId,
  action = 'support.appeal_submitted',
  metadata = {},
}) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $5, 'support_appeal', $3, $4::jsonb)`,
    [
      actor.id,
      actor.role,
      appealId,
      JSON.stringify({
        caseId,
        decisionId,
        externalMessageSent: false,
        automaticReopen: false,
        evidenceUploadUsed: false,
        ...metadata,
      }),
      action,
    ],
  );
}

export async function submitSupportAppeal(client, {
  actor,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const key = supportAppealIdempotencyKey(idempotencyKey);
  const replay = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE appeal.idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    const row = replay.rows[0];
    if (row.submitted_by !== actor.id || String(row.case_id) !== String(caseId)) {
      throw new SupportCaseError(409, 'support_appeal_idempotency_conflict');
    }
    return Object.freeze({ appeal: shapeAppeal(row, actor), replayed: true });
  }

  const locked = await client.query(
    `SELECT * FROM support_cases WHERE id::text = $1 FOR UPDATE`,
    [caseId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_case_not_found');
  const concurrentReplay = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE appeal.idempotency_key = $1`,
    [key],
  );
  if (concurrentReplay.rowCount) {
    const row = concurrentReplay.rows[0];
    if (row.submitted_by !== actor.id || String(row.case_id) !== String(caseId)) {
      throw new SupportCaseError(409, 'support_appeal_idempotency_conflict');
    }
    return Object.freeze({ appeal: shapeAppeal(row, actor), replayed: true });
  }
  const input = normalizeSupportAppealInput(raw);
  const supportCase = locked.rows[0];
  if (supportCase.reporter_user_id !== actor.id) {
    throw new SupportCaseError(403, 'support_appeal_reporter_required');
  }
  if (!['simulation', 'internal_testing'].includes(supportCase.operating_mode)) {
    throw new SupportCaseError(409, 'support_appeal_live_mode_forbidden');
  }
  if (input.expectedVersion !== Number(supportCase.lock_version)) {
    throw new SupportCaseError(409, 'support_case_version_conflict');
  }
  if (supportCase.status !== 'closed'
      || supportCase.appeal_available !== true
      || supportCase.appeal_id
      || !supportCase.appeal_configured_at
      || !supportCase.appeal_configured_by
      || !supportCase.appeal_deadline
      || new Date(supportCase.appeal_deadline) <= now) {
    throw new SupportCaseError(409, 'support_appeal_window_closed');
  }
  if (!supportCase.decision_id) {
    throw new SupportCaseError(409, 'support_appeal_requires_published_decision');
  }

  const published = await client.query(
    `SELECT id FROM support_decisions
      WHERE id = $1 AND case_id = $2
        AND approval_status = 'approved'
        AND approval_payload_sha256 = payload_sha256
        AND implementation_status = 'succeeded'
        AND implementation_verified_by IS NOT NULL
        AND implementation_verified_at IS NOT NULL
        AND communicated_at IS NOT NULL
        AND communicated_by IS NOT NULL
        AND communication_payload_sha256 = payload_sha256`,
    [supportCase.decision_id, supportCase.id],
  );
  if (!published.rowCount) {
    throw new SupportCaseError(409, 'support_appeal_decision_not_published');
  }
  const prior = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE appeal.original_decision_id = $1 AND appeal.submitted_by = $2`,
    [supportCase.decision_id, actor.id],
  );
  if (prior.rowCount) {
    throw new SupportCaseError(409, 'support_appeal_already_submitted');
  }

  const reviewNumber = newHumanReadableAppealNumber();
  const nextUpdateAt = supportAppealNextUpdateAt(supportCase.priority, now);
  const inserted = await client.query(
    `INSERT INTO support_appeals (
       original_decision_id, case_id, grounds, new_evidence_ids,
       submitted_by, submitted_at, status, idempotency_key,
       human_readable_appeal_number, next_update_at
     ) VALUES ($1, $2, $3, '{}'::uuid[], $4, $5, 'submitted', $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      supportCase.decision_id,
      supportCase.id,
      input.grounds,
      actor.id,
      now,
      key,
      reviewNumber,
      nextUpdateAt,
    ],
  );
  if (!inserted.rowCount) {
    const winner = await client.query(
      `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
              support_case.next_update_at AS case_next_update_at
         FROM support_appeals AS appeal
         JOIN support_cases AS support_case ON support_case.id = appeal.case_id
        WHERE appeal.idempotency_key = $1
           OR (appeal.original_decision_id = $2 AND appeal.submitted_by = $3)
        ORDER BY (appeal.idempotency_key = $1) DESC
        LIMIT 1`,
      [key, supportCase.decision_id, actor.id],
    );
    if (winner.rowCount && winner.rows[0].idempotency_key === key
        && String(winner.rows[0].case_id) === String(caseId)) {
      return Object.freeze({
        appeal: shapeAppeal(winner.rows[0], actor),
        replayed: true,
      });
    }
    throw new SupportCaseError(409, 'support_appeal_already_submitted');
  }
  const appeal = { ...inserted.rows[0], case_number: supportCase.human_readable_case_number };

  const updatedCase = await client.query(
    `UPDATE support_cases
        SET appeal_available = false, appeal_id = $2,
            lock_version = lock_version + 1, updated_at = $3
      WHERE id = $1 AND lock_version = $4
      RETURNING id`,
    [supportCase.id, appeal.id, now, Number(supportCase.lock_version)],
  );
  if (!updatedCase.rowCount) throw new SupportCaseError(409, 'support_case_version_conflict');

  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, from_status, to_status,
       transition_reason, entity_type, entity_id, structured_payload,
       automation_used, visibility, source_system, idempotency_key
     ) VALUES (
       $1, 'appeal.submitted', 'user', $2, 'closed', 'closed',
       'Authenticated review request recorded.', 'support_appeal', $3,
       $4::jsonb, false, 'user_visible', 'api', $5
     )`,
    [
      supportCase.id,
      actor.id,
      appeal.id,
      JSON.stringify({
        principalId: actor.id,
        action: 'appeal.submitted',
        reason: 'Authenticated review request recorded.',
        source: 'sit-api',
        reviewNumber: appeal.human_readable_appeal_number,
        nextUpdateAt: iso(appeal.next_update_at),
        externalMessageSent: false,
        automaticReopen: false,
      }),
      `${key}:event`,
    ],
  );
  await writeAudit(client, {
    actor,
    appealId: appeal.id,
    caseId: supportCase.id,
    decisionId: supportCase.decision_id,
  });
  return Object.freeze({ appeal: shapeAppeal(appeal, actor), replayed: false });
}

export async function getSupportAppealForCase(client, { actor, supportCase, staff = false }) {
  if (!supportCase.appeal_id) return null;
  const result = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE appeal.id = $1 AND appeal.case_id = $2`,
    [supportCase.appeal_id, supportCase.id],
  );
  if (!result.rowCount) throw new SupportCaseError(409, 'support_appeal_receipt_unavailable');
  const row = result.rows[0];
  if (!staff && row.submitted_by !== supportCase.reporter_user_id) {
    throw new SupportCaseError(409, 'support_appeal_receipt_unavailable');
  }
  return shapeAppeal(row, actor);
}

export async function listSupportAppeals(client, { actor, status = null } = {}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_appeal_staff_forbidden');
  }
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  const allowedStatuses = ['submitted', 'under_review', 'upheld', 'modified', 'reversed', 'closed'];
  if (normalizedStatus && !allowedStatuses.includes(normalizedStatus)) {
    throw new SupportCaseError(400, 'support_appeal_status_invalid');
  }
  const result = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE ($1::text IS NULL OR appeal.status = $1)
      ORDER BY appeal.submitted_at, appeal.id
      LIMIT 200`,
    [normalizedStatus || null],
  );
  return result.rows.map((row) => shapeAppeal(row, actor));
}

export async function claimSupportAppeal(client, {
  actor,
  appealId,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_appeal_claim_forbidden');
  }
  const key = supportAppealIdempotencyKey(idempotencyKey, 'support.appeal.claim');
  const replay = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
       JOIN support_case_events AS event
         ON event.entity_type = 'support_appeal'
        AND event.entity_id = appeal.id::text
      WHERE event.idempotency_key = $1`,
    [`${key}:event`],
  );
  if (replay.rowCount) {
    if (String(replay.rows[0].id) !== String(appealId)) {
      throw new SupportCaseError(409, 'support_appeal_claim_idempotency_conflict');
    }
    return { appeal: shapeAppeal(replay.rows[0], actor), replayed: true };
  }
  const locked = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE appeal.id::text = $1
      FOR UPDATE OF appeal`,
    [appealId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_appeal_not_found');
  const row = locked.rows[0];
  if (row.status !== 'submitted') {
    throw new SupportCaseError(409, 'support_appeal_not_claimable');
  }
  const updated = await client.query(
    `UPDATE support_appeals
        SET status = 'under_review', reviewer_id = $2, independence_flag = true
      WHERE id = $1 AND status = 'submitted' AND reviewer_id IS NULL
      RETURNING *`,
    [row.id, actor.id],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_appeal_claim_conflict');
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES ($1, 'appeal.claimed', 'admin', $2, 'support_appeal', $3,
       $4::jsonb, false, 'internal', $5, 'sit-api', $6)`,
    [row.case_id, actor.id, row.id, JSON.stringify({
      principalId: row.submitted_by,
      action: 'appeal.claimed',
      reason: 'Independent human review started.',
      source: 'sit-api',
      independentReview: true,
    }), `${key}:event`, now],
  );
  await writeAudit(client, {
    actor,
    appealId: row.id,
    caseId: row.case_id,
    decisionId: row.original_decision_id,
    action: 'support.appeal_claimed',
    metadata: { independentReview: true },
  });
  return {
    appeal: shapeAppeal({
      ...updated.rows[0],
      case_number: row.case_number,
      case_next_update_at: row.case_next_update_at,
    }, actor),
    replayed: false,
  };
}

export async function resolveSupportAppeal(client, {
  actor,
  appealId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_appeal_resolution_forbidden');
  }
  const input = appealOutcome(raw);
  const key = supportAppealIdempotencyKey(idempotencyKey, 'support.appeal.resolve');
  const replay = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
       JOIN support_case_events AS event
         ON event.entity_type = 'support_appeal'
        AND event.entity_id = appeal.id::text
      WHERE event.idempotency_key = $1`,
    [`${key}:event`],
  );
  if (replay.rowCount) {
    if (String(replay.rows[0].id) !== String(appealId)) {
      throw new SupportCaseError(409, 'support_appeal_resolution_idempotency_conflict');
    }
    return { appeal: shapeAppeal(replay.rows[0], actor), replayed: true };
  }
  const locked = await client.query(
    `SELECT appeal.*, support_case.human_readable_case_number AS case_number,
            support_case.next_update_at AS case_next_update_at
       FROM support_appeals AS appeal
       JOIN support_cases AS support_case ON support_case.id = appeal.case_id
      WHERE appeal.id::text = $1
      FOR UPDATE OF appeal`,
    [appealId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_appeal_not_found');
  const row = locked.rows[0];
  if (row.status !== 'under_review' || row.reviewer_id !== actor.id
      || row.independence_flag !== true) {
    throw new SupportCaseError(409, 'support_appeal_independent_review_required');
  }
  const updated = await client.query(
    `UPDATE support_appeals
        SET status = $2, outcome = $3, outcome_reason = $4,
            implementation_changes = $5::jsonb, communicated_at = $6
      WHERE id = $1 AND status = 'under_review' AND reviewer_id = $7
      RETURNING *`,
    [row.id, input.outcome, input.outcome, input.outcomeReason,
      JSON.stringify(input.implementationChanges), now, actor.id],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_appeal_resolution_conflict');
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES ($1, 'appeal.resolved', 'admin', $2, 'support_appeal', $3,
       $4::jsonb, false, 'user_visible', $5, 'sit-api', $6)`,
    [row.case_id, actor.id, row.id, JSON.stringify({
      principalId: row.submitted_by,
      action: 'appeal.resolved',
      reason: input.outcomeReason,
      source: 'sit-api',
      outcome: input.outcome,
      outcomeReason: input.outcomeReason,
      implementationChanges: input.implementationChanges,
      externalMessageSent: false,
      automaticReopen: false,
    }), `${key}:event`, now],
  );
  await writeAudit(client, {
    actor,
    appealId: row.id,
    caseId: row.case_id,
    decisionId: row.original_decision_id,
    action: 'support.appeal_resolved',
    metadata: {
      outcome: input.outcome,
      externalMessageSent: false,
      automaticReopen: false,
    },
  });
  return {
    appeal: shapeAppeal({
      ...updated.rows[0],
      case_number: row.case_number,
      case_next_update_at: row.case_next_update_at,
    }, actor),
    replayed: false,
  };
}
