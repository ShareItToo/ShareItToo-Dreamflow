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

function r10Job() {
  const start = workflow.indexOf('  r10-clean-reproducibility:\n');
  const end = workflow.indexOf('  flutter-regression:\n', start + 1);
  assert.ok(start >= 0, 'R10 CI job is missing');
  assert.ok(end > start, 'R10 CI job has no bounded end');
  return workflow.slice(start, end);
}

test('CI runs R10 from the exact PR head with the pinned toolchain', () => {
  const job = r10Job();
  assert.match(job, /runs-on: ubuntu-24\.04/u);
  assert.match(job, /fetch-depth: 0/u);
  assert.match(job, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
  assert.match(job, /java-version: '17'/u);
  assert.match(job, /node-version: '22'/u);
  assert.match(job, /flutter-version: 3\.41\.7/u);
  assert.match(job, /node tool\/run_r10_clean_reproducibility\.mjs/u);
  assert.match(job, /--source-branch "\$\{GITHUB_HEAD_REF:-\$GITHUB_REF_NAME\}"/u);
  assert.match(job, /node tool\/validate_r10_clean_reproducibility\.mjs[\s\\]+\n\s+--input/u);
  assert.match(job, /--execution-only/u);
});

test('R10 CI has no live action, private input, retry or machine-cache fallback', () => {
  const job = r10Job();
  assert.doesNotMatch(
    job,
    /services:|secrets\.|google-services|key\.properties|storepass|deploy|publish|upload|docker|sudo|apt(?:-get)?|sleep|retry|SIT_FLUTTER_TEST_CONCURRENCY/u,
  );
  assert.doesNotMatch(job, /setup-gradle|cache-dependency-path|pnpm install|flutter pub get/u);
});

test('R10 consumes only the same-run successful exact-head dependency artifact', () => {
  const job = r10Job();
  assert.match(job, /needs: flutter-regression/u);
  assert.match(job, /actions\/download-artifact@v5/u);
  assert.match(job, /name: r10-gradle-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
  assert.doesNotMatch(job, /run-id:|repository:|github-token:|continue-on-error:|if: always/u);
  assert.match(job, /--gradle-dependencies "\$RUNNER_TEMP\/r10-gradle-transport\/dependencies"/u);
  const producer = workflow.slice(workflow.indexOf('  flutter-regression:\n'), workflow.indexOf('  publish-api-image:\n'));
  assert.match(producer, /runs-on: ubuntu-24\.04/u);
  assert.match(producer, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
  assert.ok(producer.indexOf('bash scripts/technical_regression_check.sh') < producer.indexOf('node tool/r10_gradle_dependency_handoff.mjs export'));
  assert.match(producer, /actions\/upload-artifact@v4/u);
  assert.match(producer, /:app:assembleDebug --rerun-tasks --no-build-cache --no-daemon --warning-mode all/u);
  assert.match(producer, /if-no-files-found: error/u);
  assert.match(producer, /retention-days: 1/u);
});

test('both isolated Android builds require offline resolution only after verified import', () => {
  const runner = readFileSync(new URL('../../tool/run_r10_clean_reproducibility.mjs', import.meta.url), 'utf8');
  assert.ok(runner.indexOf('await importR10GradleDependencies') < runner.indexOf('const toolchain = await captureR10Toolchain'));
  assert.match(runner, /SIT_R10_GRADLE_OFFLINE: gradleDependencies \? '1' : '0'/u);
  assert.match(runner, /dependencyHandoff \? \['--offline'\] : \[\]/u);
  assert.match(regression, /1\) android_dependency_flag=--offline/u);
  assert.match(regression, /:app:assembleDebug --no-daemon --warning-mode all \$\{android_dependency_flag:\+--offline\}/u);
  assert.match(regression, /ERROR: Android debug build failed\.[\s\S]*?exit 1/u);
});

test('the complete local gate retains the R10 CI wiring contract', () => {
  assert.match(
    regression,
    /node --test test\/tool\/r10_clean_reproducibility_ci_wiring\.test\.mjs/u,
  );
});
