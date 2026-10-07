import fs from 'node:fs';
import path from 'node:path';
import { assert, digest, objectDigest, repositoryRoot } from './green_staging_98_106_contract.mjs';

// A directory must already be provisioned. Validation never creates/chmods it.
export function privateDirectory(directory) {
  assert(typeof directory === 'string' && path.isAbsolute(directory)
    && path.normalize(directory) === directory && directory !== '/'
    && directory !== repositoryRoot && !directory.startsWith(`${repositoryRoot}/`), 'green_98_106_evidence_directory');
  let current = '/';
  for (const part of directory.split('/').filter(Boolean)) {
    current = path.join(current, part);
    const info = fs.lstatSync(current);
    assert(info.isDirectory() && !info.isSymbolicLink(), 'green_98_106_evidence_directory');
  }
  const stat = fs.lstatSync(directory);
  assert(stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o700, 'green_98_106_evidence_directory');
  return Object.freeze({ directory, dev: stat.dev, ino: stat.ino });
}
export function recheckDirectory(handle) {
  const now = privateDirectory(handle.directory);
  assert(now.dev === handle.dev && now.ino === handle.ino, 'green_98_106_evidence_directory_changed');
}
export function assertArtifactFamily(handle, names) {
  recheckDirectory(handle);
  for (const name of names) {
    assert(/^[a-z0-9][a-z0-9._-]{0,150}$/u.test(name), 'green_98_106_artifact_name');
    let present = true;
    try { fs.lstatSync(path.join(handle.directory, name)); } catch (error) {
      if (error.code === 'ENOENT') present = false; else throw error;
    }
    assert(!present, 'green_98_106_artifact_family_collision');
  }
}
export function exclusiveArtifact(handle, name) {
  recheckDirectory(handle);
  assert(/^[a-z0-9][a-z0-9._-]{0,150}$/u.test(name), 'green_98_106_artifact_name');
  const filename = path.join(handle.directory, name);
  const fd = fs.openSync(filename, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  const stat = fs.fstatSync(fd);
  assert(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid()
    && (stat.mode & 0o7777) === 0o600, 'green_98_106_artifact_metadata');
  return { fd, filename, name, directory: handle, dev: stat.dev, ino: stat.ino, closed: false };
}
export function verifyArtifact(handle, { expectedDigest, maxBytes = 1024 * 1024 * 1024 } = {}) {
  recheckDirectory(handle.directory);
  const before = fs.fstatSync(handle.fd, { bigint: true });
  const link = fs.lstatSync(handle.filename, { bigint: true });
  assert(before.isFile() && before.dev === BigInt(handle.dev) && before.ino === BigInt(handle.ino)
    && before.nlink === 1n && before.uid === BigInt(process.getuid()) && (before.mode & 0o7777n) === 0o600n
    && before.size > 0n && before.size <= BigInt(maxBytes), 'green_98_106_artifact_metadata');
  const bytes = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(handle.fd, bytes, offset, bytes.length - offset, offset);
    assert(count > 0, 'green_98_106_artifact_short_read'); offset += count;
  }
  const after = fs.fstatSync(handle.fd, { bigint: true });
  assert(['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every(key => before[key] === link[key] && before[key] === after[key]), 'green_98_106_artifact_changed');
  const sha256 = digest(bytes);
  assert(expectedDigest === undefined || sha256 === expectedDigest, 'green_98_106_artifact_digest');
  return { bytes, sha256 };
}
export function closeArtifact(handle) {
  if (!handle.closed) { fs.closeSync(handle.fd); handle.closed = true; }
}
export function openArtifact(filename) {
  assert(typeof filename === 'string' && path.isAbsolute(filename) && path.normalize(filename) === filename,
    'green_98_106_artifact_path');
  const directory = privateDirectory(path.dirname(filename));
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  const stat = fs.fstatSync(fd);
  return { fd, filename, name: path.basename(filename), directory, dev: stat.dev, ino: stat.ino, closed: false };
}
export function writeArtifact(directory, name, value) {
  const handle = exclusiveArtifact(directory, name);
  try {
    fs.writeFileSync(handle.fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(handle.fd);
    const { bytes, sha256 } = verifyArtifact(handle);
    bytes.fill(0);
    return { name, sha256, contentSha256: objectDigest(value) };
  } finally { closeArtifact(handle); }
}
