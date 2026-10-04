#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readProtectedStagingPasswordEnrollmentRegistry,
} from '../src/staging_password_enrollment.js';

const failureCode = 'staging_password_registry_import_failed';
const digestPattern = /^[a-f0-9]{64}$/u;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const maximumLifetimeMs = 24 * 60 * 60 * 1000;
const maximumBytes = 64 * 1024;
const registryKeys = Object.freeze([
  'emailDigest', 'expiresAt', 'issuedAt', 'tokenDigest', 'userId',
]);
const serverRecordKeys = Object.freeze([
  'emailDigest', 'expiresAt', 'issuedAt', 'schema', 'tokenDigest', 'userId', 'version',
]);
const allowlistKeys = Object.freeze(['allowedUserIds', 'schema', 'version']);
const runtimeIdentityKeys = Object.freeze(['gid', 'schema', 'uid', 'version']);

export class StagingPasswordRegistryImportError extends Error {
  constructor() {
    super(failureCode);
    this.code = failureCode;
  }
}

export class StagingPasswordRegistryPublicationUnconfirmed extends StagingPasswordRegistryImportError {
  constructor(result) {
    super();
    this.result = Object.freeze({ ...result, status: 'publication-unconfirmed' });
  }
}

const fail = () => { throw new StagingPasswordRegistryImportError(); };
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileType = (metadata) => metadata.mode & 0o170000n;
const regularFile = (metadata) => fileType(metadata) === 0o100000n;
const directory = (metadata) => fileType(metadata) === 0o040000n;
const exactKeys = (value, expected) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === expected.length
  && Object.keys(value).every((key) => expected.includes(key));
const sameFileMetadata = (left, right) => [
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
].every((key) => left[key] === right[key]);
const sameDirectoryMetadata = (left, right, protectedParent) => protectedParent
  ? sameFileMetadata(left, right)
  : ['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => left[key] === right[key]);
const sameIdentity = (left, right) => [
  'dev', 'ino', 'mode', 'uid', 'gid', 'size',
].every((key) => left[key] === right[key]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonicalValue(value[key])]));
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`);
}

function canonicalPath(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 4096
      || value.includes('\0') || !path.isAbsolute(value)
      || path.normalize(value) !== value) fail();
  return value;
}

function openDirectoryChain(directoryPath, fileSystem, descriptors, operatorUid) {
  canonicalPath(directoryPath);
  if (directoryPath === path.parse(directoryPath).root) fail();
  const paths = [path.parse(directoryPath).root];
  for (const part of path.relative(paths[0], directoryPath).split(path.sep)) {
    paths.push(path.join(paths.at(-1), part));
  }
  return paths.map((entryPath, index) => {
    const descriptor = fileSystem.openSync(entryPath,
      fileSystem.constants.O_RDONLY | fileSystem.constants.O_DIRECTORY
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK
        | fileSystem.constants.O_CLOEXEC);
    descriptors.push(descriptor);
    const before = fileSystem.fstatSync(descriptor, { bigint: true });
    const pathBefore = fileSystem.lstatSync(entryPath, { bigint: true });
    const protectedParent = index === paths.length - 1;
    if (!directory(before)
        || !sameDirectoryMetadata(before, pathBefore, protectedParent)
        || (protectedParent && (before.uid !== BigInt(operatorUid)
          || (before.mode & 0o7777n) !== 0o700n || before.nlink < 1n))) fail();
    return Object.freeze({
      path: entryPath, descriptor, before, protectedParent,
    });
  });
}

function assertDirectoryChainUnchanged(directories, fileSystem, {
  allowProtectedParentContentMutation = false,
} = {}) {
  for (const entry of directories) {
    const requireExactMetadata = entry.protectedParent
      && !allowProtectedParentContentMutation;
    if (!sameDirectoryMetadata(entry.before,
      fileSystem.fstatSync(entry.descriptor, { bigint: true }), requireExactMetadata)
        || !sameDirectoryMetadata(entry.before,
          fileSystem.lstatSync(entry.path, { bigint: true }), requireExactMetadata)) fail();
  }
}

function closeDescriptors(descriptors, fileSystem) {
  let closeFailed = false;
  for (const descriptor of descriptors.reverse()) {
    try { fileSystem.closeSync(descriptor); } catch { closeFailed = true; }
  }
  return closeFailed;
}

function metadataBinding(metadata, parentMetadata) {
  const fileKeys = ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs'];
  const parentKeys = ['dev', 'ino', 'mode', 'uid', 'gid'];
  return sha256(JSON.stringify({
    file: Object.fromEntries(fileKeys.map((key) => [key, String(metadata[key])])),
    parent: Object.fromEntries(parentKeys.map((key) => [key, String(parentMetadata[key])])),
  }));
}

function readProtectedFile(filePath, {
  fileSystem,
  operatorUid,
  expectedUid = operatorUid,
  expectedGid = null,
  minBytes = 2,
  maxBytes = maximumBytes,
} = {}) {
  const descriptors = [];
  let result;
  let failure;
  try {
    canonicalPath(filePath);
    const directories = openDirectoryChain(path.dirname(filePath),
      fileSystem, descriptors, operatorUid);
    const parent = directories.at(-1).before;
    const descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_RDONLY | fileSystem.constants.O_NOFOLLOW
        | fileSystem.constants.O_NONBLOCK | fileSystem.constants.O_CLOEXEC);
    descriptors.push(descriptor);
    const before = fileSystem.fstatSync(descriptor, { bigint: true });
    const pathBefore = fileSystem.lstatSync(filePath, { bigint: true });
    if (!regularFile(before) || !sameFileMetadata(before, pathBefore)
        || before.nlink !== 1n || (before.mode & 0o7777n) !== 0o600n
        || before.uid !== BigInt(expectedUid)
        || (expectedGid !== null && before.gid !== BigInt(expectedGid))
        || before.size < BigInt(minBytes) || before.size > BigInt(maxBytes)) fail();
    assertDirectoryChainUnchanged(directories, fileSystem);
    const content = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < content.length) {
      const count = fileSystem.readSync(descriptor, content, offset,
        content.length - offset, offset);
      if (count <= 0) fail();
      offset += count;
    }
    if (fileSystem.readSync(descriptor, Buffer.alloc(1), 0, 1, content.length) !== 0) fail();
    const after = fileSystem.fstatSync(descriptor, { bigint: true });
    const pathAfter = fileSystem.lstatSync(filePath, { bigint: true });
    if (!sameFileMetadata(before, after) || !sameFileMetadata(after, pathAfter)) fail();
    assertDirectoryChainUnchanged(directories, fileSystem);
    result = Object.freeze({
      bytes: content,
      digest: sha256(content),
      binding: metadataBinding(before, parent),
    });
  } catch {
    failure = new StagingPasswordRegistryImportError();
  } finally {
    if (closeDescriptors(descriptors, fileSystem) && failure === undefined) {
      failure = new StagingPasswordRegistryImportError();
    }
  }
  if (failure !== undefined) throw failure;
  return result;
}

function parseCanonicalJson(input) {
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
    value = JSON.parse(text);
    if (!input.bytes.equals(canonicalBytes(value))) fail();
  } catch {
    fail();
  }
  return value;
}

function validateRuntimeIdentity(value, targetUid, targetGid, operatorUid, operatorGid) {
  if (!exactKeys(value, runtimeIdentityKeys)
      || value.schema !== 'sit-staging-runtime-identity-readback'
      || value.version !== 1
      || !Number.isSafeInteger(value.uid) || value.uid <= 0 || value.uid > 2_147_483_647
      || !Number.isSafeInteger(value.gid) || value.gid <= 0 || value.gid > 2_147_483_647
      || !Number.isSafeInteger(targetUid) || targetUid <= 0 || targetUid > 2_147_483_647
      || !Number.isSafeInteger(targetGid) || targetGid <= 0 || targetGid > 2_147_483_647
      || value.uid !== targetUid || value.gid !== targetGid
      || (operatorUid !== 0 && (targetUid !== operatorUid || targetGid !== operatorGid))) fail();
}

function validateAllowlist(value) {
  if (!exactKeys(value, allowlistKeys)
      || value.schema !== 'sit-staging-access-allowlist' || value.version !== 1
      || !Array.isArray(value.allowedUserIds)
      || value.allowedUserIds.length < 1 || value.allowedUserIds.length > 1000
      || value.allowedUserIds.some((entry) => typeof entry !== 'string'
        || !principalPattern.test(entry))
      || new Set(value.allowedUserIds).size !== value.allowedUserIds.length) fail();
  return new Set(value.allowedUserIds);
}

function validateInvitation(record, allowed, currentTime) {
  if (!exactKeys(record, registryKeys)
      || typeof record.tokenDigest !== 'string' || !digestPattern.test(record.tokenDigest)
      || typeof record.emailDigest !== 'string' || !digestPattern.test(record.emailDigest)
      || typeof record.userId !== 'string' || !principalPattern.test(record.userId)
      || !allowed.has(record.userId)) fail();
  const issued = Date.parse(record.issuedAt);
  const expiry = Date.parse(record.expiresAt);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expiry)
      || new Date(issued).toISOString() !== record.issuedAt
      || new Date(expiry).toISOString() !== record.expiresAt
      || issued > currentTime || expiry <= currentTime || expiry <= issued
      || expiry - issued > maximumLifetimeMs) fail();
  return Object.freeze({ ...record });
}

function validateUnique(records) {
  for (const key of ['tokenDigest', 'emailDigest', 'userId']) {
    if (new Set(records.map((record) => record[key])).size !== records.length) fail();
  }
}

function stablePreparationEqual(left, right) {
  return left.contentSha256 === right.contentSha256
    && JSON.stringify(left.records) === JSON.stringify(right.records)
    && JSON.stringify(left.inputBindings) === JSON.stringify(right.inputBindings);
}

function prepareImport({
  serverRecordFile,
  allowlistFile,
  runtimeIdentityFile,
  baseFile,
  expectedBaseSha256,
  targetUid,
  targetGid,
  now,
  fileSystem,
  operatorUid,
  operatorGid,
}) {
  if (path.basename(canonicalPath(serverRecordFile)) !== 'server-record.json') fail();
  canonicalPath(allowlistFile);
  canonicalPath(runtimeIdentityFile);
  const paths = [serverRecordFile, allowlistFile, runtimeIdentityFile];
  if (baseFile !== null) paths.push(canonicalPath(baseFile));
  if (new Set(paths).size !== paths.length) fail();

  const identityInput = readProtectedFile(runtimeIdentityFile, {
    fileSystem, operatorUid, expectedGid: operatorGid,
  });
  const identity = parseCanonicalJson(identityInput);
  validateRuntimeIdentity(identity, targetUid, targetGid, operatorUid, operatorGid);

  const allowlistInput = readProtectedFile(allowlistFile, {
    fileSystem, operatorUid, expectedGid: operatorGid,
  });
  const allowed = validateAllowlist(parseCanonicalJson(allowlistInput));

  const serverInput = readProtectedFile(serverRecordFile, {
    fileSystem, operatorUid, expectedGid: operatorGid,
  });
  const envelope = parseCanonicalJson(serverInput);
  if (!exactKeys(envelope, serverRecordKeys)
      || envelope.schema !== 'sit-staging-password-invitation'
      || envelope.version !== 1) fail();
  const { schema: ignoredSchema, version: ignoredVersion, ...unwrapped } = envelope;
  void ignoredSchema;
  void ignoredVersion;
  const currentTime = now();
  if (!Number.isSafeInteger(currentTime)) fail();

  const inputBindings = {
    runtimeIdentity: `${identityInput.digest}:${identityInput.binding}`,
    allowlist: `${allowlistInput.digest}:${allowlistInput.binding}`,
    serverRecord: `${serverInput.digest}:${serverInput.binding}`,
  };
  let records = [];
  if (baseFile !== null) {
    if (!digestPattern.test(expectedBaseSha256 ?? '')) fail();
    const baseInput = readProtectedFile(baseFile, {
      fileSystem, operatorUid, expectedUid: targetUid, expectedGid: targetGid,
    });
    if (baseInput.digest !== expectedBaseSha256) fail();
    let baseRecords;
    try {
      baseRecords = readProtectedStagingPasswordEnrollmentRegistry(baseFile, {
        fileSystem, ownerUid: targetUid,
      });
    } catch {
      fail();
    }
    if (!baseInput.bytes.equals(canonicalBytes(baseRecords))) fail();
    records = baseRecords.map((record) => validateInvitation(record, allowed, currentTime));
    inputBindings.base = `${baseInput.digest}:${baseInput.binding}`;
  } else if (expectedBaseSha256 !== null) fail();

  records.push(validateInvitation(unwrapped, allowed, currentTime));
  if (records.length > 20) fail();
  validateUnique(records);
  const outputBytes = canonicalBytes(records);
  return Object.freeze({
    records: Object.freeze(records),
    outputBytes,
    contentSha256: sha256(outputBytes),
    inputBindings: Object.freeze(inputBindings),
  });
}

function resultFor(status, prepared, outputFile) {
  return Object.freeze({
    status,
    count: prepared.records.length,
    contentSha256: prepared.contentSha256,
    pathSha256: sha256(outputFile),
  });
}

function absent(filePath, fileSystem) {
  try {
    fileSystem.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
  }
  fail();
}

function validateOutputPath(outputFile, inputs) {
  canonicalPath(outputFile);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(path.basename(outputFile))
      || inputs.includes(outputFile)) fail();
}

function verifyOutputParent(outputFile, fileSystem, operatorUid) {
  const descriptors = [];
  let failure;
  try {
    const directories = openDirectoryChain(path.dirname(outputFile),
      fileSystem, descriptors, operatorUid);
    assertDirectoryChainUnchanged(directories, fileSystem);
    absent(outputFile, fileSystem);
  } catch {
    failure = new StagingPasswordRegistryImportError();
  } finally {
    if (closeDescriptors(descriptors, fileSystem) && failure === undefined) {
      failure = new StagingPasswordRegistryImportError();
    }
  }
  if (failure !== undefined) throw failure;
}

function executeImport(options, first) {
  const {
    outputFile, fileSystem, operatorUid, operatorGid, targetUid, targetGid,
    randomBytesImpl,
  } = options;
  const parentDescriptors = [];
  let directories;
  let lockDescriptor;
  let lockMetadata;
  let tempDescriptor;
  let tempMetadata;
  let tempPath;
  let published = false;
  let durable = false;
  let result;
  let failure;
  const lockPath = `${outputFile}.import.lock`;
  try {
    directories = openDirectoryChain(path.dirname(outputFile),
      fileSystem, parentDescriptors, operatorUid);
    const parentDescriptor = directories.at(-1).descriptor;
    absent(outputFile, fileSystem);
    lockDescriptor = fileSystem.openSync(lockPath,
      fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT
        | fileSystem.constants.O_EXCL | fileSystem.constants.O_NOFOLLOW
        | fileSystem.constants.O_CLOEXEC, 0o600);
    fileSystem.fchmodSync(lockDescriptor, 0o600);
    fileSystem.fchownSync(lockDescriptor, operatorUid, operatorGid);
    fileSystem.fsyncSync(lockDescriptor);
    lockMetadata = fileSystem.fstatSync(lockDescriptor, { bigint: true });
    if (!regularFile(lockMetadata) || lockMetadata.nlink !== 1n
        || lockMetadata.uid !== BigInt(operatorUid)
        || lockMetadata.gid !== BigInt(operatorGid)
        || (lockMetadata.mode & 0o7777n) !== 0o600n
        || !sameFileMetadata(lockMetadata,
          fileSystem.lstatSync(lockPath, { bigint: true }))) fail();
    assertDirectoryChainUnchanged(directories, fileSystem, {
      allowProtectedParentContentMutation: true,
    });
    absent(outputFile, fileSystem);

    const second = prepareImport(options);
    if (!stablePreparationEqual(first, second)) fail();
    const random = randomBytesImpl(16);
    if (!Buffer.isBuffer(random) || random.length !== 16) fail();
    tempPath = path.join(path.dirname(outputFile),
      `.${path.basename(outputFile)}.import-${random.toString('hex')}.tmp`);
    tempDescriptor = fileSystem.openSync(tempPath,
      fileSystem.constants.O_RDWR | fileSystem.constants.O_CREAT
        | fileSystem.constants.O_EXCL | fileSystem.constants.O_NOFOLLOW
        | fileSystem.constants.O_CLOEXEC, 0o600);
    let written = 0;
    while (written < second.outputBytes.length) {
      const count = fileSystem.writeSync(tempDescriptor, second.outputBytes,
        written, second.outputBytes.length - written, written);
      if (count <= 0) fail();
      written += count;
    }
    fileSystem.fchownSync(tempDescriptor, targetUid, targetGid);
    fileSystem.fchmodSync(tempDescriptor, 0o600);
    fileSystem.fsyncSync(tempDescriptor);
    tempMetadata = fileSystem.fstatSync(tempDescriptor, { bigint: true });
    if (!regularFile(tempMetadata) || tempMetadata.nlink !== 1n
        || tempMetadata.uid !== BigInt(targetUid)
        || tempMetadata.gid !== BigInt(targetGid)
        || (tempMetadata.mode & 0o7777n) !== 0o600n
        || tempMetadata.size !== BigInt(second.outputBytes.length)
        || !sameFileMetadata(tempMetadata,
          fileSystem.lstatSync(tempPath, { bigint: true }))) fail();
    assertDirectoryChainUnchanged(directories, fileSystem, {
      allowProtectedParentContentMutation: true,
    });

    const finalPreparation = prepareImport(options);
    if (!stablePreparationEqual(second, finalPreparation)) fail();
    absent(outputFile, fileSystem);
    fileSystem.linkSync(tempPath, outputFile);
    published = true;
    const linked = fileSystem.lstatSync(outputFile, { bigint: true });
    const tempLinked = fileSystem.lstatSync(tempPath, { bigint: true });
    const descriptorLinked = fileSystem.fstatSync(tempDescriptor, { bigint: true });
    if (!sameIdentity(linked, tempLinked) || !sameIdentity(linked, descriptorLinked)
        || linked.nlink !== 2n || tempLinked.nlink !== 2n || descriptorLinked.nlink !== 2n) fail();
    fileSystem.unlinkSync(tempPath);
    tempPath = null;
    const publishedMetadata = fileSystem.lstatSync(outputFile, { bigint: true });
    const descriptorPublished = fileSystem.fstatSync(tempDescriptor, { bigint: true });
    if (!sameFileMetadata(publishedMetadata, descriptorPublished)
        || publishedMetadata.nlink !== 1n) fail();
    fileSystem.fsyncSync(parentDescriptor);
    durable = true;
    let readback;
    try {
      readback = readProtectedStagingPasswordEnrollmentRegistry(outputFile, {
        fileSystem, ownerUid: targetUid,
      });
    } catch {
      fail();
    }
    if (JSON.stringify(readback) !== JSON.stringify(finalPreparation.records)
        || !sameFileMetadata(descriptorPublished,
          fileSystem.fstatSync(tempDescriptor, { bigint: true }))
        || !sameFileMetadata(descriptorPublished,
          fileSystem.lstatSync(outputFile, { bigint: true }))) fail();
    assertDirectoryChainUnchanged(directories, fileSystem, {
      allowProtectedParentContentMutation: true,
    });
    result = resultFor('created', finalPreparation, outputFile);
  } catch {
    failure = new StagingPasswordRegistryImportError();
  } finally {
    try {
      if (!published && tempMetadata !== undefined) {
        const outputMetadata = (() => {
          try { return fileSystem.lstatSync(outputFile, { bigint: true }); } catch { return null; }
        })();
        if (outputMetadata && sameIdentity(outputMetadata, tempMetadata)) published = true;
      }
      if (tempPath !== undefined && tempPath !== null) {
        const current = fileSystem.lstatSync(tempPath, { bigint: true });
        if (tempMetadata === undefined || !sameIdentity(current, tempMetadata)) fail();
        fileSystem.unlinkSync(tempPath);
        tempPath = null;
      }
    } catch {
      failure = new StagingPasswordRegistryImportError();
    }
    if (lockDescriptor !== undefined) {
      try {
        const current = fileSystem.lstatSync(lockPath, { bigint: true });
        const opened = fileSystem.fstatSync(lockDescriptor, { bigint: true });
        if (lockMetadata === undefined || !sameFileMetadata(current, opened)
            || !sameFileMetadata(lockMetadata, opened)) fail();
        fileSystem.unlinkSync(lockPath);
        if (directories) fileSystem.fsyncSync(directories.at(-1).descriptor);
      } catch {
        failure = new StagingPasswordRegistryImportError();
      }
    }
    const descriptors = [...parentDescriptors, lockDescriptor, tempDescriptor]
      .filter((value) => value !== undefined);
    if (closeDescriptors(descriptors, fileSystem)) {
      failure = new StagingPasswordRegistryImportError();
    }
  }
  if (failure !== undefined) {
    if (published) throw new StagingPasswordRegistryPublicationUnconfirmed(
      resultFor(durable ? 'created' : 'publication-unconfirmed', first, outputFile),
    );
    throw failure;
  }
  return result;
}

export function importStagingPasswordEnrollmentRegistry({
  serverRecordFile,
  allowlistFile,
  runtimeIdentityFile,
  outputFile,
  targetUid,
  targetGid,
  baseFile = null,
  expectedBaseSha256 = null,
  execute = false,
  now = Date.now,
  randomBytesImpl = crypto.randomBytes,
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  operatorGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
} = {}) {
  try {
    if (typeof execute !== 'boolean' || typeof now !== 'function'
        || typeof randomBytesImpl !== 'function'
        || !Number.isSafeInteger(operatorUid) || operatorUid < 0
        || !Number.isSafeInteger(operatorGid) || operatorGid < 0) fail();
    validateOutputPath(outputFile, [
      serverRecordFile, allowlistFile, runtimeIdentityFile, baseFile,
    ].filter((value) => value !== null));
    if ((baseFile === null) !== (expectedBaseSha256 === null)) fail();
    const options = {
      serverRecordFile, allowlistFile, runtimeIdentityFile, outputFile,
      targetUid, targetGid, baseFile, expectedBaseSha256, execute, now,
      randomBytesImpl, fileSystem, operatorUid, operatorGid,
    };
    const prepared = prepareImport(options);
    if (!execute) {
      verifyOutputParent(outputFile, fileSystem, operatorUid);
      return resultFor('dry-run', prepared, outputFile);
    }
    return executeImport(options, prepared);
  } catch (error) {
    if (error instanceof StagingPasswordRegistryPublicationUnconfirmed) throw error;
    throw new StagingPasswordRegistryImportError();
  }
}

function parseInteger(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(value)) fail();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail();
  return number;
}

function parseArguments(argv) {
  const values = {};
  const allowed = new Set([
    '--server-record', '--allowlist', '--runtime-identity', '--output',
    '--target-uid', '--target-gid', '--base', '--expected-base-sha256',
  ]);
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--execute') {
      if (execute) fail();
      execute = true;
      continue;
    }
    if (!allowed.has(name) || Object.hasOwn(values, name)) fail();
    const value = argv[index += 1];
    if (typeof value !== 'string' || value.length < 1 || value.startsWith('--')) fail();
    values[name] = value;
  }
  for (const required of [
    '--server-record', '--allowlist', '--runtime-identity', '--output',
    '--target-uid', '--target-gid',
  ]) if (!Object.hasOwn(values, required)) fail();
  if (Object.hasOwn(values, '--base') !== Object.hasOwn(values, '--expected-base-sha256')) fail();
  return {
    serverRecordFile: values['--server-record'],
    allowlistFile: values['--allowlist'],
    runtimeIdentityFile: values['--runtime-identity'],
    outputFile: values['--output'],
    targetUid: parseInteger(values['--target-uid']),
    targetGid: parseInteger(values['--target-gid']),
    baseFile: values['--base'] ?? null,
    expectedBaseSha256: values['--expected-base-sha256'] ?? null,
    execute,
  };
}

export function runStagingPasswordEnrollmentRegistryImportCli(argv) {
  return importStagingPasswordEnrollmentRegistry(parseArguments(argv));
}

async function main() {
  try {
    const result = runStagingPasswordEnrollmentRegistryImportCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof StagingPasswordRegistryPublicationUnconfirmed) {
      process.stdout.write(`${JSON.stringify(error.result)}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write('{"status":"denied"}\n');
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) await main();
