#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp129-current-candidate-email-registration-recovery-20260912.json';
const candidateHead = '1546812f625b4e8f1e700bf976410097cd45ac2f';
const wp128BaseHead = '41362146a2aa7bcbc39040608d1c7043a2ea9a94';
const wp129ClosureHead = '341fdf48d8c4161a84c8dd6eb9c290eea97b80b4';
const runtimeRoots = [
  'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
];
const sourcePaths = [
  'tool/diagnose_android_email_registration.mjs',
  'tool/consume_staging_email_action.mjs',
  'tool/diagnose_android_password_reset.mjs',
  'tool/restore_android_synthetic_session.mjs',
  'test/tool/diagnose_android_email_registration.test.mjs',
  'test/tool/consume_staging_email_action.test.mjs',
  'test/tool/diagnose_android_password_reset.test.mjs',
  'test/tool/restore_android_synthetic_session.test.mjs',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP129 ${label} is invalid.`);
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial|vaultfile)$/iu.test(key)) {
      fail(`WP129 evidence contains a private field at ${[...path, key].join('.')}.`);
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
    fail(`WP129 head is not an ancestor of HEAD: ${head}`);
  }
}

function validateSourceInventory(repositoryRoot, inventory) {
  if (!Array.isArray(inventory) || inventory.length !== sourcePaths.length) {
    fail('WP129 source inventory is invalid.');
  }
  const seen = new Set();
  for (const [index, item] of inventory.entries()) {
    if (typeof item?.path !== 'string' || seen.has(item.path)
        || item.path !== sourcePaths[index]
        || !/^[a-f0-9]{64}$/u.test(item?.sha256 ?? '')) {
      fail('WP129 source inventory is invalid.');
    }
    seen.add(item.path);
    let source;
    try {
      source = execFileSync('git', ['show', `${wp129ClosureHead}:${item.path}`], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      fail(`WP129 historical source is unavailable: ${item.path}.`);
    }
    exact(digest(source), item.sha256, `source digest ${item.path}`);
  }
}

export function validateWp129CurrentCandidateEmailRegistrationRecovery({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (/(?:\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b|https:\/\/staging\.shareittoo\.com\/api\/v1\/auth\/[^\s]*\?)/iu.test(JSON.stringify(value))) {
    fail('WP129 evidence contains private or secret-shaped content.');
  }
  exact([value.schemaVersion, value.kind, value.status, value.capturedOn, value.workPackage], [
    1,
    'sit-wp129-current-candidate-email-registration-recovery',
    'complete-exact-current-email-registration-recovery',
    '2026-09-12',
    'WP129',
  ], 'identity');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    wp128BaseHead,
    candidateSourceHead: candidateHead,
    applicationRuntimePathsChangedAfterCandidateSource: [],
  }, 'repository binding');
  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091201',
    releaseChannel: 'internal',
    environment: 'staging',
    delivery: 'direct-apk',
    apkSha256: 'a8bfda4c1a0e7302b2528db8edfbe1318e88322023f65588da032220a24badd4',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    physicalPixelPackageMatched: true,
  }, 'candidate binding');
  exact(value.stagingBackend, {
    releaseCommit: 'df39a14b7a19afe467842461a28f1e77fec8445e',
    environment: 'staging',
    liveHttpStatus: 200,
    databaseReady: true,
    mailReady: true,
    overallReadiness: 'degraded-support-deadlines-only',
    nextUpdateOverdue: 3,
    criticalNextUpdateOverdue: 0,
    privacyDeadlineOverdue: 0,
    p0WithoutOwner: 0,
    supportMutationPerformed: false,
  }, 'Staging binding');
  exact(value.registration, {
    freshDisposableAccount: true,
    pixelUiSubmissionAccepted: true,
    requiredConsentCount: 4,
    verificationMessagesMatched: 1,
    verificationInitialHttpStatus: 200,
    verificationReplayHttpStatus: 400,
    verificationSingleUseConfirmed: true,
    pixelLoginSucceeded: true,
    exactPrincipalVisible: true,
    coldStartSessionPersisted: true,
  }, 'registration proof');
  exact(value.passwordRecovery, {
    pixelUiRequestAccepted: true,
    accountExistenceDisclosure: false,
    recoveryMessagesMatched: 1,
    formHttpStatus: 200,
    submissionHttpStatus: 200,
    replayHttpStatus: 429,
    replayOutcome: 'rate-limit-reconciliation-required',
    replayRetryAfterBounded: true,
    resetLinkSingleUseClaimed: false,
    oldPasswordStructuredRejection: 'invalid_credentials',
    replacementPasswordPixelLoginSucceeded: true,
    exactRecoveredPrincipalVisible: true,
    recoveredColdStartSessionPersisted: true,
  }, 'password-recovery proof');
  exact(value.privateState, {
    registrationVaultMode: '0600',
    recoveryVaultMode: '0600',
    addressOrCredentialCommitted: false,
    actionLinkOrTokenCommitted: false,
    disposableAccountRetainedForDeletionPackage: true,
    disposableAccountHasBusinessFixture: false,
    protectedOwnerSessionRestored: true,
  }, 'private-state boundary');
  exact(value.portfolioEffect, {
    promotedRequirement: 'email-registration-verification-login-recovery',
    retainedPartialRequirement: 'privacy-export-and-account-deletion',
    passCount: 14,
    partialCount: 10,
    openCount: 8,
    totalCount: 32,
    releaseDecision: 'hold-not-production-ready',
  }, 'portfolio effect');
  exact(value.verification, {
    focusedTestsPassed: 23,
    fullLocalRegression: 'success',
    webWasmLoopbackAndroidBuildPassed: true,
    exactHeadGithubRegressionRequired: true,
    exactHeadCodeqlRequired: true,
  }, 'verification');
  exact(value.boundaries, {
    applicationRuntimeChanged: false,
    backendChanged: false,
    disposableAccountCreated: true,
    disposablePasswordChanged: true,
    disposableAccountDeleted: false,
    listingMutated: false,
    bookingMutated: false,
    messageSentByOperator: false,
    paymentEndpointCalled: false,
    productionChanged: false,
    googlePlayChanged: false,
    firebaseProjectChanged: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    credentialRecorded: false,
    accountIdentityRecorded: false,
    actionLinkRecorded: false,
    rawDeviceIdentifierRecorded: false,
  }, 'authorization boundary');
  validateSourceInventory(repositoryRoot, value.sourceInventory);
  if (checkGitState) {
    assertAncestor(repositoryRoot, candidateHead);
    assertAncestor(repositoryRoot, wp128BaseHead);
    assertAncestor(repositoryRoot, wp129ClosureHead);
    const drift = execFileSync('git', [
      'diff', '--name-only', candidateHead, wp129ClosureHead, '--', ...runtimeRoots,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (drift !== '') fail('WP129 application runtime drifted before its closure.');
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
    const result = validateWp129CurrentCandidateEmailRegistrationRecovery();
    process.stdout.write(
      `WP129 E-mail registration/recovery evidence valid: candidate=${result.versionCode}, requirement=PASS\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP129 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
