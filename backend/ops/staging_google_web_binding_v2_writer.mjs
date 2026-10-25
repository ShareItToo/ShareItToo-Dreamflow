import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const check = (v) => { if (!v) throw new Error('google_web_binding_v2_denied'); };
const hash = (v) => createHash('sha256').update(v).digest('hex');
export function reserveGoogleWebBindingV2({ outputDir, runId, repositoryRoot }) {
  const chain = []; let fd; let closed = false; let written = false;
  const filePath = path.join(outputDir, `google-web-binding-v2-${runId}.binding.json`);
  const equal = (a, b) => ['dev', 'ino', 'mode', 'uid', 'gid'].every((k) => a[k] === b[k]);
  const stable = () => {
    for (const entry of chain) check(equal(entry.stat, fs.fstatSync(entry.fd, { bigint: true }))
      && equal(entry.stat, fs.lstatSync(entry.path, { bigint: true })));
    if (fd !== undefined) {
      const st = fs.fstatSync(fd, { bigint: true });
      check(st.isFile() && st.nlink === 1n && st.uid === BigInt(process.getuid()) && (st.mode & 0o7777n) === 0o600n
        && equal(st, fs.lstatSync(filePath, { bigint: true })));
    }
  };
  const close = () => {
    if (closed) return; closed = true; if (fd !== undefined) fs.closeSync(fd);
    for (const entry of chain.reverse()) fs.closeSync(entry.fd);
  };
  try {
    check(path.isAbsolute(outputDir) && path.normalize(outputDir) === outputDir && fs.realpathSync(outputDir) === outputDir
      && path.isAbsolute(repositoryRoot) && fs.realpathSync(repositoryRoot) === repositoryRoot
      && outputDir !== repositoryRoot && !outputDir.startsWith(`${repositoryRoot}${path.sep}`)
      && /^[a-z0-9][a-z0-9-]{0,62}$/u.test(runId));
    let current = '/';
    for (const part of outputDir.split('/').filter(Boolean)) {
      current = path.join(current, part); const entryfd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(entryfd, { bigint: true }); chain.push({ path: current, fd: entryfd, stat }); check(stat.isDirectory());
    }
    const parent = chain.at(-1).stat;
    check(parent.uid === BigInt(process.getuid()) && (parent.mode & 0o7777n) === 0o700n); stable();
    fd = fs.openSync(filePath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const st = fs.fstatSync(fd, { bigint: true }); check(st.isFile() && st.uid === BigInt(process.getuid()) && st.nlink === 1n
      && st.size === 0n && (st.mode & 0o7777n) === 0o600n); stable();
    return Object.freeze({ path: filePath, close, write(bytes) {
      try {
        check(!closed && !written && Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 131072); stable(); written = true;
        let offset = 0; while (offset < bytes.length) { const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
        fs.fsyncSync(fd); stable(); const before = fs.fstatSync(fd, { bigint: true }); const copy = Buffer.alloc(bytes.length); offset = 0;
        while (offset < copy.length) { const n = fs.readSync(fd, copy, offset, copy.length - offset, offset); check(n > 0); offset += n; }
        const after = fs.fstatSync(fd, { bigint: true });
        check(copy.equals(bytes) && before.size === BigInt(bytes.length) && ['size', 'ctimeNs', 'mtimeNs'].every((k) => before[k] === after[k]));
        fs.fsyncSync(chain.at(-1).fd); stable();
        return { path: filePath, sha256: hash(copy), bytes: copy.length, mode: '0600' };
      } catch { throw new Error('google_web_binding_v2_denied'); }
    } });
  } catch { close(); throw new Error('google_web_binding_v2_denied'); }
}
export function writeGoogleWebBindingV2({ outputDir, runId, bytes, repositoryRoot }) {
  const chain = []; let filefd;
  const equal = (a, b) => ['dev', 'ino', 'mode', 'uid', 'gid'].every((k) => a[k] === b[k]);
  const stable = () => {
    for (const entry of chain) check(equal(entry.stat, fs.fstatSync(entry.fd, { bigint: true }))
      && equal(entry.stat, fs.lstatSync(entry.path, { bigint: true })));
    if (filefd !== undefined) {
      const opened = fs.fstatSync(filefd, { bigint: true });
      check(opened.isFile() && opened.nlink === 1n && opened.uid === BigInt(process.getuid()) && (opened.mode & 0o7777n) === 0o600n
        && equal(opened, fs.lstatSync(path.join(outputDir, `google-web-binding-v2-${runId}.binding.json`), { bigint: true })));
    }
  };
  try {
    check(path.isAbsolute(outputDir) && path.normalize(outputDir) === outputDir && fs.realpathSync(outputDir) === outputDir
      && outputDir !== repositoryRoot && !outputDir.startsWith(`${repositoryRoot}${path.sep}`)
      && /^[a-z0-9][a-z0-9-]{0,62}$/u.test(runId) && Buffer.isBuffer(bytes) && bytes.length > 0);
    let current = '/';
    for (const part of outputDir.split('/').filter(Boolean)) {
      current = path.join(current, part);
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(fd, { bigint: true }); chain.push({ path: current, fd, stat }); check(stat.isDirectory());
    }
    const parent = chain.at(-1).stat; check(parent.uid === BigInt(process.getuid()) && (parent.mode & 0o7777n) === 0o700n); stable();
    const name = `google-web-binding-v2-${runId}.binding.json`; const file = path.join(outputDir, name);
    filefd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const opened = fs.fstatSync(filefd, { bigint: true });
    check(opened.isFile() && opened.uid === BigInt(process.getuid()) && opened.nlink === 1n && opened.size === 0n
      && (opened.mode & 0o7777n) === 0o600n); stable();
    let offset = 0; while (offset < bytes.length) { const n = fs.writeSync(filefd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    fs.fsyncSync(filefd); stable(); const before = fs.fstatSync(filefd, { bigint: true });
    const readback = Buffer.alloc(bytes.length); offset = 0;
    while (offset < readback.length) { const n = fs.readSync(filefd, readback, offset, readback.length - offset, offset); check(n > 0); offset += n; }
    const after = fs.fstatSync(filefd, { bigint: true });
    check(readback.equals(bytes) && before.size === BigInt(bytes.length)
      && ['size', 'ctimeNs', 'mtimeNs'].every((k) => before[k] === after[k]));
    fs.fsyncSync(chain.at(-1).fd); stable();
    return { path: file, sha256: hash(readback), bytes: readback.length, mode: '0600' };
  } catch { throw new Error('google_web_binding_v2_denied'); }
  finally { if (filefd !== undefined) fs.closeSync(filefd); for (const entry of chain.reverse()) fs.closeSync(entry.fd); }
}
