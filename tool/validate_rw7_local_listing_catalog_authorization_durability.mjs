#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw7-local-listing-catalog-authorization-durability-20260825.json';
const sourcePaths = [
  'lib/screens/create_listing_screen.dart',
  'lib/screens/my_listings_screen.dart',
  'lib/screens/own_profile_screen.dart',
  'lib/screens/privacy_info_screen.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_active_infrastructure_mail_provider_readiness.mjs',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'scripts/technical_regression_check.sh',
  'test/rw7_local_listing_catalog_authorization_durability_test.dart',
  'test/tool/rw7_local_listing_catalog_authorization_durability_wiring.test.mjs',
  'test/tool/validate_rw7_local_listing_catalog_authorization_durability.test.mjs',
  'docs/compliance/g2l-g2-data-lifecycle-2026-08-20.md',
  'docs/architecture/rw7-local-listing-catalog-authorization-durability-recovery-2026-08-25.md',
  'docs/operations/RW7_LOCAL_LISTING_CATALOG_AUTHORIZATION_DURABILITY_RECOVERY_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW7 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW7 evidence contains private or secret-shaped material.');
  }
}

export function validateRw7LocalListingCatalogAuthorizationDurability({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-default-flutter-passed-full-technical-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind
        !== 'sit-rw7-local-listing-catalog-authorization-durability'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '085c4b497083f0df3dc5209d9fa39177290695e0') {
    fail('RW7 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW6',
    evidence:
      'docs/evidence/48h-remote/rw6-local-operational-record-authorization-truth-recovery-20260825.json',
    verifiedImplementationHead: 'bb0d651b133b048084758dd558d52ae5d09242ee',
    closureCommit: '085c4b497083f0df3dc5209d9fa39177290695e0',
  })) fail('RW7 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'matching-auth-session-and-exact-owner-listing-mutations',
      'public-catalog-reads-preserved',
      'strict-bounded-whole-document-decoding',
      'exact-raw-corruption-preservation',
      'serialized-verified-listing-mutations',
      'local-catalog-revision-conflict-guard',
      'capacity-and-storage-failure-without-media-pruning',
      'no-unapproved-ended-listing-auto-deletion',
      'current-owner-listing-privacy-export',
      'scoped-account-deletion-listing-deactivation',
      'account-transition-safe-owner-listing-ui',
      'synthetic-deterministic-local-regression',
    ],
    excluded: [
      'booking-contract-acceptance-quote-and-cancellation',
      'payment-refund-payout-and-real-money',
      'handover-return-damage-and-needs-review',
      'listing-business-content-and-moderation-policy',
      'production-backend-schema-authority-and-live-infrastructure',
      'provider-ai-candidate-device-store-pilot-and-legal-owner-gates',
      'gitguardian-finding-content-pr-merge-and-history-rewrite',
    ],
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    silentMediaPruningAllowed: false,
  })) fail('RW7 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW7-P0-FOREIGN-LISTING-MUTATION-001',
    'RW7-P0-STALE-PROFILE-AUTHORIZATION-002',
    'RW7-P0-PARTIAL-CORRUPTION-REWRITE-003',
    'RW7-P0-DUPLICATE-ID-AMBIGUITY-004',
    'RW7-P0-UNAPPROVED-60-DAY-DELETION-005',
    'RW7-P0-LOST-UPDATE-CONCURRENCY-006',
    'RW7-P0-STALE-EDIT-AND-MISSING-UPSERT-007',
    'RW7-P0-STORAGE-FAILURE-MEDIA-PRUNING-008',
    'RW7-P0-PRIVACY-EXPORT-DELETION-SCOPE-009',
    'RW7-P1-STALE-OWNER-UI-FALSE-SUCCESS-010',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW7 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.focusedRw7Flutter !== 'passed-15'
      || value.verification?.defaultFlutter
        !== 'passed-486-with-3-documented-profile-skips'
      || value.verification?.lifecyclePrivacyRetentionProvider !== 'passed'
      || value.verification?.rw7WiringTests !== 'passed'
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW7 verification truth is invalid.');
  }
  if (fullPassed && value.implementationHead == null) {
    fail('RW7 full regression requires an implementation head.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW7 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW7 cannot claim GitHub verification while CI is pending.');
  }

  if (!exact(value.ratchets, {
    reason: 'validated-local-listing-lifecycle-privacy-and-retention-source-change',
    privacyManifestSha256:
      '35c3a08e20e4f55183649af934e9415ea8cfd0c2d3327483a518cf477daee449',
    retentionManifestSha256:
      '955a901bbaec6511d119558b953274c3e5059a97c657fdcf93f2a939523315c8',
    activeProviderState: 'prepared-hold',
    completedOwnerDecisions: 0,
    requiredOwnerDecisions: 10,
    externalReadiness: false,
  })) fail('RW7 ratchet cause or provider truth is invalid.');

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
    fail('RW7 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW7 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(Object.hasOwn(sourceTexts, entry.path)
          ? sourceTexts[entry.path]
          : source(repositoryRoot, entry.path)) !== entry.sha256) {
      fail(`RW7 source inventory hash is stale: ${entry.path}`);
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
  const result = validateRw7LocalListingCatalogAuthorizationDurability();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
