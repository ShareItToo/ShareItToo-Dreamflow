import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runStagingGoogleWebPrerequisites as run, prerequisiteSnapshotDigest, assertPrerequisiteOutputPath,
  STAGING_GOOGLE_WEB_DISPLAY_NAME } from '../ops/staging_google_web_prerequisites.mjs';
import { sha256, readGoogleWebConfig, profile } from '../../tool/staging_web_contract.mjs';

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-prerequisite-')));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const publicKey = ['AI', 'za', 'x'.repeat(35)].join('');
  const apiKey = { apiKeyId: 'synthetic-existing-key', projectId: 'synthetic-project',
    keyFingerprint: sha256(publicKey), restrictionsDigest: 'f'.repeat(64) };
  const snapshot = {
    complete: true, projectId: 'synthetic-project', projectNumber: '123456789012', backendProjectId: 'synthetic-project',
    authEnabled: true, emulatorEnabled: false, googleEnabled: true, webApps: [],
    webAppsInventory: { showDeleted: true, exhausted: true, nextPageToken: '' },
    apiKey: { ...apiKey, exists: true, webCompatible: true }, keyInventoryDigest: '9'.repeat(64),
    authorizedDomains: ['synthetic-project.firebaseapp.com', 'localhost', 'shareittoo.com'],
    authConfigDigest: 'a'.repeat(64), providerConfigDigest: 'b'.repeat(64),
    otherAppsDigest: 'c'.repeat(64), runtimeDigest: 'd'.repeat(64), revision: 'revision-before',
  };
  const binding = { schemaVersion: 3, apiKey, projectId: snapshot.projectId, projectNumber: snapshot.projectNumber,
    origin: 'https://staging.shareittoo.com', displayName: STAGING_GOOGLE_WEB_DISPLAY_NAME,
    firebaseAccountEmailSha256: sha256('contact@shareittoo.com'),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    runnerDigest: sha256(fs.readFileSync(new URL('../ops/staging_google_web_prerequisites.mjs', import.meta.url))),
    baselineDigest: prerequisiteSnapshotDigest(snapshot),
    domainLeaseVerifier: { algorithm: 'Ed25519', publicKeySha256: '7'.repeat(64) } };
  binding.gate = { id: 'SIT-GOOGLE-WEB-PREREQ-01', decision: 'A PASS', sourceCommit: binding.sourceCommit,
    firebaseAccountEmailSha256: binding.firebaseAccountEmailSha256,
    runnerDigest: binding.runnerDigest, baselineDigest: binding.baselineDigest, evidenceDigest: 'e'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const appId = `1:${snapshot.projectNumber}:web:${'a'.repeat(32)}`;
  const app = { appId, projectId: snapshot.projectId, state: 'ACTIVE', apiKeyId: apiKey.apiKeyId,
    displayName: STAGING_GOOGLE_WEB_DISPLAY_NAME };
  const sdk = { projectId: snapshot.projectId, messagingSenderId: snapshot.projectNumber, appId,
    apiKey: publicKey, authDomain: `${snapshot.projectId}.firebaseapp.com` };
  const calls = { create: 0, operation: 0, app: 0, patch: 0, sdk: 0 };
  const journalFile = path.join(directory, 'journal.jsonl');
  const configFile = path.join(directory, 'public-config.json');
  const latest = () => JSON.parse(fs.readFileSync(journalFile, 'utf8').trimEnd().split('\n').at(-1)).state;
  const adapter = {
    async readSnapshot() { return structuredClone(snapshot); },
    async createWebApp(request) {
      calls.create++; assert.deepEqual(request, { projectId: binding.projectId, apiKeyId: binding.apiKey.apiKeyId,
        displayName: STAGING_GOOGLE_WEB_DISPLAY_NAME });
      assert.equal(latest().phase, 'create_intent');
      assert.equal(fs.statSync(journalFile).mode & 0o777, 0o600);
      return { name: 'operations/synthetic-create' };
    },
    async readOperation(request) {
      calls.operation++; assert.equal(request.name, 'operations/synthetic-create');
      snapshot.webApps = [structuredClone(app)];
      return { name: request.name, done: true, appId, failed: false };
    },
    async readWebApp(request) {
      calls.app++; assert.deepEqual(request, { projectId: binding.projectId, appId });
      return structuredClone(app);
    },
    async acquireDomainGuard(request) { return { kind: 'conditional', providerEnforced: true, ...request }; },
    async patchAuthorizedDomains(request) {
      calls.patch++; assert.equal(latest().phase, 'domain_intent');
      assert.equal(request.updateMask, 'authorizedDomains');
      assert.equal(request.projectId, binding.projectId);
      if (request.guard.kind === 'conditional') assert.equal(request.guard.revision, snapshot.revision);
      snapshot.authorizedDomains = [...request.authorizedDomains]; snapshot.revision = 'revision-after';
    },
    async readSdkConfig(request) { calls.sdk++; assert.equal(request.appId, appId); return structuredClone(sdk); },
  };
  const invoke = (extra = {}) => run({ binding, adapter, journalFile, configFile, ...extra });
  return { directory, snapshot, binding, app, sdk, calls, adapter, journalFile, configFile, latest, invoke };
}

test('default preflight creates no files or provider effects, even before gate acceptance', async (t) => {
  const f = fixture(t); f.binding.gate.decision = 'pending';
  assert.equal((await f.invoke()).status, 'preflight-passed-no-mutation');
  assert.deepEqual(fs.readdirSync(f.directory), []);
  assert.deepEqual(f.calls, { create: 0, operation: 0, app: 0, patch: 0, sdk: 0 });
  for (const execute of ['true', 1, {}, null]) {
    await assert.rejects(f.invoke({ execute }), /execute_flag_invalid/u);
  }
  await assert.rejects(f.invoke({ execute: true }), /accepted_gate_required/u);
  assert.deepEqual(fs.readdirSync(f.directory), []);
});
test('one create and one guarded patch preserve all domains/config and export compatible public bytes', async (t) => {
  const f = fixture(t); const baselineDomains = [...f.snapshot.authorizedDomains];
  const result = await f.invoke({ execute: true });
  assert.equal(result.status, 'prerequisites-verified-config-awaiting-review');
  assert.equal(result.providerApprovalInferred, false); assert.equal(result.buildExecuted, false);
  assert.deepEqual(f.snapshot.authorizedDomains, [...baselineDomains, 'staging.shareittoo.com'].sort());
  const bound = readGoogleWebConfig(f.configFile, result.configDigest);
  assert.deepEqual(Object.keys(bound.config), ['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain', 'backendProjectId', 'authorizedOrigin']);
  assert.equal(profile(f.binding.sourceCommit, '1.0.0+123', bound).SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(profile(f.binding.sourceCommit, '1.0.0+123').SIT_SOCIAL_GOOGLE_ENABLED, 'false');
  assert.equal(f.latest().phase, 'complete');
  assert.equal(f.latest().schemaVersion, 3); assert.equal(f.calls.app, 2);
  assert.equal(fs.statSync(f.configFile).mode & 0o777, 0o600);
  assert.ok(!fs.readFileSync(f.journalFile, 'utf8').includes(f.sdk.apiKey));
  assert.ok(!JSON.stringify(result).includes(f.sdk.apiKey));
  await f.invoke({ execute: true });
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
  assert.equal(fs.existsSync(`${f.journalFile}.lock`), false);
});
test('preflight compares whole validated domain entries, never host substrings or a string inventory', async (t) => {
  const f = fixture(t);
  f.snapshot.authorizedDomains.push('staging.shareittoo.com.evil.invalid', 'evil-staging.shareittoo.com', 'notstaging.shareittoo.com');
  f.binding.baselineDigest = prerequisiteSnapshotDigest(f.snapshot);
  f.binding.gate.baselineDigest = f.binding.baselineDigest;
  assert.equal((await f.invoke()).status, 'preflight-passed-no-mutation');
  f.snapshot.authorizedDomains.push('staging.shareittoo.com');
  await assert.rejects(f.invoke(), /baseline_already_changed/u);
  for (const domains of ['staging.shareittoo.com', ['https://staging.shareittoo.com'], ['evil.invalid/staging.shareittoo.com'],
    ['staging.shareittoo.com@evil.invalid'], ['staging.shareittoo.com?evil.invalid']]) {
    f.snapshot.authorizedDomains = domains;
    await assert.rejects(f.invoke(), /domain_inventory_invalid/u);
  }
  assert.deepEqual(f.calls, { create: 0, operation: 0, app: 0, patch: 0, sdk: 0 });
  assert.deepEqual(fs.readdirSync(f.directory), []);
});
for (const mutation of ['source', 'runner', 'origin', 'project', 'expired', 'gate', 'baseline', 'extra']) {
  test(`binding ${mutation} refuses before create`, async (t) => {
    const f = fixture(t);
    if (mutation === 'source') f.binding.sourceCommit = 'a'.repeat(40);
    if (mutation === 'runner') f.binding.runnerDigest = 'a'.repeat(64);
    if (mutation === 'origin') f.binding.origin = 'https://shareittoo.com';
    if (mutation === 'project') f.binding.projectId = 'foreign-project';
    if (mutation === 'expired') f.binding.gate.expiresAt = new Date(0).toISOString();
    if (mutation === 'gate') f.binding.gate.sourceCommit = 'b'.repeat(40);
    if (mutation === 'baseline') f.snapshot.authorizedDomains.push('new.example.invalid');
    if (mutation === 'extra') f.binding.extra = true;
    await assert.rejects(f.invoke({ execute: true })); assert.equal(f.calls.create, 0);
  });
}
for (const mutation of ['app', 'domain', 'incomplete', 'wrongProject', 'emulator', 'authOff', 'googleOff']) {
  test(`preflight ${mutation} fails with zero mutations`, async (t) => {
    const f = fixture(t);
    if (mutation === 'app') f.snapshot.webApps = [f.app];
    if (mutation === 'domain') f.snapshot.authorizedDomains.push('staging.shareittoo.com');
    if (mutation === 'incomplete') f.snapshot.complete = false;
    if (mutation === 'wrongProject') f.snapshot.backendProjectId = 'other-project';
    if (mutation === 'emulator') f.snapshot.emulatorEnabled = true;
    if (mutation === 'authOff') f.snapshot.authEnabled = false;
    if (mutation === 'googleOff') f.snapshot.googleEnabled = false;
    await assert.rejects(f.invoke({ execute: true })); assert.equal(f.calls.create, 0);
  });
}
test('pending operation resumes the same identity without duplicate create', async (t) => {
  const f = fixture(t); const complete = f.adapter.readOperation;
  f.adapter.readOperation = async ({ name }) => ({ name, done: false, appId: null, failed: false });
  assert.deepEqual(await f.invoke({ execute: true }), { status: 'pending', phase: 'create_pending' });
  assert.equal(f.calls.patch, 0); assert.equal(fs.existsSync(f.configFile), false);
  f.adapter.readOperation = complete;
  await f.invoke({ execute: true }); assert.equal(f.calls.create, 1);
});
test('lost create response preserves intent and never resubmits or adopts a counted app', async (t) => {
  const f = fixture(t);
  f.adapter.createWebApp = async () => { f.calls.create++; f.snapshot.webApps = [f.app]; throw Error('private-token'); };
  await assert.rejects(f.invoke({ execute: true }), { message: 'google_web_prerequisite_operation_failed' });
  assert.equal(f.latest().phase, 'create_intent');
  await assert.rejects(f.invoke({ execute: true }), /create_outcome_unknown/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 0);
});
for (const variant of ['foreign', 'failed', 'duplicate', 'settings', 'domainRemoval']) {
  test(`operation completion ${variant} cannot authorize domain mutation`, async (t) => {
    const f = fixture(t); const complete = f.adapter.readOperation;
    f.adapter.readOperation = async (request) => {
      const result = await complete(request);
      if (variant === 'foreign') result.name = 'operations/foreign';
      if (variant === 'failed') result.failed = true;
      if (variant === 'duplicate') f.snapshot.webApps.push({ ...f.app, appId: f.app.appId.replace(/a$/u, 'b') });
      if (variant === 'settings') f.snapshot.authConfigDigest = 'f'.repeat(64);
      if (variant === 'domainRemoval') f.snapshot.authorizedDomains.pop();
      return result;
    };
    await assert.rejects(f.invoke({ execute: true }));
    assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 0); assert.equal(fs.existsSync(f.configFile), false);
  });
}
for (const variant of ['unproven', 'foreign', 'stale', 'race', 'expiredLease', 'localLock']) {
  test(`domain guard ${variant} cannot patch`, async (t) => {
    const f = fixture(t);
    f.adapter.acquireDomainGuard = async ({ projectId, revision }) => {
      if (variant === 'race') f.snapshot.revision = 'concurrent';
      if (variant === 'expiredLease' || variant === 'localLock') return { kind: 'exclusive', projectId,
        allWritersExcluded: variant !== 'localLock', leaseId: 'synthetic-lease', expiresAt: variant === 'expiredLease' ? new Date(0).toISOString() : f.binding.gate.expiresAt };
      return { kind: 'conditional', providerEnforced: variant !== 'unproven', projectId: variant === 'foreign' ? 'foreign-project' : projectId,
        revision: variant === 'stale' ? 'old-revision' : revision };
    };
    await assert.rejects(f.invoke({ execute: true })); assert.equal(f.calls.patch, 0);
    assert.equal(f.latest().phase, 'app_verified');
  });
}
test('explicit all-writer lease is accepted without inventing provider CAS support', async (t) => {
  const f = fixture(t);
  f.adapter.acquireDomainGuard = async ({ projectId }) => ({ kind: 'exclusive', projectId, allWritersExcluded: true,
    leaseId: 'synthetic-lease', expiresAt: f.binding.gate.expiresAt });
  await f.invoke({ execute: true }); assert.equal(f.calls.patch, 1);
});
test('lost patch response reconciles read-only without replay or rollback', async (t) => {
  const f = fixture(t); const patch = f.adapter.patchAuthorizedDomains;
  f.adapter.patchAuthorizedDomains = async (request) => { await patch(request); throw Error('private provider payload'); };
  await assert.rejects(f.invoke({ execute: true }), { message: 'google_web_prerequisite_operation_failed' });
  assert.equal(f.latest().phase, 'domain_intent');
  await f.invoke({ execute: true }); assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
});
for (const variant of ['noApply', 'removedDomain', 'extraDomain', 'provider', 'runtime']) {
  test(`postpatch ${variant} preserves partial journal without export or rollback`, async (t) => {
    const f = fixture(t); const patch = f.adapter.patchAuthorizedDomains;
    f.adapter.patchAuthorizedDomains = async (request) => {
      if (variant === 'noApply') { f.calls.patch++; return; }
      await patch(request);
      if (variant === 'removedDomain') f.snapshot.authorizedDomains.shift();
      if (variant === 'extraDomain') f.snapshot.authorizedDomains.push('foreign.example.invalid');
      if (variant === 'provider') f.snapshot.providerConfigDigest = 'f'.repeat(64);
      if (variant === 'runtime') f.snapshot.runtimeDigest = 'f'.repeat(64);
    };
    await assert.rejects(f.invoke({ execute: true }), /domain_outcome_unknown_or_drift/u);
    await assert.rejects(f.invoke({ execute: true }), /domain_outcome_unknown_or_drift/u);
    assert.equal(f.calls.patch, 1); assert.equal(f.snapshot.webApps.length, 1); assert.equal(fs.existsSync(f.configFile), false);
  });
}
for (const variant of ['secret', 'foreignApp', 'foreignProject', 'customDomain', 'missing', 'invalidKey']) {
  test(`SDK ${variant} cannot become build input`, async (t) => {
    const f = fixture(t);
    if (variant === 'secret') f.sdk.clientSecret = 'private-material';
    if (variant === 'foreignApp') f.sdk.appId = f.sdk.appId.replace(/a$/u, 'b');
    if (variant === 'foreignProject') f.sdk.projectId = 'foreign-project';
    if (variant === 'customDomain') f.sdk.authDomain = 'other.example.invalid';
    if (variant === 'missing') delete f.sdk.apiKey;
    if (variant === 'invalidKey') f.sdk.apiKey = 'private-material';
    await assert.rejects(f.invoke({ execute: true }), (error) => !error.message.includes('private-material'));
    assert.equal(fs.existsSync(f.configFile), false); assert.equal(f.latest().phase, 'domain_verified');
  });
}
for (const variant of ['configExists', 'symlink', 'hardlink', 'mode', 'truncated', 'wrongOwner', 'unsafeParent', 'lock']) {
  test(`unsafe filesystem ${variant} fails before provider mutation`, async (t) => {
    const f = fixture(t);
    if (variant === 'configExists') fs.writeFileSync(f.configFile, '{}', { mode: 0o600 });
    if (variant === 'symlink') fs.symlinkSync(f.configFile, f.journalFile);
    if (['hardlink', 'mode', 'truncated', 'wrongOwner'].includes(variant)) {
      fs.writeFileSync(f.journalFile, '{}', { mode: variant === 'mode' ? 0o644 : 0o600 });
      if (variant === 'hardlink') fs.linkSync(f.journalFile, path.join(f.directory, 'alias'));
    }
    if (variant === 'unsafeParent') fs.chmodSync(f.directory, 0o755);
    if (variant === 'lock') fs.writeFileSync(`${f.journalFile}.lock`, '', { mode: 0o600 });
    const originalStat = fs.fstatSync;
    if (variant === 'wrongOwner') fs.fstatSync = (...args) => {
      const stat = originalStat(...args); stat.uid = process.getuid() + 1; return stat;
    };
    try {
      await assert.rejects(f.invoke({ execute: true }), variant === 'wrongOwner' ? /private_file_unsafe/u : undefined);
      assert.equal(f.calls.create, 0);
    } finally { fs.fstatSync = originalStat; }
  });
}
test('resumed config drift, missing output, journal tampering and different binding fail closed', async (t) => {
  const f = fixture(t); await f.invoke({ execute: true });
  f.sdk.apiKey = ['AI', 'za', 'y'.repeat(35)].join('');
  await assert.rejects(f.invoke({ execute: true }), /sdk_key_binding_invalid/u);
  f.sdk.apiKey = ['AI', 'za', 'x'.repeat(35)].join('');
  fs.unlinkSync(f.configFile);
  await assert.rejects(f.invoke({ execute: true }), /completed_config_missing/u);
  const journal = fs.readFileSync(f.journalFile, 'utf8');
  fs.writeFileSync(f.journalFile, journal.replace('app_verified', 'modified'));
  await assert.rejects(f.invoke({ execute: true }), /journal_invalid/u);
  fs.writeFileSync(f.journalFile, journal);
  f.binding.gate.evidenceDigest = 'f'.repeat(64);
  await assert.rejects(f.invoke({ execute: true }), /journal_binding_invalid/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
});

test('source containment rejects the root and descendants but accepts a protected sibling', (t) => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  assert.throws(() => assertPrerequisiteOutputPath(root), /output_path_invalid/u);
  assert.throws(() => assertPrerequisiteOutputPath(path.join(root, 'config.json')), /output_path_invalid/u);
  const sibling = fs.mkdtempSync(`${root}-output-`);
  t.after(() => fs.rmSync(sibling, { recursive: true, force: true }));
  fs.chmodSync(sibling, 0o700);
  assert.doesNotThrow(() => assertPrerequisiteOutputPath(path.join(sibling, 'config.json')));
});

for (const method of ['lstatSync', 'unlinkSync', 'closeSync']) {
  test(`lock ${method} failure stays sanitized even after provider success`, async (t) => {
    const f = fixture(t); const original = fs[method]; const originalOpen = fs.openSync;
    let lockFd;
    fs.openSync = (...args) => {
      const fd = originalOpen(...args);
      if (args[0] === `${f.journalFile}.lock`) lockFd = fd;
      return fd;
    };
    fs[method] = (...args) => {
      if (args[0] === (method === 'closeSync' ? lockFd : `${f.journalFile}.lock`)) {
        if (method === 'closeSync') original(...args);
        throw new Error(`private-filesystem-error ${f.directory}`);
      }
      return original(...args);
    };
    try {
      await assert.rejects(f.invoke({ execute: true }), { message: 'journal_lock_cleanup_failed' });
      assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
    } finally { fs[method] = original; fs.openSync = originalOpen; }
  });
}
test('valid JSON and recomputed checksum cannot hide extra journal state fields', async (t) => {
  const f = fixture(t); await f.invoke({ execute: true });
  const records = fs.readFileSync(f.journalFile, 'utf8').trimEnd().split('\n').map(JSON.parse);
  records.at(-1).state.foreign = 'private-state';
  records.at(-1).digest = prerequisiteSnapshotDigest(records.at(-1).state);
  fs.writeFileSync(f.journalFile, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  await assert.rejects(f.invoke(), /journal_state_invalid/u);
  await assert.rejects(f.invoke({ execute: true }), /journal_state_invalid/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
});
test('gate expiring after create blocks the next provider mutation', async (t) => {
  const f = fixture(t); let clock = Date.now();
  const guard = f.adapter.acquireDomainGuard;
  f.adapter.acquireDomainGuard = async (request) => { clock += 120_000; return guard(request); };
  await assert.rejects(f.invoke({ execute: true, now: () => clock }), /gate_binding_invalid/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 0);
});
test('rehashed extra fields in an earlier journal record are rejected too', async (t) => {
  const f = fixture(t); await f.invoke({ execute: true });
  const records = fs.readFileSync(f.journalFile, 'utf8').trimEnd().split('\n').map(JSON.parse);
  records[0].state.foreign = true;
  for (const [index, record] of records.entries()) {
    record.previous = index === 0 ? null : records[index - 1].digest;
    record.digest = prerequisiteSnapshotDigest(record.state);
  }
  fs.writeFileSync(f.journalFile, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  await assert.rejects(f.invoke(), /journal_state_invalid/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
});

for (const variant of ['version', 'missingKey', 'foreignKey', 'rawKey', 'displayName', 'accountHash',
  'gateAccountHash', 'leaseAlgorithm', 'leaseKey']) {
  test(`version-3 binding rejects ${variant} before provider reads`, async (t) => {
    const f = fixture(t); let reads = 0;
    f.adapter.readSnapshot = async () => { reads++; return f.snapshot; };
    if (variant === 'version') f.binding.schemaVersion = 2;
    if (variant === 'missingKey') delete f.binding.apiKey;
    if (variant === 'foreignKey') f.binding.apiKey.projectId = 'foreign-project';
    if (variant === 'rawKey') f.binding.apiKey.keyString = f.sdk.apiKey;
    if (variant === 'displayName') f.binding.displayName = 'ShareItToo Staging Web Drift';
    if (variant === 'accountHash') f.binding.firebaseAccountEmailSha256 = 'invalid';
    if (variant === 'gateAccountHash') f.binding.gate.firebaseAccountEmailSha256 = 'f'.repeat(64);
    if (variant === 'leaseAlgorithm') f.binding.domainLeaseVerifier.algorithm = 'RSA';
    if (variant === 'leaseKey') f.binding.domainLeaseVerifier.publicKeySha256 = 'invalid';
    await assert.rejects(f.invoke({ execute: true }), (error) => !error.message.includes(f.sdk.apiKey));
    assert.equal(reads, 0); assert.equal(f.calls.create, 0); assert.deepEqual(fs.readdirSync(f.directory), []);
  });
}

for (const variant of ['missingVersion', 'oldVersion', 'oldBinding']) {
  test(`old journal ${variant} is rejected without migration or provider reads`, async (t) => {
    const f = fixture(t); await f.invoke({ execute: true });
    const records = fs.readFileSync(f.journalFile, 'utf8').trimEnd().split('\n').map(JSON.parse);
    for (const [index, record] of records.entries()) {
      if (variant === 'missingVersion') delete record.state.schemaVersion;
      if (variant === 'oldVersion') record.state.schemaVersion = 2;
      if (variant === 'oldBinding') record.state.binding.schemaVersion = 2;
      record.previous = index === 0 ? null : records[index - 1].digest;
      record.digest = prerequisiteSnapshotDigest(record.state);
    }
    const bytes = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
    fs.writeFileSync(f.journalFile, bytes);
    f.adapter.readSnapshot = async () => { assert.fail('old journal must fail before provider read'); };
    await assert.rejects(f.invoke({ execute: true }), /journal_state_invalid/u);
    assert.equal(fs.readFileSync(f.journalFile, 'utf8'), bytes);
    assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
  });
}

for (const variant of ['missing', 'activeOnly', 'notExhausted', 'remainingToken', 'missingToken', 'extra']) {
  test(`inventory attestation ${variant} cannot authorize create`, async (t) => {
    const f = fixture(t);
    if (variant === 'missing') delete f.snapshot.webAppsInventory;
    if (variant === 'activeOnly') f.snapshot.webAppsInventory.showDeleted = false;
    if (variant === 'notExhausted') f.snapshot.webAppsInventory.exhausted = false;
    if (variant === 'remainingToken') f.snapshot.webAppsInventory.nextPageToken = 'private-page-token';
    if (variant === 'missingToken') delete f.snapshot.webAppsInventory.nextPageToken;
    if (variant === 'extra') f.snapshot.webAppsInventory.pageSize = 100;
    f.binding.baselineDigest = prerequisiteSnapshotDigest(f.snapshot);
    f.binding.gate.baselineDigest = f.binding.baselineDigest;
    await assert.rejects(f.invoke({ execute: true }), (error) => !error.message.includes('private-page-token'));
    assert.equal(f.calls.create, 0); assert.equal(f.calls.patch, 0);
  });
}

test('fully attested inventory containing only a DELETED app blocks the zero-app plan', async (t) => {
  const f = fixture(t); f.snapshot.webApps = [{ ...f.app, state: 'DELETED' }];
  f.binding.baselineDigest = prerequisiteSnapshotDigest(f.snapshot);
  f.binding.gate.baselineDigest = f.binding.baselineDigest;
  await assert.rejects(f.invoke({ execute: true }), /baseline_already_changed/u);
  assert.equal(f.calls.create, 0);
});

for (const variant of ['absent', 'deleted', 'incompatible', 'foreign', 'differentId', 'restrictions', 'fingerprint', 'rawKey']) {
  test(`existing key evidence ${variant} blocks before create`, async (t) => {
    const f = fixture(t);
    if (variant === 'absent') delete f.snapshot.apiKey;
    if (variant === 'deleted') f.snapshot.apiKey.exists = false;
    if (variant === 'incompatible') f.snapshot.apiKey.webCompatible = false;
    if (variant === 'foreign') f.snapshot.apiKey.projectId = 'foreign-project';
    if (variant === 'differentId') f.snapshot.apiKey.apiKeyId = 'other-key';
    if (variant === 'restrictions') f.snapshot.apiKey.restrictionsDigest = '8'.repeat(64);
    if (variant === 'fingerprint') f.snapshot.apiKey.keyFingerprint = '8'.repeat(64);
    if (variant === 'rawKey') f.snapshot.apiKey.keyString = f.sdk.apiKey;
    f.binding.baselineDigest = prerequisiteSnapshotDigest(f.snapshot);
    f.binding.gate.baselineDigest = f.binding.baselineDigest;
    await assert.rejects(f.invoke({ execute: true }), (error) => !error.message.includes(f.sdk.apiKey));
    assert.equal(f.calls.create, 0); assert.equal(f.calls.patch, 0);
  });
}

test('key inventory drift between preflight and create refuses submission', async (t) => {
  const f = fixture(t); const read = f.adapter.readSnapshot; let reads = 0;
  f.adapter.readSnapshot = async () => {
    if (++reads === 2) f.snapshot.keyInventoryDigest = '8'.repeat(64);
    return read();
  };
  await assert.rejects(f.invoke({ execute: true }), /baseline_stale/u);
  assert.equal(f.calls.create, 0); assert.equal(f.latest().phase, 'ready');
});

for (const variant of ['keyInventory', 'appKey', 'restrictions', 'deletedApp']) {
  test(`postcreate ${variant} drift preserves partial state without patch`, async (t) => {
    const f = fixture(t); const complete = f.adapter.readOperation;
    f.adapter.readOperation = async (request) => {
      const result = await complete(request);
      if (variant === 'keyInventory') f.snapshot.keyInventoryDigest = '8'.repeat(64);
      if (variant === 'appKey') f.snapshot.webApps[0].apiKeyId = 'other-key';
      if (variant === 'restrictions') f.snapshot.apiKey.restrictionsDigest = '8'.repeat(64);
      if (variant === 'deletedApp') f.snapshot.webApps[0].state = 'DELETED';
      return result;
    };
    await assert.rejects(f.invoke({ execute: true }));
    assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 0);
    assert.equal(f.latest().phase, 'create_pending'); assert.equal(fs.existsSync(f.configFile), false);
  });
}

for (const variant of ['key', 'project', 'app', 'state', 'extra', 'missing']) {
  test(`independent webApps.get ${variant} mismatch blocks domain patch`, async (t) => {
    const f = fixture(t); const readApp = f.adapter.readWebApp;
    f.adapter.readWebApp = async (request) => {
      const result = await readApp(request);
      if (variant === 'key') result.apiKeyId = 'other-key';
      if (variant === 'project') result.projectId = 'foreign-project';
      if (variant === 'app') result.appId = result.appId.replace(/a$/u, 'b');
      if (variant === 'state') result.state = 'DELETED';
      if (variant === 'extra') result.clientSecret = 'private-provider-value';
      if (variant === 'missing') delete result.apiKeyId;
      return result;
    };
    await assert.rejects(f.invoke({ execute: true }), /created_app_identity_invalid/u);
    assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 0); assert.equal(f.calls.sdk, 0);
  });
}

test('SDK key fingerprint mismatch never exports or replaces the existing key', async (t) => {
  const f = fixture(t); f.sdk.apiKey = ['AI', 'za', 'y'.repeat(35)].join('');
  await assert.rejects(f.invoke({ execute: true }), /sdk_key_binding_invalid/u);
  await assert.rejects(f.invoke({ execute: true }), /sdk_key_binding_invalid/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1);
  assert.equal(fs.existsSync(f.configFile), false); assert.equal(f.latest().phase, 'domain_verified');
});

test('lost create response with unchanged inventory also never retries', async (t) => {
  const f = fixture(t);
  f.adapter.createWebApp = async () => { f.calls.create++; throw Error('private response'); };
  await assert.rejects(f.invoke({ execute: true }), /google_web_prerequisite_operation_failed/u);
  await assert.rejects(f.invoke({ execute: true }), /create_outcome_unknown/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.operation, 0); assert.equal(f.calls.patch, 0);
});

test('known operation disappearing after completion cannot authorize retry or app adoption', async (t) => {
  const f = fixture(t);
  f.adapter.readOperation = async () => { f.snapshot.webApps = [f.app]; throw Error('404 private operation'); };
  await assert.rejects(f.invoke({ execute: true }), /google_web_prerequisite_operation_failed/u);
  await assert.rejects(f.invoke({ execute: true }), /google_web_prerequisite_operation_failed/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 0); assert.equal(f.latest().phase, 'create_pending');
});

test('lost patch response without application is readback-only and preserves the existing app', async (t) => {
  const f = fixture(t);
  f.adapter.patchAuthorizedDomains = async () => { f.calls.patch++; throw Error('private response'); };
  await assert.rejects(f.invoke({ execute: true }), /google_web_prerequisite_operation_failed/u);
  await assert.rejects(f.invoke({ execute: true }), /domain_outcome_unknown_or_drift/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1); assert.equal(f.snapshot.webApps.length, 1);
});

test('postpatch key inventory change stops export without rollback or replay', async (t) => {
  const f = fixture(t); const patch = f.adapter.patchAuthorizedDomains;
  f.adapter.patchAuthorizedDomains = async (request) => {
    await patch(request); f.snapshot.keyInventoryDigest = '8'.repeat(64);
  };
  await assert.rejects(f.invoke({ execute: true }), /domain_outcome_unknown_or_drift/u);
  await assert.rejects(f.invoke({ execute: true }), /domain_outcome_unknown_or_drift/u);
  assert.equal(f.calls.create, 1); assert.equal(f.calls.patch, 1); assert.equal(fs.existsSync(f.configFile), false);
});
