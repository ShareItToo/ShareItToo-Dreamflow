import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { adapterSources } from '../ops/staging_web_fixture_adapter.mjs';
import { fixtureDigest, fixtureEnvironmentDigest, fixtureNotice, fixtureTarget } from '../ops/staging_web_fixture_preflight.mjs';
import { fixtureRunnerFingerprint, fixtureRunnerTree, verifyFixtureRunnerSourceFiles, validateFixtureRunnerBinding,
  validateFixtureRunnerInventory, buildFixtureRunnerLaunch, runFixtureContainer,
  assertFixtureRunnerReadableSources, prepareFixtureRunnerInput, buildFixtureRunnerBinding } from '../ops/staging_web_fixture_runner.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const networkName = 'sit-green-network-20260918011528-wp254';
const dbName = 'sit-green-postgres-20260918011528-wp254';
const uploadsName = 'sit-green-uploads-20260918011528-wp254';

function fixture() {
  const source = { commit: 'b'.repeat(40), schemaCount: 98, ledgerDigest: 'c'.repeat(64), hashes: Object.fromEntries(adapterSources.map((p) => [p, 'd'.repeat(64)])) };
  const environment = { DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: 'a'.repeat(40),
    DATABASE_URL: `postgres://shareittoo_green@${dbName}/shareittoo_green`, SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_ALLOWED_USER_IDS: 'synthetic-owner,synthetic-renter', SIT_STAGING_PUBLIC_LISTING_IDS: 'synthetic-listing',
    SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'fixture.jpg', PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory' };
  const directory = '/docker/shareittoo/evidence/fixture-input';
  const photoBytes = Buffer.from([255, 216, 255, 0, 3]);
  const preflight = { kind: 'sit-staging-web-two-role-preflight', schemaVersion: 1, target: fixtureTarget,
    createdAt: new Date().toISOString(), runId: 'web-fixture-runner-synthetic', runtimeCommit: environment.APP_COMMIT,
    environmentDigest: fixtureEnvironmentDigest(environment), snapshotDigest: 'e'.repeat(64),
    database: { host: dbName, name: 'shareittoo_green', user: 'shareittoo_green' },
    roles: ['owner', 'renter'].map((role) => ({ role, userId: `synthetic-${role}`, syntheticMarker: 'test' })),
    listingId: 'synthetic-listing', uploadName: 'fixture.jpg', region: 'heilbronn', fixtureClass: 'synthetic_noncontractual_catalog_only',
    notice: fixtureNotice, realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
    availabilityDigest: 'f'.repeat(64), photo: { file: '/run/sit-fixture-input/photo.jpg', classification: 'authentic_non_ai', mimeType: 'image/jpeg',
      sha256: hash(photoBytes), currentProductEvidence: false, sourceUrl: 'https://example.invalid/illustration', creator: 'Synthetic', license: 'CC0', capturedAt: '2017-01-01' } };
  const manifest = { kind: 'sit-staging-web-fixture-adapter', schemaVersion: 1, operation: 'activate', preflight,
    sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: 98, ledgerDigest: source.ledgerDigest, uploadDirectory: '/data/uploads' };
  const bytes = Buffer.from(JSON.stringify(manifest));
  const envBytes = Buffer.from(Object.entries(environment).filter(([key]) => key !== 'APP_COMMIT').map(([key, value]) => `${key}=${value}`).join('\n'));
  const binding = { kind: 'sit-green-web-fixture-runner', schemaVersion: 1, createdAt: new Date().toISOString(), opsCommit: source.commit,
    runtimeCommit: environment.APP_COMMIT, imageDigest: `sha256:${'1'.repeat(64)}`, apiId: '2'.repeat(64), databaseId: '3'.repeat(64),
    networkId: '4'.repeat(64), envSha256: hash(envBytes), inputDirectory: directory, adapterFile: `${directory}/adapter.json`, adapterFileSha256: hash(bytes) };
  const image = { Id: 'sha256:' + '5'.repeat(64), Config: { Labels: { 'org.opencontainers.image.revision': binding.runtimeCommit }, User: 'shareittoo', Env: [`APP_COMMIT=${binding.runtimeCommit}`] }, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${binding.imageDigest}`] };
  const api = { Id: binding.apiId, Name: '/shareittoo-staging-api', Image: image.Id, State: { Running: true },
    Config: { Image: `ghcr.io/shareittoo/shareittoo-api:${binding.runtimeCommit}@${binding.imageDigest}`, User: 'shareittoo', Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`) },
    NetworkSettings: { Networks: { [networkName]: { NetworkID: binding.networkId } } }, Mounts: [{ Type: 'volume', Name: uploadsName, Destination: '/data/uploads', RW: true }] };
  const database = { Id: binding.databaseId, Name: `/${dbName}`, State: { Running: true }, NetworkSettings: { Networks: { [networkName]: { NetworkID: binding.networkId } }, Ports: {} } };
  const network = { Id: binding.networkId, Name: networkName, Internal: true };
  const volume = { Name: uploadsName, Driver: 'local', Options: null };
  binding.apiFingerprint = fixtureRunnerFingerprint(api); binding.databaseFingerprint = fixtureRunnerFingerprint(database);
  const args = { file: binding.adapterFile, fileHash: binding.adapterFileSha256, execute: false };
  const f = { source, binding, args, api, database, network, volume, image, envBytes, environment, manifest, bytes, photoBytes, calls: [], runner: null };
  f.command = (command) => {
    f.calls.push(command);
    if (command[0] === 'image') return JSON.stringify(image);
    if (command[0] === 'create') {
      const value = (key) => command[command.indexOf(key) + 1];
      const mounts = command.flatMap((arg, index) => arg === '--mount' ? [command[index + 1]] : []).map((item) => Object.fromEntries(item.split(',').map((part) => part.split('='))));
      f.runner = { Id: '6'.repeat(64), Name: `/${value('--name')}`, Image: image.Id, State: { Running: false },
        Config: { Image: api.Config.Image, User: '100:101', Env: api.Config.Env, Labels: { 'com.shareittoo.fixture-runner': value('--label').split('=')[1] }, Entrypoint: ['node'], Cmd: command.slice(-3) },
        HostConfig: { ReadonlyRootfs: true, Privileged: false, NetworkMode: binding.networkId, PortBindings: {}, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'], Devices: [] },
        NetworkSettings: { Networks: { [networkName]: { NetworkID: '' } } },
        Mounts: mounts.map((m) => ({ Type: m.type, Source: m.type === 'bind' ? m.src : undefined, Name: m.type === 'volume' ? m.src : undefined, Destination: m.dst, RW: false })) };
      if (f.alterRunner) f.alterRunner(f.runner);
      if (f.loseCreate) throw Error('lost-create-response');
      return f.runner.Id;
    }
    if (command[0] === 'start') {
      if (f.failStart) throw Error('child-failed');
      return JSON.stringify({ status: args.execute ? 'database-prepared-runtime-still-blocked' : 'preflight-passed-no-mutation', runtimeActivated: false,
        sourceCommit: source.commit, manifestDigest: '7'.repeat(64), activationDigest: '7'.repeat(64), ...f.resultOverride });
    }
    if (command[0] === 'rm') { assert.equal(command.at(-1), f.runner.Id); if (f.failCleanup) throw Error('cleanup-failed'); f.runner = null; return ''; }
    if (command[0] === 'ps') return f.runner?.Id ?? '';
    assert.fail('unexpected Docker command');
  };
  f.inspectRecord = (id) => {
    if (id === binding.apiId) return api;
    if (id === binding.databaseId) return database;
    if (id === binding.networkId) return network;
    if (id === uploadsName) return volume;
    if (id === f.runner?.Id) return f.runner;
    assert.fail('unexpected inspect');
  };
  f.run = () => runFixtureContainer({ ...f, runtimeTreeDigest: '8'.repeat(64), assertSourceReadable: () => {}, inputNames: () => ['adapter.json', 'photo.jpg'],
    readEnv: () => envBytes, readInput: (path) => path === binding.adapterFile ? bytes : photoBytes });
  return f;
}

test('default container contract is read-only, exact immutable image/Green only, no providers or host ports', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.status, 'preflight-passed-no-mutation'); assert.equal(result.cleanup, 'verified'); assert.equal(f.runner, null);
  const create = f.calls.find((args) => args[0] === 'create');
  assert.ok(create.includes('--pull=never')); assert.equal(create[create.indexOf('--network') + 1], f.binding.networkId);
  assert.equal(create.filter((arg) => arg === '--network').length, 1); assert.ok(create.includes('--read-only'));
  assert.doesNotMatch(create.join(' '), /provider-egress|\/run\/secrets|--publish|--privileged|--network=host/u);
  assert.equal(f.calls.filter((args) => args[0] === 'start').length, 1);
  for (const [key, value] of Object.entries(result)) if (!['status', 'cleanup', 'runtimeActivated'].includes(key)) assert.match(value, /^(sha256:)?[a-f0-9]{40,64}$/u);
  const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: create.at(-1), encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

test('write mode requires exact source and run; environment or runtime SHA is not source authority', async () => {
  for (const confirmSource of [undefined, 'f'.repeat(40), 'a'.repeat(40)]) {
    const f = fixture(); Object.assign(f.args, { execute: true, confirmSource, confirmRun: f.manifest.preflight.runId });
    await assert.rejects(f.run(), /fixture_runner_confirm/u); assert.ok(!f.calls.some((args) => args[0] === 'create'));
  }
  const f = fixture(); Object.assign(f.args, { execute: true, confirmSource: f.source.commit, confirmRun: f.manifest.preflight.runId });
  assert.equal((await f.run()).status, 'database-prepared-runtime-still-blocked');
  const text = readFileSync(new URL('../ops/staging_web_fixture_runner.mjs', import.meta.url), 'utf8');
  const main = text.slice(text.indexOf('async function main()'));
  assert.match(main, /source: readAdapterSource\(\)/u); assert.doesNotMatch(main, /source: (binding|process\.env)/u);
  const adapter = readFileSync(new URL('../ops/staging_web_fixture_adapter.mjs', import.meta.url), 'utf8');
  assert.match(adapter.slice(adapter.indexOf('async function main()')), /source: readAdapterSource\(\)/u);
});

for (const [name, mutate] of Object.entries({
  stale: (f) => { f.binding.createdAt = '2020-01-01'; },
  source: (f) => { f.binding.opsCommit = f.binding.runtimeCommit; },
  extra: (f) => { f.binding.sourceOverride = f.source; },
  image: (f) => { f.image.RepoDigests = []; },
  revision: (f) => { f.image.Config.Env = ['APP_COMMIT=' + 'f'.repeat(40)]; },
  api: (f) => { f.api.Id = 'f'.repeat(64); },
  database: (f) => { f.database.Name = '/foreign'; },
  network: (f) => { f.network.Internal = false; },
  uploads: (f) => { f.volume.Driver = 'remote'; },
  env: (f) => { f.binding.envSha256 = 'f'.repeat(64); },
  manifest: (f) => { f.binding.adapterFileSha256 = 'f'.repeat(64); },
  inputPath: (f) => { f.binding.inputDirectory = '/docker/shareittoo/evidence/../ops'; },
})) test(`pre-create drift fails closed: ${name}`, async () => {
  const f = fixture(); mutate(f); await assert.rejects(f.run()); assert.ok(!f.calls.some((args) => args[0] === 'create'));
});

for (const [name, mutate] of Object.entries({
  mount: (r) => { r.Mounts[0].RW = true; },
  extraMount: (r) => { r.Mounts.push({ Type: 'bind', Source: '/foreign', Destination: '/foreign', RW: false }); },
  network: (r) => { r.NetworkSettings.Networks.foreign = {}; },
  user: (r) => { r.Config.User = '0:0'; },
  caps: (r) => { r.HostConfig.CapAdd = ['SYS_ADMIN']; },
  ports: (r) => { r.HostConfig.PortBindings['8080/tcp'] = [{}]; },
  command: (r) => { r.Config.Cmd = ['-e', 'process.exit(0)']; },
  env: (r) => { r.Config.Env = [...r.Config.Env, 'SIT_WEB_FIXTURE_EXECUTE=1']; },
})) test(`stopped runner drift is never started and only its ID is cleaned: ${name}`, async () => {
  const f = fixture(); f.alterRunner = mutate; await assert.rejects(f.run());
  assert.equal(f.runner, null); assert.ok(!f.calls.some((args) => args[0] === 'start'));
});

test('lost create response and child failure clean only owned exact IDs; cleanup failure never PASS', async () => {
  for (const failure of ['loseCreate', 'failStart', 'failCleanup']) {
    const f = fixture(); f[failure] = true; await assert.rejects(f.run());
    if (failure !== 'failCleanup') assert.equal(f.runner, null);
    assert.ok(f.calls.filter((args) => args[0] === 'rm').every((args) => args.at(-1) === '6'.repeat(64)));
  }
  const f = fixture(); f.resultOverride = { manifestDigest: 'private-value' }; await assert.rejects(f.run(), /fixture_runner_result_invalid/u); assert.equal(f.runner, null);
});

test('real file hashing binds adapter bytes, transitive runtime source and all 98 migration checksums', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'fixture-runner-bytes-'));
  try {
    const sourceRoot = resolve(dir, 'source'); const runtimeBackend = resolve(dir, 'runtime');
    for (const path of [resolve(sourceRoot, 'backend/src'), resolve(sourceRoot, 'backend/ops'), resolve(runtimeBackend, 'src'), resolve(runtimeBackend, 'sql/migrations')]) mkdirSync(path, { recursive: true });
    for (const path of [resolve(sourceRoot, 'backend/src/transitive.js'), resolve(runtimeBackend, 'src/transitive.js')]) writeFileSync(path, 'actual runtime');
    writeFileSync(resolve(sourceRoot, 'backend/ops/adapter.mjs'), 'actual adapter');
    const ledger = Array.from({ length: 98 }, (_, i) => ({ name: `${String(i + 1).padStart(3, '0')}_test.up.sql`, checksum: hash('SELECT 1;') }));
    for (const entry of ledger) writeFileSync(resolve(runtimeBackend, 'sql/migrations', entry.name), 'SELECT 1;');
    const source = { hashes: { 'backend/ops/adapter.mjs': hash('actual adapter') }, schemaCount: 98, ledgerDigest: fixtureDigest(ledger) };
    const input = { source, sourceRoot, runtimeBackend, runtimeTreeDigest: fixtureRunnerTree(resolve(runtimeBackend, 'src')) };
    verifyFixtureRunnerSourceFiles(input);
    writeFileSync(resolve(runtimeBackend, 'src/transitive.js'), 'drift'); assert.throws(() => verifyFixtureRunnerSourceFiles(input), /runtime_source_drift/u);
    writeFileSync(resolve(runtimeBackend, 'src/transitive.js'), 'actual runtime');
    writeFileSync(resolve(sourceRoot, 'backend/ops/adapter.mjs'), 'drift'); assert.throws(() => verifyFixtureRunnerSourceFiles(input), /source_bytes_drift/u);
    writeFileSync(resolve(sourceRoot, 'backend/ops/adapter.mjs'), 'actual adapter');
    writeFileSync(resolve(runtimeBackend, 'sql/migrations', ledger[0].name), 'drift'); assert.throws(() => verifyFixtureRunnerSourceFiles(input), /ledger_drift/u);
    symlinkSync('/tmp', resolve(runtimeBackend, 'src/foreign')); assert.throws(() => fixtureRunnerTree(resolve(runtimeBackend, 'src')), /source_path/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('root-only source files reproduce the real bind-mount failure before container creation', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'fixture-runner-modes-'));
  try {
    mkdirSync(resolve(dir, 'backend/ops'), { recursive: true }); mkdirSync(resolve(dir, 'backend/src'), { recursive: true, mode: 0o755 });
    for (const path of adapterSources.filter((p) => p.startsWith('backend/ops/'))) writeFileSync(resolve(dir, path), 'source', { mode: 0o644 });
    assertFixtureRunnerReadableSources(dir);
    chmodSync(resolve(dir, adapterSources[0]), 0o600); assert.throws(() => assertFixtureRunnerReadableSources(dir), /source_permissions/u);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('input builder binds actual source/media without refreshing stale snapshots or cleanup scope', () => {
  const f = fixture(); const prepared = JSON.parse(prepareFixtureRunnerInput({ manifest: f.manifest, photoBytes: f.photoBytes, source: f.source }));
  assert.equal(prepared.preflight.createdAt, f.manifest.preflight.createdAt);
  assert.equal(prepared.preflight.snapshotDigest, f.manifest.preflight.snapshotDigest);
  assert.deepEqual(prepared.sourceHashes, f.source.hashes);
  assert.equal(prepared.preflight.photo.file, '/run/sit-fixture-input/photo.jpg');
  assert.throws(() => prepareFixtureRunnerInput({ manifest: f.manifest, photoBytes: Buffer.from('fake'), source: f.source }), /input_photo/u);
  const cleanup = structuredClone(f.manifest); cleanup.operation = 'cleanup'; cleanup.activationDigest = 'c'.repeat(64);
  assert.equal(JSON.parse(prepareFixtureRunnerInput({ manifest: cleanup, photoBytes: f.photoBytes, source: f.source })).activationDigest, cleanup.activationDigest);
  cleanup.preflight.photo.file = '/different/photo.jpg';
  assert.throws(() => prepareFixtureRunnerInput({ manifest: cleanup, photoBytes: f.photoBytes, source: f.source }), /cleanup_input_scope/u);
  f.manifest.preflight.createdAt = '2020-01-01';
  assert.throws(() => prepareFixtureRunnerInput({ manifest: f.manifest, photoBytes: f.photoBytes, source: f.source }), /manifest_stale/u);
});

test('binding builder derives one-hour authority from actual immutable readbacks, not supplied claims', () => {
  const f = fixture();
  const binding = buildFixtureRunnerBinding({ ...f, inputDirectory: f.binding.inputDirectory, adapterBytes: f.bytes });
  validateFixtureRunnerBinding(binding, f.source);
  assert.equal(binding.apiId, f.api.Id); assert.equal(binding.apiFingerprint, fixtureRunnerFingerprint(f.api));
  assert.equal(binding.envSha256, hash(f.envBytes)); assert.equal(binding.adapterFileSha256, hash(f.bytes));
  assert.notEqual(binding.opsCommit, binding.runtimeCommit);
  f.image.Config.Labels['org.opencontainers.image.revision'] = 'f'.repeat(40);
  assert.throws(() => buildFixtureRunnerBinding({ ...f, inputDirectory: f.binding.inputDirectory, adapterBytes: f.bytes }), /image_drift/u);
  const text = readFileSync(new URL('../ops/staging_web_fixture_runner.mjs', import.meta.url), 'utf8');
  assert.match(text, /mkdirSync\(argv\[5\], \{ mode: 0o700 \}\); chownSync\(argv\[5\], uid, gid\)/u);
  assert.match(text, /writeExclusivePrivateFile\(.*photo\.jpg.*\{ uid, gid \}/u);
  assert.match(text, /writeExclusivePrivateFile\(argv\[2\], bytes, \{ uid: 0, gid: 0 \}\)/u);
});
