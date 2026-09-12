import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const server = readFileSync('backend/src/server.js', 'utf8');
const config = readFileSync('backend/src/config.js', 'utf8');
const watchdog = readFileSync('backend/src/support_deadline_watchdog.js', 'utf8');
const messageDomain = readFileSync('backend/src/support_message_domain.js', 'utf8');
const messageWorkflow = readFileSync('backend/src/support_message_workflow.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/039_support_deadline_watchdog.up.sql',
  'utf8',
);
const rollback = readFileSync(
  'backend/sql/migrations/039_support_deadline_watchdog.down.sql',
  'utf8',
);

test('watchdog scans only active non-live P0 ownership and next-update conditions', () => {
  assert.match(watchdog, /operating_mode IN \('simulation', 'internal_testing'\)/u);
  assert.match(watchdog, /priority = 'p0' AND current_owner_id IS NULL/u);
  assert.match(watchdog, /next_update_at <= \$1/u);
  assert.match(watchdog, /FOR UPDATE SKIP LOCKED/u);
  assert.match(watchdog, /ON CONFLICT \(case_id, idempotency_key\) DO NOTHING/u);
  assert.match(watchdog, /externalNotificationsSent: 0/u);
  assert.doesNotMatch(watchdog, /sendEmail|sendPush|sendTransactionalEmail|fetch\(/u);
});

test('admin alert queue and health remain elevated, private and fail closed', () => {
  assert.match(
    app,
    /app\.get\('\/v1\/admin\/support\/operational-alerts', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation/u,
  );
  assert.match(app, /supportDeadlines\.status === 'ok'/u);
  assert.match(watchdog, /support_operational_alerts_forbidden/u);
  assert.match(watchdog, /externalNotificationSent: false/u);
  assert.match(watchdog, /status: stale \|\| row\.last_error_code/u);
});

test('worker starts immediately, retries on an interval and is stopped on shutdown', () => {
  assert.match(server, /void reconcileSupportDeadlines\(\)/u);
  assert.match(server, /setInterval\(\(\) => \{[\s\S]*reconcileSupportDeadlines/u);
  assert.match(server, /clearInterval\(supportDeadlineTimer\)/u);
  assert.match(config, /SUPPORT_DEADLINE_WORKER_INTERVAL_MS/u);
  assert.match(config, /SUPPORT_DEADLINE_MAX_STALENESS_MS/u);
});

test('publication refuses an expired promised checkpoint and rollback preserves alert truth', () => {
  assert.match(messageDomain, /support_message_next_update_overdue/u);
  assert.match(messageWorkflow, /case_next_update_at/u);
  assert.match(migration, /support_deadline_watchdog_state/u);
  assert.match(migration, /support_case_events_operational_alert_idx/u);
  assert.match(
    rollback,
    /Cannot roll back support deadline watchdog while alert truth exists/u,
  );
});
