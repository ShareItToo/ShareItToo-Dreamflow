import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { digest, equal } from '../../backend/ops/green_staging_98_106_contract.mjs';
import {
  executionPreflight,
  stagingMockListingAiValues,
} from '../../backend/ops/green_staging_106_106_preflight.mjs';
import {
  canonicalSuccessorSpec,
  runSuccessorPromotion,
} from '../../backend/ops/green_staging_106_106_promotion.mjs';
import {
  listingAiTransitionForSource,
  protectedEnvText,
} from '../../backend/ops/prepare_green_staging_106_106_execution_inputs.mjs';
import { inputs } from '../../backend/test/fixtures/green_106106_preflight.js';
import { promotionFixture } from '../../backend/test/fixtures/green_106106_promotion.js';

function setEnvironmentValue(entries, key, value) {
  return [...entries.filter(entry => !entry.startsWith(`${key}=`)), `${key}=${value}`];
}

test('execution-input preparation distinguishes first mock transition from exact mock preservation', async () => {
  const firstSource = await inputs({ listingAiMock: true });
  const preservedSource = await inputs({ listingAiMock: true, listingAiSourceMock: true });
  const firstEntries = firstSource.f.records[firstSource.f.binding.scope.api.id].Config.Env;
  const firstEnvSha = digest(protectedEnvText(firstEntries));
  const first = listingAiTransitionForSource(
    firstEntries,
    'staging-mock-v1',
    firstEnvSha,
  );
  const preservedEntries = preservedSource.f.records[preservedSource.f.binding.scope.api.id].Config.Env;
  const preservedEnv = protectedEnvText(preservedEntries);
  const preserved = listingAiTransitionForSource(
    preservedEntries,
    'staging-mock-v1',
    digest(preservedEnv),
  );

  assert.equal(first.from, 'on_device');
  assert.equal(first.to, 'staging-mock-v1');
  assert.equal(preserved.from, 'staging-mock-v1');
  assert.equal(preserved.to, 'staging-mock-v1');
  assert.deepEqual(Object.keys(stagingMockListingAiValues).sort(), [
    'OPENAI_API_KEY',
    'OPENAI_API_KEY_FILE',
    'SIT_LISTING_AI_BUDGET_CENTS',
    'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED',
    'SIT_LISTING_AI_MODEL',
    'SIT_LISTING_AI_PROVIDER',
    'SIT_LISTING_AI_STAGING_SMOKE_ACTIVATION_ID',
    'SIT_LISTING_AI_STAGING_SMOKE_BUDGET_CENTS',
    'SIT_STAGING_LISTING_AI_PROFILE',
  ]);
  assert.deepEqual(preservedSource.config.listingAiTransition, preserved);
  const firstPreflight = await executionPreflight(firstSource.data, firstSource.dependencies);
  assert.equal(firstPreflight.status, 'read_only_preflight_passed');
  assert.equal(firstPreflight.promotionAuthorized, false);
  const preflight = await executionPreflight(preservedSource.data, preservedSource.dependencies);
  assert.equal(preflight.status, 'read_only_preflight_passed');
  assert.equal(preflight.sourceEnvironmentSha256, digest(preservedEnv));
  assert.equal(preflight.promotionAuthorized, false);
});

test('the original on-device first-transition path still rehearses and promotes to the exact mock tuple', async () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-mock-first-'));
  fs.chmodSync(directory, 0o700);
  try {
    const state = await promotionFixture(directory, { listingAiMock: true });
    assert.equal(state.data.config.listingAiTransition.from, 'on_device');
    const promoted = await runSuccessorPromotion(state.data, state.options, state.dependencies);
    assert.equal(promoted.status, 'promoted_owner_smoke_pending');
    const canonicalId = state.caddyResolve()[0];
    const canonical = state.records[canonicalId];
    const canonicalEnv = Object.fromEntries(canonical.Config.Env.map(entry => {
      const at = entry.indexOf('='); return [entry.slice(0, at), entry.slice(at + 1)];
    }));
    assert.deepEqual(Object.fromEntries(Object.keys(stagingMockListingAiValues)
      .map(key => [key, canonicalEnv[key]])), stagingMockListingAiValues);
    assert.equal(state.records[state.source.Id].State.Running, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('mock-forward preparation rejects provider drift, nonzero budget and any OpenAI key', async () => {
  const state = await inputs({ listingAiMock: true, listingAiSourceMock: true });
  const source = state.f.records[state.f.binding.scope.api.id].Config.Env;
  const sourceSha = digest(protectedEnvText(source));
  for (const [key, value] of [
    ['SIT_LISTING_AI_MODEL', 'different-model'],
    ['SIT_LISTING_AI_BUDGET_CENTS', '1'],
    ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'],
    ['SIT_LISTING_AI_STAGING_SMOKE_BUDGET_CENTS', '1'],
    ['OPENAI_API_KEY', 'synthetic-not-a-secret'],
    ['OPENAI_API_KEY_FILE', '/run/secrets/openai-key'],
  ]) {
    assert.throws(
      () => listingAiTransitionForSource(setEnvironmentValue(source, key, value), 'staging-mock-v1', sourceSha),
    );
  }
});

test('canonical promotion preserves the exact mock profile and permits only image identity changes', async () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-mock-preserve-'));
  fs.chmodSync(directory, 0o700);
  try {
    const state = await promotionFixture(directory, {
      listingAiMock: true,
      listingAiSourceMock: true,
    });
    const built = canonicalSuccessorSpec(state.source, state.c.image, state.data);
    assert.equal(state.data.config.listingAiTransition.from, 'staging-mock-v1');
    assert.deepEqual(
      Object.fromEntries(Object.keys(stagingMockListingAiValues)
        .map(key => [key, built.spec.env[key]])),
      stagingMockListingAiValues,
    );
    const oldEnv = Object.fromEntries(state.source.Config.Env.map(entry => {
      const at = entry.indexOf('='); return [entry.slice(0, at), entry.slice(at + 1)];
    }));
    const changed = Object.keys({ ...oldEnv, ...built.spec.env }).filter(key => oldEnv[key] !== built.spec.env[key]);
    assert.ok(changed.length > 0);
    assert.ok(changed.every(key => ['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME'].includes(key)));

    for (const [key, value] of [
      ['SIT_LISTING_AI_MODEL', 'drifted-model'],
      ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'],
      ['OPENAI_API_KEY', 'synthetic-not-a-secret'],
    ]) {
      const drifted = structuredClone(state.source);
      drifted.Config.Env = setEnvironmentValue(drifted.Config.Env, key, value);
      assert.throws(() => canonicalSuccessorSpec(drifted, state.c.image, state.data));
    }
    assert.equal(equal(Object.fromEntries(Object.keys(stagingMockListingAiValues)
      .map(key => [key, built.spec.env[key]])), stagingMockListingAiValues), true);
    const promoted = await runSuccessorPromotion(state.data, state.options, state.dependencies);
    assert.equal(promoted.status, 'promoted_owner_smoke_pending');
    const canonicalId = state.caddyResolve()[0];
    const canonical = state.records[canonicalId];
    const canonicalEnv = Object.fromEntries(canonical.Config.Env.map(entry => {
      const at = entry.indexOf('='); return [entry.slice(0, at), entry.slice(at + 1)];
    }));
    assert.equal(state.records[state.source.Id].State.Running, false);
    assert.deepEqual(Object.fromEntries(Object.keys(stagingMockListingAiValues)
      .map(key => [key, canonicalEnv[key]])), stagingMockListingAiValues);
    assert.equal(canonical.Config.Env.includes('APP_COMMIT=' + state.data.binding.runtimeCommit), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
