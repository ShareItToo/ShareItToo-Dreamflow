#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultPlanPath = 'store/google-play/rw20b-oneplus-remote-test-plan.json';
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

function assertSanitized(value, path = 'plan') {
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

const expectedParity = {
  R1_INSTALL_IDENTITY: {
    transfer: 'PREPARED_AFTER_RELEASE',
    deviceMutation: false,
    blockers: ['release-gate', 'play-update', 'wireless-pairing'],
    excluded: [],
  },
  R4_LIFECYCLE_CORE: {
    transfer: 'PARTIAL_OWNER_WINDOW',
    deviceMutation: true,
    blockers: ['identity-preflight', 'owner-present'],
    excluded: ['global-orientation-change', 'private-deep-link'],
  },
  R5_REPEATED_STABILITY: {
    transfer: 'PARTIAL_OWNER_WINDOW',
    deviceMutation: true,
    blockers: ['identity-preflight', 'owner-present', 'battery-window'],
    excluded: ['raw-logcat', 'unbounded-cycles'],
  },
  AUTHENTICATED_NAVIGATION: {
    transfer: 'BLOCKED_TEST_SESSION',
    deviceMutation: true,
    blockers: ['synthetic-test-account', 'owner-login', 'account-isolation-preflight'],
    excluded: ['credential-automation'],
  },
  LARGE_TEXT_ACCESSIBILITY: {
    transfer: 'MANUAL_PERSONAL_DEVICE',
    deviceMutation: true,
    blockers: ['owner-present', 'settings-restore-proof'],
    excluded: ['unattended-global-setting-change'],
  },
  NETWORK_TRANSITIONS: {
    transfer: 'MANUAL_ONLY',
    deviceMutation: true,
    blockers: ['wireless-adb-disconnects', 'owner-present'],
    excluded: ['remote-wlan-disable'],
  },
  CLEAN_INSTALL: {
    transfer: 'NOT_AUTHORIZED_PERSONAL_DEVICE',
    deviceMutation: true,
    blockers: ['data-loss-gate'],
    excluded: ['uninstall', 'pm-clear', 'sideload'],
  },
};

export function validateRw20bOnePlusRemoteTestPlan({
  root = defaultRoot,
  plan = readJson(root, defaultPlanPath, 'RW20B plan'),
} = {}) {
  assertSanitized(plan);
  same(plan.schemaVersion, 1, 'schemaVersion');
  same(plan.kind, 'rw20b-oneplus-play-internal-remote-test-plan', 'kind');
  same(plan.status, 'prepared-not-run-release-and-device-gated', 'status');

  const manifest = readJson(root, plan.candidateManifestRef, 'candidate manifest');
  const handoff = readJson(root, plan.predecessorHandoffRef, 'predecessor handoff');
  const candidate = object(plan.candidate, 'candidate');
  for (const [key, expected] of Object.entries({
    applicationId: manifest.candidate?.applicationId,
    versionName: manifest.candidate?.versionName,
    versionCode: manifest.candidate?.versionCode,
    artifactSourceHead: manifest.provenance?.artifactSourceHead,
    aabSha256: manifest.artifact?.aabSha256,
    minSdk: manifest.candidate?.minSdkVersion,
    targetSdk: manifest.candidate?.targetSdkVersion,
  })) same(candidate[key], expected, `candidate.${key}`);

  const truth = object(plan.currentTruth, 'currentTruth');
  same(truth.draftUploaded, handoff.playState?.draftSaved, 'currentTruth.draftUploaded');
  same(truth.releaseGate, handoff.gates?.GOOGLE_PLAY_INTERNAL_RELEASE_GO,
    'currentTruth.releaseGate');
  same(truth.releaseActivated, handoff.playState?.releaseActivated,
    'currentTruth.releaseActivated');
  same(truth.expectedCurrentOnePlusVersionCode,
    handoff.secondAndroid?.expectedInstalledVersionCode,
    'currentTruth.expectedCurrentOnePlusVersionCode');
  for (const key of [
    'candidateInstalledOnOnePlus',
    'candidatePreflightPerformed',
    'functionalMatrixPerformed',
  ]) same(truth[key], false, `currentTruth.${key}`);

  const remote = object(plan.remoteExecution, 'remoteExecution');
  same(remote.hostClass, 'owner-macbook', 'remoteExecution.hostClass');
  same(remote.transport, 'wireless-adb-manual-pairing', 'remoteExecution.transport');
  same(remote.preflightCommand,
    'node tool/preflight_oneplus_play_internal_candidate.mjs --confirm-release-go GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'remoteExecution.preflightCommand');
  for (const key of [
    'automaticExecutionStarted',
    'macMiniDirectDeviceAccess',
    'credentialsAutomated',
    'privatePhoneControlWithoutOwner',
  ]) same(remote[key], false, `remoteExecution.${key}`);

  if (!Array.isArray(plan.pixelParityInventory)
      || plan.pixelParityInventory.length !== Object.keys(expectedParity).length) {
    fail('pixelParityInventory must contain the exact bounded inventory.');
  }
  const observedIds = new Set();
  for (const entry of plan.pixelParityInventory) {
    const expected = expectedParity[entry?.id];
    if (expected === undefined || observedIds.has(entry.id)) {
      fail('pixelParityInventory contains an unknown or duplicate item.');
    }
    observedIds.add(entry.id);
    same(entry.transfer, expected.transfer, `${entry.id}.transfer`);
    same(entry.result, 'NOT_RUN', `${entry.id}.result`);
    same(entry.deviceMutation, expected.deviceMutation, `${entry.id}.deviceMutation`);
    sameArray(entry.blockers, expected.blockers, `${entry.id}.blockers`);
    sameArray(entry.excluded, expected.excluded, `${entry.id}.excluded`);
  }

  sameArray(plan.executionOrder, [
    'OWNER_RELEASE_GATE',
    'PLAY_UPDATE',
    'READ_ONLY_PREFLIGHT',
    'NONDESTRUCTIVE_OWNER_MATRIX',
    'SYNTHETIC_AUTH_MATRIX',
    'MANUAL_NETWORK_MATRIX',
  ], 'executionOrder');
  const boundaries = object(plan.boundaries, 'boundaries');
  if (!Object.values(boundaries).every((value) => value === false)) {
    fail('RW20B boundaries must all remain false before execution.');
  }

  const verification = object(plan.verification, 'verification');
  same(verification.implementationHead,
    'fd874bb9584ee3445047c0c7a300754905cb7c3a',
    'verification.implementationHead');
  same(verification.rw20bFocusedTestsPassed, 8,
    'verification.rw20bFocusedTestsPassed');
  same(verification.combinedPredecessorAndRw20bTestsPassed, 17,
    'verification.combinedPredecessorAndRw20bTestsPassed');
  same(verification.localTechnicalRegression,
    'passed-standard-parallelism-no-workaround',
    'verification.localTechnicalRegression');
  for (const [key, expectedRunId] of [
    ['githubRegression', 33026839775],
    ['githubCodeql', 33026839780],
  ]) {
    const run = object(verification[key], `verification.${key}`);
    same(run.runId, expectedRunId, `verification.${key}.runId`);
    same(run.headSha, verification.implementationHead,
      `verification.${key}.headSha`);
    same(run.conclusion, 'success', `verification.${key}.conclusion`);
  }
  same(verification.githubRegression.publishApiImage, 'skipped',
    'verification.githubRegression.publishApiImage');
  same(verification.openCodeScanningAlerts, 0,
    'verification.openCodeScanningAlerts');
  same(verification.workaroundIntroduced, false,
    'verification.workaroundIntroduced');

  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsOptInUrl',
    'containsRawDeviceIdentifier',
    'containsNetworkAddress',
  ]) same(plan[key], false, key);

  same(plan.testMatrixRef,
    'docs/templates/RW20_CURRENT_PLAY_INTERNAL_SECOND_ANDROID_TEST_MATRIX.md',
    'testMatrixRef');
  same(plan.operationRef,
    'docs/operations/RW20B_ONEPLUS_REMOTE_TEST_PARITY_PLAN_2026-08-27.md',
    'operationRef');

  return {
    status: plan.status,
    candidateVersionCode: candidate.versionCode,
    parityItemCount: plan.pixelParityInventory.length,
    runnableNow: false,
    nextRequired: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    implementationHead: verification.implementationHead,
    openCodeScanningAlerts: verification.openCodeScanningAlerts,
  };
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(validateRw20bOnePlusRemoteTestPlan(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'RW20B plan validation failed.'}\n`);
    process.exitCode = 1;
  }
}
