import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const integritySql = await fs.readFile(path.resolve(
  currentDir,
  '../ops/check_foreign_key_integrity.sql',
), 'utf8');

if (!databaseUrl) {
  test.skip('foreign-key integrity integration requires TEST_DATABASE_URL');
} else {
  test('foreign-key integrity gate finds simple and MATCH FULL orphans without leaking values', async () => {
    const schemaName = `sit_fk_integrity_${process.pid}`;
    const secretValue = `must-not-leak-${process.pid}`;
    const client = new pg.Client({ connectionString: databaseUrl });
    const notices = [];
    client.on('notice', (notice) => notices.push(notice.message));
    await client.connect();

    try {
      await client.query(`CREATE SCHEMA ${schemaName}`);
      await client.query(`
        CREATE TABLE ${schemaName}.simple_parent (
          id text PRIMARY KEY
        );
        CREATE TABLE ${schemaName}.simple_child (
          id text PRIMARY KEY,
          parent_id text CONSTRAINT simple_parent_fk
            REFERENCES ${schemaName}.simple_parent(id)
        );
        CREATE TABLE ${schemaName}.full_parent (
          left_id text NOT NULL,
          right_id text NOT NULL,
          PRIMARY KEY (left_id, right_id)
        );
        CREATE TABLE ${schemaName}.full_child (
          id text PRIMARY KEY,
          left_id text,
          right_id text,
          CONSTRAINT full_parent_fk FOREIGN KEY (left_id, right_id)
            REFERENCES ${schemaName}.full_parent(left_id, right_id) MATCH FULL
        );
      `);

      await client.query(integritySql);
      assert.ok(notices.some((message) => message.startsWith(
        'SIT_FK_INTEGRITY_OK constraints=',
      )));
      notices.length = 0;

      await client.query('SET session_replication_role = replica');
      await client.query(
        `INSERT INTO ${schemaName}.simple_child (id, parent_id) VALUES ($1, $2)`,
        ['simple-child', secretValue],
      );
      await client.query(
        `INSERT INTO ${schemaName}.full_child (id, left_id, right_id)
         VALUES ($1, $2, NULL)`,
        ['full-child', secretValue],
      );
      await client.query('SET session_replication_role = origin');

      await assert.rejects(
        client.query(integritySql),
        (error) => {
          assert.match(error.message, /SIT_FK_INTEGRITY_FAILED constraints=2 orphan_rows=2/);
          assert.doesNotMatch(error.message, new RegExp(secretValue));
          return true;
        },
      );
      await client.query('ROLLBACK');

      const violationNotices = notices.filter((message) =>
        message.startsWith('SIT_FK_INTEGRITY_VIOLATION'));
      assert.equal(violationNotices.length, 2);
      assert.ok(violationNotices.some((message) =>
        message.includes('constraint=simple_parent_fk orphan_rows=1')));
      assert.ok(violationNotices.some((message) =>
        message.includes('constraint=full_parent_fk orphan_rows=1')));
      assert.doesNotMatch(violationNotices.join('\n'), new RegExp(secretValue));
    } finally {
      await client.query('SET session_replication_role = origin').catch(() => {});
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`).catch(() => {});
      await client.end();
    }
  });
}
