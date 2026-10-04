#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp83-current-candidate-pixel-auth-session-replay-20260910.json';
const sourcePaths = [
  'tool/diagnose_android_password_change.mjs',
  'tool/diagnose_android_logout_lifecycle.mjs',
  'tool/diagnose_android_session_controls.mjs',
];
const runnerCommits = [
  '71d5ca1c334006db568184006ce26cd60cab9810',
  '0e76debc69303ed5b06bb98e1f0ad39fa850a2a7',
  '7f59a5dbb5ce6ff6c06adbf0f8d3b94858d86296',
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

function sourceAtRunnerHead(repositoryRoot, runnerSourceHead, path) {
  try {
    return Buffer.from(execFileSync('git', ['show', `${runnerSourceHead}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail(`WP83 historical runner source is unavailable: ${path}`);
  }
}

function assertAncestor(repositoryRoot, commit, label) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP83 ${label} is not an ancestor of HEAD.`);
  }
}

function validateRunnerHardening(repositoryRoot, value, checkGitState) {
  const hardening = value.runnerHardening;
  if (hardening?.stateBased !== true
      || hardening.unboundedRetry !== false
      || hardening.timingOrCacheWorkaround !== false
      || hardening.runnerSourceHead !== runnerCommits.at(-1)
      || !exact(hardening.commits, runnerCommits)
      || !exact(hardening.sourceInventory?.map((entry) => entry.path), sourcePaths)) {
    fail('WP83 runner-hardening contract is invalid.');
  }
  if (checkGitState) {
    assertAncestor(repositoryRoot, hardening.runnerSourceHead, 'runner source head');
    runnerCommits.forEach((commit) => assertAncestor(repositoryRoot, commit, 'runner commit'));
  }
  for (const entry of hardening.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(sourceAtRunnerHead(repositoryRoot, hardening.runnerSourceHead, entry.path))
          !== entry.sha256) {
      fail(`WP83 runner source hash drift: ${entry.path}`);
    }
  }
}

function validateProof(value) {
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090905',
    candidateSourceCommit: 'e1c182ea496f013989863155c13bfda649255a7e',
    environment: 'staging',
    releaseChannel: 'internal',
  })) fail('WP83 candidate binding is invalid.');
  const password = value.passwordChange;
  if (password?.status !== 'passed-current-candidate-password-change-cold-isolation-and-cleanup'
      || ['definiteSuccessPresented', 'oldCredentialRejected', 'replacementLoginPassed',
        'coldStartPassed', 'accountAToBIsolationPassed', 'originalPasswordRestored',
        'protectedOwnerSessionRestored', 'acceptedSessionsRevoked']
        .some((key) => password[key] !== true)) {
    fail('WP83 password-change proof is invalid.');
  }
  const sessions = value.sessionControls;
  if (sessions?.status !== 'completed-session-controls'
      || ['exactInitialTwoSessionInventory', 'remoteSessionRevokedThroughPixel',
        'revokedRemoteTokenRejected', 'invokingPixelSessionPreserved', 'logoutAllThroughPixel',
        'logoutAllRemoteTokenRejected', 'serverConfirmedEmptyBeforeIndependentRelogin',
        'isolatedCredentialReloginPassed', 'isolatedColdStartPassed',
        'accountAToBIsolationPassed', 'protectedOwnerSessionRestored',
        'acceptedDiagnosticSessionsRevoked'].some((key) => sessions[key] !== true)) {
    fail('WP83 session-control proof is invalid.');
  }
  if (!exact(value.emailRegistration, {
    status: 'pixel-ui-registration-accepted-pending-email',
    consentCount: 4,
    emailLinkRead: false,
    emailLinkStored: false,
    ownerConfirmationRequired: true,
  })) fail('WP83 e-mail-registration gate is invalid.');
  if (!exact(value.remaining, {
    emailRegistrationVerificationLoginRecovery:
      'owner-must-confirm-the-new-staging-email-link-without-sharing-it',
    delayedResultIsolation: 'not-exercised-by-this-physical-replay',
  })) fail('WP83 remaining-gate truth is invalid.');
}

function validateBoundaries(value) {
  const expected = {
    syntheticAccountsOnly: true,
    productionChanged: false,
    googlePlayChanged: false,
    firebaseChanged: false,
    paymentEndpointCalled: false,
    realMoneyUsed: false,
    onePlusContacted: false,
    credentialsRecorded: false,
    emailAddressRecorded: false,
    verificationLinkRecorded: false,
    rawDeviceIdentifierRecorded: false,
  };
  if (!exact(value.boundaries, expected)) fail('WP83 boundary contract is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP83 evidence contains private or secret-shaped data.');
  }
}

export function validateWp83CurrentCandidatePixelAuthSessionReplay({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp83-current-candidate-pixel-auth-session-replay'
      || value.status !== 'partial-owner-email-link-confirmation-pending'
      || value.capturedOn !== '2026-09-10') {
    fail('WP83 evidence identity is invalid.');
  }
  validateRunnerHardening(repositoryRoot, value, checkGitState);
  validateProof(value);
  validateBoundaries(value);
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    ownerConfirmationRequired: value.emailRegistration.ownerConfirmationRequired,
    delayedResultIsolation: value.remaining.delayedResultIsolation,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp83CurrentCandidatePixelAuthSessionReplay(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP83 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
