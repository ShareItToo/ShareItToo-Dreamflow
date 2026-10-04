import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp138GoogleSigninCurrentCandidatePixelClosure,
} from '../../tool/validate_wp138_google_signin_current_candidate_pixel_closure.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp138-google-signin-current-candidate-pixel-closure-20260913.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts exact Google cancellation, login, cold-start, repeat and restore evidence', () => {
  const result = validateWp138GoogleSigninCurrentCandidatePixelClosure({
    repositoryRoot: root,
    evidence: readEvidence(),
    checkGitState: false,
  });
  assert.equal(result.versionCode, '2026091312');
  assert.equal(result.chooserCancellation, 'passed-no-session');
  assert.equal(result.sameStagingProfile, true);
  assert.deepEqual(result.portfolio, { pass: 20, partial: 4, open: 8 });
});

test('rejects turning cancellation or linkage uncertainty into a stronger claim', () => {
  const changed = readEvidence();
  changed.physicalJourney.googleChooserCancellation = 'passed';
  changed.physicalJourney.accountCreationVersusExistingLinkage = 'created';
  assert.throws(
    () => validateWp138GoogleSigninCurrentCandidatePixelClosure({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /chooser cancellation|linkage claim/u,
  );
});

test('rejects divergent profile observations and external-boundary overclaims', () => {
  const changed = readEvidence();
  changed.physicalJourney.privateProfileHashes.repeat = '0'.repeat(64);
  changed.boundaries.googlePlayChanged = true;
  assert.throws(
    () => validateWp138GoogleSigninCurrentCandidatePixelClosure({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /profile fingerprint|boundary contract/u,
  );
});
