#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp114-current-candidate-complete-pixel-renter-owner-20260911.json';
const rolloverPath = 'store/google-play/rollover-candidate-2026091110.json';
const handoverPath =
  'docs/operations/WP114_CURRENT_CANDIDATE_COMPLETE_PIXEL_RENTER_OWNER_2026-09-11.md';
const directSuccessorEvidencePath =
  'docs/evidence/release-readiness/wp115-current-candidate-pixel-on-device-listing-ai-20260911.json';
const directSuccessorHandoverPath =
  'docs/operations/WP115_CURRENT_CANDIDATE_PIXEL_ON_DEVICE_LISTING_AI_REPLAY_2026-09-11.md';
const artifactSourceHead = 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b';
const backendRuntimeHead = 'df39a14b7a19afe467842461a28f1e77fec8445e';
const implementationHead = '1d053ff28122aefb3e3b0dd618e356c870ebfb7f';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`WP114 ${label} is invalid.`);
}

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`commit is not an ancestor of HEAD: ${commit}`);
  }
}

function assertNoRuntimeDrift(repositoryRoot) {
  const changed = execFileSync('git', [
    'diff', '--name-only', `${artifactSourceHead}..${implementationHead}`, '--',
    'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock',
    'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('runtime paths changed after the candidate source.');
}

export function validateWp114CurrentCandidateCompletePixelRenterOwner({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const current = rollover ?? JSON.parse(readFileSync(resolve(repositoryRoot, rolloverPath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.workPackage, 'WP114_CURRENT_CANDIDATE_COMPLETE_PIXEL_RENTER_OWNER',
    'work package');
  exact(value?.status, 'pixel-current-candidate-complete-nonbinding-renter-owner-matrix',
    'status');
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.artifactSourceHead, artifactSourceHead, 'artifact source');
  exact(value?.repository?.backendRuntimeHead, backendRuntimeHead, 'Backend runtime head');
  exact(value?.repository?.diagnosticImplementationHead, implementationHead,
    'implementation head');
  exact(JSON.stringify(value?.repository?.runtimePathsChangedBetweenArtifactAndBackend), '[]',
    'runtime drift record');

  const candidate = value.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(candidate?.versionName, '1.0.0', 'version name');
  exact(candidate?.versionCode, '2026091110', 'version code');
  exact(candidate?.apkSha256,
    '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
    'APK digest');
  exact(candidate?.aabSha256,
    '20aa73271fb9ce51c33bf4025c6c235424a1f575503261c4021f8b817da0fdfb',
    'AAB digest');
  exact(candidate?.uploadCertificateSha256,
    '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    'signing certificate');
  exact(candidate?.signatureVerified, true, 'signature');
  exact(candidate?.paymentMode, 'memory', 'payment mode');
  exact(candidate?.stripeLivemode, false, 'Stripe live mode');

  exact(current?.candidate?.artifactSourceHead, artifactSourceHead, 'rollover source');
  exact(current?.candidate?.versionCode, candidate.versionCode, 'rollover version');
  exact(current?.artifact?.apkSha256, candidate.apkSha256, 'rollover APK');
  exact(current?.artifact?.aabSha256, candidate.aabSha256, 'rollover AAB');
  const rolloverReferencePair = `${current?.evidenceRef ?? ''}|${current?.handoverRef ?? ''}`;
  const allowedRolloverReferencePairs = new Set([
    `${evidencePath}|${handoverPath}`,
    `${directSuccessorEvidencePath}|${directSuccessorHandoverPath}`,
  ]);
  if (!allowedRolloverReferencePairs.has(rolloverReferencePair)) {
    fail('WP114 rollover evidence reference is invalid.');
  }
  if (current?.evidenceRef === directSuccessorEvidencePath) {
    exact(current?.deviceVerification?.onDeviceListingAiPhysicalInference,
      'passed-physical-pixel-current-candidate', 'direct successor physical inference');
  }
  exact(current?.deviceVerification?.preferredDeviceExactApkInstalled, true,
    'rollover Pixel installation');

  exact(value?.staging?.sourceHead, backendRuntimeHead, 'Staging source');
  exact(value?.staging?.imageDigest,
    'sha256:4d440d9481369b477b9495f5cefa419783f974ff35438c3490e54b42322ddfd6',
    'Staging image');
  for (const key of ['apiHealthy', 'databaseHealthy', 'fcmEnabled', 'smtpEnabled']) {
    exact(value.staging[key], true, `Staging ${key}`);
  }
  exact(value.staging?.containerRestartCount, 0, 'Staging restarts');
  exact(value.staging?.paymentProvider, 'memory', 'Staging payment provider');
  exact(value.staging?.realPaymentsEnabled, false, 'Staging real payment hold');

  const pixel = value.pixel;
  exact(pixel?.exactInstalledCandidateMatched, true, 'installed candidate');
  exact(pixel?.dataPreservingUpdate, true, 'data-preserving update');
  exact(pixel?.primaryTwoRoleJourney?.status,
    'passed-pixel-email-verified-two-role-product-journey', 'primary journey');
  for (const key of [
    'distinctEmailVerifiedPrincipals', 'ownerDraftPublishThroughPixelUi',
    'ownerDraftPublishServerConfirmed', 'renterPublicDiscovery',
    'nonBindingRequestAcceptanceSimulation', 'renterVisibleChat', 'fcmForeground',
    'fcmBackground', 'fcmTerminated', 'accountIsolation', 'protectedOwnerRestored',
  ]) exact(pixel.primaryTwoRoleJourney[key], true, `primary ${key}`);
  exact(pixel.primaryTwoRoleJourney?.statusIconManualVisualReview,
    'passed-private-capture-brand-icon-clear', 'notification icon review');
  exact(pixel?.listingLifecycle?.status, 'passed-pixel-listing-lifecycle',
    'listing lifecycle');
  exact(pixel?.searchAndSaved?.status, 'passed-pixel-search-saved-lifecycle',
    'search and saved');
  exact(pixel?.rentalCartAndProjects?.status, 'passed-pixel-rental-cart-project-lifecycle',
    'cart and projects');
  exact(pixel?.messagingMediaTimesAndLocation?.status,
    'pixel-attachment-and-two-party-times-passed-location-gate-closed',
    'messaging and location');
  exact(pixel.messagingMediaTimesAndLocation?.locationMessageCreatedBeforeRevealWindow,
    false, 'premature location message');
  exact(pixel?.privacyExport?.status,
    'passed-exact-current-principal-export-and-complete-cleanup', 'privacy export');
  exact(pixel.privacyExport?.forbiddenCredentialKeyCount, 0,
    'privacy export credential result');
  exact(pixel?.offlineRealtime?.status, 'passed-bounded-offline-realtime-diagnostic',
    'offline realtime');
  exact(pixel.offlineRealtime?.consecutiveFreshPassingRuns, 2,
    'offline repeatability');
  exact(pixel.offlineRealtime?.originalNetworkRestored, true, 'network restoration');

  for (const key of [
    'allExactFixtureListingsEndedAndPubliclyAbsent', 'temporaryBookingsCancelled',
    'temporaryDeviceMediaRemoved', 'temporaryPrivacyReceiverRemoved',
    'protectedOwnerSessionRestored',
  ]) exact(value.cleanup?.[key], true, `cleanup ${key}`);
  exact(value.cleanup?.activeTemporaryJourneyCount, 0, 'active journey cleanup');
  exact(value.cleanup?.publicSyntheticJourneyListingCountAfter, 0,
    'public synthetic listing cleanup');
  exact(value.cleanup?.unrelatedPublicListingInspectedOrChanged, false,
    'unrelated listing boundary');

  exact(value.verification?.preDeploymentGithubRegression?.conclusion, 'success',
    'pre-deployment regression');
  exact(value.verification?.preDeploymentGithubCodeql?.conclusion, 'success',
    'pre-deployment CodeQL');
  exact(value.verification?.diagnosticImplementationLocalRegression, 'passed',
    'implementation local regression');
  exact(value.verification?.diagnosticImplementationGithubRegression?.runId,
    34636449790, 'implementation Regression run');
  exact(value.verification?.diagnosticImplementationGithubRegression?.head,
    implementationHead, 'implementation Regression head');
  exact(value.verification?.diagnosticImplementationGithubRegression?.conclusion,
    'success', 'implementation Regression result');
  exact(value.verification?.diagnosticImplementationGithubRegression?.cleanCheckoutJob,
    'success', 'implementation clean checkout');
  exact(value.verification?.diagnosticImplementationGithubCodeql?.runId,
    34636449862, 'implementation CodeQL run');
  exact(value.verification?.diagnosticImplementationGithubCodeql?.head,
    implementationHead, 'implementation CodeQL head');
  exact(value.verification?.diagnosticImplementationGithubCodeql?.conclusion,
    'success', 'implementation CodeQL result');
  exact(value.verification?.openCodeScanningAlerts, 0, 'code scanning alerts');
  exact(value.verification?.pullRequest7, 'draft-open-mergeable-unmerged', 'PR boundary');

  for (const [key, result] of Object.entries(value.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  const remaining = [
    'professional-v52-legal-snapshots-and-owner-approval',
    'binding-booking-pickup-return-damage-needs-review-review-replay',
    'official-stripe-sandbox-payment-refund-and-simulated-payout',
    'exact-current-candidate-on-device-listing-ai-replay',
    'separate-oneplus-exact-candidate-two-device-replay',
  ];
  exact(JSON.stringify([...(value.remaining ?? [])].sort()), JSON.stringify([...remaining].sort()),
    'remaining gate inventory');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu
    .test(serialized)) {
    fail('WP114 evidence contains private or secret-shaped content.');
  }
  if (checkGitState) {
    for (const commit of [artifactSourceHead, backendRuntimeHead, implementationHead]) {
      assertAncestor(repositoryRoot, commit);
    }
    assertNoRuntimeDrift(repositoryRoot);
  }
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    completePixelMatrixPassed: true,
    privacyExportPassed: true,
    cleanupPassed: true,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(validateWp114CurrentCandidateCompletePixelRenterOwner(), null, 2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
