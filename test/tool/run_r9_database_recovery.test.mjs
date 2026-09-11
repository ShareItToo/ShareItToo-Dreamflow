import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  attachR9PoolErrorBoundary,
  assertSafeR9TempRoot,
  r9RequiredMigrationCount,
  runR9DatabaseRecovery,
  validateR9Observation,
} from '../../tool/run_r9_database_recovery.mjs';

const hash = 'a'.repeat(64);

function passedObservation() {
  return {
    schemaVersion: 1,
    kind: 'sit-r9-database-recovery-observation',
    status: 'passed-and-cleaned',
    resultClassification: 'LOCAL_ISOLATED_DATABASE_RECOVERY_PROOF',
    postgresMajor: 16,
    migration: {
      emptyDatabaseTablesBeforeBootstrap: 0,
      totalMigrations: 73,
      firstMigration: '001_b3_foundation.up.sql',
      lastMigration: '073_listing_ai_on_device_provider.up.sql',
      secondRunAppliedMigrations: 0,
      checksumMismatches: 0,
      schemaFingerprintSha256: hash,
      tableCount: 100,
      columnCount: 900,
      constraintCount: 500,
      indexCount: 300,
      functionCount: 40,
      triggerCount: 50,
    },
    syntheticDataset: {
      accountCount: 12,
      listingCount: 6,
      supportPolicySnapshotCount: 1,
      listingAiDraftCount: 1,
      hardenedPriceSnapshotCount: 1,
      realUserRows: 0,
      realMoneyRows: 0,
      syntheticCredentialsRetained: false,
    },
    backupRestore: {
      format: 'postgres-custom',
      archiveReadable: true,
      archiveSha256: hash,
      restoredIntoFreshDatabase: true,
      schemaFingerprintMatch: true,
      dataDigestMatch: true,
      migrationInventoryMatch: true,
    },
    integrity: {
      invalidConstraints: 0,
      missingMigrationRows: 0,
      checksumMismatches: 0,
      orphanedListings: 0,
      orphanedListingAiDrafts: 0,
      orphanedPriceSnapshots: 0,
    },
    olderUpgrade: {
      startingMigration: '027_g2_persistent_rental_cart.up.sql',
      startingMigrationCount: 27,
      finalMigrationCount: 73,
      secondRunAppliedMigrations: 0,
      legacyUsersPreserved: 4,
      legacyListingsPreserved: 2,
      legacyCartItemsPreserved: 1,
      schemaFingerprintMatch: true,
    },
    rollback: {
      emptyR6RollbackAcceptedInsideRolledBackTransaction: true,
      refusedGuards: [
        '032_support_case_foundation.down.sql:Support rollback blocked: support data exists',
        '066_blue_ocean_listing_ai_foundation.down.sql:N2 rollback blocked: listing AI foundation data exists',
        '069_regional_price_engine_r6_hardening.down.sql:R6 rollback blocked: hardened price snapshot data exists',
        '071_stripe_connect_accounts_v2.down.sql:Stripe Accounts v2 rollback blocked: v2 connected accounts exist',
      ],
      allDestructiveRollbacksRefused: true,
      restoredDataDigestUnchanged: true,
    },
    networkBoundary: {
      postgresHost: '127.0.0.1',
      externalNetworkCalls: 0,
    },
    cleanup: {
      postgresStopped: true,
      temporaryClusterRemoved: true,
      backupArchiveRemoved: true,
      syntheticCredentialsRetained: false,
      persistentTestPrerequisiteCreated: false,
    },
    boundaries: {
      productionChanged: false,
      vpsChanged: false,
      cloudChanged: false,
      paymentChanged: false,
      realUserDataUsed: false,
      realMoneyUsed: false,
      credentialsExtracted: false,
    },
  };
}

test('accepts the complete isolated R9 recovery contract', async () => {
  assert.equal(r9RequiredMigrationCount, 73);
  const observation = passedObservation();
  assert.deepEqual(validateR9Observation(observation), observation);
  assert.deepEqual(await runR9DatabaseRecovery({
    executeRecovery: async () => observation,
  }), observation);
});

test('rejects incomplete restore, migration or rollback evidence', () => {
  const migration = passedObservation();
  migration.migration.totalMigrations = 68;
  assert.throws(() => validateR9Observation(migration), /migration proof/u);

  const restore = passedObservation();
  restore.backupRestore.dataDigestMatch = false;
  assert.throws(() => validateR9Observation(restore), /backup and restore/u);

  const rollback = passedObservation();
  rollback.rollback.refusedGuards.pop();
  assert.throws(() => validateR9Observation(rollback), /rollback proof/u);
});

test('rejects live scope, retained credentials and unsafe cleanup roots', () => {
  const live = passedObservation();
  live.boundaries.productionChanged = true;
  assert.throws(() => validateR9Observation(live), /boundary/u);

  const credential = passedObservation();
  credential.syntheticDataset.syntheticCredentialsRetained = true;
  assert.throws(() => validateR9Observation(credential), /synthetic dataset/u);

  assert.throws(() => assertSafeR9TempRoot(os.tmpdir()), /unsafe_r9_temp_root/u);
  assert.throws(
    () => assertSafeR9TempRoot(path.join(os.tmpdir(), 'unrelated')),
    /unsafe_r9_temp_root/u,
  );
});

test('suppresses only PostgreSQL administrative stop errors inside deliberate cleanup', () => {
  const pool = new EventEmitter();
  const cleanupState = {
    serverStopping: false,
    unexpectedPoolErrors: [],
  };
  assert.equal(attachR9PoolErrorBoundary(pool, cleanupState), pool);

  const earlyAdministrativeStop = Object.assign(
    new Error('terminating connection due to administrator command'),
    { code: '57P01' },
  );
  pool.emit('error', earlyAdministrativeStop);
  assert.deepEqual(cleanupState.unexpectedPoolErrors, [earlyAdministrativeStop]);

  cleanupState.unexpectedPoolErrors.length = 0;
  cleanupState.serverStopping = true;
  pool.emit('error', Object.assign(new Error('expected cleanup stop'), { code: '57P01' }));
  assert.deepEqual(cleanupState.unexpectedPoolErrors, []);

  const differentShutdownError = Object.assign(
    new Error('unexpected connection reset'),
    { code: 'ECONNRESET' },
  );
  pool.emit('error', differentShutdownError);
  assert.deepEqual(cleanupState.unexpectedPoolErrors, [differentShutdownError]);
});
