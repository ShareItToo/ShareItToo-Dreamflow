import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp114CurrentCandidateCompletePixelRenterOwner,
} from '../../tool/validate_wp114_current_candidate_complete_pixel_renter_owner.mjs';

const evidence = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/wp114-current-candidate-complete-pixel-renter-owner-20260911.json',
  import.meta.url,
), 'utf8'));
const rollover = JSON.parse(readFileSync(new URL(
  '../../store/google-play/rollover-candidate-2026091110.json', import.meta.url,
), 'utf8'));

function completed(value = evidence) {
  const result = structuredClone(value);
  result.verification.diagnosticImplementationLocalRegression = 'passed';
  result.verification.diagnosticImplementationGithubRegression.conclusion = 'success';
  result.verification.diagnosticImplementationGithubRegression.cleanCheckoutJob = 'success';
  result.verification.diagnosticImplementationGithubCodeql.conclusion = 'success';
  result.verification.openCodeScanningAlerts = 0;
  result.verification.pullRequest7 = 'draft-open-mergeable-unmerged';
  return result;
}

function validate(value = completed(), candidate = rollover) {
  return validateWp114CurrentCandidateCompletePixelRenterOwner({
    evidence: value,
    rollover: candidate,
    checkGitState: false,
  });
}

test('accepts the exact complete non-binding Pixel renter/owner matrix', () => {
  const result = validate();
  assert.equal(result.versionCode, '2026091110');
  assert.equal(result.completePixelMatrixPassed, true);
  assert.equal(result.privacyExportPassed, true);
  assert.equal(result.cleanupPassed, true);
});

test('rejects role, location, privacy, repeatability and cleanup overclaims', () => {
  for (const mutate of [
    (value) => { value.pixel.primaryTwoRoleJourney.accountIsolation = false; },
    (value) => {
      value.pixel.messagingMediaTimesAndLocation.locationMessageCreatedBeforeRevealWindow = true;
    },
    (value) => { value.pixel.privacyExport.forbiddenCredentialKeyCount = 1; },
    (value) => { value.pixel.offlineRealtime.consecutiveFreshPassingRuns = 1; },
    (value) => { value.cleanup.activeTemporaryJourneyCount = 1; },
  ]) {
    const invalid = completed();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects candidate, Staging, CI and live-boundary drift', () => {
  const cases = [
    [(value) => { value.candidate.versionCode = '2026091109'; }],
    [(value) => { value.staging.fcmEnabled = false; }],
    [(value) => { value.verification.diagnosticImplementationGithubCodeql.conclusion = 'pending'; }],
    [(value) => { value.boundaries.paymentEndpointCalled = true; }],
  ];
  for (const [mutate] of cases) {
    const invalid = completed();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects rollover reference drift and private evidence content', () => {
  const invalidRollover = structuredClone(rollover);
  invalidRollover.evidenceRef = 'docs/evidence/release-readiness/other.json';
  assert.throws(() => validate(completed(), invalidRollover));
  const privateEvidence = completed();
  privateEvidence.privatePath = '/Users/owner/private.json';
  assert.throws(() => validate(privateEvidence));
});
