#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw9-local-account-profile-authorization-durability-20260825.json';
const sourcePaths = [
  'lib/models/user.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/data_service.dart',
  'lib/screens/change_address_screen.dart',
  'lib/screens/contact_data_screen.dart',
  'lib/screens/edit_profile_screen.dart',
  'lib/screens/edit_social_media_screen.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/own_profile_screen.dart',
  'lib/screens/privacy_info_screen.dart',
  'lib/screens/profile_info_screen.dart',
  'lib/screens/register_screen.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_active_infrastructure_mail_provider_readiness.mjs',
  'scripts/technical_regression_check.sh',
  'test/rw9_local_account_profile_authorization_durability_test.dart',
  'test/tool/rw9_local_account_profile_authorization_durability_wiring.test.mjs',
  'test/tool/profile_info_async_lifecycle_wiring.test.mjs',
  'test/tool/validate_rw9_local_account_profile_authorization_durability.test.mjs',
  'tool/validate_rw9_local_account_profile_authorization_durability.mjs',
  'docs/compliance/g2l-g2-data-lifecycle-2026-08-20.md',
  'docs/architecture/rw9-local-account-profile-authorization-durability-recovery-2026-08-25.md',
  'docs/operations/RW9_LOCAL_ACCOUNT_PROFILE_AUTHORIZATION_DURABILITY_RECOVERY_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW9 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW9 evidence contains private or secret-shaped material.');
  }
}

export function validateRw9LocalAccountProfileAuthorizationDurability({
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
        !== 'sit-rw9-local-account-profile-authorization-durability'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '3d9297a100d387ca1fdc04f4a9ea86efd647bbfb') {
    fail('RW9 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW8',
    evidence:
      'docs/evidence/48h-remote/rw8-local-review-reputation-authorization-durability-20260825.json',
    verifiedImplementationHead: '9d4780f0d7ebd88bc2521ae38d77203e181ecda6',
    closureCommit: '3d9297a100d387ca1fdc04f4a9ea86efd647bbfb',
  })) fail('RW9 predecessor binding is invalid.');

  const allowed = [
    'matching-auth-session-exact-current-account-profile-patches',
    'caller-mutable-field-allowlist-and-explicit-null-clears',
    'protected-identity-verification-moderation-payout-reputation-and-deactivation',
    'strict-bounded-whole-current-and-users-document-decoding',
    'exact-raw-corruption-preservation-without-read-normalization',
    'serialized-verified-paired-profile-writes-with-exact-rollback',
    'capacity-and-storage-failure-without-profile-pruning',
    'snapshot-write-removal-from-user-facing-profile-surfaces',
    'current-account-only-profile-privacy-export',
    'exact-current-account-anonymization-and-deletion-order',
    'input-preserving-ui-retry-and-honest-local-verification',
    'synthetic-deterministic-local-regression',
  ];
  const excluded = [
    'production-backend-schema-and-remote-auth-provider-contract',
    'contract-quote-acceptance-cancellation-and-refund',
    'payment-payout-provider-and-real-money',
    'handover-return-damage-and-needs-review-policy',
    'moderation-policy-and-public-reputation-ranking',
    'provider-ai-candidate-device-store-pilot-and-legal-owner-gates',
    'gitguardian-finding-content-pr-merge-and-history-rewrite',
  ];
  if (!exact(value.scope, {
    allowed,
    excluded,
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    silentProfilePruningAllowed: false,
  })) fail('RW9 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW9-P0-CALLER-PROTECTED-FIELD-OVERWRITE-001',
    'RW9-P0-STALE-SNAPSHOT-DATA-LOSS-002',
    'RW9-P0-SESSION-IDENTITY-DRIFT-003',
    'RW9-P0-CORRUPTION-AS-DEFAULT-004',
    'RW9-P0-PAIRED-DOCUMENT-LOSS-005',
    'RW9-P0-LOST-UPDATE-CONCURRENCY-006',
    'RW9-P0-UNBOUNDED-OR-PRUNED-PROFILES-007',
    'RW9-P0-FOREIGN-DEACTIVATION-008',
    'RW9-P0-PRIVACY-EXPORT-SCOPE-009',
    'RW9-P1-FAKE-VERIFICATION-OR-FALSE-SUCCESS-010',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW9 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.focusedRw9Flutter !== 'passed-13'
      || value.verification?.lifecyclePrivacyRetentionProvider !== 'passed'
      || value.verification?.rw9WiringTests !== 'passed-7'
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW9 verification truth is invalid.');
  }
  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW9 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null
      || value.localRegression !== null) {
    fail('RW9 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW9 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW9 cannot claim GitHub verification while CI is pending.');
  }

  if (!exact(value.ratchets, {
    reason:
      'validated-local-account-profile-lifecycle-privacy-retention-and-provider-source-change',
    privacyManifestSha256:
      '21a8d57c786dc62fb43cab29b9143286768989d721beabf156a5ef9a4cc8e707',
    retentionManifestSha256:
      '683667f212f89f44680f2fb6bd9556beb16417bf1d0d2ec3a83a37f68413762c',
    activeProviderEvidenceSha256:
      'd56bd4d4e90b95d2f27c224df3a8e5b9d40765a5874820b3a3fb4ab441219d8a',
    activeProviderState: 'prepared-hold',
    completedOwnerDecisions: 0,
    requiredOwnerDecisions: 10,
    externalReadiness: false,
  })) fail('RW9 ratchet cause or provider truth is invalid.');
  if (value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || !Array.isArray(value.ratchetAudit?.predecessorSourceInventoryRefreshes)
      || value.ratchetAudit.predecessorSourceInventoryRefreshes.length !== 3
      || typeof value.ratchetAudit?.cause !== 'string'
      || typeof value.ratchetAudit?.verification !== 'string') {
    fail('RW9 ratchet audit is invalid.');
  }

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
    fail('RW9 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW9 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(Object.hasOwn(sourceTexts, entry.path)
          ? sourceTexts[entry.path]
          : source(repositoryRoot, entry.path)) !== entry.sha256) {
      fail(`RW9 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);

  return {
    status: value.status,
    allowedSurfaces: allowed.length,
    excludedSurfaces: excluded.length,
    resolvedFindings: findingIds.length,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
  };
}

function main() {
  const result = validateRw9LocalAccountProfileAuthorizationDurability();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
