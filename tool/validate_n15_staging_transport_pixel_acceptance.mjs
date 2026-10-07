#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026090303',
  artifactSourceCommit: '5d88295fa7fe313b83936783a0582a505b2ba486',
  diagnosticToolsCommit: '24a8fa3509df428b6a1aef2f7d0cd91c3d41d5f3',
  apkSha256: 'ef98f6ebac6588bf84038bd74fdcb6a54a290860e55e048fe29abb6f9b0e7560',
  aabSha256: 'a60ad4d7567865b2ee5ffc5c08520fa142b9f788a606268317472f6e91e266b4',
  signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  privateScreenshotSha256: 'bd4d9915245b1cd8f12f924d4dd33d0d737ef40a60b8aa25e323e06bdf0e3a54',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N15 value.`);
}

export function validateN15StagingTransportPixelAcceptance(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n15-staging-transport-pixel-acceptance', 'kind');
  same(evidence?.status, 'transport-passed-email-owner-verification-pending', 'status');
  for (const [key, value] of Object.entries(expected)) {
    const actual = key === 'diagnosticToolsCommit'
      ? evidence?.qa?.diagnosticToolsCommit
      : key === 'privateScreenshotSha256'
        ? evidence?.pixel?.controlledFcm?.privateScreenshotSha256
        : evidence?.candidate?.[key];
    same(actual, value, key);
  }
  same(evidence?.candidate?.channel, 'internal', 'candidate channel');
  same(evidence?.candidate?.environment, 'staging', 'candidate environment');
  same(evidence?.candidate?.minSdk, 24, 'candidate minSdk');
  same(evidence?.candidate?.targetSdk, 36, 'candidate targetSdk');
  same(evidence?.candidate?.firebaseConfigured, true, 'candidate Firebase configuration');
  same(evidence?.candidate?.binaryPrivacyScan, 'passed', 'candidate privacy scan');
  same(evidence?.qa?.fullLocalRegression, 'passed', 'local regression');
  same(evidence?.qa?.repositoryToolTestsPassed, 2035, 'repository tool tests');
  same(evidence?.staging?.deployedBackendCommit, expected.artifactSourceCommit, 'deployed backend');
  same(evidence?.staging?.health, 'passed', 'Staging health');
  same(evidence?.staging?.mailTransport, 'smtp', 'mail transport');
  same(evidence?.staging?.pushTransport, 'fcm', 'push transport');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');
  same(evidence?.staging?.listingAiBudgetCents, 0, 'listing AI budget');
  same(evidence?.emailVerification?.rolesRegistered, 2, 'registered roles');
  same(evidence?.emailVerification?.smtpMessagesAccepted, 2, 'accepted SMTP messages');
  same(evidence?.emailVerification?.inboxArrivalsVisuallyObserved, 1, 'observed inbox arrivals');
  same(evidence?.emailVerification?.verificationLinksFollowed, 0, 'followed verification links');
  same(evidence?.emailVerification?.status, 'pending-owner-link-action', 'email verification status');
  same(evidence?.emailVerification?.containsEmailAddress, false, 'email-address exclusion');
  same(evidence?.pixel?.installedApkHashMatchesArchive, true, 'installed APK binding');
  same(evidence?.pixel?.controlledFcm?.status, 'passed-bounded-full-fcm-diagnostic', 'FCM status');
  same(evidence?.pixel?.controlledFcm?.notificationIconVisual, 'passed', 'notification icon');
  same(evidence?.pixel?.controlledFcm?.privateScreenshotCommitted, false, 'private screenshot exclusion');
  same(evidence?.pixel?.offlineRealtime?.status, 'passed-bounded-offline-realtime-diagnostic', 'offline/realtime status');
  same(evidence?.pixel?.offlineRealtime?.sameProcessRealtimeRecovery, true, 'realtime recovery');
  same(evidence?.pixel?.offlineRealtime?.networkRestored, true, 'network restoration');
  same(evidence?.pixel?.logoutLifecycle?.status, 'passed-bounded-logout-lifecycle-diagnostic', 'logout status');
  same(evidence?.pixel?.logoutLifecycle?.localSessionCleared, true, 'logout session clearing');
  same(evidence?.pixel?.logoutLifecycle?.protectedChatHidden, true, 'post-logout chat privacy');
  same(evidence?.isolation?.mode, 'existing-protected-non-binding-simulation', 'diagnostic isolation mode');
  for (const key of [
    'listingCreatedDuringProbe',
    'reservationCreatedDuringProbe',
    'contractCreatedDuringProbe',
    'paymentEndpointCalled',
    'stripeLivemode',
    'containsReviewCredentials',
  ]) same(evidence?.isolation?.[key], false, `isolation ${key}`);
  same(evidence?.legalHold?.v52Status, 'draft-blocked', 'V5.2 legal status');
  same(evidence?.legalHold?.bindingBookingAttempt, 'rejected-before-fixture-creation', 'binding booking attempt');
  same(evidence?.legalHold?.errorCode, 'v52_contract_documents_unavailable', 'legal hold error');
  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const path = resolve(root, 'docs/evidence/release-readiness/n15-staging-transport-pixel-acceptance-2026090303.json');
  validateN15StagingTransportPixelAcceptance(JSON.parse(readFileSync(path, 'utf8')));
  process.stdout.write('N15 Staging transport and Pixel acceptance evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N15 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
