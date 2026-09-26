import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const lock = read('pubspec.lock');
const bootstrap = read('scripts/bootstrap_macos_regression_toolchain.sh');
const workflow = read('.github/workflows/regression.yml');
const androidBuild = read('android/app/build.gradle');
const regression = read('scripts/technical_regression_check.sh');

const expectedLocks = Object.freeze([
  {
    name: 'image_picker_android',
    version: '0.8.13+4',
    sha256: 'dd7a61daaa5896cc34b7bc95f66c60225ae6bee0d167dde0e21a9d9016cac0dc',
  },
  {
    name: 'shared_preferences_android',
    version: '2.4.15',
    sha256: '34266009473bf71d748912da4bf62d439185226c03e01e2d9687bc65bbfcb713',
  },
  {
    name: 'url_launcher_android',
    version: '6.3.24',
    sha256: '5c8b6c2d89a78f5a1cca70a73d9d5f86c701b36b42f9c9dac7bad592113c28e9',
  },
]);

test('reviewed Android bridges retain their exact Gradle-9-compatible locks', () => {
  for (const dependency of expectedLocks) {
    const escapedVersion = dependency.version.replaceAll('.', '\\.').replace('+', '\\+');
    assert.match(
      lock,
      new RegExp(
        `${dependency.name}:\\n[\\s\\S]*?dependency: transitive[\\s\\S]*?sha256: "?${dependency.sha256}"?[\\s\\S]*?version: "${escapedVersion}"`,
        'u',
      ),
    );
  }
});

test('toolchain and application retain the reviewed Android platform floor', () => {
  assert.match(bootstrap, /^flutter_version='3\.41\.7'$/mu);
  assert.match(workflow, /^\s+flutter-version: 3\.41\.7$/mu);
  assert.match(androidBuild, /^\s+minSdk = flutter\.minSdkVersion$/mu);
  assert.match(
    regression,
    /android_debug_badging="\$\("\$android_aapt" dump badging "\$android_debug_apk"\)"[\s\S]*?grep -Fq "sdkVersion:'24'"/u,
  );
});

test('the complete regression retains the bridge and binary-floor contract', () => {
  assert.match(
    regression,
    /^node --test test\/tool\/android_gradle9_bridge_floor\.test\.mjs$/mu,
  );
  assert.match(
    regression,
    /Android debug binary platform reach: PASS \(minSdk 24\)\./u,
  );
});
