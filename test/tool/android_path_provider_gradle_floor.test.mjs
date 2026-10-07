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
const regression = read('scripts/technical_regression_check.sh');

test('PathProvider Android retains the reviewed Gradle-9-compatible lock', () => {
  assert.match(
    lock,
    /path_provider_android:\n[\s\S]*?dependency: transitive[\s\S]*?sha256: "3b4c1fc3aa55ddc9cd4aa6759984330d5c8e66aa7702a6223c61540dc6380c37"[\s\S]*?version: "2\.2\.19"/u,
  );
});

test('local and CI Flutter floors satisfy the reviewed package minimum', () => {
  assert.match(bootstrap, /^flutter_version='3\.41\.7'$/mu);
  assert.match(workflow, /^\s+flutter-version: 3\.41\.7$/mu);
});

test('the complete regression retains the PathProvider bridge contract', () => {
  assert.match(
    regression,
    /^node --test test\/tool\/android_path_provider_gradle_floor\.test\.mjs$/mu,
  );
});
