import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ensureMfaStagingSecret,
  prepareMfaStagingRuntimePermissions,
} from '../ops/ensure_mfa_staging_secret.mjs';

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

test('runtime permission preparation changes metadata only and requires exact confirmation', { skip: process.getuid?.() !== 0 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-runtime-'));
  try {
    const file = join(root, 'mfa-key');
    ensureMfaStagingSecret({
      filePath: file,
      createIfAbsent: true,
      confirmation: 'candidate-runtime',
      expectedConfirmation: 'candidate-runtime',
    });
    const before = await readFile(file);
    assert.throws(
      () => prepareMfaStagingRuntimePermissions({
        filePath: file,
        confirmation: 'wrong',
        expectedConfirmation: 'candidate-runtime',
      }),
      (error) => error.code === 'mfa_staging_runtime_confirmation_required',
    );
    const prepared = prepareMfaStagingRuntimePermissions({
      filePath: file,
      confirmation: 'candidate-runtime',
      expectedConfirmation: 'candidate-runtime',
    });
    assert.deepEqual(prepared, { status: 'prepared', changed: true, keyLength: 32 });
    assert.deepEqual(await readFile(file), before);
    assert.equal((await lstat(file)).mode & 0o777, 0o640);
    assert.equal((await lstat(file)).gid, 65532);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('new runtime-readable MFA keys are created ready for the acceptance container', { skip: process.getuid?.() !== 0 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-runtime-create-'));
  try {
    const file = join(root, 'mfa-key');
    const created = ensureMfaStagingSecret({
      filePath: file,
      createIfAbsent: true,
      runtimeReadable: true,
      confirmation: 'candidate-runtime-create',
      expectedConfirmation: 'candidate-runtime-create',
    });
    assert.equal(created.status, 'created');
    const metadata = await lstat(file);
    assert.equal(metadata.mode & 0o777, 0o640);
    assert.equal(metadata.gid, 65532);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI runtime preparation is idempotent after the first metadata transition', { skip: process.getuid?.() !== 0 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-runtime-cli-'));
  try {
    const file = join(root, 'mfa-key');
    const script = fileURLToPath(new URL('../ops/ensure_mfa_staging_secret.mjs', import.meta.url));
    const env = {
      ...process.env,
      MFA_ENCRYPTION_KEY_HOST_FILE: file,
      MFA_ENCRYPTION_KEY_CREATE_IF_ABSENT: '1',
      MFA_ENCRYPTION_KEY_CREATE_CONFIRM: 'candidate-cli',
      MFA_ENCRYPTION_KEY_CREATE_COMMIT: 'candidate-cli',
      MFA_ENCRYPTION_KEY_PREPARE_RUNTIME: '1',
      MFA_ENCRYPTION_KEY_RUNTIME_CONFIRM: 'candidate-cli-runtime',
      MFA_ENCRYPTION_KEY_RUNTIME_COMMIT: 'candidate-cli-runtime',
    };
    const first = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const before = await readFile(file);
    const second = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(await readFile(file), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
