import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { composeFacebookWebReadiness, currentFacebookWebSourceSnapshot, runFacebookWebReadinessCli } from '../../backend/ops/staging_facebook_web_readiness_cli.mjs';
import { reserveFacebookWebOutputs } from '../../backend/ops/staging_facebook_web_readiness_writer.mjs';
import { facebookWebReadSources } from '../../backend/ops/staging_facebook_web_readonly_collector.mjs';
import { readFacebookWebReadiness } from '../../tool/staging_facebook_web_readiness.mjs';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-fb-web-ops-')));
const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const googleToken = 'google-token-value-not-for-output-0123456789';
const metaToken = 'meta-app-token-value-not-for-output-0123456789';
const project = 'shareittoo-staging'; const number = '214007794438';
const appId = '1:214007794438:web:aefec13f9f030f46eaac87';
const metaAppId = '123456789';
const firebaseConfigUrl = `https://firebase.googleapis.com/v1beta1/projects/${number}/webApps/${appId}/config`;
const authConfigUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const providerUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/facebook.com`;
const metaUrl = `https://graph.facebook.com/v23.0/${metaAppId}?fields=id,name,app_domains,app_mode,oauth_redirect_uris`;
const appRedirect = `https://${project}.firebaseapp.com/__/auth/handler`;
const nowMs = Date.parse('2026-10-25T10:00:00Z');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles = [
  'backend/ops/staging_facebook_web_readiness_cli.mjs',
  'backend/ops/staging_facebook_web_readiness_writer.mjs',
  'backend/ops/staging_facebook_web_readonly_collector.mjs',
  'tool/staging_facebook_web_readiness.mjs',
].map((relativePath) => ({ relativePath, gitBlob: 'a'.repeat(40), currentByteSha256: sha(relativePath) }));
const sourceSnapshot = { sourceCommit: 'b'.repeat(40), files: sourceFiles, inventorySha256: sha(JSON.stringify(sourceFiles)) };
function validReadinessInputs() {
  const timestamp = '2026-10-25T10:00:00Z';
  const sources = facebookWebReadSources(metaAppId).map((source) => ({ method: 'GET', source, status: 200,
    startedAtUtc: timestamp, endedAtUtc: timestamp }));
  const config = { projectId: project, messagingSenderId: number, appId,
    apiKey: `AIza${'x'.repeat(35)}`, authDomain: `${project}.firebaseapp.com`,
    backendProjectId: project, authorizedOrigin: 'https://staging.shareittoo.com' };
  const configurationSha256 = sha(JSON.stringify(config));
  const journal = { schemaVersion: 1, kind: 'sit-facebook-web-read-register', metaAppId,
    collectedAtUtc: timestamp, validUntilUtc: '2026-10-25T11:00:00Z', sourceCommit: sourceSnapshot.sourceCommit,
    sourceInventorySha256: sourceSnapshot.inventorySha256, collectorIdentitySha256: sha('collector'), sources };
  const candidate = { schemaVersion: 1, kind: 'sit-facebook-web-readiness-candidate',
    status: 'pending-independent-review', syntheticFixture: false, metaAppId, configuration: config, configurationSha256,
    readiness: { provider: 'facebook', platform: 'web', origin: config.authorizedOrigin,
      backendFirebaseProjectId: project, webAppConfigSha256: configurationSha256,
      callbackUrl: `https://${config.authDomain}/__/auth/handler`, firebaseProviderEnabled: true,
      metaAppMode: 'development', audience: 'app_roles_only', audienceVerified: true,
      providerReadbackSha256: sha('verified-readback'), observedAtUtc: timestamp,
      validUntilUtc: journal.validUntilUtc },
    sourceCommit: sourceSnapshot.sourceCommit, sourceInventory: sourceSnapshot.files,
    sourceInventorySha256: sourceSnapshot.inventorySha256, collectorIdentitySha256: journal.collectorIdentitySha256,
    sourceRegisterSha256: sha(JSON.stringify(sources)), collectedAtUtc: timestamp, validUntilUtc: journal.validUntilUtc };
  const candidateSha = sha(JSON.stringify(candidate)); const journalSha = sha(JSON.stringify(journal));
  const decision = { schemaVersion: 1, kind: 'sit-facebook-web-independent-decision', decision: 'approved',
    syntheticFixture: false, candidateSha256: candidateSha, journalSha256: journalSha,
    collectorIdentitySha256: candidate.collectorIdentitySha256, reviewerIdentitySha256: sha('reviewer'),
    reviewEvidenceSha256: sha('review-evidence'), decidedAtUtc: '2026-10-25T10:01:00Z',
    validUntilUtc: '2026-10-25T10:30:00Z' };
  return { candidate, journal, decision, candidateSha, journalSha, decisionSha: sha(JSON.stringify(decision)) };
}
function protectedDir(base, name) { const dir = path.join(base, name); fs.mkdirSync(dir, { mode: 0o700 }); fs.chmodSync(dir, 0o700); return dir; }
function protectedFile(dir, name, value) { const file = path.join(dir, name); fs.writeFileSync(file, value, { mode: 0o600, flag: 'wx' }); fs.chmodSync(file, 0o600); return file; }
function setup(t) {
  const work = protectedDir(root, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const inputs = protectedDir(work, 'inputs'); const output = protectedDir(work, 'output');
  const googleFile = protectedFile(inputs, 'google.token', googleToken);
  const metaFile = protectedFile(inputs, 'meta.token', metaToken);
  return { work, output, googleFile, metaFile };
}
function values(overrides = {}) {
  return {
    'https://openidconnect.googleapis.com/v1/userinfo': { sub: 'operator-subject-123456', email: 'operator@example.invalid', email_verified: true },
    [firebaseConfigUrl]: { projectId: project, projectNumber: number, appId, apiKey: `AIza${'x'.repeat(35)}`, authDomain: `${project}.firebaseapp.com`, messagingSenderId: number },
    [authConfigUrl]: { authorizedDomains: ['shareittoo-staging.firebaseapp.com', 'staging.shareittoo.com'] },
    [providerUrl]: { enabled: true, clientId: metaAppId, clientSecret: 'provider-secret-not-written' },
    [metaUrl]: { id: metaAppId, name: 'SIT staging', app_mode: 'development', app_domains: ['staging.shareittoo.com'], oauth_redirect_uris: [appRedirect] },
    ...overrides,
  };
}
function mockFetch(records, { statusByUrl = {}, leakToken = false, seen = [] } = {}) {
  return async (url, init) => {
    const href = url.href; seen.push({ href, init });
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(new URL(href).searchParams.has('access_token'), false);
    assert.equal(new URL(href).searchParams.has('input_token'), false);
    const token = href === metaUrl ? metaToken : googleToken;
    assert.equal(init.headers.authorization, `Bearer ${token}`);
    const status = statusByUrl[href] ?? 200;
    const value = records[href];
    const text = leakToken ? JSON.stringify({ ...value, diagnostic: token }) : JSON.stringify(value);
    return { status, text: async () => text };
  };
}
async function collect(t, { records = values(), fetchOptions = {}, runId = 'run-one' } = {}) {
  const paths = setup(t); const seen = [];
  const result = await runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', runId], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(records, { ...fetchOptions, seen }), sourceSnapshot: () => sourceSnapshot,
  });
  return { ...paths, result, seen };
}
async function compose(t, run, { decision = {}, now = nowMs + 5 * 60 * 1000 } = {}) {
  const candidate = JSON.parse(fs.readFileSync(run.result.files.find((x) => x.kind === 'candidate').path));
  const journal = JSON.parse(fs.readFileSync(run.result.files.find((x) => x.kind === 'journal').path));
  const candidateFile = protectedFile(run.work, 'candidate.json', JSON.stringify(candidate));
  const journalFile = protectedFile(run.work, 'journal.json', JSON.stringify(journal));
  const candidateSha = sha(fs.readFileSync(candidateFile)); const journalSha = sha(fs.readFileSync(journalFile));
  const review = { schemaVersion: 1, kind: 'sit-facebook-web-independent-decision',
    decision: 'approved', syntheticFixture: false, candidateSha256: candidateSha,
    journalSha256: journalSha, collectorIdentitySha256: candidate.collectorIdentitySha256,
    reviewerIdentitySha256: sha('independent-reviewer'), reviewEvidenceSha256: sha('review evidence'),
    decidedAtUtc: '2026-10-25T10:01:00Z', validUntilUtc: '2026-10-25T10:30:00Z', ...decision };
  const decisionFile = protectedFile(run.work, 'decision.json', JSON.stringify(review));
  const decisionSha = sha(fs.readFileSync(decisionFile));
  const result = await runFacebookWebReadinessCli(['compose', '--candidate', candidateFile,
    '--candidate-sha256', candidateSha, '--journal', journalFile, '--journal-sha256', journalSha,
    '--decision', decisionFile, '--decision-sha256', decisionSha, '--output-dir', run.output,
    '--run-id', 'composed-one'], { repositoryRoot, now: () => now });
  return { result, candidate, journal };
}

test('unverified Meta Graph field contract blocks readiness without Graph calls or output artifacts', async (t) => {
  const run = await collect(t);
  assert.equal(run.result.status, 'NOT_VERIFIED');
  assert.equal(run.seen.length, 4);
  assert.equal(run.seen.some((call) => call.href.startsWith('https://graph.facebook.com/')), false);
  assert.deepEqual(fs.readdirSync(run.output), []);
  const serialized = JSON.stringify(run.result);
  assert.equal(serialized.includes(googleToken), false); assert.equal(serialized.includes(metaToken), false);
  assert.equal(serialized.includes('provider-secret-not-written'), false);
  assert.equal(serialized.includes(sha('provider-secret-not-written')), false);
});

for (const [name, update] of [
  ['wrong project', (x) => { x[firebaseConfigUrl].projectId = 'foreign-project'; }],
  ['wrong app', (x) => { x[firebaseConfigUrl].appId = '1:214007794438:web:bbbbbbbbbbbbbbbb'; }],
  ['wrong domain', (x) => { x[authConfigUrl].authorizedDomains = ['foreign.example']; }],
  ['provider disabled', (x) => { x[providerUrl].enabled = false; }],
  ['wrong redirect', (x) => { x[metaUrl].oauth_redirect_uris = ['https://foreign.example/callback']; }],
  ['wrong audience mode', (x) => { x[metaUrl].app_mode = 'live'; }],
]) {
  test(`collector fails closed for ${name}`, async (t) => {
    const paths = setup(t); const records = values(); update(records);
    const result = await runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
      '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'rejected'], {
      repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(records), sourceSnapshot: () => sourceSnapshot,
    });
    assert.equal(result.status, 'NOT_VERIFIED');
    assert.equal(result.reason, 'required_readback_unavailable');
  });
}

test('collector rejects auth failures, echoed credential and redirect behavior', async (t) => {
  const paths = setup(t);
  const authFailure = await runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'auth-fail'], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(values(), { statusByUrl: { [providerUrl]: 403 } }), sourceSnapshot: () => sourceSnapshot,
  });
  assert.equal(authFailure.status, 'NOT_VERIFIED');
  const echoFailure = await runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'echo-fail'], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(values(), { leakToken: true }), sourceSnapshot: () => sourceSnapshot,
  });
  assert.equal(echoFailure.status, 'NOT_VERIFIED');
  const redirect = async () => ({ status: 302, text: async () => '{}' });
  const redirectFailure = await runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'redirect-fail'], {
    repositoryRoot, now: () => nowMs, fetchImpl: redirect, sourceSnapshot: () => sourceSnapshot,
  });
  assert.equal(redirectFailure.status, 'NOT_VERIFIED');
});

test('token inputs reject non-private modes and symlink aliases', async (t) => {
  const paths = setup(t);
  fs.chmodSync(paths.googleFile, 0o644);
  await assert.rejects(runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'bad-mode'], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(values()), sourceSnapshot: () => sourceSnapshot,
  }), /facebook_web_readiness_cli_denied/u);
  const alias = path.join(path.dirname(paths.googleFile), 'google-alias'); fs.symlinkSync(paths.googleFile, alias);
  await assert.rejects(runFacebookWebReadinessCli(['collect', '--google-token-file', alias,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'bad-link'], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(values()), sourceSnapshot: () => sourceSnapshot,
  }), /facebook_web_readiness_cli_denied/u);
});

test('writer collision is rejected and failed collection leaves no partial names', async (t) => {
  const run = await collect(t, { runId: 'collision' });
  assert.equal(run.result.status, 'NOT_VERIFIED');
  assert.deepEqual(fs.readdirSync(run.output), []);
  protectedFile(run.output, 'collision.candidate.json', '{}');
  await assert.rejects(runFacebookWebReadinessCli(['collect', '--google-token-file', run.googleFile,
    '--meta-token-file', run.metaFile, '--output-dir', run.output, '--run-id', 'collision'], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(values()), sourceSnapshot: () => sourceSnapshot,
  }), /facebook_web_readiness_cli_denied/u);
});

test('production source snapshot accepts clean closure and refuses changed closure bytes', (t) => {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-fb-source-git-')));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: work });
  execFileSync('git', ['config', 'user.name', 'Facebook Web Test'], { cwd: work });
  execFileSync('git', ['config', 'user.email', 'facebook-web-test@example.invalid'], { cwd: work });
  for (const relativePath of sourceFiles.map((entry) => entry.relativePath)) {
    const file = path.join(work, relativePath); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `fixture:${relativePath}\n`);
  }
  execFileSync('git', ['add', ...sourceFiles.map((entry) => entry.relativePath)], { cwd: work });
  execFileSync('git', ['commit', '-qm', 'seed source closure'], { cwd: work });
  const snapshot = currentFacebookWebSourceSnapshot(work);
  assert.match(snapshot.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.equal(snapshot.files.length, sourceFiles.length);
  fs.appendFileSync(path.join(work, sourceFiles[0].relativePath), 'drift\n');
  assert.throws(() => currentFacebookWebSourceSnapshot(work), /source_drift/u);
});

test('source inventory accepts exactly a 40-hex commit and rejects longer hashes before reads', async (t) => {
  const paths = setup(t); const seen = [];
  await assert.rejects(runFacebookWebReadinessCli(['collect', '--google-token-file', paths.googleFile,
    '--meta-token-file', paths.metaFile, '--output-dir', paths.output, '--run-id', 'long-commit'], {
    repositoryRoot, now: () => nowMs, fetchImpl: mockFetch(values(), { seen }),
    sourceSnapshot: () => ({ ...sourceSnapshot, sourceCommit: 'b'.repeat(64) }),
  }), /source_inventory:facebook_web_readiness_cli_denied/u);
  assert.deepEqual(seen, []);
  assert.deepEqual(fs.readdirSync(paths.output), []);
  const accepted = await collect(t, { runId: 'sha1-commit' });
  assert.equal(accepted.result.status, 'NOT_VERIFIED');
  assert.equal(accepted.seen.length, 4);
});

test('independent compose and writer success publish exact hashed file and clean temporary names', async (t) => {
  const paths = setup(t); const inputs = validReadinessInputs();
  const composed = composeFacebookWebReadiness(inputs.candidate, inputs.journal, inputs.decision,
    inputs.candidateSha, inputs.journalSha, inputs.decisionSha, nowMs + 5 * 60 * 1000);
  const writer = reserveFacebookWebOutputs({ directory: paths.output, runId: 'positive-compose',
    kinds: ['readiness'], repositoryRoot });
  try {
    const [published] = writer.write({ readiness: JSON.stringify(composed.envelope) });
    assert.equal(published.sha256, composed.evidenceSha256);
    assert.equal(fs.readFileSync(published.path, 'utf8'), JSON.stringify(composed.envelope));
    assert.equal(fs.statSync(published.path).mode & 0o777, 0o600);
  } finally { writer.close(); }
  assert.deepEqual(fs.readdirSync(paths.output), ['positive-compose.readiness.json']);
});
