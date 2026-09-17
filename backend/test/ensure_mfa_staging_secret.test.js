import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { ensureMfaStagingSecret } from '../ops/ensure_mfa_staging_secret.mjs';

test('MFA key lifecycle reuses an existing stable file without replacing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-lifecycle-'));
  try {
    const file = join(root, 'mfa-key');
    assert.throws(
      () => ensureMfaStagingSecret({ filePath: file }),
      (error) => error.code === 'mfa_staging_secret_missing',
    );
    const created = ensureMfaStagingSecret({
      filePath: file,
      createIfAbsent: true,
      confirmation: 'candidate-1',
      expectedConfirmation: 'candidate-1',
    });
    assert.equal(created.status, 'created');
    const before = await lstat(file);
    const reused = ensureMfaStagingSecret({ filePath: file });
    assert.equal(reused.status, 'reused');
    const after = await lstat(file);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MFA key lifecycle requires exact creation confirmation and never writes inside Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-lifecycle-'));
  try {
    const file = join(root, 'mfa-key');
    assert.throws(
      () => ensureMfaStagingSecret({
        filePath: file,
        createIfAbsent: true,
        confirmation: 'wrong',
        expectedConfirmation: 'candidate-2',
      }),
      (error) => error.code === 'mfa_staging_secret_creation_confirmation_required',
    );
    assert.throws(
      () => ensureMfaStagingSecret({
        filePath: join(root, 'repo', 'mfa-key'),
        repository: join(root, 'repo'),
        createIfAbsent: true,
        confirmation: 'candidate-2',
        expectedConfirmation: 'candidate-2',
      }),
      (error) => error.code === 'mfa_staging_secret_inside_repository',
    );
    await chmod(root, 0o755);
    assert.throws(
      () => ensureMfaStagingSecret({
        filePath: join(root, 'unsafe', 'mfa-key'),
        createIfAbsent: true,
        confirmation: 'candidate-3',
        expectedConfirmation: 'candidate-3',
      }),
      (error) => error.code === 'mfa_staging_secret_parent_unavailable',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
