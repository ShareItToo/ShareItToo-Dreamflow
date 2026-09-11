#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runMigrations } from '../backend/src/migrations.js';
import {
  findAvailableLoopbackPort,
  parsePostgresMajor,
  requiredPostgresMajor,
  resolvePostgresBinDir,
} from './run_local_postgres_integration.mjs';

const requireFromBackend = createRequire(
  new URL('../backend/package.json', import.meta.url),
);

export const r9RequiredMigrationCount = 74;
export const r9SyntheticAccountCount = 12;
export const r9SyntheticListingCount = 6;
export const r9ResultClassification = 'LOCAL_ISOLATED_DATABASE_RECOVERY_PROOF';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempPrefix = 'sit-r9-database-recovery-';
const databaseUser = 'sit_r9_runner';
const databaseNames = Object.freeze({
  source: 'sit_r9_source',
  restored: 'sit_r9_restored',
  legacy: 'sit_r9_legacy',
  rollbackControl: 'sit_r9_rollback_control',
});
const rollbackGuardExpectations = Object.freeze([
  Object.freeze({
    filename: '032_support_case_foundation.down.sql',
    message: 'Support rollback blocked: support data exists',
  }),
  Object.freeze({
    filename: '066_blue_ocean_listing_ai_foundation.down.sql',
    message: 'N2 rollback blocked: listing AI foundation data exists',
  }),
  Object.freeze({
    filename: '069_regional_price_engine_r6_hardening.down.sql',
    message: 'R6 rollback blocked: hardened price snapshot data exists',
  }),
  Object.freeze({
    filename: '071_stripe_connect_accounts_v2.down.sql',
    message: 'Stripe Accounts v2 rollback blocked: v2 connected accounts exist',
  }),
  Object.freeze({
    filename: '074_listing_ai_on_device_disclosure.down.sql',
    message: 'On-device listing AI disclosure rollback blocked: durable consent history exists',
  }),
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function compactFailureOutput(value) {
  return value.trim().split(/\r?\n/u).slice(-40).join('\n').slice(0, 8_000);
}

async function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = compactFailureOutput(`${stderr}\n${stdout}`);
      reject(new Error(
        `${path.basename(command)} failed with exit ${code ?? signal ?? 'unknown'}`
          + (detail === '' ? '.' : `: ${detail}`),
      ));
    });
  });
}

async function executable(candidate) {
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function assertSafeR9TempRoot(candidate, base = os.tmpdir()) {
  const resolvedBase = path.resolve(base);
  const resolvedCandidate = path.resolve(candidate);
  if (path.dirname(resolvedCandidate) !== resolvedBase
      || !path.basename(resolvedCandidate).startsWith(tempPrefix)) {
    fail('unsafe_r9_temp_root');
  }
  return resolvedCandidate;
}

async function readMigrationPlan(root) {
  const directory = path.join(root, 'backend/sql/migrations');
  const entries = await readdir(directory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.up.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const plan = [];
  for (const filename of filenames) {
    const sql = await readFile(path.join(directory, filename), 'utf8');
    plan.push(Object.freeze({ filename, sql, checksum: sha256(sql) }));
  }
  if (plan.length !== r9RequiredMigrationCount
      || plan[0]?.filename !== '001_b3_foundation.up.sql'
      || plan.at(-1)?.filename !== '074_listing_ai_on_device_disclosure.up.sql') {
    fail('r9_migration_inventory_unexpected');
  }
  return Object.freeze(plan);
}

async function tableCount(pool) {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return result.rows[0].count;
}

async function migrationRows(pool) {
  const result = await pool.query(
    `SELECT name, checksum, applied_at::text
       FROM schema_migrations ORDER BY name`,
  );
  return result.rows;
}

function verifyMigrationRows(rows, plan) {
  const expected = plan.map(({ filename, checksum }) => ({
    name: filename,
    checksum,
  }));
  const actual = rows.map(({ name, checksum }) => ({ name, checksum }));
  if (!exact(actual, expected)) fail('r9_migration_rows_or_checksums_invalid');
}

async function applyMigrationPrefix(pool, plan, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > plan.length) {
    fail('r9_migration_prefix_invalid');
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const client = await pool.connect();
  try {
    for (const migration of plan.slice(0, count)) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.filename, migration.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function applyCurrentSchema(pool, root) {
  const schema = await readFile(path.join(root, 'backend/sql/schema.sql'), 'utf8');
  await pool.query(schema);
  await runMigrations(pool);
}

async function verifySecondMigrationRun(pool, plan) {
  const before = await migrationRows(pool);
  verifyMigrationRows(before, plan);
  await runMigrations(pool);
  const after = await migrationRows(pool);
  verifyMigrationRows(after, plan);
  if (!exact(after, before)) fail('r9_second_migration_run_changed_ledger');
  return 0;
}

async function schemaFingerprint(pool) {
  const [tables, columns, constraints, indexes, functions, triggers] =
    await Promise.all([
      pool.query(
        `SELECT c.relname AS name, c.relkind AS kind
           FROM pg_class AS c
           JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          ORDER BY c.relname`,
      ),
      pool.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                format_type(a.atttypid, a.atttypmod) AS data_type,
                a.attnotnull AS not_null,
                COALESCE(pg_get_expr(d.adbin, d.adrelid), '') AS default_expression
           FROM pg_attribute AS a
           JOIN pg_class AS c ON c.oid = a.attrelid
           JOIN pg_namespace AS n ON n.oid = c.relnamespace
           LEFT JOIN pg_attrdef AS d
             ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY c.relname, a.attnum`,
      ),
      pool.query(
        `SELECT COALESCE(c.relname, '') AS table_name, con.conname AS name,
                con.contype AS type, con.convalidated AS validated,
                pg_get_constraintdef(con.oid, true) AS definition
           FROM pg_constraint AS con
           JOIN pg_namespace AS n ON n.oid = con.connamespace
           LEFT JOIN pg_class AS c ON c.oid = con.conrelid
          WHERE n.nspname = 'public'
          ORDER BY COALESCE(c.relname, ''), con.conname`,
      ),
      pool.query(
        `SELECT tablename AS table_name, indexname AS name, indexdef AS definition
           FROM pg_indexes WHERE schemaname = 'public'
          ORDER BY tablename, indexname`,
      ),
      pool.query(
        `SELECT p.proname AS name,
                pg_get_function_identity_arguments(p.oid) AS arguments,
                pg_get_function_result(p.oid) AS result,
                p.prokind AS kind, p.provolatile AS volatility, p.prosrc AS source
           FROM pg_proc AS p
           JOIN pg_namespace AS n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
          ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
      ),
      pool.query(
        `SELECT c.relname AS table_name, t.tgname AS name,
                t.tgenabled AS enabled,
                pg_get_triggerdef(t.oid, true) AS definition
           FROM pg_trigger AS t
           JOIN pg_class AS c ON c.oid = t.tgrelid
           JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND NOT t.tgisinternal
          ORDER BY c.relname, t.tgname`,
      ),
    ]);
  const canonical = {
    tables: tables.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    functions: functions.rows,
    triggers: triggers.rows,
  };
  return Object.freeze({
    sha256: sha256(JSON.stringify(canonical)),
    tableCount: canonical.tables.length,
    columnCount: canonical.columns.length,
    constraintCount: canonical.constraints.length,
    indexCount: canonical.indexes.length,
    functionCount: canonical.functions.length,
    triggerCount: canonical.triggers.length,
  });
}

async function insertSyntheticDataset(pool) {
  for (let index = 1; index <= r9SyntheticAccountCount; index += 1) {
    const suffix = String(index).padStart(3, '0');
    await pool.query(
      `INSERT INTO users (id, email, profile)
       VALUES ($1, $2, $3::jsonb)`,
      [
        `r9-user-${suffix}`,
        `r9-user-${suffix}@example.invalid`,
        JSON.stringify({ fixture: 'r9', synthetic: true, sequence: index }),
      ],
    );
  }
  for (let index = 1; index <= r9SyntheticListingCount; index += 1) {
    const suffix = String(index).padStart(3, '0');
    const ownerSuffix = String(index).padStart(3, '0');
    await pool.query(
      `INSERT INTO listings (id, owner_id, payload, is_active)
       VALUES ($1, $2, $3::jsonb, false)`,
      [
        `r9-listing-${suffix}`,
        `r9-user-${ownerSuffix}`,
        JSON.stringify({
          id: `r9-listing-${suffix}`,
          ownerId: `r9-user-${ownerSuffix}`,
          title: `R9 synthetic listing ${suffix}`,
          fixture: 'r9',
          synthetic: true,
        }),
      ],
    );
  }
  await pool.query(
    `INSERT INTO support_policy_snapshots (
       policy_type, version, effective_from, rule_values,
       source_document_ids, approval_reference, content_sha256
     ) VALUES (
       'r9_recovery_fixture', 'r9-v1', '2026-08-24T00:00:00Z',
       '{"synthetic":true}'::jsonb, '{}', 'R9 isolated recovery fixture', $1
     )`,
    ['1'.repeat(64)],
  );
  const draftId = 'listing_ai_draft_90000000-0000-4000-8000-000000000001';
  await pool.query(
    `INSERT INTO listing_ai_drafts (
       id, domain_version, schema_version, prompt_version, owner_id,
       disclosure_version, disclosure_accepted_at
     ) VALUES (
       $1, 'N2-2026-08-23.1', 'listing-ai-draft-v1',
       'listing-ai-prompt-v1', 'r9-user-001',
       'listing-ai-on-device-disclosure-v1', '2026-09-11T00:00:00Z'
     )`,
    [draftId],
  );
  const confirmations = Object.fromEntries([
    'ownership', 'item_identity', 'allowed_category', 'functionality',
    'condition', 'accessories', 'owner_price', 'duration_discounts',
    'availability', 'pickup_region', 'final_publication',
  ].map((key) => [key, false]));
  const version = await pool.query(
    `INSERT INTO listing_ai_draft_versions (
       draft_id, revision, generation_key, generation_mode, input_image_refs,
       fields, clarification_questions, owner_confirmations, payload_sha256
     ) VALUES (
       $1, 1, $2, 'manual_foundation', $3::jsonb, '{}'::jsonb,
       '[]'::jsonb, $4::jsonb, $5
     ) RETURNING id`,
    [
      draftId,
      '2'.repeat(64),
      JSON.stringify(['r9_image_ref_0001']),
      JSON.stringify(confirmations),
      '3'.repeat(64),
    ],
  );
  await pool.query(
    `INSERT INTO regional_price_engine_snapshots (
       draft_id, draft_version_id, engine_authority, engine_version,
       input_sha256, range_low_minor, recommended_daily_minor,
       range_high_minor, explanation, snapshot_payload,
       market_observation_version, fallback_anchor_minor,
       regional_weighted_median_minor, effective_observation_count_milli,
       geography_scope, confidence, fallback_share_basis_points,
       demand_factor_basis_points, duration_schedule, quote_preview,
       owner_selected_daily_minor, owner_override_applied,
       synthetic_learning_applied
     ) VALUES (
       $1, $2, 'SIT_REGIONAL_PRICE_ENGINE_V2', 'R6-2026-08-24.1',
       $3, 1400, 1500, 1600, 'R9 deterministic recovery fixture.',
       '{"synthetic":true}'::jsonb, 'regional-market-observation-v2',
       1700, 1500, 1000, 'within_20_km', 'LOW', 5000, 10000,
       '{"enabled":true}'::jsonb, '{"simulation":true}'::jsonb,
       1500, false, false
     )`,
    [draftId, version.rows[0].id, '4'.repeat(64)],
  );
  await pool.query(
    `INSERT INTO stripe_connect_accounts (
       user_id, provider_account_id, account_api_version, dashboard_type,
       fees_collector, losses_collector, recipient_transfers_status,
       requirements, future_requirements, livemode
     ) VALUES (
       'r9-user-001', 'acct_r9_synthetic_v2', 'v2', 'express',
       'application', 'application', 'active',
       '{"synthetic":true}'::jsonb, '{"synthetic":true}'::jsonb, false
     )`,
  );
  return datasetCounts(pool);
}

async function datasetCounts(pool) {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE id LIKE 'r9-user-%') AS accounts,
       (SELECT count(*)::int FROM listings WHERE id LIKE 'r9-listing-%') AS listings,
       (SELECT count(*)::int FROM support_policy_snapshots
         WHERE policy_type = 'r9_recovery_fixture') AS support_policies,
       (SELECT count(*)::int FROM listing_ai_drafts
         WHERE id = 'listing_ai_draft_90000000-0000-4000-8000-000000000001') AS drafts,
       (SELECT count(*)::int FROM regional_price_engine_snapshots
         WHERE engine_version = 'R6-2026-08-24.1'
           AND snapshot_payload->>'synthetic' = 'true') AS price_snapshots`,
  );
  return result.rows[0];
}

async function dataDigest(pool) {
  const [users, listings, policies, drafts, versions, snapshots, migrations] =
    await Promise.all([
      pool.query(
        `SELECT id, email, profile, role, account_status, created_at::text
           FROM users WHERE id LIKE 'r9-user-%' ORDER BY id`,
      ),
      pool.query(
        `SELECT id, owner_id, payload, is_active, status, catalog_revision,
                created_at::text, updated_at::text
           FROM listings WHERE id LIKE 'r9-listing-%' ORDER BY id`,
      ),
      pool.query(
        `SELECT id::text, policy_type, version, effective_from::text,
                rule_values, content_sha256, created_at::text
           FROM support_policy_snapshots
          WHERE policy_type = 'r9_recovery_fixture' ORDER BY id`,
      ),
      pool.query(
        `SELECT id, owner_id, status, current_revision, created_at::text,
                updated_at::text
           FROM listing_ai_drafts
          WHERE id = 'listing_ai_draft_90000000-0000-4000-8000-000000000001'
          ORDER BY id`,
      ),
      pool.query(
        `SELECT id::text, draft_id, revision, generation_key,
                payload_sha256, created_at::text
           FROM listing_ai_draft_versions
          WHERE draft_id = 'listing_ai_draft_90000000-0000-4000-8000-000000000001'
          ORDER BY revision`,
      ),
      pool.query(
        `SELECT id::text, draft_id, draft_version_id::text, engine_version,
                input_sha256, recommended_daily_minor::text, snapshot_payload,
                created_at::text
           FROM regional_price_engine_snapshots
          WHERE draft_id = 'listing_ai_draft_90000000-0000-4000-8000-000000000001'
          ORDER BY id`,
      ),
      pool.query(
        `SELECT name, checksum, applied_at::text
           FROM schema_migrations ORDER BY name`,
      ),
    ]);
  return sha256(JSON.stringify({
    users: users.rows,
    listings: listings.rows,
    policies: policies.rows,
    drafts: drafts.rows,
    versions: versions.rows,
    snapshots: snapshots.rows,
    migrations: migrations.rows,
  }));
}

async function integrityReport(pool, plan) {
  const [invalid, listingOrphans, draftOrphans, snapshotOrphans, rows] =
    await Promise.all([
      pool.query(
        `SELECT count(*)::int AS count FROM pg_constraint AS con
          JOIN pg_namespace AS n ON n.oid = con.connamespace
         WHERE n.nspname = 'public' AND NOT con.convalidated`,
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM listings AS listing
          LEFT JOIN users AS owner ON owner.id = listing.owner_id
         WHERE listing.id LIKE 'r9-listing-%' AND owner.id IS NULL`,
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM listing_ai_drafts AS draft
          LEFT JOIN users AS owner ON owner.id = draft.owner_id
         WHERE draft.id LIKE 'listing_ai_draft_90000000-%' AND owner.id IS NULL`,
      ),
      pool.query(
        `SELECT count(*)::int AS count
           FROM regional_price_engine_snapshots AS snapshot
           LEFT JOIN listing_ai_drafts AS draft ON draft.id = snapshot.draft_id
           LEFT JOIN listing_ai_draft_versions AS version
             ON version.id = snapshot.draft_version_id
            AND version.draft_id = snapshot.draft_id
          WHERE snapshot.draft_id LIKE 'listing_ai_draft_90000000-%'
            AND (draft.id IS NULL OR version.id IS NULL)`,
      ),
      migrationRows(pool),
    ]);
  const actual = new Map(rows.map((row) => [row.name, row.checksum]));
  const missingMigrationRows = plan.filter(({ filename }) => !actual.has(filename)).length;
  const checksumMismatches = plan.filter(
    ({ filename, checksum }) => actual.get(filename) !== checksum,
  ).length;
  return Object.freeze({
    invalidConstraints: invalid.rows[0].count,
    missingMigrationRows,
    checksumMismatches,
    orphanedListings: listingOrphans.rows[0].count,
    orphanedListingAiDrafts: draftOrphans.rows[0].count,
    orphanedPriceSnapshots: snapshotOrphans.rows[0].count,
  });
}

async function insertLegacyDataset(pool) {
  for (let index = 1; index <= 4; index += 1) {
    const suffix = String(index).padStart(3, '0');
    await pool.query(
      `INSERT INTO users (id, email, profile)
       VALUES ($1, $2, '{"fixture":"r9_legacy","synthetic":true}'::jsonb)`,
      [`r9-legacy-user-${suffix}`, `r9-legacy-user-${suffix}@example.invalid`],
    );
  }
  for (let index = 1; index <= 2; index += 1) {
    const suffix = String(index).padStart(3, '0');
    await pool.query(
      `INSERT INTO listings (id, owner_id, payload, is_active)
       VALUES ($1, $2, $3::jsonb, false)`,
      [
        `r9-legacy-listing-${suffix}`,
        `r9-legacy-user-${suffix}`,
        JSON.stringify({ fixture: 'r9_legacy', synthetic: true, sequence: index }),
      ],
    );
  }
  const cart = await pool.query(
    `INSERT INTO rental_carts (user_id)
     VALUES ('r9-legacy-user-004') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO rental_cart_items (
       cart_id, client_item_id, listing_id, rental_start_date,
       rental_end_date, quote_status
     ) VALUES ($1, 'r9.legacy.item.0001', 'r9-legacy-listing-001',
               '2026-09-01', '2026-09-03', 'needs_recheck')`,
    [cart.rows[0].id],
  );
}

async function legacyCounts(pool) {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE id LIKE 'r9-legacy-user-%') AS users,
       (SELECT count(*)::int FROM listings
         WHERE id LIKE 'r9-legacy-listing-%') AS listings,
       (SELECT count(*)::int FROM rental_cart_items AS item
         JOIN rental_carts AS cart ON cart.id = item.cart_id
         WHERE cart.user_id = 'r9-legacy-user-004') AS cart_items`,
  );
  return result.rows[0];
}

async function assertRollbackGuardRefusals(pool, root) {
  const refused = [];
  for (const guard of rollbackGuardExpectations) {
    const sql = await readFile(
      path.join(root, 'backend/sql/migrations', guard.filename),
      'utf8',
    );
    const client = await pool.connect();
    let caught = null;
    try {
      await client.query('BEGIN');
      try {
        await client.query(sql);
      } catch (error) {
        caught = error;
      }
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    if (caught === null || caught.message !== guard.message) {
      fail(`r9_rollback_guard_not_refused:${guard.filename}`);
    }
    refused.push(`${guard.filename}:${guard.message}`);
  }
  return Object.freeze(refused);
}

async function assertEmptyR6RollbackAccepted(pool, root) {
  const sql = await readFile(path.join(
    root,
    'backend/sql/migrations/069_regional_price_engine_r6_hardening.down.sql',
  ), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve primary error */ }
    throw error;
  } finally {
    client.release();
  }
  return true;
}

function databaseUrl(port, database) {
  return `postgresql://${databaseUser}@127.0.0.1:${port}/${database}`;
}

export function attachR9PoolErrorBoundary(pool, cleanupState) {
  if (!pool || typeof pool.on !== 'function'
      || cleanupState?.serverStopping !== false
      || !Array.isArray(cleanupState.unexpectedPoolErrors)) {
    fail('r9_pool_error_boundary_invalid');
  }
  pool.on('error', (error) => {
    const expectedAdministrativeShutdown = cleanupState.serverStopping === true
      && error?.code === '57P01';
    if (!expectedAdministrativeShutdown) {
      cleanupState.unexpectedPoolErrors.push(error);
    }
  });
  return pool;
}

function createPool(PoolClass, port, database, cleanupState) {
  return attachR9PoolErrorBoundary(
    new PoolClass({ connectionString: databaseUrl(port, database), max: 4 }),
    cleanupState,
  );
}

async function closePools(pools) {
  const results = await Promise.allSettled(pools.map((pool) => pool.end()));
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected) throw rejected.reason;
}

export function validateR9Observation(value, {
  requiredMigrationCount = r9RequiredMigrationCount,
  requiredLastMigration = '074_listing_ai_on_device_disclosure.up.sql',
  requiredRollbackGuards = rollbackGuardExpectations,
} = {}) {
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-r9-database-recovery-observation'
      || value.status !== 'passed-and-cleaned'
      || value.resultClassification !== r9ResultClassification
      || value.postgresMajor !== requiredPostgresMajor) {
    fail('R9 observation identity is invalid.');
  }
  const migration = value.migration ?? {};
  if (migration.emptyDatabaseTablesBeforeBootstrap !== 0
      || migration.totalMigrations !== requiredMigrationCount
      || migration.firstMigration !== '001_b3_foundation.up.sql'
      || migration.lastMigration !== requiredLastMigration
      || migration.secondRunAppliedMigrations !== 0
      || migration.checksumMismatches !== 0
      || !/^[0-9a-f]{64}$/u.test(migration.schemaFingerprintSha256 ?? '')
      || !Number.isSafeInteger(migration.tableCount) || migration.tableCount < 1
      || !Number.isSafeInteger(migration.columnCount) || migration.columnCount < 1
      || !Number.isSafeInteger(migration.constraintCount) || migration.constraintCount < 1
      || !Number.isSafeInteger(migration.indexCount) || migration.indexCount < 1
      || !Number.isSafeInteger(migration.functionCount) || migration.functionCount < 1
      || !Number.isSafeInteger(migration.triggerCount) || migration.triggerCount < 1) {
    fail('R9 migration proof is invalid.');
  }
  if (!exact(value.syntheticDataset, {
    accountCount: r9SyntheticAccountCount,
    listingCount: r9SyntheticListingCount,
    supportPolicySnapshotCount: 1,
    listingAiDraftCount: 1,
    hardenedPriceSnapshotCount: 1,
    realUserRows: 0,
    realMoneyRows: 0,
    syntheticCredentialsRetained: false,
  })) fail('R9 synthetic dataset is invalid.');
  if (!exact(value.backupRestore, {
    format: 'postgres-custom',
    archiveReadable: true,
    archiveSha256: value.backupRestore?.archiveSha256,
    restoredIntoFreshDatabase: true,
    schemaFingerprintMatch: true,
    dataDigestMatch: true,
    migrationInventoryMatch: true,
  }) || !/^[0-9a-f]{64}$/u.test(value.backupRestore?.archiveSha256 ?? '')) {
    fail('R9 backup and restore proof is invalid.');
  }
  if (!exact(value.integrity, {
    invalidConstraints: 0,
    missingMigrationRows: 0,
    checksumMismatches: 0,
    orphanedListings: 0,
    orphanedListingAiDrafts: 0,
    orphanedPriceSnapshots: 0,
  })) fail('R9 integrity proof is invalid.');
  if (!exact(value.olderUpgrade, {
    startingMigration: '027_g2_persistent_rental_cart.up.sql',
    startingMigrationCount: 27,
    finalMigrationCount: requiredMigrationCount,
    secondRunAppliedMigrations: 0,
    legacyUsersPreserved: 4,
    legacyListingsPreserved: 2,
    legacyCartItemsPreserved: 1,
    schemaFingerprintMatch: true,
  })) fail('R9 older-schema upgrade proof is invalid.');
  if (!exact(value.rollback, {
    emptyR6RollbackAcceptedInsideRolledBackTransaction: true,
    refusedGuards: requiredRollbackGuards.map(
      ({ filename, message }) => `${filename}:${message}`,
    ),
    allDestructiveRollbacksRefused: true,
    restoredDataDigestUnchanged: true,
  })) fail('R9 rollback proof is invalid.');
  if (!exact(value.networkBoundary, {
    postgresHost: '127.0.0.1',
    externalNetworkCalls: 0,
  })) fail('R9 network boundary is invalid.');
  if (!exact(value.cleanup, {
    postgresStopped: true,
    temporaryClusterRemoved: true,
    backupArchiveRemoved: true,
    syntheticCredentialsRetained: false,
    persistentTestPrerequisiteCreated: false,
  })) fail('R9 cleanup proof is invalid.');
  if (Object.values(value.boundaries ?? {}).some((entry) => entry !== false)
      || !exact(Object.keys(value.boundaries ?? {}), [
        'productionChanged',
        'vpsChanged',
        'cloudChanged',
        'paymentChanged',
        'realUserDataUsed',
        'realMoneyUsed',
        'credentialsExtracted',
      ])) {
    fail('R9 live or credential boundary is invalid.');
  }
  return value;
}

export async function executeR9DatabaseRecovery({
  root = repositoryRoot,
  postgresBinDir,
  environment = process.env,
  temporaryBase = os.tmpdir(),
} = {}) {
  const plan = await readMigrationPlan(root);
  const { Pool: PoolClass } = requireFromBackend('pg');
  const resolvedBinDir = await resolvePostgresBinDir({
    environment,
    explicitBinDir: postgresBinDir,
  });
  for (const program of ['pg_dump', 'pg_restore']) {
    if (!await executable(path.join(resolvedBinDir, program))) {
      fail(`postgresql_16_${program}_not_found`);
    }
  }
  const commandEnvironment = { ...environment };
  for (const name of [
    'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE',
  ]) delete commandEnvironment[name];
  const postgres = (name) => path.join(resolvedBinDir, name);
  const version = await runCommand(postgres('postgres'), ['--version'], {
    cwd: root,
    env: commandEnvironment,
  });
  const postgresMajor = parsePostgresMajor(version.stdout);
  if (postgresMajor !== requiredPostgresMajor) {
    fail(`postgres_major_mismatch: required 16, found ${postgresMajor}`);
  }

  const resolvedTemporaryBase = path.resolve(temporaryBase);
  const runRoot = assertSafeR9TempRoot(
    await mkdtemp(path.join(resolvedTemporaryBase, tempPrefix)),
    resolvedTemporaryBase,
  );
  const dataDirectory = path.join(runRoot, 'data');
  const serverLog = path.join(runRoot, 'postgres.log');
  const backupArchive = path.join(runRoot, 'r9-source.dump');
  let serverStarted = false;
  let primaryError = null;
  let result = null;
  let port = null;
  const pools = [];
  const poolCleanupState = {
    serverStopping: false,
    unexpectedPoolErrors: [],
  };
  let reportedPoolErrorCount = 0;
  const foldUnexpectedPoolErrors = () => {
    const unreported = poolCleanupState.unexpectedPoolErrors.slice(
      reportedPoolErrorCount,
    );
    reportedPoolErrorCount = poolCleanupState.unexpectedPoolErrors.length;
    if (unreported.length > 0) {
      primaryError = new AggregateError(
        [primaryError, ...unreported].filter(Boolean),
        'r9_unexpected_pool_error',
      );
    }
  };

  try {
    await runCommand(postgres('initdb'), [
      '-D', dataDirectory,
      '--no-locale',
      '--encoding=UTF8',
      '--username', databaseUser,
      '--auth-local=reject',
      '--auth-host=trust',
    ], { cwd: root, env: commandEnvironment });
    port = await findAvailableLoopbackPort();
    await runCommand(postgres('pg_ctl'), [
      '-D', dataDirectory,
      '-l', serverLog,
      '-w',
      '-t', '15',
      '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,
      'start',
    ], { cwd: root, env: commandEnvironment });
    serverStarted = true;
    await runCommand(postgres('pg_isready'), [
      '-h', '127.0.0.1', '-p', String(port), '-U', databaseUser,
      '-d', 'postgres', '-t', '2',
    ], { cwd: root, env: commandEnvironment });
    for (const database of Object.values(databaseNames)) {
      await runCommand(postgres('createdb'), [
        '-h', '127.0.0.1', '-p', String(port), '-U', databaseUser, database,
      ], { cwd: root, env: commandEnvironment });
    }

    const sourcePool = createPool(
      PoolClass, port, databaseNames.source, poolCleanupState,
    );
    const restoredPool = createPool(
      PoolClass, port, databaseNames.restored, poolCleanupState,
    );
    const legacyPool = createPool(
      PoolClass, port, databaseNames.legacy, poolCleanupState,
    );
    const rollbackControlPool = createPool(
      PoolClass,
      port,
      databaseNames.rollbackControl,
      poolCleanupState,
    );
    pools.push(sourcePool, restoredPool, legacyPool, rollbackControlPool);

    const emptyTables = await tableCount(sourcePool);
    if (emptyTables !== 0) fail('r9_source_database_not_empty');
    await applyCurrentSchema(sourcePool, root);
    const secondRunAppliedMigrations = await verifySecondMigrationRun(sourcePool, plan);
    const sourceSchema = await schemaFingerprint(sourcePool);
    const sourceDataset = await insertSyntheticDataset(sourcePool);
    if (!exact(sourceDataset, {
      accounts: r9SyntheticAccountCount,
      listings: r9SyntheticListingCount,
      support_policies: 1,
      drafts: 1,
      price_snapshots: 1,
    })) fail('r9_source_dataset_count_mismatch');
    const sourceDigest = await dataDigest(sourcePool);

    await runCommand(postgres('pg_dump'), [
      '-h', '127.0.0.1', '-p', String(port), '-U', databaseUser,
      '-d', databaseNames.source, '--format=custom', '--no-owner', '--no-acl',
      '--file', backupArchive,
    ], { cwd: root, env: commandEnvironment });
    const archiveBytes = await readFile(backupArchive);
    if ((await stat(backupArchive)).size < 1) fail('r9_backup_archive_empty');
    const archiveList = await runCommand(postgres('pg_restore'), [
      '--list', backupArchive,
    ], { cwd: root, env: commandEnvironment });
    if (!archiveList.stdout.includes('TABLE DATA')) fail('r9_backup_archive_unreadable');
    await runCommand(postgres('pg_restore'), [
      '-h', '127.0.0.1', '-p', String(port), '-U', databaseUser,
      '-d', databaseNames.restored, '--no-owner', '--no-acl', '--exit-on-error',
      backupArchive,
    ], { cwd: root, env: commandEnvironment });
    const restoredSchema = await schemaFingerprint(restoredPool);
    const restoredDigest = await dataDigest(restoredPool);
    const restoredRows = await migrationRows(restoredPool);
    verifyMigrationRows(restoredRows, plan);
    const integrity = await integrityReport(restoredPool, plan);
    if (Object.values(integrity).some((entry) => entry !== 0)) {
      fail('r9_restored_integrity_invalid');
    }

    const schema = await readFile(path.join(root, 'backend/sql/schema.sql'), 'utf8');
    await legacyPool.query(schema);
    await applyMigrationPrefix(legacyPool, plan, 27);
    await insertLegacyDataset(legacyPool);
    const beforeLegacy = await legacyCounts(legacyPool);
    await runMigrations(legacyPool);
    const legacySecondRun = await verifySecondMigrationRun(legacyPool, plan);
    const afterLegacy = await legacyCounts(legacyPool);
    if (!exact(beforeLegacy, afterLegacy)
        || !exact(afterLegacy, { users: 4, listings: 2, cart_items: 1 })) {
      fail('r9_legacy_data_not_preserved');
    }
    const legacySchema = await schemaFingerprint(legacyPool);

    await applyCurrentSchema(rollbackControlPool, root);
    const emptyR6RollbackAccepted = await assertEmptyR6RollbackAccepted(
      rollbackControlPool,
      root,
    );
    const refusedGuards = await assertRollbackGuardRefusals(restoredPool, root);
    const restoredDigestAfterRollback = await dataDigest(restoredPool);

    const schemaMatches = exact(restoredSchema, sourceSchema);
    const legacySchemaMatches = exact(legacySchema, sourceSchema);
    const dataMatches = restoredDigest === sourceDigest;
    if (!schemaMatches || !legacySchemaMatches || !dataMatches
        || restoredDigestAfterRollback !== restoredDigest) {
      fail('r9_schema_or_data_roundtrip_mismatch');
    }

    result = {
      schemaVersion: 1,
      kind: 'sit-r9-database-recovery-observation',
      status: 'passed-and-cleaned',
      resultClassification: r9ResultClassification,
      postgresMajor,
      migration: {
        emptyDatabaseTablesBeforeBootstrap: emptyTables,
        totalMigrations: plan.length,
        firstMigration: plan[0].filename,
        lastMigration: plan.at(-1).filename,
        secondRunAppliedMigrations,
        checksumMismatches: 0,
        schemaFingerprintSha256: sourceSchema.sha256,
        tableCount: sourceSchema.tableCount,
        columnCount: sourceSchema.columnCount,
        constraintCount: sourceSchema.constraintCount,
        indexCount: sourceSchema.indexCount,
        functionCount: sourceSchema.functionCount,
        triggerCount: sourceSchema.triggerCount,
      },
      syntheticDataset: {
        accountCount: r9SyntheticAccountCount,
        listingCount: r9SyntheticListingCount,
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
        archiveSha256: sha256(archiveBytes),
        restoredIntoFreshDatabase: true,
        schemaFingerprintMatch: schemaMatches,
        dataDigestMatch: dataMatches,
        migrationInventoryMatch: restoredRows.length === plan.length,
      },
      integrity,
      olderUpgrade: {
        startingMigration: plan[26].filename,
        startingMigrationCount: 27,
        finalMigrationCount: (await migrationRows(legacyPool)).length,
        secondRunAppliedMigrations: legacySecondRun,
        legacyUsersPreserved: afterLegacy.users,
        legacyListingsPreserved: afterLegacy.listings,
        legacyCartItemsPreserved: afterLegacy.cart_items,
        schemaFingerprintMatch: legacySchemaMatches,
      },
      rollback: {
        emptyR6RollbackAcceptedInsideRolledBackTransaction:
          emptyR6RollbackAccepted,
        refusedGuards,
        allDestructiveRollbacksRefused:
          refusedGuards.length === rollbackGuardExpectations.length,
        restoredDataDigestUnchanged: restoredDigestAfterRollback === restoredDigest,
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
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await closePools(pools);
    } catch (error) {
      primaryError ??= error;
    }
    await new Promise((resolve) => setImmediate(resolve));
    foldUnexpectedPoolErrors();
    poolCleanupState.serverStopping = true;
    if (serverStarted) {
      try {
        await runCommand(postgres('pg_ctl'), [
          '-D', dataDirectory, '-w', '-t', '15', '-m', 'fast', 'stop',
        ], { cwd: root, env: commandEnvironment });
      } catch (fastStopError) {
        try {
          await runCommand(postgres('pg_ctl'), [
            '-D', dataDirectory, '-w', '-t', '15', '-m', 'immediate', 'stop',
          ], { cwd: root, env: commandEnvironment });
        } catch (immediateStopError) {
          primaryError = new AggregateError(
            [primaryError, fastStopError, immediateStopError].filter(Boolean),
            'r9_postgres_stop_failed_temp_root_retained',
          );
        }
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
    foldUnexpectedPoolErrors();
    if (!(primaryError instanceof AggregateError
        && primaryError.message === 'r9_postgres_stop_failed_temp_root_retained')) {
      try {
        await rm(assertSafeR9TempRoot(runRoot, resolvedTemporaryBase), {
          recursive: true,
          force: true,
          maxRetries: 2,
        });
      } catch (error) {
        primaryError ??= error;
      }
    }
  }
  if (primaryError !== null) throw primaryError;
  return result;
}

export async function runR9DatabaseRecovery({
  executeRecovery = executeR9DatabaseRecovery,
} = {}) {
  if (typeof executeRecovery !== 'function') fail('R9 recovery dependency is invalid.');
  return validateR9Observation(await executeRecovery());
}

async function main() {
  if (process.argv.length !== 2) fail(`Unknown argument: ${process.argv[2]}`);
  const result = await runR9DatabaseRecovery();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    if (error instanceof AggregateError) {
      for (const nested of error.errors) {
        process.stderr.write(`ERROR: ${nested?.message ?? 'unknown R9 failure'}\n`);
      }
    } else {
      process.stderr.write(`ERROR: ${error?.message ?? 'R9 recovery failed.'}\n`);
    }
    process.exitCode = 1;
  }
}
