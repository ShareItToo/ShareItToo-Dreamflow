import fs from 'node:fs';
import path from 'node:path';
import { assert, assertLedger, equal, exact, migrationInventory, newTableNames, objectDigest, repositoryRoot } from './green_staging_98_106_contract.mjs';
import { buildReadinessFindingSql, normalizeReadinessFindings } from './staging_forward_migration_rehearsal.mjs';

export const foreignWritersSql = "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()";
export const ledgerRowsSql = 'SELECT coalesce(json_agg(row_to_json(m) ORDER BY name),\'[]\'::json) FROM schema_migrations m';
export const tableNamesSql = "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public'";
export const watchdogTable = 'support_deadline_watchdog_state';
const watchdogSql = `SELECT coalesce(json_agg(row_to_json(w)),'[]'::json) FROM ${watchdogTable} w`;
const snapshotDiagnostics = new WeakMap();
export function snapshotFailureDiagnostic(error) { return snapshotDiagnostics.get(error) ?? null; }
export function validateWatchdog(value) {
  exact(value, ['singleton', 'worker_version', 'last_started_at', 'last_succeeded_at', 'last_failed_at',
    'last_error_code', 'last_inspected_count', 'last_alert_count', 'attempt_count', 'success_count', 'updated_at'],
  'green_98_106_watchdog_shape');
  const time = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  assert(value.singleton === true && value.worker_version === 'support-deadline-watchdog-v1'
    && ['last_started_at', 'updated_at'].every(k => time(value[k]))
    && ['last_succeeded_at', 'last_failed_at'].every(k => value[k] === null || time(value[k]))
    && (value.last_error_code === null || (typeof value.last_error_code === 'string' && /^[a-z0-9_]{1,240}$/u.test(value.last_error_code)))
    && ((value.last_error_code === null) === (value.last_failed_at === null))
    && ['last_inspected_count', 'last_alert_count', 'attempt_count', 'success_count']
      .every(k => Number.isSafeInteger(value[k]) && value[k] >= 0)
    && value.success_count <= value.attempt_count
    && Date.parse(value.updated_at) >= Date.parse(value.last_started_at)
    && ['last_succeeded_at', 'last_failed_at'].every(k => value[k] === null
      || Date.parse(value[k]) >= Date.parse(value.last_started_at)), 'green_98_106_watchdog_state');
  return value;
}
export function assertStartupHeartbeat(before, after, { now = Date.now(), code = 'green_98_106_candidate_start_drift' } = {}) {
  try {
    for (const snapshot of [before, after]) {
      exact(snapshot, ['schemaVersion', 'data', 'ledgerRowsSha256', 'readiness', 'watchdog'], 'green_98_106_snapshot_v2');
      assert(snapshot.schemaVersion === 2, 'green_98_106_snapshot_v2');
      validateWatchdog(snapshot.watchdog);
    }
    const { watchdog: prior, ...strictBefore } = before;
    const { watchdog: current, ...strictAfter } = after;
    assert(equal(strictBefore, strictAfter), code);
    assert(prior.last_error_code === null && current.last_error_code === null
      && prior.last_failed_at === null && current.last_failed_at === null
      && prior.last_succeeded_at !== null && current.last_succeeded_at !== null
      && current.last_started_at === current.last_succeeded_at && current.updated_at === current.last_started_at
      && Date.parse(current.last_started_at) > Math.max(Date.parse(prior.last_started_at), Date.parse(prior.last_succeeded_at), Date.parse(prior.updated_at))
      && Number.isFinite(now) && Date.parse(current.updated_at) <= now
      && current.attempt_count === prior.attempt_count + 1 && current.success_count === prior.success_count + 1
      && current.last_inspected_count === prior.last_inspected_count
      && prior.last_alert_count === 0 && current.last_alert_count === 0, code);
    return true;
  } catch (error) {
    // Names only, fixed components, bounded size. Never serialize row values,
    // timestamps, error text, record identifiers or business hashes.
    const components = [];
    for (const name of ['schema', 'ledger', 'newTables', 'business']) {
      if (!equal(before?.data?.[name], after?.data?.[name])) components.push(name);
    }
    for (const name of ['schemaVersion', 'ledgerRowsSha256', 'readiness', 'watchdog']) {
      if (!equal(before?.[name], after?.[name])) components.push(name);
    }
    const names = [...new Set([...Object.keys(before?.data?.business ?? {}), ...Object.keys(after?.data?.business ?? {})])];
    const tables = names.filter(name => /^[a-z][a-z0-9_]{0,62}$/u.test(name)
      && !equal(before?.data?.business?.[name], after?.data?.business?.[name])).sort().slice(0, 200);
    snapshotDiagnostics.set(error, { components, tables }); throw error;
  }
}
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
  const businessNames = oldNames ?? tables.filter(name => !['schema_migrations', watchdogTable].includes(name));
  assert(!businessNames.some(name => fresh.includes(name)), 'green_98_106_old_namespace_overlap');
  assert(!businessNames.includes(watchdogTable)
    && equal([...tables].sort(), [...businessNames, 'schema_migrations', watchdogTable, ...(schema === 106 ? fresh : [])].sort()),
    'green_98_106_table_inventory_drift');
  const rows = JSON.parse(await readDatabase(command, database, 'ledger_rows', ledgerRowsSql));
  const ledger = assertLedger(rows.map(({ name, checksum }) => ({ name, checksum })), schema);
  assert(rows.every(row => typeof row.applied_at === 'string' && Number.isFinite(Date.parse(row.applied_at))), 'green_98_106_ledger_timestamps');
  // json_build_object has a 100-argument limit: each table emits one row.
  const businessSql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT json_object_agg(name,state) FROM (${businessNames.map((name, index) => `SELECT '${name}' AS name, (SELECT json_build_object('count',count(*),'sha256',encode(digest(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),''),'sha256'),'hex')) FROM "${name}" t) AS state`).join(' UNION ALL ')}) inventory; COMMIT;`;
  const business = JSON.parse(await readDatabase(command, database, 'business_fingerprint', businessSql));
  const watchdogRows = JSON.parse(await readDatabase(command, database, 'watchdog_state', watchdogSql));
  assert(Array.isArray(watchdogRows) && watchdogRows.length === 1, 'green_98_106_watchdog_singleton');
  const watchdog = validateWatchdog(watchdogRows[0]);
  const newTables = [];
  if (schema === 106) for (const name of fresh) {
    const raw = await readDatabase(command, database, 'new_namespace_count', `SELECT count(*) FROM "${name}"`);
    assert(raw === '0', 'green_98_106_new_namespace_nonempty'); newTables.push({ name, count: 0 });
  }
  const readiness = normalizeReadinessFindings(JSON.parse(await readDatabase(command, database, 'readiness_fingerprint', buildReadinessFindingSql())));
  return { schemaVersion: 2, data: { schema, ledger, business, newTables }, ledgerRowsSha256: objectDigest(rows), readiness, watchdog };
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
