#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw18-contact-verification-principal-epoch-transaction-20260826.json';
const sourceBindingHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'backend/src/app.js',
  'backend/src/firebase_phone_verification.js',
  'backend/test/firebase_phone_verification.test.js',
  'backend/test/postgres_foundation.integration.test.js',
  'lib/screens/contact_data_screen.dart',
  'lib/screens/login_screen.dart',
  'lib/services/auth_service.dart',
  'lib/services/backend_http.dart',
  'lib/services/contact_verification_service.dart',
  'lib/services/data_service.dart',
  'lib/services/session_transition_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/tracked_dialog_route.dart',
  'docs/evidence/48h-remote/rw17-account-deletion-principal-epoch-transaction-20260826.json',
  'scripts/technical_regression_check.sh',
  'test/phone_verification_contract_test.dart',
  'test/rw18_contact_verification_principal_epoch_transaction_test.dart',
  'test/tool/rw18_contact_verification_principal_epoch_transaction_wiring.test.mjs',
  'test/tool/validate_rw18_contact_verification_principal_epoch_transaction.test.mjs',
  'tool/validate_rw18_contact_verification_principal_epoch_transaction.mjs',
  'docs/architecture/rw18-contact-verification-principal-epoch-transaction-2026-08-26.md',
  'docs/operations/RW18_CONTACT_VERIFICATION_PRINCIPAL_EPOCH_TRANSACTION_CLOSURE_2026-08-26.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW18 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceAtImplementationHead(repositoryRoot, value, path, sourceTexts) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { fail(`RW18 source-binding snapshot is unavailable: ${path}`); }
}
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
    fail('RW18 evidence contains private or secret-shaped material.');
  }
}

export function validateRw18ContactVerificationPrincipalEpochTransaction({
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
      || value.kind !== 'sit-rw18-contact-verification-principal-epoch-transaction'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '3f1f6aae4e66356712230ecd6b2a560bf6d72680') {
    fail('RW18 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW17',
    evidence:
      'docs/evidence/48h-remote/rw17-account-deletion-principal-epoch-transaction-20260826.json',
    verifiedImplementationHead: '7ec6a24eadd1b04c9e3c77025d0ebf5f6fe59c34',
    closureCommit: '3f1f6aae4e66356712230ecd6b2a560bf6d72680',
  })) fail('RW18 predecessor binding is invalid.');

  if (!Array.isArray(value.findings)
      || value.findings.length !== 8
      || value.findings.some(({ id, state }) =>
        !/^RW18-P[01]-/u.test(id) || state !== 'resolved-and-tested')) {
    fail('RW18 finding closure is invalid.');
  }

  const contracts = value.definiteRejectionContracts;
  if (!exact(contracts?.emailChange, [
    { status: 400, code: 'invalid_email' },
    { status: 400, code: 'email_unchanged' },
    { status: 401, code: 'authentication_required' },
    { status: 401, code: 'invalid_or_expired_session' },
    { status: 401, code: 'account_not_active' },
    { status: 401, code: 'invalid_credentials' },
    { status: 409, code: 'email_in_use' },
    { status: 429, code: 'rate_limit_exceeded' },
  ]) || !exact(contracts?.emailVerificationRequest, [
    { status: 429, code: 'rate_limit_exceeded' },
  ]) || !exact(contracts?.phoneConfirmation, [
    { status: 400, code: 'invalid_phone' },
    { status: 401, code: 'authentication_required' },
    { status: 401, code: 'invalid_or_expired_session' },
    { status: 401, code: 'account_not_active' },
    { status: 401, code: 'invalid_phone_verification_token' },
    { status: 401, code: 'invalid_phone_verification_provider' },
    { status: 404, code: 'user_not_found' },
    { status: 409, code: 'phone_already_verified' },
    { status: 409, code: 'phone_identity_cleanup_unsafe' },
    { status: 422, code: 'phone_verification_mismatch' },
    { status: 429, code: 'rate_limit_exceeded' },
    { status: 502, code: 'phone_identity_cleanup_failed' },
    { status: 503, code: 'phone_verification_unavailable' },
  ])) fail('RW18 definite-rejection contract drifted.');
  if ([
    ...contracts.emailChange,
    ...contracts.emailVerificationRequest,
    ...contracts.phoneConfirmation,
  ].some(({ status }) => status === 408)) {
    fail('RW18 408 cannot be classified as a definite rejection.');
  }

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
  )) fail('RW18 security-action inventory is invalid.');

  const expectedCallSites = [
    ['AuthService.requestEmailChange', {}],
    ['AuthService.requestEmailVerification', {}],
    ['AuthService.accessTokenForOwner', {
      'lib/services/backend_repository.dart': 3,
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['.requestEmailChange', {'lib/screens/contact_data_screen.dart': 1}],
    ['.requestContactEmailVerification', {
      'lib/screens/contact_data_screen.dart': 1,
    }],
    ['.requestLoginEmailVerification', {'lib/screens/login_screen.dart': 1}],
    ['.requestPhoneVerification', {
      'lib/screens/contact_data_screen.dart': 1,
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['.confirmPhoneVerification', {
      'lib/screens/contact_data_screen.dart': 1,
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['.refreshVerifiedProfile', {'lib/screens/contact_data_screen.dart': 3}],
    ['showTrackedModalBottomSheet<T>', {
      'lib/screens/contact_data_screen.dart': 1,
      'lib/widgets/profile_mutation_interaction.dart': 1,
      'lib/widgets/safety_action_interaction.dart': 1,
      'lib/widgets/tracked_dialog_route.dart': 1,
    }],
  ];
  if (!exact(
    value.callSiteInventory?.map(({ symbol, paths }) => [symbol, paths]),
    expectedCallSites,
  )) fail('RW18 call-site inventory declaration is invalid.');
  for (const [symbol, paths] of expectedCallSites) {
    if (!exact(countCallSites({ repositoryRoot, sourceTexts, symbol }), paths)) {
      fail(`RW18 call-site inventory drifted for ${symbol}.`);
    }
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirst
        !== 'failed-missing-principal-bound-contact-coordinator-phone-owner-attempt-login-owner-and-tracked-modal-contract-before-fix'
      || value.verification?.focusedRw18Flutter !== 'passed-17'
      || value.verification?.rw16Rw17AndPhoneCompatibilityFlutter !== 'passed-41'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw18WiringTests !== 'passed-7'
      || !['pending', 'passed-3'].includes(value.verification?.rw18ValidatorTests)
      || !['pending', 'passed-1934'].includes(value.verification?.completeToolInventory)
      || (fullPassed && value.verification.rw18ValidatorTests !== 'passed-3')
      || (fullPassed && value.verification.completeToolInventory !== 'passed-1934')
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW18 verification truth is invalid.');
  }
  if (!exact(value.inventoryAudit, {
    predecessorRepositoryOwnedFiles: 341,
    closureRepositoryOwnedFiles: 349,
    predecessorPassedTests: 1924,
    closurePassedTests: 1934,
    skippedTests: 0,
    executionPattern: 'node --test test/tool/*.test.mjs',
    standardNodeParallelism: true,
  })) fail('RW18 complete tool inventory is invalid.');

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW18 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null || value.localRegression !== null) {
    fail('RW18 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW18 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW18 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw17VerifiedHeadChanged !== false
      || value.ratchetAudit?.rw17ClosureHeadChanged !== false
      || value.ratchetAudit?.timingWorkaroundIntroduced !== false) {
    fail('RW18 ratchet cause or boundary is invalid.');
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
    fail('RW18 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW18 residual-risk truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW18 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const content = sourceAtImplementationHead(repositoryRoot, value, entry.path, sourceTexts);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(content) !== entry.sha256) {
      fail(`RW18 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: value.findings.length,
    openActions: value.securityActionInventory
      .filter(({ status }) => status.startsWith('open-')).length,
    focusedRw18Flutter: value.verification.focusedRw18Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw18ContactVerificationPrincipalEpochTransaction();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
