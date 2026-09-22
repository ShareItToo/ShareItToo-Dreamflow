import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeExclusiveWp250Mapping } from '../ops/staging_wp250_mapping.mjs';
import { closeStablePrivateFile, openStablePrivateFile } from '../ops/stable_private_file.mjs';

function readPrivateSnapshot(filePath) {
  const opened = openStablePrivateFile(filePath, {
    expectedMode: 0o600,
    minBytes: 1,
    code: 'mapping_file_invalid',
  });
  try {
    return { metadata: opened.metadata, bytes: readFileSync(opened.descriptor) };
  } finally {
    closeStablePrivateFile(opened);
  }
}

test('WP250 mapping writes exact bytes once to a private exclusive file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sit-wp250-map-'));
  try {
    const path = join(directory, 'mapping.json');
    const bytes = Buffer.from('{"synthetic":true}\n');
    assert.equal(await writeExclusiveWp250Mapping(path, bytes), path);
    const first = readPrivateSnapshot(path);
    assert.deepEqual(first.bytes, bytes);
    assert.equal(first.metadata.mode & 0o777, 0o600);
    await assert.rejects(() => writeExclusiveWp250Mapping(path, Buffer.from('changed')), /mapping_path_exists/u);
    const second = readPrivateSnapshot(path);
    assert.deepEqual(second.bytes, bytes);
    assert.equal(second.metadata.mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('WP250 private readback keeps metadata and bytes bound to one nofollow descriptor', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sit-wp250-map-'));
  try {
    const path = join(directory, 'mapping.json');
    const moved = join(directory, 'mapping.original.json');
    const replacement = Buffer.from('{"synthetic":false}\n');
    const bytes = Buffer.from('{"synthetic":true}\n');
    await writeExclusiveWp250Mapping(path, bytes);
    const opened = openStablePrivateFile(path, { expectedMode: 0o600, minBytes: 1, code: 'mapping_file_invalid' });
    try {
      await rename(path, moved);
      await writeFile(path, replacement, { mode: 0o600 });
      assert.equal(opened.metadata.mode & 0o777, 0o600);
      assert.deepEqual(readFileSync(opened.descriptor), bytes);
    } finally {
      closeStablePrivateFile(opened);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('WP250 mapping rejects symlink and path escape without modifying the target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sit-wp250-map-'));
  const target = join(directory, 'target.txt');
  try {
    await writeFile(target, 'keep');
    const link = join(directory, 'mapping.json');
    await symlink(target, link);
    await assert.rejects(() => writeExclusiveWp250Mapping(link, Buffer.from('overwrite')), /mapping_path_exists/u);
    assert.equal(await readFile(target, 'utf8'), 'keep');
    await rm(link);
    await assert.rejects(
      () => writeExclusiveWp250Mapping(`${directory}/../mapping.json`, Buffer.from('escape')),
      /mapping_path_invalid/u,
    );
    assert.equal(await readFile(target, 'utf8'), 'keep');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
