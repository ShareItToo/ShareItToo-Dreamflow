import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSocialProviderActivation } from
  '../../tool/validate_social_provider_activation.mjs';

const googleOnly = {
  SIT_SOCIAL_GOOGLE_ENABLED: '1',
  SIT_SOCIAL_APPLE_ENABLED: '0',
  SIT_SOCIAL_FACEBOOK_ENABLED: '0',
};

test('accepts a Google-only iOS release profile with external providers off', () => {
  assert.deepEqual(validateSocialProviderActivation({
    platform: 'ios',
    environment: googleOnly,
  }), {
    platform: 'ios',
    googleEnabled: true,
    appleEnabled: false,
    facebookEnabled: false,
    providerReadinessValidated: true,
  });
});

for (const provider of ['apple', 'facebook']) {
  test(`rejects an ${provider} activation while its sanitized readiness gate is open`, () => {
    assert.throws(() => validateSocialProviderActivation({
      platform: 'ios',
      environment: { ...googleOnly, [`SIT_SOCIAL_${provider.toUpperCase()}_ENABLED`]: '1' },
    }), new RegExp(`${provider}_provider_not_ready`, 'u'));
  });
}

test('rejects an enabled provider outside the allowlist', () => {
  assert.throws(() => validateSocialProviderActivation({
    platform: 'ios',
    environment: { ...googleOnly, SIT_SOCIAL_TWITTER_ENABLED: '1' },
  }), /provider flag is not allowed/u);
});

test('rejects malformed platform and flag values', () => {
  assert.throws(() => validateSocialProviderActivation({
    platform: 'watchos',
    environment: googleOnly,
  }), /platform is invalid/u);
  assert.throws(() => validateSocialProviderActivation({
    platform: 'ios',
    environment: { ...googleOnly, SIT_SOCIAL_APPLE_ENABLED: 'yes' },
  }), /SIT_SOCIAL_APPLE_ENABLED must be/u);
});
