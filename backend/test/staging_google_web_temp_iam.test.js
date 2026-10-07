import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  STAGING_GOOGLE_IAM_ACCOUNT_SHA256,
  STAGING_GOOGLE_IAM_PROJECT,
  STAGING_GOOGLE_IAM_ROLES,
  STAGING_GOOGLE_IAM_MAX_GRANT_MS,
  createStagingGoogleTempIamTransport,
  planTemporaryIamGrant,
  runStagingGoogleTempIam,
  runStagingGoogleTempIamCli,
  stagingGoogleTempIamErrorCode,
} from '../ops/staging_google_web_temp_iam.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const nowValue = Date.parse('2026-10-04T12:00:00.000Z');
const serviceEmail = `firebase-read@${STAGING_GOOGLE_IAM_PROJECT}.iam.gserviceaccount.com`;
const principal = `serviceAccount:${serviceEmail}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runnerDigest = sha(fs.readFileSync(new URL('../ops/staging_google_web_temp_iam.mjs', import.meta.url)));

function temp(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-temp-iam-')));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, journalFile: path.join(directory, 'iam.jsonl') };
}

function binding(overrides = {}) {
  const base = { schemaVersion: 2, projectId: STAGING_GOOGLE_IAM_PROJECT,
    firebaseAccountEmailSha256: STAGING_GOOGLE_IAM_ACCOUNT_SHA256, serviceAccountEmailSha256: sha(serviceEmail),
    roles: [...STAGING_GOOGLE_IAM_ROLES], runId: 'synthetic-run-0001', sourceCommit,
    runnerDigest, grantExpiresAt: '2026-10-04T12:30:00.000Z',
    gate: { id: 'SIT-GOOGLE-IAM-TEMP-READ-01', decision: 'A PASS',
      sourceCommit, runnerDigest, evidenceDigest: 'c'.repeat(64),
      expiresAt: '2026-10-04T13:00:00.000Z' } };
  return { ...base, ...overrides };
}

function policy(extraBindings = []) {
  return { version: 3, etag: 'baseline-etag', bindings: [
    { role: 'roles/viewer', members: ['user:unrelated@example.invalid'] },
    { role: STAGING_GOOGLE_IAM_ROLES[0], members: ['group:conditional@example.invalid'],
      condition: { title: 'preserved', description: 'keep exactly', expression: 'request.time < timestamp("2030-01-01T00:00:00Z")' } },
    ...extraBindings,
  ], auditConfigs: [{ service: 'allServices', auditLogConfigs: [{ logType: 'DATA_READ',
    exemptedMembers: ['user:a@example.invalid'] }] }] };
}

function fakeTransport(initial, behavior = 'success') {
  let current = clone(initial); let readbackFailed = false; const calls = [];
  return {
    calls,
    get current() { return clone(current); },
    mutate(fn) { current = fn(clone(current)); },
    async getPolicy() {
      calls.push({ kind: 'get' });
      if (behavior === 'readback-unavailable' && !readbackFailed && calls.some((call) => call.kind === 'set')) {
        readbackFailed = true; throw new Error('private_secret_token');
      }
      return clone(current);
    },
    async setPolicy(target) {
      calls.push({ kind: 'set', policy: clone(target) });
      if (behavior === 'reject') return { accepted: false };
      if (behavior === 'unknown') throw new Error('private_secret_token');
      if (behavior === 'partial' && calls.filter((call) => call.kind === 'set').length === 1) {
        current = clone(target); current.etag = 'partial-etag';
        const item = current.bindings.find((entry) => entry.role === STAGING_GOOGLE_IAM_ROLES[1]
          && entry.condition?.title.startsWith('sit-google-temp-'));
        item.members = item.members.filter((member) => member !== principal);
        if (item.members.length === 0) current.bindings.splice(current.bindings.indexOf(item), 1);
        return { accepted: true };
      }
      current = { ...clone(target), etag: `readback-${calls.length}` };
      if (behavior === 'lost-response' && calls.filter((call) => call.kind === 'set').length === 1)
        throw new Error('private_secret_token');
      return { accepted: true };
    },
  };
}

const credentials = () => ({ serviceCredential: { projectId: STAGING_GOOGLE_IAM_PROJECT, clientEmail: serviceEmail },
  adminCredential: { authorization: 'Bearer private-admin-token' } });
const execute = (values) => runStagingGoogleTempIam({ binding: binding(), ...credentials(),
  operation: 'grant', execute: true, now: () => nowValue, ...values });
const records = (journalFile) => fs.readFileSync(journalFile, 'utf8').trim().split('\n').map(JSON.parse);

test('grant preserves unrelated policy and adds only exact two roles with run-bound provider expiry', async (t) => {
  const { journalFile } = temp(t); const baseline = policy([{ role: 'projects/shareittoo-staging/roles/customReader',
    members: ['principalSet://iam.googleapis.com/example'] }]); const transport = fakeTransport(baseline);
  const result = await execute({ journalFile, transport });
  assert.equal(result.status, 'applied-and-read-back');
  assert.deepEqual(result.addedRoles, STAGING_GOOGLE_IAM_ROLES);
  assert.deepEqual(transport.calls.map((call) => call.kind), ['get', 'set', 'get']);
  const written = transport.calls[1].policy;
  assert.equal(written.etag, baseline.etag);
  assert.deepEqual(written.bindings.slice(0, baseline.bindings.length), baseline.bindings);
  assert.deepEqual(written.auditConfigs, baseline.auditConfigs);
  for (const role of STAGING_GOOGLE_IAM_ROLES) {
    const added = written.bindings.filter((item) => item.role === role
      && item.condition?.title.startsWith('sit-google-temp-'));
    assert.equal(added.length, 1); assert.deepEqual(added[0].members, [principal]);
    assert.equal(added[0].condition.expression, 'request.time < timestamp("2026-10-04T12:30:00.000Z")');
    assert.match(added[0].condition.title, /^sit-google-temp-[a-f0-9]{64}$/u);
  }
  assert.deepEqual(records(journalFile).map((record) => record.phase), ['intent', 'applied']);
  const journal = fs.readFileSync(journalFile, 'utf8');
  assert.doesNotMatch(journal, /firebase-read|private-admin-token|unrelated@example/u);
  assert.equal(fs.statSync(journalFile).mode & 0o777, 0o600);
});

test('pre-existing unconditional role memberships cause no write and are never revoked', async (t) => {
  const { journalFile } = temp(t);
  const transport = fakeTransport(policy(STAGING_GOOGLE_IAM_ROLES.map((role) => ({ role, members: [principal] }))));
  const granted = await execute({ journalFile, transport });
  assert.equal(granted.status, 'no-mutation-required'); assert.deepEqual(granted.addedRoles, []);
  assert.deepEqual(granted.preexistingRoles, STAGING_GOOGLE_IAM_ROLES);
  const revoke = await runStagingGoogleTempIam({ binding: binding(), ...credentials(), journalFile,
    operation: 'revoke', execute: true, transport, now: () => nowValue + 3_600_000 });
  assert.equal(revoke.status, 'no-mutation-required');
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 0);
  for (const role of STAGING_GOOGLE_IAM_ROLES) assert.ok(transport.current.bindings
    .some((item) => item.role === role && item.members.includes(principal)));
});

test('precise revoke removes only the membership added by this run and preserves later unrelated drift', async (t) => {
  const { journalFile } = temp(t);
  const transport = fakeTransport(policy([{ role: STAGING_GOOGLE_IAM_ROLES[0], members: [principal, 'user:keep@example.invalid'] }]));
  const grant = await execute({ journalFile, transport });
  assert.deepEqual(grant.addedRoles, [STAGING_GOOGLE_IAM_ROLES[1]]);
  assert.deepEqual(grant.preexistingRoles, [STAGING_GOOGLE_IAM_ROLES[0]]);
  transport.mutate((current) => {
    current.etag = 'concurrent-safe-etag';
    current.bindings.find((item) => item.role === STAGING_GOOGLE_IAM_ROLES[1]
      && item.condition?.title.startsWith('sit-google-temp-')).members.push('user:later@example.invalid');
    current.bindings.push({ role: 'roles/logging.viewer', members: ['group:later@example.invalid'] });
    return current;
  });
  const revoke = await runStagingGoogleTempIam({ binding: binding(), ...credentials(), journalFile,
    operation: 'revoke', execute: true, transport, now: () => nowValue + 86_400_000 });
  assert.equal(revoke.status, 'applied-and-read-back');
  const current = transport.current;
  assert.ok(current.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && item.members.includes(principal) && item.members.includes('user:keep@example.invalid')));
  assert.deepEqual(current.bindings.find((item) => item.role === STAGING_GOOGLE_IAM_ROLES[1]).members,
    ['user:later@example.invalid']);
  assert.ok(current.bindings.some((item) => item.role === 'roles/logging.viewer'
    && item.members.includes('group:later@example.invalid')));
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 2);
});

test('foreign conditional membership is preserved beside the dedicated temporary grant', () => {
  const plan = planTemporaryIamGrant(policy(), principal, binding());
  assert.deepEqual(plan.addedRoles, STAGING_GOOGLE_IAM_ROLES);
  assert.ok(plan.target.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && Object.hasOwn(item, 'condition')));
  assert.ok(plan.target.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && item.condition?.title.startsWith('sit-google-temp-') && item.members.includes(principal)));
});

test('adding conditions upgrades only the policy version to three', () => {
  for (const version of [undefined, 0, 1]) {
    const value = policy().bindings.filter((item) => !Object.hasOwn(item, 'condition'));
    const candidate = { bindings: value, auditConfigs: [], etag: 'version-etag',
      ...(version === undefined ? {} : { version }) };
    const target = planTemporaryIamGrant(candidate, principal, binding()).target;
    assert.equal(target.version, 3);
    assert.deepEqual(target.bindings.slice(0, candidate.bindings.length), candidate.bindings);
  }
});

test('etag/concurrency rejection is journaled, not retried, and cannot restart the run', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy(), 'reject');
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_policy_write_rejected' });
  assert.deepEqual(records(journalFile).map((record) => record.phase), ['intent', 'rejected']);
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_operation_already_started' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

test('lost write response becomes a terminal unknown outcome without leaking or retrying', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy(), 'unknown');
  await assert.rejects(execute({ journalFile, transport }), (error) => error.message === 'iam_policy_write_outcome_unknown'
    && !error.stack.includes('private_secret_token'));
  assert.deepEqual(records(journalFile).map((record) => record.phase), ['intent', 'outcome_unknown']);
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_operation_already_started' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

test('partial grant readback fails closed as unknown and never sends a second write', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy(), 'partial');
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_policy_readback_mismatch' });
  assert.deepEqual(records(journalFile).map((record) => record.phase), ['intent', 'outcome_unknown']);
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

test('owner-only execution lock prevents concurrent writes before any provider request', async (t) => {
  const { journalFile } = temp(t); fs.writeFileSync(`${journalFile}.lock`, 'occupied\n', { mode: 0o600 });
  const transport = fakeTransport(policy());
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_execution_locked' });
  assert.equal(transport.calls.length, 0);
});

test('source commit and runner drift both fail before any provider request', async (t) => {
  for (const field of ['sourceCommit', 'runnerDigest']) {
    const { journalFile } = temp(t); const transport = fakeTransport(policy());
    const value = binding(); const drift = field === 'sourceCommit' ? 'd'.repeat(40) : 'e'.repeat(64);
    value[field] = drift; value.gate[field] = drift;
    await assert.rejects(runStagingGoogleTempIam({ binding: value, ...credentials(), journalFile,
      operation: 'grant', execute: true, transport, now: () => nowValue }), { message: 'iam_source_binding_invalid' });
    assert.equal(transport.calls.length, 0); assert.equal(fs.existsSync(journalFile), false);
    assert.equal(fs.existsSync(`${journalFile}.lock`), false);
  }
});

test('revoke of a partial current grant removes only the remaining owned condition', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  await execute({ journalFile, transport });
  transport.mutate((current) => {
    const item = current.bindings.find((entry) => entry.role === STAGING_GOOGLE_IAM_ROLES[0]
      && entry.condition?.title.startsWith('sit-google-temp-'));
    current.bindings.splice(current.bindings.indexOf(item), 1); current.etag = 'foreign-drift'; return current;
  });
  const revoked = await runStagingGoogleTempIam({ binding: binding(), ...credentials(), journalFile,
    operation: 'revoke', execute: true, transport, now: () => nowValue });
  assert.deepEqual(revoked.addedRoles, [STAGING_GOOGLE_IAM_ROLES[1]]);
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 2);
});

test('HTTP transport uses exact IAM methods/version, carries etag policy, and sends one non-retried set', async () => {
  const calls = []; const baseline = policy();
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith(':getIamPolicy')) return { status: 200, text: async () => JSON.stringify(baseline) };
    return { status: 412, text: async () => JSON.stringify({ error: { status: 'ABORTED' } }) };
  };
  const transport = createStagingGoogleTempIamTransport({ authorization: 'Bearer private-admin-token', fetchImpl,
    timeoutMs: 1000 });
  assert.deepEqual(await transport.getPolicy(), baseline);
  assert.deepEqual(await transport.setPolicy(baseline), { accepted: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `https://cloudresourcemanager.googleapis.com/v1/projects/${STAGING_GOOGLE_IAM_PROJECT}:getIamPolicy`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { options: { requestedPolicyVersion: 3 } });
  assert.equal(calls[1].url, `https://cloudresourcemanager.googleapis.com/v1/projects/${STAGING_GOOGLE_IAM_PROJECT}:setIamPolicy`);
  assert.deepEqual(JSON.parse(calls[1].init.body), { policy: baseline });
  assert.equal(calls[1].init.headers.authorization, 'Bearer private-admin-token');
  const uncertain = createStagingGoogleTempIamTransport({ authorization: 'Bearer private-admin-token', timeoutMs: 1000,
    fetchImpl: async () => ({ status: 429, text: async () => JSON.stringify({ error: 'private_secret_token' }) }) });
  await assert.rejects(uncertain.setPolicy(baseline), (error) => error.message === 'iam_policy_write_outcome_unknown'
    && !error.stack.includes('private_secret_token'));
});

test('CLI binds service principal and intended admin account through protected files without mutation or disclosure', async (t) => {
  const { directory, journalFile } = temp(t); const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const files = { binding: path.join(directory, 'binding.json'), service: path.join(directory, 'service.json'),
    admin: path.join(directory, 'admin.json') };
  fs.writeFileSync(files.binding, JSON.stringify(binding({ gate: { ...binding().gate, decision: 'pending' } })), { mode: 0o600 });
  fs.writeFileSync(files.service, JSON.stringify({ type: 'service_account', project_id: STAGING_GOOGLE_IAM_PROJECT,
    client_email: serviceEmail, private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' }), { mode: 0o600 });
  fs.writeFileSync(files.admin, JSON.stringify({ user: { email: ' Contact@ShareItToo.com ' },
    tokens: { access_token: 'private-admin-token', expires_at: nowValue + 600_000 } }), { mode: 0o600 });
  const calls = [];
  const result = await runStagingGoogleTempIamCli(['--binding', files.binding, '--journal', journalFile,
    '--operation', 'grant', '--service-credential-file', files.service, '--admin-credential-file', files.admin], {
    now: () => nowValue, fetchImpl: async (url, init) => {
      calls.push({ url, init }); return { status: 200, text: async () => JSON.stringify(policy()) };
    }, timeoutMs: 1000,
  });
  assert.equal(result.status, 'preflight-passed-no-mutation'); assert.equal(fs.existsSync(journalFile), false);
  assert.equal(calls.length, 1); assert.equal(calls[0].init.headers.authorization, 'Bearer private-admin-token');
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /contact@|firebase-read@|private-admin-token/u);
  fs.chmodSync(files.binding, 0o644);
  await assert.rejects(runStagingGoogleTempIamCli(['--binding', files.binding, '--journal', journalFile,
    '--operation', 'grant', '--service-credential-file', files.service, '--admin-credential-file', files.admin], {
    now: () => nowValue, fetchImpl: async () => { throw new Error('should not run'); }, timeoutMs: 1000,
  }), { message: 'iam_binding_file_invalid' });
});

test('untrusted error strings always collapse to a fixed non-secret CLI code', () => {
  assert.equal(stagingGoogleTempIamErrorCode(new Error('private_secret_token')), 'google_temp_iam_failed');
  assert.doesNotMatch(stagingGoogleTempIamErrorCode(new Error('private_secret_token')), /private_secret_token/u);
});

const recover = (values) => runStagingGoogleTempIam({ binding: binding(), ...credentials(),
  operation: 'reconcile', execute: false, now: () => nowValue, ...values });
const revoke = (values) => runStagingGoogleTempIam({ binding: binding(), ...credentials(),
  operation: 'revoke', execute: true, now: () => nowValue, ...values });
const own = (item) => item.condition?.title.startsWith('sit-google-temp-');

test('expired, overlong, non-canonical or gate-exceeding expiry never reaches a provider', async (t) => {
  for (const expiry of [new Date(nowValue).toISOString(),
    new Date(nowValue + STAGING_GOOGLE_IAM_MAX_GRANT_MS + 1).toISOString(),
    '2026-10-04T12:30:00Z', 'not-a-date']) {
    const { journalFile } = temp(t); const transport = fakeTransport(policy());
    await assert.rejects(execute({ journalFile, transport, binding: binding({ grantExpiresAt: expiry }) }),
      { message: 'iam_expiry_invalid' });
    assert.equal(transport.calls.length, 0); assert.equal(fs.existsSync(journalFile), false);
  }
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  await assert.rejects(execute({ journalFile, transport, binding: binding({
    gate: { ...binding().gate, expiresAt: new Date(nowValue + 1000).toISOString() } }) }),
  { message: 'iam_expiry_invalid' });
  assert.equal(transport.calls.length, 0);
});

test('expiry reached during policy read cannot start a grant', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  await assert.rejects(execute({ journalFile, transport,
    now: () => transport.calls.length ? nowValue + 30 * 60_000 : nowValue }), { message: 'iam_expiry_invalid' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 0);
  assert.equal(fs.existsSync(journalFile), false);
});

test('condition namespace collision never adopts or edits an existing grant', () => {
  const previous = planTemporaryIamGrant(policy(), principal, binding()).target;
  assert.throws(() => planTemporaryIamGrant(previous, principal, binding()), { message: 'iam_condition_collision' });
});

test('legacy binding cannot create an unbounded grant', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  const legacy = binding({ schemaVersion: 1 }); delete legacy.grantExpiresAt;
  await assert.rejects(execute({ journalFile, transport, binding: legacy }), { message: 'iam_binding_invalid' });
  assert.equal(transport.calls.length, 0);
});

for (const behavior of ['lost-response', 'readback-unavailable', 'partial']) {
  test(`${behavior}: read-only reconciliation permits exactly one precise revoke`, async (t) => {
    const { journalFile } = temp(t); const transport = fakeTransport(policy(), behavior);
    await assert.rejects(execute({ journalFile, transport }));
    const bytes = fs.readFileSync(journalFile); const sets = transport.calls.filter((call) => call.kind === 'set').length;
    const observed = await recover({ journalFile, transport });
    assert.equal(observed.status, 'reconciled-read-only');
    assert.deepEqual(observed.ownedRoles, behavior === 'partial' ? [STAGING_GOOGLE_IAM_ROLES[0]] : STAGING_GOOGLE_IAM_ROLES);
    assert.deepEqual(fs.readFileSync(journalFile), bytes);
    assert.equal(transport.calls.filter((call) => call.kind === 'set').length, sets);
    const result = await revoke({ journalFile, transport });
    assert.equal(result.status, 'applied-and-read-back');
    assert.ok(!transport.current.bindings.some((item) => own(item) && item.members.includes(principal)));
    await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_operation_already_started' });
    assert.equal(transport.calls.filter((call) => call.kind === 'set').length, sets + 1);
  });
}

test('unknown grant with absent memberships remains unresolved and is never blindly replayed', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy(), 'unknown');
  await assert.rejects(execute({ journalFile, transport }));
  const observation = await recover({ journalFile, transport });
  assert.deepEqual(observation.ownedRoles, []);
  assert.equal(observation.absenceDoesNotResolvePendingGrant, true);
  await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_grant_outcome_unresolved' });
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_operation_already_started' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

test('durable intent alone supports crash reconciliation and expired owned-grant cleanup', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  await execute({ journalFile, transport });
  const intent = fs.readFileSync(journalFile, 'utf8').split('\n')[0] + '\n';
  fs.writeFileSync(journalFile, intent, { mode: 0o600 }); // Crash after provider commit, before terminal journal write.
  const late = () => nowValue + 2 * 60 * 60_000;
  const observed = await recover({ journalFile, transport, now: late });
  assert.equal(observed.grantPhase, 'intent'); assert.equal(observed.grantExpired, true);
  assert.deepEqual(observed.ownedRoles, STAGING_GOOGLE_IAM_ROLES);
  await revoke({ journalFile, transport, now: late });
  assert.ok(!transport.current.bindings.some(own));
});

test('crashed or concurrent lock never blocks read-only observation or gets deleted by it', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy()); await execute({ journalFile, transport });
  fs.writeFileSync(`${journalFile}.lock`, 'retained-crash-or-live-lock\n', { mode: 0o600 });
  const result = await recover({ journalFile, transport });
  assert.equal(result.executionLockPresent, true); assert.equal(fs.existsSync(`${journalFile}.lock`), true);
  await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_execution_locked' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

for (const change of ['expiry', 'duplicate', 'foreign-role']) {
  test(`reconciliation rejects ${change} ownership drift without removing any grant`, async (t) => {
    const { journalFile } = temp(t); const transport = fakeTransport(policy()); await execute({ journalFile, transport });
    transport.mutate((value) => {
      const item = value.bindings.find(own);
      if (change === 'expiry') item.condition.expression = 'true';
      if (change === 'duplicate') value.bindings.push(clone(item));
      if (change === 'foreign-role') item.role = 'roles/logging.viewer';
      value.etag = 'foreign-etag'; return value;
    });
    await assert.rejects(recover({ journalFile, transport }), { message: 'iam_reconciliation_ownership_drift' });
    await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_reconciliation_ownership_drift' });
    assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
  });
}

test('policy or etag drift between reconciliation reads fails before revoke', async (t) => {
  for (const etagOnly of [false, true]) {
    const { journalFile } = temp(t); const transport = fakeTransport(policy()); await execute({ journalFile, transport });
    const get = transport.getPolicy; let reads = 0;
    transport.getPolicy = async () => {
      if (++reads === 2) transport.mutate((value) => {
        value.etag = 'concurrent-etag';
        if (!etagOnly) value.bindings.push({ role: 'roles/logging.viewer', members: ['group:new@example.invalid'] });
        return value;
      });
      return get();
    };
    await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_reconciliation_concurrent_drift' });
    assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
  }
});

test('lost revoke response is observable but never authorizes a second revoke write', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy()); await execute({ journalFile, transport });
  const set = transport.setPolicy;
  transport.setPolicy = async (value) => { await set(value); throw new Error('private_secret_token'); };
  await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_policy_write_outcome_unknown' });
  const observed = await recover({ journalFile, transport });
  assert.equal(observed.revokeAlreadyStarted, true); assert.deepEqual(observed.ownedRoles, []);
  await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_operation_already_started' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 2);
});

test('retained crash bindings use a strict expiry boundary independent of local lock or cleanup', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy()); await execute({ journalFile, transport });
  fs.writeFileSync(`${journalFile}.lock`, 'retained-lock\n', { mode: 0o600 });
  const expiry = Date.parse('2026-10-04T12:30:00.000Z');
  const conditions = transport.current.bindings.filter(own).map((item) => item.condition.expression);
  assert.equal(conditions.length, 2);
  // Model only Google's documented request.time < timestamp() semantics.
  // This is not a live IAM enforcement/propagation test.
  for (const expression of conditions) {
    const match = /^request\.time < timestamp\("([0-9TZ:.\-]+)"\)$/u.exec(expression);
    assert.ok(match); assert.equal(Date.parse(match[1]), expiry);
    const grantsAt = (requestTime) => requestTime < Date.parse(match[1]);
    assert.equal(grantsAt(expiry - 1), true);
    assert.equal(grantsAt(expiry), false);
    assert.equal(grantsAt(expiry + 86_400_000), false);
  }
  const observation = await recover({ journalFile, transport, now: () => expiry });
  assert.equal(observation.grantExpired, true); assert.equal(observation.executionLockPresent, true);
  assert.equal(transport.current.bindings.filter(own).length, 2); // Inert cleanup debt is retained.
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

test('an unknown added grant never makes a pre-existing unconditional membership revocable', async (t) => {
  const { journalFile } = temp(t);
  const transport = fakeTransport(policy([{ role: STAGING_GOOGLE_IAM_ROLES[0], members: [principal] }]), 'lost-response');
  await assert.rejects(execute({ journalFile, transport }));
  const observed = await recover({ journalFile, transport });
  assert.deepEqual(observed.ownedRoles, [STAGING_GOOGLE_IAM_ROLES[1]]);
  await revoke({ journalFile, transport });
  assert.ok(transport.current.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && !Object.hasOwn(item, 'condition') && item.members.includes(principal)));
});

test('foreign unconditional additions during unknown outcome are preserved by recovery', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy(), 'lost-response');
  await assert.rejects(execute({ journalFile, transport }));
  transport.mutate((value) => {
    value.etag = 'foreign-unconditional-addition';
    value.bindings.push({ role: STAGING_GOOGLE_IAM_ROLES[0], members: [principal] }); return value;
  });
  await revoke({ journalFile, transport });
  assert.ok(transport.current.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && !Object.hasOwn(item, 'condition') && item.members.includes(principal)));
});

test('a rejected grant cannot claim memberships later created by another writer', async (t) => {
  const { journalFile } = temp(t); const initial = policy(); const transport = fakeTransport(initial, 'reject');
  await assert.rejects(execute({ journalFile, transport }), { message: 'iam_policy_write_rejected' });
  transport.mutate(() => ({ ...planTemporaryIamGrant(initial, principal, binding()).target, etag: 'foreign-etag' }));
  await assert.rejects(revoke({ journalFile, transport }), { message: 'iam_reconciliation_ownership_drift' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
});

test('preflight also rejects an expired grant instead of advertising executable readiness', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  await assert.rejects(execute({ journalFile, transport, execute: false, now: () => nowValue + 30 * 60_000 }),
    { message: 'iam_expiry_invalid' });
  assert.equal(transport.calls.length, 0);
});
