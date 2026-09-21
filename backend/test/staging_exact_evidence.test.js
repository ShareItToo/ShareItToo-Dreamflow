import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { serializeExactEvidence } from '../ops/staging_exact_evidence.mjs';

test('Stripe readback evidence uses one exact serialized byte snapshot', () => {
  const evidence = { status: 'complete', synthetic: true, count: 2 };
  const result = serializeExactEvidence(evidence);
  const expected = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  assert.deepEqual(result.bytes, expected);
  assert.equal(result.byteCount, expected.byteLength);
  assert.equal(result.sha256, crypto.createHash('sha256').update(expected).digest('hex'));
});

test('backup evidence contracts keep verified input bytes out of diagnosis and Stripe evidence', async () => {
  for (const path of ['staging_disposable_diagnosis.mjs', 'staging_stripe_test_readback.mjs']) {
    const source = await readFile(new URL(`../ops/${path}`, import.meta.url), 'utf8');
    assert.match(source, /const \{ input: backupInput, \.\.\.backup \} = await verifyBackup\(\)/u, path);
    assert.match(source, /input: backupInput/u, path);
    assert.doesNotMatch(source, /backup\.input/u, path);
  }
});
