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

export function validateWp66PaymentProviderIntegrityAndCandidate(input = {}) {
  const evidence = input.evidence ?? load(
    'docs/evidence/release-readiness/wp66-payment-provider-integrity-and-candidate-20260909.json',
  );
  // WP66 is evidence for the signed 2026090904 candidate. Later candidates
  // must not retroactively rewrite that historical binding.
  const candidate = input.candidate ?? load('store/google-play/rollover-candidate-2026090904.json');
  const superseded = input.superseded ?? load('store/google-play/rollover-candidate-2026090903.json');

  exact(evidence.kind, 'sit-wp66-payment-provider-integrity-and-candidate', 'evidence.kind');
  exact(evidence.repository?.retryParameterFixHead,
    '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0', 'repository.retryParameterFixHead');
  for (const key of [
    'durableNamespacedProviderIdempotencyKeys',
    'providerPayloadDriftRejected',
    'checkoutExpiryFrozenAtPaymentCreation',
    'completedCheckoutRecoveredAcrossNewClientKey',
    'incompleteCheckoutReusesSameProviderOperation',
    'mutableListingFieldsExcludedFromRetryPayload',
    'providerEventRequiresExactPaymentBookingCustomerObjectAndModeBinding',
  ]) exact(evidence.providerIntegrity?.[key], true, `providerIntegrity.${key}`);
  exact(evidence.providerIntegrity?.rawLocalIdentifiersExposedInProviderKeys, false,
    'providerIntegrity.rawLocalIdentifiersExposedInProviderKeys');
  exact(evidence.providerIntegrity?.unknownOrMismatchedProviderEventMutatesPayment, false,
    'providerIntegrity.unknownOrMismatchedProviderEventMutatesPayment');
  exact(evidence.providerIntegrity?.secondPaymentPermittedDuringUncertainReconciliation, false,
    'providerIntegrity.secondPaymentPermittedDuringUncertainReconciliation');

  exact(candidate.candidate?.versionCode, '2026090904', 'candidate.versionCode');
  exact(candidate.candidate?.artifactSourceHead, evidence.candidate?.sourceHead,
    'candidate.artifactSourceHead');
  exact(candidate.candidate?.applicationId, 'com.shareittoo.app', 'candidate.applicationId');
  exact(candidate.candidate?.releaseChannel, 'internal', 'candidate.releaseChannel');
  exact(candidate.candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1',
    'candidate.apiBaseUrl');
  for (const key of ['aabSha256', 'apkSha256', 'privacyReportSha256', 'uploadCertificateSha256']) {
    exact(candidate.artifact?.[key], evidence.artifact?.[key], `artifact.${key}`);
  }
  exact(candidate.playStateAtReadback?.candidateUploaded, false,
    'playStateAtReadback.candidateUploaded');
  exact(candidate.deviceVerification?.preferredDeviceExactApkInstalled, false,
    'deviceVerification.preferredDeviceExactApkInstalled');
  exact(candidate.providerAndLiveHolds?.realPaymentsEnabled, false,
    'providerAndLiveHolds.realPaymentsEnabled');

  exact(superseded.status, 'superseded-never-uploaded', 'superseded.status');
  exact(superseded.candidate?.versionCode, '2026090903', 'superseded.versionCode');
  exact(superseded.supersession?.supersededByVersionCode, '2026090904',
    'superseded.supersession.supersededByVersionCode');
  exact(superseded.supersession?.uploadAllowed, false,
    'superseded.supersession.uploadAllowed');

  const serialized = JSON.stringify({ evidence, candidate, superseded });
  if (/\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|\+49\d|"(?:accessToken|refreshToken|secret|password)"/i
    .test(serialized)) {
    fail('WP66 evidence contains a private path, identity or credential marker.');
  }
  exact(evidence.boundaries?.containsSecrets, false, 'boundaries.containsSecrets');
  exact(evidence.boundaries?.productionChanged, false, 'boundaries.productionChanged');
  return {
    versionCode: evidence.candidate.versionCode,
    sourceHead: evidence.candidate.sourceHead,
    aabSha256: evidence.artifact.aabSha256,
    localComplete: evidence.verification.completeTechnicalRegression.startsWith('passed-'),
    githubPending: evidence.verification.githubRegression === 'pending',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = validateWp66PaymentProviderIntegrityAndCandidate();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
