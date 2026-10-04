#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { bindPasswordEnrollmentWebReadiness } from '../../tool/staging_password_enrollment_web_readiness.mjs';
import { buildReplacementCreateArgs } from './activate_staging_google_auth.mjs';
import { readProtectedStagingPasswordEnrollmentRegistry } from '../src/staging_password_enrollment.js';

const denialCode = 'green_password_enrollment_activation_denied';
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+\+[0-9]+$/u;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const canonicalEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const registryTarget = '/run/secrets/staging-password-enrollment-registry.json';
const publicOrigin = 'https://staging.shareittoo.com';
const maximumFileBytes = 64 * 1024;
const environmentScryptParameters = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
});

const manifestKeys = Object.freeze([
  'apiContainer', 'backupFile', 'currentConfigurationSha256', 'currentContainerId',
  'currentHealthSha256', 'currentImage', 'currentImageDigest', 'currentImageId',
  'currentQueueSha256', 'currentRevision', 'environmentFile', 'environmentGid',
  'environmentScryptDigest', 'environmentScryptSalt', 'environmentUid', 'evidenceFile',
  'mountsSha256',
  'lockFile', 'network', 'networkId', 'operation', 'providerNetwork', 'providerNetworkId',
  'registryFile', 'registryGid', 'registrySha256', 'registryTarget', 'registryUid',
  'schemaVersion', 'sourceCommit', 'sourceVersion', 'targetImage', 'targetImageDigest',
  'targetImageId', 'targetRevision',
]);

const activationDeltaKeys = new Set([
  'APP_PUBLIC_URL', 'MAIL_TRANSPORT', 'MAIL_FROM', 'MAIL_REPLY_TO',
  'SIT_STAGING_ALLOWED_USER_IDS', 'SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS',
  'SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS',
  'SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED',
  'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE',
  'SMTP_HOST', 'SMTP_PASSWORD', 'SMTP_PORT', 'SMTP_REQUIRE_TLS', 'SMTP_SECURE',
  'SMTP_USER',
]);

const explicitlyPreserved = Object.freeze({
  DEPLOYMENT_ENVIRONMENT: 'test',
  FIREBASE_AUTH_ENABLED: 'true',
  FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
  IDENTITY_VERIFICATION_TRANSPORT: 'memory',
  PAYMENT_TRANSPORT: 'memory',
  PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1',
  PUSH_TRANSPORT: 'memory',
  SIT_LISTING_AI_BUDGET_CENTS: '0',
  SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
  SIT_LISTING_AI_PROVIDER: 'on_device',
  SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
  SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
  STRIPE_LIVEMODE: 'false',
  PRIVATE_PILOT_V4_ENABLED: 'true',
  SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
});

export class GreenPasswordEnrollmentActivationError extends Error {
  constructor(state = 'denied', rollback = null) {
    super(denialCode);
    this.code = denialCode;
    this.state = state;
    if (rollback !== null) this.rollback = rollback;
  }
}

const deny = (state = 'denied', rollback = null) => {
  throw new GreenPasswordEnrollmentActivationError(state, rollback);
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const exactKeys = (value, expected) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === expected.length
  && Object.keys(value).every((key) => expected.includes(key));
const fileType = (metadata) => metadata.mode & 0o170000n;
const regularFile = (metadata) => fileType(metadata) === 0o100000n;
const directory = (metadata) => fileType(metadata) === 0o040000n;
const sameFileMetadata = (left, right) => [
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
].every((key) => left[key] === right[key]);
const sameDirectoryMetadata = (left, right, protectedParent) => protectedParent
  ? sameFileMetadata(left, right)
  : ['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => left[key] === right[key]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonicalValue(value[key])]));
}

const canonicalDigest = (value) => sha256(JSON.stringify(canonicalValue(value)));

function normalizedMount(mount) {
  if (!mount || typeof mount !== 'object' || !['bind', 'volume'].includes(mount.Type)
      || typeof mount.Source !== 'string' || !path.isAbsolute(mount.Source)
      || typeof mount.Destination !== 'string' || !path.isAbsolute(mount.Destination)
      || typeof mount.RW !== 'boolean'
      || (mount.Type === 'volume' && (typeof mount.Name !== 'string' || mount.Name === ''))
      || (mount.Type === 'bind' && mount.Name !== null && mount.Name !== undefined)) deny();
  return Object.freeze({
    type: mount.Type,
    name: mount.Type === 'volume' ? mount.Name : null,
    source: mount.Source,
    destination: mount.Destination,
    readOnly: mount.RW === false,
  });
}

export function greenPasswordEnrollmentMountsSha256(mounts) {
  if (!Array.isArray(mounts)) deny();
  const normalized = mounts.map(normalizedMount);
  if (new Set(normalized.map((mount) => mount.destination)).size !== normalized.length) deny();
  return canonicalDigest(normalized);
}

export function greenPasswordEnrollmentContainerSha256(container) {
  if (!container || typeof container !== 'object' || !container.Config
      || !container.HostConfig || !container.NetworkSettings) deny();
  const { Env: environmentEntries, ...configWithoutEnvironment } = container.Config;
  if (!Array.isArray(environmentEntries)) deny();
  const safeEnvironmentEntries = environmentEntries.map((entry) => {
    const separator = typeof entry === 'string' ? entry.indexOf('=') : -1;
    if (separator < 1) deny();
    const name = entry.slice(0, separator);
    return /(?:password|secret|token|database_url)/iu.test(name)
      ? `${name}=<redacted>` : entry;
  });
  return canonicalDigest({
    Config: { ...configWithoutEnvironment, Env: safeEnvironmentEntries },
    HostConfig: container.HostConfig,
    Mounts: (container.Mounts ?? []).map(normalizedMount),
    Networks: container.NetworkSettings.Networks ?? {},
  });
}

function canonicalEqual(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

export function greenPasswordEnrollmentQueueSha256(queue) {
  if (!exactKeys(queue, [
    'dead', 'pending', 'processing', 'retry',
    'sentInApp', 'sentPush', 'suppressedEmail', 'suppressedPush',
  ])
      || Object.values(queue).some((value) => !Number.isSafeInteger(value) || value < 0)) deny();
  return canonicalDigest(queue);
}

export function greenPasswordEnrollmentHealthSha256(health) {
  if (!exactKeys(health, [
    'commit', 'deploymentEnvironment', 'firebaseAuthEnabled', 'firebasePhoneEnabled',
    'googleRegistrationEnabled', 'liveStatus', 'mailStatus', 'passwordEnrollmentEnabled',
    'paymentTransport', 'readyStatus', 'stripeLivemode',
  ])
      || ![health.liveStatus, health.readyStatus].every(Number.isSafeInteger)
      || typeof health.mailStatus !== 'string') deny();
  return canonicalDigest(health);
}

function absolutePath(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 4096
      || value.includes('\0') || !path.isAbsolute(value) || path.normalize(value) !== value) deny();
  return value;
}

function closeDescriptors(descriptors, fileSystem) {
  let failed = false;
  for (const descriptor of descriptors.reverse()) {
    try { fileSystem.closeSync(descriptor); } catch { failed = true; }
  }
  return failed;
}

function openDirectoryChain(directoryPath, fileSystem, descriptors, trustedParentUids) {
  absolutePath(directoryPath);
  if (directoryPath === path.parse(directoryPath).root) deny();
  const parts = [path.parse(directoryPath).root];
  for (const part of path.relative(parts[0], directoryPath).split(path.sep)) {
    parts.push(path.join(parts.at(-1), part));
  }
  return parts.map((entryPath, index) => {
    const descriptor = fileSystem.openSync(entryPath,
      fileSystem.constants.O_RDONLY | fileSystem.constants.O_DIRECTORY
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK
        | fileSystem.constants.O_CLOEXEC);
    descriptors.push(descriptor);
    const before = fileSystem.fstatSync(descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(entryPath, { bigint: true });
    const protectedParent = index === parts.length - 1;
    if (!directory(before) || !sameDirectoryMetadata(before, linked, protectedParent)
        || (protectedParent && (before.nlink < 1n
          || !trustedParentUids.has(Number(before.uid))
          || (before.mode & 0o022n) !== 0n))) deny();
    return Object.freeze({ path: entryPath, descriptor, before, protectedParent });
  });
}

function assertDirectoryChainUnchanged(directories, fileSystem) {
  for (const entry of directories) {
    const opened = fileSystem.fstatSync(entry.descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(entry.path, { bigint: true });
    if (!sameDirectoryMetadata(entry.before, opened, entry.protectedParent)
        || !sameDirectoryMetadata(entry.before, linked, entry.protectedParent)) deny();
  }
}

function assertDirectoryChainIdentity(directories, fileSystem) {
  for (const entry of directories) {
    const opened = fileSystem.fstatSync(entry.descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(entry.path, { bigint: true });
    if (!sameDirectoryMetadata(entry.before, opened, false)
        || !sameDirectoryMetadata(entry.before, linked, false)) deny();
  }
}

function openProtectedOutputParent(filePath, fileSystem, operatorUid, descriptors) {
  absolutePath(filePath);
  const directories = openDirectoryChain(path.dirname(filePath), fileSystem, descriptors,
    new Set([0, operatorUid]));
  const parent = directories.at(-1).before;
  if (parent.uid !== BigInt(operatorUid) || (parent.mode & 0o7777n) !== 0o700n) deny();
  return directories;
}

function publishProtectedJson(filePath, value, { fileSystem, operatorUid }) {
  const descriptors = [];
  let descriptor;
  let directories;
  let metadata;
  let created = false;
  let result;
  let failure;
  try {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    if (bytes.length < 3 || bytes.length > maximumFileBytes) deny();
    directories = openProtectedOutputParent(filePath, fileSystem, operatorUid, descriptors);
    descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT | fileSystem.constants.O_EXCL
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_CLOEXEC, 0o600);
    descriptors.push(descriptor);
    created = true;
    metadata = fileSystem.fstatSync(descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(filePath, { bigint: true });
    if (!regularFile(metadata) || !sameFileMetadata(metadata, linked)
        || metadata.nlink !== 1n || metadata.uid !== BigInt(operatorUid)
        || (metadata.mode & 0o7777n) !== 0o600n || metadata.size !== 0n) deny();
    let offset = 0;
    while (offset < bytes.length) {
      const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (written <= 0) deny();
      offset += written;
    }
    fileSystem.fsyncSync(descriptor);
    const after = fileSystem.fstatSync(descriptor, { bigint: true });
    const linkedAfter = fileSystem.lstatSync(filePath, { bigint: true });
    if (!regularFile(after) || !sameFileMetadata(after, linkedAfter)
        || after.size !== BigInt(bytes.length)) deny();
    metadata = after;
    fileSystem.fsyncSync(directories.at(-1).descriptor);
    assertDirectoryChainIdentity(directories, fileSystem);
    result = Object.freeze({ sha256: sha256(bytes), bytes: bytes.length });
  } catch {
    failure = new GreenPasswordEnrollmentActivationError();
  } finally {
    if (closeDescriptors(descriptors, fileSystem)) failure = new GreenPasswordEnrollmentActivationError();
    if (failure !== undefined && created) {
      try {
        const linked = fileSystem.lstatSync(filePath, { bigint: true });
        if (metadata && sameFileMetadata(metadata, linked)) fileSystem.unlinkSync(filePath);
      } catch { /* publication remains unconfirmed and no destructive guess is made */ }
    }
  }
  if (failure !== undefined) throw failure;
  return result;
}

function acquireActivationLock(filePath, { fileSystem, operatorUid }) {
  const descriptors = [];
  let directories;
  let descriptor;
  let metadata;
  try {
    directories = openProtectedOutputParent(filePath, fileSystem, operatorUid, descriptors);
    descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT | fileSystem.constants.O_EXCL
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_CLOEXEC, 0o600);
    descriptors.push(descriptor);
    metadata = fileSystem.fstatSync(descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(filePath, { bigint: true });
    if (!regularFile(metadata) || !sameFileMetadata(metadata, linked)
        || metadata.nlink !== 1n || metadata.uid !== BigInt(operatorUid)
        || (metadata.mode & 0o7777n) !== 0o600n) deny();
    const bytes = Buffer.from('locked\n');
    if (fileSystem.writeSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) deny();
    fileSystem.fsyncSync(descriptor);
    metadata = fileSystem.fstatSync(descriptor, { bigint: true });
    fileSystem.fsyncSync(directories.at(-1).descriptor);
    assertDirectoryChainIdentity(directories, fileSystem);
    return { descriptor, descriptors, directories, filePath, metadata };
  } catch {
    closeDescriptors(descriptors, fileSystem);
    throw new GreenPasswordEnrollmentActivationError();
  }
}

function releaseActivationLock(lock, fileSystem) {
  let failed = false;
  try {
    const opened = fileSystem.fstatSync(lock.descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(lock.filePath, { bigint: true });
    if (opened.dev !== lock.metadata.dev || opened.ino !== lock.metadata.ino
        || !sameFileMetadata(opened, linked)) deny();
    fileSystem.unlinkSync(lock.filePath);
    fileSystem.fsyncSync(lock.directories.at(-1).descriptor);
    assertDirectoryChainIdentity(lock.directories, fileSystem);
  } catch { failed = true; }
  if (closeDescriptors(lock.descriptors, fileSystem)) failed = true;
  if (failed) deny('lock-release-unconfirmed');
}

// Security-sensitive inputs retain every ancestor descriptor. The leaf is
// opened O_NOFOLLOW, bound by descriptor metadata, and only then compared with
// the pathname. Successful content is never returned before every close succeeds.
export function readProtectedActivationFile(filePath, {
  fileSystem = fs,
  expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  expectedGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  maximumBytes = maximumFileBytes,
} = {}) {
  const descriptors = [];
  let result;
  let failure;
  try {
    absolutePath(filePath);
    if (![expectedUid, expectedGid, operatorUid].every((value) => Number.isSafeInteger(value) && value >= 0)
        || !Number.isSafeInteger(maximumBytes) || maximumBytes < 2) deny();
    const trustedParentUids = new Set([0, operatorUid, expectedUid]);
    const directories = openDirectoryChain(path.dirname(filePath), fileSystem,
      descriptors, trustedParentUids);
    const descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_RDONLY | fileSystem.constants.O_NOFOLLOW
        | fileSystem.constants.O_NONBLOCK | fileSystem.constants.O_CLOEXEC);
    descriptors.push(descriptor);
    const before = fileSystem.fstatSync(descriptor, { bigint: true });
    const linkedBefore = fileSystem.lstatSync(filePath, { bigint: true });
    if (!regularFile(before) || !sameFileMetadata(before, linkedBefore)
        || before.nlink !== 1n || (before.mode & 0o7777n) !== 0o600n
        || before.uid !== BigInt(expectedUid) || before.gid !== BigInt(expectedGid)
        || before.size < 2n || before.size > BigInt(maximumBytes)) deny();
    assertDirectoryChainUnchanged(directories, fileSystem);
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fileSystem.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) deny();
      offset += count;
    }
    if (fileSystem.readSync(descriptor, Buffer.alloc(1), 0, 1, bytes.length) !== 0) deny();
    const after = fileSystem.fstatSync(descriptor, { bigint: true });
    const linkedAfter = fileSystem.lstatSync(filePath, { bigint: true });
    if (!sameFileMetadata(before, after) || !sameFileMetadata(after, linkedAfter)) deny();
    assertDirectoryChainUnchanged(directories, fileSystem);
    // The caller chooses a binding suitable for the payload. Secret-bearing
    // environment bytes must never pass through a generic fast hash.
    result = Object.freeze({ bytes });
  } catch {
    failure = new GreenPasswordEnrollmentActivationError();
  } finally {
    if (closeDescriptors(descriptors, fileSystem)) failure = new GreenPasswordEnrollmentActivationError();
  }
  if (failure !== undefined) {
    result?.bytes.fill(0);
    throw failure;
  }
  return result;
}

export function deriveProtectedEnvironmentScryptDigest(bytes, saltHex) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > maximumFileBytes
      || typeof saltHex !== 'string' || !digestPattern.test(saltHex)
      || /^([a-f0-9])\1{63}$/u.test(saltHex)) deny();
  const salt = Buffer.from(saltHex, 'hex');
  let derived;
  try {
    derived = crypto.scryptSync(bytes, salt, 32, environmentScryptParameters);
    return derived.toString('hex');
  } catch {
    deny();
  } finally {
    salt.fill(0);
    derived?.fill(0);
  }
}

function parseEnvironmentText(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { deny(); }
  if (!text.endsWith('\n') || text.includes('\r') || text.includes('\0')) deny();
  const result = {};
  for (const line of text.slice(0, -1).split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 1) deny();
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(name) || Object.hasOwn(result, name)) deny();
    result[name] = value;
  }
  return result;
}

function environmentFromContainer(entries) {
  if (!Array.isArray(entries) || entries.length < 1) deny();
  return parseEnvironmentText(Buffer.from(`${entries.join('\n')}\n`));
}

function parseCanonicalList(value, pattern) {
  if (typeof value !== 'string' || value === '') deny();
  const entries = value.split(',');
  if (entries.some((entry) => !pattern.test(entry))
      || new Set(entries).size !== entries.length) deny();
  return Object.freeze(entries);
}

function assertSmtp(environment) {
  const canonicalMailbox = (value, allowDisplayName) => {
    if (typeof value !== 'string' || value.length < 3 || value.length > 320
        || value !== value.trim()) return false;
    const email = allowDisplayName && value.includes('<')
      ? value.match(/^[^<>\r\n]{1,64}<([^<>\s]+)>$/u)?.[1]
      : value;
    return typeof email === 'string' && email === email.toLowerCase()
      && canonicalEmailPattern.test(email);
  };
  if (environment.MAIL_TRANSPORT !== 'smtp'
      || typeof environment.SMTP_HOST !== 'string' || environment.SMTP_HOST.length < 1
      || environment.SMTP_HOST.length > 253 || /\s/u.test(environment.SMTP_HOST)
      || !/^[1-9][0-9]{0,4}$/u.test(environment.SMTP_PORT ?? '')
      || Number(environment.SMTP_PORT) > 65535
      || environment.SMTP_SECURE !== 'false'
      || environment.SMTP_REQUIRE_TLS !== 'true'
      || !canonicalMailbox(environment.MAIL_FROM, true)
      || !canonicalMailbox(environment.MAIL_REPLY_TO, false)) deny();
  const user = environment.SMTP_USER ?? '';
  const password = environment.SMTP_PASSWORD ?? '';
  if ((user === '') !== (password === '')) deny();
}

function assertInvitations(records, environment, now, currentEnvironment) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 20
      || !Number.isSafeInteger(now)) deny();
  const accessUsers = parseCanonicalList(environment.SIT_STAGING_ALLOWED_USER_IDS, principalPattern);
  const notificationUsers = parseCanonicalList(
    environment.SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS, principalPattern,
  );
  const emails = parseCanonicalList(
    environment.SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS, canonicalEmailPattern,
  );
  const currentAccessUsers = parseCanonicalList(
    currentEnvironment.SIT_STAGING_ALLOWED_USER_IDS, principalPattern,
  );
  const currentNotificationUsers = parseCanonicalList(
    currentEnvironment.SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS, principalPattern,
  );
  const currentEmails = parseCanonicalList(
    currentEnvironment.SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS, canonicalEmailPattern,
  );
  if (emails.some((email) => email !== email.toLowerCase())) deny();
  if (currentEmails.some((email) => email !== email.toLowerCase())) deny();
  const accessSet = new Set(accessUsers);
  const notificationSet = new Set(notificationUsers);
  const tokenSet = new Set();
  const emailDigestSet = new Set();
  const userSet = new Set();
  const invitationUsers = records.map((record) => record.userId);
  if (invitationUsers.some((userId) => currentAccessUsers.includes(userId)
      || currentNotificationUsers.includes(userId))
      || JSON.stringify(accessUsers) !== JSON.stringify([...currentAccessUsers, ...invitationUsers])
      || JSON.stringify(notificationUsers)
        !== JSON.stringify([...currentNotificationUsers, ...invitationUsers])
      || JSON.stringify(emails.slice(0, currentEmails.length)) !== JSON.stringify(currentEmails)) deny();
  for (const record of records) {
    if (!exactKeys(record, ['emailDigest', 'expiresAt', 'issuedAt', 'tokenDigest', 'userId'])
        || !digestPattern.test(record.emailDigest) || !digestPattern.test(record.tokenDigest)
        || !principalPattern.test(record.userId) || tokenSet.has(record.tokenDigest)
        || emailDigestSet.has(record.emailDigest) || userSet.has(record.userId)
        || !accessSet.has(record.userId) || !notificationSet.has(record.userId)) deny();
    const issued = Date.parse(record.issuedAt);
    const expires = Date.parse(record.expiresAt);
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires)
        || new Date(issued).toISOString() !== record.issuedAt
        || new Date(expires).toISOString() !== record.expiresAt
        || issued > now || expires <= now || expires - issued > 24 * 60 * 60 * 1000) deny();
    const matches = emails.filter((email) => (
      sha256(`${record.tokenDigest}\n${email}`) === record.emailDigest
    ));
    if (matches.length !== 1) deny();
    tokenSet.add(record.tokenDigest);
    emailDigestSet.add(record.emailDigest);
    userSet.add(record.userId);
  }
  const addedEmails = emails.slice(currentEmails.length);
  if (addedEmails.some((email) => records.filter((record) => (
    sha256(`${record.tokenDigest}\n${email}`) === record.emailDigest
  )).length !== 1)) deny();
  const alreadyBound = records.filter((record) => currentEmails.some((email) => (
    sha256(`${record.tokenDigest}\n${email}`) === record.emailDigest
  ))).length;
  if (addedEmails.length !== records.length - alreadyBound) deny();
  return Object.freeze({
    invitationCount: records.length,
    accessAllowedCount: accessUsers.length,
    accessAllowedSha256: canonicalDigest(accessUsers),
    notificationUserCount: notificationUsers.length,
    notificationUserSha256: canonicalDigest(notificationUsers),
    notificationRecipientCount: emails.length,
    notificationRecipientSha256: canonicalDigest(emails),
    invitationBindingSha256: canonicalDigest(records.map((record) => ({
      emailDigest: record.emailDigest, userId: record.userId,
    }))),
  });
}

export function activationEnvironment({
  currentEnvironment,
  proposedEnvironment,
  invitations,
  now = Date.now(),
} = {}) {
  if (!currentEnvironment || typeof currentEnvironment !== 'object' || Array.isArray(currentEnvironment)
      || !proposedEnvironment || typeof proposedEnvironment !== 'object'
      || Array.isArray(proposedEnvironment)) deny();
  if (['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME']
    .some((name) => Object.hasOwn(proposedEnvironment, name))) deny();
  if (currentEnvironment.APP_PUBLIC_URL !== 'http://shareittoo-staging-api:8080'
      || currentEnvironment.MAIL_TRANSPORT !== 'memory'
      || currentEnvironment.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED !== 'false'
      || (currentEnvironment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE ?? '') !== ''
      || (currentEnvironment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS ?? '') !== '') deny();
  for (const [name, expected] of Object.entries(explicitlyPreserved)) {
    if (currentEnvironment[name] !== expected || proposedEnvironment[name] !== expected) deny();
  }
  for (const name of new Set([...Object.keys(currentEnvironment), ...Object.keys(proposedEnvironment)])) {
    if (['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'].includes(name)) continue;
    if (!activationDeltaKeys.has(name) && currentEnvironment[name] !== proposedEnvironment[name]) deny();
  }
  if (proposedEnvironment.APP_PUBLIC_URL !== publicOrigin
      || proposedEnvironment.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED !== 'true'
      || proposedEnvironment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE !== registryTarget
      || (proposedEnvironment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS ?? '') !== '') deny();
  assertSmtp(proposedEnvironment);
  const bindings = assertInvitations(invitations, proposedEnvironment, now, currentEnvironment);
  const safeEnvironment = Object.fromEntries(Object.entries(proposedEnvironment)
    .filter(([name]) => !/(?:password|secret|token|database_url)/iu.test(name)));
  return Object.freeze({
    ...bindings,
    safeEnvironmentSha256: canonicalDigest(safeEnvironment),
    smtpConfigurationSha256: canonicalDigest({
      host: proposedEnvironment.SMTP_HOST,
      port: proposedEnvironment.SMTP_PORT,
      secure: proposedEnvironment.SMTP_SECURE,
      requireTls: proposedEnvironment.SMTP_REQUIRE_TLS,
      from: proposedEnvironment.MAIL_FROM,
      replyTo: proposedEnvironment.MAIL_REPLY_TO ?? '',
      authMode: proposedEnvironment.SMTP_USER === '' ? 'relay' : 'authenticated',
    }),
  });
}

export function assertGreenPasswordEnrollmentActivationManifest(manifest) {
  if (!exactKeys(manifest, manifestKeys) || manifest.schemaVersion !== 1
      || manifest.operation !== 'activate-green-password-enrollment'
      || !commitPattern.test(manifest.sourceCommit) || !versionPattern.test(manifest.sourceVersion)
      || !/^shareittoo-staging-api$/u.test(manifest.apiContainer)
      || !/^[a-f0-9]{64}$/u.test(manifest.currentContainerId)
      || ![manifest.currentImage, manifest.targetImage]
        .every((value) => typeof value === 'string' && value.length >= 3)
      || ![manifest.currentImageId, manifest.currentImageDigest,
        manifest.targetImageId, manifest.targetImageDigest]
        .every((value) => /^sha256:[a-f0-9]{64}$/u.test(value))
      || ![manifest.currentRevision, manifest.targetRevision].every((value) => commitPattern.test(value))
      || manifest.targetRevision !== manifest.sourceCommit
      || !manifest.currentImage.endsWith(`:${manifest.currentRevision}`)
      || !manifest.targetImage.endsWith(`:${manifest.targetRevision}`)
      || ![manifest.environmentScryptDigest, manifest.registrySha256, manifest.mountsSha256,
        manifest.currentConfigurationSha256, manifest.currentHealthSha256,
        manifest.currentQueueSha256]
        .every((value) => digestPattern.test(value))
      || !digestPattern.test(manifest.environmentScryptSalt)
      || /^([a-f0-9])\1{63}$/u.test(manifest.environmentScryptSalt)
      || manifest.environmentScryptSalt === manifest.environmentScryptDigest
      || manifest.registryTarget !== registryTarget
      || ![manifest.environmentUid, manifest.environmentGid,
        manifest.registryUid, manifest.registryGid]
        .every((value) => Number.isSafeInteger(value) && value >= 0)
      || ![manifest.environmentFile, manifest.registryFile, manifest.backupFile,
        manifest.evidenceFile, manifest.lockFile].every((value) => typeof value === 'string')
      || new Set([manifest.environmentFile, manifest.registryFile, manifest.backupFile,
        manifest.evidenceFile, manifest.lockFile].map(absolutePath)).size !== 5
      || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,127}$/u.test(manifest.network)
      || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,127}$/u.test(manifest.providerNetwork)
      || !/^[a-f0-9]{64}$/u.test(manifest.networkId)
      || !/^[a-f0-9]{64}$/u.test(manifest.providerNetworkId)) deny();
  return Object.freeze({ ...manifest });
}

function readProtectedActivationEnvironment(target, {
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  operatorGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
} = {}) {
  const environmentFile = readProtectedActivationFile(target.environmentFile, {
    fileSystem, expectedUid: target.environmentUid, expectedGid: target.environmentGid,
    operatorUid,
  });
  let environment;
  try {
    const observedDigest = deriveProtectedEnvironmentScryptDigest(
      environmentFile.bytes, target.environmentScryptSalt,
    );
    const expectedDigest = Buffer.from(target.environmentScryptDigest, 'hex');
    const observedDigestBytes = Buffer.from(observedDigest, 'hex');
    try {
      if (!crypto.timingSafeEqual(observedDigestBytes, expectedDigest)) deny();
    } finally {
      observedDigestBytes.fill(0);
      expectedDigest.fill(0);
    }
    environment = parseEnvironmentText(environmentFile.bytes);
  } finally {
    environmentFile.bytes.fill(0);
  }
  return Object.freeze(environment);
}

function readProtectedInvitationRegistry(target, {
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
} = {}) {
  let invitations;
  try {
    invitations = readProtectedStagingPasswordEnrollmentRegistry(target.registryFile, {
      fileSystem, ownerUid: target.registryUid,
    });
  } catch { deny(); }
  const registryBytes = readProtectedActivationFile(target.registryFile, {
    fileSystem, expectedUid: target.registryUid, expectedGid: target.registryGid,
    operatorUid,
  });
  try {
    const canonical = Buffer.from(`${JSON.stringify(invitations)}\n`);
    if (sha256(registryBytes.bytes) !== target.registrySha256
        || !registryBytes.bytes.equals(canonical)) deny();
  } finally {
    registryBytes.bytes.fill(0);
  }
  return invitations;
}

function immutableImageReference(image, digest) {
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  const repository = lastColon > lastSlash ? image.slice(0, lastColon) : image;
  return `${repository}@${digest}`;
}

export function assertGreenPasswordEnrollmentCurrentState(state, manifest) {
  const target = assertGreenPasswordEnrollmentActivationManifest(manifest);
  if (!state || typeof state !== 'object') deny();
  const {
    container, image, targetImage, targetRuntimeIdentity, targetRegistryProbe,
    network, providerNetwork, health, queue,
  } = state;
  if (container?.Id !== target.currentContainerId || container?.Name !== `/${target.apiContainer}`
      || container?.State?.Running !== true
      || container?.Image !== target.currentImageId || container?.Config?.Image !== target.currentImage
      || container?.Config?.User !== 'shareittoo'
      || greenPasswordEnrollmentContainerSha256(container) !== target.currentConfigurationSha256
      || !Array.isArray(container.Mounts) || container.Mounts.length !== 3
      || container.Mounts.some((mount) => mount.Destination === registryTarget)
      || greenPasswordEnrollmentMountsSha256(container.Mounts) !== target.mountsSha256
      || image?.Id !== target.currentImageId || !Array.isArray(image?.RepoDigests)
      || !image.RepoDigests.includes(immutableImageReference(
        target.currentImage, target.currentImageDigest,
      ))
      || image?.Config?.Labels?.['org.opencontainers.image.revision'] !== target.currentRevision
      || targetImage?.Id !== target.targetImageId
      || !targetImage?.RepoDigests?.includes(immutableImageReference(
        target.targetImage, target.targetImageDigest,
      ))
      || targetImage?.Config?.User !== 'shareittoo'
      || targetImage?.Config?.Labels?.['org.opencontainers.image.revision'] !== target.targetRevision
      || !exactKeys(targetRuntimeIdentity, ['gid', 'uid', 'user'])
      || targetRuntimeIdentity.user !== 'shareittoo'
      || targetRuntimeIdentity.uid !== target.registryUid
      || targetRuntimeIdentity.gid !== target.registryGid
      || !exactKeys(targetRegistryProbe, ['readable', 'sha256', 'writable'])
      || targetRegistryProbe.readable !== true || targetRegistryProbe.writable !== false
      || targetRegistryProbe.sha256 !== target.registrySha256
      || network?.Id !== target.networkId || network?.Name !== target.network
      || network?.Internal !== true
      || providerNetwork?.Id !== target.providerNetworkId
      || providerNetwork?.Name !== target.providerNetwork
      || providerNetwork?.Internal === true) deny();
  const mountRoles = new Map(container.Mounts.map((mount) => [mount.Destination, normalizedMount(mount)]));
  if (mountRoles.get('/run/secrets/mfa-encryption-key')?.type !== 'bind'
      || mountRoles.get('/run/secrets/mfa-encryption-key')?.readOnly !== true
      || mountRoles.get('/run/secrets/firebase-service-account.json')?.type !== 'bind'
      || mountRoles.get('/run/secrets/firebase-service-account.json')?.readOnly !== true
      || mountRoles.get('/data/uploads')?.type !== 'volume'
      || mountRoles.get('/data/uploads')?.readOnly !== false
      || Object.values(container.HostConfig?.PortBindings ?? {}).flat().filter(Boolean).length > 0
      || Object.values(container.NetworkSettings?.Ports ?? {}).flat().filter(Boolean).length > 0) deny();
  const attached = container.NetworkSettings?.Networks;
  if (!attached || JSON.stringify(Object.keys(attached).sort())
      !== JSON.stringify([target.network, target.providerNetwork].sort())
      || attached[target.network]?.NetworkID !== target.networkId
      || attached[target.providerNetwork]?.NetworkID !== target.providerNetworkId) deny();
  if (greenPasswordEnrollmentHealthSha256(health) !== target.currentHealthSha256
      || health.liveStatus !== 200 || health.readyStatus !== 200 || health.mailStatus !== 'ok'
      || health.commit !== target.currentRevision || health.deploymentEnvironment !== 'test'
      || health.firebaseAuthEnabled !== true || health.firebasePhoneEnabled !== false
      || health.googleRegistrationEnabled !== false || health.passwordEnrollmentEnabled !== false
      || health.paymentTransport !== 'memory' || health.stripeLivemode !== false
      || greenPasswordEnrollmentQueueSha256(queue) !== target.currentQueueSha256
      || queue.pending !== 0 || queue.retry !== 0 || queue.processing !== 0 || queue.dead !== 0) deny();
  return Object.freeze({
    configurationSha256: target.currentConfigurationSha256,
    healthSha256: target.currentHealthSha256,
    mountsSha256: target.mountsSha256,
    queueSha256: target.currentQueueSha256,
  });
}

function environmentObjectsEqual(left, right) {
  const withoutImageIdentity = (environment) => Object.fromEntries(Object.entries(environment)
    .filter(([name]) => !['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'].includes(name)));
  return JSON.stringify(canonicalValue(withoutImageIdentity(left)))
    === JSON.stringify(canonicalValue(right));
}

function cloneConfigWithoutActivationDelta(container) {
  const config = { ...(container.Config ?? {}) };
  delete config.Env;
  delete config.Image;
  delete config.Hostname;
  return config;
}

function hostConfigWithoutMountTransport(hostConfig) {
  const value = { ...(hostConfig ?? {}) };
  delete value.Mounts;
  // Effective mount semantics are compared separately. Docker represents the
  // same existing Compose mounts in HostConfig.Binds and a --mount successor
  // in HostConfig.Mounts, so transport representation is not security drift.
  delete value.Binds;
  return value;
}

function normalizedHostMount(mount) {
  if (!mount || typeof mount !== 'object' || !['bind', 'volume'].includes(mount.Type)
      || typeof mount.Source !== 'string' || mount.Source === ''
      || typeof mount.Target !== 'string' || !path.isAbsolute(mount.Target)
      || typeof mount.ReadOnly !== 'boolean') deny();
  return Object.freeze({
    type: mount.Type, source: mount.Source, target: mount.Target, readOnly: mount.ReadOnly,
  });
}

export function buildGreenPasswordEnrollmentCreatePlan(manifest, currentContainer) {
  const target = assertGreenPasswordEnrollmentActivationManifest(manifest);
  if (!currentContainer || currentContainer.Id !== target.currentContainerId
      || !Array.isArray(currentContainer.Mounts) || currentContainer.Mounts.length !== 3) deny();
  const mounts = [
    ...currentContainer.Mounts,
    Object.freeze({
      Type: 'bind', Name: null, Source: target.registryFile,
      Destination: registryTarget, RW: false,
    }),
  ];
  const args = buildReplacementCreateArgs({
    manifest: {
      ...target,
      image: immutableImageReference(target.targetImage, target.targetImageDigest),
    },
    envFile: target.environmentFile,
    currentApi: currentContainer,
    mounts,
  });
  const registryArgument = `type=bind,src=${target.registryFile},dst=${registryTarget},readonly=true`;
  if (!args.includes('--mount') || !args.includes(registryArgument)
      || args.some((argument) => argument === '--volume' || argument === '-v')
      || args.at(-((currentContainer.Config?.Cmd ?? []).length + 1))
        !== immutableImageReference(target.targetImage, target.targetImageDigest)) deny();
  return Object.freeze({ args: Object.freeze([...args]), mounts: Object.freeze(mounts) });
}

function assertCandidateContainerShape(container, target, currentContainer, proposedEnvironment, {
  running,
  providerAttached,
} = {}) {
  if (!container || container.Id === target.currentContainerId
      || !/^[a-f0-9]{64}$/u.test(container.Id ?? '')
      || container.Name !== `/${target.apiContainer}`
      || container.State?.Running !== running
      || container.Image !== target.targetImageId
      || container.Config?.Image !== immutableImageReference(
        target.targetImage, target.targetImageDigest,
      )
      || container.Config?.User !== 'shareittoo'
      || !environmentObjectsEqual(environmentFromContainer(container.Config?.Env), proposedEnvironment)
      || canonicalDigest(cloneConfigWithoutActivationDelta(container))
        !== canonicalDigest(cloneConfigWithoutActivationDelta(currentContainer))
      || canonicalDigest(hostConfigWithoutMountTransport(container.HostConfig))
        !== canonicalDigest(hostConfigWithoutMountTransport(currentContainer.HostConfig))
      || !Array.isArray(container.Mounts) || container.Mounts.length !== 4) deny();
  const expectedMounts = [...currentContainer.Mounts, {
    Type: 'bind', Name: null, Source: target.registryFile,
    Destination: registryTarget, RW: false,
  }];
  if (!canonicalEqual(container.Mounts.map(normalizedMount), expectedMounts.map(normalizedMount))
      || !Array.isArray(container.HostConfig?.Mounts)
      || container.HostConfig.Mounts.length !== 4
      || !canonicalEqual(container.HostConfig.Mounts.map(normalizedHostMount),
        expectedMounts.map((mount) => ({
          type: mount.Type,
          source: mount.Type === 'volume' ? mount.Name : mount.Source,
          target: mount.Destination,
          readOnly: mount.RW === false,
        })))
      || Object.values(container.HostConfig?.PortBindings ?? {}).flat().filter(Boolean).length > 0
      || Object.values(container.NetworkSettings?.Ports ?? {}).flat().filter(Boolean).length > 0) deny();
  const networks = container.NetworkSettings?.Networks;
  const expectedNetworkNames = providerAttached
    ? [target.network, target.providerNetwork].sort() : [target.network];
  if (!networks || JSON.stringify(Object.keys(networks).sort())
      !== JSON.stringify(expectedNetworkNames)
      || networks[target.network]?.NetworkID !== target.networkId
      || (providerAttached && networks[target.providerNetwork]?.NetworkID !== target.providerNetworkId)) deny();
  return container.Id;
}

function validateReadinessEvidence(evidence, expectedDigest, target, prepared, now) {
  let binding;
  try {
    binding = bindPasswordEnrollmentWebReadiness(evidence, expectedDigest, {
      now: new Date(now), expectedSource: target.sourceCommit,
      expectedVersion: target.sourceVersion,
    });
  } catch { deny(); }
  let readiness;
  try { readiness = JSON.parse(binding.readinessJson); } catch { deny(); }
  if (evidence.schemaVersion !== 2
      || readiness.invitationCount !== prepared.invitationCount
      || readiness.invitationRegistrySha256 !== target.registrySha256
      || readiness.allowedUserCount !== prepared.accessAllowedCount
      || readiness.notificationAllowedUserCount !== prepared.notificationUserCount
      || readiness.allowedRecipientCount !== prepared.notificationRecipientCount
      || readiness.smtpConfigurationSha256 !== prepared.smtpConfigurationSha256
      || readiness.invitationPrincipalMatchCount !== prepared.invitationCount
      || readiness.invitationNotificationUserMatchCount !== prepared.invitationCount
      || readiness.invitationRecipientMatchCount !== prepared.invitationCount
      || readiness.unmatchedInvitationPrincipalCount !== 0
      || readiness.unmatchedInvitationNotificationUserCount !== 0
      || readiness.unmatchedInvitationRecipientCount !== 0) deny();
  return Object.freeze({
    evidenceDigest: binding.evidenceDigest,
    readinessDigest: binding.readinessDigest,
    validatedAtUtc: binding.validatedAtUtc,
  });
}

export function assertGreenPasswordEnrollmentCandidateState(
  state, manifest, currentState, proposedEnvironment, prepared, now,
) {
  const target = assertGreenPasswordEnrollmentActivationManifest(manifest);
  if (!state || typeof state !== 'object'
      || state.image?.Id !== target.targetImageId
      || !state.image?.RepoDigests?.includes(immutableImageReference(
        target.targetImage, target.targetImageDigest,
      ))
      || state.image?.Config?.Labels?.['org.opencontainers.image.revision'] !== target.targetRevision
      || state.runtimeIdentity?.uid !== target.registryUid
      || state.runtimeIdentity?.gid !== target.registryGid) deny();
  assertCandidateContainerShape(state.container, target, currentState.container,
    proposedEnvironment, { running: true, providerAttached: true });
  const health = state.health;
  if (greenPasswordEnrollmentHealthSha256(health) !== state.healthSha256
      || health.commit !== target.targetRevision || health.deploymentEnvironment !== 'test'
      || health.liveStatus !== 200 || health.readyStatus !== 200 || health.mailStatus !== 'ok'
      || health.firebaseAuthEnabled !== true || health.firebasePhoneEnabled !== false
      || health.googleRegistrationEnabled !== false || health.passwordEnrollmentEnabled !== true
      || health.paymentTransport !== 'memory' || health.stripeLivemode !== false
      || greenPasswordEnrollmentQueueSha256(state.queue) !== target.currentQueueSha256) deny();
  if (!exactKeys(state.registryReadback, [
    'invitationCount', 'parserStatus', 'readable', 'sha256', 'writable',
  ])
      || state.registryReadback.readable !== true
      || state.registryReadback.writable !== false
      || state.registryReadback.parserStatus !== 'ok'
      || state.registryReadback.sha256 !== target.registrySha256
      || state.registryReadback.invitationCount !== prepared.invitationCount) deny();
  const readiness = validateReadinessEvidence(
    state.readinessEvidence, state.readinessEvidenceSha256, target, prepared, now,
  );
  return Object.freeze({
    candidateContainerId: state.container.Id,
    candidateHealthSha256: state.healthSha256,
    queueSha256: target.currentQueueSha256,
    ...readiness,
  });
}

function requiredOperations(operations) {
  const names = [
    'collectCurrent', 'readQueue', 'stopExact', 'renameExact', 'createExact',
    'resolveCreatedCandidate', 'inspectExact', 'connectExact', 'startExact',
    'collectCandidate', 'removeExact',
  ];
  if (!operations || names.some((name) => typeof operations[name] !== 'function')) deny();
  return operations;
}

function observeOriginalContainer(container, target, originalState) {
  if (!container || container.Id !== target.currentContainerId
      || greenPasswordEnrollmentContainerSha256(container)
        !== greenPasswordEnrollmentContainerSha256(originalState.container)) deny();
  return Object.freeze({
    running: container.State?.Running === true,
    name: String(container.Name ?? '').replace(/^\//u, ''),
  });
}

async function rollbackActivation({
  operations, candidateId, originalStopped, originalRenamed,
  target, originalState, proposedEnvironment,
}) {
  const result = {
    candidateRemoved: candidateId === null,
    originalNameRestored: !originalRenamed,
    originalRestarted: !originalStopped,
    originalVerified: false,
    failureStep: null,
  };
  let step = 'candidate-remove';
  try {
    if (candidateId !== null) {
      const ownedCandidate = await operations.inspectExact(candidateId);
      assertCandidateContainerShape(ownedCandidate, target, originalState.container,
        proposedEnvironment, {
          running: ownedCandidate?.State?.Running === true,
          providerAttached: Boolean(ownedCandidate?.NetworkSettings?.Networks?.[target.providerNetwork]),
        });
      await operations.removeExact(candidateId);
      if (await operations.inspectExact(candidateId) !== null) deny();
      result.candidateRemoved = true;
    }
    if (originalRenamed) {
      step = 'original-rename';
      await operations.renameExact(target.currentContainerId, target.apiContainer);
      result.originalNameRestored = true;
    }
    if (originalStopped) {
      step = 'original-start';
      await operations.startExact(target.currentContainerId);
      result.originalRestarted = true;
    }
    step = 'original-readback';
    const restored = await operations.collectCurrent();
    assertGreenPasswordEnrollmentCurrentState(restored, target);
    if (greenPasswordEnrollmentContainerSha256(restored.container)
        !== greenPasswordEnrollmentContainerSha256(originalState.container)) deny();
    result.originalVerified = true;
    return Object.freeze({ status: 'rolled-back', ...result });
  } catch {
    result.failureStep = step;
    throw new GreenPasswordEnrollmentActivationError('rollback-failed',
      Object.freeze({ status: 'rollback-failed', ...result }));
  }
}

export async function runGreenPasswordEnrollmentActivation({
  manifest,
  currentState,
  execute = false,
  confirmations = {},
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  operatorGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
  now = Date.now(),
  operations = null,
} = {}) {
  let lock = null;
  let completed = false;
  let candidateId = null;
  let originalStopped = false;
  let originalRenamed = false;
  let target;
  let originalState;
  let proposedEnvironmentForRollback;
  try {
    if (typeof execute !== 'boolean' || !currentState || typeof currentState !== 'object') deny();
    const inputTarget = assertGreenPasswordEnrollmentActivationManifest(manifest);
    const proposedEnvironment = readProtectedActivationEnvironment(inputTarget, {
      fileSystem, operatorUid, operatorGid, now,
    });
    const invitations = readProtectedInvitationRegistry(inputTarget, {
      fileSystem, operatorUid,
    });
    proposedEnvironmentForRollback = proposedEnvironment;
    const currentBindings = assertGreenPasswordEnrollmentCurrentState(currentState, inputTarget);
    const currentEnvironment = environmentFromContainer(currentState.container?.Config?.Env);
    const prepared = activationEnvironment({
      currentEnvironment, proposedEnvironment,
      invitations, now,
    });
    const createPlan = buildGreenPasswordEnrollmentCreatePlan(inputTarget, currentState.container);
    if (execute) {
      if (confirmations.sourceCommit !== inputTarget.sourceCommit
          || confirmations.currentContainerId !== inputTarget.currentContainerId
          || confirmations.registrySha256 !== inputTarget.registrySha256) deny();
      const operator = requiredOperations(operations);
      target = inputTarget;
      lock = acquireActivationLock(target.lockFile, { fileSystem, operatorUid });
      originalState = await operator.collectCurrent();
      assertGreenPasswordEnrollmentCurrentState(originalState, target);
      const freshEnvironment = readProtectedActivationEnvironment(target, {
        fileSystem, operatorUid, operatorGid, now,
      });
      const freshInvitations = readProtectedInvitationRegistry(target, {
        fileSystem, operatorUid,
      });
      const freshPrepared = activationEnvironment({
        currentEnvironment: environmentFromContainer(originalState.container.Config.Env),
        proposedEnvironment: freshEnvironment,
        invitations: freshInvitations,
        now,
      });
      if (!canonicalEqual(freshPrepared, prepared)) deny();
      const queueImmediatelyBefore = await operator.readQueue();
      if (greenPasswordEnrollmentQueueSha256(queueImmediatelyBefore)
          !== target.currentQueueSha256) deny();
      const backup = Object.freeze({
        schemaVersion: 1, status: 'prepared', sourceCommit: target.sourceCommit,
        currentContainerId: target.currentContainerId,
        currentConfigurationSha256: target.currentConfigurationSha256,
        currentHealthSha256: target.currentHealthSha256,
        currentQueueSha256: target.currentQueueSha256,
        targetImageId: target.targetImageId,
        targetImageDigest: target.targetImageDigest,
      });
      const backupPublication = publishProtectedJson(target.backupFile, backup, {
        fileSystem, operatorUid,
      });
      try {
        await operator.stopExact(target.currentContainerId);
      } catch (stopError) {
        const observed = observeOriginalContainer(
          await operator.inspectExact(target.currentContainerId), target, originalState,
        );
        originalStopped = !observed.running;
        throw stopError;
      }
      originalStopped = true;
      let originalObservation = observeOriginalContainer(
        await operator.inspectExact(target.currentContainerId), target, originalState,
      );
      if (originalObservation.running || originalObservation.name !== target.apiContainer) deny();
      const sealedName = `${target.apiContainer}-sealed-${target.currentContainerId.slice(0, 12)}`;
      try {
        await operator.renameExact(target.currentContainerId, sealedName);
      } catch (renameError) {
        originalObservation = observeOriginalContainer(
          await operator.inspectExact(target.currentContainerId), target, originalState,
        );
        if (originalObservation.running) deny();
        originalRenamed = originalObservation.name !== target.apiContainer;
        throw renameError;
      }
      originalRenamed = true;
      originalObservation = observeOriginalContainer(
        await operator.inspectExact(target.currentContainerId), target, originalState,
      );
      if (originalObservation.running || originalObservation.name !== sealedName) deny();
      const createRequest = Object.freeze({
        args: createPlan.args,
        currentContainerId: target.currentContainerId,
        expectedContainerName: target.apiContainer,
        targetImageId: target.targetImageId,
      });
      let created;
      try {
        created = await operator.createExact(createRequest);
      } catch (createError) {
        const resolved = await operator.resolveCreatedCandidate(createRequest);
        if (resolved !== null && (!/^[a-f0-9]{64}$/u.test(resolved?.containerId ?? '')
          || resolved.containerId === target.currentContainerId)) deny();
        candidateId = resolved?.containerId ?? null;
        throw createError;
      }
      if (!/^[a-f0-9]{64}$/u.test(created?.containerId ?? '')
          || created.containerId === target.currentContainerId) deny();
      candidateId = created.containerId;
      assertCandidateContainerShape(await operator.inspectExact(candidateId), target,
        originalState.container, freshEnvironment,
        { running: false, providerAttached: false });
      await operator.connectExact(candidateId, target.providerNetwork, target.providerNetworkId);
      assertCandidateContainerShape(await operator.inspectExact(candidateId), target,
        originalState.container, freshEnvironment,
        { running: false, providerAttached: true });
      await operator.startExact(candidateId);
      const candidate = await operator.collectCandidate(candidateId, Object.freeze({
        sourceCommit: target.sourceCommit, sourceVersion: target.sourceVersion,
        deadlineMs: 15_000,
      }));
      if (!exactKeys(candidate.sealedOriginal, ['id', 'name', 'running'])
          || candidate.sealedOriginal.id !== target.currentContainerId
          || candidate.sealedOriginal.name !== sealedName
          || candidate.sealedOriginal.running !== false) deny();
      const candidateBindings = assertGreenPasswordEnrollmentCandidateState(
        candidate, target, originalState, freshEnvironment, freshPrepared, now,
      );
      const queueAfterProof = await operator.readQueue();
      if (greenPasswordEnrollmentQueueSha256(queueAfterProof) !== target.currentQueueSha256) deny();
      const evidence = Object.freeze({
        schemaVersion: 1,
        status: 'activated',
        sourceCommit: target.sourceCommit,
        sourceVersion: target.sourceVersion,
        currentContainerId: target.currentContainerId,
        candidateContainerId: candidateBindings.candidateContainerId,
        targetImageId: target.targetImageId,
        targetImageDigest: target.targetImageDigest,
        safeEnvironmentSha256: freshPrepared.safeEnvironmentSha256,
        registrySha256: target.registrySha256,
        currentQueueSha256: target.currentQueueSha256,
        invitationCount: freshPrepared.invitationCount,
        allowedUserCount: freshPrepared.accessAllowedCount,
        notificationAllowedUserCount: freshPrepared.notificationUserCount,
        allowedRecipientCount: freshPrepared.notificationRecipientCount,
        candidateHealthSha256: candidateBindings.candidateHealthSha256,
        readinessDigest: candidateBindings.readinessDigest,
        readinessEvidenceDigest: candidateBindings.evidenceDigest,
        backupSha256: backupPublication.sha256,
        deliveryAuthorized: false,
      });
      const evidencePublication = publishProtectedJson(target.evidenceFile, evidence, {
        fileSystem, operatorUid,
      });
      completed = true;
      const result = Object.freeze({
        ...evidence,
        status: 'activated',
        evidenceSha256: evidencePublication.sha256,
      });
      try {
        releaseActivationLock(lock, fileSystem);
        lock = null;
      } catch {
        throw new GreenPasswordEnrollmentActivationError(
          'activation-complete-lock-release-unconfirmed',
          Object.freeze({
            status: 'activation-complete-lock-release-unconfirmed',
            candidateContainerId: candidateBindings.candidateContainerId,
            evidenceSha256: evidencePublication.sha256,
          }),
        );
      }
      return result;
    }
    return Object.freeze({
      status: 'dry-run', sourceCommit: inputTarget.sourceCommit,
      sourceVersion: inputTarget.sourceVersion,
      currentContainerId: inputTarget.currentContainerId,
      registrySha256: inputTarget.registrySha256,
      targetImageId: inputTarget.targetImageId,
      targetImageDigest: inputTarget.targetImageDigest,
      deliveryAuthorized: false,
      ...currentBindings,
      ...prepared,
    });
  } catch (error) {
    let failure = error instanceof GreenPasswordEnrollmentActivationError
      ? error : new GreenPasswordEnrollmentActivationError();
    if (execute && !completed && originalStopped && target && originalState) {
      try {
        const rollback = await rollbackActivation({
          operations, candidateId, originalStopped, originalRenamed, target, originalState,
          proposedEnvironment: proposedEnvironmentForRollback,
        });
        failure = new GreenPasswordEnrollmentActivationError('rolled-back', rollback);
      } catch (rollbackFailure) {
        failure = rollbackFailure instanceof GreenPasswordEnrollmentActivationError
          ? rollbackFailure : new GreenPasswordEnrollmentActivationError('rollback-failed');
      }
    }
    if (lock !== null) {
      try { releaseActivationLock(lock, fileSystem); } catch {
        if (!completed) failure = new GreenPasswordEnrollmentActivationError(
          'lock-release-unconfirmed', failure.rollback ?? null,
        );
      }
    }
    throw failure;
  }
}
