import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp120CurrentCandidateAuthSessionClosure,
} from '../../tool/validate_wp120_current_candidate_auth_session_closure.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp120-current-candidate-auth-session-closure-20260912.json',
);

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('accepts exact-current Pixel auth/session closure and bounded OnePlus partial truth', () => {
  const result = validateWp120CurrentCandidateAuthSessionClosure({ repositoryRoot: root });
  assert.equal(result.candidateVersionCode, '2026091110');
  assert.equal(result.pixelSessionControls, 'completed-session-controls');
  assert.equal(result.onePlusJourney, 'partial-fail-closed-at-owner-publish-ui');
});

test('rejects candidate, Pixel, OnePlus, runner or boundary overclaims', () => {
  const candidate = evidence();
  candidate.candidate.versionCode = '2026091111';
  assert.throws(
    () => validateWp120CurrentCandidateAuthSessionClosure({ evidence: candidate, checkGitState: false }),
    /candidate binding/u,
  );
  const pixel = evidence();
  pixel.sessionControls.serverConfirmedEmptyBeforeIndependentRelogin = false;
  assert.throws(
    () => validateWp120CurrentCandidateAuthSessionClosure({ evidence: pixel, checkGitState: false }),
    /session-control proof/u,
  );
  const onePlus = evidence();
  onePlus.onePlus.exactOwnerSessionRestored = true;
  assert.throws(
    () => validateWp120CurrentCandidateAuthSessionClosure({ evidence: onePlus, checkGitState: false }),
    /OnePlus partial truth/u,
  );
  const runner = evidence();
  runner.runnerHardening.unboundedRetry = true;
  assert.throws(
    () => validateWp120CurrentCandidateAuthSessionClosure({ evidence: runner, checkGitState: false }),
    /runner-hardening contract/u,
  );
  const boundary = evidence();
  boundary.boundaries.paymentEndpointCalled = true;
  assert.throws(
    () => validateWp120CurrentCandidateAuthSessionClosure({ evidence: boundary, checkGitState: false }),
    /boundary contract/u,
  );
});
