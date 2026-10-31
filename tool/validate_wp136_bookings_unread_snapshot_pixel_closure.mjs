#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp136-bookings-unread-snapshot-pixel-closure-20260913.json';
const candidateSourceHead = '7b0479c8ee679c3e428f5aad9999d582c1c8455f';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP136 ${label} is invalid.`);
  }
}

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return Buffer.from(execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail(`WP136 source is unavailable: ${path}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP136 source head is not an ancestor of HEAD: ${head}`);
  }
}

export function validateWp136BookingsUnreadSnapshotPixelClosure({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp136-bookings-unread-snapshot-pixel-closure'
      || value.status !== 'passed-exact-candidate-pixel-two-role-closure'
      || value.capturedAt !== '2026-09-13T08:57:02.217Z') {
    fail('WP136 evidence identity is invalid.');
  }

  exact(value.source?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.source?.implementationCommit,
    'c0f04b73406d4e0e1a4b9c892f71b9f9dd96a537', 'implementation commit');
  exact(value.source?.versionCommit,
    '6a7e585b67de87b6761320a635ac049786259b3d', 'version commit');
  exact(value.source?.candidateSourceCommit, candidateSourceHead, 'candidate source');
  if (checkGitState) assertAncestor(repositoryRoot, candidateSourceHead);
  for (const [path, expectedHash] of Object.entries(value.source?.sourceInventory ?? {})) {
    exact(sha256(sourceAtHead(repositoryRoot, candidateSourceHead, path)), expectedHash,
      `source hash for ${path}`);
  }
  exact(Object.keys(value.source?.sourceInventory ?? {}).sort(), [
    'lib/services/data_service.dart',
    'test/tool/validate_wp134_current_candidate_staging_support.test.mjs',
    'test/tool/wp136_booking_unread_snapshot_wiring.test.mjs',
    'test/wp136_booking_unread_snapshot_test.dart',
    'tool/validate_wp134_current_candidate_staging_support.mjs',
  ], 'source inventory');

  exact(value.defect, {
    surface: 'authenticated Bookings',
    physicalSymptom: 'loading-did-not-settle-on-predecessor-candidate',
    historicalRequestRowsInSyntheticAccount: 136,
    rootCause: 'unread-count-loop-reloaded-the-complete-authoritative-request-set-for-every-row',
    complexityBefore: 'n-full-remote-request-loads-after-one-list-load',
    complexityAfter: 'one-authoritative-snapshot-and-one-local-marker-read',
    principalSafety: 'exact-operational-user-captured-and-reasserted-before-result',
    foreignSnapshotRowHandling: 'fail-closed',
    corruptReadMarkerHandling: 'fail-closed',
  }, 'defect contract');

  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091311',
    releaseChannel: 'internal',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    apkSha256: '0488a10dd0aab85cf18ba4ea8c37193b1fdc2334bb7092efb9c0d23311a3da88',
    aabSha256: '59df237569ac71b226b3199a33d3b01b946359f894f5c9ddf09c1e7063ce1cc6',
    privacyReportSha256: 'e17e8960f25fad762eaf8f63d95f37da569e471deaafe71e09a7880fabed0503',
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    privacyScan: 'passed',
    closedPilotEnvelopeEnabled: true,
    stageAPilotId: 'heilbronn_wave0',
  }, 'candidate contract');

  exact(value.pixel, {
    physical: true,
    model: 'Pixel 7 Pro',
    installedVersionBefore: '1.0.0+2026091310',
    installedVersionAfter: '1.0.0+2026091311',
    dataPreservingReplaceUpdate: 'passed',
    installedApkHashMatched: true,
    installedCertificateMatched: true,
    firstInstallTimePreserved: true,
    applicationDataInodePreserved: true,
  }, 'Pixel contract');

  exact(value.physicalJourney, {
    distinctEmailVerifiedPrincipals: 'passed',
    ownerDraftPublishThroughPixelUi: 'passed-server-confirmed-active',
    renterPublicDiscovery: 'passed',
    requestAcceptance: 'passed-non-binding-simulation',
    bookingsSurfaceSettled: true,
    chatVisibility: 'passed-renter-visible',
    controlledFcm: 'passed-foreground-background-terminated',
    principalSwitchIsolation: 'passed-owner-absent-under-renter',
    cleanup: 'passed-booking-cancelled-listing-ended',
    protectedOwnerSessionRestored: true,
  }, 'physical journey');

  exact(value.verification, {
    focusedSnapshotTests: 'passed-500-row-count-foreign-row-and-corrupt-marker',
    nPlusOneStructuralRatchet: 'passed',
    relatedBookingAndRw6Tests: 'passed',
    privacyAndRetentionValidators: 'passed',
    fullLocalTechnicalRegression: 'passed',
    flutterAnalyzer: 'passed-zero-issues',
    webWasmBuild: 'passed',
    loopbackSmoke: 'passed',
    androidDebugBuild: 'passed-min-sdk-24',
    cleanCheckoutReproducibility: 'passed',
    githubRegressionRunId: 34748319125,
    githubRegressionConclusion: 'success',
    githubCodeqlRunId: 34748319084,
    githubCodeqlConclusion: 'success',
    openCodeScanningAlerts: 0,
  }, 'verification contract');

  const falseBoundaries = [
    'onePlusContacted', 'googlePlayChanged', 'productionChanged', 'firebaseChanged',
    'backendDeployed', 'paymentEndpointCalled', 'stripeLivemode', 'realMoneyUsed',
    'contractCreated', 'reservationCreated', 'publicRegistrationChanged',
    'pullRequestMerged', 'containsAccountIdentity', 'containsCredential',
    'containsToken', 'containsFixtureIdentifier', 'containsRawDeviceIdentifier',
    'containsPrivateFilesystemPath',
  ];
  if (falseBoundaries.some((key) => value.boundaries?.[key] !== false)
      || Object.keys(value.boundaries ?? {}).length !== falseBoundaries.length) {
    fail('WP136 boundary contract is invalid.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP136 evidence contains private or secret-shaped data.');
  }

  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    bookingsSurfaceSettled: value.physicalJourney.bookingsSurfaceSettled,
    githubRegression: value.verification.githubRegressionConclusion,
    onePlusContacted: value.boundaries.onePlusContacted,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp136BookingsUnreadSnapshotPixelClosure(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP136 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
