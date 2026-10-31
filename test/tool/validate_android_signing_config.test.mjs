import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  canonicalAndroidUploadCertificateSha256,
  parseKeyProperties,
  validateAndroidSigningConfig,
} from '../../tool/validate_android_signing_config.mjs';

function keytoolOutput(fingerprint) {
  return `Certificate fingerprints:\n\t SHA256: ${fingerprint.match(/../g).join(':').toUpperCase()}\n`;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-android-signing-test-'));
  const repository = join(root, 'repository');
  const android = join(repository, 'android');
  const secrets = join(root, 'secrets with spaces');
  await mkdir(android, { recursive: true });
  await mkdir(secrets);
  const keystore = join(secrets, 'shareittoo-upload.jks');
  const properties = join(android, 'key.properties');
  await writeFile(keystore, 'synthetic-keystore', { mode: 0o600 });
  await writeFile(properties, [
    `storeFile=${keystore}`,
    'storePassword=synthetic-store-password',
    'keyAlias=shareittoo-upload',
    'keyPassword=synthetic-key-password',
    '',
  ].join('\n'), { mode: 0o600 });
  return { root, repository, android, secrets, keystore, properties };
}

test('parses values containing equals signs without exposing them', () => {
  const parsed = parseKeyProperties('storePassword=value=with=equals\nkeyAlias=shareittoo-upload\n');
  assert.equal(parsed.storePassword, 'value=with=equals');
  assert.equal(parsed.keyAlias, 'shareittoo-upload');
});

test('accepts the owner-only canonical upload certificate outside the repository', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const result = validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    requireCanonical: true,
    keytoolOutput: keytoolOutput(canonicalAndroidUploadCertificateSha256),
  });
  assert.equal(result.canonical, true);
  assert.equal(result.fingerprintSha256, canonicalAndroidUploadCertificateSha256);
});

test('allows an explicit non-canonical test certificate outside Store mode', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const result = validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    keytoolOutput: keytoolOutput('a'.repeat(64)),
  });
  assert.equal(result.canonical, false);
});

test('rejects a non-canonical certificate in Store mode', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    requireCanonical: true,
    keytoolOutput: keytoolOutput('b'.repeat(64)),
  }), /canonical ShareItToo upload certificate/);
});

test('rejects a keystore stored inside the repository', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const inside = join(data.android, 'upload.jks');
  await writeFile(inside, 'synthetic-keystore', { mode: 0o600 });
  await writeFile(data.properties, [
    `storeFile=${inside}`,
    'storePassword=synthetic-store-password',
    'keyAlias=shareittoo-upload',
    'keyPassword=synthetic-key-password',
  ].join('\n'), { mode: 0o600 });
  assert.throws(() => validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    keytoolOutput: keytoolOutput(canonicalAndroidUploadCertificateSha256),
  }), /outside the repository/);
});

test('rejects permissive properties and keystore files', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  await chmod(data.properties, 0o640);
  assert.throws(() => validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    keytoolOutput: keytoolOutput(canonicalAndroidUploadCertificateSha256),
  }), /must not be readable by group or other users/);
  await chmod(data.properties, 0o600);
  await chmod(data.keystore, 0o644);
  assert.throws(() => validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    keytoolOutput: keytoolOutput(canonicalAndroidUploadCertificateSha256),
  }), /must not be readable by group or other users/);
});

test('rejects a linked keystore', async (t) => {
  const data = await fixture();
  t.after(() => rm(data.root, { recursive: true, force: true }));
  const linked = join(data.secrets, 'linked.jks');
  await symlink(data.keystore, linked);
  await writeFile(data.properties, [
    `storeFile=${linked}`,
    'storePassword=synthetic-store-password',
    'keyAlias=shareittoo-upload',
    'keyPassword=synthetic-key-password',
  ].join('\n'), { mode: 0o600 });
  assert.throws(() => validateAndroidSigningConfig({
    root: data.repository,
    propertiesPath: data.properties,
    keytoolOutput: keytoolOutput(canonicalAndroidUploadCertificateSha256),
  }), /normal file, not a link/);
});
