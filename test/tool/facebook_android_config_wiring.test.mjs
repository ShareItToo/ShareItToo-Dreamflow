import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateAndroidReleaseSocialProfile,
} from '../../tool/validate_android_release_social_profile.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('Android Meta values are packaged as strings, never numeric manifest literals', () => {
  const build = read('android/app/build.gradle');
  const manifest = read('android/app/src/main/AndroidManifest.xml');

  assert.match(build, /resValue "string", "facebook_app_id", facebookAppId/);
  assert.match(build, /resValue "string", "facebook_client_token", facebookClientToken/);
  assert.match(manifest, /android:value="@string\/facebook_app_id"/);
  assert.match(manifest, /android:value="@string\/facebook_client_token"/);
  assert.doesNotMatch(manifest, /android:value="\$\{facebookAppId\}"/);
});

test('release builds bind explicit fail-closed social-provider flags', () => {
  const buildScript = read('scripts/build_android_release_candidate.sh');
  for (const name of [
    'SIT_SOCIAL_GOOGLE_ENABLED',
    'SIT_SOCIAL_APPLE_ENABLED',
    'SIT_SOCIAL_FACEBOOK_ENABLED',
  ]) {
    assert.match(buildScript, new RegExp(`--dart-define=${name}=`));
  }
  assert.match(buildScript, /SIT_FACEBOOK_APP_ID[\s\S]*\^\[1-9\]\[0-9\]\{5,24\}\$/);
  assert.match(buildScript, /SIT_FACEBOOK_CLIENT_TOKEN/);
  assert.match(
    buildScript,
    /SIT_SOCIAL_FACEBOOK_ENABLED:-0[\s\S]*SIT_FACEBOOK_APP_ID[\s\S]*validate_social_provider_activation\.mjs --platform android/,
  );
  assert.match(
    buildScript,
    /SIT_SOCIAL_APPLE_ENABLED:-0[\s\S]*social_apple_enabled=true[\s\S]*validate_social_provider_activation\.mjs --platform android/,
  );
  assert.doesNotMatch(buildScript, /SIT_SOCIAL_FACEBOOK_ENABLED:-1/);
  assert.doesNotMatch(buildScript, /SIT_SOCIAL_FACEBOOK_ENABLED:-true/);
  for (const line of [
    '"  \\"socialAuth\\": {" \\',
    '"    \\"googleEnabled\\": $social_google_enabled," \\',
    '"    \\"appleEnabled\\": $social_apple_enabled," \\',
    '"    \\"facebookEnabled\\": $social_facebook_enabled" \\',
  ]) assert.ok(buildScript.includes(line), line);
  assert.match(buildScript, /--dart-define=SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED=true/u);
  assert.match(
    buildScript,
    /node tool\/validate_android_release_social_profile\.mjs/u,
  );
});

test('social profile validation rejects omitted inputs before release work', () => {
  assert.throws(
    () => validateAndroidReleaseSocialProfile({
      environment: {
        SIT_SOCIAL_GOOGLE_ENABLED: 'true',
        SIT_SOCIAL_APPLE_ENABLED: 'false',
      },
    }),
    /SIT_SOCIAL_FACEBOOK_ENABLED must be explicitly set/u,
  );
});

test('release builder stops on omitted social inputs before preflight or artifacts', () => {
  const environment = { ...process.env, SIT_REQUIRE_CLEAN: '0' };
  delete environment.SIT_SOCIAL_GOOGLE_ENABLED;
  delete environment.SIT_SOCIAL_APPLE_ENABLED;
  delete environment.SIT_SOCIAL_FACEBOOK_ENABLED;
  const result = spawnSync(
    'bash',
    ['scripts/build_android_release_candidate.sh'],
    { cwd: root, env: environment, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SIT_SOCIAL_GOOGLE_ENABLED must be explicitly set/u);
  assert.doesNotMatch(result.stderr, /release_candidate_preflight|flutter clean|run_checked_android_build/u);
});

test('social profile validation accepts the exact Google-only internal Staging rollover', () => {
  assert.deepEqual(
    validateAndroidReleaseSocialProfile({
      environment: {
        SIT_SOCIAL_GOOGLE_ENABLED: 'true',
        SIT_SOCIAL_APPLE_ENABLED: 'false',
        SIT_SOCIAL_FACEBOOK_ENABLED: 'false',
        SIT_ALLOW_CANDIDATE_ROLLOVER: '1',
        SIT_RELEASE_CHANNEL: 'internal',
        SIT_API_BASE_URL: 'https://staging.shareittoo.com/api/v1',
      },
    }),
    {
      google: true,
      apple: false,
      facebook: false,
      releaseChannel: 'internal',
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      candidateRollover: true,
      internalStaging: true,
    },
  );
});

for (const [name, value] of [
  ['Apple', { SIT_SOCIAL_APPLE_ENABLED: 'true' }],
  ['Facebook', { SIT_SOCIAL_FACEBOOK_ENABLED: 'true' }],
]) {
  test(`social profile validation rejects ${name} for an internal Staging rollover`, () => {
    assert.throws(
      () => validateAndroidReleaseSocialProfile({
        environment: {
          SIT_SOCIAL_GOOGLE_ENABLED: 'true',
          SIT_SOCIAL_APPLE_ENABLED: 'false',
          SIT_SOCIAL_FACEBOOK_ENABLED: 'false',
          SIT_ALLOW_CANDIDATE_ROLLOVER: '1',
          SIT_RELEASE_CHANNEL: 'internal',
          SIT_API_BASE_URL: 'https://staging.shareittoo.com/api/v1',
          ...value,
        },
      }),
      /candidate rollover requires Google=true, Apple=false, and Facebook=false/u,
    );
  });
}

test('product builds require the post-preflight social activation define', () => {
  const authService = read('lib/services/auth_service.dart');
  assert.match(authService, /SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED/u);
  assert.match(authService, /dart\.vm\.product/u);
  assert.match(
    authService,
    /AuthSocialProvider\.apple => _appleSocialAuthEnabled &&[\s\S]*_socialProviderActivationValidated/u,
  );
  assert.match(
    authService,
    /AuthSocialProvider\.facebook => _facebookSocialAuthEnabled &&[\s\S]*_socialProviderActivationValidated/u,
  );
});

test('the shared activation preflight covers both Android and iOS release paths', () => {
  const preflight = read('scripts/release_candidate_preflight.sh');
  assert.match(preflight, /validate_social_provider_activation\.mjs --platform "\$firebase_validation_platform"/u);
});
