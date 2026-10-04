import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { findAvailableLoopbackPort, resolvePostgresBinDir } from '../../tool/run_local_postgres_integration.mjs';
import { runMigrations } from '../src/migrations.js';
import { assertReadinessFindingsUnchanged, buildReadinessFindingSql } from '../ops/staging_forward_migration_rehearsal.mjs';
import { assertDataTransition, assertLedger, digest, newTableNames } from '../ops/green_staging_98_106_contract.mjs';
import { readSnapshot, checkForwardIntegrity } from '../ops/green_staging_98_106_database.mjs';

test('disposable native PG16: protected custom dump, restore98, forward106, idempotence and cleanup',
  { skip: process.env.SIT_GREEN_98_106_PG16 !== '1', timeout: 120000 }, async (t) => {
    const bin = await resolvePostgresBinDir({ explicitBinDir: process.env.SIT_POSTGRES_BIN_DIR });
    const run = (program, args, options = {}) => execFileSync(path.join(bin, program), args,
      { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'], ...options });
    for (const program of ['postgres', 'pg_dump', 'pg_restore']) assert.match(run(program, ['--version']), /\b16\./u);
    const base = fs.realpathSync(os.tmpdir());
    const temporary = fs.mkdtempSync(path.join(base, 'sit-green-98-106-pg16-')); fs.chmodSync(temporary, 0o700);
    const data = path.join(temporary, 'data'); const log = path.join(temporary, 'postgres.log');
    const port = await findAvailableLoopbackPort(); const user = 'sit_green_98106_test';
    const pools = []; let startAttempted = false; let stopped = false;
    const connection = name => `postgresql://${user}@127.0.0.1:${port}/${name}`;
    const pool = name => { const p = new pg.Pool({ connectionString: connection(name) }); pools.push(p); return p; };
    const tables = async p => (await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
    const snapshot = async (p, schema, oldNames) => {
      const ledger = assertLedger((await p.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows, schema);
      const business = {};
      for (const name of oldNames) {
        assert.match(name, /^[a-z][a-z0-9_]+$/u);
        const rows = (await p.query(`SELECT row_to_json(t)::text AS value FROM "${name}" t ORDER BY row_to_json(t)::text`)).rows;
        business[name] = { count: rows.length, sha256: digest(JSON.stringify(rows)) };
      }
      const newTables = [];
      if (schema === 106) for (const name of newTableNames()) {
        newTables.push({ name, count: Number((await p.query(`SELECT count(*) AS count FROM "${name}"`)).rows[0].count) });
      }
      return { schema, ledger, business, newTables };
    };
    try {
      run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--username', user, '--auth-local=reject', '--auth-host=trust']);
      startAttempted = true;
      run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '15', '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start']);
      for (const name of ['source98', 'restore106']) run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', user, name]);
      const source = pool('source98'); const restored = pool('restore106');
      assert.equal((await source.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2), '16');
      await source.query(fs.readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      await runMigrations(source, { through: 98 });
      await source.query("INSERT INTO users(id,email,profile) VALUES ('synthetic-green98-owner','synthetic-green98@example.invalid','{\"displayName\":\"Synthetic\"}')");
      const oldNames = (await tables(source)).filter(name => name !== 'schema_migrations');
      const before = await snapshot(source, 98, oldNames);
      const productionSql = name => async ({ args }) => run('psql', ['--dbname', connection(name),
        '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', args.at(-1)]);
      const sqlDatabase = { id: '1'.repeat(64), name: 'synthetic_local', user: 'synthetic_local' };
      const productionBefore = await readSnapshot(productionSql('source98'), sqlDatabase, 98);
      const readiness = (await source.query(buildReadinessFindingSql())).rows;
      const backup = path.join(temporary, 'backup.dump');
      const fd = fs.openSync(backup, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try {
        run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--dbname', connection('source98')], { stdio: ['ignore', fd, 'pipe'] });
        const stat = fs.fstatSync(fd); assert.equal(stat.mode & 0o777, 0o600); assert.equal(stat.nlink, 1);
        const bytes = Buffer.alloc(stat.size); assert.equal(fs.readSync(fd, bytes, 0, bytes.length, 0), bytes.length);
        const backupSha256 = digest(bytes); assert.equal(fs.lstatSync(backup).ino, stat.ino);
        assert.equal(digest(fs.readFileSync(backup)), backupSha256);
        run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', connection('restore106')],
          { input: bytes, stdio: ['pipe', 'pipe', 'pipe'] });
        bytes.fill(0);
      } finally { fs.closeSync(fd); }
      assert.deepEqual(await snapshot(restored, 98, oldNames), before);
      await runMigrations(restored);
      const after = await snapshot(restored, 106, oldNames);
      assertDataTransition(before, after);
      const productionAfter = await readSnapshot(productionSql('restore106'), sqlDatabase, 106, oldNames);
      assertDataTransition(productionBefore.data, productionAfter.data);
      await checkForwardIntegrity(productionSql('restore106'), sqlDatabase);
      assert.deepEqual((await tables(restored)).sort(), [...oldNames, 'schema_migrations', ...newTableNames()].sort());
      assert.equal((await restored.query("SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")).rows[0].count, '0');
      const functions = (await restored.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname")).rows;
      assert.ok(functions.some(r => r.proname.includes('apple_ownership')));
      const afterReadiness = (await restored.query(buildReadinessFindingSql())).rows;
      assert.deepEqual(afterReadiness, readiness);
      // Validate the actual SQL fingerprints, not a substitute fixture/count.
      assertReadinessFindingsUnchanged(JSON.parse(Object.values(readiness[0])[0]),
        JSON.parse(Object.values(afterReadiness[0])[0]));
      const ledgerBeforeIdempotence = (await restored.query('SELECT * FROM schema_migrations ORDER BY name')).rows;
      await runMigrations(restored);
      assert.deepEqual(await snapshot(restored, 106, oldNames), after);
      assert.deepEqual((await restored.query('SELECT * FROM schema_migrations ORDER BY name')).rows, ledgerBeforeIdempotence);
      assert.deepEqual((await restored.query(buildReadinessFindingSql())).rows, afterReadiness);
      t.diagnostic(`PG16 local synthetic proof: ${oldNames.length} old tables preserved; ${newTableNames().length} new tables empty; exact 98/106 ledgers; second run unchanged.`);
    } finally {
      for (const p of pools) await p.end();
      if (startAttempted) {
        run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']);
        stopped = !fs.existsSync(path.join(data, 'postmaster.pid'));
        assert.equal(stopped, true, 'owned PG16 server must stop before directory removal');
      }
      assert.equal(path.dirname(temporary), base);
      assert.ok(path.basename(temporary).startsWith('sit-green-98-106-pg16-'));
      assert.ok(!startAttempted || stopped);
      fs.rmSync(temporary, { recursive: true, force: true });
      assert.equal(fs.existsSync(temporary), false);
      t.diagnostic('Owned native PG16 server stopped; exclusive disposable directory and backup removed.');
    }
  });
