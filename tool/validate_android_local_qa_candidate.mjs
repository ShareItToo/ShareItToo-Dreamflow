#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalAndroidSigningCertificateSha256 } from './validate_current_head_android_release_archive.mjs';

const defaultBuildNumber = '2026082303';
const versionName = '1.0.0';
const applicationId = 'com.shareittoo.app';

function fail(message) {
  throw new Error(message);
}

function ownerOnlyFile(path, label) {
  const link = lstatSync(path, { throwIfNoEntry: false });
  if (link === undefined || link.isSymbolicLink() || !link.isFile()) {
    fail(`${label} must be a regular non-symlink file.`);
  }
  const stat = statSync(path);
  if (stat.size === 0 || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be non-empty and owner-only.`);
  }
}

function ownerOnlyDirectory(path) {
  const link = lstatSync(path, { throwIfNoEntry: false });
  if (link === undefined || link.isSymbolicLink() || !link.isDirectory()
      || (statSync(path).mode & 0o077) !== 0) {
    fail('R2 archive must be a regular owner-only directory.');
  }
}

async function sha256(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

function resolveTool(root, tool) {
  const localProperties = resolve(root, 'android', 'local.properties');
  const sdkRoot = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? (/^sdk\.dir=(.+)$/mu.exec(readFileSync(localProperties, 'utf8'))?.[1])
    ?? resolve(homedir(), 'Library', 'Android', 'sdk');
  const buildTools = resolve(sdkRoot, 'build-tools');
  const versions = readdirSync(buildTools).sort((left, right) => (
    left.localeCompare(right, undefined, { numeric: true })
  ));
  const path = resolve(buildTools, versions.at(-1) ?? '', tool);
  if (!existsSync(path)) fail(`Android ${tool} is unavailable.`);
  return path;
}

function defaultRunner(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function validateAndroidLocalQaCandidate({
  root,
  candidateDirectory,
  expectedCommit,
  expectedBuildNumber = defaultBuildNumber,
  commandRunner = defaultRunner,
  apksignerPath,
  aaptPath,
  includePrivateArtifact = false,
} = {}) {
  const repositoryRoot = resolve(root ?? fileURLToPath(new URL('../', import.meta.url)));
  const buildNumber = String(expectedBuildNumber);
  if (!/^\d{10,12}$/u.test(buildNumber)
      || BigInt(buildNumber) < BigInt(defaultBuildNumber)) {
    fail('Local QA build number is invalid.');
  }
  const commit = expectedCommit ?? String(commandRunner('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  })).trim();
  if (!/^[a-f0-9]{40}$/u.test(commit)) fail('Exact R2 source commit is invalid.');
  const directory = resolve(candidateDirectory ?? resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'android',
    `${buildNumber}-${commit}`,
  ));
  ownerOnlyDirectory(directory);
  const apkName = `shareittoo-local-qa-${versionName}-${buildNumber}-${commit}.apk`;
  const expectedFiles = ['manifest.json', apkName].sort();
  if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(expectedFiles)) {
    fail('R2 archive must contain exactly the manifest and local QA APK.');
  }
  const manifestPath = resolve(directory, 'manifest.json');
  const apkPath = resolve(directory, apkName);
  ownerOnlyFile(manifestPath, 'R2 manifest');
  ownerOnlyFile(apkPath, 'R2 APK');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1
      || manifest.kind !== 'sit-android-local-blue-ocean-qa-candidate'
      || manifest.status !== 'built-owner-only-not-installed'
      || JSON.stringify(manifest.source) !== JSON.stringify({
        branch: 'codex/master-workflow-20260808',
        commit,
        applicationId,
        versionName,
        buildNumber,
      })) {
    fail('R2 candidate identity is invalid.');
  }
  const configuration = manifest.configuration;
  if (JSON.stringify(configuration) !== JSON.stringify({
    buildType: 'debug-canonical-local-qa',
    releaseChannel: 'internal',
    apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
    adbReverseRequired: 'tcp:18080',
    blueOceanMockUi: true,
    requiredLocalBackendProvider: 'mock',
    g3TechnicalUi: true,
    g4TechnicalUi: true,
    g5TechnicalUi: true,
    externalProviderAllowed: false,
    realMoneyAllowed: false,
    productionAllowed: false,
    publicRegistrationAllowed: false,
    publicReleaseAllowed: false,
  })) {
    fail('R2 candidate configuration is invalid.');
  }
  if (Object.values(manifest.boundaries ?? {}).some((value) => value !== false)
      || manifest.artifact?.fileName !== apkName
      || manifest.artifact.ownerOnly !== true
      || manifest.artifact.canonicalSigningRelationshipVerified !== true
      || manifest.artifact.debuggable !== true
      || !/^[a-f0-9]{64}$/u.test(manifest.artifact.apkSha256 ?? '')
      || await sha256(apkPath) !== manifest.artifact.apkSha256) {
    fail('R2 artifact or mutation boundary is invalid.');
  }
  const signer = String(commandRunner(
    apksignerPath ?? resolveTool(repositoryRoot, 'apksigner'),
    ['verify', '--print-certs', apkPath],
  ));
  const certificate = /^(?:V\d+ Signer:|Signer #\d+) certificate SHA-256 digest:\s*([a-f0-9]{64})\s*$/imu
    .exec(signer)?.[1]?.toLowerCase();
  if (certificate !== canonicalAndroidSigningCertificateSha256) {
    fail('R2 APK does not have the canonical installed-app signing relationship.');
  }
  const badging = String(commandRunner(
    aaptPath ?? resolveTool(repositoryRoot, 'aapt'),
    ['dump', 'badging', apkPath],
  ));
  if (!badging.includes(
    `package: name='${applicationId}' versionCode='${buildNumber}' versionName='${versionName}'`,
  )) {
    fail('R2 APK package identity is invalid.');
  }
  if (includePrivateArtifact === true) {
    return Object.freeze({
      applicationId,
      bundleId: applicationId,
      versionName,
      buildNumber,
      commit,
      releaseChannel: configuration.releaseChannel,
      apiBaseUrl: configuration.apiBaseUrl,
      firebaseConfigured: false,
      apkSha256: manifest.artifact.apkSha256,
      signingCertificateSha256: certificate,
      privacyScan: 'local-qa-archive-verified',
      apkPath,
      configuration: Object.freeze({ ...configuration }),
    });
  }
  return Object.freeze({
    status: 'verified-owner-only-not-installed',
    commit,
    buildNumber,
    canonicalSigningRelationshipVerified: true,
    debuggable: true,
    localLoopbackOnly: true,
    containsSecrets: false,
    containsPrivateFilesystemPaths: false,
  });
}

async function run() {
  const result = await validateAndroidLocalQaCandidate({
    expectedBuildNumber: process.env.SIT_LOCAL_QA_BUILD_NUMBER
      ?? defaultBuildNumber,
  });
  console.log(
    `R2 local QA candidate valid: build=${result.buildNumber}, `
      + `commit=${result.commit}, signing=canonical, installed=false`,
  );
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await run();
