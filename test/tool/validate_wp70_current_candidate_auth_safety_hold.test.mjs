import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp70CurrentCandidateAuthSafetyHold,
} from '../../tool/validate_wp70_current_candidate_auth_safety_hold.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp70-current-candidate-auth-safety-hold-20260909.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp70CurrentCandidateAuthSafetyHold({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts exact-candidate auth, safety and provider-hold evidence', () => {
  assert.deepEqual(validate(), {
    status: 'implemented-pending-local-github',
    candidateVersionCode: '2026090904',
    closedRequirementCount: 2,
    paymentProviderCalled: false,
    onePlusContacted: false,
  });
});

test('rejects candidate, source and package-verification drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.versionCode = '2026090905';
  assert.throws(() => validate(candidate), /candidate binding/u);

  const source = structuredClone(evidence);
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source hash drift/u);

  const verification = structuredClone(evidence);
  verification.packageVerification.githubRegressionRun = 1;
  assert.throws(() => validate(verification), /pending verification/u);
});

test('rejects missing session and single-use action proof', () => {
  const session = structuredClone(evidence);
  session.pixelProof.sessionControls.serverConfirmedEmptyBeforeIndependentRelogin = false;
  assert.throws(() => validate(session), /required proof/u);

  const verification = structuredClone(evidence);
  verification.pixelProof.freshEmailAuthRecovery.verificationSingleUseReplayStructuredError = 'error';
  assert.throws(() => validate(verification), /exact safety outcome/u);

  const reset = structuredClone(evidence);
  reset.pixelProof.freshEmailAuthRecovery.oldPasswordStructuredRejection = '408';
  assert.throws(() => validate(reset), /exact safety outcome/u);
});

test('rejects report-block cleanup and payment-hold promotion', () => {
  const cleanup = structuredClone(evidence);
  cleanup.stagingSafetyProof.listingRetiredFromPublicCatalog = false;
  assert.throws(() => validate(cleanup), /Staging safety proof/u);

  const promotion = structuredClone(evidence);
  promotion.stagingSafetyProof.pixelUiReportBlockReplay = 'passed';
  assert.throws(() => validate(promotion), /physical UI proof/u);

  const hold = structuredClone(evidence);
  hold.pixelProof.accountAndSupportSurfaces.paymentProviderHoldVisible = false;
  assert.throws(() => validate(hold), /payment-hold proof/u);

  const payment = structuredClone(evidence);
  payment.boundaries.paymentProviderCalled = true;
  assert.throws(() => validate(payment), /boundary/u);
});

test('rejects requirement overclaim and private data', () => {
  const requirement = structuredClone(evidence);
  requirement.remainingRelatedRequirements[2].state = 'PASS';
  assert.throws(() => validate(requirement), /remaining requirement/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
