import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { composeStagingListingAiActivationReceipt, validateStagingListingAiActivationReceipt,
  writeStagingListingAiActivationReceipt } from '../ops/staging_listing_ai_activation_receipt.mjs';
import { validatePriorGreenListingAiReceipt } from '../ops/validate_staging_listing_ai_green_receipt.mjs';
import { runStagingListingAiActivationReceiptCli } from '../ops/write_staging_listing_ai_activation_receipt.mjs';

const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const commit = 'a'.repeat(40), oldCommit = 'b'.repeat(40);
const oldId = 'c'.repeat(64), newId = 'd'.repeat(64);
const oldImage = `sha256:${'e'.repeat(64)}`, newImage = `sha256:${'f'.repeat(64)}`;
const now = '2026-10-25T12:00:00.000Z';

function evidence(overrides = {}) {
  const green = Buffer.from(JSON.stringify({ schemaVersion: 2, kind: 'sit-green-staging-106-106-promotion',
    status: 'promoted_owner_smoke_pending', candidateId: oldId, runtimeCommit: commit,
    ownerSmokePassed: false, publicReleaseComplete: false }));
  const report = Buffer.from(JSON.stringify({ environment: 'staging', commit,
    stagingListingAi: true, stagingPilotId: 'heilbronn_wave0' }));
  const listingAi = { status: 'enabled', provider: 'openai', model: 'gpt-4o-mini-2024-07-18',
    promptVersion: 'listing-ai-prompt-v1', schemaVersion: 'listing-ai-draft-v1', budgetCents: 250,
    externalProviderExecutionAllowed: true, automaticPublicationAllowed: false };
  const health = Buffer.from(JSON.stringify({ status: 'ok', checks: { listingAi } }));
  const runtime = { containerId: newId, containerName: '/shareittoo-staging-api', running: true, green: true,
    runtimeCommit: commit, imageId: newImage, repoDigest: `ghcr.io/shareittoo/shareittoo-api@sha256:${'1'.repeat(64)}` };
  const rollbackTarget = { containerId: oldId, containerName: '/shareittoo-staging-api',
    imageId: oldImage, runtimeCommit: commit };
  const secretMetadataReceipt = { fileMode: 0o640, fileSize: 44, credentialPresent: true,
    ownerUid: 0, groupGid: 65532 };
  return { greenPromotionReceiptBytes: green, deploymentReportBytes: report, healthReadbackBytes: health,
    runtime, rollbackTarget, secretMetadataReceipt, recordedAtUtc: now, ...overrides };
}

test('composes a sanitized receipt bound to exact runtime, Green receipt, report, health and rollback', () => {
  const input = evidence();
  const receipt = composeStagingListingAiActivationReceipt(input);
  assert.equal(receipt.kind, 'sit-staging-listing-ai-external-activation');
  assert.equal(receipt.canonicalContainerId, newId);
  assert.equal(receipt.imageId, newImage);
  assert.equal(receipt.greenPromotionReceiptSha256, hash(input.greenPromotionReceiptBytes));
  assert.equal(receipt.deploymentReportSha256, hash(input.deploymentReportBytes));
  assert.equal(receipt.rollbackTarget.containerId, oldId);
  assert.doesNotMatch(JSON.stringify(receipt), /sk-proj|apiKey|token|authorization|secretValue/u);
});

test('wrong container/image/commit, changed report, failed health and invalid Green lineage fail closed', () => {
  const cases = [
    ['container identity', { runtime: { ...evidence().runtime, containerId: oldId } }],
    ['image repository identity', { runtime: { ...evidence().runtime,
      repoDigest: `ghcr.io/attacker/shareittoo-api@sha256:${'1'.repeat(64)}` } }],
    ['runtime commit', { runtime: { ...evidence().runtime, runtimeCommit: oldCommit } }],
    ['deployment report', { deploymentReportBytes: Buffer.from(JSON.stringify({ environment: 'staging', commit: oldCommit, stagingListingAi: true })) }],
    ['failed health', { healthReadbackBytes: Buffer.from(JSON.stringify({ status: 'fail', checks: { listingAi: { status: 'disabled' } } })) }],
    ['Green lineage', { greenPromotionReceiptBytes: Buffer.from('{}') }],
  ];
  for (const [label, changes] of cases) assert.throws(
    () => composeStagingListingAiActivationReceipt(evidence(changes)),
    (error) => error.message === 'staging_listing_ai_activation_receipt_invalid', label,
  );
});

test('validator rejects altered receipt fields, stale receipt and unexpected activation mode', () => {
  const valid = composeStagingListingAiActivationReceipt(evidence());
  assert.throws(() => validateStagingListingAiActivationReceipt({ ...valid, imageId: oldImage }, { imageId: newImage }));
  assert.throws(() => validateStagingListingAiActivationReceipt(valid, { now: Date.parse(now) + 3_600_001 }));
  assert.throws(() => composeStagingListingAiActivationReceipt(evidence({ rollbackTarget: {
    ...evidence().rollbackTarget, containerId: newId,
  } })));
  assert.throws(() => composeStagingListingAiActivationReceipt(evidence({ rollbackTarget: {
    ...evidence().rollbackTarget, runtimeCommit: oldCommit,
  } })));
  assert.throws(() => composeStagingListingAiActivationReceipt(evidence({ secretMetadataReceipt: {
    ...evidence().secretMetadataReceipt, apiKey: 'sk-proj-never-serialize-this',
  } })));
});

test('protected receipt writer uses exclusive 0600 output under owner-only 0700 and refuses collision', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-receipt-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.chmodSync(root, 0o700);
  const receipt = composeStagingListingAiActivationReceipt(evidence());
  const first = writeStagingListingAiActivationReceipt({ directory: root, runId: 'run-001', receipt,
    now: Date.parse(now) });
  const stat = fs.lstatSync(first.path);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(stat.nlink, 1);
  assert.equal(hash(fs.readFileSync(first.path)), first.sha256);
  assert.throws(() => writeStagingListingAiActivationReceipt({ directory: root,
    runId: 'run-001', receipt, now: Date.parse(now) }), /write_failed/u);
  assert.equal(fs.readdirSync(root).length, 1);
  assert.throws(() => writeStagingListingAiActivationReceipt({ directory: root,
    runId: 'run-cleanup', receipt, now: Date.parse(now),
    afterWrite() { throw new Error('injected CAS drift'); } }), /write_failed/u);
  assert.deepEqual(fs.readdirSync(root), ['staging-listing-ai-activation-run-001.json']);
});

test('receipt writer refuses permissive or aliased output directories', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-receipt-mode-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.chmodSync(root, 0o755);
  const receipt = composeStagingListingAiActivationReceipt(evidence());
  assert.throws(() => writeStagingListingAiActivationReceipt({ directory: root,
    runId: 'run-mode', receipt, now: Date.parse(now) }), /write_failed/u);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('prior Green receipt preflight binds current exact container, image and commit before deployment', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-green-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'green.json');
  fs.writeFileSync(file, JSON.stringify({ kind: 'sit-green-staging-106-106-promotion', schemaVersion: 2,
    status: 'promoted_owner_smoke_pending', candidateId: oldId, runtimeCommit: commit,
    ownerSmokePassed: false, publicReleaseComplete: false, intentionalProviderCalls: 0 }), { mode: 0o600 });
  const runtime = { Id: oldId, Name: '/shareittoo-staging-api', Image: oldImage,
    State: { Running: true }, Config: { Labels: { 'com.shareittoo.sit.green': 'true',
      'org.opencontainers.image.revision': commit } } };
  const execute = (_command, args) => {
    if (args[0] === 'inspect') {
      assert.deepEqual(args, ['inspect', '--format', '{{json .}}', oldId]);
      return JSON.stringify(runtime);
    }
    assert.deepEqual(args, ['image', 'inspect', '--format', '{{json .}}', oldImage]);
    return JSON.stringify({ Id: oldImage, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@sha256:${'2'.repeat(64)}`] });
  };
  assert.equal(validatePriorGreenListingAiReceipt({ file, containerId: oldId, imageId: oldImage,
    runtimeCommit: commit }, { execute }).status, 'verified-prior-green-runtime');
  for (const overrides of [
    { containerId: newId }, { imageId: newImage }, { runtimeCommit: oldCommit },
  ]) {
    assert.throws(() => validatePriorGreenListingAiReceipt({ file, containerId: oldId,
      imageId: oldImage, runtimeCommit: commit, ...overrides }, { execute }),
    /staging_listing_ai_green_receipt_invalid/u);
  }
});

test('activation CLI reads only mocked Docker identities and emits protected receipt without key bytes', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-cli-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.chmodSync(root, 0o700);
  const greenFile = path.join(root, 'green.json'), reportFile = path.join(root, 'report.json');
  const healthFile = path.join(root, 'health.json'), secretFile = path.join(root, 'key');
  const repoDigest = `ghcr.io/shareittoo/shareittoo-api@sha256:${'1'.repeat(64)}`;
  const green = { schemaVersion: 2, kind: 'sit-green-staging-106-106-promotion',
    status: 'promoted_owner_smoke_pending', candidateId: oldId, runtimeCommit: commit,
    ownerSmokePassed: false, publicReleaseComplete: false };
  const runtime = { containerId: newId, containerName: '/shareittoo-staging-api', imageId: newImage,
    repoDigest, runtimeCommit: commit };
  const health = { status: 'ok', checks: { listingAi: { status: 'enabled', provider: 'openai',
    model: 'gpt-4o-mini-2024-07-18', promptVersion: 'listing-ai-prompt-v1',
    schemaVersion: 'listing-ai-draft-v1', budgetCents: 250,
    externalProviderExecutionAllowed: true, automaticPublicationAllowed: false } } };
  fs.writeFileSync(greenFile, JSON.stringify(green), { mode: 0o600 });
  fs.writeFileSync(reportFile, JSON.stringify({ environment: 'staging', commit,
    stagingListingAi: true, stagingPilotId: 'heilbronn_wave0' }), { mode: 0o600 });
  fs.writeFileSync(healthFile, JSON.stringify(health), { mode: 0o600 });
  const key = `sk-proj-${'z'.repeat(32)}`;
  fs.writeFileSync(secretFile, `${key}\n`, { mode: 0o600 });
  fs.chmodSync(secretFile, 0o600);
  const container = { Id: newId, Name: '/shareittoo-staging-api', Image: newImage,
    State: { Running: true }, Config: { Image: 'ghcr.io/sit/api:tag', Labels: {
      'com.shareittoo.sit.green': 'true', 'org.opencontainers.image.revision': commit,
    } } };
  const image = { Id: newImage, RepoDigests: [repoDigest] };
  const execute = (_command, args) => args[0] === 'inspect' ? JSON.stringify(container)
    : JSON.stringify(image);
  const result = runStagingListingAiActivationReceiptCli([
    '--green-promotion-receipt', greenFile, '--deployment-report', reportFile,
    '--health-readback', healthFile, '--secret-file', secretFile, '--release-dir', root,
    '--run-id', 'cli-success', '--expected-commit', commit,
    '--rollback-container-id', oldId, '--rollback-image-id', oldImage,
    '--rollback-commit', commit, '--runtime-container-id', newId,
  ], { execute, now: () => new Date(now) });
  const receipt = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(result.mode, '0600');
  assert.equal(receipt.canonicalContainerId, newId);
  assert.equal(Object.hasOwn(receipt, 'capabilityReadbackSha256'), false);
  assert.doesNotMatch(`${JSON.stringify(receipt)} ${JSON.stringify(result)}`, new RegExp(key));
  assert.equal(fs.lstatSync(result.path).nlink, 1);
  let inspectCount = 0;
  const replacingRuntime = { ...container, Id: oldId, Name: '/replaced-container' };
  const executeRace = (_command, args) => {
    if (args[0] === 'inspect') {
      inspectCount += 1;
      return JSON.stringify(inspectCount === 1 ? container : replacingRuntime);
    }
    return JSON.stringify(image);
  };
  assert.throws(() => runStagingListingAiActivationReceiptCli([
    '--green-promotion-receipt', greenFile, '--deployment-report', reportFile,
    '--health-readback', healthFile, '--secret-file', secretFile, '--release-dir', root,
    '--run-id', 'cli-race', '--expected-commit', commit,
    '--rollback-container-id', oldId, '--rollback-image-id', oldImage,
    '--rollback-commit', commit, '--runtime-container-id', newId,
  ], { execute: executeRace, now: () => new Date(now) }), /staging_listing_ai_activation_receipt_invalid/u);
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.startsWith('staging-listing-ai-activation-')),
    ['staging-listing-ai-activation-cli-success.json']);
});
