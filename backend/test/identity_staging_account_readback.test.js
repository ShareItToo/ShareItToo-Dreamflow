import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  identityAccountContextHash,
  identityVerificationSessionIdHash,
  validateIdentityStagingAccountReadback,
} from '../ops/validate_identity_staging_account_readback.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const now = Date.parse('2026-09-19T12:00:00.000Z');
const account = {
  id: 'acct_testidentitystaging',
  country: 'DE',
  default_currency: 'eur',
  type: 'express',
};
const sessionId = 'vs_testidentitysession';

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sit-identity-readback-'));
  const evidenceFile = join(root, 'readback.json');
  const secretKeyFile = join(root, 'identity-key');
  const sessionIdFile = join(root, 'session-id');
  await writeFile(evidenceFile, JSON.stringify({
    kind: 'sit-stripe-identity-staging-account-readback',
    commit,
    pilotId: 'heilbronn_wave0',
    mode: 'test',
    provider: 'stripe_identity',
    credentialSource: 'file',
    secretKeyClass: 'rk_test_',
    webhookSecretConfigured: true,
    accountId: account.id,
    accountContextHash: identityAccountContextHash(account),
    verificationSessionIdHash: identityVerificationSessionIdHash(sessionId),
    observedAt: '2026-09-19T11:00:00.000Z',
    ...overrides,
  }), { mode: 0o600 });
  await writeFile(secretKeyFile, `rk_test_${'k'.repeat(24)}\n`, { mode: 0o600 });
  await writeFile(sessionIdFile, `${sessionId}\n`, { mode: 0o600 });
  for (const file of [evidenceFile, secretKeyFile, sessionIdFile]) await chmod(file, 0o600);
  return { root, evidenceFile, secretKeyFile, sessionIdFile };
}

function sdkFixture({ session = { id: sessionId, status: 'requires_input', livemode: false } } = {}) {
  const calls = [];
  return {
    calls,
    accounts: {
      async retrieve(...args) {
        calls.push(['account', args]);
        return { ...account };
      },
    },
    identity: {
      verificationSessions: {
        async retrieve(...args) {
          calls.push(['session', args]);
          return { ...session };
        },
      },
    },
  };
}

test('Identity readback uses real provider-shaped account/session reads and no mutation', async () => {
  const files = await fixture();
  const sdk = sdkFixture();
  try {
    const result = await validateIdentityStagingAccountReadback({
      evidenceFile: files.evidenceFile,
      secretKeyFile: files.secretKeyFile,
      verificationSessionIdFile: files.sessionIdFile,
      deploymentCommit: commit,
      pilotId: 'heilbronn_wave0',
      now,
      stripeClient: sdk,
    });
    assert.equal(result.providerReadback, true);
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(sdk.calls.map(([kind]) => kind), ['account', 'session']);
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});

test('Identity readback rejects live keys before network and rejects live sessions', async () => {
  const liveKey = await fixture();
  const liveSession = await fixture();
  await writeFile(liveKey.secretKeyFile, `rk_live_${'k'.repeat(24)}\n`, { mode: 0o600 });
  const sdk = sdkFixture({ session: { id: sessionId, status: 'processing', livemode: true } });
  try {
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidenceFile: liveKey.evidenceFile,
        secretKeyFile: liveKey.secretKeyFile,
        verificationSessionIdFile: liveKey.sessionIdFile,
        deploymentCommit: commit,
        pilotId: 'heilbronn_wave0',
        now,
        stripeClient: sdk,
      }),
      (error) => error.code === 'identity_staging_secret_key_invalid',
    );
    assert.equal(sdk.calls.length, 0);
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidenceFile: liveSession.evidenceFile,
        secretKeyFile: liveSession.secretKeyFile,
        verificationSessionIdFile: liveSession.sessionIdFile,
        deploymentCommit: commit,
        pilotId: 'heilbronn_wave0',
        now,
        stripeClient: sdk,
      }),
      (error) => error.code === 'identity_staging_readback_session_invalid',
    );
  } finally {
    await rm(liveKey.root, { recursive: true, force: true });
    await rm(liveSession.root, { recursive: true, force: true });
  }
});

test('Identity readback binds hashes and rejects sensitive/stale/symlink evidence', async () => {
  const mismatch = await fixture({ accountContextHash: 'a'.repeat(64) });
  const stale = await fixture({ observedAt: '2026-09-17T11:00:00.000Z' });
  const secretField = await fixture({ clientSecret: 'never-store-this' });
  const linkRoot = await mkdtemp(join(tmpdir(), 'sit-identity-readback-link-'));
  const link = join(linkRoot, 'link.json');
  try {
    await symlink(mismatch.evidenceFile, link);
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidenceFile: mismatch.evidenceFile,
        secretKeyFile: mismatch.secretKeyFile,
        verificationSessionIdFile: mismatch.sessionIdFile,
        deploymentCommit: commit,
        pilotId: 'heilbronn_wave0', now, stripeClient: sdkFixture(),
      }),
      (error) => error.code === 'identity_staging_readback_account_mismatch',
    );
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidenceFile: stale.evidenceFile,
        secretKeyFile: stale.secretKeyFile,
        verificationSessionIdFile: stale.sessionIdFile,
        deploymentCommit: commit,
        pilotId: 'heilbronn_wave0', now, stripeClient: sdkFixture(),
      }),
      (error) => error.code === 'identity_staging_readback_stale',
    );
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidenceFile: secretField.evidenceFile,
        secretKeyFile: secretField.secretKeyFile,
        verificationSessionIdFile: secretField.sessionIdFile,
        deploymentCommit: commit,
        pilotId: 'heilbronn_wave0', now, stripeClient: sdkFixture(),
      }),
      (error) => error.code === 'identity_staging_readback_sensitive_field:root.clientSecret',
    );
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidenceFile: link,
        secretKeyFile: mismatch.secretKeyFile,
        verificationSessionIdFile: mismatch.sessionIdFile,
        deploymentCommit: commit,
        pilotId: 'heilbronn_wave0', now, stripeClient: sdkFixture(),
      }),
      (error) => error.code === 'identity_staging_readback_evidence_location_invalid',
    );
  } finally {
    await rm(mismatch.root, { recursive: true, force: true });
    await rm(stale.root, { recursive: true, force: true });
    await rm(secretField.root, { recursive: true, force: true });
    await rm(linkRoot, { recursive: true, force: true });
  }
});
