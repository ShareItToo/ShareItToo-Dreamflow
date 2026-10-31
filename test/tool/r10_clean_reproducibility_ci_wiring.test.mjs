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
  // Android's official cmake-3.22.1-linux.zip (SHA-1
  // fd0a48b4a758310df8c7aa51f59840ed48fe7ed8) contains this metadata and
  // version suffix; the installed macOS SDK binary reports the same version.
  // Source: https://dl.google.com/android/repository/repository2-1.xml
  const sdkProperties = 'Pkg.Revision = 3.22.1\nPkg.Path = cmake;3.22.1\nPkg.Desc = CMake 3.22.1\n';
  for (const scenario of [
    { name: 'real Android SDK version suffix', status: 0 },
    { name: 'upstream exact version', version: '3.22.1', status: 0 },
    { name: 'wrong version', version: '3.31.6', status: 1, diagnostic: 'CMake version mismatch' },
    { name: 'version prefix collision', version: '3.22.10', status: 1, diagnostic: 'CMake version mismatch' },
    { name: 'prerelease is not pinned release', version: '3.22.1-rc1', status: 1, diagnostic: 'CMake version mismatch' },
    { name: 'unknown suffix', version: '3.22.1-gfffffff', status: 1, diagnostic: 'CMake version mismatch' },
    { name: 'missing binary', missing: true, status: 1, diagnostic: 'CMake binary missing or not executable' },
    { name: 'non-executable binary', mode: 0o644, status: 1, diagnostic: 'CMake binary missing or not executable' },
    { name: 'binary in wrong SDK path', binaryPackage: '3.31.6', status: 1, diagnostic: 'CMake binary missing or not executable' },
    { name: 'missing metadata', missingProperties: true, status: 1, diagnostic: 'SDK package metadata missing or unreadable' },
    { name: 'wrong revision', properties: sdkProperties.replace('Pkg.Revision = 3.22.1', 'Pkg.Revision = 3.22.10'), status: 1, diagnostic: 'Pkg.Revision mismatch' },
    { name: 'wrong package path', properties: sdkProperties.replace('cmake;3.22.1', 'cmake;3.31.6'), status: 1, diagnostic: 'Pkg.Path mismatch' },
    { name: 'missing package path', properties: 'Pkg.Revision = 3.22.1\n', status: 1, diagnostic: 'Pkg.Path mismatch' },
    { name: 'duplicate revision', properties: `${sdkProperties}Pkg.Revision = 3.31.6\n`, status: 1, diagnostic: 'Pkg.Revision mismatch' },
    { name: 'duplicate package path', properties: `${sdkProperties}Pkg.Path = cmake;3.31.6\n`, status: 1, diagnostic: 'Pkg.Path mismatch' },
    { name: 'missing SDK root', missingSdk: true, status: 1, diagnostic: 'Android SDK root missing' },
    { name: 'missing SDK manager', missingManager: true, status: 1, diagnostic: 'SDK manager not executable' },
    { name: 'SDK installation failed', installStatus: 19, status: 19, diagnostic: 'SDK package installation failed' },
    { name: 'CMake cannot execute', cmakeStatus: 23, status: 23, diagnostic: 'CMake --version execution failed' },
  ]) {
    await t.test(scenario.name, () => {
      const sdk = mkdtempSync(path.join(os.tmpdir(), 'sit-r10-cmake-'));
      try {
        const managerDir = path.join(sdk, 'cmdline-tools/latest/bin');
        const cmakeRoot = path.join(sdk, 'cmake/3.22.1');
        const cmakeDir = path.join(sdk, 'cmake', scenario.binaryPackage ?? '3.22.1', 'bin');
        mkdirSync(managerDir, { recursive: true });
        mkdirSync(cmakeRoot, { recursive: true });
        mkdirSync(cmakeDir, { recursive: true });
        if (!scenario.missingProperties) {
          writeFileSync(path.join(cmakeRoot, 'source.properties'), scenario.properties ?? sdkProperties);
        }
        if (!scenario.missingManager) writeFileSync(path.join(managerDir, 'sdkmanager'), `#!/bin/bash
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
printf 'cmake version ${scenario.version ?? '3.22.1-g37088a8'}\\n\\nCMake suite maintained and supported by Kitware (kitware.com/cmake).\\n'
exit ${scenario.cmakeStatus ?? 0}
`, { mode: scenario.mode ?? 0o755 });
        }
        const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
          env: { ...process.env, ANDROID_HOME: scenario.missingSdk ? '' : sdk }, encoding: 'utf8',
        });
        assert.equal(result.status, scenario.status, result.stderr);
        if (scenario.diagnostic) {
          assert.ok(result.stderr.includes(`::error::R10 CMake: ${scenario.diagnostic}`), result.stderr);
          assert.doesNotMatch(result.stdout, /R10 CMake verified/u);
        } else {
          assert.match(result.stdout, /R10 CMake verified: cmake;3\.22\.1; 3\.22\.1; cmake version 3\.22\.1/u);
        }
      } finally {
        rmSync(sdk, { recursive: true, force: true });
      }
    });
  }
});

test('R10 provisions the declared Flutter NDK before offline builds and rejects incomplete SDKs', async (t) => {
  const job = r10Job();
  const setup = /      - name: Install and verify declared Android NDK\n        shell: bash\n        run: \|\n(?<script>(?:          .+\n)+)/u.exec(job);
  assert.ok(setup, 'R10 must provision its declared NDK, independently of Gradle transport');
  assert.ok(setup.index < job.indexOf('      - name: Run exact clean-checkout reproducibility proof'));
  const script = setup.groups.script.replace(/^          /gmu, '');
  const app = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');
  assert.match(app, /^\s*ndkVersion = flutter\.ndkVersion\s*$/mu);
  assert.equal([...app.matchAll(/\bndkVersion\s*=/gu)].length, 1);
  assert.doesNotMatch(app, /\bndkPath\b/u);
  // Flutter 3.41.7 declares 28.2.13676358. AGP 8.13.2's NdkLocator failure
  // prints NDK_DEFAULT_VERSION (27.0.12077973), even for a different DSL pin.
  // Install the declared version, not the diagnostic's fallback version.
  const declaration = '    val ndkVersion: String = "28.2.13676358"\n';
  const properties = 'Pkg.Desc = Android NDK\nPkg.Revision = 28.2.13676358\nPkg.BaseRevision = 28.2.13676358\nPkg.ReleaseName = r28c\n';
  for (const scenario of [
    { name: 'exact Flutter NDK with real source.properties shape', status: 0 },
    { name: 'missing SDK root', missingSdk: true, status: 1, diagnostic: 'Android SDK root missing' },
    { name: 'missing Flutter declaration', missingDeclaration: true, status: 1, diagnostic: 'Flutter NDK declaration missing' },
    { name: 'AGP diagnostic is not the Flutter pin', declaration: declaration.replace('28.2.13676358', '27.0.12077973'), status: 1, diagnostic: 'Flutter NDK declaration differs' },
    { name: 'duplicate declaration', declaration: declaration.repeat(2), status: 1, diagnostic: 'Flutter NDK declaration differs' },
    { name: 'missing SDK manager', missingManager: true, status: 1, diagnostic: 'SDK manager not executable' },
    { name: 'installation failure', installStatus: 19, status: 19, diagnostic: 'SDK NDK installation failed' },
    { name: 'missing package metadata', missingProperties: true, status: 1, diagnostic: 'NDK package metadata missing' },
    { name: 'wrong installed revision', properties: properties.replace('Pkg.Revision = 28.2.13676358', 'Pkg.Revision = 27.0.12077973'), status: 1, diagnostic: 'NDK Pkg.Revision mismatch' },
    { name: 'duplicate revision', properties: `${properties}Pkg.Revision = 28.2.13676358\n`, status: 1, diagnostic: 'NDK Pkg.Revision mismatch' },
    { name: 'only fallback NDK installed', installedVersion: '27.0.12077973', status: 1, diagnostic: 'NDK package metadata missing' },
    { name: 'missing ndk-build', missingBuild: true, status: 1, diagnostic: 'ndk-build missing' },
    { name: 'non-executable ndk-build', buildMode: 0o644, status: 1, diagnostic: 'ndk-build missing' },
    { name: 'missing compiler', missingClang: true, status: 1, diagnostic: 'NDK Clang missing' },
    { name: 'non-executable compiler', clangMode: 0o644, status: 1, diagnostic: 'NDK Clang missing' },
    { name: 'compiler cannot run', clangStatus: 23, status: 23, diagnostic: 'NDK Clang execution failed' },
  ]) {
    await t.test(scenario.name, () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'sit-r10-ndk-'));
      try {
        const sdk = path.join(root, 'sdk');
        const flutter = path.join(root, 'flutter');
        const extension = path.join(flutter, 'packages/flutter_tools/gradle/src/main/kotlin');
        const manager = path.join(sdk, 'cmdline-tools/latest/bin');
        const ndk = path.join(sdk, 'ndk', scenario.installedVersion ?? '28.2.13676358');
        const clang = path.join(ndk, 'toolchains/llvm/prebuilt/linux-x86_64/bin');
        for (const directory of [extension, manager, clang]) mkdirSync(directory, { recursive: true });
        if (!scenario.missingDeclaration) writeFileSync(path.join(extension, 'FlutterExtension.kt'), scenario.declaration ?? declaration);
        if (!scenario.missingProperties) writeFileSync(path.join(ndk, 'source.properties'), scenario.properties ?? properties);
        if (!scenario.missingManager) writeFileSync(path.join(manager, 'sdkmanager'), `#!/bin/bash
set -eu
test "$#" = 3
test "$1" = "--sdk_root=$ANDROID_HOME"
test "$2" = --install
test "$3" = 'ndk;28.2.13676358'
exit ${scenario.installStatus ?? 0}
`, { mode: 0o755 });
        if (!scenario.missingBuild) writeFileSync(path.join(ndk, 'ndk-build'), '#!/bin/bash\nexit 0\n', { mode: scenario.buildMode ?? 0o755 });
        if (!scenario.missingClang) writeFileSync(path.join(clang, 'clang'), `#!/bin/bash
test "$1" = --version || exit 2
exit ${scenario.clangStatus ?? 0}
`, { mode: scenario.clangMode ?? 0o755 });
        const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
          env: { ...process.env, ANDROID_HOME: scenario.missingSdk ? '' : sdk, FLUTTER_ROOT: flutter }, encoding: 'utf8',
        });
        assert.equal(result.status, scenario.status, result.stderr);
        if (scenario.diagnostic) {
          assert.ok(result.stderr.includes(`::error::R10 NDK: ${scenario.diagnostic}`), result.stderr);
          assert.doesNotMatch(result.stdout, /R10 NDK verified/u);
        } else {
          assert.match(result.stdout, /R10 NDK verified: ndk;28\.2\.13676358; 28\.2\.13676358/u);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
  const runner = readFileSync(new URL('../../tool/run_r10_clean_reproducibility.mjs', import.meta.url), 'utf8');
  assert.match(runner, /ANDROID_HOME: androidSdkRoot,\s+ANDROID_SDK_ROOT: androidSdkRoot/u);
  assert.match(runner, /const configured = process\.env\.ANDROID_HOME \?\? process\.env\.ANDROID_SDK_ROOT/u);
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
