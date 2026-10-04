import crypto from 'node:crypto';

import {
  ModerationDomainError,
  moderationIdempotencyKey,
} from './moderation_domain.js';
import { persistModerationDecision } from './moderation_decision_workflow.js';
import {
  approvedAccountMeasureNotice,
  normalizeAccountSuspensionProposalReview,
  normalizePermanentAccountSuspensionProposal,
  shapeAccountSuspensionProposal,
} from './moderation_account_measure_domain.js';

export class ModerationAccountMeasureError extends ModerationDomainError {}

function text(value, maximum = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
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

async function lockActiveUserTarget(client, userId, changedCode) {
  const target = await client.query(
    `SELECT id, role, account_status, deactivated_at
       FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  if (!target.rowCount) throw new ModerationAccountMeasureError(404, 'user_not_found');
  if (target.rows[0].role !== 'user') {
    throw new ModerationAccountMeasureError(409, 'staff_suspension_requires_emergency_process');
  }
  if (target.rows[0].deactivated_at || target.rows[0].account_status !== 'active') {
    throw new ModerationAccountMeasureError(409, changedCode);
  }
  return target.rows[0];
}

async function assertNoActiveAccountSuspension(client, userId, changedCode) {
  const active = await client.query(
    `SELECT id FROM user_suspensions
      WHERE user_id = $1 AND scope = 'account' AND lifted_at IS NULL
        AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      LIMIT 1`,
    [userId],
  );
  if (active.rowCount) throw new ModerationAccountMeasureError(409, changedCode);
}

export async function proposePermanentAccountSuspension(client, {
  actor,
  userId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new ModerationAccountMeasureError(403, 'admin_role_required');
  }
  if (actor.id === userId) throw new ModerationAccountMeasureError(400, 'cannot_suspend_self');
  const key = moderationIdempotencyKey(
    idempotencyKey,
    'account.suspension.proposal.create',
  );
  const input = normalizePermanentAccountSuspensionProposal(raw, userId);
  const replay = await client.query(
    `SELECT * FROM moderation_account_suspension_proposals
      WHERE proposal_idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    if (replay.rows[0].user_id !== userId
        || replay.rows[0].proposed_by !== actor.id
        || canonicalJson(replay.rows[0].payload) !== canonicalJson(input.payload)) {
      throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_idempotency_conflict');
    }
    return { proposal: shapeAccountSuspensionProposal(replay.rows[0]), replayed: true };
  }
  const issuedAt = new Date(now);
  if (!Number.isFinite(issuedAt.getTime())) {
    throw new ModerationAccountMeasureError(400, 'account_suspension_proposal_time_invalid');
  }
  await lockActiveUserTarget(client, userId, 'suspension_target_not_active');
  await assertNoActiveAccountSuspension(
    client,
    userId,
    'account_suspension_already_active',
  );
  if (input.reportId) {
    const report = await client.query(
      'SELECT id FROM reports WHERE id::text = $1',
      [input.reportId],
    );
    if (!report.rowCount) throw new ModerationAccountMeasureError(404, 'report_not_found');
  }
  const concurrentReplay = await client.query(
    `SELECT * FROM moderation_account_suspension_proposals
      WHERE proposal_idempotency_key = $1`,
    [key],
  );
  if (concurrentReplay.rowCount) {
    if (concurrentReplay.rows[0].user_id !== userId
        || concurrentReplay.rows[0].proposed_by !== actor.id
        || canonicalJson(concurrentReplay.rows[0].payload) !== canonicalJson(input.payload)) {
      throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_idempotency_conflict');
    }
    return {
      proposal: shapeAccountSuspensionProposal(concurrentReplay.rows[0]),
      replayed: true,
    };
  }
  const pending = await client.query(
    `SELECT id FROM moderation_account_suspension_proposals
      WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
  if (pending.rowCount) {
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_pending');
  }
  const inserted = await client.query(
    `INSERT INTO moderation_account_suspension_proposals (
       user_id, proposed_by, report_id, payload, proposal_idempotency_key,
       created_at, updated_at
     ) VALUES ($1, $2, $3::uuid, $4::jsonb, $5, $6, $6)
     RETURNING *`,
    [userId, actor.id, input.reportId, JSON.stringify(input.payload), key, issuedAt],
  );
  await audit(client, {
    actor,
    action: 'moderation.account_suspension_proposed',
    resourceType: 'moderation_account_suspension_proposal',
    resourceId: inserted.rows[0].id,
    metadata: {
      userId,
      reportId: input.reportId,
      payloadSha256: inserted.rows[0].payload_sha256,
      lockVersion: Number(inserted.rows[0].lock_version),
    },
  });
  return { proposal: shapeAccountSuspensionProposal(inserted.rows[0]), replayed: false };
}

export async function listPermanentAccountSuspensionProposals(client, {
  actor,
  status = 'pending',
} = {}) {
  if (actor?.role !== 'admin') {
    throw new ModerationAccountMeasureError(403, 'admin_role_required');
  }
  const normalizedStatus = text(status, 20).toLowerCase() || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(normalizedStatus)) {
    throw new ModerationAccountMeasureError(400, 'account_suspension_proposal_status_invalid');
  }
  const result = await client.query(
    `SELECT * FROM moderation_account_suspension_proposals
      WHERE status = $1 ORDER BY created_at, id LIMIT 200`,
    [normalizedStatus],
  );
  return result.rows.map(shapeAccountSuspensionProposal);
}

function isExactReviewReplay(row, actor, key, review) {
  return row.review_idempotency_key === key
    && (row.approved_by ?? row.rejected_by) === actor.id
    && row.status === review.outcome
    && Number(row.lock_version) === review.expectedVersion + 1
    && row.payload_sha256 === review.expectedPayloadSha256;
}

async function replayReviewedProposal(client, row) {
  const replaySuspension = row.applied_suspension_id
    ? await client.query(
        'SELECT * FROM user_suspensions WHERE id = $1',
        [row.applied_suspension_id],
      )
    : { rows: [] };
  return {
    proposal: shapeAccountSuspensionProposal(row),
    suspension: replaySuspension.rows[0] ?? null,
    replayed: true,
  };
}

async function rejectProposal(client, { actor, row, review, key, reviewedAt }) {
  const rejected = await client.query(
    `UPDATE moderation_account_suspension_proposals
        SET status = 'rejected', rejected_by = $2, rejected_at = $3,
            rejection_reason = $4, review_idempotency_key = $5,
            lock_version = lock_version + 1, updated_at = $3
      WHERE id = $1 AND status = 'pending' AND lock_version = $6
      RETURNING *`,
    [row.id, actor.id, reviewedAt, review.rejectionReason, key, review.expectedVersion],
  );
  if (!rejected.rowCount) {
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_version_conflict');
  }
  await audit(client, {
    actor,
    action: 'moderation.account_suspension_proposal_rejected',
    resourceType: 'moderation_account_suspension_proposal',
    resourceId: row.id,
    metadata: {
      userId: row.user_id,
      payloadSha256: row.payload_sha256,
      expectedVersion: review.expectedVersion,
    },
  });
  return {
    proposal: shapeAccountSuspensionProposal(rejected.rows[0]),
    suspension: null,
    replayed: false,
  };
}

async function applyApprovedProposal(client, {
  actor,
  row,
  review,
  key,
  reviewedAt,
}) {
  const target = await lockActiveUserTarget(
    client,
    row.user_id,
    'account_suspension_target_state_changed',
  );
  await assertNoActiveAccountSuspension(
    client,
    row.user_id,
    'account_suspension_target_state_changed',
  );
  const suspensionId = crypto.randomUUID();
  const approved = await client.query(
    `UPDATE moderation_account_suspension_proposals
        SET status = 'approved', approved_by = $2, approved_at = $3,
            approval_payload_sha256 = payload_sha256,
            applied_suspension_id = $4, review_idempotency_key = $5,
            lock_version = lock_version + 1, updated_at = $3
      WHERE id = $1 AND status = 'pending' AND lock_version = $6
      RETURNING *`,
    [row.id, actor.id, reviewedAt, suspensionId, key, review.expectedVersion],
  );
  if (!approved.rowCount) {
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_version_conflict');
  }
  const payload = approved.rows[0].payload;
  const decision = await persistModerationDecision(client, {
    actor,
    recipientUserId: row.user_id,
    reportId: row.report_id,
    targetType: 'user',
    targetId: row.user_id,
    measureType: 'account_suspension',
    measureState: 'account',
    raw: payload.decision,
    idempotencyKey: `${key}:decision`,
    issuedAt: reviewedAt,
    expectedStatement: { durationType: 'until_reversed', endsAt: null },
    measureContext: {
      status: 'approved',
      noGuiltDetermination: true,
      userFacingNotice: approvedAccountMeasureNotice,
      accountSuspensionProposalId: row.id,
    },
  });
  const inserted = await client.query(
    `INSERT INTO user_suspensions (
       id, user_id, imposed_by, scope, reason_code, note, ends_at, report_id,
       idempotency_key, measure_status, no_guilt_determination,
       user_facing_notice, account_suspension_proposal_id,
       moderation_decision_id, starts_at, created_at
     ) VALUES (
       $1, $2, $3, 'account', $4, $5, NULL, $6::uuid,
       $7, 'approved', true, $8, $9, $10, $11, $11
     ) RETURNING *`,
    [
      suspensionId,
      row.user_id,
      actor.id,
      payload.reasonCode,
      payload.note,
      row.report_id,
      `${key}:suspension`,
      approvedAccountMeasureNotice,
      row.id,
      decision.decision.id,
      reviewedAt,
    ],
  );
  await client.query('UPDATE users SET account_status = \'suspended\' WHERE id = $1', [row.user_id]);
  await client.query(
    `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, $2),
       revoked_reason = 'account_suspended' WHERE user_id = $1`,
    [row.user_id, reviewedAt],
  );
  await client.query(
    `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, $2),
       revoked_reason = 'account_suspended' WHERE user_id = $1`,
    [row.user_id, reviewedAt],
  );
  await client.query(
    `INSERT INTO moderation_actions (
       report_id, actor_id, actor_role, action_type, target_type, target_id,
       reason_code, before_state, after_state, idempotency_key
     ) VALUES ($1::uuid, $2, $3, 'user_suspended', 'user', $4, $5,
       $6::jsonb, $7::jsonb, $8)`,
    [
      row.report_id,
      actor.id,
      actor.role,
      row.user_id,
      payload.reasonCode,
      JSON.stringify({ accountStatus: target.account_status }),
      JSON.stringify({
        scope: 'account',
        endsAt: null,
        measureStatus: 'approved',
        noGuiltDetermination: true,
        proposalId: row.id,
        payloadSha256: row.payload_sha256,
      }),
      `${key}:action`,
    ],
  );
  if (row.report_id) {
    await client.query(
      `INSERT INTO moderation_case_events (
         report_id, actor_id, actor_role, event_type, note, metadata,
         idempotency_key
       ) VALUES ($1, $2, $3, 'moderation_action', $4, $5::jsonb, $6)`,
      [
        row.report_id,
        actor.id,
        actor.role,
        payload.note,
        JSON.stringify({
          scope: 'account',
          userId: row.user_id,
          measureStatus: 'approved',
          proposalId: row.id,
          payloadSha256: row.payload_sha256,
        }),
        `${key}:event`,
      ],
    );
  }
  await audit(client, {
    actor,
    action: 'moderation.account_suspension_proposal_approved',
    resourceType: 'moderation_account_suspension_proposal',
    resourceId: row.id,
    metadata: {
      userId: row.user_id,
      suspensionId,
      payloadSha256: row.payload_sha256,
      expectedVersion: review.expectedVersion,
    },
  });
  await audit(client, {
    actor,
    action: 'moderation.user_suspended',
    resourceType: 'user',
    resourceId: row.user_id,
    metadata: {
      scope: 'account',
      reportId: row.report_id,
      endsAt: null,
      measureStatus: 'approved',
      noGuiltDetermination: true,
      proposalId: row.id,
    },
  });
  return {
    proposal: shapeAccountSuspensionProposal(approved.rows[0]),
    suspension: inserted.rows[0],
    decision: decision.decision,
    replayed: false,
  };
}

export async function reviewPermanentAccountSuspensionProposal(client, {
  actor,
  proposalId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new ModerationAccountMeasureError(403, 'admin_role_required');
  }
  const key = moderationIdempotencyKey(
    idempotencyKey,
    'account.suspension.proposal.review',
  );
  const review = normalizeAccountSuspensionProposalReview(raw);
  const reviewedAt = new Date(now);
  if (!Number.isFinite(reviewedAt.getTime())) {
    throw new ModerationAccountMeasureError(400, 'account_suspension_proposal_time_invalid');
  }
  const locked = await client.query(
    `SELECT * FROM moderation_account_suspension_proposals
      WHERE id::text = $1 FOR UPDATE`,
    [proposalId],
  );
  if (!locked.rowCount) {
    throw new ModerationAccountMeasureError(404, 'account_suspension_proposal_not_found');
  }
  const row = locked.rows[0];
  if (row.status !== 'pending') {
    if (isExactReviewReplay(row, actor, key, review)) {
      return replayReviewedProposal(client, row);
    }
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_review_final');
  }
  if (row.proposed_by === actor.id) {
    throw new ModerationAccountMeasureError(403, 'account_suspension_four_eyes_required');
  }
  if (Number(row.lock_version) !== review.expectedVersion) {
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_version_conflict');
  }
  if (row.payload_sha256 !== review.expectedPayloadSha256) {
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_payload_changed');
  }
  if (reviewedAt < new Date(row.updated_at)) {
    throw new ModerationAccountMeasureError(409, 'account_suspension_proposal_time_invalid');
  }
  if (review.outcome === 'rejected') {
    return rejectProposal(client, { actor, row, review, key, reviewedAt });
  }
  return applyApprovedProposal(client, { actor, row, review, key, reviewedAt });
}
