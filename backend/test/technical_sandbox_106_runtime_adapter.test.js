import assert from 'node:assert/strict';
import { chmodSync, fstatSync, lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTechnicalSandbox106Dependencies, readStagingTechnicalSandboxCapability,
  readTechnicalSandboxSessionProof, validateTechnicalSandboxSecretMetadata } from '../ops/technical_sandbox_106_runtime_adapter.mjs';

import crypto from 'node:crypto';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function privateFixture() {
  const directory = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'sit-tech-sandbox-106-'));
  chmodSync(directory, 0o700);
  return directory;
}
function writeProtected(directory, name, value) {
  const file = path.join(directory, name); const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(file, bytes, { mode: 0o600 }); chmodSync(file, 0o600); return { file, sha256: digest(bytes) };
}
const now = Date.parse('2026-10-25T10:00:00.000Z');
const syntheticIds = ['synthetic_sandbox_user_owner','synthetic_sandbox_user_renter'];
function proof(overrides = {}) { return { kind: 'sit-technical-sandbox-session-proof', schemaVersion: 1,
  principalId: syntheticIds[0], issuedAt: '2026-10-25T09:30:00.000Z', expiresAt: '2026-10-25T11:00:00.000Z',
  accessToken: 'owner-session-token-do-not-print', ...overrides }; }
function response(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
const capability = (available = true) => ({ capabilities: { provider: null, providerBacked: false,
  checkoutAvailable: false, payoutOnboardingAvailable: false, liveMoney: false }, technicalSandbox: {
  technicalSandboxAvailable: available, provider: 'stripe', mode: available ? 'test' : 'disabled', amountMinor: 100,
  currency: 'EUR', maxRunsPerUser24h: 3, professionalReview: false, syntheticOnly: true, liveMoney: false,
  bookingEffect: false, ledgerEffect: false, connectEffect: false }, privateUserId: 'must-not-escape' });

test('session proof is exact-user bound, file-hashed, protected and expiry checked', () => {
  const directory = privateFixture();
  try {
    const saved = writeProtected(directory, 'session-proof.json', proof());
    const parsed = readTechnicalSandboxSessionProof(saved.file, saved.sha256, { userIds: syntheticIds, now });
    assert.equal(parsed.principalId, syntheticIds[0]); assert.equal(parsed.token, proof().accessToken);
    assert.throws(() => readTechnicalSandboxSessionProof(saved.file, saved.sha256,
      { userIds: [syntheticIds[1]], now }), /sandbox106_session_invalid/u);
    const expired = writeProtected(directory, 'expired.json', proof({ expiresAt: '2026-10-25T09:59:59.000Z' }));
    assert.throws(() => readTechnicalSandboxSessionProof(expired.file, expired.sha256, { userIds: syntheticIds, now }), /sandbox106_session_invalid/u);
    assert.throws(() => readTechnicalSandboxSessionProof(saved.file, '0'.repeat(64), { userIds: syntheticIds, now }), /sandbox106_protected_digest/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('session proof reader detects post-open file replacement and mode drift', () => {
  const directory = privateFixture();
  try {
    const saved = writeProtected(directory, 'session-proof.json', proof());
    assert.throws(() => readTechnicalSandboxSessionProof(saved.file, saved.sha256, { userIds: syntheticIds, now,
      afterRead: () => writeFileSync(saved.file, JSON.stringify(proof({ accessToken: 'replacement-token-000000' }))) }),
    /sandbox106_protected_changed/u);
    const other = writeProtected(directory, 'mode.json', proof()); chmodSync(other.file, 0o644);
    assert.throws(() => readTechnicalSandboxSessionProof(other.file, other.sha256, { userIds: syntheticIds, now }), /sandbox106_protected_metadata/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('gateway adapter permits only the fixed staging v1 GET, disables redirects, sanitizes and hashes body', async () => {
  const requests = [];
  const result = await readStagingTechnicalSandboxCapability({ token: 'owner-session-token-do-not-print', expectedAvailable: true, expectedCommit: 'b'.repeat(40), expectedImageDigest: `sha256:${'c'.repeat(64)}`,
    runtimeReadback: async () => ({ versionCommit: 'b'.repeat(40), configCommit: 'b'.repeat(40), imageDigest: `sha256:${'c'.repeat(64)}` }),
    fetchImpl: async (url, options) => { requests.push({ url: String(url), options }); return response(url.pathname === '/api/version' ? { commit: 'b'.repeat(40) } : capability(true)); }, attempts: 1 });
  assert.deepEqual(requests.map(r => r.url), ['https://staging.shareittoo.com/api/version','https://staging.shareittoo.com/api/v1/payments/capabilities']);
  for (const request of requests) { assert.equal(request.options.method, 'GET'); assert.equal(request.options.redirect, 'manual'); }
  assert.equal(requests[1].options.headers.authorization, 'Bearer owner-session-token-do-not-print');
  assert.equal(result.technicalSandbox.available, true); assert.equal(result.paymentTransport, 'memory');
  assert.equal(result.versionCommit, 'b'.repeat(40)); assert.equal(result.imageDigest, `sha256:${'c'.repeat(64)}`);
  assert.equal(result.technicalSandbox.payoutEffects, false); assert.equal(result.technicalSandbox.marketplaceStripe, false);
  assert.equal(JSON.stringify(result).includes('must-not-escape'), false); assert.match(result.bodySha256, /^[a-f0-9]{64}$/u);
});

test('gateway adapter rejects redirects and authentication errors without retry', async () => {
  for (const status of [302, 401, 403]) {
    let calls = 0;
    await assert.rejects(() => readStagingTechnicalSandboxCapability({ token: 'owner-session-token-do-not-print', expectedAvailable: true, expectedCommit: 'b'.repeat(40), expectedImageDigest: `sha256:${'c'.repeat(64)}`,
      runtimeReadback: async () => ({ versionCommit: 'b'.repeat(40), configCommit: 'b'.repeat(40), imageDigest: `sha256:${'c'.repeat(64)}` }),
      fetchImpl: async () => { calls++; return response({}, status); }, attempts: 3 }), /sandbox106_gateway_/u);
    assert.equal(calls, 1);
  }
});

test('gateway adapter has a bounded timeout and safe network errors', async () => {
  await assert.rejects(() => readStagingTechnicalSandboxCapability({ token: 'owner-session-token-do-not-print', expectedAvailable: true, expectedCommit: 'b'.repeat(40), expectedImageDigest: `sha256:${'c'.repeat(64)}`,
    runtimeReadback: async () => ({ versionCommit: 'b'.repeat(40), configCommit: 'b'.repeat(40), imageDigest: `sha256:${'c'.repeat(64)}` }),
    attempts: 1, timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) }),
  /sandbox106_gateway_timeout_or_network/u);
});

test('credential readback binds actual secret bytes to evidence SHA and detects descriptor race', () => {
  const directory = privateFixture();
  try {
    const files = [path.join(directory,'restricted-key'), path.join(directory,'webhook-secret')];
    const contents = [Buffer.from('sk_test_synthetic_key'), Buffer.from('whsec_synthetic_secret')];
    files.forEach((file, i) => { writeFileSync(file, contents[i], { mode: 0o600 }); chmodSync(file, 0o600); });
    const metadata = file => { const m = lstatSync(file, { bigint: true }); return Object.assign(m, { uid: 100n, gid: 101n }); };
    const evidence = { credentials: { secretKey: { path: files[0], sha256: digest(contents[0]) }, webhookSecret: { path: files[1], sha256: digest(contents[1]) } } };
    const adjustedFstat = fd => Object.assign(fstatSync(fd, { bigint: true }), { uid: 100n, gid: 101n });
    assert.equal(validateTechnicalSandboxSecretMetadata(evidence, { fsOps: { lstatSync: metadata, fstatSync: adjustedFstat } }), true);
    assert.throws(() => validateTechnicalSandboxSecretMetadata({ credentials: { ...evidence.credentials,
      secretKey: { ...evidence.credentials.secretKey, sha256: '0'.repeat(64) } } }, { fsOps: { lstatSync: metadata,
      fstatSync: adjustedFstat } }), /sandbox106_secret_digest/u);
    let count = 0;
    assert.throws(() => validateTechnicalSandboxSecretMetadata(evidence, { fsOps: { lstatSync: metadata,
      fstatSync: fd => {
        const m = adjustedFstat(fd);
        if (++count === 2) writeFileSync(files[0], 'sk_test_changed_key');
        return m;
      } } }), /sandbox106_secret_changed/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Docker adapter uses exact ID argv and sends session token only on exec stdin', async () => {
  const directory = privateFixture(); const calls = [];
  try {
    const deps = createTechnicalSandbox106Dependencies({ token: 'owner-session-token-do-not-print', evidenceDirectory: directory,
      command: async entry => {
        calls.push(entry);
        if (entry.args[0] === 'exec') return JSON.stringify({ authenticated: true, live: { status: 'ok' }, ready: { status: 'ok' },
          technicalSandbox: { available: true, provider: 'stripe', mode: 'test', amountMinor: 100, currency: 'EUR',
            maxRunsPerUser24h: 3, professionalReview: false, syntheticOnly: true, liveMoney: false, bookingEffects: false,
            ledgerEffects: false, connectEffects: false, payoutEffects: false, notificationEffects: false, marketplaceStripe: false }, paymentTransport: 'memory' });
        return '';
      } });
    const result = await deps.localReadback('a'.repeat(64));
    assert.equal(result.authenticated, true);
    const call = calls[0]; assert.deepEqual(call.args.slice(0,4), ['exec','-i','a'.repeat(64),'node']);
    assert.equal(call.args.includes('owner-session-token-do-not-print'), false);
    assert.match(call.input, /owner-session-token-do-not-print/u);
    assert.equal(JSON.stringify(result).includes('owner-session-token-do-not-print'), false);
    await assert.rejects(() => deps.inspect('bad-id'), /sandbox106_docker_id/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Docker adapter rejects inspect output whose ID differs from the requested exact ID', async () => {
  const directory = privateFixture();
  try {
    const deps = createTechnicalSandbox106Dependencies({ token: 'owner-session-token-do-not-print', evidenceDirectory: directory,
      command: async () => JSON.stringify([{ Id: 'b'.repeat(64) }]) });
    await assert.rejects(() => deps.inspect('a'.repeat(64)), /sandbox106_docker_identity/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('public readback binds staging version to exact canonical container ID and image RepoDigest', async () => {
  const directory = privateFixture(); const id = 'a'.repeat(64); const imageId = `sha256:${'b'.repeat(64)}`;
  const calls = [];
  try {
    const deps = createTechnicalSandbox106Dependencies({ token: 'owner-session-token-do-not-print', evidenceDirectory: directory,
      command: async ({ args }) => {
        calls.push(args);
        if (args[0] === 'ps') return `${id}\n`;
        if (args[0] === 'inspect') return JSON.stringify([{ Id: id, Name: '/shareittoo-staging-api', Image: imageId,
          Config: { Env: ['APP_COMMIT=' + 'b'.repeat(40)] } }]);
        if (args[0] === 'image') return JSON.stringify([{ Id: imageId, RepoDigests: [`registry.example/sit/api@sha256:${'c'.repeat(64)}`] }]);
        throw new Error('unexpected docker argv');
      }, fetchImpl: async url => response(url.pathname === '/api/version' ? { commit: 'b'.repeat(40) } : capability(false)) });
    const result = await deps.gatewayReadback({ expectedTechnicalSandbox: false, expectedCommit: 'b'.repeat(40),
      expectedImageDigest: `sha256:${'c'.repeat(64)}` });
    assert.equal(result.versionCommit, 'b'.repeat(40)); assert.equal(result.imageDigest, `sha256:${'c'.repeat(64)}`);
    assert.deepEqual(calls[0], ['ps','--all','--no-trunc','--filter','name=^/shareittoo-staging-api$','--format','{{.ID}}']);
    assert.deepEqual(calls[1], ['inspect',id]); assert.deepEqual(calls[2], ['image','inspect',imageId]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
