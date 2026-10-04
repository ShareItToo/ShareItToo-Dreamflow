import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const integrationSource = fs.readFileSync(
  path.resolve(currentDirectory, 'postgres_foundation.integration.test.js'),
  'utf8',
);

test('monolithic PostgreSQL scenarios isolate limiter state without source rotation', () => {
  assert.match(
    integrationSource,
    /const restartApplicationServer = async \(\) => \{[\s\S]+?server\.close[\s\S]+?createApp\(applicationOptions\)/u,
  );
  assert.ok(
    (integrationSource.match(/await restartApplicationServer\(\);/gu) ?? []).length >= 10,
  );
  assert.equal(
    (integrationSource.match(/'X-Forwarded-For'/gu) ?? []).length,
    1,
  );
  assert.doesNotMatch(integrationSource, /198\.51\.100|203\.0\.113|RequestIp|forwardedFor/u);
});

test('the sole multi-source scenario is the explicit distributed account-lock attack', () => {
  assert.match(
    integrationSource,
    /const distributedEmailLogin[\s\S]+?'X-Forwarded-For': sourceAddress[\s\S]+?SIT distributed credential attack integration test/u,
  );
  assert.match(
    integrationSource,
    /for \(let attempt = 0; attempt < 10; attempt \+= 1\)[\s\S]+?distributedEmailLogin[\s\S]+?`203\.0\.114\.\$\{attempt \+ 1\}`/u,
  );
  assert.match(
    integrationSource,
    /await restartApplicationServer\(\);\s+const limitedAttempts = \[\]/u,
  );
});
