#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';
const expectedCommit = '76e6565cdb20d6a49fb417e87b044b237a1ae6c1';
const expectedBuildNumber = '2026082301';
const expectedAabHash =
  '1876fc156c84746a7c635b7d31a20e476e218b8c6f27bce405117d09ac405c98';
const expectedApkHash =
  'a235a188893983fdf770f534ee026c8bd50a7cad4b34d804597a0720817f9ff9';
const expectedPrivacyHash =
  '13390f6ef62bef35f90e7df9d62a6572b1116a67600d894bc331ffddea860a84';
const canonicalCertificate =
  '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

function assertIdentity(value) {
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-current-head-android-release-candidate-evidence'
      || value.version !== 'PF6-ANDROID-2026-08-23.1'
      || value.authorizationSource
        !== 'SIT_MAXIMUM_LAUNCH_READINESS_AUTONOMY_V1_FREIGABE'
      || value.observedOn !== '2026-08-23'
      || value.status !== 'current-head-signed-physical-direct-install-passed') {
    fail('PF6 current-head Android evidence identity is invalid.');
  }
}

function assertSource(value, root, checkGitCommit) {
  if (!exact(value.source, {
    candidateCommit: expectedCommit,
    branch: 'codex/master-workflow-20260808',
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    paymentMode: 'memory',
    stripeLivemode: false,
    googleLoginEnabled: true,
    appleLoginEnabled: false,
    facebookLoginEnabled: false,
    controlledCrashDiagnosticRunId: 'b11-android-2026082301',
  })) {
    fail('PF6 current-head Android source binding is invalid.');
  }
  if (checkGitCommit) {
    try {
      execFileSync('git', ['cat-file', '-e', `${expectedCommit}^{commit}`], {
        cwd: root,
        stdio: 'ignore',
      });
    } catch {
      fail('PF6 candidate commit is unavailable.');
    }
  }
}

function assertCandidate(value) {
  const candidate = value.androidCandidate;
  if (candidate?.applicationId !== 'com.shareittoo.app'
      || candidate.signed !== true
      || candidate.canonicalUploadCertificateVerified !== true
      || candidate.firebaseConfigured !== true
      || candidate.binaryPrivacyScan !== 'passed'
      || candidate.aabSha256 !== expectedAabHash
      || candidate.apkSha256 !== expectedApkHash
      || candidate.privacyReportSha256 !== expectedPrivacyHash
      || !exact(candidate.privateArchive, {
        available: true,
        fileCount: 4,
        allFilesOwnerOnly: true,
        overwriteAllowed: false,
        externalUploadPerformed: false,
        filesystemPathStored: false,
      })) {
    fail('PF6 signed Android candidate evidence is incomplete or invalid.');
  }
}

function assertPhysicalDevice(value) {
  const device = value.physicalDevice;
  if (device?.status !== 'passed-current-head-direct-internal-update'
      || device.physical !== true
      || device.manufacturer !== 'Google'
      || device.model !== 'Pixel 7 Pro'
      || device.osVersion !== '16'
      || device.apiLevel !== 36
      || !/^\d{4}-\d{2}-\d{2}$/u.test(device.securityPatch)
      || device.authorized !== true
      || device.installedVersionBefore !== '1.0.0+2026081510'
      || device.installedVersionAfter !== '1.0.0+2026082301'
      || device.updateInstallSucceeded !== true
      || device.signatureMatchedInstalledApp !== true
      || device.installedCandidateHashMatches !== true
      || device.firstInstallTimePreserved !== true
      || device.ceDataInodePreserved !== true
      || device.launchProcessVerified !== true
      || device.uninstallUsed !== false
      || device.dataResetUsed !== false
      || device.downgradeUsed !== false
      || device.storeInstallationGateSatisfied !== false
      || device.rawDeviceIdentifierRecorded !== false
      || device.screenshotOrUserContentRecorded !== false) {
    fail('PF6 physical Android update evidence is incomplete or unsafe.');
  }
}

function assertExactCommitVerification(value) {
  if (!exact(value.exactCommitVerification, {
    regressionRun: '32633048693',
    regressionSucceeded: true,
    codeqlRun: '32633048658',
    codeqlSucceeded: true,
    headCommitMatched: true,
    pullRequest: 7,
    pullRequestDraft: true,
    pullRequestMerged: false,
  })) {
    fail('PF6 exact-commit CI or pull-request evidence is invalid.');
  }
}

function assertTechnicalDebt(value) {
  if (!exact(value.releaseHostTechnicalDebt, {
    id: 'TD-PF6-001',
    status: 'closed',
    firstAttemptFailure: 'insufficient-local-disk-capacity',
    externalScratchResult: 'rejected-not-used-for-release-evidence',
    deterministicInternalFilesystemRerunSucceeded: true,
    fixedEffectiveCapacityFloorKiB: 5242880,
    sourceBoundCapacityGuard: true,
    sdkLocalPropertiesFallback: true,
    workaroundIsReleasePrerequisite: false,
  })) {
    fail('PF6 release-host Technical Debt is not closed deterministically.');
  }
}

function assertReleaseGate(value) {
  if (!exact(value.releaseGate, {
    currentHeadSignedCandidate: true,
    currentHeadPhysicalDirectInstall: true,
    googlePlayInternalDistribution: false,
    closedTestingStarted: false,
    storeSubmissionAllowed: false,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
    stageAReady: false,
    decision: 'hold-no-go',
  })) {
    fail('PF6 release gate must remain non-Store and HOLD / NO-GO.');
  }
}

function assertBoundaries(value) {
  if (!allFalse(value.boundaries)) {
    fail('PF6 external and live boundaries must all remain false.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|keyPassword|storePassword/iu.test(serialized)) {
    fail('PF6 evidence contains a private path, identifier or credential field.');
  }
}

export function validateCurrentHeadAndroidCandidate({
  root = defaultRoot,
  evidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  assertIdentity(value);
  assertSource(value, root, checkGitCommit);
  assertCandidate(value);
  assertPhysicalDevice(value);
  assertExactCommitVerification(value);
  assertTechnicalDebt(value);
  assertReleaseGate(value);
  assertBoundaries(value);
  return Object.freeze({
    version: value.version,
    status: value.status,
    candidateCommit: value.source.candidateCommit,
    buildNumber: value.source.buildNumber,
    physicalDirectInstall: true,
    privateArchiveRecorded: true,
    stageAReady: false,
    decision: 'hold-no-go',
  });
}

export async function verifyCurrentHeadPrivateAndroidArchive() {
  const directory = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'release',
    'android',
    `${expectedBuildNumber}-${expectedCommit}`,
  );
  let files;
  try {
    files = readdirSync(directory).sort();
  } catch {
    fail('PF6 private Android candidate archive is unavailable.');
  }
  const expectedFiles = [
    'manifest.json',
    'privacy-scan.json',
    `shareittoo-1.0.0-${expectedBuildNumber}-${expectedCommit}.aab`,
    `shareittoo-1.0.0-${expectedBuildNumber}-${expectedCommit}.apk`,
  ].sort();
  if (!exact(files, expectedFiles)) {
    fail('PF6 private Android candidate archive file set is invalid.');
  }
  for (const name of files) {
    const metadata = lstatSync(resolve(directory, name));
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
      fail('PF6 private Android candidate archive permissions are unsafe.');
    }
  }
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.applicationId !== 'com.shareittoo.app'
      || manifest.versionName !== '1.0.0'
      || manifest.versionCode !== expectedBuildNumber
      || manifest.commit !== expectedCommit
      || manifest.channel !== 'internal'
      || manifest.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || manifest.firebaseConfigured !== true
      || manifest.signingCertificateSha256 !== canonicalCertificate
      || manifest.androidBinaryPrivacyScan !== 'passed'
      || manifest.aabSha256 !== expectedAabHash
      || manifest.apkSha256 !== expectedApkHash
      || manifest.androidBinaryPrivacyReportSha256 !== expectedPrivacyHash) {
    fail('PF6 private Android candidate manifest is invalid.');
  }
  const aab = files.find((name) => name.endsWith('.aab'));
  const apk = files.find((name) => name.endsWith('.apk'));
  const [aabHash, apkHash, privacyHash] = await Promise.all([
    sha256File(resolve(directory, aab)),
    sha256File(resolve(directory, apk)),
    sha256File(resolve(directory, 'privacy-scan.json')),
  ]);
  if (aabHash !== expectedAabHash
      || apkHash !== expectedApkHash
      || privacyHash !== expectedPrivacyHash) {
    fail('PF6 private Android candidate bytes do not match repository evidence.');
  }
  return Object.freeze({
    status: 'archived-and-verified',
    fileCount: files.length,
    ownerOnly: true,
    hashesMatch: true,
    privatePathDisclosed: false,
  });
}

export async function loadCurrentHeadAndroidDeviceCandidate() {
  const root = defaultRoot;
  const evidence = JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  validateCurrentHeadAndroidCandidate({ root, evidence });
  await verifyCurrentHeadPrivateAndroidArchive();
  const directory = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'release',
    'android',
    `${expectedBuildNumber}-${expectedCommit}`,
  );
  const apkName = readdirSync(directory).find((name) => name.endsWith('.apk'));
  if (apkName === undefined) fail('PF6 private Android candidate APK is unavailable.');
  return Object.freeze({
    applicationId: 'com.shareittoo.app',
    bundleId: 'com.shareittoo.app',
    versionName: evidence.source.versionName,
    buildNumber: evidence.source.buildNumber,
    commit: evidence.source.candidateCommit,
    releaseChannel: evidence.source.releaseChannel,
    apiBaseUrl: evidence.source.apiBaseUrl,
    firebaseConfigured: evidence.androidCandidate.firebaseConfigured,
    paymentMode: evidence.source.paymentMode,
    stripeLivemode: evidence.source.stripeLivemode,
    android: Object.freeze({
      apkSha256: evidence.androidCandidate.apkSha256,
      aabSha256: evidence.androidCandidate.aabSha256,
      signingCertificateSha256: canonicalCertificate,
    }),
    apkPath: resolve(directory, apkName),
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const requirePrivateArchive = process.argv.includes('--require-private-archive');
    const unknown = process.argv.slice(2).filter(
      (value) => value !== '--ci-metadata-only' && value !== '--require-private-archive',
    );
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF6 CI metadata-only mode is restricted to CI.');
    }
    if (ciMetadataOnly && requirePrivateArchive) {
      fail('PF6 CI metadata-only mode cannot claim the private archive.');
    }
    const result = validateCurrentHeadAndroidCandidate({
      checkGitCommit: !ciMetadataOnly,
    });
    const archive = requirePrivateArchive
      ? await verifyCurrentHeadPrivateAndroidArchive()
      : null;
    process.stdout.write(
      `PF6 current-head Android candidate valid: build=${result.buildNumber}, `
      + `physicalDirectInstall=${result.physicalDirectInstall}, `
      + `stageAReady=${result.stageAReady}, decision=${result.decision}`
      + `${archive ? ', privateArchive=verified' : ''}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF6 current-head Android candidate validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
