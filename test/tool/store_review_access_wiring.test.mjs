import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('release preflight validates review access and requires readiness in Store mode', () => {
  const source = read('scripts/release_candidate_preflight.sh');
  assert.match(source, /node --check tool\/diagnose_store_review_accounts\.mjs/);
  assert.match(source, /node --check tool\/validate_store_review_access\.mjs/);
  assert.match(source, /node tool\/validate_store_review_access\.mjs\n/);
  assert.match(
    source,
    /if \[\[ "\$\{SIT_REQUIRE_STORE_SUBMISSION:-0\}" == "1" \]\]; then[\s\S]*node tool\/validate_store_review_access\.mjs --require-ready/,
  );
  assert.ok(
    source.indexOf('node tool/validate_store_review_access.mjs --require-ready')
      < source.indexOf('dart run tool/validate_store_metadata.dart --require-submittable'),
  );
});

test('technical regression executes the review diagnostic tests and honest validator', () => {
  const source = read('scripts/technical_regression_check.sh');
  for (const command of [
    'node --check tool/diagnose_store_review_accounts.mjs',
    'node --test test/tool/diagnose_store_review_accounts.test.mjs',
    'node --check tool/validate_store_review_access.mjs',
    'node --test test/tool/validate_store_review_access.test.mjs',
    'node tool/validate_store_review_access.mjs',
  ]) assert.ok(source.includes(command));
});
