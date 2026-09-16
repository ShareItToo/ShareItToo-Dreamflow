#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'store/social-auth-provider-readiness.json';

const facebookRequirements = Object.freeze([
  'androidOfficiallySupported',
  'localImplementationPrepared',
  'sdkAutomaticEventsDisabled',
  'sdkAdvertiserIdCollectionDisabled',
  'advertisingPermissionsRemoved',
  'externalConfigurationEvidencePresent',
  'metaDeveloperAppVerified',
  'firebaseProviderEnabledVerified',
  'appIdAndClientTokenProvisionedOutsideGit',
  'androidPackageNameVerified',
  'uploadCertificateKeyHashVerified',
  'playAppSigningKeyHashVerified',
  'firebaseOauthRedirectVerified',
  'testerOrAppReviewAccessVerified',
  'accountDeletionUrlVerified',
  'exactCandidateAcceptancePassed',
]);

const appleRequirements = Object.freeze([
  'androidOfficiallySupported',
  'localImplementationPrepared',
  'externalConfigurationEvidencePresent',
  'appleDeveloperProgramMembershipVerified',
  'servicesIdVerified',
  'teamAndKeyConfigurationVerified',
  'privateKeyStoredOutsideGit',
  'firebaseProviderEnabledVerified',
  'firebaseReturnUrlVerified',
  'androidSha1Verified',
  'privateEmailRelayRequirementResolved',
  'anonymizedIdentityConsentFlowApproved',
  'inAppAccountDeletionAvailable',
  'appleTokenRevocationImplemented',
  'exactCandidateAcceptancePassed',
]);

function fail(message) {
  throw new Error(`Android social provider readiness ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function readiness(provider, requiredKeys) {
  const missing = requiredKeys.filter((key) => provider?.[key] !== true);
  if (typeof provider?.activationReady !== 'boolean') fail('activationReady is invalid.');
  const evidencePresent = typeof provider.evidenceRef === 'string'
    && /^docs\/evidence\/external-gates\/[a-z0-9._-]+\.json$/u.test(provider.evidenceRef);
  if (provider.activationReady !== (missing.length === 0 && evidencePresent)) {
    fail('activation readiness does not match its exact evidence and prerequisites.');
  }
  return Object.freeze({ ready: provider.activationReady, missing });
}

export function validateAndroidSocialAuthProviderReadiness({
  evidence,
  requireProvider = null,
  repositoryRoot = root,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-android-social-auth-provider-readiness', 'kind');
  exact(value?.state, 'email-google-pilot-ready-facebook-apple-hold', 'state');
  exact(value?.observedOn, '2026-09-14', 'observation date');
  exact(value?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(value?.pilotDecision, {
    platform: 'android',
    emailEnabled: true,
    googleEnabled: true,
    facebookEnabled: false,
    appleEnabled: false,
    appleRequiredForAndroidPilot: false,
  }, 'pilot decision');

  const facebook = readiness(value?.facebook, facebookRequirements);
  const apple = readiness(value?.apple, appleRequirements);
  exact(value?.facebook?.activationReady, false, 'current Facebook hold');
  exact(value?.facebook?.evidenceRef, null, 'current Facebook evidence');
  exact(value?.apple?.activationReady, false, 'current Apple hold');
  exact(value?.apple?.evidenceRef, null, 'current Apple evidence');
  exact(value?.apple?.appleTokenRevocationImplemented, false, 'Apple revocation hold');
  exact(value?.apple?.inAppAccountDeletionAvailable, true, 'in-app deletion');

  exact(value?.officialSources, [
    {
      provider: 'firebase-facebook-flutter',
      url: 'https://firebase.google.com/docs/auth/flutter/federated-auth',
      checkedOn: '2026-09-14',
    },
    {
      provider: 'firebase-apple-android',
      url: 'https://firebase.google.com/docs/auth/android/apple',
      checkedOn: '2026-09-14',
    },
    {
      provider: 'meta-facebook-android',
      url: 'https://developers.facebook.com/documentation/facebook-login/android',
      checkedOn: '2026-09-14',
    },
  ], 'official sources');
  if (value?.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('cannot claim an external/provider mutation.');
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|teamId|keyId/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }

  if (requireProvider !== null) {
    if (!['facebook', 'apple'].includes(requireProvider)) fail('provider argument is invalid.');
    const selected = requireProvider === 'facebook' ? facebook : apple;
    if (!selected.ready) {
      fail(`${requireProvider}_provider_not_ready:${selected.missing.join(',')}`);
    }
  }
  return Object.freeze({
    state: value.state,
    facebook,
    apple,
    androidPilotAuth: 'email-and-google',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const providerFlag = process.argv[2];
    if (providerFlag && providerFlag !== '--provider') fail(`unknown argument: ${providerFlag}`);
    const provider = providerFlag ? process.argv[3] : null;
    if (providerFlag && !provider) fail('missing provider argument.');
    if (process.argv.length > (providerFlag ? 4 : 2)) fail('unexpected extra argument.');
    const result = validateAndroidSocialAuthProviderReadiness({ requireProvider: provider });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Android social provider readiness failed.'}\n`);
    process.exitCode = 1;
  }
}
