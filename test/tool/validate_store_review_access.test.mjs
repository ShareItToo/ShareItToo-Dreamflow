import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateStoreReviewAccess } from '../../tool/validate_store_review_access.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const baseReview = JSON.parse(readFileSync(resolve(repositoryRoot, 'store/review-access.json')));
const baseDevice = JSON.parse(readFileSync(resolve(repositoryRoot, 'store/device-validation.json')));
const baseSubmission = JSON.parse(readFileSync(resolve(repositoryRoot, 'store/submission.json')));
const currentEvidence = JSON.parse(readFileSync(resolve(
  repositoryRoot,
  baseReview.technicalAccess.evidenceRef,
)));
const currentRolloverEvidence = JSON.parse(readFileSync(resolve(
  repositoryRoot,
  'docs/evidence/b11/store-review-access-rollover-2026081509-20260815T125014Z.json',
)));
const pendingEvidence = JSON.parse(readFileSync(resolve(
  repositoryRoot,
  'docs/evidence/b11/store-review-access-refresh-pending-2026081411-20260814T234406Z.json',
)));
const passedEvidence = {
  schemaVersion: 1,
  kind: 'store-review-access-diagnostic',
  status: 'technical-review-access-passed-store-fields-pending',
  capturedAt: '2026-08-11T01:00:00.000Z',
  candidate: structuredClone(baseReview.candidate),
  roles: ['owner', 'renter'],
  checks: {
    isolatedStagingFixture: true,
    ownerPasswordLoginWithoutOtp: true,
    renterPasswordLoginWithoutOtp: true,
    ownerActiveVerifiedAndConsented: true,
    renterActiveVerifiedAndConsented: true,
    ownerListingVisible: true,
    acceptedBookingVisibleToBothRoles: true,
    sharedChatVisibleToBothRoles: true,
    sharedChatReadableByBothRoles: true,
  },
  environment: {
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  },
  boundaries: {
    productDataReadOnly: true,
    businessDataMutations: false,
    authenticationSessionsCreated: true,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsAccountIdentifiers: false,
    containsFixtureIdentifiers: false,
    syntheticAccountsOnly: true,
    publicStoreChanged: false,
    productionChanged: false,
  },
};
const passedDeletionEvidence = {
  schemaVersion: 1,
  kind: 'store-review-disposable-deletion-diagnostic',
  status: 'passed-disposable-account-deletion',
  capturedAt: '2026-08-11T03:00:00.000Z',
  scenario: 'accountDeletion',
  checks: {
    deletionPreflightClear: true,
    currentPasswordRequired: true,
    accountDeletionAccepted: true,
    deletedCredentialsRejected: true,
    privateVaultCredentialsScrubbed: true,
  },
  environment: {
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  },
  boundaries: {
    disposableSyntheticAccountDeleted: true,
    reviewerAccountsDeleted: false,
    syntheticAccountsOnly: true,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsAccountIdentifiers: false,
    containsFixtureIdentifiers: false,
    publicStoreChanged: false,
    productionChanged: false,
  },
};

function clone(value) { return structuredClone(value); }
function propagationEvidence() {
  const evidence = clone(currentRolloverEvidence);
  evidence.status = 'review-candidate-rollover-store-propagation-pending';
  evidence.checks.exactLocalCandidateInstalled = true;
  evidence.checks.twoAccountFlowTimePassed = true;
  evidence.checks.exactPlayCandidateInstalled = false;
  evidence.checks.playInstallerObservedOnSupersededBuild = true;
  evidence.checks.authenticatedSessionRestorePassedOnLocalCandidate = true;
  evidence.checks.stagingFeedPassedOnLocalCandidate = true;
  return evidence;
}
function validate({
  review = clone(baseReview),
  device = clone(baseDevice),
  submission = clone(baseSubmission),
  evidence = clone(currentEvidence),
  safetyEvidence = null,
  deletionEvidence = null,
  technicalPass = false,
  requireReady = false,
} = {}) {
  if (technicalPass) {
    review.technicalAccess.status = 'passed';
    for (const role of review.roles) role.status = 'verified';
    for (const key of ['ownerLogin', 'renterLogin', 'activeListing', 'acceptedBooking', 'sharedChat']) {
      review.reviewScenarios[key] = 'passed';
    }
  }
  return validateStoreReviewAccess({
    root: repositoryRoot,
    reviewManifest: review,
    deviceManifest: device,
    submissionManifest: submission,
    evidenceOverride: evidence,
    safetyEvidenceOverride: safetyEvidence,
    deletionEvidenceOverride: deletionEvidence,
    requireReady,
  });
}

test('accepts the honest current partial review readiness with two scenarios pending', () => {
  const result = validate();
  assert.equal(result.state, 'testing');
  assert.equal(result.readyForStore, false);
  assert.equal(result.passedScenarios, 8);
  assert.equal(result.storeGate, 'open');
});

test('rejects a propagation candidate that claims the exact Play build was installed', () => {
  const review = clone(baseReview);
  review.technicalAccess.status = 'testing';
  const evidence = propagationEvidence();
  evidence.checks.exactPlayCandidateInstalled = true;
  assert.throws(
    () => validate({ review, evidence }),
    /must preserve the local candidate checks and keep the exact Play installation pending/,
  );
});

test('rejects a fresh-install pass without matching evidence', () => {
  const review = clone(baseReview);
  review.reviewScenarios.freshInstall = 'passed';
  assert.throws(() => validate({ review }), /must match the review scenario/);
});

test('strict readiness rejects the current testing state', () => {
  assert.throws(() => validate({ requireReady: true }), /not fully ready/);
});

test('rejects a candidate or Store-gate mismatch', () => {
  const review = clone(baseReview);
  review.candidate.buildNumber = '2026081199';
  assert.throws(() => validate({ review }), /must match the device candidate/);
  const submission = clone(baseSubmission);
  submission.blockingGates.reviewAccounts = 'closed';
  assert.throws(() => validate({ submission }), /store gate must match/);
});

test('rejects credential fields and email values', () => {
  const review = clone(baseReview);
  review.reviewPassword = 'must-not-exist';
  assert.throws(() => validate({ review }), /sensitive account or credential data/);
  const evidence = clone(currentEvidence);
  evidence.note = 'reviewer@example.test';
  assert.throws(() => validate({ evidence }), /must not contain an email address/);
});

test('rejects incomplete technical evidence', () => {
  const evidence = clone(passedEvidence);
  evidence.checks.sharedChatReadableByBothRoles = false;
  assert.throws(() => validate({ evidence, technicalPass: true }), /must be true/);
});

test('requires bounded mutations to be disclosed while a fixture is refreshed', () => {
  const review = clone(baseReview);
  review.technicalAccess.status = 'testing';
  review.reviewScenarios.acceptedBooking = 'pending';
  review.reviewScenarios.sharedChat = 'pending';
  const evidence = clone(pendingEvidence);
  evidence.candidate = clone(baseReview.candidate);
  evidence.boundaries.businessDataMutations = false;
  assert.throws(
    () => validate({ review, evidence }),
    /must disclose its bounded synthetic Staging mutations/,
  );
});

test('rejects incomplete safety action evidence', () => {
  const review = clone(baseReview);
  review.reviewScenarios.reportAndBlock = 'passed';
  review.reviewScenarios.accountExport = 'passed';
  review.scenarioEvidence.safetyActions.status = 'passed';
  review.scenarioEvidence.safetyActions.evidenceRef =
    'docs/evidence/b11/store-review-safety-actions-20260811.json';
  const safetyEvidence = clone(JSON.parse(readFileSync(resolve(
    repositoryRoot,
    'docs/evidence/b11/store-review-safety-actions-20260811.json',
  ))));
  safetyEvidence.checks.sharedChatRestored = false;
  assert.throws(() => validate({ review, safetyEvidence }), /must be true/);
});

test('accepts a complete internally consistent ready fixture', () => {
  const review = clone(baseReview);
  const device = clone(baseDevice);
  const submission = clone(baseSubmission);
  const historicalCandidate = {
    applicationId: 'com.shareittoo.app',
    bundleId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: '2026081505',
    commit: '3908f5a3c300c1125c120c832f3050eea7a0a762',
  };
  Object.assign(review.candidate, historicalCandidate);
  Object.assign(device.candidate, historicalCandidate);
  review.state = 'passed';
  review.readyForStore = true;
  for (const key of Object.keys(review.reviewScenarios)) review.reviewScenarios[key] = 'passed';
  review.protectedStoreFields.googlePlay = 'passed';
  review.protectedStoreFields.appStoreConnect = 'passed';
  review.scenarioEvidence.accountDeletion.status = 'passed';
  review.scenarioEvidence.accountDeletion.evidenceRef = 'docs/evidence/b11/store-review-disposable-deletion-20260811.json';
  review.scenarioEvidence.freshInstall.status = 'passed';
  review.scenarioEvidence.freshInstall.evidenceRef =
    'docs/evidence/b11/android-fresh-install-2026081505-20260815T054742Z.json';
  review.scenarioEvidence.safetyActions.status = 'passed';
  review.scenarioEvidence.safetyActions.evidenceRef =
    'docs/evidence/b11/store-review-safety-actions-2026081505-20260815T043857Z.json';
  review.storeGate.status = 'closed';
  submission.blockingGates.reviewAccounts = 'closed';
  const technicalEvidence = clone(passedEvidence);
  technicalEvidence.candidate = historicalCandidate;
  const result = validate({
    review,
    device,
    submission,
    evidence: technicalEvidence,
    deletionEvidence: clone(passedDeletionEvidence),
    technicalPass: true,
    requireReady: true,
  });
  assert.equal(result.readyForStore, true);
});
