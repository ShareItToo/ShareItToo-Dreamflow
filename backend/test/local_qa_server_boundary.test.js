import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const backendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(backendRoot);
const config = readFileSync(resolve(backendRoot, 'src/config.js'), 'utf8');
const server = readFileSync(resolve(backendRoot, 'src/server.js'), 'utf8');
const runner = readFileSync(resolve(
  repositoryRoot,
  'tool/run_android_local_qa_backend.mjs',
), 'utf8');

test('server binding is explicit and the local QA harness binds only loopback', () => {
  assert.match(config, /BIND_HOST/u);
  assert.match(config, /\['0\.0\.0\.0', '127\.0\.0\.1', '::1'\]/u);
  assert.match(server, /server\.listen\(config\.port, config\.bindHost/u);
  assert.match(runner, /BIND_HOST: '127\.0\.0\.1'/u);
  assert.match(runner, /server\.listen\(port, '127\.0\.0\.1'/u);
});

test('local QA harness stays ephemeral, mock-only and zero-billing', () => {
  for (const marker of [
    "DEPLOYMENT_ENVIRONMENT: 'test'",
    "SIT_LISTING_AI_PROVIDER: 'mock'",
    "SIT_LISTING_AI_BUDGET_CENTS: '0'",
    "SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true'",
    "PAYMENT_TRANSPORT: 'memory'",
    "STRIPE_LIVEMODE: 'false'",
    "FIREBASE_AUTH_ENABLED: 'false'",
    "PUBLIC_COMPLIANCE_APPROVED: 'false'",
  ]) {
    assert.match(runner, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\), tempPrefix\)\)/u);
  assert.match(runner, /rmSync\(runRoot, \{ recursive: true, force: true \}\)/u);
  assert.match(runner, /transientCredentialsOwnerOnly: true/u);
  assert.match(runner, /containsCredentials: false/u);
  assert.doesNotMatch(runner, /OPENAI_API_KEY|CODEX_API_KEY/u);
  assert.match(server, /createLocalQaSyntheticImageScreeningOptions/u);
});

test('ADB reverse and transient credentials are removed on shutdown', () => {
  assert.match(runner, /'reverse',\s*\n\s*'--remove'/u);
  assert.match(runner, /if \(sessionPath\) rmSync\(sessionPath, \{ force: true \}\)/u);
  assert.match(runner, /chmodSync\(directory, 0o700\)/u);
  assert.match(runner, /constants\.O_EXCL/u);
  assert.match(runner, /constants\.O_NOFOLLOW/u);
  assert.doesNotMatch(runner, /existsSync\(path\)/u);
  assert.match(runner, /waitForUnexpectedExit\(backendChild\)/u);
  assert.match(runner, /waitForChildClose\(child, 12_000\)/u);
  assert.match(runner, /child\.kill\('SIGKILL'\)/u);
  assert.match(runner, /waitForChildClose\(child, 5_000\)/u);
  assert.match(runner, /server\.closeIdleConnections\?\.\(\)/u);
  assert.match(runner, /server\.closeAllConnections\?\.\(\)/u);
  assert.match(runner, /Local QA API proxy termination deadline expired\./u);
});
