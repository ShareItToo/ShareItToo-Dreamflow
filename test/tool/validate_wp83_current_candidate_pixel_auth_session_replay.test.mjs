import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp83CurrentCandidatePixelAuthSessionReplay,
} from '../../tool/validate_wp83_current_candidate_pixel_auth_session_replay.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp83-current-candidate-pixel-auth-session-replay-20260910.json',
);

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('accepts the partial exact-candidate Pixel auth/session replay without promotion', () => {
  const result = validateWp83CurrentCandidatePixelAuthSessionReplay({ repositoryRoot: root });
  assert.equal(result.status, 'partial-owner-email-link-confirmation-pending');
  assert.equal(result.candidateVersionCode, '2026090905');
  assert.equal(result.ownerConfirmationRequired, true);
  assert.equal(result.delayedResultIsolation, 'not-exercised-by-this-physical-replay');
});

test('rejects a source, boundary or owner-gate overclaim', () => {
  const sourceDrift = evidence();
  sourceDrift.runnerHardening.sourceInventory[0].sha256 = 'a'.repeat(64);
  assert.throws(
    () => validateWp83CurrentCandidatePixelAuthSessionReplay({ repositoryRoot: root, evidence: sourceDrift }),
    /runner source hash drift/u,
  );
  const ownerGate = evidence();
  ownerGate.emailRegistration.ownerConfirmationRequired = false;
  assert.throws(
    () => validateWp83CurrentCandidatePixelAuthSessionReplay({ repositoryRoot: root, evidence: ownerGate }),
    /e-mail-registration gate/u,
  );
  const boundary = evidence();
  boundary.boundaries.onePlusContacted = true;
  assert.throws(
    () => validateWp83CurrentCandidatePixelAuthSessionReplay({ repositoryRoot: root, evidence: boundary }),
    /boundary contract/u,
  );
});
