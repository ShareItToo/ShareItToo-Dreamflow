#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n26ClosureHead: '49d98609f832a38ac56a209cd8a13ecf98392f1f',
  candidateSourceHead: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  fixtureCleanupHead: '5656ee6aaf2f4ab6ea9b0a47dacb8b1b3799cdcf',
  offlineStabilityHead: '9a5f38dcbd5a3aa2471ba1bb314e2ffbef3a50bd',
  privacyInventoryHead: 'b4741908b0e3b00bb9652de05ca63e87f159648f',
  apkSha256: '37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194',
  signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  twoRoleVaultSha256: 'dc2bb6de55ac354624afe0260517796b67e6024d22d9179e5e0f7084cd336273',
  protectedVaultSha256: 'c36b3e24ebc95dbb0e7638867faebf287ce39efac60ff5a583360728bd87b13d',
  privateCaptureSha256: 'cc32f966a49b3cea90ad9338268925c474531c1493fe9ae14a03a8597ea31f35',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N27 value.`);
}

export function validateN27CurrentCandidatePixelClosure(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n27-current-candidate-pixel-two-role-push-offline-closure', 'kind');
  same(
    evidence?.status,
    'current-candidate-two-role-product-push-offline-passed-live-gates-closed',
    'status',
  );
  same(evidence?.source?.branch, 'codex/master-workflow-20260808', 'branch');
  for (const key of [
    'n26ClosureHead',
    'candidateSourceHead',
    'fixtureCleanupHead',
    'offlineStabilityHead',
    'privacyInventoryHead',
  ]) same(evidence?.source?.[key], expected[key], key);

  const candidate = evidence?.candidate;
  same(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  same(candidate?.versionName, '1.0.0', 'versionName');
  same(candidate?.buildNumber, '2026090306', 'buildNumber');
  same(candidate?.channel, 'internal', 'candidate channel');
  same(candidate?.environment, 'staging', 'candidate environment');
  same(candidate?.delivery, 'direct-apk', 'candidate delivery');
  same(candidate?.apkSha256, expected.apkSha256, 'APK SHA-256');
  same(candidate?.signingCertificateSha256, expected.signingCertificateSha256, 'certificate SHA-256');
  same(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'API base URL');
  same(candidate?.firebaseConfigured, true, 'Firebase configuration');
  same(candidate?.exactInstalledHashMatched, true, 'installed candidate');
  same(candidate?.candidateIsAncestor, true, 'candidate ancestry');
  same(candidate?.postCandidateChangedPathCount, 79, 'post-candidate path count');
  same(candidate?.mobileSourceChangedAfterCandidate, false, 'post-candidate mobile source');

  const device = evidence?.device;
  same(device?.physical, true, 'physical device');
  same(device?.manufacturer, 'Google', 'device manufacturer');
  same(device?.model, 'Pixel 7 Pro', 'device model');
  same(device?.containsRawDeviceIdentifier, false, 'raw device identifier claim');

  const journey = evidence?.twoRoleJourney;
  for (const key of [
    'protectedOwnerSessionRestored',
  ]) same(journey?.[key], true, `two-role ${key}`);
  for (const key of [
    'paymentEndpointCalled',
    'stripeLivemode',
    'contractCreated',
    'reservationCreated',
    'availabilityAffected',
  ]) same(journey?.[key], false, `two-role ${key}`);
  same(journey?.ownerDraftPublishThroughPixelUi, 'passed-server-confirmed-active', 'owner publish');
  same(journey?.renterPublicDiscovery, 'passed', 'renter discovery');
  same(journey?.requestAcceptance, 'passed-non-binding-simulation', 'request acceptance');
  same(journey?.ownerPresentation, 'Pilot-Simulation', 'owner presentation');
  same(journey?.renterPresentation, 'Pilot-Simulation', 'renter presentation');
  same(journey?.chatVisibility, 'passed-renter-visible', 'chat visibility');
  same(journey?.principalSwitchIsolation, 'passed-owner-absent-under-renter', 'principal isolation');
  same(journey?.cleanup, 'passed-booking-cancelled-listing-ended-public-removed', 'journey cleanup');
  same(journey?.monetaryEffectMinor, 0, 'monetary effect');

  const push = evidence?.push;
  same(push?.foregroundDelivery, 'passed-banner-visible', 'foreground push');
  same(push?.backgroundDelivery, 'passed-system-notification-visible', 'background push');
  same(push?.terminatedProcessDelivery, 'passed-process-absent-notification-visible', 'terminated push');
  same(push?.notificationIconVisualReview, 'passed-private-capture-brand-icon-clear', 'icon review');
  same(push?.privateCaptureSha256, expected.privateCaptureSha256, 'private capture SHA-256');
  same(push?.privateCaptureAssumedSensitive, true, 'private capture sensitivity');
  same(push?.privateCaptureContainsUnrelatedDeviceNotifications, true, 'private capture unrelated notifications');
  same(push?.privateCaptureCommitted, false, 'private capture repository boundary');
  same(push?.privateCaptureDistributionAllowed, false, 'private capture distribution boundary');
  same(push?.productionPushSent, false, 'production push');
  same(push?.fullStoreFcmMatrixClaimed, false, 'Store FCM overclaim');

  const offline = evidence?.offlineRealtime;
  same(offline?.firstAttempt, 'failed-safe-pre-stability-window-delivery-observed', 'first offline attempt');
  same(offline?.rootCauseClass, 'network-transition-race-in-diagnostic-boundary', 'offline cause');
  same(offline?.retryAloneAcceptedAsClosure, false, 'retry-only closure');
  same(offline?.continuousOfflineStableWindowSeconds, 5, 'stable offline window');
  same(offline?.continuousOfflineSamples, 10, 'stable offline samples');
  same(offline?.messageAbsentWhileOfflineSeconds, 15, 'offline observation window');
  for (const key of [
    'messageVisibleOnlyAfterRestoration',
    'sameProcessSurvived',
    'foregroundChatSurvived',
    'originalNetworkRestored',
  ]) same(offline?.[key], true, `offline ${key}`);
  same(offline?.packageCrashEntries, 0, 'offline crash entries');

  const fixture = evidence?.fixtureSafety;
  same(fixture?.legalHoldResponse, '409:v52_contract_documents_unavailable', 'legal hold');
  same(fixture?.bindingBookingCreated, false, 'binding booking');
  same(fixture?.orphanDetectedAfterInitialHarnessFailure, 1, 'initial orphan count');
  same(fixture?.orphanHadNonterminalBooking, false, 'orphan booking state');
  same(fixture?.publicCatalogRemainingAfterCleanup, 0, 'public orphan count');
  for (const key of [
    'orphanPausedAfterExactReadback',
    'newListingCleanupNowFailClosed',
    'serverRequestStateCheckedBeforePause',
    'exactPausedStateReadBack',
    'privacyInventoryChainRebound',
  ]) same(fixture?.[key], true, `fixture ${key}`);
  same(fixture?.temporaryWorkaroundRetained, false, 'temporary workaround');
  same(fixture?.privacySemanticsChanged, false, 'privacy semantics');

  const privateState = evidence?.privateState;
  same(privateState?.twoRoleJourneyVaultSha256, expected.twoRoleVaultSha256, 'journey vault SHA-256');
  same(privateState?.protectedNonBindingVaultSha256, expected.protectedVaultSha256, 'protected vault SHA-256');
  same(privateState?.location, 'owner-only-outside-repository', 'private state location');
  same(privateState?.mode, '0600', 'private state mode');
  same(privateState?.protectedVaultPreserved, true, 'protected state preservation');
  same(privateState?.credentialsRemainOutsideRepository, true, 'credential boundary');

  const qa = evidence?.qa;
  same(qa?.fixtureCleanupFocusedTestsPassed, 15, 'fixture tests');
  same(qa?.deviceDiagnosticFocusedTestsPassed, 10, 'device tests');
  same(qa?.repositoryToolTestsPassed, 2118, 'repository tool tests');
  same(qa?.completeLocalRegression, 'passed', 'local regression');
  same(qa?.backendTestsTotal, 797, 'Backend tests');
  same(qa?.backendTestsPassed, 795, 'Backend passed');
  same(qa?.backendExpectedDatabaseSkips, 2, 'Backend skips');
  same(qa?.realPostgresFresh, 'passed', 'fresh PostgreSQL');
  same(qa?.realPostgresRecovery, 'passed', 'PostgreSQL recovery');
  same(qa?.flutterTestsPassed, 652, 'Flutter tests');
  same(qa?.analyzer, 'passed-zero', 'analyzer');
  same(qa?.webWasm, 'passed', 'Web/Wasm');
  same(qa?.loopbackSmoke, 'passed', 'loopback');
  same(qa?.androidDebugBuild, 'passed', 'Android build');
  same(qa?.githubVerificationHead, expected.privacyInventoryHead, 'GitHub verification head');
  same(qa?.githubRegressionRun, 33757624155, 'GitHub Regression run');
  same(qa?.githubRegression, 'passed', 'GitHub Regression');
  same(qa?.githubCodeqlRun, 33757624091, 'GitHub CodeQL run');
  same(qa?.githubCodeql, 'passed', 'GitHub CodeQL');
  same(qa?.cleanCheckoutReproducibility, 'passed', 'clean checkout');
  same(qa?.openCodeScanningAlerts, 0, 'CodeQL alerts');
  same(qa?.prNumber, 7, 'PR number');
  same(qa?.prDraft, true, 'PR Draft');
  same(qa?.prMerged, false, 'PR merged');

  same(evidence?.remaining?.notificationIconVisualReview, 'passed-private-capture', 'remaining icon review');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    same(value, false, `boundary ${key}`);
  }
  same(Object.keys(evidence?.boundaries ?? {}).length, 22, 'boundary count');

  const serialized = JSON.stringify(evidence);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|sms.?code.{0,24}[0-9]{4,8}|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(serialized)) {
    fail('N27 evidence contains private or credential-shaped material.');
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n27-current-candidate-pixel-two-role-push-offline-2026090306.json',
  ), 'utf8'));
  validateN27CurrentCandidatePixelClosure(evidence);
  process.stdout.write('N27 current-candidate Pixel closure evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N27 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
