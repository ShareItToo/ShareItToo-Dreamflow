import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp107CurrentCandidateExtendedPixelTwoRole,
} from '../../tool/validate_wp107_current_candidate_extended_pixel_two_role.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('../../docs/evidence/release-readiness/wp107-current-candidate-extended-pixel-two-role-20260911.json', import.meta.url),
  'utf8',
));

test('accepts exact physical payment-free scope while retaining binding legal hold', () => {
  const result = validateWp107CurrentCandidateExtendedPixelTwoRole({
    evidence,
    checkGitState: false,
  });
  assert.equal(result.physicalPaymentFreeTwoRolePassed, true);
  assert.equal(result.bindingLegalHoldClosed, true);
  assert.equal(result.publicCatalogEmpty, true);
});

test('rejects location, binding or cleanup overclaims', () => {
  for (const mutate of [
    (value) => { value.pixel.messagingMediaTimesAndLocation.locationMessageCreatedBeforeRevealWindow = true; },
    (value) => { value.safetyAndBindingBoundaries.bindingAcceptanceClassifiedAsSuccess = true; },
    (value) => { value.cleanup.publicStagingCatalogEmpty = false; },
  ]) {
    const invalid = structuredClone(evidence);
    mutate(invalid);
    assert.throws(() => validateWp107CurrentCandidateExtendedPixelTwoRole({
      evidence: invalid,
      checkGitState: false,
    }));
  }
});
