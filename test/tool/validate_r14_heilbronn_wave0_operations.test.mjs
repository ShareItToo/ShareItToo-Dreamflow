import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateR14HeilbronnWave0Operations } from '../../tool/validate_r14_heilbronn_wave0_operations.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r14-heilbronn-wave0-operations-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR14HeilbronnWave0Operations({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact prepared and non-activated R14 package', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    testerSlots: 3,
    taskRange: '9-15',
    activated: false,
    next48hPackage: 'R15',
  });
});

test('rejects participant or task-plan scope drift', () => {
  const slots = structuredClone(evidence);
  slots.testerPlan.opaqueSlots.push('HW0-D');
  assert.throws(() => validate(slots), /three-tester plan/u);

  const tasks = structuredClone(evidence);
  tasks.testerPlan.taskIds.pop();
  assert.throws(() => validate(tasks), /three-tester plan/u);
});

test('rejects incomplete participant materials or severity guidance', () => {
  const questions = structuredClone(evidence);
  questions.participantMaterials.postTaskQuestionCount = 8;
  assert.throws(() => validate(questions), /participant-material/u);

  const severity = structuredClone(evidence);
  severity.participantMaterials.severityGuide.pop();
  assert.throws(() => validate(severity), /participant-material/u);
});

test('rejects a retry or timing workaround instead of the R9 cleanup debt exit', () => {
  const retry = structuredClone(evidence);
  retry.technicalDebtClosure.permanentTimingOrRetryWorkaroundAdded = true;
  assert.throws(() => validate(retry), /Technical Debt closure/u);

  const hiddenPoolErrors = structuredClone(evidence);
  hiddenPoolErrors.technicalDebtClosure.unexpectedPoolErrorsRemainFatal = false;
  assert.throws(() => validate(hiddenPoolErrors), /Technical Debt closure/u);
});

test('rejects activation, enrollment or physical-meeting overclaims', () => {
  const active = structuredClone(evidence);
  active.activationState.humanPilotActivated = true;
  assert.throws(() => validate(active), /activation boundary/u);

  const meeting = structuredClone(evidence);
  meeting.testerPlan.physicalMeetingAuthorized = true;
  assert.throws(() => validate(meeting), /three-tester plan/u);
});

test('rejects live mutation or personal-data claims', () => {
  const provider = structuredClone(evidence);
  provider.boundaries.externalProviderCallPerformed = true;
  assert.throws(() => validate(provider), /live boundary/u);

  const identity = structuredClone(evidence);
  identity.testerPlan.realTesterIdentityStored = true;
  assert.throws(() => validate(identity), /three-tester plan/u);
});

test('rejects premature or malformed GitHub verification', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-regression-passed-ci-pending';
  premature.technicalDebtClosure.closure = 'passed-unit-and-three-fresh-local-proofs-ci-pending';
  premature.focusedVerification.githubRegression = 'pending';
  premature.focusedVerification.githubCodeql = 'pending';
  premature.githubVerification = {
    implementationCommit: '0'.repeat(40), regressionRunId: 1,
    regressionConclusion: 'success', codeqlRunId: 2, codeqlConclusion: 'success',
    advancedSecurityCheckId: 3, advancedSecurityConclusion: 'success', newAlerts: 0,
  };
  assert.throws(() => validate(premature), /cannot bind GitHub/u);

  const malformed = structuredClone(evidence);
  malformed.status = 'verified-regression-and-codeql-passed-ready-for-r15';
  malformed.technicalDebtClosure.closure = 'verified-in-follow-up-regression';
  malformed.focusedVerification.fullTechnicalRegression = 'passed-candidate-rollover-ci-metadata-mode';
  malformed.focusedVerification.githubRegression = 'passed';
  malformed.focusedVerification.githubCodeql = 'passed-no-new-alerts';
  malformed.githubVerification = {
    implementationCommit: 'bad', regressionRunId: 1,
    regressionConclusion: 'success', codeqlRunId: 2, codeqlConclusion: 'success',
    advancedSecurityCheckId: 3, advancedSecurityConclusion: 'success', newAlerts: 0,
  };
  assert.throws(() => validate(malformed), /GitHub verification/u);
});

test('rejects secret-shaped or private evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'tester@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
