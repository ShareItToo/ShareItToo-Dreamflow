import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');
const validator = readFileSync(
  new URL('../../tool/validate_flutter_analyzer_debt.mjs', import.meta.url),
  'utf8',
);

test('locks the exact Flutter analyzer backlog instead of accepting a ceiling', () => {
  assert.match(script, /validate_flutter_analyzer_debt\.mjs --log "\$analyze_log"/u);
  assert.doesNotMatch(script, /issue_count > ANALYZER_BASELINE/u);
  assert.doesNotMatch(script, /Analyzer improvement detected/u);
  assert.match(validator, /snapshot\.total !== baseline\.total/u);
  assert.match(validator, /snapshot\.fingerprintSha256 !== baseline\.fingerprintSha256/u);
  assert.match(validator, /ratchet the committed baseline/u);
  assert.match(validator, /No issues found!/u);
  assert.match(script, /No issues found!/u);
});

test('rejects reintroduction of cleared correctness analyzer codes', () => {
  for (const code of [
    'dead_code',
    'empty_catches',
    'equal_keys_in_map',
    'unreachable_switch_default',
    'unused_import',
    'unused_local_variable',
  ]) {
    assert.match(script, new RegExp(`^  ${code}$`, 'm'));
  }
  assert.match(script, /Analyzer correctness regression detected/);
});

test('uses standard Flutter parallelism unless diagnostics explicitly override it', () => {
  assert.match(script, /SIT_FLUTTER_TEST_CONCURRENCY:-}/);
  assert.match(script, /flutter test --reporter expanded\nfi/);
  assert.doesNotMatch(script, /SIT_FLUTTER_TEST_CONCURRENCY:-1/);
  assert.match(script, /serial execution is not[\s\S]*release readiness/);
});
