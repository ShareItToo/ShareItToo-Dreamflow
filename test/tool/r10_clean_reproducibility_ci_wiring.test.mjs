import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

test('R10 provisions the exact Android CMake before starting its offline builds', async (t) => {
  const job = r10Job();
  const setup = /      - name: Install and verify pinned Android CMake\n        shell: bash\n        run: \|\n(?<script>(?:          .+\n)+)/u.exec(job);
  assert.ok(setup, 'R10 must explicitly provision its SDK CMake');
  assert.ok(setup.index < job.indexOf('      - name: Run exact clean-checkout reproducibility proof'));
  const script = setup.groups.script.replace(/^          /gmu, '');
  for (const scenario of [
    { name: 'exact version', version: '3.22.1', status: 0 },
    { name: 'wrong version', version: '3.31.6', status: 1 },
    { name: 'missing binary', missing: true, status: 1 },
    { name: 'SDK installation failed', version: '3.22.1', installStatus: 19, status: 19 },
    { name: 'CMake cannot execute', version: '3.22.1', cmakeStatus: 23, status: 23 },
  ]) {
    await t.test(scenario.name, () => {
      const sdk = mkdtempSync(path.join(os.tmpdir(), 'sit-r10-cmake-'));
      try {
        const managerDir = path.join(sdk, 'cmdline-tools/latest/bin');
        const cmakeDir = path.join(sdk, 'cmake/3.22.1/bin');
        mkdirSync(managerDir, { recursive: true });
        mkdirSync(cmakeDir, { recursive: true });
        writeFileSync(path.join(managerDir, 'sdkmanager'), `#!/bin/bash
set -eu
test "$#" = 3
test "$1" = "--sdk_root=$ANDROID_HOME"
test "$2" = --install
test "$3" = 'cmake;3.22.1'
exit ${scenario.installStatus ?? 0}
`, { mode: 0o755 });
        if (!scenario.missing) {
          writeFileSync(path.join(cmakeDir, 'cmake'), `#!/bin/bash
test "$1" = --version || exit 2
printf 'cmake version ${scenario.version}\\n\\nCMake suite maintained and supported by Kitware.\\n'
exit ${scenario.cmakeStatus ?? 0}
`, { mode: 0o755 });
        }
        const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
          env: { ...process.env, ANDROID_HOME: sdk }, encoding: 'utf8',
        });
        assert.equal(result.status, scenario.status, result.stderr);
      } finally {
        rmSync(sdk, { recursive: true, force: true });
      }
    });
  }
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
