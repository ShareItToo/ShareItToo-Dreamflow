#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs';
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

const externalReadbackRequirements = Object.freeze({
  facebook: Object.freeze([
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
  ]),
  apple: Object.freeze([
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
    'appleTokenRevocationImplemented',
    'exactCandidateAcceptancePassed',
  ]),
});

const sha1Pattern = /^(?:[0-9a-f]{2}:){19}[0-9a-f]{2}$/iu;
const sha256Pattern = /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/iu;
const sourceCommitPattern = /^[0-9a-f]{40}$/iu;
const buildNumberPattern = /^\d{10}$/u;
const versionNamePattern = /^\d+\.\d+\.\d+$/u;

function expectedEvidenceBinding(provider) {
  return Object.freeze({
    applicationId: 'com.shareittoo.app',
    packageName: 'com.shareittoo.app',
    provider,
  });
}

function fail(message) {
  throw new Error(`Android social provider readiness ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function readProviderEvidence({ provider, evidenceRef, repositoryRoot, allowSyntheticFixture }) {
  const path = resolve(repositoryRoot, evidenceRef);
  let value;
  try {
    if (!statSync(path).isFile()) fail(`${provider} evidence artifact is not a file.`);
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error?.message?.startsWith('Android social provider readiness')) throw error;
    fail(`${provider} evidence artifact is malformed.`);
  }
  exact(value?.schemaVersion, 1, `${provider} evidence schema version`);
  exact(value?.kind, 'sit-social-auth-provider-external-readback',
    `${provider} evidence kind`);
  exact(value?.provider, provider, `${provider} evidence provider`);
  exact(value?.applicationId, 'com.shareittoo.app', `${provider} evidence application ID`);
  if (typeof value?.observedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value.observedAt)
      || Number.isNaN(Date.parse(value.observedAt))) {
    fail(`${provider} evidence observedAt is invalid.`);
  }
  if (typeof value?.syntheticFixture !== 'boolean') {
    fail(`${provider} evidence synthetic marker is invalid.`);
  }
  if (value.syntheticFixture && !allowSyntheticFixture) {
    fail(`${provider} synthetic evidence cannot activate a release gate.`);
  }
  if (!value.syntheticFixture && value.evidenceClass !== 'verified-external') {
    fail(`${provider} evidence class is invalid.`);
  }
  if (value.syntheticFixture && value.evidenceClass !== 'synthetic') {
    fail(`${provider} synthetic evidence class is invalid.`);
  }

  const candidate = value.candidate;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || candidate.applicationId !== 'com.shareittoo.app'
      || candidate.packageName !== 'com.shareittoo.app'
      || !buildNumberPattern.test(candidate.buildNumber ?? '')
      || !versionNamePattern.test(candidate.versionName ?? '')
      || !sourceCommitPattern.test(candidate.sourceCommit ?? '')
      || candidate.environment !== 'staging') {
    fail(`${provider} evidence candidate binding is invalid.`);
  }

  const signing = value.signing;
  if (!signing || typeof signing !== 'object' || Array.isArray(signing)
      || signing.packageName !== 'com.shareittoo.app'
      || !sha1Pattern.test(signing.uploadCertificateSha1 ?? '')
      || !sha256Pattern.test(signing.uploadCertificateSha256 ?? '')
      || !sha1Pattern.test(signing.playAppSigningCertificateSha1 ?? '')) {
    fail(`${provider} evidence signing binding is invalid.`);
  }

  const redirect = value.redirect;
  if (!redirect || typeof redirect !== 'object' || Array.isArray(redirect)
      || typeof redirect.firebaseAuthHandler !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.firebaseapp\.com\/__\/auth\/handler$/u.test(
        redirect.firebaseAuthHandler,
      )) {
    fail(`${provider} evidence redirect binding is invalid.`);
  }

  const expectedReadbacks = externalReadbackRequirements[provider];
  const readbacks = value.externalReadbacks;
  if (!readbacks || typeof readbacks !== 'object' || Array.isArray(readbacks)
      || expectedReadbacks.some((key) => readbacks[key] !== true)) {
    fail(`${provider} evidence external readbacks are incomplete.`);
  }
  if (!value.boundaries || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail(`${provider} evidence boundaries are invalid.`);
  }

  return Object.freeze({
    binding: Object.freeze({
      ...expectedEvidenceBinding(provider),
      candidate: Object.freeze({
        buildNumber: candidate.buildNumber,
        sourceCommit: candidate.sourceCommit,
        versionName: candidate.versionName,
        environment: candidate.environment,
      }),
      signing: Object.freeze({
        uploadCertificateSha1: signing.uploadCertificateSha1,
        uploadCertificateSha256: signing.uploadCertificateSha256,
        playAppSigningCertificateSha1: signing.playAppSigningCertificateSha1,
      }),
      redirect: Object.freeze({
        firebaseAuthHandler: redirect.firebaseAuthHandler,
      }),
    }),
  });
}

function readiness(
  providerName,
  provider,
  requiredKeys,
  repositoryRoot,
  allowSyntheticFixture,
) {
  const missing = requiredKeys.filter((key) => provider?.[key] !== true);
  if (typeof provider?.activationReady !== 'boolean') fail('activationReady is invalid.');
  const evidencePathValid = typeof provider.evidenceRef === 'string'
    && /^docs\/evidence\/external-gates\/[a-z0-9._-]+\.json$/u.test(provider.evidenceRef);
  if (provider.activationReady !== (missing.length === 0 && evidencePathValid)) {
    fail('activation readiness does not match its exact evidence and prerequisites.');
  }
  if (!provider.activationReady) return Object.freeze({ ready: false, missing });
  const evidence = readProviderEvidence({
    provider: providerName,
    evidenceRef: provider.evidenceRef,
    repositoryRoot,
    allowSyntheticFixture,
  });
  exact(provider.candidateBinding, evidence.binding,
    `${providerName} candidate/signing/redirect binding`);
  return Object.freeze({ ready: provider.activationReady, missing });
}

export function validateAndroidSocialAuthProviderReadiness({
  evidence,
  requireProvider = null,
  repositoryRoot = root,
  allowSyntheticFixture = false,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-android-social-auth-provider-readiness', 'kind');
  exact(value?.state, 'email-google-pilot-ready-facebook-apple-hold', 'state');
  exact(value?.observedOn, '2026-09-14', 'observation date');
  exact(value?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(value?.pilotDecision?.platform, 'android', 'pilot decision platform');
  exact(value?.pilotDecision?.emailEnabled, true, 'pilot decision email');
  exact(value?.pilotDecision?.googleEnabled, true, 'pilot decision Google');
  exact(value?.pilotDecision?.appleRequiredForAndroidPilot, false,
    'pilot decision Apple requirement');
  if (typeof value?.pilotDecision?.facebookEnabled !== 'boolean'
      || typeof value?.pilotDecision?.appleEnabled !== 'boolean') {
    fail('pilot decision provider flags are invalid.');
  }

  const facebook = readiness(
    'facebook', value?.facebook, facebookRequirements, repositoryRoot, allowSyntheticFixture,
  );
  const apple = readiness(
    'apple', value?.apple, appleRequirements, repositoryRoot, allowSyntheticFixture,
  );
  if (value.pilotDecision.facebookEnabled && !facebook.ready) {
    fail('pilot decision enables Facebook before its provider gate is ready.');
  }
  if (value.pilotDecision.appleEnabled && !apple.ready) {
    fail('pilot decision enables Apple before its provider gate is ready.');
  }
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
    if (value.pilotDecision[`${requireProvider}Enabled`] !== true) {
      fail(`${requireProvider}_provider_decision_not_enabled`);
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
