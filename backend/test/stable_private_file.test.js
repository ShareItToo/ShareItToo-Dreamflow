import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createStablePrivateReadStream,
  readStablePrivateFile,
} from '../ops/stable_private_file.mjs';

test('stable private reader validates the opened descriptor and reads its bytes', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-stable-private-file-'));
  const file = path.join(root, 'fixture');
  writeFileSync(file, 'synthetic-private-fixture\n', { mode: 0o600 });
  chmodSync(file, 0o600);
  assert.equal(readStablePrivateFile(file, {
    mode: 0o077,
    expectedUid: process.getuid?.(),
    minBytes: 1,
    maxBytes: 128,
  }), 'synthetic-private-fixture\n');
  const stream = createStablePrivateReadStream(file, { mode: 0o077 });
  let value = '';
  for await (const chunk of stream) value += chunk;
  assert.equal(value, 'synthetic-private-fixture\n');
});
test('stable private reader rejects symlink paths and unsafe modes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-stable-private-file-'));
  const file = path.join(root, 'fixture');
  const link = path.join(root, 'link');
  writeFileSync(file, 'fixture', { mode: 0o600 });
  chmodSync(file, 0o600);
  symlinkSync(file, link);
  assert.throws(() => readStablePrivateFile(link, { mode: 0o077 }), /ELOOP|private_file_invalid/u);
  chmodSync(file, 0o644);
  assert.throws(() => readStablePrivateFile(file, { mode: 0o077 }), /private_file_invalid/u);
});

test('exact expected mode permits root-style 0640 and still rejects extra bits', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-stable-private-file-'));
  const file = path.join(root, 'runtime-readable');
  writeFileSync(file, 'runtime-readable-fixture\n', { mode: 0o640 });
  chmodSync(file, 0o640);
  assert.equal(readStablePrivateFile(file, {
    expectedMode: 0o640,
    minBytes: 1,
  }), 'runtime-readable-fixture\n');
  chmodSync(file, 0o644);
  assert.throws(() => readStablePrivateFile(file, { expectedMode: 0o640 }), /private_file_invalid/u);
  chmodSync(file, 0o640);
  assert.throws(() => readStablePrivateFile(file, { expectedMode: 0o640, mode: 0o077 }), /private_file_invalid/u);
});
