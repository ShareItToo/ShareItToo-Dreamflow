#!/usr/bin/env node

import crypto from 'node:crypto';
import { lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { closeStablePrivateFile, openStablePrivateFile, readStablePrivateFile } from './stable_private_file.mjs';
import { assertReadinessFindingsUnchanged, buildReadinessFindingSql, normalizeReadinessFindings } from './staging_forward_migration_rehearsal.mjs';

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
  databaseName: 'shareittoo_green',
  databaseUser: 'shareittoo_green',
  runId: '20260918011528-wp254',
  sourceSchema: 92,
  currentSchema: 95,
  prePromotionImage: 'ghcr.io/shareittoo/shareittoo-api:ccc72004247d50656ac1064a758eb5f05c795e04',
  sourceLedgerDigest: '4199b60d7b3b19ed0cfeb113e121b77c23eeb03440f212a7dbe593c3cbee1db5',
  currentLedgerDigest: 'b31bd8054569f851a4fed0798fb0d8b971282256461e764529564cd14d2e802f',
  currentMigration: '095_staging_google_registration_replays.up.sql',
});

export const syntheticSandboxCredentialFilePath = '/docker/shareittoo/staging-secrets/synthetic-sandbox-user-password';

export const greenAllowedEnvNames = Object.freeze([
  'NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'APP_COMMIT', 'APP_BUILD_TIMESTAMP',
  'PORT', 'BIND_HOST', 'DATABASE_URL', 'JWT_SECRET', 'JWT_ISSUER',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_FROM', 'PAYMENT_TRANSPORT',
  'STRIPE_LIVEMODE', 'IDENTITY_VERIFICATION_TRANSPORT', 'PUSH_TRANSPORT',
  'ENABLE_STAGING_STRIPE',
  'MAIL_TRANSPORT', 'SIT_STAGING_PILOT_ID', 'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_PROVIDER',
  'SIT_LISTING_AI_MODEL', 'SIT_LISTING_AI_BUDGET_MINOR',
  'TECHNICAL_SANDBOX_AVAILABLE',
  'TECHNICAL_SANDBOX_USER_IDS', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE',
  'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE', 'SYNTHETIC_SANDBOX_PASSWORD_FILE',
  'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED',
]);

const forbiddenGreenEnvNames = new Set([
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY_FILE', 'STRIPE_WEBHOOK_SECRET_FILE', 'STRIPE_CONNECT_WEBHOOK_SECRET_FILE',
  'OPENAI_API_KEY', 'OPENAI_API_KEY_FILE',
]);

export function containsForbiddenGreenTargetIdentifier(value) {
  return typeof value === 'string'
    && /(?:^|[^a-z0-9])(?:prod|production)(?=$|[^a-z0-9])/iu.test(value);
}

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
  'NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'JWT_SECRET',
  'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE',
  'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER',
  'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', 'SIT_STAGING_ACCESS_GATE_ENABLED', 'SIT_STAGING_ALLOWED_USER_IDS',
  'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'FIREBASE_PROJECT_ID',
  'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_VERIFICATION_ENABLED',
  'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_BUDGET_CENTS',
  'ENABLE_STAGING_STRIPE', 'TECHNICAL_SANDBOX_ENABLED', 'TECHNICAL_SANDBOX_KILL_SWITCH',
  'TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ID',
  'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT', 'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT',
  'SIT_STAGING_PILOT_ID', 'SYNTHETIC_SANDBOX_PASSWORD_FILE',
]);

export function assertGreenProtectedEnvironment(values, config) {
  if (values.NODE_ENV !== 'production' || values.DEPLOYMENT_ENVIRONMENT !== 'test'
      || values.FIREBASE_AUTH_ENABLED !== 'false'
      || values.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || values.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || String(values.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '').trim() !== ''
      || values.SIT_STAGING_ACCESS_GATE_ENABLED !== 'true'
      || values.ENABLE_STAGING_STRIPE !== '0' || values.PAYMENT_TRANSPORT !== 'memory'
      || values.STRIPE_LIVEMODE !== 'false' || values.TECHNICAL_SANDBOX_ENABLED !== '1'
      || values.TECHNICAL_SANDBOX_KILL_SWITCH !== '0' || values.SIT_STAGING_PILOT_ID !== 'heilbronn_wave0'
      || values.SIT_STAGING_COMPOSE_PROJECT !== 'sit-green'
      || values.TECHNICAL_SANDBOX_SECRET_KEY_FILE !== '/run/secrets/technical-sandbox-key'
      || values.TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE !== '/run/secrets/technical-sandbox-webhook'
      || values.SYNTHETIC_SANDBOX_PASSWORD_FILE !== syntheticSandboxCredentialFilePath
      || !String(values.SIT_STAGING_ALLOWED_USER_IDS ?? '').split(',').map((entry) => entry.trim()).includes('synthetic_sandbox_user_pilot_20260919')
      || config?.mfaFile === undefined) fail('green_runtime_environment_boundary_invalid');
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'OPENAI_API_KEY']) {
    if (Object.hasOwn(values, name) && values[name] !== '') fail('green_main_provider_secret_forbidden');
  }
  return true;
}

export function assertGreenRuntimeEnvironmentReadback(values) {
  const allowlistEmpty = Object.hasOwn(values ?? {}, 'googleRegistrationAllowlistEmpty')
    ? values.googleRegistrationAllowlistEmpty === true
    : String(values?.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '').trim() === '';
  if (values?.DEPLOYMENT_ENVIRONMENT !== 'test'
      || values?.FIREBASE_AUTH_ENABLED !== 'false'
      || values?.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || values?.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || !allowlistEmpty
      || values?.SIT_STAGING_ACCESS_GATE_ENABLED !== 'true'
      || values?.PAYMENT_TRANSPORT !== 'memory'
      || values?.STRIPE_LIVEMODE !== 'false') fail('green_runtime_prestate_readback_invalid');
  return true;
}

function fail(code) {
  const error = new Error(`Green staging promotion failed: ${code}`);
  error.code = code;
  throw error;
}

function parseReadbackJson(value, code) {
  try { return JSON.parse(String(value ?? '').trim()); } catch { fail(code); }
}

function assertGreenTargetContainerSet(value, target = greenTarget) {
  const rows = String(value ?? '').split(/\r?\n/u).filter((line) => line.length > 0).map((line) => {
    const [name, project, service, greenLabel, runId, ...extra] = line.split('\t');
    if (!name || extra.length > 0) fail('green_target_container_set_invalid');
    return { name, project, service, greenLabel, runId };
  });
  const expectedNames = new Set([target.apiContainer, target.databaseContainer]);
  const legacyNames = new Set(['shareittoo-staging-postgres', 'shareittoo_staging_backend', 'shareittoo_staging_postgres_data']);
  const relevant = rows.filter((row) => expectedNames.has(row.name) || row.greenLabel === 'true'
    || ((!legacyNames.has(row.name)) && /^(?:shareittoo-staging-api|sit-green-postgres)(?:[-_]|$)/u.test(row.name)));
  const excludedLegacy = rows.filter((row) => legacyNames.has(row.name));
  if (excludedLegacy.some((row) => row.greenLabel === 'true')) fail('green_target_container_set_invalid');
  const expected = new Map([
    [target.apiContainer, { project: '', service: '', greenLabel: 'true', runId: target.runId }],
    [target.databaseContainer, { project: '', service: '', greenLabel: 'true', runId: '' }],
  ]);
  if (relevant.length !== expected.size || new Set(relevant.map((row) => row.name)).size !== expected.size) fail('green_target_container_set_invalid');
  for (const row of relevant) {
    const contract = expected.get(row.name);
    if (!contract || row.project !== contract.project || row.service !== contract.service
        || row.greenLabel !== contract.greenLabel || row.runId !== contract.runId) fail('green_target_container_set_invalid');
  }
  return true;
}

function normalizedGreenForeignWriterSet(value) {
  const rows = parseReadbackJson(value, 'green_foreign_writer_readback_invalid');
  if (!Array.isArray(rows)) fail('green_foreign_writer_readback_invalid');
  const normalized = rows.map((row) => {
    exactKeys(row, ['role', 'application', 'client', 'state'], 'green_foreign_writer_readback_invalid');
    for (const field of ['role', 'application', 'client', 'state']) {
      if (typeof row[field] !== 'string' || row[field].length > 128 || /[\u0000-\u001f]/u.test(row[field])) fail('green_foreign_writer_readback_invalid');
    }
    return { role: row.role, application: row.application, client: row.client, state: row.state };
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (normalized.length !== 0) fail('green_foreign_writer_present');
  return JSON.stringify(normalized);
}

function normalizedGreenFindingFingerprint(value, code) {
  try { return normalizeReadinessFindings(parseReadbackJson(value, code)); } catch (error) { if (error?.code === 'readiness_fingerprint_shape_invalid' || error?.code?.startsWith('readiness_fingerprint_')) fail(code); throw error; }
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

export function normalizedGreenTargetDigest(manifest) {
  const fields = ['kind', 'schemaVersion', 'composeProject', 'greenLabel', 'runId', 'apiContainer', 'databaseContainer', 'databaseVolume', 'network', 'providerNetwork', 'uploadsVolume', 'networkInternal', 'sourceSchema', 'currentSchema', 'prePromotionImage'];
  return sha256(JSON.stringify(Object.fromEntries(fields.map((field) => [field, manifest?.[field]]))));
}

function schemaNumberFromName(value, code) {
  const match = /^(\d+)(?:_|$)/u.exec(String(value ?? '').trim());
  if (!match) fail(code);
  return Number(match[1]);
}

function currentMigrationFromReadback(value, code) {
  const migration = String(value ?? '').trim();
  if (migration !== greenTarget.currentMigration
      || schemaNumberFromName(migration, code) !== greenTarget.currentSchema) fail(code);
  return migration;
}

function assertMigrationLedgerReadback(value, expectedSchema, expectedDigest, code) {
  const ledger = String(value ?? '');
  const normalized = ledger.endsWith('\n') ? ledger : `${ledger}\n`;
  const rows = normalized.trimEnd().split('\n').filter(Boolean);
  const numbers = rows.map((row) => {
    const match = /^(\d+)_[^|]+\.up\.sql\|([0-9a-f]{64})$/u.exec(row);
    if (!match) fail(code);
    return Number(match[1]);
  });
  const digest = sha256(normalized);
  if (digest !== expectedDigest
      || rows.length !== expectedSchema
      || new Set(numbers).size !== expectedSchema
      || Math.min(...numbers) !== 1
      || Math.max(...numbers) !== expectedSchema) fail(code);
  return Object.freeze({ count: rows.length, min: 1, max: expectedSchema, digest });
}

export function assertGreenRuntimeReadbacks({ version, health, ready, runtimeCommit } = {}) {
  if (version?.commit !== runtimeCommit || version?.environment !== 'test') fail('green_runtime_version_mismatch');
  for (const payload of [health, ready]) {
    if (payload?.checks?.technicalSandbox?.available !== true
        || payload.checks.technicalSandbox.amountMinor !== 100
        || payload.checks.technicalSandbox.currency !== 'EUR'
        || payload.checks?.identityVerification?.provider !== 'memory'
        || payload.checks?.listingAi?.provider !== 'on_device') fail('green_runtime_capability_readback_invalid');
  }
  return true;
}

export function assertGreenTargetManifest(manifest) {
  exactKeys(manifest, [
    'kind', 'schemaVersion', 'composeProject', 'greenLabel', 'runId',
    'apiContainer', 'databaseContainer', 'databaseVolume', 'network',
    'providerNetwork', 'uploadsVolume', 'networkInternal', 'sourceSchema',
    'currentSchema', 'prePromotionImage', 'targetDigest',
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
      || manifest.currentSchema !== greenTarget.currentSchema
      || manifest.prePromotionImage !== greenTarget.prePromotionImage) {
    fail('green_target_identity_mismatch');
  }
  if (!/^[0-9a-f]{64}$/u.test(manifest.targetDigest ?? '') || manifest.targetDigest !== normalizedGreenTargetDigest(manifest)) fail('green_target_digest_invalid');
  const serialized = JSON.stringify(manifest);
  if (/shareittoo_staging|shareittoo-staging-postgres|latest|lookalike/iu.test(serialized)
      || containsForbiddenGreenTargetIdentifier(serialized)) fail('legacy_or_production_target_forbidden');
  return Object.freeze({ ...manifest });
}

export async function readProtectedGreenManifest(filePath) {
  safePath(filePath, 'green_manifest_path_invalid');
  let manifest;
  try {
    manifest = JSON.parse(readStablePrivateFile(filePath, {
      expectedMode: 0o600,
      expectedUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
      code: 'green_manifest_must_be_regular_0600',
    }));
  } catch (error) {
    if (error?.code === 'green_manifest_must_be_regular_0600') throw error;
    fail(error?.code === 'ELOOP' ? 'green_manifest_symlink_forbidden' : 'green_manifest_json_invalid');
  }
  return assertGreenTargetManifest(manifest);
}

async function readProtectedJson(filePath, missingCode) {
  safePath(filePath, `${missingCode}_path_invalid`);
  try {
    return JSON.parse(readStablePrivateFile(filePath, {
      expectedMode: 0o600,
      expectedUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
      code: `${missingCode}_must_be_regular_0600`,
    }));
  } catch (error) {
    if (error?.code === `${missingCode}_must_be_regular_0600`) throw error;
    fail(error?.code === 'ELOOP' ? `${missingCode}_symlink_forbidden` : `${missingCode}_json_invalid`);
  }
}

async function readProtectedEnv(filePath) {
  safePath(filePath, 'green_env_file');
  let content;
  try {
    content = readStablePrivateFile(filePath, {
      expectedMode: 0o600,
      expectedUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
      code: 'green_env_file_must_be_regular_0600',
    });
  } catch (error) {
    if (error?.code === 'green_env_file_must_be_regular_0600') throw error;
    fail(error?.code === 'ELOOP' ? 'green_env_file_symlink_forbidden' : 'green_env_file_missing');
  }
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || (!isAllowedGreenEnvName(match[1]) && !(forbiddenGreenEnvNames.has(match[1]) && match[2] === '')) || Object.hasOwn(values, match[1])) fail('green_env_file_allowlist_invalid');
    values[match[1]] = match[2];
  }
  return Object.freeze(values);
}

async function readExecutionEnv(filePath) {
  safePath(filePath, 'green_execution_env_file');
  let content;
  try {
    content = readStablePrivateFile(filePath, {
      expectedMode: 0o600,
      expectedUid: typeof process.getuid === 'function' ? process.getuid() : undefined,
      code: 'green_execution_env_file_must_be_regular_0600',
    });
  } catch (error) {
    if (error?.code === 'green_execution_env_file_must_be_regular_0600') throw error;
    fail(error?.code === 'ELOOP' ? 'green_execution_env_file_symlink_forbidden' : 'green_execution_env_file_missing');
  }
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match || Object.hasOwn(values, match[1])) fail('green_execution_env_file_invalid');
    values[match[1]] = match[2];
  }
  return Object.freeze(values);
}

async function assertProtectedFile(filePath, mode, uid, gid, code) {
  safePath(filePath, `${code}_path_invalid`);
  try {
    const opened = openStablePrivateFile(filePath, {
      expectedMode: mode,
      expectedUid: uid,
      expectedGid: gid,
      code: `${code}_metadata_invalid`,
    });
    closeStablePrivateFile(opened);
  } catch (error) {
    if (error?.code === `${code}_metadata_invalid`) throw error;
    fail(error?.code === 'ELOOP' ? `${code}_symlink_forbidden` : `${code}_missing`);
  }
  return true;
}

export async function assertGreenProtectedRuntimeFiles(config, protectedEnv) {
  await assertProtectedFile(config.mfaFile, 0o640, 0, 101, 'green_mfa_file');
  await assertProtectedFile(config.firebaseFile, 0o640, 0, 65532, 'green_firebase_file');
  await assertProtectedFile(config.technicalSandboxKeyFile, 0o600, 100, 101, 'green_technical_key_file');
  await assertProtectedFile(config.technicalSandboxWebhookFile, 0o600, 100, 101, 'green_technical_webhook_file');
  if (protectedEnv.SYNTHETIC_SANDBOX_PASSWORD_FILE !== syntheticSandboxCredentialFilePath) {
    fail('green_synthetic_password_file_path_invalid');
  }
  await assertProtectedFile(syntheticSandboxCredentialFilePath, 0o600, 100, 101, 'green_synthetic_password_file');
  return true;
}

export function assertGreenRuntimeConfig(config) {
  exactKeys(config, requiredConfigKeys, 'green_config_shape_invalid');
  safePath(config.envFile, 'green_env_file_invalid');
  safePath(config.mfaFile, 'green_mfa_file_invalid');
  safePath(config.firebaseFile, 'green_firebase_file_invalid');
  safePath(config.technicalSandboxKeyFile, 'green_technical_key_file_invalid');
  safePath(config.technicalSandboxWebhookFile, 'green_technical_webhook_file_invalid');
  if (config.environment !== 'test'
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
    if (mount.readOnly !== true && mount.destination !== '/data/uploads') fail('green_mount_must_be_read_only');
  }
  const destinations = new Set(config.mounts.map((mount) => mount.destination));
  for (const destination of ['/run/secrets/mfa-encryption-key', '/run/secrets/firebase-service-account.json', '/run/secrets/technical-sandbox-key', '/run/secrets/technical-sandbox-webhook', '/data/uploads']) {
    if (!destinations.has(destination)) fail('green_mount_inventory_incomplete');
  }
  const uploadMount = config.mounts.find((mount) => mount.destination === '/data/uploads');
  if (uploadMount?.readOnly !== false) fail('green_upload_mount_must_be_writable');
  if (config.technicalSandboxKeyFile === config.technicalSandboxWebhookFile) fail('green_technical_files_not_distinct');
  return Object.freeze({ ...config, envNames: [...config.envNames], mounts: config.mounts.map((mount) => Object.freeze({ ...mount })) });
}

export function assertGreenRuntimeImage({ image, digest, runtimeCommit } = {}) {
  fullCommit(runtimeCommit, 'runtime_commit');
  if (image !== `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`) fail('runtime_image_tag_mismatch');
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(digest)) fail('runtime_image_digest_required');
  if (/latest|local/iu.test(image) || containsForbiddenGreenTargetIdentifier(image)) fail('runtime_image_unsafe');
  return Object.freeze({ image, digest, runtimeCommit });
}

export function assertGreenImageReadback(readback, runtime) {
  if (!readback || readback.Config?.Labels?.['org.opencontainers.image.revision'] !== runtime.runtimeCommit
      || readback.Config?.User !== 'shareittoo'
      || !(readback.RepoDigests ?? []).some((entry) => entry.endsWith(`@${runtime.digest}`))) fail('green_image_readback_mismatch');
  return true;
}

function expectedGreenSourceMounts(runtimeConfig) {
  const expected = [
    { destination: '/data/uploads', type: 'volume', source: null, volume: greenTarget.uploadsVolume, readOnly: false },
    { destination: '/run/secrets/firebase-service-account.json', type: 'bind', source: runtimeConfig?.firebaseFile, volume: null, readOnly: true },
    { destination: '/run/secrets/mfa-encryption-key', type: 'bind', source: runtimeConfig?.mfaFile, volume: null, readOnly: true },
    { destination: '/run/secrets/technical-sandbox-key', type: 'bind', source: runtimeConfig?.technicalSandboxKeyFile, volume: null, readOnly: true },
    { destination: '/run/secrets/technical-sandbox-webhook', type: 'bind', source: runtimeConfig?.technicalSandboxWebhookFile, volume: null, readOnly: true },
  ];
  if (expected.some((mount) => typeof mount.source !== 'string' && mount.type === 'bind')) fail('green_prepromotion_mount_identity_missing');
  return expected.sort((left, right) => left.destination.localeCompare(right.destination));
}

function normalizedGreenSourceMounts(mounts) {
  if (!Array.isArray(mounts)) fail('green_prepromotion_mount_identity_missing');
  if (mounts.some((mount) => typeof mount.readOnly !== 'boolean')) fail('green_mount_rw_readback_invalid');
  return mounts.map((mount) => ({
    destination: mount.destination,
    type: mount.type,
    source: mount.type === 'bind' ? (mount.source ?? null) : null,
    volume: mount.type === 'volume' ? (mount.volume ?? null) : null,
    readOnly: mount.readOnly,
  })).sort((left, right) => left.destination.localeCompare(right.destination));
}

export function assertGreenContainerInventory(inventory, expectedSourceSchema = greenTarget.sourceSchema, expectedPrePromotionImage, runtimeConfig) {
  exactKeys(inventory, ['api', 'database', 'network', 'providerNetwork', 'uploadsVolume', 'schema'], 'green_inventory_shape_invalid');
  if (inventory.api.name !== greenTarget.apiContainer
      || inventory.database.name !== greenTarget.databaseContainer
      || inventory.network.name !== greenTarget.network
      || inventory.providerNetwork.name !== greenTarget.providerNetwork
      || inventory.uploadsVolume.name !== greenTarget.uploadsVolume
      || inventory.network.internal !== true
      || (inventory.api.greenLabel !== true && inventory.api.prePromotionTuple !== true)
      || inventory.database.greenLabel !== true
      || inventory.api.hostPorts !== 0
      || inventory.api.running !== true
      || inventory.database.running !== true
      || inventory.schema !== expectedSourceSchema) {
    fail('green_inventory_mismatch');
  }
  if (typeof expectedPrePromotionImage !== 'string'
      || inventory.api.image !== expectedPrePromotionImage
        || inventory.api.networks?.slice().sort().join('|') !== [greenTarget.network, greenTarget.providerNetwork].sort().join('|')
        || inventory.api.databaseHost !== greenTarget.databaseContainer
        || inventory.api.databaseName !== greenTarget.databaseName
        || inventory.api.databaseUser !== greenTarget.databaseUser
        || inventory.api.user !== 'shareittoo'
        || inventory.api.uploadsVolume !== greenTarget.uploadsVolume
      || inventory.api.groupAdd !== true
      || JSON.stringify(normalizedGreenSourceMounts(inventory.api.mounts)) !== JSON.stringify(expectedGreenSourceMounts(runtimeConfig))) {
    fail('green_prepromotion_tuple_mismatch');
  }
  return true;
}

export function assertGreenFinalContainerReadback({ record, plan } = {}) {
  if (!record || !plan) fail('green_final_inventory_required');
  const name = String(record.Name ?? '').replace(/^\//u, '');
  const ports = Object.values(record.NetworkSettings?.Ports ?? {}).flat().filter(Boolean);
  const networks = Object.keys(record.NetworkSettings?.Networks ?? {}).sort();
  const mounts = record.Mounts ?? [];
  if (mounts.some((mount) => typeof mount.RW !== 'boolean')) fail('green_mount_rw_readback_invalid');
  const destinations = mounts.map((mount) => mount.Destination).sort();
  const env = Object.fromEntries((record.Config?.Env ?? []).map((entry) => entry.split(/=(.*)/u, 2)));
  assertGreenRuntimeEnvironmentReadback(env);
  if (name !== plan.target.apiContainer
      || record.State?.Running !== true
      || ports.length !== 0
      || networks.join('|') !== [plan.target.network, plan.target.providerNetwork].sort().join('|')
      || record.Config?.Labels?.['com.shareittoo.sit.green'] !== 'true'
      || record.Config?.Labels?.['com.shareittoo.sit.green.run_id'] !== plan.target.runId
      || record.Config?.Image !== `${plan.runtime.image}@${plan.runtime.digest}`
      || record.Config?.User !== 'shareittoo'
      || !(record.HostConfig?.GroupAdd ?? []).includes('65532')
      || destinations.join('|') !== ['/data/uploads', '/run/secrets/firebase-service-account.json', '/run/secrets/mfa-encryption-key', '/run/secrets/technical-sandbox-key', '/run/secrets/technical-sandbox-webhook'].sort().join('|')
      || env.PAYMENT_TRANSPORT !== 'memory'
      || env.STRIPE_LIVEMODE !== 'false'
      || env.SIT_STAGING_COMPOSE_PROJECT !== plan.target.composeProject
      || env.SIT_STAGING_ALLOWED_USER_IDS?.split(',').map((entry) => entry.trim()).includes('synthetic_sandbox_user_pilot_20260919') !== true) {
    fail('green_final_inventory_mismatch');
  }
  const expectedMounts = plan.finalMounts;
  if (!Array.isArray(expectedMounts) || expectedMounts.length !== 5 || mounts.length !== expectedMounts.length) {
    fail('green_final_mount_inventory_mismatch');
  }
  const normalizedExpected = expectedMounts.map((mount) => ({
    type: mount.type,
    source: mount.type === 'bind' ? mount.source : null,
    name: mount.type === 'volume' ? mount.name : null,
    destination: mount.destination,
    rw: mount.readOnly === false,
  })).sort((left, right) => left.destination.localeCompare(right.destination));
  const normalizedActual = mounts.map((mount) => {
    if (typeof mount.Type !== 'string' || typeof mount.Destination !== 'string' || typeof mount.RW !== 'boolean') {
      fail('green_final_mount_inventory_mismatch');
    }
    if (mount.Type === 'bind' && (typeof mount.Source !== 'string' || (mount.Name ?? null) !== null)) fail('green_final_mount_inventory_mismatch');
    if (mount.Type === 'volume' && (typeof mount.Name !== 'string' || mount.Name.length === 0)) fail('green_final_mount_inventory_mismatch');
    if (mount.Type !== 'bind' && mount.Type !== 'volume') fail('green_final_mount_inventory_mismatch');
    return {
      type: mount.Type,
      source: mount.Type === 'bind' ? mount.Source : null,
      name: mount.Type === 'volume' ? mount.Name : null,
      destination: mount.Destination,
      rw: mount.RW,
    };
  }).sort((left, right) => left.destination.localeCompare(right.destination));
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) fail('green_final_mount_inventory_mismatch');
  return true;
}

export function summarizeGreenFinalContainerReadback(record, plan) {
  assertGreenFinalContainerReadback({ record, plan });
  return Object.freeze({
    name: String(record.Name ?? '').replace(/^\//u, ''), running: record.State.Running === true,
    hostPorts: 0, networks: Object.keys(record.NetworkSettings.Networks).sort(),
    greenRunId: record.Config.Labels['com.shareittoo.sit.green.run_id'], image: record.Config.Image,
    groupAdd: [...(record.HostConfig.GroupAdd ?? [])].sort(),
    mountDestinations: (record.Mounts ?? []).map((mount) => ({ destination: mount.Destination, volume: mount.Name ?? null, readOnly: mount.RW !== true })).sort((left, right) => left.destination.localeCompare(right.destination)),
    protectedEnvDigest: sha256((record.Config.Env ?? []).filter((entry) => /^(?:PAYMENT_TRANSPORT|STRIPE_LIVEMODE|SIT_STAGING_COMPOSE_PROJECT|SIT_STAGING_ALLOWED_USER_IDS)=/u.test(entry)).sort().join('\n')),
  });
}

export function buildGreenPromotionPlan({
  targetManifest,
  config,
  runtimeCommit,
  runtimeImageDigest,
  opsCommit,
  evidenceFile,
  ownershipNonce,
} = {}) {
  const manifestTarget = assertGreenTargetManifest(targetManifest);
  if (typeof greenTarget.sealedApiContainer !== 'string' || !greenTarget.sealedApiContainer) fail('green_sealed_target_invalid');
  const target = Object.freeze({ ...manifestTarget, sealedApiContainer: greenTarget.sealedApiContainer });
  const runtime = assertGreenRuntimeImage({
    image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`,
    digest: runtimeImageDigest,
    runtimeCommit,
  });
  const runtimeConfig = assertGreenRuntimeConfig(config);
  const finalMountDestinations = new Set([
    '/data/uploads',
    '/run/secrets/firebase-service-account.json',
    '/run/secrets/mfa-encryption-key',
    '/run/secrets/technical-sandbox-key',
    '/run/secrets/technical-sandbox-webhook',
  ]);
  const finalMounts = runtimeConfig.mounts.filter((mount) => finalMountDestinations.has(mount.destination)).map((mount) => Object.freeze({
    type: mount.destination === '/data/uploads' ? 'volume' : 'bind',
    source: mount.destination === '/data/uploads' ? null : mount.source,
    name: mount.destination === '/data/uploads' ? target.uploadsVolume : null,
    destination: mount.destination,
    readOnly: mount.destination === '/data/uploads' ? false : mount.readOnly,
  }));
  if (finalMounts.length !== 5) fail('green_final_mount_contract_invalid');
  fullCommit(opsCommit, 'ops_commit');
  safePath(evidenceFile, 'green_evidence_path_invalid');
  const resolvedOwnershipNonce = ownershipNonce ?? crypto.randomBytes(16).toString('hex');
  if (!/^[0-9a-f]{32}$/u.test(resolvedOwnershipNonce)) fail('green_ownership_nonce_invalid');
  const isolatedSuffix = `${runtimeCommit.slice(0, 8)}-${resolvedOwnershipNonce}`;
  const isolated = {
    ownershipNonce: resolvedOwnershipNonce,
    rehearsalId: `green-${isolatedSuffix}`,
    candidate: `sit-grn-c-${isolatedSuffix}`,
    network: `sit-grn-r-net-${isolatedSuffix}`,
    volume: `sit-grn-r-vol-${isolatedSuffix}`,
    database: `sit-grn-r-db-${isolatedSuffix}`,
    uploadsVolume: `sit-grn-r-up-${isolatedSuffix}`,
    databaseName: 'green_rehearsal', databaseUser: 'green_rehearsal',
    envFile: `${evidenceFile}.isolated.env`,
  };
  return Object.freeze({
    kind: 'sit-green-promotion-plan',
    target,
    runtime,
    opsCommit,
    evidenceFile,
    isolated,
    finalMounts: Object.freeze(finalMounts),
    phases: Object.freeze([
      `validate exact Green inventory and manifest-bound source readback schema ${target.sourceSchema}; reject legacy/production/lookalikes`,
      'stop and seal only the active Green API and verify it is stopped before any backup or schema mutation',
      'read foreign writers before and after the fresh protected database backup, requiring an unchanged empty set',
      `restore backup into an internal run-scoped PostgreSQL target and migrate ${target.sourceSchema} to ${target.currentSchema} through ${greenTarget.currentMigration}`,
      'provision the synthetic sandbox user on the isolated target and run the immutable candidate there on loopback-only 18082',
      'require live/ready 200, MFA, Identity memory, on-device Listing AI and technical Sandbox capability probes',
      'cleanup and verify every isolated candidate/database/network/volume before touching Green',
      'stop and seal the observed Green API; never boot it after canonical schema migration',
      `explicitly migrate canonical Green ${target.sourceSchema} to ${target.currentSchema} through ${greenTarget.currentMigration}, read back the exact terminal migration, and provision the synthetic user on Green`,
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
    rollbackPolicy: Object.freeze({ beforeSchemaMigration: 'sealed Green API may be restored only before migration', afterSchemaMigration: 'old image restart forbidden; use protected backup and forward recovery only' }),
  });
}

export function buildGreenPromotionCommands({ plan, configFile, config } = {}) {
  if (!plan || plan.kind !== 'sit-green-promotion-plan') fail('green_plan_required');
  safePath(configFile, 'green_config_file_invalid');
  const runtimeConfig = assertGreenRuntimeConfig(config);
  const { target, runtime, isolated } = plan;
  if (!target || typeof target.sealedApiContainer !== 'string'
      || target.sealedApiContainer !== greenTarget.sealedApiContainer) fail('green_sealed_target_invalid');
  const inspect = (name) => ({ command: 'docker', args: ['inspect', '--format', '{{json .}}', name] });
  const provisionerSource = resolve(repositoryRoot, 'backend/ops/provision_synthetic_sandbox_user.mjs');
  const stablePrivateFileSource = resolve(repositoryRoot, 'backend/ops/stable_private_file.mjs');
  const provisionerMounts = [
    '--mount', `type=bind,src=${provisionerSource},dst=/app/ops/provision_synthetic_sandbox_user.mjs,readonly`,
    '--mount', `type=bind,src=${stablePrivateFileSource},dst=/app/ops/stable_private_file.mjs,readonly`,
    '--mount', `type=bind,src=${runtimeConfig.mfaFile},dst=/run/secrets/mfa-encryption-key,readonly`,
    '--mount', `type=bind,src=${runtimeConfig.firebaseFile},dst=/run/secrets/firebase-service-account.json,readonly`,
    '--mount', `type=bind,src=${runtimeConfig.technicalSandboxKeyFile},dst=/run/secrets/technical-sandbox-key,readonly`,
    '--mount', `type=bind,src=${runtimeConfig.technicalSandboxWebhookFile},dst=/run/secrets/technical-sandbox-webhook,readonly`,
    '--mount', `type=bind,src=${syntheticSandboxCredentialFilePath},dst=/run/secrets/synthetic-sandbox-user-password,readonly`,
  ];
  const provisionerPath = '/app/ops/provision_synthetic_sandbox_user.mjs';
  const immutableRuntimeImage = `${runtime.image}@${runtime.digest}`;
  const migrationLedgerReadbackSql = "SELECT name || '|' || checksum FROM schema_migrations ORDER BY name";
  const foreignWriterReadbackSql = "SELECT COALESCE(jsonb_agg(jsonb_build_object('role', usename, 'application', COALESCE(application_name, ''), 'client', COALESCE(host(client_addr), ''), 'state', state) ORDER BY usename, application_name, host(client_addr), state), '[]'::jsonb) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()";
  const findingFingerprintSql = buildReadinessFindingSql({ contractVersion: 'V5.2-2026-08-16', payoutHoldHours: 48 });
  const commands = [
    { phase: 'target_container_set_readback', command: 'docker', args: ['ps', '--format', '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.shareittoo.sit.green"}}\t{{.Label "com.shareittoo.sit.green.run_id"}}'] },
    { phase: 'target_inventory_api', ...inspect(target.apiContainer) },
    { phase: 'target_inventory_database', ...inspect(target.databaseContainer) },
    { phase: 'target_inventory_network', ...inspect(target.network) },
    { phase: 'target_inventory_provider_network', ...inspect(target.providerNetwork) },
    { phase: 'target_inventory_uploads', ...inspect(target.uploadsVolume) },
    { phase: 'sealed_name_conflict_check', command: 'docker', args: ['ps', '--all', '--filter', `name=^/${target.sealedApiContainer}$`, '--format', '{{.Names}}'] },
    { phase: 'runtime_image_readback', command: 'docker', args: ['image', 'inspect', '--format', '{{json .}}', runtime.image] },
    { phase: 'source_schema_readback', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName, '-Atc', "SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1"] },
    { phase: 'source_migration_ledger_readback', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName, '-Atc', migrationLedgerReadbackSql] },
    { phase: 'quiesce_green_api', command: 'docker', args: ['stop', target.apiContainer] },
    { phase: 'quiesce_green_api_verify', command: 'docker', args: ['inspect', '--format', '{{.State.Running}}', target.apiContainer] },
    { phase: 'seal_green_api', command: 'docker', args: ['rename', target.apiContainer, target.sealedApiContainer] },
    { phase: 'source_foreign_writer_readback_before_backup', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName, '-Atc', foreignWriterReadbackSql] },
    { phase: 'fresh_protected_backup', command: 'docker', args: ['exec', target.databaseContainer, 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName], stdoutFile: `${plan.evidenceFile}.pgdump`, binary: true },
    { phase: 'source_foreign_writer_readback_after_backup', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName, '-Atc', foreignWriterReadbackSql] },
    { phase: 'isolated_network_create', command: 'docker', args: ['network', 'create', '--internal', '--label', 'com.shareittoo.green.rehearsal=true', '--label', `com.shareittoo.green.rehearsal_id=${isolated.rehearsalId}`, isolated.network] },
    { phase: 'isolated_volume_create', command: 'docker', args: ['volume', 'create', '--label', 'com.shareittoo.green.rehearsal=true', '--label', `com.shareittoo.green.rehearsal_id=${isolated.rehearsalId}`, isolated.volume] },
    { phase: 'isolated_uploads_volume_create', command: 'docker', args: ['volume', 'create', '--label', 'com.shareittoo.green.rehearsal=true', '--label', `com.shareittoo.green.rehearsal_id=${isolated.rehearsalId}`, isolated.uploadsVolume] },
    { phase: 'isolated_postgres_create', command: 'docker', args: ['run', '--detach', '--network', isolated.network, '--name', isolated.database, '--label', 'com.shareittoo.sit.green=true', '--label', 'com.shareittoo.green.rehearsal=true', '--label', `com.shareittoo.green.rehearsal_id=${isolated.rehearsalId}`, '--network-alias', isolated.database, '--env-file', isolated.envFile, '--mount', `type=volume,src=${isolated.volume},dst=/var/lib/postgresql/data`, 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'] },
    { phase: 'isolated_postgres_wait', command: 'docker', args: ['exec', isolated.database, 'sh', '-c', 'for i in $(seq 1 60); do pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" && exit 0; sleep 1; done; exit 1'] },
    { phase: 'isolated_postgres_init_complete_log_readback', command: 'bash', args: ['-c', `logs=''; for i in $(seq 1 60); do logs=$(docker logs ${isolated.database} 2>&1 || true); if printf '%s\\n' "$logs" | grep -Fq -- 'PostgreSQL init process complete; ready for start up.'; then printf '%s\\n' "$logs"; exit 0; fi; sleep 1; done; printf '%s\\n' "$logs"; exit 1`] },
    { phase: 'isolated_postgres_stable_select_1', command: 'docker', args: ['exec', isolated.database, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', isolated.databaseUser, '-d', isolated.databaseName, '-Atqc', 'SELECT 1'] },
    { phase: 'isolated_postgres_stable_select_2', command: 'docker', args: ['exec', isolated.database, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', isolated.databaseUser, '-d', isolated.databaseName, '-Atqc', 'SELECT 1'] },
    { phase: 'isolated_restore', command: 'docker', args: ['exec', '-i', isolated.database, 'pg_restore', '-U', isolated.databaseUser, '-d', isolated.databaseName, '--no-owner', '--no-acl'], inputFile: `${plan.evidenceFile}.pgdump`, inputSource: 'fresh_protected_backup' },
    { phase: 'isolated_migrate_92_to_95', command: 'docker', args: ['run', '--rm', '--network', isolated.network, '--env-file', isolated.envFile, '--entrypoint', 'node', immutableRuntimeImage, '-e', "import('./src/migrations.js').then(async ({runMigrations})=>{const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});await runMigrations(pool);await pool.end();})"] },
    { phase: 'isolated_migration_readback', command: 'docker', args: ['exec', isolated.database, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', isolated.databaseUser, '-d', isolated.databaseName, '-Atc', "SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1"] },
    { phase: 'isolated_migration_ledger_readback', command: 'docker', args: ['exec', isolated.database, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', isolated.databaseUser, '-d', isolated.databaseName, '-Atc', migrationLedgerReadbackSql] },
    { phase: 'isolated_finding_fingerprint_readback', command: 'docker', args: ['exec', isolated.database, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', isolated.databaseUser, '-d', isolated.databaseName, '-Atc', findingFingerprintSql] },
    { phase: 'isolated_integrity_and_functional_probes', command: 'bash', args: ['backend/ops/check_foreign_key_integrity.sh'], envFile: isolated.envFile, runtimeEnv: { DATABASE_CONTAINER: isolated.database, DATABASE_USER: isolated.databaseUser, DATABASE_NAME: isolated.databaseName }, redacted: true },
    { phase: 'synthetic_sandbox_provision_isolated', command: 'docker', args: ['run', '--rm', '--user', '100:101', '--group-add', '65532', '--network', isolated.network, '--env-file', configFile, '--env-file', isolated.envFile, '--env', 'DEPLOYMENT_ENVIRONMENT=test', '--env', 'SIT_GREEN_REHEARSAL=1', '--env', 'SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password', ...provisionerMounts, '--entrypoint', 'node', immutableRuntimeImage, provisionerPath], envFile: isolated.envFile, redacted: true },
    { phase: 'candidate_acceptance_create', command: 'docker', args: [
      'create', '--name', isolated.candidate, '--group-add', '65532',
      '--network', isolated.network, '--network-alias', 'sit-green-acceptance-api',
      '--label', 'com.shareittoo.sit.green=true', '--label', `com.shareittoo.green.candidate=${plan.target.runId}`, '--label', `com.shareittoo.green.rehearsal=true`, '--label', `com.shareittoo.green.rehearsal_id=${isolated.rehearsalId}`,
      '--env-file', configFile, '--env-file', isolated.envFile, '--env', 'SIT_GREEN_REHEARSAL=1', '--env', 'SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password', '--publish', '127.0.0.1:18082:8080',
      '--mount', `type=volume,src=${isolated.uploadsVolume},dst=/data/uploads,readonly=false`,
      '--mount', `type=bind,src=${runtimeConfig.mfaFile},dst=/run/secrets/mfa-encryption-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.firebaseFile},dst=/run/secrets/firebase-service-account.json,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxKeyFile},dst=/run/secrets/technical-sandbox-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxWebhookFile},dst=/run/secrets/technical-sandbox-webhook,readonly`,
      '--mount', `type=bind,src=${syntheticSandboxCredentialFilePath},dst=/run/secrets/synthetic-sandbox-user-password,readonly`,
      immutableRuntimeImage,
    ], envFile: configFile, redacted: true },
    { phase: 'candidate_provider_network_attach', command: 'docker', args: ['network', 'connect', target.providerNetwork, isolated.candidate] },
    { phase: 'candidate_start', command: 'docker', args: ['start', isolated.candidate] },
    { phase: 'candidate_finding_fingerprint_readback', command: 'docker', args: ['exec', isolated.candidate, 'node', '--input-type=module', '-e', `import { Pool } from 'pg'; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const result = await pool.query(${JSON.stringify(findingFingerprintSql)}); process.stdout.write(String(result.rows[0]?.jsonb_build_object ?? '')); await pool.end();`] },
    { phase: 'candidate_live_wait', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', 'http://127.0.0.1:18082/health/live'] },
    { phase: 'candidate_health_and_feature_probes', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', 'http://127.0.0.1:18082/health/ready'] },
    { phase: 'candidate_ready_probe', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', 'http://127.0.0.1:18082/health/ready'] },
    { phase: 'candidate_runtime_flags_readback', command: 'docker', args: ['exec', isolated.candidate, 'node', '--input-type=module', '-e', "const names=['DEPLOYMENT_ENVIRONMENT','FIREBASE_AUTH_ENABLED','FIREBASE_PHONE_VERIFICATION_ENABLED','SIT_STAGING_ACCESS_GATE_ENABLED','SIT_STAGING_GOOGLE_REGISTRATION_ENABLED','PAYMENT_TRANSPORT','STRIPE_LIVEMODE']; process.stdout.write(JSON.stringify({...Object.fromEntries(names.map((name)=>[name,process.env[name]??null])),googleRegistrationAllowlistEmpty:(process.env.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST??'').trim()===''}))"] },
    { phase: 'candidate_version_probe', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', 'http://127.0.0.1:18082/version'] },
    { phase: 'candidate_mfa_identity_probes', command: 'node', args: ['backend/ops/staging_controlled_acceptance.mjs', 'probe'], envFile: isolated.envFile, runtimeEnv: { STAGING_ACCEPTANCE_CONTAINER: isolated.candidate }, redacted: true },
    { phase: 'candidate_cleanup', command: 'docker', args: ['rm', '--force', isolated.candidate] },
    { phase: 'candidate_cleanup_verify', command: 'docker', args: ['ps', '--all', '--filter', `name=^/${isolated.candidate}$`, '--format', '{{.Names}}'] },
    { phase: 'isolated_database_cleanup', command: 'docker', args: ['rm', '--force', isolated.database] },
    { phase: 'isolated_database_cleanup_verify', command: 'docker', args: ['ps', '--all', '--filter', `name=^/${isolated.database}$`, '--format', '{{.Names}}'] },
    { phase: 'isolated_volume_cleanup', command: 'docker', args: ['volume', 'rm', isolated.volume] },
    { phase: 'isolated_volume_cleanup_verify', command: 'docker', args: ['volume', 'ls', '--filter', `name=^${isolated.volume}$`, '--format', '{{.Name}}'] },
    { phase: 'isolated_uploads_volume_cleanup', command: 'docker', args: ['volume', 'rm', isolated.uploadsVolume] },
    { phase: 'isolated_uploads_volume_cleanup_verify', command: 'docker', args: ['volume', 'ls', '--filter', `name=^${isolated.uploadsVolume}$`, '--format', '{{.Name}}'] },
    { phase: 'isolated_network_cleanup', command: 'docker', args: ['network', 'rm', isolated.network] },
    { phase: 'isolated_network_cleanup_verify', command: 'docker', args: ['network', 'ls', '--filter', `name=^${isolated.network}$`, '--format', '{{.Name}}'] },
    { phase: 'canonical_forward_migration_92_to_95', command: 'docker', args: ['run', '--rm', '--network', target.network, '--env-file', configFile, '--entrypoint', 'node', immutableRuntimeImage, '-e', "import('./src/migrations.js').then(async ({runMigrations})=>{const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});await runMigrations(pool);await pool.end();})"], envFile: configFile, redacted: true },
    { phase: 'canonical_schema_readback', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName, '-Atc', "SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1"] },
    { phase: 'canonical_migration_ledger_readback', command: 'docker', args: ['exec', target.databaseContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', greenTarget.databaseUser, '-d', greenTarget.databaseName, '-Atc', migrationLedgerReadbackSql] },
    { phase: 'synthetic_sandbox_provision_canonical', command: 'docker', args: ['run', '--rm', '--user', '100:101', '--group-add', '65532', '--network', target.network, '--env-file', configFile, '--env', 'DEPLOYMENT_ENVIRONMENT=test', '--env', 'SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password', ...provisionerMounts, '--entrypoint', 'node', immutableRuntimeImage, provisionerPath], envFile: configFile, redacted: true },
    { phase: 'final_create_no_host_port', command: 'docker', args: [
      'create', '--name', target.apiContainer, '--restart', 'no', '--group-add', '65532', '--network', target.network,
      '--label', 'com.shareittoo.sit.green=true', '--label', `com.shareittoo.sit.green.run_id=${target.runId}`,
      '--env-file', configFile,
      '--mount', `type=volume,src=${target.uploadsVolume},dst=/data/uploads,readonly=false`,
      '--mount', `type=bind,src=${runtimeConfig.mfaFile},dst=/run/secrets/mfa-encryption-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.firebaseFile},dst=/run/secrets/firebase-service-account.json,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxKeyFile},dst=/run/secrets/technical-sandbox-key,readonly`,
      '--mount', `type=bind,src=${runtimeConfig.technicalSandboxWebhookFile},dst=/run/secrets/technical-sandbox-webhook,readonly`,
      immutableRuntimeImage,
    ], redacted: true },
    { phase: 'final_provider_network_attach', command: 'docker', args: ['network', 'connect', target.providerNetwork, target.apiContainer] },
    { phase: 'final_start', command: 'docker', args: ['start', target.apiContainer] },
    { phase: 'final_image_readback', command: 'docker', args: ['image', 'inspect', '--format', '{{json .}}', runtime.image] },
    { phase: 'final_inventory_readback', command: 'docker', args: ['inspect', '--format', '{{json .}}', target.apiContainer] },
    { phase: 'final_live_wait', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', `${process.env.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com/api'}/health/live`] },
    { phase: 'final_health_probe', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', `${process.env.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com/api'}/health/ready`] },
    { phase: 'final_ready_wait', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', `${process.env.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com/api'}/health/ready`] },
    { phase: 'final_version_readback', command: 'curl', args: ['--fail', '--silent', '--show-error', '--retry', '30', '--retry-delay', '1', '--retry-connrefused', '--retry-all-errors', `${process.env.GREEN_STAGING_PUBLIC_BASE_URL ?? 'https://staging.shareittoo.com/api'}/version`] },
  ];
  if (commands.some((entry) => entry.args?.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg)))) {
    fail('green_command_secret_leak');
  }
  return Object.freeze(commands.map((entry) => Object.freeze({ ...entry, args: entry.args ? [...entry.args] : undefined })));
}

export function assertGreenCommandBindings(commands, plan, configFile) {
  const byPhase = new Map(commands.map((entry) => [entry.phase, entry]));
  if (byPhase.get('synthetic_sandbox_provision_canonical')?.envFile !== configFile) fail('green_canonical_env_binding_missing');
  if (byPhase.get('candidate_acceptance_create')?.envFile !== configFile
      || !byPhase.get('candidate_acceptance_create')?.args?.includes(plan.isolated.envFile)
      || byPhase.get('candidate_mfa_identity_probes')?.envFile !== plan.isolated.envFile) fail('green_candidate_isolated_binding_missing');
  if (byPhase.get('synthetic_sandbox_provision_isolated')?.envFile !== plan.isolated.envFile) fail('green_isolated_provision_binding_missing');
  for (const phase of ['isolated_postgres_create', 'isolated_migrate_92_to_95']) {
    if (!byPhase.get(phase)?.args?.includes(plan.isolated.envFile)) fail('green_isolated_env_binding_missing');
    if (byPhase.get(phase)?.args?.some((arg) => arg.includes(greenTarget.databaseName))) fail('green_isolated_database_cross_bind');
  }
  const integrity = byPhase.get('isolated_integrity_and_functional_probes');
  if (integrity?.envFile !== plan.isolated.envFile
      || integrity.runtimeEnv?.DATABASE_CONTAINER !== plan.isolated.database
      || integrity.runtimeEnv?.DATABASE_USER !== plan.isolated.databaseUser
      || integrity.runtimeEnv?.DATABASE_NAME !== plan.isolated.databaseName) fail('green_isolated_probe_binding_missing');
  if (byPhase.get('canonical_forward_migration_92_to_95')?.envFile !== configFile
      || !byPhase.get('canonical_forward_migration_92_to_95')?.args?.includes(configFile)) fail('green_canonical_migration_binding_missing');
  if (byPhase.get('isolated_restore')?.inputFile !== `${plan.evidenceFile}.pgdump`) fail('green_restore_backup_binding_missing');
  return true;
}

export function sanitizeGreenEvidence({ plan, backupDigest, configDigest, targetReadback, imageReadback, status = 'executed' } = {}) {
  if (!plan || plan.kind !== 'sit-green-promotion-plan') fail('green_plan_required');
  safeDigest(backupDigest, 'green_backup_digest_invalid');
  safeDigest(configDigest, 'green_config_digest_invalid');
  if (typeof targetReadback !== 'object' || typeof imageReadback !== 'object') fail('green_readback_required');
  const evidence = {
    kind: 'sit-green-promotion',
    status,
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
  if (/(?:DATABASE_URL|JWT_SECRET|whsec_|sk_live_|sk_test_)/iu.test(serialized)
      || /"[^"\n]*(?:password|secret|token)[^"\n]*"\s*:/iu.test(serialized)) fail('green_evidence_secret_leak');
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
  if (removed.some((name) => /(?:shareittoo_staging|shareittoo-staging-api)/iu.test(name)
      || containsForbiddenGreenTargetIdentifier(name))) {
    fail('green_cleanup_touched_protected_resource');
  }
  return true;
}

export function assertGreenPromotionExecutionAllowed({ environment = process.env, plan } = {}) {
  if (environment.GREEN_STAGING_PROMOTION_EXECUTE !== '1') fail('explicit_green_execute_flag_required');
  if (environment.GREEN_STAGING_PROMOTION_CONFIRM !== plan?.runtime?.runtimeCommit) fail('exact_green_confirmation_required');
  return true;
}

export function runGreenCommand(command, args, { cwd = repositoryRoot, env = process.env, phase = 'green_command', binary = false, allowFailure = false } = {}) {
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
      else if (allowFailure) resolvePromise(Object.freeze({ stdout: binary ? Buffer.concat(stdout) : stdout, stderr, code }));
      else reject(Object.assign(new Error(`Green staging promotion failed: ${phase}`), { code: `${phase}_failed` }));
    });
  });
}

export function runGreenCommandWithFileInput(command, args, inputFile, { cwd = repositoryRoot, env = process.env, phase = 'green_command_file', allowFailure = false } = {}) {
  if (args.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg))) {
    return Promise.reject(Object.assign(new Error(`Green staging promotion failed: ${phase}_secret_argument`), { code: `${phase}_secret_argument` }));
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'ignore', 'ignore'] });
    const input = createReadStream(inputFile);
    const rejectSafe = (code) => { input.destroy(); child.kill('SIGTERM'); reject(Object.assign(new Error(`Green staging promotion failed: ${phase}`), { code })); };
    input.once('error', () => rejectSafe(`${phase}_input_failed`));
    child.stdin.once('error', (error) => { if (error?.code !== 'EPIPE') rejectSafe(`${phase}_pipe_failed`); });
    child.once('error', () => rejectSafe(`${phase}_spawn_failed`));
    child.once('close', (code) => { if (code === 0 || allowFailure) resolvePromise(Object.freeze({ stdout: '', stderr: '', code })); else rejectSafe(`${phase}_failed`); });
    input.pipe(child.stdin);
  });
}

export function runGreenCommandWithBufferInput(command, args, inputBytes, { cwd = repositoryRoot, env = process.env, phase = 'green_command_buffer', allowFailure = false } = {}) {
  if (!Buffer.isBuffer(inputBytes)) {
    return Promise.reject(Object.assign(new Error(`Green staging promotion failed: ${phase}_input_invalid`), { code: `${phase}_input_invalid` }));
  }
  if (args.some((arg) => /(?:JWT_SECRET|DATABASE_URL|password|token|whsec_|sk_live_|sk_test_)=/iu.test(arg))) {
    return Promise.reject(Object.assign(new Error(`Green staging promotion failed: ${phase}_secret_argument`), { code: `${phase}_secret_argument` }));
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'ignore', 'ignore'] });
    const input = Readable.from([inputBytes]);
    let settled = false;
    let inputEnded = false;
    const rejectSafe = (code) => {
      if (settled) return;
      settled = true;
      input.destroy();
      child.kill('SIGTERM');
      reject(Object.assign(new Error(`Green staging promotion failed: ${phase}`), { code }));
    };
    input.once('error', () => rejectSafe(`${phase}_input_failed`));
    input.once('end', () => { inputEnded = true; });
    child.stdin.once('error', (error) => { rejectSafe(error?.code === 'EPIPE' ? `${phase}_stdin_closed_early` : `${phase}_pipe_failed`); });
    child.stdin.once('close', () => { if (!settled && !inputEnded && !child.killed) rejectSafe(`${phase}_stdin_closed_early`); });
    child.once('error', () => rejectSafe(`${phase}_spawn_failed`));
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0 || allowFailure) resolvePromise(Object.freeze({ stdout: '', stderr: '', code }));
      else reject(Object.assign(new Error(`Green staging promotion failed: ${phase}`), { code: `${phase}_failed` }));
    });
    input.pipe(child.stdin);
  });
}

export async function runGreenForwardRecovery({ plan, commands, command, commandEnv = {}, completed = [] } = {}) {
  if (!plan || plan.kind !== 'sit-green-promotion-plan' || !Array.isArray(commands) || typeof command !== 'function') fail('green_forward_recovery_input_invalid');
  const phases = ['canonical_schema_readback', 'canonical_migration_ledger_readback', 'final_create_no_host_port', 'final_provider_network_attach', 'final_start', 'final_image_readback', 'final_inventory_readback', 'final_live_wait', 'final_health_probe', 'final_ready_wait', 'final_version_readback'];
  const byPhase = new Map(commands.map((entry) => [entry.phase, entry]));
  const readbacks = {};
  const recovered = [];
  for (const phase of phases) {
    const mutating = phase === 'final_create_no_host_port' || phase === 'final_provider_network_attach' || phase === 'final_start';
    if (completed.includes(phase) && mutating) continue;
    const entry = byPhase.get(phase);
    if (!entry) fail('green_forward_recovery_phase_missing');
    let result;
    if (phase === 'final_create_no_host_port' || phase === 'final_provider_network_attach' || phase === 'final_start') {
      result = await command(entry.command, entry.args, { phase: `recovery_${phase}`, env: commandEnv, allowFailure: true });
      if (phase === 'final_create_no_host_port' && result.code !== undefined && !result.stdout?.trim()) {
        const existing = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.apiContainer], { phase: 'recovery_existing_final_inspect', env: commandEnv, allowFailure: true });
        if (existing.code !== undefined && !existing.stdout?.trim()) fail('green_forward_recovery_create_failed');
      }
    } else {
      result = await command(entry.command, entry.args, { phase: `recovery_${phase}`, env: commandEnv });
    }
    if (phase.endsWith('_readback') || phase.endsWith('_wait') || phase === 'final_health_probe') readbacks[phase] = phase.endsWith('_migration_ledger_readback') ? (result.stdout ?? '') : (result.stdout?.trim() ?? '');
    if (phase === 'canonical_schema_readback') currentMigrationFromReadback(readbacks[phase], 'green_forward_recovery_schema_readback_invalid');
    if (phase === 'canonical_migration_ledger_readback') assertMigrationLedgerReadback(readbacks[phase], plan.target.currentSchema, greenTarget.currentLedgerDigest, 'green_forward_recovery_migration_ledger_invalid');
    recovered.push(phase);
  }
  assertGreenImageReadback(JSON.parse(readbacks.final_image_readback), plan.runtime);
  assertGreenFinalContainerReadback({ record: JSON.parse(readbacks.final_inventory_readback), plan });
  assertGreenRuntimeReadbacks({ version: JSON.parse(readbacks.final_version_readback), health: JSON.parse(readbacks.final_health_probe), ready: JSON.parse(readbacks.final_ready_wait), runtimeCommit: plan.runtime.runtimeCommit });
  return Object.freeze({ status: 'verified', completedPhases: Object.freeze(recovered) });
}

function greenCleanupResourceOwned(readback, resource, plan) {
  let record;
  try { record = parseReadbackJson(readback, 'green_cleanup_identity_invalid'); } catch { return false; }
  const name = String(record?.Name ?? '').replace(/^\//u, '');
  const labels = resource.kind === 'container' ? record?.Config?.Labels : record?.Labels;
  if (name !== resource.name
      || labels?.['com.shareittoo.green.rehearsal'] !== 'true'
      || labels?.['com.shareittoo.green.rehearsal_id'] !== plan.isolated.rehearsalId) return false;
  if (resource.kind === 'container' && labels?.['com.shareittoo.sit.green'] !== 'true') return false;
  if (resource.candidate && labels?.['com.shareittoo.green.candidate'] !== plan.target.runId) return false;
  return true;
}

function stableGreenIdentityValue(value) {
  if (Array.isArray(value)) return value.map((entry) => stableGreenIdentityValue(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableGreenIdentityValue(value[key])]));
}

function greenRollbackIdentityFromRecord(record) {
  if (typeof record?.Id !== 'string' || !record.Id
      || !record.Config || typeof record.Config !== 'object'
      || !record.NetworkSettings?.Networks || typeof record.NetworkSettings.Networks !== 'object') return null;
  return Object.freeze({
    id: record.Id,
    config: JSON.stringify(stableGreenIdentityValue(record.Config)),
    networks: JSON.stringify(stableGreenIdentityValue(record.NetworkSettings.Networks)),
  });
}

function greenRollbackIdentityMatches(readback, expected) {
  if (!expected) return false;
  let record;
  try { record = JSON.parse(String(readback ?? '').trim()); } catch { return false; }
  const actual = greenRollbackIdentityFromRecord(record);
  return actual?.id === expected.id && actual.config === expected.config && actual.networks === expected.networks;
}

export async function runGreenEmergencyCleanup({ plan, command, commandEnv = {}, completed = [], phaseStarted, schemaMutationStarted = false, originalApiIdentity = null }) {
  const candidate = plan.isolated.candidate;
  const resources = [
    {
      kind: 'container', candidate: true, name: candidate,
      createPhase: 'candidate_acceptance_create',
      inspect: ['docker', ['inspect', '--format', '{{json .}}', candidate]],
      remove: ['docker', ['rm', '--force', candidate]],
      verify: ['docker', ['ps', '--all', '--filter', `name=^/${candidate}$`, '--format', '{{.Names}}']],
      inspectPhase: 'failure_candidate_identity_readback', removePhase: 'failure_candidate_remove', verifyPhase: 'failure_candidate_verify',
    },
    {
      kind: 'container', name: plan.isolated.database,
      createPhase: 'isolated_postgres_create',
      inspect: ['docker', ['inspect', '--format', '{{json .}}', plan.isolated.database]],
      remove: ['docker', ['rm', '--force', plan.isolated.database]],
      verify: ['docker', ['ps', '--all', '--filter', `name=^/${plan.isolated.database}$`, '--format', '{{.Names}}']],
      inspectPhase: 'failure_isolated_database_identity_readback', removePhase: 'failure_isolated_database_remove', verifyPhase: 'failure_isolated_database_verify',
    },
    {
      kind: 'volume', name: plan.isolated.volume,
      createPhase: 'isolated_volume_create',
      inspect: ['docker', ['volume', 'inspect', '--format', '{{json .}}', plan.isolated.volume]],
      remove: ['docker', ['volume', 'rm', plan.isolated.volume]],
      verify: ['docker', ['volume', 'ls', '--filter', `name=^${plan.isolated.volume}$`, '--format', '{{.Name}}']],
      inspectPhase: 'failure_isolated_volume_identity_readback', removePhase: 'failure_isolated_volume_remove', verifyPhase: 'failure_isolated_volume_verify',
    },
    {
      kind: 'volume', name: plan.isolated.uploadsVolume,
      createPhase: 'isolated_uploads_volume_create',
      inspect: ['docker', ['volume', 'inspect', '--format', '{{json .}}', plan.isolated.uploadsVolume]],
      remove: ['docker', ['volume', 'rm', plan.isolated.uploadsVolume]],
      verify: ['docker', ['volume', 'ls', '--filter', `name=^${plan.isolated.uploadsVolume}$`, '--format', '{{.Name}}']],
      inspectPhase: 'failure_isolated_uploads_volume_identity_readback', removePhase: 'failure_isolated_uploads_volume_remove', verifyPhase: 'failure_isolated_uploads_volume_verify',
    },
    {
      kind: 'network', name: plan.isolated.network,
      createPhase: 'isolated_network_create',
      inspect: ['docker', ['network', 'inspect', '--format', '{{json .}}', plan.isolated.network]],
      remove: ['docker', ['network', 'rm', plan.isolated.network]],
      verify: ['docker', ['network', 'ls', '--filter', `name=^${plan.isolated.network}$`, '--format', '{{.Name}}']],
      inspectPhase: 'failure_isolated_network_identity_readback', removePhase: 'failure_isolated_network_remove', verifyPhase: 'failure_isolated_network_verify',
    },
  ];
  const results = [];
  for (const resource of resources) {
    const createSucceeded = completed.includes(resource.createPhase);
    const createOutcomeUnknown = phaseStarted === resource.createPhase && !createSucceeded;
    if (!createSucceeded && !createOutcomeUnknown) continue;
    let inspected;
    try {
      inspected = await command(resource.inspect[0], resource.inspect[1], { phase: resource.inspectPhase, env: commandEnv, allowFailure: true });
    } catch (error) {
      inspected = { code: error?.code ?? resource.inspectPhase, stdout: '' };
    }
    if (inspected.code !== undefined) {
      try {
        const absent = await command(resource.verify[0], resource.verify[1], { phase: resource.verifyPhase, env: commandEnv, allowFailure: false });
        results.push({ phase: resource.verifyPhase, ok: !absent.stdout?.trim() });
      } catch (error) {
        results.push({ phase: resource.verifyPhase, ok: false, code: error?.code ?? resource.verifyPhase });
      }
      continue;
    }
    if (createOutcomeUnknown) {
      results.push({ phase: resource.inspectPhase, ok: false, code: 'green_cleanup_creation_outcome_unknown' });
      continue;
    }
    if (!greenCleanupResourceOwned(inspected.stdout, resource, plan)) {
      results.push({ phase: resource.inspectPhase, ok: false, code: 'green_cleanup_identity_mismatch' });
      continue;
    }
    try {
      const removed = await command(resource.remove[0], resource.remove[1], { phase: resource.removePhase, env: commandEnv, allowFailure: true });
      results.push({ phase: resource.removePhase, ok: removed.code === undefined });
    } catch (error) {
      results.push({ phase: resource.removePhase, ok: false, code: error?.code ?? resource.removePhase });
    }
    try {
      const absent = await command(resource.verify[0], resource.verify[1], { phase: resource.verifyPhase, env: commandEnv, allowFailure: false });
      results.push({ phase: resource.verifyPhase, ok: !absent.stdout?.trim() });
    } catch (error) {
      results.push({ phase: resource.verifyPhase, ok: false, code: error?.code ?? resource.verifyPhase });
    }
  }
  let restored = false;
  let restoreError;
  const preSchemaPhases = new Set([
    'quiesce_green_api', 'quiesce_green_api_verify', 'seal_green_api',
    'source_foreign_writer_readback_before_backup', 'fresh_protected_backup',
    'source_foreign_writer_readback_after_backup', 'isolated_network_create',
    'isolated_volume_create', 'isolated_uploads_volume_create', 'isolated_postgres_create',
    'isolated_postgres_wait', 'isolated_postgres_init_complete_log_readback', 'isolated_restore',
    'isolated_migrate_92_to_95', 'isolated_migration_readback', 'isolated_migration_ledger_readback',
    'isolated_finding_fingerprint_readback', 'isolated_integrity_and_functional_probes',
    'synthetic_sandbox_provision_isolated', 'candidate_acceptance_create', 'candidate_provider_network_attach',
    'candidate_start', 'candidate_live_wait', 'candidate_health_and_feature_probes', 'candidate_ready_probe',
    'candidate_runtime_flags_readback', 'candidate_version_probe', 'candidate_mfa_identity_probes',
    'candidate_finding_fingerprint_readback', 'candidate_cleanup', 'candidate_cleanup_verify',
    'isolated_database_cleanup', 'isolated_database_cleanup_verify', 'isolated_volume_cleanup',
    'isolated_volume_cleanup_verify', 'isolated_uploads_volume_cleanup', 'isolated_uploads_volume_cleanup_verify',
    'isolated_network_cleanup', 'isolated_network_cleanup_verify',
  ]);
  const quiescePossiblyStarted = completed.some((phase) => preSchemaPhases.has(phase)) || preSchemaPhases.has(phaseStarted);
  if (!schemaMutationStarted && quiescePossiblyStarted) {
    try {
      const sealed = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.sealedApiContainer], { phase: 'failure_restore_sealed_api_identity_readback', env: commandEnv, allowFailure: true });
      const current = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.apiContainer], { phase: 'failure_restore_current_api_identity_readback', env: commandEnv, allowFailure: true });
      const sealedPresent = sealed.code === undefined;
      const sealedMatches = sealed.code === undefined && greenRollbackIdentityMatches(sealed.stdout, originalApiIdentity);
      const currentMatches = current.code === undefined && greenRollbackIdentityMatches(current.stdout, originalApiIdentity);
      const currentAbsent = current.code !== undefined && (await command('docker', ['ps', '--all', '--filter', `name=^/${plan.target.apiContainer}$`, '--format', '{{.Names}}'], { phase: 'failure_restore_current_api_absence_readback', env: commandEnv, allowFailure: false })).stdout?.trim() === '';
      if (sealedPresent && currentMatches) {
        restoreError = 'failure_restore_green_api_identity_ambiguous';
      } else if (sealedMatches && currentAbsent) {
        const renamed = await command('docker', ['rename', plan.target.sealedApiContainer, plan.target.apiContainer], { phase: 'failure_restore_sealed_api', env: commandEnv, allowFailure: true });
        if (renamed.code !== undefined) {
          const reconciledCurrent = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.apiContainer], { phase: 'failure_restore_current_api_identity_after_rename', env: commandEnv, allowFailure: true });
          const reconciledSealed = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.sealedApiContainer], { phase: 'failure_restore_sealed_api_identity_after_rename', env: commandEnv, allowFailure: true });
          if (reconciledCurrent.code === undefined && reconciledSealed.code !== undefined && greenRollbackIdentityMatches(reconciledCurrent.stdout, originalApiIdentity)) {
            // The rename response was lost, but the exact original now owns the active name.
          } else {
            restoreError = 'failure_restore_sealed_api_failed';
          }
        } else {
          const rebound = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.apiContainer], { phase: 'failure_restore_current_api_identity_after_rename', env: commandEnv, allowFailure: true });
          if (rebound.code !== undefined || !greenRollbackIdentityMatches(rebound.stdout, originalApiIdentity)) restoreError = 'failure_restore_green_api_identity_ambiguous';
        }
      } else if (!currentMatches) {
        restoreError = 'failure_restore_green_api_identity_ambiguous';
      }
      if (!restoreError) {
        await command('docker', ['start', plan.target.apiContainer], { phase: 'failure_restore_green_api', env: commandEnv, allowFailure: true });
        const restoredRecord = await command('docker', ['inspect', '--format', '{{json .}}', plan.target.apiContainer], { phase: 'failure_restore_green_api_identity_verify', env: commandEnv, allowFailure: false });
        let restoredRecordJson;
        try { restoredRecordJson = JSON.parse(String(restoredRecord.stdout ?? '').trim()); } catch { restoredRecordJson = null; }
        restored = greenRollbackIdentityMatches(restoredRecord.stdout, originalApiIdentity) && restoredRecordJson?.State?.Running === true;
        if (!restored) restoreError = 'failure_restore_green_api_not_running_or_identity_mismatch';
      }
    } catch (error) {
      restoreError = error?.code ?? 'failure_restore_green_api_failed';
    }
  }
  const clean = results.every((entry) => entry.ok) && (!quiescePossiblyStarted || schemaMutationStarted || restored);
  return Object.freeze({ clean, schemaMutationStarted, restored, results: Object.freeze(results), restoreError });
}

export async function runGreenPromotion({ plan, config, configFile, environment = process.env, execute = false, command = runGreenCommand, assertRuntimeFiles = assertGreenProtectedRuntimeFiles } = {}) {
  assertGreenPromotionExecutionAllowed({ environment, plan });
  if (!execute) fail('explicit_green_execute_flag_required');
  if (typeof command !== 'function') fail('green_command_runner_required');
  if (typeof assertRuntimeFiles !== 'function') fail('green_runtime_file_assertion_required');
  const protectedEnv = await readProtectedEnv(configFile);
  assertGreenProtectedEnvironment(protectedEnv, config);
  await assertRuntimeFiles(config, protectedEnv);
  const isolatedPassword = crypto.randomBytes(32).toString('base64url');
  await mkdir(dirname(plan.isolated.envFile), { recursive: true, mode: 0o700 });
  await writeFile(plan.isolated.envFile, [
    `POSTGRES_DB=${plan.isolated.databaseName}`,
    `POSTGRES_USER=${plan.isolated.databaseUser}`,
    `POSTGRES_PASSWORD=${isolatedPassword}`,
    `DATABASE_URL=postgres://${plan.isolated.databaseUser}:${isolatedPassword}@${plan.isolated.database}:5432/${plan.isolated.databaseName}`,
  ].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  const isolatedEnv = await readExecutionEnv(plan.isolated.envFile);
  const commandEnv = Object.freeze({ ...environment, ...protectedEnv });
  const commands = buildGreenPromotionCommands({ plan, configFile, config });
  const completed = [];
  const readbacks = {};
  let backupDigest;
  let backupBytes;
  let foreignWriterBefore;
  let isolatedFindingFingerprint;
  let schemaMutationStarted = false;
  let phaseStarted;
  let originalApiIdentity;
  try {
    for (const entry of commands) {
      phaseStarted = entry.phase;
      const entryEnv = entry.envFile === configFile ? protectedEnv : entry.envFile === plan.isolated.envFile ? isolatedEnv : {};
      const env = { ...commandEnv, ...entryEnv, ...(entry.runtimeEnv ?? {}) };
      if (entry.phase === 'canonical_forward_migration_92_to_95') schemaMutationStarted = true;
      let result;
      if (entry.inputFile) {
        result = command === runGreenCommand
          ? entry.inputSource === 'fresh_protected_backup'
            ? await runGreenCommandWithBufferInput(entry.command, entry.args, backupBytes, { phase: entry.phase, env })
            : await runGreenCommandWithFileInput(entry.command, entry.args, entry.inputFile, { phase: entry.phase, env })
          : await command(entry.command, entry.args, { phase: entry.phase, env, inputFile: entry.inputFile, inputBytes: entry.inputSource === 'fresh_protected_backup' ? backupBytes : undefined, inputDigest: entry.inputSource === 'fresh_protected_backup' ? backupDigest : undefined });
      } else {
        result = await command(entry.command, entry.args, { phase: entry.phase, env, binary: entry.binary === true });
      }
      if (entry.redacted !== true && entry.stdoutFile) {
        backupBytes = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
        if (backupBytes.length === 0) fail('green_backup_empty');
        backupDigest = sha256(backupBytes);
        const backupPath = resolve(entry.stdoutFile);
        await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
        const parentMeta = await lstat(dirname(backupPath));
        const ownerUid = typeof process.getuid === 'function' ? process.getuid() : parentMeta.uid;
        if (!parentMeta.isDirectory() || parentMeta.isSymbolicLink() || (parentMeta.mode & 0o777) !== 0o700 || parentMeta.uid !== ownerUid) fail('green_backup_directory_unsafe');
        await writeFile(backupPath, backupBytes, { flag: 'wx', mode: 0o600 });
        const backupMeta = await lstat(backupPath);
        if (!backupMeta.isFile() || backupMeta.isSymbolicLink() || (backupMeta.mode & 0o777) !== 0o600 || backupMeta.uid !== ownerUid) fail('green_backup_permissions_invalid');
      }
      if (entry.phase === 'target_container_set_readback' || entry.phase.startsWith('target_inventory_') || entry.phase === 'sealed_name_conflict_check' || entry.phase === 'runtime_image_readback' || entry.phase === 'source_schema_readback'
          || entry.phase === 'quiesce_green_api_verify'
          || entry.phase === 'source_foreign_writer_readback_before_backup' || entry.phase === 'source_foreign_writer_readback_after_backup'
          || entry.phase === 'isolated_finding_fingerprint_readback' || entry.phase === 'candidate_finding_fingerprint_readback'
          || entry.phase === 'isolated_postgres_init_complete_log_readback' || entry.phase === 'isolated_postgres_stable_select_1' || entry.phase === 'isolated_postgres_stable_select_2'
          || entry.phase === 'candidate_health_and_feature_probes' || entry.phase === 'candidate_ready_probe' || entry.phase === 'candidate_runtime_flags_readback' || entry.phase === 'candidate_version_probe'
          || entry.phase === 'final_image_readback' || entry.phase === 'final_inventory_readback' || entry.phase === 'final_live_wait' || entry.phase === 'final_health_probe' || entry.phase === 'final_ready_wait' || entry.phase === 'final_version_readback'
          || entry.phase.endsWith('_schema_readback') || entry.phase.endsWith('_migration_ledger_readback')) {
        readbacks[entry.phase] = entry.phase.endsWith('_migration_ledger_readback') ? (result.stdout ?? '')
          : entry.phase === 'target_container_set_readback' ? (result.stdout ?? '')
          : entry.phase === 'isolated_postgres_init_complete_log_readback' ? `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
            : (result.stdout?.trim() ?? '');
      }
      if (entry.phase === 'target_container_set_readback') assertGreenTargetContainerSet(readbacks[entry.phase], plan.target);
      if (entry.phase === 'quiesce_green_api_verify' && readbacks[entry.phase] !== 'false') fail('green_quiesce_verify_invalid');
      if (entry.phase === 'sealed_name_conflict_check' && readbacks[entry.phase]) fail('green_sealed_name_conflict');
      if (entry.phase.endsWith('_cleanup_verify') && result.stdout?.trim()) fail('green_cleanup_incomplete');
      if (entry.phase === 'source_schema_readback') {
        try { assertGreenImageReadback(JSON.parse(readbacks.runtime_image_readback), plan.runtime); } catch (error) { if (error?.code === 'green_image_readback_mismatch') throw error; fail('green_image_readback_invalid'); }
        const parseInspect = (phase) => { try { return JSON.parse(readbacks[phase]); } catch { fail('green_inventory_readback_invalid'); } };
        const unwrap = (value) => Array.isArray(value) ? value[0] : value;
        const apiRecord = unwrap(parseInspect('target_inventory_api'));
        const databaseRecord = unwrap(parseInspect('target_inventory_database'));
        const networkRecord = unwrap(parseInspect('target_inventory_network'));
        const providerRecord = unwrap(parseInspect('target_inventory_provider_network'));
        const volumeRecord = unwrap(parseInspect('target_inventory_uploads'));
        const apiEnv = Object.fromEntries((apiRecord?.Config?.Env ?? []).map((item) => item.split(/=(.*)/u, 2)));
        originalApiIdentity = greenRollbackIdentityFromRecord(apiRecord);
        if (!originalApiIdentity) fail('green_original_api_identity_missing');
        const apiMounts = apiRecord?.Mounts ?? [];
        if (apiMounts.some((mount) => typeof mount.RW !== 'boolean')) fail('green_mount_rw_readback_invalid');
        const apiMountDestinations = apiMounts.map((mount) => mount.Destination);
        const uploadsMount = apiMounts.find((mount) => mount.Destination === '/data/uploads');
        assertGreenContainerInventory({
          api: { name: apiRecord?.Name?.replace(/^\//u, ''), greenLabel: apiRecord?.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', prePromotionTuple: apiRecord?.Config?.Labels?.['com.shareittoo.sit.green'] === undefined, hostPorts: Object.values(apiRecord?.NetworkSettings?.Ports ?? {}).flat().filter(Boolean).length, running: apiRecord?.State?.Running === true, networks: Object.keys(apiRecord?.NetworkSettings?.Networks ?? {}), image: apiRecord?.Config?.Image, user: apiRecord?.Config?.User, databaseHost: (() => { try { return new URL(apiEnv.DATABASE_URL).hostname; } catch { return ''; } })(), databaseName: (() => { try { return new URL(apiEnv.DATABASE_URL).pathname.slice(1); } catch { return ''; } })(), databaseUser: (() => { try { return new URL(apiEnv.DATABASE_URL).username; } catch { return ''; } })(), uploadsVolume: uploadsMount?.Name ?? '', groupAdd: (apiRecord?.HostConfig?.GroupAdd ?? []).includes('65532'), mounts: apiMounts.map((mount) => ({ destination: mount.Destination, type: mount.Type, source: mount.Type === 'bind' ? (mount.Source ?? null) : null, volume: mount.Type === 'volume' ? (mount.Name ?? null) : null, readOnly: mount.RW !== true })) },
          database: { name: databaseRecord?.Name?.replace(/^\//u, ''), greenLabel: databaseRecord?.Config?.Labels?.['com.shareittoo.sit.green'] === 'true', running: databaseRecord?.State?.Running === true },
          network: { name: networkRecord?.Name, internal: networkRecord?.Internal === true }, providerNetwork: { name: providerRecord?.Name }, uploadsVolume: { name: volumeRecord?.Name }, schema: schemaNumberFromName(readbacks.source_schema_readback, 'green_source_schema_readback_invalid'),
        }, plan.target.sourceSchema, plan.target.prePromotionImage, config);
      }
      if (entry.phase === 'source_migration_ledger_readback') assertMigrationLedgerReadback(result.stdout, plan.target.sourceSchema, greenTarget.sourceLedgerDigest, 'green_source_migration_ledger_invalid');
      if (entry.phase === 'source_foreign_writer_readback_before_backup') foreignWriterBefore = normalizedGreenForeignWriterSet(readbacks[entry.phase]);
      if (entry.phase === 'source_foreign_writer_readback_after_backup') {
        const foreignWriterAfter = normalizedGreenForeignWriterSet(readbacks[entry.phase]);
        if (foreignWriterBefore === undefined || foreignWriterAfter !== foreignWriterBefore) fail('green_foreign_writer_set_changed');
      }
      if (entry.phase === 'isolated_finding_fingerprint_readback') isolatedFindingFingerprint = normalizedGreenFindingFingerprint(readbacks[entry.phase], 'green_isolated_finding_fingerprint_invalid');
      if (entry.phase === 'candidate_finding_fingerprint_readback') {
        const candidateFindingFingerprint = normalizedGreenFindingFingerprint(readbacks[entry.phase], 'green_candidate_finding_fingerprint_invalid');
        if (!isolatedFindingFingerprint) fail('green_isolated_finding_fingerprint_missing');
        try { assertReadinessFindingsUnchanged(isolatedFindingFingerprint, candidateFindingFingerprint); } catch { fail('green_finding_fingerprint_drift'); }
      }
      if (entry.phase === 'isolated_postgres_init_complete_log_readback' && !/PostgreSQL init process complete; ready for start up\./u.test(readbacks[entry.phase])) fail('green_isolated_init_complete_log_invalid');
      if (entry.phase === 'isolated_postgres_stable_select_1' && readbacks[entry.phase] !== '1') fail('green_isolated_stable_select_1_invalid');
      if (entry.phase === 'isolated_postgres_stable_select_2' && readbacks[entry.phase] !== '1') fail('green_isolated_stable_select_2_invalid');
      if (entry.phase === 'isolated_migration_readback') currentMigrationFromReadback(result.stdout, 'green_isolated_schema_readback_invalid');
      if (entry.phase === 'isolated_migration_ledger_readback') assertMigrationLedgerReadback(result.stdout, plan.target.currentSchema, greenTarget.currentLedgerDigest, 'green_isolated_migration_ledger_invalid');
      if (entry.phase === 'canonical_schema_readback') currentMigrationFromReadback(result.stdout, 'green_canonical_schema_readback_invalid');
      if (entry.phase === 'canonical_migration_ledger_readback') assertMigrationLedgerReadback(result.stdout, plan.target.currentSchema, greenTarget.currentLedgerDigest, 'green_canonical_migration_ledger_invalid');
      if (entry.phase === 'candidate_runtime_flags_readback') assertGreenRuntimeEnvironmentReadback(JSON.parse(readbacks.candidate_runtime_flags_readback));
      if (entry.phase === 'candidate_version_probe') assertGreenRuntimeReadbacks({ version: JSON.parse(readbacks.candidate_version_probe), health: JSON.parse(readbacks.candidate_health_and_feature_probes), ready: JSON.parse(readbacks.candidate_ready_probe), runtimeCommit: plan.runtime.runtimeCommit });
      if (entry.phase === 'final_inventory_readback') assertGreenFinalContainerReadback({ record: JSON.parse(readbacks.final_inventory_readback), plan });
      if (entry.phase === 'final_image_readback') assertGreenImageReadback(JSON.parse(readbacks.final_image_readback), plan.runtime);
      if (entry.phase === 'final_version_readback') assertGreenRuntimeReadbacks({ version: JSON.parse(readbacks.final_version_readback), health: JSON.parse(readbacks.final_health_probe), ready: JSON.parse(readbacks.final_ready_wait), runtimeCommit: plan.runtime.runtimeCommit });
      completed.push(entry.phase);
    }
    if (!backupDigest || !readbacks.final_image_readback || !readbacks.final_version_readback || !readbacks.final_inventory_readback) fail('green_final_readback_missing');
    const evidence = sanitizeGreenEvidence({ plan, status: 'executed', backupDigest, configDigest: sha256(await readFile(configFile)), targetReadback: { sourceSchemaReadback: schemaNumberFromName(readbacks.source_schema_readback, 'green_source_schema_readback_invalid'), sourceLedgerDigest: assertMigrationLedgerReadback(readbacks.source_migration_ledger_readback, plan.target.sourceSchema, greenTarget.sourceLedgerDigest, 'green_source_migration_ledger_invalid').digest, currentSchema: schemaNumberFromName(readbacks.canonical_schema_readback, 'green_canonical_schema_readback_invalid'), currentMigration: currentMigrationFromReadback(readbacks.canonical_schema_readback, 'green_canonical_schema_readback_invalid'), migrationLedgerDigest: assertMigrationLedgerReadback(readbacks.canonical_migration_ledger_readback, plan.target.currentSchema, greenTarget.currentLedgerDigest, 'green_canonical_migration_ledger_invalid').digest, cleanup: 'verified', finalInventory: summarizeGreenFinalContainerReadback(JSON.parse(readbacks.final_inventory_readback), plan) }, imageReadback: JSON.parse(readbacks.final_version_readback) });
    const evidenceResult = await writeGreenEvidence(plan.evidenceFile, evidence);
    return Object.freeze({ status: 'executed', completedPhases: Object.freeze(completed), evidence: evidenceResult });
  } catch (error) {
    const cleanup = await runGreenEmergencyCleanup({ plan, command, commandEnv, completed, phaseStarted, schemaMutationStarted, originalApiIdentity });
    error.cleanup = cleanup;
    let forwardRecovery = { status: 'not-required' };
    if (schemaMutationStarted) {
      try {
        forwardRecovery = await runGreenForwardRecovery({ plan, commands, command, commandEnv, completed });
      } catch (recoveryError) {
        forwardRecovery = { status: 'failed', code: recoveryError?.code ?? 'green_forward_recovery_failed' };
      }
    }
    error.forwardRecovery = forwardRecovery;
    if (!cleanup.clean) error.code = 'green_cleanup_failed';
    else if (schemaMutationStarted && forwardRecovery.status !== 'verified') error.code = 'green_forward_recovery_failed';
    throw error;
  } finally {
    await unlink(plan.isolated.envFile).catch(() => {});
  }
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
    const cleanup = error?.cleanup === undefined ? 'not-started' : error.cleanup.clean === true ? 'verified' : 'failed';
    process.stderr.write(`${error?.code ?? 'green_staging_promotion_failed'} cleanup=${cleanup}\n`);
    process.exitCode = 1;
  });
}
