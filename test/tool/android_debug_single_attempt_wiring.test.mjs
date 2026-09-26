import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/regression.yml', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('draft PR Gradle state is written only to its GitHub cache scope', () => {
  assert.match(
    workflow,
    /uses: gradle\/actions\/setup-gradle@v6\s+with:\s+cache-provider: basic\s+cache-read-only: false/u,
  );
  assert.equal(workflow.match(/cache-read-only: false/gu)?.length, 1);
});

test('technical regression executes one direct Android debug build', () => {
  const buildSegment = regression.slice(
    regression.indexOf('flutter build web --debug'),
  );
  const directBuild = './android/gradlew -p android :app:assembleDebug --no-daemon --warning-mode all';

  assert.equal(
    buildSegment.match(/\.\/android\/gradlew -p android :app:assembleDebug --no-daemon --warning-mode all/gu)?.length,
    1,
  );
  assert.ok(
    buildSegment.indexOf(directBuild)
      > buildSegment.indexOf('bash scripts/p0a_web_smoke.sh'),
  );
  assert.doesNotMatch(
    buildSegment,
    /flutter build apk|Retrying Gradle|for attempt|sleep|retry/iu,
  );
  assert.doesNotMatch(buildSegment, /--warning-mode (?:none|summary)/u);
});

test('direct Gradle debug metadata is deterministically derived from pubspec first', () => {
  const buildSegment = regression.slice(
    regression.indexOf('flutter build web --debug'),
  );
  assert.match(
    buildSegment,
    /node tool\/prepare_android_debug_build_metadata\.mjs\nif ! android_build_output=/u,
  );
  assert.match(
    regression,
    /node --check tool\/prepare_android_debug_build_metadata\.mjs\nnode --test test\/tool\/prepare_android_debug_build_metadata\.test\.mjs/u,
  );
});
