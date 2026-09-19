#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const canonicalAndroidUploadCertificateSha256 =
  '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(message);
}

function inside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function parseKeyProperties(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/[:=]/);
    if (separator <= 0) fail('android/key.properties contains an invalid entry.');
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (Object.hasOwn(values, key)) fail(`android/key.properties contains duplicate key ${key}.`);
    values[key] = value;
  }
  return values;
}

function ownerOnly(metadata, label) {
  if ((metadata.mode & 0o077) !== 0) fail(`${label} must not be readable by group or other users.`);
  if (typeof process.getuid === 'function' && metadata.uid !== 0 && metadata.uid !== process.getuid()) {
    fail(`${label} must be owned by the current user or root.`);
  }
}

function metadata(path, label) {
  let value;
  try {
    value = lstatSync(path);
  } catch {
    fail(`${label} is unavailable.`);
  }
  if (!value.isFile() || value.isSymbolicLink()) fail(`${label} must be a normal file, not a link.`);
  ownerOnly(value, label);
  return value;
}

function certificateFingerprint(output) {
  const match = output.match(/SHA256:\s*((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})/);
  if (!match) fail('keytool did not return a SHA-256 signing certificate fingerprint.');
  return match[1].replaceAll(':', '').toLowerCase();
}

function runKeytool({ keystorePath, alias, storePassword }) {
  const result = spawnSync('keytool', [
    '-list',
    '-v',
    '-keystore', keystorePath,
    '-alias', alias,
    '-storepass:env', 'SIT_ANDROID_KEYSTORE_PASSWORD',
  ], {
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      LANG: 'C',
      LC_ALL: 'C',
      SIT_ANDROID_KEYSTORE_PASSWORD: storePassword,
    },
  });
  if (result.status !== 0) fail('keytool could not verify the configured Android upload certificate.');
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

export function validateAndroidSigningConfig({
  root,
  propertiesPath = resolve(root, 'android', 'key.properties'),
  requireCanonical = false,
  keytoolOutput,
}) {
  const repository = realpathSync(root);
  metadata(propertiesPath, 'android/key.properties');
  const properties = parseKeyProperties(readFileSync(propertiesPath, 'utf8'));
  for (const name of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
    if (typeof properties[name] !== 'string' || properties[name] === '') {
      fail(`android/key.properties is missing ${name}.`);
    }
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(properties.keyAlias)) {
    fail('android/key.properties contains an unsafe keyAlias.');
  }

  const configuredKeystore = isAbsolute(properties.storeFile)
    ? properties.storeFile
    : resolve(root, 'android', 'app', properties.storeFile);
  metadata(configuredKeystore, 'Android upload keystore');
  const keystore = realpathSync(configuredKeystore);
  if (inside(repository, keystore)) fail('Android upload keystore must stay outside the repository.');

  const output = keytoolOutput ?? runKeytool({
    keystorePath: keystore,
    alias: properties.keyAlias,
    storePassword: properties.storePassword,
  });
  const fingerprint = certificateFingerprint(output);
  if (requireCanonical && fingerprint !== canonicalAndroidUploadCertificateSha256) {
    fail('Android Store release requires the canonical ShareItToo upload certificate.');
  }

  return {
    fingerprintSha256: fingerprint,
    canonical: fingerprint === canonicalAndroidUploadCertificateSha256,
  };
}

function runCli() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateAndroidSigningConfig({
    root,
    requireCanonical: process.argv.includes('--require-canonical'),
  });
  process.stdout.write(
    `Android signing gate: PASS (${result.canonical ? 'canonical' : 'non-canonical test certificate'})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Android signing gate failed.'}\n`);
    process.exitCode = 1;
  }
}
