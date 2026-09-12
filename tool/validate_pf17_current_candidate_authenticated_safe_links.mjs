#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validatePf16CurrentCandidateReadOnly,
} from './validate_pf16_current_candidate_read_only.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-candidate-authenticated-safe-links-2026082302.json';
const pf16EvidencePath =
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json';
const pf14bEvidencePath =
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json';
const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';
const expectedApkSha256 = 'cae44832e76e7d4c7939ae0c6e14dbc63bbfd0ea481c037aa626036c278e9e1e';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validatePf17CurrentCandidateAuthenticatedSafeLinks({
  root = defaultRoot,
  evidence = undefined,
  pf16Evidence = undefined,
  pf14bEvidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  const pf16 = validatePf16CurrentCandidateReadOnly({
    root,
    evidence: pf16Evidence ?? JSON.parse(readFileSync(
      resolve(root, pf16EvidencePath),
      'utf8',
    )),
    pf14bEvidence: pf14bEvidence ?? JSON.parse(readFileSync(
      resolve(root, pf14bEvidencePath),
      'utf8',
    )),
    checkGitCommit,
  });
  if (pf16.buildNumber !== expectedBuildNumber
      || pf16.candidateCommit !== expectedCommit
      || pf16.privateArchiveVerified !== true
      || pf16.exactInstalledApkVerified !== true
      || pf16.stageAReady !== false) {
    fail('PF17 requires the exact fail-closed PF16 candidate evidence.');
  }
  if (value.schemaVersion !== 1
      || value.kind !== 'android-authenticated-safe-app-link-diagnostic'
      || value.status !== 'passed-bounded-authenticated-safe-app-link-diagnostic'
      || value.capturedAt !== '2026-08-23T15:32:40.096Z') {
    fail('PF17 current-candidate authenticated safe-link evidence identity is invalid.');
  }
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    bundleId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    commit: expectedCommit,
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    paymentMode: 'memory',
    stripeLivemode: false,
  })) {
    fail('PF17 safe-link evidence is not bound to the exact current candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    delivery: 'direct-apk',
    apkSha256: expectedApkSha256,
  })) {
    fail('PF17 installed package binding is invalid or overstates Store delivery.');
  }
  if (!exact(value.device, {
    platform: 'android',
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  })) {
    fail('PF17 sanitized physical-device summary is invalid.');
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
    fail('PF17 authenticated safe-link checks are incomplete or overstated.');
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
    fail('PF17 Store, fixture, mutation and private-data boundaries must remain fail-closed.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|token|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF17 evidence contains a private path, account, device or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: expectedBuildNumber,
    candidateCommit: expectedCommit,
    exactInstalledApkVerified: true,
    authenticatedSafeLinksPassed: true,
    authenticatedSessionPreserved: true,
    authenticatedFixtureLinksPassed: false,
    bookingFlowPassed: false,
    realPushPassed: false,
    fullDeviceMatrixPassed: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF17 CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf17CurrentCandidateAuthenticatedSafeLinks({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF17 current-candidate authenticated safe links valid: `
      + `build=${result.buildNumber}, safeLinks=${result.authenticatedSafeLinksPassed}, `
      + `sessionPreserved=${result.authenticatedSessionPreserved}, `
      + `fixtureLinks=${result.authenticatedFixtureLinksPassed}, `
      + `booking=${result.bookingFlowPassed}, push=${result.realPushPassed}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF17 current-candidate authenticated safe-link validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
