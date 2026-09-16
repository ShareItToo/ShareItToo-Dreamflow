#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validatePf14bCurrentHeadAndroidTouchTarget,
} from './validate_pf14b_current_head_android_touch_target.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json';
const pf14bEvidencePath =
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json';
const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validatePf16CurrentCandidateReadOnly({
  root = defaultRoot,
  evidence = undefined,
  pf14bEvidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  const pf14b = validatePf14bCurrentHeadAndroidTouchTarget({
    root,
    evidence: pf14bEvidence ?? JSON.parse(readFileSync(
      resolve(root, pf14bEvidencePath),
      'utf8',
    )),
    checkGitCommit,
  });
  if (pf14b.buildNumber !== expectedBuildNumber
      || pf14b.candidateCommit !== expectedCommit
      || pf14b.privateArchiveVerified !== true
      || pf14b.dataPreservingDirectUpdate !== true
      || pf14b.stageAReady !== false) {
    fail('PF16 requires the exact fail-closed PF14B candidate evidence.');
  }
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-pf16-current-candidate-read-only-physical-regression'
      || value.status !== 'passed-current-candidate-read-only-physical-regression'
      || value.capturedAt !== '2026-08-23T14:57:31.422Z') {
    fail('PF16 current-candidate evidence identity is invalid.');
  }
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    commit: expectedCommit,
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    paymentMode: 'memory',
    stripeLivemode: false,
    privateArchiveVerified: true,
    exactInstalledApkVerified: true,
  })) {
    fail('PF16 candidate or installed APK binding is invalid.');
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
    fail('PF16 sanitized physical-device summary is invalid.');
  }
  if (!exact(value.checks, {
    processRestart: 'passed-data-identity-preserved',
    authenticatedColdStart: 'passed-two-cycles',
    offlineColdStartAndRecovery: 'passed-online-offline-online',
    mainNavigation: {
      status: 'passed',
      destinationCount: 5,
    },
    legalRoutes: {
      status: 'passed-technical-reachability-only',
      documentCount: 7,
    },
    largeTextMainNavigation: {
      status: 'passed-semantic-reachability-only',
      targetFontScale: 2,
      destinationCount: 5,
      previousFontScale: 0.85,
      restoredFontScale: 0.85,
      exactPreviousFontScaleRestored: true,
    },
  })) {
    fail('PF16 read-only checks or exact setting restoration are incomplete.');
  }
  if (!exact(value.releaseGate, {
    directInternalCandidate: true,
    googlePlayDistribution: false,
    manualVisualReview: false,
    manualTalkBackTraversal: false,
    completeDeviceMatrix: false,
    storeSubmissionAllowed: false,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
    stageAReady: false,
    decision: 'hold-no-go',
  })) {
    fail('PF16 release gate must remain non-Store and HOLD / NO-GO.');
  }
  if (!exact(value.boundaries, {
    loginPerformed: false,
    logoutPerformed: false,
    accountMutationPerformed: false,
    cartMutationPerformed: false,
    bookingFlowPassed: false,
    messageSent: false,
    supportSubmitted: false,
    withdrawalOpened: false,
    paymentChanged: false,
    productionChanged: false,
    storeChanged: false,
    cloudChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicReleasePerformed: false,
    realPushPassed: false,
    talkBackSettingModified: false,
    manualVisualReviewClaimed: false,
    manualTalkBackClaimed: false,
    screenshotCaptured: false,
    rawHierarchyRetained: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsPrivateFilesystemPaths: false,
    containsNetworkIdentifiers: false,
  })) {
    fail('PF16 mutation, live, manual-review and private-data boundaries must remain false.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|credential|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF16 evidence contains a private path, account, device or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: expectedBuildNumber,
    candidateCommit: expectedCommit,
    privateArchiveVerified: true,
    exactInstalledApkVerified: true,
    processRestartPassed: true,
    authenticatedColdStartCycleCount: 2,
    offlineRecoveryPassed: true,
    mainNavigationDestinationCount: 5,
    legalRouteCount: 7,
    largeTextDestinationCount: 5,
    exactPreviousFontScaleRestored: true,
    manualVisualReview: false,
    manualTalkBackTraversal: false,
    completeDeviceMatrix: false,
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
      fail('PF16 CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf16CurrentCandidateReadOnly({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF16 current-candidate read-only physical regression valid: `
      + `build=${result.buildNumber}, coldStarts=${result.authenticatedColdStartCycleCount}, `
      + `navigation=${result.mainNavigationDestinationCount}, `
      + `legal=${result.legalRouteCount}, offlineRecovery=${result.offlineRecoveryPassed}, `
      + `fontRestored=${result.exactPreviousFontScaleRestored}, `
      + `visualReview=${result.manualVisualReview}, `
      + `talkBack=${result.manualTalkBackTraversal}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF16 current-candidate read-only validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
