#!/usr/bin/env node

import crypto from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const greenTarget = Object.freeze({
  composeProject: 'sit-green',
  apiContainer: 'shareittoo-staging-api',
  sealedApiContainer: 'shareittoo-staging-api-alt-sealed-green',
  databaseContainer: 'sit-green-postgres-20260918011528-wp254',
  databaseVolume: 'sit-green-volume-20260918011528-wp254',
  network: 'sit-green-network-20260918011528-wp254',
  providerNetwork: 'sit-staging-provider-egress',
  uploadsVolume: 'sit-green-uploads-20260918011528-wp254',
  runId: '20260918011528-wp254',
  sourceSchema: 87,
  currentSchema: 92,
});

export const greenAllowedEnvNames = Object.freeze([
  'NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'APP_COMMIT', 'APP_BUILD_TIMESTAMP',
  'PORT', 'BIND_HOST', 'DATABASE_URL', 'JWT_SECRET', 'JWT_ISSUER',
  'ACCESS_GATE_MODE', 'ACCESS_GATE_USER_IDS', 'ACCESS_GATE_RECIPIENT_EMAILS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_FROM', 'FCM_PROJECT_ID',
  'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_ENABLED', 'PAYMENT_TRANSPORT',
  'STRIPE_LIVEMODE', 'IDENTITY_VERIFICATION_TRANSPORT', 'PUSH_TRANSPORT',
  'MAIL_TRANSPORT', 'SIT_STAGING_PILOT_ID', 'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_PROVIDER',
  'SIT_LISTING_AI_MODEL', 'SIT_LISTING_AI_BUDGET_MINOR',
  'SIT_LISTING_AI_EXTERNAL_ALLOWED', 'TECHNICAL_SANDBOX_AVAILABLE',
  'TECHNICAL_SANDBOX_USER_IDS', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE',
  'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE', 'SYNTHETIC_SANDBOX_PASSWORD_FILE',
]);

const forbiddenGreenEnvNames = new Set([
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY_FILE', 'STRIPE_WEBHOOK_SECRET_FILE', 'STRIPE_CONNECT_WEBHOOK_SECRET_FILE',
  'OPENAI_API_KEY', 'OPENAI_API_KEY_FILE',
]);

function isAllowedGreenEnvName(name) {
  return !forbiddenGreenEnvNames.has(name)
    && (greenAllowedEnvNames.includes(name)
      || /^(?:APP_|CORS_|PUBLIC_|SIT_|PRIVATE_|BOOKING_|PLANNER_|LISTING_|LEGAL_|GOOGLE_MAPS_|UPLOAD_|MAIL_|SMTP_|PUSH_|FIREBASE_|PAYMENT_|MFA_|IDENTITY_|TECHNICAL_|SYNTHETIC_)/u.test(name));
}

const requiredConfigKeys = Object.freeze([
  'environment', 'envFile', 'envNames', 'mfaFile', 'firebaseFile',
  'technicalSandboxKeyFile', 'technicalSandboxWebhookFile',
  'syntheticUserId', 'paymentTransport', 'stripeLiveMode',
  'identityTransport', 'listingAiProvider', 'listingAiExternalAllowed',
  'accessGateDigest', 'providerConfigDigest', 'mounts',
]);

const requiredGreenEnvNames = Object.freeze([
  'DATABASE_URL', 'JWT_SECRET', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE',
  'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER',
  'SIT_LISTING_AI_EXTERNAL_ALLOWED', 'ACCESS_GATE_MODE', 'ACCESS_GATE_USER_IDS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'FCM_PROJECT_ID',
  'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_ENABLED', 'SIT_STAGING_COMPOSE_PROJECT',
]);

function fail(code) {
  const error = new Error(`Green staging promotion failed: ${code}`);
  error.code = code;
  throw error;
}

function fullCommit(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_commit`);
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((entry, index) => entry !== sorted[index])) fail(code);
}

function safePath(value, code) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.startsWith(`${repositoryRoot}/`)) fail(code);
  return value;
}

function safeDigest(value, code) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail(code);
  return value;
}

export function assertGreenTargetManifest(manifest) {
  exactKeys(manifest, [
    'kind', 'schemaVersion', 'composeProject', 'greenLabel', 'runId',
    'apiContainer', 'databaseContainer', 'databaseVolume', 'network',
    'providerNetwork', 'uploadsVolume', 'networkInternal', 'sourceSchema',
    'currentSchema', 'targetDigest',
  ], 'green_target_manifest_shape_invalid');
  if (manifest.kind !== 'sit-green-staging-target' || manifest.schemaVersion !== 1
      || manifest.composeProject !== greenTarget.composeProject
      || manifest.greenLabel !== 'com.shareittoo.sit.green=true'
      || manifest.runId !== greenTarget.runId
      || manifest.apiContainer !== greenTarget.apiContainer
      || manifest.databaseContainer !== greenTarget.databaseContainer
      || manifest.databaseVolume !== greenTarget.databaseVolume
      || manifest.network !== greenTarget.network
      || manifest.providerNetwork !== greenTarget.providerNetwork
      || manifest.uploadsVolume !== greenTarget.uploadsVolume
      || manifest.networkInternal !== true
      || manifest.sourceSchema !== greenTarget.sourceSchema
      || manifest.currentSchema !== greenTarget.currentSchema) {
    fail('green_target_identity_mismatch');
  }
  if (!/^[0-9a-f]{64}$/u.test(manifest.targetDigest ?? '')) fail('green_target_digest_invalid');
  const serialized = JSON.stringify(manifest);
  if (/shareittoo_staging|prod|production|latest|lookalike/iu.test(serialized)) fail('legacy_or_production_target_forbidden');
  return Object.freeze({ ...manifest });
}

export async function readProtectedGreenManifest(filePath) {
  safePath(filePath, 'green_manifest_path_invalid');
  const metadata = await lstat(filePath).catch(() => fail('green_manifest_missing'));
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
    fail('green_manifest_must_be_regular_0600');
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(filePath, 'utf8')); } catch { fail('green_manifest_json_invalid'); }
  return assertGreenTargetManifest(manifest);
}

async function readProtectedJson(filePath, missingCode) {
  safePath(filePath, `${missingCode}_path_invalid`);
  const metadata = await lstat(filePath).catch(() => fail(missingCode));
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) fail(`${missingCode}_must_be_regular_0600`);
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch { fail(`${missingCode}_json_invalid`); }
}

async function readProtectedEnv(filePath) {
  safePath(filePath, 'green_env_file');
  const metadata = await lstat(filePath).catch(() => fail('green_env_file_missing'));
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) fail('green_env_file_must_be_regular_0600');
  const values = {};
  for (const line of (await readFile(filePath, 'utf8')).split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || !isAllowedGreenEnvName(match[1]) || Object.hasOwn(values, match[1])) fail('green_env_file_allowlist_invalid');
    values[match[1]] = match[2];
  }
  return Object.freeze(values);
}

export function assertGreenRuntimeConfig(config) {
  exactKeys(config, requiredConfigKeys, 'green_config_shape_invalid');
  safePath(config.envFile, 'green_env_file_invalid');
  safePath(config.mfaFile, 'green_mfa_file_invalid');
  safePath(config.firebaseFile, 'green_firebase_file_invalid');
  safePath(config.technicalSandboxKeyFile, 'green_technical_key_file_invalid');
  safePath(config.technicalSandboxWebhookFile, 'green_technical_webhook_file_invalid');
  if (!['staging', 'test'].includes(config.environment)
      || !Array.isArray(config.envNames) || config.envNames.length === 0
      || new Set(config.envNames).size !== config.envNames.length
      || config.envNames.some((name) => !isAllowedGreenEnvName(name))
      || requiredGreenEnvNames.some((name) => !config.envNames.includes(name))) {
    fail('green_config_env_allowlist_invalid');
  }
  if (config.paymentTransport !== 'memory' || config.stripeLiveMode !== false
      || config.identityTransport !== 'memory'
      || config.listingAiProvider !== 'on_device'
      || config.listingAiExternalAllowed !== false
      || config.syntheticUserId !== 'synthetic_sandbox_user_pilot_20260919') {
    fail('green_config_safety_boundary_invalid');
  }
  safeDigest(config.accessGateDigest, 'green_access_gate_digest_invalid');
  safeDigest(config.providerConfigDigest, 'green_provider_config_digest_invalid');
  if (!Array.isArray(config.mounts) || config.mounts.length < 5) fail('green_mount_inventory_invalid');
  for (const mount of config.mounts) {
    exactKeys(mount, ['source', 'destination', 'readOnly'], 'green_mount_shape_invalid');
    safePath(mount.source, 'green_mount_source_invalid');
    if (typeof mount.destination !== 'string' || !mount.destination.startsWith('/')) fail('green_mount_destination_invalid');
    if (mount.readOnly !== true) fail('green_mount_must_be_read_only');
  }
  if (config.technicalSandboxKeyFile === config.technicalSandboxWebhookFile) fail('green_technical_files_not_distinct');
  return Object.freeze({ ...config, envNames: [...config.envNames], mounts: config.mounts.map((mount) => Object.freeze({ ...mount })) });
}

export function assertGreenRuntimeImage({ image, digest, runtimeCommit } = {}) {
  fullCommit(runtimeCommit, 'runtime_commit');
  if (image !== `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`) fail('runtime_image_tag_mismatch');
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(digest)) fail('runtime_image_digest_required');
  if (/latest|local|prod|production/iu.test(image)) fail('runtime_image_unsafe');
  return Object.freeze({ image, digest, runtimeCommit });
}

export function assertGreenContainerInventory(inventory) {
  exactKeys(inventory, ['api', 'database', 'network', 'providerNetwork', 'uploadsVolume', 'schema'], 'green_inventory_shape_invalid');
  if (inventory.api.name !== greenTarget.apiContainer
      || inventory.database.name !== greenTarget.databaseContainer
      || inventory.network.name !== greenTarget.network
      || inventory.providerNetwork.name !== greenTarget.providerNetwork
      || inventory.uploadsVolume.name !== greenTarget.uploadsVolume
      || inventory.network.internal !== true
      || inventory.api.greenLabel !== true
      || inventory.database.greenLabel !== true
      || inventory.api.hostPorts !== 0
      || inventory.api.running !== true
      || inventory.database.running !== true
      || inventory.schema !== greenTarget.sourceSchema) {
    fail('green_inventory_mismatch');
  }
  return true;
}

export function buildGreenPromotionPlan({
  targetManifest,
  config,
  runtimeCommit,
  runtimeImageDigest,
  opsCommit,
  evidenceFile,
} = {}) {
  const target = assertGreenTargetManifest(targetManifest);
  const runtime = assertGreenRuntimeImage({
    image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`,
    digest: runtimeImageDigest,
    runtimeCommit,
  });
  assertGreenRuntimeConfig(config);
  fullCommit(opsCommit, 'ops_commit');
  safePath(evidenceFile, 'green_evidence_path_invalid');
  const runId = `green-promotion-${runtimeCommit.slice(0, 12)}`;
  const isolated = {
    network: `sit-green-rehearsal-network-${runId}`,
    volume: `sit-green-rehearsal-volume-${runId}`,
    database: `sit-green-rehearsal-postgres-${runId}`,
  };
  return Object.freeze({
    kind: 'sit-green-promotion-plan',
    target,
    runtime,
    opsCommit,
    evidenceFile,
    isolated,
    phases: Object.freeze([
      'validate exact Green inventory and schema 87; reject legacy/production/lookalikes',
      'write fresh protected database backup and digest before quiesce',
      'stop and seal the observed Green API; never boot it after schema migration',
      'restore backup into an internal run-scoped PostgreSQL target and migrate 87 to 92',
      'run foreign-key, aggregate, readiness and functional probes; cleanup and verify every isolated resource',
      'provision the exact synthetic sandbox user on Green with the protected password file',
      'run exact immutable candidate on Green with loopback-only 18082, MFA memory Identity, on-device AI and technical secrets',
      'require live/ready 200, MFA and Identity feature probes, then fail closed on cleanup failure',
      'create final no-host-port Green API on both approved networks with existing uploads and approved config only',
      'read back public live/ready/version and write only sanitized 0600 evidence',
    ]),
    commandPolicy: Object.freeze({
      acceptanceHostPort: '127.0.0.1:18082:8080',
      finalHostPorts: 0,
      finalNetworks: [target.network, target.providerNetwork],
      finalVolumes: [target.uploadsVolume],
      oldApiRestartAfterMigration: false,
      legacyDatabaseAllowed: false,
      productionAllowed: false,
      secretValuesInOutput: false,
    }),
  });
}

export function buildGreenPromotionCommands({ plan, configFile, config } = {}) {
  if (!plan || plan.kind !== 'sit-green-promotion-plan') fail('green_plan_required');
  safePath(configFile, 'green_config_file_invalid');
  const runtimeConfig = assertGreenRuntimeConfig(config);
  const { target, runtime, isolated } = plan;
  const inspect = (name) => ['docker', ['inspect', '--format', '{{json .}}', name]];
  const commands = [
    { phase: 'target_inventory_api', ...inspect(target.apiContainer) },
    { phase: 'target_inventory_database', ...inspect(target.databaseContainer) },
    { phase: 'target_inventory_network', ...inspect(target.network) },
    { phase: 'target_inventory_provider_network', ...inspect(target.providerNetwork) },
    { phase: 'target_inventory_uploads', ...inspect(target.uploadsVolume) },
    { phase: 'source_schema_readback', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_staging', '-d', 'shareittoo_staging', '-Atc', 'SELECT max(version)::int FROM schema_migrations'] },
    { phase: 'fresh_protected_backup', command: 'docker', args: ['exec', target.databaseContainer, 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '-U', 'shareittoo_staging', '-d', 'shareittoo_staging'], stdoutFile: `${plan.evidenceFile}.pgdump`, binary: true },
    { phase: 'quiesce_green_api', command: 'docker', args: ['stop', target.apiContainer] },
    { phase: 'seal_green_api', command: 'docker', args: ['rename', target.apiContainer, target.sealedApiContainer] },
    { phase: 'isolated_network_create', command: 'docker', args: ['network', 'create', '--internal', '--label', 'com.shareittoo.green.rehearsal=true', isolated.network] },
    { phase: 'isolated_volume_create', command: 'docker', args: ['volume', 'create', '--label', 'com.shareittoo.green.rehearsal=true', isolated.volume] },
    { phase: 'isolated_postgres_create', command: 'docker', args: ['run', '--detach', '--network', isolated.network, '--name', isolated.database, '--label', 'com.shareittoo.green.rehearsal=true', 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'] },
    { phase: 'isolated_restore_and_migrate', command: 'node', args: ['backend/ops/staging_forward_migration_rehearsal.mjs', runtime.runtimeCommit] },
    { phase: 'isolated_integrity_and_functional_probes', command: 'node', args: ['backend/ops/check_foreign_key_integrity.mjs', '--target', isolated.database] },
    { phase: 'synthetic_sandbox_provision', command: 'node', args: ['backend/ops/provision_synthetic_sandbox_user.mjs'], envFile: configFile, redacted: true },
    { phase: 'candidate_acceptance_create', command: 'docker', args: [
      'create', '--name', `sit-green-acceptance-${runtime.runtimeCommit.slice(0, 12)}`,
      '--network', target.network, '--network-alias', 'sit-green-acceptance-api',
      '--env-file', configFile, '--publish', '127.0.0.1:18082:8080',
      '--mount', `type=volume,src=${target.uploadsVolume},dst=/data/uploads,readonly=false`,
      '--mount', `type=bind,src=${runtimeConfig.mfaFile},dst=/run/secrets/mfa-encryption-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.firebaseFile},dst=/run/secrets/firebase.json,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxKeyFile},dst=/run/secrets/technical-sandbox-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxWebhookFile},dst=/run/secrets/technical-sandbox-webhook,readonly`,
      runtime.image,
    ], redacted: true },
    { phase: 'candidate_provider_network_attach', command: 'docker', args: ['network', 'connect', target.providerNetwork, `sit-green-acceptance-${runtime.runtimeCommit.slice(0, 12)}`] },
    { phase: 'candidate_health_and_feature_probes', command: 'curl', args: ['--fail', '--silent', '--show-error', 'http://127.0.0.1:18082/health/live'] },
    { phase: 'candidate_ready_probe', command: 'curl', args: ['--fail', '--silent', '--show-error', 'http://127.0.0.1:18082/health/ready'] },
    { phase: 'candidate_cleanup', command: 'docker', args: ['rm', '--force', `sit-green-acceptance-${runtime.runtimeCommit.slice(0, 12)}`] },
    { phase: 'candidate_cleanup_verify', command: 'docker', args: ['ps', '--all', '--filter', `name=^/sit-green-acceptance-${runtime.runtimeCommit.slice(0, 12)}$`, '--format', '{{.Names}}'] },
    { phase: 'final_create_no_host_port', command: 'docker', args: [
      'create', '--name', target.apiContainer, '--restart', 'no', '--network', target.network,
      '--env-file', configFile,
      '--mount', `type=volume,src=${target.uploadsVolume},dst=/data/uploads,readonly=false`,
      '--mount', `type=bind,src=${runtimeConfig.mfaFile},dst=/run/secrets/mfa-encryption-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.firebaseFile},dst=/run/secrets/firebase.json,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxKeyFile},dst=/run/secrets/technical-sandbox-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxWebhookFile},dst=/run/secrets/technical-sandbox-webhook,readonly`,
      runtime.image,
    ], redacted: true },
    { phase: 'final_provider_network_attach', command: 'docker', args: ['network', 'connect', target.providerNetwork, target.apiContainer] },
    { phase: 'final_start', command: 'docker', args: ['start', target.apiContainer] },
    { phase: 'public_live_readback', command: 'curl', args: ['--fail', '--silent', '--show-error', `${process.env.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com'}/health/live`] },
    { phase: 'public_ready_readback', command: 'curl', args: ['--fail', '--silent', '--show-error', `${process.env.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com'}/health/ready`] },
  ];
  if (commands.some((entry) => entry.args?.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg)))) {
    fail('green_command_secret_leak');
  }
  return Object.freeze(commands.map((entry) => Object.freeze({ ...entry, args: entry.args ? [...entry.args] : undefined })));
}

export function sanitizeGreenEvidence({ plan, backupDigest, configDigest, targetReadback, imageReadback } = {}) {
  if (!plan || plan.kind !== 'sit-green-promotion-plan') fail('green_plan_required');
  safeDigest(backupDigest, 'green_backup_digest_invalid');
  safeDigest(configDigest, 'green_config_digest_invalid');
  if (typeof targetReadback !== 'object' || typeof imageReadback !== 'object') fail('green_readback_required');
  const evidence = {
    kind: 'sit-green-promotion',
    status: 'prepared',
    target: {
      composeProject: plan.target.composeProject,
      apiContainer: plan.target.apiContainer,
      databaseContainer: plan.target.databaseContainer,
      network: plan.target.network,
      providerNetwork: plan.target.providerNetwork,
      uploadsVolume: plan.target.uploadsVolume,
      sourceSchema: plan.target.sourceSchema,
      currentSchema: plan.target.currentSchema,
      targetDigest: plan.target.targetDigest,
    },
    runtime: { commit: plan.runtime.runtimeCommit, image: plan.runtime.image, digest: plan.runtime.digest },
    opsCommit: plan.opsCommit,
    backupSha256: backupDigest,
    configSha256: configDigest,
    readback: { target: { ...targetReadback }, image: { ...imageReadback } },
    redaction: 'sensitive values omitted',
  };
  const serialized = JSON.stringify(evidence);
  if (/password|secret|token|DATABASE_URL|JWT_SECRET|whsec_|sk_live_|sk_test_/iu.test(serialized)) fail('green_evidence_secret_leak');
  return Object.freeze(evidence);
}

export async function writeGreenEvidence(filePath, evidence) {
  safePath(filePath, 'green_evidence_path_invalid');
  const parent = dirname(filePath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentMeta = await lstat(parent);
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : parentMeta.uid;
  if (!parentMeta.isDirectory() || parentMeta.isSymbolicLink() || (parentMeta.mode & 0o777) !== 0o700 || parentMeta.uid !== ownerUid) {
    fail('green_evidence_directory_unsafe');
  }
  const serialized = `${JSON.stringify(evidence)}\n`;
  if (/DATABASE_URL|JWT_SECRET|password|token|whsec_|sk_live_|sk_test_/iu.test(serialized)) fail('green_evidence_secret_leak');
  try {
    await writeFile(filePath, serialized, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('green_evidence_path_exists');
    throw error;
  }
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== ownerUid) fail('green_evidence_permissions_invalid');
  return Object.freeze({ path: filePath, sha256: sha256(serialized) });
}

export function assertGreenCleanup({ removed, verifiedAbsent, oldApiSealed, oldApiRunning } = {}) {
  if (!Array.isArray(removed) || !Array.isArray(verifiedAbsent)
      || removed.length !== verifiedAbsent.length
      || oldApiSealed !== true || oldApiRunning !== false) fail('green_cleanup_incomplete');
  if (removed.some((name) => /shareittoo_staging|prod|production|shareittoo-staging-api$/iu.test(name))) {
    fail('green_cleanup_touched_protected_resource');
  }
  return true;
}

export function assertGreenPromotionExecutionAllowed({ environment = process.env, plan } = {}) {
  if (environment.GREEN_STAGING_PROMOTION_EXECUTE !== '1') fail('explicit_green_execute_flag_required');
  if (environment.GREEN_STAGING_PROMOTION_CONFIRM !== plan?.runtime?.runtimeCommit) fail('exact_green_confirmation_required');
  return true;
}

export function runGreenCommand(command, args, { cwd = repositoryRoot, env = process.env, phase = 'green_command', binary = false } = {}) {
  if (args.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg))) {
    return Promise.reject(Object.assign(new Error(`Green staging promotion failed: ${phase}_secret_argument`), { code: `${phase}_secret_argument` }));
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = binary ? [] : '';
    let stderr = '';
    if (!binary) child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { if (binary) stdout.push(Buffer.from(chunk)); else stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', () => reject(Object.assign(new Error(`Green staging promotion failed: ${phase}`), { code: `${phase}_spawn_failed` })));
    child.once('close', (code) => {
      if (code === 0) resolvePromise(Object.freeze({ stdout: binary ? Buffer.concat(stdout) : stdout, stderr }));
      else reject(Object.assign(new Error(`Green staging promotion failed: ${phase}`), { code: `${phase}_failed` }));
    });
  });
}

export async function runGreenPromotion({ plan, config, configFile, environment = process.env, execute = false, command = runGreenCommand } = {}) {
  assertGreenPromotionExecutionAllowed({ environment, plan });
  if (!execute) fail('explicit_green_execute_flag_required');
  if (typeof command !== 'function') fail('green_command_runner_required');
  const protectedEnv = await readProtectedEnv(configFile);
  const commandEnv = Object.freeze({ ...environment, ...protectedEnv });
  const commands = buildGreenPromotionCommands({ plan, configFile, config });
  const completed = [];
  const readbacks = {};
  for (const entry of commands) {
    if (entry.redacted !== true && entry.stdoutFile) {
      const result = await command(entry.command, entry.args, { phase: entry.phase, env: commandEnv, binary: entry.binary === true });
      const backupPath = resolve(entry.stdoutFile);
      await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
      const parentMeta = await lstat(dirname(backupPath));
      const ownerUid = typeof process.getuid === 'function' ? process.getuid() : parentMeta.uid;
      if (!parentMeta.isDirectory() || parentMeta.isSymbolicLink() || (parentMeta.mode & 0o777) !== 0o700 || parentMeta.uid !== ownerUid) fail('green_backup_directory_unsafe');
      await writeFile(backupPath, result.stdout, { flag: 'wx', mode: 0o600 });
      const backupMeta = await lstat(backupPath);
      if (!backupMeta.isFile() || backupMeta.isSymbolicLink() || (backupMeta.mode & 0o777) !== 0o600 || backupMeta.uid !== ownerUid) fail('green_backup_permissions_invalid');
      completed.push(entry.phase);
      continue;
    }
    const result = await command(entry.command, entry.args, { phase: entry.phase, env: commandEnv });
    if (entry.phase.startsWith('target_inventory_') || entry.phase === 'source_schema_readback') {
      readbacks[entry.phase] = result.stdout?.trim() ?? '';
    }
    if (entry.phase === 'candidate_cleanup_verify' && result.stdout?.trim()) fail('green_candidate_cleanup_incomplete');
    if (entry.phase === 'source_schema_readback') {
      const parseInspect = (phase) => {
        try { return JSON.parse(readbacks[phase]); } catch { fail('green_inventory_readback_invalid'); }
      };
      const api = parseInspect('target_inventory_api');
      const database = parseInspect('target_inventory_database');
      const network = parseInspect('target_inventory_network');
      const providerNetwork = parseInspect('target_inventory_provider_network');
      const uploadsVolume = parseInspect('target_inventory_uploads');
      const unwrap = (value) => Array.isArray(value) ? value[0] : value;
      const apiRecord = unwrap(api);
      const databaseRecord = unwrap(database);
      const networkRecord = unwrap(network);
      const providerRecord = unwrap(providerNetwork);
      const volumeRecord = unwrap(uploadsVolume);
      const hostPorts = Object.values(apiRecord?.NetworkSettings?.Ports ?? {}).flat().filter(Boolean).length;
      assertGreenContainerInventory({
        api: { name: apiRecord?.Name?.replace(/^\//u, ''), greenLabel: apiRecord?.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', hostPorts, running: apiRecord?.State?.Running === true },
        database: { name: databaseRecord?.Name?.replace(/^\//u, ''), greenLabel: databaseRecord?.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', running: databaseRecord?.State?.Running === true },
        network: { name: networkRecord?.Name, internal: networkRecord?.Internal === true },
        providerNetwork: { name: providerRecord?.Name },
        uploadsVolume: { name: volumeRecord?.Name },
        schema: Number(readbacks.source_schema_readback),
      });
    }
    completed.push(entry.phase);
  }
  return Object.freeze({ status: 'executed', completedPhases: Object.freeze(completed) });
}

async function main() {
  // The executable path intentionally requires a caller-supplied protected manifest/config.
  // This package does not execute Docker/SSH in CI or without the explicit operational gate.
  const target = await readProtectedGreenManifest(process.env.GREEN_STAGING_TARGET_MANIFEST ?? '');
  const configPath = process.env.GREEN_STAGING_CONFIG_MANIFEST;
  const config = await readProtectedJson(configPath, 'green_config_manifest_missing');
  const plan = buildGreenPromotionPlan({
    targetManifest: target,
    config,
    runtimeCommit: process.argv[2],
    runtimeImageDigest: process.env.GREEN_RUNTIME_IMAGE_DIGEST,
    opsCommit: process.env.GREEN_STAGING_OPS_COMMIT,
    evidenceFile: process.env.GREEN_STAGING_EVIDENCE_FILE,
  });
  await runGreenPromotion({
    plan,
    config,
    configFile: config.envFile,
    environment: process.env,
    execute: true,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'green_staging_promotion_failed'}\n`);
    process.exitCode = 1;
  });
}
