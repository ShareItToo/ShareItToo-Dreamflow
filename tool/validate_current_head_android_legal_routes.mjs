#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validateCurrentHeadAndroidCandidate,
} from './validate_current_head_android_candidate.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-head-android-legal-routes-2026082301.json';
const candidateEvidencePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateCurrentHeadAndroidLegalRoutes({
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
      || value.kind !== 'android-current-head-authenticated-legal-route-diagnostic'
      || value.status !== 'passed-bounded-authenticated-legal-route-diagnostic'
      || value.capturedAt !== '2026-08-23T12:14:29.442Z') {
    fail('PF12 current-head Android legal-route evidence identity is invalid.');
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
    fail('PF12 legal-route evidence does not match the PF6 candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: candidateResult.buildNumber,
    delivery: 'direct-apk',
    apkSha256: candidateRecord.androidCandidate.apkSha256,
  })) {
    fail('PF12 installed package binding is invalid or overstates Store delivery.');
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
    fail('PF12 device summary is invalid.');
  }
  const passedDocument = {
    status: 'passed',
    result: 'read-only-document-reachable',
  };
  if (!exact(value.tests, {
    Impressum: passedDocument,
    Datenschutz: passedDocument,
    AGB: passedDocument,
    'Community‑Regeln': passedDocument,
    'Gebühren & Zahlungsbedingungen': passedDocument,
    Stornierungsbedingungen: passedDocument,
    Haftungsausschluss: passedDocument,
  })) {
    fail('PF12 read-only legal-route checks are incomplete or overstated.');
  }
  if (!exact(value.boundaries, {
    directDiagnosticOnly: true,
    storeInstallationGateSatisfied: false,
    authenticatedLegalRoutesPassed: true,
    professionalLegalApprovalPassed: false,
    platformWithdrawalOpened: false,
    platformWithdrawalSubmitted: false,
    supportSubmitted: false,
    contactActionPerformed: false,
    accountMutationPerformed: false,
    loginPerformed: false,
    logoutPerformed: false,
    accountIdentityRecorded: false,
    lockCodeUsed: false,
    containsLegalContactValues: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  })) {
    fail('PF12 legal-route boundaries must remain exact and fail-closed.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|token|ssid|bssid|ipAddress|telephone|phoneNumber/iu.test(serialized)) {
    fail('PF12 evidence contains a private path, contact, account or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: value.candidate.buildNumber,
    exactCandidate: true,
    authenticatedLegalRoutesPassed: true,
    documentCount: Object.keys(value.tests).length,
    professionalLegalApprovalPassed: false,
    platformWithdrawalOpened: false,
    stateMutationPerformed: false,
    stageAReady: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF12 CI metadata-only mode is restricted to CI.');
    }
    const result = validateCurrentHeadAndroidLegalRoutes({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF12 current-head Android legal routes valid: build=${result.buildNumber}, `
      + `documents=${result.documentCount}, `
      + `legalApproval=${result.professionalLegalApprovalPassed}, `
      + `withdrawalOpened=${result.platformWithdrawalOpened}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF12 current-head Android legal-route validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
