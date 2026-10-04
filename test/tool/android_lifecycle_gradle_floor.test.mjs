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
const regressionRunner = read('scripts/technical_regression_check.sh');

test('Android lifecycle bridge retains the reviewed Gradle-compatible lock', () => {
  assert.match(
    lock,
    /flutter_plugin_android_lifecycle:\n[\s\S]*?dependency: transitive[\s\S]*?sha256: "3854fe5e3bff0b113c658f260b90c95dea17c92db0f2addeac2e343dd9969785"[\s\S]*?version: "2\.0\.35"/u,
  );
});

test('local and CI Flutter floors satisfy the reviewed package minimum', () => {
  assert.match(bootstrap, /^flutter_version='3\.41\.7'$/mu);
  assert.match(workflow, /^\s+flutter-version: 3\.41\.7$/mu);
});

test('the complete regression retains the lifecycle bridge contract', () => {
  assert.match(
    regressionRunner,
    /^node --test test\/tool\/android_lifecycle_gradle_floor\.test\.mjs$/mu,
  );
});
