import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
    /SIT_SOCIAL_FACEBOOK_ENABLED:-0[\s\S]*SIT_FACEBOOK_APP_ID/,
  );
  assert.doesNotMatch(buildScript, /SIT_SOCIAL_FACEBOOK_ENABLED:-1/);
  assert.doesNotMatch(buildScript, /SIT_SOCIAL_FACEBOOK_ENABLED:-true/);
  for (const line of [
    '"  \\"socialAuth\\": {" \\',
    '"    \\"googleEnabled\\": $social_google_enabled," \\',
    '"    \\"appleEnabled\\": $social_apple_enabled," \\',
    '"    \\"facebookEnabled\\": $social_facebook_enabled" \\',
  ]) assert.ok(buildScript.includes(line), line);
});
