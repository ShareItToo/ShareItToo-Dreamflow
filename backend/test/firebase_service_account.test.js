import assert from 'node:assert/strict';
import test from 'node:test';

import { validateFirebaseServiceAccount } from '../src/firebase_service_account.js';

const projectId = 'shareittoo-staging-2026';
const privateKeyBegin = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
const privateKeyEnd = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');

function fixture(overrides = {}) {
  return {
    type: 'service_account',
    project_id: projectId,
    private_key_id: 'a'.repeat(40),
    private_key: `${privateKeyBegin}\nsynthetic-test-material\n${privateKeyEnd}\n`,
    client_email: `push-sender@${projectId}.iam.gserviceaccount.com`,
    client_id: '123456789012345678901',
    token_uri: 'https://oauth2.googleapis.com/token',
    ...overrides,
  };
}

test('accepts a structurally valid matching Firebase service account', () => {
  assert.equal(validateFirebaseServiceAccount(fixture(), projectId).project_id, projectId);
});

test('accepts the same credential as JSON text without exposing it', () => {
  assert.equal(validateFirebaseServiceAccount(JSON.stringify(fixture()), projectId).type, 'service_account');
});

test('rejects credentials from another Firebase project', () => {
  assert.throws(
    () => validateFirebaseServiceAccount(fixture({ project_id: 'other-project' }), projectId),
    /push_fcm_credentials_invalid/,
  );
});

test('rejects a malformed private key', () => {
  assert.throws(
    () => validateFirebaseServiceAccount(fixture({ private_key: 'not-a-key' }), projectId),
    /push_fcm_credentials_invalid/,
  );
});

test('rejects a non-service-account credential type', () => {
  assert.throws(
    () => validateFirebaseServiceAccount(fixture({ type: 'authorized_user' }), projectId),
    /push_fcm_credentials_invalid/,
  );
});
