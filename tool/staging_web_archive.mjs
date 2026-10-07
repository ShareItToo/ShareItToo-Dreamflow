#!/usr/bin/env node
// USTAR plus canonical GNU LongName only: no OS tar or provenance metadata.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confinedDirectory, sha256, validateArtifact } from './staging_web_contract.mjs';

const check = (condition, code) => { if (!condition) throw Error(code); };
const BLOCK = 512;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const MAX_PATH = 1024;
const LONG_NAME = '././@LongLink';
// Flutter 3.41.7 ships these runtime WASM modules as 0755. Preserve only this
// manifest-bound binary class; never generalize the exception to executables.
const canvasKitWasmPaths = new Set(['web/canvaskit/canvaskit.wasm',
  'web/canvaskit/chromium/canvaskit.wasm', 'web/canvaskit/skwasm.wasm',
  'web/canvaskit/skwasm_heavy.wasm', 'web/canvaskit/wimp.wasm']);
const zero = (bytes) => bytes.every((byte) => byte === 0);
function absoluteFile(file) {
  check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file && file !== '/', 'archive_path_unsafe');
  confinedDirectory(path.dirname(file));
}
function safeName(name) {
  check(typeof name === 'string' && name.length > 0 && name.length <= MAX_PATH && name.split('/').every((part) =>
    /^[A-Za-z0-9_.@+-]+$/.test(part) && part !== '.' && part !== '..'
      && !part.startsWith('._') && part !== '__MACOSX'), 'archive_path_unsafe');
}
function sameStat(a, b) {
  return ['dev', 'ino', 'mode', 'size', 'nlink', 'mtimeNs', 'ctimeNs'].every((key) => a[key] === b[key]);
}
function readDescriptor(fd, limit = MAX_BYTES) {
  const before = fs.fstatSync(fd, { bigint: true });
  check(before.isFile() && before.nlink === 1n, 'archive_regular_single_link_required');
  check(before.size <= BigInt(limit), 'archive_size_limit');
  const bytes = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
    check(count > 0, 'archive_read_truncated'); offset += count;
  }
  check(sameStat(before, fs.fstatSync(fd, { bigint: true })), 'archive_source_changed');
  return { bytes, stat: before };
}
function readRegular(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try { return readDescriptor(fd, limit); } finally { fs.closeSync(fd); }
}
// The existing sealed-artifact validator remains authoritative. Capture only
// those validated bytes using stable, no-follow descriptors for the consumer.
function snapshot(artifact, manifestHash) {
  const manifest = validateArtifact(artifact, manifestHash);
  const result = []; let total = 0;
  function visit(relative) {
    const directory = path.join(artifact, relative);
    confinedDirectory(directory);
    const before = fs.lstatSync(directory, { bigint: true });
    check((before.mode & 0o7777n) === 0o755n, 'archive_directory_mode');
    for (const name of fs.readdirSync(directory).sort()) {
      const key = relative ? `${relative}/${name}` : name; safeName(key);
      check(result.length < MAX_ENTRIES, 'archive_entry_limit');
      const file = path.join(artifact, key); const stat = fs.lstatSync(file);
      if (stat.isDirectory()) {
        result.push({ name: key, type: '5', mode: 0o755, bytes: Buffer.alloc(0) }); visit(key);
      } else {
        const captured = readRegular(file, MAX_BYTES - total);
        const expected = key === 'staging-web-manifest.json' ? manifestHash
          : key.startsWith('web/') ? manifest.files[key.slice(4)] : undefined;
        if (expected) check(sha256(captured.bytes) === expected, 'archive_source_changed');
        else check(key === 'SHA256SUMS', 'archive_source_inventory');
        const mode = Number(captured.stat.mode & 0o7777n);
        check(mode === 0o644 || (mode === 0o755 && expected && canvasKitWasmPaths.has(key)
          && captured.bytes.subarray(0, 8).equals(Buffer.from('0061736d01000000', 'hex'))
          && WebAssembly.validate(captured.bytes)), 'archive_file_mode');
        total += captured.bytes.length;
        result.push({ name: key, type: '0', mode, bytes: captured.bytes });
      }
    }
    check(sameStat(before, fs.lstatSync(directory, { bigint: true })), 'archive_source_changed');
  }
  visit('');
  result.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const actualFiles = result.filter((entry) => entry.type === '0').map((entry) => entry.name);
  const expectedFiles = ['SHA256SUMS', 'staging-web-manifest.json', ...Object.keys(manifest.files).map((name) => `web/${name}`)].sort();
  check(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), 'archive_source_inventory');
  for (const entry of result) if (!splitName(entry.name)) {
    check(expectedFiles.some((name) => name === entry.name || name.startsWith(`${entry.name}/`)), 'archive_longname_manifest_binding');
  }
  const sums = `${manifestHash}  staging-web-manifest.json\n${Object.entries(manifest.files).map(([name, hash]) => `${hash}  web/${name}\n`).join('')}`;
  check(result.find((entry) => entry.name === 'SHA256SUMS').bytes.equals(Buffer.from(sums)), 'archive_source_changed');
  return result;
}
function splitName(name) {
  if (name.length <= 100) return { leaf: name, prefix: '' };
  for (let slash = name.lastIndexOf('/'); slash > 0; slash = name.lastIndexOf('/', slash - 1)) {
    if (slash <= 155 && name.length - slash - 1 <= 100) return { leaf: name.slice(slash + 1), prefix: name.slice(0, slash) };
  }
  return null;
}
function header(entry) {
  const out = Buffer.alloc(BLOCK); const { leaf, prefix } = splitName(entry.name);
  out.write(leaf, 0, 'ascii'); out.write(prefix, 345, 'ascii');
  const octal = (value, offset, width) => {
    const digits = value.toString(8); check(digits.length < width, 'archive_numeric_overflow');
    out.write(`${digits.padStart(width - 1, '0')}\0`, offset, 'ascii');
  };
  octal(entry.mode, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
  octal(entry.bytes.length, 124, 12); octal(0, 136, 12);
  out.fill(32, 148, 156); out.write(entry.type, 156, 'ascii');
  out.write('ustar\0', 257, 'ascii'); out.write('00', 263, 'ascii');
  const checksum = out.reduce((sum, byte) => sum + byte, 0);
  out.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return out;
}
// This parser does not call the encoder or compare against regenerated headers.
// It independently validates each actual header, payload and end marker.
function inspectArchive(bytes, expected) {
  check(bytes.length % BLOCK === 0 && bytes.length >= BLOCK * 2, 'archive_length_invalid');
  let offset = 0; let index = 0; let longName = null; const seen = new Set();
  while (offset < bytes.length) {
    const h = bytes.subarray(offset, offset + BLOCK);
    if (zero(h)) {
      check(longName === null, 'archive_longname_orphan');
      check(bytes.length - offset === BLOCK * 2 && zero(bytes.subarray(offset)), 'archive_trailer_invalid');
      check(index === expected.length, 'archive_inventory_missing');
      return { archiveHash: sha256(bytes), archiveBytes: bytes.length, entries: index };
    }
    const ascii = (start, width) => {
      const field = h.subarray(start, start + width); const end = field.indexOf(0);
      const text = end < 0 ? field : field.subarray(0, end);
      check(text.every((byte) => byte >= 32 && byte < 127)
        && (end < 0 || zero(field.subarray(end))), 'archive_header_text');
      return text.toString('ascii');
    };
    const octal = (start, width) => {
      const field = h.subarray(start, start + width);
      check(field[width - 1] === 0 && /^[0-7]+$/.test(field.subarray(0, -1).toString('latin1')), 'archive_header_number');
      return parseInt(field.subarray(0, -1).toString('ascii'), 8);
    };
    const sum = h.reduce((value, byte, at) => value + (at >= 148 && at < 156 ? 32 : byte), 0);
    check(/^[0-7]{6}\x00 $/.test(h.subarray(148, 156).toString('latin1'))
      && parseInt(h.subarray(148, 154).toString('ascii'), 8) === sum, 'archive_checksum_invalid');
    const type = String.fromCharCode(h[156]);
    check(type === '0' || type === '5' || type === 'L', 'archive_type_forbidden');
    check(h.subarray(257, 265).equals(Buffer.from('ustar\x0000', 'ascii')), 'archive_magic_invalid');
    check(zero(h.subarray(157, 257)) && zero(h.subarray(265, 345)) && zero(h.subarray(500)), 'archive_metadata_forbidden');
    check(octal(108, 8) === 0 && octal(116, 8) === 0 && octal(136, 12) === 0, 'archive_metadata_forbidden');
    const leaf = ascii(0, 100); const prefix = ascii(345, 155);
    check(leaf.length > 0, 'archive_path_unsafe');
    const mode = octal(100, 8); const size = octal(124, 12);
    const end = offset + BLOCK + size; const paddedEnd = offset + BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    check(paddedEnd <= bytes.length, 'archive_payload_mismatch');
    check(zero(bytes.subarray(end, paddedEnd)), 'archive_payload_padding');
    if (type === 'L') {
      check(longName === null, 'archive_longname_consecutive');
      check(leaf === LONG_NAME && prefix === '' && mode === 0 && size > 1 && size <= MAX_PATH + 1, 'archive_longname_header');
      const payload = bytes.subarray(offset + BLOCK, end);
      check(payload[size - 1] === 0 && payload.subarray(0, -1).every((byte) => byte >= 32 && byte < 127), 'archive_longname_payload');
      longName = payload.subarray(0, -1).toString('ascii'); safeName(longName);
      // Independently determine USTAR representability; do not call the encoder.
      const representable = longName.length <= 100 || [...longName].some((char, at) =>
        char === '/' && at > 0 && at <= 155 && longName.length - at - 1 <= 100);
      check(!representable, 'archive_longname_unnecessary');
      check(expected[index]?.name === longName, 'archive_longname_inventory');
      offset = paddedEnd; continue;
    }
    if (longName !== null) check(prefix === '' && leaf === longName.slice(0, 100), 'archive_longname_following_mismatch');
    const name = longName ?? (prefix ? `${prefix}/${leaf}` : leaf); safeName(name);
    longName = null;
    check(!seen.has(name), 'archive_duplicate_path'); seen.add(name);
    const entry = expected[index++];
    check(entry && name === entry.name, 'archive_inventory_or_order');
    check(type === entry.type && mode === entry.mode && size === entry.bytes.length, 'archive_type_mode_size_mismatch');
    check(paddedEnd <= bytes.length && sha256(bytes.subarray(offset + BLOCK, end)) === sha256(entry.bytes), 'archive_payload_mismatch');
    check(zero(bytes.subarray(end, paddedEnd)), 'archive_payload_padding');
    offset = paddedEnd;
  }
  throw Error('archive_trailer_missing');
}
export function verifyArchive(artifact, manifestHash, archive) {
  absoluteFile(archive);
  const expected = snapshot(artifact, manifestHash);
  const { bytes } = readRegular(archive);
  return { status: 'staging-web-archive-verified', manifestHash, ...inspectArchive(bytes, expected) };
}
export function buildArchive(artifact, manifestHash, archive) {
  confinedDirectory(artifact); absoluteFile(archive);
  const relative = path.relative(artifact, archive);
  check(path.isAbsolute(relative) || relative.split(path.sep)[0] === '..', 'archive_output_inside_artifact');
  // lstat also rejects an existing dangling symlink; O_EXCL remains the race guard.
  try { fs.lstatSync(archive); throw Error('archive_output_exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const expected = snapshot(artifact, manifestHash);
  const record = (entry) => [header(entry), entry.bytes, Buffer.alloc((BLOCK - entry.bytes.length % BLOCK) % BLOCK)];
  const chunks = expected.flatMap((entry) => splitName(entry.name) ? record(entry) : [
    ...record({ name: LONG_NAME, type: 'L', mode: 0, bytes: Buffer.from(`${entry.name}\0`, 'ascii') }),
    ...record({ ...entry, name: entry.name.slice(0, 100) }),
  ]);
  chunks.push(Buffer.alloc(BLOCK * 2));
  check(chunks.reduce((total, bytes) => total + bytes.length, 0) <= MAX_BYTES, 'archive_size_limit');
  const fd = fs.openSync(archive, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    for (const bytes of chunks) {
      let offset = 0;
      while (offset < bytes.length) {
        const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
        check(written > 0, 'archive_write_incomplete'); offset += written;
      }
    }
    fs.fsyncSync(fd);
    // Read the real file through the same exclusively created descriptor.
    const { bytes } = readDescriptor(fd);
    return { status: 'staging-web-archive-verified', manifestHash, ...inspectArchive(bytes, expected) };
  } finally { fs.closeSync(fd); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    check(args.length === 3, 'usage: staging_web_archive.mjs ABS_SEALED_ARTIFACT EXPECTED_MANIFEST_SHA ABS_NEW_TAR');
    console.log(JSON.stringify(buildArchive(...args)));
  } catch (error) {
    console.error(`Staging Web archive refused: ${error.message}`); process.exitCode = 1;
  }
}
