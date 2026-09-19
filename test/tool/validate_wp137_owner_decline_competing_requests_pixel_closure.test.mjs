import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp137OwnerDeclineCompetingRequestsPixelClosure,
} from '../../tool/validate_wp137_owner_decline_competing_requests_pixel_closure.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp137-owner-decline-competing-requests-pixel-closure-20260913.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts exact WP137 competing-request decline closure evidence', () => {
  const result = validateWp137OwnerDeclineCompetingRequestsPixelClosure({ repositoryRoot: root });
  assert.equal(result.versionCode, '2026091311');
  assert.equal(result.exactlyOneRequestDeclined, true);
  assert.equal(result.untouchedCompetingRequest, 'passed-still-requested');
  assert.equal(result.githubRegression, 'success');
  assert.deepEqual(result.portfolio, { pass: 19, partial: 5, open: 8 });
});

test('rejects candidate, physical, CI and portfolio overclaims', () => {
  for (const mutate of [
    (value) => { value.candidate.apkSha256 = '0'.repeat(64); },
    (value) => { value.physicalJourney.exactlyOneRequestDeclined = false; },
    (value) => { value.physicalJourney.untouchedCompetingRequest = 'declined'; },
    (value) => { value.verification.githubRegressionConclusion = 'pending'; },
    (value) => { value.portfolio.after.pass = 20; },
  ]) {
    const value = readEvidence();
    mutate(value);
    assert.throws(
      () => validateWp137OwnerDeclineCompetingRequestsPixelClosure({
        repositoryRoot: root,
        evidence: value,
        checkGitState: false,
      }),
      /WP137/u,
    );
  }
});

test('rejects changed boundaries and private or secret-shaped evidence', () => {
  for (const mutate of [
    (value) => { value.boundaries.paymentEndpointCalled = true; },
    (value) => { value.boundaries.unexpected = 'owner@example.invalid'; },
  ]) {
    const value = readEvidence();
    mutate(value);
    assert.throws(
      () => validateWp137OwnerDeclineCompetingRequestsPixelClosure({
        repositoryRoot: root,
        evidence: value,
        checkGitState: false,
      }),
      /WP137/u,
    );
  }
});
