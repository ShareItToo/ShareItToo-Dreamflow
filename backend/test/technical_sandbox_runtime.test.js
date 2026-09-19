import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { validateTechnicalSandboxStaging } from '../ops/validate_technical_sandbox_staging.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-technical-sandbox-runtime-'));
  const keyFile = path.join(root, 'technical-rk-test');
  const webhookFile = path.join(root, 'technical-webhook-secret');
  writeFileSync(keyFile, 'rk_test_synthetickey1234\n', { mode: 0o600 });
  writeFileSync(webhookFile, 'whsec_syntheticsecret1234\n', { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  chmodSync(webhookFile, 0o600);
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  return {
    root,
    keyFile,
    webhookFile,
    env: {
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      SIT_DEPLOYMENT_ENVIRONMENT: 'test',
      TECHNICAL_SANDBOX_ENABLED: '1',
      TECHNICAL_SANDBOX_KILL_SWITCH: '0',
      TECHNICAL_SANDBOX_SECRET_KEY_HOST_FILE: keyFile,
      TECHNICAL_SANDBOX_WEBHOOK_SECRET_HOST_FILE: webhookFile,
      TECHNICAL_SANDBOX_API_UID: String(uid),
      TECHNICAL_SANDBOX_API_GID: String(gid),
      TECHNICAL_SANDBOX_SECRET_KEY_FILE: keyFile,
      TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: webhookFile,
      TECHNICAL_SANDBOX_ACCOUNT_ID: 'acct_synthetic1234',
      TECHNICAL_SANDBOX_USER_IDS: 'synthetic_sandbox_user_owner,synthetic_sandbox_user_renter',
      TECHNICAL_SANDBOX_AUTHORIZATION_ID: 'wp266-sandbox-auth-001',
      TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '2026-09-19T09:00:00.000Z',
      TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-20T09:00:00.000Z',
      PAYMENT_TRANSPORT: 'memory',
      STRIPE_LIVEMODE: 'false',
      ENABLE_STAGING_STRIPE: '0',
    },
  };
}

test('technical sandbox overlay is isolated from the main payment lane', () => {
  const overlay = readFileSync(
    path.join(repositoryRoot, 'backend/compose.staging.technical-sandbox.yml'),
    'utf8',
  );
  assert.match(overlay, /user: "1000:1000"/u);
  assert.match(overlay, /PAYMENT_TRANSPORT: memory/u);
  assert.match(overlay, /STRIPE_SECRET_KEY: ""/u);
  assert.match(overlay, /TECHNICAL_SANDBOX_SECRET_KEY_FILE/u);
  assert.match(overlay, /TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE/u);
  assert.match(overlay, /read_only: true/u);
  assert.match(overlay, /create_host_path: false/u);
  assert.equal((overlay.match(/source: \$\{TECHNICAL_SANDBOX_[A-Z_]+_HOST_FILE/g) ?? []).length, 2);
  assert.doesNotMatch(overlay, /PAYMENT_TRANSPORT: stripe/u);
});

test('runtime gate accepts only pilot-owned 0600 files and bounded synthetic config', () => {
  const files = fixture();
  try {
    const result = validateTechnicalSandboxStaging({
      env: files.env,
      deploymentEnvironment: 'test',
      now: new Date('2026-09-19T10:00:00.000Z'),
    });
    assert.deepEqual(result, {
      available: true,
      provider: 'stripe',
      mode: 'test',
      amountMinor: 100,
      currency: 'EUR',
      maxRunsPerUser24h: 3,
      professionalReview: false,
      syntheticOnly: true,
      credentialSource: 'private_0600_file',
    });
    assert.throws(
      () => validateTechnicalSandboxStaging({
        env: { ...files.env, SIT_STAGING_PILOT_ID: 'other_pilot' },
        deploymentEnvironment: 'test',
      }),
      (error) => error.code === 'technical_sandbox_pilot_required',
    );
    assert.throws(
      () => validateTechnicalSandboxStaging({
        env: { ...files.env, ENABLE_STAGING_STRIPE: '1' },
        deploymentEnvironment: 'test',
      }),
      (error) => error.code === 'technical_sandbox_main_payment_boundary_invalid',
    );
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('runtime gate rejects symlink and expired authorization without secret output', () => {
  const files = fixture();
  const link = path.join(files.root, 'technical-rk-link');
  try {
    symlinkSync(files.keyFile, link);
    assert.throws(
      () => validateTechnicalSandboxStaging({
        env: { ...files.env, TECHNICAL_SANDBOX_SECRET_KEY_HOST_FILE: link },
        deploymentEnvironment: 'test',
      }),
      (error) => error.code === 'technical_sandbox_secret_key_symlink_forbidden'
        || error.code === 'technical_sandbox_secret_key_must_be_0600_api_owned_file',
    );
    assert.throws(
      () => validateTechnicalSandboxStaging({
        env: {
          ...files.env,
          TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-19T09:59:59.000Z',
        },
        deploymentEnvironment: 'test',
        now: new Date('2026-09-19T10:00:00.000Z'),
      }),
      (error) => error.code === 'technical_sandbox_configuration_invalid',
    );
  } catch (error) {
    if (error?.code !== 'technical_sandbox_secret_key_symlink_forbidden'
        && error?.code !== 'technical_sandbox_secret_key_must_be_0600_api_owned_file') {
      throw error;
    }
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('deploy gate wires a technical-only flag and keeps Stripe activation separate', () => {
  const deploy = readFileSync(
    path.join(repositoryRoot, 'backend/ops/deploy_release.sh'),
    'utf8',
  );
  assert.match(deploy, /ENABLE_STAGING_TECHNICAL_SANDBOX/u);
  assert.match(deploy, /compose\.staging\.technical-sandbox\.yml/u);
  assert.match(deploy, /technical Sandbox override is forbidden for production/u);
  assert.match(deploy, /ENABLE_STAGING_STRIPE.*task_enable_staging_stripe/u);
});
