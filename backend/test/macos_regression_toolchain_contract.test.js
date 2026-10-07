import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('repository and CI pin the same Flutter version', async () => {
  const [fvmConfig, workflow, script] = await Promise.all([
    readFile(path.join(root, '.fvmrc'), 'utf8'),
    readFile(path.join(root, '.github/workflows/regression.yml'), 'utf8'),
    readFile(path.join(root, 'scripts/bootstrap_macos_regression_toolchain.sh'), 'utf8'),
  ]);
  assert.deepEqual(JSON.parse(fvmConfig), { flutter: '3.41.7' });
  assert.match(workflow, /flutter-version: 3\.41\.7/u);
  assert.match(script, /flutter_version='3\.41\.7'/u);
  assert.match(script, /dart_version='3\.11\.5'/u);
  assert.match(script, /fvm_bin" install "\$flutter_version/u);
  assert.match(script, /fvm_bin" global "\$flutter_version" --force/u);
});

test('macOS full-regression bootstrap uses stable normal-shell links and Java 17', async () => {
  const script = await readFile(
    path.join(root, 'scripts/bootstrap_macos_regression_toolchain.sh'),
    'utf8',
  );
  assert.match(script, /java_formula='openjdk@17'/u);
  assert.match(script, /brew_bin" link --overwrite --force "\$java_formula/u);
  assert.match(script, /ln -sfn "\$global_flutter_bin\/flutter" "\$brew_prefix\/bin\/flutter"/u);
  assert.match(script, /ln -sfn "\$global_flutter_bin\/dart" "\$brew_prefix\/bin\/dart"/u);
  assert.match(script, /mode='check'/u);
});
