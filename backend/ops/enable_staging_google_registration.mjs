#!/usr/bin/env node

import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertGoogleAuthRuntimeManifest,
  buildReplacementCreateArgs,
  readGoogleAuthRuntimeManifest,
  runBoundedStartupProbe,
  runCommand,
} from './activate_staging_google_auth.mjs';
import { readStablePrivateFile } from './stable_private_file.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requiredTerminalMigration = '095_staging_google_registration_replays.up.sql';
const requiredMigrationLedger = 'b31bd8054569f851a4fed0798fb0d8b971282256461e764529564cd14d2e802f';
const registrationEnabledKey = 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED';
const registrationAllowlistKey = 'SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST';
const allowedUserIdsKey = 'SIT_STAGING_ALLOWED_USER_IDS';
const apiContainer = 'shareittoo-staging-api';

function fail(code) {
  const error = new Error(`Staging Google registration enable failed: ${code}`);
  error.code = code;
  throw error;
}

function safeExternalPath(value, code) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.startsWith(`${repositoryRoot}/`)) fail(code);
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) fail(code);
}

function envMap(entries) {
  const result = {};
  for (const entry of entries ?? []) {
    const index = String(entry).indexOf('=');
    if (index < 1) continue;
    result[String(entry).slice(0, index)] = String(entry).slice(index + 1);
  }
  return result;
}

function parseEnvContent(content, code = 'env_file_parse_invalid') {
  const values = {};
  for (const line of String(content).split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || Object.hasOwn(values, match[1])) fail(code);
    values[match[1]] = match[2];
  }
  return values;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizedMounts(mounts) {
  return (mounts ?? []).map((mount) => ({
    Type: mount.Type ?? null,
    Name: mount.Name ?? null,
    Source: mount.Source ?? null,
    Destination: mount.Destination ?? null,
    RW: mount.RW !== false,
  })).sort((left, right) => String(left.Destination).localeCompare(String(right.Destination)));
}

function normalizedContainer(record, omitRegistrationEnv = false) {
  const config = record?.Config ?? {};
  const host = record?.HostConfig ?? {};
  const entries = envMap(config.Env);
  if (omitRegistrationEnv) {
    delete entries[registrationEnabledKey];
    delete entries[registrationAllowlistKey];
  }
  return {
    image: config.Image ?? '',
    cmd: config.Cmd ?? null,
    entrypoint: config.Entrypoint ?? null,
    workingDir: config.WorkingDir ?? '',
    user: config.User ?? '',
    tty: config.Tty === true,
    openStdin: config.OpenStdin === true,
    labels: sortedObject(config.Labels),
    env: sortedObject(entries),
    host: {
      GroupAdd: [...(host.GroupAdd ?? [])].sort(),
      RestartPolicy: host.RestartPolicy ?? null,
      PortBindings: host.PortBindings ?? null,
      NetworkMode: host.NetworkMode ?? '',
      Privileged: host.Privileged === true,
      ReadonlyRootfs: host.ReadonlyRootfs === true,
      SecurityOpt: [...(host.SecurityOpt ?? [])].sort(),
      NoNewPrivileges: host.NoNewPrivileges === true,
      CapAdd: [...(host.CapAdd ?? [])].sort(),
      CapDrop: [...(host.CapDrop ?? [])].sort(),
      Devices: host.Devices ?? [],
      DeviceRequests: host.DeviceRequests ?? [],
      Ulimits: host.Ulimits ?? [],
      OomKillDisable: host.OomKillDisable === true,
      Tmpfs: sortedObject(host.Tmpfs),
      CgroupnsMode: host.CgroupnsMode ?? '',
      Runtime: host.Runtime ?? '',
      Isolation: host.Isolation ?? '',
      AutoRemove: host.AutoRemove === true,
      Dns: [...(host.Dns ?? [])].sort(),
      DnsSearch: [...(host.DnsSearch ?? [])].sort(),
      ExtraHosts: [...(host.ExtraHosts ?? [])].sort(),
      IpcMode: host.IpcMode ?? '',
      PidMode: host.PidMode ?? '',
      UsernsMode: host.UsernsMode ?? '',
      ShmSize: Number(host.ShmSize ?? 0),
      Init: host.Init === true,
      StopTimeout: Number(host.StopTimeout ?? 0),
      LogConfig: {
        Type: host.LogConfig?.Type ?? '',
        Config: sortedObject(host.LogConfig?.Config),
      },
    },
    mounts: normalizedMounts(record?.Mounts),
  };
}

function sameExceptRegistrationFlags(left, right) {
  return JSON.stringify(normalizedContainer(left, true)) === JSON.stringify(normalizedContainer(right, true));
}

function assertNoHostPort(record, code = 'host_port_forbidden') {
  if (Object.values(record?.HostConfig?.PortBindings ?? {}).flat().filter(Boolean).length > 0
      || Object.values(record?.NetworkSettings?.Ports ?? {}).flat().filter(Boolean).length > 0) fail(code);
}

function assertNetworks(record, manifest, code = 'network_inventory_invalid') {
  const actual = Object.keys(record?.NetworkSettings?.Networks ?? {}).sort();
  const expected = [manifest.network, manifest.providerNetwork].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code);
}

function assertImageReadback(record, manifest, code = 'image_readback_invalid') {
  const image = record?.Config?.Image ?? '';
  const labels = record?.Config?.Labels ?? {};
  const digests = record?.RepoDigests ?? [];
  if (image !== manifest.image
      || labels['org.opencontainers.image.revision'] !== manifest.runtimeRevision
      || (!digests.includes(`${manifest.image}@${manifest.imageDigest}`)
        && !digests.some((entry) => entry.endsWith(`@${manifest.imageDigest}`)))) fail(code);
}

function assertReplacementImageReadback(record, manifest, code = 'replacement_image_readback_invalid') {
  const image = record?.Config?.Image ?? '';
  const accepted = new Set([manifest.image, `${manifest.image}@${manifest.imageDigest}`]);
  const digests = record?.RepoDigests ?? [];
  if (!accepted.has(image)
      || (!digests.includes(`${manifest.image}@${manifest.imageDigest}`)
        && !digests.some((entry) => entry.endsWith(`@${manifest.imageDigest}`)))) fail(code);
}

function assertRuntimeFlags(flags, expectedRegistration, mappingDigest = null, code = 'runtime_flags_invalid') {
  if (flags?.DEPLOYMENT_ENVIRONMENT !== 'staging'
      || flags?.FIREBASE_AUTH_ENABLED !== 'true'
      || flags?.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || flags?.PAYMENT_TRANSPORT !== 'memory'
      || flags?.STRIPE_LIVEMODE !== 'false'
      || flags?.SIT_STAGING_ACCESS_GATE_ENABLED !== 'true') fail(code);
  if (expectedRegistration !== null && Object.hasOwn(flags ?? {}, registrationEnabledKey)
      && flags[registrationEnabledKey] !== expectedRegistration) fail(code);
  if (expectedRegistration !== null && Object.hasOwn(flags ?? {}, registrationAllowlistKey)
      && flags[registrationAllowlistKey] !== (expectedRegistration ? 'present' : 'absent')) fail(code);
  if (expectedRegistration === true && mappingDigest !== null && flags.registrationAllowlistDigest !== undefined
      && flags.registrationAllowlistDigest !== mappingDigest) fail('registration_allowlist_readback_invalid');
}

function parseRegistrationConfigReadback(stdout, code = 'registration_config_readback_invalid') {
  let value;
  try { value = JSON.parse(String(stdout ?? '').trim()); } catch { fail(code); }
  exactKeys(value, [
    'enabled', 'allowlist', 'allowlistDigest', 'allowlistEntryCount', 'accessGateEnabled',
  ], code);
  if (typeof value.enabled !== 'boolean' || typeof value.allowlist !== 'string'
      || typeof value.allowlistDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(value.allowlistDigest)
      || !Number.isInteger(value.allowlistEntryCount) || value.allowlistEntryCount < 0
      || typeof value.accessGateEnabled !== 'boolean') fail(code);
  return value;
}

function parseSchemaLedger(stdout, code = 'migration_ledger_invalid') {
  if (String(stdout ?? '').trim() !== requiredMigrationLedger) fail(code);
  return requiredMigrationLedger;
}

function assertTerminalMigration(stdout, code = 'terminal_migration_invalid') {
  if (String(stdout ?? '').trim() !== requiredTerminalMigration) fail(code);
  return requiredTerminalMigration;
}

function readRegistrationMapping(filePath) {
  safeExternalPath(filePath, 'mapping_path_invalid');
  let content;
  try {
    content = readStablePrivateFile(filePath, { expectedMode: 0o600, minBytes: 1, maxBytes: 256, code: 'mapping_metadata_invalid' });
  } catch (error) {
    if (error?.code === 'mapping_metadata_invalid') throw error;
    fail(error?.code === 'ELOOP' ? 'mapping_symlink_forbidden' : 'mapping_unreadable');
  }
  if (!/^[0-9a-f]{64}=[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}\n?$/u.test(content)
      || /@|(?:email|subject|firebase|token|uid\s*=)/iu.test(content)) fail('mapping_plaintext_or_shape_invalid');
  const line = content.endsWith('\n') ? content.slice(0, -1) : content;
  const separator = line.indexOf('=');
  const digest = line.slice(0, separator);
  const userId = line.slice(separator + 1);
  return Object.freeze({
    content,
    digest,
    userId,
    mappingDigest: sha256(line),
  });
}

function allowedUserIds(value) {
  return String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function assertPreState({ values, api, manifest, mapping }) {
  if (api?.Name?.replace(/^\//u, '') !== manifest.apiContainer || manifest.apiContainer !== apiContainer
      || api?.State?.Running !== true) fail('api_container_pre_state_invalid');
  assertNoHostPort(api, 'api_host_port_forbidden');
  if (api?.Config?.Image !== manifest.image) fail('api_image_pre_state_invalid');
  if (api?.Config?.User !== 'shareittoo' || !(api?.HostConfig?.GroupAdd ?? []).map(String).includes('65532')) fail('api_identity_pre_state_invalid');
  if (api?.Config?.Labels?.[manifest.label.key] !== manifest.label.value) fail('api_green_label_pre_state_invalid');
  const expectedMounts = manifest.mounts.map((mount) => ({
    Type: mount.type, Name: mount.type === 'volume' ? mount.name : null, Source: mount.source,
    Destination: mount.destination, RW: mount.readOnly !== true,
  })).sort((left, right) => left.Destination.localeCompare(right.Destination));
  if (JSON.stringify(normalizedMounts(api.Mounts)) !== JSON.stringify(expectedMounts)) fail('api_mount_pre_state_invalid');
  assertNetworks(api, manifest, 'api_network_pre_state_invalid');
  if (values.DEPLOYMENT_ENVIRONMENT !== 'staging'
      || values.FIREBASE_AUTH_ENABLED !== 'true'
      || values.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || values.PAYMENT_TRANSPORT !== 'memory'
      || values.STRIPE_LIVEMODE !== 'false'
      || values.SIT_STAGING_ACCESS_GATE_ENABLED !== 'true') fail('runtime_pre_state_invalid');
  const enabled = values[registrationEnabledKey];
  if (enabled !== undefined && enabled !== '' && enabled !== 'false') fail('registration_not_disabled_pre_state');
  if (values[registrationAllowlistKey] !== undefined && values[registrationAllowlistKey] !== '') fail('registration_allowlist_not_empty_pre_state');
  if (values.SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER !== undefined
      && values.SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER !== ''
      && values.SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER !== 'google') fail('registration_provider_pre_state_invalid');
  if (!allowedUserIds(values[allowedUserIdsKey]).includes(mapping.userId)) fail('mapping_target_not_access_allowed');
}

function replaceEnvKey(content, name, value) {
  const expression = new RegExp(`^([ \\t]*${name}=)[^\\r\\n]*(\\r?\\n|$)`, 'mu');
  if (expression.test(content)) return content.replace(expression, `$1${value}$2`);
  const ending = content.endsWith('\n') || content.endsWith('\r') ? '' : '\n';
  return `${content}${ending}${name}=${value}\n`;
}

function registrationEnabledValue(content) {
  return parseEnvContent(content)[registrationEnabledKey];
}

async function atomicReplace(content, manifest) {
  const temporary = `${manifest.envFile}.google-registration-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`;
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
    const parent = await open(dirname(manifest.envFile), fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try { await parent.sync(); } finally { await parent.close(); }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function readEnv(manifest) {
  try {
    const content = readStablePrivateFile(manifest.envFile, { expectedMode: 0o600, minBytes: 1, code: 'env_file_metadata_invalid' });
    return Object.freeze({ content, values: parseEnvContent(content) });
  } catch (error) {
    if (error?.code === 'env_file_metadata_invalid') throw error;
    fail(error?.code === 'ELOOP' ? 'env_file_symlink_forbidden' : 'env_file_unreadable');
  }
}

export function buildGoogleRegistrationPreflightCommands(manifest) {
  const inspect = (name, phase) => ({ phase, command: 'docker', args: ['inspect', '--format', '{{json .}}', name] });
  const dbExec = (phase, sql) => ({ phase, command: 'docker', args: ['exec', manifest.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', manifest.databaseUser, '-d', manifest.databaseName, '-Atc', sql] });
  const runtimeProbe = (phase, expression) => ({ phase, command: 'docker', args: ['exec', manifest.apiContainer, 'node', '--input-type=module', '-e', expression] });
  return Object.freeze([
    inspect(manifest.apiContainer, 'current_api_inspect'),
    inspect(manifest.databaseContainer, 'current_database_inspect'),
    inspect(manifest.databaseVolume, 'current_database_volume_inspect'),
    inspect(manifest.network, 'current_network_inspect'),
    inspect(manifest.providerNetwork, 'current_provider_network_inspect'),
    inspect(manifest.uploadsVolume, 'current_uploads_volume_inspect'),
    { phase: 'current_image_inspect', command: 'docker', args: ['image', 'inspect', '--format', '{{json .}}', manifest.image] },
    { phase: 'sealed_name_conflict_check', command: 'docker', args: ['ps', '--all', '--filter', `name=^/${manifest.apiContainer}-google-registration-rollback-${manifest.runtimeRevision.slice(0, 12)}$`, '--format', '{{.Names}}'] },
    dbExec('current_database_probe', 'SELECT 1'),
    dbExec('current_schema_migration_readback', 'SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'),
    { phase: 'current_migration_ledger_readback', command: 'docker', args: ['exec', manifest.databaseContainer, 'sh', '-c', `set -eu; psql -X --set ON_ERROR_STOP=1 -U '${manifest.databaseUser}' -d '${manifest.databaseName}' -Atc "SELECT string_agg(name || '|' || checksum, E'\\n' ORDER BY name) FROM schema_migrations" | sha256sum | awk '{print $1}'`] },
    runtimeProbe('current_live_probe', "const r=await fetch('http://127.0.0.1:8080/health/live'); process.stdout.write(JSON.stringify({status:r.status,payload:await r.json()})); if(r.status!==200) process.exit(1)"),
    runtimeProbe('current_ready_probe', "const r=await fetch('http://127.0.0.1:8080/health/ready'); process.stdout.write(JSON.stringify({status:r.status,payload:await r.json()})); if(r.status!==200) process.exit(1)"),
    runtimeProbe('current_version_probe', "const r=await fetch('http://127.0.0.1:8080/version'); process.stdout.write(JSON.stringify(await r.json())); if(r.status!==200) process.exit(1)"),
    runtimeProbe('current_runtime_flags', `const names=['DEPLOYMENT_ENVIRONMENT','FIREBASE_AUTH_ENABLED','FIREBASE_PHONE_VERIFICATION_ENABLED','PAYMENT_TRANSPORT','STRIPE_LIVEMODE','SIT_STAGING_ACCESS_GATE_ENABLED']; const values=Object.fromEntries(names.map((name)=>[name,process.env[name]??null])); values.${registrationEnabledKey} = process.env.${registrationEnabledKey} === 'true'; values.${registrationAllowlistKey} = process.env.${registrationAllowlistKey} ? 'present' : 'absent'; process.stdout.write(JSON.stringify(values));`),
    runtimeProbe('current_registration_config_probe', `import crypto from 'node:crypto'; const raw=process.env.${registrationAllowlistKey}??''; process.stdout.write(JSON.stringify({enabled:process.env.${registrationEnabledKey}==='true',allowlist:raw?'present':'absent',allowlistDigest:crypto.createHash('sha256').update(raw).digest('hex'),allowlistEntryCount:raw?raw.split(',').length:0,accessGateEnabled:process.env.SIT_STAGING_ACCESS_GATE_ENABLED==='true'}));`),
  ]);
}

function parseJson(stdout, code) {
  try { return JSON.parse(String(stdout ?? '').trim()); } catch { fail(code); }
}

function assertHealthPayload(stdout, code) {
  const result = parseJson(stdout, code);
  if (result.status !== 200) fail(code);
  return result.payload;
}

async function collectPreflight(manifest, command, mapping, originalEnv) {
  const entries = buildGoogleRegistrationPreflightCommands(manifest);
  const readbacks = {};
  for (const entry of entries) {
    const result = await command(entry.command, entry.args, { phase: entry.phase });
    readbacks[entry.phase] = result?.stdout?.trim() ?? '';
    if (entry.phase === 'sealed_name_conflict_check' && readbacks[entry.phase]) fail('rollback_name_conflict');
    if (entry.phase === 'current_database_probe' && readbacks[entry.phase] !== '1') fail('database_probe_invalid');
    if (entry.phase === 'current_schema_migration_readback') assertTerminalMigration(readbacks[entry.phase], 'current_schema_migration_readback_invalid');
    if (entry.phase === 'current_migration_ledger_readback') parseSchemaLedger(readbacks[entry.phase]);
    if (entry.phase === 'current_live_probe') assertHealthPayload(readbacks[entry.phase], 'current_live_probe_invalid');
    if (entry.phase === 'current_ready_probe') assertHealthPayload(readbacks[entry.phase], 'current_ready_probe_invalid');
    if (entry.phase === 'current_version_probe') readbacks.version = parseJson(readbacks[entry.phase], 'current_version_probe_invalid');
    if (entry.phase === 'current_runtime_flags') readbacks.flags = parseJson(readbacks[entry.phase], 'current_runtime_flags_invalid');
    if (entry.phase === 'current_registration_config_probe') readbacks.registration = parseRegistrationConfigReadback(readbacks[entry.phase]);
    if (entry.phase === 'current_api_inspect') readbacks.api = parseJson(readbacks[entry.phase], 'api_inspect_invalid');
    if (entry.phase === 'current_database_inspect') readbacks.database = parseJson(readbacks[entry.phase], 'database_inspect_invalid');
    if (entry.phase === 'current_database_volume_inspect') readbacks.databaseVolume = parseJson(readbacks[entry.phase], 'database_volume_inspect_invalid');
    if (entry.phase === 'current_network_inspect') readbacks.network = parseJson(readbacks[entry.phase], 'network_inspect_invalid');
    if (entry.phase === 'current_provider_network_inspect') readbacks.providerNetwork = parseJson(readbacks[entry.phase], 'provider_network_inspect_invalid');
    if (entry.phase === 'current_uploads_volume_inspect') readbacks.uploads = parseJson(readbacks[entry.phase], 'uploads_inspect_invalid');
    if (entry.phase === 'current_image_inspect') readbacks.image = parseJson(readbacks[entry.phase], 'image_inspect_invalid');
  }
  if (readbacks.api?.Config?.Image !== manifest.image) fail('api_image_pre_state_invalid');
  assertImageReadback(readbacks.image, manifest);
  if (readbacks.database?.Name?.replace(/^\//u, '') !== manifest.databaseContainer || readbacks.database?.State?.Running !== true) fail('database_runtime_inventory_invalid');
  if (readbacks.databaseVolume?.Name !== manifest.databaseVolume) fail('database_volume_runtime_inventory_invalid');
  if (readbacks.network?.Name !== manifest.network || readbacks.network?.Internal !== true) fail('network_runtime_inventory_invalid');
  if (readbacks.providerNetwork?.Name !== manifest.providerNetwork) fail('provider_network_runtime_inventory_invalid');
  if (readbacks.uploads?.Name !== manifest.uploadsVolume) fail('uploads_volume_runtime_inventory_invalid');
  assertNoHostPort(readbacks.api);
  assertNetworks(readbacks.api, manifest);
  if (readbacks.api?.Config?.Labels?.[manifest.label.key] !== manifest.label.value) fail('api_green_label_invalid');
  if (readbacks.flags?.DEPLOYMENT_ENVIRONMENT !== 'staging' || readbacks.flags?.FIREBASE_AUTH_ENABLED !== 'true') fail('runtime_auth_pre_state_invalid');
  assertRuntimeFlags(readbacks.flags, false);
  if (readbacks.registration.enabled || readbacks.registration.allowlist !== 'absent' || readbacks.registration.allowlistEntryCount !== 0) fail('registration_not_disabled_pre_state');
  if (readbacks.registration.accessGateEnabled !== true) fail('access_gate_readback_invalid');
  if (readbacks.version?.commit !== manifest.runtimeRevision || readbacks.version?.environment !== 'staging') fail('version_readback_invalid');
  const values = parseEnvContent(originalEnv);
  assertPreState({ values, api: readbacks.api, manifest, mapping });
  const apiValues = envMap(readbacks.api.Config.Env);
  for (const [name, value] of Object.entries(values)) {
    if (apiValues[name] !== value) fail('env_file_container_drift');
  }
  return Object.freeze({ entries, readbacks });
}

async function applyRegistrationFlags(manifest, expectedEnv, mapping) {
  const current = await readEnv(manifest);
  if (current.content !== expectedEnv) fail('env_changed_since_preflight');
  if (registrationEnabledValue(current.content) !== undefined
      && registrationEnabledValue(current.content) !== ''
      && registrationEnabledValue(current.content) !== 'false') fail('registration_not_disabled_pre_state');
  let next = replaceEnvKey(current.content, registrationEnabledKey, 'true');
  next = replaceEnvKey(next, registrationAllowlistKey, `${mapping.digest}=${mapping.userId}`);
  await atomicReplace(next, manifest);
  return next;
}

async function safeCommand(command, args, phase, commandEnv) {
  try {
    const result = await command('docker', args, { phase, env: commandEnv, allowFailure: true });
    const ok = result?.code === undefined || result?.code === 0;
    return Object.freeze({ ok, result, phase, ...(ok ? {} : { code: result?.code ?? `${phase}_failed` }) });
  } catch (error) {
    return Object.freeze({ ok: false, phase, code: error?.code ?? `${phase}_failed` });
  }
}

async function rollback({ manifest, originalEnv, originalApi, command, commandEnv, sealedName, sealed, currentStopped, replacementCreated }) {
  const results = [];
  let ok = true;
  try {
    const current = await readEnv(manifest);
    if (current.content !== originalEnv) await atomicReplace(originalEnv, manifest);
    results.push({ phase: 'rollback_env_restore', ok: true });
  } catch (error) {
    results.push({ phase: 'rollback_env_restore', ok: false, code: error?.code ?? 'rollback_env_restore' });
    ok = false;
  }
  if (replacementCreated) {
    const removal = await safeCommand(command, ['rm', '--force', manifest.apiContainer], 'rollback_replacement_remove', commandEnv);
    results.push({ phase: removal.phase, ok: removal.ok, ...(removal.ok ? {} : { code: removal.code }) });
    ok &&= removal.ok;
  }
  if (sealed) {
    const verify = await safeCommand(command, ['ps', '--all', '--filter', `name=^/${manifest.apiContainer}$`, '--format', '{{.Names}}'], 'rollback_replacement_verify', commandEnv);
    const absent = verify.ok && !(verify.result?.stdout ?? '').trim();
    results.push({ phase: verify.phase, ok: absent, ...(absent ? {} : { code: 'replacement_present' }) });
    ok &&= absent;
    const renameResult = await safeCommand(command, ['rename', sealedName, manifest.apiContainer], 'rollback_restore_rename', commandEnv);
    results.push({ phase: renameResult.phase, ok: renameResult.ok, ...(renameResult.ok ? {} : { code: renameResult.code }) });
    ok &&= renameResult.ok;
    const startResult = await safeCommand(command, ['start', manifest.apiContainer], 'rollback_restore_start', commandEnv);
    results.push({ phase: startResult.phase, ok: startResult.ok, ...(startResult.ok ? {} : { code: startResult.code }) });
    ok &&= startResult.ok;
    if (ok) {
      try {
        const inspect = await command('docker', ['inspect', '--format', '{{json .}}', manifest.apiContainer], { phase: 'rollback_api_readback', env: commandEnv });
        const restored = parseJson(inspect.stdout, 'rollback_api_readback_invalid');
        if (!sameExceptRegistrationFlags(originalApi, restored)) fail('rollback_config_drift');
        assertNetworks(restored, manifest, 'rollback_network_inventory_invalid');
        assertNoHostPort(restored, 'rollback_host_port_forbidden');
        results.push({ phase: 'rollback_api_readback', ok: true });
        const startup = await runBoundedStartupProbe(command, manifest.apiContainer, commandEnv, 'rollback_public_runtime_probe', { deadlineMs: 100, retryDelayMs: 1 });
        assertRuntimeFlags(startup.flags, null);
        results.push({ phase: 'rollback_runtime_readback', ok: true });
      } catch (error) {
        results.push({ phase: 'rollback_runtime_readback', ok: false, code: error?.code ?? 'rollback_runtime_readback' });
        ok = false;
      }
    }
  }
  if (!sealed && currentStopped && ok) {
    const startResult = await safeCommand(command, ['start', manifest.apiContainer], 'rollback_original_start', commandEnv);
    results.push({ phase: startResult.phase, ok: startResult.ok, ...(startResult.ok ? {} : { code: startResult.code }) });
    ok &&= startResult.ok;
    if (ok) {
      try {
        const inspect = await command('docker', ['inspect', '--format', '{{json .}}', manifest.apiContainer], { phase: 'rollback_original_readback', env: commandEnv });
        const restored = parseJson(inspect.stdout, 'rollback_original_readback_invalid');
        if (!sameExceptRegistrationFlags(originalApi, restored)) fail('rollback_config_drift');
        assertNetworks(restored, manifest, 'rollback_network_inventory_invalid');
        assertNoHostPort(restored, 'rollback_host_port_forbidden');
        results.push({ phase: 'rollback_original_readback', ok: true });
      } catch (error) {
        results.push({ phase: 'rollback_original_readback', ok: false, code: error?.code ?? 'rollback_original_readback' });
        ok = false;
      }
    }
  }
  return Object.freeze({ restored: ok, results: Object.freeze(results) });
}

async function assertEvidenceTarget(filePath) {
  safeExternalPath(filePath, 'evidence_path_invalid');
  const directory = dirname(filePath);
  let parent;
  try { parent = await lstat(directory); } catch (error) { fail(error?.code === 'ENOENT' ? 'evidence_parent_missing' : 'evidence_parent_unreadable'); }
  const expectedUid = process.getuid?.();
  const expectedGid = process.getgid?.();
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700
      || expectedUid !== undefined && parent.uid !== expectedUid
      || expectedGid !== undefined && parent.gid !== expectedGid) fail('evidence_parent_unsafe');
  try {
    await lstat(filePath);
    fail('evidence_already_exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function writeEvidence(filePath, evidence) {
  await assertEvidenceTarget(filePath);
  const content = `${JSON.stringify(evidence)}\n`;
  let handle;
  let created = false;
  try {
    handle = await open(filePath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    created = true;
    await handle.writeFile(content, 'utf8');
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;
    const metadata = await lstat(filePath);
    const readback = readStablePrivateFile(filePath, { expectedMode: 0o600, minBytes: content.length, maxBytes: content.length, code: 'evidence_readback_invalid' });
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.size !== Buffer.byteLength(content)
        || readback !== content || sha256(readback) !== sha256(content)) fail('evidence_readback_invalid');
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (created) await unlink(filePath).catch(() => {});
    throw error;
  }
}

export async function runStagingGoogleRegistrationEnable({
  manifest,
  mappingFile,
  evidenceFile,
  command = runCommand,
  commandEnv = process.env,
  execute = false,
} = {}) {
  const target = assertGoogleAuthRuntimeManifest(manifest);
  if (typeof command !== 'function') fail('command_runner_required');
  if (target.apiContainer !== apiContainer) fail('target_api_container_invalid');
  const mapping = readRegistrationMapping(mappingFile);
  const original = await readEnv(target);
  const preflight = await collectPreflight(target, command, mapping, original.content);
  const confirmedMapping = readRegistrationMapping(mappingFile);
  if (confirmedMapping.content !== mapping.content) fail('mapping_changed_since_preflight');
  if (!execute) return Object.freeze({ status: 'preflight-passed-no-mutation', firstIrreversiblePhase: 'atomic_registration_enable', mappingDigest: mapping.mappingDigest, commands: Object.freeze(preflight.entries.map((entry) => entry.phase)) });
  if (commandEnv.STAGING_GOOGLE_REGISTRATION_EXECUTE !== '1'
      || commandEnv.STAGING_GOOGLE_REGISTRATION_CONFIRM !== target.runtimeRevision) fail('explicit_execute_confirmation_required');
  await assertEvidenceTarget(evidenceFile);
  const sealedName = `${target.apiContainer}-google-registration-rollback-${target.runtimeRevision.slice(0, 12)}`;
  let currentStopped = false;
  let sealed = false;
  let replacementCreated = false;
  try {
    await applyRegistrationFlags(target, original.content, mapping);
    await command('docker', ['stop', target.apiContainer], { phase: 'stop_current_api', env: commandEnv });
    currentStopped = true;
    await command('docker', ['rename', target.apiContainer, sealedName], { phase: 'seal_current_api', env: commandEnv });
    sealed = true;
    const createArgs = [...buildReplacementCreateArgs({ manifest: target, envFile: target.envFile, currentApi: preflight.readbacks.api })];
    const imageIndex = createArgs.lastIndexOf(target.image);
    if (imageIndex < 0) fail('replacement_image_argument_missing');
    createArgs[imageIndex] = `${target.image}@${target.imageDigest}`;
    await command('docker', createArgs, { phase: 'create_replacement_api', env: commandEnv });
    replacementCreated = true;
    await command('docker', ['network', 'connect', target.providerNetwork, target.apiContainer], { phase: 'attach_provider_network', env: commandEnv });
    await command('docker', ['start', target.apiContainer], { phase: 'start_replacement_api', env: commandEnv });
    const replacement = await command('docker', ['inspect', '--format', '{{json .}}', target.apiContainer], { phase: 'replacement_config_readback', env: commandEnv });
    const replacementRecord = parseJson(replacement.stdout, 'replacement_config_readback_invalid');
    assertReplacementImageReadback(replacementRecord, target);
    const comparableReplacement = structuredClone(replacementRecord);
    comparableReplacement.Config.Image = preflight.readbacks.api.Config.Image;
    if (!sameExceptRegistrationFlags(preflight.readbacks.api, comparableReplacement)) fail('replacement_config_drift');
    assertNoHostPort(replacementRecord);
    assertNetworks(replacementRecord, target);
    const startup = await runBoundedStartupProbe(command, target.apiContainer, commandEnv, 'replacement_public_runtime_probe', { deadlineMs: 100, retryDelayMs: 1 });
    assertRuntimeFlags(startup.flags, null);
    if (startup.version?.commit !== target.runtimeRevision || startup.version?.environment !== 'staging') fail('replacement_version_readback_invalid');
    const registration = await command('docker', ['exec', target.apiContainer, 'node', '--input-type=module', '-e', `import crypto from 'node:crypto'; const raw=process.env.${registrationAllowlistKey}??''; process.stdout.write(JSON.stringify({enabled:process.env.${registrationEnabledKey}==='true',allowlist:raw?'present':'absent',allowlistDigest:crypto.createHash('sha256').update(raw).digest('hex'),allowlistEntryCount:raw?raw.split(',').length:0,accessGateEnabled:process.env.SIT_STAGING_ACCESS_GATE_ENABLED==='true'}));`], { phase: 'replacement_registration_config_readback', env: commandEnv });
    const registrationReadback = parseRegistrationConfigReadback(registration.stdout);
    if (!registrationReadback.enabled || registrationReadback.allowlist !== 'present' || registrationReadback.allowlistEntryCount !== 1 || registrationReadback.accessGateEnabled !== true || registrationReadback.allowlistDigest !== sha256(`${mapping.digest}=${mapping.userId}`)) fail('registration_config_readback_invalid');
    const schema = await command('docker', ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', target.databaseUser, '-d', target.databaseName, '-Atc', 'SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'], { phase: 'replacement_schema_readback', env: commandEnv });
    assertTerminalMigration(schema.stdout);
    const ledger = await command('docker', ['exec', target.databaseContainer, 'sh', '-c', `set -eu; psql -X --set ON_ERROR_STOP=1 -U '${target.databaseUser}' -d '${target.databaseName}' -Atc "SELECT string_agg(name || '|' || checksum, E'\\n' ORDER BY name) FROM schema_migrations" | sha256sum | awk '{print $1}'`], { phase: 'replacement_migration_ledger_readback', env: commandEnv });
    parseSchemaLedger(ledger.stdout);
    const result = Object.freeze({ status: 'enabled-awaiting-live-google-token-gate', firstIrreversiblePhase: 'atomic_registration_enable', mappingDigest: mapping.mappingDigest, targetUserIdDigest: sha256(mapping.userId), schemaMigration: requiredTerminalMigration, migrationLedger: requiredMigrationLedger, requiresLaterGate: 'real HTTP Google-token registration proof with an approved live staging identity', sealedName });
    await writeEvidence(evidenceFile, { kind: 'sit-staging-google-registration-enable', schemaVersion: 1, status: result.status, runtimeRevision: target.runtimeRevision, apiContainer: target.apiContainer, imageDigest: target.imageDigest, mappingDigest: mapping.mappingDigest, targetUserIdDigest: sha256(mapping.userId), mappingEntryCount: 1, schemaMigration: requiredTerminalMigration, migrationLedger: requiredMigrationLedger, providerTraffic: 'none', stripeLivemode: false, requiresLaterGate: result.requiresLaterGate });
    return result;
  } catch (error) {
    error.rollback = await rollback({ manifest: target, originalEnv: original.content, originalApi: preflight.readbacks.api, command, commandEnv, sealedName, sealed, currentStopped, replacementCreated });
    throw error;
  }
}

export function sanitizeGoogleRegistrationEnableError(error) {
  return {
    status: 'failed',
    code: error?.code ?? 'staging_google_registration_enable_failed',
    ...(error?.failurePhase ? { failurePhase: String(error.failurePhase) } : {}),
    ...(error?.rollback ? { rollback: { restored: error.rollback.restored === true, results: (error.rollback.results ?? []).map((entry) => ({ phase: String(entry.phase ?? 'rollback'), ok: entry.ok === true, ...(entry.code ? { code: String(entry.code) } : {}) })) } } : {}),
  };
}

async function main() {
  const manifestPath = process.env.STAGING_GOOGLE_AUTH_RUNTIME_MANIFEST ?? '';
  const mappingFile = process.env.STAGING_GOOGLE_REGISTRATION_MAPPING_FILE ?? '';
  const evidenceFile = process.env.STAGING_GOOGLE_REGISTRATION_EVIDENCE_FILE ?? '';
  const manifest = await readGoogleAuthRuntimeManifest(manifestPath);
  const result = await runStagingGoogleRegistrationEnable({ manifest, mappingFile, evidenceFile, execute: process.env.STAGING_GOOGLE_REGISTRATION_EXECUTE === '1' });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await main(); } catch (error) { process.stderr.write(`${JSON.stringify(sanitizeGoogleRegistrationEnableError(error))}\n`); process.exitCode = 1; }
}

export {
  assertPreState,
  parseRegistrationConfigReadback,
  parseSchemaLedger,
  readRegistrationMapping,
  sameExceptRegistrationFlags,
};
