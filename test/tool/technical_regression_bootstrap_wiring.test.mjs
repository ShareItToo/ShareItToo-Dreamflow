import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../../.github/workflows/regression.yml', import.meta.url), 'utf8',
);

test('technical regression bootstraps locked Flutter metadata before Node inventory', () => {
  const dependencyBootstrap = regression.indexOf('flutter pub get --enforce-lockfile');
  const completeToolInventory = regression.indexOf('node --test test/tool/*.test.mjs');

  assert.notEqual(dependencyBootstrap, -1);
  assert.notEqual(completeToolInventory, -1);
  assert.ok(dependencyBootstrap < completeToolInventory);
});

test('isolated Flutter CI installs the locked backend import graph before root Node discovery', () => {
  const start = workflow.indexOf('  flutter-regression:\n');
  const end = workflow.indexOf('  publish-api-image:\n', start);
  assert.ok(start >= 0 && end > start);
  const job = workflow.slice(start, end);
  const pnpmSetup = job.indexOf('uses: pnpm/action-setup@v6');
  const nodeSetup = job.indexOf('uses: actions/setup-node@v6');
  const install = job.indexOf('run: pnpm install --frozen-lockfile');
  const execute = job.indexOf('run: bash scripts/technical_regression_check.sh');
  assert.ok(pnpmSetup >= 0 && pnpmSetup < nodeSetup,
    'the isolated job must install the package-declared pnpm before Node cache setup');
  assert.match(job.slice(pnpmSetup, nodeSetup), /package_json_file: backend\/package\.json/u);
  assert.ok(nodeSetup < install && install < execute,
    'backend imports must resolve before the complete root Node test inventory runs');
  assert.match(job.slice(nodeSetup, install), /node-version: '22'/u);
  assert.match(job.slice(nodeSetup, install), /cache-dependency-path: backend\/pnpm-lock\.yaml/u);
  assert.match(job, /working-directory: backend\n\s+run: pnpm install --frozen-lockfile/u);
  assert.equal(job.match(/pnpm install --frozen-lockfile/gu)?.length, 1);
  assert.doesNotMatch(job, /--no-frozen-lockfile|continue-on-error|npm install pg|NODE_PATH/u);
  assert.match(regression, /^node --test test\/tool\/\*\.test\.mjs$/mu);
});
