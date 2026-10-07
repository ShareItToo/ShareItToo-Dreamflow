import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assert, assertDataTransition, digest, equal, exact, green98106, networkMembers, objectDigest, repositoryRoot, safeError, validateRuntimeManifest } from './green_staging_98_106_contract.mjs';
import { assertEnvironment, buildPlan, canonicalMounts, checkContainer, containerFingerprint, requiredEnvironment, runReadOnlyPreflight, sealedApiName } from './green_staging_98_106_promotion.mjs';
import { assertReadinessFindingsUnchanged } from './staging_forward_migration_rehearsal.mjs';
import { assertGreenRuntimeReadbacks } from './green_staging_promotion.mjs';
import { assertLoopbackPortAvailable, runMfaProbe } from './staging_controlled_acceptance.mjs';
import { assertNoWriters, checkForwardIntegrity, readDatabase, readSnapshot } from './green_staging_98_106_database.mjs';
import { assertArtifactFamily, closeArtifact, exclusiveArtifact, openArtifact, privateDirectory, verifyArtifact, writeArtifact } from './green_staging_98_106_evidence.mjs';
import { dockerCommand, dockerObject, OwnedDocker, ownershipLabel, validId } from './green_staging_98_106_resources.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const immutableIdentityKeys = new Set(['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME']);
export const migrationScript = "const {runMigrations}=await import('./src/migrations.js');const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});try{await runMigrations(pool);process.stdout.write('migration-complete');}finally{await pool.end();}";

function environmentMap(entries) {
  assert(Array.isArray(entries), 'green_98_106_env_shape');
  const result = {};
  for (const line of entries) {
    assert(typeof line === 'string' && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(line), 'green_98_106_env_shape');
    const position = line.indexOf('='); const key = line.slice(0, position);
    assert(!Object.hasOwn(result, key), 'green_98_106_env_duplicate'); result[key] = line.slice(position + 1);
  }
  return result;
}
function targetDatabase(inputs) {
  return { id: inputs.target.database.id, user: inputs.target.databaseUser, name: inputs.target.databaseName };
}
export function assertPrivateRuntime(snapshot, inputs) {
  exact(snapshot, ['kind', 'schemaVersion', 'collectedAt', 'api', 'acceptanceMfaFile'], 'green_98_106_private_runtime');
  assert(snapshot.kind === 'sit-green-staging-98-106-private-runtime' && snapshot.schemaVersion === 1
    && Number.isFinite(Date.parse(snapshot.collectedAt)), 'green_98_106_private_runtime');
  checkContainer(snapshot.api, inputs.target.api, true); assertEnvironment(snapshot.api.Config.Env, inputs.config);
  assert(objectDigest(canonicalMounts(snapshot.api.Mounts)) === inputs.config.mountsSha256
    && objectDigest(snapshot.api.Config.Env) === inputs.config.runtimeEnvironmentSha256, 'green_98_106_private_runtime_binding');
}
export function bindMaterials(snapshot) {
  const mounts = snapshot.api.Mounts;
  assert(Array.isArray(mounts) && mounts.length === 3, 'green_98_106_mount_inventory');
  const mfa = mounts.find(m => m.Destination === '/run/secrets/mfa-encryption-key');
  const firebase = mounts.find(m => m.Destination === '/run/secrets/firebase-service-account.json');
  const uploads = mounts.find(m => m.Destination === '/data/uploads');
  assert(mfa?.Type === 'bind' && mfa.RW === false && firebase?.Type === 'bind' && firebase.RW === false
    && uploads?.Type === 'volume' && uploads.RW === true
    && uploads.Name === 'sit-green-uploads-20260918011528-wp254', 'green_98_106_mount_inventory');
  const opened = [];
  const open = (file, acceptance = false) => {
    assert(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
      && !file.startsWith(`${repositoryRoot}/`), 'green_98_106_material_path');
    let current = '/';
    for (const part of path.dirname(file).split('/').filter(Boolean)) {
      current = path.join(current, part); const parent = fs.lstatSync(current);
      assert(parent.isDirectory() && !parent.isSymbolicLink(), 'green_98_106_material_parent');
    }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd, { bigint: true }); opened.push({ fd, file, stat });
    assert(stat.isFile() && stat.nlink === 1n && stat.uid === 0n && (stat.mode & 0o7777n) === 0o640n
      && stat.size > 0n && stat.size <= 65536n && (!acceptance || stat.gid === 65532n), 'green_98_106_material_metadata');
    const bytes = fs.readFileSync(fd); const sha256 = digest(bytes); bytes.fill(0); return sha256;
  };
  try {
    const mfaSha256 = open(mfa.Source); const firebaseSha256 = open(firebase.Source);
    const acceptanceMfaSha256 = open(snapshot.acceptanceMfaFile, true);
    assert(mfaSha256 === acceptanceMfaSha256, 'green_98_106_acceptance_key_mismatch');
    return {
      mfaFile: mfa.Source, firebaseFile: firebase.Source, acceptanceMfaFile: snapshot.acceptanceMfaFile,
      mfaSha256, firebaseSha256,
      recheck() {
        for (const entry of opened) {
          const now = fs.fstatSync(entry.fd, { bigint: true }); const link = fs.lstatSync(entry.file, { bigint: true });
          assert(['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
            .every(key => entry.stat[key] === now[key] && now[key] === link[key]), 'green_98_106_material_changed');
        }
      },
      close() { for (const entry of opened) fs.closeSync(entry.fd); },
    };
  } catch (error) { for (const entry of opened) fs.closeSync(entry.fd); throw error; }
}

export function assertContainerSpec(record, spec, { running = null } = {}) {
  assert(record.Image === spec.imageId && record.Config?.Image === spec.image
    && record.Config.User === spec.user && equal(environmentMap(record.Config.Env), spec.env)
    && equal(record.Config.Entrypoint ?? [], spec.entrypoint ?? []) && equal(record.Config.Cmd ?? [], spec.cmd ?? [])
    && record.HostConfig?.Privileged === false && record.HostConfig.NetworkMode === spec.networkId
    && record.State?.Paused === false && (running === null || record.State.Running === running), 'green_98_106_container_spec');
  assert(equal(record.HostConfig.PortBindings ?? {}, spec.ports ?? {})
    && equal([...(record.HostConfig.GroupAdd ?? [])].sort(), [...(spec.groups ?? [])].sort()), 'green_98_106_container_host_spec');
  assert(record.HostConfig.RestartPolicy?.Name === 'no' && (record.HostConfig.CapAdd ?? []).length === 0
    && (record.HostConfig.Devices ?? []).length === 0 && (record.HostConfig.VolumesFrom ?? []).length === 0
    && !['host', 'container'].includes(record.HostConfig.PidMode), 'green_98_106_container_privilege_spec');
  const networks = record.NetworkSettings?.Networks ?? {};
  if (spec.networkId === 'none') assert(Object.keys(networks).every(name => name === 'none'), 'green_98_106_probe_network');
  else {
    assert(equal(Object.keys(networks).sort(), Object.keys(spec.networks).sort()), 'green_98_106_owned_network_set');
    for (const [name, id] of Object.entries(spec.networks)) {
      assert(networks[name]?.NetworkID === id || (record.State.Running === false && networks[name]?.NetworkID === ''),
        'green_98_106_owned_network_id');
    }
  }
  assert(Array.isArray(record.Mounts) && record.Mounts.length === spec.mounts.length, 'green_98_106_owned_mount_set');
  for (const mount of spec.mounts) {
    const observed = record.Mounts.find(value => value.Destination === mount.destination);
    assert(observed?.Type === mount.type && observed.RW === !mount.readOnly
      && (mount.type === 'bind' ? observed.Source === mount.source
        : mount.name ? observed.Name === mount.name : /^[a-f0-9]{64}$/u.test(observed.Name)), 'green_98_106_owned_mount');
  }
}
function imageSpec(image, reference, networkId, networks, overrides, options = {}) {
  const env = { ...environmentMap(image.Config.Env ?? []), ...overrides };
  const mounts = options.mounts ?? [];
  const groups = options.groups ?? [];
  const spec = { image: reference, imageId: image.Id, user: image.Config.User ?? '', env,
    entrypoint: options.entrypoint ? [options.entrypoint] : image.Config.Entrypoint ?? [],
    cmd: options.cmd ?? image.Config.Cmd ?? [], networkId, networks, mounts, groups, ports: options.ports ?? {} };
  const args = ['--network', networkId, '--restart', 'no', ...groups.flatMap(group => ['--group-add', group]),
    ...Object.keys(overrides).sort().flatMap(key => ['--env', key]),
    ...mounts.flatMap(m => ['--mount', `type=${m.type},${m.source ? `src=${m.source},` : m.name ? `src=${m.name},` : ''}dst=${m.destination}${m.readOnly ? ',readonly' : ''}`]),
    ...(options.entrypoint ? ['--entrypoint', options.entrypoint] : []),
    ...(Object.keys(spec.ports).length ? ['--publish', '127.0.0.1:18082:8080'] : []),
    reference, ...(options.cmd ?? [])];
  return { spec, args, env: overrides, validate: record => assertContainerSpec(record, spec) };
}
async function poll(check, delay = sleep) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const value = await check(); if (value) return value; } catch { /* Bounded sanitized polling. */ }
    await delay(1000);
  }
  assert(false, 'green_98_106_poll_timeout');
}
async function imageReadback(command, reference, revision) {
  const image = dockerObject(await command({ phase: 'execution_image', args: ['image', 'inspect', reference] }));
  assert(/^sha256:[a-f0-9]{64}$/u.test(image.Id) && image.RepoDigests?.some(value => value.endsWith(`@${reference.split('@')[1]}`))
    && (!revision || image.Config?.Labels?.['org.opencontainers.image.revision'] === revision), 'green_98_106_execution_image');
  return image;
}
async function inspectSource(command, inputs, name, running) {
  const record = dockerObject(await command({ phase: 'source_cas', args: ['inspect', inputs.target.api.id] }));
  checkContainer(record, { ...inputs.target.api, name }, running); return record;
}
async function quiesce(command, inputs, alreadySealed) {
  if (alreadySealed) { await inspectSource(command, inputs, sealedApiName, false); return; }
  await inspectSource(command, inputs, inputs.target.api.name, true);
  try { await command({ phase: 'source_stop', args: ['stop', inputs.target.api.id] }); } catch { /* Exact postcondition below. */ }
  await inspectSource(command, inputs, inputs.target.api.name, false);
  const collision = String(await command({ phase: 'seal_collision', args: ['ps', '--all', '--no-trunc', '--filter', `name=^/${sealedApiName}$`, '--format', '{{.ID}}'] })).trim();
  assert(collision === '', 'green_98_106_seal_collision');
  await inspectSource(command, inputs, inputs.target.api.name, false);
  try { await command({ phase: 'source_rename', args: ['rename', inputs.target.api.id, sealedApiName] }); } catch { /* Exact postcondition below. */ }
  await inspectSource(command, inputs, sealedApiName, false);
}
async function probes(command, candidateId, runtimeCommit) {
  assert(validId(candidateId), 'green_98_106_probe_identity');
  const script = "const result={};for(const [key,path] of [['live','/health/live'],['health','/health/ready'],['ready','/health/ready'],['version','/version']]){const response=await fetch('http://127.0.0.1:8080'+path,{signal:AbortSignal.timeout(5000)});if(response.status!==200)throw Error('readiness');result[key]=await response.json();}process.stdout.write(JSON.stringify(result));";
  const payload = JSON.parse(String(await command({ phase: 'application_readbacks', args: ['exec', candidateId, 'node', '--input-type=module', '-e', script] })));
  assertGreenRuntimeReadbacks({ ...payload, runtimeCommit });
  assert(payload.ready?.status === 'ok', 'green_98_106_readiness_not_ok');
  return true;
}
export async function publicReadback() {
  const response = await fetch(`${green98106.targetOrigin}/api/version`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  let body = null; try { body = await response.json(); } catch { /* A 502/503 may be non-JSON. */ }
  return { status: response.status, body };
}

// Rehearsal and canonical promotion are deliberately separate entry points.
export async function runRehearsal(inputs, options, dependencies = {}) {
  assert(options?.confirmation === `rehearse:${green98106.runtimeCommit}:${inputs.binding.opsCommit}:${inputs.binding.targetSha256}`,
    'green_98_106_rehearsal_confirmation');
  validateRuntimeManifest(inputs);
  const command = dependencies.command ?? dockerCommand;
  const directory = privateDirectory(options.evidenceDirectory);
  assertPrivateRuntime(inputs.privateRuntime, inputs);
  const nonce = dependencies.nonce ?? crypto.randomBytes(16).toString('hex');
  assertArtifactFamily(directory, [`${nonce}.pgdump`, `${nonce}.rehearsal.json`, `${nonce}.failure.json`]);
  const materials = (dependencies.bindMaterials ?? bindMaterials)(inputs.privateRuntime);
  const owned = new OwnedDocker({ nonce, command });
  const database = targetDatabase(inputs);
  let backup; let result; let operationError; let cleanupError;
  try {
    const first = dockerObject(await command({ phase: 'source_initial', args: ['inspect', inputs.target.api.id] }));
    const sourceSealed = first.Name === `/${sealedApiName}` && first.State?.Running === false;
    await runReadOnlyPreflight(inputs, { command: entry => command(entry), git: dependencies.git, sourceSealed });
    assert(inputs.privateRuntime.api.HostConfig?.RestartPolicy?.Name === 'no', 'green_98_106_old_restart_policy');
    const plan = buildPlan({ ...inputs, actualOpsCommit: inputs.binding.opsCommit });
    const runtimeImage = await imageReadback(command, plan.image, green98106.runtimeCommit);
    const postgresImage = await imageReadback(command, green98106.postgresImage);
    const probeMounts = [
      { type: 'bind', source: materials.mfaFile, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
      { type: 'bind', source: materials.firebaseFile, destination: '/run/secrets/firebase-service-account.json', readOnly: true },
      { type: 'bind', source: materials.acceptanceMfaFile, destination: '/run/secrets/acceptance-mfa', readOnly: true },
    ];
    materials.recheck();
    const materialScript = "import fs from 'node:fs';import crypto from 'node:crypto';const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),mfa:hash('/run/secrets/mfa-encryption-key'),firebase:hash('/run/secrets/firebase-service-account.json'),acceptance:hash('/run/secrets/acceptance-mfa')}));";
    const materialProbe = await owned.create({ kind: 'container', role: 'materials',
      ...imageSpec(runtimeImage, plan.image, 'none', {}, {}, { groups: ['65532'], mounts: probeMounts,
        entrypoint: 'node', cmd: ['--input-type=module', '-e', materialScript] }) });
    const materialResult = JSON.parse(await owned.task(materialProbe));
    assert(Number.isSafeInteger(materialResult.uid) && materialResult.uid > 0 && Number.isSafeInteger(materialResult.gid)
      && materialResult.gid > 0 && materialResult.mfa === materials.mfaSha256 && materialResult.acceptance === materials.mfaSha256
      && materialResult.firebase === materials.firebaseSha256, 'green_98_106_material_runtime_unreadable');
    materials.recheck(); await owned.remove(materialProbe);
    await (dependencies.assertPort ?? assertLoopbackPortAvailable)(18082);
    await quiesce(command, inputs, sourceSealed);
    assert([502, 503].includes((await (dependencies.publicReadback ?? publicReadback)()).status), 'green_98_106_public_source_not_quiesced');
    await assertNoWriters(command, database);
    const before = await readSnapshot(command, database, 98);
    backup = exclusiveArtifact(directory, `${nonce}.pgdump`);
    await command({ phase: 'protected_backup', args: ['exec', database.id, 'pg_dump', '--format=custom', '--no-owner', '--no-acl',
      '-U', database.user, '-d', database.name], outputFd: backup.fd });
    fs.fsyncSync(backup.fd);
    const backupBytes = verifyArtifact(backup);
    backupBytes.bytes.fill(0);
    await assertNoWriters(command, database);
    await inspectSource(command, inputs, sealedApiName, false);
    assert(equal(await readSnapshot(command, database, 98), before), 'green_98_106_source_backup_drift');
    const network = await owned.create({ kind: 'network', role: 'network', validate: record => {
      assert(record.Internal === true && record.Driver === 'bridge', 'green_98_106_isolated_network');
    } });
    const password = crypto.randomBytes(32).toString('base64url');
    const dbEnv = { POSTGRES_USER: 'green_rehearsal', POSTGRES_DB: 'green_rehearsal', POSTGRES_PASSWORD: password };
    const dbResource = await owned.create({ kind: 'container', role: 'postgres',
      ...imageSpec(postgresImage, green98106.postgresImage, network.id, { [network.name]: network.id }, dbEnv,
        { mounts: [{ type: 'volume', destination: '/var/lib/postgresql/data', readOnly: false }] }) });
    await owned.start(dbResource);
    await poll(async () => String(await command({ phase: 'postgres_init_marker', args: ['logs', dbResource.id] }))
      .includes('PostgreSQL init process complete; ready for start up.'), dependencies.delay);
    const isolated = { id: dbResource.id, user: 'green_rehearsal', name: 'green_rehearsal' };
    for (let i = 0; i < 2; i += 1) {
      assert(await readDatabase(command, isolated, `postgres_select_${i}`, 'SELECT 1') === '1', 'green_98_106_postgres_not_stable');
    }
    assert(/^16[0-9]{4}$/u.test(await readDatabase(command, isolated, 'postgres_major', 'SHOW server_version_num')), 'green_98_106_postgres_major');
    const verified = verifyArtifact(backup, { expectedDigest: backupBytes.sha256 });
    try {
      await command({ phase: 'restore98', args: ['exec', '-i', isolated.id, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
        '-U', isolated.user, '-d', isolated.name], input: verified.bytes });
    } finally { verified.bytes.fill(0); }
    const restored = await readSnapshot(command, isolated, 98);
    assert(equal(restored, before), 'green_98_106_restore98_mismatch');
    const dbRecord = await owned.inspect('container', dbResource.id); owned.assertOwned(dbRecord, dbResource);
    const ip = dbRecord.NetworkSettings.Networks[network.name].IPAddress;
    assert(typeof ip === 'string' && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/u.test(ip)
      && ip.split('.').every(part => Number(part) <= 255) && !ip.startsWith('127.'), 'green_98_106_isolated_ip');
    const databaseUrl = `postgresql://green_rehearsal:${password}@${ip}:5432/green_rehearsal`;
    const migrate = async role => {
      const worker = await owned.create({ kind: 'container', role,
        ...imageSpec(runtimeImage, plan.image, network.id, { [network.name]: network.id }, { DATABASE_URL: databaseUrl },
          { entrypoint: 'node', cmd: ['--input-type=module', '-e', migrationScript] }) });
      const freshDb = await owned.inspect('container', dbResource.id); owned.assertOwned(freshDb, dbResource);
      assert(freshDb.State.Running === true && freshDb.NetworkSettings.Networks[network.name].IPAddress === ip, 'green_98_106_migration_database_cas');
      assert(await owned.task(worker) === 'migration-complete', 'green_98_106_migration_marker'); await owned.remove(worker);
    };
    await migrate('migrateone');
    const oldNames = Object.keys(before.data.business);
    const after = await readSnapshot(command, isolated, 106, oldNames);
    assertDataTransition(before.data, after.data); assertReadinessFindingsUnchanged(before.readiness, after.readiness);
    await checkForwardIntegrity(command, isolated); await migrate('migratetwo');
    assert(equal(await readSnapshot(command, isolated, 106, oldNames), after), 'green_98_106_idempotence');
    const candidateEnv = { ...requiredEnvironment, FIREBASE_AUTH_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'false',
      APP_COMMIT: green98106.runtimeCommit, DATABASE_URL: databaseUrl, JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      PORT: '8080', BIND_HOST: '0.0.0.0', MFA_ENCRYPTION_KEY_FILE: '/run/secrets/mfa-encryption-key',
      APP_PUBLIC_URL: 'http://127.0.0.1:18082', PUBLIC_BASE_URL: 'http://127.0.0.1:18082/v1',
      CORS_ORIGINS: 'http://127.0.0.1:18082', APPLE_REVOCATION_ENABLED: 'false', APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'false' };
    materials.recheck(); await (dependencies.assertPort ?? assertLoopbackPortAvailable)(18082);
    const candidate = await owned.create({ kind: 'container', role: 'candidate',
      ...imageSpec(runtimeImage, plan.image, network.id, { [network.name]: network.id }, candidateEnv,
        { groups: ['65532'], mounts: [
          { type: 'volume', destination: '/data/uploads', readOnly: false },
          { type: 'bind', source: materials.acceptanceMfaFile, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
        ], ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } }) });
    // Findings must be from this exact restore immediately before start.
    const immediatelyBeforeStart = await readSnapshot(command, isolated, 106, oldNames);
    assert(equal(immediatelyBeforeStart, after), 'green_98_106_candidate_baseline_drift');
    materials.recheck(); await owned.start(candidate);
    await poll(() => probes(command, candidate.id, green98106.runtimeCommit), dependencies.delay);
    assert([502, 503].includes((await (dependencies.publicReadback ?? publicReadback)()).status), 'green_98_106_public_candidate_served');
    const started = await readSnapshot(command, isolated, 106, oldNames);
    assert(equal(started, after), 'green_98_106_candidate_start_drift');
    const featureProbes = await runMfaProbe({ container: candidate.id, commandRunner: async (_cmd, args, input) =>
      String(await command({ phase: 'candidate_mfa_identity', args, input })) });
    assertReadinessFindingsUnchanged(after.readiness, (await readSnapshot(command, isolated, 106, oldNames)).readiness);
    await owned.cleanup();
    await inspectSource(command, inputs, sealedApiName, false); await assertNoWriters(command, database);
    assert(equal(await readSnapshot(command, database, 98), before), 'green_98_106_source_final_drift');
    result = { kind: 'sit-green-staging-98-106-rehearsal', schemaVersion: 1, status: 'passed',
      runtimeCommit: green98106.runtimeCommit, opsCommit: inputs.binding.opsCommit,
      publicationSha256: inputs.binding.publicationSha256, targetSha256: inputs.binding.targetSha256,
      configSha256: inputs.binding.configSha256, backupSha256: backupBytes.sha256,
      materialBindingSha256: objectDigest({ mfa: materials.mfaSha256, firebase: materials.firebaseSha256 }),
      source: before, migrated: after, featureProbes, cleanupVerified: true, servicesRemainQuiesced: true,
      publicCandidateServed: false, publicReleaseComplete: false, providerTraffic: false,
      createdAt: new Date().toISOString() };
  } catch (error) { operationError = error; }
  finally {
    if (!owned.cleanupComplete) { try { await owned.cleanup(); } catch (error) { cleanupError = error; } }
    if (backup) closeArtifact(backup); materials.close();
  }
  if (cleanupError || operationError) {
    writeArtifact(directory, `${nonce}.failure.json`, { kind: 'sit-green-staging-98-106-failure',
      runtimeCommit: green98106.runtimeCommit, opsCommit: inputs.binding.opsCommit,
      phase: 'rehearsal', cleanupVerified: !cleanupError, code: safeError(cleanupError ?? operationError),
      publicReleaseComplete: false, oldImageRestarted: false });
    throw cleanupError ?? operationError;
  }
  const artifact = writeArtifact(directory, `${nonce}.rehearsal.json`, result);
  return { status: 'rehearsal_passed_services_quiesced', artifact, publicReleaseComplete: false };
}

export function validateRehearsal(receipt, inputs, { now = Date.now() } = {}) {
  exact(receipt, ['kind', 'schemaVersion', 'status', 'runtimeCommit', 'opsCommit', 'publicationSha256',
    'targetSha256', 'configSha256', 'backupSha256', 'materialBindingSha256', 'source', 'migrated',
    'featureProbes', 'cleanupVerified', 'servicesRemainQuiesced', 'publicCandidateServed',
    'publicReleaseComplete', 'providerTraffic', 'createdAt'], 'green_98_106_rehearsal_receipt');
  assert(receipt.kind === 'sit-green-staging-98-106-rehearsal' && receipt.schemaVersion === 1 && receipt.status === 'passed'
    && receipt.runtimeCommit === green98106.runtimeCommit && receipt.opsCommit === inputs.binding.opsCommit
    && receipt.publicationSha256 === inputs.binding.publicationSha256 && receipt.targetSha256 === inputs.binding.targetSha256
    && receipt.configSha256 === inputs.binding.configSha256 && /^[a-f0-9]{64}$/u.test(receipt.backupSha256)
    && /^[a-f0-9]{64}$/u.test(receipt.materialBindingSha256) && receipt.cleanupVerified === true
    && receipt.servicesRemainQuiesced === true && receipt.publicCandidateServed === false
    && receipt.publicReleaseComplete === false && receipt.providerTraffic === false,
  'green_98_106_rehearsal_receipt');
  const age = now - Date.parse(receipt.createdAt);
  assert(Number.isFinite(age) && age >= 0 && age <= 60 * 60 * 1000, 'green_98_106_rehearsal_expired');
  assert(equal(receipt.featureProbes, { mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' }),
    'green_98_106_rehearsal_acceptance');
  assertDataTransition(receipt.source.data, receipt.migrated.data);
  assertReadinessFindingsUnchanged(receipt.source.readiness, receipt.migrated.readiness);
}

export async function runPromotion(inputs, options, dependencies = {}) {
  assert(/^[a-f0-9]{64}$/u.test(inputs.rehearsalSha256 ?? ''), 'green_98_106_rehearsal_bytes_required');
  assert(options?.confirmation === `promote:${green98106.runtimeCommit}:${inputs.binding.opsCommit}:${inputs.rehearsalSha256}`,
    'green_98_106_promotion_confirmation');
  validateRuntimeManifest(inputs);
  validateRehearsal(inputs.rehearsal, inputs);
  const command = dependencies.command ?? dockerCommand;
  const directory = privateDirectory(options.evidenceDirectory);
  assertPrivateRuntime(inputs.privateRuntime, inputs);
  const nonce = dependencies.nonce ?? crypto.randomBytes(16).toString('hex');
  assertArtifactFamily(directory, [`${nonce}.canonical-started.json`, `${nonce}.promotion.json`, `${nonce}.promotion-failure.json`]);
  const materials = (dependencies.bindMaterials ?? bindMaterials)(inputs.privateRuntime);
  const owned = new OwnedDocker({ nonce, command });
  const database = targetDatabase(inputs);
  let backup; let finalId; let finalSpec; let canonicalStarted = false; let operationError; let cleanupError; let result; let artifact;
  const finalInspect = async () => {
    assert(validId(finalId), 'green_98_106_final_id');
    const record = dockerObject(await command({ phase: 'final_inspect', args: ['inspect', finalId] }));
    assert(record.Id === finalId && record.Name === `/${inputs.target.api.name}`
      && record.Config?.Labels?.['com.shareittoo.green.98_106.promotion'] === nonce,
    'green_98_106_final_identity');
    assertContainerSpec(record, finalSpec); return record;
  };
  try {
    await runReadOnlyPreflight(inputs, { command: entry => command(entry), git: dependencies.git, sourceSealed: true });
    assert(inputs.privateRuntime.api.HostConfig?.RestartPolicy?.Name === 'no', 'green_98_106_old_restart_policy');
    const plan = buildPlan({ ...inputs, actualOpsCommit: inputs.binding.opsCommit });
    const image = await imageReadback(command, plan.image, green98106.runtimeCommit);
    materials.recheck();
    assert(objectDigest({ mfa: materials.mfaSha256, firebase: materials.firebaseSha256 }) === inputs.rehearsal.materialBindingSha256,
      'green_98_106_material_rehearsal_drift');
    backup = openArtifact(options.backupFile);
    const verified = verifyArtifact(backup, { expectedDigest: inputs.rehearsal.backupSha256 }); verified.bytes.fill(0);
    await inspectSource(command, inputs, sealedApiName, false); await assertNoWriters(command, database);
    assert(equal(await readSnapshot(command, database, 98), inputs.rehearsal.source), 'green_98_106_canonical_source_drift');
    const internal = inputs.target.networks.find(network => network.internal);
    const provider = inputs.target.networks.find(network => !network.internal);
    const sourceEnv = environmentMap(inputs.privateRuntime.api.Config.Env);
    const sourceDatabaseUrl = sourceEnv.DATABASE_URL;
    assert(typeof sourceDatabaseUrl === 'string' && sourceDatabaseUrl.startsWith('postgres'), 'green_98_106_canonical_database_url');
    const dbRecord = dockerObject(await command({ phase: 'canonical_database_identity', args: ['inspect', database.id] }));
    checkContainer(dbRecord, inputs.target.database, true);
    const url = new URL(sourceDatabaseUrl);
    const endpoint = dbRecord.NetworkSettings?.Networks?.[internal.name];
    assert(endpoint?.NetworkID === internal.id && url.pathname === `/${database.name}`
      && decodeURIComponent(url.username) === database.user && (!url.port || url.port === '5432')
      && [endpoint.IPAddress, inputs.target.database.name, ...(endpoint.Aliases ?? [])].includes(url.hostname),
    'green_98_106_canonical_database_binding');
    // Connect migration workers by freshly inspected IPv4, never by a mutable alias.
    assert(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/u.test(endpoint.IPAddress), 'green_98_106_canonical_database_ip');
    url.hostname = endpoint.IPAddress;
    const databaseCas = async () => {
      const fresh = dockerObject(await command({ phase: 'canonical_database_cas', args: ['inspect', database.id] }));
      checkContainer(fresh, inputs.target.database, true);
      assert(fresh.NetworkSettings.Networks[internal.name].IPAddress === endpoint.IPAddress, 'green_98_106_canonical_database_ip_drift');
      const net = dockerObject(await command({ phase: 'canonical_network_cas', args: ['network', 'inspect', internal.id] }));
      // Every CAS runs before worker/final start; stopped owned containers and
      // the sealed source must not appear in the active membership map.
      assert(net.Id === internal.id && net.Name === internal.name && net.Internal === true
        && equal(networkMembers(net.Containers), internal.members.filter(m => m.id !== inputs.target.api.id)),
      'green_98_106_canonical_foreign_member');
    };
    const worker = await owned.create({ kind: 'container', role: 'canonicalmigration',
      ...imageSpec(image, plan.image, internal.id, { [internal.name]: internal.id }, { DATABASE_URL: url.href },
        { entrypoint: 'node', cmd: ['--input-type=module', '-e', migrationScript] }) });
    // Last CAS immediately before the first canonical schema write.
    await inspectSource(command, inputs, sealedApiName, false); await assertNoWriters(command, database);
    assert(equal(await readSnapshot(command, database, 98), inputs.rehearsal.source), 'green_98_106_canonical_cas');
    await databaseCas();
    materials.recheck();
    writeArtifact(directory, `${nonce}.canonical-started.json`, { kind: 'sit-green-staging-98-106-canonical-boundary',
      runtimeCommit: green98106.runtimeCommit, opsCommit: inputs.binding.opsCommit, rehearsalSha256: inputs.rehearsalSha256,
      targetSha256: inputs.binding.targetSha256, oldImageRestartForbidden: true, automaticRestoreForbidden: true });
    canonicalStarted = true;
    assert(await owned.task(worker) === 'migration-complete', 'green_98_106_canonical_migration'); await owned.remove(worker);
    const oldNames = Object.keys(inputs.rehearsal.source.data.business);
    const migrated = await readSnapshot(command, database, 106, oldNames);
    assertDataTransition(inputs.rehearsal.source.data, migrated.data);
    assertReadinessFindingsUnchanged(inputs.rehearsal.source.readiness, migrated.readiness);
    await checkForwardIntegrity(command, database);
    const again = await owned.create({ kind: 'container', role: 'canonicalagain',
      ...imageSpec(image, plan.image, internal.id, { [internal.name]: internal.id }, { DATABASE_URL: url.href },
        { entrypoint: 'node', cmd: ['--input-type=module', '-e', migrationScript] }) });
    await databaseCas();
    assert(await owned.task(again) === 'migration-complete', 'green_98_106_canonical_idempotence'); await owned.remove(again);
    assert(equal(await readSnapshot(command, database, 106, oldNames), migrated), 'green_98_106_canonical_idempotence');
    const overrides = Object.fromEntries(Object.entries(sourceEnv).filter(([key]) => !immutableIdentityKeys.has(key)));
    // Source auth/access settings are preserved; no provider activation is introduced.
    assertEnvironment(Object.entries(overrides).map(([key, value]) => `${key}=${value}`), inputs.config);
    const built = imageSpec(image, plan.image, internal.id, { [internal.name]: internal.id }, overrides, {
      groups: inputs.privateRuntime.api.HostConfig.GroupAdd ?? [], mounts: [
        { type: 'bind', source: materials.mfaFile, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
        { type: 'bind', source: materials.firebaseFile, destination: '/run/secrets/firebase-service-account.json', readOnly: true },
        { type: 'volume', name: inputs.target.uploads.name, destination: '/data/uploads', readOnly: false },
      ],
    });
    finalSpec = built.spec;
    const lookupFinal = async () => String(await command({ phase: 'final_lookup', args: ['ps', '--all', '--no-trunc',
      '--filter', `name=^/${inputs.target.api.name}$`, '--format', '{{.ID}}'] })).trim();
    assert(await lookupFinal() === '', 'green_98_106_final_collision');
    await inspectSource(command, inputs, sealedApiName, false); materials.recheck(); await assertNoWriters(command, database);
    let returned; let failed = false;
    try {
      returned = String(await command({ phase: 'final_create', args: ['create', '--name', inputs.target.api.name,
        '--label', `com.shareittoo.green.98_106.promotion=${nonce}`, '--label', 'com.shareittoo.sit.green=true',
        '--label', 'com.shareittoo.sit.green.run_id=20260918011528-wp254', ...built.args], env: built.env })).trim();
    } catch { failed = true; }
    finalId = await lookupFinal();
    assert(validId(finalId) && (failed || finalId === returned), 'green_98_106_final_create_unconfirmed');
    assert((await finalInspect()).State?.Running === false, 'green_98_106_final_prestart');
    materials.recheck(); await databaseCas(); await inspectSource(command, inputs, sealedApiName, false);
    assert(equal(await readSnapshot(command, database, 106, oldNames), migrated), 'green_98_106_final_prestart_database_drift');
    try { await command({ phase: 'final_start', args: ['start', finalId] }); } catch { /* Read back exact ID. */ }
    assert((await finalInspect()).State?.Running === true, 'green_98_106_final_start_unconfirmed');
    await poll(() => probes(command, finalId, green98106.runtimeCommit), dependencies.delay);
    assert(equal(await readSnapshot(command, database, 106, oldNames), migrated), 'green_98_106_final_start_data_drift');
    // Last public-route boundary: provider network is attached only after internal acceptance.
    await inspectSource(command, inputs, sealedApiName, false); materials.recheck(); await finalInspect();
    const providerNow = dockerObject(await command({ phase: 'provider_network_cas', args: ['network', 'inspect', provider.id] }));
    assert(providerNow.Id === provider.id && providerNow.Name === provider.name && providerNow.Internal === false
      && equal(networkMembers(providerNow.Containers), provider.members.filter(m => m.id !== inputs.target.api.id)),
      'green_98_106_provider_network_drift');
    try { await command({ phase: 'final_network_connect', args: ['network', 'connect', provider.id, finalId] }); } catch { /* Exact postcondition. */ }
    finalSpec.networks[provider.name] = provider.id;
    await finalInspect(); await poll(() => probes(command, finalId, green98106.runtimeCommit), dependencies.delay);
    const publicVersion = await (dependencies.publicReadback ?? publicReadback)();
    assert(publicVersion.status === 200 && publicVersion.body?.commit === green98106.runtimeCommit
      && publicVersion.body?.environment === 'test', 'green_98_106_public_version_mismatch');
    await owned.cleanup();
    assertDataTransition(inputs.rehearsal.source.data, (await readSnapshot(command, database, 106, oldNames)).data);
    result = { kind: 'sit-green-staging-98-106-promotion', schemaVersion: 1, status: 'promoted',
      runtimeCommit: green98106.runtimeCommit, opsCommit: inputs.binding.opsCommit, rehearsalSha256: inputs.rehearsalSha256,
      targetSha256: inputs.binding.targetSha256, imageDigest: inputs.publication.digest,
      sourceLedger: green98106.sourceLedger, targetLedger: green98106.targetLedger,
      cleanupVerified: true, oldImageRestarted: false, providerActivationChanged: false,
      publicRouteAttached: true, publicReleaseComplete: false };
    // Evidence persistence is part of the protected operation. Failure still
    // isolates the successor; serving without a verified receipt is not PASS.
    artifact = writeArtifact(directory, `${nonce}.promotion.json`, result);
  } catch (error) { operationError = error; }
  finally {
    if (operationError && canonicalStarted && finalId) {
      try {
        // A lost connect response may leave either permitted network set. Stop
        // only the exact owned successor after validating the actual subset.
        const raw = dockerObject(await command({ phase: 'isolation_inventory', args: ['inspect', finalId] }));
        const allowed = Object.fromEntries(inputs.target.networks.map(n => [n.name, n.id]));
        const actual = raw.NetworkSettings?.Networks ?? {};
        assert(Object.keys(actual).every(name => actual[name].NetworkID === allowed[name]), 'green_98_106_isolation_network_identity');
        finalSpec.networks = Object.fromEntries(Object.keys(actual).map(name => [name, allowed[name]]));
        const record = await finalInspect();
        if (record.State.Running) {
          try { await command({ phase: 'failure_isolate_stop', args: ['stop', finalId] }); } catch { /* Verify. */ }
          assert((await finalInspect()).State.Running === false, 'green_98_106_isolation_stop_failed');
        }
        const provider = inputs.target.networks.find(n => !n.internal);
        if (Object.hasOwn(finalSpec.networks, provider.name)) {
          await finalInspect();
          try { await command({ phase: 'failure_isolate_disconnect', args: ['network', 'disconnect', provider.id, finalId] }); } catch { /* Verify. */ }
          delete finalSpec.networks[provider.name]; await finalInspect();
        }
      } catch { cleanupError = new Error('green_98_106_forward_isolation_not_verified'); }
    }
    if (!owned.cleanupComplete) { try { await owned.cleanup(); } catch (error) { cleanupError = error; } }
    if (backup) closeArtifact(backup); materials.close();
  }
  if (cleanupError || operationError) {
    writeArtifact(directory, `${nonce}.promotion-failure.json`, { kind: 'sit-green-staging-98-106-failure',
      runtimeCommit: green98106.runtimeCommit, opsCommit: inputs.binding.opsCommit,
      phase: 'promotion', canonicalMigrationStarted: canonicalStarted, forwardRecoveryRequired: canonicalStarted,
      cleanupVerified: !cleanupError, oldImageRestarted: false, automaticRestoreAttempted: false,
      code: safeError(cleanupError ?? operationError), publicReleaseComplete: false });
    throw cleanupError ?? operationError;
  }
  return { status: result.status, artifact, publicReleaseComplete: false };
}
