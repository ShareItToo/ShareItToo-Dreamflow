import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateWp55StagingParityDeploymentClosure } from
  '../../tool/validate_wp55_staging_parity_deployment_closure.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp55-authenticated-staging-parity-deployment-closure-20260908.json',
);

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('validates the exact WP55 runtime, session smoke and retained gate', () => {
  const result = validateWp55StagingParityDeploymentClosure();
  assert.equal(result.sessionSmoke, 'passed');
  assert.equal(result.readiness, 'only-noncritical-support-next-update-overdue');
});

test('rejects a false fully-ready classification', () => {
  const value = evidence();
  value.readiness.classification = 'fully-ready';
  assert.throws(
    () => validateWp55StagingParityDeploymentClosure({ evidence: value, checkGit: false }),
    /readiness degradation is misstated/u,
  );
});

test('rejects overclaimed external boundaries', () => {
  const value = evidence();
  value.boundaries.productionChanged = true;
  assert.throws(
    () => validateWp55StagingParityDeploymentClosure({ evidence: value, checkGit: false }),
    /external boundaries are invalid/u,
  );
});

test('rejects an unverified local closure regression', () => {
  const value = evidence();
  value.verification.closureLocalFullRegression = 'pending';
  assert.throws(
    () => validateWp55StagingParityDeploymentClosure({ evidence: value, checkGit: false }),
    /exact-target verification is invalid/u,
  );
});

test('rejects private infrastructure addresses', () => {
  const value = evidence();
  value.diagnosticNote = '192.0.2.1';
  assert.throws(
    () => validateWp55StagingParityDeploymentClosure({ evidence: value, checkGit: false }),
    /private or secret-shaped content/u,
  );
});
