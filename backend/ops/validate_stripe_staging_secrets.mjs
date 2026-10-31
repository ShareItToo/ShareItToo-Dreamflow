#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const stripeRuntimeGroupId = 65532;
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(moduleDirectory, '..', '..');

function fail(code) {
  const error = new Error('Stripe Staging secret gate failed.');
  error.code = code;
  throw error;
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function hasSafeStripeSecretPermissions(metadata, currentUid = process.getuid?.()) {
  const mode = metadata.mode & 0o777;
  const ownerOnly = (metadata.uid === 0 || metadata.uid === currentUid) && mode === 0o600;
  const dedicatedRuntimeGroup = metadata.uid === 0
    && metadata.gid === stripeRuntimeGroupId
    && mode === 0o640;
  return ownerOnly || dedicatedRuntimeGroup;
}

function inspectSecretFile(filePath, repositoryRoot) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    fail('stripe_staging_secret_path_invalid');
  }

  let resolvedRepository;
  try {
    resolvedRepository = realpathSync(repositoryRoot);
  } catch {
    fail('stripe_staging_secret_unavailable');
  }

  let bytes;
  let descriptor;
  let metadata;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    metadata = fstatSync(descriptor);
    if (!metadata.isFile()) {
      fail('stripe_staging_secret_type_invalid');
    }
    const linkMetadata = lstatSync(filePath);
    const resolvedFile = realpathSync(filePath);
    if (!linkMetadata.isFile() || linkMetadata.isSymbolicLink()
        || metadata.dev !== linkMetadata.dev || metadata.ino !== linkMetadata.ino) {
      fail('stripe_staging_secret_type_invalid');
    }
    if (isInside(resolvedRepository, resolvedFile)) {
      fail('stripe_staging_secret_inside_repository');
    }
    if (!hasSafeStripeSecretPermissions(metadata)) {
      fail('stripe_staging_secret_permissions_invalid');
    }
    if (metadata.size < 16 || metadata.size > 512) {
      fail('stripe_staging_secret_size_invalid');
    }
    bytes = readFileSync(descriptor);
  } catch (error) {
    if (String(error?.code ?? '').startsWith('stripe_staging_')) throw error;
    if (error?.code === 'ELOOP') fail('stripe_staging_secret_type_invalid');
    fail('stripe_staging_secret_unavailable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return {
    bytes,
    value: bytes.toString('utf8').trim(),
    identity: `${metadata.dev}:${metadata.ino}`,
  };
}

export function validateStripeStagingSecrets({
  secretKeyFile,
  webhookSecretFile,
  connectWebhookSecretFile,
  repositoryRoot = defaultRepositoryRoot,
}) {
  const inspected = [];
  try {
    const secretKey = inspectSecretFile(secretKeyFile, repositoryRoot);
    inspected.push(secretKey);
    const webhookSecret = inspectSecretFile(webhookSecretFile, repositoryRoot);
    inspected.push(webhookSecret);
    const connectWebhookSecret = inspectSecretFile(
      connectWebhookSecretFile,
      repositoryRoot,
    );
    inspected.push(connectWebhookSecret);

    if (new Set(inspected.map((secret) => secret.identity)).size !== 3) {
      fail('stripe_staging_secret_files_not_distinct');
    }
    if (!/^(?:sk|rk)_test_[A-Za-z0-9]{16,500}$/u.test(secretKey.value)) {
      fail('stripe_staging_secret_key_invalid');
    }
    if (!/^whsec_[A-Za-z0-9]{16,500}$/u.test(webhookSecret.value)
        || !/^whsec_[A-Za-z0-9]{16,500}$/u.test(connectWebhookSecret.value)) {
      fail('stripe_staging_webhook_secret_invalid');
    }
    if (webhookSecret.value === connectWebhookSecret.value) {
      fail('stripe_staging_webhook_secrets_not_distinct');
    }

    return Object.freeze({
      livemode: false,
      credentialSource: 'file',
      secretKeyPresent: true,
      webhookSecretPresent: true,
      connectWebhookSecretPresent: true,
      credentialsDistinct: true,
    });
  } finally {
    for (const secret of inspected) secret.bytes.fill(0);
  }
}

function runCli() {
  validateStripeStagingSecrets({
    secretKeyFile: process.env.STRIPE_SECRET_KEY_HOST_FILE ?? '',
    webhookSecretFile: process.env.STRIPE_WEBHOOK_SECRET_HOST_FILE ?? '',
    connectWebhookSecretFile: process.env.STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE ?? '',
  });
  process.stdout.write('Stripe Staging secret gate: PASS\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Stripe Staging secret gate failed.'}\n`);
    process.exitCode = 1;
  }
}
