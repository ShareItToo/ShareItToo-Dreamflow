import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp110PixelRenterOwnerJourney,
} from '../../tool/validate_wp110_pixel_renter_owner_journey.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('../../docs/evidence/release-readiness/wp110-pixel-renter-owner-journey-20260911.json', import.meta.url),
  'utf8',
));
const rollover = JSON.parse(readFileSync(
  new URL('../../store/google-play/rollover-candidate-2026091109.json', import.meta.url),
  'utf8',
));

function validate(value = evidence, current = rollover) {
  return validateWp110PixelRenterOwnerJourney({
    evidence: value,
    rollover: current,
    checkGitState: false,
  });
}

test('accepts the exact non-binding Pixel renter/owner journey and cleanup truth', () => {
  const result = validate();
  assert.equal(result.versionCode, '2026091109');
  assert.equal(result.exactPixelRenterOwnerJourneyPassed, true);
  assert.equal(result.exactFixtureCleanupPassed, true);
  assert.equal(result.publicCatalogBaselinePreserved, true);
});

test('rejects candidate, role, notification and location overclaims', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091108'; },
    (value) => { value.pixel.primaryTwoRoleJourney.accountIsolation = false; },
    (value) => { value.pixel.primaryTwoRoleJourney.statusIconManualVisualReview = 'passed'; },
    (value) => {
      value.pixel.messagingMediaTimesAndLocation.locationMessageCreatedBeforeRevealWindow = true;
    },
  ]) {
    const invalid = structuredClone(evidence);
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects global-empty cleanup shorthand and unrelated-listing mutation', () => {
  for (const mutate of [
    (value) => { value.cleanup.publicCatalogCountBefore = 0; },
    (value) => { value.cleanup.publicCatalogCountAfter = 0; },
    (value) => { value.cleanup.remainingPublicListingAttributedToWp110 = true; },
    (value) => { value.cleanup.unrelatedPublicListingInspectedOrChanged = true; },
  ]) {
    const invalid = structuredClone(evidence);
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects exact-head CI, live-boundary and rollover-reference drift', () => {
  const cases = [
    [(value) => { value.verification.githubRegression.head = value.repository.artifactSourceHead; }],
    [(value) => { value.verification.githubCodeql.conclusion = 'pending'; }],
    [(value) => { value.verification.githubApiImagePublish.publishJob = 'skipped'; }],
    [(value) => { value.boundaries.realMoneyUsed = true; }],
    [null, (value) => { value.evidenceRef = 'docs/evidence/release-readiness/other.json'; }],
  ];
  for (const [mutateEvidence, mutateRollover] of cases) {
    const invalidEvidence = structuredClone(evidence);
    const invalidRollover = structuredClone(rollover);
    mutateEvidence?.(invalidEvidence);
    mutateRollover?.(invalidRollover);
    assert.throws(() => validate(invalidEvidence, invalidRollover));
  }
});
