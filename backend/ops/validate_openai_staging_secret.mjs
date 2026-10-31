#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const listingAiRuntimeGroupId = 65532;
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(moduleDirectory, '..', '..');

function fail(code) {
  const error = new Error('OpenAI Staging secret gate failed.');
  error.code = code;
  throw error;
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function hasSafeOpenAiSecretPermissions(metadata, currentUid = process.getuid?.()) {
  const mode = metadata.mode & 0o777;
  const ownerOnly = (metadata.uid === 0 || metadata.uid === currentUid) && mode === 0o600;
  const dedicatedRuntimeGroup = metadata.uid === 0
    && metadata.gid === listingAiRuntimeGroupId
    && mode === 0o640;
  return ownerOnly || dedicatedRuntimeGroup;
}

export function validateOpenAiStagingSecret({
  filePath,
  repositoryRoot = defaultRepositoryRoot,
}) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    fail('openai_staging_secret_path_invalid');
  }

  let metadata;
  let resolvedFile;
  let resolvedRepository;
  try {
    metadata = lstatSync(filePath);
    resolvedFile = realpathSync(filePath);
    resolvedRepository = realpathSync(repositoryRoot);
  } catch {
    fail('openai_staging_secret_unavailable');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('openai_staging_secret_type_invalid');
  }
  if (isInside(resolvedRepository, resolvedFile)) {
    fail('openai_staging_secret_inside_repository');
  }
  if (!hasSafeOpenAiSecretPermissions(metadata)) {
    fail('openai_staging_secret_permissions_invalid');
  }
  if (metadata.size < 20 || metadata.size > 512) {
    fail('openai_staging_secret_size_invalid');
  }

  let bytes;
  try {
    bytes = readFileSync(resolvedFile);
    const value = bytes.toString('utf8').trim();
    if (!/^sk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{16,500}$/u.test(value)) {
      fail('openai_staging_secret_credentials_invalid');
    }
  } catch (error) {
    if (error?.code === 'openai_staging_secret_credentials_invalid') throw error;
    fail('openai_staging_secret_credentials_invalid');
  } finally {
    bytes?.fill(0);
  }

  return {
    fileMode: metadata.mode & 0o777,
    fileSize: metadata.size,
    credentialPresent: true,
  };
}

function runCli() {
  validateOpenAiStagingSecret({
    filePath: process.env.OPENAI_API_KEY_HOST_FILE ?? '',
  });
  process.stdout.write('OpenAI Staging secret gate: PASS\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'OpenAI Staging secret gate failed.'}\n`);
    process.exitCode = 1;
  }
}
