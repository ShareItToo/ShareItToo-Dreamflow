#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw16-session-transition-principal-epoch-20260826.json';
const sourcePaths = [
  'lib/screens/security_screen.dart',
  'lib/screens/profile_screen.dart',
  'lib/screens/account_settings_screen.dart',
  'lib/screens/contact_data_screen.dart',
  'lib/screens/login_screen.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/data_service.dart',
  'lib/services/session_transition_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/tracked_dialog_route.dart',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'docs/evidence/48h-remote/rw15-security-interaction-owner-route-invariant-20260825.json',
  'scripts/technical_regression_check.sh',
  'test/rw16_session_transition_principal_epoch_test.dart',
  'test/tool/rw16_session_transition_principal_epoch_wiring.test.mjs',
  'test/tool/validate_rw16_session_transition_principal_epoch.test.mjs',
  'tool/validate_rw16_session_transition_principal_epoch.mjs',
  'docs/architecture/rw16-session-transition-principal-epoch-invariant-2026-08-26.md',
  'docs/operations/RW16_SESSION_TRANSITION_PRINCIPAL_EPOCH_CLOSURE_2026-08-26.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW16 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

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
    const text = Object.hasOwn(sourceTexts, path)
      ? sourceTexts[path]
      : readFileSync(join(repositoryRoot, path), 'utf8');
    const count = [...text.matchAll(matcher)].length;
    if (count > 0) counts[path] = count;
  }
  return counts;
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW16 evidence contains private or secret-shaped material.');
  }
}

export function validateRw16SessionTransitionPrincipalEpoch({
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
      || value.kind !== 'sit-rw16-session-transition-principal-epoch'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '39fc576627e3fefed019efe8ff1787b3b16eec2a') {
    fail('RW16 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW15',
    evidence:
      'docs/evidence/48h-remote/rw15-security-interaction-owner-route-invariant-20260825.json',
    verifiedImplementationHead: '9db0b98981e3f8f7ae7f654193cfc00532799177',
    closureCommit: '39fc576627e3fefed019efe8ff1787b3b16eec2a',
  })) fail('RW16 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'profile-session-logout-owner-and-epoch-closure',
      'login-session-clear-and-confirmed-empty-epoch-closure',
      'serialized-session-mutation-and-exact-owner-compare-and-clear',
      'conditional-current-profile-clear',
      'identity-bound-profile-logout-dialog-dismissal',
      'red-first-account-a-to-account-b-transition-regressions',
      'security-action-inventory-refresh',
      'mechanical-predecessor-hash-refresh',
      'deterministic-local-and-ci-regression-evidence',
    ],
    excluded: [
      'account-deletion-transaction-rw17',
      'contact-and-email-verification-actions-rw18',
      'backend-route-schema-and-auth-provider-change',
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
  })) fail('RW16 scope or deterministic-test policy is invalid.');

  const findingStates = [
    ['RW16-P0-PROFILE-LOGOUT-OWNER-RACE-001', 'resolved-and-tested'],
    ['RW16-P0-LOGIN-STALE-SESSION-CLEAR-RACE-002', 'resolved-and-tested'],
    ['RW16-P0-SESSION-MUTATION-TOCTOU-003', 'resolved-and-tested'],
    ['RW16-P0-CURRENT-PROFILE-BROAD-CLEAR-004', 'resolved-and-tested'],
    ['RW16-P0-A-DIALOG-B-NAVIGATOR-RACE-005', 'resolved-and-tested'],
  ];
  if (!exact(
    value.findings?.map(({ id, state }) => [id, state]),
    findingStates,
  ) || value.findings.some(({ resolution }) =>
    typeof resolution !== 'string' || !resolution)) {
    fail('RW16 finding set is invalid.');
  }

  if (!exact(value.transitionInvariant, {
    owner:
      'exact-user-session-email-created-at-plus-monotonic-auth-epoch-no-tokens',
    capture: 'known-principal-or-confirmed-empty-epoch-before-first-await',
    mutation: 'single-fifo-session-mutation-queue-with-epoch-increment',
    sessionClear: 'compare-exact-owner-inside-queue-preserve-successor',
    profileClear: 'compare-user-id-and-email-inside-profile-queue',
    presentation:
      'stable-completion-epoch-and-definite-session-absence-before-and-after-preview',
    navigation:
      'stable-completion-epoch-and-definite-session-absence-immediately-before-navigation',
    dialogDismissal: 'remove-exact-a-owned-route-never-pop-current-route',
    unknownState: 'no-guest-success-preview-cleanup-or-navigation',
  })) fail('RW16 transition invariant is invalid.');

  const actionInventory = [
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
    actionInventory,
  )) fail('RW16 security-action inventory is invalid.');

  const expectedCallSites = [
    ['AuthService.clearSession', {
      'lib/services/data_service.dart': 2,
    }],
    ['_sessionTransitions.signOut', {
      'lib/screens/login_screen.dart': 1,
      'lib/screens/profile_screen.dart': 1,
      'lib/services/account_deletion_service.dart': 1,
    }],
    ['_sessionTransitions.clearStaleSession', {
      'lib/screens/login_screen.dart': 1,
    }],
    ['AuthService.requestEmailChange', {}],
    ['AuthService.requestPhoneVerification', {
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['AuthService.confirmPhoneVerification', {
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['AuthService.requestEmailVerification', {}],
    ['_accountDeletionService.deleteAccount', {
      'lib/screens/account_settings_screen.dart': 1,
    }],
  ];
  if (!exact(
    value.callSiteInventory?.map(({ symbol, paths }) => [symbol, paths]),
    expectedCallSites,
  )) fail('RW16 call-site inventory declaration is invalid.');
  for (const [symbol, paths] of expectedCallSites) {
    const observed = countCallSites({ repositoryRoot, sourceTexts, symbol });
    if (!exact(observed, paths)) {
      fail(`RW16 call-site inventory drifted for ${symbol}.`);
    }
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirst !== 'failed-missing-owner-transition-contract-before-fix'
      || value.verification?.focusedRw16Flutter !== 'passed-9'
      || value.verification?.rw10Rw12Rw13Rw14Rw15CompatibilityFlutter !== 'passed-60'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw16WiringTests !== 'passed-5'
      || value.verification?.rw16ValidatorTests !== 'passed-3'
      || !['pending', 'passed-1915'].includes(value.verification?.completeToolInventory)
      || (fullPassed && value.verification.completeToolInventory !== 'passed-1915')
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW16 verification truth is invalid.');
  }

  if (!exact(value.inventoryAudit, {
    predecessorRepositoryOwnedFiles: 332,
    closureRepositoryOwnedFiles: 334,
    predecessorPassedTests: 1907,
    closurePassedTests: 1915,
    skippedTests: 0,
    executionPattern: 'node --test test/tool/*.test.mjs',
    standardNodeParallelism: true,
  })) fail('RW16 complete tool inventory is invalid.');

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW16 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null || value.localRegression !== null) {
    fail('RW16 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW16 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW16 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw15VerifiedHeadChanged !== false
      || value.ratchetAudit?.timingWorkaroundIntroduced !== false) {
    fail('RW16 ratchet audit is invalid.');
  }
  if (value.ratchets?.privacyManifestSha256
        !== 'd561cb1c02fb3b79227ee6890c1a8c06d0d322b6a6dbd9c3102e4260be3b8a32'
      || value.ratchets?.retentionManifestSha256
        !== '683667f212f89f44680f2fb6bd9556beb16417bf1d0d2ec3a83a37f68413762c'
      || value.ratchets?.activeProviderEvidenceSha256
        !== '2f8571f607d8cf9cbae1c3b0685dd70141ac2cc766dc1b818b6bbb0c6d41e60e'
      || value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW16 ratchet or provider truth is invalid.');
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
    fail('RW16 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW16 residual-risk truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW16 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const text = Object.hasOwn(sourceTexts, entry.path)
      ? sourceTexts[entry.path]
      : source(repositoryRoot, entry.path);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(text) !== entry.sha256) {
      fail(`RW16 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: findingStates.length,
    openActions: value.securityActionInventory
      .filter(({ status }) => status.startsWith('open-')).length,
    focusedRw16Flutter: value.verification.focusedRw16Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw16SessionTransitionPrincipalEpoch();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
