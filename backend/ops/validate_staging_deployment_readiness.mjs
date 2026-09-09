import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

class StagingDeploymentReadinessError extends Error {
  constructor(code) {
    super('Staging deployment readiness validation failed.');
    this.code = code;
  }
}

function fail(code) {
  throw new StagingDeploymentReadinessError(code);
}

function exactCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${name}_invalid`);
  return value;
}

export function evaluateStagingDeploymentReadiness(payload, { httpStatus } = {}) {
  const status = Number(httpStatus);
  if (![200, 503].includes(status)) fail('http_status_invalid');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('payload_invalid');
  }
  if (payload.service !== 'shareittoo-api') fail('service_invalid');

  const checks = payload.checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    fail('checks_invalid');
  }
  if (checks.database !== 'ok') fail('database_unready');
  if (['error', 'unverified'].includes(checks.mail) || typeof checks.mail !== 'string') {
    fail('mail_unready');
  }

  const notifications = checks.notifications;
  if (!notifications || typeof notifications !== 'object'
      || exactCount(notifications.dead, 'notifications_dead') !== 0) {
    fail('notifications_unready');
  }
  const payments = checks.payments;
  if (!payments || typeof payments !== 'object'
      || exactCount(payments.failedEvents, 'payment_failed_events') !== 0
      || exactCount(payments.unbalanced, 'payment_unbalanced') !== 0
      || exactCount(payments.recoveryPending, 'payment_recovery_pending') !== 0
      || exactCount(payments.recoveryNeedsReview, 'payment_recovery_needs_review') !== 0) {
    fail('payments_unready');
  }

  const support = checks.supportDeadlines;
  if (!support || typeof support !== 'object' || Array.isArray(support)) {
    fail('support_deadlines_invalid');
  }
  const nextUpdateOverdue = exactCount(
    support.nextUpdateOverdue,
    'support_next_update_overdue',
  );
  const blockingSupportCounts = [
    ['p0WithoutOwner', 'support_p0_without_owner'],
    ['criticalNextUpdateOverdue', 'support_critical_next_update_overdue'],
    ['privacyDeadlineNear', 'support_privacy_deadline_near'],
    ['privacyDeadlineOverdue', 'support_privacy_deadline_overdue'],
    ['privacyIncidentDeadlineNear', 'support_privacy_incident_deadline_near'],
    ['privacyIncidentDeadlineOverdue', 'support_privacy_incident_deadline_overdue'],
  ];
  for (const [field, code] of blockingSupportCounts) {
    if (exactCount(support[field], code) !== 0) fail(code);
  }
  if (support.stale !== false) fail('support_watchdog_stale');
  if (support.lastErrorCode !== null) fail('support_watchdog_failed');

  if (nextUpdateOverdue === 0) {
    if (status !== 200 || payload.status !== 'ok' || support.status !== 'ok') {
      fail('unexpected_degradation');
    }
    return Object.freeze({
      status: 'passed',
      state: 'ready',
      noncriticalNextUpdateOverdue: 0,
    });
  }

  if (status !== 503 || payload.status !== 'degraded' || support.status !== 'degraded') {
    fail('noncritical_degradation_truth_invalid');
  }
  return Object.freeze({
    status: 'passed',
    state: 'noncritical_support_deadline_overdue',
    noncriticalNextUpdateOverdue: nextUpdateOverdue,
  });
}

function cliHttpStatus(args) {
  const match = args.find((argument) => argument.startsWith('--http-status='));
  if (!match) fail('http_status_missing');
  return Number(match.slice('--http-status='.length));
}

async function main() {
  try {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const result = evaluateStagingDeploymentReadiness(payload, {
      httpStatus: cliHttpStatus(process.argv.slice(2)),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof StagingDeploymentReadinessError
      ? error.code
      : 'payload_unreadable';
    process.stderr.write(`Staging deployment readiness failed: ${code}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  await main();
}
