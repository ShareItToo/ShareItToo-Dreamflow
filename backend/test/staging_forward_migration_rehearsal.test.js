import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertStagingLabels,
  assertStagingTarget,
  buildStagingRehearsalPlan,
  runStagingForwardMigrationRehearsal,
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

test('rehearsal execution requires explicit exact confirmation before any Docker call', async () => {
  await assert.rejects(
    () => runStagingForwardMigrationRehearsal({ targetCommit: commit, execute: false }),
    (error) => error.code === 'explicit_execute_flag_required',
  );
});
