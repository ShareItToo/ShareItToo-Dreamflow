import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('Remote QA Android wiring is separate, staging-only and owner-distributed', () => {
  const gradle = read('android/app/build.gradle');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const identity = read('lib/services/release_identity.dart');
  const build = read('scripts/build_android_remote_qa_candidate.sh');
  const privacy = read('tool/verify_android_binary_privacy.mjs');

  assert.match(gradle, /SIT_REMOTE_QA_BUILD/u);
  assert.match(gradle, /SIT_DISABLE_FIREBASE_ANDROID_PLUGINS/u);
  assert.match(gradle, /remoteQaRequested != firebaseAndroidPluginsDisabled/u);
  assert.match(gradle, /com\.shareittoo\.app\.qa/u);
  assert.match(gradle, /ShareItToo QA/u);
  assert.match(manifest, /\$\{sitAppLabel\}/u);
  assert.match(manifest, /\$\{sitAppLinksAutoVerify\}/u);

  assert.match(identity, /remoteQa != remoteQaIdentity/u);
  assert.match(identity, /remoteQa && channel != 'staging'/u);

  assert.ok(build.includes('API_BASE_URL="https://staging.shareittoo.com/api/v1"'));
  assert.match(build, /com\.shareittoo\.app\.qa/u);
  assert.match(build, /--target-platform android-arm64/u);
  assert.match(build, /app-release\.apk/u);
  assert.doesNotMatch(build, /--split-per-abi/u);
  assert.match(build, /lib\/arm64-v8a\/libapp\.so/u);
  assert.match(build, /lib\/arm64-v8a\/libflutter\.so/u);
  assert.match(build, /Remote QA APK Flutter runtime must be arm64-v8a only/u);
  assert.ok(build.includes("packaged_native_abis\" == 'arm64-v8a,armeabi-v7a,x86_64'"));
  assert.ok(build.includes('\\"abiScope\\": \\"flutter-runtime-only\\"'));
  assert.ok(build.includes('\\"flutterRuntimeAbi\\": \\"arm64-v8a\\"'));
  assert.ok(build.includes(
    '\\"packagedNativeAbis\\": [\\"arm64-v8a\\", \\"armeabi-v7a\\", \\"x86_64\\"]',
  ));
  assert.match(build, /SIT_SOCIAL_GOOGLE_ENABLED=false/u);
  assert.match(build, /SIT_SOCIAL_APPLE_ENABLED=false/u);
  assert.match(build, /SIT_SOCIAL_FACEBOOK_ENABLED=false/u);
  assert.match(build, /SIT_REQUIRE_STORE_SUBMISSION/u);
  assert.ok(build.includes('\\"storeUploaded\\": false'));
  assert.ok(build.includes('\\"productionAllowed\\": false'));
  assert.ok(build.includes('\\"realMoneyAllowed\\": false'));
  assert.doesNotMatch(build, /127\.0\.0\.1/u);

  assert.match(privacy, /args\['application-id'\]/u);
  assert.ok(privacy.includes('^com\\.shareittoo\\.app(?:\\.qa)?$'));

  const mode = statSync(resolve(root, 'scripts/build_android_remote_qa_candidate.sh')).mode;
  assert.notEqual(mode & 0o100, 0, 'Remote QA build script must remain executable');
  assert.equal(mode & 0o022, 0, 'Remote QA build script must not be group- or world-writable');
});
