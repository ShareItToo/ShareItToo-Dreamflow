import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN9HeilbronnWave0 } from '../../tool/validate_blue_ocean_n9_heilbronn_wave0.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n9-heilbronn-wave0-preparation-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN9HeilbronnWave0({ repositoryRoot: root, evidence: changed });
}

test('accepts exact prepared and non-activated Heilbronn Wave 0', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    pilotId: 'heilbronn_wave0',
    plannedParticipants: 3,
    plannedListingRange: '9-15',
    activated: false,
    nextPackage: 'N10',
  });
});

test('rejects Wave-0 scope or activation drift', () => {
  const count = structuredClone(evidence);
  count.wave.plannedAdultParticipantCount = 4;
  assert.throws(() => validate(count), /Wave-0 scope/u);

  const activated = structuredClone(evidence);
  activated.wave.activated = true;
  assert.throws(() => validate(activated), /Wave-0 scope/u);
});

test('rejects prepared artifact or operator boundary drift', () => {
  const artifact = structuredClone(evidence);
  artifact.preparedArtifacts.safePhotoInstructions = 'partial';
  assert.throws(() => validate(artifact), /prepared artifact map/u);

  const operator = structuredClone(evidence);
  operator.operatorConfig.valuesStoredInRepository = true;
  assert.throws(() => validate(operator), /operator configuration boundary/u);
});

test('rejects missing activation gates or enabled initial services', () => {
  const gate = structuredClone(evidence);
  gate.remainingActivationGates.pop();
  assert.throws(() => validate(gate), /activation gates/u);

  const service = structuredClone(evidence);
  service.initialServiceState.fcmPush = 'on';
  assert.throws(() => validate(service), /initial services/u);
});

test('rejects live mutation or verification drift', () => {
  const boundary = structuredClone(evidence);
  boundary.boundaries.realTesterEnrolled = true;
  assert.throws(() => validate(boundary), /mutation boundary/u);

  const verification = structuredClone(evidence);
  verification.targetedVerification.wave0WiringTests = 'passed-3';
  assert.throws(() => validate(verification), /verification record/u);
});

test('rejects premature or malformed GitHub evidence', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-regression-passed-ci-pending';
  premature.targetedVerification.githubRegression = 'pending';
  premature.targetedVerification.githubCodeql = 'pending';
  premature.exactGitHubVerification = {
    headSha: '0'.repeat(40), regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(premature), /cannot bind exact GitHub/u);

  const final = structuredClone(evidence);
  final.exactGitHubVerification = {
    headSha: 'bad', regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(final), /exact GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'person@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
