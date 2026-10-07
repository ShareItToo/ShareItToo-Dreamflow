import { assertLedger, equal, objectDigest } from './green_staging_98_106_contract.mjs';
import { assertStartupHeartbeat, validateWatchdog, watchdogTable } from './green_staging_98_106_database.mjs';
import { buildReadinessFindingSql, normalizeReadinessFindings } from './staging_forward_migration_rehearsal.mjs';

const requireState = (ok) => { if (!ok) throw new Error('green_106_106_database_snapshot'); };
// One psql session and one repeatable-read, read-only transaction. Identifiers
// originate only in pg_tables and are escaped by PostgreSQL format(%I/%L).
export const snapshotSql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT coalesce(json_agg(row_to_json(m) ORDER BY name),'[]'::json) FROM schema_migrations m;
SELECT 'SELECT json_object_agg(name,state) FROM (' || string_agg(format(
  'SELECT %L AS name, (SELECT json_build_object(''count'',count(*),''sha256'',encode(digest(coalesce(string_agg(row_to_json(t)::text,E''\\n'' ORDER BY row_to_json(t)::text),''''),''sha256''),''hex'')) FROM %I.%I t) AS state',
  tablename, schemaname, tablename), ' UNION ALL ' ORDER BY tablename) || ') inventory;'
FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations','${watchdogTable}')
\\gexec
SELECT coalesce(json_agg(row_to_json(w)),'[]'::json) FROM ${watchdogTable} w;
${buildReadinessFindingSql()}
COMMIT;
`;

export function decodeSnapshot(raw) {
  const lines = String(raw).trim().split('\n');
  requireState(lines.length === 4);
  const [ledgerRows, tables, watchdogRows, readiness] = lines.map(line => JSON.parse(line));
  requireState(Array.isArray(ledgerRows));
  const ledger = assertLedger(ledgerRows.map(({ name, checksum }) => ({ name, checksum })), 106);
  requireState(ledgerRows.every(r => equal(Object.keys(r).sort(), ['applied_at', 'checksum', 'name'])
    && typeof r.applied_at === 'string' && Number.isFinite(Date.parse(r.applied_at))));
  requireState(tables && Object.getPrototypeOf(tables) === Object.prototype && Object.keys(tables).length > 0);
  for (const [name, value] of Object.entries(tables)) {
    requireState(/^[a-z][a-z0-9_]{0,62}$/u.test(name) && !['schema_migrations', watchdogTable].includes(name)
      && equal(Object.keys(value).sort(), ['count', 'sha256']) && Number.isSafeInteger(value.count)
      && value.count >= 0 && /^[a-f0-9]{64}$/u.test(value.sha256));
  }
  requireState(Array.isArray(watchdogRows) && watchdogRows.length === 1);
  requireState(readiness && equal(Object.keys(readiness).sort(), ['paymentRecoveryNeedsReview', 'supportNextUpdateOverdue']));
  return { schemaVersion: 2, data: { schema: 106, ledger, business: tables, newTables: [] },
    ledgerRowsSha256: objectDigest(ledgerRows), readiness: normalizeReadinessFindings(readiness),
    watchdog: validateWatchdog(watchdogRows[0]) };
}

// Mission tables are ordinary existing business tables: populated is allowed,
// but every count and content hash remains strict across startup.
export function assertSuccessorStartup(before, after, options = {}) {
  requireState(before?.data?.schema === 106 && after?.data?.schema === 106
    && equal(before.data.newTables, []) && equal(after.data.newTables, []));
  return assertStartupHeartbeat(before, after, { ...options, code: 'green_106_106_startup_drift' });
}
