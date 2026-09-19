import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('R2 build is explicit, local-loopback-only and enables only technical QA surfaces', () => {
  for (const marker of [
    'SIT_CONFIRM_LOCAL_INTERNAL_QA',
    'SIT_LOCAL_INTERNAL_QA_SIGNING=1',
    'http://127.0.0.1:18080/api/v1',
    'SIT_BLUE_OCEAN_LISTING_ASSISTANT=true',
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
});

test('canonical debug signing and cleartext are both explicit debug-only exceptions', () => {
  assert.match(gradle, /localInternalQaRequested/u);
  assert.match(gradle, /contains\('debug'\)/u);
  assert.match(gradle, /debug \{[\s\S]*signingConfig = signingConfigs\.getByName\("release"\)/u);
  assert.match(gradle, /manifestPlaceholders\.sitUsesCleartextTraffic = "false"/u);
  assert.match(
    gradle,
    /debug \{[\s\S]*localInternalQaRequested[\s\S]*manifestPlaceholders\.sitUsesCleartextTraffic = "true"/u,
  );
  assert.doesNotMatch(debugManifest, /usesCleartextTraffic/u);
  assert.match(mainManifest, /android:usesCleartextTraffic="\$\{sitUsesCleartextTraffic\}"/u);
  assert.match(preflight, /manifestPlaceholders\.sitUsesCleartextTraffic = "false"/u);
  assert.match(preflight, /guarded manifest placeholder/u);
});
