import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (relativePath) => readFile(new URL(
  `../${relativePath}`,
  import.meta.url,
), 'utf8');

const [sql, wrapper, deploy] = await Promise.all([
  read('ops/check_foreign_key_integrity.sql'),
  read('ops/check_foreign_key_integrity.sh'),
  read('ops/deploy_release.sh'),
]);

test('foreign-key integrity guard is generic, aggregate-only and read-only', () => {
  assert.match(sql, /ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(sql, /FROM pg_constraint/);
  assert.match(sql, /constraint_row\.contype = 'f'/);
  assert.match(sql, /constraint_row\.conkey/);
  assert.match(sql, /constraint_row\.confkey/);
  assert.match(sql, /match_type = 'f'/);
  assert.match(sql, /count\(\*\)::bigint/);
  assert.match(sql, /SIT_FK_INTEGRITY_FAILED constraints=% orphan_rows=%/);
  assert.doesNotMatch(sql, /SELECT\s+child_row\.\*/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM|UPDATE\s+|INSERT\s+INTO/i);
});

test('production and staging deploy both fail closed through the shared guard', () => {
  assert.match(wrapper, /psql -X --set ON_ERROR_STOP=1/);
  assert.match(wrapper, /check_foreign_key_integrity\.sql/);
  assert.match(deploy, /task_database_container=shareittoo-postgres/);
  assert.match(deploy, /task_database_container=shareittoo-staging-postgres/);
  assert.match(
    deploy,
    /DATABASE_CONTAINER="\$task_database_container"[\s\S]*check_foreign_key_integrity\.sh/,
  );
});
