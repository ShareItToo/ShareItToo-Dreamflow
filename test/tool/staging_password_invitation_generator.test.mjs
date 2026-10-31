import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('secure offline invitation generator: filesystem negatives and real resolver compatibility', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const result = spawnSync('python3', ['-B', 'test/tool/staging_password_invitation_generator_test.py', '-v'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 16 tests/u);
  assert.equal(result.stdout, '');
});
