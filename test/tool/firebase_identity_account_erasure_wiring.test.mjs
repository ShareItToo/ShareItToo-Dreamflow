import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../backend/src/app.js', import.meta.url), 'utf8');
const worker = readFileSync(
  new URL('../../backend/src/firebase_identity_cleanup.js', import.meta.url),
  'utf8',
);
const server = readFileSync(new URL('../../backend/src/server.js', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../../backend/sql/migrations/021_firebase_identity_deletion_outbox.up.sql',
    import.meta.url,
  ),
  'utf8',
);
const legalPrivacy = readFileSync(
  new URL('../../lib/screens/legal_privacy_screen.dart', import.meta.url),
  'utf8',
);
const privacyInfo = readFileSync(
  new URL('../../lib/screens/privacy_info_screen.dart', import.meta.url),
  'utf8',
);
const publicPrivacy = readFileSync(
  new URL('../../backend/src/account_actions.js', import.meta.url),
  'utf8',
);

test('provider deletion is queued before local social identity erasure', () => {
  const enqueue = app.indexOf('enqueueFirebaseIdentityDeletions(client,');
  const localErase = app.indexOf(
    "await client.query('DELETE FROM auth_identities WHERE user_id = $1'",
  );
  assert.ok(enqueue > 0);
  assert.ok(localErase > enqueue);
  assert.match(app, /firebaseIdentityDeletionIds/u);
  assert.match(app, /attemptFirebaseIdentityDeletion/u);
});

test('durable queue is bounded to supported social providers and has no SIT user link', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS firebase_identity_deletion_outbox/u);
  assert.match(migration, /provider IN \('google', 'apple', 'facebook'\)/u);
  assert.match(migration, /status IN \('pending', 'processing', 'retry'\)/u);
  assert.doesNotMatch(migration, /^\s*user_id\s+TEXT/mu);
  assert.match(migration, /firebase_identity_deletion_outbox_due_idx/u);
});

test('worker claims safely retries and deletes only after terminal provider outcome', () => {
  assert.match(worker, /FOR UPDATE SKIP LOCKED/u);
  assert.match(worker, /status = 'processing'/u);
  assert.match(worker, /status = 'retry'/u);
  assert.match(worker, /userNotFoundCodes\.has\(code\)/u);
  assert.match(worker, /DELETE FROM firebase_identity_deletion_outbox WHERE id = \$1/u);
  assert.match(worker, /providerErrorCode/u);
  assert.doesNotMatch(worker, /console\.error\([\s\S]{0,120}firebaseUserId/u);
});

test('retry worker follows API lifecycle', () => {
  assert.match(server, /startFirebaseIdentityCleanupWorker\(\{/u);
  assert.match(server, /stopFirebaseIdentityCleanup\(\)/u);
});

test('all user-facing privacy copies disclose provider deletion and retry', () => {
  for (const [label, source] of [
    ['legal', legalPrivacy],
    ['in-app', privacyInfo],
    ['public', publicPrivacy],
  ]) {
    assert.match(source, /Firebase-Authentifizierungsidentität/u, label);
    assert.match(source, /Anbieterlöschung/u, label);
    assert.match(source, /erneut angefragt/u, label);
    assert.match(source, /180 Tage|180 Tagen/u, label);
  }
});
