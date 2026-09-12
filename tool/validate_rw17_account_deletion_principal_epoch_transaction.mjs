#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw17-account-deletion-principal-epoch-transaction-20260826.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'lib/screens/account_settings_screen.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/backend_repository.dart',
  'lib/services/data_service.dart',
  'lib/services/local_safety_privacy_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/session_transition_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/tracked_dialog_route.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'docs/evidence/48h-remote/rw16-session-transition-principal-epoch-20260826.json',
  'scripts/technical_regression_check.sh',
  'test/rw17_account_deletion_principal_epoch_transaction_test.dart',
  'test/tool/rw5_local_safety_privacy_principal_isolation_wiring.test.mjs',
  'test/tool/rw6_local_operational_authorization_truth_recovery_wiring.test.mjs',
  'test/tool/rw9_local_account_profile_authorization_durability_wiring.test.mjs',
  'test/tool/rw17_account_deletion_principal_epoch_transaction_wiring.test.mjs',
  'test/tool/validate_rw17_account_deletion_principal_epoch_transaction.test.mjs',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_rw17_account_deletion_principal_epoch_transaction.mjs',
  'docs/architecture/rw17-account-deletion-principal-epoch-transaction-2026-08-26.md',
  'docs/operations/RW17_ACCOUNT_DELETION_PRINCIPAL_EPOCH_TRANSACTION_CLOSURE_2026-08-26.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW17 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function repositoryDartPaths(repositoryRoot) {
  const paths = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() && entry.name.endsWith('.dart')) {
        paths.push(relative(repositoryRoot, absolute).replaceAll('\\', '/'));
      }
    }
  };
  visit(join(repositoryRoot, 'lib'));
  return paths.sort();
}

function countCallSites({ repositoryRoot, sourceTexts, symbol }) {
  const matcher = new RegExp(`${escapeRegExp(symbol)}\\s*\\(`, 'gu');
  const counts = {};
  for (const path of repositoryDartPaths(repositoryRoot)) {
    const content = Object.hasOwn(sourceTexts, path)
      ? sourceTexts[path]
      : readFileSync(join(repositoryRoot, path), 'utf8');
    const count = [...content.matchAll(matcher)].length;
    if (count > 0) counts[path] = count;
  }
  return counts;
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW17 evidence contains private or secret-shaped material.');
  }
}

export function validateRw17AccountDeletionPrincipalEpochTransaction({
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
      || value.kind !== 'sit-rw17-account-deletion-principal-epoch-transaction'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '5b2862ad40f79fe2287977868660f348806d68ae') {
    fail('RW17 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW16',
    evidence:
      'docs/evidence/48h-remote/rw16-session-transition-principal-epoch-20260826.json',
    verifiedImplementationHead: '4e307afa7f17cb0ac710ab19cea8f963c12b6dd4',
    closureCommit: '5b2862ad40f79fe2287977868660f348806d68ae',
  })) fail('RW17 predecessor binding is invalid.');

  if (!Array.isArray(value.findings)
      || value.findings.length !== 6
      || value.findings.some(({ id, state }) =>
        !/^RW17-P0-/u.test(id) || state !== 'resolved-and-tested')) {
    fail('RW17 finding closure is invalid.');
  }
  if (!exact(value.definiteRejectionContracts, [
    { status: 401, code: 'authentication_required' },
    { status: 401, code: 'invalid_or_expired_session' },
    { status: 401, code: 'account_not_active' },
    { status: 401, code: 'invalid_credentials' },
    { status: 409, code: 'account_deletion_blocked' },
    { status: 429, code: 'rate_limit_exceeded' },
  ])) fail('RW17 definite-rejection contract drifted.');

  const expectedActions = [
    ['security.password.change', 'lib/screens/security_screen.dart', 'guarded-rw15'],
    ['security.remote-session.revoke', 'lib/screens/security_screen.dart', 'guarded-rw15'],
    ['security.sessions.logout-all', 'lib/screens/security_screen.dart', 'guarded-rw15'],
    ['profile.session.logout', 'lib/screens/profile_screen.dart', 'guarded-rw16'],
    ['account.deletion', 'lib/screens/account_settings_screen.dart', 'guarded-rw17'],
    ['contact.email-change', 'lib/screens/contact_data_screen.dart', 'guarded-rw18'],
    ['contact.phone-verification', 'lib/screens/contact_data_screen.dart', 'guarded-rw18'],
    ['contact.email-verification', 'lib/screens/contact_data_screen.dart', 'guarded-rw18'],
    ['login.session-clear', 'lib/screens/login_screen.dart', 'guarded-rw16'],
    ['login.email-verification', 'lib/screens/login_screen.dart', 'guarded-rw18'],
    ['legacy.change-password-placeholder', 'lib/screens/change_password_screen.dart', 'unreachable-b10-guarded'],
    ['data-service.test-session-clear-hook', 'lib/services/data_service.dart', 'test-only'],
  ];
  if (!exact(
    value.securityActionInventory?.map(({ id, file, status }) => [id, file, status]),
    expectedActions,
  )) fail('RW17 security-action inventory is invalid.');

  const expectedCallSites = [
    ['AuthService.clearSession', {'lib/services/data_service.dart': 2}],
    ['_sessionTransitions.signOut', {
      'lib/screens/login_screen.dart': 1,
      'lib/screens/profile_screen.dart': 1,
      'lib/services/account_deletion_service.dart': 1,
    }],
    ['_accountDeletionService.preflightCheck', {
      'lib/screens/account_settings_screen.dart': 1,
    }],
    ['_accountDeletionService.deleteAccount', {
      'lib/screens/account_settings_screen.dart': 1,
    }],
    ['DataService.clearOperationalRecordsForConfirmedAccountDeletion', {
      'lib/services/account_deletion_service.dart': 1,
    }],
    ['DataService.clearSavedItemsForConfirmedAccountDeletion', {
      'lib/services/account_deletion_service.dart': 2,
    }],
    ['LocalSafetyPrivacyService.clearPrincipalForConfirmedAccountDeletion', {
      'lib/services/account_deletion_service.dart': 2,
    }],
    ['DataService.finalizeProfileForConfirmedAccountDeletion', {
      'lib/services/account_deletion_service.dart': 2,
    }],
  ];
  if (!exact(
    value.callSiteInventory?.map(({ symbol, paths }) => [symbol, paths]),
    expectedCallSites,
  )) fail('RW17 call-site inventory declaration is invalid.');
  for (const [symbol, paths] of expectedCallSites) {
    if (!exact(countCallSites({ repositoryRoot, sourceTexts, symbol }), paths)) {
      fail(`RW17 call-site inventory drifted for ${symbol}.`);
    }
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirst
        !== 'failed-missing-typed-deletion-context-outcome-and-completion-contract-before-fix'
      || value.verification?.focusedRw17Flutter !== 'passed-13'
      || value.verification?.rw17AndAdjacentCompatibilityFlutter
        !== 'passed-134'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw17WiringTests !== 'passed-6'
      || value.verification?.rw17ValidatorTests !== 'passed-3'
      || !['pending', 'passed-1924'].includes(value.verification?.completeToolInventory)
      || (fullPassed && value.verification.completeToolInventory !== 'passed-1924')
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW17 verification truth is invalid.');
  }
  if (!exact(value.inventoryAudit, {
    predecessorRepositoryOwnedFiles: 334,
    closureRepositoryOwnedFiles: 341,
    predecessorPassedTests: 1915,
    closurePassedTests: 1924,
    skippedTests: 0,
    executionPattern: 'node --test test/tool/*.test.mjs',
    standardNodeParallelism: true,
  })) fail('RW17 complete tool inventory is invalid.');

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW17 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null || value.localRegression !== null) {
    fail('RW17 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW17 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW17 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== true
      || value.ratchetAudit?.retentionSemanticsChanged !== true
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw16VerifiedHeadChanged !== false
      || value.ratchetAudit?.timingWorkaroundIntroduced !== false) {
    fail('RW17 ratchet cause or boundary is invalid.');
  }
  const sourceHash = (path) =>
    value.sourceInventory?.find((entry) => entry.path === path)?.sha256;
  if (value.ratchets?.privacyManifestSha256
        !== sourceHash('store/privacy-disclosures.json')
      || value.ratchets?.retentionManifestSha256
        !== sourceHash('store/retention-deletion-readiness.json')
      || value.ratchets?.activeProviderEvidenceSha256
        !== sourceHash('docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json')
      || value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW17 ratchet or provider truth is invalid.');
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
    fail('RW17 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW17 residual-risk truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW17 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const content = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW17 source-binding snapshot',
    });
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(content) !== entry.sha256) {
      fail(`RW17 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: value.findings.length,
    openActions: value.securityActionInventory
      .filter(({ status }) => status.startsWith('open-')).length,
    focusedRw17Flutter: value.verification.focusedRw17Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw17AccountDeletionPrincipalEpochTransaction();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
