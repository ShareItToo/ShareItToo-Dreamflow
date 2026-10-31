#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp141-stripe-test-mode-connect-refund-recovery-20260913.json';
const implementationHead = 'd2f88f704484efbd564038bd98d6f6a28e4d1c76';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP141 ${label} is invalid.`);
  }
}

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`WP141 source is unavailable: ${path}`);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP141 source is not an ancestor of HEAD: ${head}`);
  }
}

export function validateWp141StripeTestModeConnectRefundRecovery({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp141-stripe-test-mode-connect-refund-recovery'
      || value.status !== 'passed-local-refund-recovery-architecture'
      || typeof value.capturedAt !== 'string') {
    fail('WP141 evidence identity is invalid.');
  }

  exact(value.source?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.source?.implementationHead, implementationHead, 'implementation source');
  if (checkGitState) assertAncestor(repositoryRoot, implementationHead);
  const inventory = value.source?.sourceInventory ?? {};
  const expectedPaths = [
    'backend/sql/migrations/075_refund_transfer_reversal_recovery.down.sql',
    'backend/sql/migrations/075_refund_transfer_reversal_recovery.up.sql',
    'backend/src/app.js',
    'backend/src/payment_domain.js',
    'backend/src/payment_workflow.js',
    'backend/src/privacy_export.js',
    'backend/src/retention_inventory.js',
    'backend/src/stripe_provider.js',
    'backend/test/payment_domain.test.js',
    'backend/test/postgres_foundation.integration.test.js',
    'backend/test/retention_inventory.test.js',
    'test/tool/payment_provider_truthfulness_wiring.test.mjs',
    'test/tool/run_r9_database_recovery.test.mjs',
    'store/privacy-disclosures.json',
    'store/retention-deletion-readiness.json',
    'tool/run_r9_database_recovery.mjs',
  ];
  exact(Object.keys(inventory).sort(), [...expectedPaths].sort(), 'source inventory');
  for (const [path, hash] of Object.entries(inventory)) {
    exact(
      createHash('sha256').update(sourceAtHead(repositoryRoot, implementationHead, path))
        .digest('hex'),
      hash,
      `source hash for ${path}`,
    );
  }

  exact(value.providerModel, {
    accountConfiguration: 'accounts-v2-recipient-express',
    paymentPattern: 'separate-charges-and-transfers',
    feesCollector: 'application',
    lossesCollector: 'application',
    destinationRefundFlagsUsed: false,
    productionEntitlementClaimed: false,
  }, 'provider model');
  exact(value.refundIntegrity, {
    multiPayoutAllocation: 'immutable-newest-first',
    payoutPaymentCompositeBinding: true,
    stableProviderIdempotencyPerReversal: true,
    providerRefundMetadataBinding: true,
    providerRefundChargeAmountCurrencyModeBinding: true,
    lostTransferReversalResponseRecovered: true,
    lostProviderRefundResponseRecovered: true,
    duplicateProviderRefundPrevented: true,
    refundDisputeTransferRaceSerialized: true,
    localFinalizationSerialized: true,
    unstructuredFourHundredRejectedAsDefinite: false,
    providerStatusFourHundredEightRejectedAsDefinite: false,
  }, 'refund integrity');
  exact(value.dataLifecycle, {
    accountDeletionBlocksOpenRecovery: true,
    accountExportIncludesMinimizedRecovery: true,
    providerIdentifiersExcludedFromAccountExport: true,
    retentionInventoryIncludesRecovery: true,
    destructiveRollbackWithRecoveryDataRefused: true,
  }, 'data lifecycle');
  exact(value.ratchetCorrection, {
    initialBaselineFailureObserved: true,
    cause: 'three-legitimate-wp141-source-changes-left-two-source-inventories-stale',
    reboundSources: [
      'backend/src/app.js',
      'backend/src/privacy_export.js',
      'backend/src/retention_inventory.js',
    ],
    affectedInventories: [
      'store/privacy-disclosures.json',
      'store/retention-deletion-readiness.json',
    ],
    privacyOrRetentionMeaningChangedByRebind: false,
    currentSourceHashesRecomputed: true,
    focusedRatchetTests: 'passed-68-of-68',
    workaroundRetained: false,
  }, 'ratchet correction');
  exact(value.database, {
    postgresMajor: 16,
    migrationCount: 75,
    lastMigration: '075_refund_transfer_reversal_recovery.up.sql',
    integrationTests: 'passed-2-of-2-and-cleaned',
    recoveryProof: 'passed-and-cleaned',
    schemaFingerprintSha256:
      'f3e81c9d7493e12e853f7c5ef3e36134205d3c07e6d6797c5a41153e141e9269',
  }, 'database proof');
  exact(value.verification, {
    focusedTests: 'passed-35-of-35',
    backendTests: 'passed-878-skipped-2-failed-0',
    fullLocalTechnicalRegression: 'passed-ci-metadata-and-candidate-rollover-mode',
    githubRegressionRunId: 34770241597,
    githubRegressionConclusion: 'success',
    githubCodeqlRunId: 34770241626,
    githubCodeqlConclusion: 'success',
    githubCodeScanningOpenAlerts: 0,
    portfolioBefore: { pass: 21, partial: 4, open: 7 },
    portfolioAfter: { pass: 21, partial: 4, open: 7 },
  }, 'verification');

  const falseBoundaries = [
    'stripeApiCalled', 'stripeDashboardChanged', 'stripeCredentialRead',
    'stripeAccountCreated', 'stagingPaymentTransportChanged', 'testMoneyUsed',
    'realMoneyUsed', 'productionChanged', 'vpsChanged', 'cloudChanged',
    'firebaseChanged', 'googlePlayChanged', 'appCandidateChanged',
    'pixelContacted', 'onePlusContacted', 'pullRequestMerged',
    'containsAccountIdentity', 'containsCredential', 'containsToken',
    'containsPrivateFilesystemPath',
  ];
  if (falseBoundaries.some((key) => value.boundaries?.[key] !== false)
      || Object.keys(value.boundaries ?? {}).length !== falseBoundaries.length) {
    fail('WP141 boundary contract is invalid.');
  }
  exact(value.remaining, {
    stripeSandboxRuntime: 'open-not-configured-staging-remains-memory-only',
    stripeAccountProfileAndTerms: 'open-owner-authenticated-provider-proof-required',
    testPaymentRefundPayoutE2e: 'open-no-stripe-network-call-performed',
    productionProviderSelection: 'separate-later-decision',
  }, 'remaining gates');

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|BEGIN PRIVATE|\b(?:sk|rk|whsec)_(?:test|live)_[A-Za-z0-9]+|password\s*[:=]|@[a-z0-9.-]+\.[a-z]{2,}/iu
    .test(serialized)) {
    fail('WP141 evidence contains private-path or credential-shaped material.');
  }

  return Object.freeze({
    status: value.status,
    implementationHead: value.source.implementationHead,
    paymentPattern: value.providerModel.paymentPattern,
    localRecovery: 'passed',
    stripeSandboxRuntime: value.remaining.stripeSandboxRuntime,
    portfolio: value.verification.portfolioAfter,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp141StripeTestModeConnectRefundRecovery(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP141 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
