import fs from 'node:fs';
import path from 'node:path';
import { assert, assertLedger, equal, migrationInventory, newTableNames, objectDigest, repositoryRoot } from './green_staging_98_106_contract.mjs';
import { buildReadinessFindingSql, normalizeReadinessFindings } from './staging_forward_migration_rehearsal.mjs';

export const foreignWritersSql = "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()";
export const ledgerRowsSql = 'SELECT coalesce(json_agg(row_to_json(m) ORDER BY name),\'[]\'::json) FROM schema_migrations m';
export const tableNamesSql = "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public'";
export function psqlArgs(database, sql) {
  assert(/^[a-f0-9]{64}$/u.test(database.id) && /^[a-z][a-z0-9_]+$/u.test(database.user)
    && /^[a-z][a-z0-9_]+$/u.test(database.name), 'green_98_106_psql_identity');
  return ['exec', '-i', database.id, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', database.user, '-d', database.name, '-At', '-c', sql];
}
export async function readDatabase(command, database, phase, sql) {
  return String(await command({ phase, args: psqlArgs(database, sql) })).trim();
}
export async function assertNoWriters(command, database) {
  assert(await readDatabase(command, database, 'foreign_writers', foreignWritersSql) === '0', 'green_98_106_foreign_writer');
}
export async function readSnapshot(command, database, schema, oldNames) {
  const tables = JSON.parse(await readDatabase(command, database, 'table_names', tableNamesSql));
  assert(Array.isArray(tables) && tables.length > 0 && new Set(tables).size === tables.length
    && tables.every(n => /^[a-z][a-z0-9_]+$/u.test(n)), 'green_98_106_table_inventory');
  const fresh = newTableNames();
  const businessNames = oldNames ?? tables.filter(name => name !== 'schema_migrations');
  assert(!businessNames.some(name => fresh.includes(name)), 'green_98_106_old_namespace_overlap');
  assert(equal([...tables].sort(), [...businessNames, 'schema_migrations', ...(schema === 106 ? fresh : [])].sort()),
    'green_98_106_table_inventory_drift');
  const rows = JSON.parse(await readDatabase(command, database, 'ledger_rows', ledgerRowsSql));
  const ledger = assertLedger(rows.map(({ name, checksum }) => ({ name, checksum })), schema);
  assert(rows.every(row => typeof row.applied_at === 'string' && Number.isFinite(Date.parse(row.applied_at))), 'green_98_106_ledger_timestamps');
  // json_build_object has a 100-argument limit: each table emits one row.
  const businessSql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT json_object_agg(name,state) FROM (${businessNames.map((name, index) => `SELECT '${name}' AS name, (SELECT json_build_object('count',count(*),'sha256',encode(digest(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),''),'sha256'),'hex')) FROM "${name}" t) AS state`).join(' UNION ALL ')}) inventory; COMMIT;`;
  const business = JSON.parse(await readDatabase(command, database, 'business_fingerprint', businessSql));
  const newTables = [];
  if (schema === 106) for (const name of fresh) {
    const raw = await readDatabase(command, database, 'new_namespace_count', `SELECT count(*) FROM "${name}"`);
    assert(raw === '0', 'green_98_106_new_namespace_nonempty'); newTables.push({ name, count: 0 });
  }
  const readiness = normalizeReadinessFindings(JSON.parse(await readDatabase(command, database, 'readiness_fingerprint', buildReadinessFindingSql())));
  return { data: { schema, ledger, business, newTables }, ledgerRowsSha256: objectDigest(rows), readiness };
}
export async function checkForwardIntegrity(command, database) {
  const sql = fs.readFileSync(path.join(repositoryRoot, 'backend/ops/check_foreign_key_integrity.sql'), 'utf8');
  await readDatabase(command, database, 'foreign_key_integrity', sql);
  const required = migrationInventory().slice(98).flatMap(({ name }) =>
    [...fs.readFileSync(path.join(repositoryRoot, 'backend/sql/migrations', name), 'utf8')
      .matchAll(/^CREATE(?: OR REPLACE)? FUNCTION ([a-z][a-z0-9_]+)\(/gmu)].map(match => match[1]));
  assert(required.length > 0, 'green_98_106_function_inventory');
  const observed = JSON.parse(await readDatabase(command, database, 'function_inventory',
    "SELECT coalesce(json_agg(proname ORDER BY proname),'[]'::json) FROM pg_proc WHERE pronamespace='public'::regnamespace"));
  assert(required.every(name => observed.includes(name)), 'green_98_106_function_missing');
}
