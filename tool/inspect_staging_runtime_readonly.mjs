#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiContainer = 'shareittoo-staging-api';
const databaseContainer = 'shareittoo-staging-postgres';
const defaultReleaseDirectory = '/docker/shareittoo/releases';
const defaultMemoryPath = '/proc/meminfo';
const deploymentRoot = '/docker/shareittoo';
const inventoryKind = 'sit-staging-runtime-readonly-inventory';

const runtimeProbe = String.raw`
const { lstatSync } = require('node:fs');
const has = (name) => Object.prototype.hasOwnProperty.call(process.env, name);
const value = (name) => has(name) ? process.env[name] : null;
let firebase;
try {
  const metadata = lstatSync('/run/secrets/firebase-service-account.json');
  firebase = {
    exists: true,
    regular: metadata.isFile(),
    symlink: metadata.isSymbolicLink(),
    nonempty: metadata.size > 0,
    mode: (metadata.mode & 0o777).toString(8).padStart(3, '0'),
  };
} catch (error) {
  firebase = { exists: false, error: error && error.code === 'ENOENT' ? 'ENOENT' : 'unreadable' };
}
process.stdout.write(JSON.stringify({
  values: {
    APP_COMMIT: value('APP_COMMIT'),
    APP_VERSION: value('APP_VERSION'),
    APP_BUILD_TIME: value('APP_BUILD_TIME'),
    DEPLOYMENT_ENVIRONMENT: value('DEPLOYMENT_ENVIRONMENT'),
    FIREBASE_AUTH_ENABLED: value('FIREBASE_AUTH_ENABLED'),
    FIREBASE_PHONE_VERIFICATION_ENABLED: value('FIREBASE_PHONE_VERIFICATION_ENABLED'),
    MAIL_TRANSPORT: value('MAIL_TRANSPORT'),
    PUSH_TRANSPORT: value('PUSH_TRANSPORT'),
    PAYMENT_TRANSPORT: value('PAYMENT_TRANSPORT'),
    STRIPE_LIVEMODE: value('STRIPE_LIVEMODE'),
    SIT_LISTING_AI_PROVIDER: value('SIT_LISTING_AI_PROVIDER'),
    SIT_LISTING_AI_MODEL: value('SIT_LISTING_AI_MODEL'),
    SIT_LISTING_AI_BUDGET_CENTS: value('SIT_LISTING_AI_BUDGET_CENTS'),
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: value('SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED'),
    BOOKING_PILOT_MODE: value('BOOKING_PILOT_MODE'),
    PRIVATE_PILOT_V4_ENABLED: value('PRIVATE_PILOT_V4_ENABLED'),
    BOOKING_GROUPS_ENABLED: value('BOOKING_GROUPS_ENABLED'),
    PLANNER_CORE_ENABLED: value('PLANNER_CORE_ENABLED'),
    PLANNER_INVENTORY_ENABLED: value('PLANNER_INVENTORY_ENABLED'),
    LISTING_SUPPLY_ENRICHMENT_ENABLED: value('LISTING_SUPPLY_ENRICHMENT_ENABLED'),
    LISTING_SETS_ENABLED: value('LISTING_SETS_ENABLED'),
  },
  firebaseProjectMatchesStaging: value('FIREBASE_PROJECT_ID') === 'shareittoo-staging',
  pilotRegionMatchesHeilbronn: value('PRIVATE_PILOT_ALLOWED_REGIONS') === 'heilbronn',
  credentialVariablesDeclared: {
    FIREBASE_SERVICE_ACCOUNT_FILE: has('FIREBASE_SERVICE_ACCOUNT_FILE'),
    SMTP_USER: has('SMTP_USER'),
    SMTP_PASSWORD: has('SMTP_PASSWORD'),
    STRIPE_SECRET_KEY: has('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: has('STRIPE_WEBHOOK_SECRET'),
    STRIPE_CONNECT_WEBHOOK_SECRET: has('STRIPE_CONNECT_WEBHOOK_SECRET'),
    OPENAI_API_KEY: has('OPENAI_API_KEY'),
  },
  files: { firebase },
}));
`;

class StagingRuntimeInventoryError extends Error {
  constructor(code) {
    super('Staging runtime inventory failed.');
    this.code = code;
  }
}

function fail(code) {
  throw new StagingRuntimeInventoryError(code);
}

function defaultRun(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    fail('command_failed');
  }
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail(code);
  }
}

function integer(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(code);
  return parsed;
}

function dockerFormat(run, objectType, object, format) {
  const output = run('docker', [objectType, 'inspect', '--format', format, object]);
  if (typeof output !== 'string' || output.length === 0) fail('docker_value_missing');
  return output;
}

function inspectContainer(run, name) {
  const running = dockerFormat(run, 'container', name, '{{.State.Running}}');
  const health = dockerFormat(
    run,
    'container',
    name,
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
  );
  const startedAt = dockerFormat(run, 'container', name, '{{.State.StartedAt}}');
  const imageId = dockerFormat(run, 'container', name, '{{.Image}}');
  const restartCount = integer(
    dockerFormat(run, 'container', name, '{{.RestartCount}}'),
    'restart_count_invalid',
  );
  if (running !== 'true' || health !== 'healthy') fail('container_unhealthy');
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) fail('container_image_invalid');
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(startedAt)) fail('container_started_at_invalid');
  return { running: true, health, restartCount, startedAt, imageId };
}

function inspectImage(run, imageId) {
  const id = dockerFormat(run, 'image', imageId, '{{.Id}}');
  const revision = dockerFormat(
    run,
    'image',
    imageId,
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  );
  const version = dockerFormat(
    run,
    'image',
    imageId,
    '{{index .Config.Labels "org.opencontainers.image.version"}}',
  );
  const created = dockerFormat(
    run,
    'image',
    imageId,
    '{{index .Config.Labels "org.opencontainers.image.created"}}',
  );
  const sizeBytes = integer(
    dockerFormat(run, 'image', imageId, '{{.Size}}'),
    'image_size_invalid',
  );
  if (id !== imageId || !/^[a-f0-9]{40}$/u.test(revision)) fail('image_identity_invalid');
  if (!/^0\.1\.0-[a-f0-9]{12}$/u.test(version)) fail('image_version_invalid');
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(created)) fail('image_created_invalid');
  return { id, revision, version, created, sizeBytes };
}

function inspectRuntime(run) {
  let runtime;
  try {
    runtime = JSON.parse(run('docker', ['exec', apiContainer, 'node', '-e', runtimeProbe]));
  } catch (error) {
    if (error instanceof StagingRuntimeInventoryError) throw error;
    fail('runtime_probe_invalid');
  }
  exactKeys(runtime, [
    'values',
    'firebaseProjectMatchesStaging',
    'pilotRegionMatchesHeilbronn',
    'credentialVariablesDeclared',
    'files',
  ], 'runtime_shape_invalid');
  exactKeys(runtime.values, [
    'APP_COMMIT',
    'APP_VERSION',
    'APP_BUILD_TIME',
    'DEPLOYMENT_ENVIRONMENT',
    'FIREBASE_AUTH_ENABLED',
    'FIREBASE_PHONE_VERIFICATION_ENABLED',
    'MAIL_TRANSPORT',
    'PUSH_TRANSPORT',
    'PAYMENT_TRANSPORT',
    'STRIPE_LIVEMODE',
    'SIT_LISTING_AI_PROVIDER',
    'SIT_LISTING_AI_MODEL',
    'SIT_LISTING_AI_BUDGET_CENTS',
    'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED',
    'BOOKING_PILOT_MODE',
    'PRIVATE_PILOT_V4_ENABLED',
    'BOOKING_GROUPS_ENABLED',
    'PLANNER_CORE_ENABLED',
    'PLANNER_INVENTORY_ENABLED',
    'LISTING_SUPPLY_ENRICHMENT_ENABLED',
    'LISTING_SETS_ENABLED',
  ], 'runtime_values_invalid');
  exactKeys(runtime.credentialVariablesDeclared, [
    'FIREBASE_SERVICE_ACCOUNT_FILE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'OPENAI_API_KEY',
  ], 'credential_declaration_shape_invalid');
  exactKeys(runtime.files, ['firebase'], 'runtime_files_invalid');

  const expectedValues = {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    FIREBASE_AUTH_ENABLED: 'true',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'true',
    MAIL_TRANSPORT: 'smtp',
    PUSH_TRANSPORT: 'fcm',
    PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false',
    SIT_LISTING_AI_PROVIDER: 'mock',
    SIT_LISTING_AI_MODEL: 'listing-ai-mock-v1',
    SIT_LISTING_AI_BUDGET_CENTS: '0',
    BOOKING_PILOT_MODE: 'pilot',
    PRIVATE_PILOT_V4_ENABLED: 'true',
    BOOKING_GROUPS_ENABLED: 'true',
    PLANNER_CORE_ENABLED: 'true',
    PLANNER_INVENTORY_ENABLED: 'true',
    LISTING_SUPPLY_ENRICHMENT_ENABLED: 'true',
    LISTING_SETS_ENABLED: 'true',
  };
  for (const [name, expected] of Object.entries(expectedValues)) {
    if (runtime.values[name] !== expected) fail('protected_runtime_drift');
  }
  if (![null, '0', 'false'].includes(
    runtime.values.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED,
  )) fail('external_listing_ai_enabled');
  if (!/^[a-f0-9]{40}$/u.test(runtime.values.APP_COMMIT)
      || runtime.values.APP_VERSION !== `0.1.0-${runtime.values.APP_COMMIT.slice(0, 12)}`
      || !/^\d{4}-\d{2}-\d{2}T/u.test(runtime.values.APP_BUILD_TIME)) {
    fail('runtime_release_identity_invalid');
  }
  if (runtime.firebaseProjectMatchesStaging !== true
      || runtime.pilotRegionMatchesHeilbronn !== true) {
    fail('staging_scope_invalid');
  }
  const firebase = runtime.files.firebase;
  exactKeys(firebase, [
    'exists',
    'regular',
    'symlink',
    'nonempty',
    'mode',
  ], 'firebase_file_metadata_shape_invalid');
  if (!firebase || firebase.exists !== true || firebase.regular !== true
      || firebase.symlink !== false || firebase.nonempty !== true
      || firebase.mode !== '640') {
    fail('firebase_file_metadata_invalid');
  }
  if (Object.values(runtime.credentialVariablesDeclared)
    .some((value) => typeof value !== 'boolean')) {
    fail('credential_declaration_invalid');
  }
  return runtime;
}

function latestReleaseRecord(releaseDirectory) {
  const canonicalDirectory = realpathSync(releaseDirectory);
  const directoryMetadata = lstatSync(canonicalDirectory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    fail('release_directory_invalid');
  }
  const name = readdirSync(canonicalDirectory)
    .filter((entry) => /^staging-\d{8}T\d{6}Z-[a-f0-9]{12}\.json$/u.test(entry))
    .sort()
    .at(-1);
  if (!name) fail('release_record_missing');
  const path = join(canonicalDirectory, name);
  let descriptor;
  let value;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()
        || metadata.size < 2 || metadata.size > 16 * 1024
        || (metadata.mode & 0o777) !== 0o600) {
      fail('release_record_file_invalid');
    }
    value = JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error instanceof StagingRuntimeInventoryError) throw error;
    fail('release_record_unreadable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const fields = [
    'environment',
    'commit',
    'previousCommit',
    'version',
    'buildTime',
    'deployedAt',
    'stagingFcm',
    'stagingSmtp',
    'stagingListingAi',
    'stagingStripe',
    'stagingPilotId',
    'stagingReadiness',
  ];
  exactKeys(value, fields, 'release_record_shape_invalid');
  exactKeys(value.stagingReadiness, [
    'status',
    'state',
    'noncriticalNextUpdateOverdue',
  ], 'release_readiness_shape_invalid');
  if (value.environment !== 'staging'
      || !/^[a-f0-9]{40}$/u.test(value.commit)
      || !/^[a-f0-9]{40}$/u.test(value.previousCommit)
      || value.version !== `0.1.0-${value.commit.slice(0, 12)}`
      || !/^\d{4}-\d{2}-\d{2}T/u.test(value.buildTime)
      || !/^\d{8}T\d{6}Z$/u.test(value.deployedAt)
      || value.stagingFcm !== true
      || value.stagingSmtp !== true
      || value.stagingListingAi !== false
      || value.stagingStripe !== false
      || value.stagingPilotId !== 'heilbronn_wave0'
      || value.stagingReadiness.status !== 'passed'
      || !['ready', 'noncritical_support_deadline_overdue']
        .includes(value.stagingReadiness.state)
      || !Number.isSafeInteger(value.stagingReadiness.noncriticalNextUpdateOverdue)
      || value.stagingReadiness.noncriticalNextUpdateOverdue < 0
      || (value.stagingReadiness.state === 'ready'
        && value.stagingReadiness.noncriticalNextUpdateOverdue !== 0)
      || (value.stagingReadiness.state === 'noncritical_support_deadline_overdue'
        && value.stagingReadiness.noncriticalNextUpdateOverdue === 0)) {
    fail('release_record_invalid');
  }
  return {
    name: basename(path),
    mode: '600',
    ...Object.fromEntries(fields.map((field) => [field, value[field]])),
  };
}

function resources(run, memoryPath) {
  const lines = run('df', ['-Pk', deploymentRoot]).split('\n').filter(Boolean);
  const fields = lines.at(-1)?.trim().split(/\s+/u);
  if (!fields || fields.length < 6) fail('disk_inventory_invalid');
  const diskTotalKiB = integer(fields[1], 'disk_total_invalid');
  const diskAvailableKiB = integer(fields[3], 'disk_available_invalid');
  const diskUsedPercent = integer(fields[4]?.replace(/%$/u, ''), 'disk_percent_invalid');
  if (diskTotalKiB === 0 || diskAvailableKiB > diskTotalKiB || diskUsedPercent > 100) {
    fail('disk_inventory_invalid');
  }
  const memory = readFileSync(memoryPath, 'utf8');
  const total = memory.match(/^MemTotal:\s+(\d+)\s+kB$/mu);
  const available = memory.match(/^MemAvailable:\s+(\d+)\s+kB$/mu);
  if (!total || !available) fail('memory_inventory_invalid');
  const memoryTotalKiB = integer(total[1], 'memory_total_invalid');
  const memoryAvailableKiB = integer(available[1], 'memory_available_invalid');
  if (memoryTotalKiB === 0 || memoryAvailableKiB > memoryTotalKiB) {
    fail('memory_inventory_invalid');
  }
  return {
    diskTotalKiB,
    diskAvailableKiB,
    diskUsedPercent,
    diskBelowExistingHealthThreshold: diskUsedPercent < 85,
    memoryTotalKiB,
    memoryAvailableKiB,
  };
}

export function inspectStagingRuntimeReadonly({
  run = defaultRun,
  now = () => new Date(),
  releaseDirectory = defaultReleaseDirectory,
  memoryPath = defaultMemoryPath,
} = {}) {
  const api = inspectContainer(run, apiContainer);
  const database = inspectContainer(run, databaseContainer);
  const image = inspectImage(run, api.imageId);
  const runtime = inspectRuntime(run);
  const releaseRecord = latestReleaseRecord(resolve(releaseDirectory));
  const headroom = resources(run, memoryPath);

  if (runtime.values.APP_COMMIT !== image.revision
      || runtime.values.APP_VERSION !== image.version
      || runtime.values.APP_BUILD_TIME !== image.created
      || releaseRecord.commit !== image.revision
      || releaseRecord.version !== image.version
      || releaseRecord.buildTime !== image.created) {
    fail('release_runtime_image_mismatch');
  }
  const observedAt = now().toISOString();
  return Object.freeze({
    schemaVersion: 1,
    kind: inventoryKind,
    status: 'passed-read-only',
    observedAt,
    environment: 'staging',
    containers: { api, database },
    image,
    runtime,
    releaseRecord,
    resources: headroom,
    assessment: {
      exactRuntimeImageReleaseBinding: true,
      protectedRuntimeConfiguration: true,
      containersHealthy: true,
      rollbackImageLocallyAvailable: true,
      diskBelowExistingHealthThreshold: headroom.diskBelowExistingHealthThreshold,
      targetImageAvailable: false,
      deploymentPerformed: false,
    },
    boundaries: {
      credentialContentsRead: false,
      credentialPathsEmitted: false,
      containerConfigurationDumped: false,
      deploymentChanged: false,
      stagingDataChanged: false,
      productionChanged: false,
    },
  });
}

async function main() {
  try {
    if (process.argv.length !== 2) fail('unknown_argument');
    process.stdout.write(`${JSON.stringify(inspectStagingRuntimeReadonly())}\n`);
  } catch (error) {
    const code = error instanceof StagingRuntimeInventoryError
      ? error.code
      : 'unexpected_failure';
    process.stderr.write(`Staging runtime inventory failed: ${code}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  await main();
}
