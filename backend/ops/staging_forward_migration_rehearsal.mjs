#!/usr/bin/env node

import crypto from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

export const rehearsalMigrationFirst = 75;
export const rehearsalMigrationLast = 87;
export const rehearsalMigrationUpCount = 13;
export const rehearsalMigrationFileCount = 26;
export const stagingProjectName = 'sit-staging';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const postgresImage = 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';

function fail(code) {
  const error = new Error(`Staging forward-migration rehearsal failed: ${code}`);
  error.code = code;
  throw error;
}

function fullCommit(value, name = 'targetCommit') {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_commit`);
  return value;
}

export function assertStagingTarget({ project, apiContainer, databaseContainer, databaseVolume } = {}) {
  if (project !== stagingProjectName) fail('compose_project_not_staging');
  for (const [name, value] of Object.entries({ apiContainer, databaseContainer, databaseVolume })) {
    if (typeof value !== 'string' || value.trim() === '' || /prod|production/i.test(value)) {
      fail(`${name}_not_staging_safe`);
    }
  }
  return true;
}

export function assertStagingLabels({ labels, expectedService, expectedVolume = false } = {}) {
  if (labels?.['com.docker.compose.project'] !== stagingProjectName) {
    fail('docker_project_label_not_staging');
  }
  if (expectedVolume) {
    if (labels['com.docker.compose.volume'] !== 'shareittoo_staging_postgres_data') {
      fail('docker_volume_label_not_staging');
    }
  } else if (labels['com.docker.compose.service'] !== expectedService) {
    fail(`docker_service_label_unexpected_${expectedService}`);
  }
  return true;
}

export function validateStagingRunningSet(entries, {
  apiContainer,
  databaseContainer,
} = {}) {
  const allowedServices = new Map([
    [apiContainer, 'api'],
    [databaseContainer, 'postgres'],
  ]);
  const seenServices = new Set();
  for (const entry of entries ?? []) {
    const expectedService = allowedServices.get(entry.name);
    if (!expectedService) fail('unexpected_staging_container_before_quiesce');
    assertStagingLabels({ labels: entry.labels, expectedService });
    if (seenServices.has(expectedService)) fail('duplicate_staging_service_before_quiesce');
    seenServices.add(expectedService);
  }
  if (!seenServices.has('postgres')) fail('staging_database_not_running');
  if (!seenServices.has('api')) fail('staging_api_not_running');
  return Object.freeze(entries.filter((entry) => entry.name !== databaseContainer).map((entry) => entry.name));
}

export function buildStagingRehearsalPlan({ targetCommit, appliedRange = '001-074' } = {}) {
  fullCommit(targetCommit);
  if (appliedRange !== '001-074') fail('current_schema_range_must_be_001_074');
  return Object.freeze({
    targetCommit,
    project: stagingProjectName,
    currentAppliedRange: appliedRange,
    forwardRange: '075-087',
    upMigrations: rehearsalMigrationUpCount,
    migrationFiles: rehearsalMigrationFileCount,
    steps: Object.freeze([
      'verify staging compose/container/database/volume labels and reject production targets',
      'quiesce only running Staging API/mutating services and prove no foreign database writers',
      'create mode-0600 non-empty custom-format database backup and SHA-256 manifest',
      'restore that exact backup into an isolated pinned PostgreSQL 16 target',
      'verify aggregate table/data presence without emitting row or identity data',
      'apply migrations 075-087 forward-only and verify the complete 001-087 ledger',
      'run foreign-key and 075-087 structural/functional contract probes',
      'clean temporary restore resources, verify their absence, and leave all quiesced services stopped for controlled acceptance',
    ]),
    boundaries: Object.freeze({
      liveDatabaseMutation: false,
      productionTargetAllowed: false,
      automaticDownMigration: false,
      oldImageRollbackProof: false,
      servicesRemainQuiesced: true,
      apiResumed: false,
    }),
  });
}

function commandFailure(phase) {
  const error = new Error(`staging_rehearsal_${phase}_failed`);
  error.code = `staging_rehearsal_${phase}_failed`;
  return error;
}

export function runCommand(command, args, {
  input,
  cwd = repositoryRoot,
  env = process.env,
  phase = 'command',
  allowFailure = false,
} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', () => reject(commandFailure(phase)));
    child.once('close', (code) => {
      if (code === 0 || allowFailure) resolvePromise({ stdout, stderr, code });
      else reject(commandFailure(phase));
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function runCommandWithFileInput(command, args, filePath, {
  cwd = repositoryRoot,
  env = process.env,
  phase = 'command_file_input',
} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const inputStream = createReadStream(filePath);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const failInput = (error) => {
      inputStream.destroy();
      child.kill('SIGTERM');
      reject(commandFailure(`${phase}_input`));
    };
    inputStream.once('error', failInput);
    child.once('error', () => reject(commandFailure(phase)));
    child.once('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(commandFailure(phase));
    });
    inputStream.pipe(child.stdin);
  });
}

async function dockerInspectJson(name, format) {
  const result = await runCommand('docker', ['inspect', '--format', format, name]);
  try { return JSON.parse(result.stdout.trim()); } catch { fail('docker_inspect_json_invalid'); }
}

async function psql({ container, user, database, sql }) {
  const result = await runCommand('docker', [
    'exec', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1',
    '-U', user, '-d', database, '-Atc', sql,
  ]);
  return result.stdout.trim();
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolvePromise);
  });
  return hash.digest('hex');
}

function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

async function validateExistingDirectoryComponent(pathValue, { final = false } = {}) {
  const metadata = await lstat(pathValue);
  if (metadata.isSymbolicLink()) {
    const uid = currentUid();
    // macOS commonly exposes /var as a root-owned, non-writable system link.
    // User-owned or writable links remain fail-closed.
    if (uid === null || metadata.uid !== 0 || (metadata.mode & 0o022) !== 0 || final) {
      fail('rehearsal_backup_directory_symlink');
    }
    return metadata;
  }
  if (!metadata.isDirectory()) fail('rehearsal_backup_directory_component_not_directory');
  if ((metadata.mode & 0o022) !== 0) fail('rehearsal_backup_directory_component_group_world_writable');
  const uid = currentUid();
  if (uid !== null && metadata.uid !== uid && (final || metadata.uid !== 0)) {
    fail(final ? 'rehearsal_backup_directory_owner_invalid' : 'rehearsal_backup_directory_ancestor_owner_invalid');
  }
  return metadata;
}

export async function safeExternalDirectory(directory, { repository = repositoryRoot } = {}) {
  if (!isAbsolute(directory)) fail('rehearsal_backup_directory_not_absolute');
  const requested = resolve(directory);
  const resolvedRepository = resolve(repository);
  const relativePath = relative(resolvedRepository, requested);
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    fail('rehearsal_backup_directory_inside_repository');
  }
  const parts = requested.split('/').filter(Boolean);
  let current = requested.startsWith('/') ? '/' : '';
  for (const part of parts) {
    current = current === '/' ? `/${part}` : join(current, part);
    try {
      await validateExistingDirectoryComponent(current, { final: current === requested });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await mkdir(current, { mode: 0o700 });
      await validateExistingDirectoryComponent(current, { final: current === requested });
    }
  }
  const canonical = await realpath(requested);
  const canonicalRelative = relative(resolvedRepository, canonical);
  if (canonicalRelative === ''
    || (!canonicalRelative.startsWith('..') && !isAbsolute(canonicalRelative))) {
    fail('rehearsal_backup_directory_resolves_inside_repository');
  }
  return canonical;
}

async function migrationPlan() {
  const entries = await readdir(join(repositoryRoot, 'backend/sql/migrations'), { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.up.sql'))
    .map((entry) => entry.name).sort();
  const selected = files.filter((name) => {
    const number = Number.parseInt(name.slice(0, 3), 10);
    return number >= rehearsalMigrationFirst && number <= rehearsalMigrationLast;
  });
  if (selected.length !== rehearsalMigrationUpCount) fail('rehearsal_migration_inventory_unexpected');
  return selected.map((name) => ({ name, path: join(repositoryRoot, 'backend/sql/migrations', name) }));
}

async function writeDatabaseBackup({ databaseContainer, databaseUser, databaseName, backupDirectory, runId }) {
  const backupPath = join(backupDirectory, `staging-${runId}.dump`);
  const output = createWriteStream(backupPath, { flags: 'wx', mode: 0o600 });
  const outputClosed = new Promise((resolvePromise, reject) => {
    output.once('close', resolvePromise);
    output.once('error', reject);
  });
  const child = spawn('docker', [
    'exec', databaseContainer, 'pg_dump', '-U', databaseUser, '-d', databaseName,
    '--format=custom', '--no-owner', '--no-acl',
  ], { cwd: repositoryRoot, stdio: ['ignore', output, 'pipe'] });
  child.stderr.setEncoding('utf8');
  const code = await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', resolvePromise);
  });
  if (code !== 0) {
    output.destroy();
    throw commandFailure('pg_dump');
  }
  await outputClosed;
  const metadata = await stat(backupPath);
  if (metadata.size <= 0) fail('staging_backup_empty');
  await runCommandWithFileInput('docker', ['run', '--rm', '-i', postgresImage, 'pg_restore', '-l'], backupPath);
  const checksum = await sha256File(backupPath);
  const manifestPath = `${backupPath}.sha256`;
  await writeFile(manifestPath, `${checksum}  ${backupPath}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(manifestPath, 0o600);
  return { backupPath, manifestPath, checksum, bytes: metadata.size };
}

async function runFunctionalProbes({ container, user, database }) {
  const probeSql = `
BEGIN;
DO $$
DECLARE
  v_user_id TEXT;
  v_booking_id TEXT;
  v_payment_id UUID;
  v_refund_id UUID;
  v_payout_id UUID;
  v_payee_id TEXT;
  v_support_case_id UUID;
  v_command_key TEXT := 'rehearsal-command-' || gen_random_uuid()::text;
  v_identity_session_id TEXT := 'rehearsal-' || gen_random_uuid()::text;
  v_provider_session_id TEXT := 'provider-' || gen_random_uuid()::text;
  v_provider_hash TEXT := encode(digest(v_provider_session_id, 'sha256'), 'hex');
  observed BOOLEAN;
BEGIN
  SELECT u.id INTO v_user_id FROM users AS u ORDER BY u.id LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'rehearsal_fixture_users_missing'; END IF;
  DELETE FROM mfa_totp_factors WHERE user_id = v_user_id;

  SELECT p.id, po.id INTO v_payment_id, v_payout_id
    FROM payments p
    JOIN payouts po ON po.booking_id = p.booking_id AND po.payment_id = p.id
   WHERE NOT EXISTS (
     SELECT 1 FROM refunds r WHERE r.payment_id = p.id AND r.status IN ('created', 'pending')
   )
   LIMIT 1;
  IF v_payment_id IS NULL OR v_payout_id IS NULL THEN
    SELECT b.id, b.owner_id INTO v_booking_id, v_payee_id
      FROM bookings AS b ORDER BY b.id LIMIT 1;
    IF v_booking_id IS NULL THEN RAISE EXCEPTION 'rehearsal_fixture_booking_missing'; END IF;
    INSERT INTO payments (
      booking_id, provider_charge_id, idempotency_key, status,
      amount_minor, currency
    ) VALUES (
      v_booking_id, 'rehearsal-charge-' || gen_random_uuid()::text,
      'rehearsal-payment-' || gen_random_uuid()::text, 'captured', 100, 'EUR'
    ) RETURNING id INTO v_payment_id;
    INSERT INTO payouts (
      booking_id, payee_id, payment_id, idempotency_key, status, amount_minor, currency
    ) VALUES (
      v_booking_id, v_payee_id, v_payment_id,
      'rehearsal-payout-' || gen_random_uuid()::text, 'scheduled', 100, 'EUR'
    ) RETURNING id INTO v_payout_id;
  END IF;
  INSERT INTO payment_commands (idempotency_key, command_type, request_hash)
  VALUES (v_command_key, 'connect.onboard', repeat('a', 64));
  UPDATE payment_commands
     SET response_payload = '{"result":"rehearsal"}'::jsonb,
         completed_at = now(), completion_integrity_version = 1
   WHERE idempotency_key = v_command_key;
  BEGIN
    UPDATE payment_commands
       SET response_payload = '{"result":"tampered"}'::jsonb
     WHERE idempotency_key = v_command_key;
    RAISE EXCEPTION 'rehearsal_payment_command_mutation_was_accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'INSERT INTO refunds (payment_id, idempotency_key, status, amount_minor, currency, refund_platform_fee) VALUES (%L, %L, %L, 1, %L, false)',
      v_payment_id, 'rehearsal-legacy-' || gen_random_uuid()::text, 'created', 'EUR'
    );
    RAISE EXCEPTION 'rehearsal_legacy_refund_insert_was_accepted';
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  INSERT INTO refunds (
    payment_id, idempotency_key, status, amount_minor, currency,
    provider_refund_model, local_settlement_status, provider_observation_status
  ) VALUES (
    v_payment_id, 'rehearsal-current-refund-' || gen_random_uuid()::text, 'created', 1, 'EUR',
    'separate_charge_manual_transfer_reversal_v1', 'pending', 'none'
  ) RETURNING id INTO v_refund_id;

  INSERT INTO refund_transfer_reversals (
    refund_id, payment_id, payout_id, provider_transfer_id,
    provider_idempotency_key, amount_minor, currency
  ) VALUES (
    v_refund_id, v_payment_id, v_payout_id, 'rehearsal-transfer-' || gen_random_uuid()::text,
    'rehearsal-reversal-' || gen_random_uuid()::text, 1, 'EUR'
  );
  BEGIN
    INSERT INTO refund_transfer_reversals (
      refund_id, payment_id, payout_id, provider_transfer_id,
      provider_idempotency_key, amount_minor, currency
    ) VALUES (
      v_refund_id, v_payment_id, v_payout_id, 'rehearsal-duplicate-transfer',
      'rehearsal-duplicate-reversal-' || gen_random_uuid()::text, 1, 'EUR'
    );
    RAISE EXCEPTION 'rehearsal_reversal_duplicate_was_accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO account_legal_holds (
    user_id, reason_code, placed_by, idempotency_key,
    dataset_key, record_key, review_due_at, hold_ends_at
  ) VALUES (v_user_id, 'rehearsal_scope', v_user_id, 'rehearsal-hold-' || gen_random_uuid()::text,
    'rehearsal', 'record-' || gen_random_uuid()::text,
    now() + interval '1 hour', now() + interval '2 hours');

  SELECT s.id INTO v_support_case_id FROM support_cases AS s ORDER BY s.created_at LIMIT 1;
  IF v_support_case_id IS NULL THEN
    INSERT INTO support_cases (
      schema_version, human_readable_case_number, case_type, case_subtype,
      priority, severity, source_channel, operating_mode, reporter_user_id,
      reporter_role, current_owner_id, current_owner_role, approval_level,
      waiting_on, next_action, next_update_at, user_facing_summary, idempotency_key
    ) VALUES (
      1, 'SIT-REHEARSAL123', 'general_help', 'app_error_or_display',
      'p3', 'low', 'internal', 'simulation', v_user_id,
      'user', v_user_id, 'triage_owner', 'green_automatic',
      'none', 'rehearsal probe', now() + interval '1 hour',
      'Rehearsal support case', 'rehearsal-case-' || gen_random_uuid()::text
    ) RETURNING id INTO v_support_case_id;
  END IF;
  UPDATE support_cases SET intake_scope_evidence = jsonb_build_object(
    'version', 'sit_support_single_issue_scope_v1',
    'singleIssueConfirmed', true,
    'separationGuidanceShown', true
  ) WHERE id = v_support_case_id;
  BEGIN
    UPDATE support_cases SET intake_scope_evidence = '{"unexpected":true}'::jsonb
      WHERE id = v_support_case_id;
    RAISE EXCEPTION 'rehearsal_special_intake_invalid_was_accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO mfa_totp_factors (user_id, encrypted_secret, status)
  VALUES (v_user_id, 'rehearsal-encrypted-secret', 'pending');
  BEGIN
    UPDATE mfa_totp_factors SET status = 'enabled', enabled_at = NULL WHERE user_id = v_user_id;
    RAISE EXCEPTION 'rehearsal_mfa_enabled_without_timestamp_was_accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO identity_verification_sessions (
    id, user_id, provider, provider_session_id, status, idempotency_key, request_hash
  ) VALUES (
    v_identity_session_id, v_user_id, 'stripe_identity', v_provider_session_id,
    'requires_input', 'rehearsal-idempotency-' || gen_random_uuid()::text, repeat('b', 64)
  );
  BEGIN
    INSERT INTO identity_verification_sessions (
      id, user_id, provider, provider_session_id, status, idempotency_key, request_hash
    ) VALUES (
      'rehearsal-duplicate-' || gen_random_uuid()::text, v_user_id,
      'stripe_identity', 'provider-duplicate-' || gen_random_uuid()::text,
      'requires_input', 'rehearsal-idempotency-duplicate-' || gen_random_uuid()::text, repeat('c', 64)
    );
    RAISE EXCEPTION 'rehearsal_identity_active_duplicate_was_accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO identity_verification_redaction_outbox (provider_session_id, identity_session_id)
  VALUES (v_provider_session_id, v_identity_session_id);
  INSERT INTO identity_verification_webhook_events (
    provider_event_id, provider_session_id, event_type, identity_session_id
  ) VALUES ('rehearsal-event-' || gen_random_uuid()::text, v_provider_session_id,
    'identity.verification_session.requires_input', v_identity_session_id);
  UPDATE identity_verification_sessions
     SET consent_version = 'rehearsal-v1', consented_at = now()
   WHERE id = v_identity_session_id;
  UPDATE identity_verification_sessions
     SET status = 'redacted', provider_session_id = NULL, provider_session_hash = v_provider_hash
   WHERE id = v_identity_session_id;
  UPDATE identity_verification_redaction_outbox
     SET status = 'redacted', provider_session_id = NULL, provider_session_hash = v_provider_hash
   WHERE identity_session_id = v_identity_session_id;
  INSERT INTO identity_verification_provider_tombstones (provider_session_hash, expires_at)
  VALUES (v_provider_hash, now() + interval '1 day');

  INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id)
  VALUES (v_user_id, 'user', 'rehearsal', 'identity_verification_session', v_identity_session_id);
  BEGIN
    UPDATE audit_log SET action = 'tampered' WHERE resource_id = v_identity_session_id;
    RAISE EXCEPTION 'rehearsal_identity_audit_mutation_was_accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  SELECT pilot_closed INTO observed FROM identity_verification_control WHERE id = true;
  IF observed IS NULL OR observed THEN RAISE EXCEPTION 'rehearsal_identity_pilot_control_invalid'; END IF;
END $$;
ROLLBACK;`;
  await psqlScript({ container, user, database, sql: probeSql });
  return true;
}

async function psqlScript({ container, user, database, sql }) {
  return runCommand('docker', [
    'exec', '-i', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', user, '-d', database,
  ], { input: sql });
}

async function applyMigrationsWithApplicationRunner({ container, database, user, password }) {
  const port = await runCommand('docker', [
    'inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container,
  ]);
  const hostPort = port.stdout.trim();
  if (!/^\d+$/u.test(hostPort)) fail('isolated_postgres_host_port_invalid');
  const pool = new Pool({
    host: '127.0.0.1',
    port: Number(hostPort),
    user,
    database,
    password,
    max: 1,
  });
  try {
    const { runMigrations } = await import('../src/migrations.js');
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

export async function removeAndVerifyDockerResource(kind, name, { env = process.env } = {}) {
  const removeArgs = kind === 'container' ? ['rm', '-f', name] : ['volume', 'rm', name];
  const inspectArgs = kind === 'container' ? ['inspect', name] : ['volume', 'inspect', name];
  let removalError = null;
  try {
    await runCommand('docker', removeArgs, {
      phase: `cleanup_${kind}_remove`,
      env,
    });
  } catch {
    removalError = `cleanup_${kind}_remove_failed`;
  }
  try {
    const result = await runCommand('docker', inspectArgs, {
      phase: `cleanup_${kind}_verify`,
      allowFailure: true,
      env,
    });
    if (result.code === 0) return `cleanup_${kind}_still_present`;
    if (result.code !== 1) return `cleanup_${kind}_verify_failed`;
  } catch {
    return `cleanup_${kind}_verify_failed`;
  }
  return removalError;
}

export async function runStagingForwardMigrationRehearsal({
  targetCommit,
  environment = process.env,
  execute = environment.SIT_STAGING_REHEARSAL_EXECUTE === '1',
} = {}) {
  const plan = buildStagingRehearsalPlan({ targetCommit });
  if (!execute) fail('explicit_execute_flag_required');
  if (environment.SIT_STAGING_REHEARSAL_CONFIRM !== targetCommit) {
    fail('exact_rehearsal_confirmation_required');
  }
  await runCommand('git', ['cat-file', '-e', `${targetCommit}^{commit}`]);
  try {
    await runCommand('git', ['diff', '--quiet', targetCommit, '--', 'backend/src', 'backend/sql']);
  } catch {
    fail('runtime_source_differs_from_target_commit');
  }
  const project = environment.STAGING_COMPOSE_PROJECT ?? stagingProjectName;
  const apiContainer = environment.STAGING_API_CONTAINER ?? 'shareittoo-staging-api';
  const databaseContainer = environment.STAGING_DATABASE_CONTAINER ?? 'shareittoo-staging-postgres';
  const databaseVolume = environment.STAGING_DATABASE_VOLUME ?? 'shareittoo_staging_postgres_data';
  assertStagingTarget({ project, apiContainer, databaseContainer, databaseVolume });
  const databaseUser = environment.STAGING_DATABASE_USER ?? 'shareittoo_staging';
  const databaseName = environment.STAGING_DATABASE_NAME ?? 'shareittoo_staging';
  const requestedBackupDirectory = environment.STAGING_REHEARSAL_BACKUP_DIR ?? '/docker/shareittoo/backups/rehearsals';
  const backupDirectory = await safeExternalDirectory(requestedBackupDirectory);
  const opsCommit = fullCommit(environment.SIT_STAGING_REHEARSAL_OPS_COMMIT, 'opsCommit');
  const runningOpsCommit = (await runCommand('git', ['rev-parse', 'HEAD'], { phase: 'ops_commit_read' })).stdout.trim();
  if (runningOpsCommit !== opsCommit) fail('ops_commit_mismatch');
  const apiLabels = await dockerInspectJson(apiContainer, '{{json .Config.Labels}}');
  const databaseLabels = await dockerInspectJson(databaseContainer, '{{json .Config.Labels}}');
  const volumeLabels = await dockerInspectJson(databaseVolume, '{{json .Labels}}');
  assertStagingLabels({ labels: apiLabels, expectedService: 'api' });
  assertStagingLabels({ labels: databaseLabels, expectedService: 'postgres' });
  assertStagingLabels({ labels: volumeLabels, expectedVolume: true });
  const currentRange = await psql({
    container: databaseContainer,
    user: databaseUser,
    database: databaseName,
    sql: `SELECT count(*) FILTER (WHERE n BETWEEN 1 AND 74) || '|' ||
      count(*) FILTER (WHERE n BETWEEN 75 AND 87) || '|' || count(DISTINCT n)
      FROM (SELECT (regexp_match(name, '^([0-9]+)_'))[1]::int AS n FROM schema_migrations) AS rows`,
  });
  if (currentRange !== '74|0|74') fail('current_schema_migration_range_not_001_074');
  const forwardMigrations = await migrationPlan();

  const runId = `${new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const quiesced = [];
  let isolatedContainer = '';
  let isolatedVolume = '';
  let succeeded = false;
  let backup;
  let failureCode = null;
  let result;
  try {
    const running = (await runCommand('docker', [
      'ps', '--filter', `label=com.docker.compose.project=${stagingProjectName}`,
      '--format', '{{.Names}}',
    ])).stdout.trim().split(/\r?\n/u).filter(Boolean);
    const runningEntries = [];
    for (const name of running) {
      runningEntries.push({
        name,
        labels: await dockerInspectJson(name, '{{json .Config.Labels}}'),
      });
    }
    const toQuiesce = validateStagingRunningSet(runningEntries, { apiContainer, databaseContainer });
    for (const name of toQuiesce) {
      await runCommand('docker', ['stop', name]);
      quiesced.push(name);
    }
    const writersBeforeBackup = await psql({
      container: databaseContainer,
      user: databaseUser,
      database: databaseName,
      sql: `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    });
    if (writersBeforeBackup !== '0') fail('foreign_database_writers_before_backup');
    backup = await writeDatabaseBackup({ databaseContainer, databaseUser, databaseName, backupDirectory, runId });
    const writersAfterBackup = await psql({
      container: databaseContainer,
      user: databaseUser,
      database: databaseName,
      sql: `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    });
    if (writersAfterBackup !== '0') fail('foreign_database_writers_after_backup');

    isolatedVolume = `sit-staging-rehearsal-${runId}`;
    isolatedContainer = `sit-staging-rehearsal-pg-${runId}`;
    await runCommand('docker', ['volume', 'create', '--label', 'com.shareittoo.staging.rehearsal=true', isolatedVolume]);
    const isolatedPassword = crypto.randomBytes(32).toString('base64url');
    await runCommand('docker', [
      'run', '-d', '--name', isolatedContainer,
      '--label', 'com.shareittoo.staging.rehearsal=true',
      '--mount', `type=volume,src=${isolatedVolume},dst=/var/lib/postgresql/data`,
      '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_DB=shareittoo_rehearsal',
      '-e', 'POSTGRES_USER=shareittoo_rehearsal',
      '-e', `POSTGRES_PASSWORD=${isolatedPassword}`,
      postgresImage,
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await runCommand('docker', ['exec', isolatedContainer, 'pg_isready', '-h', '127.0.0.1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal']);
        break;
      } catch {
        if (attempt === 59) fail('isolated_postgres_not_ready');
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
      }
    }
    await runCommandWithFileInput('docker', [
      'exec', '-i', isolatedContainer, 'pg_restore', '-U', 'shareittoo_rehearsal',
      '-d', 'shareittoo_rehearsal', '--no-owner', '--no-acl',
    ], backup.backupPath);
    const aggregate = await psql({
      container: isolatedContainer,
      user: 'shareittoo_rehearsal',
      database: 'shareittoo_rehearsal',
      sql: `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') || '|' ||
        (SELECT COALESCE(sum(row_count), 0)::bigint FROM (
          SELECT count(*) AS row_count FROM users
          UNION ALL SELECT count(*) FROM listings
          UNION ALL SELECT count(*) FROM bookings
          UNION ALL SELECT count(*) FROM payments
          UNION ALL SELECT count(*) FROM refunds
          UNION ALL SELECT count(*) FROM payouts
          UNION ALL SELECT count(*) FROM payment_commands
          UNION ALL SELECT count(*) FROM support_cases
          UNION ALL SELECT count(*) FROM account_legal_holds
        ) AS exact_counts)`,
    });
    const [tableCount, restoredRows] = aggregate.split('|').map(Number);
    if (!Number.isFinite(tableCount) || tableCount < 1 || !Number.isFinite(restoredRows) || restoredRows <= 0) {
      fail('isolated_restore_empty');
    }
    await applyMigrationsWithApplicationRunner({
      container: isolatedContainer,
      database: 'shareittoo_rehearsal',
      user: 'shareittoo_rehearsal',
      password: isolatedPassword,
    });
    const ledger = await psql({
      container: isolatedContainer,
      user: 'shareittoo_rehearsal',
      database: 'shareittoo_rehearsal',
      sql: `SELECT count(*), count(DISTINCT (regexp_match(name, '^([0-9]+)_'))[1]::int),
        min((regexp_match(name, '^([0-9]+)_'))[1]::int), max((regexp_match(name, '^([0-9]+)_'))[1]::int)
        FROM schema_migrations`,
    });
    if (ledger !== '87|87|1|87') fail('rehearsal_migration_ledger_invalid');
    await runCommand('docker', ['exec', '-i', isolatedContainer, 'psql', '-X', '--set', 'ON_ERROR_STOP=1', '-U', 'shareittoo_rehearsal', '-d', 'shareittoo_rehearsal'], { input: await readFile(join(repositoryRoot, 'backend/ops/check_foreign_key_integrity.sql')) });
    await runFunctionalProbes({ container: isolatedContainer, user: 'shareittoo_rehearsal', database: 'shareittoo_rehearsal' });
    result = Object.freeze({
      status: 'passed',
      opsCommit,
      targetCommit,
      currentAppliedRange: '001-074',
      forwardAppliedRange: '075-087',
      backup: Object.freeze({ basename: backup.backupPath.split('/').pop(), bytes: backup.bytes, sha256: backup.checksum }),
      isolatedRestore: Object.freeze({
        aggregateOnly: true,
        migrations: '001-087',
        forwardMigrationFiles: forwardMigrations.length,
        functionalProbes: 'passed',
      }),
      servicesRemainQuiesced: true,
      apiResumed: false,
    });
    succeeded = true;
  } catch (error) {
    failureCode = error?.code ?? 'rehearsal_failed';
  } finally {
    const cleanupFailures = [];
    if (isolatedContainer) {
      const cleanupFailure = await removeAndVerifyDockerResource('container', isolatedContainer);
      if (cleanupFailure) cleanupFailures.push(cleanupFailure);
    }
    if (isolatedVolume) {
      const cleanupFailure = await removeAndVerifyDockerResource('volume', isolatedVolume);
      if (cleanupFailure) cleanupFailures.push(cleanupFailure);
    }
    if (cleanupFailures.length > 0) {
      succeeded = false;
      failureCode = 'cleanup_required';
    }
    if (!succeeded) {
      const failureReportPath = join(backupDirectory, `staging-${runId}-failure.json`);
      try {
        await writeFile(failureReportPath, `${JSON.stringify({
          status: 'fail-closed',
          opsCommit,
          targetCommit,
          currentAppliedRange: '001-074',
          forwardAppliedRange: 'not-applied-or-unverified',
          failureCode: failureCode ?? 'rehearsal_failed',
          cleanupFailures,
          quiescedServices: quiesced,
          servicesRemainQuiesced: true,
          servicesResumed: false,
          databaseRollback: 'not-attempted',
          mfaOverlay: 'not-touched',
        }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      } catch {
        failureCode = 'recovery_evidence_write_failed';
      }
    }
  }
  if (!succeeded) fail(failureCode ?? 'rehearsal_failed');
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const targetCommit = fullCommit(process.argv[2], 'targetCommit');
    const result = await runStagingForwardMigrationRehearsal({ targetCommit });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Staging forward-migration rehearsal failed.'}\n`);
    process.exitCode = 1;
  }
}
