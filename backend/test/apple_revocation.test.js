import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  AppleRevocationError,
  appleRevocationInternals,
  createAppleRevocationProvider,
  decryptAppleRevocationMaterial,
  encryptAppleRevocationMaterial,
  normalizeAppleRevocationMaterial,
} from '../src/apple_revocation.js';
import {
  drainFirebaseIdentityDeletionOutbox,
  getAppleRevocationCleanupStatus,
} from '../src/firebase_identity_cleanup.js';

const key = Buffer.alloc(32, 7);
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function syntheticAppleIdToken(claims = {
  iss: 'https://appleid.apple.com',
  aud: 'com.example.sit',
  sub: 'apple-subject',
}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.synthetic`;
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}

test('Apple revocation material is mutually exclusive and encrypted at rest', () => {
  assert.deepEqual(normalizeAppleRevocationMaterial({ authorizationCode: ' auth-code ' }), {
    kind: 'authorization_code',
    value: 'auth-code',
  });
  assert.deepEqual(normalizeAppleRevocationMaterial({ refreshToken: 'refresh-token' }), {
    kind: 'refresh_token',
    value: 'refresh-token',
  });
  assert.throws(
    () => normalizeAppleRevocationMaterial({ authorizationCode: 'a', refreshToken: 'b' }),
    (error) => error instanceof AppleRevocationError
      && error.code === 'apple_revocation_material_ambiguous',
  );
  const ciphertext = encryptAppleRevocationMaterial('refresh-token', key);
  assert.notEqual(ciphertext, 'refresh-token');
  assert.equal(decryptAppleRevocationMaterial(ciphertext, key), 'refresh-token');
  assert.throws(() => decryptAppleRevocationMaterial(ciphertext, Buffer.alloc(32, 8)));
});

test('Apple adapter exchanges authorization code and revokes through a synthetic fetch adapter', async () => {
  const requests = [];
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const provider = createAppleRevocationProvider({
    enabled: true,
    clientId: 'com.example.sit',
    teamId: 'TEAMID1234',
    keyId: 'KEYID1234',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith('/token')
        ? jsonResponse({
            id_token: syntheticAppleIdToken(),
            refresh_token: 'synthetic-refresh',
          })
        : new Response('', { status: 200 });
    },
  });
  const refreshToken = await provider.exchangeAuthorizationCode({
    code: 'synthetic-code',
    expectedSubject: 'apple-subject',
  });
  await provider.revoke({ kind: 'refresh_token', value: refreshToken });
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/auth\/token$/u);
  assert.match(requests[1].url, /\/auth\/revoke$/u);
  assert.equal(requests[0].options.body.get('code'), 'synthetic-code');
  assert.equal(requests[1].options.body.get('token'), 'synthetic-refresh');
  assert.equal(requests[1].options.body.get('token_type_hint'), 'refresh_token');
  assert.equal(requests[0].options.redirect, 'error');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('Apple provider transport rejects timeout, redirects, MIME, encoding and oversized bodies without detail leakage', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const options = {
    enabled: true,
    clientId: 'com.example.sit',
    teamId: 'TEAMID1234',
    keyId: 'KEYID1234',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const fixtures = [
    async () => { throw new DOMException('private timeout detail', 'AbortError'); },
    async () => Response.redirect('https://evil.example/provider', 302),
    async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/plain' } }),
    async () => new Response('{}', { status: 200, headers: {
      'content-type': 'application/json', 'content-encoding': 'gzip',
    } }),
    async () => new Response('x'.repeat(32 * 1024 + 1), { status: 200, headers: {
      'content-type': 'application/json',
    } }),
  ];
  for (const fetchImpl of fixtures) {
    const provider = createAppleRevocationProvider({ ...options, fetchImpl });
    await assert.rejects(
      provider.exchangeAuthorizationCode({ code: 'synthetic-code', expectedSubject: 'apple-subject' }),
      (error) => error instanceof AppleRevocationError
        && [
          'apple_revocation_transport_failed',
          'apple_revocation_provider_rejected',
          'apple_revocation_response_invalid',
        ].includes(error.code)
        && !Object.hasOwn(error, 'cause')
        && !String(error).includes('private timeout detail')
        && !String(error).includes('evil.example'),
    );
  }
});

test('Apple transport deadline terminates stalled fetch and stalled response body deterministically', async () => {
  for (const fixture of ['fetch', 'body']) {
    let signal;
    const fetchImpl = async (_url, options) => {
      signal = options.signal;
      if (fixture === 'fetch') return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const startedAt = Date.now();
    await assert.rejects(
      appleRevocationInternals.postForm(
        fetchImpl,
        'https://appleid.apple.com/auth/token',
        { grant_type: 'authorization_code' },
        { deadlineMs: 10 },
      ),
      (error) => error instanceof AppleRevocationError
        && error.code === 'apple_revocation_transport_failed'
        && !Object.hasOwn(error, 'cause'),
    );
    assert.equal(signal.aborted, true);
    assert.ok(Date.now() - startedAt < 1000);
  }
});

test('Apple token exchange binds the response identity before releasing refresh material', async () => {
  for (const claims of [
    { iss: 'https://evil.example', aud: 'com.example.sit', sub: 'apple-subject' },
    { iss: 'https://appleid.apple.com', aud: 'other.client', sub: 'apple-subject' },
    { iss: 'https://appleid.apple.com', aud: 'com.example.sit', sub: 'other-subject' },
    { iss: 'https://appleid.apple.com', aud: ['com.example.sit', 'com.example.sit'], sub: 'apple-subject' },
    { iss: 'https://appleid.apple.com', aud: ['com.example.sit', 7], sub: 'apple-subject' },
    { iss: 'https://appleid.apple.com', aud: {}, sub: 'apple-subject' },
    null,
    'synthetic-non-object-payload',
    undefined,
  ]) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const provider = createAppleRevocationProvider({
      enabled: true,
      clientId: 'com.example.sit',
      teamId: 'TEAMID1234',
      keyId: 'KEYID1234',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      fetchImpl: async () => jsonResponse({
          ...(claims === undefined ? {} : { id_token: syntheticAppleIdToken(claims) }),
          refresh_token: 'synthetic-refresh',
      }),
    });
    await assert.rejects(
      provider.exchangeAuthorizationCode({
        code: 'synthetic-authorization-code',
        expectedSubject: 'apple-subject',
      }),
      (error) => error instanceof AppleRevocationError
        && error.code === 'apple_revocation_identity_mismatch'
        && !String(error).includes('synthetic-authorization-code')
        && !String(error).includes('synthetic-refresh'),
    );
  }
});

test('Apple token exchange preserves provider retryability without exposing response text', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const provider = createAppleRevocationProvider({
    enabled: true,
    clientId: 'com.example.sit',
    teamId: 'TEAMID1234',
    keyId: 'KEYID1234',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    fetchImpl: async () => jsonResponse(
      { error: 'synthetic provider detail' },
      { status: 503 },
    ),
  });
  await assert.rejects(
    provider.exchangeAuthorizationCode({ code: 'synthetic-code' }),
    (error) => error instanceof AppleRevocationError
      && error.code === 'apple_revocation_provider_rejected'
      && error.retryable === true
      && !String(error.message).includes('synthetic provider detail'),
  );
});

test('Apple cleanup uses a durable CAS claim, keeps Firebase deletion safe, and clears material only after success', async () => {
  const encrypted = encryptAppleRevocationMaterial('synthetic-refresh', key);
  const calls = [];
  let claimed = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [{
          id,
          firebase_user_id: 'firebase-apple-user',
          provider: 'apple',
          attempts: 1,
          firebase_deleted_at: null,
          apple_revocation_status: 'pending',
          apple_revocation_material_kind: 'refresh_token',
          apple_revocation_material_ciphertext: encrypted,
          apple_revocation_attempts: 0,
          apple_revocation_last_error_code: null,
        }] };
      }
      if (sql.includes('apple_revocation_status = \'processing\'')) {
        return { rowCount: 1, rows: [{ apple_revocation_attempts: 1 }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const revoked = [];
  const deleted = [];
  const result = await drainFirebaseIdentityDeletionOutbox({
    client,
    appleRevocationKey: key,
    appleRevocationProvider: {
      revoke: async (request) => revoked.push(request),
    },
    authClientFactory: async () => ({ deleteUser: async (uid) => deleted.push(uid) }),
    ids: [id],
  });
  assert.deepEqual(result, { deleted: 1, retried: 0 });
  assert.deepEqual(revoked, [{
    kind: 'refresh_token',
    value: 'synthetic-refresh',
    operationKey: `sit_apple_revoke_${id}`,
  }]);
  assert.deepEqual(deleted, ['firebase-apple-user']);
  assert.ok(calls.some(({ sql }) => sql.includes("apple_revocation_status = 'succeeded'")));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM firebase_identity_deletion_outbox')));
  assert.doesNotMatch(JSON.stringify(calls), /synthetic-refresh/u);
});

test('Apple revoke retry never claims completion and still permits Firebase deletion', async () => {
  const encrypted = encryptAppleRevocationMaterial('synthetic-refresh', key);
  let claimed = false;
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [{
          id,
          firebase_user_id: 'firebase-apple-user',
          provider: 'apple',
          attempts: 1,
          apple_revocation_status: 'pending',
          apple_revocation_material_kind: 'refresh_token',
          apple_revocation_material_ciphertext: encrypted,
          apple_revocation_attempts: 0,
          apple_revocation_last_error_code: null,
        }] };
      }
      if (sql.includes('apple_revocation_status = \'processing\'')) return { rowCount: 1, rows: [] };
      return { rowCount: 1, rows: [] };
    },
  };
  const deleted = [];
  const result = await drainFirebaseIdentityDeletionOutbox({
    client,
    appleRevocationKey: key,
    appleRevocationProvider: {
      revoke: async () => {
        throw new AppleRevocationError('apple_revocation_transport_failed', { retryable: true });
      },
    },
    authClientFactory: async () => ({ deleteUser: async (uid) => deleted.push(uid) }),
    ids: [id],
  });
  assert.deepEqual(result, { deleted: 1, retried: 1 });
  assert.deepEqual(deleted, ['firebase-apple-user']);
  assert.ok(calls.some(({ sql, params }) => sql.includes("apple_revocation_status = 'retry'")
    && params.includes('apple_revocation_transport_failed')));
  assert.equal(calls.some(({ sql }) => sql.startsWith('DELETE FROM firebase_identity_deletion_outbox')), false);
});

test('Apple cleanup does not re-revoke after a confirmed revoke when Firebase fails afterward', async () => {
  const encrypted = encryptAppleRevocationMaterial('synthetic-refresh', key);
  let claimCount = 0;
  let appleStatus = 'pending';
  let firebaseDeletedAt = null;
  const client = {
    query: async (sql, params) => {
      if (sql.includes('RETURNING target.id')) {
        if (claimCount >= 2) return { rows: [] };
        claimCount += 1;
        return { rows: [{
          id,
          firebase_user_id: 'firebase-apple-user',
          provider: 'apple',
          attempts: claimCount,
          firebase_deleted_at: firebaseDeletedAt,
          apple_revocation_status: appleStatus,
          apple_revocation_material_kind: appleStatus === 'succeeded' ? null : 'refresh_token',
          apple_revocation_material_ciphertext: appleStatus === 'succeeded' ? null : encrypted,
          apple_revocation_attempts: 0,
          apple_revocation_last_error_code: null,
        }] };
      }
      if (sql.includes("SET apple_revocation_status = 'processing'")) {
        return { rowCount: 1, rows: [{ apple_revocation_attempts: 1 }] };
      }
      if (sql.includes("SET apple_revocation_status = 'succeeded'")) {
        appleStatus = 'succeeded';
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SET firebase_deleted_at = now()')) {
        firebaseDeletedAt = new Date().toISOString();
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  let firebaseAttempts = 0;
  let revokeCalls = 0;
  const authClientFactory = async () => ({
    deleteUser: async () => {
      firebaseAttempts += 1;
      if (firebaseAttempts === 1) {
        const error = new Error('synthetic Firebase failure');
        error.code = 'auth/internal-error';
        throw error;
      }
    },
  });
  const provider = { revoke: async () => { revokeCalls += 1; } };
  const first = await drainFirebaseIdentityDeletionOutbox({
    client, appleRevocationKey: key, appleRevocationProvider: provider,
    authClientFactory, ids: [id], limit: 1,
  });
  const second = await drainFirebaseIdentityDeletionOutbox({
    client, appleRevocationKey: key, appleRevocationProvider: provider,
    authClientFactory, ids: [id], limit: 1,
  });
  assert.deepEqual(first, { deleted: 0, retried: 1 });
  assert.deepEqual(second, { deleted: 1, retried: 0 });
  assert.equal(revokeCalls, 1);
});

test('Apple claim loss after remote revoke cannot regress succeeded state or re-revoke', async () => {
  const encrypted = encryptAppleRevocationMaterial('synthetic-refresh', key);
  let claimCount = 0;
  let appleStatus = 'pending';
  let firebaseDeletedAt = null;
  let revokeCalls = 0;
  const client = {
    query: async (sql) => {
      if (sql.includes('RETURNING target.id')) {
        if (claimCount > 0) return { rows: [] };
        claimCount += 1;
        return { rows: [{
          id,
          firebase_user_id: 'firebase-apple-user',
          provider: 'apple',
          attempts: 1,
          firebase_deleted_at: firebaseDeletedAt,
          apple_revocation_status: appleStatus,
          apple_revocation_material_kind: 'refresh_token',
          apple_revocation_material_ciphertext: encrypted,
          apple_revocation_attempts: 1,
          apple_revocation_last_error_code: null,
        }] };
      }
      if (sql.includes("SET apple_revocation_status = 'processing'")) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("SET apple_revocation_status = 'succeeded'")) {
        appleStatus = 'succeeded';
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("SET apple_revocation_status = 'retry'")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('SELECT apple_revocation_status')) {
        return { rows: [{ apple_revocation_status: appleStatus }] };
      }
      if (sql.includes('SET firebase_deleted_at = now()')) {
        firebaseDeletedAt = new Date().toISOString();
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await drainFirebaseIdentityDeletionOutbox({
    client,
    appleRevocationKey: key,
    appleRevocationProvider: { revoke: async () => { revokeCalls += 1; } },
    authClientFactory: async () => ({ deleteUser: async () => {} }),
    ids: [id],
    limit: 1,
  });
  assert.deepEqual(result, { deleted: 1, retried: 0 });
  assert.equal(revokeCalls, 1);
});

test('Apple deletion status stays pending when its durable outbox row is missing', async () => {
  const status = await getAppleRevocationCleanupStatus(
    { query: async () => ({ rows: [] }) },
    { ids: [id] },
  );
  assert.equal(status, 'pending');
});
