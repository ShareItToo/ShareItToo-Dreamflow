import { config } from './config.js';
import { inTransaction, pool } from './db.js';
import { safeOperationalErrorCode } from './observability.js';
import { SupportCaseError } from './support_case_domain.js';
import { reconcilePrivacyIncidentDeadlinesWithClient } from './support_privacy_incident_workflow.js';
import { reconcilePrivacyRightsDeadlinesWithClient } from './support_privacy_rights_workflow.js';

export const supportDeadlineWatchdogVersion = 'support-deadline-watchdog-v1';

const alertTypes = Object.freeze({
  p0WithoutOwner: 'support.operational_alert.p0_without_owner',
  nextUpdateOverdue: 'support.operational_alert.next_update_overdue',
  privacyDeadlineNear: 'support.privacy_rights.deadline_near',
  privacyDeadlineOverdue: 'support.privacy_rights.deadline_overdue',
  privacyIncidentDeadlineNear: 'support.privacy_incident.notification_decision_deadline_near',
  privacyIncidentDeadlineOverdue: 'support.privacy_incident.notification_decision_deadline_overdue',
});

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function safeLimit(value) {
  return Math.min(200, Math.max(1, Number.parseInt(String(value), 10) || 100));
}

function errorCode(error) {
  return safeOperationalErrorCode(error, 'support_deadline_watchdog_failed');
}

function alertKey(type, row) {
  if (type === alertTypes.p0WithoutOwner) {
    return `support-deadline:p0-without-owner:v1:${row.lock_version}`;
  }
  return `support-deadline:next-update-overdue:v1:${iso(row.next_update_at)}`;
}

async function insertAlert(client, { row, eventType, now }) {
  const dueAt = eventType === alertTypes.nextUpdateOverdue ? iso(row.next_update_at) : null;
  const result = await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at, template_version
     ) VALUES (
       $1::uuid, $2, 'service', NULL, 'support_case', $1::uuid::text,
       $3::jsonb, true, 'internal', $4,
       'sit-support-deadline-watchdog', $5, $6
     ) ON CONFLICT (case_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      row.id,
      eventType,
      JSON.stringify({
        alertType: eventType,
        priority: row.priority,
        caseStatus: row.status,
        currentOwnerRole: row.current_owner_role,
        dueAt,
        externalNotificationSent: false,
      }),
      alertKey(eventType, row),
      now,
      supportDeadlineWatchdogVersion,
    ],
  );
  return result.rowCount;
}

export async function reconcileSupportDeadlinesWithClient(client, {
  now = new Date(),
  limit = 100,
} = {}) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) {
    throw new SupportCaseError(400, 'support_deadline_watchdog_time_invalid');
  }
  const startedAt = current;
  const candidates = await client.query(
    `SELECT id, status, priority, current_owner_id, current_owner_role,
            next_update_at, lock_version
       FROM support_cases
      WHERE operating_mode IN ('simulation', 'internal_testing')
        AND status NOT IN ('resolved', 'closed')
        AND (
          (priority = 'p0' AND current_owner_id IS NULL)
          OR next_update_at <= $1
        )
      ORDER BY priority, next_update_at NULLS LAST, id
      FOR UPDATE SKIP LOCKED
      LIMIT $2`,
    [current, safeLimit(limit)],
  );
  let alertsCreated = 0;
  let p0WithoutOwner = 0;
  let nextUpdateOverdue = 0;
  for (const row of candidates.rows) {
    if (row.priority === 'p0' && row.current_owner_id == null) {
      p0WithoutOwner += 1;
      alertsCreated += await insertAlert(client, {
        row,
        eventType: alertTypes.p0WithoutOwner,
        now: current,
      });
    }
    if (row.next_update_at && new Date(row.next_update_at) <= current) {
      nextUpdateOverdue += 1;
      alertsCreated += await insertAlert(client, {
        row,
        eventType: alertTypes.nextUpdateOverdue,
        now: current,
      });
    }
  }
  const privacy = await reconcilePrivacyRightsDeadlinesWithClient(client, {
    now: current,
    limit,
  });
  alertsCreated += privacy.alertsCreated;
  const privacyIncidents = await reconcilePrivacyIncidentDeadlinesWithClient(client, {
    now: current,
    limit,
  });
  alertsCreated += privacyIncidents.alertsCreated;
  const inspected = candidates.rowCount + privacy.inspected + privacyIncidents.inspected;
  await client.query(
    `INSERT INTO support_deadline_watchdog_state (
       singleton, worker_version, last_started_at, last_succeeded_at,
       last_failed_at, last_error_code, last_inspected_count,
       last_alert_count, attempt_count, success_count, updated_at
     ) VALUES (
       true, $1, $2, $2, NULL, NULL, $3, $4, 1, 1, $2
     ) ON CONFLICT (singleton) DO UPDATE SET
       worker_version = EXCLUDED.worker_version,
       last_started_at = EXCLUDED.last_started_at,
       last_succeeded_at = EXCLUDED.last_succeeded_at,
       last_failed_at = NULL,
       last_error_code = NULL,
       last_inspected_count = EXCLUDED.last_inspected_count,
       last_alert_count = EXCLUDED.last_alert_count,
       attempt_count = support_deadline_watchdog_state.attempt_count + 1,
       success_count = support_deadline_watchdog_state.success_count + 1,
       updated_at = EXCLUDED.updated_at`,
    [supportDeadlineWatchdogVersion, startedAt, inspected, alertsCreated],
  );
  return Object.freeze({
    inspected,
    alertsCreated,
    p0WithoutOwner,
    nextUpdateOverdue,
    privacyDeadlineNear: privacy.deadlineNear,
    privacyDeadlineOverdue: privacy.deadlineOverdue,
    privacyIncidentDeadlineNear: privacyIncidents.deadlineNear,
    privacyIncidentDeadlineOverdue: privacyIncidents.deadlineOverdue,
    externalNotificationsSent: 0,
  });
}

async function recordFailure(error, now = new Date()) {
  const code = errorCode(error);
  await pool.query(
    `INSERT INTO support_deadline_watchdog_state (
       singleton, worker_version, last_started_at, last_succeeded_at,
       last_failed_at, last_error_code, last_inspected_count,
       last_alert_count, attempt_count, success_count, updated_at
     ) VALUES (
       true, $1, $2, NULL, $2, $3, 0, 0, 1, 0, $2
     ) ON CONFLICT (singleton) DO UPDATE SET
       worker_version = EXCLUDED.worker_version,
       last_started_at = EXCLUDED.last_started_at,
       last_succeeded_at = NULL,
       last_failed_at = EXCLUDED.last_failed_at,
       last_error_code = EXCLUDED.last_error_code,
       last_inspected_count = 0,
       last_alert_count = 0,
       attempt_count = support_deadline_watchdog_state.attempt_count + 1,
       updated_at = EXCLUDED.updated_at`,
    [supportDeadlineWatchdogVersion, now, code],
  );
}

let running = null;

export function reconcileSupportDeadlines(options = {}) {
  if (running) return running;
  running = inTransaction((client) => reconcileSupportDeadlinesWithClient(client, options))
    .catch(async (error) => {
      try {
        await recordFailure(error, options.now ?? new Date());
      } catch (stateError) {
        console.error('[support-deadline-watchdog] failure state unavailable', errorCode(stateError));
      }
      throw error;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export async function supportDeadlineHealth(client = pool, {
  now = new Date(),
  maxStalenessMs = config.supportDeadlines.maxStalenessMs,
} = {}) {
  const result = await client.query(
    `SELECT
       state.last_succeeded_at,
       state.last_failed_at,
       state.last_error_code,
       state.last_inspected_count,
       state.last_alert_count,
       state.attempt_count,
       state.success_count,
       (SELECT count(*)::int FROM support_cases
         WHERE operating_mode IN ('simulation', 'internal_testing')
           AND status NOT IN ('resolved', 'closed')
           AND priority = 'p0' AND current_owner_id IS NULL) AS p0_without_owner,
       (SELECT count(*)::int FROM support_cases
         WHERE operating_mode IN ('simulation', 'internal_testing')
           AND status NOT IN ('resolved', 'closed')
           AND next_update_at <= $1) AS next_update_overdue,
       (SELECT count(*)::int FROM support_cases
         WHERE operating_mode IN ('simulation', 'internal_testing')
           AND status NOT IN ('resolved', 'closed')
           AND next_update_at <= $1
           AND (
             priority IN ('p0', 'p1')
             OR safety_flag
             OR privacy_flag
             OR authority_flag
             OR money_flag
             OR account_takeover_flag
           )) AS critical_next_update_overdue,
       (SELECT count(*)::int
          FROM support_privacy_rights_requests AS privacy_request
          JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
         WHERE privacy_request.processing_status <> 'completed'
           AND support_case.status NOT IN ('resolved', 'closed')
           AND support_case.operating_mode IN ('simulation', 'internal_testing')
           AND privacy_request.reminder_at <= $1
           AND privacy_request.response_due_at >= $1) AS privacy_deadline_near,
       (SELECT count(*)::int
          FROM support_privacy_rights_requests AS privacy_request
          JOIN support_cases AS support_case ON support_case.id = privacy_request.case_id
         WHERE privacy_request.processing_status <> 'completed'
           AND support_case.status NOT IN ('resolved', 'closed')
           AND support_case.operating_mode IN ('simulation', 'internal_testing')
           AND privacy_request.response_due_at < $1) AS privacy_deadline_overdue,
       (SELECT count(*)::int
          FROM support_privacy_incidents AS incident
          JOIN support_cases AS support_case ON support_case.id = incident.case_id
         WHERE incident.authority_notification_status = 'not_decided'
           AND support_case.status NOT IN ('resolved', 'closed')
           AND support_case.operating_mode IN ('simulation', 'internal_testing')
           AND incident.reminder_at <= $1
           AND incident.notification_deadline_at >= $1)
         AS privacy_incident_deadline_near,
       (SELECT count(*)::int
          FROM support_privacy_incidents AS incident
          JOIN support_cases AS support_case ON support_case.id = incident.case_id
         WHERE incident.authority_notification_status = 'not_decided'
           AND support_case.status NOT IN ('resolved', 'closed')
           AND support_case.operating_mode IN ('simulation', 'internal_testing')
           AND incident.notification_deadline_at < $1)
         AS privacy_incident_deadline_overdue
     FROM (SELECT 1) AS singleton
     LEFT JOIN support_deadline_watchdog_state AS state ON state.singleton`,
    [now],
  );
  const row = result.rows[0] ?? {};
  const lastSucceededAt = row.last_succeeded_at ? new Date(row.last_succeeded_at) : null;
  const stale = !lastSucceededAt
    || now.getTime() - lastSucceededAt.getTime() > maxStalenessMs;
  const p0WithoutOwner = Number(row.p0_without_owner ?? 0);
  const nextUpdateOverdue = Number(row.next_update_overdue ?? 0);
  const criticalNextUpdateOverdue = Number(row.critical_next_update_overdue ?? 0);
  const privacyDeadlineNear = Number(row.privacy_deadline_near ?? 0);
  const privacyDeadlineOverdue = Number(row.privacy_deadline_overdue ?? 0);
  const privacyIncidentDeadlineNear = Number(row.privacy_incident_deadline_near ?? 0);
  const privacyIncidentDeadlineOverdue = Number(row.privacy_incident_deadline_overdue ?? 0);
  return Object.freeze({
    status: stale || row.last_error_code || p0WithoutOwner > 0
      || nextUpdateOverdue > 0 || privacyDeadlineNear > 0
      || privacyDeadlineOverdue > 0 || privacyIncidentDeadlineNear > 0
      || privacyIncidentDeadlineOverdue > 0
      ? 'degraded'
      : 'ok',
    workerVersion: supportDeadlineWatchdogVersion,
    stale,
    lastSucceededAt: iso(lastSucceededAt),
    lastFailedAt: iso(row.last_failed_at),
    lastErrorCode: row.last_error_code ?? null,
    lastInspectedCount: Number(row.last_inspected_count ?? 0),
    lastAlertCount: Number(row.last_alert_count ?? 0),
    attemptCount: Number(row.attempt_count ?? 0),
    successCount: Number(row.success_count ?? 0),
    p0WithoutOwner,
    nextUpdateOverdue,
    criticalNextUpdateOverdue,
    privacyDeadlineNear,
    privacyDeadlineOverdue,
    privacyIncidentDeadlineNear,
    privacyIncidentDeadlineOverdue,
  });
}

export async function listSupportOperationalAlerts(client, {
  actor,
  limit = 100,
  now = new Date(),
} = {}) {
  if (!actor?.id || actor.role !== 'admin') {
    throw new SupportCaseError(403, 'support_operational_alerts_forbidden');
  }
  const result = await client.query(
    `SELECT event.id, event.case_id, event.event_type, event.created_at,
            event.structured_payload,
            support_case.human_readable_case_number,
            support_case.status AS case_status,
            support_case.priority,
            support_case.current_owner_id,
            support_case.current_owner_role,
            support_case.next_update_at
       FROM support_case_events AS event
       JOIN support_cases AS support_case ON support_case.id = event.case_id
      WHERE event.event_type IN ($1, $2, $3, $4, $5, $6)
        AND support_case.operating_mode IN ('simulation', 'internal_testing')
        AND support_case.status NOT IN ('resolved', 'closed')
        AND (
          (event.event_type = $1 AND support_case.priority = 'p0'
            AND support_case.current_owner_id IS NULL)
          OR
          (event.event_type = $2 AND support_case.next_update_at <= $7
            AND event.structured_payload->>'dueAt' =
              to_char(support_case.next_update_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          OR
          (event.event_type IN ($3, $4) AND EXISTS (
            SELECT 1 FROM support_privacy_rights_requests AS privacy_request
             WHERE privacy_request.case_id = support_case.id
               AND privacy_request.processing_status <> 'completed'
               AND privacy_request.reminder_at <= $7
               AND event.structured_payload->>'responseDueAt' =
                 to_char(privacy_request.response_due_at AT TIME ZONE 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               AND (
                 (event.event_type = $3 AND privacy_request.response_due_at >= $7)
                 OR (event.event_type = $4 AND privacy_request.response_due_at < $7)
               )
          ))
          OR
          (event.event_type IN ($5, $6) AND EXISTS (
            SELECT 1 FROM support_privacy_incidents AS incident
             WHERE incident.case_id = support_case.id
               AND incident.authority_notification_status = 'not_decided'
               AND incident.reminder_at <= $7
               AND event.structured_payload->>'notificationDeadlineAt' =
                 to_char(incident.notification_deadline_at AT TIME ZONE 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               AND (
                 (event.event_type = $5 AND incident.notification_deadline_at >= $7)
                 OR (event.event_type = $6 AND incident.notification_deadline_at < $7)
               )
          ))
        )
      ORDER BY support_case.priority, support_case.next_update_at NULLS LAST,
               event.created_at, event.id
      LIMIT $8`,
    [
      alertTypes.p0WithoutOwner,
      alertTypes.nextUpdateOverdue,
      alertTypes.privacyDeadlineNear,
      alertTypes.privacyDeadlineOverdue,
      alertTypes.privacyIncidentDeadlineNear,
      alertTypes.privacyIncidentDeadlineOverdue,
      now,
      safeLimit(limit),
    ],
  );
  return result.rows.map((row) => Object.freeze({
    id: row.id,
    caseId: row.case_id,
    caseNumber: row.human_readable_case_number,
    alertType: row.event_type,
    caseStatus: row.case_status,
    priority: row.priority,
    currentOwnerId: row.current_owner_id ?? null,
    currentOwnerRole: row.current_owner_role,
    nextUpdateAt: iso(row.next_update_at),
    alertedAt: iso(row.created_at),
    externalNotificationSent: false,
  }));
}
