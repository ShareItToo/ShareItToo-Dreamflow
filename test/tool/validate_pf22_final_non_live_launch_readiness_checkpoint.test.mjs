import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf22FinalNonLiveLaunchReadinessCheckpoint,
} from '../../tool/validate_pf22_final_non_live_launch_readiness_checkpoint.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/final-non-live-launch-readiness-checkpoint-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validatePf22FinalNonLiveLaunchReadinessCheckpoint({
    repositoryRoot: root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact final non-live launch-readiness checkpoint', () => {
  assert.deepEqual(validate(), {
    status: 'autonomous-non-live-lanes-complete-external-evidence-required',
    packageHead: 'b77933939adcf5825c00d680ab00759a5969bf59',
    technicallyPreparedGateCount: 11,
    externallyReadyGateCount: 0,
    supportTechnicalCoverageCount: 167,
    supportExternalEvidenceRequiredCount: 47,
    currentAndroidBuildNumber: '2026082302',
    safeIndependentLaneCount: 0,
    nextActionBlock: 'A1',
    releaseDecision: 'hold-no-go',
  });
});

test('rejects repository, CI, credential and Drive drift', () => {
  const repository = structuredClone(evidence);
  repository.repository.pullRequest.merged = true;
  assert.throws(() => validate(repository), /repository, PR, CI or credential/u);

  const credential = structuredClone(evidence);
  credential.repository.credentialReadiness.containsToken = true;
  assert.throws(() => validate(credential), /repository, PR, CI or credential/u);

  const drive = structuredClone(evidence);
  drive.driveSource.repositoryHashMatchesDrive = false;
  assert.throws(() => validate(drive), /Drive or Support source binding/u);
});

test('rejects false readiness, a workaround or dependency overclaim', () => {
  const ready = structuredClone(evidence);
  ready.technicalReadiness.externallyReadyGateCount = 1;
  assert.throws(() => validate(ready), /aggregate technical-readiness/u);

  const workaround = structuredClone(evidence);
  workaround.regression.temporaryWorkaroundUsedAsAcceptanceEvidence = true;
  assert.throws(() => validate(workaround), /deterministic regression/u);

  const security = structuredClone(evidence);
  security.securityAndDependencies.knownOpenHighCriticalFindingCount = 1;
  assert.throws(() => validate(security), /Security or dependency/u);
});

test('rejects candidate, platform or external-gate overclaims', () => {
  const store = structuredClone(evidence);
  store.currentAndroidCandidate.delivery = 'google-play-split';
  assert.throws(() => validate(store), /current Android candidate/u);

  const firebase = structuredClone(evidence);
  firebase.platformReadiness.firebaseOwnerConsoleControlsAccepted = true;
  assert.throws(() => validate(firebase), /platform boundary/u);

  const gate = structuredClone(evidence);
  gate.remainingExternalGates.issuedReleaseTokenCount = 1;
  assert.throws(() => validate(gate), /remaining external-gate/u);
});

test('rejects a softened next gate or any external mutation', () => {
  const next = structuredClone(evidence);
  next.nextExternalGate.automaticExternalContinuationAllowed = true;
  assert.throws(() => validate(next), /bounded A1 decision/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.storeChanged = true;
  assert.throws(() => validate(mutation), /external mutation/u);
});

test('rejects private or secret-shaped additions', () => {
  const privateField = structuredClone(evidence);
  privateField.deviceId = 'forbidden';
  assert.throws(() => validate(privateField), /private field is forbidden/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped content/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_pf22_final_non_live_launch_readiness_checkpoint.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
