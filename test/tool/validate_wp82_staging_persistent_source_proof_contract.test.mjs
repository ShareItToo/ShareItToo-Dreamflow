import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp82StagingPersistentSourceProofContract } from
  '../../tool/validate_wp82_staging_persistent_source_proof_contract.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp82-staging-persistent-source-proof-contract-20260910.json',
);
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('keeps the persistent-source contract prepared and fail-closed', () => {
  assert.deepEqual(validateWp82StagingPersistentSourceProofContract(), {
    contract: 'prepared',
    remoteObservation: 'blocked-before-authentication',
    deployment: 'not-authorized',
  });
});

test('registers the proof contract in the complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp82_staging_persistent_source_proof_contract\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp82_staging_persistent_source_proof_contract\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp82_staging_persistent_source_proof_contract\.mjs/u);
});

test('rejects a false successful remote observation', () => {
  const value = evidence();
  value.remoteObservation.remoteEvidenceCaptured = true;
  assert.throws(
    () => validateWp82StagingPersistentSourceProofContract({ evidence: value, checkGit: false }),
    /remote observation truth is invalid/u,
  );
});

test('rejects opening the external gate without the remote proof', () => {
  const value = evidence();
  value.externalGate.state = 'passed';
  assert.throws(
    () => validateWp82StagingPersistentSourceProofContract({ evidence: value, checkGit: false }),
    /external gate is invalid/u,
  );
});

test('rejects stale or incomplete GitHub verification', () => {
  const value = evidence();
  value.githubVerification.regression.requiredJobs.pop();
  assert.throws(
    () => validateWp82StagingPersistentSourceProofContract({ evidence: value, checkGit: false }),
    /GitHub verification binding is invalid/u,
  );
});

test('rejects protected source drift and secret-shaped evidence', () => {
  const sourceTexts = {
    'backend/ops/deploy_release.sh': 'drift',
  };
  assert.throws(
    () => validateWp82StagingPersistentSourceProofContract({ sourceTexts }),
    /protected source hash is stale/u,
  );

  const value = evidence();
  value.diagnosticNote = 'sk_test_placeholder';
  assert.throws(
    () => validateWp82StagingPersistentSourceProofContract({ evidence: value, checkGit: false }),
    /private or secret-shaped content/u,
  );
});
