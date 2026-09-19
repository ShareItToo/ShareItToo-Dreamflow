#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateFirebaseServiceAccount } from '../src/firebase_service_account.js';

const canonicalProjectId = 'shareittoo-staging';
const canonicalClientEmail = `sit-fcm-staging@${canonicalProjectId}.iam.gserviceaccount.com`;
export const fcmRuntimeGroupId = 65532;
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(moduleDirectory, '..', '..');

function fail(code) {
  const error = new Error('FCM staging secret gate failed.');
  error.code = code;
  throw error;
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function hasSafeFcmSecretPermissions(metadata, currentUid = process.getuid?.()) {
  const mode = metadata.mode & 0o777;
  const ownerIsTrusted = metadata.uid === 0 || metadata.uid === currentUid;
  const ownerOnly = mode === 0o600;
  const dedicatedRuntimeGroup = metadata.uid === 0
    && metadata.gid === fcmRuntimeGroupId
    && mode === 0o640;

  return ownerIsTrusted && (ownerOnly || dedicatedRuntimeGroup);
}

export function validateFcmStagingSecret({
  filePath,
  expectedProjectId,
  repositoryRoot = defaultRepositoryRoot,
}) {
  if (expectedProjectId !== canonicalProjectId) fail('fcm_staging_project_mismatch');
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) fail('fcm_staging_secret_path_invalid');

  let metadata;
  let resolvedFile;
  let resolvedRepository;
  try {
    metadata = lstatSync(filePath);
    resolvedFile = realpathSync(filePath);
    resolvedRepository = realpathSync(repositoryRoot);
  } catch {
    fail('fcm_staging_secret_unavailable');
  }

  if (!metadata.isFile() || metadata.isSymbolicLink()) fail('fcm_staging_secret_type_invalid');
  if (isInside(resolvedRepository, resolvedFile)) fail('fcm_staging_secret_inside_repository');
  if (!hasSafeFcmSecretPermissions(metadata)) fail('fcm_staging_secret_permissions_invalid');
  if (metadata.size < 256 || metadata.size > 32 * 1024) fail('fcm_staging_secret_size_invalid');

  let raw;
  try {
    raw = readFileSync(resolvedFile, 'utf8');
    const account = validateFirebaseServiceAccount(raw, expectedProjectId);
    if (account.client_email !== canonicalClientEmail) {
      fail('fcm_staging_service_account_identity_invalid');
    }
  } catch {
    fail('fcm_staging_secret_credentials_invalid');
  }

  return {
    projectId: canonicalProjectId,
    fileMode: metadata.mode & 0o777,
    fileSize: metadata.size,
  };
}

function runCli() {
  validateFcmStagingSecret({
    filePath: process.env.FIREBASE_SERVICE_ACCOUNT_HOST_FILE ?? '',
    expectedProjectId: process.env.FIREBASE_PROJECT_ID ?? '',
  });
  process.stdout.write('FCM staging secret gate: PASS\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'FCM staging secret gate failed.'}\n`);
    process.exitCode = 1;
  }
}
