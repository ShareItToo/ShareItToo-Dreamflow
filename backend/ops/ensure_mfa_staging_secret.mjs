#!/usr/bin/env node

import crypto from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
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

function inside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function digestDescriptor(descriptor, size) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(4096);
  let offset = 0;
  while (offset < size) {
    const read = readSync(descriptor, buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (read === 0) fail('mfa_staging_secret_read_failed');
    hash.update(buffer.subarray(0, read));
    offset += read;
  }
  buffer.fill(0);
  return hash.digest('hex');
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
  runtimeReadable = false,
  confirmation,
  expectedConfirmation,
  repository = repositoryRoot,
} = {}) {
  assertExternalOwnerDirectory(filePath, repository);
  try {
    return Object.freeze({
      ...validateMfaStagingSecret({ filePath, repository, runtimeReadable }),
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
    if (runtimeReadable) {
      if (typeof process.getuid === 'function' && process.getuid() !== 0) {
        fail('mfa_staging_runtime_owner_required');
      }
      fchownSync(descriptor, 0, 65532);
      fchmodSync(descriptor, 0o640);
    }
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
      ...validateMfaStagingSecret({ filePath, repository, runtimeReadable }),
      status: 'created',
    });
  } catch (error) {
    if (created) {
      try { unlinkSync(filePath); } catch { /* preserve the original gate error */ }
    }
    throw error;
  }
}

export function prepareMfaStagingRuntimePermissions({
  filePath,
  confirmation,
  expectedConfirmation,
  repository = repositoryRoot,
  runtimeGroup = 65532,
} = {}) {
  assertExternalOwnerDirectory(filePath, repository);
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    fail('mfa_staging_runtime_owner_required');
  }
  let descriptor;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const before = fstatSync(descriptor);
    const linkMetadata = lstatSync(filePath);
    const resolvedFile = realpathSync(filePath);
    const resolvedRepository = realpathSync(repository);
    if (!before.isFile() || linkMetadata.isSymbolicLink()
        || before.dev !== linkMetadata.dev || before.ino !== linkMetadata.ino) {
      fail('mfa_staging_secret_type_invalid');
    }
    if (inside(resolvedRepository, resolvedFile)) fail('mfa_staging_secret_inside_repository');
    if (before.uid !== 0 || before.size < 16 || before.size > 128) {
      fail('mfa_staging_secret_permissions_invalid');
    }
    if ((before.mode & 0o777) === 0o640 && before.gid === runtimeGroup) {
      validateMfaStagingSecret({ filePath, repository, runtimeReadable: true, runtimeGroup });
      return Object.freeze({ status: 'runtime-ready', changed: false, keyLength: 32 });
    }
    if ((before.mode & 0o777) !== 0o600 || before.gid !== 0
        || confirmation !== expectedConfirmation || !expectedConfirmation) {
      fail('mfa_staging_runtime_confirmation_required');
    }
    const beforeDigest = digestDescriptor(descriptor, before.size);
    fchownSync(descriptor, 0, runtimeGroup);
    fchmodSync(descriptor, 0o640);
    fsyncSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
        || digestDescriptor(descriptor, after.size) !== beforeDigest) {
      fail('mfa_staging_runtime_content_changed');
    }
    validateMfaStagingSecret({ filePath, repository, runtimeReadable: true, runtimeGroup });
    return Object.freeze({ status: 'prepared', changed: true, keyLength: 32 });
  } catch (error) {
    if (error instanceof Error && String(error.code ?? '').startsWith('mfa_staging_')) throw error;
    fail('mfa_staging_runtime_prepare_failed');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const filePath = process.env.MFA_ENCRYPTION_KEY_HOST_FILE ?? '';
    const createIfAbsent = process.env.MFA_ENCRYPTION_KEY_CREATE_IF_ABSENT === '1';
    const createConfirmation = process.env.MFA_ENCRYPTION_KEY_CREATE_CONFIRM ?? '';
    const createCommit = process.env.MFA_ENCRYPTION_KEY_CREATE_COMMIT ?? '';
    const prepareRuntime = process.env.MFA_ENCRYPTION_KEY_PREPARE_RUNTIME === '1';
    let prepared;
    if (prepareRuntime) {
      let exists = true;
      try { lstatSync(filePath); } catch (error) {
        if (error?.code === 'ENOENT') exists = false;
        else throw error;
      }
      prepared = exists
        ? prepareMfaStagingRuntimePermissions({
          filePath,
          confirmation: process.env.MFA_ENCRYPTION_KEY_RUNTIME_CONFIRM ?? '',
          expectedConfirmation: process.env.MFA_ENCRYPTION_KEY_RUNTIME_COMMIT ?? '',
        })
        : ensureMfaStagingSecret({
          filePath,
          createIfAbsent,
          runtimeReadable: true,
          confirmation: createConfirmation,
          expectedConfirmation: createCommit,
        });
    } else {
      prepared = ensureMfaStagingSecret({
        filePath,
        createIfAbsent,
        runtimeReadable: process.env.MFA_ENCRYPTION_KEY_RUNTIME_READABLE === '1',
        confirmation: createConfirmation,
        expectedConfirmation: createCommit,
      });
    }
    process.stdout.write(`MFA Staging key ${prepared.status}; source=file; length=${prepared.keyLength}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'MFA Staging key lifecycle gate failed.'}\n`);
    process.exitCode = 1;
  }
}
