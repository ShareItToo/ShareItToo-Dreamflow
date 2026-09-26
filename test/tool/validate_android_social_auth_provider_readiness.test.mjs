import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateAndroidSocialAuthProviderReadiness } from
  '../../tool/validate_android_social_auth_provider_readiness.mjs';

const evidenceUrl = new URL('../../store/social-auth-provider-readiness.json', import.meta.url);

function fixture() {
  return JSON.parse(readFileSync(evidenceUrl, 'utf8'));
}

test('accepts the exact email-and-Google Android pilot hold', () => {
  const result = validateAndroidSocialAuthProviderReadiness({ evidence: fixture() });
  assert.equal(result.androidPilotAuth, 'email-and-google');
  assert.equal(result.facebook.ready, false);
  assert.equal(result.apple.ready, false);
  assert.ok(result.facebook.missing.includes('metaDeveloperAppVerified'));
  assert.ok(result.apple.missing.includes('appleTokenRevocationImplemented'));
});

for (const provider of ['facebook', 'apple']) {
  test(`refuses an explicit ${provider} release while its provider gate is open`, () => {
    assert.throws(
      () => validateAndroidSocialAuthProviderReadiness({
        evidence: fixture(),
        requireProvider: provider,
      }),
      new RegExp(`${provider}_provider_not_ready`, 'u'),
    );
  });
}

test('rejects a fabricated activation without complete evidence', () => {
  const value = fixture();
  value.facebook.activationReady = true;
  assert.throws(
    () => validateAndroidSocialAuthProviderReadiness({ evidence: value }),
    /activation readiness/u,
  );
});

test('validates provider shape with synthetic evidence without activating the gate', () => {
  const value = fixture();
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'sit-social-provider-'));
  const evidenceRef = 'docs/evidence/external-gates/facebook-synthetic.json';
  const evidencePath = join(temporaryRoot, evidenceRef);
  mkdirSync(join(temporaryRoot, 'docs/evidence/external-gates'), { recursive: true });
  const binding = {
    applicationId: 'com.shareittoo.app',
    packageName: 'com.shareittoo.app',
    provider: 'facebook',
    candidate: {
      buildNumber: '2026092201',
      sourceCommit: 'a'.repeat(40),
      versionName: '1.0.0',
      environment: 'staging',
    },
    signing: {
      uploadCertificateSha1: 'aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa',
      uploadCertificateSha256: Array.from({ length: 32 }, () => 'bb').join(':'),
      playAppSigningCertificateSha1: 'cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc:cc',
    },
    redirect: {
      firebaseAuthHandler: 'https://shareittoo-staging.firebaseapp.com/__/auth/handler',
    },
  };
  writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-social-auth-provider-external-readback',
    provider: 'facebook',
    applicationId: 'com.shareittoo.app',
    observedAt: '2026-09-22T12:00:00Z',
    syntheticFixture: true,
    evidenceClass: 'synthetic',
    candidate: {
      applicationId: 'com.shareittoo.app',
      packageName: 'com.shareittoo.app',
      buildNumber: binding.candidate.buildNumber,
      sourceCommit: binding.candidate.sourceCommit,
      versionName: binding.candidate.versionName,
      environment: binding.candidate.environment,
    },
    signing: {
      packageName: 'com.shareittoo.app',
      ...binding.signing,
    },
    redirect: binding.redirect,
    externalReadbacks: Object.fromEntries(
      [
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
      ].map((key) => [key, true]),
    ),
    boundaries: { providerConsoleChanged: false, firebaseConsoleChanged: false },
  }, null, 2));
  value.facebook = {
    ...value.facebook,
    ...Object.fromEntries(
      [
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
      ].map((key) => [key, true]),
    ),
    activationReady: true,
    evidenceRef,
    candidateBinding: binding,
  };
  try {
    const result = validateAndroidSocialAuthProviderReadiness({
      evidence: value,
      repositoryRoot: temporaryRoot,
      allowSyntheticFixture: true,
    });
    assert.equal(result.facebook.ready, false);
    assert.ok(result.facebook.missing.includes('syntheticEvidenceNotEligible'));
    assert.equal(value.pilotDecision.facebookEnabled, false);
    assert.throws(
      () => validateAndroidSocialAuthProviderReadiness({
        evidence: value,
        repositoryRoot: temporaryRoot,
      }),
      /synthetic evidence/u,
    );
    const validEvidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const negativeMutations = [
      ['wrong application ID', (candidate) => { candidate.applicationId = 'com.example.other'; }],
      ['wrong candidate', (candidate) => { candidate.candidate.buildNumber = '2026092202'; }],
      ['wrong signing hash', (candidate) => { candidate.signing.uploadCertificateSha1 = '00'; }],
      ['missing required readback', (candidate) => {
        delete candidate.externalReadbacks.firebaseProviderEnabledVerified;
      }],
      ['missing explicit boundaries', (candidate) => { candidate.boundaries = {}; }],
    ];
    for (const [label, mutate] of negativeMutations) {
      const invalidEvidence = structuredClone(validEvidence);
      mutate(invalidEvidence);
      writeFileSync(evidencePath, JSON.stringify(invalidEvidence));
      assert.throws(
        () => validateAndroidSocialAuthProviderReadiness({
          evidence: value,
          repositoryRoot: temporaryRoot,
          allowSyntheticFixture: true,
        }),
        /evidence|binding/u,
        label,
      );
    }
    writeFileSync(evidencePath, JSON.stringify(validEvidence));
    assert.throws(
      () => validateAndroidSocialAuthProviderReadiness({
        evidence: value,
        repositoryRoot: temporaryRoot,
        allowSyntheticFixture: true,
        requireProvider: 'facebook',
      }),
      /facebook_provider_(?:decision_not_enabled|not_ready)/u,
    );
    const syntheticProviderEnabled = {
      ...value,
      pilotDecision: { ...value.pilotDecision, facebookEnabled: true },
    };
    assert.throws(
      () => validateAndroidSocialAuthProviderReadiness({
        evidence: syntheticProviderEnabled,
        repositoryRoot: temporaryRoot,
        allowSyntheticFixture: true,
        requireProvider: 'facebook',
      }),
      /pilot decision enables Facebook before its provider gate is ready/u,
    );

    const externalEvidencePath = join(temporaryRoot, 'external-facebook.json');
    writeFileSync(externalEvidencePath, JSON.stringify(validEvidence));
    rmSync(evidencePath, { force: true });
    symlinkSync(externalEvidencePath, evidencePath);
    assert.throws(
      () => validateAndroidSocialAuthProviderReadiness({
        evidence: value,
        repositoryRoot: temporaryRoot,
        allowSyntheticFixture: true,
      }),
      /symbolic link/u,
    );
    rmSync(evidencePath, { force: true });
    writeFileSync(evidencePath, JSON.stringify(validEvidence));

    assert.throws(
      () => validateAndroidSocialAuthProviderReadiness({
        evidence: value,
        repositoryRoot: temporaryRoot,
        allowSyntheticFixture: true,
        beforeEvidenceOpen: () => {
          rmSync(evidencePath, { force: true });
          symlinkSync(externalEvidencePath, evidencePath);
        },
      }),
      /symbolic link/u,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a ready provider that points to a missing sanitized evidence artifact', () => {
  const value = fixture();
  value.facebook.activationReady = true;
  value.facebook.evidenceRef = 'docs/evidence/external-gates/missing-facebook.json';
  assert.throws(
    () => validateAndroidSocialAuthProviderReadiness({ evidence: value }),
    /activation readiness/u,
  );
});

test('rejects malformed, generic, wrong-provider, wrong-binding and incomplete evidence', () => {
  const cases = [
    ['malformed', '{'],
    ['generic', JSON.stringify({ schemaVersion: 1, kind: 'technical-setup-manifest' })],
    ['wrong-provider', JSON.stringify({
      schemaVersion: 1,
      kind: 'sit-social-auth-provider-external-readback',
      provider: 'apple',
    })],
  ];
  for (const [name, content] of cases) {
    const temporaryRoot = mkdtempSync(join(tmpdir(), `sit-social-${name}-`));
    const evidenceRef = `docs/evidence/external-gates/${name}.json`;
    const evidencePath = join(temporaryRoot, evidenceRef);
    mkdirSync(join(temporaryRoot, 'docs/evidence/external-gates'), { recursive: true });
    writeFileSync(evidencePath, content);
    const value = fixture();
    value.facebook.activationReady = true;
    value.facebook.evidenceRef = evidenceRef;
    try {
      assert.throws(
        () => validateAndroidSocialAuthProviderReadiness({
          evidence: value,
          repositoryRoot: temporaryRoot,
          allowSyntheticFixture: true,
        }),
        /evidence/u,
        name,
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('rejects silently enabling Apple in the Android pilot decision', () => {
  const value = fixture();
  value.pilotDecision.appleEnabled = true;
  assert.throws(
    () => validateAndroidSocialAuthProviderReadiness({ evidence: value }),
    /pilot decision/u,
  );
});

test('rejects any provider-console mutation claim', () => {
  const value = fixture();
  value.boundaries.providerConsoleChanged = true;
  assert.throws(
    () => validateAndroidSocialAuthProviderReadiness({ evidence: value }),
    /provider mutation/u,
  );
  const missingBoundary = fixture();
  missingBoundary.boundaries = {};
  assert.throws(
    () => validateAndroidSocialAuthProviderReadiness({ evidence: missingBoundary }),
    /provider mutation/u,
  );
});
