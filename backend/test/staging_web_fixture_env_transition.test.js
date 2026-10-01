import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { dedicatedFixture, fixtureBootstrapHandoff } from '../ops/staging_web_fixture_bootstrap.mjs';
import {
  assertFixtureEnvRuntimeManifest,
  fixtureEnvDigest,
  fixtureEnvKeys,
  prepareFixtureEnvRuntimeManifest,
  runStagingWebFixtureEnvTransition,
} from '../ops/staging_web_fixture_env_transition.mjs';
import { fixtureEnvironmentDigest } from '../ops/staging_web_fixture_preflight.mjs';
import { corsContainerFingerprint } from '../ops/staging_web_cors_transition.mjs';
import { readFixtureEnvBootstrapManifest } from '../ops/promote_staging_web_fixture_env.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const opsCommit = 'f'.repeat(40);
const bootstrapCommit = 'e'.repeat(40);
const runtimeCommit = 'd'.repeat(40);
const imageDigest = `sha256:${'c'.repeat(64)}`;
const migrationLedger = '4d0530a169f9c7d375c18d4a5fc845319ac1d94f16e3671bd9feb2f925d5dcce';
const primaryNetworkId = '7'.repeat(64);
const providerNetworkId = '8'.repeat(64);

function envEntries() {
  return {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test',
    FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    DATABASE_URL: 'postgres://shareittoo_green:private@fixture-db/shareittoo_green',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_ALLOWED_USER_IDS: 'old-owner,old-renter,old-observer',
    SIT_STAGING_PUBLIC_LISTING_IDS: 'old-listing', SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'old.webp',
    SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '', PRIVATE_PILOT_V4_ENABLED: 'true',
    PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn', MAIL_TRANSPORT: 'disabled', PUSH_TRANSPORT: 'disabled',
    APP_COMMIT: runtimeCommit,
  };
}

const envText = (values) => `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-fixture-env-transition-'));
  await chmod(root, 0o700);
  const envFile = join(root, 'green.env');
  const backupFile = join(root, 'old-green.env');
  const evidenceFile = join(root, 'evidence.json');
  const firebase = join(root, 'firebase.json');
  const mfa = join(root, 'mfa.key');
  const uploadsPath = join(root, 'uploads');
  await mkdir(uploadsPath, { mode: 0o700 });
  await writeFile(firebase, '{}', { mode: 0o600 });
  await writeFile(mfa, 'm'.repeat(32), { mode: 0o600 });
  const environment = envEntries();
  const originalEnv = envText(environment);
  await writeFile(envFile, originalEnv, { mode: 0o600 });
  const runId = 'web-fixture-bootstrap-private-run';
  const bootstrapManifest = {
    kind: 'sit-dedicated-web-fixture-bootstrap', schemaVersion: 1, operation: 'seed',
    sourceCommit: bootstrapCommit, sourceHashes: { bootstrap: '1'.repeat(64) }, schemaCount: 99,
    ledgerDigest: migrationLedger, passwordDigests: ['2'.repeat(64), '3'.repeat(64)],
    preflight: {
      runId, environmentDigest: fixtureEnvironmentDigest(environment),
      roles: [{ role: 'owner', userId: dedicatedFixture.owner }, { role: 'renter', userId: dedicatedFixture.renter }],
      listingId: dedicatedFixture.listing, uploadName: dedicatedFixture.upload,
    },
  };
  const bootstrapBytes = Buffer.from(`${JSON.stringify(bootstrapManifest)}\n`);
  const image = `registry.example/shareittoo-api:${runtimeCommit}`;
  const mounts = [
    { type: 'bind', name: 'mfa', source: mfa, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { type: 'bind', name: 'firebase', source: firebase, destination: '/run/secrets/firebase-service-account.json', readOnly: true },
    { type: 'volume', name: 'sit-green-uploads-20260918011528-wp254', source: uploadsPath, destination: '/data/uploads', readOnly: false },
  ];
  const api = {
    Id: 'a'.repeat(64), Image: `sha256:${'9'.repeat(64)}`, Name: '/shareittoo-staging-api', State: { Running: true },
    Config: { Image: image, Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`), Cmd: ['node', 'src/server.js'],
      Entrypoint: null, WorkingDir: '/app', User: 'shareittoo', Hostname: 'a'.repeat(12), Tty: false, OpenStdin: false,
      Labels: { 'com.shareittoo.sit.green': 'true' } },
    HostConfig: { GroupAdd: ['65532'], RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, PortBindings: {},
      NetworkMode: 'sit-green-network-20260918011528-wp254', SecurityOpt: ['no-new-privileges'], NoNewPrivileges: true,
      Memory: 64, CapAdd: [], CapDrop: [], Devices: [], DeviceRequests: [], Ulimits: [], Tmpfs: {}, MaskedPaths: [],
      ReadonlyPaths: [], Dns: [], DnsSearch: [], ExtraHosts: [], Binds: [], Links: [] },
    Mounts: mounts.map((mount) => ({ Type: mount.type, Name: mount.type === 'volume' ? mount.name : null,
      Source: mount.source, Destination: mount.destination, RW: !mount.readOnly })),
    NetworkSettings: { Ports: {}, Networks: {
      'sit-green-network-20260918011528-wp254': { NetworkID: primaryNetworkId },
      'sit-staging-provider-egress': { NetworkID: providerNetworkId },
    } },
  };
  const handoff = fixtureBootstrapHandoff(bootstrapManifest, environment);
  const seedScopeDigest = '4'.repeat(64);
  const seedSnapshotDigest = '5'.repeat(64);
  const fixtureBinding = {
    opsCommit, bootstrapManifestSha256: hash(bootstrapBytes), bootstrapSourceCommit: bootstrapCommit,
    bootstrapRunIdSha256: hash(runId), seedScopeDigest, seedSnapshotDigest,
    envSha256: hash(originalEnv), allowedUserIdsBeforeDigest: hash(environment.SIT_STAGING_ALLOWED_USER_IDS),
    allowedUserIdsBeforeCount: 3, handoffDigest: fixtureEnvDigest(handoff.proposed),
    apiFingerprint: corsContainerFingerprint(api), backupFile,
  };
  const manifest = {
    kind: 'sit-staging-web-fixture-env-runtime-manifest', schemaVersion: 1, apiContainerId: api.Id,
    environment: 'staging', composeProject: 'sit-green', apiContainer: 'shareittoo-staging-api',
    databaseContainer: 'sit-green-postgres-20260918011528-wp254', databaseVolume: 'sit-green-volume-20260918011528-wp254',
    databaseName: 'shareittoo_green', databaseUser: 'shareittoo_green', network: 'sit-green-network-20260918011528-wp254',
    providerNetwork: 'sit-staging-provider-egress', uploadsVolume: 'sit-green-uploads-20260918011528-wp254',
    image, runtimeRevision: runtimeCommit, imageDigest, envFile, envUid: process.getuid(), envGid: process.getgid(), mounts,
    safetyEnv: { DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
      PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' },
    label: { key: 'com.shareittoo.sit.green', value: 'true' }, fixtureBinding,
  };
  return { root, envFile, backupFile, evidenceFile, environment, originalEnv, bootstrapBytes, bootstrapManifest,
    runId, api, manifest, seedScopeDigest, seedSnapshotDigest, handoff };
}

function startupPayload() {
  return JSON.stringify({ ok: true, attempts: { live: 1, ready: 1 }, last: { live: { status: 200 }, ready: { status: 200 } },
    version: { status: 200, commit: runtimeCommit, environment: 'test' },
    flags: { DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
      PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' } });
}

function fakeExecutor(fx, {
  failPhase, lateEvidenceCollision = false, reorderReplacementEnv = false, mutateNetworkMetadata = false,
  mutateBeforeFingerprint = false, sealReadbackFault = null,
} = {}) {
  const containers = new Map([[fx.manifest.apiContainer, structuredClone(fx.api)]]);
  const calls = [];
  let networkMutation = 0;
  let sealReadbacks = 0;
  const imageRecord = { Id: fx.api.Image, RepoTags: [fx.manifest.image], Config: { User: 'shareittoo',
    Labels: { 'org.opencontainers.image.revision': runtimeCommit } }, RepoDigests: [`${fx.manifest.image}@${imageDigest}`] };
  const fixed = new Map([
    [fx.manifest.databaseContainer, { Name: `/${fx.manifest.databaseContainer}`, State: { Running: true } }],
    [fx.manifest.databaseVolume, { Name: fx.manifest.databaseVolume }],
    [fx.manifest.network, { Name: fx.manifest.network, Id: primaryNetworkId, Internal: true }],
    [fx.manifest.providerNetwork, { Name: fx.manifest.providerNetwork, Id: providerNetworkId }],
    [fx.manifest.uploadsVolume, { Name: fx.manifest.uploadsVolume }],
  ]);
  const byReference = (value) => containers.get(value) ?? [...containers.values()].find((record) => record.Id === value) ?? fixed.get(value);
  const json = (value) => ({ stdout: JSON.stringify(value), code: 0 });
  const mutateNetworks = (record) => {
    if (!mutateNetworkMetadata) return;
    networkMutation += 1;
    for (const [name, value] of Object.entries(record.NetworkSettings?.Networks ?? {})) {
      value.Aliases = [`dynamic-${networkMutation}-${name}`];
      value.IPAddress = `172.31.${networkMutation}.9`;
      value.EndpointID = networkMutation.toString(16).padStart(64, '0');
    }
  };
  const configReadback = () => {
    const allowed = fx.handoff.proposed.SIT_STAGING_ALLOWED_USER_IDS;
    const expected = { allowedCount: allowed.split(',').length, allowedDigest: hash(allowed), listingCount: 1,
      listingDigest: hash(dedicatedFixture.listing), uploadCount: 1, uploadDigest: hash(dedicatedFixture.upload) };
    return { accessGateEnabled: true, accessGateValid: true, ...expected, syntheticCatalogEnabled: false,
      registrationEnabled: false, expected };
  };
  const command = async (program, args, options = {}) => {
    assert.equal(program, 'docker'); calls.push({ phase: options.phase, args: [...args] });
    if (options.phase === failPhase) throw Object.assign(new Error('injected'), { code: 'fixture_env_injected_fault' });
    if (args[0] === 'inspect') {
      const record = byReference(args.at(-1));
      if (!record && options.allowFailure) return { stdout: '', stderr: 'No such container', code: 1 };
      if (!record) throw Error('missing_inspect');
      if (mutateBeforeFingerprint && options.phase === 'fixture_env_pre_mutation_api_readback') mutateNetworks(record);
      let observed = record;
      if (options.phase === 'fixture_env_rollback_seal_readback') {
        sealReadbacks += 1;
        if (sealReadbackFault === 'permanent' || sealReadbackFault === 'transient' && sealReadbacks === 1) {
          observed = structuredClone(record);
          delete observed.NetworkSettings.Networks[fx.manifest.providerNetwork];
        }
      }
      const result = json(observed);
      if (lateEvidenceCollision && options.phase === 'fixture_env_rollback_seal_readback') {
        await writeFile(fx.evidenceFile, 'external-owner\n', { mode: 0o600 });
      }
      return result;
    }
    if (args[0] === 'image') return json(imageRecord);
    if (args[0] === 'ps') {
      const name = /^name=\^\/(.+)\$$/u.exec(args[args.indexOf('--filter') + 1])?.[1];
      return { stdout: name && containers.has(name) ? `${name}\n` : '', code: 0 };
    }
    if (args[0] === 'exec') {
      const script = args.at(-1);
      if (args[1] === fx.manifest.databaseContainer) {
        if (script === 'SELECT 1') return { stdout: '1\n', code: 0 };
        if (String(script).includes('ORDER BY applied_at')) return { stdout: '099_mission_need_revisions.up.sql\n', code: 0 };
        if (String(script).includes('string_agg')) return { stdout: `${migrationLedger}\n`, code: 0 };
        if (String(script).includes('staging_web_fixture_seed.seeded')) return { stdout: `1|${fx.seedScopeDigest}|${fx.seedSnapshotDigest}|${hash(fx.runId)}|0|2|1|1\n`, code: 0 };
        throw Error(`unexpected_db_exec:${script}`);
      }
      if (String(script).includes('runtimeNames')) return { stdout: startupPayload(), code: 0 };
      if (String(script).includes('const l=await fetch')) return json({ live: 200, ready: 200, version: { commit: runtimeCommit, environment: 'test' } });
      if (String(script).includes('syntheticCatalogEnabled')) return json(configReadback());
      throw Error(`unexpected_api_exec:${script}`);
    }
    if (args[0] === 'stop') {
      const record = byReference(args[1]); record.State.Running = false; mutateNetworks(record); return { stdout: '', code: 0 };
    }
    if (args[0] === 'rename') {
      const record = byReference(args[1]); containers.delete(record.Name.slice(1)); record.Name = `/${args[2]}`; containers.set(args[2], record);
      mutateNetworks(record);
      return { stdout: '', code: 0 };
    }
    if (args[0] === 'create') {
      const option = (name) => args[args.indexOf(name) + 1];
      const name = option('--name'); const envFile = option('--env-file'); const networkIndex = args.indexOf('--network');
      assert.equal(envFile, fx.envFile);
      const record = structuredClone(fx.api);
      record.Id = 'b'.repeat(64); record.Name = `/${name}`; record.State.Running = false; record.Config.Image = args[networkIndex + 2];
      record.Config.Hostname = 'b'.repeat(12);
      const entries = (await readFile(envFile, 'utf8')).split(/\r?\n/u).filter((line) => line && !line.startsWith('#'));
      record.Config.Env = reorderReplacementEnv ? entries.reverse() : entries;
      record.HostConfig.NetworkMode = args[networkIndex + 1];
      record.NetworkSettings = { Ports: {}, Networks: { [fx.manifest.network]: { NetworkID: primaryNetworkId } } };
      containers.set(name, record); return { stdout: `${record.Id}\n`, code: 0 };
    }
    if (args[0] === 'network') {
      const record = byReference(args[3]); record.NetworkSettings.Networks[fx.manifest.providerNetwork] = { NetworkID: providerNetworkId };
      return { stdout: '', code: 0 };
    }
    if (args[0] === 'start') {
      const record = byReference(args[1]); record.State.Running = true; mutateNetworks(record); return { stdout: '', code: 0 };
    }
    if (args[0] === 'rm') { const record = byReference(args.at(-1)); containers.delete(record.Name.slice(1)); return { stdout: '', code: 0 }; }
    throw Error(`unexpected_command:${args.join(' ')}`);
  };
  return { command, calls, containers };
}

function simulatedBootstrapReader(bytes, metadata) {
  return (_filePath, options) => {
    assert.deepEqual(options, { encoding: null, expectedMode: 0o600, expectedUid: 100, expectedGid: 101,
      minBytes: 1, maxBytes: 128 * 1024, code: 'fixture_env_bootstrap_metadata_invalid' });
    if (metadata.symbolicLink) throw Object.assign(new Error('simulated symlink'), { code: 'ELOOP' });
    if (!metadata.regular || metadata.mode !== options.expectedMode || metadata.uid !== options.expectedUid
        || metadata.gid !== options.expectedGid || bytes.length < options.minBytes || bytes.length > options.maxBytes) {
      throw Object.assign(new Error(options.code), { code: options.code });
    }
    return bytes;
  };
}

test('host reader accepts only the runner-owned 0600 UID100:GID101 bootstrap contract', async (t) => {
  const bytes = Buffer.from('runner-owned-private-bootstrap');
  const sha256 = hash(bytes);
  const accepted = { regular: true, symbolicLink: false, mode: 0o600, uid: 100, gid: 101 };
  assert.deepEqual(readFixtureEnvBootstrapManifest('/private/adapter.json', sha256,
    { readPrivateFile: simulatedBootstrapReader(bytes, accepted) }), bytes);
  const rejected = [
    ['root-owned', { ...accepted, uid: 0, gid: 0 }, 'fixture_env_bootstrap_metadata_invalid'],
    ['foreign-owned', { ...accepted, uid: 501, gid: 20 }, 'fixture_env_bootstrap_metadata_invalid'],
    ['wrong-mode', { ...accepted, mode: 0o640 }, 'fixture_env_bootstrap_metadata_invalid'],
    ['symlink', { ...accepted, symbolicLink: true }, 'ELOOP'],
  ];
  for (const [name, metadata, code] of rejected) await t.test(name, () => {
    assert.throws(() => readFixtureEnvBootstrapManifest('/private/adapter.json', sha256,
      { readPrivateFile: simulatedBootstrapReader(bytes, metadata) }), (error) => error.code === code);
  });
});

test('read-only prepare derives and exclusively writes the protected 0600 runtime manifest', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  const preparedFile = join(fx.root, 'prepared-runtime.json');
  const preparedBackup = join(fx.root, 'prepared-old.env');
  const fake = fakeExecutor(fx);
  const result = await prepareFixtureEnvRuntimeManifest({ bootstrapManifestBytes: fx.bootstrapBytes,
    bootstrapManifestSha256: hash(fx.bootstrapBytes), backupFile: preparedBackup, outputFile: preparedFile,
    sourceCommit: opsCommit, command: fake.command, commandEnv: {}, envFile: fx.envFile });
  assert.equal(result.status, 'fixture-env-runtime-manifest-prepared-read-only');
  assert.equal((await lstat(preparedFile)).mode & 0o777, 0o600);
  const prepared = JSON.parse(await readFile(preparedFile, 'utf8'));
  assertFixtureEnvRuntimeManifest(prepared);
  assert.equal(prepared.fixtureBinding.apiFingerprint, corsContainerFingerprint(fx.api));
  assert.equal(prepared.fixtureBinding.backupFile, preparedBackup);
  assert.equal(prepared.fixtureBinding.handoffDigest, fixtureEnvDigest(fx.handoff.proposed));
  await assert.rejects(prepareFixtureEnvRuntimeManifest({ bootstrapManifestBytes: fx.bootstrapBytes,
    bootstrapManifestSha256: hash(fx.bootstrapBytes), backupFile: preparedBackup, outputFile: preparedFile,
    sourceCommit: opsCommit, command: fake.command, commandEnv: {}, envFile: fx.envFile }),
  /fixture_env_prepare_output_target_invalid_exists/u);
  assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
  await assert.rejects(readFile(preparedBackup), { code: 'ENOENT' });
  assert.doesNotMatch(JSON.stringify(result), /old-owner|old-renter|private-run|DATABASE_URL/u);
});

test('fixture env default preflight is read-only and binds private seed evidence without IDs', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  assertFixtureEnvRuntimeManifest(fx.manifest);
  const fake = fakeExecutor(fx);
  const result = await runStagingWebFixtureEnvTransition({ manifest: fx.manifest, bootstrapManifestBytes: fx.bootstrapBytes,
    sourceCommit: opsCommit, evidenceFile: fx.evidenceFile, command: fake.command, commandEnv: {} });
  assert.equal(result.status, 'preflight-passed-no-mutation');
  assert.deepEqual(result.changedEnvironmentKeys, fixtureEnvKeys);
  assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
  await assert.rejects(readFile(fx.backupFile), { code: 'ENOENT' });
  await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
  assert.ok(fake.calls.every((call) => !['stop', 'rename', 'create', 'start', 'rm'].includes(call.args[0])));
  assert.doesNotMatch(JSON.stringify(result), /old-owner|old-renter|private-run/u);
});

test('execution rechecks the full prepared API fingerprint immediately before mutation', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fake = fakeExecutor(fx, { mutateNetworkMetadata: true, mutateBeforeFingerprint: true });
  await assert.rejects(runStagingWebFixtureEnvTransition({ manifest: fx.manifest, bootstrapManifestBytes: fx.bootstrapBytes,
    sourceCommit: opsCommit, evidenceFile: fx.evidenceFile, execute: true, confirmSource: opsCommit, confirmRun: fx.runId,
    command: fake.command, commandEnv: { STAGING_WEB_FIXTURE_ENV_EXECUTE: '1',
      STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE: opsCommit, STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN: fx.runId } }),
  (error) => error.code === 'fixture_env_pre_mutation_fingerprint_invalid' && error.rollback?.restored === true);
  assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
  await assert.rejects(readFile(fx.backupFile), { code: 'ENOENT' });
  await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
});

test('fixture env execution accepts reordered exact env and mutable network metadata without weakening the four-value contract', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fake = fakeExecutor(fx, { reorderReplacementEnv: true, mutateNetworkMetadata: true });
  const result = await runStagingWebFixtureEnvTransition({ manifest: fx.manifest, bootstrapManifestBytes: fx.bootstrapBytes,
    sourceCommit: opsCommit, evidenceFile: fx.evidenceFile, execute: true, confirmSource: opsCommit, confirmRun: fx.runId,
    command: fake.command, commandEnv: { STAGING_WEB_FIXTURE_ENV_EXECUTE: '1',
      STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE: opsCommit, STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN: fx.runId } });
  assert.equal(result.status, 'staging-web-fixture-env-handoff-applied-catalog-disabled');
  const after = Object.fromEntries((await readFile(fx.envFile, 'utf8')).trim().split('\n').map((line) => line.split(/=(.*)/su).slice(0, 2)));
  assert.equal(after.SIT_STAGING_ALLOWED_USER_IDS, `${dedicatedFixture.owner},${dedicatedFixture.renter},${fx.environment.SIT_STAGING_ALLOWED_USER_IDS}`);
  assert.equal(after.SIT_STAGING_PUBLIC_LISTING_IDS, dedicatedFixture.listing);
  assert.equal(after.SIT_STAGING_PUBLIC_UPLOAD_NAMES, dedicatedFixture.upload);
  assert.equal(after.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED, 'false');
  assert.equal(await readFile(fx.backupFile, 'utf8'), fx.originalEnv);
  assert.equal((await lstat(fx.backupFile)).mode & 0o777, 0o600);
  const evidence = await readFile(fx.evidenceFile, 'utf8');
  assert.doesNotMatch(evidence, /old-owner|old-renter|DATABASE_URL|private-run/u);
  assert.doesNotMatch(`${JSON.stringify(result)}${evidence}`,
    /synthetic_web_catalog_owner_v1|synthetic_web_catalog_renter_v1|synthetic_web_catalog_listing_v1|synthetic_web_catalog_placeholder_v1\.webp/u);
  const sealed = fake.containers.get(result.sealedName);
  assert.equal(sealed.State.Running, false);
  assert.notEqual(corsContainerFingerprint(sealed), corsContainerFingerprint(fx.api));
  assert.equal(sealed.NetworkSettings.Networks[fx.manifest.network].NetworkID, primaryNetworkId);
  assert.equal(sealed.NetworkSettings.Networks[fx.manifest.providerNetwork].NetworkID, providerNetworkId);
  assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, 'b'.repeat(64));
});

test('sealed-original readback converges read-only before final gates without replaying mutations', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fake = fakeExecutor(fx, { sealReadbackFault: 'transient' });
  const result = await runStagingWebFixtureEnvTransition({ manifest: fx.manifest,
    bootstrapManifestBytes: fx.bootstrapBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
    execute: true, confirmSource: opsCommit, confirmRun: fx.runId, command: fake.command,
    commandEnv: { STAGING_WEB_FIXTURE_ENV_EXECUTE: '1',
      STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE: opsCommit,
      STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN: fx.runId } });
  assert.equal(result.status, 'staging-web-fixture-env-handoff-applied-catalog-disabled');
  const phaseCount = (phase) => fake.calls.filter((call) => call.phase === phase).length;
  for (const phase of ['fixture_env_stop_current_api', 'fixture_env_seal_current_api',
    'fixture_env_create_replacement_api', 'fixture_env_attach_provider_network',
    'fixture_env_start_replacement_api']) assert.equal(phaseCount(phase), 1, phase);
  assert.equal(phaseCount('fixture_env_rollback_seal_readback'), 2);
  const lastSeal = fake.calls.map((call) => call.phase).lastIndexOf('fixture_env_rollback_seal_readback');
  assert.ok(lastSeal < fake.calls.findIndex((call) => call.phase === 'fixture_env_final_seed_readback'));
});

test('permanent sealed-original drift fails closed and rolls back without replaying forward mutations', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fake = fakeExecutor(fx, { sealReadbackFault: 'permanent' });
  await assert.rejects(runStagingWebFixtureEnvTransition({ manifest: fx.manifest,
    bootstrapManifestBytes: fx.bootstrapBytes, sourceCommit: opsCommit, evidenceFile: fx.evidenceFile,
    execute: true, confirmSource: opsCommit, confirmRun: fx.runId, command: fake.command,
    commandEnv: { STAGING_WEB_FIXTURE_ENV_EXECUTE: '1',
      STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE: opsCommit,
      STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN: fx.runId } }),
  (error) => error.code === 'fixture_env_sealed_readback_not_converged'
    && error.failurePhase === 'fixture_env_sealed_readback' && error.rollback?.restored === true);
  const phaseCount = (phase) => fake.calls.filter((call) => call.phase === phase).length;
  for (const phase of ['fixture_env_stop_current_api', 'fixture_env_seal_current_api',
    'fixture_env_create_replacement_api', 'fixture_env_attach_provider_network',
    'fixture_env_start_replacement_api']) assert.equal(phaseCount(phase), 1, phase);
  assert.equal(phaseCount('fixture_env_rollback_seal_readback'), 8);
  assert.equal(phaseCount('fixture_env_final_seed_readback'), 0);
  assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, fx.api.Id);
  assert.equal(fake.containers.get(fx.manifest.apiContainer).State.Running, true);
  await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
});

test('each stateful replacement fault restores exact old state despite reordered env and mutable network metadata', async (t) => {
  const phases = [
    'fixture_env_stop_current_api',
    'fixture_env_seal_current_api',
    'fixture_env_create_replacement_api',
    'fixture_env_attach_provider_network',
    'fixture_env_start_replacement_api',
    'fixture_env_replacement_readback',
    'fixture_env_replacement_runtime_probe',
    'fixture_env_replacement_config_readback',
    'fixture_env_final_seed_readback',
  ];
  for (const phase of phases) await t.test(phase, async () => {
    const fx = await fixture();
    try {
      const fake = fakeExecutor(fx, { failPhase: phase, reorderReplacementEnv: true, mutateNetworkMetadata: true });
      await assert.rejects(runStagingWebFixtureEnvTransition({ manifest: fx.manifest, bootstrapManifestBytes: fx.bootstrapBytes,
        sourceCommit: opsCommit, evidenceFile: fx.evidenceFile, execute: true, confirmSource: opsCommit, confirmRun: fx.runId,
        command: fake.command, commandEnv: { STAGING_WEB_FIXTURE_ENV_EXECUTE: '1',
          STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE: opsCommit, STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN: fx.runId } }),
      (error) => error.rollback?.restored === true);
      assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
      assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, fx.api.Id);
      assert.equal(fake.containers.get(fx.manifest.apiContainer).State.Running, true);
      await assert.rejects(readFile(fx.evidenceFile), { code: 'ENOENT' });
    } finally {
      await rm(fx.root, { recursive: true, force: true });
    }
  });
});

test('late external evidence collision preserves foreign evidence and performs only identity-checked rollback', async (t) => {
  const fx = await fixture(); t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fake = fakeExecutor(fx, { lateEvidenceCollision: true });
  await assert.rejects(runStagingWebFixtureEnvTransition({ manifest: fx.manifest, bootstrapManifestBytes: fx.bootstrapBytes,
    sourceCommit: opsCommit, evidenceFile: fx.evidenceFile, execute: true, confirmSource: opsCommit, confirmRun: fx.runId,
    command: fake.command, commandEnv: { STAGING_WEB_FIXTURE_ENV_EXECUTE: '1',
      STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE: opsCommit, STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN: fx.runId } }),
  (error) => error.code === 'fixture_env_evidence_write_exists' && error.rollback?.restored === true);
  assert.equal(await readFile(fx.evidenceFile, 'utf8'), 'external-owner\n');
  assert.equal(await readFile(fx.envFile, 'utf8'), fx.originalEnv);
  assert.equal(fake.containers.get(fx.manifest.apiContainer).Id, fx.api.Id);
  assert.equal(fake.containers.get(fx.manifest.apiContainer).State.Running, true);
});
