import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { digest, equal, objectDigest, readProtectedJson } from './green_staging_98_106_contract.mjs';
import { privateDirectory, recheckDirectory, assertArtifactFamily } from './green_staging_98_106_evidence.mjs';
import { canonicalMounts, containerFingerprint } from './green_staging_98_106_promotion.mjs';
import { physicalSchemaSql, validateExecutionInputs } from './green_staging_106_106_preflight.mjs';
import { validateSuccessorSource, requireBinding as require } from './green_staging_106_106_binding.mjs';
import { verifyCollectedTarget } from './green_staging_106_106_collector.mjs';
import { strictSupplementalGroups } from './green_staging_106_106_resources.mjs';
import { readCandidateArchive } from './green_staging_106_106_image.mjs';
import { preflightRead } from './green_staging_106_106_preflight.mjs';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const dockerId = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const imageId = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const runIdPattern = /^[a-z0-9][a-z0-9-]{7,47}$/u;
const buildKeys = new Set(['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME']);

export function protectedEnvText(entries) {
  require(Array.isArray(entries) && entries.length > 0, 'runtime_environment');
  const found = new Set(), lines = [];
  for (const entry of entries) {
    require(typeof entry === 'string', 'runtime_environment');
    const at = entry.indexOf('=');
    require(at > 0, 'runtime_environment');
    const key = entry.slice(0, at), value = entry.slice(at + 1);
    require(/^[A-Z_][A-Z0-9_]*$/u.test(key) && !found.has(key), 'runtime_environment');
    found.add(key);
    if (!buildKeys.has(key)) {
      require(!/[\r\n\0]/u.test(value), 'runtime_environment_value');
      lines.push(`${key}=${value}`);
    }
  }
  require(lines.length > 0, 'runtime_environment_empty');
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

export function readSourceMaterial(source, { io = fs, maxBytes = 1024 * 1024 } = {}) {
  require(typeof source === 'string' && path.isAbsolute(source) && path.normalize(source) === source
    && !source.startsWith('/proc/') && !source.startsWith('/sys/'), 'material_path');
  const held = [];
  const stable = entry => {
    const now = io.fstatSync(entry.fd, { bigint: true });
    const link = io.lstatSync(entry.path, { bigint: true });
    const keys = entry.directory ? ['dev', 'ino', 'mode', 'uid', 'gid']
      : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    require(keys.every(key => entry.stat[key] === now[key] && now[key] === link[key]), 'material_changed');
  };
  try {
    let current = '/';
    const parentParts = path.dirname(source).split('/').filter(Boolean);
    for (const [index, part] of parentParts.entries()) {
      current = path.join(current, part);
      const fd = io.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const stat = io.fstatSync(fd, { bigint: true });
      held.push({ fd, path: current, stat, directory: true });
      require(stat.isDirectory(), 'material_parent');
      if (index === parentParts.length - 1) require(stat.uid === 0n
        && (stat.mode & 0o7777n) === 0o700n, 'material_parent');
    }
    const fd = io.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = io.fstatSync(fd, { bigint: true });
    held.push({ fd, path: source, stat, directory: false });
    require(stat.isFile() && stat.nlink === 1n && stat.uid === 0n
      && (stat.mode & 0o7777n) === 0o640n && stat.size > 0n && stat.size <= BigInt(maxBytes), 'material_metadata');
    const bytes = io.readFileSync(fd);
    try {
      stable(held.at(-1));
      held.slice(0, -1).forEach(stable);
      return { sha256: digest(bytes), uid: Number(stat.uid), gid: Number(stat.gid), mode: 0o640 };
    } finally { bytes.fill(0); }
  } finally { held.reverse().forEach(entry => io.closeSync(entry.fd)); }
}

function writeExclusive(directory, name, bytes, io = fs) {
  recheckDirectory(directory);
  const filename = path.join(directory.directory, name);
  const fd = io.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let identity;
  try {
    const stat = io.fstatSync(fd, { bigint: true });
    require(stat.isFile() && stat.nlink === 1n && stat.uid === BigInt(process.getuid())
      && (stat.mode & 0o7777n) === 0o600n, 'output_metadata');
    identity = { dev: stat.dev, ino: stat.ino };
    io.writeFileSync(fd, bytes);
    io.fsyncSync(fd);
    const after = io.fstatSync(fd, { bigint: true });
    const link = io.lstatSync(filename, { bigint: true });
    require(after.dev === identity.dev && after.ino === identity.ino && after.nlink === 1n
      && after.uid === BigInt(process.getuid()) && (after.mode & 0o7777n) === 0o600n
      && link.dev === after.dev && link.ino === after.ino, 'output_changed');
    return { path: filename, rawSha256: digest(bytes), dev: after.dev, ino: after.ino };
  } catch (error) {
    try { io.closeSync(fd); } catch { /* close is best effort */ }
    if (identity) {
      try {
        const current = io.lstatSync(filename, { bigint: true });
        if (current.dev === identity.dev && current.ino === identity.ino) io.unlinkSync(filename);
      } catch { /* retain only if identity cannot be proven */ }
    }
    throw error;
  } finally {
    try { io.closeSync(fd); } catch { /* already closed on failure */ }
  }
}

function removeOwnedOutputs(outputs, io = fs) {
  for (const output of [...outputs].reverse()) {
    try {
      const stat = io.lstatSync(output.path, { bigint: true });
      if (stat.dev === output.dev && stat.ino === output.ino && stat.nlink === 1n
        && stat.uid === BigInt(process.getuid()) && (stat.mode & 0o7777n) === 0o600n) io.unlinkSync(output.path);
    } catch { /* preserve anything whose identity cannot be proven */ }
  }
}

function validateBoundTarget(binding, target, targetSha256, runId, apiId) {
  verifyCollectedTarget(target, targetSha256);
  require(binding?.kind === 'sit-green-staging-106-106-binding' && binding.schemaVersion === 1
    && commit(binding.opsCommit) && commit(binding.runtimeCommit) && hash(binding.publicationSha256)
    && imageId(binding.candidateImageId) && binding.scope?.api?.id === apiId, 'binding_shape');
  require(target.opsCommit === binding.opsCommit
    && target.sourceInventorySha256 === objectDigest(binding.sourceInventory)
    && target.publicationSha256 === binding.publicationSha256
    && target.candidate?.imageId === binding.candidateImageId
    && target.candidate?.runtimeCommit === binding.runtimeCommit, 'target_binding');
  const expected = [binding.scope.api, binding.scope.database, ...binding.scope.witnesses];
  require(Array.isArray(target.containers) && equal(target.containers.map(({ configSha256, ...c }) => c), expected)
    && target.containers[0]?.id === apiId && target.containers[0]?.configSha256
    && runIdPattern.test(runId), 'target_scope');
}

export async function prepareExecutionInputs({ bindingFile, bindingSha256, targetFile, targetSha256, runId,
  apiId, evidenceDirectory }, dependencies = {}) {
  require(runIdPattern.test(runId) && dockerId(apiId) && hash(bindingSha256) && hash(targetSha256), 'arguments');
  require(process.getuid?.() === 0 || dependencies.allowNonRootForTests === true, 'operator_root');
  const io = dependencies.fs ?? fs;
  const binding = (dependencies.readJson ?? readProtectedJson)(bindingFile, bindingSha256);
  const target = (dependencies.readJson ?? readProtectedJson)(targetFile, targetSha256);
  (dependencies.validateSource ?? validateSuccessorSource)(binding, dependencies.sourceOptions);
  validateBoundTarget(binding, target, objectDigest(target), runId, apiId);
  const directory = (dependencies.privateDirectory ?? privateDirectory)(evidenceDirectory);
  const names = [`${runId}.runtime.env`, `${runId}.execution-config.json`, `${runId}.runtime-manifest.json`];
  (dependencies.assertArtifactFamily ?? assertArtifactFamily)(directory, names);
  const read = dependencies.read ?? preflightRead;
  const apiRows = JSON.parse(String(await read({ args: ['inspect', apiId] })));
  require(Array.isArray(apiRows) && apiRows.length === 1, 'api_inspect');
  const api = apiRows[0];
  require(api.Id === apiId && api.Name === `/${binding.scope.api.name}` && api.Image === binding.scope.api.imageId
    && api.State?.Running === true && api.State?.Paused === false
    && containerFingerprint(api) === target.containers[0].configSha256
    && objectDigest(api.Config?.Env) === target.environmentSha256
    && objectDigest(canonicalMounts(api.Mounts)) === target.mountsSha256, 'api_readback');
  const databaseExpected = target.containers[1];
  require(databaseExpected && databaseExpected.id === binding.scope.database.id, 'database_target');
  const databaseRows = JSON.parse(String(await read({ args: ['inspect', databaseExpected.id] })));
  require(Array.isArray(databaseRows) && databaseRows.length === 1, 'database_inspect');
  const database = databaseRows[0];
  require(database.Id === databaseExpected.id && database.Name === `/${databaseExpected.name}`
    && database.Image === databaseExpected.imageId && database.State?.Running === true
    && database.State?.Paused === false && containerFingerprint(database) === databaseExpected.configSha256,
  'database_readback');

  const candidateRows = JSON.parse(String(await read({ args: ['image', 'inspect', binding.candidateImageId] })));
  require(Array.isArray(candidateRows) && candidateRows.length === 1
    && candidateRows[0].Id === binding.candidateImageId, 'candidate_inspect');
  const candidateArchive = await read({ args: ['image', 'save', binding.candidateImageId] });
  require(Buffer.isBuffer(candidateArchive), 'candidate_archive');
  const { uid, gid } = readCandidateArchive(candidateArchive, candidateRows[0]);
  const allowedGroups = new Set([String(gid), ...strictSupplementalGroups(api.HostConfig?.GroupAdd ?? [])]);
  const binds = (api.Mounts ?? []).filter(mount => mount.Type === 'bind');
  require(binds.length > 0 && binds.every(mount => mount.RW === false
    && typeof mount.Source === 'string' && path.isAbsolute(mount.Source)
    && typeof mount.Destination === 'string' && mount.Destination.startsWith('/run/secrets/')),
  'material_mounts');
  const materialReader = dependencies.readMaterial ?? (source => readSourceMaterial(source, { io: dependencies.materialFs ?? fs }));
  const materials = binds.map(mount => {
    const metadata = materialReader(mount.Source);
    require(metadata && hash(metadata.sha256) && metadata.uid === 0 && metadata.mode === 0o640
      && allowedGroups.has(String(metadata.gid)), 'material_metadata');
    return { source: mount.Source, destination: mount.Destination, sha256: metadata.sha256,
      uid: metadata.uid, gid: metadata.gid, mode: metadata.mode };
  }).sort((a, b) => a.destination.localeCompare(b.destination));
  require(new Set(materials.map(m => m.destination)).size === materials.length, 'material_duplicate');

  const envBytes = protectedEnvText(api.Config?.Env ?? []);
  require(envBytes.length <= 1024 * 1024, 'runtime_environment_size');
  const envName = names[0], configName = names[1], manifestName = names[2];
  const envPath = path.join(directory.directory, envName);
  const config = { kind: 'sit-green-staging-106-106-execution-config', schemaVersion: 1,
    sourceState: 'running', sealedSourceName: `sit-green-106-106-sealed-${runId}`, runId, uid, gid,
    materials, envFile: { source: envPath, destination: null, sha256: digest(envBytes), uid: 0, gid: 0, mode: 0o600 } };
  const dbArgs = ['exec', '-i', binding.scope.database.id, 'psql', '-X', '-q', '-At', '-v',
    'ON_ERROR_STOP=1', '-U', binding.scope.databaseUser, '-d', binding.scope.databaseName];
  const physicalSchemaSha256 = String(await read({ args: dbArgs, input: physicalSchemaSql })).trim();
  require(hash(physicalSchemaSha256), 'physical_schema');
  for (const material of materials) {
    const fresh = materialReader(material.source);
    require(fresh.sha256 === material.sha256 && fresh.uid === material.uid
      && fresh.gid === material.gid && fresh.mode === material.mode, 'material_drift');
  }
  const freshApiRows = JSON.parse(String(await read({ args: ['inspect', apiId] })));
  require(Array.isArray(freshApiRows) && freshApiRows.length === 1
    && freshApiRows[0].Id === api.Id && freshApiRows[0].Name === api.Name
    && freshApiRows[0].Image === api.Image && freshApiRows[0].State?.Running === true
    && freshApiRows[0].State?.Paused === false
    && containerFingerprint(freshApiRows[0]) === target.containers[0].configSha256
    && objectDigest(freshApiRows[0].Config?.Env) === target.environmentSha256
    && objectDigest(canonicalMounts(freshApiRows[0].Mounts)) === target.mountsSha256, 'api_drift');
  const freshDatabaseRows = JSON.parse(String(await read({ args: ['inspect', databaseExpected.id] })));
  require(Array.isArray(freshDatabaseRows) && freshDatabaseRows.length === 1
    && freshDatabaseRows[0].Id === database.Id && freshDatabaseRows[0].Name === database.Name
    && freshDatabaseRows[0].Image === database.Image && freshDatabaseRows[0].State?.Running === true
    && freshDatabaseRows[0].State?.Paused === false
    && containerFingerprint(freshDatabaseRows[0]) === databaseExpected.configSha256, 'database_drift');
  const manifest = { kind: 'sit-green-staging-106-106-runtime', schemaVersion: 1,
    opsCommit: binding.opsCommit, runtimeCommit: binding.runtimeCommit,
    bindingSha256: objectDigest(binding), targetSha256: objectDigest(target), configSha256: objectDigest(config),
    physicalSchemaSha256 };
  validateExecutionInputs(config, manifest, binding, target);

  const outputs = [];
  try {
    outputs.push(writeExclusive(directory, envName, envBytes, io));
    const configBytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
    require(configBytes.length <= 1024 * 1024, 'config_size');
    try { outputs.push(writeExclusive(directory, configName, configBytes, io)); }
    finally { configBytes.fill(0); }
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    require(manifestBytes.length <= 1024 * 1024, 'manifest_size');
    try { outputs.push(writeExclusive(directory, manifestName, manifestBytes, io)); }
    finally { manifestBytes.fill(0); }
    (dependencies.recheckDirectory ?? recheckDirectory)(directory);
    const directoryFd = io.openSync(directory.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { io.fsyncSync(directoryFd); } finally { io.closeSync(directoryFd); }
    return { artifacts: outputs.map(output => ({ path: output.path, rawSha256: output.rawSha256 })),
      bindingObjectSha256: objectDigest(binding), targetObjectSha256: objectDigest(target),
      configObjectSha256: objectDigest(config), physicalSchemaSha256 };
  } catch (error) {
    removeOwnedOutputs(outputs, io);
    throw error;
  } finally { envBytes.fill(0); }
}

const accepted = new Set(['binding', 'binding-sha256', 'target', 'target-sha256', 'run-id', 'api-id', 'evidence-directory']);
export function parseArguments(args) {
  const values = new Map();
  require(Array.isArray(args) && args.length === accepted.size * 2, 'arguments');
  for (let index = 0; index < args.length; index += 2) {
    const raw = args[index], key = typeof raw === 'string' && raw.startsWith('--') ? raw.slice(2) : '';
    const value = args[index + 1];
    require(accepted.has(key) && !values.has(key) && typeof value === 'string'
      && value.length > 0 && !value.startsWith('--'), 'arguments');
    values.set(key, value);
  }
  require([...accepted].every(key => values.has(key)), 'arguments');
  return { bindingFile: values.get('binding'), bindingSha256: values.get('binding-sha256'),
    targetFile: values.get('target'), targetSha256: values.get('target-sha256'), runId: values.get('run-id'),
    apiId: values.get('api-id'), evidenceDirectory: values.get('evidence-directory') };
}

export async function runCli(args, { stdout = process.stdout, stderr = process.stderr, dependencies } = {}) {
  try {
    const result = await prepareExecutionInputs(parseArguments(args), dependencies);
    stdout.write(`${JSON.stringify(result)}\n`); return 0;
  } catch {
    stderr.write('green_106_106_execution_inputs_failed\n'); return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
