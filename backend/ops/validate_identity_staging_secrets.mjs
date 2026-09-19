#!/usr/bin/env node

import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(code) {
  const error = new Error('Stripe Identity Staging secret gate failed.');
  error.code = code;
  throw error;
}

function inspect(filePath) {
  if (!isAbsolute(filePath)) fail('identity_staging_secret_path_invalid');
  let descriptor;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const metadata = fstatSync(descriptor);
    const linkMetadata = lstatSync(filePath);
    const resolved = realpathSync(filePath);
    const repo = realpathSync(repositoryRoot);
    const inside = relative(repo, resolved);
    if (!metadata.isFile() || linkMetadata.isSymbolicLink()
        || metadata.dev !== linkMetadata.dev || metadata.ino !== linkMetadata.ino) {
      fail('identity_staging_secret_type_invalid');
    }
    if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
      fail('identity_staging_secret_inside_repository');
    }
    if ((metadata.mode & 0o777) !== 0o600
        || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) {
      fail('identity_staging_secret_permissions_invalid');
    }
    if (metadata.size < 16 || metadata.size > 512) fail('identity_staging_secret_size_invalid');
    const bytes = readFileSync(descriptor);
    return { bytes, value: bytes.toString('utf8').trim(), identity: `${metadata.dev}:${metadata.ino}` };
  } catch (error) {
    if (String(error?.code ?? '').startsWith('identity_staging_')) throw error;
    if (error?.code === 'ELOOP') fail('identity_staging_secret_type_invalid');
    fail('identity_staging_secret_unavailable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function validateIdentityStagingSecrets({ secretKeyFile, webhookSecretFile } = {}) {
  const inspected = [];
  try {
    inspected.push(inspect(secretKeyFile), inspect(webhookSecretFile));
    if (new Set(inspected.map((entry) => entry.identity)).size !== 2) fail('identity_staging_secret_files_not_distinct');
    if (!/^rk_test_[A-Za-z0-9]{16,500}$/u.test(inspected[0].value)) fail('identity_staging_secret_key_invalid');
    if (!/^whsec_[A-Za-z0-9]{16,500}$/u.test(inspected[1].value)) fail('identity_staging_webhook_secret_invalid');
    return Object.freeze({ livemode: false, credentialSource: 'file', secretKeyPresent: true, webhookSecretPresent: true });
  } finally {
    for (const entry of inspected) entry.bytes.fill(0);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    validateIdentityStagingSecrets({
      secretKeyFile: process.env.IDENTITY_STRIPE_SECRET_KEY_HOST_FILE ?? '',
      webhookSecretFile: process.env.IDENTITY_VERIFICATION_WEBHOOK_SECRET_HOST_FILE ?? '',
    });
    process.stdout.write('Stripe Identity Staging secret gate: PASS\n');
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Stripe Identity Staging secret gate failed.'}\n`);
    process.exitCode = 1;
  }
}
