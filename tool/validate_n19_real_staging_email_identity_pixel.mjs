#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n18ClosureHead: 'e80b1096c77422554c382b671ecdd910af55b96f',
  candidateArtifactSourceCommit: '4bcc018eef7759d9f8fe64f75daba060abf0eb13',
  versionCode: '2026090305',
  apkSha256: '113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41',
  aabSha256: '435cfcc9f3a493e86b2e2b9ed532bcd0f8fba0c68761c768e80eb9806fb5cd0f',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N19 value.`);
}

export function validateN19RealStagingEmailIdentityPixel(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n19-real-staging-email-identity-pixel', 'kind');
  same(
    evidence?.status,
    'email-links-and-two-real-staging-logins-passed-live-gates-closed',
    'status',
  );
  for (const [key, value] of Object.entries(expected)) {
    const actual = ['n18ClosureHead', 'candidateArtifactSourceCommit'].includes(key)
      ? evidence?.source?.[key]
      : evidence?.candidate?.[key];
    same(actual, value, key);
  }
  same(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'applicationId');
  same(evidence?.candidate?.channel, 'internal', 'channel');
  same(evidence?.candidate?.environment, 'staging', 'environment');
  same(evidence?.candidate?.firebaseConfigured, true, 'Firebase');
  same(evidence?.candidate?.binaryPrivacyScan, 'passed', 'binary privacy scan');

  same(evidence?.emailIdentity?.roleRegistrationsAccepted, 2, 'role registrations');
  same(evidence?.emailIdentity?.smtpMessagesAccepted, 2, 'SMTP messages');
  same(evidence?.emailIdentity?.gmailVerificationMessagesFound, 2, 'Gmail messages');
  same(evidence?.emailIdentity?.singleUseVerificationLinksConfirmed, 2, 'confirmed links');
  same(evidence?.emailIdentity?.invalidOrExpiredConfirmationPages, 0, 'invalid links');
  same(
    evidence?.emailIdentity?.verificationResult,
    'passed-two-distinct-email-link-confirmations',
    'verification result',
  );
  same(evidence?.emailIdentity?.browserCookiesRead, false, 'browser cookie access');
  same(evidence?.emailIdentity?.credentialsOrTokensPrinted, false, 'credential output');
  same(evidence?.emailIdentity?.verificationLinksStoredInRepository, false, 'link storage');
  same(evidence?.emailIdentity?.registrationUiContractCovered, true, 'registration UI contract');
  same(
    evidence?.emailIdentity?.pixelRegistrationFormSubmissionObserved,
    false,
    'Pixel registration form truth',
  );

  same(evidence?.privateVault?.mode, '0600', 'vault mode');
  same(evidence?.privateVault?.status, 'email-link-verified-ready-for-login', 'vault status');
  same(evidence?.privateVault?.addressOrCredentialCommitted, false, 'vault repository boundary');
  same(JSON.stringify(evidence?.privateVault?.roles), JSON.stringify(['owner', 'renter']), 'vault roles');

  same(JSON.stringify(evidence?.pixel?.loginSequence), JSON.stringify(['owner', 'renter', 'owner']), 'login sequence');
  same(evidence?.pixel?.ownerLoginThroughAppUi, 'passed', 'owner login');
  same(evidence?.pixel?.renterLoginThroughAppUi, 'passed', 'renter login');
  same(evidence?.pixel?.previousPrincipalAbsentAfterEachSwitch, true, 'principal isolation');
  same(evidence?.pixel?.ownerColdStartSessionPersistence, 'passed', 'owner cold start');
  same(evidence?.pixel?.renterColdStartSessionPersistence, 'passed', 'renter cold start');
  same(evidence?.pixel?.finalSessionRole, 'owner', 'final session role');
  same(evidence?.pixel?.privateEvidence?.committed, false, 'private evidence boundary');

  same(evidence?.staging?.mailTransport, 'smtp', 'mail transport');
  same(evidence?.staging?.mailProvider, 'google-workspace-smtp-relay', 'mail provider');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');

  same(evidence?.qa?.n18EvidenceHeadGithubRegressionRun, 33718146247, 'N18 final regression');
  same(evidence?.qa?.n18EvidenceHeadGithubRegression, 'passed', 'N18 regression state');
  same(evidence?.qa?.n18EvidenceHeadGithubCodeqlRun, 33718146180, 'N18 final CodeQL');
  same(evidence?.qa?.n18EvidenceHeadGithubCodeql, 'passed', 'N18 CodeQL state');
  same(evidence?.qa?.evidenceClosureFullLocalRegression, 'passed', 'N19 local regression');
  same(evidence?.qa?.evidenceClosureRepositoryToolTestsPassed, 2063, 'N19 repository tests');
  same(evidence?.qa?.repositoryToolTestsSkipped, 0, 'repository skipped tests');
  same(evidence?.qa?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  same(evidence?.qa?.prDraft, true, 'PR Draft');
  same(evidence?.qa?.prMerged, false, 'PR merge');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n19-real-staging-email-identity-pixel-2026090305.json',
  ), 'utf8'));
  validateN19RealStagingEmailIdentityPixel(evidence);
  process.stdout.write('N19 real Staging email identity Pixel evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N19 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
