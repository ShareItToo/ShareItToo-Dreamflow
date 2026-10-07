#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  activationEnvironment,
  deriveProtectedEnvironmentScryptDigest,
  readProtectedActivationFile,
} from './green_password_enrollment_activation.mjs';
import { readProtectedEnrollmentRegistry } from '../src/staging_password_enrollment.js';

const code = 'green_enrollment_candidate_inputs_denied';
const publicationCode = 'green_enrollment_candidate_inputs_publication_unconfirmed';
const registryTarget = '/run/secrets/staging-password-enrollment-registry.json';
const publicOrigin = 'https://staging.shareittoo.com';
const exactTtlSeconds = 24 * 60 * 60;
const digestPattern = /^[a-f0-9]{64}$/u;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const identityKeys = new Set(['APP_BUILD_TIME', 'APP_COMMIT', 'APP_VERSION']);
const requiredPreserved = Object.freeze({
  DEPLOYMENT_ENVIRONMENT: 'test',
  FIREBASE_AUTH_ENABLED: 'true',
  FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
  IDENTITY_VERIFICATION_TRANSPORT: 'memory',
  PAYMENT_TRANSPORT: 'memory',
  PRIVATE_PILOT_V4_ENABLED: 'true',
  PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1',
  PUSH_TRANSPORT: 'memory',
  SIT_LISTING_AI_BUDGET_CENTS: '0',
  SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
  SIT_LISTING_AI_PROVIDER: 'on_device',
  SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
  SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
  STRIPE_LIVEMODE: 'false',
});
const enrollmentKeys = Object.freeze([
  'SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED',
  'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE',
  'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS',
]);

export class GreenEnrollmentCandidateInputsError extends Error {
  constructor(state = 'denied') {
    super(code);
    this.code = code;
    this.state = state;
  }
}

const deny = (state = 'denied') => { throw new GreenEnrollmentCandidateInputsError(state); };
const exactKeys = (value, expected) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === expected.length
  && Object.keys(value).every((key) => expected.includes(key));
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function absoluteFile(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 4096
      || value.includes('\0') || !path.isAbsolute(value) || path.normalize(value) !== value) deny();
  return value;
}

function decodeCanonicalJson(opened, expectedKeys) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
    const value = JSON.parse(text);
    if (!exactKeys(value, expectedKeys)
        || text !== `${JSON.stringify(canonical(value))}\n`) deny();
    return value;
  } catch (error) {
    if (error instanceof GreenEnrollmentCandidateInputsError) throw error;
    deny();
  } finally { opened.bytes.fill(0); }
}

function parseEnvironment(opened) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
    if (!text.endsWith('\n') || text.includes('\r') || text.includes('\0')) deny();
    const entries = text.slice(0, -1).split('\n').map((line) => {
      const separator = line.indexOf('=');
      if (separator < 1) deny();
      const name = line.slice(0, separator);
      if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(name)) deny();
      return Object.freeze({ name, line, value: line.slice(separator + 1) });
    });
    if (new Set(entries.map((entry) => entry.name)).size !== entries.length) deny();
    return Object.freeze(entries);
  } catch (error) {
    if (error instanceof GreenEnrollmentCandidateInputsError) throw error;
    deny();
  } finally { opened.bytes.fill(0); }
}

function environmentObject(entries) {
  return Object.fromEntries(entries.map(({ name, value }) => [name, value]));
}

function environmentBytes(entries, changes) {
  const output = [];
  const seen = new Set();
  for (const entry of entries) {
    if (identityKeys.has(entry.name)) continue;
    if (Object.hasOwn(changes, entry.name)) {
      output.push(`${entry.name}=${changes[entry.name]}`);
      seen.add(entry.name);
    } else output.push(entry.line);
  }
  for (const [name, value] of Object.entries(changes)) {
    if (!seen.has(name) && !entries.some((entry) => entry.name === name)) output.push(`${name}=${value}`);
  }
  return Buffer.from(`${output.join('\n')}\n`);
}

function parseBuiltEnvironment(bytes) {
  const text = bytes.toString('utf8');
  const entries = text.slice(0, -1).split('\n').map((line) => {
    const separator = line.indexOf('=');
    return { name: line.slice(0, separator), value: line.slice(separator + 1) };
  });
  return environmentObject(entries);
}

function canonicalList(value, pattern) {
  if (typeof value !== 'string' || value === '') deny();
  const entries = value.split(',');
  if (entries.some((entry) => !pattern.test(entry))
      || new Set(entries).size !== entries.length) deny();
  return entries;
}

function readJson(filePath, options, expectedKeys) {
  return decodeCanonicalJson(readProtectedActivationFile(filePath, options), expectedKeys);
}

function sameMetadata(left, right) {
  return ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => left[key] === right[key]);
}

function sameParentIdentity(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => left[key] === right[key]);
}

function closeAll(descriptors, fileSystem) {
  let failed = false;
  for (const descriptor of descriptors) {
    try { fileSystem.closeSync(descriptor); } catch { failed = true; }
  }
  return !failed;
}

function openProtectedParent(filePath, fileSystem, operatorUid) {
  const descriptors = [];
  const root = path.parse(filePath).root;
  const paths = [root];
  for (const part of path.relative(root, path.dirname(filePath)).split(path.sep)) {
    paths.push(path.join(paths.at(-1), part));
  }
  try {
    const directories = paths.map((entryPath) => {
      const descriptor = fileSystem.openSync(entryPath,
        fileSystem.constants.O_RDONLY | fileSystem.constants.O_DIRECTORY
          | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK
          | fileSystem.constants.O_CLOEXEC);
      descriptors.push(descriptor);
      const before = fileSystem.fstatSync(descriptor, { bigint: true });
      const linked = fileSystem.lstatSync(entryPath, { bigint: true });
      if ((before.mode & 0o170000n) !== 0o040000n
          || !sameParentIdentity(before, linked)) deny();
      return { path: entryPath, descriptor, before };
    });
    const parent = directories.at(-1).before;
    if (parent.uid !== BigInt(operatorUid) || (parent.mode & 0o7777n) !== 0o700n) deny();
    return { descriptors, directories };
  } catch (error) {
    for (const descriptor of descriptors.reverse()) {
      try { fileSystem.closeSync(descriptor); } catch { /* sanitized denial below */ }
    }
    if (error instanceof GreenEnrollmentCandidateInputsError) throw error;
    deny();
  }
}

function assertParentsStable(directories, fileSystem) {
  for (const entry of directories) {
    const opened = fileSystem.fstatSync(entry.descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(entry.path, { bigint: true });
    if (!sameParentIdentity(opened, entry.before)
        || !sameParentIdentity(linked, entry.before)) deny();
  }
}

function parentBinding(directories) {
  return directories.map((entry) => Object.freeze({ path: entry.path, metadata: entry.before }));
}

function sameParentBinding(directories, expected) {
  return directories.length === expected.length && directories.every((entry, index) => (
    entry.path === expected[index].path
    && sameParentIdentity(entry.before, expected[index].metadata)
  ));
}

function removeExactPublishedFile(filePath, binding, { fileSystem, operatorUid }) {
  let chain;
  let removed = false;
  let confirmed = false;
  try {
    chain = openProtectedParent(filePath, fileSystem, operatorUid);
    if (!sameParentBinding(chain.directories, binding.parents)) deny();
    assertParentsStable(chain.directories, fileSystem);
    const linked = fileSystem.lstatSync(filePath, { bigint: true });
    if (!sameMetadata(binding.metadata, linked)) deny();
    fileSystem.unlinkSync(filePath);
    removed = true;
    fileSystem.fsyncSync(chain.directories.at(-1).descriptor);
    assertParentsStable(chain.directories, fileSystem);
    try {
      fileSystem.lstatSync(filePath, { bigint: true });
      deny();
    } catch (error) {
      if (error instanceof GreenEnrollmentCandidateInputsError || error?.code !== 'ENOENT') throw error;
    }
    confirmed = true;
  } catch { confirmed = false; }
  const closed = chain ? closeAll([...chain.descriptors].reverse(), fileSystem) : true;
  return Object.freeze({ confirmed: confirmed && closed, removed });
}

function publish(filePath, bytes, { fileSystem, operatorUid }) {
  absoluteFile(filePath);
  const chain = openProtectedParent(filePath, fileSystem, operatorUid);
  let descriptor;
  let createdMetadata;
  let exactMetadata;
  let operationFailed = false;
  try {
    assertParentsStable(chain.directories, fileSystem);
    descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT | fileSystem.constants.O_EXCL
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_CLOEXEC, 0o600);
    createdMetadata = fileSystem.fstatSync(descriptor, { bigint: true });
    const linked = fileSystem.lstatSync(filePath, { bigint: true });
    if ((createdMetadata.mode & 0o170000n) !== 0o100000n
        || !sameMetadata(createdMetadata, linked)
        || createdMetadata.nlink !== 1n || createdMetadata.uid !== BigInt(operatorUid)
        || (createdMetadata.mode & 0o7777n) !== 0o600n || createdMetadata.size !== 0n) deny();
    let offset = 0;
    while (offset < bytes.length) {
      const written = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (written < 1) deny();
      offset += written;
    }
    fileSystem.fsyncSync(descriptor);
    exactMetadata = fileSystem.fstatSync(descriptor, { bigint: true });
    const linkedAfter = fileSystem.lstatSync(filePath, { bigint: true });
    if (!sameMetadata(exactMetadata, linkedAfter)
        || !sameParentIdentity(createdMetadata, exactMetadata)
        || exactMetadata.nlink !== createdMetadata.nlink
        || exactMetadata.size !== BigInt(bytes.length)) deny();
    fileSystem.fsyncSync(chain.directories.at(-1).descriptor);
    assertParentsStable(chain.directories, fileSystem);
    if (!sameMetadata(exactMetadata, fileSystem.lstatSync(filePath, { bigint: true }))) deny();
  } catch { operationFailed = true; }

  if (createdMetadata !== undefined && exactMetadata === undefined) {
    try {
      const opened = fileSystem.fstatSync(descriptor, { bigint: true });
      const linked = fileSystem.lstatSync(filePath, { bigint: true });
      if (!sameMetadata(opened, linked) || !sameParentIdentity(createdMetadata, opened)
          || opened.nlink !== createdMetadata.nlink) operationFailed = true;
      else exactMetadata = opened;
    } catch { operationFailed = true; }
  }

  const closed = closeAll([
    ...(descriptor === undefined ? [] : [descriptor]),
    ...[...chain.descriptors].reverse(),
  ], fileSystem);
  if (!closed) operationFailed = true;
  const binding = exactMetadata === undefined ? undefined : Object.freeze({
    metadata: exactMetadata,
    parents: Object.freeze(parentBinding(chain.directories)),
  });
  if (operationFailed) {
    if (createdMetadata === undefined) {
      throw new GreenEnrollmentCandidateInputsError(closed ? publicationCode : 'rollback-unconfirmed');
    }
    const cleanup = binding === undefined
      ? Object.freeze({ confirmed: false, removed: false })
      : removeExactPublishedFile(filePath, binding, { fileSystem, operatorUid });
    if (!closed || !cleanup.confirmed) {
      throw new GreenEnrollmentCandidateInputsError('rollback-unconfirmed');
    }
    throw new GreenEnrollmentCandidateInputsError(publicationCode);
  }
  return binding;
}

export function buildGreenEnrollmentCandidateInputs({
  currentEnvironmentFile,
  requestFile,
  allowlistFile,
  runtimeIdentityFile,
  serverRecordFile,
  registryFile,
  pretransitionOutputFile,
  activationOutputFile,
  targetUid,
  targetGid,
  pretransitionScryptSalt,
  activationScryptSalt,
  execute = false,
  now = Date.now,
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  operatorGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
} = {}) {
  let pretransitionBytes;
  let activationBytes;
  try {
    if (typeof execute !== 'boolean' || typeof now !== 'function'
        || ![operatorUid, operatorGid, targetUid, targetGid]
          .every((value) => Number.isSafeInteger(value) && value >= 0)
        || ![pretransitionScryptSalt, activationScryptSalt]
          .every((value) => typeof value === 'string' && digestPattern.test(value)
            && !/^([a-f0-9])\1{63}$/u.test(value))
        || pretransitionScryptSalt === activationScryptSalt
        || path.basename(absoluteFile(serverRecordFile)) !== 'server-record.json'
        || new Set([currentEnvironmentFile, requestFile, allowlistFile, runtimeIdentityFile,
          serverRecordFile, registryFile, pretransitionOutputFile, activationOutputFile]
          .map(absoluteFile)).size !== 8) deny();

    const currentEntries = parseEnvironment(readProtectedActivationFile(currentEnvironmentFile, {
      fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
    }));
    const current = environmentObject(currentEntries);
    if (Object.entries(requiredPreserved).some(([name, value]) => current[name] !== value)
        || current.APP_PUBLIC_URL !== 'http://shareittoo-staging-api:8080'
        || current.MAIL_TRANSPORT !== 'memory'
        || ![undefined, 'false'].includes(current.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED)
        || ![undefined, ''].includes(current.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE)
        || ![undefined, ''].includes(current.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS)) deny();

    const request = readJson(requestFile, {
      fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
    }, ['email', 'ttlSeconds', 'userId']);
    if (typeof request.email !== 'string' || request.email !== request.email.toLowerCase()
        || !emailPattern.test(request.email) || !principalPattern.test(request.userId)
        || request.ttlSeconds !== exactTtlSeconds) deny('ttl-policy');
    const currentAccess = canonicalList(current.SIT_STAGING_ALLOWED_USER_IDS, principalPattern);
    const currentNotificationUsers = canonicalList(
      current.SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS, principalPattern,
    );
    const currentRecipients = canonicalList(
      current.SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS, emailPattern,
    );
    if (currentRecipients.some((email) => email !== email.toLowerCase())
        || currentAccess.includes(request.userId)
        || currentNotificationUsers.includes(request.userId)) deny();
    const proposedAccess = [...currentAccess, request.userId];
    const proposedNotificationUsers = [...currentNotificationUsers, request.userId];
    const proposedRecipients = currentRecipients.includes(request.email)
      ? currentRecipients : [...currentRecipients, request.email];

    const allowlist = readJson(allowlistFile, {
      fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
    }, ['allowedUserIds', 'schema', 'version']);
    if (allowlist.schema !== 'sit-staging-access-allowlist' || allowlist.version !== 1
        || JSON.stringify(allowlist.allowedUserIds) !== JSON.stringify(proposedAccess)) deny();
    const identity = readJson(runtimeIdentityFile, {
      fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
    }, ['gid', 'schema', 'uid', 'version']);
    if (identity.schema !== 'sit-staging-runtime-identity-readback' || identity.version !== 1
        || identity.uid !== targetUid || identity.gid !== targetGid
        || targetUid < 1 || targetGid < 1) deny();
    const server = readJson(serverRecordFile, {
      fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
    }, ['emailDigest', 'expiresAt', 'issuedAt', 'schema', 'tokenDigest', 'userId', 'version']);
    const issued = Date.parse(server.issuedAt);
    const expires = Date.parse(server.expiresAt);
    const currentTime = now();
    if (server.schema !== 'sit-staging-password-invitation' || server.version !== 1
        || !digestPattern.test(server.tokenDigest) || !digestPattern.test(server.emailDigest)
        || server.userId !== request.userId
        || server.emailDigest !== sha256(`${server.tokenDigest}\n${request.email}`)
        || !Number.isSafeInteger(issued) || !Number.isSafeInteger(expires)
        || new Date(issued).toISOString() !== server.issuedAt
        || new Date(expires).toISOString() !== server.expiresAt
        || issued > currentTime || expires <= currentTime
        || expires - issued !== exactTtlSeconds * 1000) deny();

    const invitations = readProtectedEnrollmentRegistry(registryFile, {
      fileSystem, ownerUid: targetUid,
    });
    const registryOpened = readProtectedActivationFile(registryFile, {
      fileSystem, expectedUid: targetUid, expectedGid: targetGid, operatorUid,
    });
    let registrySha256;
    try {
      const canonicalRegistry = Buffer.from(`${JSON.stringify(invitations)}\n`);
      if (!registryOpened.bytes.equals(canonicalRegistry) || invitations.length !== 1
          || JSON.stringify(invitations[0]) !== JSON.stringify(Object.fromEntries(
            Object.entries(server).filter(([name]) => !['schema', 'version'].includes(name)),
          ))) deny();
      registrySha256 = sha256(registryOpened.bytes);
    } finally { registryOpened.bytes.fill(0); }

    const pretransitionChanges = Object.fromEntries(enrollmentKeys.map((name) => [name, '']));
    pretransitionChanges.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED = 'false';
    pretransitionBytes = environmentBytes(currentEntries, pretransitionChanges);
    const activationChanges = {
      ...pretransitionChanges,
      APP_PUBLIC_URL: publicOrigin,
      MAIL_TRANSPORT: 'smtp',
      SIT_STAGING_ALLOWED_USER_IDS: proposedAccess.join(','),
      SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: proposedNotificationUsers.join(','),
      SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: proposedRecipients.join(','),
      SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true',
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: registryTarget,
    };
    activationBytes = environmentBytes(currentEntries, activationChanges);
    const pretransition = parseBuiltEnvironment(pretransitionBytes);
    const proposed = parseBuiltEnvironment(activationBytes);
    if ([pretransition, proposed].some((environment) => [...identityKeys]
      .some((name) => Object.hasOwn(environment, name)))) deny();
    activationEnvironment({
      currentEnvironment: pretransition, proposedEnvironment: proposed,
      invitations, now: currentTime,
    });

    const result = Object.freeze({
      status: execute ? 'created' : 'dry-run',
      requiresPretransition:
        current.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED !== 'false'
        || current.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE !== ''
        || current.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS !== '',
      ttlSeconds: exactTtlSeconds,
      invitationCount: invitations.length,
      currentAccessCount: currentAccess.length,
      proposedAccessCount: proposedAccess.length,
      currentNotificationUserCount: currentNotificationUsers.length,
      proposedNotificationUserCount: proposedNotificationUsers.length,
      currentRecipientCount: currentRecipients.length,
      proposedRecipientCount: proposedRecipients.length,
      registrySha256,
      pretransitionScryptSalt,
      pretransitionScryptDigest:
        deriveProtectedEnvironmentScryptDigest(pretransitionBytes, pretransitionScryptSalt),
      activationScryptSalt,
      activationScryptDigest:
        deriveProtectedEnvironmentScryptDigest(activationBytes, activationScryptSalt),
    });
    if (!execute) return result;

    let preBinding;
    try {
      preBinding = publish(pretransitionOutputFile, pretransitionBytes,
        { fileSystem, operatorUid });
      publish(activationOutputFile, activationBytes, { fileSystem, operatorUid });
      return result;
    } catch (error) {
      if (preBinding && !removeExactPublishedFile(pretransitionOutputFile, preBinding,
        { fileSystem, operatorUid }).confirmed) {
        deny('rollback-unconfirmed');
      }
      if (error instanceof GreenEnrollmentCandidateInputsError) throw error;
      deny(publicationCode);
    }
  } catch (error) {
    if (error instanceof GreenEnrollmentCandidateInputsError) throw error;
    deny();
  } finally {
    pretransitionBytes?.fill(0);
    activationBytes?.fill(0);
  }
}

export const GREEN_ENROLLMENT_EXACT_TTL_SECONDS = exactTtlSeconds;
