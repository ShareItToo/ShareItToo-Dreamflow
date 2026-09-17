import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Staging MFA overlay is file-only, read-only and missing-host-path safe', async () => {
  const compose = await read('backend/compose.staging.mfa.yml');
  assert.match(compose, /MFA_ENCRYPTION_KEY:\s*["']{2}/u);
  assert.match(compose, /MFA_ENCRYPTION_KEY_FILE:\s*\/run\/secrets\/mfa-encryption-key/u);
  assert.match(compose, /MFA_ENCRYPTION_KEY_HOST_FILE:\?MFA_ENCRYPTION_KEY_HOST_FILE/u);
  assert.match(compose, /read_only:\s*true/u);
  assert.match(compose, /create_host_path:\s*false/u);
});

test('deploy gate binds MFA to exact commit and fail-safe rollback/readiness', async () => {
  const deploy = await read('backend/ops/deploy_release.sh');
  for (const marker of [
    'ENABLE_STAGING_MFA',
    'CONFIRM_STAGING_MFA',
    'MFA_ENCRYPTION_KEY_HOST_FILE',
    'validate_mfa_staging_secret.mjs',
    'compose.staging.mfa.yml',
    'MFA_ENCRYPTION_KEY_FILE: ""',
    'credentialSource === "file"',
    'stagingMfa',
  ]) {
    assert.match(deploy, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(deploy, /task_enable_staging_mfa.*== 1.*task_environment.*production/su);
});

test('health exposes only MFA configured/source metadata', async () => {
  const app = await read('backend/src/app.js');
  assert.match(app, /const mfaHealth = Object\.freeze\(\{/u);
  assert.match(app, /configured: config\.mfa\.configured/u);
  assert.match(app, /credentialSource: config\.mfa\.credentialSource/u);
  assert.doesNotMatch(app, /encryptionKey.*mfaHealth/u);
});
