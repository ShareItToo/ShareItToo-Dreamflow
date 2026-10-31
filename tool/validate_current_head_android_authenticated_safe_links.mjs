#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validateCurrentHeadAndroidCandidate,
} from './validate_current_head_android_candidate.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-head-android-authenticated-safe-links-2026082301.json';
const candidateEvidencePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateCurrentHeadAndroidAuthenticatedSafeLinks({
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
      || value.kind !== 'android-authenticated-safe-app-link-diagnostic'
      || value.status !== 'passed-bounded-authenticated-safe-app-link-diagnostic'
      || value.capturedAt !== '2026-08-23T11:34:21.238Z') {
    fail('PF10 current-head authenticated safe-link evidence identity is invalid.');
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
    fail('PF10 safe-link evidence does not match the PF6 candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: candidateResult.buildNumber,
    delivery: 'direct-apk',
    apkSha256: candidateRecord.androidCandidate.apkSha256,
  })) {
    fail('PF10 installed package binding is invalid or overstates Store delivery.');
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
    fail('PF10 device summary is invalid.');
  }
  if (!exact(value.tests, {
    authenticatedNotificationsBefore: {
      status: 'passed',
      result: 'authenticated-read-only-surface',
    },
    verifiedHttpsMissingListing: {
      status: 'passed',
      result: 'safe-listing-unavailable-surface',
    },
    unsafeIdentifierRejected: {
      status: 'passed',
      result: 'authenticated-start-preserved',
    },
    foreignHostNotAssociated: {
      status: 'passed',
      result: 'shareittoo-package-absent',
    },
    authenticatedNotificationsAfter: {
      status: 'passed',
      result: 'authenticated-session-preserved',
    },
  })) {
    fail('PF10 authenticated safe-link checks are incomplete or overstated.');
  }
  if (!exact(value.boundaries, {
    directDiagnosticOnly: true,
    storeInstallationGateSatisfied: false,
    authenticatedSafeLinksPassed: true,
    authenticatedFixtureLinksPassed: false,
    manualFunctionalMatrixPassed: false,
    bookingFlowPassed: false,
    realPushPassed: false,
    loginPerformed: false,
    logoutPerformed: false,
    accountMutationPerformed: false,
    accountIdentityRecorded: false,
    lockCodeUsed: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  })) {
    fail('PF10 safe-link boundaries must remain exact and fail-closed.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|token|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF10 evidence contains a private path, account or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: value.candidate.buildNumber,
    exactCandidate: true,
    authenticatedSafeLinksPassed: true,
    authenticatedSessionPreserved: true,
    authenticatedFixtureLinksPassed: false,
    bookingFlowPassed: false,
    fullDeviceMatrixPassed: false,
    stageAReady: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF10 CI metadata-only mode is restricted to CI.');
    }
    const result = validateCurrentHeadAndroidAuthenticatedSafeLinks({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF10 current-head authenticated safe links valid: build=${result.buildNumber}, `
      + `safeLinks=${result.authenticatedSafeLinksPassed}, `
      + `sessionPreserved=${result.authenticatedSessionPreserved}, `
      + `fixtureLinks=${result.authenticatedFixtureLinksPassed}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF10 current-head authenticated safe-link validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
