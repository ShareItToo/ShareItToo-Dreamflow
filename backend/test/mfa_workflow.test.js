import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MFA_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64url');
process.env.JWT_SECRET ??= `local-mfa-test-${'x'.repeat(40)}`;
process.env.DATABASE_URL ??= 'postgresql://127.0.0.1:1/sit_test';

const {
  beginTotpEnrollment,
  cancelTotpEnrollment,
  confirmTotpEnrollment,
  createLoginChallenge,
  verifyLoginChallenge,
} = await import('../src/mfa_workflow.js');
const { decryptTotpSecret, totpCode } = await import('../src/mfa_totp.js');

function makeClient(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return handler(sql, parameters, calls.length);
    },
  };
}

test('enrollment creates one pending encrypted factor and never returns the ciphertext', async () => {
  let inserted;
  const client = makeClient((sql, parameters) => {
    if (/SELECT user_id, encrypted_secret/u.test(sql)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO mfa_totp_factors/u.test(sql)) {
      inserted = parameters;
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const result = await beginTotpEnrollment(client, {
    userId: 'user-1',
    email: 'user@example.test',
    idempotencyKey: 'enroll-12345678',
  });
  assert.match(result.secret, /^[A-Z2-7]+$/u);
  assert.match(result.otpauthUrl, /^otpauth:\/\/totp\//u);
  assert.equal('encrypted_secret' in result, false);
  assert.equal(typeof inserted[1], 'string');
  assert.equal(decryptTotpSecret(inserted[1], Buffer.alloc(32, 9)), result.secret);
});

test('a disabled factor can be re-enrolled only after the route-level reauthentication', async () => {
  const client = makeClient((sql) => {
    if (/SELECT user_id, encrypted_secret/u.test(sql)) {
      return { rows: [{ user_id: 'user-1', status: 'disabled' }], rowCount: 1 };
    }
    if (/UPDATE mfa_totp_factors/u.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected query: ${sql}`);
  });
  const result = await beginTotpEnrollment(client, {
    userId: 'user-1', email: 'user@example.test', idempotencyKey: 'enroll-22345678',
  });
  assert.match(result.secret, /^[A-Z2-7]+$/u);
  assert.equal(client.calls.filter(({ sql }) => /UPDATE mfa_totp_factors/u.test(sql)).length, 1);
});

test('pending enrollment can be cancelled without returning secret material', async () => {
  const client = makeClient((sql) => {
    if (/SELECT user_id, encrypted_secret/u.test(sql)) {
      return {
        rows: [{ user_id: 'user-1', status: 'pending', encrypted_secret: 'ciphertext' }],
        rowCount: 1,
      };
    }
    if (/UPDATE mfa_totp_factors/u.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected query: ${sql}`);
  });
  const result = await cancelTotpEnrollment(client, { userId: 'user-1' });
  assert.deepEqual(result, { cancelled: true });
  assert.equal(client.calls.some(({ parameters }) =>
    parameters?.some((value) => value === 'ciphertext')), false);
});

test('confirm enables only after a valid first factor and returns recovery codes once', async () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const key = Buffer.alloc(32, 9);
  const { encryptTotpSecret } = await import('../src/mfa_totp.js');
  const now = Date.now();
  const code = totpCode(secret, Math.floor(now / 1000 / 30));
  const client = makeClient((sql) => {
    if (/SELECT user_id, encrypted_secret/u.test(sql)) {
      return {
        rows: [{
          user_id: 'user-1', encrypted_secret: encryptTotpSecret(secret, key), status: 'pending',
          recovery_code_hashes: [], last_used_step: null, failed_attempts: 0, locked_until: null,
          enrollment_idempotency_key: 'enroll-12345678', enabled_at: null,
        }], rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  const result = await confirmTotpEnrollment(client, { userId: 'user-1', code });
  assert.equal(result.recoveryCodes.length, 10);
  assert.equal(client.calls.filter(({ sql }) => /UPDATE mfa_totp_factors/u.test(sql)).length, 1);
  assert.equal(client.calls.filter(({ sql }) => /UPDATE auth_sessions/u.test(sql)).length, 1);
  assert.equal(client.calls.some(({ sql, parameters }) => parameters?.some((value) => value === secret)), false);
});

test('login challenges are random, expire-bound, and single-use by hash', async () => {
  let inserted;
  const client = makeClient((sql, parameters) => {
    if (/UPDATE auth_mfa_challenges/u.test(sql)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO auth_mfa_challenges/u.test(sql)) {
      inserted = parameters;
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const result = await createLoginChallenge(client, {
    userId: 'user-1', userAgent: 'test', ipAddress: '127.0.0.1',
  });
  assert.ok(result.challenge.length >= 32);
  assert.ok(result.expiresAt.getTime() > Date.now());
  assert.notEqual(inserted[1], result.challenge);
  assert.match(inserted[1], /^[a-f0-9]{64}$/u);
});

test('a consumed login challenge cannot replay its TOTP or create a second session', async () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const { encryptTotpSecret } = await import('../src/mfa_totp.js');
  const challenge = 'a'.repeat(48);
  let consumed = false;
  const client = makeClient((sql) => {
    if (/SELECT id, user_id/u.test(sql)) {
      if (consumed) return { rows: [], rowCount: 0 };
      return { rows: [{ id: 'challenge-1', user_id: 'user-1' }], rowCount: 1 };
    }
    if (/SELECT id FROM users/u.test(sql)) {
      return { rows: [{ id: 'user-1' }], rowCount: 1 };
    }
    if (/SELECT challenge\.id/u.test(sql)) {
      return {
        rows: [{
          id: 'challenge-1', user_id: 'user-1', expires_at: new Date(Date.now() + 60_000),
          attempts: 0, locked_until: null, status: 'enabled', enabled_at: new Date(),
          encrypted_secret: encryptTotpSecret(secret, Buffer.alloc(32, 9)),
          recovery_code_hashes: [], last_used_step: null, failed_attempts: 0,
        }], rowCount: 1,
      };
    }
    if (/UPDATE auth_mfa_challenges SET consumed_at/u.test(sql)) {
      consumed = true;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const code = totpCode(secret, Math.floor(Date.now() / 1000 / 30));
  const first = await verifyLoginChallenge(client, { challenge, code });
  assert.deepEqual(first, { ok: true, userId: 'user-1', method: 'totp' });
  await assert.rejects(
    verifyLoginChallenge(client, { challenge, code }),
    (error) => error.code === 'mfa_challenge_expired',
  );
});
