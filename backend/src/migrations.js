import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationLockName = 'shareittoo-schema-migrations';

function checksum(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

export async function runMigrations(databasePool) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(currentDir, '../sql/migrations');
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.up.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const client = await databasePool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [migrationLockName]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    for (const filename of filenames) {
      const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
      const expectedChecksum = checksum(sql);
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [filename],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== expectedChecksum) {
          throw new Error(`Applied migration checksum changed: ${filename}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [filename, expectedChecksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [migrationLockName]);
    } finally {
      client.release();
    }
  }
}
