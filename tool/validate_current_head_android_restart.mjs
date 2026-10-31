#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validateCurrentHeadAndroidCandidate,
} from './validate_current_head_android_candidate.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const restartEvidencePath =
  'docs/evidence/external-gates/current-head-android-restart-2026082301.json';
const candidateEvidencePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';

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

export function validateCurrentHeadAndroidRestart({
  root = defaultRoot,
  evidence = undefined,
  candidateEvidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, restartEvidencePath), 'utf8'));
  const candidateRecord = candidateEvidence
    ?? JSON.parse(readFileSync(resolve(root, candidateEvidencePath), 'utf8'));
  const candidateResult = validateCurrentHeadAndroidCandidate({
    root,
    evidence: candidateRecord,
    checkGitCommit,
  });
  if (value.schemaVersion !== 1
      || value.kind !== 'android-current-head-process-restart-diagnostic'
      || value.status !== 'passed-bounded-process-restart-diagnostic'
      || value.capturedAt !== '2026-08-23T10:46:59.957Z') {
    fail('PF7 current-head Android restart evidence identity is invalid.');
  }
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    bundleId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: candidateResult.buildNumber,
    commit: candidateResult.candidateCommit,
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    paymentMode: 'memory',
    stripeLivemode: false,
    apkSha256: candidateRecord.androidCandidate.apkSha256,
  })) {
    fail('PF7 restart evidence does not match the PF6 candidate.');
  }
  if (!exact(value.device, {
    platform: 'android',
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '16',
    apiLevel: 36,
    securityPatch: '2026-04-05',
    containsRawDeviceIdentifier: false,
  })) {
    fail('PF7 restart evidence device summary is invalid.');
  }
  if (!exact(value.tests, {
    exactInstalledCandidate: { status: 'passed', result: 'version-and-apk-hash-match' },
    processAbsentAfterForceStop: { status: 'passed', result: 'no-running-process' },
    launcherProcessRestarted: { status: 'passed', result: 'running-after-launcher-event' },
    installIdentityPreserved: { status: 'passed', result: 'first-install-time-unchanged' },
    dataContainerIdentityPreserved: { status: 'passed', result: 'ce-data-inode-unchanged' },
  })) {
    fail('PF7 bounded restart checks are incomplete or overstated.');
  }
  const expectedBoundaryKeys = [
    'fullPilotScenarioA14Passed',
    'authenticatedSessionClaimed',
    'pendingSubmissionTested',
    'serverReconciliationTested',
    'storeInstallationGateSatisfied',
    'screenshotsCaptured',
    'uiHierarchyCaptured',
    'accountContentInspected',
    'userDataReset',
    'appUninstalled',
    'networkChanged',
    'containsSecrets',
    'containsRawDeviceIdentifiers',
    'containsProcessIdentifiers',
    'containsPersonalAccountData',
    'realMoneyUsed',
    'productionChanged',
    'storeChanged',
  ];
  if (!exact(Object.keys(value.boundaries ?? {}), expectedBoundaryKeys)
      || !allFalse(value.boundaries)) {
    fail('PF7 restart boundaries must remain exact and fail-closed.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|\bpid\b|@/iu.test(serialized)) {
    fail('PF7 restart evidence contains a private path, identifier or account datum.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: value.candidate.buildNumber,
    exactCandidate: true,
    processRestart: true,
    dataContainerIdentityPreserved: true,
    fullPilotScenarioA14Passed: false,
    stageAReady: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF7 CI metadata-only mode is restricted to CI.');
    }
    const result = validateCurrentHeadAndroidRestart({ checkGitCommit: !ciMetadataOnly });
    process.stdout.write(
      `PF7 current-head Android restart valid: build=${result.buildNumber}, `
      + `processRestart=${result.processRestart}, `
      + `fullA14=${result.fullPilotScenarioA14Passed}, stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF7 current-head Android restart validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
