#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n27ClosureHead: 'e39c576b0bfab17e96f68ff99e141770cc999d01',
  implementationHead: 'ac301de50b1378e887dc19b6b9d8af5c5314e3bc',
  candidateSourceHead: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  apkSha256: '37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194',
  certificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  darkCaptureSha256: '64c0325fc1ac47126c85f7918ce12ba28385cbd34ac00ce2f7cd6e3115f10c83',
  lightCaptureSha256: '88d96eb6d2470ee86ddfcd1cc0106ca9a13bbf9703855b7e68e11f20b71c2a78',
  backgroundCaptureSha256: '65d920849fd95e2d6c33e9cd7695a41a8395635e8bb8745e1c2bd11e77dcb547',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N28 value.`);
}

export function validateN28CurrentCandidatePixelSurfaceMatrix(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n28-current-candidate-pixel-surface-matrix-closure', 'kind');
  same(
    evidence?.status,
    'current-candidate-broad-read-only-pixel-surface-matrix-passed-live-gates-closed',
    'status',
  );
  same(evidence?.source?.branch, 'codex/master-workflow-20260808', 'branch');
  same(evidence?.source?.n27ClosureHead, expected.n27ClosureHead, 'N27 closure HEAD');
  same(evidence?.source?.n28ImplementationHead, expected.implementationHead, 'implementation HEAD');

  const candidate = evidence?.candidate;
  same(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  same(candidate?.versionName, '1.0.0', 'versionName');
  same(candidate?.buildNumber, '2026090306', 'build number');
  same(candidate?.sourceHead, expected.candidateSourceHead, 'candidate source HEAD');
  same(candidate?.channel, 'internal', 'channel');
  same(candidate?.environment, 'staging', 'environment');
  same(candidate?.delivery, 'direct-apk', 'delivery');
  same(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'API base URL');
  same(candidate?.firebaseConfigured, true, 'Firebase configuration');
  same(candidate?.paymentMode, 'memory', 'payment mode');
  same(candidate?.stripeLivemode, false, 'Stripe live mode');
  same(candidate?.apkSha256, expected.apkSha256, 'APK SHA-256');
  same(candidate?.signingCertificateSha256, expected.certificateSha256, 'certificate SHA-256');
  same(candidate?.exactInstalledHashMatched, true, 'installed hash match');
  same(candidate?.candidateIsAncestor, true, 'candidate ancestry');
  same(candidate?.postCandidateChangedPathCount, 91, 'post-candidate path count');
  same(candidate?.mobileSourceChangedAfterCandidate, false, 'mobile source drift');

  const device = evidence?.device;
  same(device?.physical, true, 'physical device');
  same(device?.manufacturer, 'Google', 'device manufacturer');
  same(device?.model, 'Pixel 7 Pro', 'device model');
  same(device?.osVersion, '17', 'device OS');
  same(device?.apiLevel, 37, 'device API level');
  same(device?.containsRawDeviceIdentifier, false, 'raw device identifier');

  const core = evidence?.surfaceCore;
  same(core?.authenticatedColdStartSession, 'passed', 'authenticated cold start');
  same(core?.mainNavigationDestinationCount, 5, 'main navigation count');
  same(core?.legalDocumentCount, 7, 'legal document count');
  same(core?.largeTextDestinationCount, 5, 'large-text navigation count');
  same(core?.exactPreviousFontScaleRestored, true, 'font-scale restoration');
  same(core?.minimumMainNavigationTouchTargetDp, 48, 'minimum touch target');
  same(core?.processRestartCheckCount, 5, 'process restart count');
  same(core?.readOnly, true, 'core read-only boundary');

  const theme = evidence?.themeAndBackground;
  same(theme?.systemDarkModeApplied, true, 'dark mode');
  same(theme?.systemLightModeApplied, true, 'light mode');
  same(theme?.authenticatedSessionRetained, true, 'theme session');
  same(JSON.stringify(theme?.backgroundOptionsReachable), JSON.stringify([
    'Dark 1', 'Dark 2', 'Light 1', 'Light 2',
  ]), 'background options');
  same(theme?.backgroundSelectionChanged, false, 'background mutation');
  same(theme?.exactOriginalNightModeRestored, true, 'night-mode restoration');
  same(theme?.visualReview, 'passed-private-captures-readable-four-options-clear', 'visual review');
  same(theme?.lightThemePolishRisk, 'non-blocking-gray-blue-overlay-intentional-and-readable', 'light theme risk');
  same(theme?.darkCaptureSha256, expected.darkCaptureSha256, 'dark capture SHA-256');
  same(theme?.lightCaptureSha256, expected.lightCaptureSha256, 'light capture SHA-256');
  same(theme?.backgroundCaptureSha256, expected.backgroundCaptureSha256, 'background capture SHA-256');
  same(theme?.privateCapturesAssumedSensitive, true, 'private capture sensitivity');
  same(theme?.privateCapturesCommitted, false, 'private capture Git boundary');
  same(theme?.privateCapturesDistributionAllowed, false, 'private capture distribution boundary');

  const account = evidence?.accountAndSupport;
  same(account?.accountSurfaceCount, 9, 'account surface count');
  same(account?.reachableSurfaces?.length, 9, 'reachable account surfaces');
  same(account?.helpCenterReachable, true, 'help center');
  same(account?.supportEntryReachableWithoutSubmission, true, 'support entry');
  same(account?.paymentProviderHoldVisible, true, 'payment hold');
  same(account?.payoutProviderHoldVisible, true, 'payout hold');
  same(account?.readOnly, true, 'account read-only boundary');

  const qa = evidence?.qa;
  same(qa?.n28FocusedTestsPassed, 11, 'N28 focused tests');
  same(qa?.repositoryToolTestsPassed, 2129, 'repository tool tests');
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
  same(qa?.githubVerificationHead, expected.implementationHead, 'GitHub verification HEAD');
  same(qa?.githubRegressionRun, 33766321053, 'GitHub Regression run');
  same(qa?.githubRegression, 'passed', 'GitHub Regression');
  same(qa?.githubCodeqlRun, 33766320747, 'GitHub CodeQL run');
  same(qa?.githubCodeql, 'passed', 'GitHub CodeQL');
  same(qa?.cleanCheckoutReproducibility, 'passed', 'clean checkout');
  same(qa?.openCodeScanningAlerts, 0, 'open scanning alerts');
  same(qa?.prNumber, 7, 'PR number');
  same(qa?.prDraft, true, 'PR Draft');
  same(qa?.prMerged, false, 'PR merged');

  same(evidence?.remaining?.currentCandidateRealSms, 'owner-assisted-request-code-observe-open', 'SMS status');
  same(evidence?.remaining?.onePlus, 'not-used', 'OnePlus status');
  same(evidence?.remaining?.stripeSandbox, 'provider-activation-hold', 'Stripe status');
  same(evidence?.remaining?.externalListingAi, 'provider-activation-hold', 'listing AI status');
  same(evidence?.remaining?.v52OwnerApproval, 'open', 'V5.2 status');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    same(value, false, `boundary ${key}`);
  }
  same(Object.keys(evidence?.boundaries ?? {}).length, 30, 'boundary count');

  const serialized = JSON.stringify(evidence);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|sms.?code.{0,24}[0-9]{4,8}|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(serialized)) {
    fail('N28 evidence contains private or credential-shaped material.');
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n28-current-candidate-pixel-surface-matrix-2026090306.json',
  ), 'utf8'));
  validateN28CurrentCandidatePixelSurfaceMatrix(evidence);
  process.stdout.write('N28 current-candidate Pixel surface matrix evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N28 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
