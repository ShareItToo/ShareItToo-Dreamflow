#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw15-security-interaction-owner-route-invariant-20260825.json';
const sourceBindingHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'backend/src/app.js',
  'backend/ops/secret_scan_history_baseline.json',
  'lib/screens/security_screen.dart',
  'lib/screens/profile_screen.dart',
  'lib/screens/account_settings_screen.dart',
  'lib/screens/contact_data_screen.dart',
  'lib/screens/login_screen.dart',
  'lib/screens/change_password_screen.dart',
  'lib/services/account_security_service.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/backend_http.dart',
  'lib/services/backend_repository.dart',
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/app_popup.dart',
  'lib/widgets/tracked_dialog_route.dart',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'docs/evidence/48h-remote/rw10-local-security-control-truthfulness-20260825.json',
  'docs/evidence/48h-remote/rw11-regression-completeness-stale-support-wiring-20260825.json',
  'docs/evidence/48h-remote/rw14-security-remote-device-revocation-outcome-principal-epoch-20260825.json',
  'scripts/technical_regression_check.sh',
  'test/rw10_local_security_control_truthfulness_test.dart',
  'test/rw14_security_remote_device_revocation_outcome_principal_epoch_test.dart',
  'test/rw15_security_logout_all_prompt_result_principal_epoch_test.dart',
  'test/tool/rw15_security_logout_all_prompt_result_principal_epoch_wiring.test.mjs',
  'test/tool/validate_rw15_security_logout_all_prompt_result_principal_epoch.test.mjs',
  'tool/validate_rw15_security_logout_all_prompt_result_principal_epoch.mjs',
  'docs/architecture/rw15-security-interaction-owner-route-invariant-2026-08-25.md',
  'docs/operations/RW15_SECURITY_INTERACTION_OWNER_ROUTE_INVARIANT_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW15 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceAtImplementationHead(repositoryRoot, value, path, sourceTexts) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { fail(`RW15 source-binding snapshot is unavailable: ${path}`); }
}
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW15 evidence contains private or secret-shaped material.');
  }
}

function repositoryDartPaths(repositoryRoot) {
  const libRoot = join(repositoryRoot, 'lib');
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
  visit(libRoot);
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

export function validateRw15SecurityLogoutAllPromptResultPrincipalEpoch({
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
      || value.kind !== 'sit-rw15-security-interaction-owner-route-invariant'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== 'fe59d9dab99b8517f61ec1c112a4ce50c877d7f6') {
    fail('RW15 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW14',
    evidence:
      'docs/evidence/48h-remote/rw14-security-remote-device-revocation-outcome-principal-epoch-20260825.json',
    verifiedImplementationHead: '38a89e67acefcdc1f756dabc7febd5f1ab9f9813',
    closureCommit: 'fe59d9dab99b8517f61ec1c112a4ce50c877d7f6',
  })) fail('RW15 predecessor binding is invalid.');
  if (!exact(value.lineage, {
    rw10ImplementationHead: 'd72e18eb607bb3f9ed7baf09ab7212f3ef695ee5',
    rw10ClosureCommit: '5ad324704db716e39f8b79347167d24813f1596a',
    rw11ImplementationHead: '7768651bf63d266fb8d98f75f2883536e77adde0',
    rw11ClosureCommit: '521f565a77faecd8de006f355c8fced4b363a8d6',
    rw12ImplementationHead: '0a13df419f4abd5e30858503f4e93f23c9e9d9f1',
    rw12ClosureCommit: 'fcfdbc352185d3bf50a735478f03e32ffe709767',
  })) fail('RW15 predecessor lineage is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'logout-all-pre-dialog-principal-session-and-epoch-binding',
      'identity-bound-confirmation-and-result-route-dismissal',
      'all-security-screen-action-owner-invariant',
      'exact-status-and-operation-error-rejection-contract',
      'repository-wide-security-action-call-site-inventory',
      'red-first-account-a-to-account-b-dialog-regressions',
      'mechanical-predecessor-hash-refresh',
      'deterministic-local-and-ci-regression-evidence',
    ],
    excluded: [
      'backend-route-schema-and-auth-provider-change',
      'open-inventory-action-implementation-outside-security-screen',
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
  })) fail('RW15 scope or deterministic-test policy is invalid.');

  const findingStates = new Map([
    ['RW15-P0-LOGOUT-ALL-STALE-CONFIRMATION-001', 'resolved-and-tested'],
    ['RW15-P0-LOGOUT-ALL-OPEN-RESULT-002', 'resolved-and-tested'],
    ['RW15-P0-GLOBAL-NAVIGATOR-POP-RACE-003', 'resolved-and-tested'],
    ['RW15-P0-STATUS-ONLY-REJECTION-004', 'resolved-and-tested'],
    [
      'RW15-P0-REPOSITORY-SECURITY-ACTION-INVENTORY-005',
      'inventory-complete-follow-up-required',
    ],
  ]);
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id, state }) => [id, state]), [...findingStates])
      || value.findings.some(({ resolution }) =>
        typeof resolution !== 'string' || !resolution)) {
    fail('RW15 finding set is invalid.');
  }

  if (!exact(value.definiteRejectionContract, {
    common: [
      '401:authentication_required',
      '401:invalid_or_expired_session',
      '401:account_not_active',
      '429:rate_limit_exceeded',
    ],
    passwordOnly: [
      '400:password_too_short',
      '400:password_too_long',
      '400:password_too_weak',
      '401:invalid_credentials',
    ],
    singleSessionOnly: ['404:session_not_found'],
    alwaysUnknownExamples: [
      '408:any',
      '400:request_failed',
      '401:request_failed',
      '403:forbidden',
      '404:not_found',
      '409:conflict',
      '422:unprocessable_content',
      '429:request_failed',
      'any:invalid_server_response',
      '5xx:any',
    ],
  })) fail('RW15 exact rejection contract is invalid.');

  if (!exact(value.interactionInvariant, {
    owner: 'exact-current-principal-session-id-plus-security-epoch',
    capture: 'synchronous-before-first-await',
    preRemote:
      'same-owner-required-after-dialog-and-immediately-before-service-call',
    presentation:
      'same-owner-or-exact-owner-clear-with-definite-local-absence-and-stable-post-service-epoch',
    navigation: 'definite-local-absence-and-stable-post-service-epoch-only',
    dialogDismissal: 'remove-exact-owned-route-by-identity-never-pop-current-route',
    typedCatchOrdering: 'typed-three-way-result-before-generic-pre-remote-catch',
  })) fail('RW15 security-interaction invariant is invalid.');

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
    [
      'legacy.change-password-placeholder',
      'lib/screens/change_password_screen.dart',
      'unreachable-b10-guarded',
    ],
    ['data-service.test-session-clear-hook', 'lib/services/data_service.dart', 'test-only'],
  ];
  if (!exact(
    value.securityActionInventory?.map(({ id, file, status }) => [id, file, status]),
    actionInventory,
  )) fail('RW15 security-action inventory is invalid.');

  const expectedCallSites = [
    ['_securityService.changePassword', { 'lib/screens/security_screen.dart': 1 }],
    ['_securityService.revokeSession', { 'lib/screens/security_screen.dart': 1 }],
    ['_securityService.logoutAllSessions', { 'lib/screens/security_screen.dart': 1 }],
    ['AuthService.clearSession', {
      'lib/services/data_service.dart': 2,
    }],
    ['AuthService.requestEmailChange', {}],
    ['AuthService.requestPhoneVerification', {
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['AuthService.confirmPhoneVerification', {
      'lib/services/contact_verification_service.dart': 1,
    }],
    ['AuthService.requestEmailVerification', {}],
    ['_accountDeletionService.preflightCheck', { 'lib/screens/account_settings_screen.dart': 1 }],
    ['_accountDeletionService.deleteAccount', { 'lib/screens/account_settings_screen.dart': 1 }],
  ];
  if (!exact(
    value.callSiteInventory?.map(({ symbol, paths }) => [symbol, paths]),
    expectedCallSites,
  )) fail('RW15 call-site inventory declaration is invalid.');
  for (const [symbol, paths] of expectedCallSites) {
    const observed = countCallSites({ repositoryRoot, sourceTexts, symbol });
    if (!exact(observed, paths)) {
      fail(`RW15 call-site inventory drifted for ${symbol}.`);
    }
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  const toolInventory = value.verification?.completeToolInventory;
  if (value.verification?.redFirstStaleConfirmation
        !== 'failed-one-account-a-logout-all-call-under-b-before-fix'
      || value.verification?.redFirstOpenResult
        !== 'failed-account-a-result-remained-visible-under-b-before-fix'
      || value.verification?.redFirstUnstructured4xx
        !== 'failed-status-only-response-became-definite-rejection-before-fix'
      || value.verification?.focusedRw15Flutter !== 'passed-5'
      || value.verification?.rw10Rw12Rw13Rw14Rw15B10Flutter !== 'passed-74'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw15WiringTests !== 'passed-7'
      || value.verification?.rw15ValidatorTests !== 'passed-3'
      || !['pending', 'passed-1907'].includes(toolInventory)
      || (fullPassed && toolInventory !== 'passed-1907')
      || value.verification?.completeToolInventorySkipped !== 0
      || !['pending', 'passed'].includes(value.verification?.privacyRetentionProvider)
      || (fullPassed && value.verification?.privacyRetentionProvider !== 'passed')
      || !['pending', 'passed'].includes(value.verification?.predecessorValidators)
      || (fullPassed && value.verification?.predecessorValidators !== 'passed')
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW15 verification truth is invalid.');
  }
  if (!exact(value.inventoryAudit, {
    predecessorRepositoryOwnedFiles: 330,
    closureRepositoryOwnedFiles: 332,
    predecessorPassedTests: 1897,
    closurePassedTests: 1907,
    skippedTests: 0,
    executionPattern: 'node --test test/tool/*.test.mjs',
    standardNodeParallelism: true,
  })) fail('RW15 complete tool inventory is invalid.');

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW15 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null
      || value.localRegression !== null) {
    fail('RW15 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW15 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW15 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw14VerifiedHeadChanged !== false
      || !Array.isArray(value.ratchetAudit?.mechanicalRefreshes)
      || value.ratchetAudit.mechanicalRefreshes.length !== 3) {
    fail('RW15 ratchet audit is invalid.');
  }
  if (!/^[a-f0-9]{64}$/u.test(value.ratchets?.privacyManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.retentionManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(value.ratchets?.activeProviderEvidenceSha256 ?? '')
      || value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW15 ratchet or provider truth is invalid.');
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
    fail('RW15 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 5
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW15 residual-risk truth is invalid.');
  }
  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW15 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const text = sourceAtImplementationHead(repositoryRoot, value, entry.path, sourceTexts);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(text) !== entry.sha256) {
      fail(`RW15 source inventory hash is stale: ${entry.path}`);
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
    fail('RW15 ratchet hashes are not source-bound.');
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: 4,
    openActions: value.securityActionInventory
      .filter(({ status }) => status.startsWith('open-')).length,
    focusedRw15Flutter: value.verification.focusedRw15Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw15SecurityLogoutAllPromptResultPrincipalEpoch();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
