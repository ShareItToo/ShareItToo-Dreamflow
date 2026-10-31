import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp50StagingBackendParityPreflight,
} from '../../tool/validate_wp50_staging_backend_parity_preflight.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp50-staging-backend-parity-deployment-preflight-20260907.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp50StagingBackendParityPreflight({
    repositoryRoot: root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact read-only Staging Backend parity preflight', () => {
  assert.deepEqual(validate(), {
    status: 'prepared-read-only-external-deployment-not-started',
    deployedHead: '68c97a437969dc98f17eb151da3e006259ffbafa',
    targetHead: '9de283ab0d5386f054606ac615a52ff05059f4db',
    changedBackendFiles: 8,
    sqlFilesChanged: 0,
    runwaySteps: 6,
    deploymentReady: false,
    gate: 'STAGING_BACKEND_PARITY_DEPLOYMENT_GO',
  });
});

test('rejects a false current Staging or target identity', () => {
  const deployed = structuredClone(evidence);
  deployed.currentStagingReadback.deployedCommit = '0'.repeat(40);
  assert.throws(() => validate(deployed), /current Staging readback/u);

  const target = structuredClone(evidence);
  target.repository.proposedDeploymentTargetHead = '1'.repeat(40);
  assert.throws(() => validate(target), /repository binding/u);
});

test('rejects a schema migration or diluted session limit', () => {
  const migration = structuredClone(evidence);
  migration.sourceDelta.schemaMigrationRequired = true;
  assert.throws(() => validate(migration), /source-delta classification/u);

  const limit = structuredClone(evidence);
  limit.sourceDelta.maximumActiveSessionsPerUser = 101;
  assert.throws(() => validate(limit), /source-delta classification/u);
});

test('rejects image-publication or exact-CI overclaims', () => {
  const image = structuredClone(evidence);
  image.targetVerification.exactTargetImagePublished = 'yes';
  assert.throws(() => validate(image), /target verification/u);

  const codeql = structuredClone(evidence);
  codeql.targetVerification.githubCodeql = 'pending';
  assert.throws(() => validate(codeql), /target verification/u);
});

test('rejects lost or forbidden runtime overlays', () => {
  const lostFcm = structuredClone(evidence);
  lostFcm.protectedRuntimeConfiguration.requiredDeploymentOverlaysInOrder.pop();
  assert.throws(() => validate(lostFcm), /protected runtime boundary/u);

  const externalAi = structuredClone(evidence);
  externalAi.protectedRuntimeConfiguration.forbiddenDeploymentOverlays = [];
  assert.throws(() => validate(externalAi), /protected runtime boundary/u);
});

test('rejects a reordered runway or an authorized mutation', () => {
  const reordered = structuredClone(evidence);
  [reordered.deploymentRunway[0], reordered.deploymentRunway[1]] =
    [reordered.deploymentRunway[1], reordered.deploymentRunway[0]];
  assert.throws(() => validate(reordered), /runway/u);

  const mutation = structuredClone(evidence);
  mutation.deploymentRunway[3].mutationAllowed = true;
  assert.throws(() => validate(mutation), /runway step/u);
});

test('rejects a prematurely open gate, external mutation or private material', () => {
  const gate = structuredClone(evidence);
  gate.externalGate.state = 'open';
  gate.externalGate.deploymentReady = true;
  assert.throws(() => validate(gate), /external gate/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.backendDeploymentChanged = true;
  assert.throws(() => validate(mutation), /cannot claim/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = 'operator@example.invalid';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
