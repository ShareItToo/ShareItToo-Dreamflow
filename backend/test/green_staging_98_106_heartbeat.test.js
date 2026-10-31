import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStartupHeartbeat, readSnapshot, snapshotFailureDiagnostic } from '../ops/green_staging_98_106_database.mjs';
import { dockerFixture } from './fixtures/green_98106_docker.js';

async function snapshots() {
  const f = dockerFixture(); f.dbStates.get(f.database.Id).schema = 106;
  const before = await readSnapshot(f.dependencies.command, { id: f.database.Id, user: 'synthetic', name: 'synthetic' }, 106,
    Object.keys(f.dbStates.get(f.database.Id).business));
  const after = structuredClone(before);
  after.watchdog.last_started_at = '2020-01-01T00:00:01.000Z';
  after.watchdog.last_succeeded_at = after.watchdog.last_started_at;
  after.watchdog.updated_at = after.watchdog.last_started_at;
  after.watchdog.attempt_count++; after.watchdog.success_count++;
  return { before, after };
}
test('snapshot-v2 isolates exactly one typed watchdog row; successful startup changes only its one heartbeat', async () => {
  const { before, after } = await snapshots();
  assert.equal(before.schemaVersion, 2);
  assert.ok(!Object.hasOwn(before.data.business, 'support_deadline_watchdog_state'));
  assert.equal(assertStartupHeartbeat(before, after), true);
  assert.throws(() => assertStartupHeartbeat(before, before), /candidate_start_drift/u);
});
test('malformed/error/counter/time/alert heartbeat and every other snapshot change remain fail-closed', async t => {
  const changes = {
    oldSnapshot: s => { s.schemaVersion = 1; }, missing: s => { delete s.watchdog; },
    extra: s => { s.watchdog.extra = true; }, singleton: s => { s.watchdog.singleton = false; },
    version: s => { s.watchdog.worker_version = 'foreign'; },
    error: s => { s.watchdog.last_error_code = 'worker_failed'; s.watchdog.last_failed_at = s.watchdog.updated_at; },
    attempt: s => { s.watchdog.attempt_count++; }, success: s => { s.watchdog.success_count--; },
    repeated: s => { s.watchdog.attempt_count++; s.watchdog.success_count++; },
    unsafeCounter: s => { s.watchdog.attempt_count = Number.MAX_SAFE_INTEGER + 1; },
    negativeCount: s => { s.watchdog.last_inspected_count = -1; },
    inspected: s => { s.watchdog.last_inspected_count++; }, alerts: s => { s.watchdog.last_alert_count = 1; },
    time: s => { s.watchdog.last_started_at = 'invalid'; },
    backwards: s => { s.watchdog.last_started_at = '2019-01-01T00:00:00.000Z'; },
    future: s => { s.watchdog.last_started_at = s.watchdog.last_succeeded_at = s.watchdog.updated_at = '2999-01-01T00:00:00.000Z'; },
    userData: s => { s.data.business.users.sha256 = '9'.repeat(64); },
    tableRemoved: s => { delete s.data.business.users; },
    ledger: s => { s.data.ledger = '9'.repeat(64); }, ledgerTimes: s => { s.ledgerRowsSha256 = '9'.repeat(64); },
    schema: s => { s.data.schema = 98; }, newTables: s => { s.data.newTables[0].count = 1; },
    readiness: s => { s.readiness.paymentRecoveryNeedsReview.push({ secret: 'never-display-row-data' }); },
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => {
    const { before, after } = await snapshots(); change(after);
    assert.throws(() => assertStartupHeartbeat(before, after));
  });
  const { before, after } = await snapshots();
  before.watchdog.last_failed_at = before.watchdog.updated_at; before.watchdog.last_error_code = 'worker_failed';
  assert.throws(() => assertStartupHeartbeat(before, after), /candidate_start_drift/u);
});
test('startup diagnostics expose fixed component and table names only, never row values', async () => {
  const { before, after } = await snapshots();
  after.data.business.users.sha256 = 'private-value-not-a-hash';
  let failure; try { assertStartupHeartbeat(before, after); } catch (e) { failure = e; }
  assert.deepEqual(snapshotFailureDiagnostic(failure), { components: ['business', 'watchdog'], tables: ['users'] });
  assert.ok(!JSON.stringify(snapshotFailureDiagnostic(failure)).includes('private-value'));
  assert.equal(snapshotFailureDiagnostic(new Error('unrelated')), null);
});
