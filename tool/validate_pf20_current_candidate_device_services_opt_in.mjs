#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validatePf19CurrentCandidateTalkBackPreflight,
} from './validate_pf19_current_candidate_talkback_preflight.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-candidate-firebase-device-services-opt-in-2026082302.json';
const pf19EvidencePath =
  'docs/evidence/external-gates/current-candidate-talkback-preflight-2026082302.json';
const pf17EvidencePath =
  'docs/evidence/external-gates/current-candidate-authenticated-safe-links-2026082302.json';
const pf16EvidencePath =
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json';
const pf14bEvidencePath =
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json';
const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';
const expectedApkSha256 =
  'cae44832e76e7d4c7939ae0c6e14dbc63bbfd0ea481c037aa626036c278e9e1e';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function readJson(repositoryRoot, path) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

export function validatePf20CurrentCandidateDeviceServicesOptIn({
  repositoryRoot = root,
  evidence,
  pf19Evidence,
  pf17Evidence,
  pf16Evidence,
  pf14bEvidence,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? readJson(repositoryRoot, evidencePath);
  const pf19 = validatePf19CurrentCandidateTalkBackPreflight({
    repositoryRoot,
    evidence: pf19Evidence ?? readJson(repositoryRoot, pf19EvidencePath),
    pf17Evidence: pf17Evidence ?? readJson(repositoryRoot, pf17EvidencePath),
    pf16Evidence: pf16Evidence ?? readJson(repositoryRoot, pf16EvidencePath),
    pf14bEvidence: pf14bEvidence ?? readJson(repositoryRoot, pf14bEvidencePath),
    checkGitCommit,
  });
  if (pf19.buildNumber !== expectedBuildNumber
      || pf19.exactInstalledApkVerified !== true
      || pf19.exactConfigurationRestored !== true
      || pf19.stageAReady !== false) {
    fail('PF20 requires the exact restored fail-closed PF19 candidate baseline.');
  }
  if (value.schemaVersion !== 1
      || value.kind !== 'android-current-candidate-firebase-device-services-opt-in-preflight'
      || value.status !== 'passed-bounded-default-off-device-services-preflight'
      || value.capturedAt !== '2026-08-23T17:31:33.057Z') {
    fail('PF20 Firebase device-services preflight identity is invalid.');
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
    fail('PF20 is not bound to the exact current candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    delivery: 'direct-apk',
    apkSha256: expectedApkSha256,
  })) {
    fail('PF20 installed package binding is invalid or overstates Store delivery.');
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
    fail('PF20 sanitized physical-device summary is invalid.');
  }
  if (!exact(value.controls, {
    notificationSettingsSurfacePresent: true,
    serviceSectionPresent: true,
    independentSwitchCount: 2,
    pushControlPresent: true,
    pushEnabled: false,
    crashDiagnosticsControlPresent: true,
    crashDiagnosticsEnabled: false,
    exactSecondObservationUnchanged: true,
    consentDialogOpened: false,
    exploreSurfaceRestored: true,
  })) {
    fail('PF20 must retain the exact independent default-off control truth.');
  }
  if (!exact(value.boundaries, {
    directDiagnosticOnly: true,
    defaultOffControlsObserved: true,
    externalServiceConsentChanged: false,
    pushActivationAttempted: false,
    crashDiagnosticsActivationAttempted: false,
    controlledCrashDiagnosticTriggered: false,
    optInDependentRegistrationOrReportRequested: false,
    realPushPassed: false,
    firebaseOwnerGateSatisfied: false,
    storeInstallationGateSatisfied: false,
    accountMutationPerformed: false,
    loginPerformed: false,
    logoutPerformed: false,
    screenshotCaptured: false,
    rawHierarchyRetained: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  })) {
    fail('PF20 boundaries are incomplete or overstate Firebase, Push or Store readiness.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|secret=|token=|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF20 evidence contains a private path, account, device or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: expectedBuildNumber,
    candidateCommit: expectedCommit,
    exactInstalledApkVerified: true,
    independentSwitchCount: 2,
    pushControlPresent: true,
    pushEnabled: false,
    crashDiagnosticsControlPresent: true,
    crashDiagnosticsEnabled: false,
    consentChanged: false,
    controlledCrashDiagnosticTriggered: false,
    optInDependentRegistrationOrReportRequested: false,
    exploreSurfaceRestored: true,
    firebaseOwnerGateSatisfied: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF20 CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf20CurrentCandidateDeviceServicesOptIn({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF20 device-services preflight valid: build=${result.buildNumber}, `
      + `switches=${result.independentSwitchCount}, push=${result.pushEnabled}, `
      + `crash=${result.crashDiagnosticsEnabled}, consentChanged=${result.consentChanged}, `
      + `firebaseOwnerReady=${result.firebaseOwnerGateSatisfied}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF20 Firebase device-services preflight validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
