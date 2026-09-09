#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp74-dispute-transfer-recovery-20260909.json';
const sourcePaths = [
  'backend/sql/migrations/072_dispute_transfer_recovery.up.sql',
  'backend/sql/migrations/072_dispute_transfer_recovery.down.sql',
  'backend/src/payment_domain.js',
  'backend/src/payment_workflow.js',
  'backend/src/stripe_provider.js',
  'backend/src/app.js',
  'backend/src/privacy_export.js',
  'backend/src/retention_inventory.js',
  'backend/ops/validate_staging_deployment_readiness.mjs',
  'tool/validate_wp73_stripe_sandbox_compatibility_inventory.mjs',
  'tool/run_r9_database_recovery.mjs',
  'tool/validate_r9_database_recovery.mjs',
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
    fail(`WP74 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function sourceAtImplementationHead(repositoryRoot, value, path) {
  if (!value.verification?.implementationHead) {
    return readFileSync(resolve(repositoryRoot, path));
  }
  try {
    return execFileSync(
      'git',
      ['show', `${value.verification.implementationHead}:${path}`],
      { cwd: repositoryRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    fail(`WP74 historical source is unavailable: ${path}`);
  }
}

function validateSources(repositoryRoot, value) {
  if (!exact(value.sourceInventory?.map((entry) => entry.path), sourcePaths)) {
    fail('WP74 source inventory is incomplete or reordered.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(sourceAtImplementationHead(repositoryRoot, value, entry.path)) !== entry.sha256) {
      fail(`WP74 source hash drift: ${entry.path}`);
    }
  }
}

function validateContracts(repositoryRoot, value) {
  const source = (path) => sourceAtImplementationHead(repositoryRoot, value, path).toString('utf8');
  const migration = source('backend/sql/migrations/072_dispute_transfer_recovery.up.sql');
  const rollback = source('backend/sql/migrations/072_dispute_transfer_recovery.down.sql');
  const domain = source('backend/src/payment_domain.js');
  const workflow = source('backend/src/payment_workflow.js');
  const provider = source('backend/src/stripe_provider.js');
  const app = source('backend/src/app.js');
  const privacy = source('backend/src/privacy_export.js');
  const retention = source('backend/src/retention_inventory.js');
  const readiness = source('backend/ops/validate_staging_deployment_readiness.mjs');
  const wp73 = source('tool/validate_wp73_stripe_sandbox_compatibility_inventory.mjs');

  for (const pattern of [
    /CREATE TABLE dispute_transfer_recoveries/u,
    /UNIQUE \(dispute_id, payout_id\)/u,
    /provider_reversal_id/u,
    /chargeback_owner_transfer_recovered/u,
    /chargeback_owner_recovery_reinstated/u,
  ]) if (!pattern.test(migration)) fail(`WP74 migration contract missing: ${pattern}`);
  if (!/rollback blocked/u.test(rollback) || !/dispute_transfer_recoveries/u.test(rollback)) {
    fail('WP74 rollback guard is missing.');
  }
  for (const pattern of [
    /disputeTransferRecoveryAmount/u,
    /StripeInvalidRequestError/u,
    /balance_insufficient/u,
    /uncertain_provider_outcome/u,
  ]) if (!pattern.test(domain)) fail(`WP74 domain contract missing: ${pattern}`);
  for (const pattern of [
    /scheduleDisputeTransferRecoveries/u,
    /reconcileDisputeTransferRecoveries/u,
    /findTransferReversal/u,
    /provider_reversal_binding_mismatch/u,
    /funds_reinstated_during_uncertain_reversal/u,
    /recoveryPending/u,
    /recoveryNeedsReview/u,
  ]) if (!pattern.test(workflow)) fail(`WP74 workflow contract missing: ${pattern}`);
  for (const pattern of [
    /createReversal/u,
    /findTransferReversal/u,
    /sit_recovery_id/u,
  ]) if (!pattern.test(provider)) fail(`WP74 provider contract missing: ${pattern}`);
  if (!/payments\.recoveryPending === 0/u.test(app)
      || !/payments\.recoveryNeedsReview === 0/u.test(app)
      || !/payment_recovery_pending/u.test(readiness)
      || !/disputeTransferRecoveries/u.test(privacy)
      || !/dispute_transfer_recoveries/u.test(retention)) {
    fail('WP74 readiness or privacy contract is missing.');
  }
  if (!/sourceAtImplementationHead/u.test(wp73)) {
    fail('WP74 historical evidence ratchet is missing.');
  }
}

function validateVerification(repositoryRoot, value, checkGitState) {
  const pending = {
    implementationHead: null,
    focusedTests: 'passed',
    postgresIntegration: 'passed',
    fullLocalRegression: 'pending',
    localToolTestsPassed: null,
    githubRegressionRun: null,
    githubCodeqlRun: null,
    openPrMergeAlerts: null,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status === 'implemented-pending-full-regression') {
    if (!exact(value.verification, pending)) fail('WP74 pending verification is invalid.');
    return;
  }
  const localComplete = {
    implementationHead: '7ad51fd012ed947a0f7de6b8980b0911f7f5ec30',
    focusedTests: 'passed-48',
    postgresIntegration: 'passed-current-r9-postgresql-16',
    fullLocalRegression: 'passed',
    localToolTestsPassed: 2542,
    githubRegressionRun: null,
    githubCodeqlRun: null,
    openPrMergeAlerts: null,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status === 'complete-local-github-pending') {
    if (!exact(value.verification, localComplete)) {
      fail('WP74 local-completion verification is invalid.');
    }
    if (checkGitState) assertAncestor(repositoryRoot, localComplete.implementationHead);
    return;
  }
  const verification = value.verification;
  if (value.status !== 'complete-local-github'
      || !/^[a-f0-9]{40}$/u.test(verification?.implementationHead ?? '')
      || !/^passed-\d+$/u.test(verification?.focusedTests ?? '')
      || verification?.postgresIntegration !== 'passed'
      || verification?.fullLocalRegression !== 'passed'
      || !Number.isSafeInteger(verification?.localToolTestsPassed)
      || verification.localToolTestsPassed < 1
      || !Number.isSafeInteger(verification?.githubRegressionRun)
      || !Number.isSafeInteger(verification?.githubCodeqlRun)
      || verification?.openPrMergeAlerts !== 0
      || verification?.pullRequest7 !== 'draft-open-mergeable-unmerged') {
    fail('WP74 complete verification is invalid.');
  }
  if (checkGitState) assertAncestor(repositoryRoot, verification.implementationHead);
}

export function validateWp74DisputeTransferRecovery({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp74-dispute-transfer-recovery'
      || value.capturedOn !== '2026-09-09') fail('WP74 identity is invalid.');
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    packageBaseHead: '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0',
    pullRequest7: 'draft-open-mergeable-unmerged',
    mobileRuntimeChanged: false,
    providerTrafficChanged: false,
  })) fail('WP74 repository binding is invalid.');
  if (checkGitState) assertAncestor(repositoryRoot, value.repository.packageBaseHead);
  validateVerification(repositoryRoot, value, checkGitState);
  validateSources(repositoryRoot, value);
  validateContracts(repositoryRoot, value);
  if (!exact(value.outcomes, {
    paidTransferRecovery: 'durable-idempotent-provider-bound',
    definiteRejection: 'only-structured-stripe-invalid-request-errors',
    timeoutAndUnstructuredFailure: 'uncertain-needs-review-no-local-success',
    insufficientBalance: 'retryable-needs-review',
    fundsReinstated: 'cancel-or-compensating-owner-payable-without-auto-release',
    readiness: 'pending-or-review-recovery-is-degraded',
    privacyAndRetention: 'safe-status-export-and-inventory-covered',
    historicalWp73Evidence: 'bound-to-its-implementation-head',
    currentMigration072RecoveryProof: 'passed-and-cleaned-local-postgresql-16',
  })) fail('WP74 outcomes are incomplete or overstated.');
  if (!exact(value.boundaries, {
    stripeApiCalled: false,
    credentialReadExtractedOrCommitted: false,
    stripeDashboardChanged: false,
    providerObjectCreatedOrChanged: false,
    moneyMoved: false,
    stagingChanged: false,
    productionChanged: false,
    cloudVpsDnsChanged: false,
    firebaseChanged: false,
    googlePlayChanged: false,
    deviceContacted: false,
    pullRequestMerged: false,
    containsSecrets: false,
  })) fail('WP74 boundary evidence is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|access_token|refresh_token|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP74 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    package: 'WP74',
    paidTransferRecovery: value.outcomes.paidTransferRecovery,
    providerTrafficChanged: value.boundaries.providerObjectCreatedOrChanged,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp74DisputeTransferRecovery(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP74 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
