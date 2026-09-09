import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp55CurrentBackendBinding,
  validateWp55StagingParityDeploymentClosure,
} from
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

test('allows Backend drift only when exact newer signed Staging candidate bytes bind it', () => {
  const rollover = {
    schemaVersion: 1,
    kind: 'android-current-rollover-candidate',
    status: 'build-ready-play-internal-upload-pending',
    candidate: {
      applicationId: 'com.shareittoo.app',
      releaseChannel: 'internal',
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      artifactSourceHead: 'a'.repeat(40),
      versionCode: '2026090901',
    },
    artifact: {
      aabSha256: 'b'.repeat(64),
      apkSha256: 'c'.repeat(64),
    },
  };
  assert.equal(validateWp55CurrentBackendBinding({
    deployedBackendTree: 'd991765a159810b88e4e4db874ac6193ae3e804d',
    currentBackendTree: 'new-tree',
    candidateBackendTree: 'new-tree',
    rollover,
  }), 'newer-signed-staging-candidate-deployment-pending');

  assert.equal(validateWp55CurrentBackendBinding({
    deployedBackendTree: 'd991765a159810b88e4e4db874ac6193ae3e804d',
    currentBackendTree: 'current-tree-with-test-only-drift',
    candidateBackendTree: 'candidate-tree-before-test-only-drift',
    candidateBackendRuntimeMatchesCurrent: true,
    rollover,
  }), 'newer-signed-staging-candidate-deployment-pending');

  for (const mutate of [
    (value) => { value.status = 'play-internal-active-device-verification-pending'; },
    (value) => { value.candidate.versionCode = '2026090711'; },
    (value) => { value.candidate.releaseChannel = 'production'; },
    (value) => { value.artifact.aabSha256 = 'missing'; },
  ]) {
    const drifted = structuredClone(rollover);
    mutate(drifted);
    assert.throws(() => validateWp55CurrentBackendBinding({
      deployedBackendTree: 'd991765a159810b88e4e4db874ac6193ae3e804d',
      currentBackendTree: 'new-tree',
      candidateBackendTree: 'new-tree',
      rollover: drifted,
    }), /not bound to the current signed Staging candidate/u);
  }
  assert.throws(() => validateWp55CurrentBackendBinding({
    deployedBackendTree: 'd991765a159810b88e4e4db874ac6193ae3e804d',
    currentBackendTree: 'new-tree',
    candidateBackendTree: 'different-tree',
    rollover,
  }), /not bound to the current signed Staging candidate/u);
  assert.throws(() => validateWp55CurrentBackendBinding({
    deployedBackendTree: 'd991765a159810b88e4e4db874ac6193ae3e804d',
    currentBackendTree: 'current-tree-with-runtime-drift',
    candidateBackendTree: 'candidate-tree-before-runtime-drift',
    candidateBackendRuntimeMatchesCurrent: false,
    rollover,
  }), /not bound to the current signed Staging candidate/u);
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
