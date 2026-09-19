import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chmodSync, lstatSync } from 'node:fs';
import test from 'node:test';

import {
  assertStagingLabels,
  assertStagingTarget,
  buildStagingRehearsalPlan,
  buildFunctionalProbeSql,
  runStagingForwardMigrationRehearsal,
  writeDatabaseBackup,
  removeAndVerifyDockerResource,
  runCommand,
  runCommandWithFileInput,
  safeExternalDirectory,
  validateStagingRunningSet,
  validateStagingContainerInventory,
  assertDisposableResourceIdentity,
  normalizeReadinessFindings,
  assertReadinessFindingsUnchanged,
  buildReadinessFindingSql,
} from '../ops/staging_forward_migration_rehearsal.mjs';

const commit = '1'.repeat(40);

test('forward-migration rehearsal is exact-target-bound and never treats health as rollback proof', () => {
  const plan = buildStagingRehearsalPlan({ targetCommit: commit });
  assert.equal(plan.currentAppliedRange, '001-074');
  assert.equal(plan.forwardRange, '075-087');
  assert.equal(plan.upMigrations, 13);
  assert.equal(plan.migrationFiles, 26);
  assert.equal(plan.boundaries.automaticDownMigration, false);
  assert.equal(plan.boundaries.oldImageRollbackProof, false);
  assert.throws(
    () => buildStagingRehearsalPlan({ targetCommit: commit, appliedRange: '001-073' }),
    (error) => error.code === 'current_schema_range_must_be_001_074',
  );
});

test('rehearsal target labels reject production and mismatched containers/volumes', () => {
  assert.equal(assertStagingTarget({
    project: 'sit-staging',
    apiContainer: 'shareittoo-staging-api',
    databaseContainer: 'shareittoo-staging-postgres',
    databaseVolume: 'shareittoo_staging_postgres_data',
  }), true);
  assert.throws(
    () => assertStagingTarget({
      project: 'backend',
      apiContainer: 'shareittoo-api',
      databaseContainer: 'shareittoo-postgres',
      databaseVolume: 'shareittoo_postgres_data',
    }),
    (error) => error.code === 'compose_project_not_staging',
  );
  assert.throws(
    () => assertStagingLabels({
      labels: { 'com.docker.compose.project': 'backend', 'com.docker.compose.service': 'postgres' },
      expectedService: 'postgres',
    }),
    (error) => error.code === 'docker_project_label_not_staging',
  );
});

test('isolated rehearsal resources require disposable run labels and reject lookalikes', () => {
  const runId = '20260918010000-abcdef12';
  const labels = {
    'com.shareittoo.staging.rehearsal': 'true',
    'com.shareittoo.staging.rehearsal_run_id': runId,
  };
  for (const [resourceType, name] of [['container', `sit-staging-rehearsal-pg-${runId}`], ['container', `sit-staging-rehearsal-api-${runId}`], ['network', `sit-staging-rehearsal-network-${runId}`], ['volume', `sit-staging-rehearsal-volume-${runId}`]]) {
    assert.equal(assertDisposableResourceIdentity({
      resourceType,
      name,
      labels,
      runId,
    }), true);
  }
  assert.throws(
    () => assertDisposableResourceIdentity({
      resourceType: 'network',
      name: 'shareittoo_staging_backend',
      labels,
      runId,
    }),
    (error) => error.code === 'disposable_resource_name_mismatch',
  );
  assert.throws(
    () => assertDisposableResourceIdentity({
      resourceType: 'volume',
      name: `sit-staging-rehearsal-volume-${runId}`,
      labels: { ...labels, 'com.shareittoo.staging.rehearsal_run_id': 'other' },
      runId,
    }),
    (error) => error.code === 'disposable_resource_labels_missing',
  );
});

test('readiness findings are canonical, hashed-ID shaped and drift fail closed', () => {
  const before = normalizeReadinessFindings({
    paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'b'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }],
    supportNextUpdateOverdue: [{ id_hash: 'a'.repeat(64), cause: 'next_update_overdue', status: 'open', priority: 'p1', time_class: '1-24h' }],
  });
  const reordered = normalizeReadinessFindings({
    paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'b'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }],
    supportNextUpdateOverdue: [{ id_hash: 'a'.repeat(64), cause: 'next_update_overdue', status: 'open', priority: 'p1', time_class: '1-24h' }],
  });
  assert.equal(assertReadinessFindingsUnchanged(before, reordered), true);
  assert.throws(
    () => assertReadinessFindingsUnchanged(before, {
      paymentRecoveryNeedsReview: [],
      supportNextUpdateOverdue: reordered.supportNextUpdateOverdue,
    }),
    (error) => error.code === 'readiness_fingerprint_drift',
  );
  const sql = buildReadinessFindingSql();
  assert.match(sql, /digest\(id::text, 'sha256'\)/u);
  assert.match(sql, /paymentRecoveryNeedsReview/u);
  assert.match(sql, /supportNextUpdateOverdue/u);
  assert.match(sql, /contract_blocked/u);
  assert.doesNotMatch(sql, /email|profile|summary/u);
  assert.throws(
    () => buildReadinessFindingSql({ payoutHoldHours: 721 }),
    (error) => error.code === 'readiness_payout_hold_hours_invalid',
  );
  assert.throws(
    () => normalizeReadinessFindings({
      paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'a'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h', secret: 'x' }],
      supportNextUpdateOverdue: [],
    }),
    (error) => error.code === 'readiness_fingerprint_extra_field',
  );
});

test('backup path safety validates before mutation and rejects symlink/repo/mode escapes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-rehearsal-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, 'repo');
  const outside = join(root, 'outside');
  await mkdir(repository, { mode: 0o700 });
  await mkdir(outside, { mode: 0o700 });
  const safe = await safeExternalDirectory(join(outside, 'new', 'rehearsals'), { repository });
  assert.match(safe, /new\/rehearsals$/u);

  const target = join(outside, 'target');
  const finalLink = join(outside, 'final-link');
  await mkdir(target, { mode: 0o700 });
  await symlink(target, finalLink);
  await assert.rejects(
    () => safeExternalDirectory(finalLink, { repository }),
    (error) => error.code === 'rehearsal_backup_directory_symlink',
  );

  const intermediateTarget = join(outside, 'intermediate-target');
  const intermediateLink = join(outside, 'intermediate-link');
  await mkdir(intermediateTarget, { mode: 0o700 });
  await symlink(intermediateTarget, intermediateLink);
  await assert.rejects(
    () => safeExternalDirectory(join(intermediateLink, 'child'), { repository }),
    (error) => error.code === 'rehearsal_backup_directory_symlink',
  );

  const unsafe = join(outside, 'unsafe');
  await mkdir(unsafe, { mode: 0o700 });
  await chmod(unsafe, 0o770);
  await assert.rejects(
    () => safeExternalDirectory(unsafe, { repository }),
    (error) => error.code === 'rehearsal_backup_directory_component_group_world_writable',
  );
  await assert.rejects(
    () => safeExternalDirectory(join(repository, 'inside'), { repository }),
    (error) => error.code === 'rehearsal_backup_directory_inside_repository',
  );

  const sharedTemp = lstatSync(tmpdir());
  if (!sharedTemp.isSymbolicLink() && sharedTemp.uid === 0 && (sharedTemp.mode & 0o1000) !== 0) {
    const sharedTarget = join(tmpdir(), `sit-rehearsal-shared-${process.pid}`);
    t.after(() => rm(sharedTarget, { recursive: true, force: true }));
    const sharedResult = await safeExternalDirectory(join(sharedTarget, 'child'), { repository });
    assert.match(sharedResult, /sit-rehearsal-shared-\d+\/child$/u);
  }
});

test('quiesce target set is fully validated before any container stop', () => {
  const labels = (service) => ({
    'com.docker.compose.project': 'sit-staging',
    'com.docker.compose.service': service,
  });
  assert.deepEqual(
    validateStagingRunningSet([
      { name: 'shareittoo-staging-api', labels: labels('api') },
      { name: 'shareittoo-staging-postgres', labels: labels('postgres') },
    ], {
      apiContainer: 'shareittoo-staging-api',
      databaseContainer: 'shareittoo-staging-postgres',
    }),
    ['shareittoo-staging-api'],
  );
  assert.throws(
    () => validateStagingRunningSet([
      { name: 'shareittoo-staging-api', labels: labels('api') },
      { name: 'unexpected-worker', labels: labels('worker') },
      { name: 'shareittoo-staging-postgres', labels: labels('postgres') },
    ], {
      apiContainer: 'shareittoo-staging-api',
      databaseContainer: 'shareittoo-staging-postgres',
    }),
    (error) => error.code === 'unexpected_staging_container_before_quiesce',
  );
});

test('inventory accepts only an already-stopped API with a running database', () => {
  const labels = (service) => ({
    'com.docker.compose.project': 'sit-staging',
    'com.docker.compose.service': service,
  });
  const base = [
    { name: 'shareittoo-staging-api', state: 'exited', labels: labels('api') },
    { name: 'shareittoo-staging-postgres', state: 'running', labels: labels('postgres') },
  ];
  assert.deepEqual(
    validateStagingContainerInventory(base, {
      apiContainer: 'shareittoo-staging-api',
      databaseContainer: 'shareittoo-staging-postgres',
    }),
    [],
  );
  for (const state of ['created', 'dead']) {
    assert.throws(
      () => validateStagingContainerInventory(
        base.map((entry) => entry.name.endsWith('api') ? { ...entry, state } : entry),
        { apiContainer: 'shareittoo-staging-api', databaseContainer: 'shareittoo-staging-postgres' },
      ),
      (error) => error.code === 'staging_api_state_unexpected',
    );
  }
  assert.deepEqual(
    validateStagingContainerInventory(base.map((entry) => ({ ...entry, state: 'running' })), {
      apiContainer: 'shareittoo-staging-api',
      databaseContainer: 'shareittoo-staging-postgres',
    }),
    ['shareittoo-staging-api'],
  );
  assert.throws(
    () => validateStagingContainerInventory(
      base.map((entry) => entry.name.endsWith('postgres') ? { ...entry, state: 'exited' } : entry),
      { apiContainer: 'shareittoo-staging-api', databaseContainer: 'shareittoo-staging-postgres' },
    ),
    (error) => error.code === 'staging_database_not_running',
  );
  assert.throws(
    () => validateStagingContainerInventory(
      base.filter((entry) => entry.name !== 'shareittoo-staging-api'),
      { apiContainer: 'shareittoo-staging-api', databaseContainer: 'shareittoo-staging-postgres' },
    ),
    (error) => error.code === 'staging_api_not_running',
  );
  assert.throws(
    () => validateStagingContainerInventory(
      [...base, { name: 'unexpected-worker', state: 'exited', labels: labels('worker') }],
      { apiContainer: 'shareittoo-staging-api', databaseContainer: 'shareittoo-staging-postgres' },
    ),
    (error) => error.code === 'unexpected_staging_container_before_quiesce',
  );
});

test('rehearsal execution requires explicit exact confirmation before any Docker call', async () => {
  await assert.rejects(
    () => runStagingForwardMigrationRehearsal({ targetCommit: commit, execute: false }),
    (error) => error.code === 'explicit_execute_flag_required',
  );
});

test('command failures and file-input failures never expose command output', async () => {
  await assert.rejects(
    () => runCommand(process.execPath, ['-e', 'console.error("SENSITIVE_STDERR"); process.exit(7)'], {
      phase: 'sanitization_probe',
    }),
    (error) => error.code === 'staging_rehearsal_sanitization_probe_failed'
      && !error.message.includes('SENSITIVE_STDERR'),
  );
  const root = await mkdtemp(join(tmpdir(), 'sit-rehearsal-input-'));
  try {
    const inputPath = join(root, 'input.txt');
    await writeFile(inputPath, 'SENSITIVE_INPUT');
    await assert.rejects(
      () => runCommandWithFileInput(
        process.execPath,
        ['-e', 'process.stderr.write("SENSITIVE_FILE_STDERR"); process.exit(8)'],
        inputPath,
        { phase: 'file_sanitization_probe' },
      ),
      (error) => error.code === 'staging_rehearsal_file_sanitization_probe_failed'
        && !error.message.includes('SENSITIVE_FILE_STDERR'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup stream opens and flushes before archive verification; expected list EPIPE is benign', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-rehearsal-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  const backupDirectory = join(root, 'backups');
  await mkdir(bin, { mode: 0o700 });
  await mkdir(backupDirectory, { mode: 0o700 });
  const docker = join(bin, 'docker');
  await writeFile(docker, `#!/bin/sh
if [ "$1" = "exec" ]; then
  dd if=/dev/zero bs=1024 count=16 2>/dev/null
  exit 0
fi
if [ "$1" = "run" ]; then
  dd if=/dev/stdin bs=1 count=1 of=/dev/null 2>/dev/null
  exit 0
fi
exit 42
`);
  chmodSync(docker, 0o700);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const result = await writeDatabaseBackup({
    databaseContainer: 'staging-db',
    databaseUser: 'staging-user',
    databaseName: 'staging-db',
    backupDirectory,
    runId: 'test-stream-open-flush',
    env,
  });
  assert.equal(result.bytes, 16 * 1024);
  assert.match(result.checksum, /^[0-9a-f]{64}$/u);
  const manifest = await readFile(result.manifestPath, 'utf8');
  assert.match(manifest, new RegExp(`^${result.checksum}  `, 'u'));
});

test('functional probe supplies the current refund amount breakdown contract', () => {
  const sql = buildFunctionalProbeSql();
  assert.match(sql, /owner_share_minor, platform_share_minor,/u);
  assert.match(sql, /\n    1, 0, 'separate_charge_manual_transfer_reversal_v1'/u);
  assert.match(sql, /idempotency_key, intake_scope_evidence[\s\S]*jsonb_build_object\(/u);
  assert.match(sql, /SIT-' \|\| substr\(regexp_replace\(/u);
  assert.doesNotMatch(sql, /FROM support_cases AS s/u);
  assert.doesNotMatch(sql, /UPDATE support_cases SET intake_scope_evidence = jsonb_build_object/u);
  assert.match(sql, /UPDATE support_cases[\s\S]*EXCEPTION WHEN SQLSTATE '55000' THEN NULL;/u);
});

test('cleanup must prove absence and never resume services implicitly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sit-rehearsal-docker-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  const argsLog = join(root, 'docker-args.log');
  await mkdir(bin, { mode: 0o700 });
  const docker = join(bin, 'docker');
  await writeFile(docker, `#!/bin/sh
if [ -n "$DOCKER_ARGS_LOG" ]; then printf '%s\\n' "$*" >> "$DOCKER_ARGS_LOG"; fi
if [ "$1" = "rm" ]; then exit "${'${DOCKER_RM_EXIT:-0}'}"; fi
if [ "$1" = "volume" ] && [ "$2" = "rm" ]; then exit "${'${DOCKER_RM_EXIT:-0}'}"; fi
if [ "$1" = "ps" ] || { [ "$1" = "volume" ] && [ "$2" = "ls" ]; }; then
  [ -n "${'${DOCKER_LIST_OUTPUT:-}'}" ] && printf '%s\\n' "${'${DOCKER_LIST_OUTPUT}'}"
  exit "${'${DOCKER_LIST_EXIT:-0}'}"
fi
exit 1
`);
  chmodSync(docker, 0o700);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_ARGS_LOG: argsLog };
  assert.equal(
    await removeAndVerifyDockerResource('container', 'rehearsal-c', {
      env: { ...env, DOCKER_LIST_EXIT: '1' },
    }),
    'cleanup_container_verify_failed',
  );
  assert.equal(await removeAndVerifyDockerResource('container', 'rehearsal-c', { env }), null);
  assert.equal(
    await removeAndVerifyDockerResource('container', 'rehearsal-c', {
      env: { ...env, DOCKER_RM_EXIT: '42' },
    }),
    'cleanup_container_remove_failed',
  );
  assert.equal(
    await removeAndVerifyDockerResource('volume', 'rehearsal-v', {
      env: { ...env, DOCKER_LIST_OUTPUT: 'rehearsal-v' },
    }),
    'cleanup_volume_still_present',
  );
  assert.equal(
    await removeAndVerifyDockerResource('container', 'rehearsal-c', {
      env: { ...env, DOCKER_LIST_OUTPUT: 'other-resource' },
    }),
    'cleanup_container_still_present',
  );
  const args = await readFile(argsLog, 'utf8');
  assert.match(args, /rm -f rehearsal-c/u);
  assert.match(args, /volume rm rehearsal-v/u);
  assert.match(args, /ps -a --filter name=\^\/rehearsal-c\$ --format \{\{\.Names\}\}/u);
  assert.match(args, /volume ls --filter name=\^rehearsal-v\$ --format \{\{\.Name\}\}/u);
  const plan = buildStagingRehearsalPlan({ targetCommit: commit });
  assert.equal(plan.boundaries.servicesRemainQuiesced, true);
  assert.equal(plan.boundaries.apiResumed, false);
  assert.doesNotMatch(plan.steps.join(' '), /resume/u);
});
