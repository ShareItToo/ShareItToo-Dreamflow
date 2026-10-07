import path from 'node:path';
import fs from 'node:fs';
import { equal, objectDigest, networkMembers } from './green_staging_98_106_contract.mjs';
import { canonicalMounts, containerFingerprint, requiredEnvironment } from './green_staging_98_106_promotion.mjs';
import { assertContainerSpec } from './green_staging_98_106_execution.mjs';
import { assertArtifactFamily, exclusiveArtifact, openArtifact, verifyArtifact, closeArtifact, privateDirectory, writeArtifact } from './green_staging_98_106_evidence.mjs';
import { requireBinding as require } from './green_staging_106_106_binding.mjs';
import { executionPreflight, bindExecutionMaterials, physicalSchemaSql, constraintsSql, writersSql } from './green_staging_106_106_preflight.mjs';
import { rehearsalCommand, auxiliarySql, readinessScript } from './green_staging_106_106_rehearsal.mjs';
import { decodeSnapshot, snapshotSql, assertSuccessorStartup } from './green_staging_106_106_database.mjs';
import { strictSupplementalGroups, dockerObject } from './green_staging_106_106_resources.mjs';
import { buildReleaseMetadata } from '../src/release.js';

const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
export function temporaryPromotionName(inputs) {
  require(/^[a-z0-9][a-z0-9-]{7,47}$/u.test(inputs.config.runId), 'promotion_run_id');
  const name = `sit-106-106-${inputs.config.runId}-promote`;
  require(name !== inputs.binding.scope.api.name && name !== 'shareittoo-staging-api', 'promotion_temporary_name');
  return name;
}
export async function promotionGatewayReadback({ timeoutMs = 5000, signal } = {}) {
  require(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 5000, 'promotion_gateway_timeout');
  const timeout = AbortSignal.timeout(timeoutMs), bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return Object.fromEntries(await Promise.all([['version', '/version'], ['ready', '/health/ready']].map(async ([key, suffix]) => {
    const response = await fetch(`https://staging.shareittoo.com/api${suffix}`, { redirect: 'manual', signal: bounded });
    require(response.status === 200, 'promotion_gateway_status'); return [key, await response.json()];
  })));
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function convergePromotionGateway(expectedVersion, { read = promotionGatewayReadback, delay = sleep, monotonic = () => performance.now() } = {}) {
  const deadline = monotonic() + 60000;
  // At most 10 concurrent-pair attempts (5s each) and 9 pauses (1s each):
  // 59s worst-case scheduled work, plus an absolute 60s deadline guard.
  for (let attempt = 0; attempt < 10 && monotonic() < deadline; attempt++) {
    const timeoutMs = Math.max(1, Math.min(5000, Math.floor(deadline - monotonic()))), controller = new AbortController();
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(() => read({ timeoutMs, signal: controller.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('gateway_timeout')); }, timeoutMs); })]);
      if (monotonic() <= deadline && value.ready?.status === 'ok' && equal(value.version, expectedVersion)) return value;
    } catch { /* Read-only, bounded convergence; no rejected data retained. */ }
    finally { clearTimeout(timer); controller.abort(); }
    if (attempt < 9 && monotonic() < deadline) await delay(Math.min(1000, deadline - monotonic()));
  }
  require(false, 'promotion_gateway');
}
const envMap = entries => {
  require(Array.isArray(entries), 'promotion_env'); const result = {};
  for (const entry of entries) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/u.exec(entry);
    require(m && !Object.hasOwn(result, m[1]), 'promotion_env'); result[m[1]] = m[2];
  }
  return result;
};
export function validatePromotionReceipt(receipt, inputs, now) {
  require(receipt?.kind === 'sit-green-staging-106-106-rehearsal' && receipt.schemaVersion === 1 && receipt.status === 'passed'
    && receipt.runtimeCommit === inputs.binding.runtimeCommit && receipt.opsCommit === inputs.binding.opsCommit
    && receipt.targetSha256 === inputs.manifest.targetSha256 && receipt.configSha256 === inputs.manifest.configSha256
    && receipt.physicalSchemaSha256 === inputs.manifest.physicalSchemaSha256
    && receipt.materialBindingSha256 === objectDigest({ materials: inputs.config.materials, envFile: inputs.config.envFile })
    && ['backupSha256', 'preflightSha256', 'auxiliarySha256'].every(k => hash(receipt[k]))
    && ['namespaceReadabilityVerified', 'fixtureCleanupVerified', 'cleanupVerified', 'servicesRemainSealed'].every(k => receipt[k] === true)
    && receipt.canonicalPromotionImplemented === false && receipt.publicReleaseComplete === false && receipt.providerTraffic === false
    && equal(receipt.source, inputs.target.database), 'promotion_receipt');
  require(equal(receipt.probes, { mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' }), 'promotion_probes');
  const created = Date.parse(receipt.createdAt);
  require(Number.isFinite(created) && created <= now && now - created <= 3600000, 'promotion_freshness');
  assertSuccessorStartup(receipt.source, receipt.started);
}

// Narrow canonical profile. Unsupported source features fail before any create;
// mounts/groups/environment are never guessed or silently dropped.
export function canonicalSuccessorSpec(source, image, inputs) {
  const h = source.HostConfig, internal = inputs.target.networks.find(n => n.internal);
  require(h?.RestartPolicy?.Name === 'no' && !h.Privileged && !h.AutoRemove
    && Object.keys(h.PortBindings ?? {}).length === 0
    && ['CapAdd', 'Devices', 'VolumesFrom', 'DeviceRequests'].every(k => !(h[k]?.length))
    && (!h.PidMode || h.PidMode === 'private'), 'promotion_source_profile');
  const oldEnv = envMap(source.Config.Env), env = { ...oldEnv }, immutable = ['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME'];
  const imageEnv = envMap(image.Config.Env);
  for (const key of immutable) { require(typeof imageEnv[key] === 'string', 'promotion_image_identity'); env[key] = imageEnv[key]; }
  for (const [k, v] of Object.entries(requiredEnvironment)) require(env[k] === v, 'promotion_provider_modes');
  // Preserve the accepted Firebase-capable pilot profile. Local health/version
  // reads are not proof that a running provider-capable application cannot egress.
  require(['MAIL_TRANSPORT', 'PUSH_TRANSPORT', 'IDENTITY_VERIFICATION_TRANSPORT', 'PAYMENT_TRANSPORT']
    .every(k => env[k] === 'memory'), 'promotion_provider_modes');
  const groups = strictSupplementalGroups(h.GroupAdd ?? []), mounts = canonicalMounts(source.Mounts).map(m => {
    require(['bind', 'volume'].includes(m.Type) && !/[\r\n,]/u.test(m.Source + m.Destination)
      && (m.Type === 'bind' ? m.RW === false : m.Name === inputs.target.uploads.name && m.RW === true), 'promotion_mount');
    return { type: m.Type, source: m.Type === 'bind' ? m.Source : undefined, name: m.Type === 'volume' ? m.Name : undefined,
      destination: m.Destination, readOnly: !m.RW };
  });
  const overrides = Object.fromEntries(Object.entries(env).filter(([k]) => !immutable.includes(k)));
  const spec = { image: image.Id, imageId: image.Id, user: image.Config.User, env,
    entrypoint: image.Config.Entrypoint ?? [], cmd: image.Config.Cmd ?? [], networkId: internal.id,
    networks: { [internal.name]: internal.id }, mounts, groups, ports: {},
    labels: { ...Object.fromEntries(Object.entries(image.Config.Labels ?? {}).filter(([k]) => k.startsWith('org.opencontainers.image.'))),
      ...Object.fromEntries(Object.entries(source.Config.Labels ?? {}).filter(([k]) => !k.startsWith('org.opencontainers.image.'))),
      'com.shareittoo.green.106_106.promotion': inputs.config.runId } };
  const args = ['create', '--name', temporaryPromotionName(inputs), '--network', internal.id, '--restart', 'no',
    ...(h.ReadonlyRootfs ? ['--read-only'] : []),
    ...groups.flatMap(g => ['--group-add', g]), ...Object.keys(overrides).sort().flatMap(k => ['--env', k]),
    ...Object.entries(spec.labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
    ...mounts.flatMap(m => ['--mount', `type=${m.type},src=${m.source ?? m.name},dst=${m.destination}${m.readOnly ? ',readonly' : ''}`]), image.Id];
  return { spec, args, env: overrides };
}

export async function runSuccessorPromotion(inputs, options = {}, dependencies = {}) {
  // There is no implicit mutating entrypoint and no CLI wiring in this module.
  if (options.execute !== true) return { status: 'read_only_promotion_plan', mutationPerformed: false, ownerSmokePassed: false };
  const now = dependencies.now ?? Date.now, command = dependencies.command ?? rehearsalCommand;
  require(hash(options.rehearsalSha256) && options.confirmation === `promote:${inputs.binding.runtimeCommit}:${inputs.binding.opsCommit}:${options.rehearsalSha256}`, 'promotion_confirmation');
  const directory = privateDirectory(options.evidenceDirectory), base = inputs.config.runId;
  const names = ['promotion-lock', 'canonical-started', 'promotion', 'promotion-failure'].map(s => `${base}.${s}.json`);
  assertArtifactFamily(directory, names);
  const receiptHandle = openArtifact(path.join(directory.directory, `${base}.rehearsal.json`));
  let backup, held, lock, locked = false, candidateId = null, spec, stage = 'preflight', boundary = false, error, isolated = false, result;
  const one = async (kind, id) => dockerObject(await command({ phase: 'promotion_inspect', args: kind === 'container' ? ['inspect', id] : [kind, 'inspect', id] }));
  const source = inputs.target.containers[0], db = inputs.binding.scope.database;
  const temporaryName = temporaryPromotionName(inputs); let candidateName = temporaryName, renameReconciled = false;
  let originalRecord;
  const inventory = async () => {
    const actual = String(await command({ phase: 'promotion_inventory', args: ['ps', '-aq', '--no-trunc', '--filter', 'label=com.shareittoo.sit.green=true'] })).trim().split(/\s+/u).filter(Boolean).sort();
    const expected = [...inputs.target.containers.map(c => c.id), ...(hash(candidateId) ? [candidateId] : [])].sort();
    require(actual.every(hash) && equal(actual, expected), 'promotion_green_inventory');
  };
  const sql = async query => String(await command({ phase: 'promotion_sql', args: ['exec', '-i', db.id, 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', inputs.binding.scope.databaseUser, '-d', inputs.binding.scope.databaseName], input: query })).trim();
  const snapshot = async () => decodeSnapshot(await sql(snapshotSql));
  const auxiliary = async () => { const rows = (await sql(auxiliarySql)).split('\n').map(JSON.parse); require(rows.length === 2, 'promotion_auxiliary'); return objectDigest(rows); };
  const sourceCas = async () => {
    const r = await one('container', source.id);
    require(r.Id === source.id && r.Name === `/${inputs.config.sealedSourceName}` && r.Image === source.imageId
      && r.State?.Running === false && r.State.Paused === false && containerFingerprint(r) === source.configSha256, 'promotion_source_cas'); return r;
  };
  const membership = async running => {
    for (const n of inputs.target.networks) {
      const record = await one('network', n.id), expected = n.members.filter(m => m.id !== source.id);
      if (running && spec.networks[n.name]) expected.push({ id: candidateId, name: candidateName });
      require(record.Id === n.id && record.Name === n.name && record.Internal === n.internal
        && equal(networkMembers(record.Containers), expected.sort((a, b) => a.id.localeCompare(b.id))), 'promotion_network_cas');
    }
  };
  const candidate = async () => {
    require(hash(candidateId), 'promotion_candidate_id'); const r = await one('container', candidateId);
    require(r.Id === candidateId && r.Name === `/${candidateName}` && r.Config.Labels['com.shareittoo.green.106_106.promotion'] === base, 'promotion_candidate_identity');
    assertContainerSpec(r, spec);
    require(equal(r.Config.Labels, spec.labels), 'promotion_candidate_labels');
    for (const endpoint of Object.values(r.NetworkSettings.Networks)) {
      const aliases = [...(endpoint.Aliases ?? []), ...(endpoint.DNSNames ?? [])];
      require(aliases.every(name => [temporaryName, candidateId, candidateId.slice(0, 12), ...(candidateName === source.name ? [source.name] : [])].includes(name)), 'promotion_dns_alias');
    }
    require(objectDigest(canonicalMounts(r.Mounts)) === inputs.target.mountsSha256, 'promotion_complete_mounts');
    for (const [key, value] of Object.entries(originalRecord.HostConfig)) if (!['NetworkMode', 'Binds', 'Mounts'].includes(key)) {
      require(equal(r.HostConfig[key], value), 'promotion_host_preservation');
    }
    for (const [key, value] of Object.entries(originalRecord.Config)) if (!['Env', 'Labels', 'Image', 'Hostname'].includes(key)) {
      require(equal(r.Config[key], value), 'promotion_config_preservation');
    }
    return r;
  };
  try {
    const verified = verifyArtifact(receiptHandle, { expectedDigest: options.rehearsalSha256 });
    let receipt; try { receipt = JSON.parse(verified.bytes); } finally { verified.bytes.fill(0); }
    validatePromotionReceipt(receipt, inputs, now());
    const sealedInputs = { ...inputs, config: { ...inputs.config, sourceState: 'sealed' }, manifest: { ...inputs.manifest } };
    sealedInputs.manifest.configSha256 = objectDigest(sealedInputs.config);
    await executionPreflight(sealedInputs, { ...dependencies, command, now });
    const original = await sourceCas(), image = await one('image', inputs.binding.candidateImageId); originalRecord = original;
    const built = canonicalSuccessorSpec(original, image, inputs); spec = built.spec;
    const databaseCas = async () => {
      const record = await one('container', db.id), expected = inputs.target.containers[1];
      require(record.Id === db.id && record.Image === db.imageId && record.Name === `/${db.name}` && record.State?.Running === true
        && containerFingerprint(record) === expected.configSha256, 'promotion_database_identity');
      const url = new URL(spec.env.DATABASE_URL), internal = inputs.target.networks.find(n => n.internal);
      const endpoint = record.NetworkSettings?.Networks?.[internal.name];
      require(['postgres:', 'postgresql:'].includes(url.protocol) && endpoint?.NetworkID === internal.id
        && url.pathname === `/${inputs.binding.scope.databaseName}` && decodeURIComponent(url.username) === inputs.binding.scope.databaseUser
        && (!url.port || url.port === '5432') && [record.Name.slice(1), endpoint.IPAddress, ...(endpoint.Aliases ?? [])].includes(url.hostname), 'promotion_database_route');
      for (const witness of inputs.target.containers.slice(2)) {
        const w = await one('container', witness.id);
        require(w.Id === witness.id && w.Name === `/${witness.name}` && w.Image === witness.imageId && w.State?.Running === false
          && containerFingerprint(w) === witness.configSha256, 'promotion_witness');
      }
    };
    held = (dependencies.materials ?? bindExecutionMaterials)(inputs.config, original, image);
    require(held.sha256 === receipt.materialBindingSha256, 'promotion_materials');
    backup = openArtifact(path.join(directory.directory, `${base}.pgdump`));
    const bound = verifyArtifact(backup, { expectedDigest: receipt.backupSha256 });
    try { require(bound.bytes.subarray(0, 5).toString() === 'PGDMP', 'promotion_backup'); } finally { bound.bytes.fill(0); }
    const baseline = async () => {
      await sourceCas(); await databaseCas(); held.recheck(); await membership(false); await inventory();
      require(await sql(writersSql) === '0' && equal(await snapshot(), receipt.source)
        && await auxiliary() === receipt.auxiliarySha256 && await sql(physicalSchemaSql) === receipt.physicalSchemaSha256
        && await sql(constraintsSql) === '0', 'promotion_baseline');
    };
    await baseline();
    const lookup = async (name = temporaryName) => String(await command({ phase: 'promotion_lookup', args: ['ps', '--all', '--no-trunc', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'] })).trim();
    require(await lookup() === '' && await lookup(source.name) === '', 'promotion_collision');
    lock = exclusiveArtifact(directory, names[0]); locked = true;
    fs.writeFileSync(lock.fd, `${JSON.stringify({ kind: 'sit-green-staging-106-106-promotion-lock', schemaVersion: 1,
      opsCommit: inputs.binding.opsCommit, runtimeCommit: inputs.binding.runtimeCommit, rehearsalSha256: options.rehearsalSha256 })}\n`);
    fs.fsyncSync(lock.fd); verifyArtifact(lock).bytes.fill(0);
    stage = 'create';
    // Mutation response loss is a failure, not an instruction to repeat create.
    try { candidateId = String(await command({ phase: 'promotion_create', args: built.args, env: built.env })).trim(); }
    catch (e) { candidateId = await lookup(); throw e; }
    require(await lookup() === candidateId && (await candidate()).State.Running === false, 'promotion_created');
    await baseline();
    // Both networks are attached under the noncanonical name. Neither name nor
    // endpoint aliases may resolve as the router's canonical upstream yet.
    stage = 'attach';
    const provider = inputs.target.networks.find(n => !n.internal);
    spec.networks[provider.name] = provider.id;
    await command({ phase: 'promotion_attach', args: ['network', 'connect', provider.id, candidateId] });
    await candidate(); await membership(false); require(await lookup(source.name) === '', 'promotion_collision');
    stage = 'start';
    await command({ phase: 'promotion_start', args: ['start', candidateId] });
    require((await candidate()).State.Running === true, 'promotion_started'); await membership(true);
    stage = 'readiness'; let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt++) {
      try {
        const value = JSON.parse(String(await command({ phase: 'promotion_readiness', args: ['exec', candidateId, 'node', '--input-type=module', '-e', readinessScript] })));
        ready = value.live?.status === 'ok' && value.ready?.status === 'ok' && equal(value.version, buildReleaseMetadata(spec.env));
      } catch { /* Bounded read-only polling only. */ }
      if (!ready && attempt < 29) await (dependencies.delay ?? (ms => new Promise(r => setTimeout(r, ms))))(1000);
    }
    require(ready, 'promotion_readiness');
    const after = await snapshot(); assertSuccessorStartup(receipt.source, after);
    require(await auxiliary() === receipt.auxiliarySha256 && await sql(physicalSchemaSql) === receipt.physicalSchemaSha256
      && await sql(constraintsSql) === '0', 'promotion_schema');
    await sourceCas(); held.recheck(); await candidate(); await membership(true);
    await candidate(); await membership(true); await sourceCas(); await databaseCas(); held.recheck();
    const finalReadback = JSON.parse(String(await command({ phase: 'promotion_readiness', args: ['exec', candidateId, 'node', '--input-type=module', '-e', readinessScript] })));
    require(finalReadback.live?.status === 'ok' && finalReadback.ready?.status === 'ok'
      && equal(finalReadback.version, buildReleaseMetadata(spec.env)), 'promotion_pre_boundary_readiness');
    require(equal(await snapshot(), after) && await auxiliary() === receipt.auxiliarySha256
      && await sql(physicalSchemaSql) === receipt.physicalSchemaSha256 && await sql(constraintsSql) === '0', 'promotion_pre_boundary_database');
    require(await lookup(source.name) === '' && await lookup() === candidateId, 'promotion_pre_boundary_name'); await inventory();
    // MFA/identity were accepted in the exact isolated rehearsal receipt; no
    // synthetic account writes are performed on the canonical database.
    stage = 'rename';
    writeArtifact(directory, names[1], { kind: 'sit-green-staging-106-106-canonical-boundary', schemaVersion: 2,
      sourceId: source.id, candidateId, temporaryName, canonicalName: source.name, boundary: 'captured_id_rename',
      rehearsalSha256: options.rehearsalSha256, oldImageRestartForbidden: true, automaticRestoreForbidden: true });
    boundary = true;
    try { await command({ phase: 'promotion_rename', args: ['rename', candidateId, source.name] }); }
    catch { renameReconciled = true; /* Do not replay rename; exact readback decides. */ }
    candidateName = source.name;
    let renameVerified = false;
    for (let attempt = 0; attempt < 30 && !renameVerified; attempt++) {
      try {
        await candidate(); require(await lookup(source.name) === candidateId && await lookup() === '', 'promotion_rename_readback');
        await membership(true); renameVerified = true;
      } catch { /* Reconcile only by bounded reads; never replay rename. */ }
      if (!renameVerified && attempt < 29) await (dependencies.delay ?? (ms => new Promise(r => setTimeout(r, ms))))(1000);
    }
    require(renameVerified, 'promotion_rename_readback');
    stage = 'gateway';
    const gateway = await convergePromotionGateway(buildReleaseMetadata(spec.env), {
      read: dependencies.publicReadback ?? promotionGatewayReadback, delay: dependencies.delay,
      monotonic: dependencies.monotonic });
    await candidate(); await membership(true); await inventory(); await sourceCas(); await databaseCas(); held.recheck();
    require(equal(await snapshot(), after) && await auxiliary() === receipt.auxiliarySha256
      && await sql(physicalSchemaSql) === receipt.physicalSchemaSha256 && await sql(constraintsSql) === '0', 'promotion_post_boundary_database');
    result = { status: 'promoted_owner_smoke_pending', schemaVersion: 1, kind: 'sit-green-staging-106-106-promotion',
      candidateId, sourceId: source.id, runtimeCommit: inputs.binding.runtimeCommit, opsCommit: inputs.binding.opsCommit,
      rehearsalSha256: options.rehearsalSha256, backupSha256: receipt.backupSha256,
      ownerSmokePassed: false, publicReleaseComplete: false, oldImageRestarted: false, lockRetained: true,
      intentionalProviderCalls: 0, gatewayVerified: true, gatewayVersionSha256: objectDigest(gateway.version),
      gatewayReadbackSha256: objectDigest(gateway), visibilityBoundary: 'captured_id_rename', renameReconciled };
    verifyArtifact(backup, { expectedDigest: receipt.backupSha256 }).bytes.fill(0);
    verifyArtifact(receiptHandle, { expectedDigest: options.rehearsalSha256 }).bytes.fill(0);
    closeArtifact(backup); closeArtifact(receiptHandle); closeArtifact(lock); held.close(); held = null;
    writeArtifact(directory, names[2], result);
  } catch (failure) { error = failure; }
  finally {
    if (error && candidateId) try {
      // A lost attachment reply permits only subsets of the approved networks.
      const r = await one('container', candidateId), actual = r.NetworkSettings?.Networks ?? {};
      require([`/${temporaryName}`, `/${source.name}`].includes(r.Name), 'promotion_recovery_name'); candidateName = r.Name.slice(1);
      require(Object.entries(actual).every(([name, n]) => inputs.target.networks.some(t => t.name === name && t.id === n.NetworkID)), 'promotion_recovery_network');
      spec.networks = Object.fromEntries(Object.entries(actual).map(([name, n]) => [name, n.NetworkID]));
      const checked = await candidate();
      if (checked.State.Running) try { await command({ phase: 'promotion_isolate', args: ['stop', candidateId] }); } catch { /* Exact-ID readback decides isolation. */ }
      require((await candidate()).State.Running === false, 'promotion_isolation'); await membership(false); isolated = true;
    } catch { isolated = false; }
    for (const h of [backup, receiptHandle, lock]) if (h) try { closeArtifact(h); } catch (failure) { error ??= failure; }
    if (held) try { held.close(); } catch (failure) { error ??= failure; }
  }
  if (error) {
    const failure = { status: locked ? 'forward_recovery_required' : 'preflight_rejected', stage,
      candidateId: hash(candidateId) ? candidateId : null, sourceId: source.id, canonicalStarted: boundary,
      successorIsolationVerified: isolated, oldImageRestarted: false, automaticRestoreAttempted: false,
      lockRetained: locked, publicReleaseComplete: false };
    if (locked) writeArtifact(directory, names[3], failure);
    return failure;
  }
  return result;
}
