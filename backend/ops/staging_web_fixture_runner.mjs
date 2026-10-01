#!/usr/bin/env node
// Host Git/Docker authority; never a manifest/env replacement for Git verification.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, readdirSync, realpathSync, mkdirSync, chownSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adapterSources, readAdapterSource, parseAdapterArguments } from './staging_web_fixture_adapter.mjs';
import { fixtureDigest, fixtureEnvironmentDigest, readPrivateFixtureInput, validateFixtureManifest,
  validateFixtureEnvironment, fixturePhotoBytesValid, validateFixturePhotoContent, fixturePhotoFileName } from './staging_web_fixture_preflight.mjs';
import { readStablePrivateFile, writeExclusivePrivateFile } from './stable_private_file.mjs';
import { fixtureDraftScope } from './staging_web_fixture_draft.mjs';
import { buildFixtureBootstrapManifest, validateFixtureBootstrap, readBootstrapPasswords, dedicatedFixture } from './staging_web_fixture_bootstrap.mjs';

const root = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const codeRoot = '/app/fixture-source';
const inputRoot = '/run/sit-fixture-input';
const apiName = 'shareittoo-staging-api';
const dbName = 'sit-green-postgres-20260918011528-wp254';
const networkName = 'sit-green-network-20260918011528-wp254';
const uploadsName = 'sit-green-uploads-20260918011528-wp254';
const envFile = '/docker/shareittoo/ops/green.env';
const uid = 100; const gid = 101;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (value, code) => { if (!value) throw Object.assign(Error(code), { code }); };
const exact = (value, keys) => check(value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), 'fixture_runner_shape');
const environmentOf = (entries) => {
  const result = {};
  for (const entry of entries) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/us.exec(entry);
    check(match && !Object.hasOwn(result, match[1]), 'fixture_runner_env_shape'); result[match[1]] = match[2];
  }
  return result;
};

// Complete runtime source tree (including transitive legal/domain imports), not
// merely a claimed commit or the adapter's direct dependencies. No symlinks.
export function fixtureRunnerTree(directory) {
  const entries = [];
  const visit = (base, prefix) => {
    check(lstatSync(base).isDirectory() && !lstatSync(base).isSymbolicLink(), 'fixture_runner_source_path');
    for (const name of readdirSync(base).sort()) {
      const path = resolve(base, name); const meta = lstatSync(path);
      check(!meta.isSymbolicLink(), 'fixture_runner_source_path');
      if (meta.isDirectory()) visit(path, `${prefix}${name}/`);
      else {
        check(meta.isFile(), 'fixture_runner_source_path');
        entries.push([`${prefix}${name}`, hash(readStablePrivateFile(path, {
          encoding: null, mode: 0, code: 'fixture_runner_source_path',
        }))]);
      }
    }
  };
  visit(directory, ''); return fixtureDigest(entries);
}

export function verifyFixtureRunnerSourceFiles({ source, sourceRoot, runtimeBackend, runtimeTreeDigest }) {
  check(fixtureRunnerTree(resolve(runtimeBackend, 'src')) === runtimeTreeDigest
    && fixtureRunnerTree(resolve(sourceRoot, 'backend/src')) === runtimeTreeDigest, 'fixture_runner_runtime_source_drift');
  for (const [path, digest] of Object.entries(source.hashes)) check(hash(readStablePrivateFile(resolve(sourceRoot, path), {
    encoding: null, mode: 0, code: 'fixture_runner_source_path',
  })) === digest, 'fixture_runner_source_bytes_drift');
  const directory = resolve(runtimeBackend, 'sql/migrations');
  const ledger = readdirSync(directory).filter((name) => name.endsWith('.up.sql')).sort()
    .map((name) => ({ name, checksum: hash(readStablePrivateFile(resolve(directory, name), {
      encoding: null, mode: 0, code: 'fixture_runner_source_path',
    })) }));
  check(ledger.length === 100 && source.schemaCount === 100 && fixtureDigest(ledger) === source.ledgerDigest, 'fixture_runner_ledger_drift');
}

export function fixtureRunnerFingerprint(record) {
  return fixtureDigest({ Id: record.Id, Name: record.Name, Image: record.Image, Config: record.Config,
    HostConfig: record.HostConfig, Running: record.State?.Running,
    Mounts: [...(record.Mounts ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    Networks: record.NetworkSettings?.Networks, Ports: record.NetworkSettings?.Ports });
}

export function assertFixtureRunnerReadableSources(directory = root) {
  const verify = (path, recursive = false) => {
    const meta = lstatSync(path);
    check(!meta.isSymbolicLink() && (meta.mode & 0o022) === 0, 'fixture_runner_source_permissions');
    if (meta.isDirectory()) {
      check((meta.mode & 0o005) === 0o005, 'fixture_runner_source_permissions');
      if (recursive) for (const name of readdirSync(path)) verify(resolve(path, name), true);
    } else check(meta.isFile() && (meta.mode & 0o004) !== 0, 'fixture_runner_source_permissions');
  };
  for (const path of adapterSources.filter((name) => name.startsWith('backend/ops/'))) verify(resolve(directory, path));
  verify(resolve(directory, 'backend/src'), true);
}

export function validateFixtureRunnerBinding(binding, source, now = Date.now()) {
  const draft = binding?.kind === 'sit-green-web-fixture-draft';
  exact(binding, ['kind', 'schemaVersion', 'createdAt', 'opsCommit', 'runtimeCommit', 'imageDigest',
    'apiId', 'apiFingerprint', 'databaseId', 'databaseFingerprint', 'networkId',
    'envSha256', ...(draft ? ['photoSha256'] : ['inputDirectory', 'adapterFile', 'adapterFileSha256'])]);
  check((draft || ['sit-green-web-fixture-runner', 'sit-green-web-fixture-bootstrap'].includes(binding.kind)) && binding.schemaVersion === 1
    && Number.isFinite(Date.parse(binding.createdAt)) && now - Date.parse(binding.createdAt) >= 0
    && now - Date.parse(binding.createdAt) <= 3600000, 'fixture_runner_binding_stale');
  check(binding.opsCommit === source.commit && /^[a-f0-9]{40}$/u.test(source.commit)
    && /^[a-f0-9]{40}$/u.test(binding.runtimeCommit)
    && /^sha256:[a-f0-9]{64}$/u.test(binding.imageDigest), 'fixture_runner_source_binding');
  for (const key of ['apiId', 'apiFingerprint', 'databaseId', 'databaseFingerprint', 'networkId', 'envSha256', draft ? 'photoSha256' : 'adapterFileSha256'])
    check(/^[a-f0-9]{64}$/u.test(binding[key]), 'fixture_runner_digest');
  if (!draft) check(binding.inputDirectory.startsWith('/docker/shareittoo/evidence/')
    && resolve(binding.inputDirectory) === binding.inputDirectory && !binding.inputDirectory.includes(',')
    && dirname(binding.adapterFile) === binding.inputDirectory, 'fixture_runner_input_scope');
}

export function validateFixtureRunnerInventory({ binding, api, database, network, volume, image, envBytes }) {
  const reference = `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}`;
  check(api.Id === binding.apiId && api.Name === `/${apiName}` && api.State?.Running === true
    && fixtureRunnerFingerprint(api) === binding.apiFingerprint && api.Config.Image === reference
    && api.Image === image.Id && api.Config.User === 'shareittoo', 'fixture_runner_api_drift');
  check(image.Config?.Labels?.['org.opencontainers.image.revision'] === binding.runtimeCommit
    && image.Config?.User === 'shareittoo' && image.RepoDigests?.includes(`ghcr.io/shareittoo/shareittoo-api@${binding.imageDigest}`)
    && environmentOf(image.Config.Env).APP_COMMIT === binding.runtimeCommit, 'fixture_runner_image_drift');
  check(database.Id === binding.databaseId && database.Name === `/${dbName}` && database.State?.Running === true
    && fixtureRunnerFingerprint(database) === binding.databaseFingerprint
    && !Object.values(database.NetworkSettings?.Ports ?? {}).flat().some(Boolean), 'fixture_runner_database_drift');
  check(network.Id === binding.networkId && network.Name === networkName && network.Internal === true
    && api.NetworkSettings?.Networks?.[networkName]?.NetworkID === network.Id
    && database.NetworkSettings?.Networks?.[networkName]?.NetworkID === network.Id,
  'fixture_runner_network_drift');
  check(volume.Name === uploadsName && volume.Driver === 'local' && !Object.keys(volume.Options ?? {}).length
    && api.Mounts?.filter((m) => m.Destination === '/data/uploads' && m.Type === 'volume' && m.Name === uploadsName).length === 1,
  'fixture_runner_uploads_drift');
  check(hash(envBytes) === binding.envSha256, 'fixture_runner_env_drift');
  const values = environmentOf(envBytes.toString().split(/\r?\n/u).filter((line) => line && !line.startsWith('#')));
  check(!['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME', 'NODE_OPTIONS', 'LD_PRELOAD'].some((key) => Object.hasOwn(values, key)), 'fixture_runner_env_identity_override');
  const current = environmentOf(api.Config.Env);
  check(Object.entries(values).every(([key, value]) => current[key] === value), 'fixture_runner_env_runtime_drift');
  const expected = { ...environmentOf(image.Config.Env), ...values };
  check(expected.UPLOAD_DIR === undefined || expected.UPLOAD_DIR === '/data/uploads', 'fixture_runner_upload_path');
  return expected;
}

function privateRuntimeInput(path, maxBytes = 65536) {
  check(resolve(path) === path && !path.includes(','), 'fixture_runner_private_path');
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const meta = lstatSync(parent);
    check(meta.isDirectory() && !meta.isSymbolicLink(), 'fixture_runner_private_parent');
    if (parent === dirname(path)) check(meta.uid === uid && meta.gid === gid && (meta.mode & 0o777) === 0o700, 'fixture_runner_private_owner');
    if (parent === dirname(parent)) break;
  }
  return readStablePrivateFile(path, { encoding: null, expectedMode: 0o600, expectedUid: uid, expectedGid: gid, minBytes: 1, maxBytes });
}

export function buildFixtureRunnerLaunch({ binding, source, runtimeTreeDigest, args, name, nonce, draftPhoto }) {
  check(/^sit-web-fixture-[a-f0-9]{24}$/u.test(name) && /^[a-f0-9]{24}$/u.test(nonce), 'fixture_runner_name');
  const mounts = [
    ...adapterSources.filter((path) => path.startsWith('backend/ops/')).map((path) => `type=bind,src=${resolve(root, path)},dst=${codeRoot}/${path},readonly`),
    `type=bind,src=${resolve(root, 'backend/src')},dst=${codeRoot}/backend/src,readonly`,
    ...(draftPhoto ? [] : [`type=bind,src=${binding.inputDirectory},dst=${inputRoot},readonly`]),
    `type=volume,src=${uploadsName},dst=/data/uploads${binding.kind === 'sit-green-web-fixture-bootstrap' && args.execute === true ? '' : ',readonly'}`,
  ];
  // These assertions originate from clean host Git plus immutable Docker
  // readbacks, never from an env-provided source override. Rehash before imports.
  const input = { binding, source, runtimeTreeDigest, args: { ...args, file: `${inputRoot}/adapter.json` }, draftPhoto };
  const bootstrap = `
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const input = ${JSON.stringify(input)};
const hash = ${hash.toString()}; const check = ${check.toString()};
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const fixtureDigest = (value) => hash(JSON.stringify(canonical(value)));
const fixtureRunnerTree = ${fixtureRunnerTree.toString()};
const verifySource = ${verifyFixtureRunnerSourceFiles.toString()};
try {
  check(process.getuid() === 100 && process.getgid() === 101 && process.env.APP_COMMIT === input.binding.runtimeCommit, 'fixture_runner_runtime_identity');
  verifySource({ source: input.source, sourceRoot: '${codeRoot}', runtimeBackend: '/app', runtimeTreeDigest: input.runtimeTreeDigest });
  const pre = await import('${codeRoot}/backend/ops/staging_web_fixture_preflight.mjs');
  const adapter = await import('${codeRoot}/backend/ops/staging_web_fixture_adapter.mjs');
  const { Pool } = await import('pg');
  if (input.draftPhoto) {
    const { generateFixtureDraft } = await import('${codeRoot}/backend/ops/staging_web_fixture_draft.mjs');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try { const client = await pool.connect(); try {
      const draft = await generateFixtureDraft({ source: input.source, environment: process.env, photo: input.draftPhoto, client });
      process.stdout.write(JSON.stringify({ status: 'draft-generated-read-only', runtimeActivated: false,
        sourceCommit: input.source.commit, manifestDigest: hash(JSON.stringify(draft)), draft }) + '\\n');
    } finally { client.release(); } } finally { await pool.end(); }
  } else {
  const bytes = pre.readPrivateFixtureInput(input.args.file);
  check(hash(bytes) === input.args.fileHash, 'fixture_runner_manifest_drift');
  const manifest = JSON.parse(bytes);
  if (input.binding.kind === 'sit-green-web-fixture-bootstrap') {
    const seed = await import('${codeRoot}/backend/ops/staging_web_fixture_bootstrap.mjs');
    const request = { ...input.args, manifest, source: input.source, environment: process.env,
      passwords: seed.readBootstrapPasswords('${inputRoot}'),
      photoBytes: pre.readPrivateFixtureInput('${inputRoot}/photo.webp', { maxBytes: 8388608 }),
      files: seed.bootstrapFileStore('/data/uploads', manifest) };
    seed.validateFixtureBootstrap(request);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL,
      options: input.args.execute === true ? undefined : '-c default_transaction_read_only=on' });
    try { const client = await pool.connect(); try {
      process.stdout.write(JSON.stringify(await seed.runFixtureBootstrap({ ...request, client })) + '\\n');
    } finally { client.release(); } } finally { await pool.end(); }
  } else {
  const request = { ...input.args, manifest, manifestHash: hash(Buffer.from(JSON.stringify(manifest))), source: input.source, environment: process.env,
    photoBytes: pre.readPrivateFixtureInput(manifest.preflight.photo.file, { maxBytes: 8388608 }), storedPhotoBytes: adapter.readAdapterStoredPhoto(manifest, process.env) };
  adapter.validateAdapterInputs(request);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { const client = await pool.connect(); try { process.stdout.write(JSON.stringify(await adapter.runFixtureAdapter({ ...request, client })) + '\\n'); } finally { client.release(); } } finally { await pool.end(); }
  }
  }
} catch { process.stderr.write('fixture_runner_child_failed\\n'); process.exitCode = 1; }
`;
  return { command: 'docker', args: ['create', '--pull=never', '--log-driver', 'none', '--name', name, '--label', `com.shareittoo.fixture-runner=${nonce}`,
    '--user', '100:101', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--network', binding.networkId, '--env-file', envFile, ...mounts.flatMap((mount) => ['--mount', mount]),
    '--entrypoint', 'node', `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}`,
    '--input-type=module', '-e', bootstrap], bootstrap, mounts };
}

export function assertFixtureRunnerContainer({ runner, id, name, nonce, binding, image, launch, expectedEnv }) {
  const expectedMounts = launch.mounts.map((mount) => Object.fromEntries(mount.split(',').map((part) => part.includes('=') ? part.split('=') : [part, true])));
  check(runner.Id === id && runner.Name === `/${name}` && runner.State?.Running === false
    && runner.Config?.Labels?.['com.shareittoo.fixture-runner'] === nonce
    && runner.Config?.Image === `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}` && runner.Image === image.Id
    && runner.Config.User === '100:101' && runner.HostConfig?.ReadonlyRootfs === true && runner.HostConfig.Privileged === false
    && JSON.stringify(runner.HostConfig.CapDrop) === JSON.stringify(['ALL']) && !runner.HostConfig.CapAdd?.length
    && runner.HostConfig.SecurityOpt?.includes('no-new-privileges')
    && runner.HostConfig.LogConfig?.Type === 'none'
    && runner.HostConfig.NetworkMode === binding.networkId
    && JSON.stringify(Object.keys(runner.NetworkSettings?.Networks ?? {})) === JSON.stringify([networkName])
    && Object.keys(runner.HostConfig.PortBindings ?? {}).length === 0 && !runner.HostConfig.Devices?.length
    && runner.Config.Entrypoint?.length === 1 && runner.Config.Entrypoint[0] === 'node'
    && JSON.stringify(runner.Config.Cmd) === JSON.stringify(['--input-type=module', '-e', launch.bootstrap]),
  'fixture_runner_container_drift');
  check(runner.Mounts?.length === expectedMounts.length && expectedMounts.every((expected) =>
    runner.Mounts.filter((actual) => actual.Type === expected.type && actual.Destination === expected.dst && actual.RW === !expected.readonly
      && (expected.type === 'volume' ? actual.Name === expected.src : actual.Source === expected.src)).length === 1), 'fixture_runner_mount_drift');
  check(fixtureEnvironmentDigest(environmentOf(runner.Config.Env)) === fixtureEnvironmentDigest(expectedEnv), 'fixture_runner_child_env_drift');
}

const docker = (args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000 });
  check(!result.error && result.status === 0, 'fixture_runner_docker_failed'); return result.stdout.trim();
};
const inspect = (id) => JSON.parse(docker(['inspect', '--format', '{{json .}}', id]));

const adapterResultStatuses = Object.freeze({
  activate: Object.freeze({
    readOnly: Object.freeze(['preflight-passed-no-mutation', 'already-prepared-runtime-still-blocked']),
    execute: Object.freeze(['database-prepared-runtime-still-blocked', 'already-prepared-runtime-still-blocked']),
  }),
  cleanup: Object.freeze({
    readOnly: Object.freeze(['preflight-passed-no-mutation', 'already-cleaned']),
    execute: Object.freeze(['cleaned-noncatalogued-audits-retained', 'already-cleaned']),
  }),
});

export function validateFixtureRunnerAdapterResult({ result, manifest, args, source }) {
  const mode = args?.execute === false ? 'readOnly' : args?.execute === true ? 'execute' : null;
  const allowed = adapterResultStatuses[manifest?.operation]?.[mode];
  check(Array.isArray(allowed) && result?.operation === manifest.operation
    && allowed.includes(result.status) && result.runtimeActivated === false
    && result.sourceCommit === source.commit
    && /^[a-f0-9]{64}$/u.test(result.manifestDigest)
    && /^[a-f0-9]{64}$/u.test(result.activationDigest), 'fixture_runner_result_invalid');
}

export async function runFixtureContainer({ binding, args, source = readAdapterSource(), command = docker,
  inspectRecord = inspect, readInput = privateRuntimeInput, readEnv = () => readStablePrivateFile(envFile, { encoding: null, expectedMode: 0o600, expectedUid: 0 }),
  runtimeTreeDigest = fixtureRunnerTree(resolve(root, 'backend/src')), inputNames = () => readdirSync(binding.inputDirectory),
  assertSourceReadable = assertFixtureRunnerReadableSources, draftPhoto, readPasswords = readBootstrapPasswords }) {
  validateFixtureRunnerBinding(binding, source);
  check(Boolean(draftPhoto) === (binding.kind === 'sit-green-web-fixture-draft'), 'fixture_runner_mode_binding');
  assertSourceReadable();
  const envBytes = readEnv();
  const inventory = { binding, api: inspectRecord(binding.apiId), database: inspectRecord(binding.databaseId),
    network: inspectRecord(binding.networkId), volume: inspectRecord(uploadsName),
    image: JSON.parse(command(['image', 'inspect', '--format', '{{json .}}', `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}`])), envBytes };
  const expectedEnv = validateFixtureRunnerInventory(inventory);
  let manifest;
  if (draftPhoto) {
    check(args.execute === false && args.confirmSource === undefined && args.confirmRun === undefined
      && draftPhoto.sha256 === binding.photoSha256, 'fixture_runner_draft_read_only');
    fixtureDraftScope({ source, environment: expectedEnv, photo: draftPhoto });
  } else {
  check(args.file === binding.adapterFile && args.fileHash === binding.adapterFileSha256, 'fixture_runner_adapter_binding');
  const bytes = readInput(args.file); check(hash(bytes) === args.fileHash, 'fixture_runner_adapter_binding');
  manifest = JSON.parse(bytes); validateFixtureManifest(manifest.preflight);
  const bootstrap = binding.kind === 'sit-green-web-fixture-bootstrap';
  if (bootstrap) {
    const passwords = readPasswords(binding.inputDirectory);
    validateFixtureBootstrap({ ...args, manifest, source, environment: expectedEnv, passwords });
    check(fixtureDigest(JSON.parse(readInput(`${binding.inputDirectory}/credentials.json`)))
      === fixtureDigest(bootstrapCredentials(bytes, passwords)), 'fixture_runner_credential_evidence_drift');
  }
  else { check(manifest.kind === 'sit-staging-web-fixture-adapter', 'fixture_runner_mode_binding');
    validateFixtureEnvironment(manifest.preflight, expectedEnv); }
  check(manifest.sourceCommit === source.commit && fixtureDigest(manifest.sourceHashes) === fixtureDigest(source.hashes)
    && manifest.ledgerDigest === source.ledgerDigest && manifest.schemaCount === source.schemaCount,
  'fixture_runner_adapter_source');
  check(!args.execute || (args.confirmSource === source.commit && args.confirmRun === manifest.preflight.runId), 'fixture_runner_confirm');
  check(args.execute || (args.confirmSource === undefined && args.confirmRun === undefined), 'fixture_runner_confirm');
  const photoName = fixturePhotoFileName(manifest.preflight.photo);
  check(manifest.preflight.photo.file === `${inputRoot}/${photoName}` && basename(args.file) === 'adapter.json', 'fixture_runner_photo_scope');
  check(hash(readInput(`${binding.inputDirectory}/${photoName}`, 8388608)) === manifest.preflight.photo.sha256, 'fixture_runner_photo_hash');
  check(fixtureDigest(inputNames().sort()) === fixtureDigest(['adapter.json', photoName,
    ...(bootstrap ? ['credentials.json', 'owner.password', 'renter.password'] : [])].sort()), 'fixture_runner_input_directory_scope');
  }
  const nonce = randomBytes(12).toString('hex'); const name = `sit-web-fixture-${nonce}`;
  const launch = buildFixtureRunnerLaunch({ binding, source, runtimeTreeDigest, args, name, nonce, draftPhoto });
  let id; let result; let failure;
  try {
    id = command(launch.args); check(/^[a-f0-9]{64}$/u.test(id), 'fixture_runner_container_id');
    const runner = inspectRecord(id);
    assertFixtureRunnerContainer({ runner, id, name, nonce, binding, image: inventory.image, launch, expectedEnv });
    check(fixtureRunnerFingerprint(inspectRecord(binding.apiId)) === binding.apiFingerprint
      && fixtureRunnerFingerprint(inspectRecord(binding.databaseId)) === binding.databaseFingerprint
      && hash(readEnv()) === binding.envSha256, 'fixture_runner_prestart_drift');
    result = JSON.parse(command(['start', '--attach', id]));
    if (draftPhoto) {
      check(result.status === 'draft-generated-read-only' && result.runtimeActivated === false && result.sourceCommit === source.commit
        && hash(JSON.stringify(result.draft)) === result.manifestDigest, 'fixture_runner_draft_result');
      validateFixtureManifest(result.draft.preflight); validateFixtureEnvironment(result.draft.preflight, expectedEnv);
      check(result.draft.sourceCommit === source.commit && fixtureDigest(result.draft.sourceHashes) === fixtureDigest(source.hashes)
        && result.draft.ledgerDigest === source.ledgerDigest && result.draft.schemaCount === 100
        && fixtureDigest(result.draft.preflight.photo) === fixtureDigest({ ...draftPhoto, file: `${inputRoot}/${fixturePhotoFileName(draftPhoto)}` }), 'fixture_runner_draft_result');
    } else if (binding.kind === 'sit-green-web-fixture-bootstrap') {
      exact(result, ['status', 'runtimeActivated']);
      check(result.runtimeActivated === false && ['preflight-passed-no-mutation', 'dedicated-seed-already-prepared-runtime-blocked',
        ...(args.execute ? ['dedicated-seed-prepared-runtime-blocked', 'dedicated-seed-cleaned'] : [])].includes(result.status),
      'fixture_runner_bootstrap_result_invalid');
    } else {
    validateFixtureRunnerAdapterResult({ result, manifest, args, source });
    }
  } catch (error) { failure = error; }
  finally {
    if (!/^[a-f0-9]{64}$/u.test(id ?? '')) {
      const found = command(['ps', '--all', '--filter', `label=com.shareittoo.fixture-runner=${nonce}`, '--format', '{{.ID}}']);
      check(found === '' || /^[a-f0-9]{64}$/u.test(found), 'fixture_runner_ambiguous_creation');
      if (found) id = found;
    }
    if (id && /^[a-f0-9]{64}$/u.test(id)) {
      const owned = inspectRecord(id);
      check(owned.Id === id && owned.Name === `/${name}` && owned.Config?.Labels?.['com.shareittoo.fixture-runner'] === nonce, 'fixture_runner_cleanup_ownership');
      command(['rm', '--force', '--volumes', id]);
      check(command(['ps', '--all', '--filter', `id=${id}`, '--format', '{{.ID}}']) === '', 'fixture_runner_cleanup_failed');
    }
  }
  if (failure) throw failure;
  check(fixtureRunnerFingerprint(inspectRecord(binding.apiId)) === binding.apiFingerprint
    && fixtureRunnerFingerprint(inspectRecord(binding.databaseId)) === binding.databaseFingerprint
    && hash(readEnv()) === binding.envSha256, 'fixture_runner_final_witness_drift');
  if (draftPhoto) return result.draft; // Private return to exclusive writer, never logged.
  if (binding.kind === 'sit-green-web-fixture-bootstrap') return { ...result, cleanup: 'verified' };
  return { status: result.status, runtimeActivated: false, opsCommit: source.commit,
    runtimeCommit: binding.runtimeCommit, imageDigest: binding.imageDigest,
    manifestDigest: result.manifestDigest, activationDigest: result.activationDigest, cleanup: 'verified' };
}

export function prepareFixtureRunnerInput({ manifest: draft, photoBytes, source }) {
  check(draft?.kind === 'sit-staging-web-fixture-adapter' && draft.schemaVersion === 1
    && ['activate', 'cleanup'].includes(draft.operation) && source.schemaCount === 100, 'fixture_runner_input_manifest');
  check(fixturePhotoBytesValid(draft.preflight?.photo, photoBytes), 'fixture_runner_input_photo');
  // Canonical in-container path stays byte-identical across activation/cleanup;
  // fresh host directories must never silently change the audit scope.
  const photoName = fixturePhotoFileName(draft.preflight.photo);
  if (draft.operation === 'cleanup') check(draft.preflight.photo.file === `${inputRoot}/${photoName}`
    && /^[a-f0-9]{64}$/u.test(draft.activationDigest), 'fixture_runner_cleanup_input_scope');
  const manifest = structuredClone(draft);
  Object.assign(manifest, { sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: source.schemaCount, ledgerDigest: source.ledgerDigest });
  manifest.preflight.photo.file = `${inputRoot}/${photoName}`;
  validateFixtureManifest(manifest.preflight);
  // Never refresh createdAt/snapshot/environment or invent media provenance.
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

export function buildFixtureRunnerBinding({ source, api, database, network, volume, image, envBytes, inputDirectory, adapterBytes, draftPhoto, passwords }) {
  const match = /^ghcr\.io\/shareittoo\/shareittoo-api:([a-f0-9]{40})@(sha256:[a-f0-9]{64})$/u.exec(api.Config?.Image ?? '');
  check(match, 'fixture_runner_current_image');
  const manifest = draftPhoto ? null : JSON.parse(adapterBytes);
  const bootstrap = manifest?.kind === 'sit-dedicated-web-fixture-bootstrap';
  if (bootstrap) check(manifest.schemaVersion === 2, 'fixture_runner_mode_binding');
  const binding = { kind: draftPhoto ? 'sit-green-web-fixture-draft' : bootstrap ? 'sit-green-web-fixture-bootstrap' : 'sit-green-web-fixture-runner', schemaVersion: 1, createdAt: new Date().toISOString(),
    opsCommit: source.commit, runtimeCommit: match[1], imageDigest: match[2], apiId: api.Id,
    apiFingerprint: fixtureRunnerFingerprint(api), databaseId: database.Id, databaseFingerprint: fixtureRunnerFingerprint(database),
    networkId: network.Id, envSha256: hash(envBytes), ...(draftPhoto ? { photoSha256: draftPhoto.sha256 } : { inputDirectory,
      adapterFile: `${inputDirectory}/adapter.json`, adapterFileSha256: hash(adapterBytes) }) };
  validateFixtureRunnerBinding(binding, source);
  const environment = validateFixtureRunnerInventory({ binding, api, database, network, volume, image, envBytes });
  if (draftPhoto) { fixtureDraftScope({ source, environment, photo: draftPhoto }); return binding; }
  validateFixtureManifest(manifest.preflight);
  if (bootstrap) validateFixtureBootstrap({ manifest, source, environment, passwords });
  else { check(manifest.kind === 'sit-staging-web-fixture-adapter', 'fixture_runner_mode_binding');
    validateFixtureEnvironment(manifest.preflight, environment); }
  check(manifest.sourceCommit === source.commit && fixtureDigest(manifest.sourceHashes) === fixtureDigest(source.hashes)
    && manifest.ledgerDigest === source.ledgerDigest && manifest.schemaCount === source.schemaCount
    && manifest.preflight.photo.file === `${inputRoot}/${fixturePhotoFileName(manifest.preflight.photo)}`, 'fixture_runner_adapter_source');
  return binding;
}

function assertOutputParent(path) {
  check(resolve(path) === path && path.startsWith('/docker/shareittoo/evidence/') && !path.includes(','), 'fixture_runner_output_path');
  const parent = lstatSync(dirname(path));
  check(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === 0 && (parent.mode & 0o777) === 0o700,
    'fixture_runner_output_parent');
  check(realpathSync(dirname(path)) === dirname(path), 'fixture_runner_output_parent');
}

function bootstrapCredentials(manifestBytes, passwords) {
  const manifest = JSON.parse(manifestBytes);
  return { kind: 'sit-private-dedicated-fixture-credentials', sourceCommit: manifest.sourceCommit,
    runId: manifest.preflight.runId, manifestSha256: hash(manifestBytes),
    accounts: [dedicatedFixture.owner, dedicatedFixture.renter].map((id, i) => ({ id, email: `${id}@example.invalid`, password: passwords[i] })) };
}

// Returns private bytes only to the exclusive writer, never stdout. All caller
// assertions are checked against actual immutable runtime inventory before IO.
export async function prepareBootstrapRunnerInput({ source, inventory, photo, photoBytes, inputDirectory,
  previous, operation = 'seed' }) {
  const environment = { ...environmentOf(inventory.image.Config.Env),
    ...environmentOf(inventory.envBytes.toString().split(/\r?\n/u).filter((line) => line && !line.startsWith('#'))) };
  const passwords = previous?.passwords ?? [0, 1].map(() => `Sit9-${randomBytes(40).toString('base64url')}`);
  let manifest;
  if (previous) {
    check(['seed', 'cleanup'].includes(operation) && previous.manifest.sourceCommit === source.commit
      && fixtureDigest(previous.manifest.sourceHashes) === fixtureDigest(source.hashes)
      && fixtureDigest(previous.manifest.preflight.photo) === fixtureDigest({ ...photo, file: `${inputRoot}/photo.webp` }),
    'fixture_runner_bootstrap_refresh_scope');
    manifest = structuredClone(previous.manifest); manifest.operation = operation;
    Object.assign(manifest.preflight, { createdAt: new Date().toISOString(), runtimeCommit: environment.APP_COMMIT,
      environmentDigest: fixtureEnvironmentDigest(environment) });
  } else {
    check(operation === 'seed', 'fixture_runner_bootstrap_refresh_scope');
    manifest = buildFixtureBootstrapManifest({ source, environment, photo, passwords,
      runId: `web-fixture-${randomBytes(12).toString('hex')}` });
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  buildFixtureRunnerBinding({ ...inventory, source, inputDirectory, adapterBytes: manifestBytes, passwords });
  await validateFixturePhotoContent(manifest.preflight.photo, photoBytes);
  return { 'adapter.json': manifestBytes, 'photo.webp': photoBytes,
    'owner.password': Buffer.from(passwords[0]), 'renter.password': Buffer.from(passwords[1]),
    'credentials.json': Buffer.from(`${JSON.stringify(bootstrapCredentials(manifestBytes, passwords), null, 2)}\n`) };
}

export function writeBootstrapRunnerInput(inputDirectory, files, io = {}) {
  const parent = io.assertParent ?? assertOutputParent; const mkdir = io.mkdir ?? mkdirSync;
  const chown = io.chown ?? chownSync; const write = io.write ?? writeExclusivePrivateFile;
  const read = io.read ?? privateRuntimeInput; const names = io.names ?? readdirSync;
  exact(files, ['adapter.json', 'photo.webp', 'owner.password', 'renter.password', 'credentials.json']);
  parent(inputDirectory); mkdir(inputDirectory, { mode: 0o700 }); chown(inputDirectory, uid, gid);
  for (const [name, bytes] of Object.entries(files)) {
    write(`${inputDirectory}/${name}`, bytes, { mode: 0o600, uid, gid });
    check(hash(read(`${inputDirectory}/${name}`, 8388608)) === hash(bytes), 'fixture_runner_private_readback');
  }
  check(fixtureDigest(names(inputDirectory).sort()) === fixtureDigest(Object.keys(files).sort()), 'fixture_runner_input_directory_scope');
}

function currentFixtureInventory() {
  const api = inspect(apiName); const database = inspect(dbName); const network = inspect(networkName); const volume = inspect(uploadsName);
  check(/^ghcr\.io\/shareittoo\/shareittoo-api:[a-f0-9]{40}@sha256:[a-f0-9]{64}$/u.test(api.Config?.Image ?? ''), 'fixture_runner_current_image');
  return { api, database, network, volume,
    image: JSON.parse(docker(['image', 'inspect', '--format', '{{json .}}', api.Config.Image])),
    envBytes: readStablePrivateFile(envFile, { encoding: null, expectedMode: 0o600, expectedUid: 0 }) };
}

async function main() {
  check(process.getuid() === 0 && Number(process.versions.node.split('.')[0]) >= 22, 'fixture_runner_host_required');
  const argv = process.argv.slice(2);
  if (argv[0] === '--prepare-bootstrap' || argv[0] === '--refresh-bootstrap') {
    const refresh = argv[0] === '--refresh-bootstrap';
    check(argv.length === (refresh ? 4 : 6), 'fixture_runner_arguments');
    const destination = argv.at(-1); assertOutputParent(destination);
    const source = readAdapterSource(); assertFixtureRunnerReadableSources();
    let photo; let photoBytes; let previous;
    if (refresh) {
      const bytes = privateRuntimeInput(`${argv[1]}/adapter.json`); const manifest = JSON.parse(bytes);
      check(manifest.kind === 'sit-dedicated-web-fixture-bootstrap' && manifest.schemaVersion === 2,
        'fixture_runner_mode_binding');
      const passwords = readBootstrapPasswords(argv[1]);
      check(fixtureDigest(JSON.parse(privateRuntimeInput(`${argv[1]}/credentials.json`))) === fixtureDigest(bootstrapCredentials(bytes, passwords)),
        'fixture_runner_credential_evidence_drift');
      previous = { manifest, passwords }; photo = manifest.preflight.photo;
      photoBytes = privateRuntimeInput(`${argv[1]}/photo.webp`, 8388608);
    } else {
      const bytes = readPrivateFixtureInput(argv[1]); check(hash(bytes) === argv[2], 'fixture_runner_private_binding');
      photo = JSON.parse(bytes); photoBytes = readPrivateFixtureInput(argv[3], { maxBytes: 8388608 });
      check(hash(photoBytes) === argv[4], 'fixture_runner_private_binding');
    }
    const inventory = currentFixtureInventory();
    const files = await prepareBootstrapRunnerInput({ source, inventory, photo, photoBytes, previous,
      operation: refresh ? argv[2] : 'seed', inputDirectory: destination });
    writeBootstrapRunnerInput(destination, files);
    process.stdout.write('{"status":"bootstrap-inputs-prepared-no-database"}\n'); return;
  }
  if (argv[0] === '--draft') {
    check(argv.length === 6, 'fixture_runner_arguments'); assertOutputParent(argv[5]);
    // Require absence before any Docker operation. Never overwrite an old draft.
    try { lstatSync(argv[5]); check(false, 'fixture_runner_draft_exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const metadataBytes = readPrivateFixtureInput(argv[1]); check(hash(metadataBytes) === argv[2], 'fixture_runner_private_binding');
    const photoBytes = readPrivateFixtureInput(argv[3], { maxBytes: 8388608 }); check(hash(photoBytes) === argv[4], 'fixture_runner_private_binding');
    const draftPhoto = JSON.parse(metadataBytes);
    check(fixturePhotoBytesValid(draftPhoto, photoBytes), 'fixture_runner_input_photo');
    const source = readAdapterSource(); assertFixtureRunnerReadableSources();
    const api = inspect(apiName); const database = inspect(dbName); const network = inspect(networkName); const volume = inspect(uploadsName);
    check(/^ghcr\.io\/shareittoo\/shareittoo-api:[a-f0-9]{40}@sha256:[a-f0-9]{64}$/u.test(api.Config?.Image ?? ''), 'fixture_runner_current_image');
    const image = JSON.parse(docker(['image', 'inspect', '--format', '{{json .}}', api.Config.Image]));
    const binding = buildFixtureRunnerBinding({ source, api, database, network, volume, image, draftPhoto,
      envBytes: readStablePrivateFile(envFile, { encoding: null, expectedMode: 0o600, expectedUid: 0 }) });
    await validateFixturePhotoContent(draftPhoto, photoBytes);
    const draft = await runFixtureContainer({ binding, args: { execute: false }, source, draftPhoto });
    const bytes = Buffer.from(`${JSON.stringify(draft, null, 2)}\n`); writeExclusivePrivateFile(argv[5], bytes, { uid: 0, gid: 0 });
    check(hash(readPrivateFixtureInput(argv[5])) === hash(bytes), 'fixture_runner_draft_file_drift');
    process.stdout.write(`${JSON.stringify({ status: 'draft-created-read-only', draftSha256: hash(bytes) })}\n`);
    return;
  }
  if (argv[0] === '--prepare-inputs') {
    check(argv.length === 6, 'fixture_runner_arguments');
    const draft = readPrivateFixtureInput(argv[1]); check(hash(draft) === argv[2], 'fixture_runner_private_binding');
    const photo = readPrivateFixtureInput(argv[3], { maxBytes: 8388608 }); check(hash(photo) === argv[4], 'fixture_runner_private_binding');
    const bytes = prepareFixtureRunnerInput({ manifest: JSON.parse(draft), photoBytes: photo, source: readAdapterSource() });
    const photoName = fixturePhotoFileName(JSON.parse(bytes).preflight.photo);
    assertOutputParent(argv[5]);
    mkdirSync(argv[5], { mode: 0o700 }); chownSync(argv[5], uid, gid);
    writeExclusivePrivateFile(`${argv[5]}/${photoName}`, photo, { uid, gid });
    writeExclusivePrivateFile(`${argv[5]}/adapter.json`, bytes, { uid, gid });
    privateRuntimeInput(`${argv[5]}/${photoName}`, 8388608); privateRuntimeInput(`${argv[5]}/adapter.json`);
    process.stdout.write(`${JSON.stringify({ status: 'private-inputs-prepared-no-database', adapterSha256: hash(bytes), photoSha256: hash(photo) })}\n`);
    return;
  }
  if (argv[0] === '--prepare-binding') {
    check(argv.length === 3, 'fixture_runner_arguments'); assertOutputParent(argv[2]);
    const source = readAdapterSource(); assertFixtureRunnerReadableSources();
    const api = inspect(apiName); const database = inspect(dbName); const network = inspect(networkName); const volume = inspect(uploadsName);
    check(/^ghcr\.io\/shareittoo\/shareittoo-api:[a-f0-9]{40}@sha256:[a-f0-9]{64}$/u.test(api.Config?.Image ?? ''), 'fixture_runner_current_image');
    const image = JSON.parse(docker(['image', 'inspect', '--format', '{{json .}}', api.Config.Image]));
    const adapterBytes = privateRuntimeInput(`${argv[1]}/adapter.json`);
    const manifest = JSON.parse(adapterBytes); const bootstrap = manifest.kind === 'sit-dedicated-web-fixture-bootstrap';
    if (bootstrap) check(manifest.schemaVersion === 2, 'fixture_runner_mode_binding');
    const passwords = bootstrap ? readBootstrapPasswords(argv[1]) : undefined;
    const binding = buildFixtureRunnerBinding({ source, api, database, network, volume, image, passwords,
      envBytes: readStablePrivateFile(envFile, { encoding: null, expectedMode: 0o600, expectedUid: 0 }),
      inputDirectory: argv[1], adapterBytes });
    if (bootstrap) check(fixtureDigest(JSON.parse(privateRuntimeInput(`${argv[1]}/credentials.json`)))
      === fixtureDigest(bootstrapCredentials(adapterBytes, passwords)), 'fixture_runner_credential_evidence_drift');
    const photoName = fixturePhotoFileName(manifest.preflight.photo);
    check(hash(privateRuntimeInput(`${argv[1]}/${photoName}`, 8388608)) === manifest.preflight.photo.sha256
      && JSON.stringify(readdirSync(argv[1]).sort()) === JSON.stringify(['adapter.json', photoName,
        ...(bootstrap ? ['credentials.json', 'owner.password', 'renter.password'] : [])].sort()), 'fixture_runner_input_directory_scope');
    const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`); writeExclusivePrivateFile(argv[2], bytes, { uid: 0, gid: 0 });
    process.stdout.write(`${JSON.stringify(bootstrap ? { status: 'bootstrap-binding-prepared-no-database' }
      : { status: 'binding-prepared-no-database', bindingSha256: hash(bytes), opsCommit: source.commit, runtimeCommit: binding.runtimeCommit })}\n`);
    return;
  }
  check(argv.length === 2 || argv.length === 5, 'fixture_runner_arguments');
  const bytes = readPrivateFixtureInput(argv[0]); check(hash(bytes) === argv[1], 'fixture_runner_private_binding');
  const binding = JSON.parse(bytes);
  const args = parseAdapterArguments([binding.adapterFile, binding.adapterFileSha256, ...argv.slice(2)]);
  // Neither manifest, environment nor argv can supply the Git source object.
  const result = await runFixtureContainer({ binding, args, source: readAdapterSource() });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(() => {
  process.stderr.write('fixture_runner_failed_no_automatic_retry\n'); process.exitCode = 1;
});
