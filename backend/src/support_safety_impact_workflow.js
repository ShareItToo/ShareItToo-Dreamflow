import crypto from 'node:crypto';

import { SupportCaseError } from './support_case_domain.js';
import {
  classifySupportSafetyBookingScope,
  isSupportSafetyImpactCase,
  normalizeSupportSafetyImpactReview,
  supportSafetyImpactReviewVersion,
} from './support_safety_impact_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function shapeReview(row) {
  return Object.freeze({
    id: row.id,
    caseId: row.case_id,
    caseVersion: Number(row.case_version),
    reviewVersion: row.review_version,
    linkedListingId: row.linked_listing_id,
    actionRelevantBookingIds: Object.freeze([
      ...(row.action_relevant_booking_ids ?? []),
    ]),
    historicalBookingIds: Object.freeze([
      ...(row.historical_booking_ids ?? []),
    ]),
    snapshotSha256: row.snapshot_sha256,
    humanReviewed: row.human_reviewed === true,
    decisionRequired: row.decision_required === true,
    proportionalityRequired: row.proportionality_required === true,
    actionExecuted: false,
    externalDeliveryEnabled: false,
    automationRole: row.automation_role,
    createdAt: iso(row.created_at),
  });
}

function replayReview(row, { actor, caseId, normalized }) {
  if (row.case_id !== caseId
      || row.reviewer_id !== actor.id
      || Number(row.case_version) !== normalized.expectedVersion) {
    throw new SupportCaseError(409, 'support_safety_impact_idempotency_conflict');
  }
  return Object.freeze({ review: shapeReview(row), replayed: true });
}

async function writeAudit(client, { actor, review, caseId }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES (
       $1, $2, 'support.safety_impact_review_recorded',
       'support_safety_impact_review', $3, $4::jsonb
     )`,
    [
      actor.id,
      actor.role,
      review.id,
      JSON.stringify({
        caseId,
        caseVersion: Number(review.case_version),
        snapshotSha256: review.snapshot_sha256,
        actionRelevantBookingCount:
          (review.action_relevant_booking_ids ?? []).length,
        historicalBookingCount: (review.historical_booking_ids ?? []).length,
        humanReviewed: true,
        decisionRequired: true,
        proportionalityRequired: true,
        actionExecuted: false,
        externalDeliveryEnabled: false,
      }),
    ],
  );
}

export async function listSupportSafetyImpactReviews(client, { actor, caseId }) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_safety_impact_admin_required');
  }
  const supportCase = await client.query(
    `SELECT id FROM support_cases
      WHERE id::text = $1
        AND (
          (case_type = 'moderation_content'
            AND case_subtype = 'prohibited_or_restricted_listing')
          OR
          (case_type = 'trust_safety'
            AND case_subtype = 'dangerous_item_or_injury')
        )`,
    [caseId],
  );
  if (!supportCase.rowCount) {
    throw new SupportCaseError(404, 'support_safety_impact_case_not_found');
  }
  const result = await client.query(
    `SELECT * FROM support_safety_impact_reviews
      WHERE case_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 50`,
    [supportCase.rows[0].id],
  );
  return result.rows.map(shapeReview);
}

export async function recordSupportSafetyImpactReview(client, {
  actor,
  sessionId,
  staffElevationId,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin' || !actor.id || !sessionId || !staffElevationId) {
    throw new SupportCaseError(403, 'support_safety_impact_admin_required');
  }
  const normalized = normalizeSupportSafetyImpactReview(raw, idempotencyKey);
  const existing = await client.query(
    'SELECT * FROM support_safety_impact_reviews WHERE idempotency_key = $1',
    [normalized.idempotencyKey],
  );
  if (existing.rowCount) {
    return replayReview(existing.rows[0], { actor, caseId, normalized });
  }

  const supportCase = await client.query(
    `SELECT id, case_type, case_subtype, status, operating_mode,
            lock_version, linked_listing_id, safety_flag, approval_level
       FROM support_cases
      WHERE id::text = $1
      FOR UPDATE`,
    [caseId],
  );
  const caseRow = supportCase.rows[0];
  if (!caseRow
      || !isSupportSafetyImpactCase(caseRow)
      || ['resolved', 'closed'].includes(caseRow.status)
      || !['simulation', 'internal_testing'].includes(caseRow.operating_mode)
      || !caseRow.linked_listing_id) {
    throw new SupportCaseError(404, 'support_safety_impact_case_not_found');
  }
  if (Number(caseRow.lock_version) !== normalized.expectedVersion) {
    throw new SupportCaseError(409, 'support_safety_impact_case_version_conflict');
  }
  if (caseRow.case_type === 'trust_safety'
      && (caseRow.safety_flag !== true
        || caseRow.approval_level !== 'red_explicit_decision')) {
    throw new SupportCaseError(409, 'support_safety_impact_red_boundary_required');
  }

  const listing = await client.query(
    `SELECT id, status, is_active, moderation_status
       FROM listings
      WHERE id = $1
      FOR KEY SHARE`,
    [caseRow.linked_listing_id],
  );
  if (!listing.rowCount) {
    throw new SupportCaseError(409, 'support_safety_impact_listing_unavailable');
  }
  const bookingRows = await client.query(
    `SELECT id, workflow_status
       FROM bookings
      WHERE listing_id = $1
      ORDER BY id
      LIMIT 201`,
    [caseRow.linked_listing_id],
  );
  const scope = classifySupportSafetyBookingScope(bookingRows.rows);
  if (scope.actionRelevantBookingIds.length > 49) {
    throw new SupportCaseError(409, 'support_safety_impact_scope_too_large');
  }
  const listingRow = listing.rows[0];
  const snapshot = Object.freeze({
    version: supportSafetyImpactReviewVersion,
    caseId: caseRow.id,
    caseVersion: Number(caseRow.lock_version),
    caseType: caseRow.case_type,
    caseSubType: caseRow.case_subtype,
    listing: Object.freeze({
      id: listingRow.id,
      status: listingRow.status,
      isActive: listingRow.is_active === true,
      moderationStatus: listingRow.moderation_status,
    }),
    bookings: scope.bookings,
    actionRelevantBookingIds: scope.actionRelevantBookingIds,
    historicalBookingIds: scope.historicalBookingIds,
    decisionBoundary: 'red_human_decision_required',
    proportionalityRequired: true,
    automaticActionAllowed: false,
    externalDeliveryAllowed: false,
  });
  const reviewId = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO support_safety_impact_reviews (
       id, case_id, case_version, review_version, linked_listing_id,
       action_relevant_booking_ids, historical_booking_ids, impact_snapshot,
       reviewer_id, reviewer_session_id, staff_elevation_id,
       human_reviewed, decision_required, proportionality_required,
       action_executed, external_delivery_enabled, automation_role,
       idempotency_key, created_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8::jsonb,
       $9, $10, $11,
       true, true, true,
       false, false, 'none',
       $12, $13
     ) RETURNING *`,
    [
      reviewId,
      caseRow.id,
      Number(caseRow.lock_version),
      supportSafetyImpactReviewVersion,
      caseRow.linked_listing_id,
      scope.actionRelevantBookingIds,
      scope.historicalBookingIds,
      JSON.stringify(snapshot),
      actor.id,
      sessionId,
      staffElevationId,
      normalized.idempotencyKey,
      now,
    ],
  );
  const review = inserted.rows[0];
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, 'support.safety_impact_review_recorded', 'admin', $2,
       'support_safety_impact_review', $3, $4::jsonb,
       false, 'restricted', $5, 'sit-api', $6
     )`,
    [
      caseRow.id,
      actor.id,
      review.id,
      JSON.stringify({
        reviewVersion: supportSafetyImpactReviewVersion,
        caseVersion: Number(caseRow.lock_version),
        linkedListingId: caseRow.linked_listing_id,
        actionRelevantBookingCount: scope.actionRelevantBookingIds.length,
        historicalBookingCount: scope.historicalBookingIds.length,
        snapshotSha256: review.snapshot_sha256,
        humanReviewed: true,
        decisionRequired: true,
        proportionalityRequired: true,
        actionExecuted: false,
        externalDeliveryEnabled: false,
      }),
      `${normalized.idempotencyKey}:event`,
      now,
    ],
  );
  await writeAudit(client, { actor, review, caseId: caseRow.id });
  return Object.freeze({ review: shapeReview(review), replayed: false });
}
