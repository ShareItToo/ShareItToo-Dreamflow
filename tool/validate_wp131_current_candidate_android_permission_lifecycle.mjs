#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp131-current-candidate-android-permission-lifecycle-20260912.json';
const candidateHead = '1546812f625b4e8f1e700bf976410097cd45ac2f';
const wp130ClosureHead = 'f2ce29ab411b2e5c9c99e45f9d38788e92dc5a8c';
const diagnosticHead = 'f91783a8dad2f3f59a6f1ffe704efa4253f60a39';
const wp131ClosureHead = 'ef17b775019be82fdf22d3b7eb87d012730d8c7d';
const runtimeRoots = [
  'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
];
const sourcePaths = [
  'docs/evidence/release-readiness/wp128-current-candidate-pixel-visual-permission-20260912.json',
  'tool/diagnose_current_candidate_android_permission_lifecycle.mjs',
  'test/tool/diagnose_current_candidate_android_permission_lifecycle.test.mjs',
  'tool/validate_wp128_current_candidate_pixel_visual_permission.mjs',
];

function fail(message) { throw new Error(message); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`WP131 ${label} is invalid.`);
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial|vaultfile)$/iu.test(key)) {
      fail(`WP131 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP131 head is not an ancestor of HEAD: ${head}`);
  }
}

function validateSourceInventory(repositoryRoot, inventory) {
  exact(inventory?.map((item) => item.path), sourcePaths, 'source inventory');
  for (const item of inventory) {
    let source;
    try {
      source = execFileSync('git', ['show', `${wp131ClosureHead}:${item.path}`], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      fail(`WP131 historical source is unavailable: ${item.path}.`);
    }
    if (!/^[a-f0-9]{64}$/u.test(item?.sha256 ?? '') || digest(source) !== item.sha256) {
      fail(`WP131 source digest drift: ${item?.path ?? 'unknown'}.`);
    }
  }
}

export function validateWp131CurrentCandidateAndroidPermissionLifecycle({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (/(?:\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b)/iu.test(JSON.stringify(value))) {
    fail('WP131 evidence contains private or secret-shaped content.');
  }
  exact([value.schemaVersion, value.kind, value.status, value.capturedAt, value.workPackage], [
    1,
    'sit-wp131-current-candidate-android-permission-lifecycle',
    'complete-exact-current-android-permission-lifecycle',
    '2026-09-12T20:36:31.406Z',
    'WP131',
  ], 'identity');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    wp130ClosureHead,
    diagnosticHead,
    candidateSourceHead: candidateHead,
    applicationRuntimePathsChangedAfterCandidateSource: [],
  }, 'repository binding');
  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091201',
    releaseChannel: 'internal',
    environment: 'staging',
    delivery: 'direct-apk',
    firebaseConfigured: true,
    apkSha256: 'a8bfda4c1a0e7302b2528db8edfbe1318e88322023f65588da032220a24badd4',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    physicalPixelPackageMatched: true,
  }, 'candidate binding');
  exact(value.device, {
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  }, 'device proof');
  exact(value.manifest, {
    declaredPermissionCount: 14,
    activeRuntimePermissionCount: 4,
    legacyStoragePermissionsInactiveAtApi37: true,
    broadMediaPermissionDeclared: false,
    microphonePermissionDeclared: false,
    contactsPermissionDeclared: false,
    smsPermissionDeclared: false,
    backgroundLocationPermissionDeclared: false,
    advertisingIdPermissionDeclared: false,
  }, 'permission manifest');
  exact(value.lifecycle, {
    camera: 'deny-allow-authenticated-restarts-passed',
    location: 'coarse-and-fine-deny-allow-authenticated-restarts-passed',
    notifications: 'deny-allow-authenticated-restarts-passed',
    readOnlyAndroidPermissionSettingsPassed: true,
    authenticatedSessionAfterEveryRestart: true,
    packageDataIdentityPreserved: true,
    exactPermissionStateRestored: true,
    exactAppOpStateRestored: true,
    packageManagerForegroundHandlerSignalConfirmed: true,
    packageManagerBackgroundHandlerSignalConfirmed: true,
    broadcastBarrierSignalConfirmed: true,
    completionSignalTimeoutSeconds: 60,
    retryCount: 0,
    elapsedTimeAcceptedAsSuccess: false,
    finalAuthenticatedRestartPassed: true,
  }, 'permission lifecycle');
  exact(value.privateJournal, {
    status: 'completed-restored',
    mode: '0600',
    sha256: '20f30a99e1de9be01b1be028acdcf27bfa4dfb5c33c962cfd277bfdd5628c111',
    recoveryRequired: false,
    containsCredential: false,
    containsAccountIdentity: false,
    containsRawDeviceIdentifier: false,
    containsPrivatePath: false,
  }, 'private journal');
  exact(value.portfolioEffect, {
    promotedRequirement: 'android-permission-lifecycle',
    passCount: 16,
    partialCount: 8,
    openCount: 8,
    totalCount: 32,
    releaseDecision: 'hold-not-production-ready',
  }, 'portfolio effect');
  exact(value.verification, {
    focusedTestsPassed: 24,
    fullLocalRegression: 'success',
    webWasmLoopbackAndroidBuildPassed: true,
    exactHeadGithubRegressionRequired: true,
    exactHeadCodeqlRequired: true,
  }, 'verification');
  validateSourceInventory(repositoryRoot, value.sourceInventory);
  if (!Array.isArray(value.technicalDebt) || value.technicalDebt.length !== 2
      || value.technicalDebt.some((entry) => typeof entry !== 'string' || entry.length < 130)) {
    fail('WP131 technical-debt record is incomplete.');
  }
  exact(value.boundaries, {
    applicationRuntimeChanged: false,
    backendChanged: false,
    permissionStateTemporarilyChanged: true,
    permissionStateRestored: true,
    appOpStateRestored: true,
    profileChanged: false,
    photoCapturedOrSelected: false,
    locationReadOrPersisted: false,
    notificationPreferenceChanged: false,
    pushRegistrationChanged: false,
    messageSent: false,
    accountMutationPerformed: false,
    appDataCleared: false,
    packageReinstalled: false,
    productionChanged: false,
    googlePlayChanged: false,
    firebaseProjectChanged: false,
    paymentEndpointCalled: false,
    realMoneyUsed: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    credentialRecorded: false,
    accountIdentityRecorded: false,
    privateFilesystemPathRecorded: false,
    rawDeviceIdentifierRecorded: false,
  }, 'authorization boundary');
  if (checkGitState) {
    [candidateHead, wp130ClosureHead, diagnosticHead, wp131ClosureHead]
      .forEach((head) => assertAncestor(repositoryRoot, head));
    const drift = execFileSync('git', [
      'diff', '--name-only', candidateHead, wp131ClosureHead, '--', ...runtimeRoots,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (drift !== '') fail('WP131 application runtime drifted before its closure.');
  }
  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    promotedRequirement: value.portfolioEffect.promotedRequirement,
    passCount: value.portfolioEffect.passCount,
    partialCount: value.portfolioEffect.partialCount,
    openCount: value.portfolioEffect.openCount,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp131CurrentCandidateAndroidPermissionLifecycle();
    process.stdout.write(
      `WP131 Android permission evidence valid: candidate=${result.versionCode}, requirement=PASS\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP131 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
