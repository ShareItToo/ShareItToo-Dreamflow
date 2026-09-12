import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const backendRoot = resolve(import.meta.dirname, '..');
const deployScript = join(backendRoot, 'ops', 'deploy_release.sh');
const commit = 'a'.repeat(40);

async function dockerFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-stripe-test-'));
  const docker = join(root, 'docker');
  const capture = join(root, 'docker-calls.txt');
  await writeFile(docker, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$DOCKER_CAPTURE"
if [[ "$*" == *org.opencontainers.image.revision* ]]; then
  printf '%s\\n' "$MOCK_COMMIT"
elif [[ "$*" == *org.opencontainers.image.version* ]]; then
  printf '%s\\n' '0.1.0-test'
elif [[ "$*" == *org.opencontainers.image.created* ]]; then
  printf '%s\\n' '2026-09-05T00:00:00Z'
else
  exit 97
fi
`, { mode: 0o700 });
  await chmod(docker, 0o700);
  return { root, capture };
}

test('production rejects the Staging Stripe flag before invoking Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'production', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      ENABLE_STAGING_STRIPE: '1',
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /staging Stripe override is forbidden for production/u);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('Staging Stripe requires the exact commit confirmation before Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      ENABLE_STAGING_STRIPE: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_STRIPE: 'b'.repeat(40),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CONFIRM_STAGING_STRIPE must equal the exact deployment commit/u);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('Staging Stripe validates private files before Compose can run', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      NODE_BINARY: process.execPath,
      ENABLE_STAGING_STRIPE: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_STRIPE: commit,
      STRIPE_SECRET_KEY_HOST_FILE: join(fixture.root, 'missing-key'),
      STRIPE_WEBHOOK_SECRET_HOST_FILE: join(fixture.root, 'missing-webhook'),
      STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE: join(fixture.root, 'missing-connect-webhook'),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stripe Staging secret gate failed/u);
  const calls = await readFile(fixture.capture, 'utf8');
  assert.equal(calls.includes(' compose '), false);
  assert.equal(calls.split('\n').filter(Boolean).length, 3);
});

test('deployment source keeps Stripe Staging opt-in, file-only, test-only and sanitized', async () => {
  const [deploy, overlay, config, secretFiles, app, workflow] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(join(backendRoot, 'compose.staging.stripe.yml'), 'utf8'),
    readFile(join(backendRoot, 'src', 'config.js'), 'utf8'),
    readFile(join(backendRoot, 'src', 'stripe_secret_files.js'), 'utf8'),
    readFile(join(backendRoot, 'src', 'app.js'), 'utf8'),
    readFile(resolve(backendRoot, '..', '.github', 'workflows', 'regression.yml'), 'utf8'),
  ]);
  assert.match(deploy, /ENABLE_STAGING_STRIPE:-0/u);
  assert.match(deploy, /CONFIRM_STAGING_STRIPE/u);
  assert.match(deploy, /validate_stripe_staging_secrets\.mjs/u);
  assert.match(deploy, /Staging Stripe health does not confirm/u);
  assert.match(deploy, /PAYMENT_TRANSPORT: memory/u);
  assert.match(overlay, /PAYMENT_TRANSPORT: stripe/u);
  assert.match(overlay, /STRIPE_LIVEMODE: "false"/u);
  for (const name of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
  ]) assert.match(overlay, new RegExp(`${name}: ""`, 'u'));
  for (const target of [
    '/run/secrets/stripe-secret-key',
    '/run/secrets/stripe-webhook-secret',
    '/run/secrets/stripe-connect-webhook-secret',
  ]) assert.match(overlay, new RegExp(target, 'u'));
  assert.equal((overlay.match(/read_only: true/gu) ?? []).length, 3);
  assert.equal((overlay.match(/create_host_path: false/gu) ?? []).length, 3);
  assert.doesNotMatch(overlay, /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/u);
  assert.match(config, /readStripeSecretConfiguration/u);
  assert.match(secretFiles, /Stripe Staging transport requires file credentials/u);
  assert.match(app, /const paymentProviderHealth = Object\.freeze\(\{/u);
  assert.equal((app.match(/paymentProvider: paymentProviderHealth/gu) ?? []).length, 2);
  assert.doesNotMatch(
    app.slice(app.indexOf('const paymentProviderHealth'), app.indexOf('const attemptFirebaseIdentityDeletion')),
    /(?:secretKey|webhookSecret|credentialPresent)/u,
  );
  assert.match(workflow, /-f compose\.staging\.stripe\.yml/u);
  for (const name of [
    'STRIPE_SECRET_KEY_HOST_FILE',
    'STRIPE_WEBHOOK_SECRET_HOST_FILE',
    'STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE',
  ]) assert.match(workflow, new RegExp(`${name}: /run/shareittoo-ci/`, 'u'));
});
