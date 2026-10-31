import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FACEBOOK_V2_SOURCE_CLOSURE, FACEBOOK_V2_SOURCES, facebookV2Hash as hash,
  facebookV2Digest as digest, collectFacebookWebV2, composeFacebookWebV2 } from '../../backend/ops/staging_facebook_web_readiness_v2.mjs';
import { runFacebookV2Cli } from '../../backend/ops/staging_facebook_web_readiness_v2_cli.mjs';
import { bindFacebookWebReadiness } from '../../tool/staging_facebook_web_readiness.mjs';
import { META_GRAPH_READBACK_CONTRACT_VERIFIED } from '../../backend/ops/staging_facebook_web_readonly_collector.mjs';

const NOW = Date.parse('2026-10-31T10:00:00Z');
const appId = '67890123456789'; const userId = '78901234567890';
const operator = 'synthetic-operator-subject';
const googleToken = ['synthetic', 'google', 'bearer', 'only'].join('-');
const metaToken = ['synthetic', 'meta', 'bearer', 'only'].join('-');
const providerSecret = ['synthetic', 'provider', 'secret', 'only'].join('-');
const files = FACEBOOK_V2_SOURCE_CLOSURE.map((relativePath) => ({ relativePath,
  gitBlob: 'a'.repeat(40), currentByteSha256: hash(relativePath) }));
const source = { sourceCommit: 'b'.repeat(40), files, inventorySha256: digest(files) };
function dashboard() {
  return { schemaVersion: 2, kind: 'sit-facebook-web-dashboard-readback', syntheticFixture: true,
    source: 'meta-app-dashboard', appIdSha256: hash(appId), observerIdentitySha256: hash('dashboard-observer'),
    observationEvidenceSha256: hash('synthetic-dashboard-observation'), observedAtUtc: '2026-10-31T09:59:00Z',
    validUntilUtc: '2026-10-31T10:50:00Z', mode: 'development', origin: 'https://staging.shareittoo.com',
    callbackUrl: 'https://shareittoo-staging.firebaseapp.com/__/auth/handler', clientOAuthLogin: true,
    webOAuthLogin: true, strictMode: true, enforceHttps: true, publicProfileAccess: 'standard',
    emailAccess: 'standard', expectedRoleUserSha256: [hash(userId)] };
}
function records() {
  return [
    { sub: operator, email_verified: true },
    { projectId: 'shareittoo-staging', projectNumber: '214007794438', appId: '1:214007794438:web:aefec13f9f030f46eaac87',
      messagingSenderId: '214007794438', apiKey: `AIza${'x'.repeat(35)}`, authDomain: 'shareittoo-staging.firebaseapp.com' },
    { authorizedDomains: ['staging.shareittoo.com'] },
    { enabled: true, clientId: appId, clientSecret: providerSecret },
    { id: appId, name: 'Synthetic fixture', app_domains: ['staging.shareittoo.com'] },
    { data: [{ app_id: appId, user: userId, role: 'testers' }] },
  ];
}
function fetcher(values, seen) {
  return async (url, init) => {
    const index = seen.length;
    assert.equal(url.href, FACEBOOK_V2_SOURCES[index].replace('{app-id}', appId));
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.authorization, `Bearer ${index < 4 ? googleToken : metaToken}`);
    assert.equal(url.searchParams.has('access_token'), false); assert.equal(url.searchParams.has('input_token'), false);
    seen.push(index); return { status: 200, text: async () => JSON.stringify(values[index]) };
  };
}
async function collect(d = dashboard(), values = records(), seen = []) {
  return collectFacebookWebV2({ dashboard: d, dashboardSha256: digest(d), source,
    googleAccessToken: googleToken, metaAppAccessToken: metaToken,
    now: () => NOW, fetchImpl: fetcher(values, seen) });
}
function review(c, j) {
  return { schemaVersion: 2, kind: 'sit-facebook-web-independent-decision', syntheticFixture: true,
    decision: 'approved', candidateSha256: digest(c), journalSha256: digest(j),
    reviewerIdentitySha256: hash('independent-reviewer'), reviewEvidenceSha256: hash('synthetic-review'),
    decidedAtUtc: '2026-10-31T10:01:00Z', validUntilUtc: '2026-10-31T10:40:00Z' };
}
function setup(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-fb-v2-')));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'output'); fs.mkdirSync(output, { mode: 0o700 });
  const write = (name, value) => {
    const file = path.join(root, name); const raw = typeof value === 'string' ? value : JSON.stringify(value);
    fs.writeFileSync(file, raw, { mode: 0o600, flag: 'wx' }); return { file, sha: hash(raw) };
  };
  return { root, output, write };
}
function collectArgs(p, d, name = 'run') {
  const input = p.write(`${name}.dashboard`, d);
  return ['collect', '--google-token-file', p.write(`${name}.google`, googleToken).file,
    '--meta-token-file', p.write(`${name}.meta`, metaToken).file, '--dashboard', input.file,
    '--dashboard-sha256', input.sha, '--output-dir', p.output, '--run-id', name];
}

test('positive protected synthetic CLI Collect -> Compose preserves fixture class and v1 stays closed', async (t) => {
  const p = setup(t); const seen = [];
  const seam = { now: () => NOW, sourceSnapshot: () => source, fetchImpl: fetcher(records(), seen) };
  const result = await runFacebookV2Cli(collectArgs(p, dashboard()), seam);
  assert.equal(result.status, 'synthetic-only-not-activation-evidence'); assert.equal(seen.length, 6);
  const candidateFile = result.files.find((f) => f.kind === 'candidate');
  const journalFile = result.files.find((f) => f.kind === 'journal');
  const c = JSON.parse(fs.readFileSync(candidateFile.path)); const j = JSON.parse(fs.readFileSync(journalFile.path));
  const decision = p.write('decision', review(c, j));
  const composed = await runFacebookV2Cli(['compose', '--candidate', candidateFile.path, '--candidate-sha256', candidateFile.sha256,
    '--journal', journalFile.path, '--journal-sha256', journalFile.sha256, '--decision', decision.file,
    '--decision-sha256', decision.sha, '--output-dir', p.output, '--run-id', 'composed'], { ...seam, now: () => NOW + 120000 });
  const raw = fs.readFileSync(composed.files[0].path, 'utf8'); const envelope = JSON.parse(raw);
  assert.equal(envelope.syntheticFixture, true);
  assert.throws(() => bindFacebookWebReadiness(envelope, hash(raw), { now: new Date(NOW + 120000) }), /facebook_web_evidence_class/u);
  assert.equal(META_GRAPH_READBACK_CONTRACT_VERIFIED, false);
  for (const file of [...result.files, ...composed.files]) {
    const bytes = fs.readFileSync(file.path, 'utf8'); const stat = fs.statSync(file.path);
    assert.equal(stat.mode & 0o777, 0o600); assert.equal(stat.nlink, 1);
    for (const forbidden of [appId, userId, operator, googleToken, metaToken, providerSecret, hash(providerSecret)]) assert.equal(bytes.includes(forbidden), false);
  }
});

for (const [name, change, code, calls] of [
  ['foreign Firebase app', (d, r) => { r[1].appId = 'foreign'; }, 'firebase_app', 2],
  ['foreign dashboard app', (d) => { d.appIdSha256 = hash('foreign'); }, 'dashboard_app', 4],
  ['foreign Graph app', (d, r) => { r[4].id = '99999999'; }, 'meta_app', 5],
  ['foreign role app', (d, r) => { r[5].data[0].app_id = '99999999'; }, 'roles_app', 6],
  ['missing selected role', (d, r) => { r[5].data[0].user = '99999999'; }, 'roles_missing', 6],
  ['insights role insufficient', (d, r) => { r[5].data[0].role = 'insights users'; }, 'roles_missing', 6],
  ['partial roles page', (d, r) => { r[5].paging = { next: 'https://foreign.invalid/extra' }; }, 'roles_page', 6],
  ['stale dashboard', (d) => { d.validUntilUtc = '2026-10-31T10:00:00Z'; }, 'dashboard_time', 0],
  ['future dashboard', (d) => { d.observedAtUtc = '2026-10-31T10:01:00Z'; }, 'dashboard_time', 0],
  ['missing dashboard evidence', (d) => { delete d.observationEvidenceSha256; }, 'dashboard_shape', 0],
  ['raw ID injection', (d) => { d.userId = userId; }, 'dashboard_shape', 0],
  ['live mode', (d) => { d.mode = 'live'; }, 'dashboard_mode', 0],
  ['wrong redirect', (d) => { d.callbackUrl += '/wrong'; }, 'dashboard_redirect', 0],
  ['OAuth off', (d) => { d.webOAuthLogin = false; }, 'dashboard_oauth', 0],
  ['strict off', (d) => { d.strictMode = false; }, 'dashboard_oauth', 0],
  ['permission absent', (d) => { d.emailAccess = 'none'; }, 'dashboard_permissions', 0],
  ['token echoed', (d, r) => { r[4].debug = metaToken; }, 'credential_echo', 5],
  ['provider secret echoed', (d, r) => { r[5].debug = providerSecret; }, 'credential_echo', 6],
]) {
  test(`v2 rejects ${name} at the intended phase`, async (t) => {
    const p = setup(t); const d = dashboard(); const r = records(); const seen = []; change(d, r);
    await assert.rejects(runFacebookV2Cli(collectArgs(p, d), {
      now: () => NOW, sourceSnapshot: () => source, fetchImpl: fetcher(r, seen),
    }), new RegExp(`^Error: facebook_v2_${code}$`, 'u'));
    assert.equal(seen.length, calls); assert.deepEqual(fs.readdirSync(p.output), []);
  });
}

test('missing protected dashboard, wrong hash and unsafe permissions fail without network/output', async (t) => {
  const p = setup(t); const seen = [];
  const args = collectArgs(p, dashboard()); const seam = { now: () => NOW, sourceSnapshot: () => source, fetchImpl: fetcher(records(), seen) };
  const file = args[args.indexOf('--dashboard') + 1];
  fs.chmodSync(file, 0o644);
  await assert.rejects(runFacebookV2Cli(args, seam), /facebook_v2_input_or_write/u);
  fs.chmodSync(file, 0o600); const wrongHash = [...args]; wrongHash[wrongHash.indexOf('--dashboard-sha256') + 1] = 'f'.repeat(64);
  await assert.rejects(runFacebookV2Cli(wrongHash, seam), /facebook_v2_input_digest/u);
  fs.unlinkSync(file);
  await assert.rejects(runFacebookV2Cli(args, seam), /facebook_v2_input_or_write/u);
  assert.equal(seen.length, 0); assert.deepEqual(fs.readdirSync(p.output), []);
});

test('production CLI rejects synthetic evidence before source, credentials and network', async (t) => {
  const p = setup(t);
  await assert.rejects(runFacebookV2Cli(collectArgs(p, dashboard())), /facebook_v2_fixture_class/u);
  assert.deepEqual(fs.readdirSync(p.output), []);
});

for (const [name, mutate, code] of [
  ['extra endpoint', (c, j) => { j.reads.push({ ...j.reads[0], source: 'https://foreign.invalid/' }); }, 'journal_binding'],
  ['changed endpoint', (c, j) => { j.reads[5].source = 'https://graph.facebook.com/v26.0/{app-id}/extra'; }, 'journal_read'],
  ['raw response leak', (c) => { c.raw = { userId }; }, 'candidate_shape'],
  ['self reviewer', (c, j, d) => { d.reviewerIdentitySha256 = c.collectorIdentitySha256; }, 'decision_binding'],
  ['dashboard observer reviewer', (c, j, d) => { d.reviewerIdentitySha256 = c.dashboard.observerIdentitySha256; }, 'decision_binding'],
  ['fixture laundering', (c, j, d) => { d.syntheticFixture = false; }, 'decision_binding'],
]) {
  test(`compose rejects ${name} after a successful collection`, async () => {
    const { candidate: c, journal: j } = await collect(); const d = review(c, j);
    mutate(c, j, d); j.candidateSha256 = digest(c); d.candidateSha256 = digest(c); d.journalSha256 = digest(j);
    assert.throws(() => composeFacebookWebV2({ candidate: c, journal: j, decision: d, now: NOW + 120000 }), new RegExp(`facebook_v2_${code}`, 'u'));
  });
}
