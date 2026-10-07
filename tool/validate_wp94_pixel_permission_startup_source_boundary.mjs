#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp94-pixel-permission-startup-source-boundary-20260910.json';

function fail(message) { throw new Error(message); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial)$/iu.test(key)) fail(`WP94 evidence contains a private field at ${[...path, key].join('.')}.`);
    rejectPrivateShape(entry, [...path, key]);
  }
}

export function validateWp94PixelPermissionStartupSourceBoundary({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (value.schemaVersion !== 1 || value.kind !== 'sit-wp94-pixel-permission-startup-source-boundary'
      || value.status !== 'complete-source-audit-no-auto-permission-startup-trigger'
      || value.capturedOn !== '2026-09-10' || value.workPackage !== 'WP94') fail('WP94 identity is invalid.');
  if (!same(value.candidate, {
    applicationId: 'com.shareittoo.app', versionName: '1.0.0', versionCode: '2026090905',
    sourceHead: 'e1c182ea496f013989863155c13bfda649255a7e', releaseChannel: 'internal', delivery: 'direct-apk',
    apkSha256: '1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6', physicalPixelPackageMatched: true,
  })) fail('WP94 candidate binding is invalid.');
  if (!same(value.sourceInspection, {
    candidateWorktreeClean: true, mainActivityHasOnResumeOverride: false, mainActivityHasOnPauseOverride: false,
    automaticRuntimePermissionRequestAtStartup: false, runtimePermissionRequestsAreFeatureInitiated: true,
    privacyCacheResumeObserverOnlyPurgesRetainedCopies: true, appLinkResumeObserverOnlyRefreshesPendingActionLink: true,
    firebaseInitializationAwaitedBeforeRunApp: true, initialAppLinkPrincipalAwaitedBeforeRunApp: true,
    authenticatedRealtimeInitializationAwaitedBeforeMainNavigation: true,
  })) fail('WP94 source inspection is invalid.');
  if (!same(value.conclusion, {
    physicalFinalRestartConditionExplained: false, rootCauseProven: false, sourcePatchMade: false,
    candidateWideAcceptance: false, boundedHypothesis: 'startup-scheduling-or-runner-observation-boundary',
  })) fail('WP94 conclusion is invalid.');
  if (value.scope?.furtherPermissionLifecycleRepeatsAllowedByThisEvidence !== false
      || typeof value.scope?.nextSafeAction !== 'string') fail('WP94 scope is invalid.');
  if (value.boundaries === null || typeof value.boundaries !== 'object' || Object.values(value.boundaries).some((entry) => entry !== false)) fail('WP94 boundary evidence records an unauthorized change.');
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(JSON.stringify(value))) fail('WP94 evidence contains a private or secret-shaped value.');
  return Object.freeze({ status: value.status, candidateVersionCode: value.candidate.versionCode, conclusion: value.conclusion.boundedHypothesis });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp94PixelPermissionStartupSourceBoundary();
    process.stdout.write(`WP94 source boundary valid: candidate=${result.candidateVersionCode}, conclusion=${result.conclusion}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP94 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
