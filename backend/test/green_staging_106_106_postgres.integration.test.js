import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { findAvailableLoopbackPort, resolvePostgresBinDir } from '../../tool/run_local_postgres_integration.mjs';
import { runMigrations } from '../src/migrations.js';
import { decodeSnapshot, snapshotSql } from '../ops/green_staging_106_106_database.mjs';
import { physicalSchemaSql } from '../ops/green_staging_106_106_preflight.mjs';

test('native PG16 successor SQL collects populated tables consistently and cannot write',
  { skip: process.env.SIT_GREEN_106_106_PG16 !== '1', timeout: 120000 }, async t => {
    const bin = await resolvePostgresBinDir({ explicitBinDir: process.env.SIT_POSTGRES_BIN_DIR });
    const run = (program, args, options = {}) => execFileSync(path.join(bin, program), args,
      { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    assert.match(run('postgres', ['--version']), /\b16\./u);
    const base = fs.realpathSync(os.tmpdir()), temporary = fs.mkdtempSync(path.join(base, 'sit-green-106-106-'));
    fs.chmodSync(temporary, 0o700);
    const data = path.join(temporary, 'data'), port = await findAvailableLoopbackPort(), user = 'sit_successor_test';
    const connection = `postgresql://${user}@127.0.0.1:${port}/postgres`;
    let pool, started = false;
    try {
      run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--username', user, '--auth-local=reject', '--auth-host=trust']);
      started = true;
      run('pg_ctl', ['-D', data, '-l', path.join(temporary, 'postgres.log'), '-w', '-t', '15',
        '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start']);
      pool = new pg.Pool({ connectionString: connection });
      await pool.query(fs.readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      await runMigrations(pool);
      await pool.query(`INSERT INTO support_deadline_watchdog_state(singleton,worker_version,last_started_at,last_succeeded_at,
        last_failed_at,last_error_code,last_inspected_count,last_alert_count,attempt_count,success_count,updated_at)
        VALUES(true,'support-deadline-watchdog-v1','2020-01-01Z','2020-01-01Z',NULL,NULL,0,0,1,1,'2020-01-01Z')`);
      // A package-namespaced extra populated table proves complete catalog
      // discovery; no hardcoded 98/106 namespace or emptiness list can pass.
      await pool.query('CREATE TABLE successor_collector_synthetic(value text NOT NULL)');
      await pool.query("INSERT INTO successor_collector_synthetic VALUES ('synthetic-only')");
      const args = ['--dbname', connection, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'];
      const collect = () => decodeSnapshot(run('psql', args, { input: snapshotSql, stdio: ['pipe', 'pipe', 'pipe'] }));
      const physical = () => run('psql', args, { input: physicalSchemaSql, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const physicalBefore = physical(); assert.match(physicalBefore, /^[a-f0-9]{64}$/u);
      assert.equal(physical(), physicalBefore);
      const before = collect(), after = collect();
      assert.deepEqual(after, before);
      assert.equal(before.data.business.successor_collector_synthetic.count, 1);
      assert.ok(Object.keys(before.data.business).some(n => n.startsWith('mission_')));
      assert.throws(() => run('psql', args, { input: "BEGIN READ ONLY; INSERT INTO successor_collector_synthetic VALUES ('forbidden'); COMMIT;",
        stdio: ['pipe', 'pipe', 'pipe'] }));
      assert.deepEqual(collect(), before);
      await pool.query('ALTER TABLE successor_collector_synthetic ADD CONSTRAINT successor_positive_length CHECK(length(value)>0) NOT VALID');
      const unvalidated = physical(); assert.notEqual(unvalidated, physicalBefore);
      await pool.query('ALTER TABLE successor_collector_synthetic VALIDATE CONSTRAINT successor_positive_length');
      assert.notEqual(physical(), unvalidated);
      await pool.query('ALTER TABLE successor_collector_synthetic DROP CONSTRAINT successor_positive_length');
      assert.equal(physical(), physicalBefore);
      t.diagnostic(`PG16 consistent snapshot: ${Object.keys(before.data.business).length} business tables, exact ledger106, typed singleton; read-only write rejected.`);
    } finally {
      await pool?.end();
      if (started) {
        run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']);
        assert.equal(fs.existsSync(path.join(data, 'postmaster.pid')), false);
      }
      assert.equal(path.dirname(temporary), base); assert.ok(path.basename(temporary).startsWith('sit-green-106-106-'));
      fs.rmSync(temporary, { recursive: true, force: true });
      assert.equal(fs.existsSync(temporary), false);
      t.diagnostic('Owned PG16 stopped and exclusive synthetic directory removed.');
    }
  });
