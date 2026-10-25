import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAppleWebReadinessCli } from '../../backend/ops/staging_apple_web_readiness_cli.mjs';
import {
  APPLE_WEB_SOURCE_CLOSURE, APPLE_WEB_SOURCE_URLS, composeAppleWebCandidate,
  appleWebDigest, composeAppleWebDecision, currentAppleWebSourceSnapshot, writeAppleWebOutput,
} from '../../backend/ops/staging_apple_web_readiness_producer.mjs';
import { syntheticAppleEvidence } from './staging_apple_web_readiness_fixture.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const source = 'a'.repeat(40);
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const now = new Date(); now.setUTCMilliseconds(0);
const iso = (d) => d.toISOString().replace('.000Z', 'Z');
const sourceFiles = APPLE_WEB_SOURCE_CLOSURE.map((relativePath) => ({ relativePath,
  gitBlob: 'b'.repeat(40), currentByteSha256: sha(relativePath) }));
const inventorySha256 = sha(JSON.stringify(sourceFiles));
const snapshot = () => ({ sourceCommit: source, files: sourceFiles, inventorySha256 });
function protectedDir(base, name) { const p = path.join(base, name); fs.mkdirSync(p, { mode: 0o700 }); fs.chmodSync(p, 0o700); return p; }
function protectedFile(dir, name, value) { const p = path.join(dir, name); fs.writeFileSync(p, value, { mode: 0o600, flag: 'wx' }); fs.chmodSync(p, 0o600); return p; }
function fixture({ synthetic = true } = {}) {
  const external = syntheticAppleEvidence(source, { now, config: {
    projectId: 'shareittoo-staging', messagingSenderId: '214007794438',
    appId: '1:214007794438:web:aefec13f9f030f46eaac87', apiKey: `AIza${'x'.repeat(35)}`,
    authDomain: 'shareittoo-staging.firebaseapp.com', backendProjectId: 'shareittoo-staging',
    authorizedOrigin: 'https://staging.shareittoo.com',
  } }); const e = external.value;
  const start = iso(now); const deadline = iso(new Date(now.getTime() + 50 * 60 * 1000));
  const urls = [
    ['apple-console', APPLE_WEB_SOURCE_URLS.appleWebConfiguration, 'sanitized-console-readback', 'read-only-confirmed'],
    ['firebase-web-doc', APPLE_WEB_SOURCE_URLS.firebaseAppleWeb, 'GET', 200],
    ['firebase-web-app', `https://firebase.googleapis.com/v1beta1/projects/214007794438/webApps/${e.configuration.appId}/config`, 'GET', 200],
    ['firebase-apple-provider', `https://identitytoolkit.googleapis.com/admin/v2/projects/${e.configuration.projectId}/defaultSupportedIdpConfigs/apple.com`, 'GET', 200],
    ['backend-runtime', 'https://staging.shareittoo.com/api/v1/version', 'GET', 200],
    ['protected-secret-metadata', null, 'protected-mount-metadata', 'read-only-confirmed'],
  ];
  const input = {
    schemaVersion: 1, kind: 'sit-apple-web-protected-readbacks',
    evidenceClass: 'sanitized-provider-and-runtime-readbacks', syntheticFixture: synthetic,
    sourceCommit: source, collectorIdentitySha256: e.backend.collectorIdentitySha256,
    observedAtUtc: start, validUntilUtc: deadline,
    configuration: e.configuration,
    appleConsoleReadback: { servicesId: e.configuration.clientId, teamIdSha256: e.readiness.appleTeamIdSha256,
      keyIdSha256: e.readiness.appleKeyIdSha256, primaryAppSignInEnabled: true,
      servicesIdBoundToPrimaryApp: true, signingKeyEnabled: true,
      domain: 'staging.shareittoo.com', returnUrl: e.configuration.redirectUri,
      domainVerified: true, returnUrlVerified: true, evidenceSha256: sha('synthetic apple console readback') },
    firebaseReadback: { projectId: e.configuration.projectId, projectNumber: '214007794438',
      webAppId: e.configuration.appId, apiKey: e.configuration.apiKey, authDomain: e.configuration.authDomain,
      providerEnabled: true, oauthClientId: e.configuration.clientId,
      teamIdSha256: e.readiness.firebaseAppleTeamIdSha256,
      keyIdSha256: e.readiness.firebaseAppleKeyIdSha256, secretConfigured: true,
      webAppEvidenceSha256: sha('synthetic firebase web app readback'),
      providerEvidenceSha256: sha('synthetic firebase provider readback') },
    backendReadback: { ...e.backend, observedAtUtc: start, validUntilUtc: deadline },
    secretMetadataReadback: { signingKeySource: 'file', signingKeyMetadataSha256: sha('signing key metadata'),
      encryptionKeySource: 'file', encryptionKeyMetadataSha256: sha('encryption key metadata'),
      protectedSecretFilesVerified: true, evidenceSha256: sha('secret metadata') },
    sourceRegister: urls.map(([id, sourceUrl, method, status]) => ({ id, sourceUrl, method, status,
      evidenceSha256: id === 'apple-console' ? sha('synthetic apple console readback')
        : id === 'firebase-web-app' ? sha('synthetic firebase web app readback')
          : id === 'firebase-apple-provider' ? sha('synthetic firebase provider readback')
            : id === 'backend-runtime' ? e.backend.runtimeReadbackSha256
              : id === 'protected-secret-metadata' ? sha('secret metadata') : sha(id), observedAtUtc: start })),
  };
  const candidate = composeAppleWebCandidate(input, { now: now.getTime(), expectedSource: source,
    allowSyntheticFixture: true, sourceInventory: sourceFiles, sourceInventorySha256: inventorySha256 });
  const decision = { schemaVersion: 1, kind: 'sit-apple-web-independent-decision',
    evidenceClass: 'independent-release-review', syntheticFixture: synthetic, decision: 'approved',
    candidateSha256: candidate.candidateSha256, configurationSha256: candidate.configurationSha256,
    readinessSha256: candidate.readinessSha256, backendSha256: candidate.backendSha256,
    collectorIdentitySha256: candidate.collectorIdentitySha256,
    reviewerIdentitySha256: sha('synthetic separate reviewer'), reviewEvidenceSha256: sha('synthetic review receipt'),
    decidedAtUtc: iso(now), validUntilUtc: deadline };
  return { input, candidate, decision, inputBytes: JSON.stringify(input) };
}

test('synthetic readback candidate and independent compose stay unmistakably non-activating; writer seals hash and cleans temps', (t) => {
  const f = fixture(); const composed = composeAppleWebDecision(f.candidate, f.decision,
    { now: now.getTime(), expectedSource: source, syntheticTestOnly: true });
  assert.equal(f.candidate.syntheticFixture, true); assert.equal(f.candidate.activationEligible, false);
  assert.equal(composed.envelope.syntheticFixture, true); assert.equal(composed.envelope.activationEligible, false);
  assert.equal(composed.envelope.evidenceClass, 'synthetic-test-only');
  const dir = protectedDir(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-apple-producer-'))), 'out');
  t.after(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));
  const written = writeAppleWebOutput({ directory: dir, runId: 'synthetic-positive', kind: 'readiness',
    bytes: JSON.stringify(composed.envelope), repositoryRoot: root });
  assert.equal(written.sha256, sha(fs.readFileSync(written.path)));
  assert.equal(fs.statSync(written.path).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['synthetic-positive.readiness.json']);
});

test('Apple writer verifies temporary descriptor metadata and zeroes buffers after failure', (t) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-apple-writer-hardening-')));
  const dir = protectedDir(base, 'out'); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const bytes = JSON.stringify({ candidate: 'synthetic' }); let captured;
  assert.throws(() => writeAppleWebOutput({ directory: dir, runId: 'mode-failure', kind: 'candidate', bytes,
    repositoryRoot: root, afterTempOpen(_fd, tempPath) { fs.chmodSync(tempPath, 0o644); } }), /apple_web_output_denied/u);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.throws(() => writeAppleWebOutput({ directory: dir, runId: 'write-failure', kind: 'candidate', bytes,
    repositoryRoot: root, afterTempWrite(value) { captured = value; throw new Error('injected after readback'); } }), /apple_web_output_denied/u);
  assert.ok(captured.buffer.every((byte) => byte === 0));
  assert.ok(captured.readback.every((byte) => byte === 0));
  assert.deepEqual(fs.readdirSync(dir), []);
  const racedFinal = path.join(dir, 'collision.candidate.json');
  assert.throws(() => writeAppleWebOutput({ directory: dir, runId: 'collision', kind: 'candidate', bytes,
    repositoryRoot: root, beforePublish() { fs.writeFileSync(path.join(dir, 'collision.candidate.json'), 'foreign', { mode: 0o600, flag: 'wx' }); } }),
  /apple_web_output_denied/u);
  assert.equal(fs.readFileSync(racedFinal, 'utf8'), 'foreign');
  assert.deepEqual(fs.readdirSync(dir), ['collision.candidate.json']);
});

test('production CLI rejects synthetic provider inputs before publishing any name', async (t) => {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-apple-cli-')));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const inputDir = protectedDir(work, 'inputs'); const outputDir = protectedDir(work, 'output');
  assert.equal(snapshot().inventorySha256, appleWebDigest(snapshot().files));
  assert.deepEqual(snapshot().files.map((entry) => entry.relativePath), APPLE_WEB_SOURCE_CLOSURE);
  const f = fixture(); const readbacks = protectedFile(inputDir, 'readbacks.json', f.inputBytes);
  await assert.rejects(runAppleWebReadinessCli(['collect', '--readbacks', readbacks,
    '--readbacks-sha256', sha(f.inputBytes), '--output-dir', outputDir, '--run-id', 'synthetic-denied'], {
    repositoryRoot: root, now: () => now.getTime(), sourceSnapshot: snapshot,
  }), /apple_web_synthetic_denied/u);
  assert.deepEqual(fs.readdirSync(outputDir), []);
});

test('candidate compose rejects expired, mismatched app/provider and incomplete source register', () => {
  for (const mutate of [
    (f) => { f.input.validUntilUtc = iso(new Date(now.getTime() - 1)); },
    (f) => { f.input.firebaseReadback.oauthClientId = 'foreign.services.id'; },
    (f) => { f.input.sourceRegister.pop(); },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => composeAppleWebCandidate(f.input, { now: now.getTime(), expectedSource: source,
      allowSyntheticFixture: true, sourceInventory: sourceFiles, sourceInventorySha256: inventorySha256 }), /apple_web_/u);
  }
});

test('decision compose rejects reviewer reuse and expired approval', () => {
  const f = fixture();
  assert.throws(() => composeAppleWebDecision(f.candidate,
    { ...f.decision, reviewerIdentitySha256: f.candidate.collectorIdentitySha256 },
    { now: now.getTime(), expectedSource: source, syntheticTestOnly: true }), /apple_web_decision_invalid/u);
  assert.throws(() => composeAppleWebDecision(f.candidate, f.decision,
    { now: Date.parse(f.decision.validUntilUtc), expectedSource: source, syntheticTestOnly: true }), /apple_web_decision_invalid/u);
});

test('source inventory is commit and current-byte bound in an isolated repository', (t) => {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-apple-source-')));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: work });
  execFileSync('git', ['config', 'user.name', 'Apple Readiness Test'], { cwd: work });
  execFileSync('git', ['config', 'user.email', 'apple-readiness@example.invalid'], { cwd: work });
  for (const relativePath of APPLE_WEB_SOURCE_CLOSURE) {
    const file = path.join(work, relativePath); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `source:${relativePath}\n`);
  }
  execFileSync('git', ['add', ...APPLE_WEB_SOURCE_CLOSURE], { cwd: work });
  execFileSync('git', ['commit', '-qm', 'seed Apple source closure'], { cwd: work });
  const snap = currentAppleWebSourceSnapshot(work); assert.match(snap.sourceCommit, /^[a-f0-9]{40}$/u);
  let replaced = false;
  assert.throws(() => currentAppleWebSourceSnapshot(work, { afterSourceOpen(relativePath) {
    if (replaced) return; replaced = true;
    const file = path.join(work, relativePath); fs.renameSync(file, `${file}.old`); fs.writeFileSync(file, 'replacement bytes');
  } }), /apple_web_source_drift/u);
  assert.equal(replaced, true);
  fs.appendFileSync(path.join(work, APPLE_WEB_SOURCE_CLOSURE[0]), 'drift\n');
  assert.throws(() => currentAppleWebSourceSnapshot(work), /apple_web_source_drift/u);
});

test('Apple compose CLI rejects candidate extra keys and malformed source inventory rows', async (t) => {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-apple-candidate-shape-')));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const inputDir = protectedDir(work, 'inputs'); const outputDir = protectedDir(work, 'output');
  for (const mutate of [
    (candidate) => { candidate.unexpected = true; },
    (candidate) => { delete candidate.sourceInventory[0].gitBlob; },
  ]) {
    const f = fixture(); const candidate = { ...f.candidate, sourceInventory: structuredClone(f.candidate.sourceInventory), syntheticFixture: false,
      evidenceClass: 'sanitized-provider-and-runtime-readbacks' };
    mutate(candidate);
    candidate.candidateSha256 = appleWebDigest(Object.fromEntries(Object.entries(candidate)
      .filter(([key]) => key !== 'candidateSha256')));
    const candidateBytes = JSON.stringify(candidate); const candidateFile = protectedFile(inputDir, 'candidate.json', candidateBytes);
    const decisionFile = protectedFile(inputDir, 'decision.json', '{}');
    await assert.rejects(runAppleWebReadinessCli(['compose', '--candidate', candidateFile,
      '--candidate-sha256', sha(candidateBytes), '--decision', decisionFile,
      '--decision-sha256', sha('{}'), '--output-dir', outputDir, '--run-id', 'strict-shape'], {
      repositoryRoot: root, now: () => now.getTime(), sourceSnapshot: snapshot,
    }), /apple_web_candidate_invalid/u);
    fs.unlinkSync(candidateFile); fs.unlinkSync(decisionFile);
  }
  assert.deepEqual(fs.readdirSync(outputDir), []);
});
