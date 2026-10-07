#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw12-security-success-ui-principal-epoch-20260825.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'lib/screens/security_screen.dart',
  'lib/services/account_security_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/services/shared_persistence_sync_web.dart',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'docs/evidence/48h-remote/rw10-local-security-control-truthfulness-20260825.json',
  'docs/evidence/48h-remote/rw11-regression-completeness-stale-support-wiring-20260825.json',
  'scripts/technical_regression_check.sh',
  'test/rw12_security_success_ui_principal_epoch_test.dart',
  'test/tool/rw12_security_success_ui_principal_epoch_wiring.test.mjs',
  'test/tool/validate_rw12_security_success_ui_principal_epoch.test.mjs',
  'tool/validate_rw12_security_success_ui_principal_epoch.mjs',
  'docs/architecture/rw12-security-success-ui-principal-epoch-2026-08-25.md',
  'docs/operations/RW12_SECURITY_SUCCESS_UI_PRINCIPAL_EPOCH_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW12 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW12 evidence contains private or secret-shaped material.');
  }
}

export function validateRw12SecuritySuccessUiPrincipalEpoch({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-passed-full-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-rw12-security-success-ui-principal-epoch'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '521f565a77faecd8de006f355c8fced4b363a8d6') {
    fail('RW12 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW11',
    evidence:
      'docs/evidence/48h-remote/rw11-regression-completeness-stale-support-wiring-20260825.json',
    verifiedImplementationHead: '7768651bf63d266fb8d98f75f2883536e77adde0',
    closureCommit: '521f565a77faecd8de006f355c8fced4b363a8d6',
  })) fail('RW12 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'password-success-ui-post-service-principal-epoch-recheck',
      'fail-closed-definite-local-session-absence',
      'web-account-security-state-notification-binding',
      'red-first-account-a-to-account-b-widget-regression',
      'same-session-success-control',
      'three-way-password-result-truth-and-exact-a-session-containment',
      'mechanical-privacy-retention-provider-and-predecessor-hash-refresh',
      'deterministic-local-and-ci-regression-evidence',
    ],
    excluded: [
      'backend-route-schema-and-auth-provider-change',
      'logout-all-ui-epoch-expansion',
      'timing-retry-parallelism-reduction-and-test-exclusion',
      'production-vps-dns-cloud-firebase-store-and-play',
      'payment-provider-ai-pilot-real-money-and-live-traffic',
      'legal-owner-gitguardian-pr-merge-and-history-rewrite',
    ],
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    liveAuthTrafficAllowed: false,
  })) fail('RW12 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW12-P0-POST-SERVICE-STALE-SUCCESS-UI-001',
    'RW12-P1-AMBIGUOUS-LOCAL-SESSION-ABSENCE-002',
    'RW12-P1-WEB-SECURITY-EPOCH-NOTIFICATION-GAP-003',
    'RW12-P0-AMBIGUOUS-PASSWORD-RESULT-MESSAGING-004',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW12 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirstAccountSwitch
        !== 'failed-stale-success-visible-before-fix'
      || value.verification?.focusedRw12Flutter !== 'passed-12'
      || value.verification?.rw10Rw12B10Flutter !== 'passed-46'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw12WiringTests !== 'passed-10'
      || value.verification?.completeToolInventory !== 'passed-1877'
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.privacyRetentionProvider !== 'passed'
      || value.verification?.predecessorValidators !== 'passed'
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW12 verification truth is invalid.');
  }
  if (!exact(value.inventoryAudit, {
    predecessorRepositoryOwnedFiles: 324,
    closureRepositoryOwnedFiles: 326,
    predecessorPassedTests: 1867,
    closurePassedTests: 1877,
    skippedTests: 0,
    executionPattern: 'node --test test/tool/*.test.mjs',
    standardNodeParallelism: true,
  })) fail('RW12 complete tool inventory is invalid.');
  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW12 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null
      || value.localRegression !== null) {
    fail('RW12 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW12 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW12 cannot claim GitHub verification while CI is pending.');
  }

  if (value.stateModel?.successEligible !== 'server-confirmed-and-session-key-definitely-absent-and-epoch-stable'
      || !exact(value.stateModel?.notSuccessEligible, [
        'session-key-present-valid-or-successor',
        'session-key-present-malformed-or-opaque',
        'session-storage-unreadable',
        'backend-or-service-error',
        'not-yet-loaded',
        'epoch-or-widget-changed',
      ])
      || value.stateModel?.serverConfirmedEmptySessions
        !== 'distinct-from-load-error-and-not-yet-loaded') {
    fail('RW12 fail-closed state model is invalid.');
  }
  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw11SemanticsChanged !== false
      || !Array.isArray(value.ratchetAudit?.mechanicalRefreshes)
      || value.ratchetAudit.mechanicalRefreshes.length !== 3) {
    fail('RW12 ratchet audit is invalid.');
  }
  if (!/^[a-f0-9]{64}$/u.test(value.ratchets?.privacyManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.retentionManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.activeProviderEvidenceSha256 ?? '')
      || value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW12 ratchet or provider truth is invalid.');
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
    fail('RW12 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW12 residual-risk truth is invalid.');
  }
  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW12 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const text = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW12 source-binding snapshot',
    });
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(text) !== entry.sha256) {
      fail(`RW12 source inventory hash is stale: ${entry.path}`);
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
    fail('RW12 ratchet hashes are not source-bound.');
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: findingIds.length,
    focusedRw12Flutter: value.verification.focusedRw12Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw12SecuritySuccessUiPrincipalEpoch();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
