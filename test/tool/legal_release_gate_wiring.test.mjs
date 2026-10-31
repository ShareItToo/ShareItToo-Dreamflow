import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

function read(path) {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

test('release preflight always validates the legal draft and requires approval for Store mode', () => {
  const source = read('scripts/release_candidate_preflight.sh');
  assert.match(source, /node --check tool\/validate_legal_readiness\.mjs/);
  assert.match(source, /node tool\/validate_legal_readiness\.mjs\n/);
  assert.match(
    source,
    /if \[\[ "\$\{SIT_REQUIRE_STORE_SUBMISSION:-0\}" == "1" \]\]; then[\s\S]*node tool\/validate_legal_readiness\.mjs --require-approved/,
  );
  assert.ok(
    source.indexOf('node tool/validate_legal_readiness.mjs --require-approved')
      < source.indexOf('dart run tool/validate_store_metadata.dart --require-submittable'),
  );
  assert.match(
    source,
    /Store submission requires an explicitly approved legal provider identity/,
  );
  for (const field of [
    'SIT_LEGAL_PROVIDER_NAME',
    'SIT_LEGAL_PROVIDER_ADDRESS',
    'SIT_LEGAL_REPRESENTATIVE',
    'SIT_LEGAL_CONTENT_RESPONSIBLE',
    'SIT_LEGAL_CONTACT_EMAIL',
  ]) {
    assert.ok(source.includes(field));
  }
});

test('Android release builder injects legal identity only through explicit build values', () => {
  const source = read('scripts/build_android_release_candidate.sh');
  for (const field of [
    'SIT_LEGAL_PROVIDER_APPROVED',
    'SIT_LEGAL_PROVIDER_NAME',
    'SIT_LEGAL_PROVIDER_ADDRESS',
    'SIT_LEGAL_REPRESENTATIVE',
    'SIT_LEGAL_CONTENT_RESPONSIBLE',
    'SIT_LEGAL_CONTACT_EMAIL',
    'SIT_LEGAL_CONTACT_PHONE',
  ]) {
    assert.ok(source.includes(field));
  }
  assert.doesNotMatch(source, /ShareItToo GmbH/);
});

test('technical regression runs syntax, tests, and the honest legal draft validator', () => {
  const source = read('scripts/technical_regression_check.sh');
  for (const command of [
    'node --check tool/validate_legal_readiness.mjs',
    'node --test test/tool/validate_legal_readiness.test.mjs',
    'node tool/validate_legal_readiness.mjs',
  ]) {
    assert.ok(source.includes(command));
  }
});

test('both changed shell entrypoints remain valid Bash', () => {
  for (const path of [
    'scripts/build_android_release_candidate.sh',
    'scripts/release_candidate_preflight.sh',
    'scripts/technical_regression_check.sh',
  ]) {
    const result = spawnSync('bash', ['-n', resolve(repositoryRoot, path)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  }
});
