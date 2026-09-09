#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  classifyReportBlockLifecycleObservation,
} from './diagnose_android_report_block_interactions.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp72-current-candidate-report-block-20260909.json';
const sourcePaths = [
  'docs/evidence/release-readiness/wp70-current-candidate-auth-safety-hold-20260909.json',
  'docs/evidence/release-readiness/wp71-current-candidate-account-deletion-20260909.json',
  'tool/diagnose_android_report_block_interactions.mjs',
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
    fail(`WP72 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function validateSources(repositoryRoot, value) {
  if (!Array.isArray(value.sourceInventory)
      || !exact(value.sourceInventory.map((entry) => entry.path), sourcePaths)) {
    fail('WP72 source inventory is incomplete or reordered.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(readFileSync(resolve(repositoryRoot, entry.path))) !== entry.sha256) {
      fail(`WP72 source hash drift: ${entry.path}`);
    }
  }
  const wp70 = JSON.parse(readFileSync(resolve(repositoryRoot, sourcePaths[0]), 'utf8'));
  const wp71 = JSON.parse(readFileSync(resolve(repositoryRoot, sourcePaths[1]), 'utf8'));
  if (wp70.status !== 'complete-local-github'
      || wp70.remainingRelatedRequirements?.find(
        (entry) => entry.id === 'support-report-block',
      )?.state !== 'PARTIAL'
      || wp71.status !== 'complete-local-github'
      || wp71.requirementClosure?.find(
        (entry) => entry.id === 'support-report-block',
      )?.state !== 'PARTIAL') {
    fail('WP72 predecessor evidence does not authorize this bounded closure.');
  }
}

function validateGitLineage(repositoryRoot, value, checkGitState) {
  if (!exact(value.candidate.mobileOrBackendRuntimePathsChangedAfterCandidate, [])) {
    fail('WP72 candidate lineage is overstated.');
  }
  if (!checkGitState) return;
  const changed = execFileSync('git', [
    'diff', '--name-only', `${value.repository.candidateSourceHead}..HEAD`, '--',
    'lib', 'android', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim().split('\n').filter(Boolean);
  if (!exact(changed, [])) fail('WP72 runtime paths changed after the exact candidate.');
}

function validatePixelProof(value) {
  const proof = value.pixelProof;
  if (!exact(proof?.device, {
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  })) fail('WP72 device proof is invalid.');
  if (!exact(proof.interactionTargeting, {
    exactListingSemanticsRequired: true,
    uniqueSmallestExactLabelRegionRequired: true,
    stationaryLongPressDurationMs: 1200,
    ownerBoundConfirmationRequired: true,
    coordinateFallbackUsed: false,
  })) fail('WP72 interaction targeting is not deterministic.');
  classifyReportBlockLifecycleObservation({
    candidateMatched: true,
    report: proof.report,
    block: proof.block,
    unblock: proof.unblock,
    messageIsolation: proof.messageIsolation,
    cleanup: proof.cleanup,
  });
  if (proof.privateJournal?.status !== 'physical-lifecycle-complete-cleanup-confirmed'
      || !/^[a-f0-9]{64}$/u.test(proof.privateJournal.sha256 ?? '')
      || proof.privateJournal.ownerOnly !== true
      || [proof.privateJournal.containsPrivatePath, proof.privateJournal.containsCredential,
        proof.privateJournal.containsToken, proof.privateJournal.containsAccountIdentifier,
        proof.privateJournal.containsRawDeviceIdentifier].some((entry) => entry !== false)) {
    fail('WP72 private journal evidence is invalid.');
  }
}

function validateClosure(value) {
  if (!exact(value.requirementClosure.map(({ id, state }) => ({ id, state })), [
    { id: 'support-report-block', state: 'PASS' },
    { id: 'privacy-export-and-account-deletion', state: 'PASS' },
    { id: 'stripe-sandbox-payment-refund-simulated-payout', state: 'OPEN' },
  ])) fail('WP72 requirement closure is invalid.');
  for (const entry of value.requirementClosure) {
    if (typeof (entry.basis ?? entry.remaining) !== 'string'
        || (entry.basis ?? entry.remaining).length < 80) {
      fail(`WP72 requirement rationale is missing: ${entry.id}`);
    }
  }
}

function validateVerification(repositoryRoot, value, checkGitState) {
  const pending = {
    implementationHead: null,
    focusedTests: 'pending',
    fullLocalRegression: 'pending',
    localToolTestsPassed: null,
    githubRegressionRun: null,
    githubCodeqlRun: null,
    openPrMergeAlerts: null,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status === 'implemented-pending-local-github') {
    if (!exact(value.packageVerification, pending)) {
      fail('WP72 pending verification contract is invalid.');
    }
    return;
  }
  const complete = {
    implementationHead: '104ee9c166d3e56e0edebc3db7d638d6017ecd66',
    focusedTests: 'passed-42',
    fullLocalRegression: 'passed',
    localToolTestsPassed: 2531,
    githubRegressionRun: 34363123880,
    githubCodeqlRun: 34363123877,
    openPrMergeAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status !== 'complete-local-github'
      || !exact(value.packageVerification, complete)) {
    fail('WP72 complete verification contract is invalid.');
  }
  if (checkGitState) {
    assertAncestor(repositoryRoot, value.packageVerification.implementationHead);
  }
}

export function validateWp72CurrentCandidateReportBlock({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp72-current-candidate-report-block'
      || value.capturedOn !== '2026-09-09') fail('WP72 identity is invalid.');
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    packageBaseHead: 'cbdd97288bd1761e16acd5766dd72874cd8d7d86',
    candidateSourceHead: '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0',
    stagingRuntimeHead: '78c663248aec089b08d19fd0fb40a9a63f19408b',
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) fail('WP72 repository binding is invalid.');
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
  })) fail('WP72 candidate binding is invalid.');
  if (checkGitState) {
    [value.repository.packageBaseHead, value.repository.candidateSourceHead,
      value.repository.stagingRuntimeHead].forEach((commit) => assertAncestor(repositoryRoot, commit));
  }
  validateSources(repositoryRoot, value);
  validateGitLineage(repositoryRoot, value, checkGitState);
  validatePixelProof(value);
  validateClosure(value);
  validateVerification(repositoryRoot, value, checkGitState);
  if (!Array.isArray(value.technicalDebt) || value.technicalDebt.length !== 4
      || value.technicalDebt.some((entry) => typeof entry !== 'string' || entry.length < 120)) {
    fail('WP72 technical-debt record is incomplete.');
  }
  if (!exact(value.boundaries, {
    stagingSyntheticReportCreated: true,
    stagingSyntheticListingsRetired: true,
    stagingSyntheticBookingCancelled: true,
    temporaryBlockRemoved: true,
    moderationAuditReportRetained: true,
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
  })) fail('WP72 boundary evidence is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP72 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    supportReportBlockState: value.requirementClosure[0].state,
    physicalMessageIsolationPassed: true,
    protectedOwnerRestored: value.pixelProof.cleanup.protectedOwnerSessionRestored,
    onePlusContacted: value.boundaries.onePlusContacted,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp72CurrentCandidateReportBlock(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP72 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
