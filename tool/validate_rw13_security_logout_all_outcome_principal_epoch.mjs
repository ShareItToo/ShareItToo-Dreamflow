#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw13-security-logout-all-outcome-principal-epoch-20260825.json';
const sourceBindingHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'backend/src/app.js',
  'lib/screens/security_screen.dart',
  'lib/services/account_security_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/backend_repository.dart',
  'lib/services/shared_persistence_sync.dart',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'docs/evidence/48h-remote/rw10-local-security-control-truthfulness-20260825.json',
  'docs/evidence/48h-remote/rw12-security-success-ui-principal-epoch-20260825.json',
  'scripts/technical_regression_check.sh',
  'test/rw10_local_security_control_truthfulness_test.dart',
  'test/rw13_security_logout_all_outcome_principal_epoch_test.dart',
  'test/tool/rw13_security_logout_all_outcome_principal_epoch_wiring.test.mjs',
  'test/tool/validate_rw13_security_logout_all_outcome_principal_epoch.test.mjs',
  'tool/validate_rw13_security_logout_all_outcome_principal_epoch.mjs',
  'docs/architecture/rw13-security-logout-all-outcome-principal-epoch-2026-08-25.md',
  'docs/operations/RW13_SECURITY_LOGOUT_ALL_OUTCOME_PRINCIPAL_EPOCH_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW13 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceAtImplementationHead(repositoryRoot, value, path, sourceTexts) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { fail(`RW13 source-binding snapshot is unavailable: ${path}`); }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW13 evidence contains private or secret-shaped material.');
  }
}

export function validateRw13SecurityLogoutAllOutcomePrincipalEpoch({
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
      || value.kind !== 'sit-rw13-security-logout-all-outcome-principal-epoch'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== 'fcfdbc352185d3bf50a735478f03e32ffe709767') {
    fail('RW13 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW12',
    evidence:
      'docs/evidence/48h-remote/rw12-security-success-ui-principal-epoch-20260825.json',
    verifiedImplementationHead: '0a13df419f4abd5e30858503f4e93f23c9e9d9f1',
    closureCommit: 'fcfdbc352185d3bf50a735478f03e32ffe709767',
  })) fail('RW13 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'logout-all-post-service-principal-epoch-navigation-guard',
      'three-way-logout-all-result-truth',
      'exact-invoking-account-session-containment',
      'fail-closed-definite-local-session-absence',
      'stale-session-list-invalidation-after-non-rejection',
      'red-first-account-a-to-account-b-widget-regression',
      'mechanical-predecessor-hash-refresh',
      'deterministic-local-and-ci-regression-evidence',
    ],
    excluded: [
      'backend-route-schema-and-auth-provider-change',
      'single-remote-device-revocation-expansion',
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
  })) fail('RW13 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW13-P0-POST-LOGOUT-STALE-NAVIGATION-001',
    'RW13-P0-LOGOUT-OUTCOME-COLLAPSE-002',
    'RW13-P1-DECODED-NULL-ABSENCE-003',
    'RW13-P1-STALE-DEVICE-CACHE-AFTER-NON-REJECTION-004',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW13 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirstAccountSwitch
        !== 'failed-login-navigation-visible-before-fix'
      || value.verification?.focusedRw13Flutter !== 'passed-12'
      || value.verification?.rw10Rw12Rw13B10Flutter !== 'passed-58'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw13WiringTests !== 'passed-10'
      || value.verification?.completeToolInventory !== 'passed-1887'
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.privacyRetentionProvider !== 'passed'
      || value.verification?.predecessorValidators !== 'passed'
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW13 verification truth is invalid.');
  }
  if (!exact(value.inventoryAudit, {
    predecessorRepositoryOwnedFiles: 326,
    closureRepositoryOwnedFiles: 328,
    predecessorPassedTests: 1877,
    closurePassedTests: 1887,
    skippedTests: 0,
    executionPattern: 'node --test test/tool/*.test.mjs',
    standardNodeParallelism: true,
  })) fail('RW13 complete tool inventory is invalid.');

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW13 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null
      || value.localRegression !== null) {
    fail('RW13 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW13 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW13 cannot claim GitHub verification while CI is pending.');
  }

  if (!exact(value.stateModel, {
    successEligible:
      'server-confirmed-and-session-key-definitely-absent-and-post-service-epoch-stable',
    rejected: 'allowlisted-structured-4xx-only',
    confirmedLocalFinalizationFailed:
      'server-confirmed-but-exact-local-finalization-not-proved',
    outcomeUnknown: 'timeout-transport-5xx-or-invalid-response',
    successForbidden: [
      'successor-account-active',
      'session-key-present-valid-malformed-or-opaque',
      'session-storage-unreadable',
      'epoch-or-widget-changed',
    ],
    serverConfirmedEmptySessions:
      'distinct-from-discarded-cache-load-error-and-not-yet-loaded',
  })) fail('RW13 fail-closed state model is invalid.');

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw12SemanticsChanged !== false
      || !Array.isArray(value.ratchetAudit?.mechanicalRefreshes)
      || value.ratchetAudit.mechanicalRefreshes.length !== 3) {
    fail('RW13 ratchet audit is invalid.');
  }
  if (!/^[a-f0-9]{64}$/u.test(value.ratchets?.privacyManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.retentionManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.activeProviderEvidenceSha256 ?? '')
      || value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW13 ratchet or provider truth is invalid.');
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
    fail('RW13 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW13 residual-risk truth is invalid.');
  }
  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW13 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const text = sourceAtImplementationHead(repositoryRoot, value, entry.path, sourceTexts);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(text) !== entry.sha256) {
      fail(`RW13 source inventory hash is stale: ${entry.path}`);
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
    fail('RW13 ratchet hashes are not source-bound.');
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: findingIds.length,
    focusedRw13Flutter: value.verification.focusedRw13Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw13SecurityLogoutAllOutcomePrincipalEpoch();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
