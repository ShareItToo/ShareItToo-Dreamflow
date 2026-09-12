import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const domain = readFileSync('backend/src/support_privacy_incident_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_privacy_incident_workflow.js', 'utf8');
const supportWorkflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const watchdog = readFileSync('backend/src/support_deadline_watchdog.js', 'utf8');
const privacyExport = readFileSync('backend/src/privacy_export.js', 'utf8');
const retention = readFileSync('backend/src/retention_inventory.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/048_support_privacy_incident_control_plane.up.sql',
  'utf8',
);
const rollback = readFileSync(
  'backend/sql/migrations/048_support_privacy_incident_control_plane.down.sql',
  'utf8',
);
const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const screen = readFileSync('lib/screens/privacy_info_screen.dart', 'utf8');

test('SUP-128 creates non-live incident awareness and immutable 72-hour deadline truth', () => {
  for (const subtype of [
    'unauthorized_data_exposure',
    'suspected_personal_data_breach',
    'wrong_recipient_or_wrong_account',
  ]) assert.match(domain, new RegExp(`'${subtype}'`, 'u'));
  assert.match(supportWorkflow, /createPrivacyIncidentForCase/u);
  assert.match(workflow, /support\.privacy_incident\.awareness_recorded/u);
  assert.match(migration, /notification_deadline_at = breach_awareness_at \+ INTERVAL '72 hours'/u);
  assert.match(migration, /support_privacy_incident_transition_invalid/u);
  assert.match(rollback, /Privacy-incident rollback blocked: incident data exists/u);
});

test('containment is exact, append-only, admin step-up bound and cannot notify externally', () => {
  assert.match(domain, /support_privacy_incident_action_shape_invalid/u);
  assert.match(domain, /test_recipient_access_restricted/u);
  assert.match(app, /privacy-incident\/containment-actions', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation/u);
  assert.match(migration, /target_actor\.role <> 'admin'/u);
  assert.match(migration, /target_elevation\.expires_at <= NEW\.recorded_at/u);
  assert.match(migration, /support_privacy_incident_action_append_only/u);
  assert.match(workflow, /externalNotificationSent: false/u);
  assert.doesNotMatch(workflow, /sendEmail|sendSms|sendPush|fetch\(/u);
});

test('SUP-129 deadline alarm is internal, idempotent and visible only behind admin step-up', () => {
  assert.match(watchdog, /reconcilePrivacyIncidentDeadlinesWithClient/u);
  assert.match(workflow, /notification_decision_deadline_near/u);
  assert.match(workflow, /notification_decision_deadline_overdue/u);
  assert.match(workflow, /ON CONFLICT \(case_id, idempotency_key\) DO NOTHING/u);
  assert.match(app, /admin\/support\/privacy-incidents', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation/u);
  assert.match(workflow, /externalNotificationsSent: 0/u);
});

test('SUP-130 export is password re-authenticated and accepts no target account selector', () => {
  assert.match(app, /app\.post\('\/v1\/account\/export'/u);
  assert.match(app, /Object\.keys\(raw\)\.length !== 1/u);
  assert.match(app, /verifyPassword\(raw\.currentPassword/u);
  assert.match(repository, /method: 'POST'/u);
  assert.match(repository, /body: \{'currentPassword': currentPassword\}/u);
  assert.match(screen, /privacy-data-export-password/u);
  assert.match(screen, /obscureText: true/u);
});

test('SUP-131 omits received structured exact locations while preserving own account data', () => {
  assert.match(privacyExport, /message\.sent_by_me === true/u);
  assert.match(privacyExport, /THIRD_PARTY_EXACT_LOCATION_OMITTED/u);
  assert.match(privacyExport, /ownStructuredLocationsIncluded: true/u);
  assert.match(privacyExport, /privacyIncidents: supportPrivacyIncidents/u);
  for (const dataset of [
    'support_privacy_incidents',
    'support_privacy_incident_containment_actions',
  ]) assert.match(retention, new RegExp(`'${dataset}'`, 'u'));
});
