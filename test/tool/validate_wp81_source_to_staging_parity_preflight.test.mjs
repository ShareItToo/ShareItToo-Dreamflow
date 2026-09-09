import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp81SourceToStagingParityPreflight } from
  '../../tool/validate_wp81_source_to_staging_parity_preflight.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp81-source-to-staging-parity-preflight-20260910.json',
);
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('validates exact candidate-to-Staging runtime parity and the retained remote-source block', () => {
  assert.deepEqual(validateWp81SourceToStagingParityPreflight(), {
    candidateToStaging: 'exact-runtime-trees',
    currentSource: 'successor-build-required',
    deployment: 'blocked-by-wp77',
  });
});

test('registers the parity preflight in the complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp81_source_to_staging_parity_preflight\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp81_source_to_staging_parity_preflight\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp81_source_to_staging_parity_preflight\.mjs/u);
});

test('rejects a false claim that current source is the installed candidate', () => {
  const value = evidence();
  value.runtimeTreeBinding.currentSourceMayNotBeClaimedAsInstalledCandidate = false;
  assert.throws(
    () => validateWp81SourceToStagingParityPreflight({ evidence: value, checkGit: false }),
    /runtime-tree binding is invalid/u,
  );
});

test('rejects opening deployment before the persistent remote source is proven', () => {
  const value = evidence();
  value.deploymentSafety.deploymentAuthorized = true;
  assert.throws(
    () => validateWp81SourceToStagingParityPreflight({ evidence: value, checkGit: false }),
    /deployment boundary is invalid/u,
  );
});

test('rejects a partial verification claim', () => {
  const value = evidence();
  value.verification.fullTechnicalRegression = 'pending';
  assert.throws(
    () => validateWp81SourceToStagingParityPreflight({ evidence: value, checkGit: false }),
    /verification is invalid/u,
  );
});

test('rejects a credential-shaped value in the evidence', () => {
  const value = evidence();
  value.diagnosticNote = 'sk_test_placeholder';
  assert.throws(
    () => validateWp81SourceToStagingParityPreflight({ evidence: value, checkGit: false }),
    /private or secret-shaped content/u,
  );
});
