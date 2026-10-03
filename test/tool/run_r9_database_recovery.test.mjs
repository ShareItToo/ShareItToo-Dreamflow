import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
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

test('R9 rollback quote fixes ordered issuance and expiry independently of the database clock', () => {
  const runner = readFileSync(new URL('../../tool/run_r9_database_recovery.mjs', import.meta.url), 'utf8');
  const quoteInsert = runner.match(/INSERT INTO booking_quotes \(([\s\S]*?)\) VALUES \(([\s\S]*?)\)`/u);
  assert.ok(quoteInsert, 'the exact-time rollback guard must insert its quote fixture');
  const columns = quoteInsert[1].split(',').map((value) => value.trim());
  const values = quoteInsert[2].split(',').map((value) => value.trim());
  assert.equal(columns.length, values.length);
  const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  for (const column of ['issued_at', 'expires_at']) {
    assert.match(row[column] ?? '', /^'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z'$/u,
      `${column} must be an explicit synthetic instant, never DEFAULT now()`);
  }
  assert.ok(Date.parse(row.issued_at.slice(1, -1)) < Date.parse(row.expires_at.slice(1, -1)),
    'the synthetic quote must satisfy issued_at < expires_at at any runner date');
});

function passedObservation() {
  return {
    schemaVersion: 1,
    kind: 'sit-r9-database-recovery-observation',
    status: 'passed-and-cleaned',
    resultClassification: 'LOCAL_ISOLATED_DATABASE_RECOVERY_PROOF',
    postgresMajor: 16,
    migration: {
      emptyDatabaseTablesBeforeBootstrap: 0,
      totalMigrations: 105,
      firstMigration: '001_b3_foundation.up.sql',
      lastMigration: '105_staging_password_enrollment_redemptions.up.sql',
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
      finalMigrationCount: 105,
      secondRunAppliedMigrations: 0,
      legacyUsersPreserved: 4,
      legacyListingsPreserved: 2,
      legacyCartItemsPreserved: 1,
      legacyCartRowsByteEquivalent: true,
      schemaFingerprintMatch: true,
    },
    rollback: {
      emptyR6RollbackAcceptedInsideRolledBackTransaction: true,
      refusedGuards: [
        '032_support_case_foundation.down.sql:Support rollback blocked: support data exists',
        '066_blue_ocean_listing_ai_foundation.down.sql:N2 rollback blocked: listing AI foundation data exists',
        '069_regional_price_engine_r6_hardening.down.sql:R6 rollback blocked: hardened price snapshot data exists',
        '071_stripe_connect_accounts_v2.down.sql:Stripe Accounts v2 rollback blocked: v2 connected accounts exist',
        '074_listing_ai_on_device_disclosure.down.sql:On-device listing AI disclosure rollback blocked: durable consent history exists',
        '075_refund_transfer_reversal_recovery.down.sql:Refund transfer reversal rollback blocked: durable provider recovery data exists',
        '077_refund_provider_truth_parity.down.sql:Refund provider truth rollback blocked: post-migration refunds exist',
        '095_staging_google_registration_replays.down.sql:staging_google_registration_replays_active_rows',
        '096_booking_exact_time_snapshot.down.sql:booking_exact_time_snapshot_active_rows',
        '097_registration_consent_bundle.down.sql:registration_consent_bundles_active_rows',
        '098_booking_checkout_declaration_constraints.down.sql:v52_booking_declaration_rows_active',
        '099_mission_need_revisions.down.sql:mission_need_rows_active',
        '100_private_shelf_items.down.sql:private_shelf_rows_active',
        '101_mission_fit_checks.down.sql:mission_fit_check_rows_active',
        '102_mission_inventory_resolutions.down.sql:mission_inventory_resolution_rows_active',
        '103_mission_supply_demands.down.sql:mission_supply_demand_rows_active',
        '104_mission_supply_participation.down.sql:mission_supply_participation_rows_active',
        '105_staging_password_enrollment_redemptions.down.sql:staging_password_enrollment_active_redemptions',
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
  assert.equal(r9RequiredMigrationCount, 105);
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

  const legacyCartParity = passedObservation();
  delete legacyCartParity.olderUpgrade.legacyCartRowsByteEquivalent;
  assert.throws(
    () => validateR9Observation(legacyCartParity),
    /older-schema upgrade proof/u,
  );
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
