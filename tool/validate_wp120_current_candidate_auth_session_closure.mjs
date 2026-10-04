#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp120-current-candidate-auth-session-closure-20260912.json';
const sourcePaths = [
  'tool/diagnose_android_logout_lifecycle.mjs',
  'tool/diagnose_android_password_change.mjs',
  'tool/diagnose_android_session_controls.mjs',
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

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return Buffer.from(execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail(`WP120 runner source is unavailable: ${path}`);
  }
}

function validateCandidate(value) {
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091110',
    candidateSourceCommit: 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b',
    apkSha256: '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
    environment: 'staging',
    releaseChannel: 'internal',
  })) fail('WP120 candidate binding is invalid.');
}

function validatePixelProof(value) {
  const password = value.passwordChange;
  if (password?.status !== 'passed-current-candidate-password-change-cold-isolation-and-cleanup'
      || ['definiteSuccessPresented', 'oldCredentialRejected', 'replacementLoginPassed',
        'coldStartPassed', 'accountAToBIsolationPassed', 'originalPasswordRestored',
        'protectedOwnerSessionRestored', 'acceptedSessionsRevoked']
        .some((key) => password[key] !== true)) {
    fail('WP120 password-change proof is invalid.');
  }
  const sessions = value.sessionControls;
  if (sessions?.status !== 'completed-session-controls'
      || ['exactInitialTwoSessionInventory', 'remoteSessionRevokedThroughPixel',
        'revokedRemoteTokenRejected', 'invokingPixelSessionPreserved', 'logoutAllThroughPixel',
        'logoutAllRemoteTokenRejected', 'serverConfirmedEmptyBeforeIndependentRelogin',
        'isolatedCredentialReloginPassed', 'isolatedColdStartPassed',
        'accountAToBIsolationPassed', 'protectedOwnerSessionRestored',
        'acceptedDiagnosticSessionsRevoked'].some((key) => sessions[key] !== true)) {
    fail('WP120 session-control proof is invalid.');
  }
}

function validateOnePlus(value) {
  if (!exact(value.onePlus, {
    model: 'CPH2581',
    exactCandidateInstalledDataPreserving: true,
    notificationPermissionGranted: true,
    notificationAppOpAllowed: true,
    twoRoleJourney: 'partial-fail-closed-at-owner-publish-ui',
    paymentEndpointCalled: false,
    contractCreated: false,
    reservationCreated: false,
    testListingCleanupConfirmed: true,
    publicTestListingMatchesAfterCleanup: 0,
    exactOwnerSessionRestored: false,
  })) fail('WP120 OnePlus partial truth is invalid.');
}

function validateRunner(repositoryRoot, value, checkGitState) {
  const runner = value.runnerHardening;
  if (runner?.stateBased !== true
      || runner.unboundedRetry !== false
      || runner.timingOrCacheWorkaround !== false
      || runner.sharedSyntheticAccountRunsSerialized !== true
      || runner.runnerSourceHead !== '380b312dbad593bb87db0eaf16f2e2f3240e2583'
      || runner.focusedTestsPassed !== 47
      || !exact(runner.sourceInventory?.map((entry) => entry.path), sourcePaths)) {
    fail('WP120 runner-hardening contract is invalid.');
  }
  if (checkGitState) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', runner.runnerSourceHead, 'HEAD'], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      fail('WP120 runner source head is not an ancestor of HEAD.');
    }
  }
  for (const entry of runner.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(sourceAtHead(repositoryRoot, runner.runnerSourceHead, entry.path))
          !== entry.sha256) {
      fail(`WP120 runner source hash drift: ${entry.path}`);
    }
  }
}

function validateBoundaries(value) {
  if (!exact(value.boundaries, {
    syntheticAccountsOnly: true,
    productionChanged: false,
    googlePlayChanged: false,
    firebaseChanged: false,
    paymentEndpointCalled: false,
    realMoneyUsed: false,
    credentialsRecorded: false,
    emailAddressRecorded: false,
    tokenRecorded: false,
    rawDeviceIdentifierRecorded: false,
  })) fail('WP120 boundary contract is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP120 evidence contains private or secret-shaped data.');
  }
}

export function validateWp120CurrentCandidateAuthSessionClosure({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp120-current-candidate-auth-session-closure'
      || value.status !== 'complete-pixel-auth-session-replay-oneplus-journey-partial'
      || value.capturedOn !== '2026-09-12') {
    fail('WP120 evidence identity is invalid.');
  }
  validateCandidate(value);
  validatePixelProof(value);
  validateOnePlus(value);
  validateRunner(repositoryRoot, value, checkGitState);
  validateBoundaries(value);
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    pixelPasswordChange: value.passwordChange.status,
    pixelSessionControls: value.sessionControls.status,
    onePlusJourney: value.onePlus.twoRoleJourney,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp120CurrentCandidateAuthSessionClosure(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP120 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
