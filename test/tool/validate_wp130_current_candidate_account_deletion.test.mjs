import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp130CurrentCandidateAccountDeletion,
} from '../../tool/validate_wp130_current_candidate_account_deletion.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp130-current-candidate-account-deletion-20260912.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const validate = (evidence = readEvidence()) => validateWp130CurrentCandidateAccountDeletion({
  repositoryRoot: root,
  evidence,
  checkGitState: false,
});

test('accepts exact-current disposable-account deletion evidence', () => {
  assert.deepEqual(validateWp130CurrentCandidateAccountDeletion({ repositoryRoot: root }), {
    status: 'complete-exact-current-account-deletion',
    versionCode: '2026091201',
    promotedRequirement: 'privacy-export-and-account-deletion',
    passCount: 15,
    partialCount: 9,
    openCount: 8,
  });
});

test('rejects candidate, source and portfolio drift', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091202'; },
    (value) => { value.sourceInventory[1].sha256 = '0'.repeat(64); },
    (value) => { value.portfolioEffect.passCount = 16; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects ambiguous rejection, deletion or recovery truth', () => {
  for (const mutate of [
    (value) => { value.pixelProof.definiteRejection.wrongPasswordStructuredRejection = '408'; },
    (value) => { value.pixelProof.confirmedDeletion.deletedCredentialStructuredRejection = 'proxy_error'; },
    (value) => { value.pixelProof.confirmedDeletion.recoveryRequired = true; },
    (value) => { value.pixelProof.confirmedDeletion.protectedOwnerSessionRestored = false; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects OnePlus contact and private-content overclaim', () => {
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
