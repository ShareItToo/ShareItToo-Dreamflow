import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp71CurrentCandidateAccountDeletion,
} from '../../tool/validate_wp71_current_candidate_account_deletion.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp71-current-candidate-account-deletion-20260909.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp71CurrentCandidateAccountDeletion({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts exact current-candidate disposable-account deletion evidence', () => {
  assert.deepEqual(validate(), {
    status: 'implemented-pending-local-github',
    candidateVersionCode: '2026090904',
    privacyRequirementState: 'PASS',
    protectedOwnerRestored: true,
    onePlusContacted: false,
  });
});

test('rejects candidate, source and pending-verification drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.versionCode = '2026090905';
  assert.throws(() => validate(candidate), /candidate binding/u);

  const source = structuredClone(evidence);
  source.sourceInventory[1].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source hash drift/u);

  const verification = structuredClone(evidence);
  verification.packageVerification.githubRegressionRun = 1;
  assert.throws(() => validate(verification), /pending verification/u);
});

test('rejects ambiguous rejection or deletion truth', () => {
  const rejection = structuredClone(evidence);
  rejection.pixelProof.definiteRejection.wrongPasswordStructuredRejection = '408';
  assert.throws(() => validate(rejection), /rejection semantics/u);

  const deletion = structuredClone(evidence);
  deletion.pixelProof.confirmedDeletion.deletedCredentialStructuredRejection = 'proxy_error';
  assert.throws(() => validate(deletion), /deletion semantics/u);

  const recovery = structuredClone(evidence);
  recovery.pixelProof.confirmedDeletion.recoveryRequired = true;
  assert.throws(() => validate(recovery), /deletion semantics/u);
});

test('rejects protected-account, boundary and private-data overclaim', () => {
  const protectedAccount = structuredClone(evidence);
  protectedAccount.pixelProof.preflight.protectedRecoveryCredentialActive = false;
  assert.throws(() => validate(protectedAccount), /preflight/u);

  const boundary = structuredClone(evidence);
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /boundary/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
