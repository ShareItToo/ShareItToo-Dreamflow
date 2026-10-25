import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const check = (value) => { if (!value) throw new Error('facebook_web_writer_denied'); };
const stableKeys = ['dev', 'ino', 'mode', 'uid', 'gid'];
const same = (a, b) => stableKeys.every((key) => a[key] === b[key]);
const sameRead = (a, b) => [...stableKeys, 'nlink', 'size', 'mtimeNs', 'ctimeNs']
  .every((key) => a[key] === b[key]);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function readProtectedFacebookInput(file, repositoryRoot) {
  const descriptors = []; let bytes;
  try {
    check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
      && fs.realpathSync(repositoryRoot) === repositoryRoot
      && file !== repositoryRoot && !file.startsWith(`${repositoryRoot}/`));
    const dirs = ['/']; let name = '/';
    for (const part of file.split('/').filter(Boolean).slice(0, -1)) {
      name = path.join(name, part);
      const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      descriptors.push({ fd, path: name, stat: fs.fstatSync(fd, { bigint: true }) });
      check(descriptors.at(-1).stat.isDirectory());
      dirs.push(name);
    }
    const parent = descriptors.at(-1);
    check(parent && parent.stat.uid === BigInt(process.getuid())
      && (parent.stat.mode & 0o7777n) === 0o700n);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    descriptors.push({ fd, path: file, stat: fs.fstatSync(fd, { bigint: true }), file: true });
    const before = descriptors.at(-1).stat;
    check(before.isFile() && before.nlink === 1n && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n && before.size >= 16n && before.size <= 32768n);
    for (const entry of descriptors) {
      const compare = entry.file ? sameRead : same;
      check(compare(entry.stat, fs.fstatSync(entry.fd, { bigint: true }))
        && compare(entry.stat, fs.lstatSync(entry.path, { bigint: true })));
    }
    bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0);
    for (const entry of descriptors) {
      const compare = entry.file ? sameRead : same;
      check(compare(entry.stat, fs.fstatSync(entry.fd, { bigint: true }))
        && compare(entry.stat, fs.lstatSync(entry.path, { bigint: true })));
    }
    return bytes;
  } catch {
    bytes?.fill(0);
    throw new Error('facebook_web_protected_input_denied');
  } finally { for (const entry of descriptors.reverse()) fs.closeSync(entry.fd); }
}

/** Existing directory only; output files are exclusive, descriptor-held, 0600. */
export function reserveFacebookWebOutputs({ directory, runId, kinds, repositoryRoot }) {
  const dirs = []; const files = []; let closed = false; let written = false; let publicationComplete = false;
  const checkStable = () => {
    for (const entry of [...dirs, ...files]) check(same(entry.stat, fs.fstatSync(entry.fd, { bigint: true }))
      && same(entry.stat, fs.lstatSync(entry.path, { bigint: true }))
      && (!entry.file || fs.fstatSync(entry.fd).nlink === 1));
  };
  const close = () => {
    if (closed) return; closed = true;
    if (!publicationComplete) for (const entry of files) {
      try { const current = fs.lstatSync(entry.path, { bigint: true }); if (current.dev === entry.stat.dev && current.ino === entry.stat.ino) fs.unlinkSync(entry.path); } catch {}
    }
    for (const entry of [...dirs, ...files].reverse()) fs.closeSync(entry.fd);
  };
  try {
    check(typeof directory === 'string' && path.isAbsolute(directory) && path.normalize(directory) === directory
      && directory !== repositoryRoot && !directory.startsWith(`${repositoryRoot}/`)
      && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(runId)
      && (kinds.join('|') === 'candidate|journal' || kinds.join('|') === 'readiness'));
    let name = '/';
    for (const part of directory.split('/').filter(Boolean)) {
      name = path.join(name, part);
      const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      dirs.push({ path: name, fd, stat: fs.fstatSync(fd, { bigint: true }) });
    }
    check(dirs.length && dirs.at(-1).stat.uid === BigInt(process.getuid())
      && (dirs.at(-1).stat.mode & 0o7777n) === 0o700n);
    checkStable();
    for (const kind of kinds) {
      const file = path.join(directory, `${runId}.${kind}.json`);
      try { fs.lstatSync(file); check(false); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const kind of kinds) {
      checkStable(); const finalPath = path.join(directory, `${runId}.${kind}.json`);
      const tempPath = path.join(directory, `.${runId}.${kind}.${crypto.randomBytes(12).toString('hex')}.tmp`);
      const fd = fs.openSync(tempPath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      files.push({ path: tempPath, finalPath, fd, stat: fs.fstatSync(fd, { bigint: true }), file: true, kind });
      const stat = files.at(-1).stat;
      check(stat.isFile() && stat.uid === BigInt(process.getuid()) && stat.nlink === 1n
        && stat.size === 0n && (stat.mode & 0o7777n) === 0o600n); checkStable();
    }
      return Object.freeze({ close, write(values) {
      check(!closed && !written && values && Object.keys(values).sort().join('|') === [...kinds].sort().join('|'));
      const buffers = files.map((entry) => {
        const value = values[entry.kind]; check(typeof value === 'string' && value.length >= 2 && value.length <= 131072);
        check(JSON.stringify(JSON.parse(value)) === value); return Buffer.from(value);
      });
      written = true; checkStable();
      const result = files.map((entry, index) => {
        check(fs.fstatSync(entry.fd, { bigint: true }).size === 0n); const bytes = buffers[index]; let offset = 0;
        while (offset < bytes.length) { const n = fs.writeSync(entry.fd, bytes, offset, bytes.length - offset, offset); check(n > 0); offset += n; }
        fs.fsyncSync(entry.fd); checkStable();
        const readback = Buffer.alloc(bytes.length); offset = 0;
        while (offset < readback.length) { const n = fs.readSync(entry.fd, readback, offset, readback.length - offset, offset); check(n > 0); offset += n; }
        check(readback.equals(bytes) && fs.fstatSync(entry.fd, { bigint: true }).size === BigInt(bytes.length)); checkStable();
        const sha256 = hash(readback); readback.fill(0); bytes.fill(0);
        return { kind: entry.kind, path: entry.finalPath, sha256 };
      });
      fs.fsyncSync(dirs.at(-1).fd); checkStable();
      const publishedLinks = [];
      try {
        for (const entry of files) {
          fs.linkSync(entry.path, entry.finalPath);
          const linked = fs.lstatSync(entry.finalPath, { bigint: true });
          check(linked.dev === entry.stat.dev && linked.ino === entry.stat.ino && linked.nlink === 2n);
          publishedLinks.push({ path: entry.finalPath, dev: linked.dev, ino: linked.ino });
        }
        for (const entry of files) fs.unlinkSync(entry.path);
        fs.fsyncSync(dirs.at(-1).fd);
        for (const dir of dirs) check(same(dir.stat, fs.fstatSync(dir.fd, { bigint: true }))
          && same(dir.stat, fs.lstatSync(dir.path, { bigint: true })));
        for (const entry of files) {
          check(same(entry.stat, fs.fstatSync(entry.fd, { bigint: true })));
          const finalStat = fs.lstatSync(entry.finalPath, { bigint: true });
          check(finalStat.dev === entry.stat.dev && finalStat.ino === entry.stat.ino && finalStat.nlink === 1n);
        }
        publicationComplete = true;
        return result;
      } catch (error) {
        for (const own of publishedLinks) {
          try { const stat = fs.lstatSync(own.path, { bigint: true }); if (stat.dev === own.dev && stat.ino === own.ino) fs.unlinkSync(own.path); } catch {}
        }
        throw error;
      }
    } });
  } catch {
    for (const entry of files) {
      try { const current = fs.lstatSync(entry.path, { bigint: true }); if (current.dev === entry.stat.dev && current.ino === entry.stat.ino) fs.unlinkSync(entry.path); } catch {}
    }
    close(); throw new Error('facebook_web_writer_denied');
  }
}
