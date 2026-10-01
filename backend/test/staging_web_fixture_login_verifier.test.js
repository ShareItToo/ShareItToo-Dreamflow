import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assertFixtureLoginProofContainer,
  buildFixtureLoginProofBinding,
  buildFixtureLoginProofLaunch,
  createFixtureLoginProofStore,
  fixtureLoginProofDigest,
  fixtureLoginProofFingerprint,
  fixtureLoginProofKind,
  loginProofMarker,
  readProtectedFixtureLoginInput,
  runFixtureLoginProof,
  runFixtureLoginProofContainer,
  validateFixtureLoginProofBinding,
  validateFixtureLoginProofConfirmation,
  validateFixtureLoginProofEnvironment,
  validateFixtureLoginProofHistory,
  verifyFixtureLoginProofPassword,
} from '../ops/staging_web_fixture_login_verifier.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const ownerId = 'synthetic_web_catalog_owner_v1';
const renterId = 'synthetic_web_catalog_renter_v1';
const listingId = 'synthetic_web_catalog_listing_v1';
const uploadName = 'synthetic_web_catalog_placeholder_v1.webp';
const runtimeCommit = 'a'.repeat(40);
const sourceCommit = 'b'.repeat(40);
const runId = 'web-fixture-login-proof-source-test';
const proofNonce = 'c'.repeat(32);
const marker = loginProofMarker(runId, proofNonce);
const ledgerDigest = 'd'.repeat(64);
const networkName = 'sit-green-network-20260918011528-wp254';
const dbName = 'sit-green-postgres-20260918011528-wp254';
const credentialField = ['pass', 'word'].join('');

async function encodedSecret(secret) {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise((resolve, reject) => crypto.scrypt(secret, salt, 64,
    (error, value) => error ? reject(error) : resolve(value)));
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

function privateInput(bootstrapRuntimeCommit = runtimeCommit) {
  const secrets = [crypto.randomBytes(36).toString('base64url'), crypto.randomBytes(36).toString('base64url')]
    .map((value) => `Sit9-${value}`);
  const roles = [ownerId, renterId].map((userId, index) => ({
    role: index ? 'renter' : 'owner', userId, syntheticMarker: runId,
  }));
  const manifest = {
    kind: 'sit-dedicated-web-fixture-bootstrap', schemaVersion: 1, operation: 'seed',
    sourceCommit: 'e'.repeat(40), sourceHashes: { bootstrap: 'f'.repeat(64) },
    schemaCount: 98, ledgerDigest, passwordDigests: secrets.map(sha),
    preflight: { runId, runtimeCommit: bootstrapRuntimeCommit, roles, listingId, uploadName,
      database: { host: dbName, name: 'shareittoo_green', user: 'shareittoo_green' } },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const credentials = { kind: 'sit-private-dedicated-fixture-credentials',
    sourceCommit: manifest.sourceCommit, runId, manifestSha256: sha(manifestBytes),
    accounts: [ownerId, renterId].map((id, index) => ({
      id, email: `${id}@example.invalid`, [credentialField]: secrets[index],
    })) };
  const credentialsBytes = Buffer.from(`${JSON.stringify(credentials)}\n`);
  return { manifest, credentials, manifestBytes, credentialsBytes, secrets };
}

function environment() {
  return {
    DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: runtimeCommit,
    DATABASE_URL: `postgres://shareittoo_green@${dbName}/shareittoo_green`,
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_ALLOWED_USER_IDS: `${ownerId},${renterId},existing-pilot-user`,
    SIT_STAGING_PUBLIC_LISTING_IDS: listingId,
    SIT_STAGING_PUBLIC_UPLOAD_NAMES: uploadName,
    SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', MAIL_TRANSPORT: 'memory',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_LISTING_AI_BUDGET_CENTS: '0', TECHNICAL_SANDBOX_ENABLED: '0',
    TECHNICAL_SANDBOX_KILL_SWITCH: '1', TECHNICAL_SANDBOX_ACCOUNT_ID: '',
    TECHNICAL_SANDBOX_USER_IDS: '', TECHNICAL_SANDBOX_AUTHORIZATION_ID: '',
    TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '', TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '',
    TECHNICAL_SANDBOX_SECRET_KEY_FILE: '', TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: '',
  };
}

function baseState(overrides = {}) {
  return { users: 2, seedAudits: 1, mfaFactors: 0, activeSessions: 0, activeRefreshTokens: 0,
    totalSessions: 0, totalRefreshTokens: 0, totalLoginAudits: 0, historyDigest: '6'.repeat(64),
    markerSessions: 0, markerActiveSessions: 0, markerRefreshTokens: 0,
    markerActiveRefreshTokens: 0, markerLoginAudits: 0, identityDigest: '9'.repeat(64),
    catalogDigest: '7'.repeat(64),
    bookings: 0, requests: 0, identities: 0, pushDevices: 0, paymentCommands: 0,
    identityProviderSessions: 0, technicalProviderRuns: 0, notifications: 0,
    notificationOutbox: 0, ...overrides };
}

function fakeProof(input, { fault, responseRole = 'user', foreignMarker = false,
  cleanupFault = false, healthFault = false, credentialFault = false,
  priorCount = 0, historyDrift = false,
  lateSessionAfterFirstReconcile = false, unstableCleanupReadback = false } = {}) {
  const sessions = [];
  const calls = [];
  let sequence = 0; let reconciles = 0; let lateInserted = false;
  const own = () => sessions.filter((entry) => [ownerId, renterId].includes(entry.userId));
  const snapshot = async ({ readOnly = false } = {}) => {
    calls.push(`snapshot:${readOnly ? 'read-only' : 'readback'}`);
    const owned = own();
    return baseState({ activeSessions: owned.filter((entry) => entry.active).length,
      totalSessions: priorCount + sessions.length,
      totalRefreshTokens: priorCount + sessions.length + (unstableCleanupReadback ? reconciles : 0),
      totalLoginAudits: priorCount + sessions.length,
      historyDigest: (historyDrift && reconciles ? '5' : '6').repeat(64),
      activeRefreshTokens: owned.filter((entry) => entry.refreshActive).length,
      markerSessions: sessions.length, markerActiveSessions: sessions.filter((entry) => entry.active).length,
      markerRefreshTokens: sessions.length + (unstableCleanupReadback ? reconciles : 0),
      markerActiveRefreshTokens: sessions.filter((entry) => entry.refreshActive).length,
      markerLoginAudits: sessions.length });
  };
  const store = {
    attest: async (manifest) => { calls.push('attest:read-only'); return {
      schemaCount: manifest.schemaCount, ledgerDigest: manifest.ledgerDigest } },
    attestCredentials: async () => {
      calls.push('credentials:read-only');
      if (credentialFault) throw Object.assign(Error('fixture_login_proof_credential_attestation_failed'),
        { code: 'fixture_login_proof_credential_attestation_failed' });
      return { credentialsAttested: 2 };
    },
    snapshot,
    reconcile: async () => {
      calls.push('reconcile'); reconciles++;
      for (const entry of own()) { entry.active = false; entry.refreshActive = false; }
      if (cleanupFault) throw Error('injected-cleanup-fault');
      if (sessions.some((entry) => ![ownerId, renterId].includes(entry.userId))) {
        const error = new Error('fixture_login_proof_marker_ambiguous'); error.code = error.message; throw error;
      }
      return { matchedSessions: own().length };
    },
  };
  const sleep = async () => {
    calls.push('quiescence');
    if (lateSessionAfterFirstReconcile && reconciles === 1 && !lateInserted) {
      lateInserted = true;
      sessions.push({ userId: ownerId, active: true, refreshActive: true,
        access: 'late-access', refresh: 'late-refresh' });
    }
  };
  const json = (status, body) => ({ status, json: async () => body });
  const request = async (path, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const authorization = options.headers?.Authorization;
    const role = body?.email?.startsWith(ownerId) ? 'owner' : body?.email?.startsWith(renterId) ? 'renter' : null;
    calls.push(`${options.method}:${path}:${role ?? 'token'}`);
    if (path === '/health/live' || path === '/health/ready') return json(
      healthFault && path === '/health/ready' ? 503 : 200, { status: 'ok' });
    if (path === '/version') return json(200, { commit: runtimeCommit, environment: 'test' });
    if (path === '/v1/auth/login') {
      if (fault === `login-before:${role}`) throw Error('login-before-response');
      if (fault === `login-status:${role}`) return json(503, {});
      if (fault === `mfa:${role}`) return json(202, { mfaRequired: true });
      const index = role === 'owner' ? 0 : 1;
      assert.equal(body[credentialField], input.credentials.accounts[index][credentialField]);
      const entry = { userId: input.credentials.accounts[index].id, active: true, refreshActive: true,
        access: `access-${++sequence}`, refresh: `refresh-${sequence}` };
      sessions.push(entry);
      if (foreignMarker && role === 'owner') sessions.push({ userId: 'foreign-user', active: true,
        refreshActive: true, access: 'foreign-access', refresh: 'foreign-refresh' });
      if (fault === `login-lost:${role}`) throw Error('login-response-lost');
      return json(200, { accessToken: entry.access, refreshToken: entry.refresh,
        sessionId: `${sequence}`.padStart(8, '0') + '-0000-4000-8000-000000000000',
        user: { id: entry.userId, email: body.email, role: responseRole } });
    }
    if (path === '/v1/auth/logout') {
      const entry = sessions.find((candidate) => candidate.refresh === body.refreshToken);
      if (fault === `logout-before:${entry?.userId === ownerId ? 'owner' : 'renter'}`) throw Error('logout-before-response');
      if (entry) { entry.active = false; entry.refreshActive = false; }
      const label = entry?.userId === ownerId ? 'owner' : 'renter';
      if (fault === `logout-lost:${label}`) throw Error('logout-response-lost');
      if (fault === `logout-status:${label}`) return json(503, {});
      return json(204, null);
    }
    if (path === '/v1/auth/me') {
      const token = authorization?.replace(/^Bearer /u, '');
      const entry = sessions.find((candidate) => candidate.access === token);
      const label = entry?.userId === ownerId ? 'owner' : 'renter';
      if (fault === `me-before:${label}`) throw Error('me-response-lost');
      if (!entry?.active) return json(401, {});
      if (fault === `me-status:${label}`) return json(503, {});
      const account = input.credentials.accounts.find((candidate) => candidate.id === entry.userId);
      return json(200, { user: { id: entry.userId, email: account.email, role: responseRole } });
    }
    assert.fail(`unexpected request ${path}`);
  };
  return { store, request, sleep, sessions, calls };
}

test('protected bootstrap reader requires exact runner-owned file contract without exposing contents', () => {
  const input = privateInput(); const calls = [];
  const read = (path, options) => {
    calls.push({ path, options });
    return path.endsWith('/adapter.json') ? input.manifestBytes : input.credentialsBytes;
  };
  const observed = readProtectedFixtureLoginInput('/docker/shareittoo/evidence/proof/input', {
    read, stat: () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 100, gid: 101, mode: 0o40700 }),
    realpath: (value) => value,
  });
  assert.equal(observed.manifest.preflight.runId, runId);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.deepEqual(call.options, { encoding: null, expectedMode: 0o600,
    expectedUid: 100, expectedGid: 101, minBytes: 1, maxBytes: 256 * 1024,
    code: 'fixture_login_proof_input_metadata_invalid' });
  for (const change of [{ uid: 0 }, { gid: 0 }, { mode: 0o40777 }, { symbolic: true }]) {
    assert.throws(() => readProtectedFixtureLoginInput('/docker/shareittoo/evidence/proof/input', {
      read, stat: () => ({ isDirectory: () => true, isSymbolicLink: () => change.symbolic ?? false,
        uid: change.uid ?? 100, gid: change.gid ?? 101, mode: change.mode ?? 0o40700 }),
      realpath: (value) => value,
    }), /input_parent_invalid/u);
  }
  assert.throws(() => readProtectedFixtureLoginInput('/run/other', { read, checkParent: false }), /input_path_invalid/u);
});

test('environment gate binds registration, catalog, payment and every external provider off boundary', () => {
  const input = privateInput(); const expected = environment();
  assert.deepEqual(validateFixtureLoginProofEnvironment(expected, input.manifest, runtimeCommit), expected);
  for (const [key, value] of Object.entries({ SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'true', PAYMENT_TRANSPORT: 'stripe', STRIPE_LIVEMODE: 'true',
    PUSH_TRANSPORT: 'fcm', IDENTITY_VERIFICATION_TRANSPORT: 'stripe', SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1', TECHNICAL_SANDBOX_ENABLED: '1',
    TECHNICAL_SANDBOX_KILL_SWITCH: '0' })) {
    assert.throws(() => validateFixtureLoginProofEnvironment({ ...expected, [key]: value }, input.manifest, runtimeCommit),
      /effect_boundary_invalid/u, key);
  }
});

test('default proof preflight uses DB read-only plus health/version and makes no auth or compensation call', async () => {
  const input = privateInput(); const fake = fakeProof(input);
  const result = await runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake, marker });
  assert.equal(result.status, 'fixture-login-proof-preflight-passed-no-mutation');
  assert.deepEqual(fake.calls, ['attest:read-only', 'credentials:read-only', 'snapshot:read-only', 'GET:/health/live:token',
    'GET:/health/ready:token', 'GET:/version:token']);
  assert.equal(result.executed, false); assert.equal(result.activeSessions, 0);
  assert.equal(result.credentialsAttested, 2); assert.equal(result.quiescenceReadbacks, 0);
});

test('credential drift blocks default and execute before every HTTP request without DB mutation', async () => {
  for (const execute of [false, true]) {
    const input = privateInput(); const fake = fakeProof(input, { credentialFault: true });
    await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
      execute, marker }), /credential_attestation_failed/u);
    assert.deepEqual(fake.calls, ['attest:read-only', 'credentials:read-only']);
    assert.deepEqual(fake.sessions, []);
  }
});

test('execute requires both exact current source and private bootstrap run confirmations', () => {
  const input = privateInput(); const source = { commit: sourceCommit };
  assert.equal(validateFixtureLoginProofConfirmation({ execute: false, source, input }), false);
  assert.equal(validateFixtureLoginProofConfirmation({ execute: true, source, input,
    confirmSource: sourceCommit, confirmRun: runId }), true);
  assert.throws(() => validateFixtureLoginProofConfirmation({ execute: true, source, input,
    confirmSource: 'f'.repeat(40), confirmRun: runId }), /confirmation_required/u);
  assert.throws(() => validateFixtureLoginProofConfirmation({ execute: true, source, input,
    confirmSource: sourceCommit, confirmRun: 'web-fixture-wrong-run-value' }), /confirmation_required/u);
  assert.throws(() => validateFixtureLoginProofConfirmation({ execute: false, source, input,
    confirmSource: sourceCommit, confirmRun: runId }), /confirmation_required/u);
});

test('unready canonical API blocks before authentication', async () => {
  const input = privateInput(); const fake = fakeProof(input, { healthFault: true });
  await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
    marker }), /api_readback_failed/u);
  assert.ok(!fake.calls.some((call) => call.includes('/v1/auth/')));
  assert.ok(!fake.calls.includes('reconcile'));
});

test('execute verifies owner then renter through login, me, logout and rejects both access tokens', async () => {
  const input = privateInput(); const fake = fakeProof(input);
  const result = await runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake, execute: true, marker });
  assert.equal(result.status, 'fixture-login-proof-verified-sessions-revoked');
  assert.deepEqual([result.loginsVerified, result.meVerified, result.logoutsVerified,
    result.accessTokensRejected, result.activeSessions, result.activeRefreshTokens], [2, 2, 2, 2, 0, 0]);
  assert.equal(result.credentialsAttested, 2); assert.equal(result.quiescenceReadbacks, 3);
  assert.deepEqual(fake.calls.filter((call) => call.includes('/v1/auth/login')),
    ['POST:/v1/auth/login:owner', 'POST:/v1/auth/login:renter']);
  assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
  const serialized = JSON.stringify(result);
  for (const secret of input.secrets) assert.ok(!serialized.includes(secret));
  for (const account of input.credentials.accounts) assert.ok(!serialized.includes(account.email));
  assert.doesNotMatch(serialized, /access-|refresh-/u);
});

test('fresh marker preserves prior proof history and records exact cumulative counts', async () => {
  for (const priorCount of [2, 4]) {
    for (const execute of [false, true]) {
      const input = privateInput('e'.repeat(40)); const fake = fakeProof(input, { priorCount });
      const result = await runFixtureLoginProof({ input, environment: environment(), runtimeCommit,
        ...fake, execute, marker });
      const count = priorCount + (execute ? 2 : 0);
      assert.deepEqual(result.authHistory.before, { sessions: priorCount, refreshTokens: priorCount, loginAudits: priorCount });
      assert.deepEqual(result.authHistory.after, { sessions: count, refreshTokens: count, loginAudits: count });
      assert.equal(result.retainedSessionRecords, execute ? 2 : 0);
      assert.equal(result.loginAudits, execute ? 2 : 0);
      validateFixtureLoginProofHistory(result.authHistory, execute);
      assert.equal(result.activeSessions, 0); assert.equal(result.activeRefreshTokens, 0);
      assert.equal(result.accessTokensRejected, execute ? 2 : 0);
    }
  }
});

test('prior retained history drift fails after owned cleanup without suppressing history', async () => {
  const input = privateInput(); const fake = fakeProof(input, { priorCount: 2, historyDrift: true });
  await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit,
    ...fake, execute: true, marker }), /post_readback_invalid/u);
  assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
});

test('missing or old runtime binding fails before DB or HTTP despite valid bootstrap', async () => {
  for (const expectedCommit of [undefined, 'e'.repeat(40)]) {
    const input = privateInput(); const fake = fakeProof(input);
    await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit: expectedCommit,
      ...fake, execute: true, marker }), /effect_boundary_invalid/u);
    assert.deepEqual(fake.calls, []);
  }
});

test('cumulative proof contract rejects deletion, unexpected growth, malformed counts and changed prior rows', () => {
  const valid = { before: { sessions: 2, refreshTokens: 2, loginAudits: 2 },
    after: { sessions: 4, refreshTokens: 4, loginAudits: 4 },
    beforeDigest: '6'.repeat(64), afterDigest: '6'.repeat(64) };
  for (const after of [{ sessions: 2 }, { refreshTokens: 5 }, { loginAudits: '4' }]) {
    assert.throws(() => validateFixtureLoginProofHistory({ ...valid, after: { ...valid.after, ...after } }, true),
      /history_invalid/u);
  }
  assert.throws(() => validateFixtureLoginProofHistory({ ...valid, afterDigest: '5'.repeat(64) }, true), /history_invalid/u);
});

for (const [fault, code] of [
  ['login-status:owner', 'fixture_login_proof_login_failed'],
  ['login-lost:owner', 'login-response-lost'],
  ['me-status:owner', 'fixture_login_proof_me_failed'],
  ['me-before:owner', 'me-response-lost'],
  ['logout-status:owner', 'fixture_login_proof_logout_failed'],
  ['logout-lost:owner', 'logout-response-lost'],
  ['login-lost:renter', 'login-response-lost'],
  ['me-before:renter', 'me-response-lost'],
  ['logout-lost:renter', 'logout-response-lost'],
]) test(`fault ${fault} compensates every exact owned session without retry`, async () => {
  const input = privateInput(); const fake = fakeProof(input, { fault });
  await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
    execute: true, marker }), new RegExp(code, 'u'));
  assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
  assert.equal(fake.calls.filter((call) => call === 'reconcile').length, 3);
  assert.ok(fake.calls.filter((call) => call.includes('/v1/auth/login')).length <= 2);
});

test('lost login response with a session committed after first reconcile is revoked before failure returns', async () => {
  const input = privateInput(); const fake = fakeProof(input, {
    fault: 'login-before:owner', lateSessionAfterFirstReconcile: true,
  });
  await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
    execute: true, marker }), /login-before-response/u);
  assert.equal(fake.calls.filter((call) => call === 'POST:/v1/auth/login:owner').length, 1);
  assert.equal(fake.calls.filter((call) => call === 'reconcile').length, 4);
  assert.equal(fake.calls.filter((call) => call === 'quiescence').length, 3);
  assert.equal(fake.sessions.length, 1);
  assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
});

test('unstable cleanup readback never becomes success and requires manual readback', async () => {
  const input = privateInput(); const fake = fakeProof(input, { unstableCleanupReadback: true });
  await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
    execute: true, marker }), /cleanup_quiescence_unproven_manual_readback_required/u);
  assert.equal(fake.calls.filter((call) => call === 'reconcile').length, 4);
  assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
});

test('wrong API role and unexpected MFA fail closed and reconcile', async () => {
  for (const options of [{ responseRole: 'admin' }, { fault: 'mfa:owner' }]) {
    const input = privateInput(); const fake = fakeProof(input, options);
    await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
      execute: true, marker }), /login_response_invalid|mfa_unexpected/u);
    assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
  }
});

test('cleanup fault overrides success and foreign marker is never silently accepted', async () => {
  {
    const input = privateInput(); const fake = fakeProof(input, { cleanupFault: true });
    await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
      execute: true, marker }), /cleanup_failed/u);
    assert.ok(fake.sessions.every((entry) => !entry.active && !entry.refreshActive));
  }
  {
    const input = privateInput(); const fake = fakeProof(input, { foreignMarker: true });
    await assert.rejects(runFixtureLoginProof({ input, environment: environment(), runtimeCommit, ...fake,
      execute: true, marker }), /cleanup_failed/u);
    assert.ok(fake.sessions.filter((entry) => [ownerId, renterId].includes(entry.userId))
      .every((entry) => !entry.active && !entry.refreshActive));
    assert.equal(fake.sessions.find((entry) => entry.userId === 'foreign-user').active, true);
  }
});

test('real store compensation SQL scopes updates to exact IDs, session IDs and marker, preserving foreign rows', async () => {
  const queries = [];
  const ownedId = '11111111-1111-4111-8111-111111111111';
  const foreignId = '22222222-2222-4222-8222-222222222222';
  const client = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (String(sql).includes('SELECT id FROM users')) return { rows: [{ id: ownerId }, { id: renterId }] };
    if (String(sql).includes('SELECT id::text,user_id,revoked_at')) return { rows: [
      { id: ownedId, user_id: ownerId, revoked_at: null },
      { id: foreignId, user_id: 'foreign-user', revoked_at: null },
    ] };
    return { rows: [] };
  } };
  const store = createFixtureLoginProofStore(client, { runId, marker });
  await assert.rejects(store.reconcile(), /marker_ambiguous/u);
  const updates = queries.filter(({ sql }) => /^UPDATE /u.test(String(sql).trim()));
  assert.equal(updates.length, 2); assert.ok(!queries.some(({ sql }) => /\bDELETE\b/u.test(sql)));
  for (const update of updates) {
    assert.deepEqual(update.params, [[ownedId], [ownerId, renterId], marker]);
    assert.match(update.sql, /user_id=ANY\(\$2::text\[\]\) AND user_agent=\$3/u);
  }
});

test('real store attestation and snapshots are enforced inside read-only transactions', async () => {
  const input = privateInput();
  const ledger = Array.from({ length: 98 }, (_, index) => ({ name: `${index}`.padStart(3, '0'), checksum: sha(`${index}`) }));
  input.manifest.ledgerDigest = fixtureLoginProofDigest(ledger);
  const state = baseState(); const row = Object.fromEntries(Object.entries(state).map(([key, value]) => [
    key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`), value,
  ]));
  const calls = [];
  const client = { query: async (sql) => {
    calls.push(String(sql));
    if (sql === 'SELECT name,checksum FROM schema_migrations ORDER BY name') return { rows: ledger };
    if (String(sql).startsWith('SELECT current_database()')) return { rows: [{ name: 'shareittoo_green', user: 'shareittoo_green' }] };
    if (String(sql).includes('(SELECT count(*)::int FROM users')) return { rows: [row] };
    return { rows: [] };
  } };
  const store = createFixtureLoginProofStore(client, { runId, marker });
  assert.deepEqual(await store.attest(input.manifest), { schemaCount: 98, ledgerDigest: input.manifest.ledgerDigest });
  assert.deepEqual(await store.snapshot({ readOnly: true }), state);
  assert.equal(calls.filter((sql) => sql === 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 2);
  assert.equal(calls.filter((sql) => sql === 'ROLLBACK').length, 2);
  assert.ok(calls.some((sql) => /identity_digest/u.test(sql) && /marker_login_audits/u.test(sql)));
});

test('real credential attestation is read-only and rejects hash, email, attempt, lock and encoding drift', async () => {
  const input = privateInput();
  const validRows = await Promise.all(input.credentials.accounts.map(async (account) => ({
    id: account.id, email: account.email, password_hash: await encodedSecret(account[credentialField]),
    role: 'user', account_status: 'active', deactivated_at: null, profile: { syntheticOnly: true },
    failed_login_attempts: 0, login_locked_until: null, mfa_enabled: false,
  })));
  assert.equal(await verifyFixtureLoginProofPassword(input.credentials.accounts[0][credentialField],
    validRows[0].password_hash), true);
  const cases = [
    ['stored hash', async (rows) => { rows[0].password_hash = await encodedSecret(crypto.randomBytes(36).toString('base64url')); }],
    ['email', async (rows) => { rows[0].email = 'foreign@example.invalid'; }],
    ['failed attempts', async (rows) => { rows[0].failed_login_attempts = 1; }],
    ['login lock', async (rows) => { rows[0].login_locked_until = new Date(); }],
    ['malformed scrypt', async (rows) => { rows[0].password_hash = 'scrypt$not-hex$also-not-hex'; }],
  ];
  for (const [label, mutate] of [['valid', async () => {}], ...cases]) {
    const rows = structuredClone(validRows); await mutate(rows); const before = structuredClone(rows); const calls = [];
    const client = { query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('SELECT account.id,account.email,account.password_hash')) return { rows };
      return { rows: [] };
    } };
    const store = createFixtureLoginProofStore(client, { runId, marker });
    if (label === 'valid') assert.deepEqual(await store.attestCredentials(input.credentials), { credentialsAttested: 2 });
    else await assert.rejects(store.attestCredentials(input.credentials), /credential_attestation_failed/u, label);
    assert.deepEqual(rows, before, label);
    assert.equal(calls[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!calls.some(({ sql }) => /^\s*(?:UPDATE|INSERT|DELETE)\b/u.test(sql)), label);
  }
});

function sourceAndBinding(input) {
  const source = { commit: sourceCommit, hashes: {
    'backend/ops/stable_private_file.mjs': '1'.repeat(64),
    'backend/ops/staging_web_fixture_login_verifier.mjs': '2'.repeat(64),
  } };
  const binding = { kind: fixtureLoginProofKind, schemaVersion: 2, createdAt: new Date().toISOString(),
    opsCommit: source.commit, sourceHashes: source.hashes, runtimeCommit,
    imageDigest: `sha256:${'3'.repeat(64)}`, apiId: '4'.repeat(64), apiFingerprint: '5'.repeat(64),
    databaseId: '6'.repeat(64), databaseFingerprint: '7'.repeat(64), networkId: '8'.repeat(64),
    envSha256: '9'.repeat(64), inputDirectory: '/docker/shareittoo/evidence/proof/input',
    bootstrapManifestSha256: sha(input.manifestBytes), credentialsSha256: sha(input.credentialsBytes),
    bootstrapRunIdSha256: sha(runId), roleDigest: fixtureLoginProofDigest(input.manifest.preflight.roles),
    proofNonce, markerSha256: sha(marker), evidenceFile: '/docker/shareittoo/evidence/proof/result.json' };
  return { source, binding };
}

test('binding and immutable child launch contain only digests/paths and exact hardened network contract', () => {
  const input = privateInput(); const { source, binding } = sourceAndBinding(input);
  validateFixtureLoginProofBinding(binding, source);
  const launch = buildFixtureLoginProofLaunch({ binding, source, execute: true,
    name: `sit-web-login-proof-${'a'.repeat(24)}`, nonce: 'a'.repeat(24) });
  assert.equal(JSON.parse(/const input=(.*);/u.exec(launch.child)[1]).runtimeCommit, binding.runtimeCommit);
  assert.match(launch.child, /runFixtureLoginProof\(\{input:protectedInput,environment:process.env,runtimeCommit:input.runtimeCommit,/u);
  assert.equal(launch.args[launch.args.indexOf('--network') + 1], binding.networkId);
  for (const expected of ['--pull=never', '--read-only', '--cap-drop', 'ALL', 'no-new-privileges']) {
    assert.ok(launch.args.includes(expected));
  }
  assert.ok(launch.mounts.every((mount) => mount.endsWith(',readonly')));
  assert.doesNotMatch(launch.args.join(' '), /provider-egress|--publish|--privileged/u);
  for (const secret of input.secrets) assert.ok(!JSON.stringify(launch).includes(secret));
  for (const account of input.credentials.accounts) assert.ok(!JSON.stringify(launch).includes(account.email));
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: launch.child, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  const image = { Id: `sha256:${'a'.repeat(64)}` };
  const splitMount = (mount) => Object.fromEntries(mount.split(',').map((part) => part.includes('=') ? part.split('=') : [part, true]));
  const runner = { Id: 'f'.repeat(64), Name: `/sit-web-login-proof-${'a'.repeat(24)}`,
    State: { Running: false }, Image: image.Id,
    Config: { Image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}@${binding.imageDigest}`,
      User: '100:101', Labels: { 'com.shareittoo.fixture-login-proof': 'a'.repeat(24) },
      Entrypoint: ['node'], Cmd: ['--input-type=module', '-e', launch.child] },
    HostConfig: { ReadonlyRootfs: true, Privileged: false, CapDrop: ['ALL'], CapAdd: null,
      SecurityOpt: ['no-new-privileges'], LogConfig: { Type: 'none' }, NetworkMode: binding.networkId,
      PortBindings: {}, Devices: [] }, NetworkSettings: { Networks: { [networkName]: {} } },
    Mounts: launch.mounts.map((mount) => { const value = splitMount(mount); return {
      Type: value.type, Source: value.src, Destination: value.dst, RW: false }; }) };
  assertFixtureLoginProofContainer({ runner, binding, launch, id: runner.Id,
    name: runner.Name.slice(1), nonce: 'a'.repeat(24), image });
  runner.HostConfig.LogConfig.Type = 'json-file';
  assert.throws(() => assertFixtureLoginProofContainer({ runner, binding, launch, id: runner.Id,
    name: runner.Name.slice(1), nonce: 'a'.repeat(24), image }), /runner_drift/u);
});

test('binding rejects stale preparation, source drift and paths outside protected evidence', () => {
  const input = privateInput(); const { source, binding } = sourceAndBinding(input);
  assert.throws(() => validateFixtureLoginProofBinding({ ...binding, schemaVersion: 1 }, source), /binding_invalid/u);
  assert.throws(() => validateFixtureLoginProofBinding({ ...binding,
    createdAt: new Date(Date.now() - 3_600_001).toISOString() }, source), /binding_invalid/u);
  assert.throws(() => validateFixtureLoginProofBinding(binding, { ...source, commit: 'f'.repeat(40) }), /source_drift/u);
  assert.throws(() => validateFixtureLoginProofBinding({ ...binding, inputDirectory: '/tmp/input' }, source), /input_path_invalid/u);
  assert.throws(() => validateFixtureLoginProofBinding({ ...binding, evidenceFile: '/tmp/result.json' }, source), /evidence_path_invalid/u);
});

function hostFixture(input) {
  const { source, binding } = sourceAndBinding(input); const values = environment();
  const envBytes = Buffer.from(`${Object.entries(values).filter(([key]) => key !== 'APP_COMMIT')
    .map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const image = { Id: `sha256:${'a'.repeat(64)}`, Config: { User: 'shareittoo',
    Labels: { 'org.opencontainers.image.revision': runtimeCommit }, Env: [`APP_COMMIT=${runtimeCommit}`] },
    RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${binding.imageDigest}`] };
  const api = { Id: binding.apiId, Name: '/shareittoo-staging-api', Image: image.Id, State: { Running: true },
    Config: { Image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}@${binding.imageDigest}`,
      User: 'shareittoo', Env: Object.entries(values).map(([key, value]) => `${key}=${value}`) },
    HostConfig: {}, Mounts: [], NetworkSettings: { Ports: {},
      Networks: { [networkName]: { NetworkID: binding.networkId } } } };
  const database = { Id: binding.databaseId, Name: `/${dbName}`, State: { Running: true },
    Config: {}, HostConfig: {}, Mounts: [], NetworkSettings: { Ports: {},
      Networks: { [networkName]: { NetworkID: binding.networkId } } } };
  const network = { Id: binding.networkId, Name: networkName, Internal: true };
  binding.apiFingerprint = fixtureLoginProofFingerprint(api);
  binding.databaseFingerprint = fixtureLoginProofFingerprint(database);
  binding.envSha256 = sha(envBytes);
  const inventory = { api, database, network, image, envBytes };
  let runner; let executeMode = false; let loseCreateMode = false; let failCleanupMode = false;
  const calls = []; const evidence = []; const events = [];
  const result = (execute) => ({ status: execute ? 'fixture-login-proof-verified-sessions-revoked'
    : 'fixture-login-proof-preflight-passed-no-mutation', executed: execute, rolesVerified: 2,
  loginsVerified: execute ? 2 : 0, meVerified: execute ? 2 : 0, logoutsVerified: execute ? 2 : 0,
  accessTokensRejected: execute ? 2 : 0, activeSessions: 0, activeRefreshTokens: 0,
  credentialsAttested: 2, quiescenceReadbacks: execute ? 3 : 0,
  retainedSessionRecords: execute ? 2 : 0, loginAudits: execute ? 2 : 0, schemaCount: 98,
  authHistory: { before: { sessions: 2, refreshTokens: 2, loginAudits: 2 },
    after: { sessions: execute ? 4 : 2, refreshTokens: execute ? 4 : 2, loginAudits: execute ? 4 : 2 },
    beforeDigest: '6'.repeat(64), afterDigest: '6'.repeat(64) },
  ledgerDigest, identityDigest: '9'.repeat(64), identityUnchanged: true, effectDigest: '8'.repeat(64),
  catalogStateDigest: '7'.repeat(64), visibilityUnchanged: true,
  apiReadback: true,
  paymentMemory: true, stripeLivemode: false, registrationClosed: true, catalogEnabled: false,
  externalProvidersEnabled: false, markerSha256: binding.markerSha256, cleanupVerified: true });
  const command = (args) => {
    calls.push([...args]); events.push(args[0]);
    if (args[0] === 'create') {
      const option = (name) => args[args.indexOf(name) + 1];
      const mounts = args.flatMap((value, index) => value === '--mount' ? [args[index + 1]] : []);
      runner = { Id: 'f'.repeat(64), Name: `/${option('--name')}`, Image: image.Id, State: { Running: false },
        Config: { Image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}@${binding.imageDigest}`,
          User: '100:101', Labels: { 'com.shareittoo.fixture-login-proof': option('--label').split('=')[1] },
          Entrypoint: ['node'], Cmd: args.slice(-3) },
        HostConfig: { ReadonlyRootfs: true, Privileged: false, CapDrop: ['ALL'], CapAdd: null,
          SecurityOpt: ['no-new-privileges'], LogConfig: { Type: 'none' }, NetworkMode: binding.networkId,
          PortBindings: {}, Devices: [] }, NetworkSettings: { Networks: { [networkName]: {} } },
        Mounts: mounts.map((mount) => { const parsed = Object.fromEntries(mount.split(',')
          .map((part) => part.includes('=') ? part.split('=') : [part, true]));
        return { Type: parsed.type, Source: parsed.src, Destination: parsed.dst, RW: false }; }) };
      if (loseCreateMode) throw Error('lost-create-response');
      return runner.Id;
    }
    if (args[0] === 'start') return JSON.stringify(result(executeMode));
    if (args[0] === 'rm') {
      if (failCleanupMode) throw Error('runner-cleanup-failed'); runner = undefined; return '';
    }
    if (args[0] === 'ps') return runner?.Id ?? '';
    assert.fail(`unexpected command ${args.join(' ')}`);
  };
  const inspectRecord = (target) => {
    if (target === binding.apiId) return api;
    if (target === binding.databaseId) return database;
    if (target === runner?.Id) return runner;
    assert.fail(`unexpected inspect ${target}`);
  };
  const run = async ({ execute = false, loseCreate = false, failCleanup = false } = {}) => {
    executeMode = execute; loseCreateMode = loseCreate; failCleanupMode = failCleanup;
    try {
      return await runFixtureLoginProofContainer({ binding, source, execute, command, inspectRecord, inventory,
        readInput: () => input, assertOutput: () => {}, outputStat: () => null, readEnv: () => envBytes,
        writeEvidence: (path, bytes, options) => { events.push('evidence'); evidence.push({ path, bytes, options }); } });
    } finally { executeMode = false; loseCreateMode = false; failCleanupMode = false; }
  };
  return { run, calls, evidence, events, input, binding, source, inventory, envBytes,
    get runner() { return runner; } };
}

test('prepare builder derives a one-hour binding only from exact read-only runtime and private digests', () => {
  const fixture = hostFixture(privateInput('e'.repeat(40))); let assertions = 0;
  const binding = buildFixtureLoginProofBinding({ source: fixture.source, ...fixture.inventory,
    inputDirectory: fixture.binding.inputDirectory, input: fixture.input,
    evidenceFile: fixture.binding.evidenceFile, proofNonce, io: {
      assertOutput: (path) => { assertions++; assert.equal(path, fixture.binding.evidenceFile); },
      outputStat: () => { assertions++; return null; },
    } });
  assert.equal(assertions, 2); assert.equal(binding.opsCommit, fixture.source.commit);
  assert.equal(binding.apiFingerprint, fixture.binding.apiFingerprint);
  assert.equal(binding.databaseFingerprint, fixture.binding.databaseFingerprint);
  assert.equal(binding.envSha256, sha(fixture.envBytes));
  assert.equal(binding.bootstrapManifestSha256, sha(fixture.input.manifestBytes));
  assert.equal(binding.credentialsSha256, sha(fixture.input.credentialsBytes));
  assert.equal(binding.markerSha256, sha(marker));
  assert.equal(binding.runtimeCommit, runtimeCommit);
  assert.notEqual(binding.runtimeCommit, fixture.input.manifest.preflight.runtimeCommit);
  assert.equal(binding.schemaVersion, 2);
});

test('host runner writes protected sanitized evidence only after confirmed execute and owned cleanup', async () => {
  for (const execute of [false, true]) {
    const fixture = hostFixture(privateInput('e'.repeat(40))); const result = await fixture.run({ execute });
    assert.equal(result.containerCleanup, 'verified'); assert.equal(fixture.runner, undefined);
    assert.equal(fixture.evidence.length, execute ? 1 : 0);
    if (execute) {
      assert.deepEqual(fixture.evidence[0].options, { mode: 0o600, uid: process.getuid(), gid: process.getgid() });
      const payload = JSON.parse(fixture.evidence[0].bytes);
      assert.equal(payload.activeSessions, 0); assert.equal(payload.activeRefreshTokens, 0);
      assert.equal(payload.runtimeActivated, false); assert.equal(payload.externalProvidersEnabled, false);
      assert.equal(payload.schemaVersion, 2);
      assert.deepEqual(payload.authHistory.after, { sessions: 4, refreshTokens: 4, loginAudits: 4 });
      assert.ok(fixture.events.indexOf('rm') < fixture.events.indexOf('evidence'));
      for (const secret of fixture.input.secrets) assert.ok(!fixture.evidence[0].bytes.includes(secret));
    }
  }
});

test('host rejects an old runtime or image binding before creating a proof runner', async () => {
  for (const drift of [{ runtimeCommit: 'e'.repeat(40) }, { imageDigest: `sha256:${'e'.repeat(64)}` }]) {
    const fixture = hostFixture(privateInput()); Object.assign(fixture.binding, drift);
    await assert.rejects(fixture.run({ execute: true }), /runtime_drift/u);
    assert.deepEqual(fixture.calls, []); assert.deepEqual(fixture.evidence, []);
  }
});

test('lost container-create response is identity-cleaned and runner cleanup failure suppresses evidence', async () => {
  {
    const fixture = hostFixture(privateInput());
    await assert.rejects(fixture.run({ execute: true, loseCreate: true }), /lost-create-response/u);
    assert.equal(fixture.runner, undefined); assert.equal(fixture.evidence.length, 0);
    assert.equal(fixture.calls.filter((call) => call[0] === 'create').length, 1);
  }
  {
    const fixture = hostFixture(privateInput());
    await assert.rejects(fixture.run({ execute: true, failCleanup: true }), /runner-cleanup-failed/u);
    assert.ok(fixture.runner); assert.equal(fixture.evidence.length, 0);
  }
});

test('source and result surfaces contain no credential, token or identity output path', () => {
  const source = readFileSync(new URL('../ops/staging_web_fixture_login_verifier.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.(?:log|dir)|process\.stdout\.write\([^\n]*(?:credentials|accounts|accessToken|refreshToken)/u);
  assert.doesNotMatch(source, /JSON\.stringify\([^\n]*(?:protectedInput\.credentials|input\.credentials)/u);
  assert.match(source, /process\.stderr\.write\('fixture_login_proof_failed_no_automatic_retry/u);
});
