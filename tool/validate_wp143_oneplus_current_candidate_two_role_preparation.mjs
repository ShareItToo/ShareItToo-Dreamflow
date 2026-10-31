#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { wp117Candidate } from './run_wp117_oneplus_current_candidate_two_role.mjs';
import { wp143Candidate } from './run_wp143_oneplus_current_candidate_two_role.mjs';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const evidencePath =
  'docs/evidence/release-readiness/wp143-oneplus-current-candidate-two-role-preparation-20260913.json';
const handoverPath =
  'docs/operations/WP143_ONEPLUS_CURRENT_CANDIDATE_TWO_ROLE_PREPARATION_2026-09-13.md';
const baselineHead = '38a15825b78ddca55e9d4e7da478a4bb6d6fb8d9';
// The inventory includes the versioned runner introduced and stabilized after
// the recorded baseline. Bind every entry to that immutable evidence snapshot.
const sourceInventoryRevision = 'ec95dbe3da3d430ba91df949155275b68d056948';

function fail(message) {
  throw new Error(`WP143 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function digest(path, repositoryRoot = root) {
  let bytes;
  try {
    bytes = execFileSync('git', ['-C', repositoryRoot, 'show',
      `${sourceInventoryRevision}:${path}`], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    fail(`historical source inventory cannot resolve ${sourceInventoryRevision}:${path}.`);
  }
  return createHash('sha256').update(bytes).digest('hex');
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
    'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('mobile runtime changed during preparation.');
}

export function validateWp143OnePlusPreparation({
  evidence,
  checkGitState = true,
  repositoryRoot = root,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp143-oneplus-current-candidate-two-role-preparation', 'kind');
  exact(
    value?.status,
    'prepared-exact-current-candidate-oneplus-two-role-runner-device-pending',
    'status',
  );
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.baselineHead, baselineHead, 'baseline head');
  exact(value?.repository?.cleanBeforePackage, true, 'clean baseline');
  exact(value?.repository?.remoteAheadBeforePackage, 0, 'baseline remote ahead');
  exact(value?.repository?.remoteBehindBeforePackage, 0, 'baseline remote behind');
  exact(value?.repository?.mobileRuntimePathsChanged, [], 'mobile runtime changes');

  const candidate = value?.candidate;
  exact(candidate?.applicationId, wp143Candidate.applicationId, 'application ID');
  exact(candidate?.versionName, wp143Candidate.versionName, 'version name');
  exact(candidate?.versionCode, wp143Candidate.buildNumber, 'version code');
  exact(candidate?.sourceCommit, wp143Candidate.commit, 'source commit');
  exact(candidate?.releaseChannel, wp143Candidate.releaseChannel, 'release channel');
  exact(candidate?.environment, 'staging', 'environment');
  exact(candidate?.apiBaseUrl, wp143Candidate.apiBaseUrl, 'API base URL');
  exact(candidate?.apkSha256, wp143Candidate.apkSha256, 'APK hash');
  exact(
    candidate?.signingCertificateSha256,
    wp143Candidate.signingCertificateSha256,
    'signing certificate',
  );
  exact(candidate?.firebaseConfigured, true, 'Firebase configuration');
  exact(candidate?.googleEnabled, true, 'Google profile');
  exact(candidate?.appleEnabled, false, 'Apple profile');
  exact(candidate?.facebookEnabled, false, 'Facebook profile');
  exact(candidate?.privateArchiveValidated, true, 'private archive validation');
  exact(candidate?.privateArchivePathRecorded, false, 'private archive path boundary');

  const predecessor = value?.predecessorGap;
  exact(predecessor?.historicalVersionCode, wp117Candidate.buildNumber, 'historical build');
  exact(predecessor?.historicalSourceCommit, wp117Candidate.commit, 'historical source');
  exact(predecessor?.currentCandidateAcceptedByHistoricalRunner, false, 'historical acceptance');
  exact(predecessor?.historicalRunnerModified, false, 'historical runner mutation');
  exact(predecessor?.supersededByVersionedRunner, true, 'versioned supersession');
  if (wp117Candidate.buildNumber === wp143Candidate.buildNumber) {
    fail('historical and current runner bindings are not distinct.');
  }

  const runner = value?.runner;
  for (const key of [
    'exactCandidateRequired',
    'executionGateRequired',
    'installationGateRequiredUnlessExactCandidateAlreadyInstalled',
    'missingPackageInstallAllowedOnlyWithGate',
    'olderSameVersionDataPreservingUpdateAllowedOnlyWithGate',
    'sameOrNewerNonExactBuildRejected',
    'differentVersionNameRejected',
    'splitOrAmbiguousPackageRejected',
    'stableVisiblePushOptInRequired',
    'completeTwoRoleJourneyRequired',
    'terminalFixtureCleanupRequired',
    'protectedOwnerRestorationRequired',
    'structuredSanitizedOutputRequired',
  ]) exact(runner?.[key], true, `runner ${key}`);
  for (const key of ['uninstallUsed', 'packageResetUsed', 'localAppDataReset']) {
    exact(runner?.[key], false, `runner ${key}`);
  }
  exact(runner?.exactPhysicalDevice, 'OnePlus CPH2581', 'runner device');

  const vault = value?.privateQaVault;
  exact(vault?.recognizedVaultCount, 192, 'recognized vault count');
  exact(vault?.activeSourceVaultCount, 0, 'active source vault count');
  exact(vault?.retiredJourneyVaultCount, 188, 'retired vault count');
  exact(vault?.invalidRecognizedVaultCount, 0, 'invalid vault count');
  exact(vault?.unsafeEntryCount, 0, 'unsafe vault count');
  exact(vault?.safeForFreshSourceProvisioning, true, 'fresh-source safety');
  exact(vault?.sourceSelected, false, 'source selection');
  exact(vault?.sourceValidatedOnlyAtExecution, true, 'source validation boundary');
  exact(vault?.credentialMaterialRecorded, false, 'credential boundary');
  exact(vault?.privatePathRecorded, false, 'vault path boundary');

  exact(value?.freshDeviceReadback, {
    authorizedPhysicalDeviceCount: 1,
    connectedManufacturer: 'Google',
    connectedModel: 'Pixel 7 Pro',
    exactOnePlusConnected: false,
    onePlusContacted: false,
    rawDeviceIdentifierRecorded: false,
  }, 'fresh device readback');
  exact(value?.verification, {
    focusedWp143Tests: 'passed-11',
    fullTechnicalRegression: 'passed',
    flutterAnalyzer: 'passed-zero-diagnostics',
    flutterTests: 'passed',
    webBuildAndWasmDryRun: 'passed',
    loopbackSmoke: 'passed',
    androidDebugBuild: 'passed',
    githubRegression: 'pending-final-head',
    githubCodeql: 'pending-final-head',
  }, 'verification');
  exact(value?.portfolio, {
    pass: 21,
    partial: 4,
    open: 7,
    onePlusCrossDeviceTwoRole: 'OPEN',
  }, 'portfolio');
  exact(value?.stripePreflight, {
    officialConnection: 'reauthentication-required',
    providerTrafficPerformed: false,
    testMoneyPerformed: false,
    realMoneyPerformed: false,
  }, 'Stripe preflight');
  for (const [key, result] of Object.entries(value?.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }

  exact(Object.keys(value?.sourceInventory ?? {}).length, 7, 'source inventory size');
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(digest(path, repositoryRoot), expected, `source inventory ${path}`);
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'PREPARED LOCALLY; PHYSICAL ONEPLUS EXECUTION PENDING',
    'clears app data',
    'OnePlus is not connected and was not contacted',
    '21 PASS / 4 PARTIAL / 7 OPEN',
  ]) {
    if (!handover.includes(marker)) fail('handover is incomplete.');
  }
  if (checkGitState) assertGitState(repositoryRoot);
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    exactOnePlusConnected: false,
    onePlusCrossDeviceTwoRole: 'OPEN',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp143OnePlusPreparation())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP143 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
