#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp90-pixel-permission-lifecycle-restart-recovery-20260910.json';

function fail(message) { throw new Error(message); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial)$/iu.test(key)) {
      fail(`WP90 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

export function validateWp90PixelPermissionLifecycleRestartRecovery({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp90-pixel-permission-lifecycle-restart-recovery'
      || value.status !== 'partial-permission-restored-navigation-absent-after-restart'
      || value.capturedOn !== '2026-09-10'
      || value.workPackage !== 'WP90') fail('WP90 identity is invalid.');
  if (!same(value.candidate, {
    applicationId: 'com.shareittoo.app', versionName: '1.0.0', versionCode: '2026090905',
    sourceHead: 'e1c182ea496f013989863155c13bfda649255a7e', releaseChannel: 'internal',
    delivery: 'direct-apk', apkSha256: '1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6',
    physicalPixelPackageMatched: true,
  })) fail('WP90 candidate binding is invalid.');
  if (!same(value.preflight, {
    candidateArchiveValidated: true, cleanCandidateSourceMatched: true, manifestPermissionsExact: true,
    physicalDeviceReachable: true, deviceAlreadyUnlocked: true, authenticatedNavigationBeforeTransitions: true,
  })) fail('WP90 preflight is invalid.');
  if (!same(value.failureAndRecovery, {
    failureClass: 'navigation-bottom-navigation-absent', fullPermissionMatrixAccepted: false,
    intermediatePermissionGroupAccepted: false, permissionStateRestoredExactly: true,
    runtimePermissionsChecked: 4, ownerOnlyJournalMode: '0600',
    journalStatus: 'restored-after-failed-run', recoveryRequired: false, lifecycleResult: 'unproven',
    credentialsRead: false, accountIdentityRead: false, rawDeviceIdentifierRecorded: false,
  })) fail('WP90 recovery evidence is invalid.');
  if (value.scope?.rootCauseProven !== false
      || typeof value.scope?.observedCondition !== 'string'
      || typeof value.scope?.toolchainDebt !== 'string'
      || typeof value.scope?.nextSafeAction !== 'string') fail('WP90 scope is invalid.');
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) fail('WP90 boundary evidence records an unauthorized change.');
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(JSON.stringify(value))) {
    fail('WP90 evidence contains a private or secret-shaped value.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    recovery: 'exact-permission-restoration-after-navigation-absence',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp90PixelPermissionLifecycleRestartRecovery();
    process.stdout.write(`WP90 Pixel permission recovery valid: candidate=${result.candidateVersionCode}, recovery=${result.recovery}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP90 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
