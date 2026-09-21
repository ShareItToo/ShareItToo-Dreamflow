import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeExclusiveWp250Mapping } from '../ops/staging_wp250_mapping.mjs';

test('WP250 mapping writes exact bytes once to a private exclusive file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sit-wp250-map-'));
  try {
    const path = join(directory, 'mapping.json');
    const bytes = Buffer.from('{"synthetic":true}\n');
    assert.equal(await writeExclusiveWp250Mapping(path, bytes), path);
    assert.deepEqual(await readFile(path), bytes);
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    await assert.rejects(() => writeExclusiveWp250Mapping(path, Buffer.from('changed')), /mapping_path_exists/u);
    assert.deepEqual(await readFile(path), bytes);
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
