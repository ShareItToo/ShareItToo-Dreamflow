#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  versionCode: '2026090305',
  artifactSourceCommit: '4bcc018eef7759d9f8fe64f75daba060abf0eb13',
  diagnosticInvariantCommit: '9a85579c83b03a9fbf607f784b5d8b2e26c5a67f',
  apkSha256: '113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41',
  aabSha256: '435cfcc9f3a493e86b2e2b9ed532bcd0f8fba0c68761c768e80eb9806fb5cd0f',
  signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N18 value.`);
}

export function validateN18PixelTwoRoleNonBindingTruth(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n18-pixel-two-role-non-binding-truth', 'kind');
  same(
    evidence?.status,
    'candidate-installed-two-role-non-binding-truth-passed-live-gates-closed',
    'status',
  );
  for (const [key, value] of Object.entries(expected)) {
    const actual = key === 'diagnosticInvariantCommit'
      ? evidence?.qa?.diagnosticInvariantCommit
      : evidence?.candidate?.[key];
    same(actual, value, key);
  }
  same(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'applicationId');
  same(evidence?.candidate?.channel, 'internal', 'channel');
  same(evidence?.candidate?.environment, 'staging', 'environment');
  same(evidence?.candidate?.firebaseConfigured, true, 'Firebase');
  same(evidence?.candidate?.binaryPrivacyScan, 'passed', 'binary privacy scan');

  for (const key of [
    'serverAuthoritativeSimulationMarkerPreserved',
  ]) same(evidence?.correction?.[key], true, key);
  same(
    evidence?.correction?.bindingPaymentHandoverReturnActionsExposed,
    false,
    'binding simulation actions',
  );
  for (const role of ['renterPresentation', 'ownerPresentation']) {
    same(evidence?.pixel?.[role]?.cardStatus, 'Pilot-Simulation', `${role} card`);
    same(evidence?.pixel?.[role]?.nonBindingNoticeVisible, true, `${role} notice`);
    same(evidence?.pixel?.[role]?.privateScreenshotCommitted, false, `${role} screenshot`);
  }
  same(
    evidence?.pixel?.controlledFcm?.status,
    'passed-current-candidate-bounded-full-fcm-diagnostic',
    'FCM status',
  );
  same(
    evidence?.pixel?.controlledFcm?.notificationIconVisual,
    'passed-current-candidate-private-screenshot-review',
    'FCM icon review',
  );
  same(
    evidence?.pixel?.offlineRealtime?.activeDefaultNetworkAbsentConsecutiveSamples,
    3,
    'offline state samples',
  );
  same(evidence?.pixel?.offlineRealtime?.sameProcessRealtimeRecovery, true, 'realtime recovery');
  same(evidence?.pixel?.offlineRealtime?.networkRestored, true, 'network restoration');
  same(evidence?.pixel?.logoutLifecycle?.localSessionCleared, true, 'logout clearing');
  same(evidence?.pixel?.logoutLifecycle?.protectedChatHidden, true, 'logout privacy');
  same(
    evidence?.pixel?.protectedOwnerSessionRestoredAfterAllProbes,
    true,
    'protected session restoration',
  );

  same(evidence?.qa?.diagnosticRepositoryToolTestsPassed, 2055, 'repository tests');
  same(evidence?.qa?.evidenceClosureFullLocalRegression, 'passed', 'evidence closure regression');
  same(evidence?.qa?.evidenceClosureRepositoryToolTestsPassed, 2059, 'evidence closure repository tests');
  same(evidence?.qa?.repositoryToolTestsSkipped, 0, 'repository skipped tests');
  same(evidence?.qa?.implementationGithubRegressionRun, 33714842540, 'implementation regression');
  same(evidence?.qa?.implementationGithubRegressionAttempt, 2, 'implementation regression attempt');
  same(evidence?.qa?.diagnosticGithubRegressionRun, 33716964243, 'diagnostic regression');
  same(evidence?.qa?.diagnosticGithubCodeqlRun, 33716964239, 'diagnostic CodeQL');
  same(evidence?.qa?.diagnosticGithubRegression, 'passed', 'diagnostic GitHub regression');
  same(evidence?.qa?.diagnosticGithubCodeql, 'passed', 'diagnostic GitHub CodeQL');
  same(evidence?.qa?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  same(evidence?.qa?.prDraft, true, 'PR Draft');
  same(evidence?.qa?.prMerged, false, 'PR merge');

  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');
  same(evidence?.technicalDebt?.permanentCacheWarmupOrRetryRequired, false, 'cache workaround');
  same(
    evidence?.technicalDebt?.offlineNetworkTeardownRace,
    'closed-by-state-invariant-and-real-device-rerun',
    'offline diagnostic debt',
  );
  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n18-pixel-two-role-non-binding-truth-2026090305.json',
  ), 'utf8'));
  validateN18PixelTwoRoleNonBindingTruth(evidence);
  process.stdout.write('N18 Pixel two-role non-binding truth evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N18 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
