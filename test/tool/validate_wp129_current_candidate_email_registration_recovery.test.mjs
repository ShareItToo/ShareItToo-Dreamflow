import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp129CurrentCandidateEmailRegistrationRecovery,
} from '../../tool/validate_wp129_current_candidate_email_registration_recovery.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp129-current-candidate-email-registration-recovery-20260912.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const validate = (evidence = readEvidence()) => (
  validateWp129CurrentCandidateEmailRegistrationRecovery({
    repositoryRoot: root,
    evidence,
    checkGitState: false,
  })
);

test('accepts exact-current E-mail registration and recovery closure', () => {
  assert.deepEqual(validateWp129CurrentCandidateEmailRegistrationRecovery({ repositoryRoot: root }), {
    status: 'complete-exact-current-email-registration-recovery',
    versionCode: '2026091201',
    promotedRequirement: 'email-registration-verification-login-recovery',
    passCount: 14,
    partialCount: 10,
    openCount: 8,
  });
});

test('rejects candidate, recovery and portfolio overclaims', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091202'; },
    (value) => { value.registration.verificationReplayHttpStatus = 200; },
    (value) => { value.passwordRecovery.resetLinkSingleUseClaimed = true; },
    (value) => { value.passwordRecovery.oldPasswordStructuredRejection = 'rejected'; },
    (value) => { value.privateState.protectedOwnerSessionRestored = false; },
    (value) => { value.portfolioEffect.passCount = 15; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects source, boundary and private-content drift', () => {
  const source = readEvidence();
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source digest/u);

  const boundary = readEvidence();
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /authorization boundary/u);

  const identity = readEvidence();
  identity.email = 'owner@example.test';
  assert.throws(() => validate(identity), /private field/u);

  const privatePath = readEvidence();
  privatePath.privatePath = '/Users/owner/private.json';
  assert.throws(() => validate(privatePath), /private or secret-shaped/u);
});
