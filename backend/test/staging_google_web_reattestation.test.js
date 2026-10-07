import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectGoogleWebReattestation, bindGoogleWebReattestationDecision,
  googleWebReattestationReadSources, loadGoogleWebReattestation,
  googleWebReattestationDigest as digest } from '../ops/staging_google_web_reattestation.mjs';
import { bindGoogleWebReadiness } from '../../tool/staging_google_web_readiness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = Date.parse('2026-10-07T12:00:00.000Z');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const repositoryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-reattest-')));
  t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
  for (const relative of ['backend/ops/staging_google_web_reattestation.mjs', 'tool/staging_google_web_readiness.mjs']) {
    fs.mkdirSync(path.dirname(path.join(repositoryRoot, relative)), { recursive: true });
    fs.copyFileSync(path.join(root, relative), path.join(repositoryRoot, relative));
  }
  const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  git('init', '-q'); git('add', '.');
  // Disposable fixture repository only; the real checkout is never committed.
  git('-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'synthetic source binding');
  const sourceCommit = git('rev-parse', 'HEAD');
  const projectId = 'synthetic-sit-fixture'; const projectNumber = '123456789012';
  const webAppId = `1:${projectNumber}:web:${'a'.repeat(32)}`;
  const apiKeyId = '12345678-1234-4123-8123-123456789012';
  const sdk = { projectId, messagingSenderId: projectNumber, appId: webAppId,
    apiKey: ['AI', 'za', 'x'.repeat(35)].join(''), authDomain: `${projectId}.firebaseapp.com` };
  const configuration = { ...sdk, backendProjectId: projectId, authorizedOrigin: 'https://staging.shareittoo.com' };
  const apiKey = { apiKeyId, projectId, keyFingerprint: hash(sdk.apiKey), restrictionsDigest: hash('synthetic restrictions') };
  const app = { appId: webAppId, projectId, state: 'ACTIVE', apiKeyId, displayName: 'Existing synthetic app' };
  const snapshot = { complete: true, projectId, projectNumber, backendProjectId: projectId,
    authEnabled: true, emulatorEnabled: false, googleEnabled: true, webApps: [app],
    webAppsInventory: { showDeleted: true, exhausted: true, nextPageToken: '' },
    apiKey: { ...apiKey, exists: true, webCompatible: true }, keyInventoryDigest: hash('synthetic keys'),
    authorizedDomains: ['staging.shareittoo.com', 'localhost'], authConfigDigest: hash('synthetic auth'),
    providerConfigDigest: hash('synthetic provider'), otherAppsDigest: hash('synthetic native apps'),
    runtimeDigest: hash('synthetic runtime'), revision: hash('synthetic revision') };
  const binding = { schemaVersion: 1, sourceCommit, projectId, projectNumber, webAppId,
    firebaseAccountEmailSha256: hash('operator@example.invalid'), apiKey,
    apiKeyResourceName: `projects/${projectNumber}/locations/global/keys/synthetic-key`,
    runtimeContainerId: hash('synthetic-container'), runtimeCommit: sourceCommit,
    expectedSnapshotSha256: digest(snapshot), configurationSha256: hash(JSON.stringify(configuration)),
    reviewEvidenceSha256: hash('independent synthetic baseline review') };
  const identity = { projectId, projectNumber, firebaseAccountEmailSha256: binding.firebaseAccountEmailSha256,
    observedAtUtc: new Date(now).toISOString(), proofSha256: hash('synthetic account proof') };
  const calls = [];
  const observations = { readSnapshot: snapshot, readWebApp: app, readSdkConfig: sdk, readAccountIdentity: identity };
  const observed = (method, value) => ({ value: structuredClone(value), observedAtUtc: new Date(now).toISOString(),
    sources: googleWebReattestationReadSources(method, binding) });
  const readers = Object.fromEntries(Object.entries(observations)
    .map(([method, value]) => [method, async () => { calls.push(method); return observed(method, value); }]));
  return { repositoryRoot, git, binding, snapshot, sdk, identity, readers, calls,
    observed,
    collect: () => collectGoogleWebReattestation({ repositoryRoot, binding, readers, now: () => now }) };
}
function decisionFor(candidate) {
  const r = candidate.readiness;
  return { schemaVersion: 1, kind: 'sit-google-web-prerequisite-activation-decision',
    evidenceClass: 'independent-release-review', syntheticFixture: false, decision: 'approved',
    sourceCommit: r.sourceCommit, prerequisiteJournalSha256: r.prerequisiteJournalSha256,
    prerequisiteFinalRecordSha256: r.prerequisiteFinalRecordSha256, configurationSha256: candidate.configurationSha256,
    readinessSha256: candidate.readinessSha256, projectId: r.projectId, projectNumber: r.projectNumber,
    webAppId: r.webAppId, authorizedDomain: r.authorizedDomain, firebaseProviderId: r.firebaseProviderId,
    decidedAtUtc: new Date(now).toISOString(), validUntilUtc: new Date(now + 60_000).toISOString() };
}

test('fresh preserved observations produce pending schema-2 inputs and an exact source/read register, never provider mutations', async (t) => {
  const f = fixture(t); const before = f.git('status', '--porcelain');
  const { candidate, journalBytes } = await f.collect();
  assert.equal(candidate.activationEligible, false);
  assert.throws(() => bindGoogleWebReadiness(candidate, hash(JSON.stringify(candidate)), { now: new Date(now) }));
  const journal = JSON.parse(journalBytes); const record = journal.records[0];
  assert.equal(candidate.readiness.prerequisiteJournalSha256, hash(journalBytes));
  assert.equal(candidate.readiness.prerequisiteFinalRecordSha256, digest(record));
  assert.equal(record.sourceRegister.length, 2); assert.equal(record.readRegister.length, 6);
  assert.deepEqual(f.calls, ['readAccountIdentity', 'readSnapshot', 'readWebApp', 'readSdkConfig', 'readSnapshot', 'readAccountIdentity']);
  assert.equal(record.providerMutationCount, 0); assert.equal(f.git('status', '--porcelain'), before);
  assert.equal(journalBytes.includes(f.sdk.apiKey), false);
  const decisionBytes = JSON.stringify(decisionFor(candidate));
  const approved = bindGoogleWebReattestationDecision({ candidate, decisionBytes,
    expectedDecisionSha256: hash(decisionBytes), now: new Date(now) });
  assert.equal(bindGoogleWebReadiness(approved.envelope, approved.evidenceSha256,
    { now: new Date(now), expectedSource: f.binding.sourceCommit }).config.appId, f.binding.webAppId);
});

for (const [name, mutate] of [
  ['wrong current source', (f) => { f.binding.sourceCommit = 'a'.repeat(40); }],
  ['dirty registered source', (f) => fs.appendFileSync(path.join(f.repositoryRoot, 'tool/staging_google_web_readiness.mjs'), '\n// drift')],
  ['mutation-capable reader surface', (f) => { f.readers.createWebApp = async () => assert.fail('must never execute'); }],
  ['missing current account proof', (f) => { delete f.identity.proofSha256; }],
  ['stale account observation', (f) => { f.identity.observedAtUtc = new Date(now - 1).toISOString(); }],
  ['future account observation', (f) => { f.identity.observedAtUtc = new Date(now + 1).toISOString(); }],
  ['wrong account', (f) => { f.identity.firebaseAccountEmailSha256 = hash('other'); }],
  ['partial inventory', (f) => { f.snapshot.webAppsInventory.exhausted = false; }],
  ['missing staging domain', (f) => { f.snapshot.authorizedDomains = ['localhost']; }],
  ['disabled provider', (f) => { f.snapshot.googleEnabled = false; }],
  ['stale snapshot receipt', (f) => { f.readers.readSnapshot = async () => ({ ...f.observed('readSnapshot', f.snapshot), observedAtUtc: new Date(now - 1).toISOString() }); }],
  ['incomplete snapshot source register', (f) => { f.readers.readSnapshot = async () => ({ ...f.observed('readSnapshot', f.snapshot), sources: [] }); }],
  ['unapproved baseline', (f) => { f.binding.expectedSnapshotSha256 = hash('invented'); }],
  ['invented public config', (f) => { f.binding.configurationSha256 = hash('invented'); }],
  ['provider drift between reads', (f) => { let calls = 0; f.readers.readSnapshot = async () => f.observed('readSnapshot', { ...f.snapshot, revision: ++calls === 1 ? f.snapshot.revision : hash('changed') }); }],
  ['account switch during reads', (f) => { let calls = 0; f.readers.readAccountIdentity = async () => f.observed('readAccountIdentity', { ...f.identity, firebaseAccountEmailSha256: ++calls === 1 ? f.identity.firebaseAccountEmailSha256 : hash('changed') }); }],
  ['raw adapter exception redaction', (f) => { f.readers.readSnapshot = async () => { throw new Error('private provider response'); }; }],
]) test(`rejects ${name}`, async (t) => {
  const f = fixture(t); mutate(f);
  await assert.rejects(f.collect(), { message: 'google_web_reattestation_denied' });
});

test('fails closed on elapsed collection window', async (t) => {
  const f = fixture(t); let clock = now;
  f.readers.readSnapshot = async () => { clock += 60_001; return f.observed('readSnapshot', f.snapshot); };
  await assert.rejects(collectGoogleWebReattestation({ repositoryRoot: f.repositoryRoot, binding: f.binding,
    readers: f.readers, now: () => clock }), /google_web_reattestation_denied/u);
});

test('rejects source movement during collection before composing readiness', async (t) => {
  const f = fixture(t); let calls = 0;
  f.readers.readSnapshot = async () => {
    if (++calls === 2) fs.appendFileSync(path.join(f.repositoryRoot, 'tool/staging_google_web_readiness.mjs'), '\n// late drift');
    return f.observed('readSnapshot', f.snapshot);
  };
  await assert.rejects(f.collect(), /google_web_reattestation_denied/u);
});

test('independent decision cannot substitute stale evidence, modified candidate or fabricated candidate', async (t) => {
  const f = fixture(t); const { candidate } = await f.collect();
  const decisionBytes = JSON.stringify(decisionFor(candidate));
  const inputs = { candidate, decisionBytes, expectedDecisionSha256: hash(decisionBytes), now: new Date(now) };
  assert.throws(() => bindGoogleWebReattestationDecision({ ...inputs, now: new Date(now + 60_000) }), /decision_denied/u);
  assert.throws(() => bindGoogleWebReattestationDecision({ ...inputs, candidate: structuredClone(candidate) }), /decision_denied/u);
  candidate.readiness.providerConfigReadbackSha256 = hash('modified');
  assert.throws(() => bindGoogleWebReattestationDecision(inputs), /decision_denied/u);
});

async function persisted(t) {
  const f = fixture(t); const result = await f.collect();
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-proof-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); fs.chmodSync(directory, 0o700);
  const candidateFile = path.join(directory, 'candidate.json'); const journalFile = path.join(directory, 'journal.json');
  const candidateBytes = JSON.stringify(result.candidate);
  fs.writeFileSync(candidateFile, candidateBytes, { mode: 0o600 });
  fs.writeFileSync(journalFile, result.journalBytes, { mode: 0o600 });
  return { ...f, ...result, directory, candidateBytes, inputs: { candidateFile, journalFile,
    expectedCandidateSha256: hash(candidateBytes), expectedJournalSha256: hash(result.journalBytes),
    repositoryRoot: f.repositoryRoot, now: new Date(now).toISOString() } };
}

test('protected serialized evidence resumes in a fresh process and accepts separately returned independent review', async (t) => {
  const f = await persisted(t);
  const decisionBytes = JSON.stringify(decisionFor(f.candidate));
  const script = `import {loadGoogleWebReattestation,bindGoogleWebReattestationDecision} from ${JSON.stringify(new URL('../ops/staging_google_web_reattestation.mjs', import.meta.url).href)};
    const args=JSON.parse(process.argv[1]); const candidate=loadGoogleWebReattestation(args.inputs);
    const result=bindGoogleWebReattestationDecision({candidate,decisionBytes:args.decisionBytes,
      expectedDecisionSha256:args.decisionSha256,now:new Date(args.inputs.now)});
    process.stdout.write(JSON.stringify({eligible:result.envelope.activationEligible,source:result.envelope.readiness.sourceCommit}));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script,
    JSON.stringify({ inputs: f.inputs, decisionBytes, decisionSha256: hash(decisionBytes) })], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), { eligible: true, source: f.binding.sourceCommit });
});

for (const [name, mutate] of [
  ['candidate byte tampering', (f) => fs.appendFileSync(f.inputs.candidateFile, '\n')],
  ['journal byte tampering', (f) => fs.appendFileSync(f.inputs.journalFile, '\n')],
  ['fabricated candidate with a recalculated self-hash', (f) => {
    const candidate = JSON.parse(f.candidateBytes); candidate.readiness.runtimeReadbackSha256 = hash('invented runtime');
    const bytes = JSON.stringify(candidate); fs.writeFileSync(f.inputs.candidateFile, bytes); f.inputs.expectedCandidateSha256 = hash(bytes);
  }],
  ['partial serialized journal', (f) => {
    const journal = JSON.parse(f.journalBytes); journal.records[0].readRegister.pop();
    const bytes = JSON.stringify(journal); fs.writeFileSync(f.inputs.journalFile, bytes); f.inputs.expectedJournalSha256 = hash(bytes);
  }],
  ['expired persisted proof', (f) => { f.inputs.now = new Date(now + 2 * 60 * 60_000).toISOString(); }],
  ['source drift after persistence', (f) => fs.appendFileSync(path.join(f.repositoryRoot, 'tool/staging_google_web_readiness.mjs'), '\n// restart drift')],
  ['unsafe private file mode', (f) => fs.chmodSync(f.inputs.candidateFile, 0o644)],
  ['unsafe private parent', (f) => fs.chmodSync(f.directory, 0o755)],
  ['symlink input', (f) => {
    const link = path.join(f.directory, 'link.json'); fs.symlinkSync(f.inputs.candidateFile, link); f.inputs.candidateFile = link;
  }],
  ['hard-linked input', (f) => fs.linkSync(f.inputs.candidateFile, path.join(f.directory, 'linked.json'))],
]) test(`protected restart rejects ${name}`, async (t) => {
  const f = await persisted(t); mutate(f);
  assert.throws(() => loadGoogleWebReattestation(f.inputs), { message: 'google_web_reattestation_load_denied' });
});
