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

import { decodeMfaEncryptionKey } from '../src/mfa_totp.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(code) {
  const error = new Error('MFA Staging secret gate failed.');
  error.code = code;
  throw error;
}

function inside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function isMfaStagingSecretPermissionsSafe({
  mode,
  uid,
  gid,
  runtimeReadable = false,
  ownerUid = 0,
  runtimeGroup = 65532,
} = {}) {
  const expectedMode = runtimeReadable ? 0o640 : 0o600;
  return (mode & 0o777) === expectedMode
    && uid === ownerUid
    && (!runtimeReadable || gid === runtimeGroup);
}

export function validateMfaStagingSecret({
  filePath,
  repository = repositoryRoot,
  runtimeReadable = false,
  runtimeGroup = 65532,
} = {}) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    fail('mfa_staging_secret_path_invalid');
  }
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const metadata = fstatSync(descriptor);
    const linkMetadata = lstatSync(filePath);
    const resolvedFile = realpathSync(filePath);
    const resolvedRepository = realpathSync(repository);
    if (!metadata.isFile() || linkMetadata.isSymbolicLink()
        || metadata.dev !== linkMetadata.dev || metadata.ino !== linkMetadata.ino) {
      fail('mfa_staging_secret_type_invalid');
    }
    if (inside(resolvedRepository, resolvedFile)) fail('mfa_staging_secret_inside_repository');
    const ownerUid = typeof process.getuid === 'function' ? process.getuid() : metadata.uid;
    if (!isMfaStagingSecretPermissionsSafe({
      mode: metadata.mode,
      uid: metadata.uid,
      gid: metadata.gid,
      runtimeReadable,
      ownerUid,
      runtimeGroup,
    })) {
      fail('mfa_staging_secret_permissions_invalid');
    }
    if (metadata.size < 16 || metadata.size > 128) fail('mfa_staging_secret_size_invalid');
    bytes = readFileSync(descriptor);
    const key = decodeMfaEncryptionKey(bytes.toString('utf8').trim());
    if (key == null) fail('mfa_staging_secret_key_invalid');
    key.fill(0);
    return Object.freeze({
      configured: true,
      credentialSource: 'file',
      keyLength: 32,
      fileMode: metadata.mode & 0o777,
      fileSize: metadata.size,
    });
  } catch (error) {
    if (error instanceof Error && String(error.code ?? '').startsWith('mfa_staging_')) throw error;
    if (error?.code === 'ELOOP') fail('mfa_staging_secret_type_invalid');
    fail('mfa_staging_secret_unavailable');
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    validateMfaStagingSecret({
      filePath: process.env.MFA_ENCRYPTION_KEY_HOST_FILE ?? '',
      runtimeReadable: process.env.MFA_ENCRYPTION_KEY_RUNTIME_READABLE === '1',
    });
    process.stdout.write('MFA Staging secret gate: PASS\n');
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'MFA Staging secret gate failed.'}\n`);
    process.exitCode = 1;
  }
}
