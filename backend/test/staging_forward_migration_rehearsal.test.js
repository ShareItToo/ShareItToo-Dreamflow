import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chmodSync } from 'node:fs';
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
  assert.match(sql, /FROM support_cases AS s[\s\S]*WHERE s\.intake_scope_evidence IS NULL/u);
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
