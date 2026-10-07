import crypto from 'node:crypto';
import fs from 'node:fs';
import { equal, objectDigest } from './green_staging_98_106_contract.mjs';
import { requiredEnvironment, containerFingerprint } from './green_staging_98_106_promotion.mjs';
import { dockerCommand } from './green_staging_98_106_resources.mjs';
import { assertArtifactFamily, closeArtifact, exclusiveArtifact, privateDirectory, verifyArtifact, writeArtifact } from './green_staging_98_106_evidence.mjs';
import { assertGreenRuntimeReadbacks } from './green_staging_promotion.mjs';
import { runMfaProbe } from './staging_controlled_acceptance.mjs';
import { requireBinding as require } from './green_staging_106_106_binding.mjs';
import { bindExecutionMaterials, executionPreflight, physicalSchemaSql, constraintsSql, writersSql, preflightRead } from './green_staging_106_106_preflight.mjs';
import { assertSuccessorStartup, decodeSnapshot, snapshotSql } from './green_staging_106_106_database.mjs';
import { SuccessorDocker, dockerObject, isolatedSpec } from './green_staging_106_106_resources.mjs';
import { buildReleaseMetadata } from '../src/release.js';

// These mutable data classes are not ordinary pg_tables. Keep them separately
// strict across backup/restore/start/probes; never fold them into schema truth.
export const auxiliarySql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT coalesce('SELECT json_object_agg(name,state) FROM (' || string_agg(format('SELECT %L AS name,(SELECT row_to_json(s) FROM (SELECT last_value,is_called FROM %I.%I) s) AS state',sequencename,schemaname,sequencename),' UNION ALL ' ORDER BY sequencename) || ') x;', 'SELECT ''{}''::json;') FROM pg_sequences WHERE schemaname='public'
\\gexec
SELECT coalesce('SELECT json_object_agg(name,state) FROM (' || string_agg(format('SELECT %L AS name,(SELECT json_build_object(''count'',count(*),''sha256'',encode(digest(coalesce(string_agg(row_to_json(t)::text,E''\\n'' ORDER BY row_to_json(t)::text),''''),''sha256''),''hex'')) FROM %I.%I t) AS state',matviewname,schemaname,matviewname),' UNION ALL ' ORDER BY matviewname) || ') x;', 'SELECT ''{}''::json;') FROM pg_matviews WHERE schemaname='public'
\\gexec
COMMIT;
`;
export const readinessScript = "const result={};for(const [key,path] of [['live','/health/live'],['health','/health/ready'],['ready','/health/ready'],['version','/version']]){const response=await fetch('http://127.0.0.1:8080'+path,{signal:AbortSignal.timeout(5000)});if(response.status!==200)throw Error('readiness');result[key]=await response.json();}process.stdout.write(JSON.stringify(result));";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(check, delay) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if (await check()) return; } catch { /* Only bounded read-only polling. */ }
    if (attempt < 29) await delay(1000);
  }
  require(false, 'rehearsal_poll_timeout');
}
const sqlArgs = (id, database) => ['exec', '-i', id, 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', database.databaseUser, '-d', database.databaseName];
export function validatePreflightReceipt(receipt, sha256, inputs, now = Date.now()) {
  require(receipt?.kind === 'sit-green-staging-106-106-preflight' && receipt.schemaVersion === 2
    && receipt.status === 'read_only_preflight_passed' && objectDigest(receipt) === sha256
    && receipt.targetSha256 === inputs.manifest.targetSha256 && receipt.configSha256 === inputs.manifest.configSha256
    && receipt.physicalSchemaSha256 === inputs.manifest.physicalSchemaSha256
    && receipt.candidateContent?.imageId === inputs.binding.candidateImageId
    && receipt.promotionAuthorized === false && receipt.rehearsalPassed === false
    && receipt.mutationAdapterImplemented === false && receipt.namespaceReadabilityVerified === false,
  'rehearsal_preflight_receipt');
  const created = Date.parse(receipt.createdAt);
  require(Number.isFinite(created) && Number.isFinite(now) && created <= now && now - created <= 3600000, 'rehearsal_preflight_freshness');
}
export function rehearsalConfirmation(inputs, preflightSha256) {
  require(/^[a-f0-9]{64}$/u.test(preflightSha256), 'rehearsal_preflight_digest');
  return `rehearse:${inputs.binding.runtimeCommit}:${inputs.binding.opsCommit}:${inputs.manifest.targetSha256}:${preflightSha256}`;
}
export const rehearsalCommand = entry => entry.args?.[0] === 'image' && entry.args?.[1] === 'save'
  ? preflightRead(entry) : dockerCommand(entry);

export async function runSuccessorRehearsal(inputs, options, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  require(options?.confirmation === rehearsalConfirmation(inputs, options.preflightSha256), 'rehearsal_confirmation');
  validatePreflightReceipt(options.preflight, options.preflightSha256, inputs, now());
  const command = dependencies.command ?? rehearsalCommand, delay = dependencies.delay ?? sleep;
  const evidence = privateDirectory(options.evidenceDirectory), runId = inputs.config.runId;
  const names = [`${runId}.pgdump`, `${runId}.rehearsal.json`, `${runId}.failure.json`];
  assertArtifactFamily(evidence, names); // Entire namespace before any command/mutation.
  const fresh = await executionPreflight(inputs, { command, sourceOptions: dependencies.sourceOptions,
    materials: dependencies.materials, now });
  const { createdAt: previousTime, ...previous } = options.preflight;
  const { createdAt: currentTime, ...current } = fresh;
  require(equal(previous, current), 'rehearsal_preflight_changed');
  const owned = new SuccessorDocker({ plan: fresh.resources, command });
  const source = inputs.target.containers[0], sourceDb = inputs.binding.scope.database;
  const inspect = async id => dockerObject(await command({ phase: 'source_inspect', args: ['inspect', id] }));
  const sql = async (id, query, phase) => String(await command({ phase, args: sqlArgs(id, inputs.binding.scope), input: query })).trim();
  const snapshot = async id => decodeSnapshot(await sql(id, snapshotSql, 'snapshot106'));
  const auxiliary = async id => {
    const lines = (await sql(id, auxiliarySql, 'auxiliary106')).split('\n'); require(lines.length === 2, 'auxiliary_shape');
    const value = lines.map(line => JSON.parse(line));
    require(value.every(v => v && Object.getPrototypeOf(v) === Object.prototype), 'auxiliary_shape'); return objectDigest(value);
  };
  const sourceCas = async (name, running) => {
    const record = await inspect(source.id);
    require(record.Id === source.id && record.Name === `/${name}` && record.Image === source.imageId
      && record.State?.Running === running && record.State.Paused === false
      && record.HostConfig.RestartPolicy?.Name === 'no' && containerFingerprint(record) === source.configSha256, 'rehearsal_source_cas');
    return record;
  };
  let backup, materials, error, cleanupError, result, stage = 'namespace_prerequisites';
  try {
    const initiallySealed = inputs.config.sourceState === 'sealed';
    const sourceRecord = await sourceCas(initiallySealed ? inputs.config.sealedSourceName : source.name, !initiallySealed);
    materials = (dependencies.materials ?? bindExecutionMaterials)(inputs.config, sourceRecord,
      dockerObject(await command({ phase: 'candidate_image', args: ['image', 'inspect', inputs.binding.candidateImageId] })));
    const candidateImage = dockerObject(await command({ phase: 'candidate_image', args: ['image', 'inspect', inputs.binding.candidateImageId] }));
    const pgImage = dockerObject(await command({ phase: 'postgres_image', args: ['image', 'inspect', sourceDb.imageId] }));
    require(pgImage.Id === sourceDb.imageId && pgImage.RepoDigests?.includes(`postgres@${sourceDb.imageDigest}`)
      && pgImage.Config.Env?.includes('PG_MAJOR=16'), 'rehearsal_postgres_image');
    for (const executable of ['pg_dump', 'pg_restore']) require(/\b16\./u.test(String(await command({ phase: 'postgres_tools',
      args: ['exec', sourceDb.id, executable, '--version'] }))), 'rehearsal_postgres_tools');
    const mfa = inputs.config.materials.find(m => m.destination === '/run/secrets/mfa-encryption-key');
    require(mfa, 'rehearsal_mfa_material');
    const secret = crypto.randomBytes(32).toString('base64url');
    const neutral = { ...requiredEnvironment, FIREBASE_AUTH_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'false',
      DATABASE_URL: `postgresql://${inputs.binding.scope.databaseUser}:${secret}@127.0.0.1:5432/${inputs.binding.scope.databaseName}`,
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'), PORT: '8080', BIND_HOST: '0.0.0.0',
      MFA_ENCRYPTION_KEY_FILE: mfa.destination, APP_PUBLIC_URL: 'http://127.0.0.1:8080', PUBLIC_BASE_URL: 'http://127.0.0.1:8080/v1',
      CORS_ORIGINS: 'http://127.0.0.1:8080', APPLE_REVOCATION_ENABLED: 'false', APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'false' };
    const user = `${fresh.candidateContent.uid}:${fresh.candidateContent.gid}`;
    const paths = inputs.config.materials.map(m => m.destination);
    const supplementalGroups = entries => [...new Set(entries.map(material => String(material.gid))
      .filter(group => group !== String(inputs.config.gid)))].sort((a, b) => Number(a) - Number(b));
    require(equal(materials.supplementalGroups, supplementalGroups(inputs.config.materials)), 'rehearsal_material_groups');
    const materialScript = `import fs from 'node:fs';import crypto from 'node:crypto';await import('/app/src/config.js');process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),hashes:${JSON.stringify(paths)}.map(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))}));`;
    const materialProbe = await owned.create({ kind: 'container', role: 'materials', ...isolatedSpec(candidateImage, null, neutral,
      { user, groups: materials.supplementalGroups, script: materialScript,
        mounts: inputs.config.materials.map(m => ({ type: 'bind', source: m.source, destination: m.destination, readOnly: true })) }) });
    const materialResult = JSON.parse(await owned.task(materialProbe));
    require(equal(materialResult, { uid: fresh.candidateContent.uid, gid: fresh.candidateContent.gid,
      hashes: inputs.config.materials.map(m => m.sha256) }), 'rehearsal_namespace_materials');
    materials.recheck(); await owned.remove(materialProbe);
    stage = 'quiesce_seal';
    // All dependency-bearing prerequisites and namespace proof precede quiesce.
    const collision = String(await command({ phase: 'seal_collision', args: ['ps', '--all', '--no-trunc', '--filter',
      `name=^/${inputs.config.sealedSourceName}$`, '--format', '{{.ID}}'] })).trim();
    require(initiallySealed ? collision === source.id : collision === '', 'rehearsal_seal_collision');
    if (!initiallySealed) {
      await sourceCas(source.name, true);
      try { await command({ phase: 'source_stop', args: ['stop', source.id] }); } catch { /* Readback alone decides. */ }
      await sourceCas(source.name, false);
      try { await command({ phase: 'source_seal', args: ['rename', source.id, inputs.config.sealedSourceName] }); } catch { /* No mutation retry. */ }
    }
    await sourceCas(inputs.config.sealedSourceName, false);
    const sealedInputs = { ...inputs, config: structuredClone(inputs.config), manifest: structuredClone(inputs.manifest) };
    sealedInputs.config.sourceState = 'sealed';
    sealedInputs.manifest.configSha256 = objectDigest(sealedInputs.config);
    // Internal derivative changes only the permitted running->sealed CAS state;
    // all externally approved material/target/runtime bindings are unchanged.
    await executionPreflight(sealedInputs, { command, sourceOptions: dependencies.sourceOptions, materials: dependencies.materials, now });
    stage = 'protected_backup';
    require(await sql(sourceDb.id, writersSql, 'source_writers') === '0', 'rehearsal_source_writer');
    const before = await snapshot(sourceDb.id), beforeAux = await auxiliary(sourceDb.id);
    require(equal(before, inputs.target.database), 'rehearsal_source_changed');
    backup = exclusiveArtifact(evidence, names[0]);
    await command({ phase: 'protected_backup', args: ['exec', sourceDb.id, 'pg_dump', '--format=custom', '--no-owner', '--no-acl',
      '-U', inputs.binding.scope.databaseUser, '-d', inputs.binding.scope.databaseName], outputFd: backup.fd });
    fs.fsyncSync(backup.fd);
    const backupBinding = verifyArtifact(backup); require(backupBinding.bytes.subarray(0, 5).toString() === 'PGDMP', 'rehearsal_backup_format'); backupBinding.bytes.fill(0);
    require(await sql(sourceDb.id, writersSql, 'source_writers') === '0' && equal(await snapshot(sourceDb.id), before)
      && await auxiliary(sourceDb.id) === beforeAux, 'rehearsal_backup_source_drift');
    stage = 'isolated_restore';
    const network = await owned.create({ kind: 'network', role: 'network', validate: n => require(n.Internal === true && n.Driver === 'bridge', 'rehearsal_network') });
    const db = await owned.create({ kind: 'container', role: 'database', ...isolatedSpec(pgImage, network,
      { POSTGRES_USER: inputs.binding.scope.databaseUser, POSTGRES_DB: inputs.binding.scope.databaseName, POSTGRES_PASSWORD: secret },
      { mounts: [{ type: 'volume', destination: '/var/lib/postgresql/data', readOnly: false }] }) });
    await owned.start(db);
    await poll(async () => String(await command({ phase: 'postgres_init', args: ['logs', db.id] })).includes('PostgreSQL init process complete; ready for start up.'), delay);
    for (let i = 0; i < 2; i++) require(await sql(db.id, 'SELECT 1', 'postgres_stable') === '1', 'rehearsal_postgres_not_stable');
    require(/^16[0-9]{4}$/u.test(await sql(db.id, 'SHOW server_version_num', 'postgres_version')), 'rehearsal_postgres_major');
    const held = verifyArtifact(backup, { expectedDigest: backupBinding.sha256 });
    try { await command({ phase: 'restore106', args: ['exec', '-i', db.id, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
      '-U', inputs.binding.scope.databaseUser, '-d', inputs.binding.scope.databaseName], input: held.bytes }); }
    finally { held.bytes.fill(0); }
    require(equal(await snapshot(db.id), before) && await auxiliary(db.id) === beforeAux
      && await sql(db.id, physicalSchemaSql, 'isolated_schema') === inputs.manifest.physicalSchemaSha256
      && await sql(db.id, constraintsSql, 'isolated_constraints') === '0', 'rehearsal_restore_mismatch');
    const databaseRecord = await owned.inspect('container', db.id); owned.assertOwned(databaseRecord, db);
    const address = databaseRecord.NetworkSettings.Networks[network.name].IPAddress;
    require(typeof address === 'string' && /^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)/u.test(address)
      && address.split('.').length === 4 && address.split('.').every(v => /^[0-9]{1,3}$/u.test(v) && Number(v) <= 255), 'rehearsal_database_ip');
    const candidateEnv = { ...neutral, DATABASE_URL: `postgresql://${inputs.binding.scope.databaseUser}:${secret}@${address}:5432/${inputs.binding.scope.databaseName}` };
    const expectedVersion = buildReleaseMetadata({ ...Object.fromEntries(candidateImage.Config.Env.map(e => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)])), ...candidateEnv });
    const candidate = await owned.create({ kind: 'container', role: 'candidate', ...isolatedSpec(candidateImage, network, candidateEnv,
      { user, groups: supplementalGroups([mfa]), mounts: [{ type: 'volume', destination: '/data/uploads', readOnly: false },
        { type: 'bind', source: mfa.source, destination: mfa.destination, readOnly: true }] }) });
    const dbCas = await owned.inspect('container', db.id); owned.assertOwned(dbCas, db);
    require(dbCas.State.Running && dbCas.NetworkSettings.Networks[network.name].IPAddress === address, 'rehearsal_database_cas');
    stage = 'candidate_start';
    require(equal(await snapshot(db.id), before), 'rehearsal_start_baseline'); materials.recheck(); await owned.start(candidate);
    await poll(async () => {
      const value = JSON.parse(String(await command({ phase: 'candidate_readiness', args: ['exec', candidate.id, 'node', '--input-type=module', '-e', readinessScript] })));
      assertGreenRuntimeReadbacks({ ...value, runtimeCommit: inputs.binding.runtimeCommit });
      require(equal(value.version, expectedVersion) && value.live?.status === 'ok' && value.ready?.status === 'ok', 'rehearsal_readiness'); return true;
    }, delay);
    const started = await snapshot(db.id); assertSuccessorStartup(before, started);
    require(await auxiliary(db.id) === beforeAux && await sql(db.id, physicalSchemaSql, 'isolated_schema') === inputs.manifest.physicalSchemaSha256,
      'rehearsal_start_auxiliary');
    await owned.checkNetworks();
    stage = 'synthetic_probes';
    const probes = await runMfaProbe({ container: candidate.id, commandRunner: async (_program, args, input) =>
      String(await command({ phase: 'synthetic_mfa_identity', args, input })) });
    const afterProbes = await snapshot(db.id);
    require(equal(afterProbes.readiness, started.readiness) && afterProbes.data.ledger === started.data.ledger
      && afterProbes.ledgerRowsSha256 === started.ledgerRowsSha256, 'rehearsal_probe_drift');
    await owned.checkNetworks(); stage = 'cleanup'; await owned.cleanup();
    stage = 'sealed_final_readback';
    await sourceCas(inputs.config.sealedSourceName, false);
    require(await sql(sourceDb.id, writersSql, 'source_writers') === '0' && equal(await snapshot(sourceDb.id), before)
      && await auxiliary(sourceDb.id) === beforeAux
      && await sql(sourceDb.id, physicalSchemaSql, 'source_schema') === inputs.manifest.physicalSchemaSha256, 'rehearsal_source_final');
    await executionPreflight(sealedInputs, { command, sourceOptions: dependencies.sourceOptions, materials: dependencies.materials, now });
    result = { kind: 'sit-green-staging-106-106-rehearsal', schemaVersion: 1, status: 'passed',
      runtimeCommit: inputs.binding.runtimeCommit, opsCommit: inputs.binding.opsCommit, preflightSha256: options.preflightSha256,
      targetSha256: inputs.manifest.targetSha256, configSha256: inputs.manifest.configSha256,
      backupSha256: backupBinding.sha256, materialBindingSha256: materials.sha256,
      source: before, started, auxiliarySha256: beforeAux, physicalSchemaSha256: inputs.manifest.physicalSchemaSha256,
      probes, namespaceReadabilityVerified: true, fixtureCleanupVerified: true, cleanupVerified: true,
      servicesRemainSealed: true, canonicalPromotionImplemented: false, publicReleaseComplete: false,
      providerTraffic: false, createdAt: new Date(now()).toISOString() };
  } catch (failure) { error = failure; }
  finally {
    if (!owned.cleanupComplete) try { await owned.cleanup(); } catch (failure) { cleanupError = failure; }
    try { if (backup) closeArtifact(backup); } catch (failure) { cleanupError ??= failure; }
    try { materials?.close(); } catch (failure) { cleanupError ??= failure; }
  }
  if (error || cleanupError) {
    writeArtifact(evidence, names[2], { kind: 'sit-green-staging-106-106-rehearsal-failure', schemaVersion: 1,
      status: 'failed', stage, code: cleanupError ? 'cleanup_failed' : 'rehearsal_failed', cleanupVerified: !cleanupError,
      oldImageRestarted: false, canonicalPromotionImplemented: false, publicReleaseComplete: false });
    require(false, cleanupError ? 'rehearsal_cleanup_failed' : 'rehearsal_failed');
  }
  const artifact = writeArtifact(evidence, names[1], result);
  return { status: 'rehearsal_passed_services_sealed', artifact, canonicalPromotionImplemented: false, publicReleaseComplete: false };
}
