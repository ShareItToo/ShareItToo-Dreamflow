import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../../backend/src/app.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../../backend/src/server.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../../backend/src/config.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../../backend/sql/migrations/022_crashlytics_subject_deletion.up.sql', import.meta.url),
  'utf8',
);

test('provider execution remains explicitly default-off', () => {
  assert.match(config, /FIREBASE_CRASH_REPORT_DELETION_ENABLED \?\? 'false'/u);
  assert.match(app, /if \(!config\.crashReportDeletion\.enabled\)/u);
  assert.match(server, /config\.crashReportDeletion\.enabled\s*\?/u);
});

test('account erasure queues Crashlytics reports before local identity teardown', () => {
  const queue = app.indexOf('enqueueCrashlyticsReportDeletions(client');
  const identities = app.indexOf("DELETE FROM auth_identities WHERE user_id = $1");
  assert.ok(queue > 0 && identities > queue);
  assert.match(app, /attemptCrashlyticsReportDeletion\(outcome\.crashlyticsReportDeletionIds\)/u);
});

test('provider queue deliberately contains no SIT account reference', () => {
  const outboxStart = migration.indexOf('CREATE TABLE IF NOT EXISTS crashlytics_report_deletion_outbox');
  const outboxEnd = migration.indexOf('CREATE INDEX IF NOT EXISTS', outboxStart);
  const outbox = migration.slice(outboxStart, outboxEnd);
  assert.doesNotMatch(outbox, /user_id/u);
  assert.match(outbox, /firebase_app_id/u);
  assert.match(outbox, /subject_id UUID NOT NULL/u);
});

test('client transmission is not silently introduced by this foundation', () => {
  const runtime = fs.readFileSync(
    new URL('../../lib/services/firebase_runtime.dart', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(runtime, /setUserIdentifier\(|setUserId\(/u);
});
