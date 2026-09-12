#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n19ClosureHead: '3133cec82a4d17f1429db8bde765a0295c2a7fb9',
  n20DiagnosticHead: '0c1b62042719763fff5f420be524f8a244440c3a',
  candidateArtifactSourceCommit: '4bcc018eef7759d9f8fe64f75daba060abf0eb13',
  versionCode: '2026090305',
  apkSha256: '113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41',
  aabSha256: '435cfcc9f3a493e86b2e2b9ed532bcd0f8fba0c68761c768e80eb9806fb5cd0f',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N20 value.`);
}

export function validateN20PixelAppUiRegistration(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n20-pixel-app-ui-registration', 'kind');
  same(
    evidence?.status,
    'pixel-app-ui-registration-email-confirmation-login-cold-start-passed-live-gates-closed',
    'status',
  );
  for (const [key, value] of Object.entries(expected)) {
    const actual = [
      'n19ClosureHead',
      'n20DiagnosticHead',
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

  const registration = evidence?.registration;
  same(registration?.interface, 'physical-pixel-installed-app-ui', 'registration interface');
  same(registration?.formFieldsSubmitted, 4, 'submitted form fields');
  same(registration?.consentControlsChecked, 4, 'checked consents');
  for (const key of [
    'minimumAgeConfirmed',
    'privateUseConfirmed',
    'termsAccepted',
    'privacyAccepted',
    'backendRegistrationAccepted',
    'pendingEmailHandoffObserved',
    'pixelRegistrationFormSubmissionObserved',
  ]) same(registration?.[key], true, key);
  same(registration?.smtpMessagesAccepted, 1, 'SMTP messages');
  same(registration?.gmailVerificationMessagesFound, 1, 'Gmail messages');
  same(registration?.singleUseVerificationLinksConfirmed, 1, 'confirmed links');
  same(registration?.confirmationHttpStatus, 200, 'confirmation status');
  same(registration?.invalidOrExpiredConfirmationPages, 0, 'invalid links');
  same(registration?.browserCookiesRead, false, 'browser cookie access');
  same(registration?.credentialsOrTokensPrinted, false, 'credential output');
  same(registration?.verificationLinksStoredInRepository, false, 'link storage');

  same(evidence?.privateVault?.mode, '0600', 'vault mode');
  same(evidence?.privateVault?.status, 'pixel-ui-registration-login-complete', 'vault status');
  same(JSON.stringify(evidence?.privateVault?.roles), JSON.stringify(['owner']), 'vault roles');
  same(evidence?.privateVault?.addressOrCredentialCommitted, false, 'vault repository boundary');

  same(evidence?.pixel?.physical, true, 'physical Pixel');
  same(evidence?.pixel?.model, 'Pixel 7 Pro', 'Pixel model');
  same(evidence?.pixel?.installedVersionCode, '2026090305', 'installed version');
  same(evidence?.pixel?.installedApkHashVerified, true, 'installed APK hash');
  same(evidence?.pixel?.newAccountLoginThroughAppUi, 'passed', 'new-account login');
  same(evidence?.pixel?.exactRegisteredPrincipalVisible, true, 'registered principal');
  same(evidence?.pixel?.guestPrincipalAbsent, true, 'guest absence');
  same(evidence?.pixel?.coldStartSessionPersistence, 'passed', 'cold start');
  same(evidence?.pixel?.finalProtectedSessionRole, 'owner', 'restored final session');
  same(evidence?.pixel?.privateEvidence?.committed, false, 'private evidence boundary');

  same(evidence?.staging?.mailTransport, 'smtp', 'mail transport');
  same(evidence?.staging?.mailProvider, 'google-workspace-smtp-relay', 'mail provider');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');

  same(evidence?.qa?.n20DiagnosticFullLocalRegression, 'passed', 'diagnostic local regression');
  same(evidence?.qa?.n20DiagnosticRepositoryToolTestsPassed, 2067, 'diagnostic repository tests');
  same(evidence?.qa?.n20DiagnosticGithubRegressionRun, 33720856359, 'diagnostic GitHub regression');
  same(evidence?.qa?.n20DiagnosticGithubRegression, 'passed', 'diagnostic regression state');
  same(evidence?.qa?.n20DiagnosticGithubCodeqlRun, 33720856387, 'diagnostic CodeQL');
  same(evidence?.qa?.n20DiagnosticGithubCodeql, 'passed', 'diagnostic CodeQL state');
  same(evidence?.qa?.evidenceClosureFullLocalRegression, 'passed', 'evidence local regression');
  same(evidence?.qa?.evidenceClosureRepositoryToolTestsPassed, 2071, 'evidence repository tests');
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
    'docs/evidence/release-readiness/n20-pixel-app-ui-registration-2026090305.json',
  ), 'utf8'));
  validateN20PixelAppUiRegistration(evidence);
  process.stdout.write('N20 Pixel app-UI registration evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N20 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
