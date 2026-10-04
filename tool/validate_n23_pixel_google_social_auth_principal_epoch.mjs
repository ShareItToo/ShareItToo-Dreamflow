#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n22ClosureHead: '9e5a6d5af586a8d7d4298257bb1a2bd38fda3a03',
  authImplementationHead: '65bbbae1f1377ca39d9b6c4fd5d146ee3d312d6d',
  candidateArtifactSourceHead: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  diagnosticToolHead: '008943bf018e0420432360ce3169f34954343774',
  hashChainRepairHead: 'cac20555ba580f56813bfc74e15350113241eeda',
  versionCode: '2026090306',
  apkSha256: '37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194',
  aabSha256: '0724435cf212fcad167942c828a8869359d312fa00e82a1d35afc8b74551f4f6',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N23 value.`);
}

export function validateN23PixelGoogleSocialAuthPrincipalEpoch(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n23-pixel-google-social-auth-principal-epoch', 'kind');
  same(
    evidence?.status,
    'pixel-google-login-cold-start-repeat-principal-epoch-and-owner-restore-passed-live-gates-closed',
    'status',
  );
  for (const [key, value] of Object.entries(expected)) {
    const actual = key.endsWith('Head')
      ? evidence?.source?.[key]
      : evidence?.candidate?.[key];
    same(actual, value, key);
  }
  same(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'applicationId');
  same(evidence?.candidate?.channel, 'internal', 'channel');
  same(evidence?.candidate?.environment, 'staging', 'environment');
  same(evidence?.candidate?.installMethod, 'direct-apk-in-place', 'install method');
  same(evidence?.candidate?.firebaseConfigured, true, 'Firebase');
  same(evidence?.candidate?.binaryPrivacyScan, 'passed', 'binary privacy scan');
  same(evidence?.candidate?.googleEnabled, true, 'Google provider');
  same(evidence?.candidate?.appleEnabled, false, 'Apple provider');
  same(evidence?.candidate?.facebookEnabled, false, 'Facebook provider');

  for (const [key, value] of Object.entries(evidence?.principalEpochInvariant ?? {})) {
    if (value !== true) fail(`Principal/epoch invariant ${key} must remain true.`);
  }
  same(
    Object.keys(evidence?.principalEpochInvariant ?? {}).length,
    12,
    'principal/epoch invariant count',
  );

  const pixel = evidence?.pixel;
  same(pixel?.physical, true, 'physical Pixel');
  same(pixel?.model, 'Pixel 7 Pro', 'Pixel model');
  same(pixel?.installedVersionCode, '2026090306', 'installed version');
  same(pixel?.installedApkHashVerified, true, 'installed APK hash');
  same(pixel?.appDataPreserved, true, 'app-data preservation');
  same(pixel?.firstExactGoogleLogin, 'passed', 'first Google login');
  same(pixel?.coldStartSessionPersistence, 'passed', 'cold session');
  same(pixel?.repeatExactGoogleLogin, 'passed', 'repeat Google login');
  same(pixel?.sameStagingProfileAcrossAllObservations, true, 'stable profile');
  if (!/^[a-f0-9]{64}$/u.test(pixel?.profileObservationSha256 ?? '')) {
    fail('Profile observation digest is invalid.');
  }
  same(pixel?.duplicateAccountObserved, false, 'duplicate account observation');
  same(pixel?.accountCreationVersusExistingLinkage, 'not-asserted', 'linkage claim');
  same(pixel?.protectedSyntheticOwnerRestored, true, 'protected owner restoration');

  same(evidence?.staging?.health, 'passed', 'Staging health');
  same(evidence?.staging?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.staging?.stripeLivemode, false, 'Stripe livemode');
  same(evidence?.staging?.listingAiProvider, 'mock', 'listing AI provider');
  same(evidence?.staging?.deploymentPerformed, false, 'Staging deployment');

  const qa = evidence?.qa;
  same(qa?.focusedFlutterTestsPassed, 10, 'focused Flutter tests');
  same(qa?.changedFileAnalyzer, 'passed-zero-issues', 'changed-file analyzer');
  same(qa?.fullLocalRegressionHead, expected.hashChainRepairHead, 'local regression head');
  same(qa?.fullLocalRepositoryToolTestsPassed, 2093, 'repository tool tests');
  same(qa?.repositoryToolTestsSkipped, 0, 'repository skipped tests');
  same(qa?.fullFlutterTestsPassed, 652, 'Flutter tests');
  same(qa?.flutter, 'passed', 'Flutter');
  same(qa?.analyzer, 'passed-zero', 'analyzer');
  same(qa?.webWasm, 'passed', 'Web/Wasm');
  same(qa?.loopbackSmoke, 'passed', 'loopback smoke');
  same(qa?.androidDebugBuild, 'passed', 'Android debug build');
  same(qa?.cleanCheckoutReproducibility, 'passed', 'clean checkout');
  same(qa?.githubRegressionRun, 33737790776, 'GitHub regression run');
  same(qa?.githubRegression, 'passed', 'GitHub regression');
  same(qa?.githubCodeqlRun, 33737790875, 'GitHub CodeQL run');
  same(qa?.githubCodeql, 'passed', 'GitHub CodeQL');
  same(qa?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  same(qa?.prDraft, true, 'PR Draft');
  same(qa?.prMerged, false, 'PR merge');

  const repair = evidence?.ratchetRepair;
  same(
    JSON.stringify(repair?.failedGithubRegressionRuns),
    JSON.stringify([33735783365, 33737293624]),
    'failed ratchet run inventory',
  );
  same(repair?.productOrRuntimeFailure, false, 'product/runtime failure classification');
  same(repair?.privacySemanticsChanged, false, 'privacy semantics');
  same(repair?.providerDecisionChanged, false, 'provider decision');
  same(repair?.providerGateChanged, false, 'provider gate');
  same(repair?.dependentInventoriesRefreshedThroughRw20, true, 'inventory repair');
  same(repair?.temporaryWorkaroundRetained, false, 'temporary workaround');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  const serialized = JSON.stringify(evidence);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9])/u.test(serialized)) {
    fail('N23 evidence contains private or secret-shaped material.');
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n23-pixel-google-social-auth-principal-epoch-2026090306.json',
  ), 'utf8'));
  validateN23PixelGoogleSocialAuthPrincipalEpoch(evidence);
  process.stdout.write('N23 Pixel Google social-auth principal/epoch evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N23 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
