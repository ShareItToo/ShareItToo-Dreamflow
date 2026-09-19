import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findingKey,
  parseReviewedHistoryBaseline,
  partitionReviewedFindings,
} from '../ops/secret_scan_baseline.mjs';

const reviewedEntry = {
  rule: 'static_password_property',
  source: '0123456789abcdef0123456789abcdef01234567',
  file: 'test/synthetic_fixture.test.mjs',
  reason: 'Synthetic historical fixture removed from the current tree.',
};

test('accepts only exact immutable history findings', () => {
  const baseline = parseReviewedHistoryBaseline({
    schemaVersion: 1,
    reviewedFindings: [reviewedEntry],
  });
  const exact = findingKey(reviewedEntry);
  const differentCommit = findingKey({ ...reviewedEntry, source: 'f'.repeat(40) });
  const { reviewed, unexpected } = partitionReviewedFindings(
    [exact, differentCommit],
    baseline,
  );

  assert.deepEqual(reviewed, [exact]);
  assert.deepEqual(unexpected, [differentCommit]);
});

test('never permits a working-tree finding through the history baseline', () => {
  const baseline = new Set([
    findingKey({ ...reviewedEntry, source: 'working-tree' }),
  ]);
  const workingFinding = findingKey({ ...reviewedEntry, source: 'working-tree' });
  assert.deepEqual(partitionReviewedFindings([workingFinding], baseline), {
    reviewed: [],
    unexpected: [workingFinding],
  });
});

test('rejects mutable, duplicate, or unexplained baseline entries', () => {
  assert.throws(
    () => parseReviewedHistoryBaseline({ schemaVersion: 1, reviewedFindings: [
      { ...reviewedEntry, source: 'working-tree' },
    ] }),
    /immutable 40-character commit SHA/,
  );
  assert.throws(
    () => parseReviewedHistoryBaseline({ schemaVersion: 1, reviewedFindings: [
      reviewedEntry,
      reviewedEntry,
    ] }),
    /duplicates a reviewed finding/,
  );
  assert.throws(
    () => parseReviewedHistoryBaseline({ schemaVersion: 1, reviewedFindings: [
      { ...reviewedEntry, reason: 'short' },
    ] }),
    /meaningful reason/,
  );
});
