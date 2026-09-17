#!/usr/bin/env node

import crypto from 'node:crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateMfaStagingSecret } from './validate_mfa_staging_secret.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(code) {
  const error = new Error('MFA Staging key lifecycle gate failed.');
  error.code = code;
  throw error;
}

function assertExternalOwnerDirectory(filePath, repository = repositoryRoot) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    fail('mfa_staging_secret_path_invalid');
  }
  const parent = resolve(dirname(filePath));
  const resolvedRepository = resolve(repository);
  const relativeParent = relative(resolvedRepository, parent);
  if (relativeParent === '' || (!relativeParent.startsWith('..') && !isAbsolute(relativeParent))) {
    fail('mfa_staging_secret_inside_repository');
  }
  let metadata;
  try {
    metadata = lstatSync(parent);
  } catch {
    fail('mfa_staging_secret_parent_unavailable');
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail('mfa_staging_secret_parent_invalid');
  }
  if ((metadata.mode & 0o777) !== 0o700) {
    fail('mfa_staging_secret_parent_permissions_invalid');
  }
  return parent;
}

export function ensureMfaStagingSecret({
  filePath,
  createIfAbsent = false,
  confirmation,
  expectedConfirmation,
  repository = repositoryRoot,
} = {}) {
  assertExternalOwnerDirectory(filePath, repository);
  try {
    return Object.freeze({
      ...validateMfaStagingSecret({ filePath, repository }),
      status: 'reused',
    });
  } catch (error) {
    if (error?.code !== 'mfa_staging_secret_unavailable') {
      throw error;
    }
  }
  if (!createIfAbsent) fail('mfa_staging_secret_missing');
  if (!expectedConfirmation || confirmation !== expectedConfirmation) {
    fail('mfa_staging_secret_creation_confirmation_required');
  }

  const key = crypto.randomBytes(32);
  const encoded = Buffer.from(`${key.toString('base64url')}\n`, 'utf8');
  let descriptor;
  let created = false;
  try {
    descriptor = openSync(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    created = true;
    writeSync(descriptor, encoded, 0, encoded.length, 0);
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === 'EEXIST') fail('mfa_staging_secret_creation_race');
    fail('mfa_staging_secret_creation_failed');
  } finally {
    key.fill(0);
    encoded.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try {
    return Object.freeze({
      ...validateMfaStagingSecret({ filePath, repository }),
      status: 'created',
    });
  } catch (error) {
    if (created) {
      try { unlinkSync(filePath); } catch { /* preserve the original gate error */ }
    }
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const result = ensureMfaStagingSecret({
      filePath: process.env.MFA_ENCRYPTION_KEY_HOST_FILE ?? '',
      createIfAbsent: process.env.MFA_ENCRYPTION_KEY_CREATE_IF_ABSENT === '1',
      confirmation: process.env.MFA_ENCRYPTION_KEY_CREATE_CONFIRM ?? '',
      expectedConfirmation: process.env.MFA_ENCRYPTION_KEY_CREATE_COMMIT ?? '',
    });
    process.stdout.write(`MFA Staging key ${result.status}; source=file; length=${result.keyLength}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'MFA Staging key lifecycle gate failed.'}\n`);
    process.exitCode = 1;
  }
}
