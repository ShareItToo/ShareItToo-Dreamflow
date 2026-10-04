import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectTarget, collectorCommand } from '../ops/green_staging_98_106_collector.mjs';
import { digest, objectDigest, validateRuntimeManifest } from '../ops/green_staging_98_106_contract.mjs';
import { bindMaterials } from '../ops/green_staging_98_106_execution.mjs';
import { checkContainer, containerFingerprint, runReadOnlyPreflight } from '../ops/green_staging_98_106_promotion.mjs';
import { assertArtifactFamily, closeArtifact, exclusiveArtifact, openArtifact, privateDirectory, verifyArtifact } from '../ops/green_staging_98_106_evidence.mjs';
import { dockerFixture } from './fixtures/green_98106_docker.js';

function temporary() { const d = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-98106-evidence-test-')); fs.chmodSync(d, 0o700); return d; }
test('collector preserves complete identities, writes exclusive owner-only evidence and returns hashes only', async () => {
  const f = dockerFixture(), directory = temporary();
  try {
    const result = await collectTarget({ directory, command: f.dependencies.command, acceptanceMfaFile: '/synthetic/protected/acceptance' });
    assert.equal(result.status, 'collected_not_authorized'); assert.equal(result.artifacts.length, 3);
    for (const a of result.artifacts) {
      const file = path.join(directory, a.name), bytes = fs.readFileSync(file);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.equal(digest(bytes), a.sha256);
      assert.equal(objectDigest(JSON.parse(bytes)), a.contentSha256);
    }
    const target = JSON.parse(fs.readFileSync(path.join(directory, result.artifacts[0].name)));
    assert.deepEqual(target, f.inputs.target);
    assert.ok(!JSON.stringify(result).includes('synthetic-unit-owner'));
    const count = f.calls.length;
    await assert.rejects(collectTarget({ directory, command: f.dependencies.command, acceptanceMfaFile: '/synthetic/protected/acceptance' }));
    assert.equal(f.calls.length, count);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('collector rejects readback drift before writing and its dispatcher rejects mutation/injection', async () => {
  const f = dockerFixture(), directory = temporary();
  try {
    const original = f.dependencies.command;
    await assert.rejects(collectTarget({ directory, acceptanceMfaFile: '/synthetic/protected/acceptance', command: async entry => {
      const raw = await original(entry);
      if (entry.args[1] === f.api.Id) { const rows = JSON.parse(raw); rows[0].Config.User = 'root'; return JSON.stringify(rows); }
      return raw;
    } }));
    assert.deepEqual(fs.readdirSync(directory), []);
    for (const args of [['network', 'create', 'foreign'], ['image', 'rm', 'foreign'], ['volume', 'rm', 'foreign'], ['inspect', '--help']]) {
      assert.throws(() => collectorCommand({ args }));
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('real identity variants retain their exact tag, UTC name, image ID and stable network identity', async t => {
  for (const variant of ['tag-only', 'uppercase-UTC', 'image-ID-vs-RepoDigest', 'transient-endpoint']) await t.test(variant, async () => {
    const f = dockerFixture();
    const entry = variant === 'tag-only' ? f.inputs.target.witnesses.find(w => !f.records.get(w.id).Config.Image.includes('@'))
      : variant === 'uppercase-UTC' ? f.inputs.target.witnesses.find(w => /T\d+Z/u.test(w.name)) : f.inputs.target.api;
    assert.ok(entry, 'production-shaped variant exists'); const record = f.records.get(entry.id);
    if (variant === 'image-ID-vs-RepoDigest') assert.notEqual(entry.imageId, entry.imageDigest);
    if (variant === 'transient-endpoint') for (const n of Object.values(record.NetworkSettings.Networks)) { n.IPAddress = ''; n.EndpointID = ''; }
    checkContainer(record, entry, entry === f.inputs.target.api);
    await runReadOnlyPreflight(f.inputs, f.dependencies);
    if (variant === 'tag-only') record.Config.Image += '-drift';
    else if (variant === 'uppercase-UTC') record.Name = record.Name.toLowerCase();
    else if (variant === 'image-ID-vs-RepoDigest') record.Image = entry.imageDigest;
    else Object.values(record.NetworkSettings.Networks)[0].NetworkID = '9'.repeat(64);
    assert.throws(() => checkContainer(record, entry, entry === f.inputs.target.api));
    await assert.rejects(runReadOnlyPreflight(f.inputs, f.dependencies));
  });
});
test('held backup descriptor rejects byte drift, path substitution, hardlinks and metadata relaxation', () => {
  for (const fault of ['bytes', 'replacement', 'hardlink', 'mode']) {
    const directory = temporary(), h = exclusiveArtifact(privateDirectory(directory), 'backup.pgdump');
    try {
      fs.writeFileSync(h.fd, 'synthetic-dump'); const initial = verifyArtifact(h); initial.bytes.fill(0);
      if (fault === 'bytes') fs.writeFileSync(h.filename, 'different-bytes');
      else if (fault === 'replacement') { fs.renameSync(h.filename, `${h.filename}.old`); fs.writeFileSync(h.filename, 'synthetic-dump', { mode: 0o600 }); }
      else if (fault === 'hardlink') fs.linkSync(h.filename, `${h.filename}.link`);
      else fs.chmodSync(h.filename, 0o644);
      assert.throws(() => verifyArtifact(h, { expectedDigest: initial.sha256 }));
      assert.throws(() => assertArtifactFamily(privateDirectory(directory), ['backup.pgdump']));
    } finally { closeArtifact(h); fs.rmSync(directory, { recursive: true, force: true }); }
  }
});
test('backup reopening proves exact bytes; evidence directory symlinks and permissive mode fail closed', () => {
  const directory = temporary();
  try {
    const h = exclusiveArtifact(privateDirectory(directory), 'backup.pgdump'); fs.writeFileSync(h.fd, 'synthetic-dump');
    const expected = verifyArtifact(h).sha256; closeArtifact(h);
    const reopened = openArtifact(path.join(directory, 'backup.pgdump'));
    try { const checked = verifyArtifact(reopened, { expectedDigest: expected }); checked.bytes.fill(0); } finally { closeArtifact(reopened); }
    fs.symlinkSync(directory, path.join(directory, 'symlink')); assert.throws(() => privateDirectory(path.join(directory, 'symlink')));
    fs.chmodSync(directory, 0o750); assert.throws(() => privateDirectory(directory));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('material file binding checks exact key bytes and metadata with synthetic root metadata only', t => {
  const directory = temporary(), f = dockerFixture();
  const originalFstat = fs.fstatSync, originalLstat = fs.lstatSync;
  // Ownership is simulated; real byte descriptors/modes and replacement checks are exercised.
  const rootMetadata = value => { if (typeof value.uid === 'bigint' && value.isFile()) { value.uid = 0n; value.gid = 65532n; } return value; };
  t.mock.method(fs, 'fstatSync', (...a) => rootMetadata(originalFstat(...a)));
  t.mock.method(fs, 'lstatSync', (...a) => rootMetadata(originalLstat(...a)));
  try {
    for (const [name, value] of [['mfa', 'synthetic-key'], ['firebase', 'synthetic-service'], ['acceptance', 'synthetic-key']]) fs.writeFileSync(path.join(directory, name), value, { mode: 0o640 });
    const snapshot = structuredClone(f.inputs.privateRuntime);
    snapshot.api.Mounts[0].Source = path.join(directory, 'mfa'); snapshot.api.Mounts[1].Source = path.join(directory, 'firebase'); snapshot.acceptanceMfaFile = path.join(directory, 'acceptance');
    const bound = bindMaterials(snapshot);
    try { bound.recheck(); fs.writeFileSync(snapshot.acceptanceMfaFile, 'changed-key'); assert.throws(() => bound.recheck()); } finally { bound.close(); }
    assert.throws(() => bindMaterials(snapshot));
    fs.writeFileSync(snapshot.acceptanceMfaFile, 'synthetic-key'); fs.chmodSync(snapshot.acceptanceMfaFile, 0o644);
    assert.throws(() => bindMaterials(snapshot));
  } finally { t.mock.restoreAll(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('runtime manifest binds real publication and rejects substituted publication bytes', () => {
  const f = dockerFixture(); assert.equal(validateRuntimeManifest(f.inputs).runtimeCommit, f.inputs.publication.commit);
  assert.throws(() => validateRuntimeManifest({ ...f.inputs, publicationSha256: '0'.repeat(64) }));
  assert.throws(() => validateRuntimeManifest({ ...f.inputs, publication: { ...f.inputs.publication, runAttempt: '2' } }));
});
