import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest, equal, networkMembers, objectDigest, repositoryRoot } from './green_staging_98_106_contract.mjs';
import { canonicalMounts, containerFingerprint } from './green_staging_98_106_promotion.mjs';
import { assertCollectorRead, collectorRead, verifyCollectedTarget } from './green_staging_106_106_collector.mjs';
import { requireBinding as require, validateSuccessorSource } from './green_staging_106_106_binding.mjs';
import { validateSuccessorImage, validateSuccessorPublication } from './green_staging_106_106_contract.mjs';
import { readCandidateArchive } from './green_staging_106_106_image.mjs';
import { decodeSnapshot, snapshotSql } from './green_staging_106_106_database.mjs';

const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const exact = (v, keys, code) => require(v && Object.getPrototypeOf(v) === Object.prototype && equal(Object.keys(v).sort(), [...keys].sort()), code);
export const physicalSchemaSql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT encode(digest(jsonb_build_object(
 'columns',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY table_name,ordinal_position),'[]') FROM (SELECT table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_schema,udt_name,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,collation_name,is_identity,identity_generation,is_generated,generation_expression FROM information_schema.columns WHERE table_schema='public') x),
 'relations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY relname),'[]') FROM (SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.relpersistence,c.reloptions,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY relation,name),'[]') FROM (SELECT c.conrelid::regclass::text AS relation,c.conname AS name,c.contype,c.convalidated,pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public') x),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tablename,indexname),'[]') FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') x),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY relation,name),'[]') FROM (SELECT t.tgrelid::regclass::text AS relation,t.tgname AS name,t.tgenabled,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) x),
 'functions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name,args),'[]') FROM (SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')) x),
 'schema',(SELECT jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text) FROM pg_namespace WHERE nspname='public'),
 'enums',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name,enumsortorder),'[]') FROM (SELECT t.typname AS name,e.enumsortorder,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') x),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tablename,policyname),'[]') FROM (SELECT * FROM pg_policies WHERE schemaname='public') x),
 'views',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY viewname),'[]') FROM (SELECT viewname,definition FROM pg_views WHERE schemaname='public') x),
 'matviews',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY matviewname),'[]') FROM (SELECT matviewname,definition FROM pg_matviews WHERE schemaname='public') x),
 'sequences',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sequencename),'[]') FROM (SELECT sequencename,data_type::text,start_value,min_value,max_value,increment_by,cycle,cache_size FROM pg_sequences WHERE schemaname='public') x)
)::text,'sha256'),'hex');
COMMIT;
`;
export const writersSql = "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()";
export const constraintsSql = "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated";
export function preflightRead(entry) {
  const a = entry?.args;
  if (Array.isArray(a) && a.length === 3 && a[0] === 'image' && a[1] === 'save' && /^sha256:[a-f0-9]{64}$/u.test(a[2]) && entry.input === undefined) {
    return execFileSync('docker', a, { timeout: 60000, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  if ([physicalSchemaSql, writersSql, constraintsSql].includes(entry.input)) {
    assertCollectorRead({ ...entry, input: snapshotSql });
    return execFileSync('docker', a, { input: entry.input, encoding: 'utf8', timeout: 60000,
      maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  return collectorRead(entry);
}
export function validateExecutionInputs(config, manifest, binding, target) {
  exact(config, ['kind', 'schemaVersion', 'sourceState', 'sealedSourceName', 'runId', 'uid', 'gid', 'materials', 'envFile'], 'execution_config');
  require(config.kind === 'sit-green-staging-106-106-execution-config' && config.schemaVersion === 1
    && ['running', 'sealed'].includes(config.sourceState) && /^[a-z0-9][a-z0-9-]{7,47}$/u.test(config.runId)
    && config.sealedSourceName === `sit-green-106-106-sealed-${config.runId}`
    && Number.isSafeInteger(config.uid) && config.uid > 0 && Number.isSafeInteger(config.gid) && config.gid > 0, 'execution_config');
  exact(manifest, ['kind', 'schemaVersion', 'opsCommit', 'runtimeCommit', 'bindingSha256', 'targetSha256', 'configSha256', 'physicalSchemaSha256'], 'runtime_manifest');
  require(manifest.kind === 'sit-green-staging-106-106-runtime' && manifest.schemaVersion === 1
    && manifest.opsCommit === binding.opsCommit && manifest.runtimeCommit === binding.runtimeCommit
    && manifest.bindingSha256 === objectDigest(binding) && manifest.configSha256 === objectDigest(config)
    && hash(manifest.physicalSchemaSha256), 'runtime_binding');
  verifyCollectedTarget(target, manifest.targetSha256);
  require(target.opsCommit === binding.opsCommit && target.sourceInventorySha256 === objectDigest(binding.sourceInventory)
    && target.publicationSha256 === binding.publicationSha256 && target.candidate.imageId === binding.candidateImageId
    && target.candidate.runtimeCommit === binding.runtimeCommit
    && equal(target.containers.map(({ configSha256, ...c }) => c), [binding.scope.api, binding.scope.database, ...binding.scope.witnesses]), 'target_scope');
  require(Array.isArray(config.materials) && config.materials.length > 0, 'material_inventory');
  for (const m of [...config.materials, config.envFile]) {
    exact(m, ['source', 'destination', 'sha256', 'uid', 'gid', 'mode'], 'material_shape');
    require(typeof m.source === 'string' && path.isAbsolute(m.source) && path.normalize(m.source) === m.source
      && !m.source.startsWith(`${repositoryRoot}/`) && hash(m.sha256)
      && Number.isSafeInteger(m.uid) && m.uid === 0 && Number.isSafeInteger(m.gid) && m.gid >= 0
      && m.mode === (m === config.envFile ? 0o600 : 0o640), 'material_metadata');
    require(m === config.envFile ? m.destination === null : typeof m.destination === 'string'
      && m.destination.startsWith('/run/secrets/') && path.posix.normalize(m.destination) === m.destination, 'material_destination');
  }
  require(new Set(config.materials.map(m => m.destination)).size === config.materials.length
    && new Set([...config.materials, config.envFile].map(m => m.source)).size === config.materials.length + 1, 'material_duplicate');
  return true;
}
export function bindExecutionMaterials(config, api, candidate, io = fs) {
  const mounts = canonicalMounts(api.Mounts), binds = mounts.filter(m => m.Type === 'bind');
  require(binds.length === config.materials.length && binds.every(m => m.RW === false
    && config.materials.some(f => f.source === m.Source && f.destination === m.Destination)), 'material_mounts');
  const held = [];
  const stable = entry => {
    const now = io.fstatSync(entry.fd, { bigint: true }), link = io.lstatSync(entry.source, { bigint: true });
    const keys = entry.directory ? ['dev', 'ino', 'mode', 'uid', 'gid'] : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    require(keys.every(k => entry.stat[k] === now[k] && now[k] === link[k]), 'material_changed');
  };
  try {
    let envBytes;
    for (const material of [...config.materials, config.envFile]) {
      let current = '/';
      for (const part of path.dirname(material.source).split('/').filter(Boolean)) {
        current = path.join(current, part);
        const fd = io.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
        const stat = io.fstatSync(fd, { bigint: true }); held.push({ fd, source: current, stat, directory: true });
        require(stat.isDirectory(), 'material_parent');
      }
      const parent = held.at(-1).stat;
      require(parent.uid === 0n && (parent.mode & 0o7777n) === 0o700n, 'material_parent');
      const fd = io.openSync(material.source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const stat = io.fstatSync(fd, { bigint: true }); held.push({ fd, source: material.source, stat, directory: false });
      require(stat.isFile() && stat.nlink === 1n && stat.uid === BigInt(material.uid) && stat.gid === BigInt(material.gid)
        && (stat.mode & 0o7777n) === BigInt(material.mode) && stat.size > 0n && stat.size <= 1048576n, 'material_metadata');
      const bytes = io.readFileSync(fd);
      try {
        require(digest(bytes) === material.sha256, 'material_bytes');
        if (material === config.envFile) envBytes = bytes.toString('utf8');
      } finally { bytes.fill(0); }
      if (material !== config.envFile) require(material.gid === config.gid && (material.mode & 0o040) !== 0, 'material_uid_permission');
    }
    const parseEnv = entries => {
      require(Array.isArray(entries), 'material_environment'); const result = new Map();
      for (const entry of entries) {
        const match = typeof entry === 'string' && /^([A-Z_][A-Z0-9_]*)=(.*)$/u.exec(entry);
        require(match && !result.has(match[1]), 'material_environment'); result.set(match[1], match[2]);
      }
      return result;
    };
    const effective = parseEnv(api.Config.Env), merged = parseEnv(candidate.Config.Env);
    const seen = new Set();
    for (const line of envBytes.split(/\r?\n/u).filter(line => line && !line.startsWith('#'))) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/u.exec(line);
      require(match && !seen.has(match[1]) && !['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME'].includes(match[1])
        && effective.get(match[1]) === match[2], 'material_environment'); seen.add(match[1]); merged.set(match[1], match[2]);
    }
    require(seen.size > 0, 'material_environment');
    for (const key of ['APP_VERSION', 'APP_COMMIT', 'APP_BUILD_TIME']) { merged.delete(key); effective.delete(key); }
    require(equal([...merged].sort(), [...effective].sort()), 'material_environment_incomplete');
    held.forEach(stable);
    return { recheck: () => held.forEach(stable), close: () => held.splice(0).reverse().forEach(e => io.closeSync(e.fd)),
      sha256: objectDigest({ materials: config.materials, envFile: config.envFile }), namespaceReadabilityVerified: false };
  } catch (error) { held.reverse().forEach(e => io.closeSync(e.fd)); throw error; }
}

export function disposableResourcePlan(runId, candidateImageId, databaseImageId) {
  require(typeof runId === 'string' && /^[a-z0-9][a-z0-9-]{7,47}$/u.test(runId)
    && [candidateImageId, databaseImageId].every(v => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v)), 'resource_identity');
  const labels = { 'com.shareittoo.green.106_106.disposable': 'true', 'com.shareittoo.green.106_106.run_id': runId };
  return { schemaVersion: 1, runId, candidateImageId, labels, network: { name: `sit-106-106-${runId}`, internal: true },
    roles: ['database', 'materials', 'candidate'].map(role => ({ role, name: `sit-106-106-${runId}-${role}`,
      imageId: role === 'database' ? databaseImageId : candidateImageId })),
    storage: 'anonymous_attached_only', cleanup: 'captured_container_id_with_volumes', mutationAdapterImplemented: false };
}
export function assertOwnedResource(record, plan, role, capturedId) {
  const expected = plan.roles.find(r => r.role === role);
  require(expected && hash(capturedId) && record.Id === capturedId && record.Name === `/${expected.name}`
    && Object.entries(plan.labels).every(([k, v]) => record.Config?.Labels?.[k] === v)
    && record.Image === expected.imageId, 'resource_ownership');
  if (role === 'database') require(Array.isArray(record.Mounts) && record.Mounts.length === 1
    && record.Mounts[0].Type === 'volume' && record.Mounts[0].Destination === '/var/lib/postgresql/data'
    && record.Mounts[0].RW === true && hash(record.Mounts[0].Name)
    && !(record.HostConfig?.Binds?.length) && !(record.HostConfig?.Mounts?.length), 'resource_anonymous_volume');
  return capturedId;
}
export function assertOwnedNetwork(record, plan, capturedId) {
  require(hash(capturedId) && record.Id === capturedId && record.Name === plan.network.name && record.Internal === true
    && Object.entries(plan.labels).every(([k, v]) => record.Labels?.[k] === v), 'resource_network');
  return capturedId;
}

export async function executionPreflight({ binding, publicationBytes, target, config, manifest },
  { command = preflightRead, sourceOptions, materials = bindExecutionMaterials } = {}) {
  validateSuccessorSource(binding, sourceOptions); validateExecutionInputs(config, manifest, binding, target);
  const publication = validateSuccessorPublication(publicationBytes, binding);
  const one = async (kind, id) => {
    const rows = JSON.parse(await command({ args: kind === 'container' ? ['inspect', id] : [kind, 'inspect', id] }));
    require(Array.isArray(rows) && rows.length === 1, 'preflight_inspect'); return rows[0];
  };
  const image = await one('image', binding.candidateImageId); validateSuccessorImage(image, publication);
  require(Array.isArray(image.Config.Env) && image.Config.Env.every(e => typeof e === 'string' && /^[A-Z_][A-Z0-9_]*=/u.test(e)), 'image_environment');
  const imageEnv = Object.fromEntries(image.Config.Env.map(e => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
  require(Object.keys(imageEnv).length === image.Config.Env.length && imageEnv.APP_COMMIT === binding.runtimeCommit
    && typeof imageEnv.APP_VERSION === 'string' && imageEnv.APP_VERSION.length > 0
    && imageEnv.APP_VERSION === image.Config.Labels['org.opencontainers.image.version']
    && Number.isFinite(Date.parse(imageEnv.APP_BUILD_TIME))
    && imageEnv.APP_BUILD_TIME === image.Config.Labels['org.opencontainers.image.created'], 'image_environment');
  const archive = await command({ args: ['image', 'save', binding.candidateImageId] });
  const content = readCandidateArchive(archive, image);
  require(content.uid === config.uid && content.gid === config.gid, 'candidate_uid');
  const records = [];
  const inspectState = async () => {
    for (const [index, expected] of target.containers.entries()) {
      const record = await one('container', expected.id), sealed = index === 0 && config.sourceState === 'sealed';
      require(record.Id === expected.id && record.Name === `/${sealed ? config.sealedSourceName : expected.name}`
        && record.Image === expected.imageId && record.State?.Paused === false
        && record.State?.Running === (index === 1 || (index === 0 && !sealed))
        && containerFingerprint(record) === expected.configSha256, 'preflight_container');
      records[index] = record;
    }
    for (const expected of target.networks) {
      const n = await one('network', expected.id), members = config.sourceState === 'sealed'
        ? expected.members.filter(m => m.id !== target.containers[0].id) : expected.members;
      require(n.Id === expected.id && n.Name === expected.name && n.Internal === expected.internal
        && equal(networkMembers(n.Containers), members), 'preflight_network');
    }
    const inventory = String(await command({ args: ['ps', '-aq', '--no-trunc', '--filter', 'label=com.shareittoo.sit.green=true'] })).trim().split(/\s+/u).sort();
    require(equal(inventory, target.containers.map(c => c.id).sort()), 'preflight_inventory');
    require(objectDigest(await one('volume', target.uploads.name)) === target.uploads.configSha256, 'preflight_uploads');
  };
  await inspectState();
  require(objectDigest(records[0].Config.Env) === target.environmentSha256
    && objectDigest(canonicalMounts(records[0].Mounts)) === target.mountsSha256, 'preflight_environment');
  const held = materials(config, records[0], image);
  try {
    const args = ['exec', '-i', binding.scope.database.id, 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', binding.scope.databaseUser, '-d', binding.scope.databaseName];
    if (config.sourceState === 'sealed') require(String(await command({ args, input: writersSql })).trim() === '0', 'preflight_writer');
    const schema = String(await command({ args, input: physicalSchemaSql })).trim();
    require(hash(schema) && schema === manifest.physicalSchemaSha256, 'physical_schema');
    require(String(await command({ args, input: constraintsSql })).trim() === '0', 'physical_constraints');
    require(equal(decodeSnapshot(await command({ args, input: snapshotSql })), target.database), 'preflight_database');
    held.recheck(); await inspectState(); held.recheck();
    require(String(await command({ args, input: physicalSchemaSql })).trim() === schema, 'physical_schema');
    require(String(await command({ args, input: constraintsSql })).trim() === '0', 'physical_constraints');
    if (config.sourceState === 'sealed') require(String(await command({ args, input: writersSql })).trim() === '0', 'preflight_writer');
    return { kind: 'sit-green-staging-106-106-preflight', schemaVersion: 1, status: 'read_only_preflight_passed',
      targetSha256: manifest.targetSha256, configSha256: manifest.configSha256, physicalSchemaSha256: schema,
      materialBindingSha256: held.sha256, candidateContent: content,
      resources: disposableResourcePlan(config.runId, binding.candidateImageId, binding.scope.database.imageId),
      namespaceReadabilityVerified: false, rehearsalPassed: false, promotionAuthorized: false, mutationAdapterImplemented: false };
  } finally { held.close(); }
}
