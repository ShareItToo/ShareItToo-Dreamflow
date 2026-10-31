import { execFileSync } from 'node:child_process';
import { privateDirectory, writeArtifact } from './green_staging_98_106_evidence.mjs';
import { objectDigest } from './green_staging_98_106_contract.mjs';
import { requireBinding } from './green_staging_106_106_binding.mjs';
import { containerFingerprint } from './green_staging_98_106_promotion.mjs';

const commit = /^[a-f0-9]{40}$/u;
const dockerId = /^[a-f0-9]{64}$/u;
const imageId = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const safeName = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(value);
const inventoryArgs = ['ps', '-aq', '--no-trunc', '--filter', 'label=com.shareittoo.sit.green=true'];

function fixed(ok, code) { requireBinding(ok, `scope_${code}`); }
function dockerRead(args, command = execFileSync) {
  const allowed = args.length === 5 && args[0] === 'ps' && args[1] === '-aq'
    || args.length === 2 && args[0] === 'inspect' && dockerId.test(args[1])
    || args.length === 3 && args[0] === 'image' && args[1] === 'inspect' && imageId(args[2])
    || args.length === 5 && args[0] === 'network' && args[1] === 'ls' && args[2] === '--no-trunc'
    || args.length === 3 && args[0] === 'network' && args[1] === 'inspect' && dockerId.test(args[2])
    || args.length === 4 && args[0] === 'volume' && args[1] === 'ls' && args[2] === '--format'
    || args.length === 3 && args[0] === 'volume' && args[1] === 'inspect' && safeName(args[2]);
  fixed(allowed, 'read_command');
  try {
    return command('docker', args, { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error('green_106_106_scope_docker_read_failed');
  }
}

function jsonRead(args, command) {
  let value;
  try { value = JSON.parse(dockerRead(args, command)); } catch {
    throw new Error('green_106_106_scope_readback_invalid');
  }
  fixed(Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === 'object', 'inspect_shape');
  return value[0];
}

function idInventory(command) {
  const raw = String(dockerRead(inventoryArgs, command)).trim();
  const ids = raw ? raw.split(/\s+/u) : [];
  fixed(ids.length > 0 && ids.every(value => dockerId.test(value)) && new Set(ids).size === ids.length, 'inventory');
  return ids.sort();
}

function exactNamedIdList(kind, args, expectedNames, command) {
  const lines = String(dockerRead(args, command)).trim().split('\n').filter(Boolean);
  const found = new Map();
  const ids = new Set();
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`green_106_106_scope_${kind}_list_invalid`); }
    const { ID: id, Name: name } = row;
    fixed(dockerId.test(id ?? '') && safeName(name) && !found.has(name) && !ids.has(id), `${kind}_list`);
    ids.add(id);
    if (expectedNames.includes(name)) found.set(name, id);
  }
  fixed(expectedNames.every(name => found.has(name)), `${kind}_missing`);
  return expectedNames.map(name => ({ id: found.get(name), name }));
}

function volumeInventory(command, expectedName) {
  const rows = String(dockerRead(['volume', 'ls', '--format', '{{json .}}'], command)).trim().split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { throw new Error('green_106_106_scope_volume_list_invalid'); } });
  fixed(rows.filter(row => row?.Name === expectedName).length === 1, 'uploads_list');
}

function imageIdentity(image, expectedRevision) {
  fixed(imageId(image?.Id), 'image_id');
  const repoDigests = image.RepoDigests;
  fixed(Array.isArray(repoDigests) && repoDigests.length === 1
    && typeof repoDigests[0] === 'string' && /^[^@\s]+@sha256:[a-f0-9]{64}$/u.test(repoDigests[0]), 'repo_digest');
  const digest = repoDigests[0].slice(repoDigests[0].lastIndexOf('@') + 1);
  if (expectedRevision) fixed(image.Config?.Labels?.['org.opencontainers.image.revision'] === expectedRevision, 'runtime_revision');
  return { imageId: image.Id, imageDigest: digest };
}

function containerIdentity(record, expectedName, running) {
  fixed(dockerId.test(record?.Id ?? '') && record.Name === `/${expectedName}`
    && record.Config?.Labels?.['com.shareittoo.sit.green'] === 'true'
    && record.State?.Running === running && record.State?.Paused === false
    && imageId(record.Image), 'container_identity');
  return { id: record.Id, name: expectedName, imageId: record.Image };
}

function parseDatabaseEnvironment(record, expectedUser, expectedDatabase) {
  const entries = record.Config?.Env;
  fixed(Array.isArray(entries), 'database_environment');
  const values = new Map();
  for (const entry of entries) {
    const index = typeof entry === 'string' ? entry.indexOf('=') : -1;
    if (index > 0 && ['POSTGRES_USER', 'POSTGRES_DB'].includes(entry.slice(0, index))) {
      const key = entry.slice(0, index);
      fixed(!values.has(key), 'database_environment_duplicate');
      values.set(key, entry.slice(index + 1));
    }
  }
  fixed(values.get('POSTGRES_USER') === expectedUser && values.get('POSTGRES_DB') === expectedDatabase,
    'database_environment_mismatch');
}

function apiHasExpectedAttachments(api, networkSpecs, volumeName) {
  const networks = api.NetworkSettings?.Networks;
  fixed(networks && Object.keys(networks).sort().join('\n') === networkSpecs.map(n => n.name).sort().join('\n')
    && networkSpecs.every(n => networks[n.name]?.NetworkID === n.id), 'api_network_attachments');
  const mounts = api.Mounts;
  fixed(Array.isArray(mounts) && mounts.filter(m => m.Type === 'volume' && m.Name === volumeName
    && m.Destination === '/data/uploads').length === 1, 'uploads_mount');
}

function networkIdentity(network, expected, apiId, apiName, databaseId, databaseName) {
  fixed(network?.Id === expected.id && network.Name === expected.name
    && typeof network.Internal === 'boolean' && network.Internal === expected.internal
    && network.Containers && typeof network.Containers === 'object', 'network_identity');
  fixed(Object.hasOwn(network.Containers, apiId)
    && network.Containers[apiId].Name === apiName, 'network_api_membership');
  if (expected.internal) fixed(Object.hasOwn(network.Containers, databaseId)
    && network.Containers[databaseId].Name === databaseName, 'network_database_membership');
  return { ...expected };
}

function volumeIdentity(volume, name, api) {
  fixed(volume?.Name === name && Array.isArray(api.Mounts)
    && api.Mounts.some(m => m.Type === 'volume' && m.Name === name && m.Destination === '/data/uploads'), 'uploads_volume');
  return name;
}

function containerReadFingerprint(record) {
  return objectDigest({ id: record.Id, name: record.Name, image: record.Image, state: record.State,
    configuration: containerFingerprint(record) });
}

function validateInputs(inputs) {
  fixed(commit.test(inputs.runtimeCommit ?? ''), 'runtime_commit');
  for (const key of ['apiContainerName', 'databaseContainerName', 'internalNetworkName', 'externalNetworkName',
    'uploadsVolumeName', 'databaseUser', 'databaseName', 'evidenceDirectory', 'outputName']) {
    fixed(typeof inputs[key] === 'string' && inputs[key].length > 0, 'arguments');
  }
  for (const key of ['apiContainerName', 'databaseContainerName', 'internalNetworkName', 'externalNetworkName', 'uploadsVolumeName']) {
    fixed(safeName(inputs[key]), 'resource_name');
  }
  fixed(/^[a-z][a-z0-9_]+$/u.test(inputs.databaseUser) && /^[a-z][a-z0-9_]+$/u.test(inputs.databaseName), 'database_name');
  fixed(inputs.apiContainerName !== inputs.databaseContainerName
    && inputs.internalNetworkName !== inputs.externalNetworkName
    && /^[a-z0-9][a-z0-9._-]{0,150}$/u.test(inputs.outputName), 'resource_names_distinct');
  fixed(typeof inputs.evidenceDirectory === 'string', 'evidence_directory');
}

export function collectGreenScope(inputs, { command = execFileSync } = {}) {
  validateInputs(inputs);
  const names = { api: inputs.apiContainerName, database: inputs.databaseContainerName };
  const networkNames = [inputs.internalNetworkName, inputs.externalNetworkName];
  const initialIds = idInventory(command);
  const initialContainers = initialIds.map(id => jsonRead(['inspect', id], command));
  const byName = new Map();
  for (const record of initialContainers) {
    fixed(record?.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', 'green_label');
    fixed(typeof record.Name === 'string' && record.Name.startsWith('/') && !byName.has(record.Name.slice(1)), 'container_names');
    byName.set(record.Name.slice(1), record);
  }
  fixed(byName.size === initialIds.length && byName.has(names.api) && byName.has(names.database), 'api_database_present');
  const apiRecord = byName.get(names.api), dbRecord = byName.get(names.database);
  const apiBase = containerIdentity(apiRecord, names.api, true);
  const dbBase = containerIdentity(dbRecord, names.database, true);
  const witnesses = initialContainers.filter(record => record !== apiRecord && record !== dbRecord)
    .map(record => {
      fixed(record.State?.Running === false && record.State?.Paused === false, 'witness_state');
      return containerIdentity(record, record.Name.slice(1), false);
    }).sort((a, b) => a.name.localeCompare(b.name));

  const allContainers = [apiBase, dbBase, ...witnesses];
  const imageIds = [...new Set(allContainers.map(c => c.imageId))].sort();
  const images = new Map(imageIds.map(id => {
    const imageRecord = jsonRead(['image', 'inspect', id], command);
    fixed(imageRecord.Id === id, 'image_match');
    return [id, { record: imageRecord, identity: imageIdentity(imageRecord, id === apiBase.imageId ? inputs.runtimeCommit : null) }];
  }));
  const api = { ...apiBase, ...images.get(apiBase.imageId).identity, runtimeCommit: inputs.runtimeCommit };
  const database = { ...dbBase, ...images.get(dbBase.imageId).identity };
  parseDatabaseEnvironment(dbRecord, inputs.databaseUser, inputs.databaseName);

  const networkSpecs = exactNamedIdList('network', ['network', 'ls', '--no-trunc', '--format', '{{json .}}'],
    networkNames, command).map((n, index) => ({ ...n, internal: index === 0 }));
  const networkRecords = networkSpecs.map(spec => {
    const record = jsonRead(['network', 'inspect', spec.id], command);
    return { record, identity: networkIdentity(record, spec, api.id, api.name, database.id, database.name) };
  });
  apiHasExpectedAttachments(apiRecord, networkSpecs, inputs.uploadsVolumeName);
  fixed(networkRecords[0].identity.internal === true && networkRecords[1].identity.internal === false, 'network_roles');

  volumeInventory(command, inputs.uploadsVolumeName);
  const volumeRecord = jsonRead(['volume', 'inspect', inputs.uploadsVolumeName], command);
  const uploads = volumeIdentity(volumeRecord, inputs.uploadsVolumeName, apiRecord);

  const scopedWitnesses = witnesses.map(witness => ({
    ...witness,
    ...images.get(witness.imageId).identity,
  }));
  const scope = { api, database, witnesses: scopedWitnesses,
    networks: networkSpecs.map(n => ({ id: n.id, name: n.name, internal: n.internal })),
    uploads, databaseUser: inputs.databaseUser, databaseName: inputs.databaseName };
  const initialFingerprints = new Map(initialContainers.map(record => [record.Id, containerReadFingerprint(record)]));
  const initialImageFingerprints = new Map([...images].map(([id, value]) => [id, objectDigest(value.record)]));
  const initialNetworkFingerprints = new Map(networkRecords.map(({ record }) => [record.Id, objectDigest(record)]));
  const volumeFingerprint = objectDigest(volumeRecord);

  fixed(JSON.stringify(idInventory(command)) === JSON.stringify(initialIds), 'inventory_drift');
  for (const id of initialIds) {
    const fresh = jsonRead(['inspect', id], command);
    fixed(initialFingerprints.get(id) === containerReadFingerprint(fresh), 'container_drift');
  }
  for (const id of imageIds) {
    const fresh = jsonRead(['image', 'inspect', id], command);
    fixed(initialImageFingerprints.get(id) === objectDigest(fresh), 'image_drift');
  }
  for (const spec of networkSpecs) {
    const fresh = jsonRead(['network', 'inspect', spec.id], command);
    fixed(initialNetworkFingerprints.get(spec.id) === objectDigest(fresh), 'network_drift');
  }
  const freshNetworkSpecs = exactNamedIdList('network', ['network', 'ls', '--no-trunc', '--format', '{{json .}}'],
    networkNames, command);
  fixed(JSON.stringify(freshNetworkSpecs) === JSON.stringify(networkSpecs.map(({ id, name }) => ({ id, name }))), 'network_list_drift');
  const freshVolume = jsonRead(['volume', 'inspect', inputs.uploadsVolumeName], command);
  fixed(volumeFingerprint === objectDigest(freshVolume), 'uploads_drift');
  volumeInventory(command, inputs.uploadsVolumeName);
  fixed(JSON.stringify(idInventory(command)) === JSON.stringify(initialIds), 'inventory_drift');

  const directory = privateDirectory(inputs.evidenceDirectory);
  const file = writeArtifact(directory, inputs.outputName, scope);
  return Object.freeze({ status: 'scope_collected_read_only', artifact: file.name, scopeSha256: file.sha256,
    scopeContentSha256: file.contentSha256, runtimeCommit: inputs.runtimeCommit,
    greenContainerCount: initialIds.length, stoppedWitnessCount: witnesses.length, containsSecrets: false });
}

