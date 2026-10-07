#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n21ClosureHead: 'b55336f4eff763e4f0bce2b28ba7b788ff816ab0',
  n22ImplementationHead: 'de6734810e920e17cd2016ab50642010c9055768',
  candidateArtifactSourceCommit: '4bcc018eef7759d9f8fe64f75daba060abf0eb13',
  versionCode: '2026090305',
  apkSha256: '113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41',
  aabSha256: '435cfcc9f3a493e86b2e2b9ed532bcd0f8fba0c68761c768e80eb9806fb5cd0f',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N22 value.`);
}

export function validateN22PixelEmailVerifiedTwoRoleProductJourney(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n22-pixel-email-verified-two-role-product-journey', 'kind');
  same(
    evidence?.status,
    'pixel-email-verified-two-role-listing-discovery-request-acceptance-chat-isolation-cleanup-passed-live-gates-closed',
    'status',
  );
  for (const [key, value] of Object.entries(expected)) {
    const actual = [
      'n21ClosureHead',
      'n22ImplementationHead',
      'candidateArtifactSourceCommit',
    ].includes(key) ? evidence?.source?.[key] : evidence?.candidate?.[key];
    same(actual, value, key);
  }
  same(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'applicationId');
  same(evidence?.candidate?.channel, 'internal', 'channel');
  same(evidence?.candidate?.environment, 'staging', 'environment');
  same(evidence?.candidate?.installMethod, 'direct-apk-in-place', 'install method');
  same(evidence?.candidate?.firebaseConfigured, true, 'Firebase');
  same(evidence?.candidate?.binaryPrivacyScan, 'passed', 'binary privacy scan');

  const journey = evidence?.journey;
  same(
    journey?.interface,
    'physical-pixel-installed-app-ui-plus-exact-staging-server-verification',
    'journey interface',
  );
  for (const [key, value] of Object.entries({
    distinctEmailVerifiedPrincipals: 'passed',
    ownerDraftPublishThroughPixelUi: 'passed-server-confirmed-active',
    ownerPublishFeedback: 'durable-server-and-public-catalog-confirmed',
    renterPublicDiscovery: 'passed',
    requestAcceptance: 'passed-non-binding-simulation',
    ownerPresentation: 'Pilot-Simulation',
    renterPresentation: 'Pilot-Simulation',
    detailTruth: 'no-contract-no-reservation-no-payment',
    chatVisibility: 'passed-renter-visible',
    principalSwitchIsolation: 'passed-owner-absent-under-renter',
    cleanup: 'passed-booking-cancelled-listing-ended',
  })) same(journey?.[key], value, key);
  same(journey?.protectedOwnerSessionRestored, true, 'protected owner restoration');
  same(journey?.listingLeftActive, false, 'active listing cleanup');
  same(journey?.testBookingLeftActive, false, 'active booking cleanup');

  const semantics = evidence?.resultSemantics;
  same(semantics?.simulationOnly, true, 'simulation-only marker');
  same(semantics?.paymentEndpointCalled, false, 'payment endpoint');
  same(semantics?.stripeLivemode, false, 'Stripe livemode');
  same(semantics?.monetaryEffectMinor, 0, 'monetary effect');
  same(semantics?.contractCreated, false, 'contract creation');
  same(semantics?.reservationCreated, false, 'reservation creation');
  same(semantics?.availabilityAffected, false, 'availability effect');
  same(semantics?.inAppNotificationsVerified, true, 'in-app notifications');
  same(semantics?.transientPublishToastRequiredForSuccess, false, 'transient toast dependency');
  same(semantics?.durableServerTruthRequiredForSuccess, true, 'durable truth dependency');

  same(evidence?.privateVault?.mode, '0600', 'vault mode');
  same(evidence?.privateVault?.status, 'email-linked-product-journey-retired', 'vault status');
  same(evidence?.privateVault?.credentialsRemainOnlyInPrivateVault, true, 'credential storage');
  same(evidence?.privateVault?.accountIdentityFixtureOrTokenCommitted, false, 'vault repository boundary');
  if (!/^[a-f0-9]{64}$/u.test(evidence?.privateVault?.sha256 ?? '')) fail('Private vault digest is invalid.');

  same(evidence?.pixel?.physical, true, 'physical Pixel');
  same(evidence?.pixel?.model, 'Pixel 7 Pro', 'Pixel model');
  same(evidence?.pixel?.installedVersionCode, '2026090305', 'installed version');
  same(evidence?.pixel?.installedApkHashVerified, true, 'installed APK hash');
  same(evidence?.pixel?.finalProtectedSessionRole, 'owner', 'restored final session');

  same(evidence?.staging?.health, 'passed', 'Staging health');
  same(evidence?.staging?.pushTransport, 'fcm', 'push transport');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Staging Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');

  same(evidence?.qa?.n21ClosureGithubRegressionRun, 33725975352, 'N21 closure regression');
  same(evidence?.qa?.n21ClosureGithubRegression, 'passed', 'N21 regression state');
  same(evidence?.qa?.n21ClosureGithubCodeqlRun, 33725975459, 'N21 closure CodeQL');
  same(evidence?.qa?.n21ClosureGithubCodeql, 'passed', 'N21 CodeQL state');
  same(evidence?.qa?.n22ImplementationFullLocalRegression, 'passed', 'N22 local regression');
  same(evidence?.qa?.n22ImplementationRepositoryToolTestsPassed, 2086, 'N22 repository tests');
  same(evidence?.qa?.n22ImplementationGithubRegressionRun, 33730190048, 'N22 GitHub regression');
  same(evidence?.qa?.n22ImplementationGithubRegression, 'passed', 'N22 GitHub regression state');
  same(evidence?.qa?.n22ImplementationGithubCodeqlRun, 33730190012, 'N22 CodeQL');
  same(evidence?.qa?.n22ImplementationGithubCodeql, 'passed', 'N22 CodeQL state');
  same(evidence?.qa?.repositoryToolTestsSkipped, 0, 'repository skipped tests');
  same(evidence?.qa?.cleanCheckoutReproducibility, 'passed', 'clean checkout');
  same(evidence?.qa?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  same(evidence?.qa?.prDraft, true, 'PR Draft');
  same(evidence?.qa?.prMerged, false, 'PR merge');

  const hardening = evidence?.diagnosticHardening;
  same(hardening?.failedAttempts, 3, 'failed diagnostic attempts');
  same(hardening?.productOrRuntimeFailures, 0, 'product/runtime failures');
  same(hardening?.fixturesFromFailedAttemptsRetired, true, 'failed-attempt cleanup');
  same(hardening?.protectedOwnerSessionRestoredAfterEveryAttempt, true, 'attempt restoration');
  same(hardening?.transientToastTimingAssumptionRemoved, true, 'toast timing correction');
  same(hardening?.ownerAndRenterCopyMatchersSeparated, true, 'role copy correction');
  same(hardening?.exactChatTitleDelimiterCovered, true, 'chat title correction');
  same(hardening?.deterministicFocusedTestsPassed, 7, 'focused tests');
  same(hardening?.temporaryWorkaroundRetained, false, 'temporary workaround');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n22-pixel-email-verified-two-role-product-journey-2026090305.json',
  ), 'utf8'));
  validateN22PixelEmailVerifiedTwoRoleProductJourney(evidence);
  process.stdout.write('N22 Pixel email-verified two-role product-journey evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N22 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
