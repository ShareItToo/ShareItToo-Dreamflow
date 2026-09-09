#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp70-current-candidate-auth-safety-hold-20260909.json';
const sourcePaths = [
  'docs/evidence/release-readiness/wp69-current-goal-acceptance-audit-20260909.json',
  'tool/diagnose_n28_current_candidate_android_account_support_surfaces.mjs',
  'tool/diagnose_android_password_change.mjs',
  'tool/diagnose_android_session_controls.mjs',
  'tool/diagnose_android_password_reset.mjs',
  'tool/diagnose_store_review_safety_actions.mjs',
  'tool/run_staging_non_binding_simulation.mjs',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP70 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phonenumber|accountid|personname|deviceid|serial|ssid|bssid|ipaddress|privatepath)$/iu.test(key)) {
      fail(`WP70 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function validateSources(repositoryRoot, value) {
  if (!Array.isArray(value.sourceInventory)
      || !exact(value.sourceInventory.map((entry) => entry.path), sourcePaths)) {
    fail('WP70 source inventory is incomplete or reordered.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`WP70 source hash is invalid: ${entry.path}`);
    }
    if (sha256(readFileSync(resolve(repositoryRoot, entry.path))) !== entry.sha256) {
      fail(`WP70 source hash drift: ${entry.path}`);
    }
  }
  const wp69 = JSON.parse(readFileSync(resolve(repositoryRoot, sourcePaths[0]), 'utf8'));
  if (wp69.status !== 'complete-local-github'
      || wp69.candidate?.versionCode !== '2026090904'
      || wp69.nextSafePackage?.id !== 'WP70') {
    fail('WP70 predecessor evidence does not authorize this bounded package.');
  }
}

function validateGitLineage(repositoryRoot, value, checkGitState) {
  if (!exact(value.candidate.mobileOrBackendRuntimePathsChangedAfterCandidate, [])) {
    fail('WP70 candidate lineage is overstated.');
  }
  if (!checkGitState) return;
  const changed = execFileSync('git', [
    'diff', '--name-only', `${value.repository.candidateSourceHead}..HEAD`, '--',
    'lib', 'android', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim().split('\n').filter(Boolean);
  if (!exact(changed, [])) fail('WP70 runtime paths changed after the exact candidate.');
}

function validateProof(value) {
  const p = value.pixelProof;
  if (p?.accountAndSupportSurfaces?.status
        !== 'passed-account-support-read-only-provider-holds-confirmed'
      || p.accountAndSupportSurfaces.authenticatedSurfaceCount !== 9
      || p.accountAndSupportSurfaces.paymentProviderHoldVisible !== true
      || p.accountAndSupportSurfaces.payoutProviderHoldVisible !== true
      || p.accountAndSupportSurfaces.paymentEndpointCalled !== false
      || p.accountAndSupportSurfaces.payoutOnboardingOpened !== false) {
    fail('WP70 account/support or payment-hold proof is invalid.');
  }
  const requiredTruePaths = [
    ['passwordChange', 'definiteSuccess'],
    ['passwordChange', 'oldCredentialRejected'],
    ['passwordChange', 'replacementCredentialAccepted'],
    ['passwordChange', 'localSessionCleared'],
    ['passwordChange', 'coldLoginPassed'],
    ['passwordChange', 'accountAToBIsolationPassed'],
    ['passwordChange', 'originalCredentialRestored'],
    ['passwordChange', 'diagnosticSessionsRevoked'],
    ['sessionControls', 'recoveryPathPassed'],
    ['sessionControls', 'remoteSessionRevoked'],
    ['sessionControls', 'revokedTokenRejected'],
    ['sessionControls', 'invokingPixelPreservedBeforeLogoutAll'],
    ['sessionControls', 'logoutAllPassed'],
    ['sessionControls', 'serverConfirmedEmptyBeforeIndependentRelogin'],
    ['sessionControls', 'coldStartPassed'],
    ['sessionControls', 'accountAToBIsolationPassed'],
    ['sessionControls', 'diagnosticSessionsRevoked'],
    ['freshEmailAuthRecovery', 'registrationAcceptedPendingEmail'],
    ['freshEmailAuthRecovery', 'verificationEmailDelivered'],
    ['freshEmailAuthRecovery', 'verificationConfirmedWithoutTokenDisclosure'],
    ['freshEmailAuthRecovery', 'backendEmailVerified'],
    ['freshEmailAuthRecovery', 'pixelLoginPassed'],
    ['freshEmailAuthRecovery', 'registrationColdStartPassed'],
    ['freshEmailAuthRecovery', 'passwordResetRequestAcceptedWithoutExistenceDisclosure'],
    ['freshEmailAuthRecovery', 'passwordResetEmailDelivered'],
    ['freshEmailAuthRecovery', 'passwordResetConfirmedWithoutTokenDisclosure'],
    ['freshEmailAuthRecovery', 'newPasswordPixelLoginPassed'],
    ['freshEmailAuthRecovery', 'passwordResetColdStartPassed'],
    ['freshEmailAuthRecovery', 'diagnosticSessionsRevoked'],
    ['finalState', 'protectedOwnerSessionRestored'],
  ];
  for (const [group, key] of requiredTruePaths) {
    if (p?.[group]?.[key] !== true) fail(`WP70 required proof is missing: ${group}.${key}`);
  }
  if (p.sessionControls.initialSessionCount !== 2
      || p.freshEmailAuthRecovery.consentControlCount !== 4
      || p.freshEmailAuthRecovery.verificationSingleUseReplayStructuredError
        !== 'invalid_or_expired_verification_link'
      || p.freshEmailAuthRecovery.oldPasswordStructuredRejection !== '401:invalid_credentials'
      || p.freshEmailAuthRecovery.passwordResetSingleUseReplayStructuredError
        !== 'invalid_or_expired_reset_link'
      || p.finalState.publicDiagnosticListingCount !== 0
      || p.finalState.temporaryBlocksRemaining !== 0
      || [p.finalState.contractCreated, p.finalState.reservationCreated,
        p.finalState.paymentCreated, p.finalState.realMoneyUsed].some((entry) => entry !== false)) {
    fail('WP70 exact safety outcome is invalid.');
  }
  const staging = value.stagingSafetyProof;
  const requiredStagingTrue = [
    'isolatedSyntheticListingActivated',
    'nonBindingRequestAcceptedAndChatCreated',
    'paymentRejectedBeforeContractReservationOrMoney',
    'listingReportCreatedAndReadBack',
    'privateNoStoreExportPassed',
    'temporaryBlockPassed',
    'temporaryUnblockPassed',
    'chatRestoredAfterUnblock',
    'bookingCancelled',
    'listingRetiredFromPublicCatalog',
    'diagnosticSessionsRevoked',
    'syntheticModerationReportRetainedForAudit',
  ];
  if (staging?.transport !== 'authenticated-direct-api-diagnostic'
      || staging.pixelUiReportBlockReplay !== 'not-proven'
      || requiredStagingTrue.some((key) => staging[key] !== true)) {
    fail('WP70 Staging safety proof is invalid or promoted to physical UI proof.');
  }
}

function validateClosure(value) {
  if (!exact(value.closedWp69Requirements.map(({ id, state }) => ({ id, state })), [
    { id: 'email-registration-verification-login-recovery', state: 'PASS' },
    { id: 'logout-password-session-account-switch-isolation', state: 'PASS' },
  ])) fail('WP70 requirement closure is incomplete or overstated.');
  if (!exact(value.remainingRelatedRequirements.map(({ id, state }) => ({ id, state })), [
    { id: 'support-report-block', state: 'PARTIAL' },
    { id: 'privacy-export-and-account-deletion', state: 'PARTIAL' },
    { id: 'stripe-sandbox-payment-refund-simulated-payout', state: 'OPEN' },
  ])) fail('WP70 remaining requirement truth is invalid.');
  for (const entry of [...value.closedWp69Requirements, ...value.remainingRelatedRequirements]) {
    const description = entry.basis ?? entry.remaining;
    if (typeof description !== 'string' || description.length < 40) {
      fail(`WP70 requirement rationale is missing: ${entry.id}`);
    }
  }
}

function validateVerification(value) {
  const expectedComplete = {
    implementationHead: '523f1693e701371654888e5a3ce22598acdc8858',
    focusedTests: 'passed-48',
    fullLocalRegression: 'passed',
    localToolTestsPassed: 2511,
    githubRegressionRun: 34345166849,
    githubCodeqlRun: 34345166833,
    openPrMergeAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status === 'complete-local-github') {
    if (!exact(value.packageVerification, expectedComplete)) {
      fail('WP70 complete verification contract is invalid.');
    }
    return;
  }
  fail('WP70 status is invalid.');
}

export function validateWp70CurrentCandidateAuthSafetyHold({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp70-current-candidate-auth-safety-hold'
      || value.capturedOn !== '2026-09-09') {
    fail('WP70 identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    packageBaseHead: '18f10097d6872f012360d648764614cc314fe809',
    wp69PackageHead: '1f09df3e000047d03198163d34c10d077926e559',
    wp69ClosureHead: '18f10097d6872f012360d648764614cc314fe809',
    wp69ClosureGithubRegressionRun: 34335475902,
    wp69ClosureGithubCodeqlRun: 34335475943,
    wp69ClosureOpenPrMergeAlerts: 0,
    candidateSourceHead: '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0',
    stagingRuntimeHead: '78c663248aec089b08d19fd0fb40a9a63f19408b',
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) fail('WP70 repository binding is invalid.');
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090904',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    apkSha256: '8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4',
    aabSha256: 'fcc6c36055a978ffb3c70761f2630d942c8e65ac30c9600f3963be48b7d56696',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    pixelInstalledAndMatched: true,
    mobileOrBackendRuntimePathsChangedAfterCandidate: [],
  })) fail('WP70 candidate binding is invalid.');
  if (checkGitState) {
    [value.repository.packageBaseHead, value.repository.wp69PackageHead,
      value.repository.wp69ClosureHead, value.repository.candidateSourceHead,
      value.repository.stagingRuntimeHead].forEach((commit) => assertAncestor(repositoryRoot, commit));
  }
  validateSources(repositoryRoot, value);
  validateGitLineage(repositoryRoot, value, checkGitState);
  validateProof(value);
  validateClosure(value);
  validateVerification(value);
  if (!Array.isArray(value.technicalDebt) || value.technicalDebt.length !== 4
      || value.technicalDebt.some((entry) => typeof entry !== 'string' || entry.length < 60)) {
    fail('WP70 technical-debt record is incomplete.');
  }
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP70 boundary falsely records a gated mutation.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP70 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    closedRequirementCount: value.closedWp69Requirements.length,
    paymentProviderCalled: value.boundaries.paymentProviderCalled,
    onePlusContacted: value.boundaries.onePlusContacted,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp70CurrentCandidateAuthSafetyHold(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP70 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
