import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateGooglePlayClosedTesting } from '../../tool/validate_google_play_closed_testing.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = JSON.parse(readFileSync(resolve(root, 'store/google-play/closed-testing-readiness.json'), 'utf8'));
const clone = (value) => structuredClone(value);

function observation(readiness) {
  return {
    schemaVersion: 1,
    kind: 'google-play-closed-testing-observation',
    capturedAt: readiness.window.observedAt,
    applicationId: readiness.applicationId,
    accountType: readiness.accountType,
    track: readiness.track,
    status: readiness.status,
    window: clone(readiness.window),
    testing: clone(readiness.testing),
    productionAccess: clone(readiness.productionAccess),
    boundaries: clone(readiness.boundaries),
  };
}

function runningFixture() {
  const readiness = clone(base);
  readiness.status = 'running';
  readiness.window.startedAt = '2026-08-12T12:00:00Z';
  readiness.window.eligibleAt = '2026-08-26T12:00:00Z';
  readiness.window.observedAt = '2026-08-15T12:00:00Z';
  readiness.testing.continuousQualifiedTesterCount = 12;
  readiness.testing.minimumRosterContinuouslyOptedIn = true;
  readiness.evidenceRef = 'docs/evidence/b11/google-play-closed-test-observation.json';
  return { readiness, evidence: observation(readiness) };
}

function eligibleFixture() {
  const { readiness } = runningFixture();
  readiness.status = 'eligible';
  readiness.window.observedAt = '2026-08-26T12:00:00Z';
  readiness.testing.continuousQualifiedTesterCount = 12;
  readiness.testing.minimumRosterContinuouslyOptedIn = true;
  readiness.testing.engagementEvidenceCollected = true;
  return { readiness, evidence: observation(readiness) };
}

function approvedFixture() {
  const { readiness } = eligibleFixture();
  readiness.status = 'production-access-approved';
  readiness.window.observedAt = '2026-08-29T12:00:00Z';
  readiness.productionAccess.applicationSubmitted = true;
  readiness.productionAccess.applicationApproved = true;
  readiness.productionAccess.decisionObservedAt = '2026-08-29T11:00:00Z';
  readiness.productionAccessAllowed = true;
  return { readiness, evidence: observation(readiness) };
}

test('accepts the honest not-started launch gate', () => {
  assert.deepEqual(validateGooglePlayClosedTesting({ root, readiness: clone(base) }), {
    status: 'not-started',
    productionAccessAllowed: false,
    continuousQualifiedTesterCount: 0,
  });
});

test('strict mode rejects the not-started gate', () => {
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, readiness: clone(base), requireProductionAccess: true }),
    /Approved Google Play production access is required/,
  );
});

test('accepts a running test with sanitized aggregate evidence', () => {
  assert.equal(validateGooglePlayClosedTesting({ root, ...runningFixture() }).status, 'running');
});

test('rejects a shortened closed-test window', () => {
  const fixture = eligibleFixture();
  fixture.readiness.window.eligibleAt = '2026-08-25T12:00:00Z';
  fixture.evidence = observation(fixture.readiness);
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, ...fixture }),
    /exactly 14 consecutive days/,
  );
});

test('rejects starting the qualifying window with only eleven testers', () => {
  const fixture = runningFixture();
  fixture.readiness.testing.continuousQualifiedTesterCount = 11;
  fixture.readiness.testing.minimumRosterContinuouslyOptedIn = false;
  fixture.evidence = observation(fixture.readiness);
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, ...fixture }),
    /cannot start below 12 continuously opted-in testers/,
  );
});

test('rejects eligibility with fewer than twelve continuous testers', () => {
  const fixture = eligibleFixture();
  fixture.readiness.testing.continuousQualifiedTesterCount = 11;
  fixture.evidence = observation(fixture.readiness);
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, ...fixture }),
    /at least 12 continuously opted-in/,
  );
});

test('rejects tester personal data in evidence', () => {
  const fixture = runningFixture();
  fixture.evidence.tester = 'tester@example.test';
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, ...fixture }),
    /must not contain tester or account email addresses/,
  );
});

test('rejects a missing evidence observation once a test is active', () => {
  const fixture = runningFixture();
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, readiness: fixture.readiness }),
    /referenced closed-test evidence must be provided/,
  );
});

test('rejects production approval before the eligibility timestamp', () => {
  const fixture = approvedFixture();
  fixture.readiness.productionAccess.decisionObservedAt = '2026-08-25T12:00:00Z';
  fixture.evidence = observation(fixture.readiness);
  assert.throws(
    () => validateGooglePlayClosedTesting({ root, ...fixture }),
    /production-access decision must be observed after eligibility/,
  );
});

test('accepts only fully evidenced production access in strict mode', () => {
  const result = validateGooglePlayClosedTesting({
    root,
    ...approvedFixture(),
    requireProductionAccess: true,
  });
  assert.equal(result.productionAccessAllowed, true);
});
