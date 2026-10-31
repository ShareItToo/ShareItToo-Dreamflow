#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n20ClosureHead: '25ef81a1789e3f23775011e18f979227b6179ae1',
  n21CoreDiagnosticHead: '0a310f04823ab7ddb87e1d6eba20aa82d0bbd6d3',
  n21SecretRatchetHead: 'eadd1fac292527127ffaeafaab08a74190593612',
  n21FinalDiagnosticHead: '638c91efd040d9c0412dcb39f151ba035cf3bf27',
  candidateArtifactSourceCommit: '4bcc018eef7759d9f8fe64f75daba060abf0eb13',
  versionCode: '2026090305',
  apkSha256: '113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41',
  aabSha256: '435cfcc9f3a493e86b2e2b9ed532bcd0f8fba0c68761c768e80eb9806fb5cd0f',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N21 value.`);
}

export function validateN21PixelPasswordRecovery(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n21-pixel-password-recovery', 'kind');
  same(
    evidence?.status,
    'pixel-password-reset-request-single-use-confirmation-old-rejection-new-login-cold-start-passed-live-gates-closed',
    'status',
  );
  for (const [key, value] of Object.entries(expected)) {
    const actual = [
      'n20ClosureHead',
      'n21CoreDiagnosticHead',
      'n21SecretRatchetHead',
      'n21FinalDiagnosticHead',
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

  const recovery = evidence?.recovery;
  same(recovery?.interface, 'physical-pixel-installed-app-ui', 'recovery interface');
  for (const key of [
    'requestSubmittedThroughAppUi',
    'neutralAccountExistenceResponse',
    'resetSuccessPageObserved',
    'singleUseLinkConfirmed',
    'exactRecoveredPrincipalVisible',
  ]) same(recovery?.[key], true, key);
  same(recovery?.gmailResetMessagesFound, 1, 'reset messages');
  same(recovery?.resetFormHttpStatus, 200, 'reset form status');
  same(recovery?.resetSubmissionHttpStatus, 200, 'reset submission status');
  same(recovery?.sameLinkReplayHttpStatus, 400, 'single-use replay status');
  same(recovery?.oldPasswordHttpStatus, 401, 'old-password status');
  same(recovery?.oldPasswordErrorContract, 'invalid_credentials', 'old-password contract');
  same(recovery?.newPasswordLoginThroughAppUi, 'passed', 'new-password login');
  same(recovery?.coldStartSessionPersistence, 'passed', 'cold start');
  same(recovery?.browserCookiesRead, false, 'browser cookie access');
  same(recovery?.credentialsOrTokensPrinted, false, 'credential output');
  same(recovery?.resetLinkStoredInRepository, false, 'reset-link storage');

  const semantics = evidence?.resultSemantics;
  same(semantics?.safeOldCredentialRejection, '401:invalid_credentials', 'safe rejection');
  same(semantics?.http408, 'ambiguous-never-rejection', 'HTTP 408 semantics');
  same(semantics?.intermediaryOrUnstructured4xx, 'ambiguous-never-rejection', 'unstructured 4xx semantics');
  same(
    semantics?.transportFailure,
    'ambiguous-preserve-private-vaults-byte-for-byte',
    'transport semantics',
  );
  same(semantics?.unexpectedSuccess, 'not-old-password-rejection', 'unexpected-success semantics');
  same(semantics?.newCredentialPromotedOnlyAfterExactRejection, true, 'credential promotion');

  same(evidence?.privateVault?.mode, '0600', 'vault mode');
  same(evidence?.privateVault?.status, 'pixel-password-reset-login-complete', 'vault status');
  same(evidence?.privateVault?.pendingPasswordRemoved, true, 'pending-password removal');
  same(evidence?.privateVault?.credentialStoredOnlyInSourceAccountVault, true, 'credential storage');
  same(evidence?.privateVault?.addressCredentialOrResetLinkCommitted, false, 'vault repository boundary');

  same(evidence?.pixel?.physical, true, 'physical Pixel');
  same(evidence?.pixel?.model, 'Pixel 7 Pro', 'Pixel model');
  same(evidence?.pixel?.installedVersionCode, '2026090305', 'installed version');
  same(evidence?.pixel?.installedApkHashVerified, true, 'installed APK hash');
  same(evidence?.pixel?.finalProtectedSessionRole, 'owner', 'restored final session');
  same(evidence?.pixel?.privateEvidence?.committed, false, 'private evidence boundary');

  same(evidence?.staging?.mailTransport, 'smtp', 'mail transport');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');

  same(evidence?.qa?.n20EvidenceGithubRegressionRun, 33722111605, 'N20 evidence regression');
  same(evidence?.qa?.n20EvidenceGithubRegression, 'passed', 'N20 regression state');
  same(evidence?.qa?.n20EvidenceGithubCodeqlRun, 33722111568, 'N20 evidence CodeQL');
  same(evidence?.qa?.n20EvidenceGithubCodeql, 'passed', 'N20 CodeQL state');
  same(evidence?.qa?.n21FinalFullLocalRegression, 'passed', 'N21 local regression');
  same(evidence?.qa?.n21FinalRepositoryToolTestsPassed, 2075, 'N21 repository tests');
  same(evidence?.qa?.n21FinalGithubRegressionRun, 33724178775, 'N21 GitHub regression');
  same(evidence?.qa?.n21FinalGithubRegression, 'passed', 'N21 GitHub regression state');
  same(evidence?.qa?.n21FinalGithubCodeqlRun, 33724178803, 'N21 CodeQL');
  same(evidence?.qa?.n21FinalGithubCodeql, 'passed', 'N21 CodeQL state');
  same(evidence?.qa?.repositoryToolTestsSkipped, 0, 'repository skipped tests');
  same(evidence?.qa?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  same(evidence?.qa?.prDraft, true, 'PR Draft');
  same(evidence?.qa?.prMerged, false, 'PR merge');

  const ratchet = evidence?.ratchetFinding;
  same(ratchet?.failedGithubRun, 33723385105, 'failed ratchet run');
  same(ratchet?.productOrRuntimeFailure, false, 'product failure classification');
  same(ratchet?.currentFixtureValueConstructedAtRuntime, true, 'current fixture construction');
  same(ratchet?.immutableHistoricalFindingReviewedByExactCommitFileRule, true, 'history review');
  same(ratchet?.secretScannerWeakened, false, 'secret scanner strength');
  same(ratchet?.dependentSecurityEvidenceInventoriesRefreshedThroughRw20, true, 'inventory refresh');
  same(ratchet?.remainingSourceInventoryHashMismatches, 0, 'inventory mismatch count');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n21-pixel-password-recovery-2026090305.json',
  ), 'utf8'));
  validateN21PixelPasswordRecovery(evidence);
  process.stdout.write('N21 Pixel password-recovery evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N21 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
