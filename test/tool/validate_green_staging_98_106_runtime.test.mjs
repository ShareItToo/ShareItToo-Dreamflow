import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments } from '../../tool/validate_green_staging_98_106_runtime.mjs';

const complete = ['binding', 'publication', 'target', 'config'].flatMap(n => [`--${n}`, `/private/synthetic/${n}.json`, `--${n}-sha256`, 'a'.repeat(64)]);
test('CLI defaults to plan and requires every independently bound protected input', () => {
  assert.equal(parseArguments(complete).mode, 'plan');
  for (const mode of ['validate', 'preflight']) assert.equal(parseArguments([...complete, '--mode', mode]).mode, mode);
  for (const mode of ['execute', 'rehearse', 'promote']) assert.throws(() => parseArguments([...complete, '--mode', mode]), /mutation_adapter_not_implemented/u);
  for (const args of [[], complete.slice(2), [...complete, '--unknown', 'true'], [...complete, '--binding', '/duplicate'], [...complete, '--mode']]) {
    assert.throws(() => parseArguments(args));
  }
});
