#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp93-pixel-final-restart-foreground-boundary-20260910.json';
function fail(message) { throw new Error(message); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial)$/iu.test(key)) fail(`WP93 evidence contains a private field at ${[...path, key].join('.')}.`);
    rejectPrivateShape(entry, [...path, key]);
  }
}

export function validateWp93PixelFinalRestartForegroundBoundary({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (value.schemaVersion !== 1 || value.kind !== 'sit-wp93-pixel-final-restart-foreground-boundary'
      || value.status !== 'partial-permission-matrix-restored-final-restart-foreground-unclassified'
      || value.capturedOn !== '2026-09-10' || value.workPackage !== 'WP93') fail('WP93 identity is invalid.');
  if (!same(value.candidate, {
    applicationId: 'com.shareittoo.app', versionName: '1.0.0', versionCode: '2026090905',
    sourceHead: 'e1c182ea496f013989863155c13bfda649255a7e', releaseChannel: 'internal', delivery: 'direct-apk',
    apkSha256: '1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6', physicalPixelPackageMatched: true,
  })) fail('WP93 candidate binding is invalid.');
  if (!same(value.permissionMatrix, {
    camera: 'deny-allow-restarts-passed', location: 'deny-allow-restarts-passed', notifications: 'deny-allow-restarts-passed',
    readOnlyAppPermissionSettings: 'passed', permissionStateRestoredExactly: true, runtimePermissionsChecked: 4, fullLifecycleAccepted: false,
  })) fail('WP93 permission matrix is invalid.');
  if (!same(value.finalRestartBoundary, {
    lastSafeCheckpoint: 'lifecycle-before-final-restart', navigationResult: 'bottom-navigation-absent', foregroundOwner: 'other-or-unavailable',
    permissionControllerExplained: false, systemUiExplained: false, shareItTooForegroundExplained: false, rootCauseProven: false,
  })) fail('WP93 final restart boundary is invalid.');
  if (!same(value.safetyRecovery, {
    ownerOnlyJournalMode: '0600', journalStatus: 'restored-after-failed-run', recoveryRequired: false,
    lifecycleResult: 'unproven', credentialsRead: false, accountIdentityRead: false, rawDeviceIdentifierRecorded: false,
  })) fail('WP93 recovery is invalid.');
  if (value.scope?.furtherPermissionLifecycleRepeatsAllowedByThisEvidence !== false
      || value.scope?.candidateWideAcceptance !== false || typeof value.scope?.nextSafeAction !== 'string') fail('WP93 scope is invalid.');
  if (value.boundaries === null || typeof value.boundaries !== 'object' || Object.values(value.boundaries).some((entry) => entry !== false)) fail('WP93 boundary evidence records an unauthorized change.');
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(JSON.stringify(value))) fail('WP93 evidence contains a private or secret-shaped value.');
  return Object.freeze({ status: value.status, candidateVersionCode: value.candidate.versionCode, boundary: 'final-restart-foreground-unclassified' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp93PixelFinalRestartForegroundBoundary();
    process.stdout.write(`WP93 final restart boundary valid: candidate=${result.candidateVersionCode}, boundary=${result.boundary}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP93 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
