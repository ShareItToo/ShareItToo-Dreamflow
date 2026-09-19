import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateGooglePlayProductionAccessApplication } from '../../tool/validate_google_play_production_access_application.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseApplication = JSON.parse(readFileSync(
  resolve(root, 'store/google-play/production-access-application.json'),
  'utf8',
));
const baseReadiness = JSON.parse(readFileSync(
  resolve(root, 'store/google-play/closed-testing-readiness.json'),
  'utf8',
));

function eligibleFixture() {
  const readiness = structuredClone(baseReadiness);
  readiness.status = 'eligible';
  readiness.window = {
    startedAt: '2026-08-12T12:00:00Z',
    eligibleAt: '2026-08-26T12:00:00Z',
    observedAt: '2026-08-26T12:00:00Z',
  };
  readiness.testing = {
    continuousQualifiedTesterCount: 12,
    minimumRosterContinuouslyOptedIn: true,
    engagementEvidenceCollected: true,
  };
  readiness.evidenceRef = 'docs/evidence/b11/google-play-closed-test-observation-20260826T120000Z.json';
  return readiness;
}

function completedApplication() {
  const application = structuredClone(baseApplication);
  application.state = 'ready-to-apply';
  application.sections.closedTest = {
    testerRecruitmentDifficulty: 'console-option-observed-after-test',
    engagementSummary: 'Aggregierte, nach dem Test bestätigte Nutzungszusammenfassung.',
    feedbackSummary: 'Aggregierte, nach dem Test bestätigte Feedbackthemen.',
    feedbackChannels: ['Google Play private testing feedback'],
  };
  application.sections.app.expectedFirstYearInstalls = 'console-range-observed-and-owner-selected';
  application.sections.productionReadiness = {
    changesBasedOnTesting: 'Nach dem Test belegte Änderungen.',
    readinessDecision: 'Nach dem Test belegte Freigabeentscheidung.',
  };
  application.evidence.feedbackSummary = 'docs/evidence/b11/google-play-closed-test-feedback-summary.json';
  return application;
}

test('accepts the honest pre-test draft without invented outcomes', () => {
  const result = validateGooglePlayProductionAccessApplication({
    application: structuredClone(baseApplication),
    closedTestingReadiness: structuredClone(baseReadiness),
  });
  assert.equal(result.readyToApply, false);
});

test('strict mode rejects the pre-test draft', () => {
  assert.throws(
    () => validateGooglePlayProductionAccessApplication({
      application: structuredClone(baseApplication),
      closedTestingReadiness: structuredClone(baseReadiness),
      requireReady: true,
    }),
    /ready for production-access submission is required/,
  );
});

test('rejects invented feedback before the closed test', () => {
  const application = structuredClone(baseApplication);
  application.sections.closedTest.feedbackSummary = 'Looks good.';
  assert.throws(
    () => validateGooglePlayProductionAccessApplication({ application, closedTestingReadiness: baseReadiness }),
    /must not invent test outcomes/,
  );
});

test('rejects tester addresses anywhere in the application', () => {
  const application = structuredClone(baseApplication);
  application.sections.closedTest.feedbackChannels.push('tester@example.test');
  assert.throws(
    () => validateGooglePlayProductionAccessApplication({ application, closedTestingReadiness: baseReadiness }),
    /must not contain tester or account email addresses/,
  );
});

test('accepts a complete application only after evidenced eligibility', () => {
  const result = validateGooglePlayProductionAccessApplication({
    application: completedApplication(),
    closedTestingReadiness: eligibleFixture(),
    requireReady: true,
  });
  assert.equal(result.readyToApply, true);
});

test('rejects a complete application while the test is still running', () => {
  const readiness = eligibleFixture();
  readiness.status = 'running';
  assert.throws(
    () => validateGooglePlayProductionAccessApplication({
      application: completedApplication(),
      closedTestingReadiness: readiness,
    }),
    /requires an eligible, not-yet-submitted closed test/,
  );
});

test('accepts a submitted application only while the Console decision is pending', () => {
  const application = completedApplication();
  application.state = 'submitted';
  application.boundaries.applicationSubmitted = true;
  const readiness = eligibleFixture();
  readiness.productionAccess.applicationSubmitted = true;
  const result = validateGooglePlayProductionAccessApplication({
    application,
    closedTestingReadiness: readiness,
  });
  assert.equal(result.state, 'submitted');
});

test('accepts production access only after the observed positive decision', () => {
  const application = completedApplication();
  application.state = 'production-access-approved';
  application.boundaries.applicationSubmitted = true;
  const readiness = eligibleFixture();
  readiness.status = 'production-access-approved';
  readiness.productionAccessAllowed = true;
  readiness.productionAccess.applicationSubmitted = true;
  readiness.productionAccess.applicationApproved = true;
  readiness.productionAccess.decisionObservedAt = '2026-08-29T11:00:00Z';
  readiness.window.observedAt = '2026-08-29T12:00:00Z';
  const result = validateGooglePlayProductionAccessApplication({
    application,
    closedTestingReadiness: readiness,
    requireApproved: true,
  });
  assert.equal(result.productionAccessApproved, true);
});

test('strict approval rejects a merely submitted application', () => {
  const application = completedApplication();
  application.state = 'submitted';
  application.boundaries.applicationSubmitted = true;
  const readiness = eligibleFixture();
  readiness.productionAccess.applicationSubmitted = true;
  assert.throws(
    () => validateGooglePlayProductionAccessApplication({
      application,
      closedTestingReadiness: readiness,
      requireApproved: true,
    }),
    /production-access approval is required/,
  );
});
