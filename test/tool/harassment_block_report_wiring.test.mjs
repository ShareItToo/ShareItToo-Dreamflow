import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

const domain = read('backend/src/moderation_domain.js');
const workflow = read('backend/src/moderation_workflow.js');
const app = read('backend/src/app.js');
const repository = read('lib/services/backend_repository.dart');
const service = read('lib/services/user_reports_service.dart');
const screen = read('lib/screens/report_user_screen.dart');
const up = read('backend/sql/migrations/060_harassment_block_report_guard.up.sql');
const down = read('backend/sql/migrations/060_harassment_block_report_guard.down.sql');

test('SUP-094 diverts acute danger and keeps policy fields server-owned', () => {
  assert.match(domain, /immediate_danger_requires_safety_path/u);
  assert.match(domain, /non_acute_confirmation_required/u);
  assert.match(domain, /reasonCode: 'harassment'/u);
  assert.match(domain, /priority: 'normal'/u);
  assert.match(screen, /110 oder 112/u);
  assert.match(screen, /SIT ist kein Notfalldienst/u);
  assert.match(screen, /_immediateDanger != false/u);
  assert.match(service, /if \(immediateDanger\)/u);
});

test('SUP-094 binds report, direct-contact block and neutral review atomically', () => {
  assert.match(app, /\/v1\/reports\/harassment-block[\s\S]*inTransaction/u);
  assert.match(workflow, /harassment_requires_block_report_path/u);
  assert.match(workflow, /await createReport\([\s\S]*await blockUser\([\s\S]*report\.harassment_blocked_for_reporter/u);
  assert.match(workflow, /neutralReviewRequired: true/u);
  assert.match(workflow, /guiltDetermined: false/u);
  assert.match(workflow, /moderationAccountMeasureTaken: false/u);
  assert.match(workflow, /externalActionTaken: false/u);
  assert.match(repository, /createHarassmentBlockReport/u);
  assert.match(service, /BackendRepository\.createHarassmentBlockReport\(/u);
  assert.match(
    service,
    /LocalSafetyPrivacyService\.addHarassmentReportAndBlock\(/u,
  );
  assert.doesNotMatch(service, /BlockedUsersService\.blockUser/u);
  assert.match(screen, /Blockieren und melden/u);
  assert.match(screen, /noch kein Verstoß und keine Schuld festgestellt/u);
});

test('SUP-094 audit is exact, immutable and rollback-guarded', () => {
  assert.match(up, /audit_log_harassment_block_report_request_idx/u);
  assert.match(up, /\(SELECT count\(\*\) FROM jsonb_object_keys\(NEW\.metadata\)\) <> 8/u);
  assert.match(up, /active direct-contact block/u);
  assert.match(up, /requestFingerprint/u);
  assert.match(down, /cannot roll back harassment block-report guard while audit evidence exists/u);
});
