import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

import {
  readTechnicalSandboxConfiguration,
  technicalSandboxHealthProjection,
} from '../src/technical_sandbox_config.js';

const now = new Date('2026-09-19T10:00:00.000Z');

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-technical-sandbox-'));
  const keyFile = path.join(root, 'stripe-key');
  const webhookFile = path.join(root, 'webhook-secret');
  writeFileSync(keyFile, 'rk_test_synthetickey1234\n', { mode: 0o600 });
  writeFileSync(webhookFile, 'whsec_syntheticsecret1234\n', { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  chmodSync(webhookFile, 0o600);
  return {
    root,
    keyFile,
    webhookFile,
    env: {
      TECHNICAL_SANDBOX_ENABLED: 'true',
      TECHNICAL_SANDBOX_KILL_SWITCH: 'false',
      TECHNICAL_SANDBOX_SECRET_KEY_FILE: keyFile,
      TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: webhookFile,
      TECHNICAL_SANDBOX_ACCOUNT_ID: 'acct_synthetic1234',
      TECHNICAL_SANDBOX_USER_IDS: 'synthetic_sandbox_user_owner,synthetic_sandbox_user_renter',
      TECHNICAL_SANDBOX_AUTHORIZATION_ID: 'wp266-sandbox-auth-001',
      TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '2026-09-19T09:00:00.000Z',
      TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-20T09:00:00.000Z',
    },
  };
}

test('technical sandbox is default-off and unavailable in production', () => {
  const disabled = readTechnicalSandboxConfiguration({}, { deploymentEnvironment: 'development', now });
  assert.equal(disabled.available, false);
  assert.equal(disabled.mode, 'disabled');
  assert.equal(disabled.amountMinor, 100);
  const files = fixture();
  try {
    assert.throws(
      () => readTechnicalSandboxConfiguration(files.env, { deploymentEnvironment: 'production', now }),
      (error) => error.code === 'technical_sandbox_environment_forbidden',
    );
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('provider-off Green inputs ignore stale authorization and credential paths', () => {
  const configuration = readTechnicalSandboxConfiguration({
    TECHNICAL_SANDBOX_ENABLED: '0',
    TECHNICAL_SANDBOX_KILL_SWITCH: '1',
    TECHNICAL_SANDBOX_SECRET_KEY_FILE: '/stale/provider-key',
    TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: '/stale/provider-webhook',
    TECHNICAL_SANDBOX_ACCOUNT_ID: 'acct_stale',
    TECHNICAL_SANDBOX_USER_IDS: 'synthetic_sandbox_user_owner',
    TECHNICAL_SANDBOX_AUTHORIZATION_ID: 'stale-auth',
    TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '2026-09-19T09:00:00.000Z',
    TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-20T09:00:00.000Z',
  }, { deploymentEnvironment: 'test', now });
  assert.deepEqual({
    enabled: configuration.enabled,
    killSwitch: configuration.killSwitch,
    available: configuration.available,
    reason: configuration.reason,
    mode: configuration.mode,
    accountId: configuration.expectedAccountId,
    authorizationId: configuration.authorizationId,
    secretKey: configuration.secretKey,
    webhookSecret: configuration.webhookSecret,
  }, {
    enabled: false,
    killSwitch: true,
    available: false,
    reason: 'disabled',
    mode: 'disabled',
    accountId: '',
    authorizationId: '',
    secretKey: '',
    webhookSecret: '',
  });
});

test('health projection is coarse and optional-lane expiry stays non-fatal', () => {
  const projection = technicalSandboxHealthProjection({
    available: true,
    killSwitch: false,
    reason: 'available',
    provider: 'stripe',
    mode: 'test',
    expectedAccountId: 'acct_must_not_escape',
    authorizationId: 'auth_must_not_escape',
    authorizationExpiresAt: now,
    allowlistedUserIds: ['synthetic_sandbox_user_owner'],
  });
  assert.deepEqual(projection, {
    available: true,
    reason: 'available',
    provider: 'stripe',
    mode: 'test',
    amountMinor: 100,
    currency: 'EUR',
    maxRunsPerUser24h: 3,
    professionalReview: false,
    syntheticOnly: true,
  });
  assert.doesNotMatch(JSON.stringify(projection), /acct_|auth_|synthetic_sandbox_user/u);
  const expired = technicalSandboxHealthProjection({
    available: false,
    killSwitch: false,
    reason: 'authorization_expired',
  });
  assert.equal(expired.available, false);
  assert.equal(expired.mode, 'disabled');
  assert.equal(expired.reason, 'authorization_expired');
});

test('enabled staging configuration requires private file secrets and bounded synthetic users', () => {
  const files = fixture();
  try {
    const configuration = readTechnicalSandboxConfiguration(files.env, {
      deploymentEnvironment: 'staging',
      now,
    });
    assert.equal(configuration.available, true);
    assert.equal(configuration.credentialSource, 'private_0600_file');
    assert.deepEqual(configuration.allowlistedUserIds, [
      'synthetic_sandbox_user_owner',
      'synthetic_sandbox_user_renter',
    ]);
    assert.equal(configuration.amountMinor, 100);
    assert.equal(configuration.currency, 'EUR');
    assert.equal(configuration.maxRunsPerUser24h, 3);
    assert.throws(
      () => readTechnicalSandboxConfiguration({ ...files.env, TECHNICAL_SANDBOX_USER_IDS: 'real-user' }, {
        deploymentEnvironment: 'staging',
        now,
      }),
      (error) => error.code === 'technical_sandbox_user_allowlist_invalid',
    );
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('live/wrong credentials, permissive file mode, symlinks and expired authorization fail closed', () => {
  const files = fixture();
  const link = path.join(files.root, 'key-link');
  try {
    assert.throws(
      () => readTechnicalSandboxConfiguration({ ...files.env, TECHNICAL_SANDBOX_SECRET_KEY_FILE: files.webhookFile }, {
        deploymentEnvironment: 'test',
        now,
      }),
      (error) => error.code === 'technical_sandbox_secret_files_must_be_distinct',
    );
    const liveKeyFile = path.join(files.root, 'stripe-key-live');
    writeFileSync(liveKeyFile, 'sk_live_not_allowed_1234\n', { mode: 0o600 });
    assert.throws(
      () => readTechnicalSandboxConfiguration({ ...files.env, TECHNICAL_SANDBOX_SECRET_KEY_FILE: liveKeyFile }, {
        deploymentEnvironment: 'test',
        now,
      }),
      (error) => error.code === 'technical_sandbox_secret_key_must_be_restricted_test',
    );
    const standardTestKeyFile = path.join(files.root, 'stripe-key-standard-test');
    writeFileSync(standardTestKeyFile, 'sk_test_not_restricted_1234\n', { mode: 0o600 });
    assert.throws(
      () => readTechnicalSandboxConfiguration({ ...files.env, TECHNICAL_SANDBOX_SECRET_KEY_FILE: standardTestKeyFile }, {
        deploymentEnvironment: 'test',
        now,
      }),
      (error) => error.code === 'technical_sandbox_secret_key_must_be_restricted_test',
    );
    chmodSync(files.env.TECHNICAL_SANDBOX_SECRET_KEY_FILE, 0o644);
    assert.throws(
      () => readTechnicalSandboxConfiguration(files.env, { deploymentEnvironment: 'test', now }),
      (error) => error.code === 'TECHNICAL_SANDBOX_SECRET_KEY_FILE_must_be_private_0600_file',
    );
    chmodSync(files.env.TECHNICAL_SANDBOX_SECRET_KEY_FILE, 0o600);
    symlinkSync(files.env.TECHNICAL_SANDBOX_SECRET_KEY_FILE, link);
    assert.throws(
      () => readTechnicalSandboxConfiguration({ ...files.env, TECHNICAL_SANDBOX_SECRET_KEY_FILE: link }, {
        deploymentEnvironment: 'test',
        now,
      }),
      (error) => error.code === 'TECHNICAL_SANDBOX_SECRET_KEY_FILE_unreadable',
    );
    const expired = readTechnicalSandboxConfiguration({
      ...files.env,
      TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-19T09:59:59.000Z',
    }, { deploymentEnvironment: 'test', now });
    assert.equal(expired.available, false);
    assert.equal(expired.mode, 'disabled');
    assert.equal(expired.reason, 'authorization_expired');
    assert.equal(expired.secretKey, '');
    assert.equal(expired.webhookSecret, '');
    assert.throws(
      () => readTechnicalSandboxConfiguration({
        ...files.env,
        TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-21T10:00:00.000Z',
      }, { deploymentEnvironment: 'test', now }),
      (error) => error.code === 'technical_sandbox_authorization_invalid',
    );
    assert.throws(
      () => readTechnicalSandboxConfiguration({
        ...files.env,
        TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-20T10:00:01.000Z',
      }, { deploymentEnvironment: 'test', now }),
      (error) => error.code === 'technical_sandbox_authorization_invalid',
    );
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('kill switch disables an otherwise complete test configuration', () => {
  const files = fixture();
  try {
    const configuration = readTechnicalSandboxConfiguration({
      ...files.env,
      TECHNICAL_SANDBOX_KILL_SWITCH: 'true',
    }, { deploymentEnvironment: 'test', now });
    assert.equal(configuration.available, false);
    assert.equal(configuration.mode, 'disabled');
  } finally {
    rmSync(files.root, { recursive: true, force: true });
  }
});

test('expired authorization disables only the sandbox lane during config restart', () => {
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import('./backend/src/config.js').then(({ config }) => console.log(JSON.stringify({ available: config.technicalSandbox.available, mode: config.technicalSandbox.mode, reason: config.technicalSandbox.reason })))",
  ], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      JWT_SECRET: `restart-test-${'x'.repeat(40)}`,
      DATABASE_URL: 'postgresql://127.0.0.1:1/sit_test',
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'test',
      TECHNICAL_SANDBOX_ENABLED: 'true',
      TECHNICAL_SANDBOX_USER_IDS: 'synthetic_sandbox_user_owner',
      TECHNICAL_SANDBOX_AUTHORIZATION_ID: 'wp266-sandbox-auth-001',
      TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '2026-09-18T09:00:00.000Z',
      TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '2026-09-18T10:00:00.000Z',
    },
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(output), {
    available: false,
    mode: 'disabled',
    reason: 'authorization_expired',
  });
});
