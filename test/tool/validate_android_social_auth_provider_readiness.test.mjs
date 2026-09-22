import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
});
