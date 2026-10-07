#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestRelativePath = 'store/google-play/wp60-oneplus-current-candidate.json';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function readJson(root, relativePath, label) {
  return object(JSON.parse(readFileSync(resolve(root, relativePath), 'utf8')), label);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match the current candidate.`);
}

function falseValue(value, label) {
  if (value !== false) fail(`${label} must remain false.`);
}

export function validateWp60OnePlusCurrentCandidate({
  root = repositoryRoot,
  manifest = null,
} = {}) {
  const value = object(
    manifest ?? readJson(root, manifestRelativePath, 'WP60 manifest'),
    'WP60 manifest',
  );
  same(value.schemaVersion, 1, 'schemaVersion');
  same(value.kind, 'sit-wp60-oneplus-current-play-candidate', 'kind');
  same(value.status, 'prepared-play-active-oneplus-update-pending', 'status');

  const refs = object(value.sourceRefs, 'sourceRefs');
  same(
    refs.candidate,
    'store/google-play/rollover-candidate-2026090711.json',
    'candidate ref',
  );
  same(
    refs.playRelease,
    'docs/evidence/release-readiness/wp59-google-play-internal-2026090711-release-20260908.json',
    'Play release ref',
  );
  same(
    refs.previousOnePlus,
    'docs/evidence/release-readiness/oneplus-play-internal-2026090204-read-only.json',
    'previous OnePlus ref',
  );

  const sourceCandidate = readJson(root, refs.candidate, 'current rollover candidate');
  const playRelease = readJson(root, refs.playRelease, 'WP59 Play release evidence');
  const previousOnePlus = readJson(root, refs.previousOnePlus, 'previous OnePlus evidence');
  const candidate = object(value.candidate, 'candidate');
  const current = object(sourceCandidate.candidate, 'current rollover candidate identity');
  const artifact = object(sourceCandidate.artifact, 'current rollover artifact');
  const currentStaging = object(sourceCandidate.stagingStateAtReadback, 'current Staging state');

  for (const key of [
    'applicationId',
    'versionName',
    'versionCode',
    'artifactSourceHead',
    'releaseChannel',
    'apiBaseUrl',
    'minSdkVersion',
    'targetSdkVersion',
    'firebaseAndroidConfigured',
  ]) {
    same(candidate[key], current[key], `candidate.${key}`);
  }
  same(candidate.aabSha256, artifact.aabSha256, 'candidate.aabSha256');
  same(
    candidate.uploadCertificateSha256,
    artifact.uploadCertificateSha256,
    'candidate.uploadCertificateSha256',
  );
  same(candidate.paymentMode, currentStaging.paymentTransport, 'candidate.paymentMode');
  same(candidate.stripeLivemode, currentStaging.paymentLivemode, 'candidate.stripeLivemode');
  same(
    candidate.externalListingAiEnabled,
    currentStaging.externalListingAiEnabled,
    'candidate.externalListingAiEnabled',
  );
  same(candidate.releaseChannel, 'internal', 'candidate.releaseChannel');
  same(candidate.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'candidate.apiBaseUrl');
  falseValue(candidate.stripeLivemode, 'candidate.stripeLivemode');
  falseValue(candidate.externalListingAiEnabled, 'candidate.externalListingAiEnabled');

  same(playRelease.status, 'complete-play-internal-local-github', 'WP59 status');
  const playCandidate = object(playRelease.candidate, 'WP59 candidate');
  same(playCandidate.applicationId, candidate.applicationId, 'WP59 applicationId');
  same(playCandidate.versionName, candidate.versionName, 'WP59 versionName');
  same(playCandidate.versionCode, candidate.versionCode, 'WP59 versionCode');
  same(playCandidate.sourceHead, candidate.artifactSourceHead, 'WP59 sourceHead');
  same(playCandidate.aabSha256, candidate.aabSha256, 'WP59 AAB SHA-256');
  same(
    playCandidate.uploadCertificateSha256,
    candidate.uploadCertificateSha256,
    'WP59 upload certificate',
  );
  const play = object(value.playInternal, 'playInternal');
  const readback = object(playRelease.postActionReadback, 'WP59 post-action readback');
  same(play.track, readback.track, 'Play track');
  same(play.trackState, readback.trackState, 'Play track state');
  same(play.releaseName, readback.latestRelease, 'Play release name');
  same(play.deliveryState, readback.deliveryState, 'Play delivery state');
  same(play.track, 'internal-testing', 'Play track');
  same(play.trackState, 'active', 'Play track state');
  same(play.deliveryState, 'available-to-internal-testers', 'Play delivery state');
  for (const key of [
    'testerListUnchanged',
    'openTestingUnchanged',
    'closedTestingUnchanged',
    'productionUnchanged',
  ]) {
    same(play[key], true, `playInternal.${key}`);
  }

  const previous = object(value.previousOnePlusObservation, 'previousOnePlusObservation');
  const previousCandidate = object(previousOnePlus.candidate, 'previous OnePlus candidate');
  const previousDevice = object(previousOnePlus.device, 'previous OnePlus device');
  same(previous.versionName, previousCandidate.versionName, 'previous OnePlus versionName');
  same(previous.versionCode, previousCandidate.versionCode, 'previous OnePlus versionCode');
  same(previous.installerPackageName, previousDevice.installer, 'previous OnePlus installer');
  same(
    previous.playAppSigningCertificateMatched,
    previousDevice.playAppSigningCertificateMatched,
    'previous Play signing certificate observation',
  );
  if (!/^\d{10}$/u.test(previous.versionCode)
      || BigInt(previous.versionCode) >= BigInt(candidate.versionCode)) {
    fail('Previous OnePlus version must be a strictly older numeric build.');
  }
  same(previous.installerPackageName, 'com.android.vending', 'previous OnePlus installer');
  falseValue(previous.currentCandidateInstalled, 'previous currentCandidateInstalled');

  const execution = object(value.execution, 'execution');
  if (JSON.stringify(execution.allowedAdbTransports) !== JSON.stringify(['usb', 'wireless-adb'])) {
    fail('WP60 must allow only explicit USB or Wireless ADB transport.');
  }
  same(execution.updateMechanism, 'google-play-only', 'execution.updateMechanism');
  for (const key of [
    'directApkReplacementAllowed',
    'uninstallAllowed',
    'appDataResetAllowed',
    'downgradeAllowed',
    'passcodeEntryAllowed',
    'accountContentInspectionAllowed',
  ]) falseValue(execution[key], `execution.${key}`);

  for (const [key, entry] of Object.entries(object(value.boundaries, 'boundaries'))) {
    falseValue(entry, `boundaries.${key}`);
  }

  return Object.freeze({
    applicationId: candidate.applicationId,
    versionName: candidate.versionName,
    versionCode: candidate.versionCode,
    minSdk: candidate.minSdkVersion,
    targetSdk: candidate.targetSdkVersion,
    artifactSourceHead: candidate.artifactSourceHead,
    aabSha256: candidate.aabSha256,
    previousVersionCode: previous.versionCode,
    allowedAdbTransports: Object.freeze([...execution.allowedAdbTransports]),
    updateMechanism: execution.updateMechanism,
  });
}

function run() {
  process.stdout.write(`${JSON.stringify(validateWp60OnePlusCurrentCandidate(), null, 2)}\n`);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP60 OnePlus validation failed.'}\n`);
    process.exitCode = 1;
  }
}
