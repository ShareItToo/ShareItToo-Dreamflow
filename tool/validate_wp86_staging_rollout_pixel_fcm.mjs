#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp86-staging-rollout-pixel-fcm-20260910.json';
const candidateHead = 'e1c182ea496f013989863155c13bfda649255a7e';
const rolloutHead = '926a00c5fa7f6595069aed12119d2dde90935bc3';
const runtimePaths = [
  'backend/src/operational_readiness_gate.js',
  'lib/config/draft_operator_config.dart',
  'lib/screens/legal_imprint_screen.dart',
  'lib/screens/legal_privacy_screen.dart',
  'lib/screens/legal_terms_screen.dart',
];

function fail(message) {
  throw new Error(message);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial)$/iu.test(key)) {
      fail(`WP86 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

export function validateWp86StagingRolloutPixelFcm({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp86-staging-rollout-pixel-fcm'
      || value.status !== 'complete-staging-rollout-and-controlled-pixel-fcm'
      || value.capturedOn !== '2026-09-10'
      || value.workPackage !== 'WP86') {
    fail('WP86 identity is invalid.');
  }
  if (!same(value.repository, {
    branch: 'codex/master-workflow-20260808',
    rolloutHead,
    imagePublishWorkflowRun: 34443680857,
    imagePublish: 'success',
    candidateBaselineRegressionRun: 34442216344,
    candidateBaselineRegression: 'success',
    candidateBaselineCodeqlRun: 34442216352,
    candidateBaselineCodeql: 'success',
    pullRequest7: 'draft-open-clean-unmerged',
  })) fail('WP86 repository binding is invalid.');
  if (!same(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090905',
    sourceHead: candidateHead,
    releaseChannel: 'internal',
    delivery: 'direct-apk',
    apkSha256: '1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6',
    firebaseConfigured: true,
    privacyScan: 'passed',
    physicalPixelPackageMatched: true,
  })) fail('WP86 Pixel candidate binding is invalid.');
  if (value.stagingRollout?.environment !== 'staging'
      || value.stagingRollout.runtimeHead !== rolloutHead
      || value.stagingRollout.apiHealthy !== true
      || value.stagingRollout.databaseHealthy !== true
      || value.stagingRollout.fcmEnabledStagingOnly !== true
      || value.stagingRollout.paymentTransport !== 'memory'
      || value.stagingRollout.stripeLivemode !== false
      || value.stagingRollout.externalListingAiEnabled !== false
      || value.stagingRollout.activeComposeConfigFileCount !== 5
      || value.stagingRollout.activeComposePersistentRegularFileCount !== 5
      || value.stagingRollout.retainedPersistentOverrideCount !== 1
      || value.stagingRollout.readOnlyRuntimeInspection !== 'passed') {
    fail('WP86 Staging rollout evidence is invalid.');
  }
  if (!same(value.candidateToRuntimeSeparation?.runtimeRelevantChangedPaths, runtimePaths)
      || value.candidateToRuntimeSeparation.candidateIsAncestorOfRuntime !== true
      || value.candidateToRuntimeSeparation.exactCandidateWideAcceptanceTransferred !== false
      || typeof value.candidateToRuntimeSeparation.scopeOfThisEvidence !== 'string') {
    fail('WP86 candidate-to-runtime separation is invalid.');
  }
  if (value.controlledNonBindingSimulation?.roleVisibility !== 'passed'
      || value.controlledNonBindingSimulation.chatReadiness !== 'passed'
      || value.controlledNonBindingSimulation.contractCreated !== false
      || value.controlledNonBindingSimulation.reservationCreated !== false
      || value.controlledNonBindingSimulation.paymentEndpointCalled !== false
      || value.controlledNonBindingSimulation.monetaryEffectMinor !== 0
      || value.controlledNonBindingSimulation.cleanup !== 'booking-cancelled-listing-ended-public-catalog-removed') {
    fail('WP86 payment-free simulation evidence is invalid.');
  }
  if (!same(value.pixelFcm, {
    foregroundBanner: 'passed',
    backgroundSystemNotification: 'passed',
    terminatedProcessSystemNotification: 'passed',
    productionPushSent: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    notificationIconVisual: 'private-owner-only-review-pending',
    privateScreenshotCommitted: false,
  })) fail('WP86 controlled FCM evidence is invalid.');
  if (value.remaining?.bindingV52Contract !== 'blocked-by-approved-immutable-legal-snapshots'
      || value.remaining?.notificationIconVisualReview !== 'open-private-owner-only'
      || value.remaining?.onePlus !== 'untouched') {
    fail('WP86 remaining holds are invalid.');
  }
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP86 boundary evidence records an unauthorized change.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP86 evidence contains a private or secret-shaped value.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    runtimeHead: value.stagingRollout.runtimeHead,
    fcm: 'foreground-background-terminated-passed',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp86StagingRolloutPixelFcm();
    process.stdout.write(`WP86 Staging/Pixel FCM valid: candidate=${result.candidateVersionCode}, fcm=${result.fcm}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP86 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
