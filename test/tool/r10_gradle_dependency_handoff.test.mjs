import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat, readdir } from 'node:fs/promises';
import { exportR10GradleDependencies, importR10GradleDependencies, r10DependencyIdentity } from '../../tool/r10_gradle_dependency_handoff.mjs';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const head = 'a'.repeat(40);
const jar = 'caches/modules-2/files-2.1/example/plugin/1.0/digest/plugin.jar';
const launcher = 'wrapper/dists/gradle-8.13-bin/digest/gradle-8.13/bin/gradle';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'sit-r10-dependency-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = path.join(base, 'producer');
  for (const [name, contents, mode] of [[jar, 'dependency bytes', 0o644], [launcher, 'launcher bytes', 0o755],
    ['caches/modules-2/metadata-2.107/descriptors/example', 'metadata bytes', 0o644],
    ['caches/modules-2/modules-2.lock', 'lock', 0o644], ['caches/modules-2/gc.properties', 'gc', 0o644],
    ['caches/8.13/transforms/output', 'must not copy compiled output', 0o644],
    ['gradle.properties', 'must not copy credentials', 0o600]]) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), contents, { mode });
  }
  const identity = await r10DependencyIdentity(root, head);
  const output = path.join(base, 'sealed');
  const destination = path.join(base, 'isolated');
  await exportR10GradleDependencies({ source, output, identity });
  return { source, output, destination, identity };
}

test('hands off only verified dependency bytes into a fresh Gradle home and preserves launcher mode', async t => {
  const f = await fixture(t);
  const transport = path.join(path.dirname(f.output), 'transport');
  await mkdir(transport);
  const archive = path.join(transport, 'dependencies.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', path.dirname(f.output), 'sealed']);
  execFileSync('tar', ['-xzf', archive, '-C', transport]);
  const proof = await importR10GradleDependencies({ source: path.join(transport, 'sealed'), destination: f.destination, identity: f.identity });
  assert.equal(await readFile(path.join(f.destination, jar), 'utf8'), 'dependency bytes');
  assert.equal((await stat(path.join(f.destination, launcher))).mode & 0o111, 0o111);
  assert.deepEqual(await readdir(path.join(f.destination, 'caches')), ['modules-2']);
  assert.deepEqual((await readdir(f.destination)).sort(), ['caches', 'wrapper']);
  assert.equal(proof.files, 3);
  assert.equal(proof.offlineBuilds, true);
  assert.equal(proof.projectOutputsCopied, false);
  assert.equal(proof.sourceHead, head);
  assert.match(proof.manifestSha256, /^[a-f0-9]{64}$/u);
  await assert.rejects(importR10GradleDependencies({ source: f.output, destination: f.destination, identity: f.identity }), /EEXIST/u);
});

test('rejects changed bytes before installing any cache, including an unchanged manifest', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.output, jar), 'tampered');
  await assert.rejects(importR10GradleDependencies({ source: f.output, destination: f.destination, identity: f.identity }), /checksum_mismatch/u);
  await assert.rejects(stat(f.destination), /ENOENT/u);
});

test('rejects stale source, dependency input, platform or version identity', async t => {
  const f = await fixture(t);
  for (const change of [{ sourceHead: 'b'.repeat(40) }, { dependencyInputsSha256: 'b'.repeat(64) },
    { platform: 'other' }, { pins: { ...f.identity.pins, gradle: '8.12' } }]) {
    await assert.rejects(importR10GradleDependencies({ source: f.output, destination: f.destination,
      identity: { ...f.identity, ...change } }), /identity_mismatch/u);
  }
});

test('rejects missing dependency, extra build state and symlink transport', async t => {
  for (const change of ['missing', 'extra', 'link']) {
    const f = await fixture(t);
    if (change === 'missing') await rm(path.join(f.output, jar));
    if (change === 'extra') await mkdir(path.join(f.output, 'caches/8.13'));
    if (change === 'link') {
      await rm(path.join(f.output, jar));
      await symlink(path.join(f.source, jar), path.join(f.output, jar));
    }
    await assert.rejects(importR10GradleDependencies({ source: f.output, destination: f.destination,
      identity: f.identity }), /checksum_mismatch|extra_state|symlink|incomplete/u);
    await assert.rejects(stat(f.destination), /ENOENT/u);
  }
});

test('manifest cannot inject a path traversal or claim a different dependency count', async t => {
  const f = await fixture(t);
  const manifestFile = path.join(f.output, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.files[0].path = '../outside';
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(importR10GradleDependencies({ source: f.output, destination: f.destination,
    identity: f.identity }), /checksum_mismatch/u);
});
