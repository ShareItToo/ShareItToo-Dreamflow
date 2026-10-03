import crypto from 'node:crypto';
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

function assertStableBoundedRead(fileName, before, after, actualLength, {
  minimumBytes,
  maximumBytes,
  ownerOnly,
}) {
  if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o400) === 0) {
    fail(`${fileName} must point to a readable regular single-link file`);
  }
  if (ownerOnly && ((typeof process.getuid === 'function' && before.uid !== process.getuid())
      || (before.mode & 0o077) !== 0)) {
    fail(`${fileName} must be owned by the current user with owner-only permissions`);
  }
  if (actualLength < minimumBytes || actualLength > maximumBytes) {
    fail(`${fileName} must point to a bounded regular file`);
  }
  const stableFields = [
    'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeMs', 'ctimeMs',
  ];
  if (!after.isFile() || after.nlink !== 1 || before.size !== actualLength
      || after.size !== actualLength
      || stableFields.some((field) => before[field] !== after[field])) {
    fail(`${fileName} changed while it was being read`);
  }
}

function readBoundedFile(fileName, filePath, {
  minimumBytes = 16,
  maximumBytes = 8192,
  ownerOnly = false,
} = {}) {
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
    assertStableBoundedRead(fileName, metadata, metadata, metadata.size, {
      minimumBytes, maximumBytes, ownerOnly,
    });
    bytes = readFileSync(descriptor);
    const postReadMetadata = fstatSync(descriptor);
    assertStableBoundedRead(fileName, metadata, postReadMetadata, bytes.length, {
      minimumBytes, maximumBytes, ownerOnly,
    });
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

function exactKeys(candidate, expected) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const actual = Object.keys(candidate).sort();
  const required = [...expected].sort();
  return actual.length === required.length
    && actual.every((entry, index) => entry === required[index]);
}

function ownershipSigningKey(fileName, privateKey) {
  const pem = privateKey.trim();
  if (!pem.startsWith('-----BEGIN PRIVATE KEY-----')
      || !pem.endsWith('-----END PRIVATE KEY-----')) {
    fail(`${fileName} must contain a PKCS8 private key`);
  }
  let signingKey;
  try { signingKey = crypto.createPrivateKey(pem); } catch { fail(`${fileName} is invalid`); }
  if (signingKey.asymmetricKeyType !== 'ec'
      || signingKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    fail(`${fileName} must contain a P-256 EC private key`);
  }
  return signingKey;
}

function historicalProfile(entry, index) {
  const name = `APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE.profiles[${index}]`;
  if (!exactKeys(entry, [
    'generation', 'firebaseProjectId', 'clientId', 'teamId', 'keyId', 'redirectUri',
    'encryptionKeyFile', 'privateKeyFile',
  ])) fail(`${name} has an invalid shape`);
  const encryptionValue = readBoundedFile(
    `${name}.encryptionKeyFile`, entry.encryptionKeyFile,
    { minimumBytes: 16, maximumBytes: 128, ownerOnly: true },
  );
  const encryptionKey = decodeMfaEncryptionKey(encryptionValue);
  if (!encryptionKey) fail(`${name}.encryptionKeyFile must contain a valid 32-byte key`);
  const privateKey = readBoundedFile(
    `${name}.privateKeyFile`, entry.privateKeyFile,
    { minimumBytes: 64, maximumBytes: 8192, ownerOnly: true },
  );
  ownershipSigningKey(`${name}.privateKeyFile`, privateKey);
  for (const [field, pattern] of [
    ['generation', /^[a-z0-9][a-z0-9._-]{2,63}$/u],
    ['firebaseProjectId', /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u],
    ['clientId', /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/u],
    ['teamId', /^[A-Z0-9]{10}$/u],
    ['keyId', /^[A-Z0-9]{8,16}$/u],
  ]) {
    if (typeof entry[field] !== 'string' || !pattern.test(entry[field])) {
      fail(`${name}.${field} is invalid`);
    }
  }
  let redirect;
  try { redirect = new URL(entry.redirectUri); } catch { fail(`${name}.redirectUri is invalid`); }
  if (redirect.protocol !== 'https:') fail(`${name}.redirectUri is invalid`);
  return Object.freeze({
    generation: entry.generation,
    firebaseProjectId: entry.firebaseProjectId,
    appleRevocation: Object.freeze({
      enabled: true,
      encryptionKey,
      privateKey,
      credentialSource: 'file',
      clientId: entry.clientId,
      teamId: entry.teamId,
      keyId: entry.keyId,
      redirectUri: redirect.href,
    }),
  });
}

export function readAppleOwnershipSecretConfiguration(env, {
  deploymentEnvironment = 'development',
} = {}) {
  const coordination = readSecret(
    env,
    'APPLE_OWNERSHIP_COORDINATION_KEY',
    'APPLE_OWNERSHIP_COORDINATION_KEY_FILE',
    { minimumBytes: 16, maximumBytes: 128, ownerOnly: true },
  );
  if (['staging', 'production'].includes(deploymentEnvironment)
      && coordination.source === 'environment') {
    fail('Apple ownership coordination key must use APPLE_OWNERSHIP_COORDINATION_KEY_FILE');
  }
  const coordinationKey = coordination.value ? decodeMfaEncryptionKey(coordination.value) : null;
  if (coordination.value && !coordinationKey) {
    fail('Apple ownership coordination key must be a valid 32-byte key');
  }
  const manifestPath = value(env, 'APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE');
  if (!manifestPath) {
    return Object.freeze({ coordinationKey, historicalProfiles: Object.freeze([]) });
  }
  let manifest;
  try {
    manifest = JSON.parse(readBoundedFile(
      'APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE', manifestPath,
      { minimumBytes: 32, maximumBytes: 32 * 1024, ownerOnly: true },
    ));
  } catch (error) {
    if (error instanceof SyntaxError) fail('APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE must contain valid JSON');
    throw error;
  }
  if (!exactKeys(manifest, ['schemaVersion', 'profiles']) || manifest.schemaVersion !== 1
      || !Array.isArray(manifest.profiles) || manifest.profiles.length < 1
      || manifest.profiles.length > 8) {
    fail('APPLE_OWNERSHIP_HISTORICAL_PROFILES_FILE has an invalid shape');
  }
  if (!coordinationKey) fail('Apple ownership historical profiles require a coordination key');
  return Object.freeze({
    coordinationKey,
    historicalProfiles: Object.freeze(manifest.profiles.map(historicalProfile)),
  });
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
  requireOwnershipFileSecrets = false,
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
    { minimumBytes: 16, maximumBytes: 128, ownerOnly: requireOwnershipFileSecrets },
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
    { minimumBytes: 64, maximumBytes: 8192, ownerOnly: requireOwnershipFileSecrets },
  );
  if (requireOwnershipFileSecrets && ['staging', 'production'].includes(deploymentEnvironment)
      && (encryption.source !== 'file' || privateKey.source !== 'file')) {
    fail('Apple ownership Staging/Production requires APPLE_REVOCATION_ENCRYPTION_KEY_FILE and APPLE_REVOCATION_PRIVATE_KEY_FILE');
  }
  if (requireOwnershipFileSecrets) {
    ownershipSigningKey('Apple ownership private key', privateKey.value);
  } else if (!privateKey.value.includes('BEGIN PRIVATE KEY')) {
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

export const appleRevocationSecretFileInternals = Object.freeze({ assertStableBoundedRead });
