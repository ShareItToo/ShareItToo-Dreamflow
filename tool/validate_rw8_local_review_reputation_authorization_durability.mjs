#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw8-local-review-reputation-authorization-durability-20260825.json';
const sourcePaths = [
  'lib/screens/own_profile_screen.dart',
  'lib/screens/privacy_info_screen.dart',
  'lib/screens/public_profile_screen.dart',
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/review_prompt_sheet.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_active_infrastructure_mail_provider_readiness.mjs',
  'scripts/technical_regression_check.sh',
  'test/review_metrics_service_test.dart',
  'test/review_prompt_sheet_logic_test.dart',
  'test/rw8_local_review_reputation_authorization_durability_test.dart',
  'test/tool/validate_g2_data_lifecycle.test.mjs',
  'test/tool/rw8_local_review_reputation_authorization_durability_wiring.test.mjs',
  'test/tool/validate_rw8_local_review_reputation_authorization_durability.test.mjs',
  'tool/validate_rw8_local_review_reputation_authorization_durability.mjs',
  'docs/compliance/g2l-g2-data-lifecycle-2026-08-20.md',
  'docs/architecture/rw8-local-review-reputation-authorization-durability-recovery-2026-08-25.md',
  'docs/operations/RW8_LOCAL_REVIEW_REPUTATION_AUTHORIZATION_DURABILITY_RECOVERY_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW8 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW8 evidence contains private or secret-shaped material.');
  }
}

export function validateRw8LocalReviewReputationAuthorizationDurability({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-passed-full-technical-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind
        !== 'sit-rw8-local-review-reputation-authorization-durability'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== 'c0bbdfff21d5e4cbba549030fd9bd9a37d77c632') {
    fail('RW8 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW7',
    evidence:
      'docs/evidence/48h-remote/rw7-local-listing-catalog-authorization-durability-20260825.json',
    verifiedImplementationHead: '33d1766467dbfdbbabe0d12823ac76e4614b7224',
    closureCommit: 'c0bbdfff21d5e4cbba549030fd9bd9a37d77c632',
  })) fail('RW8 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'matching-auth-session-exact-booking-participant-review-submission',
      'public-reputation-reads-preserved',
      'completed-direction-counterparty-item-and-needs-review-context',
      'strict-bounded-whole-review-document-decoding',
      'exact-raw-corruption-preservation',
      'serialized-verified-review-mutations-and-booking-snapshot-guard',
      'capacity-and-storage-failure-without-history-pruning',
      'no-read-time-demo-reputation-seeding',
      'current-account-authored-and-received-review-privacy-export',
      'shared-public-review-retention-with-account-anonymization',
      'input-preserving-submission-and-profile-read-retry',
      'synthetic-deterministic-local-regression',
    ],
    excluded: [
      'contract-quote-acceptance-cancellation-and-refund',
      'payment-payout-and-real-money',
      'handover-return-damage-and-needs-review-decision-policy',
      'moderation-review-correction-and-public-ranking-policy',
      'production-backend-schema-authority-and-live-infrastructure',
      'provider-ai-candidate-device-store-pilot-and-legal-owner-gates',
      'gitguardian-finding-content-pr-merge-and-history-rewrite',
    ],
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    silentHistoryPruningAllowed: false,
  })) fail('RW8 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW8-P0-CALLER-IDENTITY-SPOOF-001',
    'RW8-P0-BOOKING-CONTEXT-DRIFT-002',
    'RW8-P0-CORRUPTION-AS-EMPTY-003',
    'RW8-P0-FAKE-READ-SEEDING-004',
    'RW8-P0-DUPLICATE-CONTEXT-005',
    'RW8-P0-LOST-UPDATE-CONCURRENCY-006',
    'RW8-P0-STORAGE-FAILURE-HISTORY-LOSS-007',
    'RW8-P0-UNBOUNDED-OR-PRUNED-HISTORY-008',
    'RW8-P0-PRIVACY-EXPORT-RETENTION-SCOPE-009',
    'RW8-P1-FALSE-SUCCESS-OR-SPINNER-010',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW8 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.focusedRw8Flutter !== 'passed-28'
      || value.verification?.lifecyclePrivacyRetentionProvider !== 'passed'
      || value.verification?.rw8WiringTests !== 'passed'
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW8 verification truth is invalid.');
  }
  if (fullPassed && !/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')) {
    fail('RW8 full regression requires an implementation head.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW8 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW8 cannot claim GitHub verification while CI is pending.');
  }

  if (!exact(value.ratchets, {
    reason:
      'validated-local-review-lifecycle-privacy-retention-and-provider-source-change',
    privacyManifestSha256:
      'e9789509b6f1710cc660f7d2b62833bde3a932823c4a7e10d73b132815bd33ae',
    retentionManifestSha256:
      '683667f212f89f44680f2fb6bd9556beb16417bf1d0d2ec3a83a37f68413762c',
    activeProviderEvidenceSha256:
      '79a29daa2de67249a764bebb4724b82e7dda5454efb0a04bbd4f6bf1b2e4a7c8',
    activeProviderState: 'prepared-hold',
    completedOwnerDecisions: 0,
    requiredOwnerDecisions: 10,
    externalReadiness: false,
  })) fail('RW8 ratchet cause or provider truth is invalid.');

  const gates = [
    'BUILD_READY',
    'PLAY_UPLOAD_APPROVED',
    'HUMAN_PILOT_ACTIVATED',
    'PR7_MERGE_APPROVED',
    'R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE',
  ];
  if (!exact(Object.keys(value.gates), gates)
      || Object.values(value.gates).some((entry) => entry !== 'not-granted')
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('RW8 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW8 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(Object.hasOwn(sourceTexts, entry.path)
          ? sourceTexts[entry.path]
          : source(repositoryRoot, entry.path)) !== entry.sha256) {
      fail(`RW8 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);

  return {
    status: value.status,
    allowedSurfaces: value.scope.allowed.length,
    excludedSurfaces: value.scope.excluded.length,
    resolvedFindings: value.findings.length,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
  };
}

function main() {
  const result = validateRw8LocalReviewReputationAuthorizationDurability();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
