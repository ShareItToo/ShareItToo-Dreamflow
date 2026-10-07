import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../backend/src/return_lifecycle_workflow.js', import.meta.url),
  'utf8',
);
const notifications = readFileSync(
  new URL('../../backend/src/notifications.js', import.meta.url),
  'utf8',
);
const server = readFileSync(
  new URL('../../backend/src/server.js', import.meta.url),
  'utf8',
);
const templates = readFileSync(
  new URL('../../backend/src/transactional_mail_templates.js', import.meta.url),
  'utf8',
);

test('missing confirmation remains neutral through T0 plus five calendar days', () => {
  assert.match(workflow, /state === 'awaitingReturnConfirmation'/);
  assert.match(workflow, /kind: 'return_confirmation_reminder'/);
  assert.match(workflow, /current >= clarificationDeadline/);
  assert.match(workflow, /nextState = 'payoutEligible'/);
  assert.doesNotMatch(
    workflow.match(/state === 'awaitingReturnConfirmation'[\s\S]*?if \(state === 'reportWindowOpen'/)?.[0] ?? '',
    /nextState = 'needsReview'/,
  );
});

test('confirmed return keeps the exact 48-hour report boundary', () => {
  assert.match(workflow, /state === 'reportWindowOpen'/);
  assert.match(workflow, /current >= reportDeadline/);
  assert.match(workflow, /kind: 'return_report_window_closed'/);
  assert.match(workflow, /nextPayoutInstructionDueAt = reportDeadline/);
});

test('substantiated cases keep five-day response and recurring seven-day updates', () => {
  assert.match(workflow, /kind: 'return_case_opened'/);
  assert.match(workflow, /kind: 'return_case_response_due'/);
  assert.match(workflow, /kind: 'return_case_status_update'/);
  assert.match(
    workflow,
    /let next = addReturnPolicyCalendarDays\(dueAt, 7, timezone\)/,
  );
  assert.match(
    workflow,
    /while \(next <= now\) next = addReturnPolicyCalendarDays\(next, 7, timezone\)/,
  );
  assert.match(workflow, /deadlineTimezone = returnPolicyTimeZone/);
  assert.match(workflow, /booking_case\.status <> 'closed'/);
  assert.doesNotMatch(workflow, /UPDATE booking_cases[\s\S]*SET status = 'closed'/);
});

test('worker updates both booking projections and writes an idempotent audit event', () => {
  assert.match(workflow, /UPDATE bookings[\s\S]*SET return_state = \$2/);
  assert.match(workflow, /UPDATE rental_requests SET payload = \$2::jsonb/);
  assert.match(workflow, /'booking\.return_lifecycle_advanced'/);
  assert.match(workflow, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.match(workflow, /FOR UPDATE OF booking SKIP LOCKED/);
});

test('return lifecycle notifications remain preference-bound across app email and push', () => {
  assert.match(notifications, /enqueueReturnLifecycleNotification/);
  assert.match(notifications, /channels: \['in_app', 'email', 'push'\]/);
  assert.match(notifications, /return_confirmation_window_closed/);
  assert.match(notifications, /return_case_status_update/);
  assert.match(notifications, /ON CONFLICT \(event_key, user_id, channel\) DO NOTHING/);
  assert.match(templates, /return_confirmation_reminder:/);
  assert.match(templates, /return_case_response_due:/);
  assert.match(templates, /return_case_status_update:/);
});

test('server runs and stops the lifecycle worker independently from payment mode', () => {
  assert.match(server, /reconcileReturnLifecycle/);
  assert.match(server, /config\.returnLifecycle\.workerIntervalMs/);
  assert.match(server, /\[return-lifecycle\] startup reconciliation failed/);
  assert.match(server, /clearInterval\(returnLifecycleTimer\)/);
});

test('lifecycle notification copy never promises damage collection or liability', () => {
  assert.match(notifications, /bereits autorisierte Betrag/);
  assert.match(templates, /keine neue Belastung/);
  assert.match(templates, /keine automatische Haftungsentscheidung durch SIT/);
  assert.doesNotMatch(notifications, /Schadensbetrag (?:einziehen|abbuchen)/i);
});
