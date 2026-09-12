import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN10InternalTesting } from '../../tool/validate_blue_ocean_n10_internal_testing.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n10-google-play-internal-testing-preparation-20260824.json',
), 'utf8'));
const plan = JSON.parse(readFileSync(resolve(
  root,
  'store/google-play/blue-ocean-internal-testing-plan.json',
), 'utf8'));

function validate(changedEvidence = evidence, changedPlan = plan) {
  return validateBlueOceanN10InternalTesting({
    repositoryRoot: root,
    evidence: changedEvidence,
    plan: changedPlan,
  });
}

test('accepts the exact prepared and unexecuted Internal Testing handoff', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    track: 'internal',
    plannedBuildNumber: '2026082401',
    aabBuilt: false,
    playConsoleChanged: false,
    nextPackage: 'N11',
  });
});

test('rejects candidate identity or version-plan drift', () => {
  const application = structuredClone(plan);
  application.candidatePlan.applicationId = 'wrong.app';
  assert.throws(() => validate(evidence, application), /candidate plan/u);

  const build = structuredClone(plan);
  build.candidatePlan.plannedBuildNumber = '2026082301';
  assert.throws(() => validate(evidence, build), /candidate plan|monotonically/u);
});

test('rejects a different track or missing owner Console gate', () => {
  const track = structuredClone(plan);
  track.track = 'production';
  assert.throws(() => validate(evidence, track), /plan identity/u);

  const gate = structuredClone(plan);
  gate.requiredBeforeConsoleAction.pop();
  assert.throws(() => validate(evidence, gate), /Console gate sequence/u);
});

test('rejects tester distribution drift or a disabled hard stop', () => {
  const testers = structuredClone(plan);
  testers.testerDistribution.testerEmailsStoredInGit = true;
  assert.throws(() => validate(evidence, testers), /tester-distribution/u);

  const hardStop = structuredClone(plan);
  hardStop.hardStops.publicRollout = false;
  assert.throws(() => validate(evidence, hardStop), /hard-stop/u);
});

test('rejects live mutation or weakened rollback preservation', () => {
  const mutation = structuredClone(evidence);
  mutation.boundaries.aabUploaded = true;
  assert.throws(() => validate(mutation), /mutation boundary/u);

  const rollback = structuredClone(plan);
  rollback.rollbackAndPreservation.preserveSanitizedEvidence = false;
  assert.throws(() => validate(evidence, rollback), /rollback and preservation/u);
});

test('rejects premature or malformed GitHub verification', () => {
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

test('rejects private or secret-shaped evidence and plan values', () => {
  const privateEvidence = structuredClone(evidence);
  privateEvidence.note = 'tester@example.test';
  assert.throws(() => validate(privateEvidence), /private or secret-shaped/u);

  const secretPlan = structuredClone(plan);
  secretPlan.note = 'sk-examplevalue';
  assert.throws(() => validate(evidence, secretPlan), /private or secret-shaped/u);
});
