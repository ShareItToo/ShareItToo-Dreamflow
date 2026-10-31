import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN18PixelTwoRoleNonBindingTruth,
} from '../../tool/validate_n18_pixel_two_role_non_binding_truth.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n18-pixel-two-role-non-binding-truth-2026090305.json',
), 'utf8'));

test('accepts the sanitized N18 Pixel two-role evidence', () => {
  assert.equal(validateN18PixelTwoRoleNonBindingTruth(evidence), evidence);
});

test('rejects candidate, diagnostic or GitHub provenance drift', () => {
  for (const [group, key, value, pattern] of [
    ['candidate', 'artifactSourceCommit', '0'.repeat(40), /artifactSourceCommit/u],
    ['qa', 'diagnosticInvariantCommit', '0'.repeat(40), /diagnosticInvariantCommit/u],
    ['qa', 'diagnosticGithubRegressionRun', 1, /diagnostic regression/u],
    ['qa', 'diagnosticGithubCodeql', 'pending', /diagnostic GitHub CodeQL/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = value;
    assert.throws(() => validateN18PixelTwoRoleNonBindingTruth(changed), pattern);
  }
});

test('rejects binding-looking simulation or weak offline evidence', () => {
  for (const [group, key, value, pattern] of [
    ['correction', 'bindingPaymentHandoverReturnActionsExposed', true, /binding simulation actions/u],
    ['technicalDebt', 'permanentCacheWarmupOrRetryRequired', true, /cache workaround/u],
  ]) {
    const changed = structuredClone(evidence);
    changed[group][key] = value;
    assert.throws(() => validateN18PixelTwoRoleNonBindingTruth(changed), pattern);
  }
  const changed = structuredClone(evidence);
  changed.pixel.offlineRealtime.activeDefaultNetworkAbsentConsecutiveSamples = 1;
  assert.throws(
    () => validateN18PixelTwoRoleNonBindingTruth(changed),
    /offline state samples/u,
  );
});

test('rejects false live, paid, identity or OnePlus claims', () => {
  for (const key of [
    'onePlusContacted',
    'googlePlayChanged',
    'productionChanged',
    'realMoneyUsed',
    'stripeSandboxUsed',
    'externalAiCalledForSitRuntime',
    'containsAccountIdentity',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validateN18PixelTwoRoleNonBindingTruth(changed), new RegExp(key));
  }
});
