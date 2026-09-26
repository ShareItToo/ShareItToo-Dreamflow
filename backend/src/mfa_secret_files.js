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

function environmentValue(env, name) {
  return typeof env[name] === 'string' ? env[name].trim() : '';
}

function readKeyFile(fileName, filePath) {
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
        || metadata.dev !== linkMetadata.dev || metadata.ino !== linkMetadata.ino) {
      fail(`${fileName} must point to a regular non-symlink file`);
    }
    if (resolved === '' || metadata.size < 16 || metadata.size > 128) {
      fail(`${fileName} must point to a bounded regular file`);
    }
    bytes = readFileSync(descriptor);
    const key = decodeMfaEncryptionKey(bytes.toString('utf8').trim());
    if (key == null) fail(`${fileName} must contain a valid 32-byte key`);
    return key;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(fileName)) throw error;
    if (error?.code === 'ELOOP') fail(`${fileName} must point to a regular non-symlink file`);
    fail(`${fileName} must point to a readable regular file`);
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readMfaEncryptionKeyConfiguration(env, { deploymentEnvironment } = {}) {
  const direct = environmentValue(env, 'MFA_ENCRYPTION_KEY');
  const filePath = environmentValue(env, 'MFA_ENCRYPTION_KEY_FILE');
  if (direct && filePath) {
    fail('MFA_ENCRYPTION_KEY and MFA_ENCRYPTION_KEY_FILE cannot both be configured');
  }
  if (deploymentEnvironment === 'staging' && direct) {
    fail('MFA Staging requires MFA_ENCRYPTION_KEY_FILE');
  }
  if (filePath) {
    return Object.freeze({
      key: readKeyFile('MFA_ENCRYPTION_KEY_FILE', filePath),
      credentialSource: 'file',
      configured: true,
    });
  }
  if (direct) {
    const key = decodeMfaEncryptionKey(direct);
    if (key == null) fail('MFA_ENCRYPTION_KEY must be a valid 32-byte key');
    return Object.freeze({ key, credentialSource: 'environment', configured: true });
  }
  return Object.freeze({ key: null, credentialSource: 'none', configured: false });
}
