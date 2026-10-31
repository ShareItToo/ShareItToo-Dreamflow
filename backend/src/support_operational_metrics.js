import { SupportCaseError } from './support_case_domain.js';

export const supportOperationalMetricsVersion = 'support-operational-metrics-v1';

const defaultWindowMs = 30 * 24 * 60 * 60 * 1000;
const maximumWindowMs = 93 * 24 * 60 * 60 * 1000;

function requiredDate(value, code) {
  if (!(value instanceof Date) && typeof value !== 'string') {
    throw new SupportCaseError(400, code);
  }
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new SupportCaseError(400, code);
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new SupportCaseError(400, code);
  return result;
}

function rateBasisPoints(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator * 10_000) / denominator) : 0;
}

function normalizeWindow({ from, to, now }) {
  const asOf = requiredDate(now, 'support_operational_metrics_time_invalid');
  const windowEnd = to == null || to === ''
    ? asOf
    : requiredDate(to, 'support_operational_metrics_to_invalid');
  const windowStart = from == null || from === ''
    ? new Date(windowEnd.getTime() - defaultWindowMs)
    : requiredDate(from, 'support_operational_metrics_from_invalid');
  if (windowStart >= windowEnd) {
    throw new SupportCaseError(400, 'support_operational_metrics_window_invalid');
  }
  if (windowEnd > asOf) {
    throw new SupportCaseError(400, 'support_operational_metrics_future_window_forbidden');
  }
  if (windowEnd.getTime() - windowStart.getTime() > maximumWindowMs) {
    throw new SupportCaseError(400, 'support_operational_metrics_window_too_large');
  }
  return { asOf, windowStart, windowEnd };
}

export async function getSupportOperationalMetrics(client, {
  actor,
  from = null,
  to = null,
  now = new Date(),
} = {}) {
  if (!actor?.id || actor.role !== 'admin') {
    throw new SupportCaseError(403, 'support_operational_metrics_forbidden');
  }
  const { asOf, windowStart, windowEnd } = normalizeWindow({ from, to, now });
  const result = await client.query(
    `WITH closed_case_cohort AS (
       SELECT event.case_id, min(event.created_at) AS first_closed_at
         FROM support_case_events AS event
         JOIN support_cases AS support_case ON support_case.id = event.case_id
        WHERE support_case.operating_mode IN ('simulation', 'internal_testing')
          AND event.event_type = 'case.transitioned'
          AND event.to_status = 'closed'
          AND event.created_at >= $1
          AND event.created_at < $2
        GROUP BY event.case_id
     ), reopened_case_cohort AS (
       SELECT DISTINCT closed_case.case_id
         FROM closed_case_cohort AS closed_case
         JOIN support_case_events AS event ON event.case_id = closed_case.case_id
        WHERE event.event_type = 'case.transitioned'
          AND event.to_status = 'reopened'
          AND event.created_at >= closed_case.first_closed_at
          AND event.created_at < $2
     ), active_case_snapshot AS (
       SELECT count(*)::int AS active_case_count,
              count(*) FILTER (WHERE next_update_at <= $3)::int
                AS overdue_active_case_count
         FROM support_cases
        WHERE operating_mode IN ('simulation', 'internal_testing')
          AND status NOT IN ('resolved', 'closed')
     )
     SELECT
       (SELECT count(*)::int FROM closed_case_cohort) AS closed_case_count,
       (SELECT count(*)::int FROM reopened_case_cohort) AS reopened_case_count,
       active_case_count,
       overdue_active_case_count
       FROM active_case_snapshot`,
    [windowStart, windowEnd, asOf],
  );
  const row = result.rows[0] ?? {};
  const closedCases = Number(row.closed_case_count ?? 0);
  const reopenedCases = Number(row.reopened_case_count ?? 0);
  const activeCases = Number(row.active_case_count ?? 0);
  const overdueActiveCases = Number(row.overdue_active_case_count ?? 0);
  return Object.freeze({
    definitionVersion: supportOperationalMetricsVersion,
    window: Object.freeze({
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
      boundary: 'from_inclusive_to_exclusive',
    }),
    reopenRate: Object.freeze({
      closedCaseCohort: closedCases,
      reopenedCases,
      basisPoints: rateBasisPoints(reopenedCases, closedCases),
    }),
    lateUpdateRate: Object.freeze({
      asOf: asOf.toISOString(),
      activeCases,
      overdueActiveCases,
      basisPoints: rateBasisPoints(overdueActiveCases, activeCases),
    }),
    privacy: Object.freeze({
      aggregateOnly: true,
      containsPersonalData: false,
      externalAnalyticsSent: false,
    }),
  });
}
