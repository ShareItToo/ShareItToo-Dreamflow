#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validateCurrentHeadAndroidCandidate,
} from './validate_current_head_android_candidate.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-head-android-authenticated-session-2026082301.json';
const candidateEvidencePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateCurrentHeadAndroidAuthenticatedSession({
  root = defaultRoot,
  evidence = undefined,
  candidateEvidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  const candidateRecord = candidateEvidence
    ?? JSON.parse(readFileSync(resolve(root, candidateEvidencePath), 'utf8'));
  const candidateResult = validateCurrentHeadAndroidCandidate({
    root,
    evidence: candidateRecord,
    checkGitCommit,
  });
  if (value.schemaVersion !== 1
      || value.kind !== 'android-authenticated-session-diagnostic'
      || value.status !== 'passed-bounded-authenticated-session-diagnostic'
      || value.capturedAt !== '2026-08-23T11:03:28.862Z') {
    fail('PF8 current-head authenticated-session evidence identity is invalid.');
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
  })) {
    fail('PF8 session evidence does not match the PF6 candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: candidateResult.buildNumber,
    delivery: 'direct-apk',
    apkSha256: candidateRecord.androidCandidate.apkSha256,
  })) {
    fail('PF8 installed package binding is invalid or overstates Store delivery.');
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
    fail('PF8 device summary is invalid.');
  }
  if (!exact(value.tests, {
    authenticatedProfileAccess: {
      status: 'passed',
      result: 'authenticated-actions-present',
    },
    coldStartSessionRestore: {
      status: 'passed',
      result: 'authenticated-profile-restored-after-force-stop',
    },
  })) {
    fail('PF8 bounded session checks are incomplete or overstated.');
  }
  if (!exact(value.boundaries, {
    directDiagnosticOnly: true,
    storeInstallationGateSatisfied: false,
    syntheticRoleMatrixPassed: false,
    bookingFlowPassed: false,
    authenticatedDeepLinksPassed: false,
    realPushPassed: false,
    manualTalkBackTraversalPassed: false,
    lockCodeUsed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  })) {
    fail('PF8 session boundaries must remain exact and fail-closed.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|token/iu.test(serialized)) {
    fail('PF8 evidence contains a private path, identifier or credential datum.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: value.candidate.buildNumber,
    exactCandidate: true,
    directDiagnosticOnly: true,
    authenticatedColdStart: true,
    bookingFlowPassed: false,
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
      fail('PF8 CI metadata-only mode is restricted to CI.');
    }
    const result = validateCurrentHeadAndroidAuthenticatedSession({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF8 current-head authenticated session valid: build=${result.buildNumber}, `
      + `coldStart=${result.authenticatedColdStart}, `
      + `booking=${result.bookingFlowPassed}, fullA14=${result.fullPilotScenarioA14Passed}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF8 current-head authenticated-session validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
