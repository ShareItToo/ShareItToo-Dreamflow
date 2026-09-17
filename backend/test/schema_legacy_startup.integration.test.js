import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

if (!databaseUrl) {
  test.skip('Legacy-schema startup integration requires TEST_DATABASE_URL');
} else {
  test('current schema bootstrap is safe on a legacy 001-074 database', async () => {
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const schemaName = `wp244_legacy_${crypto.randomBytes(8).toString('hex')}`;
    const quotedSchema = quoteIdentifier(schemaName);
    let scopedPool;
    try {
      await adminPool.query(`CREATE SCHEMA ${quotedSchema}`);
      const separator = databaseUrl.includes('?') ? '&' : '?';
      const scopedUrl = `${databaseUrl}${separator}options=${encodeURIComponent(
        `-c search_path=${quotedSchema},public`,
      )}`;
      scopedPool = new pg.Pool({ connectionString: scopedUrl, max: 1 });
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const schemaSql = await fs.readFile(path.resolve(currentDir, '../sql/schema.sql'), 'utf8');
      const { runMigrations } = await import('../src/migrations.js');

      // Start from the normal foundation, apply the first 74 migrations, then
      // remove the four columns introduced by 078 to model the protected
      // Staging backup shape.  This keeps the fixture real-PostgreSQL while
      // avoiding any copied production data.
      await scopedPool.query(schemaSql);
      await runMigrations(scopedPool, { through: 74 });
      await scopedPool.query('DROP INDEX IF EXISTS account_legal_holds_one_active_per_record_idx');
      await scopedPool.query(
        `ALTER TABLE account_legal_holds
           DROP COLUMN IF EXISTS dataset_key CASCADE,
           DROP COLUMN IF EXISTS record_key CASCADE,
           DROP COLUMN IF EXISTS review_due_at CASCADE,
           DROP COLUMN IF EXISTS hold_ends_at CASCADE`,
      );
      assert.equal(
        (await scopedPool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,
        74,
      );

      // This is the exact WP243 failure point that occurred before the fix.
      await assert.rejects(
        scopedPool.query(
          `CREATE UNIQUE INDEX account_legal_holds_one_active_per_record_idx
             ON account_legal_holds(user_id, dataset_key, record_key)
             WHERE released_at IS NULL`,
        ),
        (error) => error?.code === '42703',
      );

      // The fixed bootstrap adds the nullable columns before planning the
      // index; migration 078 then validates and tightens them.
      await scopedPool.query(schemaSql);
      await runMigrations(scopedPool);
      assert.equal(
        (await scopedPool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,
        87,
      );
      const columns = await scopedPool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'account_legal_holds'
           AND column_name = ANY($1::text[])
         ORDER BY column_name`,
        [['dataset_key', 'record_key', 'review_due_at', 'hold_ends_at']],
      );
      assert.deepEqual(columns.rows.map((row) => row.column_name), [
        'dataset_key', 'hold_ends_at', 'record_key', 'review_due_at',
      ]);
    } finally {
      await scopedPool?.end();
      await adminPool.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
      await adminPool.end();
    }
  });
}
