import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateN28CurrentCandidatePixelSurfaceMatrix,
} from '../../tool/validate_n28_current_candidate_pixel_surface_matrix.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/n28-current-candidate-pixel-surface-matrix-2026090306.json',
), 'utf8'));

test('accepts the sanitized N28 current-candidate Pixel surface closure', () => {
  assert.equal(validateN28CurrentCandidatePixelSurfaceMatrix(evidence), evidence);
});

test('rejects candidate or read-only surface drift', () => {
  for (const mutate of [
    (value) => { value.candidate.apkSha256 = '0'.repeat(64); },
    (value) => { value.candidate.mobileSourceChangedAfterCandidate = true; },
    (value) => { value.surfaceCore.legalDocumentCount = 6; },
    (value) => { value.surfaceCore.minimumMainNavigationTouchTargetDp = 47; },
    (value) => { value.accountAndSupport.paymentProviderHoldVisible = false; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN28CurrentCandidatePixelSurfaceMatrix(changed));
  }
});

test('rejects theme, private-capture or CI overclaims', () => {
  for (const mutate of [
    (value) => { value.themeAndBackground.backgroundSelectionChanged = true; },
    (value) => { value.themeAndBackground.privateCapturesCommitted = true; },
    (value) => { value.themeAndBackground.privateCapturesDistributionAllowed = true; },
    (value) => { value.qa.githubRegression = 'pending'; },
    (value) => { value.qa.cleanCheckoutReproducibility = 'pending'; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN28CurrentCandidatePixelSurfaceMatrix(changed));
  }
});

test('rejects live-boundary or private-material drift', () => {
  for (const mutate of [
    (value) => { value.boundaries.smsSent = true; },
    (value) => { value.boundaries.realMoneyUsed = true; },
    (value) => { value.boundaries.onePlusContacted = true; },
    (value) => { value.remaining.currentCandidateRealSms = 'owner@example.invalid'; },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateN28CurrentCandidatePixelSurfaceMatrix(changed));
  }
});
