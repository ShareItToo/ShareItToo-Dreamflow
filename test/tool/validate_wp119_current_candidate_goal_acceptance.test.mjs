import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp119CurrentCandidateGoalAcceptance,
} from '../../tool/validate_wp119_current_candidate_goal_acceptance.mjs';

const evidence = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/wp119-current-candidate-goal-acceptance-20260912.json',
  import.meta.url,
), 'utf8'));
const rollover = JSON.parse(readFileSync(new URL(
  '../../store/google-play/rollover-candidate-2026091110.json', import.meta.url,
), 'utf8'));

function validate(value = evidence, candidate = rollover) {
  return validateWp119CurrentCandidateGoalAcceptance({
    evidence: value,
    rollover: candidate,
    checkGitState: false,
  });
}

test('accepts the conservative exact-current-candidate goal matrix', () => {
  const result = validate();
  assert.deepEqual(result, {
    status: 'partial-current-candidate-acceptance-external-gates-open',
    versionCode: '2026091110',
    passCount: 11,
    partialCount: 13,
    openCount: 8,
  });
});

test('rejects a partial or open requirement promoted without evidence', () => {
  for (const id of ['google-signin', 'stripe-sandbox-payment-refund-simulated-payout']) {
    const invalid = structuredClone(evidence);
    invalid.requirements.find((entry) => entry.id === id).state = 'PASS';
    assert.throws(() => validate(invalid));
  }
});

test('rejects aggregate, candidate, CI and live-boundary drift', () => {
  for (const mutate of [
    (value) => { value.aggregate.partialCount = 12; },
    (value) => { value.candidate.versionCode = '2026091111'; },
    (value) => { value.repository.githubCodeql.conclusion = 'pending'; },
    (value) => { value.wp119Closure.githubRegression.head = '0'.repeat(40); },
    (value) => { value.boundaries.paymentProviderCalled = true; },
  ]) {
    const invalid = structuredClone(evidence);
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects source, rollover and private-content drift', () => {
  const invalidSource = structuredClone(evidence);
  invalidSource.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(invalidSource));

  const invalidRollover = structuredClone(rollover);
  invalidRollover.artifact.apkSha256 = '0'.repeat(64);
  assert.throws(() => validate(evidence, invalidRollover));

  const privateEvidence = structuredClone(evidence);
  privateEvidence.privatePath = '/Users/owner/private.json';
  assert.throws(() => validate(privateEvidence));
});
