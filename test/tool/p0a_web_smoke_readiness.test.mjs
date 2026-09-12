import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();
const repositoryRoot = resolve(import.meta.dirname, '../..');
const shellScript = readFileSync(
  resolve(repositoryRoot, 'scripts/p0a_web_smoke.sh'),
  'utf8',
);
const pythonScript = readFileSync(
  resolve(repositoryRoot, 'tool/run_p0a_web_smoke.py'),
  'utf8',
);
const pythonTool = resolve(repositoryRoot, 'tool/run_p0a_web_smoke.py');

function makeWebFixture({ manifestName = 'ShareItToo' } = {}) {
  const root = tempFixtures.makeSync('sit-p0a-web-smoke-');
  writeFileSync(resolve(root, 'index.html'), '<!doctype html><title>SIT</title>');
  writeFileSync(resolve(root, 'main.dart.js'), 'console.log("SIT");');
  writeFileSync(resolve(root, 'manifest.json'), JSON.stringify({ name: manifestName }));
  return root;
}

function runSmoke(root) {
  return spawnSync(
    'python3',
    [pythonTool, '--web-root', root, '--port', '0'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
}

test('binds an OS-selected loopback port before probing every artifact once', () => {
  const result = runSmoke(makeWebFixture());

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /P0A web smoke: PASS/u);
  assert.match(result.stdout, /loopback only, bound port [1-9][0-9]*/u);
  assert.equal(result.stderr, '');
});

test('fails closed when the served manifest is not the SIT manifest', () => {
  const result = runSmoke(makeWebFixture({ manifestName: 'Different app' }));

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /manifest does not identify ShareItToo/u);
});

test('locks one bind and one request per artifact without timing accommodations', () => {
  assert.match(shellScript, /P0A_WEB_SMOKE_PORT:-0/u);
  assert.match(shellScript, /exec python3 .*run_p0a_web_smoke\.py/su);
  assert.doesNotMatch(shellScript, /sleep|curl|\{1\.\.20\}|18765/u);

  assert.match(pythonScript, /ThreadingHTTPServer\(\("127\.0\.0\.1", requested_port\)/u);
  assert.match(pythonScript, /artifact: fetch_once\(base_url, artifact\)/u);
  assert.match(pythonScript, /for artifact in REQUIRED_ARTIFACTS/u);
  assert.match(pythonScript, /REQUEST_TIMEOUT_SECONDS = 10/u);
  assert.doesNotMatch(pythonScript, /sleep|retry/u);
});
