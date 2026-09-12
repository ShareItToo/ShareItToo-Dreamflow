import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { validateWp104CurrentCandidateStagingPixelClosure } from '../../tool/validate_wp104_current_candidate_staging_pixel_closure.mjs';

const evidence = JSON.parse(readFileSync(resolve('docs/evidence/release-readiness/wp104-current-candidate-staging-pixel-closure-20260910.json'), 'utf8'));

test('WP104 exact Staging and Pixel closure evidence passes', () => {
  assert.deepEqual(validateWp104CurrentCandidateStagingPixelClosure(evidence), {
    status: 'passed-wp104-current-candidate-staging-pixel-closure-evidence',
    evidenceHead: '8916aa17fcb2f98d78a49314902a6fd0fcd0e75b',
    candidateHead: 'fdcfd1dc782c9f9dd3cb766d566abf7363a76cc5',
    containsPrivateState: false
  });
});

test('WP104 rejects a payment or cleanup regression', () => {
  const changed = structuredClone(evidence);
  changed.pixel.cleanup.paymentEndpointCalled = true;
  assert.throws(() => validateWp104CurrentCandidateStagingPixelClosure(changed), /payment boundary is not exact/u);
});

test('WP104 rejects relabelling the unverified OnePlus lane', () => {
  const changed = structuredClone(evidence);
  changed.remaining.onePlusExactCandidateTest = 'passed';
  assert.throws(() => validateWp104CurrentCandidateStagingPixelClosure(changed), /OnePlus truth is not exact/u);
});
