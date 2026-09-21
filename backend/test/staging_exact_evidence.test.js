import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
