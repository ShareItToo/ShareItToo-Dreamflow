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
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/p0b-next/signed-device-evidence.json';
const expectedCommit = 'e8cd4a99d95f74c279afa86a24a9a61df6ee98c8';
const expectedBuildNumber = '2026081510';
const expectedApkHash = 'c44050944b78f01ac1ab4a2231887639b4cc0e62876fe5f6b3a388da8468540d';
const expectedAabHash = 'fe38f80885982fec86457067ac8d26257a4c5fdbf0b5ecc58005ac756a1c297c';
const expectedPrivacyHash = '6f74106652475d04fbfdff2c23b82ddd503895cca52e2912ccb580b64ec1acb7';
const canonicalCertificate = '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
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
      || value.kind !== 'p0b-current-source-signed-device-evidence'
      || value.version !== 'P0B-DEVICE-2026-08-21.1'
      || value.authorizationToken !== 'P0B_NEXT_SIGNED_DEVICE_EVIDENCE_ONLY'
      || value.observedOn !== '2026-08-21'
      || value.status !== 'partial-android-passed-ios-blocked') {
    fail('P0B signed-device evidence identity or partial status is invalid.');
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
    firebaseAndroidConfigured: true,
    firebaseIosConfigured: true,
    firebaseAnalyticsEnabled: false,
  })) {
    fail('P0B signed-device source binding is invalid.');
  }
  if (checkGitCommit) {
    try {
      execFileSync('git', ['cat-file', '-e', `${expectedCommit}^{commit}`], {
        cwd: root,
        stdio: 'ignore',
      });
    } catch {
      fail('P0B signed-device candidate commit is unavailable.');
    }
  }
}

function assertAndroid(value) {
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
    fail('P0B signed Android candidate evidence is incomplete or invalid.');
  }
  const physical = value.androidPhysicalEvidence;
  if (physical?.status !== 'passed-current-source-direct-internal-install'
      || physical.physical !== true
      || physical.manufacturer !== 'Google'
      || physical.model !== 'Pixel 7 Pro'
      || physical.osVersion !== '16'
      || physical.apiLevel !== 36
      || !/^\d{4}-\d{2}-\d{2}$/u.test(physical.securityPatch)
      || physical.authorized !== true
      || physical.updateInstallSucceeded !== true
      || physical.installedCandidateHashMatches !== true
      || physical.installedVersionName !== '1.0.0'
      || physical.installedVersionCode !== expectedBuildNumber
      || physical.coldLaunchResumed !== true
      || physical.installedDataPreserved !== true
      || physical.uninstallUsed !== false
      || physical.dataResetUsed !== false
      || physical.downgradeUsed !== false
      || physical.storeInstallationGateSatisfied !== false
      || physical.rawDeviceIdentifierRecorded !== false
      || physical.screenshotOrUserContentRecorded !== false) {
    fail('P0B current-source Android physical evidence is incomplete or unsafe.');
  }
}

function assertIosBlocked(value) {
  const ios = value.iosEvidence;
  if (ios?.status !== 'blocked-local-tooling-and-physical-device-unverified'
      || ios.bundleId !== 'com.shareittoo.app'
      || ios.firebaseConfigured !== true
      || ios.signedCandidateCreated !== false
      || ios.physicalDeviceEvidenceAvailable !== false
      || ios.fullXcodeApplicationPresent !== false
      || ios.activeDeveloperDirectory !== 'command-line-tools-only'
      || ios.xcodebuildAvailable !== false
      || ios.cocoaPodsAvailable !== false
      || ios.accountChecked !== false
      || ios.membershipChecked !== false
      || ios.agreementAccepted !== false
      || ios.signingChanged !== false
      || ios.archiveAttempted !== false
      || ios.uploadAttempted !== false
      || !exact(ios.blockers, [
        'full-xcode-application-missing',
        'full-xcode-not-selected',
        'xcodebuild-unavailable',
        'cocoapods-unavailable',
        'physical-ios-device-unverified',
      ])) {
    fail('P0B iOS evidence must remain explicitly blocked and unattempted.');
  }
}

function assertReleaseGate(value) {
  const gate = value.releaseGate;
  if (gate?.androidCurrentSourceSignedCandidate !== true
      || gate.androidCurrentSourcePhysicalEvidence !== true
      || gate.iosCurrentSourceSignedCandidate !== false
      || gate.iosCurrentSourcePhysicalEvidence !== false
      || gate.storeSubmissionAllowed !== false
      || gate.publicActivationAllowed !== false
      || gate.realMoneyAllowed !== false
      || gate.signedDeviceGateReady !== false) {
    fail('P0B signed-device gate must remain partial and non-activating.');
  }
  if (gate.candidateCommitCiGreen === true) {
    if (!/^\d{11}$/u.test(String(gate.candidateCommitCiRun))) {
      fail('P0B candidate CI claim requires an exact run ID.');
    }
  } else if (gate.candidateCommitCiGreen !== false || gate.candidateCommitCiRun !== null) {
    fail('P0B pending candidate CI state is invalid.');
  }
}

function assertBoundaries(value) {
  const boundaries = value.boundaries;
  for (const field of [
    'containsSecrets',
    'containsRawDeviceIdentifiers',
    'containsPrivateFilesystemPaths',
    'containsScreenshotsOrUserContent',
    'productionChanged',
    'cloudChanged',
    'paymentChanged',
    'providerChanged',
    'storeChanged',
    'storeUploadPerformed',
    'publicActivationChanged',
  ]) {
    if (boundaries?.[field] !== false) fail(`P0B signed-device boundary must remain false: ${field}`);
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|keyPassword|storePassword/iu.test(serialized)) {
    fail('P0B signed-device evidence contains a private path, identifier or credential field.');
  }
}

export function validateP0BSignedDeviceEvidence({
  root = defaultRoot,
  evidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  assertIdentity(value);
  assertSource(value, root, checkGitCommit);
  assertAndroid(value);
  assertIosBlocked(value);
  assertReleaseGate(value);
  assertBoundaries(value);
  return Object.freeze({
    version: value.version,
    status: value.status,
    candidateCommit: value.source.candidateCommit,
    androidCandidate: true,
    androidPhysical: true,
    iosCandidate: false,
    iosPhysical: false,
    candidateCiGreen: value.releaseGate.candidateCommitCiGreen,
    signedDeviceGateReady: false,
  });
}

export async function verifyP0BPrivateAndroidArchive({ root = defaultRoot } = {}) {
  const evidence = JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
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
    fail('P0B private Android candidate archive is unavailable.');
  }
  const expectedFiles = [
    'manifest.json',
    'privacy-scan.json',
    `shareittoo-1.0.0-${expectedBuildNumber}-${expectedCommit}.aab`,
    `shareittoo-1.0.0-${expectedBuildNumber}-${expectedCommit}.apk`,
  ].sort();
  if (!exact(files, expectedFiles)) fail('P0B private Android candidate archive file set is invalid.');
  for (const name of files) {
    const metadata = lstatSync(resolve(directory, name));
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
      fail('P0B private Android candidate archive permissions are unsafe.');
    }
  }
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.commit !== expectedCommit
      || manifest.versionCode !== expectedBuildNumber
      || manifest.aabSha256 !== expectedAabHash
      || manifest.apkSha256 !== expectedApkHash
      || manifest.androidBinaryPrivacyReportSha256 !== expectedPrivacyHash
      || manifest.signingCertificateSha256 !== canonicalCertificate
      || manifest.firebaseConfigured !== true
      || manifest.androidBinaryPrivacyScan !== 'passed') {
    fail('P0B private Android candidate manifest is invalid.');
  }
  const apk = files.find((name) => name.endsWith('.apk'));
  const aab = files.find((name) => name.endsWith('.aab'));
  const [apkHash, aabHash, privacyHash] = await Promise.all([
    sha256File(resolve(directory, apk)),
    sha256File(resolve(directory, aab)),
    sha256File(resolve(directory, 'privacy-scan.json')),
  ]);
  if (apkHash !== evidence.androidCandidate.apkSha256
      || aabHash !== evidence.androidCandidate.aabSha256
      || privacyHash !== evidence.androidCandidate.privacyReportSha256) {
    fail('P0B private Android candidate bytes do not match repository evidence.');
  }
  return Object.freeze({
    status: 'archived-and-verified',
    fileCount: files.length,
    ownerOnly: true,
    hashesMatch: true,
    privatePathDisclosed: false,
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('P0B CI metadata-only mode is restricted to CI.');
    }
    const result = validateP0BSignedDeviceEvidence({
      checkGitCommit: !ciMetadataOnly,
    });
    const archive = process.argv.includes('--require-private-archive')
      ? await verifyP0BPrivateAndroidArchive()
      : null;
    process.stdout.write(
      `P0B signed-device evidence valid: status=${result.status}, androidCandidate=${result.androidCandidate}, androidPhysical=${result.androidPhysical}, iosCandidate=${result.iosCandidate}, iosPhysical=${result.iosPhysical}, candidateCiGreen=${result.candidateCiGreen}, signedDeviceGateReady=${result.signedDeviceGateReady}${archive ? ', privateArchive=verified' : ''}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'P0B signed-device validation failed.'}\n`);
    process.exitCode = 1;
  }
}
