import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealArtifact, sha256, validateArtifact } from '../../tool/staging_web_contract.mjs';
import { buildArchive, verifyArchive } from '../../tool/staging_web_archive.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cli = path.join(root, 'tool/staging_web_archive.mjs');
function fixture(t, extra = {}) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-web-archive-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const artifact = path.join(temp, 'artifact');
  const files = { 'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compiled bytes', 'manifest.json': '{}', 'flutter_bootstrap.js': 'fixture',
    'assets/nested/bytes.bin': Buffer.from([0, 1, 255, 0]),
    [`assets/${'a'.repeat(90)}/${'b'.repeat(70)}.bin`]: 'USTAR prefix coverage', ...extra };
  fs.mkdirSync(path.join(artifact, 'web/empty'), { recursive: true, mode: 0o755 });
  for (const [name, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(artifact, 'web', name)), { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(artifact, 'web', name), bytes, { mode: 0o644 });
  }
  const manifestHash = sealArtifact({ directory: artifact, source: 'a'.repeat(40),
    version: '1.0.0+2026092905', flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'b'.repeat(64) });
  return { temp, artifact, manifestHash, archive: path.join(temp, 'transfer.tar') };
}
const build = (f) => buildArchive(f.artifact, f.manifestHash, f.archive);
const verify = (f) => verifyArchive(f.artifact, f.manifestHash, f.archive);
function entries(bytes) {
  const result = [];
  for (let offset = 0; bytes[offset];) {
    const size = parseInt(bytes.subarray(offset + 124, offset + 135).toString(), 8);
    const length = 512 + Math.ceil(size / 512) * 512;
    result.push({ offset, size, length, type: String.fromCharCode(bytes[offset + 156]) });
    offset += length;
  }
  return result;
}
function checksum(bytes, offset = 0) {
  bytes.fill(32, offset + 148, offset + 156);
  const sum = bytes.subarray(offset, offset + 512).reduce((a, b) => a + b, 0);
  bytes.write(`${sum.toString(8).padStart(6, '0')}\0 `, offset + 148, 'ascii');
}
function editHeader(f, edit, index = 0) {
  const bytes = fs.readFileSync(f.archive);
  const offset = entries(bytes)[index].offset;
  edit(bytes.subarray(offset, offset + 512)); checksum(bytes, offset);
  fs.writeFileSync(f.archive, bytes);
}

test('real Node CLI builds reproducible metadata-free archives; independent tar extracts exact sealed bytes', (t) => {
  const f = fixture(t);
  const invoke = (archive) => spawnSync(process.execPath, [cli, f.artifact, f.manifestHash, archive], { encoding: 'utf8' });
  const first = invoke(f.archive);
  assert.equal(first.status, 0, first.stderr);
  const proof = JSON.parse(first.stdout);
  assert.equal(proof.status, 'staging-web-archive-verified');
  assert.equal(proof.manifestHash, f.manifestHash);
  assert.equal(proof.archiveHash, sha256(fs.readFileSync(f.archive)));
  const other = path.join(f.temp, 'repeat.tar');
  fs.utimesSync(path.join(f.artifact, 'web/main.dart.js'), new Date(1), new Date(1));
  assert.equal(invoke(other).status, 0);
  assert.equal(sha256(fs.readFileSync(other)), proof.archiveHash);
  assert.equal(verify(f).archiveHash, proof.archiveHash);
  const extracted = path.join(f.temp, 'extracted'); fs.mkdirSync(extracted);
  const result = spawnSync('tar', ['-xf', f.archive, '-C', extracted], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  validateArtifact(extracted, f.manifestHash);
  assert.equal(verifyArchive(extracted, f.manifestHash, f.archive).archiveHash, proof.archiveHash);
  assert.ok(fs.statSync(path.join(extracted, 'web/empty')).isDirectory());
  const sourceFiles = JSON.parse(fs.readFileSync(path.join(f.artifact, 'staging-web-manifest.json'))).files;
  for (const name of Object.keys(sourceFiles)) assert.deepEqual(
    fs.readFileSync(path.join(extracted, 'web', name)), fs.readFileSync(path.join(f.artifact, 'web', name)));
});

for (const type of ['x', 'g', 'L', 'K', '1', '2', '3', '4', '6', '7', 'S', '\0']) {
  test(`archive rejects PAX/GNU/link/special type ${JSON.stringify(type)}`, (t) => {
    const f = fixture(t); build(f);
    editHeader(f, (h) => h.write(type, 156, 'ascii'));
    assert.throws(() => verify(f), /archive_type_forbidden/);
  });
}
for (const name of ['../escape', '/absolute', 'web/../escape', './SHA256SUMS', 'web//duplicate', 'web/._main.dart.js', '__MACOSX/file', 'web\\escape']) {
  test(`archive rejects ambiguous or metadata pathname ${name}`, (t) => {
    const f = fixture(t); build(f);
    editHeader(f, (h) => { h.fill(0, 0, 100); h.write(name, 0, 'ascii'); });
    assert.throws(() => verify(f), /archive_path_unsafe/);
  });
}
test('real PAX xattr/provenance record is rejected before its payload can become an entry', (t) => {
  const f = fixture(t); build(f);
  const archive = fs.readFileSync(f.archive);
  const header = Buffer.from(archive.subarray(0, 512));
  header.fill(0, 0, 100); header.write('PaxHeader', 0); header.write('x', 156);
  const record = 'LIBARCHIVE.xattr.com.apple.provenance=synthetic\n';
  let length = record.length + 2;
  while (String(length).length + 1 + record.length !== length) length = String(length).length + 1 + record.length;
  const payload = Buffer.from(`${length} ${record}`);
  header.write(`${payload.length.toString(8).padStart(11, '0')}\0`, 124); checksum(header);
  fs.writeFileSync(f.archive, Buffer.concat([header, payload, Buffer.alloc(512 - payload.length), archive]));
  assert.throws(() => verify(f), /archive_type_forbidden/);
});
for (const field of ['mode', 'owner', 'mtime', 'linkname', 'uname', 'devmajor', 'padding', 'magic', 'checksum']) {
  test(`archive rejects changed or extended metadata ${field}`, (t) => {
    const f = fixture(t); build(f);
    editHeader(f, (h) => {
      const offset = { mode: 100, owner: 108, mtime: 136, linkname: 157, uname: 265,
        devmajor: 329, padding: 500, magic: 257, checksum: 0 }[field];
      h[offset] = field === 'mode' ? 55 : 65;
    });
    if (field === 'checksum') { const b = fs.readFileSync(f.archive); b[0] ^= 1; fs.writeFileSync(f.archive, b); }
    assert.throws(() => verify(f), /archive_/);
  });
}
for (const variant of ['duplicate', 'extra', 'missing', 'order', 'size', 'bytes', 'truncated', 'trailer', 'bodyPadding']) {
  test(`archive readback rejects ${variant}`, (t) => {
    const f = fixture(t); build(f); let bytes = fs.readFileSync(f.archive);
    const inventory = entries(bytes); const a = inventory[0]; const b = inventory[1];
    if (variant === 'duplicate') bytes = Buffer.concat([bytes.subarray(0, a.length), bytes]);
    if (variant === 'extra') {
      const extra = Buffer.from(bytes.subarray(0, a.length));
      extra.fill(0, 0, 100); extra.write('unexpected'); checksum(extra);
      bytes = Buffer.concat([extra, bytes]);
    }
    if (variant === 'missing') bytes = bytes.subarray(a.length);
    if (variant === 'order') bytes = Buffer.concat([bytes.subarray(b.offset, b.offset + b.length), bytes.subarray(0, a.length), bytes.subarray(b.offset + b.length)]);
    if (variant === 'size') { bytes.write('00000000000\0', 124); checksum(bytes); }
    if (variant === 'bytes') bytes[512] ^= 1;
    if (variant === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
    if (variant === 'trailer') bytes = Buffer.concat([bytes, Buffer.alloc(512)]);
    if (variant === 'bodyPadding') bytes[512 + a.size] = 1;
    fs.writeFileSync(f.archive, bytes);
    assert.throws(() => verify(f), /archive_/);
  });
}
for (const variant of ['existing', 'danglingTarget', 'insideArtifact', 'relative', 'escape', 'parentAlias', 'artifactAlias', 'hash', 'extraArgument']) {
  test(`CLI rejects unsafe inputs without overwriting: ${variant}`, (t) => {
    const f = fixture(t); let artifact = f.artifact; let archive = f.archive; let hash = f.manifestHash;
    if (variant === 'existing') fs.writeFileSync(archive, 'preserve');
    if (variant === 'danglingTarget') fs.symlinkSync(path.join(f.temp, 'absent'), archive);
    if (variant === 'insideArtifact') archive = path.join(artifact, 'new.tar');
    if (variant === 'relative') artifact = 'relative';
    if (variant === 'escape') archive = `${f.temp}/../escape.tar`;
    if (variant === 'parentAlias') { fs.symlinkSync(f.temp, path.join(f.temp, 'alias')); archive = path.join(f.temp, 'alias/out.tar'); }
    if (variant === 'artifactAlias') { artifact = path.join(f.temp, 'alias'); fs.symlinkSync(f.artifact, artifact); }
    if (variant === 'hash') hash = 'c'.repeat(64);
    const args = [cli, artifact, hash, archive, ...(variant === 'extraArgument' ? ['--anything'] : [])];
    assert.notEqual(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
    if (variant === 'existing') assert.equal(fs.readFileSync(archive, 'utf8'), 'preserve');
    else if (variant !== 'danglingTarget') assert.equal(fs.existsSync(archive), false);
  });
}
for (const suffix of ['/', '///']) {
  test(`CLI refuses inside output with artifact trailing separator ${JSON.stringify(suffix)} without changing artifact`, (t) => {
    const f = fixture(t);
    const capture = () => fs.readdirSync(f.artifact, { recursive: true }).sort().map((name) => {
      const file = path.join(f.artifact, name); const stat = fs.lstatSync(file);
      return [name, stat.mode, stat.mtimeMs, stat.isDirectory() ? 'directory' : sha256(fs.readFileSync(file))];
    });
    const before = capture();
    const archive = path.join(f.artifact, 'out.tar');
    const result = spawnSync(process.execPath, [cli, `${f.artifact}${suffix}`, f.manifestHash, archive], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(archive), false);
    assert.deepEqual(capture(), before);
    validateArtifact(f.artifact, f.manifestHash);
  });
}
test('CLI permits outside sibling with matching artifact name prefix', (t) => {
  const f = fixture(t);
  const sibling = `${f.artifact}-other`; fs.mkdirSync(sibling);
  const archive = path.join(sibling, 'out.tar');
  const result = spawnSync(process.execPath, [cli, `${f.artifact}/`, f.manifestHash, archive], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verifyArchive(f.artifact, f.manifestHash, archive).archiveHash, JSON.parse(result.stdout).archiveHash);
  validateArtifact(f.artifact, f.manifestHash);
});
for (const variant of ['symlink', 'hardlink', 'fifo', 'writable', 'directoryMode', 'AppleDouble', 'longName']) {
  test(`builder refuses unsafe source inventory: ${variant}`, (t) => {
    const extra = variant === 'AppleDouble' ? { '._extra': 'metadata' }
      : variant === 'longName' ? { ['a'.repeat(101)]: 'unrepresentable' } : {};
    const f = fixture(t, extra);
    const file = path.join(f.artifact, 'web/main.dart.js');
    if (variant === 'symlink') { fs.unlinkSync(file); fs.symlinkSync('/does-not-exist', file); }
    if (variant === 'hardlink') fs.linkSync(file, path.join(f.temp, 'link'));
    if (variant === 'fifo') { fs.unlinkSync(file); assert.equal(spawnSync('mkfifo', [file]).status, 0); }
    if (variant === 'writable') fs.chmodSync(file, 0o666);
    if (variant === 'directoryMode') fs.chmodSync(path.join(f.artifact, 'web/empty'), 0o777);
    assert.throws(() => build(f));
    assert.equal(fs.existsSync(f.archive), false);
  });
}
for (const variant of ['symlink', 'hardlink', 'fifo']) {
  test(`independent verifier refuses ${variant} archive input`, (t) => {
    const f = fixture(t); build(f);
    const retained = path.join(f.temp, 'retained.tar'); fs.renameSync(f.archive, retained);
    if (variant === 'symlink') fs.symlinkSync(retained, f.archive);
    if (variant === 'hardlink') fs.linkSync(retained, f.archive);
    if (variant === 'fifo') assert.equal(spawnSync('mkfifo', [f.archive]).status, 0);
    assert.throws(() => verify(f));
  });
}
test('standard regression discovers archive tests and runbook requires checked transfer', () => {
  assert.match(fs.readFileSync(path.join(root, 'scripts/technical_regression_check.sh'), 'utf8'), /node --test test\/tool\/\*\.test\.mjs/);
  const runbook = fs.readFileSync(path.join(root, 'docs/operations/STAGING_WEB_PILOT.md'), 'utf8');
  assert.match(runbook, /staging_web_archive\.mjs/);
  assert.match(runbook, /verifyArchive/);
});
