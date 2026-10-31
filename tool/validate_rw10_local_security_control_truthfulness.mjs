#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw10-local-security-control-truthfulness-20260825.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'lib/models/security.dart',
  'lib/screens/security_screen.dart',
  'lib/screens/two_factor_auth_screen.dart',
  'lib/services/account_security_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/backend_repository.dart',
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'backend/ops/secret_scan_history_baseline.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_active_infrastructure_mail_provider_readiness.mjs',
  'scripts/technical_regression_check.sh',
  'test/b10_release_truthfulness_test.dart',
  'test/rw10_local_security_control_truthfulness_test.dart',
  'test/tool/rw10_local_security_control_truthfulness_wiring.test.mjs',
  'test/tool/validate_rw10_local_security_control_truthfulness.test.mjs',
  'tool/validate_rw10_local_security_control_truthfulness.mjs',
  'docs/architecture/rw10-local-security-control-truthfulness-2026-08-25.md',
  'docs/operations/RW10_LOCAL_SECURITY_CONTROL_TRUTHFULNESS_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW10 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW10 evidence contains private or secret-shaped material.');
  }
}

export function validateRw10LocalSecurityControlTruthfulness({
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
      || value.kind !== 'sit-rw10-local-security-control-truthfulness'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '3f42924f297f758d0e4f62a3a78562d075494658') {
    fail('RW10 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW9',
    evidence:
      'docs/evidence/48h-remote/rw9-local-account-profile-authorization-durability-20260825.json',
    verifiedImplementationHead: '0bfc57fca09dc8586e5eeb64c46a0af1ba6bc606',
    closureCommit: '3f42924f297f758d0e4f62a3a78562d075494658',
  })) fail('RW10 predecessor binding is invalid.');

  const allowed = [
    'offline-account-security-unavailable-truth',
    'server-authoritative-password-session-and-logout-controls',
    'exact-account-session-email-response-rechecks',
    'strict-bounded-whole-server-session-list-decoding',
    'current-session-foreign-revoke-prohibition',
    'exact-conditional-local-session-clear',
    'retired-local-two-factor-and-device-simulation',
    'session-change-ui-secret-and-stale-state-clearing',
    'persistent-retryable-server-error-state',
    'legacy-preview-byte-preservation-without-read-normalization',
    'large-text-small-viewport-scrollability',
    'synthetic-deterministic-local-regression',
  ];
  const excluded = [
    'backend-route-schema-and-remote-auth-provider-change',
    'two-factor-identity-verification-and-provider-activation',
    'production-firebase-vps-dns-cloud-store-and-device',
    'contract-quote-acceptance-cancellation-and-refund',
    'payment-payout-provider-and-real-money',
    'handover-return-damage-moderation-and-needs-review',
    'external-ai-candidate-pilot-legal-and-owner-gates',
    'gitguardian-finding-content-pr-merge-and-history-rewrite',
  ];
  if (!exact(value.scope, {
    allowed,
    excluded,
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    liveAuthTrafficAllowed: false,
  })) fail('RW10 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW10-P0-LOCAL-PASSWORD-SUCCESS-SIMULATION-001',
    'RW10-P0-LOCAL-TWO-FACTOR-PROTECTION-CLAIM-002',
    'RW10-P0-SEEDED-SESSION-DEVICE-TRUTH-003',
    'RW10-P0-PARTIAL-SERVER-SESSION-SALVAGE-004',
    'RW10-P0-SESSION-RESPONSE-PRINCIPAL-DRIFT-005',
    'RW10-P0-BROAD-SUCCESSOR-SESSION-CLEAR-006',
    'RW10-P0-CURRENT-SESSION-FOREIGN-REVOKE-007',
    'RW10-P1-STALE-ASYNC-SECURITY-UI-008',
    'RW10-P1-NONRETRYABLE-SESSION-LOAD-FAILURE-009',
    'RW10-P1-LEGACY-SECURITY-READ-MUTATION-010',
    'RW10-P1-SECRET-SCAN-FIXTURE-011',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW10 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.focusedRw10Flutter !== 'passed-13'
      || value.verification?.rw10PlusB10Flutter !== 'passed-34'
      || value.verification?.privacyRetentionProvider !== 'passed'
      || value.verification?.rw10WiringTests !== 'passed-8'
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW10 verification truth is invalid.');
  }
  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW10 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null
      || value.localRegression !== null) {
    fail('RW10 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW10 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW10 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchets?.reason
        !== 'retired-local-security-simulation-and-exact-session-clear-source-change'
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.privacyManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.retentionManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.activeProviderEvidenceSha256 ?? '')
      || value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW10 ratchet or provider truth is invalid.');
  }
  if (value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || !Array.isArray(value.ratchetAudit?.predecessorSourceInventoryRefreshes)
      || value.ratchetAudit.predecessorSourceInventoryRefreshes.length !== 3
      || typeof value.ratchetAudit?.cause !== 'string'
      || typeof value.ratchetAudit?.verification !== 'string') {
    fail('RW10 ratchet audit is invalid.');
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
    fail('RW10 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW10 residual-risk truth is invalid.');
  }
  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW10 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const text = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW10 source-binding snapshot',
    });
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256) || sha256(text) !== entry.sha256) {
      fail(`RW10 source inventory hash is stale: ${entry.path}`);
    }
  }
  if (value.ratchets.privacyManifestSha256
        !== value.sourceInventory.find(({ path }) =>
          path === 'store/privacy-disclosures.json')?.sha256
      || value.ratchets.retentionManifestSha256
        !== value.sourceInventory.find(({ path }) =>
          path === 'store/retention-deletion-readiness.json')?.sha256
      || value.ratchets.activeProviderEvidenceSha256
        !== value.sourceInventory.find(({ path }) =>
          path === 'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json')?.sha256) {
    fail('RW10 ratchet hashes are not source-bound.');
  }
  assertSanitized(value);

  return {
    status: value.status,
    resolvedFindings: findingIds.length,
    residualRisks: value.residualRisks.length,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
  };
}

function main() {
  const result = validateRw10LocalSecurityControlTruthfulness();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
