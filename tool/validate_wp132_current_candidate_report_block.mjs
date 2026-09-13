#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp132-current-candidate-report-block-20260913.json';
const rolloverPath = 'store/google-play/current-rollover-candidate.json';
const candidateHead = 'abf911d1c944a4e5874269111985d0cc4736546e';
const wp131ClosureHead = 'ef17b775019be82fdf22d3b7eb87d012730d8c7d';
const diagnosticHead = '32366382b0ffcce477b5101d6529edd0f9ccff90';
const runtimeRoots = [
  'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
];
const sourcePaths = [
  'lib/screens/public_profile_screen.dart',
  'lib/screens/search_results_screen.dart',
  'lib/services/data_service.dart',
  'lib/services/latest_search_recompute.dart',
  'lib/services/profile_ecosystem_service.dart',
  'lib/widgets/listing_options_dialog.dart',
  'lib/widgets/search_overlay.dart',
  'tool/diagnose_android_current_candidate_report_block.mjs',
  'test/tool/diagnose_android_current_candidate_report_block.test.mjs',
  'tool/run_staging_report_block_fixture.mjs',
  'test/tool/run_staging_report_block_fixture.test.mjs',
];

function fail(message) { throw new Error(message); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`WP132 ${label} is invalid.`);
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial|vaultfile)$/iu.test(key)) {
      fail(`WP132 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP132 head is not an ancestor of HEAD: ${head}`);
  }
}

function validateSourceInventory(repositoryRoot, inventory) {
  exact(inventory?.map((item) => item.path), sourcePaths, 'source inventory');
  for (const item of inventory) {
    if (!/^[a-f0-9]{64}$/u.test(item?.sha256 ?? '')
        || digest(readFileSync(resolve(repositoryRoot, item.path))) !== item.sha256) {
      fail(`WP132 source digest drift: ${item?.path ?? 'unknown'}.`);
    }
  }
}

export function validateWp132CurrentCandidateReportBlock({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const pointer = rollover
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, rolloverPath), 'utf8'));
  rejectPrivateShape(value);
  if (/(?:\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b|\bn22-)/iu.test(JSON.stringify(value))) {
    fail('WP132 evidence contains private, secret or fixture-shaped content.');
  }
  exact([
    value.schemaVersion,
    value.kind,
    value.status,
    value.capturedAt,
    value.workPackage,
  ], [
    1,
    'sit-wp132-current-candidate-report-block',
    'complete-exact-current-report-block',
    '2026-09-13T04:36:43.893Z',
    'WP132',
  ], 'identity');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    wp131ClosureHead,
    candidateSourceHead: candidateHead,
    diagnosticHead,
    applicationRuntimePathsChangedAfterCandidateSource: [],
  }, 'repository binding');
  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091309',
    releaseChannel: 'internal',
    environment: 'staging',
    delivery: 'direct-apk',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    apkSha256: '6f688e3641f54da91caf0e4f7c039f192a0c4e481b3ebb98ac3b2723cbe27ddf',
    aabSha256: '6fc8164cd7a941da83aa104e1a238c4b1725c983dab6bb7651fd3f9880bbcb04',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    physicalPixelPackageMatched: true,
    dataPreservingInstallPassed: true,
  }, 'candidate binding');
  exact(value.device, {
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  }, 'device proof');
  exact(value.physicalLifecycle, {
    reportSubmittedThroughExactListingUi: true,
    reportAcceptedExactlyOnce: true,
    ownerBlockedThroughOwnerBoundUi: true,
    serverConfirmedExactBlockCount: 1,
    bothSameOwnerListingsHiddenForReporter: true,
    exactCancelledChatHiddenForReporter: true,
    blockedUsersEntryVisible: true,
    ownerUnblockedThroughExactEntryUi: true,
    serverConfirmedEmptyBlockTruth: true,
    bothSameOwnerListingsVisibleAgain: true,
    exactSearchesUsedRunBoundTitles: true,
    globalCatalogListingsRemainedPublicWhileReporterBlockApplied: true,
  }, 'physical lifecycle');
  exact(value.cleanup, {
    exactListingsEnded: 3,
    exactListingsAbsentFromPublicCatalog: 3,
    temporaryBlockRemoved: true,
    moderationReportRetainedAsAudit: true,
    exactRoleSessionsRevoked: true,
    protectedOwnerSessionRestored: true,
    recoveryRequired: false,
    paymentEndpointCalled: false,
    contractCreated: false,
    reservationCreated: false,
    monetaryEffectMinor: 0,
  }, 'cleanup');
  const journal = value.privateJournal;
  if (journal?.status !== 'complete-restored'
      || journal.mode !== '0600'
      || !/^[a-f0-9]{64}$/u.test(journal.sha256 ?? '')
      || Object.entries(journal)
        .filter(([key]) => key.startsWith('contains') || key === 'recoveryRequired')
        .some(([, entry]) => entry !== false)) {
    fail('WP132 private journal is invalid.');
  }
  exact(value.portfolioEffect, {
    promotedRequirement: 'support-report-block',
    affectedRequirementHeldPartial: 'search-filter-favorites-wishlists',
    passCount: 16,
    partialCount: 8,
    openCount: 8,
    totalCount: 32,
    releaseDecision: 'hold-not-production-ready',
  }, 'portfolio effect');
  exact(value.verification, {
    focusedNodeTests: 'passed',
    focusedFlutterTests: 'passed',
    fullLocalRegression: 'success',
    webWasmLoopbackAndroidBuildPassed: true,
    exactHeadGithubRegressionRequired: true,
    exactHeadCodeqlRequired: true,
  }, 'verification');
  validateSourceInventory(repositoryRoot, value.sourceInventory);
  if (!Array.isArray(value.technicalDebt) || value.technicalDebt.length !== 2
      || value.technicalDebt.some((entry) => typeof entry !== 'string' || entry.length < 180)) {
    fail('WP132 technical-debt record is incomplete.');
  }
  exact(value.boundaries, {
    applicationRuntimeChangedAfterCandidateBuild: false,
    backendRuntimeChanged: false,
    stagingSyntheticDataMutated: true,
    stagingSyntheticDataRestored: true,
    moderationAuditRetained: true,
    productionChanged: false,
    googlePlayChanged: false,
    testerListChanged: false,
    firebaseProjectChanged: false,
    paymentProviderCalled: false,
    realMoneyUsed: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    credentialRecorded: false,
    accountIdentityRecorded: false,
    fixtureIdentifierRecorded: false,
    privateFilesystemPathRecorded: false,
    rawDeviceIdentifierRecorded: false,
  }, 'authorization boundary');
  exact({
    applicationId: pointer?.candidate?.applicationId,
    versionName: pointer?.candidate?.versionName,
    versionCode: pointer?.candidate?.versionCode,
    artifactSourceHead: pointer?.candidate?.artifactSourceHead,
    apkSha256: pointer?.artifact?.apkSha256,
    aabSha256: pointer?.artifact?.aabSha256,
    uploadCertificateSha256: pointer?.artifact?.uploadCertificateSha256,
    installed: pointer?.deviceVerification?.preferredDeviceExactApkInstalled,
    dataPreserved: pointer?.deviceVerification?.preferredDeviceDataPreserved,
    matrix: pointer?.deviceVerification?.authenticatedPilotMatrix,
    secondaryDevice: pointer?.deviceVerification?.secondaryDevice,
    evidenceRef: pointer?.evidenceRef,
  }, {
    applicationId: value.candidate.applicationId,
    versionName: value.candidate.versionName,
    versionCode: value.candidate.versionCode,
    artifactSourceHead: value.repository.candidateSourceHead,
    apkSha256: value.candidate.apkSha256,
    aabSha256: value.candidate.aabSha256,
    uploadCertificateSha256: value.candidate.uploadCertificateSha256,
    installed: true,
    dataPreserved: true,
    matrix: 'partial-exact-current-report-block-passed-search-saved-replay-pending',
    secondaryDevice: 'not-required-while-oneplus-disconnected',
    evidenceRef: evidencePath,
  }, 'current candidate pointer');
  if (checkGitState) {
    [candidateHead, wp131ClosureHead, diagnosticHead].forEach((head) => {
      assertAncestor(repositoryRoot, head);
    });
    const drift = execFileSync('git', [
      'diff', '--name-only', candidateHead, '--', ...runtimeRoots,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (drift !== '') fail('WP132 application runtime drifted after the signed candidate.');
  }
  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    promotedRequirement: value.portfolioEffect.promotedRequirement,
    passCount: value.portfolioEffect.passCount,
    partialCount: value.portfolioEffect.partialCount,
    openCount: value.portfolioEffect.openCount,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp132CurrentCandidateReportBlock();
    process.stdout.write(
      `WP132 report/block evidence valid: candidate=${result.versionCode}, requirement=PASS\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP132 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
