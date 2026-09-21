#!/usr/bin/env node

import crypto from 'node:crypto';
import { constants as fsConstants, createReadStream, createWriteStream, readFileSync } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  closeStablePrivateFile,
  openStablePrivateFile,
  readStablePrivateFile,
} from './stable_private_file.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestKind = 'sit-staging-google-auth-runtime-manifest';
const apiContainer = 'shareittoo-staging-api';

const requiredSafetyEnv = Object.freeze({
  DEPLOYMENT_ENVIRONMENT: 'test',
  FIREBASE_AUTH_ENABLED: 'false',
  FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
  PAYMENT_TRANSPORT: 'memory',
  STRIPE_LIVEMODE: 'false',
  SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
});
const activatedEnvironment = 'staging';
const activatedAuth = 'true';

function fail(code) {
  const error = new Error(`Staging Google Auth activation failed: ${code}`);
  error.code = code;
  throw error;
}

function fullCommit(value, code) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(code);
  return value;
}

function digest(value, code) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value ?? '')) fail(code);
  return value;
}

function safeExternalPath(value, code) {
  if (typeof value !== 'string' || !isAbsolute(value)
      || value.startsWith(`${repositoryRoot}/`)) fail(code);
  return value;
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
      || actual.some((entry, index) => entry !== expected[index])) fail(code);
}

function oneRecord(value, code) {
  if (Array.isArray(value)) {
    if (value.length !== 1) fail(code);
    return value[0];
  }
  return value;
}

function envMap(entries) {
  return Object.fromEntries((entries ?? []).map((entry) => {
    const index = entry.indexOf('=');
    return index < 0 ? [entry, ''] : [entry.slice(0, index), entry.slice(index + 1)];
  }));
}

function mountShape(mount) {
  return {
    Type: mount.Type ?? null,
    Name: mount.Name ?? null,
    Source: mount.Source ?? null,
    Destination: mount.Destination ?? null,
    RW: mount.RW !== false,
  };
}

function normalizedMounts(mounts) {
  return (mounts ?? []).map(mountShape).sort((left, right) =>
    String(left.Destination).localeCompare(String(right.Destination)));
}

function normalizedLabels(labels) {
  return Object.fromEntries(Object.entries(labels ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function normalizedRestartPolicy(value) {
  return {
    Name: value?.Name ?? '',
    MaximumRetryCount: Number(value?.MaximumRetryCount ?? 0),
  };
}

function normalizedHealthcheck(value) {
  if (!value) return null;
  return {
    Test: value.Test ?? null,
    Interval: Number(value.Interval ?? 0),
    Timeout: Number(value.Timeout ?? 0),
    Retries: Number(value.Retries ?? 0),
    StartPeriod: Number(value.StartPeriod ?? 0),
    StartInterval: Number(value.StartInterval ?? 0),
  };
}

function normalizedSecurityConfig(record) {
  const config = record?.Config ?? {};
  const host = record?.HostConfig ?? {};
  const resources = {
    Memory: Number(host.Memory ?? 0), MemorySwap: Number(host.MemorySwap ?? 0),
    CpuShares: Number(host.CpuShares ?? 0), CpuQuota: Number(host.CpuQuota ?? 0),
    CpuPeriod: Number(host.CpuPeriod ?? 0), NanoCpus: Number(host.NanoCpus ?? 0),
    CpusetCpus: host.CpusetCpus ?? '', CpusetMems: host.CpusetMems ?? '',
    PidsLimit: host.PidsLimit === null || host.PidsLimit === undefined ? null : Number(host.PidsLimit),
  };
  return {
    readOnlyRootfs: host.ReadonlyRootfs === true,
    privileged: host.Privileged === true,
    securityOpt: [...(host.SecurityOpt ?? [])].sort(),
    noNewPrivileges: host.NoNewPrivileges === true,
    capAdd: [...(host.CapAdd ?? [])].sort(),
    capDrop: [...(host.CapDrop ?? [])].sort(),
    devices: (host.Devices ?? []).map((entry) => ({ PathOnHost: entry.PathOnHost ?? '', PathInContainer: entry.PathInContainer ?? '', CgroupPermissions: entry.CgroupPermissions ?? '' })).sort((a, b) => a.PathInContainer.localeCompare(b.PathInContainer)),
    deviceRequests: host.DeviceRequests ?? [],
    ulimits: (host.Ulimits ?? []).map((entry) => ({ Name: entry.Name ?? '', Soft: Number(entry.Soft ?? 0), Hard: Number(entry.Hard ?? 0) })).sort((a, b) => a.Name.localeCompare(b.Name)),
    oomKillDisable: host.OomKillDisable === true,
    tmpfs: Object.fromEntries(Object.entries(host.Tmpfs ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    maskedPaths: [...(host.MaskedPaths ?? [])].sort(), readonlyPaths: [...(host.ReadonlyPaths ?? [])].sort(),
    cgroupnsMode: host.CgroupnsMode ?? '', runtime: host.Runtime ?? '', isolation: host.Isolation ?? '', autoRemove: host.AutoRemove === true,
    dns: [...(host.Dns ?? [])].sort(), dnsSearch: [...(host.DnsSearch ?? [])].sort(),
    extraHosts: [...(host.ExtraHosts ?? [])].sort(),
    networkMode: host.NetworkMode ?? '', ipcMode: host.IpcMode ?? '', pidMode: host.PidMode ?? '',
    usernsMode: host.UsernsMode ?? '', shmSize: Number(host.ShmSize ?? 0), init: host.Init === true,
    stopTimeout: Number(host.StopTimeout ?? 0), stopSignal: config.StopSignal ?? '',
    healthcheck: normalizedHealthcheck(config.Healthcheck), resources,
    logConfig: {
      Type: host.LogConfig?.Type ?? '',
      Config: Object.fromEntries(Object.entries(host.LogConfig?.Config ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    },
  };
}

function normalizedConfig(record) {
  return {
    image: record?.Config?.Image ?? '',
    cmd: record?.Config?.Cmd ?? null,
    entrypoint: record?.Config?.Entrypoint ?? null,
    workingDir: record?.Config?.WorkingDir ?? '',
    user: record?.Config?.User ?? '',
    tty: record?.Config?.Tty === true,
    openStdin: record?.Config?.OpenStdin === true,
    labels: normalizedLabels(record?.Config?.Labels),
    groupAdd: [...(record?.HostConfig?.GroupAdd ?? [])].sort(),
    restart: normalizedRestartPolicy(record?.HostConfig?.RestartPolicy),
    mounts: normalizedMounts(record?.Mounts),
    portBindings: record?.HostConfig?.PortBindings ?? null,
    security: normalizedSecurityConfig(record),
  };
}

function sameExceptAuthFlag(left, right) {
  const a = normalizedConfig(left);
  const b = normalizedConfig(right);
  const envA = envMap(left?.Config?.Env);
  const envB = envMap(right?.Config?.Env);
  delete envA.FIREBASE_AUTH_ENABLED;
  delete envB.FIREBASE_AUTH_ENABLED;
  delete envA.DEPLOYMENT_ENVIRONMENT;
  delete envB.DEPLOYMENT_ENVIRONMENT;
  return JSON.stringify(a) === JSON.stringify(b)
    && JSON.stringify(envA) === JSON.stringify(envB);
}

function assertExactContainerNetworks(record, manifest, code = 'api_network_inventory_invalid') {
  const actual = Object.keys(record?.NetworkSettings?.Networks ?? {}).sort();
  const expected = [manifest.network, manifest.providerNetwork].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code);
}

export function assertGoogleAuthRuntimeManifest(manifest) {
  exactKeys(manifest, [
  'kind', 'schemaVersion', 'environment', 'composeProject', 'apiContainer',
    'databaseContainer', 'databaseVolume', 'databaseName', 'databaseUser',
    'network', 'providerNetwork', 'uploadsVolume',
    'image', 'runtimeRevision', 'imageDigest', 'envFile', 'envUid', 'envGid',
    'mounts', 'safetyEnv', 'label',
  ], 'manifest_shape_invalid');
  if (manifest.kind !== manifestKind || manifest.schemaVersion !== 1
      || manifest.environment !== 'staging'
      || manifest.composeProject !== 'sit-green'
      || manifest.apiContainer !== apiContainer) fail('target_not_staging_green');
  const exactGreen = {
    databaseContainer: 'sit-green-postgres-20260918011528-wp254',
    databaseVolume: 'sit-green-volume-20260918011528-wp254',
    databaseName: 'shareittoo_green',
    databaseUser: 'shareittoo_green',
    network: 'sit-green-network-20260918011528-wp254',
    providerNetwork: 'sit-staging-provider-egress',
    uploadsVolume: 'sit-green-uploads-20260918011528-wp254',
  };
  for (const [field, expected] of Object.entries(exactGreen)) {
    if (manifest[field] !== expected) fail(`exact_green_${field}_invalid`);
  }
  for (const [field, code] of [
    ['databaseContainer', 'database_target_invalid'],
    ['network', 'network_target_invalid'],
    ['providerNetwork', 'provider_network_target_invalid'],
    ['uploadsVolume', 'uploads_volume_target_invalid'],
  ]) {
    if (typeof manifest[field] !== 'string' || !manifest[field]
        || /(?:prod|production|latest|lookalike)/iu.test(manifest[field])) fail(code);
  }
  if (typeof manifest.image !== 'string' || !manifest.image
      || /(?:^|[/_:])(?:latest|local)(?:$|[/_:])/iu.test(manifest.image)
      || /(?:prod|production|lookalike)/iu.test(manifest.image)) fail('image_target_invalid');
  fullCommit(manifest.runtimeRevision, 'runtime_revision_invalid');
  digest(manifest.imageDigest, 'image_digest_invalid');
  safeExternalPath(manifest.envFile, 'env_file_path_invalid');
  if (!Number.isInteger(manifest.envUid) || manifest.envUid < 0
      || !Number.isInteger(manifest.envGid) || manifest.envGid < 0) fail('env_owner_invalid');
  if (!Array.isArray(manifest.mounts) || manifest.mounts.length === 0) fail('mount_inventory_invalid');
  const destinations = new Set();
  for (const mount of manifest.mounts) {
    exactKeys(mount, ['type', 'name', 'source', 'destination', 'readOnly'], 'mount_shape_invalid');
    if (!['bind', 'volume'].includes(mount.type) || typeof mount.name !== 'string'
        || !mount.name || typeof mount.destination !== 'string'
        || !mount.destination.startsWith('/') || mount.readOnly !== true && mount.destination !== '/data/uploads') {
      fail('mount_value_invalid');
    }
    if (mount.type === 'bind') safeExternalPath(mount.source, 'mount_source_invalid');
    if (mount.type === 'volume' && (typeof mount.source !== 'string' || !mount.source)) fail('volume_source_invalid');
    if (destinations.has(mount.destination)) fail('duplicate_mount_destination');
    destinations.add(mount.destination);
  }
  const exactGreenMountDestinations = [
    '/data/uploads', '/run/secrets/firebase-service-account.json', '/run/secrets/mfa-encryption-key',
    '/run/secrets/technical-sandbox-key', '/run/secrets/technical-sandbox-webhook',
  ].sort();
  if (JSON.stringify([...destinations].sort()) !== JSON.stringify(exactGreenMountDestinations)) fail('exact_mount_destinations_invalid');
  exactKeys(manifest.safetyEnv, Object.keys(requiredSafetyEnv), 'safety_env_shape_invalid');
  for (const [name, value] of Object.entries(requiredSafetyEnv)) {
    if (manifest.safetyEnv[name] !== value) fail(`safety_env_${name.toLowerCase()}_invalid`);
  }
  if (manifest.safetyEnv.FIREBASE_AUTH_ENABLED !== 'false') fail('auth_must_start_disabled');
  exactKeys(manifest.label, ['key', 'value'], 'label_shape_invalid');
  if (manifest.label.key !== 'com.shareittoo.sit.green' || manifest.label.value !== 'true') fail('green_label_invalid');
  return Object.freeze({ ...manifest, mounts: manifest.mounts.map((mount) => Object.freeze({ ...mount })) });
}

async function readProtectedEnvSnapshot(manifest, { requireAuthValue = 'false', requirePreState = true } = {}) {
  let content;
  let metadata;
  try {
    const opened = openStablePrivateFile(manifest.envFile, {
      expectedMode: 0o600,
      expectedUid: manifest.envUid,
      expectedGid: manifest.envGid,
      minBytes: 1,
      code: 'env_file_metadata_invalid',
    });
    metadata = opened.metadata;
    try {
      content = readFileSync(opened.descriptor, 'utf8');
    } finally {
      closeStablePrivateFile(opened);
    }
  } catch (error) {
    if (error?.code === 'env_file_metadata_invalid') throw error;
    fail(error?.code === 'ELOOP' ? 'env_file_symlink_forbidden' : 'env_file_unreadable');
  }
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || Object.hasOwn(values, match[1])) fail('env_file_parse_invalid');
    values[match[1]] = match[2];
  }
  if (requireAuthValue !== null && values.FIREBASE_AUTH_ENABLED !== requireAuthValue) {
    fail(requireAuthValue === 'false' ? 'auth_env_not_disabled_before_activation' : 'auth_env_not_enabled_after_activation');
  }
  for (const [name, value] of Object.entries(requiredSafetyEnv)) {
    if (!requirePreState && (name === 'FIREBASE_AUTH_ENABLED' || name === 'DEPLOYMENT_ENVIRONMENT')) continue;
    if (values[name] !== value) fail(`env_safety_${name.toLowerCase()}_invalid`);
  }
  return Object.freeze({ content, values, metadata });
}

function assertRecordSafety({ api, database, databaseVolume, network, providerNetwork, uploads, image, manifest }) {
  const apiRecord = oneRecord(api, 'api_inspect_invalid');
  const databaseRecord = oneRecord(database, 'database_inspect_invalid');
  const networkRecord = oneRecord(network, 'network_inspect_invalid');
  const providerRecord = oneRecord(providerNetwork, 'provider_network_inspect_invalid');
  const uploadsRecord = oneRecord(uploads, 'uploads_inspect_invalid');
  const databaseVolumeRecord = oneRecord(databaseVolume, 'database_volume_inspect_invalid');
  const imageRecord = oneRecord(image, 'image_inspect_invalid');
  const apiEnv = envMap(apiRecord?.Config?.Env);
  if (apiRecord?.Name?.replace(/^\//u, '') !== manifest.apiContainer
      || apiRecord?.State?.Running !== true
      || Object.values(apiRecord?.NetworkSettings?.Ports ?? {}).flat().filter(Boolean).length !== 0
      || apiRecord?.Config?.Image !== manifest.image
      || apiEnv.FIREBASE_AUTH_ENABLED !== 'false'
      || Object.entries(manifest.safetyEnv).some(([name, value]) => apiEnv[name] !== value)) {
    fail('api_runtime_inventory_invalid');
  }
  assertExactContainerNetworks(apiRecord, manifest);
  const mounts = normalizedMounts(apiRecord?.Mounts);
  const expectedMounts = manifest.mounts.map((mount) => ({
    Type: mount.type,
    Name: mount.type === 'volume' ? mount.name : null,
    Source: mount.source,
    Destination: mount.destination,
    RW: mount.readOnly !== true,
  })).sort((left, right) => left.Destination.localeCompare(right.Destination));
  if (JSON.stringify(mounts) !== JSON.stringify(expectedMounts)) fail('api_mount_inventory_invalid');
  if (databaseRecord?.Name?.replace(/^\//u, '') !== manifest.databaseContainer
      || databaseRecord?.State?.Running !== true) fail('database_runtime_inventory_invalid');
  if (networkRecord?.Name !== manifest.network || networkRecord?.Internal !== true) fail('network_runtime_inventory_invalid');
  if (providerRecord?.Name !== manifest.providerNetwork) fail('provider_network_runtime_inventory_invalid');
  if (uploadsRecord?.Name !== manifest.uploadsVolume) fail('uploads_volume_runtime_inventory_invalid');
  if (databaseVolumeRecord?.Name !== manifest.databaseVolume) fail('database_volume_runtime_inventory_invalid');
  if (imageRecord?.Config?.Labels?.['org.opencontainers.image.revision'] !== manifest.runtimeRevision
      || imageRecord?.Config?.User !== 'shareittoo'
      || !(imageRecord?.RepoDigests ?? []).includes(`${manifest.image}@${manifest.imageDigest}`)
      && !(imageRecord?.RepoDigests ?? []).some((entry) => entry.endsWith(`@${manifest.imageDigest}`))) {
    fail('immutable_image_readback_invalid');
  }
  if (apiRecord?.Config?.Labels?.[manifest.label.key] !== manifest.label.value) fail('api_green_label_invalid');
  return Object.freeze({ apiRecord, databaseRecord, imageRecord });
}

function parseJson(stdout, code) {
  try { return JSON.parse(stdout); } catch { fail(code); }
}

function assertHttpPayload(stdout, code) {
  const result = parseJson(stdout, code);
  if (result?.status !== 200) fail(code);
  return result.payload;
}

function assertRuntimeReadback({ version, flags, manifest, expectedAuth = 'false', expectedEnvironment = requiredSafetyEnv.DEPLOYMENT_ENVIRONMENT }) {
  if (version?.commit !== manifest.runtimeRevision || version?.environment !== expectedEnvironment) fail('version_readback_invalid');
  if (flags?.FIREBASE_AUTH_ENABLED !== expectedAuth
      || flags?.DEPLOYMENT_ENVIRONMENT !== expectedEnvironment
      || flags?.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false') fail('runtime_flag_readback_invalid');
  for (const [name, value] of Object.entries(manifest.safetyEnv)) {
    if (name === 'FIREBASE_AUTH_ENABLED' || name === 'DEPLOYMENT_ENVIRONMENT') continue;
    if (flags?.[name] !== value) fail(`runtime_safety_flag_${name.toLowerCase()}_invalid`);
  }
}

export function buildGoogleAuthPreflightCommands(manifest) {
  const inspect = (name, phase) => ({ phase, command: 'docker', args: ['inspect', '--format', '{{json .}}', name] });
  return Object.freeze([
    inspect(manifest.apiContainer, 'current_api_inspect'),
    inspect(manifest.databaseContainer, 'current_database_inspect'),
    inspect(manifest.databaseVolume, 'current_database_volume_inspect'),
    inspect(manifest.network, 'current_network_inspect'),
    inspect(manifest.providerNetwork, 'current_provider_network_inspect'),
    inspect(manifest.uploadsVolume, 'current_uploads_volume_inspect'),
    { phase: 'current_image_inspect', command: 'docker', args: ['image', 'inspect', '--format', '{{json .}}', manifest.image] },
    { phase: 'current_database_probe', command: 'docker', args: ['exec', manifest.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', 'SELECT 1'] },
    { phase: 'current_live_probe', command: 'docker', args: ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/health/live'); process.stdout.write(JSON.stringify({status:r.status,payload:await r.json()})); if(r.status!==200) process.exit(1)"] },
    { phase: 'current_ready_probe', command: 'docker', args: ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/health/ready'); process.stdout.write(JSON.stringify({status:r.status,payload:await r.json()})); if(r.status!==200) process.exit(1)"] },
    { phase: 'current_version_probe', command: 'docker', args: ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/version'); process.stdout.write(JSON.stringify(await r.json())); if(r.status!==200) process.exit(1)"] },
    { phase: 'current_runtime_flags', command: 'docker', args: ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', "process.stdout.write(JSON.stringify(Object.fromEntries(['DEPLOYMENT_ENVIRONMENT','FIREBASE_AUTH_ENABLED','FIREBASE_PHONE_VERIFICATION_ENABLED','PAYMENT_TRANSPORT','STRIPE_LIVEMODE','SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED'].map((name)=>[name,process.env[name]??null]))))"] },
    { phase: 'current_config_import_probe', command: 'docker', args: ['exec', '-e', 'FIREBASE_AUTH_ENABLED=true', '-e', 'DEPLOYMENT_ENVIRONMENT=staging', manifest.apiContainer, 'node', '--input-type=module', '-e', "import fs from 'node:fs'; import { config } from './src/config.js'; const paths=['/run/secrets/mfa-encryption-key','/run/secrets/firebase-service-account.json']; for (const p of paths) { if (!fs.statSync(p).isFile() || fs.accessSync(p, fs.constants.R_OK)) throw new Error('credential_unreadable'); } if (!config.socialAuth.enabled || !config.mfa.configured || config.deploymentEnvironment!=='staging') throw new Error('staging_auth_config_invalid'); process.stdout.write(JSON.stringify({auth:config.socialAuth.enabled,mfa:config.mfa.configured,project:Boolean(config.socialAuth.firebaseProjectId),environment:config.deploymentEnvironment}));"] },
  ]);
}

export function buildReplacementCreateArgs({ manifest, envFile, currentApi, containerName = manifest.apiContainer, networkName = manifest.network, mounts = currentApi?.Mounts, commandOverride = null }) {
  if (!currentApi || typeof currentApi !== 'object') fail('replacement_source_invalid');
  const config = currentApi.Config ?? {};
  const host = currentApi.HostConfig ?? {};
  if (typeof containerName !== 'string' || !/^shareittoo-staging-api-google-auth-rehearsal-(?:probe-)?[0-9a-f-]+$/u.test(containerName) && containerName !== manifest.apiContainer) fail('replacement_container_name_invalid');
  const args = ['create', '--name', containerName, '--env-file', envFile];
  const restart = normalizedRestartPolicy(host.RestartPolicy);
  if (restart.Name) {
    args.push('--restart', restart.Name);
    if (restart.Name === 'on-failure' && restart.MaximumRetryCount > 0) args.push('--restart-max-retries', String(restart.MaximumRetryCount));
  }
  if (config.User) args.push('--user', config.User);
  if (config.WorkingDir) args.push('--workdir', config.WorkingDir);
  if (config.Entrypoint) {
    if (!Array.isArray(config.Entrypoint) || config.Entrypoint.length !== 1) fail('entrypoint_shape_not_cloneable');
    args.push('--entrypoint', config.Entrypoint[0]);
  }
  if (host.Privileged) args.push('--privileged');
  if (host.ReadonlyRootfs) args.push('--read-only');
  for (const option of host.SecurityOpt ?? []) args.push('--security-opt', option);
  if (host.NoNewPrivileges && !(host.SecurityOpt ?? []).includes('no-new-privileges')) args.push('--security-opt', 'no-new-privileges');
  for (const capability of host.CapAdd ?? []) args.push('--cap-add', capability);
  for (const capability of host.CapDrop ?? []) args.push('--cap-drop', capability);
  if (host.Init) args.push('--init');
  if (host.StopTimeout) args.push('--stop-timeout', String(host.StopTimeout));
  if (config.StopSignal) args.push('--stop-signal', config.StopSignal);
  if (host.ShmSize) args.push('--shm-size', String(host.ShmSize));
  for (const dns of host.Dns ?? []) args.push('--dns', dns);
  for (const dnsSearch of host.DnsSearch ?? []) args.push('--dns-search', dnsSearch);
  for (const extraHost of host.ExtraHosts ?? []) args.push('--add-host', extraHost);
  if (host.IpcMode && host.IpcMode !== 'private') args.push('--ipc', host.IpcMode);
  if (host.PidMode) args.push('--pid', host.PidMode);
  if (host.UsernsMode) args.push('--userns', host.UsernsMode);
  if (host.LogConfig?.Type) args.push('--log-driver', host.LogConfig.Type);
  for (const [key, value] of Object.entries(host.LogConfig?.Config ?? {})) args.push('--log-opt', `${key}=${value}`);
  const resources = host;
  if (resources.Memory) args.push('--memory', String(resources.Memory));
  if (resources.MemorySwap) args.push('--memory-swap', String(resources.MemorySwap));
  if (resources.CpuShares) args.push('--cpu-shares', String(resources.CpuShares));
  if (resources.CpuQuota) args.push('--cpu-quota', String(resources.CpuQuota));
  if (resources.CpuPeriod) args.push('--cpu-period', String(resources.CpuPeriod));
  if (resources.NanoCpus) args.push('--cpus', String(resources.NanoCpus / 1e9));
  if (resources.CpusetCpus) args.push('--cpuset-cpus', resources.CpusetCpus);
  if (resources.CpusetMems) args.push('--cpuset-mems', resources.CpusetMems);
  if (resources.PidsLimit !== null && resources.PidsLimit !== undefined) args.push('--pids-limit', String(resources.PidsLimit));
  for (const device of host.Devices ?? []) {
    if (!device.PathOnHost || !device.PathInContainer) fail('device_config_invalid');
    args.push('--device', `${device.PathOnHost}:${device.PathInContainer}${device.CgroupPermissions ? `:${device.CgroupPermissions}` : ''}`);
  }
  if (host.DeviceRequests?.length) fail('device_request_config_unsupported');
  for (const limit of host.Ulimits ?? []) args.push('--ulimit', `${limit.Name}=${limit.Soft}:${limit.Hard}`);
  if (host.OomKillDisable) args.push('--oom-kill-disable');
  for (const [path, options] of Object.entries(host.Tmpfs ?? {})) args.push('--tmpfs', `${path}${options ? `:${options}` : ''}`);
  if (host.CgroupnsMode) args.push('--cgroupns', host.CgroupnsMode);
  if (host.Runtime) args.push('--runtime', host.Runtime);
  if (host.Isolation) args.push('--isolation', host.Isolation);
  if (host.AutoRemove) args.push('--rm');
  const health = config.Healthcheck;
  if (health) {
    if (!Array.isArray(health.Test) || health.Test.length < 2 || !['CMD', 'CMD-SHELL'].includes(health.Test[0])) fail('healthcheck_config_unsupported');
    args.push('--health-cmd', health.Test[0] === 'CMD-SHELL' ? health.Test[1] : health.Test.slice(1).join(' '));
    if (health.Interval) args.push('--health-interval', String(health.Interval));
    if (health.Timeout) args.push('--health-timeout', String(health.Timeout));
    if (health.Retries) args.push('--health-retries', String(health.Retries));
    if (health.StartPeriod) args.push('--health-start-period', String(health.StartPeriod));
    if (health.StartInterval) args.push('--health-start-interval', String(health.StartInterval));
  }
  for (const group of host.GroupAdd ?? []) args.push('--group-add', group);
  for (const [key, value] of Object.entries(config.Labels ?? {})) {
    if (/(?:password|secret|token|private)/iu.test(key) || /(?:password|secret|token|private)/iu.test(String(value))) fail('label_secret_like');
    args.push('--label', `${key}=${value}`);
  }
  for (const mount of mounts ?? []) {
    const type = mount.Type === 'volume' ? 'volume' : mount.Type === 'bind' ? 'bind' : null;
    if (!type || !mount.Source || !mount.Destination) fail('unsupported_mount_type');
    args.push('--mount', `type=${type},src=${type === 'volume' ? mount.Name : mount.Source},dst=${mount.Destination},readonly=${mount.RW === false ? 'true' : 'false'}`);
  }
  if (commandOverride !== null && (!Array.isArray(commandOverride) || commandOverride.some((entry) => typeof entry !== 'string'))) fail('replacement_command_override_invalid');
  args.push('--network', networkName, manifest.image, ...(commandOverride ?? config.Cmd ?? []));
  if (args.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg))) fail('replacement_command_secret_leak');
  if (args.includes('--publish') || args.includes('-p')) fail('replacement_host_port_forbidden');
  return Object.freeze(args);
}

export function runCommand(command, args, { cwd = repositoryRoot, env = process.env, phase = 'command', allowFailure = false, stdoutFile, inputFile, spawnProcess = spawn } = {}) {
  if (args.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg))) {
    return Promise.reject(Object.assign(new Error(`Staging Google Auth activation failed: ${phase}_secret_argument`), { code: `${phase}_secret_argument` }));
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(command, args, { cwd, env, stdio: [inputFile ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const output = stdoutFile ? createWriteStream(stdoutFile, { mode: 0o600 }) : null;
    let childClosed = false;
    let childCode;
    let settled = false;
    const outputDone = output ? new Promise((resolveOutput, rejectOutput) => {
      output.once('finish', resolveOutput);
      output.once('error', rejectOutput);
    }) : Promise.resolve();
    const failOutput = (error) => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* already closed */ }
      reject(Object.assign(new Error(`Staging Google Auth activation failed: ${phase}_output`), { code: `${phase}_output`, cause: error }));
    };
    const finish = () => {
      if (settled || !childClosed) return;
      settled = true;
      if (childCode === 0 || allowFailure) resolvePromise(Object.freeze({ stdout, stderr, code: childCode }));
      else reject(Object.assign(new Error(`Staging Google Auth activation failed: ${phase}`), { code: `${phase}_failed` }));
    };
    outputDone.catch(failOutput);
    if (output) child.stdout.pipe(output);
    else child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    if (!output) child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    if (inputFile) {
      const input = createReadStream(inputFile);
      input.once('error', failOutput);
      input.pipe(child.stdin);
    }
    child.once('error', () => reject(Object.assign(new Error(`Staging Google Auth activation failed: ${phase}_spawn`), { code: `${phase}_spawn` })));
    child.once('close', (code) => {
      childClosed = true;
      childCode = code;
      outputDone.then(finish).catch(failOutput);
    });
  });
}

const boundedStartupProbeScript = "const endpoints=['live','ready']; const deadline=Date.now()+15000; const attempts={live:0,ready:0}; const last={}; const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms)); let passed={}; while(Date.now()<deadline){ for(const endpoint of endpoints){ if(passed[endpoint]) continue; attempts[endpoint]++; try { const response=await fetch(`http://127.0.0.1:8080/health/${endpoint}`); last[endpoint]={status:response.status}; if(response.status===200){ passed[endpoint]=true; } } catch { last[endpoint]={status:null}; } } if(endpoints.every((endpoint)=>passed[endpoint])){ process.stdout.write(JSON.stringify({ok:true,attempts,last})); process.exit(0); } await sleep(250); } process.stdout.write(JSON.stringify({ok:false,attempts,last,reason:'startup_timeout'})); process.exit(1);";

function sanitizeProbeDiagnostic(diagnostic, reason = 'startup_probe_failed') {
  if (diagnostic && typeof diagnostic.stage === 'string' && typeof diagnostic.code === 'string' && typeof diagnostic.errorType === 'string') {
    return Object.freeze({
      stage: /^[a-z_]{1,32}$/u.test(diagnostic.stage) ? diagnostic.stage : 'unknown',
      ok: diagnostic.ok === true,
      code: /^[a-z0-9_]{1,64}$/u.test(diagnostic.code) ? diagnostic.code : 'probe_failed',
      errorType: /^[a-z_]{1,32}$/u.test(diagnostic.errorType) ? diagnostic.errorType : 'unknown',
    });
  }
  const attempts = {};
  for (const name of ['exec', 'live', 'ready']) {
    if (Number.isInteger(diagnostic?.attempts?.[name]) && diagnostic.attempts[name] >= 0) attempts[name] = diagnostic.attempts[name];
  }
  const last = {};
  for (const name of ['live', 'ready']) {
    if (diagnostic?.last?.[name] && typeof diagnostic.last[name] === 'object') {
      const status = diagnostic.last[name].status;
      last[name] = { status: Number.isInteger(status) ? status : null };
    }
  }
  return Object.freeze({
    ok: diagnostic?.ok === true,
    reason: typeof diagnostic?.reason === 'string' ? diagnostic.reason : reason,
    attempts,
    last,
  });
}

function startupProbeFailure(phase, probeDiagnostic) {
  const error = new Error(`Staging Google Auth activation failed: ${phase}_failed`);
  error.code = `${phase}_failed`;
  error.failurePhase = phase;
  error.probeDiagnostic = probeDiagnostic;
  return error;
}

export async function runBoundedStartupProbe(command, container, commandEnv, phase = 'replacement_startup_probe', { deadlineMs = 15000, retryDelayMs = 250 } = {}) {
  const deadline = Date.now() + Math.max(0, deadlineMs);
  const args = ['exec', container, 'node', '--input-type=module', '-e', boundedStartupProbeScript];
  let execAttempts = 0;
  let lastDiagnostic = sanitizeProbeDiagnostic(null, 'exec_unavailable');
  while (Date.now() <= deadline) {
    execAttempts += 1;
    let result;
    try {
      result = await command('docker', args, { phase, env: commandEnv, allowFailure: true });
    } catch (error) {
      error.failurePhase = phase;
      error.code = error.code ?? `${phase}_failed`;
      error.probeDiagnostic = Object.freeze({ ok: false, reason: 'command_error' });
      throw error;
    }
    let diagnostic;
    try { diagnostic = JSON.parse(result?.stdout?.trim() ?? ''); } catch { diagnostic = null; }
    if (result?.code === 0 && diagnostic?.ok === true && diagnostic?.last?.live?.status === 200 && diagnostic?.last?.ready?.status === 200) {
      return diagnostic;
    }
    lastDiagnostic = sanitizeProbeDiagnostic(diagnostic, diagnostic ? 'exec_unavailable' : 'exec_unavailable');
    if (diagnostic?.reason === 'startup_timeout') throw startupProbeFailure(phase, lastDiagnostic);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(0, retryDelayMs), remaining)));
  }
  const attempts = { ...lastDiagnostic.attempts, exec: execAttempts };
  throw startupProbeFailure(phase, Object.freeze({ ok: false, reason: 'startup_timeout', attempts, last: lastDiagnostic.last }));
}

async function executePhase(command, args, options) {
  try {
    const result = await command('docker', args, options);
    if (result?.code !== undefined && result.code !== 0) {
      const error = new Error(`Staging Google Auth activation failed: ${options.phase}_failed`);
      error.code = `${options.phase}_failed`;
      error.failurePhase = options.phase;
      error.failureExitCode = result.code;
      throw error;
    }
    return result;
  } catch (error) {
    error.failurePhase = error.failurePhase ?? options.phase;
    error.failureExitCode = error.failureExitCode ?? error.exitCode ?? null;
    throw error;
  }
}

function sanitizeCandidateState(record) {
  if (record && !record.State && ('status' in record || 'exitCode' in record || 'restartCount' in record || 'oomKilled' in record)) {
    return Object.freeze({
      status: typeof record.status === 'string' ? record.status : null,
      running: record.running === true,
      exitCode: Number.isInteger(record.exitCode) ? record.exitCode : null,
      oomKilled: record.oomKilled === true,
      restartCount: Number.isInteger(record.restartCount) ? record.restartCount : null,
      error: record.error === 'present' || record.error === 'inspect_failed' ? record.error : null,
    });
  }
  const state = record?.State ?? record ?? {};
  return Object.freeze({
    status: typeof state.Status === 'string' ? state.Status : null,
    running: state.Running === true,
    exitCode: Number.isInteger(state.ExitCode) ? state.ExitCode : null,
    oomKilled: state.OOMKilled === true,
    restartCount: Number.isInteger(record?.RestartCount) ? record.RestartCount : (Number.isInteger(state.RestartCount) ? state.RestartCount : null),
    error: typeof state.Error === 'string' && state.Error.length > 0 ? 'present' : null,
  });
}

async function captureCandidateState(command, container, commandEnv) {
  try {
    const result = await command('docker', ['inspect', '--format', '{{json .}}', container], { phase: 'failed_candidate_state_readback', env: commandEnv, allowFailure: true });
    if (result?.code !== 0) return Object.freeze({ status: null, running: false, exitCode: result?.code ?? null, oomKilled: false, restartCount: null, error: 'inspect_failed' });
    return sanitizeCandidateState(oneRecord(parseJson(result.stdout, 'failed_candidate_state_invalid')));
  } catch {
    return Object.freeze({ status: null, running: false, exitCode: null, oomKilled: false, restartCount: null, error: 'inspect_failed' });
  }
}

async function atomicReplace(content, manifest) {
  const directory = dirname(manifest.envFile);
  const temporary = `${manifest.envFile}.google-auth-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.chmod(0o600);
    await handle.chown(manifest.envUid, manifest.envGid);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, manifest.envFile);
    const parent = await open(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { await parent.sync(); } finally { await parent.close(); }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function setActivationFlags(manifest, expected, { auth = activatedAuth, environment = activatedEnvironment } = {}) {
  const current = await readProtectedEnvSnapshot(manifest, { requireAuthValue: null, requirePreState: false });
  if (current.content !== expected) fail('env_changed_since_preflight');
  const authMatches = [...current.content.matchAll(/^([ \t]*FIREBASE_AUTH_ENABLED=)([^\r\n]*)(\r?\n|$)/gmu)];
  const environmentMatches = [...current.content.matchAll(/^([ \t]*DEPLOYMENT_ENVIRONMENT=)([^\r\n]*)(\r?\n|$)/gmu)];
  if (authMatches.length !== 1 || environmentMatches.length !== 1
      || authMatches[0][2].trim() !== (auth === activatedAuth ? 'false' : activatedAuth)
      || environmentMatches[0][2].trim() !== (environment === activatedEnvironment ? requiredSafetyEnv.DEPLOYMENT_ENVIRONMENT : activatedEnvironment)) fail('activation_flag_transition_invalid');
  let next = current.content.replace(/^([ \t]*FIREBASE_AUTH_ENABLED=)[^\r\n]*(\r?\n|$)/mu, `$1${auth}$2`);
  next = next.replace(/^([ \t]*DEPLOYMENT_ENVIRONMENT=)[^\r\n]*(\r?\n|$)/mu, `$1${environment}$2`);
  await atomicReplace(next, manifest);
  return next;
}

export async function setAuthFlag(manifest, expected, value) {
  return setActivationFlags(manifest, expected, { auth: value, environment: requiredSafetyEnv.DEPLOYMENT_ENVIRONMENT });
}

async function rollback({ manifest, originalEnv, originalReadbacks, command, commandEnv, sealedName, replacementCreated }) {
  const results = [];
  const safe = async (args, phase) => {
    try {
      const result = await command('docker', args, { phase, env: commandEnv, allowFailure: true });
      const ok = result?.code === 0;
      results.push({ phase, ok, ...(ok ? {} : { code: result?.code ?? `${phase}_nonzero` }) });
      return Object.freeze({ ok, result });
    }
    catch (error) { results.push({ phase, ok: false, code: error?.code ?? phase }); }
    return Object.freeze({ ok: false });
  };
  const removal = replacementCreated
    ? await safe(['rm', '--force', manifest.apiContainer], 'rollback_replacement_remove')
    : Object.freeze({ ok: true });
  const verify = await safe(['ps', '--all', '--filter', `name=^/${manifest.apiContainer}$`, '--format', '{{.Names}}'], 'rollback_replacement_verify');
  const renameResult = await safe(['rename', sealedName, manifest.apiContainer], 'rollback_restore_rename');
  const startResult = await safe(['start', manifest.apiContainer], 'rollback_restore_start');
  const coreOk = removal.ok && verify.ok && renameResult.ok && startResult.ok
    && (!replacementCreated || (verify.result?.stdout ?? '').trim() === '');
  let envOk = false;
  try {
    const current = await readProtectedEnvSnapshot(manifest, { requireAuthValue: null, requirePreState: false });
    if (current.content !== originalEnv) await atomicReplace(originalEnv, manifest);
    const restoredSnapshot = await readProtectedEnvSnapshot(manifest);
    if (restoredSnapshot.content !== originalEnv) fail('rollback_env_content_mismatch');
    results.push({ phase: 'rollback_env_restore', ok: true });
    envOk = true;
  } catch (error) { results.push({ phase: 'rollback_env_restore', ok: false, code: error?.code ?? 'rollback_env_restore' }); }
  let runtimeOk = false;
  if (coreOk && envOk) {
    try {
      const restoredApiResult = await command('docker', ['inspect', '--format', '{{json .}}', manifest.apiContainer], { phase: 'rollback_api_readback', env: commandEnv });
      if (restoredApiResult?.code !== 0) fail('rollback_api_readback_failed');
      const restoredApi = oneRecord(parseJson(restoredApiResult.stdout, 'rollback_api_readback_invalid'));
      if (!sameExceptAuthFlag(originalReadbacks.api, restoredApi)) fail('rollback_config_drift');
      assertExactContainerNetworks(restoredApi, manifest, 'rollback_network_inventory_invalid');
      const startup = await runBoundedStartupProbe(command, manifest.apiContainer, commandEnv, 'rollback_startup_probe');
      const version = await command('docker', ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/version'); process.stdout.write(JSON.stringify(await r.json())); if(r.status!==200) process.exit(1)"], { phase: 'rollback_version_probe', env: commandEnv });
      const flags = await command('docker', ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', "process.stdout.write(JSON.stringify(Object.fromEntries(['DEPLOYMENT_ENVIRONMENT','FIREBASE_AUTH_ENABLED','FIREBASE_PHONE_VERIFICATION_ENABLED','PAYMENT_TRANSPORT','STRIPE_LIVEMODE','SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED'].map((name)=>[name,process.env[name]??null])))"], { phase: 'rollback_runtime_flags', env: commandEnv });
      const database = await command('docker', ['exec', manifest.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', 'SELECT 1'], { phase: 'rollback_database_probe', env: commandEnv });
      if ([version, flags, database].some((entry) => entry?.code !== 0)) fail('rollback_runtime_probe_failed');
      if (startup?.ok !== true) fail('rollback_startup_probe_invalid');
      assertRuntimeReadback({ version: parseJson(version.stdout, 'rollback_version_probe_invalid'), flags: parseJson(flags.stdout, 'rollback_runtime_flags_invalid'), manifest, expectedAuth: 'false', expectedEnvironment: requiredSafetyEnv.DEPLOYMENT_ENVIRONMENT });
      if (database.stdout.trim() !== '1') fail('rollback_database_probe_invalid');
      assertRecordSafety({ api: restoredApi, database: originalReadbacks.database, databaseVolume: originalReadbacks.databaseVolume, network: originalReadbacks.network, providerNetwork: originalReadbacks.providerNetwork, uploads: originalReadbacks.uploads, image: originalReadbacks.image, manifest });
      runtimeOk = true;
      results.push({ phase: 'rollback_runtime_restore_readback', ok: true });
    } catch (error) {
      results.push({ phase: 'rollback_runtime_restore_readback', ok: false, code: error?.code ?? 'rollback_runtime_restore_readback' });
    }
  }
  const restored = coreOk && envOk && runtimeOk;
  return Object.freeze({ restored, results: Object.freeze(results) });
}

async function collectPreflight(target, command, commandEnv) {
  const commands = buildGoogleAuthPreflightCommands(target);
  const readbacks = {};
  for (const entry of commands) {
    const result = await command(entry.command, entry.args, { phase: entry.phase, env: commandEnv });
    readbacks[entry.phase] = result.stdout?.trim() ?? '';
    if (entry.phase === 'current_database_probe' && readbacks[entry.phase] !== '1') fail('database_probe_invalid');
    if (entry.phase === 'current_config_import_probe') {
      const configProbe = parseJson(readbacks[entry.phase], 'config_import_probe_invalid');
      if (configProbe.auth !== true || configProbe.mfa !== true || configProbe.project !== true || configProbe.environment !== activatedEnvironment) fail('config_import_probe_invalid');
    }
    if (entry.phase === 'current_api_inspect') readbacks.api = oneRecord(parseJson(readbacks[entry.phase], 'api_inspect_invalid'));
    if (entry.phase === 'current_database_inspect') readbacks.database = parseJson(readbacks[entry.phase], 'database_inspect_invalid');
    if (entry.phase === 'current_database_volume_inspect') readbacks.databaseVolume = parseJson(readbacks[entry.phase], 'database_volume_inspect_invalid');
    if (entry.phase === 'current_network_inspect') readbacks.network = parseJson(readbacks[entry.phase], 'network_inspect_invalid');
    if (entry.phase === 'current_provider_network_inspect') readbacks.providerNetwork = parseJson(readbacks[entry.phase], 'provider_network_inspect_invalid');
    if (entry.phase === 'current_uploads_volume_inspect') readbacks.uploads = parseJson(readbacks[entry.phase], 'uploads_inspect_invalid');
    if (entry.phase === 'current_image_inspect') readbacks.image = parseJson(readbacks[entry.phase], 'image_inspect_invalid');
    if (entry.phase === 'current_live_probe') assertHttpPayload(readbacks[entry.phase], 'live_probe_invalid');
    if (entry.phase === 'current_ready_probe') assertHttpPayload(readbacks[entry.phase], 'ready_probe_invalid');
    if (entry.phase === 'current_version_probe') readbacks.version = parseJson(readbacks[entry.phase], 'version_probe_invalid');
    if (entry.phase === 'current_runtime_flags') readbacks.flags = parseJson(readbacks[entry.phase], 'runtime_flags_invalid');
  }
  assertRecordSafety({ ...readbacks, manifest: target });
  assertRuntimeReadback({ version: readbacks.version, flags: readbacks.flags, manifest: target });
  return Object.freeze({ commands, readbacks });
}

export async function runGoogleAuthActivation({ manifest, command = runCommand, commandEnv = process.env, execute = false } = {}) {
  const target = assertGoogleAuthRuntimeManifest(manifest);
  if (typeof command !== 'function') fail('command_runner_required');
  const originalEnv = (await readProtectedEnvSnapshot(target)).content;
  const { commands, readbacks } = await collectPreflight(target, command, commandEnv);
  if (!execute) return Object.freeze({ status: 'preflight-passed-no-mutation', firstIrreversiblePhase: 'atomic_env_enable', commands: Object.freeze(commands.map((entry) => entry.phase)) });
  if (commandEnv.STAGING_GOOGLE_AUTH_EXECUTE !== '1'
      || commandEnv.STAGING_GOOGLE_AUTH_CONFIRM !== target.runtimeRevision) fail('explicit_execute_confirmation_required');
  const sealedName = `${target.apiContainer}-google-auth-rollback-${target.runtimeRevision.slice(0, 12)}`;
  let replacementCreated = false;
  try {
    await setActivationFlags(target, originalEnv);
    await executePhase(command, ['stop', target.apiContainer], { phase: 'stop_current_api', env: commandEnv });
    await executePhase(command, ['rename', target.apiContainer, sealedName], { phase: 'seal_current_api', env: commandEnv });
    const createArgs = buildReplacementCreateArgs({ manifest: target, envFile: target.envFile, currentApi: readbacks.api });
    replacementCreated = true;
    await executePhase(command, createArgs, { phase: 'create_replacement_api', env: commandEnv });
    await executePhase(command, ['network', 'connect', target.providerNetwork, target.apiContainer], { phase: 'attach_provider_network', env: commandEnv });
    const replacement = await executePhase(command, ['inspect', '--format', '{{json .}}', target.apiContainer], { phase: 'replacement_config_readback', env: commandEnv });
    const replacementRecord = oneRecord(parseJson(replacement.stdout, 'replacement_inspect_invalid'));
    if (!sameExceptAuthFlag(readbacks.api, replacementRecord)) fail('replacement_config_drift');
    assertExactContainerNetworks(replacementRecord, target, 'replacement_network_inventory_invalid');
    const startResult = await executePhase(command, ['start', target.apiContainer], { phase: 'start_replacement_api', env: commandEnv });
    if (startResult?.code !== 0) fail('start_replacement_api_failed');
    await runBoundedStartupProbe(command, target.apiContainer, commandEnv);
    await command('docker', ['exec', target.apiContainer, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/version'); const p=await r.json(); if(r.status!==200 || p.commit!==process.env.APP_COMMIT || p.environment!=='staging') process.exit(1)"], { phase: 'replacement_version_probe', env: commandEnv });
    const replacementFlags = await executePhase(command, ['exec', target.apiContainer, 'node', '--input-type=module', '-e', "process.stdout.write(JSON.stringify(Object.fromEntries(['DEPLOYMENT_ENVIRONMENT','FIREBASE_AUTH_ENABLED','FIREBASE_PHONE_VERIFICATION_ENABLED','PAYMENT_TRANSPORT','STRIPE_LIVEMODE','SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED'].map((name)=>[name,process.env[name]??null])))"], { phase: 'replacement_runtime_flags', env: commandEnv });
    assertRuntimeReadback({ version: { commit: target.runtimeRevision, environment: activatedEnvironment }, flags: parseJson(replacementFlags.stdout, 'replacement_runtime_flags_invalid'), manifest: target, expectedAuth: activatedAuth, expectedEnvironment: activatedEnvironment });
    await executePhase(command, ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', target.databaseUser, '-d', target.databaseName, '-Atc', 'SELECT 1'], { phase: 'replacement_database_probe', env: commandEnv });
    const invalidToken = await executePhase(command, ['exec', target.apiContainer, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/v1/auth/social',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:'synthetic-invalid-token'})}); const p=await r.json(); process.stdout.write(JSON.stringify({status:r.status,code:p.code})); if(r.status!==401 || p.code!=='invalid_social_token') process.exit(1)"], { phase: 'replacement_invalid_social_token_probe', env: commandEnv });
    const invalidTokenPayload = parseJson(invalidToken.stdout, 'replacement_invalid_social_token_probe_invalid');
    if (invalidTokenPayload.status !== 401 || invalidTokenPayload.code !== 'invalid_social_token') fail('replacement_invalid_social_token_probe_invalid');
    return Object.freeze({ status: 'activated-awaiting-device-smoke', firstIrreversiblePhase: 'atomic_env_enable', sealedName, requiresFinalDeviceSmoke: true });
  } catch (error) {
    if (replacementCreated) error.candidateState = await captureCandidateState(command, target.apiContainer, commandEnv);
    error.rollback = await rollback({ manifest: target, originalEnv, originalReadbacks: readbacks, command, commandEnv, sealedName, replacementCreated });
    throw error;
  }
}

async function cleanupRehearsal({ command, commandEnv, candidate, probe, databaseCandidate, rehearsalEnvFile, databaseEnvFile, dumpFile, network, databaseVolume, uploadsVolume }) {
  const results = [];
  const safeCommand = async (args, phase) => {
    try { return await command('docker', args, { phase, env: commandEnv, allowFailure: true }); }
    catch (error) { results.push({ phase, ok: false, code: error?.code ?? 'cleanup_command_failed' }); return null; }
  };
  try {
    for (const [name, removePhase, absencePhase] of [[candidate, 'rehearsal_candidate_remove', 'rehearsal_candidate_absence'], [probe, 'rehearsal_probe_remove', 'rehearsal_probe_absence']]) {
      const removed = await safeCommand(['rm', '--force', name], removePhase);
      const absent = await safeCommand(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], absencePhase);
      const absentOk = absent?.code === 0 && (absent.stdout ?? '').trim() === '';
      const removeOk = removed?.code === 0 || absentOk;
      results.push({ phase: removePhase, ok: removeOk, ...(removeOk ? {} : { code: removed?.code ?? 'nonzero' }) });
      results.push({ phase: absencePhase, ok: absentOk, ...(absentOk ? {} : { code: absent?.code ?? 'candidate_present' }) });
    }
    for (const [name, phase] of [[databaseCandidate, 'rehearsal_database_remove'], [databaseVolume, 'rehearsal_database_volume_remove'], [uploadsVolume, 'rehearsal_uploads_volume_remove'], [network, 'rehearsal_network_remove']]) {
      const removeArgs = phase === 'rehearsal_network_remove' ? ['network', 'rm', name] : phase.includes('volume') ? ['volume', 'rm', name] : ['rm', '--force', name];
      const removed = await safeCommand(removeArgs, phase);
      results.push({ phase, ok: removed?.code === 0, ...(removed?.code === 0 ? {} : { code: removed?.code ?? 'nonzero' }) });
    }
    for (const [args, phase] of [
      [['ps', '--all', '--filter', `name=^/${databaseCandidate}$`, '--format', '{{.Names}}'], 'rehearsal_database_absence'],
      [['volume', 'ls', '--filter', `name=^${databaseVolume}$`, '--format', '{{.Name}}'], 'rehearsal_database_volume_absence'],
      [['volume', 'ls', '--filter', `name=^${uploadsVolume}$`, '--format', '{{.Name}}'], 'rehearsal_uploads_volume_absence'],
      [['network', 'ls', '--filter', `name=^${network}$`, '--format', '{{.Name}}'], 'rehearsal_network_absence'],
    ]) {
      const absent = await safeCommand(args, phase);
      const ok = absent?.code === 0 && (absent.stdout ?? '').trim() === '';
      results.push({ phase, ok, ...(ok ? {} : { code: absent?.code ?? 'resource_present' }) });
    }
    await unlink(rehearsalEnvFile).catch(() => {});
    await unlink(databaseEnvFile).catch(() => {});
    await unlink(dumpFile).catch(() => {});
    let envAbsent = false;
    try { await lstat(rehearsalEnvFile); } catch (error) { envAbsent = error?.code === 'ENOENT'; }
    results.push({ phase: 'rehearsal_env_absence', ok: envAbsent, ...(envAbsent ? {} : { code: 'rehearsal_env_present' }) });
    for (const [file, phase] of [[databaseEnvFile, 'rehearsal_database_env_absence'], [dumpFile, 'rehearsal_dump_absence']]) {
      let absentFile = false;
      try { await lstat(file); } catch (error) { absentFile = error?.code === 'ENOENT'; }
      results.push({ phase, ok: absentFile, ...(absentFile ? {} : { code: 'rehearsal_file_present' }) });
    }
    return Object.freeze({ cleaned: results.every((entry) => entry.ok), results: Object.freeze(results) });
  } catch (error) {
    results.push({ phase: 'rehearsal_cleanup', ok: false, code: error?.code ?? 'cleanup_failed' });
    return Object.freeze({ cleaned: false, results: Object.freeze(results) });
  }
}

function replaceEnvValue(content, name, value) {
  const expression = new RegExp(`^([ \\t]*${name}=)[^\\r\\n]*(\\r?\\n|$)`, 'mu');
  if (!expression.test(content)) fail(`rehearsal_env_${name.toLowerCase()}_missing`);
  return content.replace(expression, `$1${value}$2`);
}

function replaceOrAppendEnvValue(content, name, value) {
  const expression = new RegExp(`^([ \\t]*${name}=)[^\\r\\n]*(\\r?\\n|$)`, 'mu');
  if (expression.test(content)) return content.replace(expression, `$1${value}$2`);
  return `${content.replace(/\\n?$/u, '')}\n${name}=${value}\n`;
}

function isolatedCandidateMounts(currentApi, uploadsVolume) {
  return (currentApi.Mounts ?? []).map((mount) => mount.Destination === '/data/uploads'
    ? { ...mount, Name: uploadsVolume, Source: uploadsVolume }
    : mount);
}

function assertExactNetworks(record, expected, code) {
  const actual = Object.keys(record?.NetworkSettings?.Networks ?? {}).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) fail(code);
}

function sameExceptIsolatedOverrides(left, right) {
  const a = normalizedConfig(left);
  const b = normalizedConfig(right);
  for (const config of [a, b]) {
    config.mounts = config.mounts.map((mount) => mount.Destination === '/data/uploads'
      ? { ...mount, Name: '<isolated-uploads>', Source: '<isolated-uploads>' } : mount);
    config.security.networkMode = '<isolated-network>';
  }
  const envA = envMap(left?.Config?.Env);
  const envB = envMap(right?.Config?.Env);
  for (const name of ['FIREBASE_AUTH_ENABLED', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'IDENTITY_VERIFICATION_TRANSPORT', 'PUSH_TRANSPORT', 'MAIL_TRANSPORT', 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', 'SIT_LISTING_AI_PROVIDER', 'SIT_LISTING_AI_BUDGET_CENTS', 'TECHNICAL_SANDBOX_ENABLED', 'TECHNICAL_SANDBOX_KILL_SWITCH']) {
    delete envA[name]; delete envB[name];
  }
  return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(envA) === JSON.stringify(envB);
}

const isolatedPrestartProbeScript = "const safeCode=(value,fallback)=>typeof value==='string' && /^[a-z0-9_]{1,64}$/u.test(value)?value:fallback; let stage='config'; let pool=null; let result={stage,ok:false,code:'probe_not_run',errorType:'unknown'}; try { await import('/app/src/config.js'); result={stage,ok:true,code:'ok',errorType:'none'}; stage='database'; const db=await import('/app/src/db.js'); pool=db.pool; await db.initializeDatabase(); result={stage,ok:true,code:'ok',errorType:'none'}; stage='mailer'; const mail=await import('/app/src/mailer.js'); const mailStatus=await mail.verifyMailer(); if(mailStatus==='error') throw Object.assign(new Error(),{code:'mailer_verify_failed'}); result={stage,ok:true,code:'ok',errorType:'none'}; stage='database_close'; await pool.end(); pool=null; result={stage:'complete',ok:true,code:'ok',errorType:'none'}; } catch(error) { result={stage,ok:false,code:safeCode(error?.code,`${stage}_probe_failed`),errorType:error?.code?'operational':'unknown'}; } finally { if(pool) await pool.end().catch(()=>{}); } process.stdout.write(JSON.stringify(result)); if(!result.ok) process.exit(1);";

function parseIsolatedPrestartProbe(stdout, code = 'rehearsal_prestart_probe_output_invalid') {
  let value;
  try { value = JSON.parse(stdout?.trim() ?? ''); } catch { fail(code); }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.stage !== 'string' || !/^[a-z_]{1,32}$/u.test(value.stage)
      || typeof value.ok !== 'boolean'
      || typeof value.code !== 'string' || !/^[a-z0-9_]{1,64}$/u.test(value.code)
      || typeof value.errorType !== 'string' || !/^[a-z_]{1,32}$/u.test(value.errorType)) fail(code);
  return Object.freeze({ stage: value.stage, ok: value.ok, code: value.code, errorType: value.errorType });
}

export async function runGoogleAuthIsolatedRehearsal({ manifest, command = runCommand, commandEnv = process.env } = {}) {
  const target = assertGoogleAuthRuntimeManifest(manifest);
  if (typeof command !== 'function') fail('command_runner_required');
  if (commandEnv.STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL !== '1'
      || commandEnv.STAGING_GOOGLE_AUTH_CONFIRM !== target.runtimeRevision) fail('explicit_rehearsal_confirmation_required');
  const originalEnv = (await readProtectedEnvSnapshot(target)).content;
  const { readbacks } = await collectPreflight(target, command, commandEnv);
  const suffix = `${target.runtimeRevision.slice(0, 12)}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const candidate = `shareittoo-staging-api-google-auth-rehearsal-${suffix}`;
  const probe = `shareittoo-staging-api-google-auth-rehearsal-probe-${suffix}`;
  const isolatedNetwork = `sit-google-auth-rehearsal-network-${suffix}`;
  const databaseCandidate = `sit-google-auth-rehearsal-db-${suffix}`;
  const databaseVolume = `sit-google-auth-rehearsal-db-volume-${suffix}`;
  const uploadsVolume = `sit-google-auth-rehearsal-uploads-${suffix}`;
  const rehearsalEnvFile = `${target.envFile}.google-auth-rehearsal-${suffix}`;
  const databaseEnvFile = `${target.envFile}.google-auth-rehearsal-db-${suffix}`;
  const dumpFile = `${target.envFile}.google-auth-rehearsal-${suffix}.dump`;
  const rehearsalManifest = Object.freeze({ ...target, envFile: rehearsalEnvFile });
  try {
    await executePhase(command, ['network', 'create', '--internal', '--label', 'com.shareittoo.sit.google-auth-rehearsal=true', isolatedNetwork], { phase: 'rehearsal_network_create', env: commandEnv });
    await executePhase(command, ['volume', 'create', '--label', 'com.shareittoo.sit.google-auth-rehearsal=true', databaseVolume], { phase: 'rehearsal_database_volume_create', env: commandEnv });
    await executePhase(command, ['volume', 'create', '--label', 'com.shareittoo.sit.google-auth-rehearsal=true', uploadsVolume], { phase: 'rehearsal_uploads_volume_create', env: commandEnv });
    const databaseEnvContent = `${(readbacks.database?.Config?.Env ?? []).join('\n')}\n`;
    await atomicReplace(databaseEnvContent, Object.freeze({ ...target, envFile: databaseEnvFile }));
    await executePhase(command, ['exec', target.databaseContainer, 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '-U', target.databaseUser, '-d', target.databaseName], { phase: 'rehearsal_database_dump', env: commandEnv, stdoutFile: dumpFile });
    const databaseImage = readbacks.database?.Config?.Image;
    if (typeof databaseImage !== 'string' || !databaseImage) fail('rehearsal_database_image_missing');
    await executePhase(command, ['create', '--name', databaseCandidate, '--network', isolatedNetwork, '--env-file', databaseEnvFile, '--mount', `type=volume,src=${databaseVolume},dst=/var/lib/postgresql/data`, databaseImage], { phase: 'rehearsal_database_create', env: commandEnv });
    await executePhase(command, ['start', databaseCandidate], { phase: 'rehearsal_database_start', env: commandEnv });
    await executePhase(command, ['exec', databaseCandidate, 'sh', '-c', `for i in $(seq 1 30); do pg_isready -U '${target.databaseUser}' -d '${target.databaseName}' && exit 0; sleep 1; done; exit 1`], { phase: 'rehearsal_database_ready', env: commandEnv });
    await executePhase(command, ['exec', '-i', databaseCandidate, 'pg_restore', '-U', target.databaseUser, '-d', target.databaseName, '--no-owner', '--no-acl'], { phase: 'rehearsal_database_restore', env: commandEnv, inputFile: dumpFile });
    await atomicReplace(originalEnv, rehearsalManifest);
    await setActivationFlags(rehearsalManifest, originalEnv);
    const databaseUrl = new URL(envMap(readbacks.api.Config.Env).DATABASE_URL);
    databaseUrl.hostname = databaseCandidate;
    databaseUrl.port = '5432';
    databaseUrl.pathname = `/${target.databaseName}`;
    let isolatedEnv = await readFile(rehearsalEnvFile, 'utf8');
    isolatedEnv = replaceEnvValue(isolatedEnv, 'DATABASE_URL', databaseUrl.toString());
    for (const [name, value] of [
      ['PAYMENT_TRANSPORT', 'memory'], ['STRIPE_LIVEMODE', 'false'],
      ['IDENTITY_VERIFICATION_TRANSPORT', 'disabled'], ['PUSH_TRANSPORT', 'memory'],
      ['MAIL_TRANSPORT', 'disabled'], ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '0'],
      ['SIT_LISTING_AI_PROVIDER', 'mock'], ['SIT_LISTING_AI_BUDGET_CENTS', '0'],
      ['TECHNICAL_SANDBOX_ENABLED', '0'], ['TECHNICAL_SANDBOX_KILL_SWITCH', '1'],
    ]) isolatedEnv = replaceOrAppendEnvValue(isolatedEnv, name, value);
    await atomicReplace(isolatedEnv, rehearsalManifest);
    const candidateMounts = isolatedCandidateMounts(readbacks.api, uploadsVolume);
    const probeCreateArgs = buildReplacementCreateArgs({ manifest: target, envFile: rehearsalEnvFile, currentApi: readbacks.api, containerName: probe, networkName: isolatedNetwork, mounts: candidateMounts, commandOverride: ['node', '--input-type=module', '-e', isolatedPrestartProbeScript] });
    await executePhase(command, probeCreateArgs, { phase: 'rehearsal_probe_create', env: commandEnv });
    await executePhase(command, ['start', probe], { phase: 'rehearsal_probe_start', env: commandEnv });
    const probeWait = await executePhase(command, ['wait', probe], { phase: 'rehearsal_probe_wait', env: commandEnv });
    const probeLogs = await executePhase(command, ['logs', probe], { phase: 'rehearsal_probe_logs', env: commandEnv });
    const probeDiagnostic = parseIsolatedPrestartProbe(probeLogs.stdout);
    if (probeWait.stdout?.trim() !== '0' || probeDiagnostic.ok !== true) {
      const error = new Error('Staging Google Auth activation failed: rehearsal_prestart_probe_failed');
      error.code = 'rehearsal_prestart_probe_failed';
      error.probeDiagnostic = probeDiagnostic;
      throw error;
    }
    await executePhase(command, ['rm', '--force', probe], { phase: 'rehearsal_probe_remove', env: commandEnv });
    const probeAbsent = await executePhase(command, ['ps', '--all', '--filter', `name=^/${probe}$`, '--format', '{{.Names}}'], { phase: 'rehearsal_probe_absence', env: commandEnv });
    if ((probeAbsent.stdout ?? '').trim() !== '') fail('rehearsal_probe_present');
    const createArgs = buildReplacementCreateArgs({ manifest: target, envFile: rehearsalEnvFile, currentApi: readbacks.api, containerName: candidate, networkName: isolatedNetwork, mounts: candidateMounts });
    await executePhase(command, createArgs, { phase: 'rehearsal_candidate_create', env: commandEnv });
    const inspect = await executePhase(command, ['inspect', '--format', '{{json .}}', candidate], { phase: 'rehearsal_config_readback', env: commandEnv });
    const candidateRecord = oneRecord(parseJson(inspect.stdout, 'rehearsal_config_readback_invalid'));
    if (!sameExceptIsolatedOverrides(readbacks.api, candidateRecord)) fail('rehearsal_config_drift');
    assertExactNetworks(candidateRecord, [isolatedNetwork], 'rehearsal_network_inventory_invalid');
    const started = await executePhase(command, ['start', candidate], { phase: 'rehearsal_candidate_start', env: commandEnv });
    if (started?.code !== 0) fail('rehearsal_candidate_start_failed');
    await runBoundedStartupProbe(command, candidate, commandEnv, 'rehearsal_startup_probe');
    const version = await executePhase(command, ['exec', candidate, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/version'); process.stdout.write(JSON.stringify(await r.json())); if(r.status!==200) process.exit(1)"], { phase: 'rehearsal_version_probe', env: commandEnv });
    const flags = await executePhase(command, ['exec', candidate, 'node', '--input-type=module', '-e', "process.stdout.write(JSON.stringify(Object.fromEntries(['DEPLOYMENT_ENVIRONMENT','FIREBASE_AUTH_ENABLED','FIREBASE_PHONE_VERIFICATION_ENABLED','PAYMENT_TRANSPORT','STRIPE_LIVEMODE','SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED'].map((name)=>[name,process.env[name]??null])))"], { phase: 'rehearsal_runtime_flags', env: commandEnv });
    assertRuntimeReadback({ version: parseJson(version.stdout, 'rehearsal_version_probe_invalid'), flags: parseJson(flags.stdout, 'rehearsal_runtime_flags_invalid'), manifest: target, expectedAuth: activatedAuth, expectedEnvironment: activatedEnvironment });
    await executePhase(command, ['exec', databaseCandidate, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', target.databaseUser, '-d', target.databaseName, '-Atc', 'SELECT 1'], { phase: 'rehearsal_database_probe', env: commandEnv });
    const invalidToken = await executePhase(command, ['exec', candidate, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:8080/v1/auth/social',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:'synthetic-invalid-token'})}); const p=await r.json(); process.stdout.write(JSON.stringify({status:r.status,code:p.code})); if(r.status!==401 || p.code!=='invalid_social_token') process.exit(1)"], { phase: 'rehearsal_invalid_social_token_probe', env: commandEnv });
    const invalidTokenPayload = parseJson(invalidToken.stdout, 'rehearsal_invalid_social_token_probe_invalid');
    if (invalidTokenPayload.status !== 401 || invalidTokenPayload.code !== 'invalid_social_token') fail('rehearsal_invalid_social_token_probe_invalid');
    if ((await readFile(target.envFile, 'utf8')) !== originalEnv) fail('canonical_env_changed');
    const canonicalApiAfter = await executePhase(command, ['inspect', '--format', '{{json .}}', target.apiContainer], { phase: 'rehearsal_canonical_api_after', env: commandEnv });
    const canonicalApiRecord = oneRecord(parseJson(canonicalApiAfter.stdout, 'rehearsal_canonical_api_after_invalid'));
    if (!sameExceptAuthFlag(readbacks.api, canonicalApiRecord)) fail('canonical_api_changed');
    assertExactContainerNetworks(canonicalApiRecord, target, 'canonical_network_changed');
    const cleanup = await cleanupRehearsal({ command, commandEnv, candidate, probe, databaseCandidate, rehearsalEnvFile, databaseEnvFile, dumpFile, network: isolatedNetwork, databaseVolume, uploadsVolume });
    if (!cleanup.cleaned) fail('rehearsal_cleanup_failed');
    return Object.freeze({ status: 'isolated-rehearsal-passed', candidate, cleanup: cleanup.results, canonicalUntouched: true });
  } catch (error) {
    error.candidateState = await captureCandidateState(command, candidate, commandEnv);
    error.rehearsalCleanup = await cleanupRehearsal({ command, commandEnv, candidate, probe, databaseCandidate, rehearsalEnvFile, databaseEnvFile, dumpFile, network: isolatedNetwork, databaseVolume, uploadsVolume });
    throw error;
  }
}

export async function readGoogleAuthRuntimeManifest(filePath) {
  safeExternalPath(filePath, 'manifest_path_invalid');
  let raw;
  try {
    raw = readStablePrivateFile(filePath, { expectedMode: 0o600, minBytes: 1, code: 'manifest_metadata_invalid' });
  } catch (error) {
    if (error?.code === 'manifest_metadata_invalid') throw error;
    fail(error?.code === 'ELOOP' ? 'manifest_symlink_forbidden' : 'manifest_unreadable');
  }
  return assertGoogleAuthRuntimeManifest(JSON.parse(raw));
}

export function sanitizeActivationError(error) {
  const output = { status: 'failed', code: error?.code ?? 'staging_google_auth_activation_failed' };
  if (error?.failurePhase) output.failurePhase = String(error.failurePhase);
  if (error?.failureExitCode !== undefined && error.failureExitCode !== null) output.failureExitCode = Number(error.failureExitCode);
  if (error?.candidateState) output.candidateState = sanitizeCandidateState(error.candidateState);
  if (error?.probeDiagnostic) output.probeDiagnostic = sanitizeProbeDiagnostic(error.probeDiagnostic);
  if (error?.rollback) output.rollback = {
    restored: error.rollback.restored === true,
    results: (error.rollback.results ?? []).map((entry) => ({
      phase: String(entry.phase ?? 'rollback'), ok: entry.ok === true, ...(entry.code ? { code: String(entry.code) } : {}),
    })),
  };
  return output;
}

async function main() {
  const manifest = await readGoogleAuthRuntimeManifest(process.env.STAGING_GOOGLE_AUTH_RUNTIME_MANIFEST ?? '');
  const result = process.env.STAGING_GOOGLE_AUTH_MODE === 'isolated-rehearsal'
    ? await runGoogleAuthIsolatedRehearsal({ manifest })
    : await runGoogleAuthActivation({ manifest, execute: process.env.STAGING_GOOGLE_AUTH_EXECUTE === '1' });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify(sanitizeActivationError(error))}\n`);
    process.exitCode = 1;
  }
}
