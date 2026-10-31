import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN27CurrentCandidatePixelClosure,
} from '../../tool/validate_n27_current_candidate_pixel_closure.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n27-current-candidate-pixel-two-role-push-offline-2026090306.json',
), 'utf8'));

test('accepts the sanitized N27 current-candidate Pixel closure', () => {
  assert.equal(validateN27CurrentCandidatePixelClosure(evidence), evidence);
});

test('rejects candidate, two-role or cleanup drift', () => {
  for (const mutate of [
    (value) => { value.candidate.apkSha256 = '0'.repeat(64); },
    (value) => { value.candidate.mobileSourceChangedAfterCandidate = true; },
    (value) => { value.twoRoleJourney.principalSwitchIsolation = 'not-proven'; },
    (value) => { value.twoRoleJourney.paymentEndpointCalled = true; },
    (value) => { value.fixtureSafety.bindingBookingCreated = true; },
    (value) => { value.fixtureSafety.publicCatalogRemainingAfterCleanup = 1; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN27CurrentCandidatePixelClosure(changed));
  }
});

test('rejects retry-only, push or CI overclaims', () => {
  for (const mutate of [
    (value) => { value.offlineRealtime.retryAloneAcceptedAsClosure = true; },
    (value) => { value.offlineRealtime.continuousOfflineStableWindowSeconds = 0; },
    (value) => { value.push.fullStoreFcmMatrixClaimed = true; },
    (value) => { value.push.productionPushSent = true; },
    (value) => { value.push.privateCaptureAssumedSensitive = false; },
    (value) => { value.push.privateCaptureDistributionAllowed = true; },
    (value) => { value.qa.githubRegression = 'pending'; },
    (value) => { value.qa.cleanCheckoutReproducibility = 'pending'; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN27CurrentCandidatePixelClosure(changed));
  }
});

test('rejects live-boundary or private-material drift', () => {
  for (const mutate of [
    (value) => { value.boundaries.onePlusContacted = true; },
    (value) => { value.boundaries.realMoneyUsed = true; },
    (value) => { value.boundaries.firebaseConfigurationChanged = true; },
    (value) => { value.remaining.notificationIconVisualReview = 'owner@example.invalid'; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN27CurrentCandidatePixelClosure(changed));
  }
});
