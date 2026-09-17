import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { validateMfaStagingSecret } from '../ops/validate_mfa_staging_secret.mjs';

const encodedKey = Buffer.alloc(32, 8).toString('base64url');

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-gate-'));
  const file = join(root, 'mfa-key');
  await writeFile(file, `${encodedKey}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return { root, file };
}

test('MFA staging secret gate accepts an owner-only external key file', async () => {
  const files = await fixture();
  try {
    const result = validateMfaStagingSecret({ filePath: files.file });
    assert.deepEqual(result, {
      configured: true,
      credentialSource: 'file',
      keyLength: 32,
      fileMode: 0o600,
      fileSize: Buffer.byteLength(`${encodedKey}\n`),
    });
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});

test('MFA staging secret gate rejects repository paths, symlinks and unsafe permissions', async () => {
  const files = await fixture();
  const link = join(files.root, 'link');
  try {
    await symlink(files.file, link);
    assert.throws(
      () => validateMfaStagingSecret({ filePath: link }),
      (error) => error.code === 'mfa_staging_secret_type_invalid',
    );
    await chmod(files.file, 0o644);
    assert.throws(
      () => validateMfaStagingSecret({ filePath: files.file }),
      (error) => error.code === 'mfa_staging_secret_permissions_invalid',
    );
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});

test('MFA staging secret gate rejects a key file inside the repository', async () => {
  const files = await fixture();
  try {
    assert.throws(
      () => validateMfaStagingSecret({ filePath: files.file, repository: files.root }),
      (error) => error.code === 'mfa_staging_secret_inside_repository',
    );
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});
