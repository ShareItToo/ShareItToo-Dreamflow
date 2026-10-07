import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const check = (value) => { if (!value) throw new Error('google_web_protected_writer_denied'); };
const stableFields = ['dev', 'ino', 'mode', 'uid', 'gid'];
const equal = (a, b) => stableFields.every((key) => a[key] === b[key]);

/** Reserve all outputs before credentials/provider reads. Never mkdir, chmod,
 * overwrite, rename or unlink. Failure may leave exclusive empty/partial 0600
 * files: use a fresh run id after inspection; do not reuse a failed reservation.
 * No system can protect artifacts from a malicious process with the same uid.
 */
export function reserveGoogleWebArtifacts({ directory, runId, kinds, repositoryRoot }) {
  const chain = []; const outputs = []; let closed = false; let written = false;
  const stable = () => {
    for (const entry of [...chain, ...outputs]) {
      check(equal(entry.stat, fs.fstatSync(entry.fd, { bigint: true }))
        && equal(entry.stat, fs.lstatSync(entry.path, { bigint: true })));
      if (entry.kind) check(fs.fstatSync(entry.fd).nlink === 1);
    }
  };
  const close = () => {
    if (closed) return; closed = true;
    for (const entry of [...chain, ...outputs].reverse()) fs.closeSync(entry.fd);
  };
  try {
    check(typeof directory === 'string' && path.isAbsolute(directory) && path.normalize(directory) === directory
      && path.isAbsolute(repositoryRoot) && fs.realpathSync(repositoryRoot) === repositoryRoot
      && directory !== repositoryRoot && !directory.startsWith(`${repositoryRoot}/`)
      && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(runId)
      && Array.isArray(kinds) && (kinds.join('|') === 'candidate|journal' || kinds.join('|') === 'readiness'));
    let name = '/';
    for (const part of ['', ...directory.split('/').filter(Boolean)]) {
      if (part) name = path.join(name, part);
      const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(fd, { bigint: true }); chain.push({ path: name, fd, stat });
      check(stat.isDirectory());
    }
    const parent = chain.at(-1).stat;
    check(parent.uid === BigInt(process.getuid()) && (parent.mode & 0o7777n) === 0o700n);
    stable();
    // Check the entire namespace before reserving any file; O_EXCL still closes
    // the collision race after this check.
    for (const kind of kinds) {
      try { fs.lstatSync(path.join(directory, `${runId}.${kind}.json`)); check(false); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const kind of kinds) {
      stable(); const file = path.join(directory, `${runId}.${kind}.json`);
      const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      const stat = fs.fstatSync(fd, { bigint: true }); outputs.push({ path: file, fd, stat, kind });
      check(stat.isFile() && stat.uid === BigInt(process.getuid()) && stat.nlink === 1n
        && stat.size === 0n && (stat.mode & 0o7777n) === 0o600n); stable();
    }
    return Object.freeze({ close, write(values) {
      try {
        check(!closed && !written && values !== null && Object.getPrototypeOf(values) === Object.prototype
          && Object.keys(values).sort().join('|') === [...kinds].sort().join('|'));
        const buffers = outputs.map(({ kind }) => {
          const value = values[kind]; check(typeof value === 'string' && value.length >= 2 && value.length <= 131072
            && JSON.stringify(JSON.parse(value)) === value); return Buffer.from(value);
        });
        written = true; stable();
        const result = outputs.map((entry, index) => {
          check(fs.fstatSync(entry.fd).size === 0); const bytes = buffers[index];
          let offset = 0;
          while (offset < bytes.length) { const count = fs.writeSync(entry.fd, bytes, offset, bytes.length - offset, offset); check(count > 0); offset += count; }
          fs.fsyncSync(entry.fd); stable(); const before = fs.fstatSync(entry.fd, { bigint: true });
          const readback = Buffer.alloc(bytes.length); offset = 0;
          while (offset < readback.length) { const count = fs.readSync(entry.fd, readback, offset, readback.length - offset, offset); check(count > 0); offset += count; }
          const after = fs.fstatSync(entry.fd, { bigint: true });
          check(readback.equals(bytes) && before.size === BigInt(bytes.length)
            && ['size', 'ctimeNs', 'mtimeNs'].every((key) => before[key] === after[key]));
          return { kind: entry.kind, path: entry.path, sha256: createHash('sha256').update(readback).digest('hex'), bytes: bytes.length };
        });
        fs.fsyncSync(chain.at(-1).fd); stable(); return result;
      } catch { throw new Error('google_web_protected_writer_denied'); }
    } });
  } catch { close(); throw new Error('google_web_protected_writer_denied'); }
}
