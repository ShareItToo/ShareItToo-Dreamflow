import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readMfaEncryptionKeyConfiguration } from '../src/mfa_secret_files.js';

const encodedKey = Buffer.alloc(32, 7).toString('base64url');

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-mfa-secret-'));
  const file = join(root, 'mfa-key');
  await writeFile(file, `${encodedKey}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return { root, file };
}

test('MFA file configuration returns only safe source metadata and a 32-byte key', async () => {
  const files = await fixture();
  try {
    const result = readMfaEncryptionKeyConfiguration({ MFA_ENCRYPTION_KEY_FILE: files.file }, {
      deploymentEnvironment: 'staging',
    });
    assert.equal(result.configured, true);
    assert.equal(result.credentialSource, 'file');
    assert.deepEqual(result.key, Buffer.alloc(32, 7));
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});

test('MFA staging rejects direct environment keys and direct/file conflicts', async () => {
  const files = await fixture();
  try {
    assert.throws(
      () => readMfaEncryptionKeyConfiguration({ MFA_ENCRYPTION_KEY: encodedKey }, {
        deploymentEnvironment: 'staging',
      }),
      /MFA Staging requires MFA_ENCRYPTION_KEY_FILE/u,
    );
    assert.throws(
      () => readMfaEncryptionKeyConfiguration({
        MFA_ENCRYPTION_KEY: encodedKey,
        MFA_ENCRYPTION_KEY_FILE: files.file,
      }, { deploymentEnvironment: 'test' }),
      /cannot both be configured/u,
    );
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});

test('MFA file configuration rejects symlinks and malformed key material', async () => {
  const files = await fixture();
  const link = join(files.root, 'link');
  const malformed = join(files.root, 'malformed');
  try {
    await symlink(files.file, link);
    assert.throws(
      () => readMfaEncryptionKeyConfiguration({ MFA_ENCRYPTION_KEY_FILE: link }, {
        deploymentEnvironment: 'staging',
      }),
      /regular non-symlink/u,
    );
    await writeFile(malformed, `${'x'.repeat(16)}\n`, { mode: 0o600 });
    await chmod(malformed, 0o600);
    assert.throws(
      () => readMfaEncryptionKeyConfiguration({ MFA_ENCRYPTION_KEY_FILE: malformed }, {
        deploymentEnvironment: 'staging',
      }),
      /valid 32-byte key/u,
    );
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});
