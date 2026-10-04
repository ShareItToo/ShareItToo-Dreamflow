import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventory, sha256 } from '../../tool/staging_web_contract.mjs';

function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-inventory-race-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'web'); const nested = path.join(root, 'nested');
  fs.mkdirSync(nested, { recursive: true });
  const file = path.join(nested, 'asset.bin');
  fs.writeFileSync(file, 'synthetic asset'); fs.writeFileSync(path.join(root, 'empty'), '');
  const outside = path.join(temp, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'asset.bin'), 'outside must not be read');
  const opened = new Set(); const open = fs.openSync; const close = fs.closeSync;
  t.mock.method(fs, 'openSync', (...args) => { const fd = open(...args); opened.add(fd); return fd; });
  t.mock.method(fs, 'closeSync', (fd) => { close(fd); opened.delete(fd); });
  return { temp, root, nested, file, outside, opened };
}
function refused(f) {
  assert.throws(() => inventory(f.root), { message: 'artifact_inventory_changed' });
  assert.equal(f.opened.size, 0, 'all owned descriptors close on failure');
}

test('inventory preserves sorted keys and exact SHA-256 bytes, including empty and multi-chunk assets', (t) => {
  const f = fixture(t); const bytes = Buffer.alloc(150000, 7); fs.writeFileSync(f.file, bytes);
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (name, ...args) => {
    assert.notEqual(typeof name, 'string', 'inventory must not read through a pathname');
    return read(name, ...args);
  });
  assert.deepEqual(inventory(f.root), { empty: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'nested/asset.bin': sha256(bytes) });
  assert.equal(f.opened.size, 0);
});

for (const replacement of ['regular', 'symlink', 'directory', 'hardlink']) {
  test(`entry replacement between lstat and open fails before reading: ${replacement}`, (t) => {
    const f = fixture(t); const open = fs.openSync; const read = fs.readSync; let changed = false; let reads = 0;
    t.mock.method(fs, 'openSync', (file, ...args) => {
      if (file === f.file && !changed) {
        changed = true; fs.renameSync(f.file, path.join(f.temp, 'original'));
        if (replacement === 'regular') fs.writeFileSync(f.file, 'replacement');
        if (replacement === 'symlink') fs.symlinkSync(path.join(f.outside, 'asset.bin'), f.file);
        if (replacement === 'directory') fs.mkdirSync(f.file);
        if (replacement === 'hardlink') fs.linkSync(path.join(f.outside, 'asset.bin'), f.file);
      }
      return open(file, ...args);
    });
    t.mock.method(fs, 'readSync', (...args) => { if (changed) reads++; return read(...args); });
    refused(f); assert.equal(changed, true); assert.equal(reads, 0);
  });
}

for (const change of ['replace', 'truncate', 'grow', 'rewrite']) {
  test(`file identity/content change during descriptor read is rejected: ${change}`, (t) => {
    const f = fixture(t); const open = fs.openSync; const read = fs.readSync; let target; let changed = false;
    t.mock.method(fs, 'openSync', (file, ...args) => { const fd = open(file, ...args); if (file === f.file) target = fd; return fd; });
    t.mock.method(fs, 'readSync', (...args) => {
      const count = read(...args);
      if (args[0] === target && !changed) {
        changed = true;
        if (change === 'replace') { fs.renameSync(f.file, path.join(f.temp, 'original')); fs.writeFileSync(f.file, 'replacement'); }
        if (change === 'truncate') fs.truncateSync(f.file, 0);
        if (change === 'grow') fs.appendFileSync(f.file, 'growth');
        if (change === 'rewrite') { fs.writeFileSync(f.file, 'SYNTHETIC ASSET'); fs.utimesSync(f.file, 1, 1); }
      }
      return count;
    });
    refused(f); assert.equal(changed, true);
  });
}

for (const target of ['root', 'nested']) {
  for (const change of ['replace', 'symlink', 'add-entry', 'rename-back']) {
    test(`directory race during enumeration fails closed: ${target}/${change}`, (t) => {
      const f = fixture(t); const directory = f[target]; const readdir = fs.readdirSync; let changed = false;
      t.mock.method(fs, 'readdirSync', (file, ...args) => {
        const names = readdir(file, ...args);
        if (file === directory && !changed) {
          changed = true;
          if (change === 'add-entry') fs.writeFileSync(path.join(directory, 'new'), 'new');
          else {
            const moved = path.join(f.temp, 'moved'); fs.renameSync(directory, moved);
            if (change === 'replace') fs.mkdirSync(directory);
            if (change === 'symlink') fs.symlinkSync(f.outside, directory);
            if (change === 'rename-back') { fs.renameSync(moved, directory); fs.utimesSync(directory, 1, 1); }
          }
        }
        return names;
      });
      refused(f); assert.equal(changed, true);
    });
  }
}

test('directory replacement while a child descriptor is open rejects the inventory', (t) => {
  const f = fixture(t); const open = fs.openSync; const read = fs.readSync; let target; let changed = false;
  t.mock.method(fs, 'openSync', (file, ...args) => { const fd = open(file, ...args); if (file === f.file) target = fd; return fd; });
  t.mock.method(fs, 'readSync', (...args) => {
    const count = read(...args);
    if (args[0] === target && !changed) {
      changed = true; fs.renameSync(f.nested, path.join(f.temp, 'moved')); fs.symlinkSync(f.outside, f.nested);
    }
    return count;
  });
  refused(f); assert.equal(changed, true);
});

test('read failure is sanitized and releases file and directory descriptors', (t) => {
  const f = fixture(t);
  t.mock.method(fs, 'readSync', () => { throw Error('/private/untrusted-fixture-path'); });
  refused(f);
});
