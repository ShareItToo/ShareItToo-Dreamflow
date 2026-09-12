#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp87-pixel-two-role-successor-staging-20260910.json';
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
      fail(`WP87 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

export function validateWp87PixelTwoRoleSuccessorStaging({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp87-pixel-two-role-successor-staging'
      || value.status !== 'complete-controlled-nonbinding-pixel-core-journey'
      || value.capturedOn !== '2026-09-10'
      || value.workPackage !== 'WP87') fail('WP87 identity is invalid.');
  if (!same(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090905',
    sourceHead: 'e1c182ea496f013989863155c13bfda649255a7e',
    releaseChannel: 'internal',
    delivery: 'direct-apk',
    apkSha256: '1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6',
    physicalPixelPackageMatched: true,
  })) fail('WP87 candidate binding is invalid.');
  if (value.staging?.environment !== 'staging'
      || value.staging?.runtimeHead !== '926a00c5fa7f6595069aed12119d2dde90935bc3'
      || value.staging?.apiHealthy !== true
      || value.staging?.databaseHealthy !== true
      || value.staging?.paymentTransport !== 'memory'
      || value.staging?.stripeLivemode !== false
      || value.staging?.fcmEnabledStagingOnly !== true
      || value.staging?.externalListingAiEnabled !== false) fail('WP87 Staging binding is invalid.');
  if (!same(value.provenanceLimit?.runtimeRelevantChangedPaths, runtimePaths)
      || value.provenanceLimit.wholeCandidateOrLegalAcceptanceTransferred !== false
      || typeof value.provenanceLimit.scope !== 'string') fail('WP87 provenance limit is invalid.');
  if (!same(value.pixelTwoRoleJourney, {
    distinctEmailVerifiedSyntheticPrincipals: 'passed',
    ownerDraftPublishThroughPixelUi: 'passed-server-confirmed-active',
    renterPublicDiscovery: 'passed',
    requestAcceptance: 'passed-non-binding-simulation',
    chatVisibility: 'passed-renter-visible',
    principalSwitchIsolation: 'passed-owner-absent-under-renter',
    controlledFcm: 'passed-foreground-background-terminated',
    cleanup: 'passed-booking-cancelled-listing-ended',
    protectedOwnerSessionRestored: true,
  })) fail('WP87 Pixel journey evidence is invalid.');
  if (!same(value.nonBindingTruth, {
    contractCreated: false,
    reservationCreated: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    monetaryEffectMinor: 0,
    listingLeftActive: false,
    testBookingLeftActive: false,
  })) fail('WP87 non-binding boundary is invalid.');
  if (value.remaining?.onePlus !== 'untouched'
      || value.remaining?.notificationIconVisualReview !== 'open-private-owner-only') {
    fail('WP87 remaining boundary is invalid.');
  }
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP87 boundary evidence records an unauthorized change.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP87 evidence contains a private or secret-shaped value.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    coreJourney: 'owner-renter-publish-discover-chat-isolation-passed',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp87PixelTwoRoleSuccessorStaging();
    process.stdout.write(`WP87 Pixel core journey valid: candidate=${result.candidateVersionCode}, journey=${result.coreJourney}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP87 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
