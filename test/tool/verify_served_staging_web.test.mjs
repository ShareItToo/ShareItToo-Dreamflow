import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sealArtifact, TARGET } from '../../tool/staging_web_contract.mjs';
import { parseServedWebReadbackArgs, verifyServedStagingWeb } from '../../tool/verify_served_staging_web.mjs';

const sourceCommit = 'a'.repeat(40);
const buildVersion = '1.0.0+20261031';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-served-web-readback-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifact = path.join(root, 'sealed-artifact');
  fs.mkdirSync(path.join(artifact, 'web'), { recursive: true });
  for (const [name, value] of Object.entries({
    'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compiled bytes',
    'manifest.json': '{"name":"synthetic"}',
    'flutter_bootstrap.js': 'flutter bootstrap bytes',
  })) fs.writeFileSync(path.join(artifact, 'web', name), value);
  const manifestSha256 = sealArtifact({ directory: artifact, source: sourceCommit,
    version: buildVersion, flutterVersion: { frameworkVersion: 'synthetic' }, builderDigest: 'b'.repeat(64) });
  const evidenceDir = path.join(root, 'evidence');
  fs.mkdirSync(evidenceDir, { mode: 0o700 }); fs.chmodSync(evidenceDir, 0o700);
  return { root, artifact, manifestSha256, evidenceDir };
}

function servedFetch({ artifact, calls, mutate = null }) {
  return async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    assert.equal(parsed.origin, TARGET);
    assert.equal(parsed.searchParams.get('artifact'), artifact.manifestSha256);
    assert.equal(parsed.searchParams.getAll('artifact').length, 1);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['accept-encoding'], 'identity');
    const name = parsed.pathname.slice(1);
    const body = fs.readFileSync(path.join(artifact.artifact, 'web', name));
    const response = new Response(mutate ? mutate(name, body) : body, { status: 200 });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
}

function args(f) {
  return { artifact: f.artifact, manifestSha256: f.manifestSha256,
    sourceCommit, evidenceDir: f.evidenceDir };
}

async function rejectsWithoutReceipt(f, fetchImpl, expectedCalls = 1) {
  const calls = [];
  await assert.rejects(verifyServedStagingWeb(args(f), { fetchImpl: async (...values) => {
    calls.push(values); return fetchImpl(...values);
  } }), { message: 'served_web_readback_refused' });
  assert.equal(calls.length, expectedCalls);
  assert.deepEqual(fs.readdirSync(f.evidenceDir), []);
}

test('read-only served readback validates current artifact and writes one protected secret-free receipt', async (t) => {
  const f = fixture(t); const calls = [];
  const result = await verifyServedStagingWeb(args(f), { fetchImpl: servedFetch({ artifact: f, calls }),
    now: new Date('2026-10-31T10:20:30.000Z') });
  assert.equal(result.status, 'served-web-readback-passed');
  assert.equal(calls.length, Object.keys(JSON.parse(fs.readFileSync(path.join(f.artifact, 'staging-web-manifest.json'))).files).length);
  const receiptBytes = fs.readFileSync(result.path);
  assert.equal(result.sha256, sha256(receiptBytes));
  const receiptStat = fs.lstatSync(result.path);
  assert.equal(receiptStat.mode & 0o7777, 0o600);
  assert.equal(receiptStat.nlink, 1);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.sourceCommit, sourceCommit);
  assert.equal(receipt.target, TARGET);
  assert.equal(receipt.profileDigest, JSON.parse(fs.readFileSync(path.join(f.artifact, 'web/staging-release.json'))).profileDigest);
  assert.equal(receipt.fileCount, calls.length);
  assert.equal(receipt.readbacks.every(row => row.httpStatus === 200 && /^[a-f0-9]{64}$/u.test(row.sha256)), true);
  assert.deepEqual(fs.readdirSync(f.artifact).sort(), ['SHA256SUMS', 'staging-web-manifest.json', 'web']);
  assert.equal(fs.readdirSync(f.evidenceDir).length, 1);
});

test('rejects redirects without following or retrying', async (t) => {
  const f = fixture(t);
  await rejectsWithoutReceipt(f, async (url) => {
    const response = new Response('redirect', { status: 302, headers: { location: 'https://other.invalid/' } });
    Object.defineProperty(response, 'url', { value: url }); return response;
  });
});

test('rejects HTTP 404 and never retries the same file', async (t) => {
  const f = fixture(t);
  await rejectsWithoutReceipt(f, async (url) => {
    const response = new Response('missing', { status: 404 });
    Object.defineProperty(response, 'url', { value: url }); return response;
  });
});

test('rejects served body drift', async (t) => {
  const f = fixture(t); const calls = [];
  const fetchImpl = servedFetch({ artifact: f, calls, mutate: (_name, body) => Buffer.concat([body, Buffer.from('drift')]) });
  await rejectsWithoutReceipt(f, fetchImpl);
});

test('rejects unmanifested static files before any request', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.artifact, 'web/unexpected.js'), 'not in manifest');
  await rejectsWithoutReceipt(f, async () => { throw Error('must not fetch'); }, 0);
});

test('rejects failed first response without retry and CLI does not accept a retry option', async (t) => {
  const f = fixture(t); let attempts = 0;
  await rejectsWithoutReceipt(f, async (url) => {
    attempts++;
    const response = new Response('temporary failure', { status: attempts === 1 ? 503 : 200 });
    Object.defineProperty(response, 'url', { value: url }); return response;
  });
  assert.equal(attempts, 1);
  assert.throws(() => parseServedWebReadbackArgs([
    '--artifact', f.artifact, '--manifest-sha256', f.manifestSha256,
    '--source-commit', sourceCommit, '--evidence-dir', f.evidenceDir, '--retries', '1',
  ]), { message: 'served_web_readback_refused' });
});
