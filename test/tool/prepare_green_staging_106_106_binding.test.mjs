import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { digest, repositoryRoot } from '../../backend/ops/green_staging_98_106_contract.mjs';
import { successorSourcePaths } from '../../backend/ops/green_staging_106_106_binding.mjs';
import { fixture } from '../../backend/test/fixtures/green_106106_readonly.js';
import { parseArguments, prepareBinding } from '../../tool/prepare_green_staging_106_106_binding.mjs';

function privateFixtureFiles(f, directory) {
  const publication = path.join(directory, 'publication.json');
  const scope = path.join(directory, 'scope.json');
  const scopeBytes = Buffer.from(`${JSON.stringify(f.binding.scope)}\n`);
  fs.writeFileSync(publication, f.publicationBytes, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(scope, scopeBytes, { mode: 0o600, flag: 'wx' });
  return { publication, publicationSha256: digest(f.publicationBytes), scope, scopeSha256: digest(scopeBytes) };
}

test('binding preparation verifies exact publication and scope bytes before protected write', () => {
  const f = fixture();
  const directory = fs.mkdtempSync(path.join(os.homedir(), '.green-106-binding-'));
  fs.chmodSync(directory, 0o700);
  try {
    const inputs = privateFixtureFiles(f, directory);
    const result = prepareBinding({
      runtimeCommit: f.binding.runtimeCommit,
      opsCommit: f.binding.opsCommit,
      reviewedCommit: f.binding.reviewedCommit,
      ...inputs,
      candidateImageId: f.binding.candidateImageId,
      evidenceDirectory: directory,
      outputName: 'binding.json',
    }, { root: repositoryRoot, git: f.git });
    assert.equal(result.status, 'binding_prepared');
    const expectedSources = successorSourcePaths(repositoryRoot);
    assert.equal(result.sourceInventoryCount, expectedSources.length);
    assert.ok(expectedSources.includes('tool/collect_green_staging_106_106_scope.mjs'));
    assert.ok(expectedSources.includes('backend/ops/prepare_green_staging_106_106_execution_inputs.mjs'));
    const bytes = fs.readFileSync(path.join(directory, 'binding.json'));
    assert.equal(digest(bytes), result.bindingSha256);
    const binding = JSON.parse(bytes.toString('utf8'));
    assert.equal(binding.runtimeCommit, f.binding.runtimeCommit);
    assert.equal(binding.opsCommit, f.binding.opsCommit);
    assert.equal(binding.publicationSha256, inputs.publicationSha256);
    assert.equal(binding.scope.api.id, f.binding.scope.api.id);
    assert.deepEqual(Object.keys(binding.sourceInventory).sort(), expectedSources);
    assert.equal(binding.sourceInventory['backend/ops/green_staging_106_106_binding.mjs'].length, 64);
    assert.equal(fs.statSync(path.join(directory, 'binding.json')).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('binding preparation rejects altered publication/scope bytes and leaves no output', () => {
  const f = fixture();
  const directory = fs.mkdtempSync(path.join(os.homedir(), '.green-106-binding-'));
  fs.chmodSync(directory, 0o700);
  try {
    const inputs = privateFixtureFiles(f, directory);
    const base = {
      runtimeCommit: f.binding.runtimeCommit,
      opsCommit: f.binding.opsCommit,
      reviewedCommit: f.binding.reviewedCommit,
      ...inputs,
      candidateImageId: f.binding.candidateImageId,
      evidenceDirectory: directory,
      outputName: 'binding.json',
    };
    assert.throws(() => prepareBinding({ ...base, publicationSha256: 'f'.repeat(64) }, { root: repositoryRoot, git: f.git }));
    assert.throws(() => prepareBinding({ ...base, scopeSha256: 'e'.repeat(64) }, { root: repositoryRoot, git: f.git }));
    assert.deepEqual(fs.readdirSync(directory).sort(), ['publication.json', 'scope.json']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('binding CLI arguments are complete, typed and reject duplicate or unknown switches', () => {
  const args = [
    '--runtime-commit', 'a'.repeat(40),
    '--ops-commit', 'b'.repeat(40),
    '--reviewed-commit', 'b'.repeat(40),
    '--publication', '/private/publication.json',
    '--publication-sha256', 'c'.repeat(64),
    '--scope', '/private/scope.json',
    '--scope-sha256', 'd'.repeat(64),
    '--candidate-image-id', `sha256:${'e'.repeat(64)}`,
    '--evidence-directory', '/private/evidence',
    '--output-name', 'binding.json',
  ];
  assert.equal(parseArguments(args)['runtime-commit'], 'a'.repeat(40));
  assert.throws(() => parseArguments([...args, '--unknown', 'value']));
  assert.throws(() => parseArguments([...args, '--ops-commit', 'f'.repeat(40)]));
  assert.throws(() => parseArguments(args.slice(0, -2)));
});
