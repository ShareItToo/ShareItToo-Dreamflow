#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { wp143Candidate } from './run_wp143_oneplus_current_candidate_two_role.mjs';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const evidencePath =
  'docs/evidence/release-readiness/wp145-oneplus-current-candidate-two-role-closure-20260914.json';
const handoverPath =
  'docs/operations/WP145_ONEPLUS_CURRENT_CANDIDATE_TWO_ROLE_CLOSURE_2026-09-14.md';
const implementationHead = 'ec95dbe3da3d430ba91df949155275b68d056948';

function fail(message) {
  throw new Error(`WP145 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function digest(path, repositoryRoot = root) {
  let bytes;
  try {
    bytes = execFileSync('git', ['-C', repositoryRoot, 'show',
      `${implementationHead}:${path}`], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    fail(`historical source inventory cannot resolve ${implementationHead}:${path}.`);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

function assertGitState(repositoryRoot) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', implementationHead, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail('implementation head is not an ancestor of HEAD.');
  }
  for (const [label, paths] of [
    ['mobile runtime', ['lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock']],
    ['backend runtime', ['backend/src', 'backend/sql', 'backend/package.json', 'backend/pnpm-lock.yaml']],
  ]) {
    const changed = execFileSync('git', [
      'diff', '--name-only', `${implementationHead}..HEAD`, '--', ...paths,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (changed !== '') fail(`${label} changed during closure.`);
  }
}

export function validateWp145OnePlusClosure({
  evidence,
  checkGitState = true,
  repositoryRoot = root,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp145-oneplus-current-candidate-two-role-closure', 'kind');
  exact(
    value?.status,
    'passed-exact-current-candidate-oneplus-cross-device-two-role',
    'status',
  );
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.implementationHead, implementationHead, 'implementation head');
  exact(value?.repository?.cleanAfterImplementation, true, 'clean implementation');
  exact(value?.repository?.remoteAheadAfterImplementation, 0, 'remote ahead');
  exact(value?.repository?.remoteBehindAfterImplementation, 0, 'remote behind');
  exact(value?.repository?.mobileRuntimePathsChanged, [], 'mobile runtime changes');
  exact(value?.repository?.backendRuntimePathsChanged, [], 'backend runtime changes');
  for (const check of ['githubRegression', 'githubCodeql']) {
    exact(value?.repository?.[check]?.headSha, implementationHead, `${check} head`);
    exact(value?.repository?.[check]?.conclusion, 'success', `${check} conclusion`);
  }
  exact(value?.repository?.githubRegression?.runId, 34785361712, 'Regression run');
  exact(value?.repository?.githubRegression?.cleanCheckout, 'success', 'clean checkout');
  exact(value?.repository?.githubCodeql?.runId, 34785361710, 'CodeQL run');
  exact(value?.repository?.openCodeScanningAlerts, 0, 'open alerts');
  exact(value?.repository?.pullRequest7, 'draft-open-mergeable-unmerged', 'PR 7');

  const candidate = value?.candidate;
  exact(candidate?.applicationId, wp143Candidate.applicationId, 'application ID');
  exact(candidate?.versionName, wp143Candidate.versionName, 'version name');
  exact(candidate?.versionCode, wp143Candidate.buildNumber, 'version code');
  exact(candidate?.sourceCommit, wp143Candidate.commit, 'source commit');
  exact(candidate?.releaseChannel, wp143Candidate.releaseChannel, 'release channel');
  exact(candidate?.environment, 'staging', 'environment');
  exact(candidate?.apiBaseUrl, wp143Candidate.apiBaseUrl, 'API URL');
  exact(candidate?.apkSha256, wp143Candidate.apkSha256, 'APK hash');
  exact(candidate?.signingCertificateSha256,
    wp143Candidate.signingCertificateSha256, 'certificate');
  exact(candidate?.firebaseConfigured, true, 'Firebase');
  exact(candidate?.paymentMode, 'memory', 'payment mode');
  exact(candidate?.stripeLivemode, false, 'Stripe mode');

  const execution = value?.physicalExecution;
  exact(execution?.device, {
    physical: true,
    manufacturer: 'OnePlus',
    model: 'CPH2581',
    containsRawDeviceIdentifier: false,
  }, 'physical device');
  exact(execution?.installation, {
    exactCandidateInstalled: true,
    finalAction: 'preserve-exact-installed-candidate',
    uninstallUsed: false,
    packageResetUsed: false,
    localAppDataReset: false,
  }, 'installation');
  exact(execution?.ownerPushPreflight,
    'exact-owner-session-established-for-push-preflight', 'owner preflight');
  exact(execution?.deviceServices, {
    pushEnabled: true,
    crashDiagnosticsEnabled: false,
    exactSecondObservationUnchanged: true,
    consentDialogOpened: false,
    exploreSurfaceRestored: true,
  }, 'device services');
  exact(execution?.tests, {
    distinctEmailVerifiedPrincipals: 'passed',
    ownerDraftPublishThroughOnePlusUi: 'passed-server-confirmed-active',
    ownerPublishFeedback: 'durable-server-and-public-catalog-confirmed',
    renterPublicDiscovery: 'passed',
    requestAcceptance: 'passed-non-binding-simulation',
    controlledFcm: 'passed-foreground-background-terminated',
    chatVisibility: 'passed-renter-visible',
    principalSwitchIsolation: 'passed-owner-absent-under-renter',
    cleanup: 'passed-booking-cancelled-listing-ended',
    protectedOwnerSessionRestored: true,
  }, 'physical tests');

  for (const [key, expected] of Object.entries({
    pixelBaselinePreviouslyPassed: true,
    pixelAndOnePlusApplicationIdMatched: true,
    pixelAndOnePlusVersionMatched: true,
    pixelAndOnePlusApkSha256Matched: true,
    sameStagingApiBaseUrl: true,
    onePlusCrossDeviceTwoRole: 'PASS',
  })) exact(value?.crossDeviceBinding?.[key], expected, `cross-device ${key}`);
  for (const [key, result] of Object.entries(value?.rootCauseAndCorrection ?? {})) {
    if (key !== 'workaroundRetained') exact(result, true, `root-cause correction ${key}`);
  }
  exact(value?.rootCauseAndCorrection?.workaroundRetained, false, 'workaround boundary');

  for (const [scope, counts] of Object.entries({
    exactSource: { recognizedVaultCount: 1, activeSourceVaultCount: 0,
      retiredJourneyVaultCount: 1, unsafeEntryCount: 0,
      safeForFreshSourceProvisioning: true },
    journeyRoot: { recognizedVaultCount: 7, activeSourceVaultCount: 0,
      retiredJourneyVaultCount: 7, unsafeEntryCount: 0,
      safeForFreshSourceProvisioning: true },
    artifactRoot: { unsafeEntryCount: 0, safeForFreshSourceProvisioning: true },
  })) exact(value?.postRunPrivateState?.[scope], counts, `private state ${scope}`);
  for (const key of ['credentialMaterialRecorded', 'accountIdentityRecorded', 'privatePathRecorded']) {
    exact(value?.postRunPrivateState?.[key], false, `private boundary ${key}`);
  }
  exact(value?.verification, {
    focusedWp143Tests: 'passed-11',
    focusedWp145Tests: 'passed-3',
    combinedWp143Wp144Wp145Tests: 'passed-20',
    fullLocalTechnicalRegression: 'passed',
    githubRegression: 'passed',
    githubCodeql: 'passed',
    openCodeScanningAlerts: 0,
  }, 'verification');
  exact(value?.portfolio, {
    before: { pass: 21, partial: 4, open: 7 },
    after: { pass: 22, partial: 4, open: 6 },
    onePlusCrossDeviceTwoRole: 'PASS',
  }, 'portfolio');
  exact(value?.remainingOpen, [
    'facebook-signin',
    'apple-signin',
    'stripe-sandbox-payment-refund-simulated-payout',
    'binding-v52-contract-return-damage',
    'manual-talkback-traversal',
    'durable-private-registry-pull',
  ], 'remaining open requirements');
  for (const [key, result] of Object.entries(value?.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  exact(Object.keys(value?.sourceInventory ?? {}).length, 8, 'source inventory size');
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(digest(path, repositoryRoot), expected, `source inventory ${path}`);
  }
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(JSON.stringify(value))) {
    fail('evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'PHYSICAL ONEPLUS AND CROSS-DEVICE TWO-ROLE PASS',
    'foreground/background/terminated-process FCM',
    'no timing workaround remains',
    '22 PASS / 4 PARTIAL / 6 OPEN',
  ]) {
    if (!handover.includes(marker)) fail('handover is incomplete.');
  }
  if (checkGitState) assertGitState(repositoryRoot);
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    onePlusCrossDeviceTwoRole: 'PASS',
    portfolio: value.portfolio.after,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp145OnePlusClosure())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP145 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
