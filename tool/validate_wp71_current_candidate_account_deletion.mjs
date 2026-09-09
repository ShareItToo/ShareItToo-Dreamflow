#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp71-current-candidate-account-deletion-20260909.json';
const sourcePaths = [
  'docs/evidence/release-readiness/wp70-current-candidate-auth-safety-hold-20260909.json',
  'tool/diagnose_android_account_deletion.mjs',
];

function fail(message) { throw new Error(message); }
function exact(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP71 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function validateSources(repositoryRoot, value) {
  if (!Array.isArray(value.sourceInventory)
      || !exact(value.sourceInventory.map((entry) => entry.path), sourcePaths)) {
    fail('WP71 source inventory is incomplete or reordered.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(readFileSync(resolve(repositoryRoot, entry.path))) !== entry.sha256) {
      fail(`WP71 source hash drift: ${entry.path}`);
    }
  }
  const wp70 = JSON.parse(readFileSync(resolve(repositoryRoot, sourcePaths[0]), 'utf8'));
  if (wp70.status !== 'complete-local-github'
      || wp70.candidate?.versionCode !== '2026090904'
      || wp70.remainingRelatedRequirements?.find(
        (entry) => entry.id === 'privacy-export-and-account-deletion',
      )?.state !== 'PARTIAL') {
    fail('WP71 predecessor evidence does not authorize this bounded closure.');
  }
}

function validateGitLineage(repositoryRoot, value, checkGitState) {
  if (!exact(value.candidate.mobileOrBackendRuntimePathsChangedAfterCandidate, [])) {
    fail('WP71 candidate lineage is overstated.');
  }
  if (!checkGitState) return;
  // Validate the frozen package snapshot, never a later successor candidate.
  const changed = execFileSync('git', [
    'diff', '--name-only', `${value.repository.candidateSourceHead}..${value.repository.packageBaseHead}`, '--',
    'lib', 'android', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim().split('\n').filter(Boolean);
  if (!exact(changed, [])) fail('WP71 runtime paths changed after the exact candidate.');
}

function validateProof(value) {
  const proof = value.pixelProof;
  if (!exact(proof?.device, {
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  })) fail('WP71 device proof is invalid.');
  if (Object.values(proof.preflight ?? {}).some((entry) => entry !== true)) {
    fail('WP71 deletion preflight is incomplete.');
  }
  if (!exact(proof.definiteRejection, {
    wrongPasswordStructuredRejection: '401:invalid_credentials',
    accountRemainedActiveAfterRejection: true,
    timeoutOrUnstructuredErrorAcceptedAsRejection: false,
  })) fail('WP71 definite rejection semantics are invalid.');
  if (!exact(proof.confirmedDeletion, {
    uiConfirmed: true,
    deletedCredentialStructuredRejection: '401:invalid_credentials',
    timeoutOrUnstructuredErrorAcceptedAsDeletion: false,
    terminatedProcessGuestStatePassed: true,
    accountAToBIsolationPassed: true,
    protectedOwnerSessionRestored: true,
    privateTargetCredentialsScrubbed: true,
    recoveryRequired: false,
    targetCredentialState: 'deleted',
  })) fail('WP71 confirmed deletion semantics are invalid.');
  if (proof.privateJournal?.status !== 'completed-account-deletion'
      || !/^[a-f0-9]{64}$/u.test(proof.privateJournal.sha256 ?? '')
      || [proof.privateJournal.containsPrivatePath, proof.privateJournal.containsCredential,
        proof.privateJournal.containsAccountIdentifier].some((entry) => entry !== false)) {
    fail('WP71 private journal evidence is invalid.');
  }
}

function validateClosure(value) {
  if (!exact(value.requirementClosure.map(({ id, state }) => ({ id, state })), [
    { id: 'privacy-export-and-account-deletion', state: 'PASS' },
    { id: 'support-report-block', state: 'PARTIAL' },
    { id: 'stripe-sandbox-payment-refund-simulated-payout', state: 'OPEN' },
  ])) fail('WP71 requirement closure is invalid.');
  for (const entry of value.requirementClosure) {
    if (typeof (entry.basis ?? entry.remaining) !== 'string'
        || (entry.basis ?? entry.remaining).length < 60) {
      fail(`WP71 requirement rationale is missing: ${entry.id}`);
    }
  }
}

function validateVerification(value) {
  const complete = {
    implementationHead: '2d31208adf150f85f5d1b9fd828780212dcde56a',
    focusedTests: 'passed-38',
    fullLocalRegression: 'passed',
    localToolTestsPassed: 2517,
    githubRegressionRun: 34351116545,
    githubCodeqlRun: 34351116530,
    openPrMergeAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status !== 'complete-local-github'
      || !exact(value.packageVerification, complete)) {
    fail('WP71 complete verification contract is invalid.');
  }
}

export function validateWp71CurrentCandidateAccountDeletion({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp71-current-candidate-account-deletion'
      || value.capturedOn !== '2026-09-09') fail('WP71 identity is invalid.');
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    packageBaseHead: '8b0126980bf1a9825c281d206ee80484ad163ee8',
    diagnosticHead: '83a39428884dcd09f4b8c6bbc4cb85d85577f2c7',
    candidateSourceHead: '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0',
    stagingRuntimeHead: '78c663248aec089b08d19fd0fb40a9a63f19408b',
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) fail('WP71 repository binding is invalid.');
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090904',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    apkSha256: '8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4',
    aabSha256: 'fcc6c36055a978ffb3c70761f2630d942c8e65ac30c9600f3963be48b7d56696',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    pixelInstalledAndMatched: true,
    mobileOrBackendRuntimePathsChangedAfterCandidate: [],
  })) fail('WP71 candidate binding is invalid.');
  if (checkGitState) {
    [value.repository.packageBaseHead, value.repository.diagnosticHead,
      value.repository.candidateSourceHead, value.repository.stagingRuntimeHead]
      .forEach((commit) => assertAncestor(repositoryRoot, commit));
  }
  validateSources(repositoryRoot, value);
  validateGitLineage(repositoryRoot, value, checkGitState);
  validateProof(value);
  validateClosure(value);
  validateVerification(value);
  if (!Array.isArray(value.technicalDebt) || value.technicalDebt.length !== 4
      || value.technicalDebt.some((entry) => typeof entry !== 'string' || entry.length < 100)) {
    fail('WP71 technical-debt record is incomplete.');
  }
  if (!exact(value.boundaries, {
    stagingDisposableAccountDeleted: true,
    protectedOwnerDeleted: false,
    productionChanged: false,
    mobileRuntimeChanged: false,
    backendRuntimeChanged: false,
    backendDeployed: false,
    googlePlayChanged: false,
    testerListChanged: false,
    firebaseConfigurationChanged: false,
    externalIdentityProviderCalled: false,
    paymentProviderCalled: false,
    realMoneyUsed: false,
    cloudOrVpsChanged: false,
    dnsChanged: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    credentialPrintedOrCommitted: false,
    personalAccountIdentifierCommitted: false,
    privateFilesystemPathCommitted: false,
  })) fail('WP71 boundary evidence is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP71 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    privacyRequirementState: value.requirementClosure[0].state,
    protectedOwnerRestored: value.pixelProof.confirmedDeletion.protectedOwnerSessionRestored,
    onePlusContacted: value.boundaries.onePlusContacted,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp71CurrentCandidateAccountDeletion(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP71 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
