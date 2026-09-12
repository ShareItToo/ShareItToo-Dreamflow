import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { config } from './config.js';
import { runMigrations } from './migrations.js';
import { safeOperationalErrorCode } from './observability.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  console.error('[database] idle client error', safeOperationalErrorCode(error, 'database_idle_client_error'));
});

export async function initializeDatabase() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(currentDir, '../sql/schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await pool.query(schema);
  await runMigrations(pool);
}

export async function inTransaction(fn, { deadlockRetries = 0 } = {}) {
  let attempt = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error?.code === '40P01' && attempt < deadlockRetries) {
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
