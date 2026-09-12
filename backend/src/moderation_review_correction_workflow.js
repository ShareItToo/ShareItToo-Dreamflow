import {
  ModerationDecisionError,
  setPrivateMarketplaceReviewStatus,
} from './moderation_decision_workflow.js';
import {
  liftUserSuspension,
  setListingModeration,
} from './moderation_workflow.js';

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ModerationDecisionError(400, code);
  }
  return value;
}

function text(value, maximum = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function requireHumanCorrectionDecision(raw) {
  const decision = object(raw, 'moderation_review_correction_decision_required');
  const statement = object(
    decision.statementOfReasons,
    'moderation_review_correction_statement_required',
  );
  if (text(decision.detectionMethod, 30) !== 'human'
      || decision.automatedMeans != null
      || text(statement.automationRole, 60) !== 'none') {
    throw new ModerationDecisionError(
      400,
      'moderation_review_correction_human_only',
    );
  }
  return decision;
}

async function requireOriginalDecisionStillCurrent(client, {
  originalDecision,
  restrictionMeasureType,
  reversalState,
}) {
  const superseded = await client.query(
    `SELECT newer.id
       FROM moderation_decisions AS original
       JOIN moderation_decisions AS newer
         ON newer.recipient_user_id = original.recipient_user_id
        AND newer.target_type = original.target_type
        AND newer.target_id = original.target_id
      WHERE original.id = $1
        AND newer.id <> original.id
        AND newer.created_at >= original.created_at
        AND (newer.measure_type = $2
          OR (newer.measure_type = 'measure_reversal' AND newer.measure_state = $3))
      LIMIT 1`,
    [originalDecision.id, restrictionMeasureType, reversalState],
  );
  if (superseded.rowCount) {
    throw new ModerationDecisionError(409, 'moderation_review_measure_state_changed');
  }
}

async function applyListingCorrection(client, {
  actor,
  outcome,
  originalDecision,
  candidate,
  decision,
  idempotencyKey,
  issuedAt,
}) {
  if (originalDecision.targetType !== 'listing'
      || originalDecision.measureType !== 'listing_restriction') {
    throw new ModerationDecisionError(409, 'moderation_review_correction_target_mismatch');
  }
  const current = await client.query(
    'SELECT moderation_status FROM listings WHERE id = $1 FOR UPDATE',
    [originalDecision.targetId],
  );
  if (!current.rowCount) {
    throw new ModerationDecisionError(404, 'listing_not_found');
  }
  if (current.rows[0].moderation_status !== originalDecision.measureState) {
    throw new ModerationDecisionError(409, 'moderation_review_measure_state_changed');
  }
  await requireOriginalDecisionStillCurrent(client, {
    originalDecision,
    restrictionMeasureType: 'listing_restriction',
    reversalState: 'active',
  });
  const targetStatus = text(candidate.targetStatus, 30);
  if (outcome === 'reversed' && targetStatus !== 'active') {
    throw new ModerationDecisionError(400, 'moderation_review_reversal_target_invalid');
  }
  if (outcome === 'modified'
      && (!['hidden', 'removed'].includes(targetStatus)
        || targetStatus === originalDecision.measureState)) {
    throw new ModerationDecisionError(400, 'moderation_review_modified_target_invalid');
  }
  const result = await setListingModeration(client, {
    actor,
    listingId: originalDecision.targetId,
    raw: {
      status: targetStatus,
      reasonCode: text(candidate.reasonCode, 120) || 'moderation_review_correction',
      note: text(candidate.note, 8000) || null,
      decision,
    },
    idempotencyKey,
    issuedAt,
  });
  return Object.freeze({
    correctionDecisionId: result.decision?.id,
    measureChanged: true,
    targetType: originalDecision.targetType,
    targetId: originalDecision.targetId,
    targetState: targetStatus,
  });
}

async function applyPrivateMarketplaceCorrection(client, {
  actor,
  outcome,
  originalDecision,
  candidate,
  decision,
  idempotencyKey,
  issuedAt,
}) {
  if (originalDecision.targetType !== 'user'
      || originalDecision.measureType !== 'private_marketplace_review') {
    throw new ModerationDecisionError(409, 'moderation_review_correction_target_mismatch');
  }
  const current = await client.query(
    `SELECT private_marketplace_review_status
       FROM users WHERE id = $1 AND deactivated_at IS NULL FOR UPDATE`,
    [originalDecision.targetId],
  );
  if (!current.rowCount) throw new ModerationDecisionError(404, 'user_not_found');
  if (current.rows[0].private_marketplace_review_status !== originalDecision.measureState) {
    throw new ModerationDecisionError(409, 'moderation_review_measure_state_changed');
  }
  await requireOriginalDecisionStillCurrent(client, {
    originalDecision,
    restrictionMeasureType: 'private_marketplace_review',
    reversalState: 'clear',
  });
  const targetStatus = text(candidate.targetStatus, 30);
  if (outcome === 'reversed' && targetStatus !== 'clear') {
    throw new ModerationDecisionError(400, 'moderation_review_reversal_target_invalid');
  }
  if (outcome === 'modified'
      && (!['review_required', 'blocked'].includes(targetStatus)
        || targetStatus === originalDecision.measureState)) {
    throw new ModerationDecisionError(400, 'moderation_review_modified_target_invalid');
  }
  const result = await setPrivateMarketplaceReviewStatus(client, {
    actor,
    userId: originalDecision.targetId,
    raw: {
      status: targetStatus,
      reasonCode: text(candidate.reasonCode, 120) || 'moderation_review_correction',
      note: text(candidate.note, 8000) || null,
      decision,
    },
    idempotencyKey,
    issuedAt,
  });
  return Object.freeze({
    correctionDecisionId: result.decision?.id,
    measureChanged: true,
    targetType: originalDecision.targetType,
    targetId: originalDecision.targetId,
    targetState: targetStatus,
  });
}

async function applySuspensionReversal(client, {
  actor,
  outcome,
  originalDecision,
  candidate,
  decision,
  idempotencyKey,
  issuedAt,
}) {
  if (originalDecision.targetType !== 'user'
      || !['account_suspension', 'scope_suspension'].includes(originalDecision.measureType)) {
    throw new ModerationDecisionError(409, 'moderation_review_correction_target_mismatch');
  }
  if (outcome !== 'reversed') {
    throw new ModerationDecisionError(409, 'moderation_review_modified_suspension_unsupported');
  }
  const suspension = await client.query(
    `SELECT * FROM user_suspensions
      WHERE ('moderation.decision:' || idempotency_key || ':decision') = $1
        AND user_id = $2 AND scope = $3
      FOR UPDATE`,
    [
      originalDecision.idempotencyKey,
      originalDecision.targetId,
      originalDecision.measureState,
    ],
  );
  if (suspension.rowCount !== 1 || suspension.rows[0].lifted_at
      || (suspension.rows[0].ends_at
        && new Date(suspension.rows[0].ends_at) <= new Date(issuedAt ?? Date.now()))) {
    throw new ModerationDecisionError(409, 'moderation_review_measure_state_changed');
  }
  const result = await liftUserSuspension(client, {
    actor,
    suspensionId: suspension.rows[0].id,
    raw: {
      reasonCode: text(candidate.reasonCode, 120) || 'moderation_review_correction',
      note: text(candidate.note, 8000) || null,
      decision,
    },
    idempotencyKey,
    issuedAt,
  });
  return Object.freeze({
    correctionDecisionId: result.decision?.id,
    measureChanged: true,
    targetType: originalDecision.targetType,
    targetId: originalDecision.targetId,
    targetState: `suspension_lifted:${suspension.rows[0].scope}`,
  });
}

export async function applyModerationReviewCorrection(client, {
  actor,
  outcome,
  originalDecision,
  raw,
  idempotencyKey,
  issuedAt,
}) {
  if (actor?.role !== 'admin') {
    throw new ModerationDecisionError(403, 'admin_role_required');
  }
  const candidate = object(raw, 'moderation_review_correction_required');
  const decision = requireHumanCorrectionDecision(candidate.decision);
  if (originalDecision.measureType === 'listing_restriction') {
    return applyListingCorrection(client, {
      actor,
      outcome,
      originalDecision,
      candidate,
      decision,
      idempotencyKey,
      issuedAt,
    });
  }
  if (originalDecision.measureType === 'private_marketplace_review') {
    return applyPrivateMarketplaceCorrection(client, {
      actor,
      outcome,
      originalDecision,
      candidate,
      decision,
      idempotencyKey,
      issuedAt,
    });
  }
  if (['account_suspension', 'scope_suspension'].includes(originalDecision.measureType)) {
    return applySuspensionReversal(client, {
      actor,
      outcome,
      originalDecision,
      candidate,
      decision,
      idempotencyKey,
      issuedAt,
    });
  }
  throw new ModerationDecisionError(409, 'moderation_review_correction_unsupported');
}
