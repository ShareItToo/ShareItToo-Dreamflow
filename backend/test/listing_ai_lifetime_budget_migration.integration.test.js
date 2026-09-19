import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';

const { Client } = pg;

test('WP260-C migration preserves opening costs and rolls back without resetting lifetime state', {
  skip: !process.env.TEST_DATABASE_URL?.trim(),
}, async () => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TEMP TABLE listing_ai_budget_aggregates (
        period_key TEXT NOT NULL
          CONSTRAINT listing_ai_budget_aggregates_period_key_check
          CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
        provider TEXT NOT NULL,
        budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
        spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
        reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
        call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (period_key, provider),
        CHECK (spent_cents + reserved_cents <= budget_cents)
      )
    `);
    await client.query(`
      CREATE TEMP TABLE listing_ai_cost_ledger (
        provider TEXT NOT NULL,
        billed_cost_cents INTEGER NOT NULL DEFAULT 0
      )
    `);
    const migrationRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../sql/migrations',
    );
    const up = await readFile(
      path.join(migrationRoot, '088_listing_ai_lifetime_budget.up.sql'),
      'utf8',
    );
    const down = await readFile(
      path.join(migrationRoot, '088_listing_ai_lifetime_budget.down.sql'),
      'utf8',
    );

    await client.query(`
      INSERT INTO listing_ai_budget_aggregates
        (period_key, provider, budget_cents, spent_cents, reserved_cents, call_count)
      VALUES
        ('2026-08', 'openai', 10000, 2500, 300, 2),
        ('2026-09', 'openai', 10000, 1500, 200, 1),
        ('2026-09', 'mock', 0, 0, 0, 2)
    `);
    await client.query(`
      INSERT INTO listing_ai_cost_ledger (provider, billed_cost_cents)
      VALUES ('openai', 3500), ('openai', 100)
    `);

    await client.query('BEGIN');
    await client.query(up);
    const lifetime = await client.query(
      `SELECT provider, budget_cents, spent_cents, reserved_cents,
              call_count, reserved_calls
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime'
        ORDER BY provider`,
    );
    assert.deepEqual(lifetime.rows, [
      {
        provider: 'mock',
        budget_cents: 0,
        spent_cents: 0,
        reserved_cents: 0,
        call_count: 2,
        reserved_calls: 0,
      },
      {
        provider: 'openai',
        budget_cents: 10000,
        spent_cents: 4000,
        reserved_cents: 500,
        call_count: 3,
        reserved_calls: 0,
      },
    ]);
    await client.query(down);
    const retained = await client.query(
      `SELECT count(*)::int AS count
         FROM listing_ai_budget_aggregates
        WHERE period_key = 'lifetime'`,
    );
    assert.equal(retained.rows[0].count, 2);
    await client.query('ROLLBACK');

    await client.query('TRUNCATE listing_ai_budget_aggregates, listing_ai_cost_ledger');
    await client.query(`
      INSERT INTO listing_ai_budget_aggregates
        (period_key, provider, budget_cents, spent_cents, reserved_cents, call_count)
      VALUES ('2026-09', 'openai', 10000, 9999, 1, 1)
    `);
    await client.query(
      `INSERT INTO listing_ai_cost_ledger (provider, billed_cost_cents)
       VALUES ('openai', 10000)`,
    );
    await client.query('BEGIN');
    await assert.rejects(
      client.query(up),
      (error) => error.code === 'P0001'
        && error.message === 'listing_ai_lifetime_budget_rollover_exceeds_hardcap',
    );
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
});
