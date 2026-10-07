import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN17StagingListingAiActivationReadiness,
} from '../../tool/validate_n17_staging_listing_ai_activation_readiness.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n17-staging-listing-ai-activation-readiness-20260903.json',
), 'utf8'));

test('accepts the bounded N17 provider-readiness evidence', () => {
  assert.equal(
    validateN17StagingListingAiActivationReadiness(evidence, { repositoryRoot: root }),
    evidence,
  );
});

test('rejects runtime activation, publication, billing and device overclaims', () => {
  for (const key of [
    'externalProviderCalled',
    'providerBillingActivated',
    'stagingDeploymentChanged',
    'automaticListingPublished',
    'pixelChanged',
    'onePlusContacted',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(
      () => validateN17StagingListingAiActivationReadiness(changed, { repositoryRoot: root }),
      new RegExp(key),
    );
  }
});

test('rejects widened budget, Production eligibility and automatic publication', () => {
  for (const [key, value, pattern] of [
    ['budgetMaximumCents', 10_000, /budgetMaximumCents/u],
    ['allowedEnvironment', 'production', /allowedEnvironment/u],
    ['automaticPublicationAllowed', true, /automaticPublicationAllowed/u],
  ]) {
    const changed = structuredClone(evidence);
    changed.activation[key] = value;
    assert.throws(
      () => validateN17StagingListingAiActivationReadiness(changed, { repositoryRoot: root }),
      pattern,
    );
  }
});

test('rejects credential-boundary and source-binding drift', () => {
  const credentialDrift = structuredClone(evidence);
  credentialDrift.credentialBoundary.symbolicLinkAllowed = true;
  assert.throws(
    () => validateN17StagingListingAiActivationReadiness(credentialDrift, { repositoryRoot: root }),
    /symbolicLinkAllowed/u,
  );

  const sourceDrift = structuredClone(evidence);
  sourceDrift.sourceBindings['backend/src/app.js'] = '0'.repeat(64);
  assert.throws(
    () => validateN17StagingListingAiActivationReadiness(sourceDrift, { repositoryRoot: root }),
    /recorded source hash backend\/src\/app\.js/u,
  );
});

test('accepts only internally consistent final GitHub proof shape', () => {
  const passed = structuredClone(evidence);
  passed.implementationCommit = 'a'.repeat(40);
  passed.verification.composeConfigValidation = 'passed-by-github-regression';
  passed.verification.fullLocalRegression = 'passed';
  passed.verification.githubRegression = 'passed';
  passed.verification.githubRegressionRun = 123;
  passed.verification.cleanCheckoutReproducibility = 'passed-by-github-regression';
  passed.verification.githubCodeql = 'passed';
  passed.verification.githubCodeqlRun = 124;
  passed.verification.openCodeScanningAlerts = 0;
  assert.equal(
    validateN17StagingListingAiActivationReadiness(passed, { repositoryRoot: root }),
    passed,
  );

  passed.verification.githubRegressionRun = null;
  assert.throws(
    () => validateN17StagingListingAiActivationReadiness(passed, { repositoryRoot: root }),
    /GitHub Regression pass requires/u,
  );
});
