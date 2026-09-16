#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp148-android-social-provider-activation-guard-20260914.json';
const handoverPath =
  'docs/operations/WP148_ANDROID_SOCIAL_PROVIDER_ACTIVATION_GUARD_2026-09-14.md';

function fail(message) {
  throw new Error(`WP148 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function digest(repositoryRoot, path) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

export function validateWp148AndroidSocialProviderActivationGuard({
  evidence,
  repositoryRoot = root,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp148-android-social-provider-activation-guard', 'kind');
  exact(value?.status, 'technical-closure-provider-gates-hold', 'status');
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '7f9ae2c438494da0a25cafdb39ca8d3892f21a8e',
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository');
  exact(value?.pilotAuthentication, {
    platform: 'android',
    provenPaths: ['email', 'google'],
    facebook: 'OPEN',
    apple: 'OPEN_OPTIONAL_FOR_ANDROID_PILOT',
    candidateChanged: false,
    providerEnabled: false,
  }, 'pilot authentication');
  exact(value?.facebook, {
    localImplementationPrepared: true,
    privacyHardeningPrepared: true,
    buildActivationGuarded: true,
    metaAndFirebaseConfigurationEvidencePresent: false,
    uploadAndPlayKeyHashesVerified: false,
    exactCandidateAcceptancePassed: false,
    activationReady: false,
  }, 'Facebook result');
  exact(value?.apple, {
    androidImplementationPrepared: true,
    requiredForAndroidPilot: false,
    buildActivationGuarded: true,
    developerMembershipAndServiceConfigurationEvidencePresent: false,
    privateRelayAndConsentRequirementsResolved: false,
    tokenRevocationImplemented: false,
    exactCandidateAcceptancePassed: false,
    activationReady: false,
  }, 'Apple result');
  exact(value?.implementation, {
    readinessManifest: 'store/social-auth-provider-readiness.json',
    readinessValidator: 'tool/validate_android_social_auth_provider_readiness.mjs',
    releaseBuildGate: 'scripts/build_android_release_candidate.sh',
    facebookFlagRequiresExactProviderReadiness: true,
    appleFlagRequiresExactProviderReadiness: true,
    invalidFlagValuesFailClosed: true,
    credentialsRemainOutsideGit: true,
  }, 'implementation');
  exact(value?.verification?.fullTechnicalRegressionCiMetadataMode,
    'success', 'CI-equivalent technical regression');
  exact(value?.verification?.localRetainedCandidateArtifactGate,
    'expected-hold-runtime-drift-after-artifact-source',
    'retained candidate artifact gate');
  exact(value?.verification?.candidateRefreshRequiredBeforeNextReleaseArtifact,
    true, 'candidate refresh requirement');
  exact(value?.portfolio, { pass: 22, partial: 5, open: 5 }, 'portfolio');
  exact(value?.nextIndependentLane, 'durable-private-registry-pull-readiness', 'next lane');
  if (value?.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('cannot claim an external or live mutation.');
  }
  if (Object.keys(value?.sourceInventory ?? {}).length !== 8) {
    fail('source inventory is incomplete.');
  }
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(digest(repositoryRoot, path), expected, `source inventory ${path}`);
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|teamId|keyId/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'FACEBOOK AND APPLE PROVIDER GATES HOLD',
    'registration and Google sign-in are already proven',
    'does not yet prove explicit',
    'authorization-token revocation',
    'One strictly higher, exact-head signed',
    '22 PASS / 5 PARTIAL / 5 OPEN',
    'No provider console, Firebase, account, membership, agreement, credential',
  ]) {
    if (!handover.includes(marker)) fail('handover is incomplete.');
  }
  return Object.freeze({
    status: value.status,
    portfolio: value.portfolio,
    facebook: value.facebook.activationReady,
    apple: value.apple.activationReady,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp148AndroidSocialProviderActivationGuard();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP148 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
