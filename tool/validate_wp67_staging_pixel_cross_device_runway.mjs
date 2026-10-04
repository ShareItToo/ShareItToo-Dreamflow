#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} has drifted.`);
}

function load(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

export function validateWp67StagingPixelCrossDeviceRunway(input = {}) {
  const evidence = input.evidence ?? load(
    'docs/evidence/release-readiness/wp67-staging-pixel-cross-device-runway-20260909.json',
  );
  // WP67 records the physical result for 2026090904, not whichever candidate
  // succeeds it later.
  const candidate = input.candidate ?? load('store/google-play/rollover-candidate-2026090904.json');
  const diagnostic = input.diagnostic ?? readFileSync(resolve(
    root, 'tool/diagnose_android_rental_cart_project_lifecycle.mjs',
  ), 'utf8');

  exact(evidence.kind, 'sit-wp67-staging-pixel-cross-device-runway', 'evidence.kind');
  exact(evidence.status, 'partial-oneplus-usb-authorization-pending', 'evidence.status');
  exact(evidence.repository?.candidateSourceHead,
    '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0', 'repository.candidateSourceHead');
  exact(evidence.repository?.wp66ClosureHead,
    '78c663248aec089b08d19fd0fb40a9a63f19408b', 'repository.wp66ClosureHead');
  exact(evidence.repository?.cartProbeFixHead,
    '8f671e5a3a5ec6f3e4abed929e9e1212565fcf6f', 'repository.cartProbeFixHead');

  exact(candidate.candidate?.versionCode, '2026090904', 'candidate.versionCode');
  exact(candidate.candidate?.artifactSourceHead, evidence.repository.candidateSourceHead,
    'candidate.artifactSourceHead');
  exact(candidate.artifact?.aabSha256, evidence.candidate?.aabSha256, 'candidate.aabSha256');
  exact(candidate.artifact?.apkSha256, evidence.candidate?.apkSha256, 'candidate.apkSha256');
  exact(candidate.artifact?.uploadCertificateSha256,
    evidence.candidate?.uploadCertificateSha256, 'candidate.uploadCertificateSha256');

  exact(evidence.staging?.runtimeHead, evidence.repository.wp66ClosureHead, 'staging.runtimeHead');
  exact(evidence.staging?.paymentMode, 'memory', 'staging.paymentMode');
  exact(evidence.staging?.stripeLivemode, false, 'staging.stripeLivemode');
  exact(evidence.staging?.listingAiExternalExecutionEnabled, false,
    'staging.listingAiExternalExecutionEnabled');
  exact(evidence.pixel?.installedApkAndCertificateMatch, true,
    'pixel.installedApkAndCertificateMatch');
  exact(evidence.pixel?.twoRoleProductJourney,
    'passed-pixel-email-verified-two-role-product-journey', 'pixel.twoRoleProductJourney');
  exact(evidence.pixel?.rentalCartProjectLifecycle,
    'passed-pixel-rental-cart-project-lifecycle', 'pixel.rentalCartProjectLifecycle');
  exact(evidence.pixel?.returnCaseStructuredError,
    '409:v52_contract_documents_unavailable', 'pixel.returnCaseStructuredError');
  exact(evidence.pixel?.privacySensitiveNotificationCaptureDeleted, true,
    'pixel.privacySensitiveNotificationCaptureDeleted');

  exact(evidence.cartTimingDebt?.permanentRetryAdded, false,
    'cartTimingDebt.permanentRetryAdded');
  exact(evidence.cartTimingDebt?.measurementFix,
    'first-hierarchy-probe-starts-within-75ms', 'cartTimingDebt.measurementFix');
  exact(evidence.cartTimingDebt?.postFixPhysicalReplay,
    'passed-complete-lifecycle', 'cartTimingDebt.postFixPhysicalReplay');
  if (!diagnostic.includes('attempts: 24') || !diagnostic.includes('intervalMs: 75')) {
    fail('The deterministic cart acknowledgement probe has drifted.');
  }

  exact(evidence.onePlus?.receivedApkSha256Verified, true,
    'onePlus.receivedApkSha256Verified');
  exact(evidence.onePlus?.adbAuthorized, false, 'onePlus.adbAuthorized');
  exact(evidence.onePlus?.candidateInstalled, false, 'onePlus.candidateInstalled');
  exact(evidence.onePlus?.crossDeviceJourneyExecuted, false,
    'onePlus.crossDeviceJourneyExecuted');
  exact(evidence.legalGate?.professionalSnapshotApprovalFound, false,
    'legalGate.professionalSnapshotApprovalFound');
  exact(evidence.legalGate?.bindingContractBypassed, false,
    'legalGate.bindingContractBypassed');

  for (const key of [
    'productionChanged',
    'googlePlayChanged',
    'testerListChanged',
    'firebaseChanged',
    'paymentProviderEnabled',
    'realMoneyUsed',
    'contractCreated',
    'publicRegistrationChanged',
    'prMerged',
    'containsAccountIdentity',
    'containsSecrets',
    'containsTokens',
    'containsRawDeviceIdentifiers',
    'containsPrivateFilesystemPaths',
  ]) exact(evidence.boundaries?.[key], false, `boundaries.${key}`);

  const serialized = JSON.stringify(evidence);
  if (/\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|\+49\d|"(?:accessToken|refreshToken|secret|password)"/iu
    .test(serialized)) {
    fail('WP67 evidence contains a private path, identity or credential marker.');
  }
  return {
    versionCode: evidence.candidate.versionCode,
    stagingHead: evidence.staging.runtimeHead,
    pixelComplete: true,
    onePlusPending: true,
    legalHoldClosed: true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(`${JSON.stringify(validateWp67StagingPixelCrossDeviceRunway())}\n`);
}
