#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp130-current-candidate-account-deletion-20260912.json';
const candidateHead = '1546812f625b4e8f1e700bf976410097cd45ac2f';
const wp129ClosureHead = '341fdf48d8c4161a84c8dd6eb9c290eea97b80b4';
const diagnosticHead = 'a6b6f309b37c67b110f1704dc19032ecee2a7b53';
const wp130ClosureHead = 'f2ce29ab411b2e5c9c99e45f9d38788e92dc5a8c';
const runtimeRoots = [
  'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
];
const sourcePaths = [
  'docs/evidence/release-readiness/wp129-current-candidate-email-registration-recovery-20260912.json',
  'tool/diagnose_android_account_deletion.mjs',
  'test/tool/diagnose_android_account_deletion.test.mjs',
];

function fail(message) { throw new Error(message); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`WP130 ${label} is invalid.`);
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial|vaultfile)$/iu.test(key)) {
      fail(`WP130 evidence contains a private field at ${[...path, key].join('.')}.`);
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
    fail(`WP130 head is not an ancestor of HEAD: ${head}`);
  }
}

function validateSourceInventory(repositoryRoot, inventory) {
  exact(inventory?.map((item) => item.path), sourcePaths, 'source inventory');
  for (const item of inventory) {
    let source;
    try {
      source = execFileSync('git', ['show', `${wp130ClosureHead}:${item.path}`], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      fail(`WP130 historical source is unavailable: ${item.path}.`);
    }
    if (!/^[a-f0-9]{64}$/u.test(item?.sha256 ?? '') || digest(source) !== item.sha256) {
      fail(`WP130 source digest drift: ${item?.path ?? 'unknown'}.`);
    }
  }
}

export function validateWp130CurrentCandidateAccountDeletion({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (/(?:\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b)/iu.test(JSON.stringify(value))) {
    fail('WP130 evidence contains private or secret-shaped content.');
  }
  exact([value.schemaVersion, value.kind, value.status, value.capturedOn, value.workPackage], [
    1,
    'sit-wp130-current-candidate-account-deletion',
    'complete-exact-current-account-deletion',
    '2026-09-12',
    'WP130',
  ], 'identity');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    wp129ClosureHead,
    diagnosticHead,
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
    aabSha256: '81c204fd65d83a0403d203b606328880acb0787d076093240efab87d00575399',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    physicalPixelPackageMatched: true,
  }, 'candidate binding');
  exact(value.stagingBackend, {
    releaseCommit: 'df39a14b7a19afe467842461a28f1e77fec8445e',
    environment: 'staging',
    databaseReady: true,
    mailReady: true,
    supportDeadlineDegradationIndependent: true,
    supportMutationPerformed: false,
  }, 'Staging binding');
  exact(value.pixelProof?.device, {
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  }, 'device proof');
  if (Object.values(value.pixelProof?.preflight ?? {}).some((entry) => entry !== true)) {
    fail('WP130 deletion preflight is incomplete.');
  }
  exact(value.pixelProof?.definiteRejection, {
    wrongPasswordStructuredRejection: '401:invalid_credentials',
    accountRemainedActiveAfterRejection: true,
    timeoutOrUnstructuredErrorAcceptedAsRejection: false,
  }, 'definite rejection semantics');
  exact(value.pixelProof?.confirmedDeletion, {
    uiConfirmed: true,
    deletedCredentialStructuredRejection: '401:invalid_credentials',
    timeoutOrUnstructuredErrorAcceptedAsDeletion: false,
    terminatedProcessGuestStatePassed: true,
    accountAToBIsolationPassed: true,
    protectedOwnerSessionRestored: true,
    privateTargetCredentialsScrubbed: true,
    recoveryRequired: false,
    targetCredentialState: 'deleted',
  }, 'confirmed deletion semantics');
  const journal = value.pixelProof?.privateJournal;
  if (journal?.status !== 'completed-account-deletion'
      || !/^[a-f0-9]{64}$/u.test(journal?.sha256 ?? '')
      || [journal.containsPrivatePath, journal.containsCredential,
        journal.containsAccountIdentifier].some((entry) => entry !== false)) {
    fail('WP130 private journal evidence is invalid.');
  }
  exact(value.portfolioEffect, {
    promotedRequirement: 'privacy-export-and-account-deletion',
    passCount: 15,
    partialCount: 9,
    openCount: 8,
    totalCount: 32,
    releaseDecision: 'hold-not-production-ready',
  }, 'portfolio effect');
  exact(value.verification, {
    focusedTestsPassed: 19,
    fullLocalRegression: 'success',
    webWasmLoopbackAndroidBuildPassed: true,
    exactHeadGithubRegressionRequired: true,
    exactHeadCodeqlRequired: true,
  }, 'verification');
  validateSourceInventory(repositoryRoot, value.sourceInventory);
  if (!Array.isArray(value.technicalDebt) || value.technicalDebt.length !== 2
      || value.technicalDebt.some((entry) => typeof entry !== 'string' || entry.length < 120)) {
    fail('WP130 technical-debt record is incomplete.');
  }
  exact(value.boundaries, {
    applicationRuntimeChanged: false,
    backendChanged: false,
    stagingDisposableAccountDeleted: true,
    protectedOwnerDeleted: false,
    listingMutated: false,
    bookingMutated: false,
    messageSentByOperator: false,
    paymentEndpointCalled: false,
    realMoneyUsed: false,
    productionChanged: false,
    googlePlayChanged: false,
    testerListChanged: false,
    firebaseProjectChanged: false,
    cloudOrVpsChanged: false,
    dnsChanged: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    credentialRecorded: false,
    accountIdentityRecorded: false,
    privateFilesystemPathRecorded: false,
    rawDeviceIdentifierRecorded: false,
  }, 'authorization boundary');
  if (checkGitState) {
    [candidateHead, wp129ClosureHead, diagnosticHead, wp130ClosureHead]
      .forEach((head) => assertAncestor(repositoryRoot, head));
    const drift = execFileSync('git', [
      'diff', '--name-only', candidateHead, wp130ClosureHead, '--', ...runtimeRoots,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (drift !== '') fail('WP130 application runtime drifted before its closure.');
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
    const result = validateWp130CurrentCandidateAccountDeletion();
    process.stdout.write(
      `WP130 account-deletion evidence valid: candidate=${result.versionCode}, requirement=PASS\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP130 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
