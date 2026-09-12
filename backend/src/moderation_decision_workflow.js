import {
  ModerationDomainError,
  moderationIdempotencyKey,
  moderationReviewDeadline,
  normalizeModerationDecisionInput,
  normalizeModerationReviewRequestInput,
} from './moderation_domain.js';

export class ModerationDecisionError extends ModerationDomainError {}

function text(value, maximum = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function decisionShape(row) {
  const reviewResolution = row.review_resolution_id
    ? Object.freeze({
        outcome: row.review_resolution_outcome,
        userFacingReason: row.review_resolution_user_facing_reason,
        humanReviewed: row.review_resolution_human_reviewed === true,
        independent: row.review_resolution_independence_verified === true,
        automationRole: row.review_resolution_automation_role,
        measureChanged: row.review_resolution_measure_changed === true,
        communicatedAt: new Date(row.review_resolution_communicated_at).toISOString(),
      })
    : null;
  const statement = row.statement_version
    ? Object.freeze({
        version: row.statement_version,
        decisionGround: row.statement_decision_ground,
        decisionOrigin: row.statement_decision_origin,
        territorialScope: row.statement_territorial_scope,
        durationType: row.statement_duration_type,
        startsAt: new Date(row.statement_starts_at).toISOString(),
        endsAt: row.statement_ends_at
          ? new Date(row.statement_ends_at).toISOString()
          : null,
        automationRole: row.statement_automation_role,
        humanReviewed: row.statement_human_reviewed === true,
        reviewChannel: row.statement_review_channel,
        publishedAt: new Date(row.statement_published_at).toISOString(),
      })
    : null;
  return Object.freeze({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    measureType: row.measure_type,
    measureState: row.measure_state,
    measureStatus: row.measure_status ?? 'standard',
    noGuiltDetermination: row.no_guilt_determination === true,
    userFacingMeasureNotice: row.user_facing_measure_notice ?? null,
    accountSuspensionProposalId: row.account_suspension_proposal_id ?? null,
    facts: row.facts,
    basis: row.basis,
    reasoning: row.reasoning,
    detectionMethod: row.detection_method,
    automatedMeans: row.automated_means ?? null,
    reviewAvailable: row.review_available === true,
    reviewDeadlineAt: row.review_deadline_at
      ? new Date(row.review_deadline_at).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
    statementOfReasons: statement,
    reviewRequest: row.review_request_id
      ? Object.freeze({
          id: row.review_request_id,
          status: row.review_request_status,
          submittedAt: new Date(row.review_submitted_at).toISOString(),
          resolvedAt: row.review_resolved_at
            ? new Date(row.review_resolved_at).toISOString()
            : null,
          resolution: row.review_resolution ?? null,
          resolutionDetails: reviewResolution,
        })
      : null,
  });
}

function reviewShape(row) {
  const resolutionDetails = row.resolution_evidence_id
    ? Object.freeze({
        outcome: row.resolution_outcome,
        userFacingReason: row.resolution_user_facing_reason,
        humanReviewed: row.resolution_human_reviewed === true,
        independent: row.resolution_independence_verified === true,
        automationRole: row.resolution_automation_role,
        measureChanged: row.resolution_measure_changed === true,
        communicatedAt: new Date(row.resolution_communicated_at).toISOString(),
      })
    : null;
  return Object.freeze({
    id: row.id,
    decisionId: row.decision_id,
    status: row.status,
    reason: row.reason,
    resolution: row.resolution ?? null,
    resolutionDetails,
    submittedAt: new Date(row.submitted_at).toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
  });
}

function staffReviewShape(row, actorId) {
  return Object.freeze({
    ...reviewShape(row),
    assignedToMe: row.assigned_to === actorId,
    canClaim: row.status === 'submitted'
      && Boolean(row.original_issued_by)
      && row.original_issued_by !== actorId,
    independentReviewerRequired: true,
    originalDecision: Object.freeze({
      id: row.decision_id,
      recipientUserId: row.recipient_user_id,
      targetType: row.target_type,
      targetId: row.target_id,
      measureType: row.measure_type,
      measureState: row.measure_state,
      facts: row.facts,
      basis: row.basis,
      reasoning: row.reasoning,
      createdAt: new Date(row.decision_created_at).toISOString(),
    }),
  });
}

async function audit(client, { actor, action, resourceType, resourceId, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actor?.id ?? null,
      actor?.role ?? 'system',
      action,
      resourceType,
      resourceId,
      JSON.stringify(metadata),
    ],
  );
}

export async function persistModerationDecision(client, {
  actor,
  recipientUserId,
  reportId = null,
  targetType,
  targetId,
  measureType,
  measureState,
  raw,
  idempotencyKey,
  issuedAt = new Date(),
  expectedStatement = null,
  measureContext = null,
}) {
  const statementRequired = measureType !== 'report_resolution';
  if (statementRequired && actor?.role !== 'admin') {
    throw new ModerationDecisionError(403, 'admin_role_required');
  }
  const decision = normalizeModerationDecisionInput(raw, { statementRequired });
  if (expectedStatement && decision.statementOfReasons) {
    if (decision.statementOfReasons.durationType !== expectedStatement.durationType) {
      throw new ModerationDecisionError(400, 'moderation_statement_duration_mismatch');
    }
    const expectedEnd = expectedStatement.endsAt
      ? new Date(expectedStatement.endsAt).toISOString()
      : null;
    const actualEnd = decision.statementOfReasons.endsAt
      ? decision.statementOfReasons.endsAt.toISOString()
      : null;
    if (actualEnd !== expectedEnd) {
      throw new ModerationDecisionError(400, 'moderation_statement_end_mismatch');
    }
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'moderation.decision');
  const existing = await client.query(
    `SELECT decision.*,
            statement.statement_version,
            statement.decision_ground AS statement_decision_ground,
            statement.decision_origin AS statement_decision_origin,
            statement.territorial_scope AS statement_territorial_scope,
            statement.duration_type AS statement_duration_type,
            statement.starts_at AS statement_starts_at,
            statement.ends_at AS statement_ends_at,
            statement.automation_role AS statement_automation_role,
            statement.human_reviewed AS statement_human_reviewed,
            statement.review_channel AS statement_review_channel,
            statement.published_at AS statement_published_at
       FROM moderation_decisions AS decision
       LEFT JOIN moderation_statements_of_reasons AS statement
         ON statement.moderation_decision_id = decision.id
      WHERE decision.idempotency_key = $1`,
    [key],
  );
  if (existing.rowCount) return { decision: decisionShape(existing.rows[0]), replayed: true };
  if (!['user', 'listing', 'review', 'message', 'report'].includes(targetType)) {
    throw new ModerationDecisionError(400, 'moderation_decision_target_invalid');
  }
  if (![
    'account_suspension',
    'scope_suspension',
    'listing_restriction',
    'private_marketplace_review',
    'report_resolution',
    'measure_reversal',
  ].includes(measureType)) {
    throw new ModerationDecisionError(400, 'moderation_decision_measure_invalid');
  }
  const recipient = await client.query(
    'SELECT id FROM users WHERE id = $1 AND deactivated_at IS NULL',
    [recipientUserId],
  );
  if (!recipient.rowCount) throw new ModerationDecisionError(404, 'moderation_decision_recipient_not_found');
  if (reportId) {
    const report = await client.query('SELECT id FROM reports WHERE id::text = $1', [reportId]);
    if (!report.rowCount) throw new ModerationDecisionError(404, 'report_not_found');
  }
  const deadline = moderationReviewDeadline(issuedAt);
  const context = measureContext ?? Object.freeze({
    status: 'standard',
    noGuiltDetermination: false,
    userFacingNotice: null,
    accountSuspensionProposalId: null,
  });
  if (!['standard', 'provisional', 'approved'].includes(context.status)
      || typeof context.noGuiltDetermination !== 'boolean'
      || (context.userFacingNotice !== null && typeof context.userFacingNotice !== 'string')
      || (context.accountSuspensionProposalId !== null
        && typeof context.accountSuspensionProposalId !== 'string')) {
    throw new ModerationDecisionError(400, 'moderation_measure_context_invalid');
  }
  const inserted = await client.query(
    `INSERT INTO moderation_decisions (
       report_id, recipient_user_id, target_type, target_id,
       measure_type, measure_state, facts, basis, reasoning,
       detection_method, automated_means, review_available,
       review_deadline_at, issued_by, idempotency_key, created_at,
       measure_status, no_guilt_determination, user_facing_measure_notice,
       account_suspension_proposal_id
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, true, $12, $13, $14, $15,
       $16, $17, $18, $19::uuid
     ) RETURNING *`,
    [
      reportId,
      recipientUserId,
      targetType,
      targetId,
      measureType,
      text(measureState, 120),
      decision.facts,
      decision.basis,
      decision.reasoning,
      decision.detectionMethod,
      decision.automatedMeans,
      deadline,
      actor?.id ?? null,
      key,
      issuedAt,
      context.status,
      context.noGuiltDetermination,
      context.userFacingNotice,
      context.accountSuspensionProposalId,
    ],
  );
  let storedDecision = inserted.rows[0];
  if (decision.statementOfReasons) {
    const statement = decision.statementOfReasons;
    if (statement.endsAt && statement.endsAt <= new Date(issuedAt)) {
      throw new ModerationDecisionError(400, 'moderation_statement_end_invalid');
    }
    const insertedStatement = await client.query(
      `INSERT INTO moderation_statements_of_reasons (
         moderation_decision_id, statement_version, decision_ground,
         decision_origin, territorial_scope, duration_type, starts_at,
         ends_at, automation_role, human_reviewed, human_reviewed_by,
         review_channel, published_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10,
         'authenticated_in_app', $7
       ) RETURNING *`,
      [
        storedDecision.id,
        statement.version,
        statement.decisionGround,
        statement.decisionOrigin,
        statement.territorialScope,
        statement.durationType,
        issuedAt,
        statement.endsAt,
        statement.automationRole,
        actor.id,
      ],
    );
    const storedStatement = insertedStatement.rows[0];
    storedDecision = {
      ...storedDecision,
      statement_version: storedStatement.statement_version,
      statement_decision_ground: storedStatement.decision_ground,
      statement_decision_origin: storedStatement.decision_origin,
      statement_territorial_scope: storedStatement.territorial_scope,
      statement_duration_type: storedStatement.duration_type,
      statement_starts_at: storedStatement.starts_at,
      statement_ends_at: storedStatement.ends_at,
      statement_automation_role: storedStatement.automation_role,
      statement_human_reviewed: storedStatement.human_reviewed,
      statement_review_channel: storedStatement.review_channel,
      statement_published_at: storedStatement.published_at,
    };
  }
  await audit(client, {
    actor,
    action: 'moderation.decision_issued',
    resourceType: 'moderation_decision',
    resourceId: inserted.rows[0].id,
    metadata: {
      recipientUserId,
      targetType,
      targetId,
      measureType,
      measureState,
      statementVersion: decision.statementOfReasons?.version ?? null,
      automationRole: decision.statementOfReasons?.automationRole ?? null,
      measureStatus: context.status,
      noGuiltDetermination: context.noGuiltDetermination,
      accountSuspensionProposalId: context.accountSuspensionProposalId,
    },
  });
  return { decision: decisionShape(storedDecision), replayed: false };
}

export async function listMyModerationDecisions(client, actorId) {
  const result = await client.query(
    `SELECT decision.*,
            statement.statement_version,
            statement.decision_ground AS statement_decision_ground,
            statement.decision_origin AS statement_decision_origin,
            statement.territorial_scope AS statement_territorial_scope,
            statement.duration_type AS statement_duration_type,
            statement.starts_at AS statement_starts_at,
            statement.ends_at AS statement_ends_at,
            statement.automation_role AS statement_automation_role,
            statement.human_reviewed AS statement_human_reviewed,
            statement.review_channel AS statement_review_channel,
            statement.published_at AS statement_published_at,
            review.id AS review_request_id,
            review.status AS review_request_status,
            review.submitted_at AS review_submitted_at,
            review.resolved_at AS review_resolved_at,
            review.resolution AS review_resolution,
            resolution.id AS review_resolution_id,
            resolution.outcome AS review_resolution_outcome,
            resolution.user_facing_reason AS review_resolution_user_facing_reason,
            resolution.human_reviewed AS review_resolution_human_reviewed,
            resolution.independence_verified AS review_resolution_independence_verified,
            resolution.automation_role AS review_resolution_automation_role,
            resolution.measure_changed AS review_resolution_measure_changed,
            resolution.communicated_at AS review_resolution_communicated_at
       FROM moderation_decisions AS decision
       LEFT JOIN moderation_statements_of_reasons AS statement
         ON statement.moderation_decision_id = decision.id
       LEFT JOIN moderation_review_requests AS review
         ON review.decision_id = decision.id AND review.requester_id = $1
       LEFT JOIN moderation_review_resolutions AS resolution
         ON resolution.review_request_id = review.id
      WHERE decision.recipient_user_id = $1
      ORDER BY decision.created_at DESC, decision.id DESC
      LIMIT 200`,
    [actorId],
  );
  return result.rows.map(decisionShape);
}

export async function submitModerationReviewRequest(client, {
  actor,
  decisionId,
  raw,
  idempotencyKey,
}) {
  const review = normalizeModerationReviewRequestInput(raw);
  const key = moderationIdempotencyKey(idempotencyKey, 'moderation.review.request');
  const replay = await client.query(
    'SELECT * FROM moderation_review_requests WHERE idempotency_key = $1',
    [key],
  );
  if (replay.rowCount) return { reviewRequest: reviewShape(replay.rows[0]), replayed: true };
  const decision = await client.query(
    `SELECT * FROM moderation_decisions WHERE id::text = $1 FOR UPDATE`,
    [decisionId],
  );
  if (!decision.rowCount) throw new ModerationDecisionError(404, 'moderation_decision_not_found');
  const row = decision.rows[0];
  if (row.recipient_user_id !== actor.id) {
    throw new ModerationDecisionError(403, 'moderation_decision_forbidden');
  }
  if (!row.review_available || !row.review_deadline_at || new Date(row.review_deadline_at) <= new Date()) {
    throw new ModerationDecisionError(409, 'moderation_review_window_closed');
  }
  const prior = await client.query(
    'SELECT * FROM moderation_review_requests WHERE decision_id = $1 AND requester_id = $2',
    [row.id, actor.id],
  );
  if (prior.rowCount) throw new ModerationDecisionError(409, 'moderation_review_already_requested');
  const inserted = await client.query(
    `INSERT INTO moderation_review_requests (
       decision_id, requester_id, reason, idempotency_key
     ) VALUES ($1, $2, $3, $4) RETURNING *`,
    [row.id, actor.id, review.reason, key],
  );
  await client.query(
    `INSERT INTO moderation_review_events (
       review_request_id, actor_id, actor_role, event_type,
       to_status, note, idempotency_key
     ) VALUES ($1, $2, $3, 'submitted', 'submitted', $4, $5)`,
    [inserted.rows[0].id, actor.id, actor.role, review.reason, `${key}:event`],
  );
  await audit(client, {
    actor,
    action: 'moderation.review_requested',
    resourceType: 'moderation_review_request',
    resourceId: inserted.rows[0].id,
    metadata: { decisionId: row.id },
  });
  return { reviewRequest: reviewShape(inserted.rows[0]), replayed: false };
}

export async function listStaffModerationReviewRequests(client, { actor, status = null } = {}) {
  if (actor?.role !== 'admin') {
    throw new ModerationDecisionError(403, 'admin_role_required');
  }
  const normalizedStatus = text(status, 30) || null;
  const result = await client.query(
    `SELECT review.*,
            decision.recipient_user_id, decision.target_type,
            decision.target_id, decision.measure_type, decision.measure_state,
            decision.facts, decision.basis, decision.reasoning,
            decision.issued_by AS original_issued_by,
            decision.created_at AS decision_created_at,
            resolution.id AS resolution_evidence_id,
            resolution.outcome AS resolution_outcome,
            resolution.user_facing_reason AS resolution_user_facing_reason,
            resolution.human_reviewed AS resolution_human_reviewed,
            resolution.independence_verified AS resolution_independence_verified,
            resolution.automation_role AS resolution_automation_role,
            resolution.measure_changed AS resolution_measure_changed,
            resolution.communicated_at AS resolution_communicated_at
       FROM moderation_review_requests AS review
       JOIN moderation_decisions AS decision ON decision.id = review.decision_id
       LEFT JOIN moderation_review_resolutions AS resolution
         ON resolution.review_request_id = review.id
       WHERE (($1::text IS NULL AND review.status IN ('submitted', 'in_review'))
          OR review.status = $1)
      ORDER BY review.submitted_at, review.id
      LIMIT 200`,
    [normalizedStatus],
  );
  return result.rows.map((row) => staffReviewShape(row, actor.id));
}

export async function claimModerationReviewRequest(client, {
  actor,
  reviewRequestId,
  idempotencyKey,
}) {
  if (actor?.role !== 'admin') {
    throw new ModerationDecisionError(403, 'admin_role_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'moderation.review.claim');
  const locked = await client.query(
    `SELECT review.*, decision.issued_by AS original_issued_by
       FROM moderation_review_requests AS review
       JOIN moderation_decisions AS decision ON decision.id = review.decision_id
      WHERE review.id::text = $1
      FOR UPDATE OF review`,
    [reviewRequestId],
  );
  if (!locked.rowCount) {
    throw new ModerationDecisionError(404, 'moderation_review_request_not_found');
  }
  const row = locked.rows[0];
  const replay = await client.query(
    `SELECT review_request_id FROM moderation_review_events
      WHERE idempotency_key = $1`,
    [`${key}:event`],
  );
  if (replay.rowCount) {
    if (String(replay.rows[0].review_request_id) !== String(row.id)
        || row.status !== 'in_review' || row.assigned_to !== actor.id) {
      throw new ModerationDecisionError(409, 'moderation_review_claim_idempotency_conflict');
    }
    return { reviewRequest: reviewShape(row), replayed: true };
  }
  if (!row.original_issued_by || row.original_issued_by === actor.id) {
    throw new ModerationDecisionError(409, 'moderation_review_independent_reviewer_required');
  }
  if (row.status !== 'submitted') {
    throw new ModerationDecisionError(409, 'moderation_review_already_claimed');
  }
  const updated = await client.query(
    `UPDATE moderation_review_requests
        SET status = 'in_review', assigned_to = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [row.id, actor.id],
  );
  await client.query(
    `INSERT INTO moderation_review_events (
       review_request_id, actor_id, actor_role, event_type,
       from_status, to_status, note, idempotency_key
     ) VALUES ($1, $2, $3, 'assigned', 'submitted', 'in_review',
               'Independent human review claimed.', $4)`,
    [row.id, actor.id, actor.role, `${key}:event`],
  );
  await audit(client, {
    actor,
    action: 'moderation.review_claimed',
    resourceType: 'moderation_review_request',
    resourceId: row.id,
    metadata: { independentFromIssuer: true, automationRole: 'none' },
  });
  return { reviewRequest: reviewShape(updated.rows[0]), replayed: false };
}

export async function resolveModerationReviewRequest(client, {
  actor,
  reviewRequestId,
  raw,
  idempotencyKey,
  applyCorrection = null,
  now = null,
}) {
  if (actor.role !== 'admin') throw new ModerationDecisionError(403, 'admin_role_required');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDecisionError(400, 'moderation_review_resolution_invalid');
  }
  const status = text(raw.status, 30);
  if (!['upheld', 'modified', 'reversed'].includes(status)) {
    throw new ModerationDecisionError(400, 'moderation_review_resolution_status_invalid');
  }
  const userFacingReason = text(raw.userFacingReason ?? raw.resolution, 8000);
  if (userFacingReason.length < 3) {
    throw new ModerationDecisionError(400, 'moderation_review_resolution_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'moderation.review.resolve');
  const replay = await client.query(
    `SELECT review.*, decision.recipient_user_id,
            resolution.reviewer_id AS resolution_reviewer_id,
            resolution.id AS resolution_evidence_id,
            resolution.outcome AS resolution_outcome,
            resolution.user_facing_reason AS resolution_user_facing_reason,
            resolution.human_reviewed AS resolution_human_reviewed,
            resolution.independence_verified AS resolution_independence_verified,
            resolution.automation_role AS resolution_automation_role,
            resolution.measure_changed AS resolution_measure_changed,
            resolution.communicated_at AS resolution_communicated_at
       FROM moderation_review_resolutions AS resolution
       JOIN moderation_review_requests AS review
         ON review.id = resolution.review_request_id
       JOIN moderation_decisions AS decision ON decision.id = review.decision_id
      WHERE resolution.idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    if (String(replay.rows[0].id) !== String(reviewRequestId)
        || replay.rows[0].resolution_reviewer_id !== actor.id) {
      throw new ModerationDecisionError(
        409,
        'moderation_review_resolution_idempotency_conflict',
      );
    }
    return {
      reviewRequest: reviewShape(replay.rows[0]),
      replayed: true,
      measureChanged: replay.rows[0].resolution_measure_changed === true,
      affectedUserId: replay.rows[0].recipient_user_id,
    };
  }
  const locked = await client.query(
    `SELECT review.*, decision.recipient_user_id, decision.target_type,
            decision.target_id, decision.measure_type, decision.measure_state,
            decision.facts, decision.basis, decision.reasoning,
            decision.issued_by AS original_issued_by,
            decision.idempotency_key AS original_idempotency_key,
            decision.created_at AS decision_created_at,
            transaction_timestamp() AS resolution_time
       FROM moderation_review_requests AS review
       JOIN moderation_decisions AS decision ON decision.id = review.decision_id
      WHERE review.id::text = $1
      FOR UPDATE OF review`,
    [reviewRequestId],
  );
  if (!locked.rowCount) throw new ModerationDecisionError(404, 'moderation_review_request_not_found');
  const row = locked.rows[0];
  if (row.status !== 'in_review') {
    throw new ModerationDecisionError(409, 'moderation_review_already_resolved');
  }
  if (row.assigned_to !== actor.id || row.original_issued_by === actor.id) {
    throw new ModerationDecisionError(409, 'moderation_review_independent_reviewer_required');
  }
  const resolvedAt = now ?? row.resolution_time ?? new Date();
  let correction = null;
  if (status === 'upheld') {
    if (raw.correction != null) {
      throw new ModerationDecisionError(400, 'moderation_review_correction_forbidden');
    }
  } else {
    if (typeof applyCorrection !== 'function') {
      throw new ModerationDecisionError(409, 'moderation_review_correction_unavailable');
    }
    correction = await applyCorrection(client, {
      actor,
      outcome: status,
      originalDecision: {
        id: row.decision_id,
        recipientUserId: row.recipient_user_id,
        targetType: row.target_type,
        targetId: row.target_id,
        measureType: row.measure_type,
        measureState: row.measure_state,
        idempotencyKey: row.original_idempotency_key,
        createdAt: row.decision_created_at,
      },
      raw: raw.correction,
      idempotencyKey: `${key}:correction`,
      issuedAt: resolvedAt,
    });
    if (!correction?.correctionDecisionId || correction.measureChanged !== true) {
      throw new ModerationDecisionError(409, 'moderation_review_correction_not_applied');
    }
  }
  const resolutionEvidence = await client.query(
    `INSERT INTO moderation_review_resolutions (
       review_request_id, original_decision_id, outcome, reviewer_id,
       human_reviewed, independence_verified, automation_role,
       user_facing_reason, correction_decision_id, measure_changed,
       communicated_at, idempotency_key, created_at
     ) VALUES (
       $1, $2, $3, $4, true, true, 'none', $5, $6, $7, $8, $9, $8
     ) RETURNING *`,
    [
      row.id,
      row.decision_id,
      status,
      actor.id,
      userFacingReason,
      correction?.correctionDecisionId ?? null,
      correction?.measureChanged === true,
      resolvedAt,
      key,
    ],
  );
  const updated = await client.query(
    `UPDATE moderation_review_requests
        SET status = $2, resolution = $3, resolved_by = $4,
            resolved_at = $5, updated_at = $5
      WHERE id = $1 RETURNING *`,
    [row.id, status, userFacingReason, actor.id, resolvedAt],
  );
  await client.query(
    `INSERT INTO moderation_review_events (
       review_request_id, actor_id, actor_role, event_type,
       from_status, to_status, note, idempotency_key
     ) VALUES ($1, $2, $3, 'resolved', $4, $5, $6, $7)`,
    [
      row.id,
      actor.id,
      actor.role,
      row.status,
      status,
      userFacingReason,
      `${key}:event`,
    ],
  );
  await audit(client, {
    actor,
    action: 'moderation.review_resolved',
    resourceType: 'moderation_review_request',
    resourceId: row.id,
    metadata: {
      status,
      measureChanged: correction?.measureChanged === true,
      correctionDecisionId: correction?.correctionDecisionId ?? null,
      independentFromIssuer: true,
      automationRole: 'none',
    },
  });
  const evidence = resolutionEvidence.rows[0];
  return {
    reviewRequest: reviewShape({
      ...updated.rows[0],
      resolution_evidence_id: evidence.id,
      resolution_outcome: evidence.outcome,
      resolution_user_facing_reason: evidence.user_facing_reason,
      resolution_human_reviewed: evidence.human_reviewed,
      resolution_independence_verified: evidence.independence_verified,
      resolution_automation_role: evidence.automation_role,
      resolution_measure_changed: evidence.measure_changed,
      resolution_communicated_at: evidence.communicated_at,
    }),
    replayed: false,
    measureChanged: correction?.measureChanged === true,
    correction: correction
      ? Object.freeze({
          decisionId: correction.correctionDecisionId,
          targetType: correction.targetType,
          targetId: correction.targetId,
          targetState: correction.targetState,
        })
      : null,
    affectedUserId: row.recipient_user_id,
  };
}

export async function setPrivateMarketplaceReviewStatus(client, {
  actor,
  userId,
  raw,
  idempotencyKey,
  issuedAt = new Date(),
}) {
  if (actor.role !== 'admin') throw new ModerationDecisionError(403, 'admin_role_required');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDecisionError(400, 'private_marketplace_review_invalid');
  }
  const status = text(raw.status, 30);
  if (!['clear', 'review_required', 'blocked'].includes(status)) {
    throw new ModerationDecisionError(400, 'private_marketplace_review_status_invalid');
  }
  const reasonCode = text(raw.reasonCode, 120).toLowerCase();
  if (!/^[a-z0-9_.:-]{3,120}$/u.test(reasonCode)) {
    throw new ModerationDecisionError(400, 'private_marketplace_review_reason_required');
  }
  const key = moderationIdempotencyKey(idempotencyKey, 'private.marketplace.review');
  const replay = await client.query(
    `SELECT user_id, to_status
       FROM private_marketplace_review_events
      WHERE idempotency_key = $1`,
    [key],
  );
  const target = await client.query(
    `SELECT id, role, private_marketplace_review_status
       FROM users WHERE id = $1 AND deactivated_at IS NULL FOR UPDATE`,
    [userId],
  );
  if (!target.rowCount) throw new ModerationDecisionError(404, 'user_not_found');
  if (target.rows[0].role !== 'user') {
    throw new ModerationDecisionError(409, 'staff_private_marketplace_review_forbidden');
  }
  if (replay.rowCount) {
    return {
      userId: replay.rows[0].user_id,
      status: replay.rows[0].to_status,
      replayed: true,
    };
  }
  if (target.rows[0].private_marketplace_review_status === status) {
    throw new ModerationDecisionError(409, 'private_marketplace_review_status_unchanged');
  }
  await client.query(
    'UPDATE users SET private_marketplace_review_status = $2 WHERE id = $1',
    [userId, status],
  );
  await client.query(
    `INSERT INTO private_marketplace_review_events (
       user_id, actor_id, actor_role, from_status, to_status,
       reason_code, note, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      actor.id,
      actor.role,
      target.rows[0].private_marketplace_review_status,
      status,
      reasonCode,
      text(raw.note, 8000) || null,
      key,
    ],
  );
  const decision = await persistModerationDecision(client, {
    actor,
    recipientUserId: userId,
    reportId: text(raw.reportId, 80) || null,
    targetType: 'user',
    targetId: userId,
    measureType: status === 'clear' ? 'measure_reversal' : 'private_marketplace_review',
    measureState: status,
    raw: raw.decision,
    idempotencyKey: `${key}:decision`,
    issuedAt,
    expectedStatement: {
      durationType: status === 'clear' ? 'not_applicable' : 'until_reversed',
      endsAt: null,
    },
  });
  await audit(client, {
    actor,
    action: 'moderation.private_marketplace_review_changed',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      from: target.rows[0].private_marketplace_review_status,
      to: status,
      reasonCode,
    },
  });
  return { userId, status, decision: decision.decision, replayed: false };
}
