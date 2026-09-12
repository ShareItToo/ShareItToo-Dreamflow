import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const transactionalSources = [
  '../src/booking_group_handover_workflow.js',
  '../src/booking_workflow.js',
  '../src/compliance_review.js',
  '../src/moderation_workflow.js',
  '../src/privacy_export.js',
  '../src/rental_cart_workflow.js',
];

test('single-client transactional workflows never start Promise.all query batches', async () => {
  for (const relativePath of transactionalSources) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Promise\.all\s*\(/u, relativePath);
  }
});

test('the canonical PostgreSQL integration turns deprecations into failures', async () => {
  const runner = await readFile(
    new URL('../../tool/run_local_postgres_integration.mjs', import.meta.url),
    'utf8',
  );
  assert.match(
    runner,
    /await checkedRun\(nodeBin, \[\s*'--throw-deprecation',\s*'--import'/u,
  );
  assert.equal(runner.match(/'--throw-deprecation'/gu)?.length, 1);
});
