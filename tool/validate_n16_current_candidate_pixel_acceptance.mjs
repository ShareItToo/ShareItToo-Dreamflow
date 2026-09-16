#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026090304',
  artifactSourceCommit: 'd555a2b3730b20d1c3f22c442fb3cacd0c1f0beb',
  diagnosticToolsCommit: '72b9fdf106c3617d2867d2a750069032ec5a131c',
  apkSha256: 'c8b9891bdda063a85718f8a1f26a760ded41c69511e00afbbaa48df91ca9139a',
  aabSha256: 'a9552587afbece82fbf02351743ab3bd7970a79d0d32837d01d0212d23d828b3',
  signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  binaryPrivacyReportSha256: 'eb98746c5144b2ea881b6c9d1d21f8c1a2cc1d676f9ca5d811d15790cb2c1d4b',
  privateScreenshotSha256: '2920057de520b0990f7d566f57d97347cb7afe5e0c050bd664a1e2d0064d08a5',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N16 value.`);
}

export function validateN16CurrentCandidatePixelAcceptance(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n16-current-candidate-pixel-acceptance', 'kind');
  same(
    evidence?.status,
    'candidate-transport-and-session-passed-owner-and-legal-gates-pending',
    'status',
  );

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

  same(evidence?.qa?.diagnosticToolsFullLocalRegression, 'passed', 'diagnostic-tools local regression');
  same(evidence?.qa?.diagnosticToolsRepositoryToolTestsPassed, 2044, 'diagnostic-tools repository tests');
  same(evidence?.qa?.evidenceClosureFullLocalRegression, 'passed', 'evidence-closure local regression');
  same(evidence?.qa?.evidenceClosureRepositoryToolTestsPassed, 2049, 'evidence-closure repository tests');
  same(evidence?.qa?.repositoryToolTestsSkipped, 0, 'repository tool skipped tests');
  same(evidence?.qa?.githubRegressionRun, 33706352927, 'GitHub regression run');
  same(evidence?.qa?.githubRegression, 'passed', 'GitHub regression');
  same(
    evidence?.qa?.cleanCheckoutReproducibility,
    'passed-by-github-regression',
    'clean-checkout reproducibility',
  );
  same(evidence?.qa?.githubCodeqlRun, 33706352977, 'GitHub CodeQL run');
  same(evidence?.qa?.githubCodeql, 'passed', 'GitHub CodeQL');
  same(evidence?.qa?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  same(evidence?.qa?.prNumber, 7, 'PR number');
  same(evidence?.qa?.prDraft, true, 'PR Draft state');
  same(evidence?.qa?.prMerged, false, 'PR merged state');

  same(
    evidence?.staging?.deployedBackendCommit,
    '5d88295fa7fe313b83936783a0582a505b2ba486',
    'deployed Staging backend',
  );
  same(
    evidence?.staging?.candidateRuntimeBackendTreeMatchesDeployment,
    true,
    'candidate/deployment runtime tree binding',
  );
  same(evidence?.staging?.health, 'passed', 'Staging health');
  same(evidence?.staging?.mailTransport, 'smtp', 'mail transport');
  same(evidence?.staging?.pushTransport, 'fcm', 'push transport');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');
  same(evidence?.staging?.listingAiBudgetCents, 0, 'listing AI budget');

  same(evidence?.emailVerification?.rolesRegistered, 2, 'registered roles');
  same(evidence?.emailVerification?.smtpMessagesAccepted, 2, 'accepted SMTP messages');
  same(evidence?.emailVerification?.verificationLinksFollowed, 0, 'followed verification links');
  same(evidence?.emailVerification?.realAccountLoginCompleted, false, 'real account login');
  same(evidence?.emailVerification?.status, 'pending-owner-link-action', 'email status');
  same(evidence?.emailVerification?.containsEmailAddress, false, 'email-address exclusion');
  same(evidence?.emailVerification?.containsVerificationLink, false, 'verification-link exclusion');

  same(evidence?.pixel?.installedApkHashMatchesArchive, true, 'installed APK binding');
  same(evidence?.pixel?.appDataPreserved, true, 'Pixel app-data preservation');
  same(evidence?.pixel?.protectedSessionRestoredAfterAllProbes, true, 'Pixel session restoration');
  same(
    evidence?.pixel?.controlledFcm?.status,
    'passed-current-candidate-bounded-full-fcm-diagnostic',
    'FCM status',
  );
  same(
    evidence?.pixel?.controlledFcm?.notificationIconVisual,
    'passed-current-candidate-private-screenshot-review',
    'current-candidate notification icon review',
  );
  same(
    evidence?.pixel?.controlledFcm?.notificationIconVisualReviewObservedAt,
    '2026-09-03',
    'current-candidate notification icon review date',
  );
  same(evidence?.pixel?.controlledFcm?.privateScreenshotCommitted, false, 'private screenshot exclusion');
  same(
    evidence?.pixel?.offlineRealtime?.status,
    'passed-current-candidate-bounded-offline-realtime-diagnostic',
    'offline/realtime status',
  );
  same(evidence?.pixel?.offlineRealtime?.neutralPopupAbsentBeforeSend, true, 'pre-send popup absence');
  same(evidence?.pixel?.offlineRealtime?.expectedPopupDismissedAfterSend, 1, 'expected popup dismissal');
  same(evidence?.pixel?.offlineRealtime?.sameProcessRealtimeRecovery, true, 'realtime recovery');
  same(evidence?.pixel?.offlineRealtime?.networkRestored, true, 'network restoration');
  same(
    evidence?.pixel?.logoutLifecycle?.status,
    'passed-current-candidate-bounded-logout-lifecycle-diagnostic',
    'logout status',
  );
  same(evidence?.pixel?.logoutLifecycle?.localSessionCleared, true, 'logout session clearing');
  same(evidence?.pixel?.logoutLifecycle?.protectedChatHidden, true, 'post-logout chat privacy');
  same(
    evidence?.pixel?.logoutLifecycle?.dialogClosureScope,
    'exact-v52-push-surface-only',
    'dialog closure scope',
  );

  same(evidence?.roleFlow?.ordinaryBindingAttempt, 'rejected-before-fixture-creation', 'binding attempt');
  same(evidence?.roleFlow?.httpStatus, 409, 'binding hold HTTP status');
  same(evidence?.roleFlow?.errorCode, 'v52_contract_documents_unavailable', 'binding hold error');
  for (const key of [
    'listingCreatedDuringProbe',
    'reservationCreatedDuringProbe',
    'contractCreatedDuringProbe',
    'paymentEndpointCalled',
    'containsReviewCredentials',
  ]) same(evidence?.roleFlow?.[key], false, `role-flow ${key}`);

  same(evidence?.listingAi?.runtimeProvider, 'mock', 'listing-AI runtime provider');
  same(evidence?.listingAi?.runtimeExternalExecutionEnabled, false, 'listing-AI external execution');
  same(evidence?.listingAi?.runtimeImageAnalysisCompleted, false, 'listing-AI runtime image analysis');
  same(evidence?.listingAi?.codexLocalDevClassification, 'CODEX_AUTH_LOCAL_DEV_SUPPORTED', 'Codex auth classification');
  same(evidence?.listingAi?.codexLocalDevApiBilling, false, 'Codex local-dev API billing');
  same(evidence?.listingAi?.codexLocalDevCredentialExtraction, false, 'Codex credential extraction');
  same(evidence?.listingAi?.codexLocalDevRuntimeProviderEligible, false, 'Codex runtime eligibility');
  same(evidence?.listingAi?.automaticPublication, false, 'automatic publication');

  same(evidence?.socialAuth?.googleEnabled, true, 'Google auth configuration');
  same(evidence?.socialAuth?.googleOwnerFlowCompleted, false, 'Google owner flow');
  same(evidence?.socialAuth?.appleEnabled, false, 'Apple auth configuration');
  same(evidence?.socialAuth?.facebookEnabled, false, 'Facebook auth configuration');
  same(evidence?.holds?.v52LegalStatus, 'draft-blocked', 'V5.2 legal status');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const path = resolve(
    root,
    'docs/evidence/release-readiness/n16-current-candidate-pixel-acceptance-2026090304.json',
  );
  validateN16CurrentCandidatePixelAcceptance(JSON.parse(readFileSync(path, 'utf8')));
  process.stdout.write('N16 current-candidate Pixel acceptance evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N16 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
