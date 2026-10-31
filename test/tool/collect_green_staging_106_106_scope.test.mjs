import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArguments,
} from '../../tool/collect_green_staging_106_106_scope.mjs';

const explicitArgs = [
  '--runtime-commit', '7'.repeat(40),
  '--api-container-name', 'sit-api',
  '--database-container-name', 'sit-db',
  '--internal-network-name', 'green-internal',
  '--external-network-name', 'provider-egress',
  '--uploads-volume-name', 'green-uploads',
  '--database-user', 'shareittoo_green',
  '--database-name', 'shareittoo_green',
  '--evidence-directory', '/tmp/sit-green-evidence',
  '--output-name', 'scope.json',
];

test('scope collector CLI requires the complete explicit identity surface', () => {
  const parsed = parseArguments(explicitArgs);

  assert.equal(parsed.runtimeCommit, '7'.repeat(40));
  assert.equal(parsed.apiContainerName, 'sit-api');
  assert.equal(parsed.outputName, 'scope.json');
  assert.throws(() => parseArguments(explicitArgs.slice(0, -2)), /green_106_106_scope_arguments/u);
  assert.throws(() => parseArguments([...explicitArgs, '--runtime-commit', '8'.repeat(40)]),
    /green_106_106_scope_arguments/u);
});
