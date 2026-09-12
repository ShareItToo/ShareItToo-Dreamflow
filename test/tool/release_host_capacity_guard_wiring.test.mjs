import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guard = readFileSync(
  new URL('../../scripts/release_host_capacity_guard.sh', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const releaseBuilder = readFileSync(
  new URL('../../scripts/build_android_release_candidate.sh', import.meta.url),
  'utf8',
);

test('release-host gate owns fixed capacity and generated-footprint bounds', () => {
  assert.match(guard, /RELEASE_HOST_EFFECTIVE_BUDGET_KIB=\$\(\(5 \* 1024 \* 1024\)\)/u);
  assert.match(guard, /RELEASE_HOST_MAX_GENERATED_KIB=\$\(\(5 \* 1024 \* 1024\)\)/u);
  assert.match(guard, /RELEASE_HOST_MIN_END_FREE_KIB=\$\(\(512 \* 1024\)\)/u);
  assert.match(guard, /for path in build \.dart_tool android\/\.gradle/u);
  assert.match(guard, /beforeFreeKiB/u);
  assert.match(guard, /afterGeneratedKiB/u);
  assert.match(guard, /generatedGrowthKiB/u);
});

test('complete gate measures capacity before work and verifies it after Android', () => {
  const begin = regression.indexOf('release_host_capacity_begin');
  const tests = regression.indexOf('bash scripts/test_temp_fixture_boundedness.sh');
  const android = regression.indexOf('./android/gradlew -p android :app:assembleDebug --no-daemon');
  const end = regression.lastIndexOf('release_host_capacity_end');

  assert.ok(begin >= 0);
  assert.ok(begin < tests);
  assert.ok(android < end);
  assert.match(
    regression,
    /node --test test\/tool\/release_host_capacity_guard_wiring\.test\.mjs/u,
  );
});

test('capacity acceptance cannot be changed by environment or timing workarounds', () => {
  assert.doesNotMatch(guard, /SIT_RELEASE_HOST|sleep|retry|cleanup|rm\s/u);
});

test('signed candidate owns a cold generated lifecycle around the private archive', () => {
  assert.match(
    releaseBuilder,
    /release_host_capacity_begin[\s\S]*?trap release_candidate_cleanup_on_exit EXIT[\s\S]*?release_candidate_clean_generated[\s\S]*?node tool\/run_checked_android_build\.mjs appbundle/u,
  );
  assert.match(
    releaseBuilder,
    /node tool\/archive_android_release_candidate\.mjs[\s\S]*?release_candidate_clean_generated[\s\S]*?trap - EXIT[\s\S]*?release_host_capacity_end/u,
  );
  assert.match(releaseBuilder, /release_candidate_clean_generated\(\) \{\n  flutter clean/u);
  assert.doesNotMatch(releaseBuilder, /rm\s+-|SIT_RELEASE_HOST|sleep|retry/u);
});
