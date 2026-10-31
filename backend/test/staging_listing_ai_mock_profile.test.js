import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import os from 'node:os';
import { assertStagingMockListingAiProfile } from '../ops/staging_listing_ai_mock_profile.mjs';

const backendRoot = resolve(import.meta.dirname, '..');
const greenProfile = () => ({ DEPLOYMENT_ENVIRONMENT: 'test',
  SIT_STAGING_COMPOSE_PROJECT: 'sit-green', SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
  SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: 'synthetic-private-user',
  SIT_STAGING_LISTING_AI_PROFILE: 'staging-mock-v1', SIT_LISTING_AI_PROVIDER: 'mock',
  SIT_LISTING_AI_MODEL: 'listing-ai-mock-v1', SIT_LISTING_AI_BUDGET_CENTS: '0',
  SIT_LISTING_AI_STAGING_SMOKE_BUDGET_CENTS: '0', SIT_LISTING_AI_STAGING_SMOKE_ACTIVATION_ID: '',
  SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', OPENAI_API_KEY: '', OPENAI_API_KEY_FILE: '' });

test('mock profile is bound only to private sit-green with synthetic zero-cost execution', () => {
  assert.deepEqual(assertStagingMockListingAiProfile(greenProfile(), { deploymentEnvironment: 'test' }), {
    profile: 'staging-mock-v1', provider: 'mock', model: 'listing-ai-mock-v1', budgetCents: 0,
    stagingSmokeBudgetCents: 0, stagingSmokeActivationId: null, externalProviderExecutionAllowed: false,
    automaticPublicationAllowed: false, productionEligible: false, syntheticOnly: true,
  });
  for (const [name, value] of [
    ['DEPLOYMENT_ENVIRONMENT', 'production'], ['DEPLOYMENT_ENVIRONMENT', 'staging'],
    ['SIT_STAGING_COMPOSE_PROJECT', 'sit-staging'], ['SIT_STAGING_COMPOSE_PROJECT', 'production'],
    ['SIT_STAGING_PILOT_ID', ''], ['SIT_STAGING_ACCESS_GATE_ENABLED', 'false'],
    ['SIT_STAGING_ALLOWED_USER_IDS', ''], ['SIT_LISTING_AI_PROVIDER', 'openai'],
    ['SIT_LISTING_AI_MODEL', 'other'], ['SIT_LISTING_AI_BUDGET_CENTS', '1'],
    ['SIT_LISTING_AI_STAGING_SMOKE_BUDGET_CENTS', '1'],
    ['SIT_LISTING_AI_STAGING_SMOKE_ACTIVATION_ID', '11111111-1111-4111-8111-111111111111'],
    ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'], ['OPENAI_API_KEY', 'secret'],
    ['OPENAI_API_KEY_FILE', '/secret'], ['SIT_STAGING_LISTING_AI_PROFILE', ''],
  ]) assert.throws(() => assertStagingMockListingAiProfile({ ...greenProfile(), [name]: value }), undefined, name);
  const { SIT_STAGING_COMPOSE_PROJECT: omitted, ...withoutProject } = greenProfile();
  void omitted;
  assert.throws(() => assertStagingMockListingAiProfile(withoutProject));
});

test('legacy deploy_release mock flag fails closed before any deploy command', async () => {
  const deployPath = resolve(backendRoot, 'ops/deploy_release.sh');
  const deploy = await readFile(deployPath, 'utf8');
  const guard = deploy.indexOf('The legacy deploy_release staging lane cannot target Green');
  assert.ok(guard >= 0);
  assert.match(deploy, /The staging mock Listing AI override is forbidden for production deployments/u);

  const missingArgs = spawnSync('bash', [deployPath], { encoding: 'utf8' });
  assert.equal(missingArgs.status, 1);
  assert.match(missingArgs.stderr, /Usage:/u);
  const commit = 'a'.repeat(40);
  const directory = mkdtempSync(resolve(os.tmpdir(), 'sit-green-mock-legacy-block-'));
  const marker = resolve(directory, 'docker-called');
  writeFileSync(resolve(directory, 'docker'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  try {
  for (const environment of ['staging', 'production']) {
    const result = spawnSync('bash', [deployPath, environment, commit], {
      encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}`,
        ENABLE_STAGING_LISTING_AI_MOCK: '1' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, environment === 'production' ? /forbidden for production/u : /cannot target Green/u);
  }
  assert.equal(existsSync(marker), false, 'legacy mock rejection occurs before Docker');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
