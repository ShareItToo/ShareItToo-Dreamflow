import crypto from 'node:crypto';

import {
  normalizePrivacyIncidentContainmentAction,
  privacyIncidentCaseSubtypes,
} from './support_privacy_incident_domain.js';
import {
  SupportCaseError,
  supportCaseIdempotencyKey,
} from './support_case_domain.js';

const incidentSubtypeSet = new Set(privacyIncidentCaseSubtypes);
const incidentVersion = 'sit_privacy_incident_v1';
const containmentActionVersion = 'sit_privacy_incident_containment_v1';
const deadlinePolicyVersion = 'gdpr-art33-awareness-72h-v1';

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

function shapeIncident(row) {
  return Object.freeze({
    id: row.id,
    caseId: row.case_id,
    caseNumber: row.human_readable_case_number ?? null,
    caseSubType: row.case_subtype ?? null,
    incidentVersion: row.incident_version,
    breachAwarenessAt: iso(row.breach_awareness_at),
    notificationDeadlineAt: iso(row.notification_deadline_at),
    reminderAt: iso(row.reminder_at),
    deadlinePolicyVersion: row.deadline_policy_version,
    containmentStatus: row.containment_status,
    assessmentStatus: row.assessment_status,
    authorityNotificationStatus: row.authority_notification_status,
    affectedPersonNotificationStatus: row.affected_person_notification_status,
    externalNotificationsSent: false,
    caseStatus: row.case_status ?? null,
    priority: row.case_priority ?? null,
    currentOwnerRole: row.current_owner_role ?? null,
    version: Number(row.lock_version),
  });
}

function sameAction(row, { caseId, actor, normalized }) {
  return row.case_id.toString() === caseId
    && row.recorded_by === actor.id
    && Number(row.expected_incident_version) === normalized.expectedVersion
    && row.action_code === normalized.actionCode
    && row.outcome === normalized.outcome
    && row.action_reference === normalized.actionReference
    && row.containment_status_after === normalized.containmentStatus;
}

async function writeAudit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_privacy_incident', $4, $5::jsonb)`,
    [actor.id, actor.role, action, resourceId, JSON.stringify(metadata)],
  );
}

export async function createPrivacyIncidentForCase(client, {
  caseRecord,
  now = new Date(),
}) {
  if (!incidentSubtypeSet.has(caseRecord?.case_subtype)) return null;
  const deadline = new Date(now.getTime() + (72 * 60 * 60 * 1000));
  const reminder = new Date(deadline.getTime() - (12 * 60 * 60 * 1000));
  const result = await client.query(
    `INSERT INTO support_privacy_incidents (
       id, case_id, incident_version, breach_awareness_at,
       notification_deadline_at, reminder_at, deadline_policy_version,
       containment_status, assessment_status,
       authority_notification_status, affected_person_notification_status,
       external_notifications_sent, lock_version, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7,
       'pending', 'pending_human_assessment',
       'not_decided', 'not_decided',
       false, 1, $4, $4
     ) RETURNING *`,
    [
      crypto.randomUUID(),
      caseRecord.id,
      incidentVersion,
      now,
      deadline,
      reminder,
      deadlinePolicyVersion,
    ],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, 'support.privacy_incident.awareness_recorded', 'service', NULL,
       'support_privacy_incident', $2, $3::jsonb, true, 'restricted',
       $4, 'sit-api', $5
     )`,
    [
      caseRecord.id,
      result.rows[0].id,
      JSON.stringify({
        incidentVersion,
        breachAwarenessAt: iso(now),
        notificationDeadlineAt: iso(deadline),
        deadlinePolicyVersion,
        humanAssessmentRequired: true,
        externalNotificationSent: false,
      }),
      `support-privacy-incident:v1:awareness:${caseRecord.id}`,
      now,
    ],
  );
  return result.rows[0];
}

export async function listPrivacyIncidentQueue(client, {
  actor,
  limit = 100,
} = {}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_privacy_incident_admin_required');
  }
  const result = await client.query(
    `SELECT incident.*, support_case.human_readable_case_number,
            support_case.case_subtype, support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role
       FROM support_privacy_incidents AS incident
       JOIN support_cases AS support_case ON support_case.id = incident.case_id
      WHERE support_case.operating_mode IN ('simulation', 'internal_testing')
        AND support_case.status NOT IN ('resolved', 'closed')
      ORDER BY incident.notification_deadline_at, incident.breach_awareness_at,
               incident.id
      LIMIT $1`,
    [safeLimit(limit)],
  );
  return result.rows.map(shapeIncident);
}

export async function recordPrivacyIncidentContainmentAction(client, {
  actor,
  sessionId,
  staffElevationId,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin' || !actor.id || !sessionId || !staffElevationId) {
    throw new SupportCaseError(403, 'support_privacy_incident_admin_required');
  }
  const normalized = normalizePrivacyIncidentContainmentAction(raw);
  const key = supportCaseIdempotencyKey(
    idempotencyKey,
    'support.privacy_incident.containment.record',
  );
  const replay = await client.query(
    `SELECT action.*, incident.*, incident.id AS incident_id,
            action.id AS action_id,
            support_case.human_readable_case_number,
            support_case.case_subtype, support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role
       FROM support_privacy_incident_containment_actions AS action
       JOIN support_privacy_incidents AS incident ON incident.id = action.incident_id
       JOIN support_cases AS support_case ON support_case.id = incident.case_id
      WHERE action.idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    if (!sameAction(replay.rows[0], { caseId, actor, normalized })) {
      throw new SupportCaseError(409, 'support_privacy_incident_idempotency_conflict');
    }
    return Object.freeze({
      incident: shapeIncident(replay.rows[0]),
      containmentActionId: replay.rows[0].action_id,
      replayed: true,
    });
  }

  const current = await client.query(
    `SELECT incident.*, support_case.human_readable_case_number,
            support_case.case_subtype, support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role,
            support_case.operating_mode
       FROM support_privacy_incidents AS incident
       JOIN support_cases AS support_case ON support_case.id = incident.case_id
      WHERE incident.case_id::text = $1
      FOR UPDATE OF incident`,
    [caseId],
  );
  const incident = current.rows[0];
  if (!incident
      || !['simulation', 'internal_testing'].includes(incident.operating_mode)
      || ['resolved', 'closed'].includes(incident.case_status)) {
    throw new SupportCaseError(404, 'support_privacy_incident_not_found');
  }
  if (Number(incident.lock_version) !== normalized.expectedVersion) {
    throw new SupportCaseError(409, 'support_privacy_incident_version_conflict', {
      currentVersion: Number(incident.lock_version),
    });
  }
  if (incident.containment_status === 'contained') {
    throw new SupportCaseError(409, 'support_privacy_incident_already_contained');
  }

  const actionId = crypto.randomUUID();
  await client.query(
    `INSERT INTO support_privacy_incident_containment_actions (
       id, incident_id, action_version, action_code, outcome,
       action_reference, containment_status_after, recorded_by,
       recorded_session_id, staff_elevation_id, expected_incident_version,
       external_notification_sent, idempotency_key, recorded_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11,
       false, $12, $13
     )`,
    [
      actionId,
      incident.id,
      containmentActionVersion,
      normalized.actionCode,
      normalized.outcome,
      normalized.actionReference,
      normalized.containmentStatus,
      actor.id,
      sessionId,
      staffElevationId,
      normalized.expectedVersion,
      key,
      now,
    ],
  );
  const updated = await client.query(
    `SELECT incident.*, support_case.human_readable_case_number,
            support_case.case_subtype, support_case.status AS case_status,
            support_case.priority AS case_priority,
            support_case.current_owner_role
       FROM support_privacy_incidents AS incident
       JOIN support_cases AS support_case ON support_case.id = incident.case_id
      WHERE incident.id = $1`,
    [incident.id],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, 'support.privacy_incident.containment_recorded', 'admin', $2,
       'support_privacy_incident_containment_action', $3, $4::jsonb,
       false, 'restricted', $5, 'sit-api', $6
     )`,
    [
      incident.case_id,
      actor.id,
      actionId,
      JSON.stringify({
        actionCode: normalized.actionCode,
        outcome: normalized.outcome,
        containmentStatus: normalized.containmentStatus,
        actionReference: normalized.actionReference,
        externalNotificationSent: false,
      }),
      `${key}:event`,
      now,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.privacy_incident_containment_recorded',
    resourceId: incident.id,
    metadata: {
      caseId: incident.case_id,
      actionCode: normalized.actionCode,
      outcome: normalized.outcome,
      containmentStatus: normalized.containmentStatus,
      actionReference: normalized.actionReference,
      externalNotificationSent: false,
    },
  });
  return Object.freeze({
    incident: shapeIncident(updated.rows[0]),
    containmentActionId: actionId,
    replayed: false,
  });
}

async function insertDeadlineAlert(client, { row, eventType, now }) {
  const key = `support-privacy-incident-deadline:v1:${eventType}:${iso(row.notification_deadline_at)}`;
  const result = await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at
     ) VALUES (
       $1, $2, 'service', NULL, 'support_privacy_incident', $3,
       $4::jsonb, true, 'internal', $5,
       'sit-support-deadline-watchdog', $6
     ) ON CONFLICT (case_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      row.case_id,
      eventType,
      row.id,
      JSON.stringify({
        breachAwarenessAt: iso(row.breach_awareness_at),
        notificationDeadlineAt: iso(row.notification_deadline_at),
        deadlinePolicyVersion: row.deadline_policy_version,
        humanDecisionRequired: true,
        externalNotificationSent: false,
      }),
      key,
      now,
    ],
  );
  return result.rowCount;
}

export async function reconcilePrivacyIncidentDeadlinesWithClient(client, {
  now = new Date(),
  limit = 100,
} = {}) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) {
    throw new SupportCaseError(400, 'support_privacy_incident_deadline_time_invalid');
  }
  const candidates = await client.query(
    `SELECT incident.*
       FROM support_privacy_incidents AS incident
       JOIN support_cases AS support_case ON support_case.id = incident.case_id
      WHERE incident.authority_notification_status = 'not_decided'
        AND support_case.operating_mode IN ('simulation', 'internal_testing')
        AND support_case.status NOT IN ('resolved', 'closed')
        AND incident.reminder_at <= $1
      ORDER BY incident.notification_deadline_at, incident.id
      FOR UPDATE OF incident SKIP LOCKED
      LIMIT $2`,
    [current, safeLimit(limit)],
  );
  let deadlineNear = 0;
  let deadlineOverdue = 0;
  let alertsCreated = 0;
  for (const row of candidates.rows) {
    const overdue = new Date(row.notification_deadline_at) < current;
    const eventType = overdue
      ? 'support.privacy_incident.notification_decision_deadline_overdue'
      : 'support.privacy_incident.notification_decision_deadline_near';
    if (overdue) deadlineOverdue += 1;
    else deadlineNear += 1;
    alertsCreated += await insertDeadlineAlert(client, { row, eventType, now: current });
  }
  return Object.freeze({
    inspected: candidates.rowCount,
    alertsCreated,
    deadlineNear,
    deadlineOverdue,
    externalNotificationsSent: 0,
  });
}
