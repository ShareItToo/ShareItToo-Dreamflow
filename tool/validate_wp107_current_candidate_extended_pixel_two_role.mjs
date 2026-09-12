#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp107-current-candidate-extended-pixel-two-role-20260911.json';

function fail(message) {
  throw new Error(message);
}

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP107 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function assertNoRuntimeDrift(repositoryRoot, sourceHead) {
  const changed = execFileSync('git', [
    'diff', '--name-only', `${sourceHead}..HEAD`, '--',
    'lib', 'android', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('WP107 runtime paths changed after the artifact source.');
}

export function validateWp107CurrentCandidateExtendedPixelTwoRole({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  const implementationHead = '79f7985f85ce6826c89f10dc7bab5cf905118913';
  if (value?.schemaVersion !== 1
      || value.workPackage !== 'WP107_CURRENT_CANDIDATE_EXTENDED_PIXEL_TWO_ROLE'
      || ![
        'pixel-payment-free-two-role-complete-binding-legal-hold-regression-pending',
        'pixel-payment-free-two-role-complete-binding-legal-hold-local-complete-github-pending',
        'pixel-payment-free-two-role-complete-binding-legal-hold-local-github-complete',
      ].includes(value.status)) {
    fail('WP107 identity or status is invalid.');
  }
  if (value.repository?.branch !== 'codex/master-workflow-20260808'
      || value.repository.packageBaseHead !== '5b2c59d9eb85750a1fe5e33f8d2548d6342f0775'
      || value.repository.artifactSourceHead !== '67c4e2ebe4ceead7529c4f02ca1209d71c66fe25'
      || JSON.stringify(value.repository.runtimePathsChangedAfterArtifactSource) !== '[]') {
    fail('WP107 repository binding is invalid.');
  }
  if (value.candidate?.applicationId !== 'com.shareittoo.app'
      || value.candidate.versionName !== '1.0.0'
      || value.candidate.versionCode !== '2026091101'
      || value.candidate.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || value.candidate.apkSha256 !== '6382cc593ce995abce93c51fc117ba649f9d8c2194a421875923686ed657a9c7'
      || value.candidate.aabSha256 !== '9aab79539a54601ad309bde057d0f938dbf54aa30ff8353796574aad5dbd9a91'
      || value.candidate.uploadCertificateSha256 !== '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4'
      || value.candidate.paymentMode !== 'memory'
      || value.candidate.stripeLivemode !== false
      || value.candidate.externalListingAiEnabled !== false) {
    fail('WP107 candidate binding is invalid.');
  }
  const pixel = value.pixel;
  if (pixel?.exactInstalledCandidateMatched !== true
      || pixel.listingLifecycle?.status !== 'passed-pixel-listing-lifecycle'
      || pixel.searchAndSaved?.status !== 'passed-pixel-search-saved-lifecycle'
      || pixel.searchAndSaved.firstRunCleanupConfirmed !== true
      || pixel.searchAndSaved.unchangedDeterministicRerunPassed !== true
      || pixel.rentalCartAndProjects?.status !== 'passed-pixel-rental-cart-project-lifecycle'
      || pixel.messagingMediaTimesAndLocation?.status
        !== 'pixel-attachment-and-two-party-times-passed-location-gate-closed'
      || pixel.messagingMediaTimesAndLocation.locationBeforeRevealWindowBlockedByServer !== true
      || pixel.messagingMediaTimesAndLocation.locationMessageCreatedBeforeRevealWindow !== false
      || pixel.offlineRealtime?.status !== 'passed-bounded-offline-realtime-diagnostic'
      || pixel.offlineRealtime.originalNetworkRestored !== true
      || pixel.finalReadback?.protectedOwnerSessionRestored !== true
      || pixel.finalReadback.publicStagingListingCount !== 0) {
    fail('WP107 Pixel evidence is incomplete or overstated.');
  }
  if (value.safetyAndBindingBoundaries?.bindingAcceptanceProbe
        !== 'stopped-http-409-v52_contract_documents_unavailable'
      || value.safetyAndBindingBoundaries.bindingAcceptanceClassifiedAsSuccess !== false
      || value.safetyAndBindingBoundaries.professionalLegalSnapshotsRequired !== true
      || value.safetyAndBindingBoundaries.returnDamageLifecycleStarted !== false
      || value.safetyAndBindingBoundaries.reviewLifecycleStarted !== false) {
    fail('WP107 binding/legal boundary is invalid.');
  }
  if (value.cleanup?.protectedSourceVaultUnchanged !== true
      || value.cleanup.temporaryListingsEnded !== true
      || value.cleanup.temporaryBookingsCancelled !== true
      || value.cleanup.temporaryDeviceMediaRemoved !== true
      || value.cleanup.publicStagingCatalogEmpty !== true
      || value.cleanup.protectedOwnerSessionRestored !== true) {
    fail('WP107 cleanup is incomplete.');
  }
  const forbiddenTrue = [
    'contractCreated', 'reservationCreated', 'paymentEndpointCalled', 'realMoneyUsed',
    'productionChanged', 'googlePlayChanged', 'testerListChanged',
    'firebaseProjectChanged', 'cloudVpsDnsChanged', 'publicRegistrationChanged',
    'onePlusContacted', 'pullRequestMerged', 'containsSecrets', 'containsAccountIdentity',
    'containsRawDeviceIdentifiers', 'containsPrivateFilesystemPath', 'containsFixtureIdentifiers',
  ];
  if (forbiddenTrue.some((key) => value.boundaries?.[key] !== false)) {
    fail('WP107 safety boundary is invalid.');
  }
  if (!Array.isArray(value.remaining) || value.remaining.length !== 4) {
    fail('WP107 remaining gate inventory is incomplete.');
  }
  if (value.status === 'pixel-payment-free-two-role-complete-binding-legal-hold-local-github-complete') {
    if (value.repository?.implementationHead !== implementationHead
        || value.verification?.githubRegression?.runId !== 34555758947
        || value.verification.githubRegression.head !== implementationHead
        || value.verification.githubRegression.conclusion !== 'success'
        || value.verification.githubRegression.cleanCheckoutJob !== 'success'
        || value.verification?.githubCodeql?.runId !== 34555758981
        || value.verification.githubCodeql.head !== implementationHead
        || value.verification.githubCodeql.conclusion !== 'success'
        || value.verification.openCodeScanningAlerts !== 0
        || value.verification.pullRequest7 !== 'draft-open-mergeable-unmerged') {
      fail('WP107 GitHub closure evidence is incomplete or mismatched.');
    }
  }
  if (checkGitState) {
    assertAncestor(repositoryRoot, value.repository.packageBaseHead);
    assertAncestor(repositoryRoot, value.repository.artifactSourceHead);
    assertNoRuntimeDrift(repositoryRoot, value.repository.artifactSourceHead);
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP107 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    physicalPaymentFreeTwoRolePassed: true,
    bindingLegalHoldClosed: true,
    publicCatalogEmpty: true,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(validateWp107CurrentCandidateExtendedPixelTwoRole(), null, 2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
