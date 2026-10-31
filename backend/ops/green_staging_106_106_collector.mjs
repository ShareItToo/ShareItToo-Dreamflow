import { execFileSync } from 'node:child_process';
import { digest, equal, networkMembers, objectDigest } from './green_staging_98_106_contract.mjs';
import { assertEnvironment, canonicalMounts, containerFingerprint } from './green_staging_98_106_promotion.mjs';
import { validateSuccessorImage, validateSuccessorPublication } from './green_staging_106_106_contract.mjs';
import { requireBinding, validateSuccessorSource } from './green_staging_106_106_binding.mjs';
import { decodeSnapshot, snapshotSql } from './green_staging_106_106_database.mjs';

const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const name = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(value);
const image = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const inventoryArgs = ['ps', '-aq', '--no-trunc', '--filter', 'label=com.shareittoo.sit.green=true'];
export function assertCollectorRead(entry) {
  const a = entry?.args;
  const inspect = Array.isArray(a) && ((a.length === 2 && a[0] === 'inspect' && id(a[1]))
    || (a.length === 3 && a[1] === 'inspect' && ((a[0] === 'network' && id(a[2]))
      || (a[0] === 'image' && image(a[2])) || (a[0] === 'volume' && name(a[2])))));
  const sql = Array.isArray(a) && a.length === 13 && a[0] === 'exec' && a[1] === '-i' && id(a[2])
    && equal(a.slice(3, 8), ['psql', '-X', '-q', '-At', '-v']) && a[8] === 'ON_ERROR_STOP=1'
    && a[9] === '-U' && /^[a-z][a-z0-9_]+$/u.test(a[10]) && a[11] === '-d'
    && /^[a-z][a-z0-9_]+$/u.test(a[12]) && entry.input === snapshotSql;
  requireBinding((inspect || equal(a, inventoryArgs) || sql) && (sql || entry.input === undefined), 'collector_read_only');
}
export function collectorRead(entry) {
  assertCollectorRead(entry);
  return execFileSync('docker', entry.args, { input: entry.input, encoding: 'utf8', timeout: 60000,
    maxBuffer: 16 * 1024 * 1024, stdio: [entry.input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
}
function validateScope(scope) {
  requireBinding(scope && equal(Object.keys(scope).sort(), ['api', 'database', 'databaseName', 'databaseUser', 'networks', 'uploads', 'witnesses']), 'scope');
  requireBinding(Array.isArray(scope.witnesses), 'scope_inventory');
  for (const c of [scope.api, scope.database, ...scope.witnesses ?? []]) {
    requireBinding(c && equal(Object.keys(c).sort(), ['id', 'imageDigest', 'imageId', 'name', ...(c === scope.api ? ['runtimeCommit'] : [])].sort())
      && id(c.id) && name(c.name) && image(c.imageId) && image(c.imageDigest), 'scope_container');
  }
  requireBinding(typeof scope.api.runtimeCommit === 'string' && /^[a-f0-9]{40}$/u.test(scope.api.runtimeCommit)
    && new Set([scope.api.id, scope.database.id, ...scope.witnesses.map(w => w.id)]).size === scope.witnesses.length + 2
    && new Set([scope.api.name, scope.database.name, ...scope.witnesses.map(w => w.name)]).size === scope.witnesses.length + 2,
  'scope_inventory');
  requireBinding(Array.isArray(scope.networks) && scope.networks.length === 2
    && scope.networks.every(n => n && equal(Object.keys(n).sort(), ['id', 'internal', 'name'])
      && id(n.id) && name(n.name) && typeof n.internal === 'boolean')
    && new Set(scope.networks.map(n => n.id)).size === 2 && new Set(scope.networks.map(n => n.name)).size === 2
    && scope.networks.filter(n => n.internal).length === 1 && name(scope.uploads)
    && ['databaseName', 'databaseUser'].every(k => typeof scope[k] === 'string' && /^[a-z][a-z0-9_]+$/u.test(scope[k])), 'scope_networks');
}

// No writes, pulls, starts, stops, creates, HTTP or provider calls exist here.
// The returned sanitized target still needs an independent byte/content binding.
export async function collectSuccessor({ binding, publicationBytes, mode = 'plan' },
  { command = collectorRead, sourceOptions, now = () => new Date().toISOString() } = {}) {
  requireBinding(['plan', 'collect'].includes(mode), 'mode');
  validateSuccessorSource(binding, sourceOptions);
  validateScope(binding.scope);
  const publication = validateSuccessorPublication(publicationBytes, binding);
  requireBinding(image(binding.candidateImageId), 'candidate_id');
  if (mode === 'plan') return { kind: 'sit-green-staging-106-106', status: 'read_only_plan', mutationAdapterImplemented: false };
  const read = async entry => { assertCollectorRead(entry); return command(entry); };
  const inspect = async (kind, identity) => {
    const rows = JSON.parse(await read({ args: kind === 'container' ? ['inspect', identity] : [kind, 'inspect', identity] }));
    requireBinding(Array.isArray(rows) && rows.length === 1, 'inspect'); return rows[0];
  };
  const inventory = async () => {
    const ids = String(await read({ args: inventoryArgs })).trim().split(/\s+/u).filter(Boolean).sort();
    const expected = [binding.scope.api.id, binding.scope.database.id, ...binding.scope.witnesses.map(w => w.id)].sort();
    requireBinding(ids.every(id) && equal(ids, expected), 'witness_inventory');
  };
  await inventory();
  const candidate = await inspect('image', binding.candidateImageId);
  requireBinding(candidate.Id === binding.candidateImageId, 'candidate_id');
  const candidateIdentity = validateSuccessorImage(candidate, publication);
  const containers = [];
  for (const expected of [binding.scope.api, binding.scope.database, ...binding.scope.witnesses]) {
    const running = expected.id === binding.scope.api.id || expected.id === binding.scope.database.id;
    const record = await inspect('container', expected.id);
    requireBinding(record.Id === expected.id && record.Name === `/${expected.name}` && record.Image === expected.imageId
      && record.State?.Running === running && record.State.Paused === false
      && record.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', 'container_identity');
    const observedImage = await inspect('image', record.Image);
    requireBinding(observedImage.Id === record.Image && observedImage.RepoDigests?.some(d => d.endsWith(`@${expected.imageDigest}`)), 'container_image');
    if (expected.id === binding.scope.api.id) requireBinding(observedImage.Config?.Labels?.['org.opencontainers.image.revision'] === expected.runtimeCommit, 'source_revision');
    containers.push({ expected, record, fingerprint: containerFingerprint(record) });
  }
  const api = containers[0].record;
  const allowed = api.Config.Env?.find(e => e.startsWith('SIT_STAGING_ALLOWED_USER_IDS='))?.slice('SIT_STAGING_ALLOWED_USER_IDS='.length);
  requireBinding(typeof allowed === 'string', 'environment');
  assertEnvironment(api.Config.Env, { allowedUsersSha256: digest(allowed) });
  const networks = [];
  for (const expected of binding.scope.networks) {
    const record = await inspect('network', expected.id);
    const members = networkMembers(record.Containers);
    requireBinding(record.Id === expected.id && record.Name === expected.name && record.Internal === expected.internal
      && members.some(m => m.id === binding.scope.api.id && m.name === binding.scope.api.name)
      && (!expected.internal || members.some(m => m.id === binding.scope.database.id && m.name === binding.scope.database.name)), 'network');
    networks.push({ ...expected, members });
  }
  requireBinding(equal(Object.keys(api.NetworkSettings.Networks).sort(), networks.map(n => n.name).sort())
    && networks.every(n => api.NetworkSettings.Networks[n.name].NetworkID === n.id), 'api_networks');
  const uploads = await inspect('volume', binding.scope.uploads);
  requireBinding(uploads.Name === binding.scope.uploads
    && canonicalMounts(api.Mounts).some(m => m.Type === 'volume' && m.Name === uploads.Name), 'uploads');
  const database = decodeSnapshot(await read({ args: ['exec', '-i', binding.scope.database.id,
    'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', binding.scope.databaseUser, '-d', binding.scope.databaseName], input: snapshotSql }));
  for (const c of containers) {
    const record = await inspect('container', c.expected.id);
    requireBinding(record.Id === c.record.Id && record.Name === c.record.Name && record.Image === c.record.Image
      && equal(record.State?.Running, c.record.State.Running) && record.State?.Paused === false
      && containerFingerprint(record) === c.fingerprint, 'container_drift');
  }
  for (const n of networks) {
    const record = await inspect('network', n.id);
    requireBinding(record.Id === n.id && record.Name === n.name && record.Internal === n.internal
      && equal(networkMembers(record.Containers), n.members), 'network_drift');
  }
  requireBinding(objectDigest(await inspect('volume', binding.scope.uploads)) === objectDigest(uploads), 'volume_drift');
  await inventory();
  const target = { kind: 'sit-green-staging-106-106-target', schemaVersion: 1, collectedAt: now(),
    opsCommit: binding.opsCommit, sourceInventorySha256: objectDigest(binding.sourceInventory),
    publicationSha256: binding.publicationSha256, candidate: candidateIdentity,
    containers: containers.map(c => ({ ...c.expected, configSha256: c.fingerprint })), networks,
    uploads: { name: uploads.Name, configSha256: objectDigest(uploads) },
    environmentSha256: objectDigest(api.Config.Env), mountsSha256: objectDigest(canonicalMounts(api.Mounts)),
    database, mutationAdapterImplemented: false, promotionAuthorized: false };
  return { status: 'collected_not_authorized', target, targetSha256: objectDigest(target) };
}

export function verifyCollectedTarget(target, expectedSha256) {
  requireBinding(target?.kind === 'sit-green-staging-106-106-target' && target.schemaVersion === 1
    && id(expectedSha256) && objectDigest(target) === expectedSha256
    && target.mutationAdapterImplemented === false && target.promotionAuthorized === false, 'target_binding');
  return true;
}
