#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validateCurrentHeadAndroidCandidate,
} from './validate_current_head_android_candidate.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-head-android-large-text-main-navigation-2026082301.json';
const candidateEvidencePath =
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateCurrentHeadAndroidLargeTextMainNavigation({
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
      || value.kind !== 'android-current-head-authenticated-large-text-main-navigation-diagnostic'
      || value.status !== 'passed-bounded-authenticated-large-text-main-navigation-diagnostic'
      || value.capturedAt !== '2026-08-23T12:45:43.829Z') {
    fail('PF13 current-head Android large-text evidence identity is invalid.');
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
    fail('PF13 large-text evidence does not match the PF6 candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: candidateResult.buildNumber,
    delivery: 'direct-apk',
    apkSha256: candidateRecord.androidCandidate.apkSha256,
  })) {
    fail('PF13 installed package binding is invalid or overstates Store delivery.');
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
    fail('PF13 current physical-device summary is invalid.');
  }
  if (!exact(value.configuration, {
    previousFontScale: 0.85,
    targetFontScale: 2,
    fontScaleAtLeast200PercentDuringDiagnostic: true,
    restoredFontScale: 0.85,
    exactPreviousFontScaleRestored: true,
  })) {
    fail('PF13 font-scale application or exact restoration is invalid.');
  }
  const passedSurface = {
    status: 'passed',
    result: 'authenticated-read-only-surface-reachable-at-200-percent-text',
  };
  if (!exact(value.tests, {
    Entdecken: passedSurface,
    Mietkorb: passedSurface,
    Buchungen: passedSurface,
    Nachrichten: passedSurface,
    'Mein SIT': passedSurface,
  })) {
    fail('PF13 large-text main-navigation checks are incomplete or overstated.');
  }
  if (!exact(value.boundaries, {
    directDiagnosticOnly: true,
    storeInstallationGateSatisfied: false,
    authenticatedMainNavigationAtLargeTextPassed: true,
    manualVisualLargeTextReviewPassed: false,
    manualTalkBackTraversalPassed: false,
    talkBackSettingModified: false,
    screenshotCaptured: false,
    bookingFlowPassed: false,
    messageSent: false,
    cartMutationPerformed: false,
    accountMutationPerformed: false,
    loginPerformed: false,
    logoutPerformed: false,
    accountIdentityRecorded: false,
    lockCodeUsed: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  })) {
    fail('PF13 large-text boundaries must remain exact and fail-closed.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|token|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF13 evidence contains a private path, account or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: value.candidate.buildNumber,
    exactCandidate: true,
    targetFontScale: value.configuration.targetFontScale,
    exactPreviousFontScaleRestored: true,
    authenticatedMainNavigationAtLargeTextPassed: true,
    destinationCount: Object.keys(value.tests).length,
    manualVisualLargeTextReviewPassed: false,
    manualTalkBackTraversalPassed: false,
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
      fail('PF13 CI metadata-only mode is restricted to CI.');
    }
    const result = validateCurrentHeadAndroidLargeTextMainNavigation({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF13 current-head Android large-text main navigation valid: `
      + `build=${result.buildNumber}, targetScale=${result.targetFontScale}, `
      + `destinations=${result.destinationCount}, `
      + `restored=${result.exactPreviousFontScaleRestored}, `
      + `visualReview=${result.manualVisualLargeTextReviewPassed}, `
      + `talkBack=${result.manualTalkBackTraversalPassed}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF13 current-head Android large-text validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
