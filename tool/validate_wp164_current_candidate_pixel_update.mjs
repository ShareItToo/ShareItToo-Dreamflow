#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidencePath = 'docs/evidence/release-readiness/wp164-current-candidate-pixel-update-20260916.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is not the verified WP164 value.`);
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial)$/iu.test(key)) {
      fail(`WP164 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

export function validateWp164CurrentCandidatePixelUpdate({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  exact(value.schemaVersion, 1, 'schemaVersion');
  exact(value.kind, 'sit-wp164-current-candidate-pixel-update', 'kind');
  exact(value.status, 'passed-data-preserving-pixel-update', 'status');
  exact(value.capturedOn, '2026-09-16', 'capturedOn');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    evidenceHead: '3c0cdf53ef8701ad7f1938c61a87b8a61e150ed9',
    candidateSourceHead: '707d95e93c463ad4bbb0adbf382526d8869992c5',
    remoteDivergence: '0/0',
    workingTreeAtCapture: 'clean',
  }, 'repository');
  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091601',
    environment: 'staging',
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    apkSha256: '32e2e28008e19e11d1fc00497c3f7f08f60eb42c48c0dea93878f8ae6670e464',
    aabSha256: 'c5cc29eea8d5cccdb1913e9247528a784d945010c433d0125b3e39bdf563da7c',
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    firebaseConfigured: true,
    externalListingAiProviderEnabled: false,
    paymentMode: 'memory-only',
  }, 'candidate');
  exact(value.deviceUpdate, {
    deviceClass: 'Pixel-7-Pro',
    installMode: 'adb-install-r-update-only',
    uninstallPerformed: false,
    dataResetPerformed: false,
    downgradeAttempted: false,
    previousVersionCode: '2026091312',
    installedVersionCode: '2026091601',
    installedVersionName: '1.0.0',
    installedPackage: 'com.shareittoo.app',
    installedApkSha256: '32e2e28008e19e11d1fc00497c3f7f08f60eb42c48c0dea93878f8ae6670e464',
    apkSigningVersion: 2,
    firstInstallTimeBefore: '2026-08-17 08:45:28',
    firstInstallTimeAfter: '2026-08-17 08:45:28',
    ceDataInodeBefore: 267655,
    ceDataInodeAfter: 267655,
    applicationLaunch: 'passed',
    mainActivityFocusedAfterLaunch: true,
    deviceLockscreenShown: false,
  }, 'deviceUpdate');
  exact(value.verification, {
    candidateArchiveHashVerifiedBeforeInstall: true,
    installedBytesHashVerifiedAfterInstall: true,
    packageVersionReadback: 'passed',
    dataPreservation: 'passed',
    sourceCandidateBinding: 'passed',
    productionChanged: false,
    googlePlayChanged: false,
    firebaseConsoleChanged: false,
    backendDeploymentChanged: false,
    paymentChanged: false,
    realMoneyUsed: false,
    onePlusContacted: false,
    credentialsRecorded: false,
    rawDeviceIdentifierRecorded: false,
  }, 'verification');
  exact(value.next, 'read-only-staging-runtime-and-push-readiness-reconciliation-before-two-role-journey', 'next');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP164 evidence contains a private or secret-shaped value.');
  }
  return Object.freeze({ status: value.status, versionCode: value.deviceUpdate.installedVersionCode });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp164CurrentCandidatePixelUpdate();
    process.stdout.write(`WP164 Pixel update valid: versionCode=${result.versionCode}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP164 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
