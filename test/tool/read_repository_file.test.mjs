import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { readRepositoryFile } from '../../tool/read_repository_file.mjs';

function fixture(callback) {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-repository-reader-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('reads a regular repository-relative file from its opened descriptor', () => fixture((root) => {
  writeFileSync(resolve(root, 'source.txt'), 'verified source\n', 'utf8');
  assert.equal(readRepositoryFile(root, 'source.txt'), 'verified source\n');
}));

test('rejects path traversal, directories and final-component symbolic links', () => fixture((root) => {
  writeFileSync(resolve(root, 'source.txt'), 'verified source\n', 'utf8');
  symlinkSync(resolve(root, 'source.txt'), resolve(root, 'source-link.txt'));

  assert.throws(() => readRepositoryFile(root, '../outside.txt'), /inside the repository/u);
  assert.throws(() => readRepositoryFile(root, '.'), /inside the repository/u);
  assert.throws(
    () => readRepositoryFile(root, 'source-link.txt'),
    /symbolic link|opened safely/u,
  );
}));

test('rejects a path that escapes through an intermediate symbolic link', () => fixture((root) => {
  const outside = fixture((outsideRoot) => {
    mkdirSync(resolve(outsideRoot, 'private'));
    writeFileSync(resolve(outsideRoot, 'private', 'source.txt'), 'outside\n', 'utf8');
    symlinkSync(resolve(outsideRoot, 'private'), resolve(root, 'escaped'));
    assert.throws(
      () => readRepositoryFile(root, 'escaped/source.txt'),
      /inside the repository/u,
    );
    return true;
  });
  assert.equal(outside, true);
}));
