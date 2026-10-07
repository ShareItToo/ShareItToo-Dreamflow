import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const screen = readFileSync('lib/screens/support_cases_screen.dart', 'utf8');
const app = readFileSync('backend/src/app.js', 'utf8');
const workflow = readFileSync('backend/src/support_appeal_workflow.js', 'utf8');

test('authenticated client retains appeal receipts and submits exact case versions', () => {
  const detailStart = repository.indexOf(
    'static Future<Map<String, dynamic>> getSupportCase(',
  );
  const submitStart = repository.indexOf(
    'static Future<Map<String, dynamic>> submitSupportAppeal',
    detailStart,
  );
  const end = repository.indexOf(
    'static Future<Map<String, dynamic>> createBookingReview',
    submitStart,
  );
  assert.ok(detailStart >= 0 && submitStart > detailStart && end > submitStart);
  const methods = repository.slice(detailStart, end);
  assert.match(methods, /getSupportCase\(\s*String caseId,\s*\{\s*required AuthSessionOwner owner/u);
  assert.match(methods, /_authorizedForOwner\(\s*owner: owner/u);
  assert.match(methods, /final appeal = response\['appeal'\]/u);
  assert.match(methods, /'appeal': appeal == null/u);
  assert.match(methods, /\/support\/cases\/\$\{Uri\.encodeComponent\(caseId\)\}\/appeals/u);
  assert.match(methods, /'expectedVersion': expectedVersion/u);
  assert.match(methods, /'Idempotency-Key': idempotencyKey/u);
});

test('appeal surface and route remain explicit, reporter-bound and non-live', () => {
  assert.match(screen, /ValueKey\('support_appeal_grounds'\)/u);
  assert.match(screen, /widget\.supportCase\.version/u);
  assert.match(screen, /Noch keine Datei anhängen/u);
  assert.match(
    app,
    /app\.post\('\/v1\/support\/cases\/:id\/appeals', requireAuth, requireActiveAccount, actionLimiter/u,
  );
  assert.match(workflow, /supportCase\.reporter_user_id !== actor\.id/u);
  assert.match(workflow, /externalMessageSent: false/u);
  assert.match(workflow, /automaticReopen: false/u);
  assert.match(workflow, /new_evidence_ids[\s\S]*'\{\}'::uuid\[\]/u);
  assert.doesNotMatch(workflow, /publishTo|sendEmail|sendPush|refundPayment|releasePayout/u);
});

test('appeal status has an explicit admin claim/resolve path and durable receipt fallback', () => {
  assert.match(workflow, /export async function listSupportAppeals/u);
  assert.match(workflow, /export async function claimSupportAppeal/u);
  assert.match(workflow, /export async function resolveSupportAppeal/u);
  assert.match(workflow, /case_next_update_at/u);
  assert.match(workflow, /status = 'under_review'/u);
  assert.match(workflow, /independence_flag = true/u);
  assert.match(workflow, /automaticReopen: false/u);
  assert.match(workflow, /externalMessageSent: false/u);
  assert.match(workflow, /support_appeal_implementation_changes_required/u);
  assert.match(
    app,
    /app\.get\('\/v1\/admin\/support\/appeals'[\s\S]*?requireAdminRole[\s\S]*?requireStaffElevation/u,
  );
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/appeals\/:id\/claim'[\s\S]*?requireAdminRole[\s\S]*?requireStaffElevation/u,
  );
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/appeals\/:id\/resolve'[\s\S]*?requireAdminRole[\s\S]*?requireStaffElevation/u,
  );
});
