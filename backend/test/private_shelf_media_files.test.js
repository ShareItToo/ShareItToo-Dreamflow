import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  attemptPrivateShelfMediaCleanup,
  openPrivateShelfMediaFile,
  readPrivateShelfMediaFile,
} from '../src/private_shelf_media_files.js';

const storageName = '11111111-1111-4111-8111-111111111111-full.webp';

async function fixture() {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-private-shelf-media-'));
  const directory = path.join(uploadDir, 'private-shelf');
  const file = path.join(directory, storageName);
  const bytes = Buffer.from('approved-private-media-bytes');
  await fs.mkdir(directory, { mode: 0o750 });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  await fs.chmod(file, 0o640);
  return { uploadDir, file, bytes };
}

test('private shelf media read binds mode, size and digest to a no-follow descriptor', async (t) => {
  const current = await fixture();
  t.after(() => fs.rm(current.uploadDir, { recursive: true, force: true }));
  const digest = crypto.createHash('sha256').update(current.bytes).digest('hex');
  assert.deepEqual(await readPrivateShelfMediaFile({
    uploadDir: current.uploadDir,
    storageName,
    expectedBytes: current.bytes.length,
    expectedSha256: digest,
  }), current.bytes);

  const opened = await openPrivateShelfMediaFile({
    uploadDir: current.uploadDir,
    storageName,
    expectedBytes: current.bytes.length,
  });
  const approvedPath = `${current.file}.approved`;
  await fs.rename(current.file, approvedPath);
  await fs.writeFile(current.file, Buffer.alloc(current.bytes.length, 0x58), { mode: 0o640 });
  try {
    assert.deepEqual(await opened.readFile(), current.bytes);
  } finally {
    await opened.close();
  }
  await assert.rejects(readPrivateShelfMediaFile({
    uploadDir: current.uploadDir,
    storageName,
    expectedBytes: current.bytes.length,
    expectedSha256: digest,
  }), /private_shelf_media_unavailable/u);
});

test('private shelf media read rejects symlink and unsafe mode', async (t) => {
  const current = await fixture();
  t.after(() => fs.rm(current.uploadDir, { recursive: true, force: true }));
  const digest = crypto.createHash('sha256').update(current.bytes).digest('hex');
  const target = `${current.file}.target`;
  await fs.rename(current.file, target);
  await fs.symlink(target, current.file);
  await assert.rejects(readPrivateShelfMediaFile({
    uploadDir: current.uploadDir,
    storageName,
    expectedBytes: current.bytes.length,
    expectedSha256: digest,
  }), /ELOOP|private_shelf_media_unavailable/u);
  await fs.unlink(current.file);
  await fs.rename(target, current.file);
  await fs.chmod(current.file, 0o666);
  await assert.rejects(readPrivateShelfMediaFile({
    uploadDir: current.uploadDir,
    storageName,
    expectedBytes: current.bytes.length,
    expectedSha256: digest,
  }), /private_shelf_media_unavailable/u);
});

test('post-commit cleanup attempt reports queued failure without throwing', async () => {
  const result = await attemptPrivateShelfMediaCleanup({
    client: { query: async () => { throw new Error('synthetic_database_unavailable'); } },
    uploadDir: '/not-used',
    ids: ['11111111-1111-4111-8111-111111111111'],
  });
  assert.deepEqual(result, {
    attempted: 0,
    failures: [{ code: 'cleanup_attempt_failed' }],
  });
});
