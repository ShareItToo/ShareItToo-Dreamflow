#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultReadinessPath = 'store/google-play/rw20c-oneplus-owner-smoke-readiness.json';
const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/iu;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} has drifted.`);
}

function sameArray(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has drifted.`);
  }
}

function assertSanitized(value, path = 'readiness') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key)) fail(`${path}.${key} is credential-shaped.`);
      assertSanitized(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) {
    fail(`${path} contains an email address.`);
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('http://') || normalized.includes('https://')) {
    fail(`${path} contains a URL.`);
  }
  if (/(?:^|\s)\/Users\/|[A-Z]:\\/u.test(value)) {
    fail(`${path} contains a private filesystem path.`);
  }
  if (/(?:^|\s)(?:\d{1,3}\.){3}\d{1,3}:\d+(?:\s|$)/u.test(value)) {
    fail(`${path} contains a network address.`);
  }
}

function readJson(root, reference, label) {
  if (typeof reference !== 'string'
      || !/^[a-zA-Z0-9_./-]+\.json$/u.test(reference)
      || reference.includes('..')) {
    fail(`${label} is not a safe repository JSON reference.`);
  }
  try {
    return JSON.parse(readFileSync(resolve(root, reference), 'utf8'));
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
}

const expectedChecks = Object.freeze([
  'EXACT_PLAY_CANDIDATE',
  'PHONE_ALREADY_UNLOCKED',
  'BOUNDED_FORCE_STOP_PROCESS_ABSENCE',
  'COLD_START_FOREGROUND',
  'WARM_START_SAME_PROCESS',
  'BACKGROUND_FOREGROUND_SAME_PROCESS',
  'INSTALL_AND_APP_DATA_IDENTITY_PRESERVED',
]);
const expectedExclusions = Object.freeze([
  'aab-byte-equivalence-claim',
  'play-app-signing-certificate-verification',
  'screen-or-authenticated-behavior-claim',
  'ui-hierarchy-capture',
  'screenshot',
  'logcat',
  'tap-or-text-injection',
  'network-change',
  'permission-change',
  'global-setting-change',
  'install-update-uninstall-or-data-reset',
  'account-login-or-credential-automation',
  'repeated-stability-certification',
  'clean-install',
]);

export function validateRw20cOnePlusOwnerSmokeReadiness({
  root = defaultRoot,
  readiness = readJson(root, defaultReadinessPath, 'RW20C readiness'),
} = {}) {
  assertSanitized(readiness);
  same(readiness.schemaVersion, 1, 'schemaVersion');
  same(readiness.kind, 'rw20c-oneplus-play-internal-owner-smoke-readiness', 'kind');
  same(readiness.status, 'prepared-not-run-owner-and-release-gated', 'status');

  const manifest = readJson(root, readiness.candidateManifestRef, 'candidate manifest');
  const predecessor = readJson(root, readiness.predecessorPlanRef, 'predecessor plan');
  same(predecessor.status, 'prepared-not-run-release-and-device-gated',
    'predecessor status');
  const candidate = object(readiness.candidate, 'candidate');
  for (const [key, expected] of Object.entries({
    applicationId: manifest.candidate?.applicationId,
    versionName: manifest.candidate?.versionName,
    versionCode: manifest.candidate?.versionCode,
    artifactSourceHead: manifest.provenance?.artifactSourceHead,
    aabSha256: manifest.artifact?.aabSha256,
    minSdk: manifest.candidate?.minSdkVersion,
    targetSdk: manifest.candidate?.targetSdkVersion,
  })) same(candidate[key], expected, `candidate.${key}`);
  same(candidate.delivery, 'google-play-internal', 'candidate.delivery');

  const truth = object(readiness.currentTruth, 'currentTruth');
  for (const key of ['releaseGate', 'ownerWindowGate']) {
    same(truth[key], 'not-granted', `currentTruth.${key}`);
  }
  for (const key of [
    'candidateExpectedInstalledOnOnePlus',
    'wirelessPairingPerformed',
    'smokeExecutionPerformed',
  ]) same(truth[key], false, `currentTruth.${key}`);
  same(truth.smokeResult, 'NOT_RUN', 'currentTruth.smokeResult');

  const authorization = object(readiness.authorization, 'authorization');
  same(authorization.bothExactGatesRequiredBeforeFirstAdbQuery, true,
    'authorization.bothExactGatesRequiredBeforeFirstAdbQuery');
  same(authorization.releaseGateLiteral, 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'authorization.releaseGateLiteral');
  same(authorization.ownerWindowGateLiteral,
    'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
    'authorization.ownerWindowGateLiteral');
  same(authorization.confirmationValuesRecorded, false,
    'authorization.confirmationValuesRecorded');
  same(authorization.futureCommand,
    'node tool/run_oneplus_play_internal_owner_smoke.mjs --confirm-release-go GOOGLE_PLAY_INTERNAL_RELEASE_GO --confirm-owner-window ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
    'authorization.futureCommand');

  if (!Array.isArray(readiness.preparedChecks)
      || readiness.preparedChecks.length !== expectedChecks.length) {
    fail('preparedChecks must contain the exact bounded check inventory.');
  }
  sameArray(readiness.preparedChecks.map((entry) => entry?.id),
    expectedChecks, 'preparedChecks ids');
  for (const entry of readiness.preparedChecks) {
    same(entry.result, 'NOT_RUN', `${entry.id}.result`);
  }
  sameArray(readiness.explicitExclusions, expectedExclusions, 'explicitExclusions');

  const boundaries = object(readiness.boundaries, 'boundaries');
  if (!Object.values(boundaries).every((value) => value === false)) {
    fail('RW20C boundaries must all remain false before real execution.');
  }

  const verification = object(readiness.verification, 'verification');
  if (verification.state === 'pending-exact-sha') {
    same(verification.implementationHead, null, 'verification.implementationHead');
    same(verification.localTechnicalRegression, 'pending',
      'verification.localTechnicalRegression');
    for (const key of ['githubRegression', 'githubCodeql', 'openCodeScanningAlerts']) {
      same(verification[key], null, `verification.${key}`);
    }
  } else if (verification.state === 'verified-exact-sha') {
    if (!/^[a-f0-9]{40}$/u.test(verification.implementationHead)) {
      fail('verification.implementationHead must be an exact commit SHA.');
    }
    same(verification.localTechnicalRegression,
      'passed-standard-parallelism-no-workaround',
      'verification.localTechnicalRegression');
    for (const key of ['githubRegression', 'githubCodeql']) {
      const run = object(verification[key], `verification.${key}`);
      if (!Number.isSafeInteger(run.runId) || run.runId <= 0) {
        fail(`verification.${key}.runId is invalid.`);
      }
      same(run.headSha, verification.implementationHead,
        `verification.${key}.headSha`);
      same(run.conclusion, 'success', `verification.${key}.conclusion`);
    }
    same(verification.githubRegression.publishApiImage, 'skipped',
      'verification.githubRegression.publishApiImage');
    same(verification.openCodeScanningAlerts, 0,
      'verification.openCodeScanningAlerts');
  } else {
    fail('verification.state is invalid.');
  }
  same(verification.workaroundIntroduced, false,
    'verification.workaroundIntroduced');

  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsOptInUrl',
    'containsRawDeviceIdentifier',
    'containsNetworkAddress',
  ]) same(readiness[key], false, key);
  same(readiness.operationRef,
    'docs/operations/RW20C_ONEPLUS_OWNER_WINDOW_SMOKE_READINESS_2026-08-27.md',
    'operationRef');

  return Object.freeze({
    status: readiness.status,
    candidateVersionCode: candidate.versionCode,
    preparedCheckCount: readiness.preparedChecks.length,
    runnableNow: false,
    nextRequired: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    executionResult: truth.smokeResult,
    verificationState: verification.state,
  });
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateRw20cOnePlusOwnerSmokeReadiness(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'RW20C readiness validation failed.'}\n`);
    process.exitCode = 1;
  }
}
