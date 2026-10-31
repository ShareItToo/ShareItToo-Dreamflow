import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments } from '../../tool/validate_green_staging_98_106_runtime.mjs';

const complete = ['binding', 'publication', 'target', 'config'].flatMap(n => [`--${n}`, `/private/synthetic/${n}.json`, `--${n}-sha256`, 'a'.repeat(64)]);
test('CLI defaults to plan and requires every independently bound protected input', () => {
  assert.equal(parseArguments(complete).mode, 'plan');
  for (const mode of ['validate', 'preflight']) assert.equal(parseArguments([...complete, '--mode', mode]).mode, mode);
  assert.throws(() => parseArguments([...complete, '--mode', 'execute']), /mode_invalid/u);
  for (const mode of ['rehearse', 'promote']) assert.throws(() => parseArguments([...complete, '--mode', mode]), /execution_inputs/u);
  for (const args of [[], complete.slice(2), [...complete, '--unknown', 'true'], [...complete, '--binding', '/duplicate'], [...complete, '--mode']]) {
    assert.throws(() => parseArguments(args));
  }
});
test('collector and separate mutation modes require their own complete explicit inputs', () => {
  const protectedRuntime = ['--private-runtime', '/private/synthetic/runtime.json', '--private-runtime-sha256', 'b'.repeat(64),
    '--evidence-directory', '/private/synthetic/evidence', '--confirm', 'explicit-bound-consent'];
  assert.equal(parseArguments([...complete, ...protectedRuntime, '--mode', 'rehearse']).mode, 'rehearse');
  assert.throws(() => parseArguments([...complete, ...protectedRuntime, '--mode', 'promote']), /promotion_inputs/u);
  assert.equal(parseArguments([...complete, ...protectedRuntime, '--mode', 'promote', '--rehearsal', '/private/synthetic/rehearsal.json',
    '--rehearsal-sha256', 'c'.repeat(64), '--backup', '/private/synthetic/backup.pgdump']).mode, 'promote');
  const collect = ['--mode', 'collect', '--publication', '/private/synthetic/publication.json', '--publication-sha256', 'a'.repeat(64),
    '--ops-commit', 'd'.repeat(40), '--evidence-directory', '/private/synthetic/evidence', '--acceptance-mfa-file', '/private/synthetic/mfa'];
  assert.equal(parseArguments(collect).mode, 'collect');
  assert.throws(() => parseArguments(collect.slice(0, -2)), /collector_inputs/u);
});
