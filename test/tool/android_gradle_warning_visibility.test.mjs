import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('Android build exposes every Gradle warning without adding another build', () => {
  assert.equal(
    regression.match(/:app:assembleDebug/gu)?.length,
    1,
  );
  assert.match(
    regression,
    /android_build_output="\$\([\s\S]*?\.\/android\/gradlew -p android :app:assembleDebug --no-daemon --warning-mode all 2>&1[\s\S]*?\)"/u,
  );
  assert.match(regression, /printf '%s\\n' "\$android_build_output"/u);
  assert.doesNotMatch(regression, /--warning-mode (?:none|summary)/u);
});

test('warnings from SIT-owned Android scripts fail the complete gate', () => {
  assert.match(
    regression,
    /grep -Fq "Build file '\$PWD\/android\/" <<<"\$android_build_output"/u,
  );
  assert.match(
    regression,
    /grep -Fq "Settings file '\$PWD\/android\/" <<<"\$android_build_output"/u,
  );
  assert.match(
    regression,
    /ERROR: Android build reported a warning from an SIT-owned Gradle script\./u,
  );
});

test('the warning-visibility contract is permanently registered', () => {
  assert.match(
    regression,
    /^node --test test\/tool\/android_gradle_warning_visibility\.test\.mjs$/mu,
  );
});
