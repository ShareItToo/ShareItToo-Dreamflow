import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A new contract. Neither legacy runner nor its historical evidence is redefined.
export const green98106 = Object.freeze({
  kind: 'sit-green-staging-98-106', schemaVersion: 1,
  runtimeCommit: '690f28ef0b314a39601bd94b27be9ad324870db9',
  predecessorCommit: '6c0ef70db2656df3e378add858d5f5157388127e',
  predecessorDigest: 'sha256:16a90e4fbc3710e37c9e319fe5db545d6da6348448848c94c6bfc661eac47357',
  sourceLedger: '796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196',
  targetLedger: 'eec24891ff91f95b34e924425895591f9b9d11302d713f1c9c5b947905538d13',
  postgresImage: 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777',
  sourceSchema: 98, targetSchema: 106,
  targetOrigin: 'https://staging.shareittoo.com',
});
export const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = /^[a-f0-9]{64}$/u;
const commit = /^[a-f0-9]{40}$/u;
const imageDigest = /^sha256:[a-f0-9]{64}$/u;
const id = /^[a-f0-9]{64}$/u;
const errors = new WeakSet();
export function deny(code) { const e = new Error(code); errors.add(e); throw e; }
export function assert(ok, code) { if (!ok) deny(code); }
export function safeError(error) { return errors.has(error) ? error.message : 'green_98_106_operation_failed'; }
export function exact(value, fields, code = 'green_98_106_shape') {
  assert(value !== null && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join('|') === [...fields].sort().join('|'), code);
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
export const objectDigest = (value) => digest(JSON.stringify(canonical(value)));
export const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export function readProtectedJson(file, expectedDigest, { root = repositoryRoot } = {}) {
  assert(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file
    && file !== root && !file.startsWith(`${root}/`) && hash.test(expectedDigest ?? ''), 'green_98_106_private_path');
  const descriptors = []; let bytes;
  try {
    let current = '/';
    for (const part of path.dirname(file).split('/').filter(Boolean)) {
      current = path.join(current, part);
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(fd, { bigint: true });
      assert(stat.isDirectory(), 'green_98_106_private_parent');
      descriptors.push({ fd, stat, file: current });
    }
    const parent = descriptors.at(-1)?.stat;
    assert(parent?.uid === BigInt(process.getuid()) && (parent.mode & 0o7777n) === 0o700n,
      'green_98_106_private_parent');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true }); descriptors.push({ fd, stat: before, file });
    assert(before.isFile() && before.nlink === 1n && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n && before.size > 1n && before.size <= 1048576n,
    'green_98_106_private_file');
    bytes = fs.readFileSync(fd);
    for (const entry of descriptors) {
      const after = fs.fstatSync(entry.fd, { bigint: true });
      const link = fs.lstatSync(entry.file, { bigint: true });
      const keys = entry === descriptors.at(-1)
        ? ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        : ['dev', 'ino', 'mode', 'uid', 'gid'];
      assert(keys.every((key) => entry.stat[key] === after[key] && after[key] === link[key]),
        'green_98_106_private_changed');
    }
    assert(digest(bytes) === expectedDigest, 'green_98_106_private_digest');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (e) { if (errors.has(e)) throw e; deny('green_98_106_private_unreadable'); }
  finally { bytes?.fill(0); for (const { fd } of descriptors.reverse()) fs.closeSync(fd); }
}

export function migrationInventory(root = repositoryRoot) {
  const directory = path.join(root, 'backend/sql/migrations');
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.up.sql')).sort();
  assert(names.length === 106 && names.every((name, index) => Number(name.slice(0, 3)) === index + 1),
    'green_98_106_migration_inventory');
  const rows = names.map((name) => ({ name, checksum: digest(fs.readFileSync(path.join(directory, name))) }));
  assertLedger(rows.slice(0, 98), 98); assertLedger(rows, 106);
  return rows;
}
export function assertLedger(rows, schema) {
  assert([98, 106].includes(schema) && Array.isArray(rows) && rows.length === schema, 'green_98_106_ledger');
  for (const [index, row] of rows.entries()) {
    exact(row, ['name', 'checksum'], 'green_98_106_ledger');
    assert(new RegExp(`^${String(index + 1).padStart(3, '0')}_[a-z0-9_]+\\.up\\.sql$`, 'u').test(row.name)
      && hash.test(row.checksum), 'green_98_106_ledger');
  }
  const observed = digest(rows.map((row) => `${row.name}|${row.checksum}\n`).join(''));
  assert(observed === (schema === 98 ? green98106.sourceLedger : green98106.targetLedger), 'green_98_106_ledger');
  return observed;
}

export function validatePublication(value) {
  exact(value, ['schemaVersion', 'commit', 'tag', 'digest', 'workflow', 'runId', 'runAttempt',
    'repository', 'eventName', 'observedTagDigest', 'observedOciRevision'], 'green_98_106_publication');
  assert(value.schemaVersion === 2 && value.commit === green98106.runtimeCommit
    && value.tag === `ghcr.io/shareittoo/shareittoo-api:${green98106.runtimeCommit}`
    && imageDigest.test(value.digest) && value.observedTagDigest === value.digest
    && value.observedOciRevision === value.commit && value.workflow === 'regression'
    && value.repository === 'ShareItToo/ShareItToo-Dreamflow' && value.eventName === 'workflow_dispatch'
    && /^[1-9][0-9]*$/u.test(value.runId) && /^[1-9][0-9]*$/u.test(value.runAttempt),
  'green_98_106_publication');
  return structuredClone(value);
}

export const requiredSourcePaths = Object.freeze([
  'backend/ops/green_staging_98_106_contract.mjs',
  'backend/ops/green_staging_98_106_promotion.mjs',
  'backend/ops/green_staging_98_106_collector.mjs',
  'backend/ops/green_staging_98_106_database.mjs',
  'backend/ops/green_staging_98_106_evidence.mjs',
  'backend/ops/green_staging_98_106_execution.mjs',
  'backend/ops/green_staging_98_106_resources.mjs',
  'backend/ops/green_staging_promotion.mjs',
  'backend/ops/green_auth_profile.mjs',
  'backend/ops/stable_private_file.mjs',
  'backend/ops/staging_forward_migration_rehearsal.mjs',
  'backend/ops/staging_controlled_acceptance.mjs',
  'backend/ops/check_foreign_key_integrity.sql',
  'backend/src/technical_sandbox_config.js',
  'tool/validate_green_staging_98_106_runtime.mjs',
]);
export const runtimeManifestPath = 'store/green-staging-98-106-runtime.json';
export function validateRuntimeManifest({ publication, publicationSha256, root = repositoryRoot } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, runtimeManifestPath), 'utf8'));
  exact(manifest, ['kind', 'schemaVersion', 'runtimeCommit', 'image', 'ociRevision', 'publication',
    'publicationSha256', 'sourceLedger', 'targetLedger', 'sourceInventory'], 'green_98_106_runtime_manifest');
  assert(manifest.kind === 'sit-green-staging-98-106-runtime' && manifest.schemaVersion === 1
    && manifest.runtimeCommit === green98106.runtimeCommit && manifest.ociRevision === green98106.runtimeCommit
    && manifest.sourceLedger === green98106.sourceLedger && manifest.targetLedger === green98106.targetLedger
    && manifest.publicationSha256 === publicationSha256 && equal(manifest.publication, publication)
    && manifest.image === `ghcr.io/shareittoo/shareittoo-api@${publication.digest}`, 'green_98_106_runtime_manifest_binding');
  validatePublication(publication);
  exact(manifest.sourceInventory, requiredSourcePaths, 'green_98_106_runtime_source_inventory');
  for (const relative of requiredSourcePaths) {
    assert(digest(fs.readFileSync(path.join(root, relative))) === manifest.sourceInventory[relative], 'green_98_106_runtime_source_drift');
  }
  return manifest;
}
export function validateBinding(binding, { publication, publicationSha256, root = repositoryRoot, actualOpsCommit } = {}) {
  exact(binding, ['kind', 'schemaVersion', 'runtimeCommit', 'publicationSha256',
    'reviewedImplementationCommit', 'opsCommit', 'sourceInventory', 'targetSha256', 'configSha256'],
  'green_98_106_binding');
  assert(binding.kind === green98106.kind && binding.schemaVersion === 1
    && binding.runtimeCommit === green98106.runtimeCommit
    && commit.test(binding.reviewedImplementationCommit ?? '') && commit.test(binding.opsCommit ?? '')
    && binding.opsCommit === actualOpsCommit && hash.test(binding.targetSha256 ?? '')
    && hash.test(binding.configSha256 ?? ''), 'green_98_106_binding');
  assert(hash.test(binding.publicationSha256 ?? '') && binding.publicationSha256 === publicationSha256,
    'green_98_106_publication_bytes');
  const accepted = validatePublication(publication);
  exact(binding.sourceInventory, requiredSourcePaths, 'green_98_106_source_inventory');
  for (const relative of requiredSourcePaths) {
    assert(hash.test(binding.sourceInventory[relative] ?? '')
      && digest(fs.readFileSync(path.join(root, relative))) === binding.sourceInventory[relative],
    'green_98_106_source_drift');
  }
  migrationInventory(root);
  return Object.freeze({ ...structuredClone(binding), publication: Object.freeze(accepted) });
}

function validateNetworkMembers(members) {
  assert(Array.isArray(members), 'green_98_106_network_members');
  for (const member of members) {
    exact(member, ['id', 'name'], 'green_98_106_network_members');
    assert(id.test(member.id) && typeof member.name === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(member.name), 'green_98_106_network_members');
  }
  assert(new Set(members.map(m => m.id)).size === members.length
    && new Set(members.map(m => m.name)).size === members.length
    && members.every((m, i) => i === 0 || members[i - 1].id < m.id), 'green_98_106_network_members');
  return members;
}
export function networkMembers(containers) {
  assert(containers !== null && typeof containers === 'object' && !Array.isArray(containers), 'green_98_106_network_members');
  return validateNetworkMembers(Object.entries(containers).map(([id, value]) => ({ id, name: value?.Name }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function validateTarget(target) {
  exact(target, ['kind', 'schemaVersion', 'api', 'database', 'networks', 'uploads', 'witnesses',
    'databaseUser', 'databaseName', 'sourceLedger', 'targetLedger'], 'green_98_106_target');
  assert(target.kind === 'sit-green-staging-98-106-target' && target.schemaVersion === 3
    && target.sourceLedger === green98106.sourceLedger && target.targetLedger === green98106.targetLedger
    && target.databaseUser === 'shareittoo_green' && target.databaseName === 'shareittoo_green',
  'green_98_106_target');
  for (const [entry, name] of [[target.api, 'shareittoo-staging-api'],
    [target.database, 'sit-green-postgres-20260918011528-wp254']]) {
    exact(entry, ['name', 'id', 'imageId', 'imageDigest', 'configSha256'], 'green_98_106_container');
    assert(entry.name === name && id.test(entry.id) && imageDigest.test(entry.imageId) && imageDigest.test(entry.imageDigest)
      && hash.test(entry.configSha256), 'green_98_106_container');
  }
  assert(target.api.imageDigest === green98106.predecessorDigest
    && target.api.id !== target.database.id, 'green_98_106_predecessor');
  assert(Array.isArray(target.networks) && target.networks.length === 2, 'green_98_106_networks');
  const names = ['sit-green-network-20260918011528-wp254', 'sit-staging-provider-egress'];
  for (const network of target.networks) {
    exact(network, ['name', 'id', 'internal', 'members'], 'green_98_106_networks');
    assert(typeof network.name === 'string' && names.includes(network.name) && id.test(network.id)
      && network.internal === (network.name === names[0]), 'green_98_106_networks');
    validateNetworkMembers(network.members);
    assert(network.members.some(m => m.id === target.api.id && m.name === target.api.name)
      && (network.internal
        ? network.members.some(m => m.id === target.database.id && m.name === target.database.name)
        : network.members.every(m => m.id !== target.database.id && m.name !== target.database.name)),
    'green_98_106_network_required_members');
  }
  assert(new Set(target.networks.map((n) => n.name)).size === 2
    && new Set(target.networks.map((n) => n.id)).size === 2, 'green_98_106_networks');
  exact(target.uploads, ['name', 'configSha256'], 'green_98_106_uploads');
  assert(target.uploads.name === 'sit-green-uploads-20260918011528-wp254'
    && hash.test(target.uploads.configSha256), 'green_98_106_uploads');
  assert(Array.isArray(target.witnesses) && target.witnesses.length === 21, 'green_98_106_witnesses');
  for (const entry of target.witnesses) {
    exact(entry, ['name', 'id', 'imageId', 'imageDigest', 'configSha256'], 'green_98_106_witnesses');
    assert(/^shareittoo-staging-api-[A-Za-z0-9-]+$/u.test(entry.name) && id.test(entry.id)
      && imageDigest.test(entry.imageId) && imageDigest.test(entry.imageDigest) && hash.test(entry.configSha256), 'green_98_106_witnesses');
  }
  assert(new Set(target.witnesses.map((w) => w.id)).size === 21
    && new Set(target.witnesses.map((w) => w.name)).size === 21
    && target.witnesses.every((w) => ![target.api.id, target.database.id].includes(w.id)), 'green_98_106_witnesses');
  return structuredClone(target);
}

export function validateConfiguration(config) {
  exact(config, ['kind', 'schemaVersion', 'environment', 'firebaseAuthEnabled', 'emulatorEnabled',
    'accessGateEnabled', 'allowedUsersSha256', 'googleRegistrationEnabled', 'appleRevocationEnabled',
    'appleAcquisitionEnabled', 'paymentTransport', 'stripeLivemode', 'mailTransport', 'pushTransport',
    'identityTransport', 'listingAiProvider', 'externalListingAiEnabled', 'technicalSandboxEnabled',
    'mountsSha256', 'runtimeEnvironmentSha256'], 'green_98_106_config');
  assert(config.kind === 'sit-green-staging-98-106-config' && config.schemaVersion === 2
    && config.environment === 'test' && config.firebaseAuthEnabled === true && config.emulatorEnabled === false
    && config.accessGateEnabled === true && hash.test(config.allowedUsersSha256)
    && config.googleRegistrationEnabled === false && config.appleRevocationEnabled === false
    && config.appleAcquisitionEnabled === false && config.paymentTransport === 'memory'
    && config.stripeLivemode === false && config.mailTransport === 'memory' && config.pushTransport === 'memory'
    && config.identityTransport === 'memory' && config.listingAiProvider === 'on_device'
    && config.externalListingAiEnabled === false && config.technicalSandboxEnabled === false
    && hash.test(config.mountsSha256) && hash.test(config.runtimeEnvironmentSha256), 'green_98_106_config');
  return structuredClone(config);
}

// A schema transition is allowed only for the ledger, never for old business rows.
export function newTableNames(root = repositoryRoot) {
  return migrationInventory(root).slice(98).flatMap(({ name }) =>
    [...fs.readFileSync(path.join(root, 'backend/sql/migrations', name), 'utf8')
      .matchAll(/^CREATE TABLE ([a-z][a-z0-9_]+) \(/gmu)].map((match) => match[1])).sort();
}
export function assertDataTransition(before, after) {
  for (const value of [before, after]) {
    exact(value, ['schema', 'ledger', 'business', 'newTables'], 'green_98_106_data_shape');
    assert(value.business && typeof value.business === 'object' && !Array.isArray(value.business), 'green_98_106_business');
    for (const [name, table] of Object.entries(value.business)) {
      assert(/^[a-z][a-z0-9_]*$/u.test(name), 'green_98_106_business');
      exact(table, ['count', 'sha256'], 'green_98_106_business');
      assert(Number.isSafeInteger(table.count) && table.count >= 0 && hash.test(table.sha256), 'green_98_106_business');
    }
  }
  assert(before.schema === 98 && after.schema === 106 && Object.keys(before.business).length > 0
    && before.ledger === green98106.sourceLedger && after.ledger === green98106.targetLedger
    && equal(before.business, after.business) && equal(before.newTables, []), 'green_98_106_data_drift');
  assert(Array.isArray(after.newTables)
    && equal(after.newTables.map((table) => table.name).sort(), newTableNames()), 'green_98_106_new_namespace_inventory');
  for (const table of after.newTables) {
    exact(table, ['name', 'count'], 'green_98_106_new_namespace_inventory');
    assert(table.count === 0, 'green_98_106_new_namespace_nonempty');
  }
  return true;
}
