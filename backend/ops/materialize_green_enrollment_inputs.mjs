#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { readProtectedActivationFile } from './green_password_enrollment_activation.mjs';

const execFileAsync = promisify(execFile);
const denialCode = 'green_enrollment_materialization_denied';
const exactConfirmation = 'MATERIALIZE-GREEN-ENROLLMENT-INPUTS';
const exactTtlSeconds = 86_400;
const maximumCommandBytes = 1024 * 1024;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const containerPattern = /^[a-f0-9]{64}$/u;
const imagePattern = /^[^\s@]+@sha256:[a-f0-9]{64}$/u;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const uuidV4Pattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const canonicalEmailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u;
const outputNames = Object.freeze([
  'current.env', 'request.json', 'allowlist.json', 'runtime-identity.json',
]);
const runtimeProbeSource = 'process.stdout.write(JSON.stringify({gid:process.getgid(),uid:process.getuid()})+"\\n")';

export class GreenEnrollmentMaterializationError extends Error {
  constructor(state = 'denied') {
    super(denialCode);
    this.code = denialCode;
    this.state = state;
  }
}

const deny = (state = 'denied') => { throw new GreenEnrollmentMaterializationError(state); };
const plain = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => plain(value)
  && Object.keys(value).length === keys.length
  && Object.keys(value).every((key) => keys.includes(key));
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
const sameFile = (left, right) => [
  'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
].every((key) => left[key] === right[key]);
const sameDirectory = (left, right) => [
  'dev', 'ino', 'mode', 'uid', 'gid',
].every((key) => left[key] === right[key]);

function absolutePath(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 4096
      || value.includes('\0') || !path.isAbsolute(value) || path.normalize(value) !== value) deny();
  return value;
}

function parseJsonLine(value) {
  try {
    if (typeof value !== 'string' || value.length < 2 || value.includes('\0')
        || value.includes('\r')) deny();
    const line = value.endsWith('\n') ? value.slice(0, -1) : value;
    if (line === '' || line.includes('\n')) deny();
    return JSON.parse(line);
  } catch (error) {
    if (error instanceof GreenEnrollmentMaterializationError) throw error;
    deny();
  }
}

function parseEnvironment(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 512) deny();
  const parsed = entries.map((line) => {
    if (typeof line !== 'string' || line.includes('\0') || line.includes('\r')
        || line.includes('\n') || Buffer.byteLength(line) > 16 * 1024) deny();
    const separator = line.indexOf('=');
    if (separator < 1) deny();
    const name = line.slice(0, separator);
    if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(name)) deny();
    return Object.freeze({ line, name, value: line.slice(separator + 1) });
  });
  if (new Set(parsed.map(({ name }) => name)).size !== parsed.length) deny();
  return Object.freeze(parsed);
}

function listFrom(environment, name, pattern) {
  const value = environment.get(name);
  if (typeof value !== 'string' || value === '') deny();
  const entries = value.split(',');
  if (entries.some((entry) => !pattern.test(entry))
      || new Set(entries).size !== entries.length) deny();
  return Object.freeze(entries);
}

function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || value !== value.trim().toLowerCase()
      || !canonicalEmailPattern.test(value)) return false;
  const local = value.split('@')[0];
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.')
    && !local.includes('..');
}

function readRecipient(filePath, { fileSystem, operatorUid, operatorGid }) {
  const opened = readProtectedActivationFile(filePath, {
    fileSystem, expectedUid: operatorUid, expectedGid: operatorGid, operatorUid,
    maximumBytes: 1024,
  });
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
    const value = JSON.parse(text);
    if (!exactKeys(value, ['email']) || text !== `${JSON.stringify(canonical(value))}\n`
        || !validEmail(value.email)) deny();
    return value.email;
  } catch (error) {
    if (error instanceof GreenEnrollmentMaterializationError) throw error;
    deny();
  } finally { opened.bytes.fill(0); }
}

function commandRequest(executable, args) {
  if (executable !== 'docker' || !Array.isArray(args)
      || args.some((argument) => typeof argument !== 'string' || argument.includes('\0'))) deny();
  return Object.freeze({ executable, args: Object.freeze([...args]) });
}

export async function executeGreenEnrollmentMaterializerArgv(executable, args, {
  timeoutMs = 20_000,
} = {}) {
  const request = commandRequest(executable, args);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) deny();
  try {
    const result = await execFileAsync(executable, args, {
      encoding: 'utf8', maxBuffer: maximumCommandBytes, timeout: timeoutMs, windowsHide: true,
    });
    return Object.freeze({ ...request, status: 0, stdout: result.stdout });
  } catch (error) {
    return Object.freeze({
      ...request,
      status: Number.isInteger(error?.code) ? error.code : 125,
      stdout: typeof error?.stdout === 'string'
        && Buffer.byteLength(error.stdout) <= maximumCommandBytes ? error.stdout : '',
    });
  }
}

function commandRunner(command) {
  if (typeof command !== 'function') deny();
  return async (args) => {
    const expected = commandRequest('docker', args);
    let result;
    try { result = await command('docker', expected.args, Object.freeze({ timeoutMs: 20_000 })); }
    catch { deny('command-response-unconfirmed'); }
    if (!exactKeys(result, ['args', 'executable', 'status', 'stdout'])
        || result.executable !== expected.executable
        || JSON.stringify(result.args) !== JSON.stringify(expected.args)
        || !Number.isInteger(result.status) || result.status < 0 || result.status > 255
        || typeof result.stdout !== 'string'
        || Buffer.byteLength(result.stdout) > maximumCommandBytes) deny('command-response-unconfirmed');
    if (result.status !== 0) deny('command-response-unconfirmed');
    return result.stdout;
  };
}

async function collectObservations({ containerId, targetImage, recipientFile }, options) {
  const run = commandRunner(options.command);
  const inspectArgs = Object.freeze([
    'container', 'inspect', '--format', '{{json .}}', containerId,
  ]);
  const inspect = parseJsonLine(await run(inspectArgs));
  if (!plain(inspect) || inspect.Id !== containerId || inspect.Name !== '/shareittoo-staging-api'
      || inspect.State?.Running !== true || !plain(inspect.Config)) deny();
  const environment = parseEnvironment(inspect.Config.Env);
  const probeArgs = Object.freeze([
    'run', '--rm', '--network', 'none', '--read-only', '--user', 'shareittoo',
    '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--entrypoint', 'node',
    targetImage, '--input-type=module', '--eval', runtimeProbeSource,
  ]);
  const identity = parseJsonLine(await run(probeArgs));
  if (!exactKeys(identity, ['gid', 'uid'])
      || ![identity.uid, identity.gid].every((entry) => Number.isSafeInteger(entry)
        && entry > 0 && entry <= 2_147_483_647)) deny();
  const recipient = readRecipient(recipientFile, options);
  return Object.freeze({ environment, identity: Object.freeze(identity), recipient });
}

function sameObservations(left, right) {
  return left.recipient === right.recipient
    && JSON.stringify(left.identity) === JSON.stringify(right.identity)
    && JSON.stringify(left.environment) === JSON.stringify(right.environment);
}

function openDirectoryChain(directoryPath, { fileSystem, requiredOwnerUid }) {
  const descriptors = [];
  const root = path.parse(directoryPath).root;
  const paths = [root];
  for (const part of path.relative(root, directoryPath).split(path.sep)) {
    paths.push(path.join(paths.at(-1), part));
  }
  try {
    const directories = paths.map((entryPath) => {
      const descriptor = fileSystem.openSync(entryPath,
        fileSystem.constants.O_RDONLY | fileSystem.constants.O_DIRECTORY
          | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_NONBLOCK
          | fileSystem.constants.O_CLOEXEC);
      descriptors.push(descriptor);
      const opened = fileSystem.fstatSync(descriptor, { bigint: true });
      const linked = fileSystem.lstatSync(entryPath, { bigint: true });
      if ((opened.mode & 0o170000n) !== 0o040000n || !sameDirectory(opened, linked)) deny();
      return Object.freeze({ before: opened, descriptor, path: entryPath });
    });
    const destination = directories.at(-1).before;
    if (destination.uid !== BigInt(requiredOwnerUid)
        || (destination.mode & 0o7777n) !== 0o700n) deny();
    return Object.freeze({ descriptors, directories });
  } catch (error) {
    for (const descriptor of descriptors.reverse()) {
      try { fileSystem.closeSync(descriptor); } catch { /* sanitized below */ }
    }
    if (error instanceof GreenEnrollmentMaterializationError) throw error;
    deny();
  }
}

function chainStable(chain, fileSystem) {
  for (const directory of chain.directories) {
    if (!sameDirectory(directory.before, fileSystem.fstatSync(directory.descriptor, { bigint: true }))
        || !sameDirectory(directory.before,
          fileSystem.lstatSync(directory.path, { bigint: true }))) deny();
  }
}

function closeAll(descriptors, fileSystem) {
  let failed = false;
  for (const descriptor of descriptors) {
    try { fileSystem.closeSync(descriptor); } catch { failed = true; }
  }
  return !failed;
}

function absent(filePath, fileSystem) {
  try { fileSystem.lstatSync(filePath, { bigint: true }); }
  catch (error) { if (error?.code === 'ENOENT') return true; }
  return false;
}

function rollbackOne(binding, chain, fileSystem) {
  try {
    chainStable(chain, fileSystem);
    if (!sameFile(binding.metadata, fileSystem.lstatSync(binding.path, { bigint: true }))) return false;
    fileSystem.unlinkSync(binding.path);
    fileSystem.fsyncSync(chain.directories.at(-1).descriptor);
    chainStable(chain, fileSystem);
    return absent(binding.path, fileSystem);
  } catch { return false; }
}

function publishOne(filePath, bytes, chain, { fileSystem, operatorUid, operatorGid }) {
  let descriptor;
  let created;
  let exact;
  let failed = false;
  try {
    chainStable(chain, fileSystem);
    descriptor = fileSystem.openSync(filePath,
      fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT | fileSystem.constants.O_EXCL
        | fileSystem.constants.O_NOFOLLOW | fileSystem.constants.O_CLOEXEC, 0o600);
    created = fileSystem.fstatSync(descriptor, { bigint: true });
    if ((created.mode & 0o170000n) !== 0o100000n || created.nlink !== 1n
        || created.uid !== BigInt(operatorUid) || created.gid !== BigInt(operatorGid)
        || (created.mode & 0o7777n) !== 0o600n || created.size !== 0n
        || !sameFile(created, fileSystem.lstatSync(filePath, { bigint: true }))) deny();
    let offset = 0;
    while (offset < bytes.length) {
      const count = fileSystem.writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count < 1) deny();
      offset += count;
    }
    fileSystem.fsyncSync(descriptor);
    exact = fileSystem.fstatSync(descriptor, { bigint: true });
    if (!sameDirectory(created, exact) || exact.nlink !== created.nlink
        || exact.size !== BigInt(bytes.length)
        || !sameFile(exact, fileSystem.lstatSync(filePath, { bigint: true }))) deny();
  } catch { failed = true; }
  if (created !== undefined && exact === undefined) {
    try {
      const opened = fileSystem.fstatSync(descriptor, { bigint: true });
      if (sameDirectory(created, opened) && opened.nlink === created.nlink
          && sameFile(opened, fileSystem.lstatSync(filePath, { bigint: true }))) exact = opened;
    } catch { /* rollback remains unconfirmed */ }
  }
  let closed = true;
  if (descriptor !== undefined) {
    try { fileSystem.closeSync(descriptor); } catch { closed = false; }
  }
  const binding = exact === undefined ? undefined : Object.freeze({ metadata: exact, path: filePath });
  if (failed || !closed) {
    const cleaned = binding !== undefined && rollbackOne(binding, chain, fileSystem);
    if (!cleaned || !closed) deny('rollback-unconfirmed');
    deny('publication-unconfirmed');
  }
  return binding;
}

function rollbackAll(bindings, chain, fileSystem) {
  let confirmed = true;
  for (const binding of [...bindings].reverse()) {
    if (!rollbackOne(binding, chain, fileSystem)) confirmed = false;
  }
  return confirmed;
}

function sameChainIdentity(left, right) {
  return left.directories.length === right.directories.length
    && left.directories.every((directory, index) => (
      directory.path === right.directories[index].path
      && sameDirectory(directory.before, right.directories[index].before)
    ));
}

function rollbackWithFreshChain(destination, bindings, originalChain, options) {
  let chain;
  let confirmed = false;
  try {
    chain = openDirectoryChain(destination, options);
    if (!sameChainIdentity(chain, originalChain)) deny();
    confirmed = rollbackAll(bindings, chain, options.fileSystem);
  } catch { confirmed = false; }
  if (chain && !closeAll([...chain.descriptors].reverse(), options.fileSystem)) confirmed = false;
  return confirmed;
}

function verifyDestination(destination, options) {
  const resolved = absolutePath(destination);
  const resolvedRepo = options.fileSystem.realpathSync(repositoryRoot);
  const chain = openDirectoryChain(resolved, options);
  try {
    if (options.fileSystem.realpathSync(resolved) !== resolved
        || resolved === resolvedRepo || resolved.startsWith(`${resolvedRepo}${path.sep}`)) deny();
    chainStable(chain, options.fileSystem);
    if (outputNames.some((name) => !absent(path.join(resolved, name), options.fileSystem))) deny();
    return { chain, destination: resolved };
  } catch (error) {
    closeAll([...chain.descriptors].reverse(), options.fileSystem);
    throw error;
  }
}

function outputBytes(observations, principal) {
  const environment = new Map(observations.environment.map(({ name, value }) => [name, value]));
  const access = listFrom(environment, 'SIT_STAGING_ALLOWED_USER_IDS', principalPattern);
  const notificationUsers = listFrom(
    environment, 'SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS', principalPattern,
  );
  const recipients = listFrom(
    environment, 'SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS', canonicalEmailPattern,
  );
  if (recipients.some((entry) => !validEmail(entry))
      || access.includes(principal) || notificationUsers.includes(principal)) deny();
  const values = Object.freeze({
    'current.env': Buffer.from(`${observations.environment.map(({ line }) => line).join('\n')}\n`),
    'request.json': canonicalBytes({
      email: observations.recipient, ttlSeconds: exactTtlSeconds, userId: principal,
    }),
    'allowlist.json': canonicalBytes({
      allowedUserIds: [...access, principal], schema: 'sit-staging-access-allowlist', version: 1,
    }),
    'runtime-identity.json': canonicalBytes({
      gid: observations.identity.gid, schema: 'sit-staging-runtime-identity-readback',
      uid: observations.identity.uid, version: 1,
    }),
  });
  return Object.freeze({
    access, notificationUsers, recipients, values,
    proposedRecipientCount: recipients.includes(observations.recipient)
      ? recipients.length : recipients.length + 1,
  });
}

export async function materializeGreenEnrollmentInputs({
  containerId,
  targetImage,
  recipientFile,
  destination,
  execute = false,
  confirmation = null,
  command = executeGreenEnrollmentMaterializerArgv,
  randomUuidImpl = crypto.randomUUID,
  fileSystem = fs,
  operatorUid = typeof process.getuid === 'function' ? process.getuid() : undefined,
  operatorGid = typeof process.getgid === 'function' ? process.getgid() : undefined,
  requiredOwnerUid = 0,
} = {}) {
  let prepared;
  try {
    if (!containerPattern.test(containerId ?? '') || !imagePattern.test(targetImage ?? '')
        || typeof execute !== 'boolean' || typeof randomUuidImpl !== 'function'
        || ![operatorUid, operatorGid, requiredOwnerUid]
          .every((value) => Number.isSafeInteger(value) && value >= 0)
        || operatorUid !== requiredOwnerUid
        || ((!execute && confirmation !== null) || (execute && confirmation !== exactConfirmation))) deny();
    absolutePath(recipientFile);
    absolutePath(destination);
    const observations = await collectObservations({
      containerId, targetImage, recipientFile,
    }, { command, fileSystem, operatorUid, operatorGid });
    const principal = randomUuidImpl();
    if (typeof principal !== 'string' || !uuidV4Pattern.test(principal)) deny();
    prepared = outputBytes(observations, principal);
    const result = Object.freeze({
      status: execute ? 'created' : 'dry-run', ttlSeconds: exactTtlSeconds,
      fileCount: outputNames.length,
      currentEnvironmentEntryCount: observations.environment.length,
      currentAccessCount: prepared.access.length,
      proposedAccessCount: prepared.access.length + 1,
      currentNotificationUserCount: prepared.notificationUsers.length,
      proposedNotificationUserCount: prepared.notificationUsers.length + 1,
      currentRecipientCount: prepared.recipients.length,
      proposedRecipientCount: prepared.proposedRecipientCount,
    });
    if (execute) {
      const fresh = await collectObservations({ containerId, targetImage, recipientFile }, {
        command, fileSystem, operatorUid, operatorGid,
      });
      if (!sameObservations(observations, fresh)) deny('observation-drift');
    }
    const output = verifyDestination(destination, { fileSystem, requiredOwnerUid });
    if (!execute) {
      if (!closeAll([...output.chain.descriptors].reverse(), fileSystem)) deny();
      return result;
    }
    const bindings = [];
    let failure;
    try {
      for (const name of outputNames) {
        bindings.push(publishOne(path.join(output.destination, name), prepared.values[name],
          output.chain, { fileSystem, operatorUid, operatorGid }));
      }
      fileSystem.fsyncSync(output.chain.directories.at(-1).descriptor);
      chainStable(output.chain, fileSystem);
      for (const binding of bindings) {
        if (!sameFile(binding.metadata, fileSystem.lstatSync(binding.path, { bigint: true }))) deny();
      }
    } catch (error) { failure = error; }
    if (failure !== undefined) {
      const rolledBack = rollbackAll(bindings, output.chain, fileSystem);
      const closed = closeAll([...output.chain.descriptors].reverse(), fileSystem);
      if (!rolledBack || !closed) deny('rollback-unconfirmed');
      if (failure instanceof GreenEnrollmentMaterializationError) throw failure;
      deny('publication-unconfirmed');
    }
    if (!closeAll([...output.chain.descriptors].reverse(), fileSystem)) {
      rollbackWithFreshChain(output.destination, bindings, output.chain,
        { fileSystem, requiredOwnerUid });
      deny('rollback-unconfirmed');
    }
    return result;
  } catch (error) {
    if (error instanceof GreenEnrollmentMaterializationError) throw error;
    deny();
  } finally {
    if (prepared?.values) Object.values(prepared.values).forEach((bytes) => bytes.fill(0));
  }
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) deny();
  const allowed = new Set([
    '--container-id', '--target-image', '--recipient-file', '--destination', '--confirm-execute',
  ]);
  const values = {};
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--execute') {
      if (execute) deny();
      execute = true;
      continue;
    }
    if (!allowed.has(name) || Object.hasOwn(values, name)) deny();
    const value = argv[index += 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) deny();
    values[name] = value;
  }
  for (const name of ['--container-id', '--target-image', '--recipient-file', '--destination']) {
    if (!Object.hasOwn(values, name)) deny();
  }
  const confirmation = values['--confirm-execute'] ?? null;
  if ((!execute && confirmation !== null) || (execute && confirmation !== exactConfirmation)) {
    deny('confirmation-mismatch');
  }
  return Object.freeze({
    confirmation, containerId: values['--container-id'], destination: values['--destination'],
    execute, recipientFile: values['--recipient-file'], targetImage: values['--target-image'],
  });
}

export async function runGreenEnrollmentMaterializerCli(argv, options) {
  return materializeGreenEnrollmentInputs({ ...parseArguments(argv), ...options });
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(
      await runGreenEnrollmentMaterializerCli(process.argv.slice(2)),
    )}\n`);
  } catch (error) {
    const state = error instanceof GreenEnrollmentMaterializationError
      && ['publication-unconfirmed', 'rollback-unconfirmed'].includes(error.state)
      ? error.state : 'denied';
    process.stderr.write(`${JSON.stringify({ status: state })}\n`);
    process.exitCode = state === 'denied' ? 1 : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export const GREEN_ENROLLMENT_MATERIALIZATION_CONFIRMATION = exactConfirmation;
