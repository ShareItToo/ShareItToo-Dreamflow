import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp136BookingsUnreadSnapshotPixelClosure,
} from '../../tool/validate_wp136_bookings_unread_snapshot_pixel_closure.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp136-bookings-unread-snapshot-pixel-closure-20260913.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts exact WP136 Bookings and Pixel closure evidence', () => {
  const result = validateWp136BookingsUnreadSnapshotPixelClosure({ repositoryRoot: root });
  assert.equal(result.versionCode, '2026091311');
  assert.equal(result.bookingsSurfaceSettled, true);
  assert.equal(result.githubRegression, 'success');
  assert.equal(result.onePlusContacted, false);
});

test('rejects defect, candidate, physical, CI and boundary overclaims', () => {
  for (const mutate of [
    (value) => { value.defect.historicalRequestRowsInSyntheticAccount = 1; },
    (value) => { value.candidate.apkSha256 = '0'.repeat(64); },
    (value) => { value.physicalJourney.bookingsSurfaceSettled = false; },
    (value) => { value.verification.githubRegressionConclusion = 'pending'; },
    (value) => { value.boundaries.onePlusContacted = true; },
  ]) {
    const value = readEvidence();
    mutate(value);
    assert.throws(
      () => validateWp136BookingsUnreadSnapshotPixelClosure({
        repositoryRoot: root,
        evidence: value,
        checkGitState: false,
      }),
      /WP136/u,
    );
  }
});

test('rejects private or secret-shaped evidence', () => {
  const value = readEvidence();
  value.boundaries.unexpected = 'owner@example.invalid';
  assert.throws(
    () => validateWp136BookingsUnreadSnapshotPixelClosure({
      repositoryRoot: root,
      evidence: value,
      checkGitState: false,
    }),
    /boundary contract|private or secret-shaped/u,
  );
});
