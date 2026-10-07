import crypto from 'node:crypto';

import { SupportCaseError } from './support_case_domain.js';
import {
  assertSupportDuplicateCaseCompatibility,
  normalizeSupportDuplicateCaseLink,
  supportDuplicateCaseLinkVersion,
} from './support_duplicate_case_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function shapeLink(row) {
  return Object.freeze({
    id: row.id,
    duplicateCaseNumber: row.duplicate_case_number,
    leadingCaseNumber: row.leading_case_number,
    relationType: row.relation_type,
    linkVersion: row.link_version,
    duplicateCaseVersion: Number(row.case_version),
    leadingCaseVersion: Number(row.leading_case_version),
    snapshotSha256: row.snapshot_sha256,
    humanReviewed: row.human_reviewed === true,
    automaticMergeExecuted: false,
    externalDeliveryEnabled: false,
    createdAt: iso(row.created_at),
  });
}

function replayLink(row, { actor, duplicateCaseId, normalized }) {
  if (row.case_id.toString() !== duplicateCaseId
      || row.object_id.toString() !== normalized.leadingCaseId
      || row.created_by !== actor.id
      || Number(row.case_version) !== normalized.duplicateExpectedVersion
      || Number(row.leading_case_version) !== normalized.leadingExpectedVersion) {
    throw new SupportCaseError(409, 'support_duplicate_case_idempotency_conflict');
  }
  return Object.freeze({ link: shapeLink(row), replayed: true });
}

export async function recordSupportDuplicateCaseLink(client, {
  actor,
  sessionId,
  staffElevationId,
  duplicateCaseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin' || !actor.id || !sessionId || !staffElevationId) {
    throw new SupportCaseError(403, 'support_duplicate_case_admin_required');
  }
  const normalized = normalizeSupportDuplicateCaseLink(raw, idempotencyKey);
  if (normalized.leadingCaseId === duplicateCaseId) {
    throw new SupportCaseError(409, 'support_duplicate_case_self_link_forbidden');
  }
  const existing = await client.query(
    `SELECT link.*, duplicate_case.human_readable_case_number AS duplicate_case_number,
            leading_case.human_readable_case_number AS leading_case_number
       FROM support_case_links AS link
       JOIN support_cases AS duplicate_case ON duplicate_case.id = link.case_id
       JOIN support_cases AS leading_case ON leading_case.id = link.object_id
      WHERE link.idempotency_key = $1`,
    [normalized.idempotencyKey],
  );
  if (existing.rowCount) {
    return replayLink(existing.rows[0], {
      actor,
      duplicateCaseId,
      normalized,
    });
  }

  const locked = await client.query(
    `SELECT * FROM support_cases
      WHERE id::text = ANY($1::text[])
      ORDER BY id
      FOR UPDATE`,
    [[duplicateCaseId, normalized.leadingCaseId]],
  );
  const duplicateCase = locked.rows.find((row) => row.id.toString() === duplicateCaseId);
  const leadingCase = locked.rows.find(
    (row) => row.id.toString() === normalized.leadingCaseId,
  );
  if (!duplicateCase || !leadingCase) {
    throw new SupportCaseError(404, 'support_duplicate_case_not_found');
  }
  if (Number(duplicateCase.lock_version) !== normalized.duplicateExpectedVersion
      || Number(leadingCase.lock_version) !== normalized.leadingExpectedVersion) {
    throw new SupportCaseError(409, 'support_duplicate_case_version_conflict');
  }
  assertSupportDuplicateCaseCompatibility(duplicateCase, leadingCase);

  const existingDuplicateLink = await client.query(
    `SELECT id FROM support_case_links
      WHERE case_id = $1 AND object_type = 'another_support_case'
        AND relation_type = 'duplicate_of'`,
    [duplicateCase.id],
  );
  if (existingDuplicateLink.rowCount) {
    throw new SupportCaseError(409, 'support_duplicate_case_already_linked');
  }

  const snapshot = Object.freeze({
    version: supportDuplicateCaseLinkVersion,
    duplicateCaseNumber: duplicateCase.human_readable_case_number,
    leadingCaseNumber: leadingCase.human_readable_case_number,
    duplicateCaseVersion: Number(duplicateCase.lock_version),
    leadingCaseVersion: Number(leadingCase.lock_version),
    caseType: duplicateCase.case_type,
    caseSubType: duplicateCase.case_subtype,
    sameCoreFactsConfirmed: true,
    sameParticipantsAndObjectsConfirmed: true,
    sameDecisionQuestionConfirmed: true,
    noSeparateDeadlineLossConfirmed: true,
    privacyDsaSeparationConfirmed: true,
    userVisibleReferenceRequired: true,
    automaticMergeAllowed: false,
    externalDeliveryAllowed: false,
  });
  const linkId = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO support_case_links (
       id, case_id, object_type, object_id, relation_type, link_version,
       case_version, leading_case_version, assessment_snapshot,
       created_by, reviewer_session_id, staff_elevation_id,
       same_core_facts_confirmed, same_participants_objects_confirmed,
       same_decision_question_confirmed, no_separate_deadline_loss_confirmed,
       privacy_dsa_separation_confirmed, human_reviewed,
       automatic_merge_executed, external_delivery_enabled,
       idempotency_key, created_at
     ) VALUES (
       $1, $2, 'another_support_case', $3, 'duplicate_of', $4,
       $5, $6, $7::jsonb,
       $8, $9, $10,
       true, true,
       true, true,
       true, true,
       false, false,
       $11, $12
     )
     RETURNING *, $13::text AS duplicate_case_number,
       $14::text AS leading_case_number`,
    [
      linkId,
      duplicateCase.id,
      leadingCase.id,
      supportDuplicateCaseLinkVersion,
      Number(duplicateCase.lock_version),
      Number(leadingCase.lock_version),
      JSON.stringify(snapshot),
      actor.id,
      sessionId,
      staffElevationId,
      normalized.idempotencyKey,
      now,
      duplicateCase.human_readable_case_number,
      leadingCase.human_readable_case_number,
    ],
  );
  const link = inserted.rows[0];
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, from_status, to_status,
       transition_reason, entity_type, entity_id, structured_payload,
       automation_used, visibility, idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'case.duplicate_link_recorded', 'admin', $2, $3, $3,
       'Der gleiche Kernsachverhalt wird im führenden Fall weiterbearbeitet.',
       'support_case_link', $4, $5::jsonb,
       false, 'user_visible', $6, 'sit-api', $7
     )`,
    [
      duplicateCase.id,
      actor.id,
      duplicateCase.status,
      link.id,
      JSON.stringify({
        relationType: 'duplicate_of',
        leadingCaseNumber: leadingCase.human_readable_case_number,
        duplicateClosurePending: true,
        separateDeadlineLost: false,
        automaticMergeExecuted: false,
        externalDeliveryEnabled: false,
      }),
      `${normalized.idempotencyKey}:duplicate-event`,
      now,
    ],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, from_status, to_status,
       transition_reason, entity_type, entity_id, structured_payload,
       automation_used, visibility, idempotency_key, source_system, created_at
     ) VALUES (
       $1, 'case.leading_duplicate_link_recorded', 'admin', $2, $3, $3,
       'Ein geprüfter Duplikatfall wurde dem führenden Fall zugeordnet.',
       'support_case_link', $4, $5::jsonb,
       false, 'internal', $6, 'sit-api', $7
     )`,
    [
      leadingCase.id,
      actor.id,
      leadingCase.status,
      link.id,
      JSON.stringify({
        relationType: 'leads_duplicate',
        duplicateCaseNumber: duplicateCase.human_readable_case_number,
        automaticMergeExecuted: false,
        externalDeliveryEnabled: false,
      }),
      `${normalized.idempotencyKey}:leading-event`,
      now,
    ],
  );
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES (
       $1, $2, 'support.duplicate_case_link_recorded',
       'support_case_link', $3, $4::jsonb
     )`,
    [
      actor.id,
      actor.role,
      link.id,
      JSON.stringify({
        duplicateCaseNumber: duplicateCase.human_readable_case_number,
        leadingCaseNumber: leadingCase.human_readable_case_number,
        snapshotSha256: link.snapshot_sha256,
        humanReviewed: true,
        automaticMergeExecuted: false,
        externalDeliveryEnabled: false,
      }),
    ],
  );
  return Object.freeze({ link: shapeLink(link), replayed: false });
}
