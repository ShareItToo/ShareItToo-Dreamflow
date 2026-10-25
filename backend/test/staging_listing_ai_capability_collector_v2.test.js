import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createStagingListingAiCapabilityCollectorV2, writeStagingListingAiCapabilityCandidate,
  readStagingListingAiSessionToken, STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS } from '../ops/staging_listing_ai_capability_collector_v2.mjs';
import { runStagingListingAiCapabilityCliV2 } from '../ops/staging_listing_ai_capability_cli_v2.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function readStable(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    assert.equal(before.isFile(), true);
    const keys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    const namedBefore = fs.lstatSync(file, { bigint: true });
    assert.deepEqual(keys.map((key) => namedBefore[key]), keys.map((key) => before[key]));
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const namedAfter = fs.lstatSync(file, { bigint: true });
    assert.deepEqual(keys.map((key) => namedAfter[key]), keys.map((key) => after[key]));
    return { bytes, stat: before };
  } finally { fs.closeSync(fd); }
}
const sourceRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceCommit = 'a'.repeat(40), runtimeCommit = 'b'.repeat(40), id = 'c'.repeat(64);
const clientVersion = '1.0.0+2026092905';
const imageId = `sha256:${'d'.repeat(64)}`;
const repoDigest = `ghcr.io/shareittoo/shareittoo-api@sha256:${'e'.repeat(64)}`;
const timestamp = '2026-10-25T10:00:00.000Z', token = `sit_test_${'x'.repeat(32)}`;
const providerConfiguration = { provider: 'openai', model: 'gpt-4o-mini-2024-07-18', promptVersion: 'listing-ai-prompt-v1',
  schemaVersion: 'listing-ai-draft-v1', budgetCents: 250, externalProviderExecutionAllowed: true,
  automaticPublicationAllowed: false };
const activation = {
  schemaVersion: 1, kind: 'sit-staging-listing-ai-external-activation', status: 'verified', environment: 'staging',
  canonicalContainerId: id, canonicalContainerName: '/shareittoo-staging-api', runtimeCommit, imageId, repoDigest,
  greenPromotionReceiptSha256: sha('green'), deploymentReportSha256: sha('report'),
  providerConfiguration, providerConfigurationSha256: sha(JSON.stringify(providerConfiguration)), healthReadbackSha256: sha('health'),
  secretMetadataReceiptSha256: sha('secret metadata'), recordedAtUtc: timestamp,
  rollbackTarget: { containerId: 'f'.repeat(64), containerName: '/shareittoo-staging-api', imageId: `sha256:${'1'.repeat(64)}`, runtimeCommit },
};
const activationBytes = Buffer.from(JSON.stringify(activation));
const inventory = STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS.map((relativePath) => ({ relativePath, sourceCommit, sha256: sha(relativePath) }));
const runtime = { containerId: id, containerName: '/shareittoo-staging-api', running: true, green: true, runtimeCommit, imageId, repoDigest };
const disclosure = 'Listing-AI creates a draft for review.';
const capability = { available: true, provider: 'openai', mode: 'external', disclosureVersion: 'listing-ai-disclosure-v1',
  disclosureText: disclosure, disclosureHash: sha(disclosure), policyRevision: 'listing-ai-policy-v1',
  configRevision: sha('config revision'), supportedClientVersion: clientVersion, imageLimit: 4 };
const user = { user: { id: 'qa_user_12345', deactivatedAt: null } };
let clock = Date.parse(timestamp) + 10_000;
function fetchMock({ bodyOverride, leakToken = false, redirect = false, status = 200, onCall = () => {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    onCall(url, calls.length);
    const body = url.endsWith('/auth/me') ? user : bodyOverride ?? capability;
    return { status: redirect ? 302 : status, text: async () => JSON.stringify(leakToken ? { echo: token } : body) };
  };
  return { calls, fetchImpl };
}
function create(overrides = {}) {
  const { calls, fetchImpl } = fetchMock(overrides);
  const collector = createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: activationBytes, runtimeReader: () => runtime, fetchImpl, now: () => clock,
    sourceCommit, clientVersion, sourceInventory: inventory });
  return { collector, calls };
}

test('authenticated capability candidate binds activation, exact runtime and committed source without provider actions', async () => {
  clock = Date.parse(timestamp) + 10_000;
  const { collector, calls } = create();
  const result = await collector.collect();
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://staging.shareittoo.com/api/v1/auth/me',
    'https://staging.shareittoo.com/api/v1/blue-ocean/listing-drafts/capabilities',
    'https://staging.shareittoo.com/api/v1/auth/me',
  ]);
  assert.ok(calls.every(({ options }) => options.method === 'GET' && options.redirect === 'error'
    && options.credentials === 'omit' && options.headers.authorization === `Bearer ${token}`));
  const evidence = JSON.parse(result.bytes.toString('utf8'));
  assert.equal(evidence.kind, 'sit-staging-listing-ai-capability-candidate-v2');
  assert.equal(evidence.status, 'pending-independent-review');
  assert.equal(evidence.sourceCommit, sourceCommit);
  assert.equal(evidence.runtime.runtimeCommit, runtimeCommit);
  assert.equal(evidence.activationReceiptSha256, sha(activationBytes));
  assert.equal(evidence.capability.provider, 'openai');
  assert.equal(evidence.capability.available, true);
  assert.equal(evidence.authenticatedUserSha256, sha('qa_user_12345'));
  assert.equal(result.bytes.includes(Buffer.from(token)), false);
  assert.equal(result.bytes.includes(Buffer.from('qa_user_12345')), false);
  assert.deepEqual(calls.map(({ options }) => options.method), ['GET', 'GET', 'GET']);
});

test('rejects invalid session identity, redirects, auth failures, token echo and capability boundary drift', async () => {
  for (const [overrides, expectedUserId] of [
    [{}, 'wrong-user'], [{ redirect: true }, 'qa_user_12345'], [{ status: 401 }, 'qa_user_12345'],
    [{ leakToken: true }, 'qa_user_12345'],
    [{ bodyOverride: { ...capability, provider: 'mock' } }, 'qa_user_12345'],
    [{ bodyOverride: { ...capability, automaticPublicationAllowed: true } }, 'qa_user_12345'],
    [{ bodyOverride: { ...capability, configRevision: '' } }, 'qa_user_12345'],
    [{ bodyOverride: { ...capability, configRevision: 'cfg-short' } }, 'qa_user_12345'],
    [{ bodyOverride: { ...capability, policyRevision: 'listing-ai-policy-v2' } }, 'qa_user_12345'],
    [{ bodyOverride: { ...capability, supportedClientVersion: '1.2.3+20261025' } }, 'qa_user_12345'],
  ]) {
    const { calls, fetchImpl } = fetchMock(overrides);
    const collector = createStagingListingAiCapabilityCollectorV2({ token, expectedUserId,
      activationReceiptBytes: activationBytes, runtimeReader: () => runtime, fetchImpl,
      now: () => clock, sourceCommit, clientVersion, sourceInventory: inventory });
    await assert.rejects(collector.collect(), /staging_listing_ai_capability_not_verified/u);
    assert.ok(calls.every(({ options }) => options.method === 'GET'));
  }
});

test('fails closed on runtime/receipt/source drift and stale activation', async () => {
  const { fetchImpl } = fetchMock();
  let reads = 0;
  const drift = createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: activationBytes, runtimeReader: () => ++reads > 2 ? { ...runtime, imageId: imageId.replace('d', '0') } : runtime,
    fetchImpl, now: () => clock, sourceCommit, clientVersion, sourceInventory: inventory });
  await assert.rejects(drift.collect(), /staging_listing_ai_capability_not_verified/u);
  assert.throws(() => createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: Buffer.from(JSON.stringify({ ...activation, repoDigest: `ghcr.io/elsewhere/api@sha256:${'e'.repeat(64)}` })),
    runtimeReader: () => runtime, fetchImpl, now: () => clock, sourceCommit, clientVersion, sourceInventory: inventory }),
  /staging_listing_ai_capability_not_verified/u);
  assert.throws(() => createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: activationBytes, runtimeReader: () => runtime, fetchImpl,
    now: () => Date.parse(timestamp) + 60 * 60_000 + 1, sourceCommit, clientVersion, sourceInventory: inventory }),
  /staging_listing_ai_capability_not_verified/u);
  assert.throws(() => createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: activationBytes, runtimeReader: () => runtime, fetchImpl, now: () => clock,
    sourceCommit, clientVersion, sourceInventory: inventory.slice(1) }),
  /staging_listing_ai_capability_not_verified/u);
});

test('capability collection near receipt expiry fails and cannot extend receipt lifetime', async () => {
  const nearExpiry = Date.parse(timestamp) + 60 * 60_000 - 20_000;
  let time = nearExpiry;
  const { fetchImpl } = fetchMock({ onCall: () => { time += 8_000; } });
  const collector = createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: activationBytes, runtimeReader: () => runtime, fetchImpl, now: () => time,
    sourceCommit, clientVersion, sourceInventory: inventory });
  await assert.rejects(collector.collect(), /staging_listing_ai_capability_not_verified/u);
});

test('final activation receipt readback must retain its original bytes', async () => {
  const { fetchImpl } = fetchMock(); let receiptReads = 0;
  const collector = createStagingListingAiCapabilityCollectorV2({ token, expectedUserId: 'qa_user_12345',
    activationReceiptBytes: activationBytes,
    activationReceiptReader: () => (++receiptReads === 1 ? Buffer.from(`${activationBytes.toString()} `) : activationBytes),
    runtimeReader: () => runtime, fetchImpl, now: () => clock,
    sourceCommit, clientVersion, sourceInventory: inventory });
  await assert.rejects(collector.collect(), /staging_listing_ai_capability_not_verified/u);
});

test('candidate writer is owner-only no-clobber and preserves collisions', (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-cap-v2-')));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('{"ok":true}\n');
  const out = writeStagingListingAiCapabilityCandidate({ directory, fileName: 'staging-listing-ai-capability-test.json', bytes });
  assert.equal(out.mode, '0600');
  const output = readStable(out.file);
  assert.equal(Number(output.stat.mode & 0o777n), 0o600);
  assert.throws(() => writeStagingListingAiCapabilityCandidate({ directory,
    fileName: 'staging-listing-ai-capability-test.json', bytes: Buffer.from('replacement') }),
  /staging_listing_ai_capability_candidate_write_failed/u);
  assert.deepEqual(output.bytes, bytes);
});

test('candidate writer publishes atomically and removes only its own failed output', (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-cap-cleanup-')));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('{"complete":true}\n');
  assert.throws(() => writeStagingListingAiCapabilityCandidate({ directory,
    fileName: 'staging-listing-ai-capability-failed.json', bytes,
    afterPublish() { throw new Error('injected failure after atomic link'); } }),
  /staging_listing_ai_capability_candidate_write_failed/u);
  assert.deepEqual(fs.readdirSync(directory), []);
  const tempLink = path.join(directory, 'staging-listing-ai-capability-collision.json');
  fs.writeFileSync(tempLink, 'foreign', { mode: 0o600, flag: 'wx' });
  assert.throws(() => writeStagingListingAiCapabilityCandidate({ directory,
    fileName: 'staging-listing-ai-capability-collision.json', bytes }),
  /staging_listing_ai_capability_candidate_write_failed/u);
  assert.equal(fs.readFileSync(tempLink, 'utf8'), 'foreign');
  assert.equal(fs.readdirSync(directory).filter((name) => name.endsWith('.tmp')).length, 0);
  const racedFinal = path.join(directory, 'staging-listing-ai-capability-raced.json');
  assert.throws(() => writeStagingListingAiCapabilityCandidate({ directory,
    fileName: 'staging-listing-ai-capability-raced.json', bytes,
    beforePublish() { fs.writeFileSync(racedFinal, 'raced foreign', { mode: 0o600, flag: 'wx' }); } }),
  /staging_listing_ai_capability_candidate_write_failed/u);
  assert.equal(fs.readFileSync(racedFinal, 'utf8'), 'raced foreign');
  assert.equal(fs.readdirSync(directory).some((name) => name.endsWith('.tmp')), false);
});

test('session token reader requires stable owner-only parents, mode 0600 and single-link regular files', (t) => {
  const repositoryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-repo-')));
  const protectedDirectory = path.join(path.dirname(repositoryRoot), `sit-listing-ai-token-${process.pid}-${Date.now()}`);
  fs.mkdirSync(protectedDirectory, { mode: 0o700 }); fs.chmodSync(protectedDirectory, 0o700);
  t.after(() => { fs.rmSync(repositoryRoot, { recursive: true, force: true }); fs.rmSync(protectedDirectory, { recursive: true, force: true }); });
  const tokenFile = path.join(protectedDirectory, 'session'); fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  fs.chmodSync(tokenFile, 0o600);
  assert.equal(readStagingListingAiSessionToken(tokenFile, repositoryRoot), token);
  const linked = path.join(protectedDirectory, 'session-hardlink'); fs.linkSync(tokenFile, linked);
  assert.throws(() => readStagingListingAiSessionToken(tokenFile, repositoryRoot),
    /staging_listing_ai_capability_not_verified/u);
  fs.unlinkSync(linked);
  const symlink = path.join(protectedDirectory, 'session-symlink'); fs.symlinkSync(tokenFile, symlink);
  assert.throws(() => readStagingListingAiSessionToken(symlink, repositoryRoot),
    /staging_listing_ai_capability_not_verified/u);
});

test('CLI smoke uses injected read-only adapters and emits only evidence metadata', async (t) => {
  clock = Date.parse(timestamp) + 10_000;
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-cap-cli-')));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { fetchImpl } = fetchMock();
  const result = await runStagingListingAiCapabilityCliV2([
    '--activation-receipt', '/unused/activation.json', '--session-file', '/unused/session',
    '--expected-user-id', 'qa_user_12345', '--client-version', clientVersion,
    '--evidence-dir', directory, '--run-id', 'cli-test',
  ], { activationReceiptBytes: activationBytes, token, runtimeReader: () => runtime, fetchImpl,
    sourceCommit, sourceSnapshot: { sourceCommit, files: inventory }, now: () => clock });
  const evidence = fs.readFileSync(path.join(directory, 'staging-listing-ai-capability-cli-test.json'), 'utf8');
  assert.equal(result.mode, '0600');
  assert.doesNotMatch(evidence, new RegExp(token));
  assert.doesNotMatch(evidence, /qa_user_12345/u);
});

test('CLI default Docker adapter inspects the exact container ID and pinned image with replacement CAS', async (t) => {
  clock = Date.parse(timestamp) + 10_000;
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-cap-docker-')));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { fetchImpl } = fetchMock(); let containerReads = 0;
  const container = { Id: id, Name: '/shareittoo-staging-api', Image: imageId, State: { Running: true },
    Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'org.opencontainers.image.revision': runtimeCommit } } };
  const execute = (_command, argv) => {
    if (argv[0] === 'inspect') {
      assert.deepEqual(argv, ['inspect', '--format', '{{json .}}', id]);
      containerReads += 1; return JSON.stringify(container);
    }
    assert.deepEqual(argv, ['image', 'inspect', '--format', '{{json .}}', imageId]);
    return JSON.stringify({ Id: imageId, RepoDigests: [repoDigest] });
  };
  const result = await runStagingListingAiCapabilityCliV2([
    '--activation-receipt', '/unused/activation.json', '--session-file', '/unused/session',
    '--expected-user-id', 'qa_user_12345', '--client-version', clientVersion,
    '--evidence-dir', directory, '--run-id', 'docker-cas',
  ], { activationReceiptBytes: activationBytes, token, execute, fetchImpl,
    sourceCommit, sourceSnapshot: { sourceCommit, files: inventory }, now: () => clock });
  assert.ok(containerReads >= 2);
  assert.equal(result.mode, '0600');

  let changedReads = 0;
  const replacingExecute = (_command, argv) => {
    if (argv[0] === 'inspect') {
      changedReads += 1;
      return JSON.stringify(changedReads === 1 ? container : { ...container, Id: '9'.repeat(64) });
    }
    return JSON.stringify({ Id: imageId, RepoDigests: [repoDigest] });
  };
  await assert.rejects(runStagingListingAiCapabilityCliV2([
    '--activation-receipt', '/unused/activation.json', '--session-file', '/unused/session',
    '--expected-user-id', 'qa_user_12345', '--client-version', clientVersion,
    '--evidence-dir', directory, '--run-id', 'docker-race',
  ], { activationReceiptBytes: activationBytes, token, execute: replacingExecute, fetchImpl,
    sourceCommit, sourceSnapshot: { sourceCommit, files: inventory }, now: () => clock }),
  /staging_listing_ai_capability_not_verified/u);
});

test('CLI refuses a source revision that is not the current committed HEAD', async () => {
  await assert.rejects(runStagingListingAiCapabilityCliV2([
    '--activation-receipt', '/unused/activation.json', '--session-file', '/unused/session',
    '--expected-user-id', 'qa_user_12345', '--client-version', clientVersion,
    '--evidence-dir', '/unused/evidence', '--run-id', 'source-mismatch',
  ], { sourceCommit: 'f'.repeat(40) }), /staging_listing_ai_capability_not_verified/u);
});

test('CLI Activation Receipt file and parent replacement during final descriptor read are rejected', async (t) => {
  clock = Date.parse(timestamp) + 10_000;
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-receipt-race-')));
  fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const receipt = path.join(directory, 'activation.json'); fs.writeFileSync(receipt, activationBytes, { mode: 0o600 });
  const { fetchImpl } = fetchMock(); let reads = 0;
  await assert.rejects(runStagingListingAiCapabilityCliV2([
    '--activation-receipt', receipt, '--session-file', '/unused/session', '--expected-user-id', 'qa_user_12345',
    '--client-version', clientVersion, '--evidence-dir', directory, '--run-id', 'receipt-race',
  ], { activationReceiptReader: undefined, afterActivationOpen() {
    reads += 1;
    if (reads === 2) {
      fs.renameSync(receipt, `${receipt}.old`);
      fs.writeFileSync(receipt, Buffer.from(`${activationBytes.toString()} `), { mode: 0o600 });
    }
  }, token, sourceCommit, sourceSnapshot: { sourceCommit, files: inventory }, runtimeReader: () => runtime,
  fetchImpl, now: () => clock }), /staging_listing_ai_capability_not_verified/u);
  assert.equal(reads, 2);

  const parent = path.join(directory, 'owner-only'); fs.mkdirSync(parent, { mode: 0o700 }); fs.chmodSync(parent, 0o700);
  const nestedReceipt = path.join(parent, 'activation.json'); fs.writeFileSync(nestedReceipt, activationBytes, { mode: 0o600 });
  let parentReads = 0;
  await assert.rejects(runStagingListingAiCapabilityCliV2([
    '--activation-receipt', nestedReceipt, '--session-file', '/unused/session', '--expected-user-id', 'qa_user_12345',
    '--client-version', clientVersion, '--evidence-dir', directory, '--run-id', 'parent-race',
  ], { token, sourceCommit, sourceSnapshot: { sourceCommit, files: inventory }, runtimeReader: () => runtime,
  fetchImpl, now: () => clock, afterActivationOpen() {
    parentReads += 1;
    if (parentReads === 2) {
      fs.renameSync(parent, `${parent}.old`);
      fs.mkdirSync(parent, { mode: 0o700 }); fs.chmodSync(parent, 0o700);
      fs.writeFileSync(nestedReceipt, Buffer.from(`${activationBytes.toString()} `), { mode: 0o600 });
    }
  } }), /staging_listing_ai_capability_not_verified/u);
  assert.equal(parentReads, 2);
});

test('clean source closure succeeds in an isolated committed Git repository and dirty closure fails', async (t) => {
  clock = Date.parse(timestamp) + 10_000;
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-source-')));
  fs.chmodSync(base, 0o700); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repositoryRoot = path.join(base, 'repo'); fs.mkdirSync(repositoryRoot, { mode: 0o700 });
  for (const relative of STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS) {
    const destination = path.join(repositoryRoot, relative); fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.resolve(sourceRepositoryRoot, relative), destination);
  }
  const git = (argv) => execFileSync('git', ['-C', repositoryRoot, ...argv], { stdio: 'ignore' });
  git(['init', '--quiet']); git(['config', 'user.email', 'fixture@example.invalid']); git(['config', 'user.name', 'Fixture']);
  git(['add', '-f', ...STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS]); git(['commit', '--quiet', '-m', 'fixture source closure']);
  const sourceCommitForTest = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const outside = path.join(base, 'protected'); fs.mkdirSync(outside, { mode: 0o700 }); fs.chmodSync(outside, 0o700);
  const session = path.join(outside, 'session'); fs.writeFileSync(session, token, { mode: 0o600 });
  const receipt = path.join(outside, 'activation.json'); fs.writeFileSync(receipt, activationBytes, { mode: 0o600 });
  const baseArgs = ['--activation-receipt', receipt, '--session-file', session, '--expected-user-id', 'qa_user_12345',
    '--client-version', clientVersion, '--evidence-dir', outside];
  const { fetchImpl } = fetchMock();
  const cleanResult = await runStagingListingAiCapabilityCliV2([...baseArgs, '--run-id', 'committed-source'], { repositoryRoot, runtimeReader: () => runtime,
    fetchImpl, now: () => clock });
  assert.equal(cleanResult.mode, '0600');
  assert.equal(JSON.parse(fs.readFileSync(cleanResult.file, 'utf8')).sourceCommit, sourceCommitForTest);
  let replaced = false;
  await assert.rejects(runStagingListingAiCapabilityCliV2([...baseArgs, '--run-id', 'source-race'], {
    repositoryRoot, runtimeReader: () => runtime, fetchImpl, now: () => clock,
    afterSourceOpen(relativePath) {
      if (replaced) return; replaced = true;
      const sourceFile = path.join(repositoryRoot, relativePath);
      fs.renameSync(sourceFile, `${sourceFile}.old`);
      fs.writeFileSync(sourceFile, 'replacement bytes', { mode: 0o644 });
    },
  }), /staging_listing_ai_capability_not_verified/u);
  assert.equal(replaced, true);
  const target = path.join(repositoryRoot, STAGING_LISTING_AI_CAPABILITY_V2_SOURCE_PATHS[1]);
  fs.appendFileSync(target, '\n// dirty after commit\n');
  await assert.rejects(runStagingListingAiCapabilityCliV2([...baseArgs, '--run-id', 'dirty-source'], {
    repositoryRoot, runtimeReader: () => runtime, fetchImpl, now: () => clock,
  }), /staging_listing_ai_capability_not_verified/u);
});
