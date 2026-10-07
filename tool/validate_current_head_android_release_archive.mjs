#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const currentHeadAndroidApplicationId = 'com.shareittoo.app';
export const currentHeadAndroidStagingApiBaseUrl =
  'https://staging.shareittoo.com/api/v1';
export const canonicalAndroidSigningCertificateSha256 =
  '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function assertOwnerOnlyRegularFile(path, label) {
  const link = lstatSync(path, { throwIfNoEntry: false });
  if (link === undefined || link.isSymbolicLink() || !link.isFile()) {
    fail(`${label} must be a regular non-symlink file.`);
  }
  const stat = statSync(path);
  if (stat.size === 0 || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be non-empty and owner-only.`);
  }
}

function assertOwnerOnlyDirectory(path) {
  const link = lstatSync(path, { throwIfNoEntry: false });
  if (link === undefined || link.isSymbolicLink() || !link.isDirectory()) {
    fail('Candidate archive must be a regular non-symlink directory.');
  }
  if ((statSync(path).mode & 0o077) !== 0) {
    fail('Candidate archive directory must be owner-only.');
  }
}

async function hashFile(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

export function readCurrentHeadAndroidReleaseIdentity({
  root,
  commandRunner = execFileSync,
} = {}) {
  const repositoryRoot = resolve(root ?? fileURLToPath(new URL('../', import.meta.url)));
  const pubspec = readFileSync(resolve(repositoryRoot, 'pubspec.yaml'), 'utf8');
  const version = /^version:\s+([^+\s]+)\+(\d{10})$/mu.exec(pubspec);
  if (version === null || !/^\d+\.\d+\.\d+$/u.test(version[1])) {
    fail('pubspec.yaml does not contain a valid Android release identity.');
  }
  const commit = String(commandRunner('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })).trim();
  if (!/^[a-f0-9]{40}$/u.test(commit)) {
    fail('Current Git HEAD is not a full commit digest.');
  }
  return Object.freeze({
    versionName: version[1],
    buildNumber: version[2],
    commit,
  });
}

export async function validateCurrentHeadAndroidReleaseArchive({
  root,
  candidateDirectory,
  expectedIdentity,
} = {}) {
  const repositoryRoot = resolve(root ?? fileURLToPath(new URL('../', import.meta.url)));
  const expected = expectedIdentity ?? readCurrentHeadAndroidReleaseIdentity({
    root: repositoryRoot,
  });
  if (!/^\d+\.\d+\.\d+$/u.test(expected.versionName)
      || !/^\d{10}$/u.test(expected.buildNumber)
      || !/^[a-f0-9]{40}$/u.test(expected.commit)) {
    fail('Expected current-head Android release identity is invalid.');
  }
  const directory = resolve(candidateDirectory ?? resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'release',
    'android',
    `${expected.buildNumber}-${expected.commit}`,
  ));
  assertOwnerOnlyDirectory(directory);

  const apkName = `shareittoo-${expected.versionName}-${expected.buildNumber}-${expected.commit}.apk`;
  const aabName = `shareittoo-${expected.versionName}-${expected.buildNumber}-${expected.commit}.aab`;
  const expectedFiles = ['manifest.json', 'privacy-scan.json', aabName, apkName].sort();
  const files = readdirSync(directory).sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    fail('Candidate archive does not contain the exact four current-head artifacts.');
  }
  const manifestPath = resolve(directory, 'manifest.json');
  const privacyPath = resolve(directory, 'privacy-scan.json');
  const apkPath = resolve(directory, apkName);
  const aabPath = resolve(directory, aabName);
  for (const [path, label] of [
    [manifestPath, 'candidate manifest'],
    [privacyPath, 'candidate privacy report'],
    [apkPath, 'candidate APK'],
    [aabPath, 'candidate AAB'],
  ]) {
    assertOwnerOnlyRegularFile(path, label);
  }

  const manifest = object(JSON.parse(readFileSync(manifestPath, 'utf8')), 'candidate manifest');
  const privacy = object(JSON.parse(readFileSync(privacyPath, 'utf8')), 'candidate privacy report');
  const identity = {
    applicationId: currentHeadAndroidApplicationId,
    versionName: expected.versionName,
    versionCode: expected.buildNumber,
    commit: expected.commit,
    apiBaseUrl: currentHeadAndroidStagingApiBaseUrl,
  };
  for (const [key, value] of Object.entries(identity)) {
    if (manifest[key] !== value || privacy.identity?.[key] !== value) {
      fail(`Candidate ${key} is not bound to the exact current-head identity.`);
    }
  }
  if (manifest.platform !== 'android'
      || manifest.channel !== 'internal'
      || manifest.firebaseConfigured !== true
      || manifest.signingCertificateSha256
        !== canonicalAndroidSigningCertificateSha256
      || manifest.androidBinaryPrivacyScan !== 'passed'
      || manifest.androidBinaryPrivacyReport !== 'privacy-scan.json') {
    fail('Candidate manifest is not the canonical signed internal Staging configuration.');
  }
  if (privacy.schemaVersion !== 1
      || privacy.platform !== 'android'
      || privacy.status !== 'passed'
      || !Array.isArray(privacy.findings)
      || privacy.findings.length !== 0) {
    fail('Candidate Android binary privacy scan did not pass without findings.');
  }

  let socialAuth = null;
  if (manifest.socialAuth !== undefined) {
    const profile = object(manifest.socialAuth, 'candidate socialAuth');
    const keys = Object.keys(profile).sort();
    if (JSON.stringify(keys) !== JSON.stringify([
      'appleEnabled',
      'facebookEnabled',
      'googleEnabled',
    ]) || keys.some((key) => typeof profile[key] !== 'boolean')) {
      fail('Candidate social-auth profile is invalid.');
    }
    socialAuth = Object.freeze({
      googleEnabled: profile.googleEnabled,
      appleEnabled: profile.appleEnabled,
      facebookEnabled: profile.facebookEnabled,
    });
  }

  const [apkSha256, aabSha256, privacyReportSha256] = await Promise.all([
    hashFile(apkPath),
    hashFile(aabPath),
    hashFile(privacyPath),
  ]);
  for (const [actual, recorded, label] of [
    [apkSha256, manifest.apkSha256, 'APK'],
    [apkSha256, privacy.artifacts?.apk?.sha256, 'privacy APK'],
    [aabSha256, manifest.aabSha256, 'AAB'],
    [aabSha256, privacy.artifacts?.aab?.sha256, 'privacy AAB'],
    [privacyReportSha256, manifest.androidBinaryPrivacyReportSha256, 'privacy report'],
  ]) {
    if (actual !== digest(recorded, `${label} digest`)) {
      fail(`Candidate ${label} hash does not match the private archive.`);
    }
  }

  return Object.freeze({
    applicationId: currentHeadAndroidApplicationId,
    bundleId: currentHeadAndroidApplicationId,
    versionName: expected.versionName,
    buildNumber: expected.buildNumber,
    commit: expected.commit,
    releaseChannel: 'internal',
    apiBaseUrl: currentHeadAndroidStagingApiBaseUrl,
    firebaseConfigured: true,
    apkSha256,
    aabSha256,
    signingCertificateSha256: canonicalAndroidSigningCertificateSha256,
    privacyReportSha256,
    privacyScan: 'passed',
    socialAuth,
    apkPath,
    aabPath,
    android: Object.freeze({
      apkSha256,
      aabSha256,
      signingCertificateSha256: canonicalAndroidSigningCertificateSha256,
    }),
  });
}

export async function validatePrivateAndroidReleaseArchive({
  root,
  candidateDirectory,
} = {}) {
  if (typeof candidateDirectory !== 'string' || candidateDirectory.trim() === '') {
    fail('An explicit private Android candidate archive is required.');
  }
  const directory = resolve(candidateDirectory);
  assertOwnerOnlyDirectory(directory);
  const manifestPath = resolve(directory, 'manifest.json');
  assertOwnerOnlyRegularFile(manifestPath, 'candidate manifest');
  const manifest = object(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    'candidate manifest',
  );
  const expectedIdentity = {
    versionName: manifest.versionName,
    buildNumber: manifest.versionCode,
    commit: manifest.commit,
  };
  if (typeof expectedIdentity.versionName !== 'string'
      || !/^\d+\.\d+\.\d+$/u.test(expectedIdentity.versionName)
      || typeof expectedIdentity.buildNumber !== 'string'
      || !/^\d{10}$/u.test(expectedIdentity.buildNumber)
      || typeof expectedIdentity.commit !== 'string'
      || !/^[a-f0-9]{40}$/u.test(expectedIdentity.commit)) {
    fail('Private Android candidate archive identity is invalid.');
  }
  return validateCurrentHeadAndroidReleaseArchive({
    root,
    candidateDirectory: directory,
    expectedIdentity,
  });
}

function parseArguments(values) {
  let candidateDirectory;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { candidateDirectory };
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const candidate = await validateCurrentHeadAndroidReleaseArchive({
    candidateDirectory: args.candidateDirectory,
  });
  process.stdout.write(
    `Current-head Android private archive valid: build=${candidate.buildNumber}, `
    + `commit=${candidate.commit}, channel=${candidate.releaseChannel}, privacy=passed\n`,
  );
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Current-head Android archive validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
