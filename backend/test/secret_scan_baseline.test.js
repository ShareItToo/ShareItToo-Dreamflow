import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  findingKey,
  parseReviewedHistoryBaseline,
  partitionReviewedFindings,
} from '../ops/secret_scan_baseline.mjs';

const baseline = JSON.parse(fs.readFileSync(
  path.resolve(import.meta.dirname, '../ops/secret_scan_history_baseline.json'),
  'utf8',
));

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

test('reviews the historical Green fixed-path finding exactly once', () => {
  const matches = baseline.reviewedFindings.filter((entry) => (
    entry.rule === 'static_password_assignment'
    && entry.source === 'cbf23251cc11f4247297674aa77a340152a5a59e'
    && entry.file === 'backend/ops/green_staging_promotion.mjs'
  ));
  assert.deepEqual(matches, [{
    rule: 'static_password_assignment',
    source: 'cbf23251cc11f4247297674aa77a340152a5a59e',
    file: 'backend/ops/green_staging_promotion.mjs',
    reason: 'Historical finding was a fixed host path, not a credential value; the current tree uses a neutral credential-file name.',
  }]);
});
