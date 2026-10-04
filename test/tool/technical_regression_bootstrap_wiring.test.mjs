import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('technical regression bootstraps locked Flutter metadata before Node inventory', () => {
  const dependencyBootstrap = regression.indexOf('flutter pub get --enforce-lockfile');
  const completeToolInventory = regression.indexOf('node --test test/tool/*.test.mjs');

  assert.notEqual(dependencyBootstrap, -1);
  assert.notEqual(completeToolInventory, -1);
  assert.ok(dependencyBootstrap < completeToolInventory);
});
