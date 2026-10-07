import assert from 'node:assert/strict';
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateStripeStagingSecrets } from '../ops/validate_stripe_staging_secrets.mjs';

const testKey = `rk_test_${'k'.repeat(32)}`;
const snapshotSecret = `whsec_${'s'.repeat(32)}`;
const connectSecret = `whsec_${'c'.repeat(32)}`;

async function secretFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sit-stripe-staging-secrets-'));
  const paths = {
    secretKey: join(directory, 'stripe-secret-key'),
    snapshot: join(directory, 'stripe-webhook-secret'),
    connect: join(directory, 'stripe-connect-webhook-secret'),
  };
  await Promise.all([
    writeFile(paths.secretKey, `${testKey}\n`, { mode: 0o600 }),
    writeFile(paths.snapshot, `${snapshotSecret}\n`, { mode: 0o600 }),
    writeFile(paths.connect, `${connectSecret}\n`, { mode: 0o600 }),
  ]);
  await Promise.all(Object.values(paths).map((path) => chmod(path, 0o600)));
  return { directory, paths };
}

test('Stripe Staging gate accepts three distinct owner-only test secrets without returning values', async (t) => {
  const fixture = await secretFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));

  const result = validateStripeStagingSecrets({
    secretKeyFile: fixture.paths.secretKey,
    webhookSecretFile: fixture.paths.snapshot,
    connectWebhookSecretFile: fixture.paths.connect,
  });

  assert.deepEqual(result, {
    livemode: false,
    credentialSource: 'file',
    secretKeyPresent: true,
    webhookSecretPresent: true,
    connectWebhookSecretPresent: true,
    credentialsDistinct: true,
  });
  assert.equal(JSON.stringify(result).includes(testKey), false);
  assert.equal(JSON.stringify(result).includes(snapshotSecret), false);
  assert.equal(JSON.stringify(result).includes(connectSecret), false);
});

test('Stripe Staging gate rejects live, duplicate and over-broad credentials without echoing them', async (t) => {
  const fixture = await secretFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));

  await writeFile(fixture.paths.secretKey, `rk_live_${'l'.repeat(32)}\n`, { mode: 0o600 });
  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: fixture.paths.secretKey,
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: fixture.paths.connect,
    }),
    (error) => error.code === 'stripe_staging_secret_key_invalid'
      && !error.message.includes('rk_live_'),
  );

  await writeFile(fixture.paths.secretKey, `${testKey}\n`, { mode: 0o600 });
  await writeFile(fixture.paths.connect, `${snapshotSecret}\n`, { mode: 0o600 });
  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: fixture.paths.secretKey,
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: fixture.paths.connect,
    }),
    (error) => error.code === 'stripe_staging_webhook_secrets_not_distinct'
      && !error.message.includes(snapshotSecret),
  );

  await writeFile(fixture.paths.connect, `${connectSecret}\n`, { mode: 0o600 });
  await chmod(fixture.paths.snapshot, 0o644);
  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: fixture.paths.secretKey,
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: fixture.paths.connect,
    }),
    (error) => error.code === 'stripe_staging_secret_permissions_invalid',
  );
});

test('Stripe Staging gate rejects relative paths, repository files and symlinks', async (t) => {
  const fixture = await secretFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));

  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: 'stripe-secret-key',
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: fixture.paths.connect,
    }),
    (error) => error.code === 'stripe_staging_secret_path_invalid',
  );

  const fakeRepository = join(fixture.directory, 'repository');
  await mkdir(fakeRepository);
  const inRepository = join(fakeRepository, 'stripe-secret-key');
  await writeFile(inRepository, `${testKey}\n`, { mode: 0o600 });
  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: inRepository,
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: fixture.paths.connect,
      repositoryRoot: fakeRepository,
    }),
    (error) => error.code === 'stripe_staging_secret_inside_repository',
  );

  const symlinkPath = join(fixture.directory, 'stripe-secret-link');
  await symlink(fixture.paths.secretKey, symlinkPath);
  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: symlinkPath,
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: fixture.paths.connect,
    }),
    (error) => error.code === 'stripe_staging_secret_type_invalid',
  );

  const hardLink = join(fixture.directory, 'stripe-connect-hard-link');
  await link(fixture.paths.snapshot, hardLink);
  assert.throws(
    () => validateStripeStagingSecrets({
      secretKeyFile: fixture.paths.secretKey,
      webhookSecretFile: fixture.paths.snapshot,
      connectWebhookSecretFile: hardLink,
    }),
    (error) => error.code === 'stripe_staging_secret_files_not_distinct',
  );
});
