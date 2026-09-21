import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute } from 'node:path';

import { decodeMfaEncryptionKey } from './mfa_totp.js';

function fail(message) {
  throw new Error(message);
}

function value(env, name) {
  return typeof env[name] === 'string' ? env[name].trim() : '';
}

function readBoundedFile(fileName, filePath, { minimumBytes = 16, maximumBytes = 8192 } = {}) {
  if (!isAbsolute(filePath)) fail(`${fileName} must be an absolute file path`);
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const metadata = fstatSync(descriptor);
    const linkMetadata = lstatSync(filePath);
    const resolved = realpathSync(filePath);
    if (!metadata.isFile() || linkMetadata.isSymbolicLink()
        || metadata.dev !== linkMetadata.dev || metadata.ino !== linkMetadata.ino
        || !resolved) {
      fail(`${fileName} must point to a regular non-symlink file`);
    }
    if (metadata.size < minimumBytes || metadata.size > maximumBytes) {
      fail(`${fileName} must point to a bounded regular file`);
    }
    bytes = readFileSync(descriptor);
    return bytes.toString('utf8').trim();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(fileName)) throw error;
    if (error?.code === 'ELOOP') fail(`${fileName} must point to a regular non-symlink file`);
    fail(`${fileName} must point to a readable regular file`);
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readSecret(env, directName, fileName, options) {
  const direct = value(env, directName);
  const filePath = value(env, fileName);
  if (direct && filePath) fail(`${directName} and ${fileName} cannot both be configured`);
  if (direct) return { value: direct, source: 'environment' };
  if (!filePath) return { value: '', source: 'none' };
  return { value: readBoundedFile(fileName, filePath, options), source: 'file' };
}

export function readAppleRevocationConfiguration(env, {
  deploymentEnvironment = 'development',
} = {}) {
  const enabled = value(env, 'APPLE_REVOCATION_ENABLED').toLowerCase() === 'true';
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      encryptionKey: null,
      privateKey: '',
      credentialSource: 'none',
      clientId: '',
      teamId: '',
      keyId: '',
      redirectUri: '',
    });
  }
  const encryption = readSecret(
    env,
    'APPLE_REVOCATION_ENCRYPTION_KEY',
    'APPLE_REVOCATION_ENCRYPTION_KEY_FILE',
    { minimumBytes: 16, maximumBytes: 128 },
  );
  const encryptionKey = decodeMfaEncryptionKey(encryption.value);
  if (!encryptionKey) fail('Apple revocation encryption key must be a valid 32-byte key');
  if (deploymentEnvironment === 'staging' && encryption.source !== 'file') {
    fail('Apple revocation Staging requires APPLE_REVOCATION_ENCRYPTION_KEY_FILE');
  }
  const privateKey = readSecret(
    env,
    'APPLE_REVOCATION_PRIVATE_KEY',
    'APPLE_REVOCATION_PRIVATE_KEY_FILE',
    { minimumBytes: 64, maximumBytes: 8192 },
  );
  if (!privateKey.value.includes('BEGIN PRIVATE KEY')) {
    fail('Apple revocation private key must be a PEM private key');
  }
  for (const [name, pattern] of [
    ['APPLE_REVOCATION_CLIENT_ID', /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/u],
    ['APPLE_REVOCATION_TEAM_ID', /^[A-Z0-9]{10}$/u],
    ['APPLE_REVOCATION_KEY_ID', /^[A-Z0-9]{8,16}$/u],
  ]) {
    if (!pattern.test(value(env, name))) fail(`${name} is invalid`);
  }
  const redirectUri = value(env, 'APPLE_REVOCATION_REDIRECT_URI');
  if (redirectUri) {
    let parsed;
    try {
      parsed = new URL(redirectUri);
    } catch {
      fail('APPLE_REVOCATION_REDIRECT_URI must be a valid HTTPS URL');
    }
    if (parsed.protocol !== 'https:') fail('APPLE_REVOCATION_REDIRECT_URI must be a valid HTTPS URL');
  }
  return Object.freeze({
    enabled: true,
    encryptionKey,
    privateKey: privateKey.value,
    credentialSource: privateKey.source,
    clientId: value(env, 'APPLE_REVOCATION_CLIENT_ID'),
    teamId: value(env, 'APPLE_REVOCATION_TEAM_ID'),
    keyId: value(env, 'APPLE_REVOCATION_KEY_ID'),
    redirectUri,
  });
}
