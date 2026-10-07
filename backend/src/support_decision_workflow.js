import crypto from 'node:crypto';

import { SupportCaseError } from './support_case_domain.js';
import { isSupportSafetyImpactCase } from './support_safety_impact_domain.js';
import {
  normalizeSupportDecisionCommunication,
  normalizeSupportDecisionImplementation,
  normalizeSupportDecisionInput,
  normalizeSupportDecisionReview,
  supportDecisionIdempotencyKey,
} from './support_decision_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function shapeDecision(row) {
  return Object.freeze({
    id: row.id,
    caseId: row.case_id,
    decisionCode: row.decision_code,
    decisionScope: row.decision_scope,
    confirmedFactsConsidered: row.confirmed_facts_considered ?? [],
    materialUncertainties: row.material_uncertainties ?? [],
    policySnapshotId: row.policy_snapshot_id,
    ruleReference: row.rule_reference,
    measureType: row.measure_type,
    amountMinor: row.amount_minor === null ? null : Number(row.amount_minor),
    currency: row.currency ?? null,
    duration: row.duration ?? null,
    affectedEntityIds: row.affected_entity_ids ?? [],
    unaffectedAreas: row.unaffected_areas ?? [],
    implementationPlan: row.implementation_plan,
    automationUsed: row.automation_used === true,
    recommendationId: row.recommendation_id ?? null,
    proposedBy: row.decided_by,
    approvedBy: row.approved_by ?? null,
    rejectedBy: row.rejected_by ?? null,
    rejectionReason: row.rejection_reason ?? null,
    userFacingDecision: row.user_facing_decision ?? null,
    userFacingEffect: row.user_facing_effect ?? null,
    userFacingReason: row.user_facing_reason,
    userFacingImplementationResult: row.user_facing_implementation_result ?? null,
    internalReason: row.internal_reason,
    redressRoute: row.redress_route,
    approvalPath: row.approval_path ?? 'separate_review',
    approvalStatus: row.approval_status,
    implementationStatus: row.implementation_status,
    implementationReference: row.implementation_reference ?? null,
    implementationVerifiedBy: row.implementation_verified_by ?? null,
    implementationFailureReason: row.implementation_failure_reason ?? null,
    communicatedBy: row.communicated_by ?? null,
    communicationPayloadSha256: row.communication_payload_sha256 ?? null,
    payloadSha256: row.payload_sha256,
    version: Number(row.lock_version),
    proposedAt: iso(row.decided_at),
    approvedAt: iso(row.approved_at),
    rejectedAt: iso(row.rejected_at),
    implementedAt: iso(row.implemented_at),
    implementationVerifiedAt: iso(row.implementation_verified_at),
    communicatedAt: iso(row.communicated_at),
    updatedAt: iso(row.updated_at),
  });
}

async function audit(client, {
  actor,
  action,
  resourceId,
  resourceType = 'support_decision',
  metadata = {},
}) {
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
}

async function event(client, {
  caseId,
  actor,
  eventType,
  entityId,
  payload,
  idempotencyKey,
  now,
}) {
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, $2, $3, $4, 'support_decision', $5,
       $6::jsonb, false, 'internal', $7, 'sit-api', $8
     )`,
    [
      caseId,
      eventType,
      actor.role,
      actor.id,
      entityId,
      JSON.stringify(payload),
      idempotencyKey,
      now,
    ],
  );
}

async function assertCurrentSafetyImpactScope(client, { caseRow, input }) {
  if (!isSupportSafetyImpactCase(caseRow)) return;
  const latest = await client.query(
    `SELECT * FROM support_safety_impact_reviews
      WHERE case_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [caseRow.id],
  );
  const review = latest.rows[0];
  if (!review
      || Number(review.case_version) !== Number(caseRow.lock_version)
      || input.recommendationId !== review.id) {
    throw new SupportCaseError(409, 'support_safety_impact_review_required');
  }
  const currentListing = await client.query(
    `SELECT status, is_active, moderation_status
       FROM listings
      WHERE id = $1`,
    [caseRow.linked_listing_id],
  );
  const listingSnapshot = review.impact_snapshot?.listing;
  const listingRow = currentListing.rows[0];
  if (!listingRow
      || listingSnapshot?.status !== listingRow.status
      || listingSnapshot?.isActive !== (listingRow.is_active === true)
      || listingSnapshot?.moderationStatus !== listingRow.moderation_status) {
    throw new SupportCaseError(409, 'support_safety_impact_review_stale');
  }
  const currentBookings = await client.query(
    `SELECT id FROM bookings
      WHERE listing_id = $1
        AND workflow_status IN (
          'requested', 'accepted', 'payment_pending', 'confirmed', 'active',
          'withdrawalReturnRequired', 'returned', 'disputed'
        )
      ORDER BY id`,
    [caseRow.linked_listing_id],
  );
  const currentBookingIds = currentBookings.rows
    .map((row) => row.id)
    .sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(currentBookingIds)
      !== JSON.stringify(review.action_relevant_booking_ids ?? [])) {
    throw new SupportCaseError(409, 'support_safety_impact_review_stale');
  }
  const requiredEntities = [
    `listing:${caseRow.linked_listing_id}`,
    ...currentBookingIds.map((id) => `booking:${id}`),
  ];
  if (requiredEntities.some((id) => !input.affectedEntityIds.includes(id))
      || input.unaffectedAreas.length < 1
      || !['temporary_safety_review', 'moderation_review', 'no_measure']
        .includes(input.measureType)) {
    throw new SupportCaseError(409, 'support_safety_impact_proportional_scope_required');
  }
}

export async function createSupportDecisionDraft(client, {
  actor,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (!['support', 'admin'].includes(actor?.role)) {
    throw new SupportCaseError(403, 'support_decision_draft_forbidden');
  }
  const key = supportDecisionIdempotencyKey(idempotencyKey, 'support.decision.create');
  const replay = await client.query(
    `SELECT decision.*, support_case.current_owner_id AS case_current_owner_id
       FROM support_decisions AS decision
       JOIN support_cases AS support_case ON support_case.id = decision.case_id
      WHERE decision.idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    if (replay.rows[0].case_id !== caseId) {
      throw new SupportCaseError(409, 'support_decision_idempotency_scope_conflict');
    }
    if (actor.role === 'support' && replay.rows[0].case_current_owner_id !== actor.id) {
      throw new SupportCaseError(403, 'support_case_assignment_required');
    }
    return { decision: shapeDecision(replay.rows[0]), replayed: true };
  }
  const input = normalizeSupportDecisionInput(raw);
  const supportCase = await client.query(
    'SELECT * FROM support_cases WHERE id::text = $1 FOR UPDATE',
    [caseId],
  );
  if (!supportCase.rowCount) throw new SupportCaseError(404, 'support_case_not_found');
  const caseRow = supportCase.rows[0];
  if (actor.role === 'support' && caseRow.current_owner_id !== actor.id) {
    throw new SupportCaseError(403, 'support_case_assignment_required');
  }
  if (!['under_review', 'escalated'].includes(caseRow.status)) {
    throw new SupportCaseError(409, 'support_decision_case_status_invalid');
  }
  const directDecision = ['green_automatic', 'yellow_human_review']
    .includes(caseRow.approval_level);
  if (directDecision && actor.role !== 'admin') {
    throw new SupportCaseError(403, 'support_direct_decision_requires_admin');
  }
  await assertCurrentSafetyImpactScope(client, { caseRow, input });
  const concurrentReplay = await client.query(
    'SELECT * FROM support_decisions WHERE idempotency_key = $1',
    [key],
  );
  if (concurrentReplay.rowCount) {
    if (concurrentReplay.rows[0].case_id !== caseRow.id) {
      throw new SupportCaseError(409, 'support_decision_idempotency_scope_conflict');
    }
    return { decision: shapeDecision(concurrentReplay.rows[0]), replayed: true };
  }
  const openDecision = await client.query(
    `SELECT id FROM support_decisions
      WHERE case_id = $1
        AND approval_status IN ('pending', 'approved')
        AND implementation_status <> 'reversed'`,
    [caseRow.id],
  );
  if (openDecision.rowCount) {
    throw new SupportCaseError(409, 'support_decision_open_exists', {
      decisionId: openDecision.rows[0].id,
    });
  }
  const policy = await client.query(
    `SELECT id FROM support_policy_snapshots
      WHERE id = $1 AND effective_from <= $2`,
    [input.policySnapshotId, now],
  );
  if (!policy.rowCount) throw new SupportCaseError(409, 'support_policy_snapshot_unavailable');
  const id = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO support_decisions (
       id, case_id, decision_code, decision_scope,
       confirmed_facts_considered, material_uncertainties,
       policy_snapshot_id, rule_reference, measure_type, amount_minor,
       currency, duration, affected_entity_ids, unaffected_areas,
       implementation_plan, automation_used, recommendation_id,
       decided_by, approved_by, approved_at, approval_payload_sha256,
       user_facing_decision, user_facing_effect,
       user_facing_reason, user_facing_implementation_result, internal_reason,
       redress_route, implementation_status, idempotency_key,
       approval_status, approval_path, payload_sha256, lock_version,
       decided_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5::jsonb, $6::jsonb,
       $7, $8, $9, $10,
       $11, $12, $13, $14::jsonb,
       $15, false, $16,
       $17, $18, $19, $20, $21, $22,
       $23, $24, $25,
       $26, 'not_started', $27,
       $28, $29, $30, 1, $31, $31
     ) RETURNING *`,
    [
      id,
      caseRow.id,
      input.decisionCode,
      input.decisionScope,
      JSON.stringify(input.confirmedFactsConsidered),
      JSON.stringify(input.materialUncertainties),
      input.policySnapshotId,
      input.ruleReference,
      input.measureType,
      input.amountMinor,
      input.currency,
      input.duration,
      input.affectedEntityIds,
      JSON.stringify(input.unaffectedAreas),
      input.implementationPlan,
      input.recommendationId,
      actor.id,
      directDecision ? actor.id : null,
      directDecision ? now : null,
      directDecision ? input.payloadSha256 : null,
      input.userFacingDecision,
      input.userFacingEffect,
      input.userFacingReason,
      input.userFacingImplementationResult,
      input.internalReason,
      input.redressRoute,
      key,
      directDecision ? 'approved' : 'pending',
      directDecision ? 'direct_single_reviewer' : 'separate_review',
      input.payloadSha256,
      now,
    ],
  );
  await event(client, {
    caseId: caseRow.id,
    actor,
    eventType: directDecision ? 'decision.direct_approved' : 'decision.drafted',
    entityId: id,
    payload: {
      approvalLevel: caseRow.approval_level,
      approvalPath: directDecision ? 'direct_single_reviewer' : 'separate_review',
      payloadSha256: input.payloadSha256,
      implementationStatus: 'not_started',
    },
    idempotencyKey: `${key}:event`,
    now,
  });
  await audit(client, {
    actor,
    action: directDecision ? 'support.decision_direct_approved' : 'support.decision_drafted',
    resourceId: id,
    metadata: {
      caseId: caseRow.id,
      approvalLevel: caseRow.approval_level,
      approvalPath: directDecision ? 'direct_single_reviewer' : 'separate_review',
      payloadSha256: input.payloadSha256,
    },
  });
  return { decision: shapeDecision(inserted.rows[0]), replayed: false };
}

export async function reviewSupportDecision(client, {
  actor,
  caseId,
  decisionId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_decision_review_requires_admin');
  }
  const key = supportDecisionIdempotencyKey(idempotencyKey, 'support.decision.review');
  const replay = await client.query(
    `SELECT decision.* FROM support_case_events AS event
      JOIN support_decisions AS decision ON decision.id::text = event.entity_id
      WHERE event.case_id::text = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [caseId, decisionId, key],
  );
  if (replay.rowCount) return { decision: shapeDecision(replay.rows[0]), replayed: true };
  const review = normalizeSupportDecisionReview(raw);
  const locked = await client.query(
    `SELECT decision.*, support_case.approval_level, support_case.status AS case_status
       FROM support_decisions AS decision
       JOIN support_cases AS support_case ON support_case.id = decision.case_id
      WHERE decision.id::text = $1 AND support_case.id::text = $2
      FOR UPDATE OF decision`,
    [decisionId, caseId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_decision_not_found');
  const row = locked.rows[0];
  const concurrentReplay = await client.query(
    `SELECT decision.* FROM support_case_events AS event
      JOIN support_decisions AS decision ON decision.id::text = event.entity_id
      WHERE event.case_id = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [row.case_id, String(row.id), key],
  );
  if (concurrentReplay.rowCount) {
    return { decision: shapeDecision(concurrentReplay.rows[0]), replayed: true };
  }
  if (row.case_status !== 'decision_pending_approval') {
    throw new SupportCaseError(409, 'support_decision_case_not_pending_approval');
  }
  if (row.approval_status !== 'pending') {
    throw new SupportCaseError(409, 'support_decision_review_final');
  }
  if (Number(row.lock_version) !== review.expectedVersion) {
    throw new SupportCaseError(409, 'support_decision_version_conflict');
  }
  if (row.payload_sha256 !== review.expectedPayloadSha256) {
    throw new SupportCaseError(409, 'support_decision_payload_changed');
  }
  if (row.decided_by === actor.id) {
    throw new SupportCaseError(403, 'support_decision_four_eyes_required');
  }
  const updated = await client.query(
    `UPDATE support_decisions
        SET approval_status = $2,
            approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE NULL END,
            approved_at = CASE WHEN $2 = 'approved' THEN $4 ELSE NULL END,
            approval_payload_sha256 = CASE WHEN $2 = 'approved' THEN payload_sha256 ELSE NULL END,
            rejected_by = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
            rejected_at = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
            rejection_reason = CASE WHEN $2 = 'rejected' THEN $5 ELSE NULL END,
            lock_version = lock_version + 1,
            updated_at = $4
      WHERE id = $1 AND lock_version = $6 AND approval_status = 'pending'
      RETURNING *`,
    [row.id, review.outcome, actor.id, now, review.rejectionReason, review.expectedVersion],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_decision_version_conflict');
  await event(client, {
    caseId: row.case_id,
    actor,
    eventType: `decision.${review.outcome}`,
    entityId: row.id,
    payload: {
      outcome: review.outcome,
      payloadSha256: row.payload_sha256,
      expectedVersion: review.expectedVersion,
    },
    idempotencyKey: key,
    now,
  });
  await audit(client, {
    actor,
    action: `support.decision_${review.outcome}`,
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      payloadSha256: row.payload_sha256,
      expectedVersion: review.expectedVersion,
    },
  });
  return { decision: shapeDecision(updated.rows[0]), replayed: false };
}

export async function recordSupportDecisionImplementation(client, {
  actor,
  caseId,
  decisionId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_decision_implementation_requires_admin');
  }
  const key = supportDecisionIdempotencyKey(idempotencyKey, 'support.decision.implementation');
  const replay = await client.query(
    `SELECT decision.* FROM support_case_events AS event
      JOIN support_decisions AS decision ON decision.id::text = event.entity_id
      WHERE event.case_id::text = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [caseId, decisionId, key],
  );
  if (replay.rowCount) return { decision: shapeDecision(replay.rows[0]), replayed: true };
  const locked = await client.query(
    `SELECT decision.*, support_case.status AS case_status,
            support_case.operating_mode AS case_operating_mode
       FROM support_decisions AS decision
       JOIN support_cases AS support_case ON support_case.id = decision.case_id
      WHERE decision.id::text = $1 AND support_case.id::text = $2
      FOR UPDATE OF decision`,
    [decisionId, caseId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_decision_not_found');
  const row = locked.rows[0];
  const concurrentReplay = await client.query(
    `SELECT decision.* FROM support_case_events AS event
      JOIN support_decisions AS decision ON decision.id::text = event.entity_id
      WHERE event.case_id = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [row.case_id, String(row.id), key],
  );
  if (concurrentReplay.rowCount) {
    return { decision: shapeDecision(concurrentReplay.rows[0]), replayed: true };
  }
  if (row.approval_status !== 'approved') {
    throw new SupportCaseError(409, 'support_decision_not_approved');
  }
  if (!['simulation', 'internal_testing'].includes(row.case_operating_mode)) {
    throw new SupportCaseError(409, 'support_decision_live_implementation_forbidden');
  }
  if (row.case_status !== 'decided') {
    throw new SupportCaseError(409, 'support_decision_implementation_case_status_invalid');
  }
  const implementation = normalizeSupportDecisionImplementation(raw, row.implementation_status);
  if (Number(row.lock_version) !== implementation.expectedVersion) {
    throw new SupportCaseError(409, 'support_decision_version_conflict');
  }
  if (row.payload_sha256 !== implementation.expectedPayloadSha256) {
    throw new SupportCaseError(409, 'support_decision_payload_changed');
  }
  const verified = ['succeeded', 'failed', 'reversed'].includes(implementation.status);
  const updated = await client.query(
    `UPDATE support_decisions
        SET implementation_status = $2,
            implementation_reference = $3,
            implementation_failure_reason = $4,
            implementation_verified_by = CASE WHEN $5 THEN $6 ELSE NULL END,
            implementation_verified_at = CASE WHEN $5 THEN $7 ELSE NULL END,
            implemented_at = CASE WHEN $2 = 'succeeded' THEN $7 ELSE implemented_at END,
            lock_version = lock_version + 1,
            updated_at = $7
      WHERE id = $1 AND lock_version = $8
      RETURNING *`,
    [
      row.id,
      implementation.status,
      implementation.implementationReference,
      implementation.implementationFailureReason,
      verified,
      actor.id,
      now,
      implementation.expectedVersion,
    ],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_decision_version_conflict');
  await event(client, {
    caseId: row.case_id,
    actor,
    eventType: 'decision.implementation_recorded',
    entityId: row.id,
    payload: {
      implementationStatus: implementation.status,
      implementationReference: implementation.implementationReference,
      implementationFailureReason: implementation.implementationFailureReason,
      payloadSha256: row.payload_sha256,
      expectedVersion: implementation.expectedVersion,
      operatingMode: row.case_operating_mode,
    },
    idempotencyKey: key,
    now,
  });
  await audit(client, {
    actor,
    action: 'support.decision_implementation_recorded',
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      implementationStatus: implementation.status,
      operatingMode: row.case_operating_mode,
      expectedVersion: implementation.expectedVersion,
    },
  });
  return { decision: shapeDecision(updated.rows[0]), replayed: false };
}

export async function recordSupportDecisionCommunication(client, {
  actor,
  caseId,
  decisionId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_decision_communication_requires_admin');
  }
  const key = supportDecisionIdempotencyKey(idempotencyKey, 'support.decision.communication');
  const replay = await client.query(
    `SELECT decision.* FROM support_case_events AS event
      JOIN support_decisions AS decision ON decision.id::text = event.entity_id
      WHERE event.case_id::text = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [caseId, decisionId, key],
  );
  if (replay.rowCount) return { decision: shapeDecision(replay.rows[0]), replayed: true };
  const communication = normalizeSupportDecisionCommunication(raw);
  const locked = await client.query(
    `SELECT decision.*, support_case.status AS case_status,
            support_case.operating_mode AS case_operating_mode
       FROM support_decisions AS decision
       JOIN support_cases AS support_case ON support_case.id = decision.case_id
      WHERE decision.id::text = $1 AND support_case.id::text = $2
      FOR UPDATE OF decision`,
    [decisionId, caseId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_decision_not_found');
  const row = locked.rows[0];
  const concurrentReplay = await client.query(
    `SELECT decision.* FROM support_case_events AS event
      JOIN support_decisions AS decision ON decision.id::text = event.entity_id
      WHERE event.case_id = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [row.case_id, String(row.id), key],
  );
  if (concurrentReplay.rowCount) {
    return { decision: shapeDecision(concurrentReplay.rows[0]), replayed: true };
  }
  if (row.communicated_at) {
    throw new SupportCaseError(409, 'support_decision_communication_final');
  }
  if (row.approval_status !== 'approved'
      || row.approval_payload_sha256 !== row.payload_sha256) {
    throw new SupportCaseError(409, 'support_decision_not_approved');
  }
  if (row.implementation_status !== 'succeeded'
      || !row.implementation_verified_by
      || !row.implementation_verified_at) {
    throw new SupportCaseError(409, 'support_decision_implementation_not_verified');
  }
  if (!['simulation', 'internal_testing'].includes(row.case_operating_mode)) {
    throw new SupportCaseError(409, 'support_decision_live_communication_forbidden');
  }
  if (row.case_status !== 'decided') {
    throw new SupportCaseError(409, 'support_decision_communication_case_status_invalid');
  }
  if (new Date(row.implemented_at).getTime() > now.getTime()) {
    throw new SupportCaseError(409, 'support_decision_communication_time_invalid');
  }
  if (Number(row.lock_version) !== communication.expectedVersion) {
    throw new SupportCaseError(409, 'support_decision_version_conflict');
  }
  if (row.payload_sha256 !== communication.expectedPayloadSha256) {
    throw new SupportCaseError(409, 'support_decision_payload_changed');
  }
  const updated = await client.query(
    `UPDATE support_decisions
        SET communicated_at = $2,
            communicated_by = $3,
            communication_payload_sha256 = payload_sha256,
            lock_version = lock_version + 1,
            updated_at = $2
      WHERE id = $1 AND lock_version = $4 AND communicated_at IS NULL
      RETURNING *`,
    [row.id, now, actor.id, communication.expectedVersion],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_decision_version_conflict');
  await event(client, {
    caseId: row.case_id,
    actor,
    eventType: 'decision.communicated',
    entityId: row.id,
    payload: {
      payloadSha256: row.payload_sha256,
      expectedVersion: communication.expectedVersion,
      operatingMode: row.case_operating_mode,
      externalMessageSent: false,
    },
    idempotencyKey: key,
    now,
  });
  await audit(client, {
    actor,
    action: 'support.decision_communicated',
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      payloadSha256: row.payload_sha256,
      expectedVersion: communication.expectedVersion,
      operatingMode: row.case_operating_mode,
      externalMessageSent: false,
    },
  });
  return { decision: shapeDecision(updated.rows[0]), replayed: false };
}

export async function listSupportDecisions(client, { actor, caseId }) {
  if (!['support', 'admin'].includes(actor?.role)) {
    throw new SupportCaseError(403, 'support_decision_list_forbidden');
  }
  const supportCase = await client.query(
    `SELECT id, current_owner_id FROM support_cases WHERE id::text = $1`,
    [caseId],
  );
  if (!supportCase.rowCount) {
    if (actor.role === 'support') {
      await audit(client, {
        actor,
        action: 'support.case_access_denied',
        resourceType: 'support_case',
        resourceId: caseId,
        metadata: {
          accessPath: 'decision_list',
          reason: 'not_assigned_or_not_found',
        },
      });
    }
    throw new SupportCaseError(404, 'support_case_not_found');
  }
  if (actor.role === 'support' && supportCase.rows[0].current_owner_id !== actor.id) {
    await audit(client, {
      actor,
      action: 'support.case_access_denied',
      resourceType: 'support_case',
      resourceId: supportCase.rows[0].id,
      metadata: {
        accessPath: 'decision_list',
        reason: 'not_assigned_or_not_found',
      },
    });
    throw new SupportCaseError(404, 'support_case_not_found');
  }
  const result = await client.query(
    `SELECT * FROM support_decisions WHERE case_id = $1 ORDER BY decided_at, id`,
    [supportCase.rows[0].id],
  );
  return result.rows.map(shapeDecision);
}
