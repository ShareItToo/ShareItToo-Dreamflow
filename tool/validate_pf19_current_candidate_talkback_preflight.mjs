#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validatePf17CurrentCandidateAuthenticatedSafeLinks,
} from './validate_pf17_current_candidate_authenticated_safe_links.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
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

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function readJson(repositoryRoot, path) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

export function validatePf19CurrentCandidateTalkBackPreflight({
  repositoryRoot = root,
  evidence,
  pf17Evidence,
  pf16Evidence,
  pf14bEvidence,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? readJson(repositoryRoot, evidencePath);
  const pf17 = validatePf17CurrentCandidateAuthenticatedSafeLinks({
    root: repositoryRoot,
    evidence: pf17Evidence ?? readJson(repositoryRoot, pf17EvidencePath),
    pf16Evidence: pf16Evidence ?? readJson(repositoryRoot, pf16EvidencePath),
    pf14bEvidence: pf14bEvidence ?? readJson(repositoryRoot, pf14bEvidencePath),
    checkGitCommit,
  });
  if (pf17.buildNumber !== expectedBuildNumber
      || pf17.exactInstalledApkVerified !== true
      || pf17.authenticatedSessionPreserved !== true
      || pf17.stageAReady !== false) {
    fail('PF19 requires the exact fail-closed PF17 candidate baseline.');
  }
  if (value.schemaVersion !== 1
      || value.kind !== 'android-current-candidate-talkback-activation-preflight'
      || value.status !== 'blocked-runtime-touch-exploration-not-requested'
      || value.capturedAt !== '2026-08-23T16:58:24.153Z') {
    fail('PF19 TalkBack preflight identity is invalid.');
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
    fail('PF19 is not bound to the exact current candidate.');
  }
  if (!exact(value.installed, {
    packageIdentityVerified: true,
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    delivery: 'direct-apk',
    apkSha256: expectedApkSha256,
  })) {
    fail('PF19 installed package binding is invalid or overstates Store delivery.');
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
    fail('PF19 sanitized physical-device summary is invalid.');
  }
  if (!exact(value.activation, {
    officialSettingsAuthorizationCompleted: true,
    serviceProcessActive: true,
    serviceBound: true,
    runtimeTouchExplorationEnabled: false,
    runtimeGestureContractSatisfied: false,
    traversalAttempted: false,
    exactPreviousConfigurationRestored: true,
    accessibilityEnabledAfterDiagnostic: false,
    enabledServiceCountAfterDiagnostic: 0,
    touchExplorationEnabledAfterDiagnostic: false,
    touchExplorationGrantCountAfterDiagnostic: 0,
    keyboardShortcutTargetCountAfterDiagnostic: 0,
  })) {
    fail('PF19 must retain the exact blocked runtime and restored configuration truth.');
  }
  if (!exact(value.blockers, [
    'talkback-service-did-not-request-runtime-touch-exploration',
  ])) {
    fail('PF19 TalkBack blocker identity drifted.');
  }
  if (!allFalse(value.boundaries)) {
    fail('PF19 must not claim a TalkBack, Store, mutation or private-data pass.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|@|password|token|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF19 evidence contains a private path, account, device or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: expectedBuildNumber,
    candidateCommit: expectedCommit,
    exactInstalledApkVerified: true,
    officialAuthorizationCompleted: true,
    serviceBound: true,
    runtimeTouchExplorationEnabled: false,
    traversalAttempted: false,
    exactConfigurationRestored: true,
    automatedTalkBackMainNavigationPassed: false,
    manualTalkBackTraversalPassed: false,
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
      fail('PF19 CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf19CurrentCandidateTalkBackPreflight({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF19 TalkBack preflight valid: build=${result.buildNumber}, `
      + `serviceBound=${result.serviceBound}, `
      + `runtimeTouch=${result.runtimeTouchExplorationEnabled}, `
      + `restored=${result.exactConfigurationRestored}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF19 TalkBack preflight validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
