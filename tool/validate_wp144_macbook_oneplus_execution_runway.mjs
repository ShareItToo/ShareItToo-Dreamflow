#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const evidencePath =
  'docs/evidence/release-readiness/wp144-macbook-oneplus-execution-runway-20260913.json';
const handoverPath = 'docs/operations/WP144_MACBOOK_ONEPLUS_EXECUTION_RUNWAY_2026-09-13.md';
const baselineHead = '07ce24325648ed797893ac39a6fec6472273135e';
const candidateSource = '904c2b734160544aaeb1128cac15191a521739e7';
const apkSha256 = 'e6d1df85e4e8973765c594b8fe9eb2654c876ee11cafe6d94cfe5c57ff8d7fb9';
const aabSha256 = 'c0c0f27fb14d393b97c46b55bf81f201081dce1d9756f3468bfa442c4bdf9c6e';
const certificateSha256 =
  '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(`WP144 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function digest(path, repositoryRoot = root) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

function assertGitState(repositoryRoot) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baselineHead, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail('baseline head is not an ancestor of HEAD.');
  }
  const changed = execFileSync('git', [
    'diff', '--name-only', `${baselineHead}..HEAD`, '--',
    'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('application or Backend runtime changed during the MacBook runway.');
}

export function validateWp144MacbookOnePlusExecutionRunway({
  evidence,
  checkGitState = true,
  repositoryRoot = root,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp144-macbook-oneplus-execution-runway', 'kind');
  exact(
    value?.status,
    'prepared-exact-current-candidate-on-macbook-oneplus-device-pending',
    'status',
  );
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead,
    cleanBeforePackage: true,
    remoteAheadBeforePackage: 0,
    remoteBehindBeforePackage: 0,
    mobileRuntimePathsChanged: [],
  }, 'repository');
  exact(value?.github, {
    regressionRunId: 34776401000,
    regressionHead: baselineHead,
    regressionConclusion: 'success',
    cleanCheckoutJobConclusion: 'success',
    codeqlRunId: 34776400991,
    codeqlHead: baselineHead,
    codeqlConclusion: 'success',
    openCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  }, 'GitHub closure');

  const remote = value?.macbookRunway;
  for (const key of [
    'remoteDesktopOnline',
    'adbAvailable',
    'isolatedOfficialCheckoutCreated',
    'clean',
    'wp143RunnerHashMatched',
  ]) exact(remote?.[key], true, `MacBook ${key}`);
  exact(remote?.officialRepository, 'ShareItToo/ShareItToo-Dreamflow', 'official repository');
  exact(remote?.branch, 'codex/master-workflow-20260808', 'MacBook branch');
  exact(remote?.head, baselineHead, 'MacBook head');
  for (const key of [
    'legacyCheckoutChanged',
    'legacyCheckoutUsed',
    'privatePathRecorded',
    'rawRemoteDeviceIdentifierRecorded',
  ]) exact(remote?.[key], false, `MacBook ${key}`);

  const candidate = value?.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(candidate?.versionName, '1.0.0', 'version name');
  exact(candidate?.versionCode, '2026091312', 'version code');
  exact(candidate?.sourceCommit, candidateSource, 'candidate source');
  exact(candidate?.releaseChannel, 'internal', 'release channel');
  exact(candidate?.environment, 'staging', 'environment');
  exact(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'API URL');
  exact(candidate?.apkSha256, apkSha256, 'APK hash');
  exact(candidate?.aabSha256, aabSha256, 'AAB hash');
  exact(candidate?.signingCertificateSha256, certificateSha256, 'certificate hash');
  for (const key of [
    'firebaseConfigured',
    'googleEnabled',
    'privateArchiveTransferredByteForByte',
    'privateArchiveValidatedOnMacbook',
    'ownerOnlyPermissions',
  ]) exact(candidate?.[key], true, `candidate ${key}`);
  for (const key of ['appleEnabled', 'facebookEnabled', 'privateArchivePathRecorded']) {
    exact(candidate?.[key], false, `candidate ${key}`);
  }

  exact(value?.syntheticSource, {
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    status: 'email-linked-product-journey-retired',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    verificationMethod: 'email-link',
    accountCount: 2,
    roles: ['owner', 'renter'],
    priorJourneyStatus: 'retired',
    priorListingStatus: 'ended',
    priorBookingStatus: 'not-created',
    transferredByteForByte: true,
    validatedOnMacbook: true,
    ownerOnlyPermissions: true,
    credentialMaterialRecorded: false,
    accountIdentityRecorded: false,
    privatePathRecorded: false,
  }, 'synthetic source');
  exact(value?.transfer, {
    existingEncryptedTailnetUsed: true,
    ephemeralTransferOnly: true,
    temporaryServerStopped: true,
    temporarySourceDirectoriesRemoved: true,
    driveChanged: false,
    storeChanged: false,
  }, 'transfer');
  exact(value?.freshDeviceReadback, {
    macMiniConnectedModel: 'Pixel 7 Pro',
    macbookAuthorizedAndroidDeviceCount: 0,
    exactOnePlusConnected: false,
    onePlusContacted: false,
    pixelContactedDuringWp144: false,
    rawDeviceIdentifierRecorded: false,
  }, 'device readback');
  exact(value?.verification, {
    focusedWp144Tests: 'passed-3',
    combinedWp143Wp144Tests: 'passed-14',
    fullTechnicalRegression: 'passed',
    flutterAnalyzer: 'passed-zero-diagnostics',
    flutterTests: 'passed',
    webBuildAndWasmDryRun: 'passed',
    loopbackSmoke: 'passed',
    androidDebugBuild: 'passed',
  }, 'verification');
  exact(value?.nextExecution, {
    runner: 'tool/run_wp143_oneplus_current_candidate_two_role.mjs',
    exactPhysicalDevice: 'OnePlus CPH2581',
    deviceMustBeConnectedUnlockedAndAuthorized: true,
    dataPreservingInstallGateRequiredUnlessExactCandidateInstalled: true,
    executionGateRequired: true,
    completeTwoRoleJourneyRequired: true,
    stagingLoginStillRequiresRuntimeVerification: true,
    onePlusCrossDeviceTwoRole: 'OPEN',
  }, 'next execution');
  exact(value?.portfolio, {
    pass: 21,
    partial: 4,
    open: 7,
    onePlusCrossDeviceTwoRole: 'OPEN',
  }, 'portfolio');
  for (const [key, result] of Object.entries(value?.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }

  exact(Object.keys(value?.sourceInventory ?? {}).length, 4, 'source inventory size');
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(digest(path, repositoryRoot), expected, `source inventory ${path}`);
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'PREPARED ON MACBOOK; PHYSICAL ONEPLUS EXECUTION PENDING',
    'old, locally changed checkout',
    'transferred byte-for-byte through the existing encrypted',
    'OnePlus CPH2581 must be connected, unlocked and ADB-authorized',
    '21 PASS / 4 PARTIAL / 7 OPEN',
  ]) {
    if (!handover.includes(marker)) fail('handover is incomplete.');
  }
  if (checkGitState) assertGitState(repositoryRoot);
  return Object.freeze({
    status: value.status,
    macbookHead: remote.head,
    exactOnePlusConnected: false,
    onePlusCrossDeviceTwoRole: 'OPEN',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp144MacbookOnePlusExecutionRunway())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP144 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
