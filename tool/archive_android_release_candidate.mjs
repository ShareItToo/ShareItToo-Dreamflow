#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const canonicalSigningCertificateSha256 =
  '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(message);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function regularFile(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    fail(`${label} must be a regular file.`);
  }
}

function exactArtifact(files, extension) {
  const matches = files.filter((name) => name.endsWith(extension));
  if (matches.length !== 1) {
    fail(`Release evidence must contain exactly one ${extension} artifact.`);
  }
  return matches[0];
}

export function archiveAndroidReleaseCandidate({
  sourceDirectory,
  archiveRoot,
  expectedVersionName,
  expectedBuildNumber,
  expectedCommit,
}) {
  if (!/^\d{10}$/u.test(expectedBuildNumber) ||
      !/^[a-f0-9]{40}$/u.test(expectedCommit) ||
      !/^\d+\.\d+\.\d+$/u.test(expectedVersionName)) {
    fail('Expected release identity is invalid.');
  }
  const sourceReal = realpathSync(sourceDirectory);
  const files = readdirSync(sourceReal).sort();
  const manifestName = 'manifest.json';
  const privacyName = 'privacy-scan.json';
  const aabName = exactArtifact(files, '.aab');
  const apkName = exactArtifact(files, '.apk');
  const expectedAabName =
    `shareittoo-${expectedVersionName}-${expectedBuildNumber}-${expectedCommit}.aab`;
  const expectedApkName =
    `shareittoo-${expectedVersionName}-${expectedBuildNumber}-${expectedCommit}.apk`;
  if (aabName !== expectedAabName || apkName !== expectedApkName ||
      JSON.stringify(files) !== JSON.stringify([
        manifestName, privacyName, expectedAabName, expectedApkName,
      ].sort())) {
    fail('Release evidence contains unexpected or mismatched files.');
  }

  const manifestPath = resolve(sourceReal, manifestName);
  const privacyPath = resolve(sourceReal, privacyName);
  const aabPath = resolve(sourceReal, aabName);
  const apkPath = resolve(sourceReal, apkName);
  for (const [path, label] of [
    [manifestPath, 'manifest'], [privacyPath, 'privacy report'],
    [aabPath, 'AAB'], [apkPath, 'APK'],
  ]) regularFile(path, label);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.platform !== 'android' ||
      manifest.applicationId !== 'com.shareittoo.app' ||
      manifest.versionName !== expectedVersionName ||
      manifest.versionCode !== expectedBuildNumber ||
      manifest.commit !== expectedCommit ||
      manifest.channel !== 'internal' ||
      manifest.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1' ||
      manifest.clientBuild !== `${expectedVersionName}+${expectedBuildNumber}` ||
      typeof manifest.blueOceanListingAssistantEnabled !== 'boolean' ||
      typeof manifest.listingAiExecutionLocation !== 'string' ||
      typeof manifest.listingAiModel !== 'string' ||
      manifest.listingAiExternalImageProviderEnabled !== false ||
      (manifest.blueOceanListingAssistantEnabled === true && (
        manifest.listingAiExecutionLocation !== 'android_on_device' ||
        manifest.listingAiModel !==
          'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1'
      )) ||
      (manifest.blueOceanListingAssistantEnabled === false && (
        manifest.listingAiExecutionLocation !== 'disabled' ||
        manifest.listingAiModel !== ''
      )) ||
      typeof manifest.stageANonBindingPilotEnabled !== 'boolean' ||
      typeof manifest.closedPilotEnvelopeEnabled !== 'boolean' ||
      typeof manifest.stageAPilotId !== 'string' ||
      typeof manifest.g3TechnicalUiEnabled !== 'boolean' ||
      typeof manifest.g4TechnicalUiEnabled !== 'boolean' ||
      typeof manifest.g5SupplyEnrichmentTechnicalUiEnabled !== 'boolean' ||
      typeof manifest.g5ListingSetsTechnicalUiEnabled !== 'boolean' ||
      (manifest.blueOceanListingAssistantEnabled === true &&
        manifest.stageANonBindingPilotEnabled !== true) ||
      (manifest.closedPilotEnvelopeEnabled === true && (
        manifest.blueOceanListingAssistantEnabled !== true ||
        manifest.stageANonBindingPilotEnabled !== true ||
        manifest.stageAPilotId !== 'heilbronn_wave0' ||
        manifest.g3TechnicalUiEnabled !== true ||
        manifest.g4TechnicalUiEnabled !== true ||
        manifest.g5SupplyEnrichmentTechnicalUiEnabled !== true ||
        manifest.g5ListingSetsTechnicalUiEnabled !== true
      )) ||
      (manifest.closedPilotEnvelopeEnabled === false && (
        manifest.stageAPilotId !== '' ||
        manifest.g3TechnicalUiEnabled !== false ||
        manifest.g4TechnicalUiEnabled !== false ||
        manifest.g5SupplyEnrichmentTechnicalUiEnabled !== false ||
        manifest.g5ListingSetsTechnicalUiEnabled !== false
      )) ||
      manifest.firebaseConfigured !== true ||
      manifest.signingCertificateSha256 !== canonicalSigningCertificateSha256 ||
      manifest.androidBinaryPrivacyScan !== 'passed' ||
      manifest.androidBinaryPrivacyReport !== privacyName) {
    fail('Release manifest does not match the exact internal Staging candidate.');
  }
  if (sha256File(aabPath) !== manifest.aabSha256 ||
      sha256File(apkPath) !== manifest.apkSha256 ||
      sha256File(privacyPath) !== manifest.androidBinaryPrivacyReportSha256) {
    fail('Release evidence hash verification failed.');
  }

  mkdirSync(archiveRoot, { recursive: true, mode: 0o700 });
  chmodSync(archiveRoot, 0o700);
  const archiveRootReal = realpathSync(archiveRoot);
  const archiveDirectoryName = `${expectedBuildNumber}-${expectedCommit}`;
  const destination = resolve(archiveRootReal, archiveDirectoryName);
  if (!destination.startsWith(`${archiveRootReal}${sep}`)) {
    fail('Archive destination left the private release root.');
  }
  if (existsSync(destination)) {
    fail('Exact release archive already exists and will not be overwritten.');
  }
  const pending = resolve(
    archiveRootReal,
    `.pending-${archiveDirectoryName}-${process.pid}`,
  );
  if (existsSync(pending)) fail('A pending archive already exists.');
  try {
    mkdirSync(pending, { mode: 0o700 });
    for (const name of files) {
      const source = resolve(sourceReal, name);
      const target = resolve(pending, basename(name));
      copyFileSync(source, target, constants.COPYFILE_EXCL);
      chmodSync(target, 0o600);
      if (sha256File(source) !== sha256File(target)) {
        fail(`Archived ${name} failed verification.`);
      }
    }
    renameSync(pending, destination);
  } catch (error) {
    rmSync(pending, { recursive: true, force: true });
    throw error;
  }

  return {
    schemaVersion: 1,
    kind: 'private-android-release-archive',
    status: 'archived-and-verified',
    candidate: {
      applicationId: 'com.shareittoo.app',
      versionName: expectedVersionName,
      buildNumber: expectedBuildNumber,
      commit: expectedCommit,
      clientBuild: manifest.clientBuild,
      blueOceanListingAssistantEnabled: manifest.blueOceanListingAssistantEnabled,
      listingAiExecutionLocation: manifest.listingAiExecutionLocation,
      listingAiModel: manifest.listingAiModel,
      listingAiExternalImageProviderEnabled:
        manifest.listingAiExternalImageProviderEnabled,
      stageANonBindingPilotEnabled: manifest.stageANonBindingPilotEnabled,
      closedPilotEnvelopeEnabled: manifest.closedPilotEnvelopeEnabled,
      stageAPilotId: manifest.stageAPilotId,
      g3TechnicalUiEnabled: manifest.g3TechnicalUiEnabled,
      g4TechnicalUiEnabled: manifest.g4TechnicalUiEnabled,
      g5SupplyEnrichmentTechnicalUiEnabled:
        manifest.g5SupplyEnrichmentTechnicalUiEnabled,
      g5ListingSetsTechnicalUiEnabled: manifest.g5ListingSetsTechnicalUiEnabled,
    },
    archiveDirectoryName,
    files,
    hashes: {
      aabSha256: manifest.aabSha256,
      apkSha256: manifest.apkSha256,
      privacyReportSha256: manifest.androidBinaryPrivacyReportSha256,
    },
    boundaries: {
      overwriteAllowed: false,
      externalUploadPerformed: false,
      productionChanged: false,
      containsSecrets: false,
      containsFilesystemPaths: false,
    },
  };
}

function parseArguments(values) {
  let archiveRoot = resolve(
    homedir(), 'Library', 'Application Support', 'ShareItToo', 'release', 'android',
  );
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--archive-root') {
      archiveRoot = resolve(values[index + 1] ?? fail('--archive-root requires a path.'));
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { archiveRoot };
}

function runCli() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const { archiveRoot } = parseArguments(process.argv.slice(2));
  const pubspec = readFileSync(resolve(root, 'pubspec.yaml'), 'utf8');
  const version = /^version:\s+([^+\s]+)\+(\d{10})$/mu.exec(pubspec);
  if (version === null) fail('pubspec candidate version is invalid.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const result = archiveAndroidReleaseCandidate({
    sourceDirectory: resolve(root, 'build', 'release-evidence', `android-${version[2]}`),
    archiveRoot,
    expectedVersionName: version[1],
    expectedBuildNumber: version[2],
    expectedCommit: commit,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'Release archive failed.'}\n`);
    process.exitCode = 1;
  }
}
