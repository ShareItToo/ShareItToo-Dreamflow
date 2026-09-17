import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertStagingLabels,
  assertStagingTarget,
  buildStagingRehearsalPlan,
  runStagingForwardMigrationRehearsal,
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
