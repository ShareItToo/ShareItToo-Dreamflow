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
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-listing-ai-test-'));
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
  printf '%s\\n' '2026-09-03T00:00:00Z'
else
  exit 97
fi
`, { mode: 0o700 });
  await chmod(docker, 0o700);
  return { root, capture };
}

test('production rejects the Staging listing-AI flag before invoking Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'production', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      ENABLE_STAGING_LISTING_AI: '1',
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /staging listing-AI override is forbidden for production/u);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('Staging listing-AI requires the exact commit confirmation before Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      ENABLE_STAGING_LISTING_AI: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_LISTING_AI: 'b'.repeat(40),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must equal the exact deployment commit/u);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('Staging listing-AI validates its private key before Compose can run', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      NODE_BINARY: process.execPath,
      ENABLE_STAGING_LISTING_AI: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_LISTING_AI: commit,
      SIT_LISTING_AI_MODEL: 'gpt-4o-mini-2024-07-18',
      SIT_LISTING_AI_BUDGET_CENTS: '5',
      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
      OPENAI_API_KEY_HOST_FILE: join(fixture.root, 'missing-secret'),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OpenAI Staging secret gate failed/u);
  const calls = await readFile(fixture.capture, 'utf8');
  assert.equal(calls.includes(' compose '), false);
  assert.equal(calls.split('\n').filter(Boolean).length, 3);
});

test('deployment source keeps listing-AI opt-in, bounded and sanitized', async () => {
  const [deploy, overlay, app] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(join(backendRoot, 'compose.staging.listing-ai.yml'), 'utf8'),
    readFile(join(backendRoot, 'src', 'app.js'), 'utf8'),
  ]);
  assert.match(deploy, /ENABLE_STAGING_LISTING_AI:-0/u);
  assert.match(deploy, /CONFIRM_STAGING_LISTING_AI/u);
  assert.match(deploy, /task_listing_ai_budget_cents < 2/u);
  assert.match(deploy, /task_listing_ai_budget_cents > 500/u);
  assert.match(deploy, /SIT_LISTING_AI_PROVIDER: mock/u);
  assert.match(deploy, /Staging listing-AI health does not confirm/u);
  assert.equal((deploy.match(/payload\?\.checks\?\.listingAi/gu) ?? []).length, 2);
  assert.doesNotMatch(deploy, /payload\?\.listingAi/u);
  assert.match(deploy, /boundary\.provider === "on_device"/u);
  assert.match(deploy, /boundary\.budgetCents === 0/u);
  assert.match(deploy, /boundary\.externalProviderExecutionAllowed === false/u);
  assert.match(deploy, /task_rollback_compose_args/u);
  assert.match(
    deploy,
    /task_compose_args\[\$\(\(task_compose_index \+ 1\)\)\].*compose\.staging\.listing-ai\.yml/su,
  );
  assert.match(
    deploy,
    /--env-file "\$task_env_file" "\$\{task_rollback_compose_args\[@\]\}"/u,
  );
  assert.match(overlay, /OPENAI_API_KEY: ""/u);
  assert.match(overlay, /OPENAI_API_KEY_FILE: \/run\/secrets\/openai-api-key/u);
  assert.match(overlay, /read_only: true/u);
  assert.match(overlay, /create_host_path: false/u);
  assert.doesNotMatch(overlay, /sk-(?:proj-)?[A-Za-z0-9_-]{16}/u);
  assert.match(app, /const listingAiHealth = Object\.freeze\(\{/u);
  assert.match(app, /status: config\.listingAi\.enabled \? 'enabled' : 'disabled'/u);
  assert.match(app, /provider: config\.listingAi\.provider/u);
  assert.match(app, /model: config\.listingAi\.model/u);
  assert.match(app, /promptVersion: config\.listingAi\.promptVersion/u);
  assert.match(app, /schemaVersion: config\.listingAi\.schemaVersion/u);
  assert.match(app, /budgetCents: config\.listingAi\.budgetCents/u);
  assert.match(app, /externalProviderExecutionAllowed: config\.listingAi\.externalProviderExecutionAllowed/u);
  assert.match(app, /automaticPublicationAllowed: false/u);
  assert.equal((app.match(/listingAi: listingAiHealth/gu) ?? []).length, 2);
  assert.doesNotMatch(
    app.slice(app.indexOf('const listingAiHealth'), app.indexOf('const paymentProviderHealth')),
    /(?:apiKey|credential|secret|OPENAI_API_KEY)/u,
  );
});
