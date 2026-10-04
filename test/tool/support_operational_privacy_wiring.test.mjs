import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const metrics = readFileSync('backend/src/support_operational_metrics.js', 'utf8');
const firebase = readFileSync('lib/services/firebase_runtime.dart', 'utf8');

test('SUP-165 exposes only elevated admin aggregate support metrics', () => {
  assert.match(
    app,
    /app\.get\('\/v1\/admin\/support\/operational-metrics', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation/u,
  );
  assert.match(app, /Cache-Control', 'private, no-store'/u);
  assert.match(metrics, /WITH closed_case_cohort/u);
  assert.match(metrics, /SELECT DISTINCT closed_case\.case_id/u);
  assert.match(metrics, /aggregateOnly: true/u);
  assert.match(metrics, /containsPersonalData: false/u);
  assert.match(metrics, /externalAnalyticsSent: false/u);
  assert.doesNotMatch(
    metrics,
    /SELECT[^;]*(reporter_user_id|affected_user_ids|user_facing_summary|internal_summary|structured_payload|actor_id)/iu,
  );
});

test('SUP-166 keeps Crashlytics collection behind release plus user opt-in', () => {
  assert.match(firebase, /releaseMode && userEnabled/u);
  assert.doesNotMatch(firebase, /setCrashlyticsCollectionEnabled\(\s*true/u);
  const toggle = firebase.match(/static Future<FirebaseServiceToggleResult> setCrashDiagnosticsResult\([\s\S]*?\n  \}\n\n  \/\/\//u)?.[0] ?? '';
  const cleanup = firebase.match(/static Future<bool> _retryPendingCrashCleanup\([\s\S]*?\n  \}\n\n  static Future<String\?>/u)?.[0] ?? '';
  assert.match(toggle, /if \(!enabled\)/u);
  assert.match(toggle, /setCrashDiagnosticsEnabled\(false\)/u);
  assert.match(toggle, /setCrashDiagnosticsCleanupPending\(\s*true\s*,/u);
  assert.match(toggle, /final cleaned = await _retryPendingCrashCleanup\(\)/u);
  assert.match(toggle, /disabledCleanupPending/u);
  assert.match(cleanup, /setCrashlyticsCollectionEnabled\(false\)/u);
  assert.match(cleanup, /setCrashlyticsCollectionEnabled\(false\)[\s\S]*deleteUnsentReports\(\)/u);
  assert.match(cleanup, /deleteUnsentReports\(\)[\s\S]*setCrashDiagnosticsCleanupPending\(\s*false\s*,/u);
});

test('SUP-167 blocks user identifiers and direct unguarded custom keys', () => {
  assert.doesNotMatch(firebase, /\.setUserIdentifier\s*\(/u);
  const directCustomKeyCalls = firebase.match(/\.setCustomKey\s*\(/gu) ?? [];
  assert.equal(directCustomKeyCalls.length, 1);
  assert.match(firebase, /controlledCrashDiagnosticCustomValueAllowed\(key, value\)/u);
  for (const key of [
    'sit_release_commit',
    'sit_build_number',
    'sit_release_channel',
    'sit_diagnostic_run_id',
  ]) {
    assert.match(firebase, new RegExp(`'${key}'`, 'u'));
  }
  for (const forbidden of ['user_id', 'case_id', 'account_id', 'email']) {
    assert.doesNotMatch(firebase, new RegExp(`'${forbidden}'`, 'u'));
  }
});
