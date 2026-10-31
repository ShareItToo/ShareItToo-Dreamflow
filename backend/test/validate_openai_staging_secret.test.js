import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  hasSafeOpenAiSecretPermissions,
  validateOpenAiStagingSecret,
} from '../ops/validate_openai_staging_secret.mjs';

const secretFixture = `sk-proj-${'x'.repeat(32)}`;

test('OpenAI Staging secret gate accepts only a private regular file outside Git', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-openai-staging-secret-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, 'repository');
  const privateDirectory = join(root, 'private');
  await mkdir(repository);
  await mkdir(privateDirectory);
  const secretPath = join(privateDirectory, 'openai-api-key');
  await writeFile(secretPath, `${secretFixture}\n`, { mode: 0o600 });
  await chmod(secretPath, 0o600);

  const result = validateOpenAiStagingSecret({
    filePath: secretPath,
    repositoryRoot: repository,
  });
  assert.deepEqual(result, {
    fileMode: 0o600,
    fileSize: Buffer.byteLength(`${secretFixture}\n`),
    credentialPresent: true,
  });
  assert.equal(JSON.stringify(result).includes(secretFixture), false);
});

test('OpenAI Staging secret gate rejects repository files, links, unsafe modes and malformed values', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-openai-staging-secret-reject-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, 'repository');
  const privateDirectory = join(root, 'private');
  await mkdir(repository);
  await mkdir(privateDirectory);
  const repositorySecret = join(repository, 'secret');
  const privateSecret = join(privateDirectory, 'secret');
  const linkPath = join(privateDirectory, 'secret-link');
  await writeFile(repositorySecret, secretFixture, { mode: 0o600 });
  await writeFile(privateSecret, 'not-a-provider-key', { mode: 0o600 });
  await symlink(repositorySecret, linkPath);

  assert.throws(
    () => validateOpenAiStagingSecret({ filePath: repositorySecret, repositoryRoot: repository }),
    (error) => error.code === 'openai_staging_secret_inside_repository',
  );
  assert.throws(
    () => validateOpenAiStagingSecret({ filePath: linkPath, repositoryRoot: repository }),
    (error) => error.code === 'openai_staging_secret_type_invalid',
  );
  assert.throws(
    () => validateOpenAiStagingSecret({ filePath: privateSecret, repositoryRoot: repository }),
    (error) => error.code === 'openai_staging_secret_size_invalid'
      || error.code === 'openai_staging_secret_credentials_invalid',
  );
  await writeFile(privateSecret, secretFixture, { mode: 0o644 });
  await chmod(privateSecret, 0o644);
  assert.throws(
    () => validateOpenAiStagingSecret({ filePath: privateSecret, repositoryRoot: repository }),
    (error) => error.code === 'openai_staging_secret_permissions_invalid',
  );
});

test('OpenAI Staging secret permission policy allows owner-only and the runtime group only', () => {
  const uid = process.getuid?.() ?? 501;
  assert.equal(hasSafeOpenAiSecretPermissions({ mode: 0o100600, uid, gid: 20 }, uid), true);
  assert.equal(hasSafeOpenAiSecretPermissions({ mode: 0o100640, uid: 0, gid: 65532 }, uid), true);
  assert.equal(hasSafeOpenAiSecretPermissions({ mode: 0o100640, uid, gid: 20 }, uid), false);
  assert.equal(hasSafeOpenAiSecretPermissions({ mode: 0o100644, uid, gid: 20 }, uid), false);
});
