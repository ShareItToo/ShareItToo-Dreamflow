#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function enabled(value) {
  return value === '1' || value === 'true' || value === true;
}

function buildNumberFromPubspec(contents) {
  const match = /^version:\s*[^+\s]+\+(\d+)\s*$/mu.exec(contents);
  if (!match) fail('pubspec.yaml must contain a numeric Flutter build number.');
  return match[1];
}

export function validateGoogleOnlyNextCandidate({
  repositoryRoot,
  requireBuildable = false,
  environment = {},
  manifestPath = resolve(repositoryRoot, 'store/google-only-next-candidate.json'),
  pubspecContents = readFileSync(resolve(repositoryRoot, 'pubspec.yaml'), 'utf8'),
} = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const device = JSON.parse(readFileSync(resolve(repositoryRoot, 'store/device-validation.json'), 'utf8'));
  const policy = manifest.nextCandidatePolicy ?? {};
  const baseline = manifest.baselineCandidate ?? {};
  const built = manifest.builtCandidate ?? null;
  const allowedStates = ['prepared-not-built', 'built-local-not-uploaded'];
  if (manifest.schemaVersion !== 1 ||
      manifest.kind !== 'google-only-next-consolidated-candidate' ||
      !allowedStates.includes(manifest.state) ||
      baseline.applicationId !== device.candidate?.applicationId ||
      baseline.versionName !== device.candidate?.versionName ||
      baseline.buildNumber !== device.candidate?.buildNumber ||
      baseline.commit !== device.candidate?.commit ||
      baseline.releaseChannel !== 'internal' ||
      baseline.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1' ||
      policy.versionName !== baseline.versionName ||
      policy.buildNumberRule !== 'strictly-higher-than-baseline' ||
      policy.releaseChannel !== 'internal' ||
      policy.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1' ||
      policy.googleLoginEnabled !== true ||
      policy.appleLoginEnabled !== false ||
      policy.facebookLoginEnabled !== false ||
      policy.providerEvidenceRef !==
        'docs/evidence/b11/firebase-google-signin-provider-20260815.json' ||
      policy.firebaseCloudMessagingRetained !== true ||
      policy.firebaseCrashlyticsRetained !== true ||
      policy.independentDeviceServiceOptIns !== true ||
      policy.deviceServicesDefaultOff !== true ||
      policy.controlledCrashDiagnosticRequired !== true ||
      policy.controlledCrashDiagnosticRunIdRule !==
        'b11-android-<buildNumber>' ||
      policy.largeTextRemediationRequired !== true ||
      policy.v51LegalAssetsActivation !== 'draft-blocked') {
    fail('Google-only next-candidate plan is stale or no longer fail-closed.');
  }
  const requiredBeforeBuild = manifest.requiredBeforeBuild;
  const requiredCandidateControls = [
    'large-text wishlist and profile remediation is included',
    'Push and Crashlytics remain separate voluntary default-off choices',
    'exactly one sanitized internal Crashlytics run id is compiled',
    'V5.1 legal assets remain draft-blocked',
  ];
  if (!Array.isArray(requiredBeforeBuild) ||
      requiredCandidateControls.some(
        (requirement) => !requiredBeforeBuild.includes(requirement),
      )) {
    fail('Next-candidate build requirements omit a mandatory safety control.');
  }
  const provider = JSON.parse(readFileSync(resolve(
    repositoryRoot, policy.providerEvidenceRef), 'utf8'));
  if (provider.kind !== 'firebase-google-signin-provider-configuration' ||
      provider.firebase?.providerEnabled !== true ||
      provider.firebase?.appleProviderEnabled !== false ||
      provider.firebase?.facebookProviderEnabled !== false ||
      provider.localConfigurations?.android?.uploadSigningSha1ClientPresent !== true ||
      provider.localConfigurations?.android?.playAppSigningSha1ClientPresent !== true ||
      provider.localConfigurations?.android?.webClientCount !== 1 ||
      provider.candidate?.buildNumber !== baseline.buildNumber ||
      provider.candidate?.googleLoginReleaseGateEnabled !== false ||
      provider.candidate?.appleLoginReleaseGateEnabled !== false ||
      provider.candidate?.facebookLoginReleaseGateEnabled !== false) {
    fail('Google provider evidence is incomplete or contradicts the baseline candidate.');
  }
  const hardStops = manifest.hardStops ?? {};
  const requiredTrue = [
    'sameOrOlderBuildNumber',
    'appleWithoutAppleDeveloperConfiguration',
    'facebookWithoutMetaConfiguration',
    'productionApi',
    'storeSubmission',
    'realPayments',
  ];
  const requiredFalse = [
    'containsSecrets',
    'containsEmailAddresses',
    'containsAccountIdentifiers',
  ];
  if (Object.keys(hardStops).length !== 9 ||
      requiredTrue.some((key) => hardStops[key] !== true) ||
      requiredFalse.some((key) => hardStops[key] !== false)) {
    fail('Google-only next-candidate hard stops are incomplete or unsafe.');
  }
  const plannedBuildNumber = buildNumberFromPubspec(pubspecContents);
  if (manifest.state === 'prepared-not-built') {
    if (built !== null) {
      fail('A prepared candidate must not contain invented build evidence.');
    }
  } else if (built?.applicationId !== baseline.applicationId ||
      built?.versionName !== policy.versionName ||
      typeof built?.buildNumber !== 'string' ||
      !/^\d+$/u.test(built.buildNumber) ||
      BigInt(built.buildNumber) <= BigInt(baseline.buildNumber) ||
      BigInt(built.buildNumber) > BigInt(plannedBuildNumber) ||
      typeof built?.commit !== 'string' ||
      !/^[0-9a-f]{40}$/u.test(built.commit) ||
      built?.releaseChannel !== policy.releaseChannel ||
      built?.apiBaseUrl !== policy.apiBaseUrl ||
      typeof built?.aabSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(built.aabSha256) ||
      typeof built?.apkSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(built.apkSha256) ||
      built?.archivedAndVerified !== true ||
      built?.installedDirectOnPhysicalAndroid !== true ||
      built?.externalUploadPerformed !== false) {
    fail('The locally built candidate evidence is incomplete or unsafe.');
  }
  if (requireBuildable) {
    if (manifest.state !== 'prepared-not-built') {
      fail('The consolidated candidate is already built and must not be rebuilt in place.');
    }
    if (BigInt(plannedBuildNumber) <= BigInt(baseline.buildNumber)) {
      fail('Next consolidated candidate requires a strictly higher build number.');
    }
    if (!enabled(environment.SIT_SOCIAL_GOOGLE_ENABLED) ||
        enabled(environment.SIT_SOCIAL_APPLE_ENABLED) ||
        enabled(environment.SIT_SOCIAL_FACEBOOK_ENABLED)) {
      fail('Next consolidated candidate must enable Google only.');
    }
    const expectedCrashRunId = `b11-android-${plannedBuildNumber}`;
    if (!enabled(environment.SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC) ||
        environment.SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID !==
          expectedCrashRunId) {
      fail(
        'Next consolidated candidate requires exactly one build-bound sanitized Crashlytics run.',
      );
    }
    if ((environment.SIT_RELEASE_CHANNEL ?? 'internal') !== 'internal' ||
        (environment.SIT_API_BASE_URL ?? 'https://staging.shareittoo.com/api/v1') !==
          'https://staging.shareittoo.com/api/v1' ||
        enabled(environment.SIT_REQUIRE_STORE_SUBMISSION)) {
      fail('Google-only candidate is restricted to internal Staging without submission.');
    }
  }
  return {
    state: manifest.state,
    baselineBuildNumber: baseline.buildNumber,
    plannedBuildNumber,
    buildable: requireBuildable,
  };
}

function runCli() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const requireBuildable = process.argv.includes('--require-buildable');
  const unknown = process.argv.slice(2).filter((value) => value !== '--require-buildable');
  if (unknown.length) fail(`Unknown argument: ${unknown[0]}`);
  const result = validateGoogleOnlyNextCandidate({
    repositoryRoot,
    requireBuildable,
    environment: process.env,
  });
  process.stdout.write(
    `Google-only next candidate: PASS (${result.state}, baseline ${result.baselineBuildNumber}, ` +
      `planned ${result.plannedBuildNumber}, buildable=${result.buildable})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Google-only next-candidate validation failed.'}\n`);
    process.exitCode = 1;
  }
}
