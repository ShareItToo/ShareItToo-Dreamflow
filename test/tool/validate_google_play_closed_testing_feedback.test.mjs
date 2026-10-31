import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  selectReservedCandidateForClosedTestingFeedback,
  validateGooglePlayClosedTestingFeedback,
} from '../../tool/validate_google_play_closed_testing_feedback.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const plan = JSON.parse(readFileSync(resolve(root, 'store/google-play/closed-testing-feedback-plan.json'), 'utf8'));
const readiness = JSON.parse(readFileSync(resolve(root, 'store/google-play/closed-testing-readiness.json'), 'utf8'));
const deviceCandidate = JSON.parse(readFileSync(
  resolve(root, 'store/device-validation.json'),
  'utf8',
)).candidate;
const currentCandidate = {
  versionName: plan.candidate.versionName,
  buildNumber: plan.candidate.buildNumber,
};

function validate(planFixture, readinessFixture) {
  return validateGooglePlayClosedTestingFeedback({
    plan: planFixture,
    closedTestingReadiness: readinessFixture,
    currentCandidate,
    deviceCandidate,
    root,
  });
}

test('accepts the empty plan before the real closed test', () => {
  const result = validate(structuredClone(plan), structuredClone(readiness));
  assert.equal(result.state, 'planned');
  assert.equal(result.scenarioCount, 9);
});

test('rejects invented feedback before the test starts', () => {
  const fixture = structuredClone(plan);
  fixture.aggregate.feedbackItemCount = 1;
  assert.throws(
    () => validate(fixture, readiness),
    /must remain empty until the real closed test starts/,
  );
});

test('rejects inventing an exact commit before the final Store build exists', () => {
  const fixture = structuredClone(plan);
  fixture.candidate.commit = 'a'.repeat(40);
  assert.throws(
    () => validate(fixture, readiness),
    /reserved final candidate/,
  );
});

test('rejects a reserved plan for the wrong final build number', () => {
  const fixture = structuredClone(plan);
  fixture.candidate.buildNumber = '2026081402';
  assert.throws(
    () => validate(fixture, readiness),
    /reserved final candidate/,
  );
});

test('rejects embedding a live opt-in link in the repository plan', () => {
  const fixture = structuredClone(plan);
  fixture.testerOnboarding.containsLiveOptInLink = true;
  assert.throws(
    () => validate(fixture, readiness),
    /must remain private, sanitized and bound to the canonical guide/,
  );
});

test('rejects detaching the closed test from the canonical tester guide', () => {
  const fixture = structuredClone(plan);
  fixture.testerOnboarding.guidePath = 'docs/operations/another-guide.md';
  assert.throws(
    () => validate(fixture, readiness),
    /must remain private, sanitized and bound to the canonical guide/,
  );
});

test('rejects personal tester data anywhere in the plan', () => {
  const fixture = structuredClone(plan);
  fixture.aggregate.feedbackThemes.push('tester@example.test');
  assert.throws(
    () => validate(fixture, readiness),
    /must not contain tester or account email addresses/,
  );
});

test('rejects a device identifier field even without a value', () => {
  const fixture = structuredClone(plan);
  fixture.aggregate.deviceId = null;
  assert.throws(
    () => validate(fixture, readiness),
    /forbidden private field/,
  );
});

test('rejects collecting feedback without an active closed test', () => {
  const fixture = structuredClone(plan);
  fixture.state = 'collecting';
  fixture.candidate = {
    versionName: deviceCandidate.versionName,
    buildNumber: deviceCandidate.buildNumber,
    commit: deviceCandidate.commit,
    bindingState: 'exact-installed-candidate',
  };
  fixture.aggregate.observedTesterCount = 12;
  assert.throws(
    () => validate(fixture, readiness),
    /requires an active or completed closed test/,
  );
});

test('accepts a sanitized aggregate while the closed test is running', () => {
  const fixture = structuredClone(plan);
  fixture.state = 'collecting';
  fixture.candidate = {
    versionName: deviceCandidate.versionName,
    buildNumber: deviceCandidate.buildNumber,
    commit: deviceCandidate.commit,
    bindingState: 'exact-installed-candidate',
  };
  fixture.aggregate.observedTesterCount = 12;
  fixture.aggregate.completedScenarioRuns = 16;
  fixture.aggregate.feedbackItemCount = 3;
  fixture.aggregate.issueCounts.p2 = 1;
  const active = structuredClone(readiness);
  active.status = 'running';
  const result = validate(fixture, active);
  assert.equal(result.feedbackItemCount, 3);
});

test('rejects active feedback that was never rebound to the installed candidate', () => {
  const fixture = structuredClone(plan);
  fixture.state = 'collecting';
  fixture.aggregate.observedTesterCount = 12;
  const active = structuredClone(readiness);
  active.status = 'running';
  assert.throws(
    () => validate(fixture, active),
    /exact installed B11 release candidate/,
  );
});

test('keeps a planned Store feedback run bound during a newer internal rollover', () => {
  assert.deepEqual(selectReservedCandidateForClosedTestingFeedback({
    planCandidate: plan.candidate,
    pubspecCandidate: {
      versionName: plan.candidate.versionName,
      buildNumber: String(BigInt(plan.candidate.buildNumber) + 1n),
    },
    allowCandidateRollover: true,
  }), {
    versionName: plan.candidate.versionName,
    buildNumber: plan.candidate.buildNumber,
  });
});

test('rollover cannot weaken Store-submission or staging boundaries', () => {
  const next = {
    versionName: plan.candidate.versionName,
    buildNumber: String(BigInt(plan.candidate.buildNumber) + 1n),
  };
  for (const override of [
    { releaseChannel: 'production' },
    { apiBaseUrl: 'https://api.shareittoo.com/api/v1' },
    { requireStoreSubmission: true },
  ]) {
    assert.throws(
      () => selectReservedCandidateForClosedTestingFeedback({
        planCandidate: plan.candidate,
        pubspecCandidate: next,
        allowCandidateRollover: true,
        ...override,
      }),
      /strictly newer internal Staging diagnostic build/,
    );
  }
});
