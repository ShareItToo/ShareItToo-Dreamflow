import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { encryptAppleRevocationMaterial, normalizeAppleRevocationMaterial } from '../src/apple_revocation.js';

// Diagnostic harness: execute the exact current route body with explicit
// synthetic collaborators. This is NOT PostgreSQL, HTTP or provider evidence.
// No hand-copied exchange sequence or simplified substitute is executed.
const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const start = source.indexOf("  app.post('/v1/auth/social',");
const end = source.indexOf("  app.get('/v1/payments/connect/return'", start);
assert.ok(start >= 0 && end > start);
const routeSource = source.slice(start, end);

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function harness() {
  const owner = `apple-w4-${crypto.randomUUID()}`;
  const subject = `apple-w4-subject-${crypto.randomUUID()}`;
  const uid = `apple-w4-firebase-${crypto.randomUUID()}`;
  const key = crypto.randomBytes(32);
  const originalMaterial = encryptAppleRevocationMaterial('synthetic-previous-refresh', key);
  const durable = { ciphertext: originalMaterial, sessions: 0 };
  const calls = { exchange: 0, revoke: 0, issued: 0, commits: 0, rollbacks: 0 };
  const consumed = new Set();
  let failure = '';
  let route;
  const user = {
    id: owner, firebase_user_id: uid, email: `${owner}@example.invalid`,
    account_status: 'active', deactivated_at: null, role: 'user',
    terms_accepted_at: true, privacy_accepted_at: true,
    minimum_age_confirmed_at: true, private_use_confirmed_at: true,
    email_verified_at: true,
  };
  const query = async (sql, values) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM auth_identities AS identity')) {
      return { rows: [{ ...user, firebase_user_id: failure === 'identity-conflict' ? 'synthetic-other-uid' : uid }], rowCount: 1 };
    }
    if (sql.includes('UPDATE auth_identities')) {
      assert.equal(values[0], 'apple');
      assert.equal(values[1], subject);
      assert.equal(values[2], uid);
      assert.equal(values[5], 'refresh_token');
      assert.match(values[6], /^v1\./);
      durable.ciphertext = values[6];
      return { rows: [], rowCount: 1 };
    }
    throw new Error('unexpected_synthetic_sql');
  };
  const context = {
    app: { post(path, limiter, handler) { assert.equal(path, '/v1/auth/social'); route = handler; } },
    socialAuthLimiter: null, asyncRoute: (fn) => fn,
    config: {
      stagingGoogleRegistration: { enabled: false },
      stagingAccess: { enabled: false },
      privatePilotV4Enabled: true,
      appleRevocation: { enabled: true, encryptionKey: key },
    },
    HttpError, SocialAuthError: class extends Error {}, AppleRevocationError: class extends Error {},
    verifySocialToken: async () => ({
      provider: 'apple', subject, firebaseUserId: uid,
      email: user.email, emailVerified: true,
    }),
    normalizeAppleRevocationMaterial, encryptAppleRevocationMaterial,
    createAppleRevocationProvider: () => ({
      async exchangeAuthorizationCode({ code, expectedSubject }) {
        calls.exchange++;
        assert.equal(expectedSubject, subject);
        if (consumed.has(code)) throw new Error('synthetic_consumed_code');
        consumed.add(code);
        calls.issued++;
        if (failure === 'provider-response-loss') throw new Error('synthetic_response_lost');
        return `synthetic-issued-refresh-${calls.issued}`;
      },
      async revoke() { calls.revoke++; },
    }),
    safeOperationalErrorCode: () => 'synthetic_error',
    console: { error() {} },
    reconcileExpiredAccountSuspension: async () => {},
    safeText: (value) => typeof value === 'string' ? value : '',
    registrationActionLabelForProvider: () => 'synthetic-registration-label',
    socialAuthPreTransactionHook: async () => {
      if (failure === 'process-boundary') throw new Error('synthetic_process_boundary');
    },
    async inTransaction(fn) {
      const before = { ...durable };
      try {
        const result = await fn({ query });
        if (failure === 'transaction-rollback') throw new Error('synthetic_commit_failed');
        calls.commits++;
        return result;
      } catch (error) {
        Object.assign(durable, before);
        calls.rollbacks++;
        throw error;
      }
    },
    isMfaEnabled: async () => false,
    requestIp: () => '127.0.0.1',
    issueSession: async () => { durable.sessions++; return { sessionId: 'synthetic-session' }; },
    writeAudit: async () => {},
  };
  vm.runInNewContext(routeSource, context, { timeout: 1000 });
  return {
    calls, durable, originalMaterial,
    setFailure(value) { failure = value; },
    async run(code = 'synthetic-code') {
      return route({ body: { idToken: 'synthetic-id'.repeat(10), appleAuthorizationCode: code },
        get: () => 'synthetic-agent', requestId: 'synthetic-request' }, {
        json: (value) => {
          if (failure === 'client-response-loss') throw new Error('synthetic_client_response_lost');
          return value;
        },
      });
    },
  };
}

test('current source exchanges before transaction and before material durability', () => {
  const exchange = routeSource.indexOf('await provider.exchangeAuthorizationCode');
  const transaction = routeSource.indexOf('await inTransaction(');
  const write = routeSource.indexOf('UPDATE auth_identities');
  assert.ok(exchange > 0 && transaction > exchange && write > transaction);
});

const failures = {
  'identity-conflict': 'social_identity_conflict',
  'transaction-rollback': 'synthetic_commit_failed',
  'process-boundary': 'synthetic_process_boundary',
  'provider-response-loss': 'apple_revocation_exchange_unavailable',
};
for (const [failure, expected] of Object.entries(failures)) {
  test(`GAP reproduced: ${failure} consumes code without durable new material`, async () => {
    const h = harness();
    h.setFailure(failure);
    await assert.rejects(h.run(), (error) => error.message === expected);
    assert.equal(h.calls.exchange, 1);
    assert.equal(h.calls.issued, 1);
    assert.equal(h.calls.revoke, 0);
    assert.equal(h.calls.commits, 0);
    assert.equal(h.calls.rollbacks, ['identity-conflict', 'transaction-rollback'].includes(failure) ? 1 : 0);
    assert.equal(h.durable.ciphertext, h.originalMaterial);
    assert.equal(h.durable.sessions, 0);
    h.setFailure('');
    await assert.rejects(h.run(), (error) => error.code === 'apple_revocation_exchange_unavailable');
    assert.equal(h.calls.exchange, 2, 'current path blindly attempts consumed code again');
    assert.equal(h.calls.issued, 1);
  });
}

test('GAP reproduced: committed response loss has no idempotent replay response', async () => {
  const h = harness();
  h.setFailure('client-response-loss');
  await assert.rejects(h.run(), /synthetic_client_response_lost/);
  assert.equal(h.calls.commits, 1);
  assert.equal(h.durable.sessions, 1);
  assert.notEqual(h.durable.ciphertext, h.originalMaterial);
  h.setFailure('');
  await assert.rejects(h.run(), (error) => error.code === 'apple_revocation_exchange_unavailable');
  assert.equal(h.calls.exchange, 2);
  assert.equal(h.calls.issued, 1);
  assert.equal(h.durable.sessions, 1);
});

test('GAP reproduced: concurrent duplicate delivery calls exchange twice', async () => {
  const h = harness();
  const results = await Promise.allSettled([h.run(), h.run()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'apple_revocation_exchange_unavailable');
  assert.equal(h.calls.exchange, 2);
  assert.equal(h.calls.issued, 1);
  assert.equal(h.calls.commits, 1);
});

test('GAP reproduced: successful new code overwrites prior owned material', async () => {
  const h = harness();
  await h.run('synthetic-first-code');
  const firstCiphertext = h.durable.ciphertext;
  await h.run('synthetic-second-code');
  assert.equal(h.calls.issued, 2);
  assert.equal(h.calls.commits, 2);
  assert.notEqual(h.durable.ciphertext, firstCiphertext);
  assert.equal(h.calls.revoke, 0);
});

test('existing migration/outbox cannot serve as multi-attempt ownership ledger', () => {
  const migration = fs.readFileSync(new URL('../sql/migrations/094_apple_refresh_material_only.up.sql', import.meta.url), 'utf8');
  assert.match(migration, /apple_revocation_material_kind = 'refresh_token'/);
  const cleanup = fs.readFileSync(new URL('../src/firebase_identity_cleanup.js', import.meta.url), 'utf8');
  assert.match(cleanup, /ON CONFLICT \(firebase_user_id\) DO UPDATE/);
  assert.match(cleanup, /FROM auth_identities\s+WHERE user_id = \$1/);
  assert.doesNotMatch(routeSource, /apple_exchange_attempt|apple_material_ledger/);
});
