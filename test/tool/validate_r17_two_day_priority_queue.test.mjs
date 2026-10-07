import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateR17TwoDayPriorityQueue } from '../../tool/validate_r17_two_day_priority_queue.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root, 'docs/evidence/48h-remote/r17-two-day-priority-queue-20260825.json',
), 'utf8'));
const matrix = JSON.parse(readFileSync(resolve(
  root, 'store/google-play/r17-stage-a-feature-flag-matrix.json',
), 'utf8'));

function validate(changed = evidence, changedMatrix = matrix) {
  return validateR17TwoDayPriorityQueue({
    repositoryRoot: root,
    evidence: changed,
    featureMatrix: changedMatrix,
  });
}

test('accepts the exact bounded R17 queue', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    p0OwnerGate: 'owner-action-required-final-gates-held',
    resolvedP1: 2,
    next48hPackage: '48H_REMOTE_READINESS_DECISION',
  });
});

test('rejects predecessor drift', () => {
  const changed = structuredClone(evidence);
  changed.predecessor.closureHead = '0'.repeat(40);
  assert.throws(() => validate(changed), /predecessor binding/u);
});

test('rejects a missing or downgraded direct finding', () => {
  const missing = structuredClone(evidence);
  missing.findings.pop();
  assert.throws(() => validate(missing), /finding set/u);
  const downgraded = structuredClone(evidence);
  downgraded.findings[0].priority = 'P2';
  assert.throws(() => validate(downgraded), /finding drift/u);
});

test('rejects non-binding or reduced-wave overclaims', () => {
  const binding = structuredClone(evidence);
  binding.stageANonBinding.rentalRequestSubmissionPossible = true;
  assert.throws(() => validate(binding), /non-binding/u);
  const wave = structuredClone(evidence);
  wave.reducedHumanWave0.activated = true;
  assert.throws(() => validate(wave), /reduced-wave/u);
});

test('rejects a granted gate or enabled matrix boundary', () => {
  const gate = structuredClone(evidence);
  gate.gateSeparation.BUILD_READY = 'granted';
  assert.throws(() => validate(gate), /gate separation/u);
  const boundary = structuredClone(matrix);
  boundary.boundaries.playConsoleChanged = true;
  assert.throws(() => validate(evidence, boundary), /scope or gates/u);
});

test('rejects an expanded human task surface', () => {
  const changed = structuredClone(matrix);
  changed.humanWave0.allowedTaskFamilies.push('rental-request');
  assert.throws(() => validate(evidence, changed), /scope or gates/u);
});

test('rejects premature or malformed GitHub verification', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-regression-passed-ci-pending';
  premature.focusedVerification.githubRegression = 'pending';
  premature.focusedVerification.githubCodeql = 'pending';
  premature.githubVerification = {
    implementationCommit: '0'.repeat(40),
    regressionRunId: 1,
    regressionConclusion: 'success',
    codeqlRunId: 2,
    codeqlConclusion: 'success',
    advancedSecurityCheckId: 3,
    advancedSecurityConclusion: 'success',
    newAlerts: 0,
  };
  assert.throws(() => validate(premature), /cannot bind GitHub/u);

  const malformed = structuredClone(evidence);
  malformed.status = 'verified-regression-and-codeql-passed-ready-for-final-decision';
  malformed.focusedVerification.fullTechnicalRegression =
    'passed-candidate-rollover-ci-metadata-mode';
  malformed.focusedVerification.githubRegression = 'passed';
  malformed.focusedVerification.githubCodeql = 'passed-no-new-alerts';
  malformed.githubVerification = premature.githubVerification;
  malformed.githubVerification.implementationCommit = 'bad';
  assert.throws(() => validate(malformed), /GitHub verification/u);
});

test('rejects private or secret-shaped machine evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'reviewer@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
