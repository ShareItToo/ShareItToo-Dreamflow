import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const domain = readFileSync('backend/src/support_privacy_rights_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_privacy_rights_workflow.js', 'utf8');
const supportWorkflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const watchdog = readFileSync('backend/src/support_deadline_watchdog.js', 'utf8');
const privacyExport = readFileSync('backend/src/privacy_export.js', 'utf8');
const retention = readFileSync('backend/src/retention_inventory.js', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/047_support_privacy_rights_control_plane.up.sql',
  'utf8',
);
const rollback = readFileSync(
  'backend/sql/migrations/047_support_privacy_rights_control_plane.down.sql',
  'utf8',
);
const flutter = readFileSync('lib/screens/support_flow_screen.dart', 'utf8');

test('SUP-123 to SUP-127 intake is exact, versioned and deadline-bound', () => {
  assert.match(domain, /sit_privacy_rights_request_v1/u);
  for (const kind of [
    'access',
    'rectification',
    'erasure',
    'restriction',
    'objection',
    'portability',
  ]) assert.match(domain, new RegExp(`'${kind}'`, 'u'));
  assert.match(domain, /Europe\/Berlin/u);
  assert.match(domain, /hour: 23/u);
  assert.match(supportWorkflow, /createPrivacyRightsRequestForCase/u);
  assert.match(flutter, /privacyRightsRequest/u);
  assert.doesNotMatch(flutter, /Daten berichtigen oder löschen/u);
  assert.doesNotMatch(flutter, /Verarbeitung widersprechen oder einschränken/u);
});

test('identity verification is password re-authenticated, session-bound and never shifts the deadline', () => {
  assert.match(app, /privacy-rights\/identity-verification/u);
  assert.match(app, /verifyPassword\(currentPassword/u);
  assert.match(app, /supportPrivacyIdentityLimiter/u);
  assert.match(workflow, /verificationMethod: 'account_password'/u);
  assert.match(workflow, /deadlineShifted: false/u);
  assert.match(migration, /target_session\.user_id <> NEW\.subject_user_id/u);
  assert.match(migration, /support_privacy_identity_verification_append_only/u);
  assert.doesNotMatch(workflow, /currentPassword/u);
});

test('extension needs active admin step-up, a user-facing reason and remains single-use', () => {
  assert.match(app, /requireAdminRole, requireStaffElevation, supportPrivacyExtensionLimiter/u);
  assert.match(workflow, /privacyRightsResponseDeadline\(row\.received_at, 3\)/u);
  assert.match(workflow, /support\.privacy_rights\.deadline_extended/u);
  assert.match(migration, /target_actor\.role <> 'admin'/u);
  assert.match(migration, /target_elevation\.expires_at <= NEW\.recorded_at/u);
  assert.match(migration, /privacy_request_id UUID NOT NULL UNIQUE/u);
  assert.match(migration, /extension_count SMALLINT NOT NULL DEFAULT 0 CHECK \(extension_count IN \(0, 1\)\)/u);
});

test('deadline reminders are internal, idempotent and expose no transport', () => {
  assert.match(watchdog, /reconcilePrivacyRightsDeadlinesWithClient/u);
  assert.match(workflow, /support\.privacy_rights\.deadline_near/u);
  assert.match(workflow, /support\.privacy_rights\.deadline_overdue/u);
  assert.match(workflow, /ON CONFLICT \(case_id, idempotency_key\) DO NOTHING/u);
  assert.match(workflow, /externalNotificationsSent: 0/u);
  assert.doesNotMatch(workflow, /sendEmail|sendSms|sendPush|fetch\(/u);
});

test('legal holds stay separate and privacy artifacts are exported and inventoried safely', () => {
  assert.match(workflow, /FROM account_legal_holds AS legal_hold/u);
  assert.match(workflow, /erasureExecutionAllowed: false/u);
  assert.match(workflow, /disclosureAllowed: false/u);
  for (const table of [
    'support_privacy_rights_requests',
    'support_privacy_identity_verifications',
    'support_privacy_deadline_extensions',
  ]) {
    assert.match(privacyExport, new RegExp(`FROM ${table}(?: AS)?\\b`, 'u'));
    assert.match(retention, new RegExp(`'${table}'`, 'u'));
  }
  assert.doesNotMatch(privacyExport, /identity_verification_session_id/u);
  assert.doesNotMatch(privacyExport, /recorded_session_id|staff_elevation_id/u);
  assert.match(rollback, /DROP TABLE IF EXISTS support_privacy_rights_requests/u);
});
