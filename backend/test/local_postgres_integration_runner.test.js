import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertSafeTempRoot,
  findAvailableLoopbackPort,
  parsePostgresMajor,
  requiredPostgresMajor,
  runLocalPostgresIntegration,
} from '../../tool/run_local_postgres_integration.mjs';

const fakeProgram = `#!/bin/sh
set -eu
program=$(basename "$0")
printf '%s|%s|%s\\n' "$program" "$*" "\${TEST_DATABASE_URL:-}" >> "$SIT_FAKE_COMMAND_LOG"
case "$program" in
  postgres)
    printf 'postgres (PostgreSQL) %s.12\\n' "\${SIT_FAKE_POSTGRES_MAJOR:-16}"
    ;;
  initdb)
    while [ "$#" -gt 0 ]; do
      if [ "$1" = '-D' ]; then
        shift
        mkdir -p "$1"
        break
      fi
      shift
    done
    ;;
  pg_ctl|pg_isready|createdb)
    ;;
  node)
    exit "\${SIT_FAKE_NODE_EXIT:-0}"
    ;;
  *)
    exit 64
    ;;
esac
`;

async function fakeFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sit-pg-runner-test-'));
  const bin = path.join(root, 'bin');
  const temporaryBase = path.join(root, 'runs');
  const commandLog = path.join(root, 'commands.log');
  await mkdir(bin);
  await mkdir(temporaryBase);
  for (const program of [
    'postgres', 'initdb', 'pg_ctl', 'pg_isready', 'createdb', 'node',
  ]) {
    const target = path.join(bin, program);
    await writeFile(target, fakeProgram);
    await chmod(target, 0o755);
  }
  await writeFile(commandLog, '');
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    bin,
    temporaryBase,
    commandLog,
    environment: {
      ...process.env,
      SIT_FAKE_COMMAND_LOG: commandLog,
    },
  };
}

test('parses and pins PostgreSQL major version 16', () => {
  assert.equal(parsePostgresMajor('postgres (PostgreSQL) 16.12'), 16);
  assert.equal(requiredPostgresMajor, 16);
  assert.throws(() => parsePostgresMajor('unknown'), /version_unparseable/);
});

test('rejects cleanup targets outside the scoped runner prefix', () => {
  assert.throws(() => assertSafeTempRoot(os.tmpdir()), /unsafe_postgres_temp_root/);
  assert.throws(
    () => assertSafeTempRoot(path.join(os.tmpdir(), 'unrelated-fixture')),
    /unsafe_postgres_temp_root/,
  );
});

test('allocates an actually bindable loopback port', async () => {
  const port = await findAvailableLoopbackPort();
  assert.ok(Number.isInteger(port));
  assert.ok(port > 0 && port <= 65_535);
});

test('runs readiness, isolated database and integration before guaranteed cleanup', async (t) => {
  const fixture = await fakeFixture(t);
  const result = await runLocalPostgresIntegration({
    repositoryRoot: fixture.root,
    postgresBinDir: fixture.bin,
    nodeBin: path.join(fixture.bin, 'node'),
    environment: fixture.environment,
    temporaryBase: fixture.temporaryBase,
  });
  assert.deepEqual(result, {
    status: 'passed-and-cleaned',
    postgresMajor: 16,
    host: '127.0.0.1',
    database: 'sit_integration',
    integrationTest: 'backend/test/postgres_foundation.integration.test.js',
  });
  assert.deepEqual(await readdir(fixture.temporaryBase), []);

  const log = await readFile(fixture.commandLog, 'utf8');
  assert.match(log, /initdb\|.*--auth-local=reject.*--auth-host=trust/u);
  assert.match(
    log,
    /pg_ctl\|.*-h 127\.0\.0\.1 -p \d+ -c unix_socket_directories= start\|/u,
  );
  assert.match(log, /pg_isready\|-h 127\.0\.0\.1 .* -d postgres/u);
  assert.match(log, /createdb\|-h 127\.0\.0\.1 .* sit_integration/u);
  assert.match(log, /node\|--throw-deprecation --import \.\/backend\/test_setup\.js --test backend\/test\/postgres_foundation\.integration\.test\.js backend\/test\/foreign_key_integrity\.integration\.test\.js\|postgresql:\/\/sit_runner@127\.0\.0\.1:/u);
  assert.match(log, /pg_ctl\|.* -m fast stop\|/u);
});

test('accepts quiet integration output mode and rejects non-boolean modes', async (t) => {
  const fixture = await fakeFixture(t);
  const result = await runLocalPostgresIntegration({
    repositoryRoot: fixture.root,
    postgresBinDir: fixture.bin,
    nodeBin: path.join(fixture.bin, 'node'),
    environment: fixture.environment,
    temporaryBase: fixture.temporaryBase,
    inheritTestOutput: false,
  });
  assert.equal(result.status, 'passed-and-cleaned');
  assert.deepEqual(await readdir(fixture.temporaryBase), []);

  await assert.rejects(
    runLocalPostgresIntegration({ inheritTestOutput: 'quiet' }),
    /postgres_test_output_mode_invalid/u,
  );
});

test('cleans the cluster and stops PostgreSQL when the integration fails', async (t) => {
  const fixture = await fakeFixture(t);
  const environment = {
    ...fixture.environment,
    SIT_FAKE_NODE_EXIT: '23',
  };
  await assert.rejects(
    runLocalPostgresIntegration({
      repositoryRoot: fixture.root,
      postgresBinDir: fixture.bin,
      nodeBin: path.join(fixture.bin, 'node'),
      environment,
      temporaryBase: fixture.temporaryBase,
    }),
    /node failed with exit 23/u,
  );
  assert.deepEqual(await readdir(fixture.temporaryBase), []);
  const log = await readFile(fixture.commandLog, 'utf8');
  assert.match(log, /pg_ctl\|.* -m fast stop\|/u);
});

test('fails closed before initialization on the wrong PostgreSQL major', async (t) => {
  const fixture = await fakeFixture(t);
  const environment = {
    ...fixture.environment,
    SIT_FAKE_POSTGRES_MAJOR: '15',
  };
  await assert.rejects(
    runLocalPostgresIntegration({
      repositoryRoot: fixture.root,
      postgresBinDir: fixture.bin,
      nodeBin: path.join(fixture.bin, 'node'),
      environment,
      temporaryBase: fixture.temporaryBase,
    }),
    /required 16, found 15/u,
  );
  assert.deepEqual(await readdir(fixture.temporaryBase), []);
  const log = await readFile(fixture.commandLog, 'utf8');
  assert.doesNotMatch(log, /^initdb\|/mu);
});
