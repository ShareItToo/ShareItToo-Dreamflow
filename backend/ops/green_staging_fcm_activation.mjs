#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertGreenImageReadback,
  assertGreenProtectedEnvironment,
  assertGreenProtectedRuntimeFiles,
  assertGreenRuntimeConfig,
  assertGreenRuntimeEnvironmentReadback,
  assertGreenRuntimeImage,
  assertGreenRuntimeReadbacks,
  assertGreenTargetManifest,
  greenTarget,
  readProtectedGreenManifest,
  runGreenCommand,
} from './green_staging_promotion.mjs';
import { validateFcmStagingSecret } from './validate_fcm_staging_secret.mjs';
import { readStablePrivateFile } from './stable_private_file.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fcmProject = 'shareittoo-staging';
const fcmRuntimeGroup = '65532';
const fcmActivationPrefix = 'shareittoo-staging-api-sealed-green-fcm-memory-';

function fail(code) {
  const error = new Error(`Green staging FCM activation failed: ${code}`);
  error.code = code;
  throw error;
}

function fullCommit(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_commit`);
  return value;
}

function safePath(value, code) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.startsWith(`${repositoryRoot}/`)) fail(code);
  return value;
}

function parseJson(value, code) {
  try { return JSON.parse(String(value ?? '').trim()); } catch { fail(code); }
}

function parseEnv(content, code = 'green_fcm_env_invalid') {
  const values = {};
  for (const line of String(content).split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || Object.hasOwn(values, match[1])) fail(code);
    values[match[1]] = match[2];
  }
  return Object.freeze(values);
}

async function readProtectedJson(filePath, code) {
  safePath(filePath, `${code}_path_invalid`);
  try {
    return parseJson(readStablePrivateFile(filePath, {
      expectedMode: 0o600,
      expectedUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
      code: `${code}_permissions_invalid`,
    }), `${code}_json_invalid`);
  } catch (error) {
    if (error?.code?.startsWith(code)) throw error;
    fail(`${code}_unavailable`);
  }
}

function envFromRecord(record) {
  return Object.fromEntries((record?.Config?.Env ?? []).map((entry) => {
    const [name, ...rest] = String(entry).split('=');
    return [name, rest.join('=')];
  }));
}

function exactName(record, expected, code) {
  if (String(record?.Name ?? '').replace(/^\//u, '') !== expected) fail(code);
}

function networkIds(record, expectedNames, code) {
  const networks = record?.NetworkSettings?.Networks;
  if (!networks || typeof networks !== 'object' || Array.isArray(networks)) fail(code);
  const names = Object.keys(networks).sort();
  if (names.join('|') !== [...expectedNames].sort().join('|')) fail(code);
  const ids = {};
  for (const name of expectedNames) {
    if (!/^[0-9a-f]{64}$/u.test(networks[name]?.NetworkID ?? '')) fail(code);
    ids[name] = networks[name].NetworkID;
  }
  return ids;
}

function mountsFromRecord(record) {
  return (record?.Mounts ?? []).map((mount) => ({
    destination: mount.Destination,
    type: mount.Type,
    source: mount.Type === 'bind' ? mount.Source : null,
    volume: mount.Type === 'volume' ? mount.Name : null,
    readOnly: mount.RW === false,
  })).sort((left, right) => left.destination.localeCompare(right.destination));
}

function expectedMounts(config, target) {
  return [
    { destination: '/data/uploads', type: 'volume', source: null, volume: target.uploadsVolume, readOnly: false },
    { destination: '/run/secrets/firebase-service-account.json', type: 'bind', source: config.firebaseFile, volume: null, readOnly: true },
    { destination: '/run/secrets/mfa-encryption-key', type: 'bind', source: config.mfaFile, volume: null, readOnly: true },
  ].sort((left, right) => left.destination.localeCompare(right.destination));
}

function assertMounts(record, config, target, code = 'green_fcm_mount_inventory_invalid') {
  const actual = mountsFromRecord(record);
  const expected = expectedMounts(config, target);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code);
  return true;
}

function assertNoPorts(record, code = 'green_fcm_host_port_forbidden') {
  const configured = record?.HostConfig?.PortBindings ?? {};
  const active = record?.NetworkSettings?.Ports ?? {};
  if (Object.keys(configured).length !== 0 || Object.values(active).some((value) => Array.isArray(value) && value.length > 0)) fail(code);
}

function assertGreenLabels(record, target, executionId, code = 'green_fcm_labels_invalid') {
  const labels = record?.Config?.Labels ?? {};
  if (labels['com.shareittoo.sit.green'] !== 'true'
      || labels['com.shareittoo.sit.green.run_id'] !== target.runId
      || (executionId !== undefined && labels['com.shareittoo.green.fcm.execution_id'] !== executionId)) fail(code);
}

function assertSourceRuntime(record, target, config, runtime, targetNetworkIds) {
  exactName(record, target.apiContainer, 'green_fcm_source_name_invalid');
  if (record.State?.Running !== true || record.Config?.User !== 'shareittoo'
      || !(record.HostConfig?.GroupAdd ?? []).includes(fcmRuntimeGroup)) fail('green_fcm_source_identity_invalid');
  assertGreenLabels(record, target, undefined);
  const sourceExecutionId = record.Config?.Labels?.['com.shareittoo.green.execution_id'];
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(sourceExecutionId ?? '')) fail('green_fcm_source_execution_label_invalid');
  assertNoPorts(record, 'green_fcm_source_host_port_forbidden');
  const ids = networkIds(record, [target.network, target.providerNetwork], 'green_fcm_source_network_invalid');
  if (ids[target.network] !== targetNetworkIds[target.network] || ids[target.providerNetwork] !== targetNetworkIds[target.providerNetwork]) fail('green_fcm_source_network_id_invalid');
  assertMounts(record, config, target, 'green_fcm_source_mount_inventory_invalid');
  const env = envFromRecord(record);
  if (env.PUSH_TRANSPORT !== 'memory') fail('green_fcm_source_push_transport_invalid');
  assertGreenRuntimeEnvironmentReadback(env);
  if (env.FIREBASE_PROJECT_ID !== fcmProject
      || env.FIREBASE_SERVICE_ACCOUNT_FILE !== '/run/secrets/firebase-service-account.json') fail('green_fcm_source_firebase_binding_invalid');
  if (env.DATABASE_URL?.includes(`@${target.databaseContainer}:`) !== true
      || env.DATABASE_URL?.endsWith(`/${target.databaseName}`) !== true) fail('green_fcm_source_database_binding_invalid');
  if (record.Config?.Image !== `${runtime.image}@${runtime.digest}`) fail('green_fcm_source_image_invalid');
  return Object.freeze({ env, networkIds: ids });
}

export function assertGreenFcmRuntimeEnvironment(values) {
  assertGreenRuntimeEnvironmentReadback({ ...values, PUSH_TRANSPORT: 'memory' });
  if (values?.PUSH_TRANSPORT !== 'fcm'
      || values?.FIREBASE_PROJECT_ID !== fcmProject
      || values?.FIREBASE_SERVICE_ACCOUNT_FILE !== '/run/secrets/firebase-service-account.json'
      || values?.FIREBASE_AUTH_ENABLED !== 'false'
      || values?.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || values?.PAYMENT_TRANSPORT !== 'memory'
      || values?.MAIL_TRANSPORT !== 'memory'
      || values?.IDENTITY_VERIFICATION_TRANSPORT !== 'memory'
      || values?.SIT_LISTING_AI_PROVIDER !== 'on_device'
      || values?.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED !== '0'
      || values?.SIT_LISTING_AI_BUDGET_CENTS !== '0') fail('green_fcm_runtime_environment_invalid');
  return true;
}

export function assertGreenFcmEnvironmentParity(sourceValues, successorValues) {
  const sourceKeys = Object.keys(sourceValues ?? {}).sort();
  const successorKeys = Object.keys(successorValues ?? {}).sort();
  if (sourceKeys.length !== successorKeys.length || sourceKeys.some((name, index) => name !== successorKeys[index])) {
    fail('green_fcm_environment_key_drift');
  }
  for (const name of sourceKeys) {
    const expected = name === 'PUSH_TRANSPORT' ? 'fcm' : sourceValues[name];
    if (name === 'PUSH_TRANSPORT' && sourceValues[name] !== 'memory') fail('green_fcm_source_push_transport_invalid');
    if (successorValues[name] !== expected) fail('green_fcm_environment_value_drift');
  }
  return true;
}

export function assertGreenFcmTarget({ targetManifest, config, runtimeCommit, runtimeImageDigest } = {}) {
  const manifest = assertGreenTargetManifest(targetManifest);
  const target = Object.freeze({ ...manifest, databaseName: greenTarget.databaseName, databaseUser: greenTarget.databaseUser });
  assertGreenRuntimeConfig(config);
  const runtime = assertGreenRuntimeImage({
    image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`,
    digest: runtimeImageDigest,
    runtimeCommit,
  });
  if (config.pushTransport !== 'memory') fail('green_fcm_source_config_not_memory');
  return Object.freeze({ target, config, runtime });
}

export function assertGreenFcmExecutionAllowed({ environment = process.env, runtimeCommit } = {}) {
  if (environment.GREEN_STAGING_FCM_ACTIVATION_EXECUTE !== '1') fail('explicit_green_fcm_execute_flag_required');
  if (environment.GREEN_STAGING_FCM_ACTIVATION_CONFIRM !== runtimeCommit) fail('exact_green_fcm_confirmation_required');
  return true;
}

export async function assertGreenFcmEvidenceDestination(filePath) {
  safePath(filePath, 'green_fcm_evidence_path_invalid');
  const parent = dirname(filePath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentMeta = await lstat(parent);
  const uid = typeof process.getuid === 'function' ? process.getuid() : parentMeta.uid;
  if (!parentMeta.isDirectory() || parentMeta.isSymbolicLink() || (parentMeta.mode & 0o777) !== 0o700 || parentMeta.uid !== uid) {
    fail('green_fcm_evidence_directory_unsafe');
  }
  try {
    await lstat(filePath);
    fail('green_fcm_evidence_path_exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return true;
}

function activationName(executionId) {
  if (!/^[0-9a-f]{12,64}$/u.test(executionId)) fail('green_fcm_execution_id_invalid');
  return `${fcmActivationPrefix}${executionId.slice(0, 20)}`;
}

export function buildGreenFcmActivationPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest, opsCommit, executionId } = {}) {
  fullCommit(runtimeCommit, 'runtime_commit');
  fullCommit(opsCommit, 'ops_commit');
  const validated = assertGreenFcmTarget({ targetManifest, config, runtimeCommit, runtimeImageDigest });
  const id = executionId ?? crypto.randomUUID().replaceAll('-', '');
  const retainedName = activationName(id);
  const plan = {
    kind: 'sit-green-fcm-activation-plan',
    executionId: id,
    retainedMemoryName: retainedName,
    target: validated.target,
    config: validated.config,
    runtime: validated.runtime,
    opsCommit,
    fcmProject,
    rollback: 'immutable-id-only; retained memory seal is never a mutation target on success',
  };
  return Object.freeze(plan);
}

function assertRecordId(record, code) {
  if (!/^[0-9a-f]{64}$/u.test(record?.Id ?? '')) fail(code);
  return record.Id;
}

function ownerSuccessor(record, plan, expectedId = undefined) {
  if (expectedId !== undefined && record?.Id !== expectedId) return false;
  const labels = record?.Config?.Labels ?? {};
  return record?.Id?.match(/^[0-9a-f]{64}$/u)
    && String(record?.Name ?? '').replace(/^\//u, '') === plan.target.apiContainer
    && labels['com.shareittoo.sit.green'] === 'true'
    && labels['com.shareittoo.sit.green.run_id'] === plan.target.runId
    && labels['com.shareittoo.green.fcm.execution_id'] === plan.executionId;
}

function retainedMemoryRecord(record, plan, expectedId) {
  return record?.Id === expectedId
    && String(record?.Name ?? '').replace(/^\//u, '') === plan.retainedMemoryName
    && record?.Config?.Labels?.['com.shareittoo.sit.green'] === 'true'
    && record?.Config?.Labels?.['com.shareittoo.sit.green.run_id'] === plan.target.runId
    && typeof record?.Config?.Labels?.['com.shareittoo.green.execution_id'] === 'string'
    && record?.State?.Running === false;
}

async function inspect(command, idOrName, phase, allowFailure = false) {
  const result = await command('docker', ['inspect', idOrName, '--format', '{{json .}}'], { phase, allowFailure });
  if (result?.code && !allowFailure) fail(`${phase}_failed`);
  return result?.stdout?.trim() ? parseJson(result.stdout, `${phase}_invalid`) : null;
}

async function listExact(command, name, phase) {
  const result = await command('docker', ['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'], { phase });
  return String(result.stdout ?? '').trim().split(/\s+/u).filter(Boolean);
}

async function assertNetwork(command, name, internal, phase) {
  const record = await inspect(command, name, phase);
  if (!record || record.Name !== name || (internal !== undefined && record.Internal !== internal)
      || !/^[0-9a-f]{64}$/u.test(record.Id ?? '')) fail(`${phase}_invalid`);
  return record;
}

function commandEnvFor(plan, configFile, environment) {
  return {
    ...environment,
    GREEN_STAGING_COMPOSE_PROJECT: plan.target.composeProject,
    GREEN_STAGING_FCM_EXECUTION_ID: plan.executionId,
    GREEN_STAGING_FCM_CONFIG_FILE: configFile,
  };
}

function createArgs(plan, configFile, targetNetworkId) {
  return [
    'create', '--name', plan.target.apiContainer, '--restart', 'no', '--group-add', fcmRuntimeGroup,
    '--network', targetNetworkId, '--label', 'com.shareittoo.sit.green=true',
    '--label', `com.shareittoo.sit.green.run_id=${plan.target.runId}`,
    '--label', `com.shareittoo.green.fcm.execution_id=${plan.executionId}`,
    '--env-file', configFile,
    '--env', 'PUSH_TRANSPORT=fcm',
    '--mount', `type=volume,src=${plan.target.uploadsVolume},dst=/data/uploads,readonly=false`,
    '--mount', `type=bind,src=${plan.config.mfaFile},dst=/run/secrets/mfa-encryption-key,readonly`,
    '--mount', `type=bind,src=${plan.config.firebaseFile},dst=/run/secrets/firebase-service-account.json,readonly`,
    `${plan.runtime.image}@${plan.runtime.digest}`,
  ];
}

export function assertGreenFcmCommandSafety(commands, plan) {
  if (!Array.isArray(commands) || commands.length === 0) fail('green_fcm_commands_required');
  const serialized = JSON.stringify(commands);
  if (commands.some((entry) => entry?.command === 'docker'
      && ((entry.args?.[0] === 'rm' && entry.args?.some((arg) => /^(?:shareittoo-staging-api|shareittoo_staging)$/u.test(arg)))
        || (entry.args?.[0] === 'rename' && entry.args?.includes(plan.target.sealedApiContainer))))
      || /(?:DATABASE_URL|JWT_SECRET|password|token|whsec_|sk_live_|sk_test_)=/iu.test(serialized)
      || serialized.includes(plan.target.sealedApiContainer)) fail('green_fcm_command_safety_invalid');
  return true;
}

async function cleanupSuccessor({ command, successorId, plan, phase = 'green_fcm_successor_cleanup' }) {
  if (!successorId) return { removed: false, verifiedAbsent: false };
  const record = await inspect(command, successorId, `${phase}_identity`, true);
  if (record && !ownerSuccessor(record, plan, successorId)) fail('green_fcm_cleanup_identity_invalid');
  const removed = await command('docker', ['rm', '--force', successorId], { phase, allowFailure: true });
  const after = await inspect(command, successorId, `${phase}_verify`, true);
  if (after) fail('green_fcm_cleanup_not_verified');
  if (removed?.code && after) fail('green_fcm_cleanup_failed');
  return { removed: true, verifiedAbsent: true };
}

async function rollbackToMemory({ command, plan, sourceId, successorId }) {
  if (successorId) await cleanupSuccessor({ command, successorId, plan, phase: 'green_fcm_rollback_successor_cleanup' });
  const current = await inspect(command, sourceId, 'green_fcm_rollback_memory_current_identity', true);
  const currentName = String(current?.Name ?? '').replace(/^\//u, '');
  if (!current || current.Id !== sourceId || ![plan.target.apiContainer, plan.retainedMemoryName].includes(currentName)) fail('green_fcm_rollback_memory_identity_invalid');
  if (currentName === plan.target.apiContainer) {
    const start = await command('docker', ['start', sourceId], { phase: 'green_fcm_rollback_memory_start', allowFailure: true });
    const started = await inspect(command, sourceId, 'green_fcm_rollback_memory_start_readback', true);
    if (!started?.State?.Running) fail('green_fcm_rollback_memory_start_failed');
    return Object.freeze({ status: 'restored-memory', renameCode: start?.code ?? 0 });
  }
  const canonical = await listExact(command, plan.target.apiContainer, 'green_fcm_rollback_name_check');
  if (canonical.length > 0) fail('green_fcm_rollback_name_occupied');
  const retained = await inspect(command, sourceId, 'green_fcm_rollback_memory_identity', true);
  if (!retained || !retainedMemoryRecord(retained, plan, sourceId)) fail('green_fcm_rollback_memory_identity_invalid');
  const rename = await command('docker', ['rename', sourceId, plan.target.apiContainer], { phase: 'green_fcm_rollback_memory_rename', allowFailure: true });
  const reconciled = await inspect(command, sourceId, 'green_fcm_rollback_memory_rename_readback', true);
  if (!reconciled || String(reconciled.Name ?? '').replace(/^\//u, '') !== plan.target.apiContainer) fail('green_fcm_rollback_memory_rename_failed');
  const start = await command('docker', ['start', sourceId], { phase: 'green_fcm_rollback_memory_start', allowFailure: true });
  const started = await inspect(command, sourceId, 'green_fcm_rollback_memory_start_readback', true);
  if (!started?.State?.Running) fail('green_fcm_rollback_memory_start_failed');
  return Object.freeze({ status: 'restored-memory', renameCode: start?.code ?? 0 });
}

export async function runGreenFcmActivation({
  plan,
  configFile,
  environment = process.env,
  execute = false,
  command = runGreenCommand,
  assertRuntimeFiles = assertGreenProtectedRuntimeFiles,
  validateSecret = validateFcmStagingSecret,
  evidenceFile,
  writeEvidence = writeGreenFcmEvidence,
  now = () => new Date().toISOString(),
} = {}) {
  if (!plan || plan.kind !== 'sit-green-fcm-activation-plan') fail('green_fcm_plan_required');
  assertGreenFcmExecutionAllowed({ environment, runtimeCommit: plan.runtime.runtimeCommit });
  if (!execute) fail('explicit_green_fcm_execute_flag_required');
  safePath(configFile, 'green_fcm_config_path_invalid');
  const baselineEnv = parseEnv(readStablePrivateFile(configFile, {
    expectedMode: 0o600,
    expectedUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
    code: 'green_fcm_config_permissions_invalid',
  }));
  assertGreenProtectedEnvironment(baselineEnv, plan.config);
  await assertRuntimeFiles(plan.config, baselineEnv);
  validateSecret({ filePath: plan.config.firebaseFile, expectedProjectId: fcmProject });
  if (typeof writeEvidence !== 'function') fail('green_fcm_evidence_writer_required');
  await assertGreenFcmEvidenceDestination(evidenceFile);

  const targetNetworkRecord = await assertNetwork(command, plan.target.network, true, 'green_fcm_target_network');
  const providerNetworkRecord = await assertNetwork(command, plan.target.providerNetwork, false, 'green_fcm_provider_network');
  const sourceRecord = await inspect(command, plan.target.apiContainer, 'green_fcm_source_identity');
  const sourceId = assertRecordId(sourceRecord, 'green_fcm_source_id_invalid');
  const targetNetworkIds = { [plan.target.network]: targetNetworkRecord.Id, [plan.target.providerNetwork]: providerNetworkRecord.Id };
  const sourceRuntime = assertSourceRuntime(sourceRecord, plan.target, plan.config, plan.runtime, targetNetworkIds);
  if ((await listExact(command, plan.retainedMemoryName, 'green_fcm_retained_name_check')).length > 0
      || (await listExact(command, `${plan.target.apiContainer}`, 'green_fcm_source_name_check')).length !== 1) fail('green_fcm_foreign_name_collision');

  const commands = [];
  const env = commandEnvFor(plan, configFile, environment);
  let successorId;
  let retained = false;
  try {
    const stop = await command('docker', ['stop', sourceId], { phase: 'green_fcm_stop_memory', env, allowFailure: true });
    commands.push({ phase: 'green_fcm_stop_memory', command: 'docker', args: ['stop', '<source-id>'], resultCode: stop?.code ?? 0 });
    const stopped = await inspect(command, sourceId, 'green_fcm_stop_memory_readback');
    if (stopped?.State?.Running) fail('green_fcm_stop_memory_failed');

    const rename = await command('docker', ['rename', sourceId, plan.retainedMemoryName], { phase: 'green_fcm_retain_memory', env, allowFailure: true });
    commands.push({ phase: 'green_fcm_retain_memory', command: 'docker', args: ['rename', '<source-id>', '<retained-memory-name>'], resultCode: rename?.code ?? 0 });
    const retainedRecord = await inspect(command, sourceId, 'green_fcm_retain_memory_readback');
    if (!retainedMemoryRecord(retainedRecord, plan, sourceId)) fail('green_fcm_retain_memory_failed');
    retained = true;

    const create = await command('docker', createArgs(plan, configFile, targetNetworkRecord.Id), { phase: 'green_fcm_create_successor', env, allowFailure: true });
    commands.push({ phase: 'green_fcm_create_successor', command: 'docker', args: createArgs(plan, configFile, targetNetworkRecord.Id).map((arg) => arg.includes('/') ? '<protected-path>' : arg), resultCode: create?.code ?? 0 });
    successorId = /^[0-9a-f]{64}$/u.test(create?.stdout?.trim() ?? '') ? create.stdout.trim() : null;
    if (!successorId) {
      const ids = await listExact(command, plan.target.apiContainer, 'green_fcm_create_successor_reconcile_name');
      if (ids.length !== 1) fail('green_fcm_create_successor_outcome_unknown');
      successorId = ids[0];
    }
    const created = await inspect(command, successorId, 'green_fcm_create_successor_readback');
    if (!ownerSuccessor(created, plan, successorId)) fail('green_fcm_create_successor_identity_invalid');
    assertNoPorts(created);
    networkIds(created, [plan.target.network], 'green_fcm_successor_prestart_network_invalid');
    assertMounts(created, plan.config, plan.target, 'green_fcm_successor_mount_inventory_invalid');
    if (created.Config?.Image !== `${plan.runtime.image}@${plan.runtime.digest}`) fail('green_fcm_successor_image_invalid');

    const attach = await command('docker', ['network', 'connect', providerNetworkRecord.Id, successorId], { phase: 'green_fcm_attach_provider_network', env, allowFailure: true });
    commands.push({ phase: 'green_fcm_attach_provider_network', command: 'docker', args: ['network', '<provider-network-id>', '<successor-id>'], resultCode: attach?.code ?? 0 });
    const attached = await inspect(command, successorId, 'green_fcm_attach_provider_network_readback');
    networkIds(attached, [plan.target.network, plan.target.providerNetwork], 'green_fcm_successor_network_invalid');

    const start = await command('docker', ['start', successorId], { phase: 'green_fcm_start_successor', env, allowFailure: true });
    commands.push({ phase: 'green_fcm_start_successor', command: 'docker', args: ['start', '<successor-id>'], resultCode: start?.code ?? 0 });
    const started = await inspect(command, successorId, 'green_fcm_start_successor_readback');
    if (!started?.State?.Running) fail('green_fcm_start_successor_failed');
    const envReadback = envFromRecord(started);
    assertGreenFcmRuntimeEnvironment(envReadback);
    assertGreenFcmEnvironmentParity(sourceRuntime.env, envReadback);
    const imageResult = await command('docker', ['image', 'inspect', '--format', '{{json .}}', `${plan.runtime.image}@${plan.runtime.digest}`], { phase: 'green_fcm_image_readback', env });
    const imageReadback = parseJson(imageResult.stdout, 'green_fcm_image_readback_invalid');
    assertGreenImageReadback(imageReadback, plan.runtime);
    const publicBase = String(environment.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com/api').replace(/\/$/u, '');
    const probe = async (suffix, phase) => {
      const result = await command('curl', ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', `${publicBase}${suffix}`], { phase, env });
      return parseJson(result.stdout, `${phase}_invalid`);
    };
    const health = await probe('/health', 'green_fcm_health_readback');
    const ready = await probe('/health/ready', 'green_fcm_ready_readback');
    const version = await probe('/version', 'green_fcm_version_readback');
    assertGreenRuntimeReadbacks({ version, health, ready, runtimeCommit: plan.runtime.runtimeCommit });
    assertGreenFcmCommandSafety(commands, plan);
    const result = Object.freeze({ status: 'executed', runtimeCommit: plan.runtime.runtimeCommit, image: plan.runtime.image, digest: plan.runtime.digest, sourceId, successorId, retainedMemoryName: plan.retainedMemoryName, retained: true, completed: commands.map((entry) => entry.phase), readback: { image: imageReadback, health, ready, version }, startedAt: now() });
    const evidence = {
      kind: 'sit-green-fcm-activation', status: result.status,
      target: { apiContainer: plan.target.apiContainer, network: plan.target.network, providerNetwork: plan.target.providerNetwork, retainedMemoryName: result.retainedMemoryName },
      runtime: { commit: plan.runtime.runtimeCommit, image: plan.runtime.image, digest: plan.runtime.digest },
      opsCommit: plan.opsCommit,
      safety: { pushTransport: 'fcm', firebaseProject: fcmProject, firebaseAuth: false, firebasePhone: false, paymentTransport: 'memory', identityTransport: 'memory', mailTransport: 'memory', listingAiProvider: 'on_device', listingAiExternalExecutionApproved: false, listingAiBudgetCents: 0, technicalSandbox: 'off' },
      readback: { successorId: result.successorId, retained: result.retained }, completed: result.completed,
    };
    const persistedEvidence = await writeEvidence(evidenceFile, evidence);
    return Object.freeze({ ...result, evidence: persistedEvidence });
  } catch (error) {
    let rollback;
    try {
      rollback = await rollbackToMemory({ command, plan, sourceId, successorId });
    } catch (rollbackError) {
      error.rollback = { status: 'failed', code: rollbackError?.code ?? 'green_fcm_rollback_failed' };
      error.cleanup = 'failed';
      throw error;
    }
    error.rollback = rollback;
    error.cleanup = rollback.status === 'restored-memory' || retained ? 'verified' : 'not-started';
    throw error;
  }
}

export async function writeGreenFcmEvidence(filePath, evidence) {
  await assertGreenFcmEvidenceDestination(filePath);
  if (!evidence || evidence.kind !== 'sit-green-fcm-activation' || evidence.status !== 'executed') fail('green_fcm_evidence_invalid');
  const serialized = `${JSON.stringify({ ...evidence, redaction: 'sensitive values omitted' })}\n`;
  if (/(?:DATABASE_URL|JWT_SECRET|password|token|secret|whsec_|sk_live_|sk_test_)=?/iu.test(serialized)) fail('green_fcm_evidence_secret_leak');
  const parent = await lstat(dirname(filePath));
  const uid = typeof process.getuid === 'function' ? process.getuid() : parent.uid;
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700 || parent.uid !== uid) fail('green_fcm_evidence_directory_unsafe');
  await writeFile(filePath, serialized, { flag: 'wx', mode: 0o600 });
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== uid) fail('green_fcm_evidence_permissions_invalid');
  return Object.freeze({ path: filePath, sha256: crypto.createHash('sha256').update(serialized).digest('hex') });
}

async function main() {
  const runtimeCommit = fullCommit(process.argv[2], 'runtime_commit');
  const target = await readProtectedGreenManifest(process.env.GREEN_STAGING_TARGET_MANIFEST ?? '');
  const config = await readProtectedJson(process.env.GREEN_STAGING_CONFIG_MANIFEST ?? '', 'green_fcm_config_manifest');
  const plan = buildGreenFcmActivationPlan({ targetManifest: target, config, runtimeCommit, runtimeImageDigest: process.env.GREEN_RUNTIME_IMAGE_DIGEST, opsCommit: process.env.GREEN_STAGING_OPS_COMMIT, executionId: process.env.GREEN_STAGING_FCM_EXECUTION_ID });
  const evidenceFile = safePath(process.env.GREEN_STAGING_FCM_EVIDENCE_FILE ?? '', 'green_fcm_evidence_path_invalid');
  await runGreenFcmActivation({ plan, configFile: config.envFile, environment: process.env, execute: true, evidenceFile });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'green_fcm_activation_failed'} cleanup=${error?.cleanup ?? 'not-started'}\n`);
    process.exitCode = 1;
  });
}
