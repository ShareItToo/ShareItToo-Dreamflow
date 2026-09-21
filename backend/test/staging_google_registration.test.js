import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  assertStagingGoogleRegistrationToken,
  identityDigest,
  pruneExpiredStagingGoogleRegistrationReplays,
  readStagingGoogleRegistrationConfiguration,
  reserveStagingGoogleRegistrationReplay,
  resolveStagingGoogleRegistration,
} from '../src/staging_google_registration.js';

const userId = '11111111-1111-4111-8111-111111111111';
const now = 1_800_000_000_000;
const identity = {
  provider: 'google',
  subject: 'google-subject-fixture',
  email: 'pilot@example.test',
  emailVerified: true,
};
const digest = identityDigest(identity);
const access = {
  enabled: true,
  valid: true,
  allowedUserIds: [userId],
};

function enabledEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER: 'google',
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: `${digest}=${userId}`,
    ...overrides,
  };
}

test('registration is default-off and never accepts configured data while disabled', () => {
  assert.deepEqual(readStagingGoogleRegistrationConfiguration({}, {
    stagingAccess: access,
    firebaseAuthEnabled: true,
    stripeLivemode: false,
  }), {
    enabled: false,
    provider: 'google',
    allowlist: [],
    replayWindowSeconds: 3600,
  });
  assert.throws(() => readStagingGoogleRegistrationConfiguration({
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: `${digest}=${userId}`,
  }), /disabled_configured/);
});

test('enabled configuration requires staging, Firebase, non-livemode, and access gate', () => {
  const configuration = readStagingGoogleRegistrationConfiguration(enabledEnvironment(), {
    stagingAccess: access,
    firebaseAuthEnabled: true,
    stripeLivemode: false,
  });
  assert.equal(configuration.enabled, true);
  assert.deepEqual(configuration.allowlist, [{ digest, userId }]);
  for (const [overrides, code] of [
    [{ DEPLOYMENT_ENVIRONMENT: 'production' }, 'requires_staging'],
    [{}, 'requires_firebase'],
    [{}, 'livemode_forbidden'],
    [{}, 'requires_access_gate'],
  ]) {
    const options = {
      stagingAccess: overrides === undefined ? access : (code === 'requires_access_gate'
        ? { ...access, enabled: false }
        : access),
      firebaseAuthEnabled: code === 'requires_firebase' ? false : true,
      stripeLivemode: code === 'livemode_forbidden',
    };
    assert.throws(
      () => readStagingGoogleRegistrationConfiguration(enabledEnvironment(overrides), options),
      new RegExp(code),
    );
  }
});

test('allowlisted identity resolves idempotently and rejects identity policy violations', () => {
  const configuration = readStagingGoogleRegistrationConfiguration(enabledEnvironment(), {
    stagingAccess: access,
    firebaseAuthEnabled: true,
    stripeLivemode: false,
  });
  assert.deepEqual(resolveStagingGoogleRegistration(configuration, identity), {
    digest,
    userId,
    provider: 'google',
  });
  assert.throws(() => resolveStagingGoogleRegistration(configuration, {
    ...identity,
    provider: 'apple',
  }), /provider_mismatch/);
  assert.throws(() => resolveStagingGoogleRegistration(configuration, {
    ...identity,
    email: 'other@example.test',
  }), /not_allowlisted/);
  assert.throws(() => resolveStagingGoogleRegistration(configuration, {
    ...identity,
    firebaseUserId: 'different-firebase-user',
  }), /not_allowlisted/);
  assert.throws(() => resolveStagingGoogleRegistration(configuration, {
    ...identity,
    emailVerified: false,
  }), /email_unverified/);
});

test('fresh token claims are bounded and replay reservation is durable and opaque', async () => {
  const tokenDigest = crypto.createHash('sha256').update('synthetic-token', 'utf8').digest('hex');
  const token = assertStagingGoogleRegistrationToken({
    tokenDigest,
    tokenIssuedAt: Math.floor(now / 1000) - 60,
    tokenExpiresAt: Math.floor(now / 1000) + 600,
    tokenAuthTime: Math.floor(now / 1000) - 60,
  }, now);
  assert.equal(token.tokenDigest, tokenDigest);
  assert.throws(() => assertStagingGoogleRegistrationToken({
    tokenDigest,
    tokenIssuedAt: Math.floor(now / 1000) - 7200,
    tokenExpiresAt: Math.floor(now / 1000) - 1,
    tokenAuthTime: Math.floor(now / 1000) - 7200,
  }, now), /token_expired/);
  assert.throws(() => assertStagingGoogleRegistrationToken({
    tokenDigest,
    tokenIssuedAt: Math.floor(now / 1000),
    tokenExpiresAt: Math.floor(now / 1000) + 7201,
    tokenAuthTime: Math.floor(now / 1000),
  }, now), /lifetime_invalid/);
  assert.throws(() => assertStagingGoogleRegistrationToken({
    tokenDigest,
    tokenIssuedAt: Math.floor(now / 1000) - 30,
    tokenExpiresAt: Math.floor(now / 1000) + 700,
    tokenAuthTime: Math.floor(now / 1000) - 30,
  }, now, 600), /lifetime_invalid/);

  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('DELETE')) return { rowCount: 0 };
      return { rowCount: 1, rows: [{ token_digest: tokenDigest }] };
    },
  };
  await reserveStagingGoogleRegistrationReplay(client, {
    tokenDigest,
    identityDigest: digest,
    expiresAt: token.expiresAt,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params[0], tokenDigest);
  assert.equal(calls[1].params[1], digest);
  assert(!calls.flatMap(({ params }) => params).some((value) => String(value).includes('@')));
});

test('replay and invalid identity data fail closed', async () => {
  const digestValue = 'a'.repeat(64);
  const client = {
    async query(sql) {
      if (sql.startsWith('DELETE')) return { rowCount: 0 };
      return { rowCount: 0, rows: [] };
    },
  };
  await assert.rejects(
    reserveStagingGoogleRegistrationReplay(client, {
      tokenDigest: digestValue,
      identityDigest: digestValue,
      expiresAt: new Date(Date.now() + 60_000),
    }),
    /staging_google_registration_replay$/,
  );
  assert.throws(() => readStagingGoogleRegistrationConfiguration(enabledEnvironment({
    SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER: 'apple',
  }), { stagingAccess: access, firebaseAuthEnabled: true, stripeLivemode: false }), /provider_invalid/);
  assert.throws(() => readStagingGoogleRegistrationConfiguration(enabledEnvironment({
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: `${digest}=not a valid id`,
  }), { stagingAccess: access, firebaseAuthEnabled: true, stripeLivemode: false }), /allowlist_invalid/);
});

test('expired replay protection remains explicitly maintainable while the lane is disabled', async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rowCount: 2, rows: [] };
  } };
  await pruneExpiredStagingGoogleRegistrationReplays(client);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /expires_at <= now\(\)/u);
  assert.deepEqual(calls[0].params, undefined);
});
