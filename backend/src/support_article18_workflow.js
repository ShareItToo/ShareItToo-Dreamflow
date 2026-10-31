import { normalizeSupportArticle18Assessment } from './support_article18_domain.js';
import { SupportCaseError } from './support_case_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function sameArray(left, right) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function shapeAssessment(row) {
  return Object.freeze({
    id: row.id,
    caseId: row.case_id,
    supersedesAssessmentId: row.supersedes_assessment_id ?? null,
    determination: row.determination,
    routingBasis: row.routing_basis,
    factualBasis: row.factual_basis,
    evidenceReferences: Object.freeze([...(row.evidence_references ?? [])]),
    concernedMemberStates: Object.freeze([...(row.concerned_member_states ?? [])]),
    informationScope: Object.freeze([...(row.information_scope ?? [])]),
    reviewerAuthorizationEvidenceRef: row.reviewer_authorization_evidence_ref,
    humanReviewed: row.human_reviewed === true,
    automationRole: row.automation_role,
    externalDeliveryAllowed: false,
    externalDeliveryStatus: row.external_delivery_status,
    createdAt: iso(row.created_at),
  });
}

function replayAssessment(row, { caseId, actor, normalized }) {
  if (row.case_id !== caseId
      || row.reviewer_id !== actor.id
      || row.determination !== normalized.determination
      || row.routing_basis !== normalized.routingBasis
      || row.factual_basis !== normalized.factualBasis
      || !sameArray(row.evidence_references, normalized.evidenceReferences)
      || !sameArray(row.concerned_member_states, normalized.concernedMemberStates)
      || !sameArray(row.information_scope, normalized.informationScope)
      || row.reviewer_authorization_evidence_ref
        !== normalized.reviewerAuthorizationEvidenceRef
      || (row.supersedes_assessment_id ?? null)
        !== normalized.supersedesAssessmentId) {
    throw new SupportCaseError(409, 'support_article18_idempotency_conflict');
  }
  return Object.freeze({ assessment: shapeAssessment(row), replayed: true });
}

async function writeAudit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_article18_assessment', $4, $5::jsonb)`,
    [actor.id, actor.role, action, resourceId, JSON.stringify(metadata)],
  );
}

export async function listSupportArticle18Candidates(client, {
  actor,
  limit = 100,
} = {}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_article18_admin_required');
  }
  const parsedLimit = Number(limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    throw new SupportCaseError(400, 'support_limit_invalid');
  }
  const result = await client.query(
    `SELECT support_case.id, support_case.human_readable_case_number,
            support_case.case_subtype, support_case.status,
            support_case.priority, support_case.operating_mode,
            support_case.current_owner_role, support_case.next_update_at,
            assessment.id AS assessment_id,
            assessment.determination AS assessment_determination,
            assessment.created_at AS assessment_created_at,
            assessment.external_delivery_status
       FROM support_cases AS support_case
       LEFT JOIN LATERAL (
         SELECT id, determination, created_at, external_delivery_status
           FROM support_article18_assessments
          WHERE case_id = support_case.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) AS assessment ON true
      WHERE support_case.article18_candidate_flag
        AND support_case.status NOT IN ('resolved', 'closed')
      ORDER BY support_case.priority, support_case.next_update_at,
               support_case.created_at, support_case.id
      LIMIT $1`,
    [parsedLimit],
  );
  return result.rows.map((row) => Object.freeze({
    caseId: row.id,
    caseNumber: row.human_readable_case_number,
    caseSubType: row.case_subtype,
    status: row.status,
    priority: row.priority,
    operatingMode: row.operating_mode,
    currentOwnerRole: row.current_owner_role,
    nextUpdateAt: iso(row.next_update_at),
    article18Candidate: true,
    latestAssessment: row.assessment_id ? Object.freeze({
      id: row.assessment_id,
      determination: row.assessment_determination,
      externalDeliveryStatus: row.external_delivery_status,
      createdAt: iso(row.assessment_created_at),
    }) : null,
  }));
}

export async function recordSupportArticle18Assessment(client, {
  actor,
  sessionId,
  staffElevationId,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin' || !actor.id) {
    throw new SupportCaseError(403, 'support_article18_admin_required');
  }
  const normalized = normalizeSupportArticle18Assessment(raw, idempotencyKey);
  const existing = await client.query(
    'SELECT * FROM support_article18_assessments WHERE idempotency_key = $1',
    [normalized.idempotencyKey],
  );
  if (existing.rowCount) {
    return replayAssessment(existing.rows[0], { caseId, actor, normalized });
  }

  const supportCase = await client.query(
    `SELECT id, priority, status, operating_mode, safety_flag,
            authority_flag, article18_candidate_flag
       FROM support_cases
      WHERE id::text = $1
      FOR UPDATE`,
    [caseId],
  );
  const caseRow = supportCase.rows[0];
  if (!caseRow
      || caseRow.priority !== 'p0'
      || ['resolved', 'closed'].includes(caseRow.status)
      || !['simulation', 'internal_testing'].includes(caseRow.operating_mode)
      || caseRow.safety_flag !== true
      || caseRow.authority_flag !== true
      || caseRow.article18_candidate_flag !== true) {
    throw new SupportCaseError(404, 'support_article18_candidate_not_found');
  }
  const prior = await client.query(
    `SELECT * FROM support_article18_assessments
      WHERE case_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE`,
    [caseRow.id],
  );
  if (!prior.rowCount && normalized.supersedesAssessmentId !== null) {
    throw new SupportCaseError(409, 'support_article18_supersession_invalid');
  }
  if (prior.rowCount && (prior.rows[0].determination !== 'information_required'
      || prior.rows[0].id !== normalized.supersedesAssessmentId)) {
    throw new SupportCaseError(409, 'support_article18_prior_assessment_final');
  }

  const inserted = await client.query(
    `INSERT INTO support_article18_assessments (
       case_id, supersedes_assessment_id, determination, routing_basis,
       factual_basis, evidence_references, concerned_member_states,
       information_scope, reviewer_authorization_evidence_ref,
       reviewer_id, reviewer_session_id, staff_elevation_id,
       human_reviewed, automation_role, external_delivery_allowed,
       external_delivery_status, idempotency_key, created_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7,
       $8, $9,
       $10, $11, $12,
       true, 'none', false,
       'disabled_not_configured', $13, $14
     ) RETURNING *`,
    [
      caseRow.id,
      normalized.supersedesAssessmentId,
      normalized.determination,
      normalized.routingBasis,
      normalized.factualBasis,
      normalized.evidenceReferences,
      normalized.concernedMemberStates,
      normalized.informationScope,
      normalized.reviewerAuthorizationEvidenceRef,
      actor.id,
      sessionId,
      staffElevationId,
      normalized.idempotencyKey,
      now,
    ],
  );
  const assessment = inserted.rows[0];
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, 'support.article18_assessment_recorded', 'admin', $2,
       'support_article18_assessment', $3, $4::jsonb, false, 'restricted',
       $5, 'sit-api', $6
     )`,
    [
      caseRow.id,
      actor.id,
      assessment.id,
      JSON.stringify({
        determination: normalized.determination,
        routingBasis: normalized.routingBasis,
        concernedMemberStates: normalized.concernedMemberStates,
        informationScope: normalized.informationScope,
        evidenceReferenceCount: normalized.evidenceReferences.length,
        humanReviewed: true,
        automationRole: 'none',
        externalDeliveryAllowed: false,
        externalDeliveryStatus: 'disabled_not_configured',
      }),
      `${normalized.idempotencyKey}:event`,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.article18_assessment_recorded',
    resourceId: assessment.id,
    metadata: {
      caseId: caseRow.id,
      determination: normalized.determination,
      routingBasis: normalized.routingBasis,
      evidenceReferenceCount: normalized.evidenceReferences.length,
      externalDeliveryAllowed: false,
      externalDeliveryStatus: 'disabled_not_configured',
    },
  });
  return Object.freeze({ assessment: shapeAssessment(assessment), replayed: false });
}

export function rejectSupportArticle18ExternalDispatch({ actor }) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_article18_dispatch_admin_required');
  }
  throw new SupportCaseError(503, 'support_article18_external_dispatch_disabled');
}
