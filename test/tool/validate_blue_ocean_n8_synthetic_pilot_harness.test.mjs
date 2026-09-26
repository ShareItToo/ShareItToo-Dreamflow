import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN8SyntheticPilotHarness } from '../../tool/validate_blue_ocean_n8_synthetic_pilot_harness.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n8-synthetic-pilot-harness-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN8SyntheticPilotHarness({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact N8 deterministic aggregate harness', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    syntheticParticipants: 30,
    attemptedFlows: 40,
    completedFlows: 37,
    nextPackage: 'N9',
  });
});

test('rejects identity or replay-digest drift', () => {
  const identity = structuredClone(evidence);
  identity.implementationBaseHead = '0'.repeat(40);
  assert.throws(() => validate(identity), /evidence identity/u);

  const digest = structuredClone(evidence);
  digest.harness.replaySha256 = '0'.repeat(64);
  assert.throws(() => validate(digest), /harness summary/u);
});

test('rejects synthetic participant, attempt or complete-flow drift', () => {
  for (const field of ['syntheticParticipantCount', 'attemptedFlowCount', 'completedFlowCount']) {
    const changed = structuredClone(evidence);
    changed.harness[field] += 1;
    assert.throws(() => validate(changed), /harness summary/u);
  }
});

test('rejects cohort or evidence-classification drift', () => {
  const cohort = structuredClone(evidence);
  cohort.cohorts[2].manualFallbackCount = 1;
  assert.throws(() => validate(cohort), /cohort summary/u);

  const classification = structuredClone(evidence);
  classification.coverage.flutterHumanE2e = 'complete';
  assert.throws(() => validate(classification), /coverage or evidence classification/u);
});

test('rejects a live boundary or verification drift', () => {
  const boundary = structuredClone(evidence);
  boundary.boundaries.humanPilotActivated = true;
  assert.throws(() => validate(boundary), /mutation boundary/u);

  const verification = structuredClone(evidence);
  verification.targetedVerification.harnessTests = 'passed-7';
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
  final.status = 'verified-ready-for-n9';
  final.targetedVerification.fullTechnicalRegression = 'passed-candidate-rollover-mode';
  final.targetedVerification.githubRegression = 'passed';
  final.targetedVerification.githubCodeql = 'passed';
  final.exactGitHubVerification = {
    headSha: 'bad', regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(final), /exact GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
