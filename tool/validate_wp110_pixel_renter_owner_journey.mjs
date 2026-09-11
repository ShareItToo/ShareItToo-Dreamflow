#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp110-pixel-renter-owner-journey-20260911.json';
const rolloverPath = 'store/google-play/current-rollover-candidate.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`WP110 ${label} is invalid.`);
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

function assertNoRuntimeDrift(repositoryRoot, sourceHead) {
  const changed = execFileSync('git', [
    'diff', '--name-only', `${sourceHead}..HEAD`, '--',
    'lib', 'android', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('runtime paths changed after the candidate source.');
}

export function validateWp110PixelRenterOwnerJourney({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const current = rollover ?? JSON.parse(readFileSync(resolve(repositoryRoot, rolloverPath), 'utf8'));
  const sourceHead = '5d8b89c82926a9f0a28627a7f36d26a88a9574fe';
  const technicalHead = 'cbe62931b79964465f2d3956afd3f698dd4c6dea';

  exact(value?.schemaVersion, 1, 'schemaVersion');
  exact(value.workPackage, 'WP110_PIXEL_RENTER_OWNER_JOURNEY', 'workPackage');
  exact(value.status, 'pixel-current-candidate-nonbinding-renter-owner-complete', 'status');
  exact(value.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.repository?.bookingHistoryFixHead,
    '12cac3fbe469030dd9a887b5eb9edf69252c2e7b', 'booking-history fix');
  exact(value.repository?.artifactSourceHead, sourceHead, 'artifact source');
  exact(value.repository?.technicalHead, technicalHead, 'technical head');
  exact(JSON.stringify(value.repository?.runtimePathsChangedAfterArtifactSource), '[]',
    'runtime drift record');

  const candidate = value.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'applicationId');
  exact(candidate?.versionName, '1.0.0', 'versionName');
  exact(candidate?.versionCode, '2026091109', 'versionCode');
  exact(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'API URL');
  exact(candidate?.apkSha256,
    '381cbb6766772c2fba4f093913bf366e6bfe1deb0af7b7ae5efe2ae694cd21cf',
    'APK digest');
  exact(candidate?.aabSha256,
    'b5f8531744035daa1801d7821d4c42feb5bafd217ffb54ec3c128a369777c9c7',
    'AAB digest');
  exact(candidate?.uploadCertificateSha256,
    '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    'upload certificate');
  exact(candidate?.signatureVerified, true, 'signature result');
  exact(candidate?.paymentMode, 'memory', 'payment mode');
  exact(candidate?.stripeLivemode, false, 'Stripe live mode');
  exact(candidate?.externalListingAiEnabled, false, 'external listing AI hold');

  exact(current?.candidate?.artifactSourceHead, sourceHead, 'rollover source');
  exact(current?.candidate?.versionCode, candidate.versionCode, 'rollover version');
  exact(current?.artifact?.apkSha256, candidate.apkSha256, 'rollover APK');
  exact(current?.artifact?.aabSha256, candidate.aabSha256, 'rollover AAB');
  exact(current?.evidenceRef, evidencePath, 'rollover evidence reference');
  exact(current?.handoverRef,
    'docs/operations/WP110_PIXEL_RENTER_OWNER_JOURNEY_2026-09-11.md',
    'rollover handover reference');

  exact(value.staging?.sourceHead, technicalHead, 'Staging source');
  exact(value.staging?.imageDigest,
    'sha256:ac550be1b11d50323e75bd7d0967e2003ed92d5e0f30a05491a7c2123d783fb9',
    'Staging image digest');
  exact(value.staging?.apiHealthy, true, 'Staging API health');
  exact(value.staging?.databaseHealthy, true, 'Staging database health');
  exact(value.staging?.containerRestartCount, 0, 'Staging restart count');
  exact(value.staging?.realPaymentsEnabled, false, 'Staging real payment hold');

  const pixel = value.pixel;
  exact(pixel?.exactInstalledCandidateMatched, true, 'Pixel candidate match');
  exact(pixel?.dataPreservingUpdate, true, 'Pixel data preservation');
  exact(pixel?.primaryTwoRoleJourney?.status,
    'passed-pixel-email-verified-two-role-product-journey', 'primary journey');
  for (const key of [
    'distinctEmailVerifiedPrincipals', 'ownerDraftPublishServerConfirmed',
    'renterPublicDiscovery', 'nonBindingRequestAcceptanceSimulation',
    'renterVisibleChat', 'fcmForeground', 'fcmBackground', 'fcmTerminated',
    'accountIsolation', 'protectedOwnerRestored',
  ]) exact(pixel.primaryTwoRoleJourney[key], true, `primary journey ${key}`);
  exact(pixel.primaryTwoRoleJourney.statusIconManualVisualReview,
    'pending-private-owner-review', 'FCM visual review truth');
  exact(pixel.listingLifecycle?.status, 'passed-pixel-listing-lifecycle',
    'listing lifecycle');
  exact(pixel.searchAndSaved?.status, 'passed-pixel-search-saved-lifecycle',
    'search and saved lifecycle');
  exact(pixel.rentalCartAndProjects?.status, 'passed-pixel-rental-cart-project-lifecycle',
    'cart and project lifecycle');
  exact(pixel.messagingMediaTimesAndLocation?.status,
    'pixel-attachment-and-two-party-times-passed-location-gate-closed',
    'messaging lifecycle');
  exact(pixel.messagingMediaTimesAndLocation.locationMessageCreatedBeforeRevealWindow,
    false, 'premature location result');
  exact(pixel.offlineRealtime?.status, 'passed-bounded-offline-realtime-diagnostic',
    'offline realtime lifecycle');
  exact(pixel.offlineRealtime.originalNetworkRestored, true, 'network restoration');

  const cleanup = value.cleanup;
  exact(cleanup?.allExactFixtureListingsEndedAndPubliclyAbsent, true,
    'exact listing cleanup');
  exact(cleanup?.temporaryBookingsCancelled, true, 'booking cleanup');
  exact(cleanup?.temporaryDeviceMediaRemoved, true, 'media cleanup');
  exact(cleanup?.protectedOwnerSessionRestored, true, 'owner restoration');
  exact(cleanup?.publicCatalogCountBefore, 1, 'catalog baseline');
  exact(cleanup?.publicCatalogCountAfter, 1, 'catalog readback');
  exact(cleanup?.remainingPublicListingAttributedToWp110, false,
    'remaining public listing attribution');
  exact(cleanup?.unrelatedPublicListingInspectedOrChanged, false,
    'unrelated listing boundary');

  exact(value.verification?.localTechnicalHead, technicalHead, 'local regression head');
  exact(value.verification?.githubRegression?.runId, 34595796885, 'Regression run');
  exact(value.verification?.githubRegression?.head, technicalHead, 'Regression head');
  exact(value.verification?.githubRegression?.conclusion, 'success', 'Regression result');
  exact(value.verification?.githubRegression?.cleanCheckoutJob, 'success',
    'clean checkout result');
  exact(value.verification?.githubCodeql?.runId, 34595796884, 'CodeQL run');
  exact(value.verification?.githubCodeql?.head, technicalHead, 'CodeQL head');
  exact(value.verification?.githubCodeql?.conclusion, 'success', 'CodeQL result');
  exact(value.verification?.githubApiImagePublish?.runId, 34597332701,
    'image publication run');
  exact(value.verification?.githubApiImagePublish?.head, technicalHead,
    'image publication head');
  exact(value.verification?.githubApiImagePublish?.publishJob, 'success',
    'image publication job');
  exact(value.verification?.openCodeScanningAlerts, 0, 'code-scanning alerts');
  exact(value.verification?.pullRequest7, 'draft-open-mergeable-unmerged', 'PR boundary');

  for (const [key, result] of Object.entries(value.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  if (!Array.isArray(value.remaining) || value.remaining.length !== 5) {
    fail('WP110 remaining gate inventory is incomplete.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP110 evidence contains private or secret-shaped content.');
  }
  if (checkGitState) {
    assertAncestor(repositoryRoot, value.repository.bookingHistoryFixHead);
    assertAncestor(repositoryRoot, sourceHead);
    assertAncestor(repositoryRoot, technicalHead);
    assertNoRuntimeDrift(repositoryRoot, sourceHead);
  }
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    exactPixelRenterOwnerJourneyPassed: true,
    exactFixtureCleanupPassed: true,
    publicCatalogBaselinePreserved: true,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(validateWp110PixelRenterOwnerJourney(), null, 2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
