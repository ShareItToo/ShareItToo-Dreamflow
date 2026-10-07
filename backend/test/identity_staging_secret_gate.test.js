import assert from 'node:assert/strict';
import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { validateIdentityStagingSecrets } from '../ops/validate_identity_staging_secrets.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-identity-secrets-'));
  const key = join(root, 'identity-key');
  const webhook = join(root, 'identity-webhook');
  await writeFile(key, `rk_test_${'k'.repeat(24)}\n`, { mode: 0o600 });
  await writeFile(webhook, `whsec_${'w'.repeat(24)}\n`, { mode: 0o600 });
  await chmod(key, 0o600);
  await chmod(webhook, 0o600);
  return { root, key, webhook };
}

test('Identity Staging secret gate accepts separate restricted test files', async () => {
  const files = await fixture();
  const result = validateIdentityStagingSecrets({ secretKeyFile: files.key, webhookSecretFile: files.webhook });
  assert.deepEqual(result, {
    livemode: false,
    credentialSource: 'file',
    secretKeyPresent: true,
    webhookSecretPresent: true,
  });
});

test('Identity Staging secret gate rejects broad keys and symlinks', async () => {
  const files = await fixture();
  await writeFile(files.key, `sk_test_${'k'.repeat(24)}\n`, { mode: 0o600 });
  assert.throws(
    () => validateIdentityStagingSecrets({ secretKeyFile: files.key, webhookSecretFile: files.webhook }),
    (error) => error.code === 'identity_staging_secret_key_invalid',
  );
  const link = join(files.root, 'link');
  await symlink(files.webhook, link);
  assert.throws(
    () => validateIdentityStagingSecrets({ secretKeyFile: files.webhook, webhookSecretFile: link }),
    (error) => error.code === 'identity_staging_secret_type_invalid',
  );
});
