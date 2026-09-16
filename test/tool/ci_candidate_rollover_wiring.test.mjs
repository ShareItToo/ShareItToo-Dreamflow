import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/regression.yml', import.meta.url),
  'utf8',
);
const androidBuild = readFileSync(
  new URL('../../scripts/build_android_release_candidate.sh', import.meta.url),
  'utf8',
);
const releasePreflight = readFileSync(
  new URL('../../scripts/release_candidate_preflight.sh', import.meta.url),
  'utf8',
);
const technicalRegression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const wrapperProperties = readFileSync(
  new URL('../../android/gradle/wrapper/gradle-wrapper.properties', import.meta.url),
  'utf8',
);
const playHandoffValidator = readFileSync(
  new URL('../../tool/validate_google_play_internal_handoff.mjs', import.meta.url),
  'utf8',
);

test('CI validates rollover metadata but builds a signed candidate only on explicit manual request', () => {
  assert.match(
    workflow,
    /name: Run regression script[\s\S]*?SIT_ALLOW_CANDIDATE_ROLLOVER: '1'[\s\S]*?bash scripts\/technical_regression_check\.sh/,
  );
  assert.match(
    workflow,
    /workflow_dispatch:[\s\S]*?build_release_candidate:[\s\S]*?default: false[\s\S]*?type: boolean/,
  );
  assert.match(
    workflow,
    /name: Build a signed, commit-bound Android release candidate\n\s+if: github\.event_name == 'workflow_dispatch' && inputs\.build_release_candidate[\s\S]*?SIT_ALLOW_CANDIDATE_ROLLOVER: '1'[\s\S]*?bash scripts\/build_android_release_candidate\.sh/,
  );
  assert.match(
    workflow,
    /push:\n\s+branches:\n\s+- main/,
  );
  assert.doesNotMatch(
    workflow,
    /branches:\n\s+- '\*\*'/,
  );
  assert.match(
    workflow,
    /pull_request:\n\s+paths-ignore:\n\s+- 'docs\/\*\*'/,
  );
  assert.match(
    workflow,
    /concurrency:[\s\S]*?cancel-in-progress: true/,
  );
});

test('Android packaging scopes Firebase validation to Android', () => {
  assert.match(
    androidBuild,
    /SIT_FIREBASE_VALIDATION_PLATFORM=android bash scripts\/release_candidate_preflight\.sh/,
  );
});

test('candidate rollover keeps the prior phone evidence read-only until the new binary is tested', () => {
  assert.match(
    releasePreflight,
    /validate_phone_verification_readiness\.mjs --allow-candidate-rollover/,
  );
  assert.match(
    technicalRegression,
    /validate_phone_verification_readiness\.mjs --allow-candidate-rollover/,
  );
});

test('local rollover verifies current-head bytes before accepting historical Play metadata', () => {
  assert.match(
    technicalRegression,
    /SIT_ALLOW_CANDIDATE_ROLLOVER[\s\S]*?validate_google_play_internal_handoff\.mjs --candidate-rollover/,
  );
  assert.match(
    technicalRegression,
    /validate_current_head_android_release_archive\.test\.mjs/,
  );
});

test('Play API 36 replacement transition is exact and remains fail closed', () => {
  assert.match(
    playHandoffValidator,
    /superseded-play-api36-replacement-pending/,
  );
  for (const path of [
    'android/app/build.gradle',
    'android/build.gradle',
    'android/settings.gradle',
    'lib/config/private_pilot_config.dart',
    'pubspec.yaml',
  ]) {
    assert.match(playHandoffValidator, new RegExp(path.replaceAll('/', '\\/')));
  }
  assert.match(playHandoffValidator, /unexpected runtime change/);
  assert.match(playHandoffValidator, /compileSdk and targetSdk must both be exactly 36/);
  assert.match(playHandoffValidator, /AGP 8\.9\.1 and compileSdkVersion 36/);
});

test('Android packaging derives missing Firebase client values from the exact local config without logging them', () => {
  assert.match(androidBuild, /deriveAndroidFirebaseReleaseEnvironment/);
  assert.match(androidBuild, /android\/app\/google-services\.json/);
  assert.ok(
    androidBuild.indexOf('deriveAndroidFirebaseReleaseEnvironment')
      < androidBuild.indexOf('release_candidate_preflight.sh'),
  );
  assert.doesNotMatch(androidBuild, /echo "\$firebase_env_lines"/);
});

test('local Android regression derives the same exact Firebase client values without logging them', () => {
  assert.match(technicalRegression, /deriveAndroidFirebaseReleaseEnvironment/);
  assert.match(technicalRegression, /android\/app\/google-services\.json/);
  assert.ok(
    technicalRegression.indexOf('deriveAndroidFirebaseReleaseEnvironment')
      < technicalRegression.indexOf('validate_firebase_release_config.mjs --platform'),
  );
  assert.doesNotMatch(technicalRegression, /echo "\$firebase_env_lines"/);
});

test('direct Android preflight derives the same exact Firebase client values without logging them', () => {
  assert.match(releasePreflight, /deriveAndroidFirebaseReleaseEnvironment/);
  assert.match(releasePreflight, /android\/app\/google-services\.json/);
  assert.ok(
    releasePreflight.indexOf('deriveAndroidFirebaseReleaseEnvironment')
      < releasePreflight.indexOf('validate_firebase_release_config.mjs --platform'),
  );
  assert.doesNotMatch(releasePreflight, /echo "\$firebase_env_lines"/);
});

test('Android packaging exposes a preflight-only path before either binary build', () => {
  assert.match(androidBuild, /SIT_BUILD_PREFLIGHT_ONLY/);
  const preflightOnly = androidBuild.indexOf('Android release build preflight passed without creating artifacts.');
  assert.ok(preflightOnly > androidBuild.indexOf('validate_firebase_release_config.mjs --require-configured'));
  assert.ok(preflightOnly < androidBuild.indexOf('node tool/run_checked_android_build.mjs appbundle'));
  assert.ok(preflightOnly < androidBuild.indexOf('node tool/run_checked_android_build.mjs apk'));
});

test('CI validates the cached checksum-bound Gradle wrapper once before Flutter builds', () => {
  assert.match(workflow, /uses: gradle\/actions\/setup-gradle@v6/);
  assert.match(workflow, /cache-provider: basic/);
  assert.match(
    workflow,
    /name: Verify the checksum-bound Gradle wrapper once\n\s+run: \.\/android\/gradlew --version/,
  );
  assert.equal(workflow.match(/\.\/android\/gradlew --version/g)?.length, 1);
  const wrapperStep = workflow.indexOf('name: Verify the checksum-bound Gradle wrapper once');
  assert.ok(wrapperStep > workflow.indexOf('uses: gradle/actions/setup-gradle@v6'));
  assert.ok(wrapperStep < workflow.indexOf('name: Run regression script'));
  assert.doesNotMatch(
    workflow.slice(wrapperStep, workflow.indexOf('name: Run regression script')),
    /for attempt|sleep|retry/,
  );
  assert.match(
    wrapperProperties,
    /^distributionUrl=https\\:\/\/downloads\.gradle\.org\/distributions\/gradle-8\.13-bin\.zip$/m,
  );
  assert.match(
    wrapperProperties,
    /^distributionSha256Sum=20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78$/m,
  );
  assert.match(wrapperProperties, /^networkTimeout=60000$/m);
  assert.match(wrapperProperties, /^validateDistributionUrl=true$/m);
});
