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
  const base = { schemaVersion: 1, projectId: STAGING_GOOGLE_IAM_PROJECT,
    firebaseAccountEmailSha256: STAGING_GOOGLE_IAM_ACCOUNT_SHA256, serviceAccountEmailSha256: sha(serviceEmail),
    roles: [...STAGING_GOOGLE_IAM_ROLES], runId: 'synthetic-run-0001', sourceCommit,
    runnerDigest, gate: { id: 'SIT-GOOGLE-IAM-TEMP-READ-01', decision: 'A PASS',
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
  let current = clone(initial); const calls = [];
  return {
    calls,
    get current() { return clone(current); },
    mutate(fn) { current = fn(clone(current)); },
    async getPolicy() { calls.push({ kind: 'get' }); return clone(current); },
    async setPolicy(target) {
      calls.push({ kind: 'set', policy: clone(target) });
      if (behavior === 'reject') return { accepted: false };
      if (behavior === 'unknown') throw new Error('private_secret_token');
      if (behavior === 'partial') {
        current = clone(target); current.etag = 'partial-etag';
        const item = current.bindings.find((entry) => entry.role === STAGING_GOOGLE_IAM_ROLES[1]
          && !Object.hasOwn(entry, 'condition'));
        item.members = item.members.filter((member) => member !== principal);
        if (item.members.length === 0) current.bindings.splice(current.bindings.indexOf(item), 1);
        return { accepted: true };
      }
      current = { ...clone(target), etag: `readback-${calls.length}` };
      return { accepted: true };
    },
  };
}

const credentials = () => ({ serviceCredential: { projectId: STAGING_GOOGLE_IAM_PROJECT, clientEmail: serviceEmail },
  adminCredential: { authorization: 'Bearer private-admin-token' } });
const execute = (values) => runStagingGoogleTempIam({ binding: binding(), ...credentials(),
  operation: 'grant', execute: true, now: () => nowValue, ...values });
const records = (journalFile) => fs.readFileSync(journalFile, 'utf8').trim().split('\n').map(JSON.parse);

test('grant preserves unrelated memberships, conditions, audit config and adds only exact two roles', async (t) => {
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
  for (const role of STAGING_GOOGLE_IAM_ROLES) assert.deepEqual(
    written.bindings.filter((item) => item.role === role && !Object.hasOwn(item, 'condition')),
    [{ role, members: [principal] }]);
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
      && !Object.hasOwn(item, 'condition')).members.push('user:later@example.invalid');
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

test('conditional membership does not masquerade as the required temporary unconditional grant', () => {
  const plan = planTemporaryIamGrant(policy(), principal);
  assert.deepEqual(plan.addedRoles, STAGING_GOOGLE_IAM_ROLES);
  assert.ok(plan.target.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && Object.hasOwn(item, 'condition')));
  assert.ok(plan.target.bindings.some((item) => item.role === STAGING_GOOGLE_IAM_ROLES[0]
    && !Object.hasOwn(item, 'condition') && item.members.includes(principal)));
});

test('unconditional policies preserve an omitted, zero, or version-one policy version exactly', () => {
  for (const version of [undefined, 0, 1]) {
    const value = policy().bindings.filter((item) => !Object.hasOwn(item, 'condition'));
    const candidate = { bindings: value, auditConfigs: [], etag: 'version-etag',
      ...(version === undefined ? {} : { version }) };
    const target = planTemporaryIamGrant(candidate, principal).target;
    assert.equal(Object.hasOwn(target, 'version'), version !== undefined);
    if (version !== undefined) assert.equal(target.version, version);
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

test('revoke fails before mutation if an added membership is missing or duplicated', async (t) => {
  const { journalFile } = temp(t); const transport = fakeTransport(policy());
  await execute({ journalFile, transport });
  transport.mutate((current) => {
    const item = current.bindings.find((entry) => entry.role === STAGING_GOOGLE_IAM_ROLES[0]
      && !Object.hasOwn(entry, 'condition'));
    current.bindings.splice(current.bindings.indexOf(item), 1); current.etag = 'foreign-drift'; return current;
  });
  await assert.rejects(runStagingGoogleTempIam({ binding: binding(), ...credentials(), journalFile,
    operation: 'revoke', execute: true, transport, now: () => nowValue }), { message: 'iam_revoke_membership_drift' });
  assert.equal(transport.calls.filter((call) => call.kind === 'set').length, 1);
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
