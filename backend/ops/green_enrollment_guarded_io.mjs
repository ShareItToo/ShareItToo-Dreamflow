import fs from 'node:fs';
import path from 'node:path';
import { readProtectedActivationFile } from './green_password_enrollment_activation.mjs';
import {
  executeGreenPasswordEnrollmentArgv, greenPasswordEnrollmentCommandRequest,
  GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT,
} from './green_password_enrollment_activation_cli.mjs';

export class GreenEnrollmentPreparationError extends Error {
  constructor(state = 'denied') {
    super('green_enrollment_preparation_denied');
    this.code = 'green_enrollment_preparation_denied';
    this.state = state;
  }
}
export const deny = (state) => { throw new GreenEnrollmentPreparationError(state); };
export const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, sort(value[key])]));
  return value;
}
export const idPattern = /^[a-f0-9]{64}$/u;
export const commitPattern = /^[a-f0-9]{40}$/u;
export const digestPattern = /^sha256:[a-f0-9]{64}$/u;
export function absolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value
      || value.includes('\0') || value.includes('\n') || value.includes(',')) deny();
  return value;
}
export function privateBytes(file, { uid = process.getuid(), gid = process.getgid(),
  fileSystem = fs } = {}) {
  return readProtectedActivationFile(absolute(file), {
    expectedUid: uid, expectedGid: gid, operatorUid: process.getuid(), fileSystem,
  }).bytes;
}
export function privateJson(file, options) {
  const bytes = privateBytes(file, options);
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`))) deny();
    return { value };
  } catch { deny(); } finally { bytes.fill(0); }
}
export function environment(bytes) {
  const value = {};
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { deny(); }
  if (!text.endsWith('\n') || /[\r\0]/u.test(text)) deny();
  for (const line of text.slice(0, -1).split('\n')) {
    const at = line.indexOf('='); const key = line.slice(0, at);
    if (at < 1 || !/^[A-Z][A-Z0-9_]*$/u.test(key) || Object.hasOwn(value, key)) deny();
    value[key] = line.slice(at + 1);
  }
  return value;
}
export function containerEnvironment(container) {
  if (!Array.isArray(container?.Config?.Env)) deny();
  const bytes = Buffer.from(`${container.Config.Env.join('\n')}\n`);
  try { return environment(bytes); } finally { bytes.fill(0); }
}

// Exclusive outputs are never overwritten or removed on uncertain publication.
// A failed write may leave an owned partial file for operator inspection.
export function publishPrivateJson(file, value, { fileSystem = fs } = {}) {
  absolute(file);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const descriptors = []; let created = false;
  try {
    const parent = path.dirname(file); const parts = [path.parse(parent).root];
    for (const part of path.relative(parts[0], parent).split(path.sep)) {
      parts.push(path.join(parts.at(-1), part));
    }
    const same = (left, right) => ['dev', 'ino', 'mode', 'uid', 'gid']
      .every((key) => left[key] === right[key]);
    const chain = parts.map((entry) => {
      const fd = fileSystem.openSync(entry, fileSystem.constants.O_RDONLY
        | fileSystem.constants.O_DIRECTORY | fileSystem.constants.O_NOFOLLOW);
      descriptors.push(fd);
      const stat = fileSystem.fstatSync(fd);
      if (!stat.isDirectory() || !same(stat, fileSystem.lstatSync(entry))) deny();
      return { entry, fd, stat };
    });
    const parentStat = chain.at(-1).stat;
    if (parentStat.uid !== process.getuid() || (parentStat.mode & 0o7777) !== 0o700
        || bytes.length > 65536) deny();
    const fd = fileSystem.openSync(file, fileSystem.constants.O_WRONLY
      | fileSystem.constants.O_CREAT | fileSystem.constants.O_EXCL
      | fileSystem.constants.O_NOFOLLOW, 0o600);
    descriptors.push(fd); created = true;
    const before = fileSystem.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid()
        || (before.mode & 0o7777) !== 0o600
        || !same(before, fileSystem.lstatSync(file))) deny();
    let offset = 0;
    while (offset < bytes.length) {
      const written = fileSystem.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (written <= 0) deny();
      offset += written;
    }
    fileSystem.fsyncSync(fd);
    const after = fileSystem.fstatSync(fd);
    if (!same(before, after) || after.nlink !== 1 || after.size !== bytes.length
        || !same(after, fileSystem.lstatSync(file))) deny();
    for (const entry of chain) {
      if (!same(entry.stat, fileSystem.fstatSync(entry.fd))
          || !same(entry.stat, fileSystem.lstatSync(entry.entry))) deny();
    }
    fileSystem.fsyncSync(chain.at(-1).fd);
    const readback = privateBytes(file, { fileSystem });
    try { if (!readback.equals(bytes)) deny(); } finally { readback.fill(0); }
    return { status: 'published' };
  } catch { deny(created ? 'publication-unconfirmed' : 'denied'); }
  finally {
    bytes.fill(0);
    let failed = false;
    for (const fd of descriptors.reverse()) {
      try { fileSystem.closeSync(fd); } catch { failed = true; }
    }
    if (failed) deny('publication-unconfirmed');
  }
}

// Bind every output parent and prove the whole set absent before publishing
// its first member. Keep those directory descriptors across all publications.
export function publishPrivateJsonSet(entries, { fileSystem = fs } = {}) {
  const descriptors = []; const chains = []; const results = [];
  const same = (left, right) => ['dev', 'ino', 'mode', 'uid', 'gid']
    .every((key) => left[key] === right[key]);
  const assertParents = () => {
    for (const chain of chains) {
      for (const entry of chain) {
        if (!same(entry.stat, fileSystem.fstatSync(entry.fd))
            || !same(entry.stat, fileSystem.lstatSync(entry.path))) deny();
      }
    }
  };
  const assertAbsent = (file) => {
    try { fileSystem.lstatSync(file); } catch (error) {
      if (error?.code === 'ENOENT') return;
      deny();
    }
    deny();
  };
  try {
    if (!Array.isArray(entries) || entries.length < 1
        || entries.some((entry) => !exact(entry, ['file', 'value']))
        || new Set(entries.map((entry) => absolute(entry.file))).size !== entries.length) deny();
    for (const entry of entries) {
      const parent = path.dirname(entry.file); const parts = [path.parse(parent).root];
      for (const part of path.relative(parts[0], parent).split(path.sep)) {
        parts.push(path.join(parts.at(-1), part));
      }
      const chain = parts.map((directory) => {
        const fd = fileSystem.openSync(directory, fileSystem.constants.O_RDONLY
          | fileSystem.constants.O_DIRECTORY | fileSystem.constants.O_NOFOLLOW);
        descriptors.push(fd);
        const stat = fileSystem.fstatSync(fd);
        if (!stat.isDirectory() || !same(stat, fileSystem.lstatSync(directory))) deny();
        return { path: directory, fd, stat };
      });
      const parentStat = chain.at(-1).stat;
      if (parentStat.uid !== process.getuid() || (parentStat.mode & 0o7777) !== 0o700) deny();
      chains.push(chain);
    }
    assertParents();
    for (const entry of entries) assertAbsent(entry.file);
    assertParents();
    for (const entry of entries) {
      assertParents();
      assertAbsent(entry.file);
      results.push(publishPrivateJson(entry.file, entry.value, { fileSystem }));
      assertParents();
    }
    return results;
  } catch (error) {
    // No portable atomic inode-conditional unlink is available here. Preserve
    // confirmed and partial output after a race rather than risk unlinking a
    // replaced path; callers must treat the incomplete set as unconfirmed.
    deny(results.length > 0 || error?.state === 'publication-unconfirmed'
      ? 'publication-unconfirmed' : 'denied');
  } finally {
    let failed = false;
    for (const fd of descriptors.reverse()) {
      try { fileSystem.closeSync(fd); } catch { failed = true; }
    }
    if (failed) deny(results.length > 0 ? 'publication-unconfirmed' : 'denied');
  }
}

export function commandRunner(command = executeGreenPasswordEnrollmentArgv,
  cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT) {
  return async (executable, args, allowFailure = false) => {
    const expected = greenPasswordEnrollmentCommandRequest(executable, args, cwd);
    let result;
    try { result = await command(executable, Object.freeze([...args]), { cwd, timeoutMs: 30000 }); }
    catch { if (allowFailure) return { status: 125, stdout: '' }; deny(); }
    if (!exact(result, ['executable', 'args', 'cwd', 'status', 'stdout'])
        || result.executable !== expected.executable || result.cwd !== expected.cwd
        || canonical(result.args) !== canonical(expected.args)
        || !Number.isInteger(result.status) || result.status < 0 || result.status > 255
        || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 1024 * 1024) {
      if (allowFailure) return { status: 125, stdout: '' };
      deny();
    }
    if (!allowFailure && result.status !== 0) deny();
    return result;
  };
}
export async function inspect(run, kind, identity) {
  const result = await run('docker', [kind, 'inspect', '--format', '{{json .}}', identity], true);
  if (result.status === 0) {
    try { return JSON.parse(result.stdout); } catch { deny(); }
  }
  if (kind !== 'container') deny();
  const inventory = await run('docker', ['container', 'ls', '--all', '--no-trunc', '--filter',
    idPattern.test(identity) ? `id=${identity}` : `name=^/${identity}$`, '--format', '{{.ID}}']);
  if (inventory.stdout === '') return null;
  deny('readback-unconfirmed');
}
export async function sourcePreflight(run, sourceCommit,
  cwd = GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT) {
  if (!commitPattern.test(sourceCommit) || fs.realpathSync(cwd)
      !== fs.realpathSync(GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT)) deny();
  const root = (await run('git', ['rev-parse', '--show-toplevel'])).stdout.trim();
  if (fs.realpathSync(root) !== fs.realpathSync(cwd)
      || (await run('git', ['rev-parse', 'HEAD'])).stdout.trim() !== sourceCommit) deny();
  await run('git', ['diff', '--quiet', 'HEAD', '--', '.',
    ':(exclude)docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md']);
  if ((await run('git', ['ls-files', '--others', '--exclude-standard', '--', '.'])).stdout !== '') deny();
}
