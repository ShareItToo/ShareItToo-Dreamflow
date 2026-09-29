import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const build = readFileSync(
  new URL('../../scripts/build_android_local_qa_candidate.sh', import.meta.url),
  'utf8',
);
const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');
const debugManifest = readFileSync(
  new URL('../../android/app/src/debug/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const mainManifest = readFileSync(
  new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const preflight = readFileSync(
  new URL('../../scripts/release_candidate_preflight.sh', import.meta.url),
  'utf8',
);
const releaseBuild = readFileSync(
  new URL('../../scripts/build_android_release_candidate.sh', import.meta.url),
  'utf8',
);
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const localQaBuildScript = fileURLToPath(
  new URL('../../scripts/build_android_local_qa_candidate.sh', import.meta.url),
);

function runLocalQaBuild(overrides = {}) {
  const env = { ...process.env };
  for (const name of [
    'SIT_LOCAL_QA_BUILD_NUMBER',
    'SIT_INSTALLED_PLAY_BUILD_NUMBER',
    'SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER',
  ]) delete env[name];
  return spawnSync('bash', [localQaBuildScript], {
    cwd: repositoryRoot,
    env: { ...env, SIT_CONFIRM_LOCAL_INTERNAL_QA: '1', ...overrides },
    encoding: 'utf8',
  });
}

test('R2 build is explicit, local-loopback-only and enables only technical QA surfaces', () => {
  for (const marker of [
    'SIT_CONFIRM_LOCAL_INTERNAL_QA',
    'SIT_LOCAL_INTERNAL_QA_SIGNING=1',
    'http://127.0.0.1:18080/api/v1',
    'SIT_BLUE_OCEAN_LISTING_ASSISTANT=true',
    'SIT_SYNTHETIC_CLONE_BOOKING_LANE=true',
    'SIT_LOCAL_QA_BUILD_NUMBER',
    'SIT_INSTALLED_PLAY_BUILD_NUMBER',
    'SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER',
    'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=true',
    'SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED=false',
    'SIT_PLANNER_TECHNICAL_UI_ENABLED=true',
    'SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED=true',
    'SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=true',
    'SIT_REQUIRE_STORE_SUBMISSION',
    'aabCreated',
    'providerCallPerformed',
    'apiBillingCreated',
  ]) {
    assert.match(build, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(build, /APPLICATION_ID="com\.shareittoo\.app\.qa"/u);
  assert.match(build, /SIT_DISABLE_FIREBASE_ANDROID_PLUGINS=1 \\\n/u);
});

test('synthetic clone is local-QA-only and release candidates fail closed', () => {
  assert.match(build, /SIT_LOCAL_QA_BUILD_NUMBER="\$BUILD_NUMBER" \\\n/u);
  assert.match(build, /SIT_INSTALLED_PLAY_BUILD_NUMBER="\$INSTALLED_PLAY_BUILD_NUMBER" \\\n/u);
  assert.match(build, /SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER="\$FINAL_PLAY_SUCCESSOR_BUILD_NUMBER" \\\n/u);
  assert.match(build, /node tool\/validate_android_local_qa_candidate\.mjs/u);
  assert.match(releaseBuild, /SIT_SYNTHETIC_CLONE_BOOKING_LANE:-0/u);
  assert.match(
    releaseBuild,
    /Synthetic clone booking is local-QA-only and cannot be carried/u,
  );
  assert.match(
    releaseBuild,
    /--dart-define=SIT_SYNTHETIC_CLONE_BOOKING_LANE=\$synthetic_clone_booking_lane/u,
  );
  assert.doesNotMatch(releaseBuild, /SIT_SYNTHETIC_CLONE_BOOKING_LANE=true/u);
});

test('local-QA and Play build ordering stays explicit instead of freezing an observed version', () => {
  assert.doesNotMatch(build, /DEFAULT_BUILD_NUMBER|2026082303/u);
  assert.match(build, /BUILD_NUMBER="\$\{SIT_LOCAL_QA_BUILD_NUMBER:-\}"/u);
  assert.match(build, /INSTALLED_PLAY_BUILD_NUMBER="\$\{SIT_INSTALLED_PLAY_BUILD_NUMBER:-\}"/u);
  assert.match(build, /FINAL_PLAY_SUCCESSOR_BUILD_NUMBER="\$\{SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER:-\}"/u);
  assert.match(
    build,
    /Build ordering must be installed Play < local QA < final Play successor/u,
  );
  assert.match(
    readFileSync(
      new URL('../../docs/operations/local-qa-synthetic-clone-booking-lane.md', import.meta.url),
      'utf8',
    ),
    /installed Play < local QA < final Play successor/u,
  );
});

test('local-QA shell guard rejects missing ordering inputs before Flutter can start', () => {
  const result = runLocalQaBuild();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SIT_LOCAL_QA_BUILD_NUMBER is required/u);
});

test('local-QA shell guard rejects equal and reversed Play ordering inputs', () => {
  const equal = runLocalQaBuild({
    SIT_INSTALLED_PLAY_BUILD_NUMBER: '2099123001',
    SIT_LOCAL_QA_BUILD_NUMBER: '2099123001',
    SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER: '2099123002',
  });
  assert.notEqual(equal.status, 0);
  assert.match(equal.stderr, /Build ordering must be installed Play < local QA < final Play successor/u);

  const reversed = runLocalQaBuild({
    SIT_INSTALLED_PLAY_BUILD_NUMBER: '2099123003',
    SIT_LOCAL_QA_BUILD_NUMBER: '2099123002',
    SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER: '2099123004',
  });
  assert.notEqual(reversed.status, 0);
  assert.match(reversed.stderr, /Build ordering must be installed Play < local QA < final Play successor/u);
});

test('canonical debug signing and cleartext are both explicit debug-only exceptions', () => {
  assert.match(gradle, /localInternalQaRequested/u);
  assert.match(gradle, /qaPackageRequested = remoteQaRequested \|\| localInternalQaRequested/u);
  assert.match(gradle, /if \(qaPackageRequested\) \{\s*applicationId = "com\.shareittoo\.app\.qa"/u);
  assert.match(gradle, /applicationId = "com\.shareittoo\.app"/u);
  assert.match(gradle, /qaPackageRequested != firebaseAndroidPluginsDisabled/u);
  assert.match(gradle, /contains\('debug'\)/u);
  assert.match(gradle, /debug \{[\s\S]*signingConfig = signingConfigs\.getByName\("release"\)/u);
  assert.match(gradle, /manifestPlaceholders\.sitUsesCleartextTraffic = "false"/u);
  assert.match(
    gradle,
    /debug \{[\s\S]*localInternalQaRequested[\s\S]*manifestPlaceholders\.sitUsesCleartextTraffic = "true"/u,
  );
  assert.doesNotMatch(debugManifest, /usesCleartextTraffic/u);
  assert.match(mainManifest, /android:usesCleartextTraffic="\$\{sitUsesCleartextTraffic\}"/u);
  assert.match(
    preflight,
    /manifestPlaceholders\.sitAppLinksAutoVerify = qaPackageRequested \? "false" : "true"/u,
  );
  assert.match(preflight, /manifestPlaceholders\.sitUsesCleartextTraffic = "false"/u);
  assert.match(preflight, /guarded manifest placeholder/u);
});
