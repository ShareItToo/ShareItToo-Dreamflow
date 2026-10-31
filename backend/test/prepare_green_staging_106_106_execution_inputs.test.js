import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { digest, objectDigest } from '../ops/green_staging_98_106_contract.mjs';
import { canonicalMounts, containerFingerprint } from '../ops/green_staging_98_106_promotion.mjs';
import { physicalSchemaSql } from '../ops/green_staging_106_106_preflight.mjs';
import { candidateArchive } from './fixtures/green_106106_archive.js';
import { parseArguments, prepareExecutionInputs, protectedEnvText } from '../ops/prepare_green_staging_106_106_execution_inputs.mjs';

const runId = '106106-20261031-0308-c7';
const id = ch => ch.repeat(64);
const image = ch => `sha256:${ch.repeat(64)}`;
const run = async fn => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-106-inputs-'));
  fs.chmodSync(root, 0o700);
  try { return await fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
};
function protectedJson(root, name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const filename = path.join(root, name);
  fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
  fs.chmodSync(filename, 0o600);
  return { filename, sha256: digest(bytes) };
}

function fixture(root, overrides = {}, archiveOptions = {}) {
  const apiId = id('a'), databaseId = id('d'), apiImage = image('1'), databaseImage = image('2');
  const candidateImage = candidateArchive([], { user: 'shareittoo', ...archiveOptions });
  const candidateImageId = candidateImage.image.Id;
  const candidate = candidateImage.image;
  const runtimeCommit = '1'.repeat(40), opsCommit = '2'.repeat(40);
  const mount = { Type: 'bind', Source: '/staging/secrets/firebase.json', Destination: '/run/secrets/firebase.json', RW: false };
  const api = { Id: apiId, Name: '/staging-api', Image: apiImage,
    State: { Running: true, Paused: false }, Config: { User: '10001:10001', Env: [
      'NODE_ENV=production', 'DB_PASSWORD=private-value', 'APP_VERSION=1.0',
      `APP_COMMIT=${runtimeCommit}`, 'APP_BUILD_TIME=2026-10-31T00:00:00.000Z'],
      Labels: { 'com.shareittoo.sit.green': 'true' } },
    HostConfig: { GroupAdd: [] }, Mounts: [mount], NetworkSettings: { Networks: {} } };
  const database = { Id: databaseId, Name: '/staging-db', Image: databaseImage,
    State: { Running: true, Paused: false }, Config: { Env: [], Labels: { 'com.shareittoo.sit.green': 'true' } },
    HostConfig: {}, Mounts: [], NetworkSettings: { Networks: {} } };
  const scopeApi = { id: apiId, name: 'staging-api', imageId: apiImage, imageDigest: image('4'), runtimeCommit };
  const scopeDatabase = { id: databaseId, name: 'staging-db', imageId: databaseImage, imageDigest: image('5') };
  const binding = { kind: 'sit-green-staging-106-106-binding', schemaVersion: 1, opsCommit,
    runtimeCommit, publicationSha256: '6'.repeat(64), candidateImageId, sourceInventory: { source: '7'.repeat(64) },
    scope: { api: scopeApi, database: scopeDatabase, witnesses: [], databaseUser: 'sit_user', databaseName: 'sit_db' } };
  const target = { kind: 'sit-green-staging-106-106-target', schemaVersion: 1, collectedAt: '2026-10-31T00:00:00.000Z',
    opsCommit, sourceInventorySha256: objectDigest(binding.sourceInventory), publicationSha256: binding.publicationSha256,
    candidate: { imageId: candidateImageId, runtimeCommit },
    containers: [{ ...scopeApi, configSha256: containerFingerprint(api) },
      { ...scopeDatabase, configSha256: containerFingerprint(database) }], networks: [],
    uploads: { name: 'staging-uploads', configSha256: '8'.repeat(64) },
    environmentSha256: objectDigest(api.Config.Env), mountsSha256: objectDigest(canonicalMounts(api.Mounts)),
    database: {}, mutationAdapterImplemented: false, promotionAuthorized: false };
  const bindingFile = protectedJson(root, 'binding.json', binding);
  const targetFile = protectedJson(root, 'target.json', target);
  const schema = '9'.repeat(64);
  const read = async entry => {
    if (entry.input === physicalSchemaSql) return schema;
    if (entry.args[0] === 'inspect') return JSON.stringify([entry.args[1] === apiId ? api : database]);
    if (entry.args[0] === 'image' && entry.args[1] === 'inspect') return JSON.stringify([candidate]);
    if (entry.args[0] === 'image' && entry.args[1] === 'save') return candidateImage.archive;
    throw new Error('unexpected read');
  };
  const dependencies = { allowNonRootForTests: true, validateSource: () => {}, read, readMaterial: () => ({
    sha256: 'a'.repeat(64), uid: 0, gid: 10001, mode: 0o640 }),
    ...overrides };
  return { apiId, api, database, binding, target, bindingFile, targetFile, schema, read, dependencies };
}

test('fresh protected inputs resolve a named candidate user from its exact image archive and bind current inputs', async () => run(async root => {
  const f = fixture(root);
  const result = await prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
    targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: f.apiId, evidenceDirectory: root }, f.dependencies);
  assert.equal(result.physicalSchemaSha256, f.schema);
  assert.equal(result.artifacts.length, 3);
  assert.equal(JSON.stringify(result).includes('private-value'), false);
  const envPath = result.artifacts.find(file => file.path.endsWith('.runtime.env')).path;
  const env = fs.readFileSync(envPath, 'utf8');
  assert.match(env, /NODE_ENV=production/u);
  assert.match(env, /DB_PASSWORD=private-value/u);
  for (const key of ['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME']) assert.equal(env.includes(`${key}=`), false);
  const configArtifact = result.artifacts.find(file => file.path.endsWith('.execution-config.json'));
  const config = JSON.parse(fs.readFileSync(configArtifact.path, 'utf8'));
  assert.equal(config.runId, runId);
  assert.equal(config.sourceState, 'running');
  assert.equal(config.sealedSourceName, `sit-green-106-106-sealed-${runId}`);
  assert.equal(config.materials[0].sha256, 'a'.repeat(64));
  assert.equal(config.envFile.sha256, digest(fs.readFileSync(envPath)));
  for (const artifact of result.artifacts) {
    const stat = fs.lstatSync(artifact.path);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(stat.nlink, 1);
    assert.equal(digest(fs.readFileSync(artifact.path)), artifact.rawSha256);
  }
}));

test('mock opt-in is written into the protected versioned config and binds exact source env bytes', async () => run(async root => {
  const f = fixture(root);
  const result = await prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
    targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: f.apiId, evidenceDirectory: root,
    listingAiProfile: 'staging-mock-v1' }, f.dependencies);
  const configPath = result.artifacts.find(file => file.path.endsWith('.execution-config.json')).path;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const envPath = result.artifacts.find(file => file.path.endsWith('.runtime.env')).path;
  assert.equal(config.schemaVersion, 2);
  assert.deepEqual(config.listingAiTransition, { schemaVersion: 1, from: 'on_device', to: 'staging-mock-v1',
    sourceEnvironmentSha256: digest(fs.readFileSync(envPath)) });
  assert.equal(result.configObjectSha256, objectDigest(config));
  assert.equal(JSON.stringify(result).includes('private-value'), false);
}));

test('rejects candidate archives with missing or ambiguous named user/group records before writing', async t => {
  const cases = [
    ['missing user', { changeEntries: entries => {
      entries.find(entry => entry.name === 'etc/passwd').data = 'root:x:0:0:root:/root:/bin/sh\nother:x:10001:10001:worker:/app:/bin/false\n';
    } }],
    ['ambiguous user', { changeEntries: entries => {
      entries.find(entry => entry.name === 'etc/passwd').data += 'shareittoo:x:10002:10002:duplicate:/app:/bin/false\n';
    } }],
    ['ambiguous group', { changeEntries: entries => {
      entries.find(entry => entry.name === 'etc/group').data += 'other:x:10001:\n';
    } }],
  ];
  for (const [name, archiveOptions] of cases) await t.test(name, async () => run(async root => {
    const f = fixture(root, {}, archiveOptions);
    await assert.rejects(prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
      targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: f.apiId,
      evidenceDirectory: root }, f.dependencies));
    assert.equal(fs.existsSync(path.join(root, `${runId}.runtime.env`)), false);
    assert.equal(fs.existsSync(path.join(root, `${runId}.execution-config.json`)), false);
  }));
});

test('rejects API identity drift, writable material mounts, and malformed physical-schema readback before writing', async t => {
  await t.test('wrong API ID', async () => run(async root => {
    const f = fixture(root);
    await assert.rejects(prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
      targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: id('b'), evidenceDirectory: root }, f.dependencies));
    assert.equal(fs.existsSync(path.join(root, `${runId}.runtime.env`)), false);
  }));
  await t.test('writable bind mount', async () => run(async root => {
    const f = fixture(root);
    f.api.Mounts[0].RW = true;
    f.target.containers[0].configSha256 = containerFingerprint(f.api);
    f.target.mountsSha256 = objectDigest(canonicalMounts(f.api.Mounts));
    fs.unlinkSync(f.targetFile.filename);
    f.targetFile = protectedJson(root, 'target.json', f.target);
    f.dependencies.read = async entry => {
      if (entry.args?.[0] === 'inspect') return JSON.stringify([entry.args[1] === f.apiId ? f.api : f.database]);
      return f.read(entry);
    };
    await assert.rejects(prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
      targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: f.apiId, evidenceDirectory: root }, f.dependencies));
    assert.equal(fs.existsSync(path.join(root, `${runId}.runtime.env`)), false);
  }));
  await t.test('invalid schema digest', async () => run(async root => {
    const f = fixture(root);
    f.dependencies.read = async entry => entry.input === physicalSchemaSql ? 'not-a-digest' : f.read(entry);
    await assert.rejects(prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
      targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: f.apiId, evidenceDirectory: root }, f.dependencies));
    assert.equal(fs.existsSync(path.join(root, `${runId}.execution-config.json`)), false);
  }));
});

test('no-clobber preserves existing files and environment parser rejects duplicates or multiline values', async t => {
  await t.test('artifact collision', async () => run(async root => {
    const f = fixture(root);
    const collision = path.join(root, `${runId}.runtime.env`);
    fs.writeFileSync(collision, 'keep', { flag: 'wx', mode: 0o600 });
    await assert.rejects(prepareExecutionInputs({ bindingFile: f.bindingFile.filename, bindingSha256: f.bindingFile.sha256,
      targetFile: f.targetFile.filename, targetSha256: f.targetFile.sha256, runId, apiId: f.apiId, evidenceDirectory: root }, f.dependencies));
    assert.equal(fs.readFileSync(collision, 'utf8'), 'keep');
  }));
  assert.throws(() => protectedEnvText(['TOKEN=first', 'TOKEN=second']));
  assert.throws(() => protectedEnvText(['TOKEN=line1\nline2']));
});

test('CLI parser accepts only one complete option set', () => {
  const args = ['--binding', '/private/binding.json', '--binding-sha256', 'a'.repeat(64),
    '--target', '/private/target.json', '--target-sha256', 'b'.repeat(64), '--run-id', runId,
    '--api-id', id('c'), '--evidence-directory', '/private/evidence'];
  assert.equal(parseArguments(args).runId, runId);
  assert.equal(parseArguments([...args, '--listing-ai-profile', 'staging-mock-v1']).listingAiProfile, 'staging-mock-v1');
  assert.throws(() => parseArguments([...args, '--listing-ai-profile', 'openai']));
  assert.throws(() => parseArguments([...args, '--run-id', runId]));
  assert.throws(() => parseArguments(args.slice(0, -2)));
});
