#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n25ClosureHead: '83a50ff4d686a3ba6e83fdd398ca3fd89c938e61',
  candidateSourceHead: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  diagnosticFoundationHead: 'c4b3ee29100474bc4da9bf057b9235d1b7dccbc5',
  evidenceSemanticsHead: '1ad0b40ab3d4d703bca4099eec1e275fad5648a2',
  secretRatchetHead: '0dfcd7760ae87c554d7ff42c40ac86d6f02fb3ab',
  ratchetInventoryHead: 'f23d9f90541ac63d50d52c25247831acee5e410b',
  apkSha256: '37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194',
  signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  privateStateSha256: '4664bb62ebd778e64806242e9c287addc5ec3c15bc66207ca410e956ccb8e12a',
  githubRegressionRun: 33751508842,
  githubCodeqlRun: 33751508867,
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N26 value.`);
}

export function validateN26PixelPhoneBackendGatePreflight(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n26-pixel-phone-backend-gate-preflight', 'kind');
  same(
    evidence?.status,
    'backend-gate-preflight-passed-real-sms-owner-step-pending-live-gates-closed',
    'status',
  );
  same(evidence?.source?.branch, 'codex/master-workflow-20260808', 'branch');
  for (const key of [
    'n25ClosureHead',
    'candidateSourceHead',
    'diagnosticFoundationHead',
    'evidenceSemanticsHead',
    'secretRatchetHead',
    'ratchetInventoryHead',
  ]) same(evidence?.source?.[key], expected[key], key);

  const candidate = evidence?.candidate;
  same(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  same(candidate?.versionName, '1.0.0', 'versionName');
  same(candidate?.buildNumber, '2026090306', 'buildNumber');
  same(candidate?.delivery, 'direct-apk', 'delivery');
  same(candidate?.apkSha256, expected.apkSha256, 'APK SHA-256');
  same(candidate?.signingCertificateSha256, expected.signingCertificateSha256, 'certificate SHA-256');
  same(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'API base URL');
  same(candidate?.exactInstalledHashMatched, true, 'installed candidate');
  same(candidate?.candidateIsAncestor, true, 'candidate ancestry');
  same(candidate?.postCandidateChangedPathCount, 71, 'post-candidate path count');
  same(candidate?.mobileSourceChangedAfterCandidate, false, 'post-candidate mobile source');

  const device = evidence?.device;
  same(device?.physical, true, 'physical device');
  same(device?.manufacturer, 'Google', 'device manufacturer');
  same(device?.model, 'Pixel 7 Pro', 'device model');
  same(device?.containsRawDeviceIdentifier, false, 'raw device identifier claim');

  const backendGate = evidence?.backendGateObservation;
  same(backendGate?.authenticatedStatusRead, true, 'authenticated status read');
  same(backendGate?.enabled, true, 'backend gate');
  same(backendGate?.advertisedProvider, 'firebase-phone', 'advertised provider');
  same(backendGate?.diagnosticSessionRevoked, true, 'diagnostic session cleanup');
  same(backendGate?.privateStateSha256, expected.privateStateSha256, 'private state SHA-256');

  const history = evidence?.historicalEvidence;
  same(history?.consoleObservationDate, '2026-08-14', 'historical console date');
  same(history?.phoneProviderWasEnabled, true, 'historical provider state');
  same(history?.germanyOnlyRegionWasSaved, true, 'historical region state');
  same(history?.realSmsCandidateBuildNumber, '2026081403', 'historical SMS build');
  same(history?.realSmsWasDeliveredOnHistoricalCandidate, true, 'historical SMS delivery');
  same(history?.validCodeWasAcceptedOnHistoricalCandidate, true, 'historical code acceptance');
  same(history?.historicalEvidenceIsNotCurrentCandidateProof, true, 'historical scope');

  const current = evidence?.currentCandidatePhoneProof;
  for (const key of [
    'firebaseConsoleReadbackPerformed',
    'smsRegionReadbackPerformed',
    'smsRequested',
    'realSmsDelivered',
    'invalidCodeRejected',
    'validCodeAccepted',
    'verifiedStatePersistedAfterColdRestart',
  ]) same(current?.[key], false, `current-candidate ${key}`);
  same(current?.ownerActionRequired, true, 'owner action');
  same(
    current?.nextPhase,
    'request-with-private-german-phone-then-observe-owner-code',
    'next phone phase',
  );

  const ratchet = evidence?.secretScanRatchet;
  same(ratchet?.initialFailingRegressionRun, 33750353633, 'initial failing Regression');
  same(ratchet?.findingRule, 'static_password_property', 'finding rule');
  same(ratchet?.findingSourceHead, expected.diagnosticFoundationHead, 'finding source');
  for (const key of [
    'findingWasSyntheticTestFixture',
    'currentFixtureConstructedAtRuntime',
    'scannerRuleUnchanged',
    'exactHistoricalFindingReviewed',
    'dependentInventoryChainRefreshedThroughRw20',
  ]) same(ratchet?.[key], true, `ratchet ${key}`);
  same(ratchet?.reviewedHistoricalFindingCount, 21, 'reviewed finding count');
  same(ratchet?.finalHistoryAndWorkingTreeScan, 'passed', 'final secret scan');

  const qa = evidence?.qa;
  same(qa?.focusedDiagnosticTestsPassed, 7, 'focused tests');
  same(qa?.preEvidenceRepositoryToolTestsPassed, 2110, 'pre-evidence tool tests');
  same(qa?.closureRepositoryToolTestsPassed, 2114, 'closure tool tests');
  same(qa?.completeLocalRegression, 'passed', 'local regression');
  same(qa?.backendTestsTotal, 797, 'Backend test total');
  same(qa?.backendTestsPassed, 795, 'Backend passed tests');
  same(qa?.backendExpectedDatabaseSkips, 2, 'Backend database skips');
  same(qa?.realPostgresFresh, 'passed', 'fresh PostgreSQL');
  same(qa?.realPostgresRecovery, 'passed', 'PostgreSQL recovery');
  same(qa?.flutterTestsPassed, 652, 'Flutter tests');
  same(qa?.analyzer, 'passed-zero', 'analyzer');
  same(qa?.webWasm, 'passed', 'Web/Wasm');
  same(qa?.loopbackSmoke, 'passed', 'loopback');
  same(qa?.androidDebugBuild, 'passed', 'Android debug build');
  same(qa?.githubRegressionRun, expected.githubRegressionRun, 'GitHub Regression run');
  same(qa?.githubRegression, 'passed', 'GitHub Regression');
  same(qa?.githubCodeqlRun, expected.githubCodeqlRun, 'GitHub CodeQL run');
  same(qa?.githubCodeql, 'passed', 'GitHub CodeQL');
  same(qa?.cleanCheckoutReproducibility, 'passed', 'clean checkout');
  same(qa?.openCodeScanningAlerts, 0, 'code-scanning alerts');
  same(qa?.prNumber, 7, 'PR number');
  same(qa?.prDraft, true, 'PR Draft');
  same(qa?.prMerged, false, 'PR merged');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    same(value, false, `boundary ${key}`);
  }
  same(Object.keys(evidence?.boundaries ?? {}).length, 19, 'boundary count');

  const serialized = JSON.stringify(evidence);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|sms.?code.{0,24}[0-9]{4,8}|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(serialized)) {
    fail('N26 evidence contains private or credential-shaped material.');
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n26-pixel-phone-backend-gate-preflight-2026090306.json',
  ), 'utf8'));
  validateN26PixelPhoneBackendGatePreflight(evidence);
  process.stdout.write('N26 Pixel phone backend-gate preflight evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N26 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
