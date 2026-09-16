#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const requiredPostgresMajor = 16;
export const integrationDatabaseName = 'sit_integration';
export const integrationDatabaseUser = 'sit_runner';

const requiredPrograms = Object.freeze([
  'postgres',
  'initdb',
  'pg_ctl',
  'pg_isready',
  'createdb',
]);
const tempPrefix = 'sit-postgres-integration-';

function compactFailureOutput(value) {
  return value.trim().split(/\r?\n/u).slice(-40).join('\n').slice(0, 8_000);
}

function commandError(command, code, stderr, stdout = '') {
  const detail = compactFailureOutput(`${stderr}\n${stdout}`);
  return new Error(
    `${path.basename(command)} failed with exit ${code}` +
      (detail === '' ? '.' : `: ${detail}`),
  );
}

async function runCommand(command, args, {
  cwd,
  env,
  inherit = false,
  onChild = () => {},
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    onChild(child);
    let stdout = '';
    let stderr = '';
    if (!inherit) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      onChild(null);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(commandError(command, code ?? signal ?? 'unknown', stderr, stdout));
    });
  });
}

async function executable(candidate) {
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(environment) {
  const values = [];
  if (environment.SIT_POSTGRES_BIN_DIR?.trim()) {
    values.push(environment.SIT_POSTGRES_BIN_DIR.trim());
  }
  for (const entry of (environment.PATH ?? '').split(path.delimiter)) {
    if (entry.trim() !== '') values.push(entry);
  }
  values.push(
    '/opt/homebrew/opt/postgresql@16/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/usr/lib/postgresql/16/bin',
  );
  return [...new Set(values.map((value) => path.resolve(value)))];
}

export function parsePostgresMajor(versionOutput) {
  const match = /PostgreSQL\)\s+(\d+)(?:\.|\s|$)/u.exec(versionOutput);
  if (match === null) throw new Error('postgres_version_unparseable');
  return Number.parseInt(match[1], 10);
}

export async function resolvePostgresBinDir({
  environment = process.env,
  explicitBinDir,
} = {}) {
  const candidates = explicitBinDir
    ? [path.resolve(explicitBinDir)]
    : pathCandidates(environment);
  for (const directory of candidates) {
    if (await Promise.all(requiredPrograms.map(
      (program) => executable(path.join(directory, program)),
    )).then((results) => results.every(Boolean))) {
      return directory;
    }
  }
  throw new Error(
    'postgresql_16_tools_not_found: install PostgreSQL 16 or set ' +
      'SIT_POSTGRES_BIN_DIR to its bin directory.',
  );
}

export function assertSafeTempRoot(candidate, base = os.tmpdir()) {
  const resolvedBase = path.resolve(base);
  const resolvedCandidate = path.resolve(candidate);
  if (path.dirname(resolvedCandidate) !== resolvedBase ||
      !path.basename(resolvedCandidate).startsWith(tempPrefix)) {
    throw new Error('unsafe_postgres_temp_root');
  }
  return resolvedCandidate;
}

export async function findAvailableLoopbackPort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null
    ? address.port
    : null;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('loopback_port_allocation_failed');
  }
  return port;
}

async function cleanupRunRoot(runRoot, base) {
  const safeRoot = assertSafeTempRoot(runRoot, base);
  await rm(safeRoot, { recursive: true, force: true, maxRetries: 2 });
}

export async function runLocalPostgresIntegration({
  repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  postgresBinDir,
  nodeBin = process.execPath,
  environment = process.env,
  temporaryBase = os.tmpdir(),
  inheritTestOutput = true,
} = {}) {
  if (typeof inheritTestOutput !== 'boolean') {
    throw new Error('postgres_test_output_mode_invalid');
  }
  const root = path.resolve(repositoryRoot);
  const resolvedBinDir = await resolvePostgresBinDir({
    environment,
    explicitBinDir: postgresBinDir,
  });
  const postgres = (name) => path.join(resolvedBinDir, name);
  const version = await runCommand(postgres('postgres'), ['--version'], {
    cwd: root,
    env: environment,
  });
  const postgresMajor = parsePostgresMajor(version.stdout);
  if (postgresMajor !== requiredPostgresMajor) {
    throw new Error(
      `postgres_major_mismatch: required ${requiredPostgresMajor}, found ` +
        `${postgresMajor}.`,
    );
  }

  const resolvedTemporaryBase = path.resolve(temporaryBase);
  const runRoot = assertSafeTempRoot(
    await mkdtemp(path.join(resolvedTemporaryBase, tempPrefix)),
    resolvedTemporaryBase,
  );
  const dataDirectory = path.join(runRoot, 'data');
  const serverLog = path.join(runRoot, 'postgres.log');
  let serverStartAttempted = false;
  let activeChild = null;
  let receivedSignal = null;
  let primaryError = null;
  let port = null;

  const onSignal = (signal) => {
    receivedSignal = signal;
    activeChild?.kill(signal);
  };
  const onInterrupt = () => onSignal('SIGINT');
  const onTerminate = () => onSignal('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  const checkedRun = async (command, args, options = {}) => {
    if (receivedSignal !== null) throw new Error(`interrupted_by_${receivedSignal}`);
    return runCommand(command, args, {
      cwd: root,
      env: environment,
      ...options,
      onChild: (child) => { activeChild = child; },
    });
  };

  try {
    await checkedRun(postgres('initdb'), [
      '-D', dataDirectory,
      '--no-locale',
      '--encoding=UTF8',
      '--username', integrationDatabaseUser,
      '--auth-local=reject',
      '--auth-host=trust',
    ]);
    port = await findAvailableLoopbackPort();
    serverStartAttempted = true;
    await checkedRun(postgres('pg_ctl'), [
      '-D', dataDirectory,
      '-l', serverLog,
      '-w',
      '-t', '15',
      '-o',
      `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,
      'start',
    ]);
    await checkedRun(postgres('pg_isready'), [
      '-h', '127.0.0.1',
      '-p', String(port),
      '-U', integrationDatabaseUser,
      '-d', 'postgres',
      '-t', '2',
    ]);
    await checkedRun(postgres('createdb'), [
      '-h', '127.0.0.1',
      '-p', String(port),
      '-U', integrationDatabaseUser,
      integrationDatabaseName,
    ]);
    const testEnvironment = {
      ...environment,
      TEST_DATABASE_URL:
        `postgresql://${integrationDatabaseUser}@127.0.0.1:${port}/` +
        integrationDatabaseName,
    };
    await checkedRun(nodeBin, [
      '--throw-deprecation',
      '--import', './backend/test_setup.js',
      '--test',
      'backend/test/postgres_foundation.integration.test.js',
      'backend/test/foreign_key_integrity.integration.test.js',
    ], { env: testEnvironment, inherit: inheritTestOutput });
  } catch (error) {
    let postgresDetail = '';
    try {
      postgresDetail = compactFailureOutput(await readFile(serverLog, 'utf8'));
    } catch {
      // A pre-start failure has no PostgreSQL log to include.
    }
    primaryError = postgresDetail === ''
      ? error
      : new Error(`${error?.message ?? 'postgres integration failed'}\n${postgresDetail}`);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    let cleanupError = null;
    let safeToRemoveRunRoot = true;
    if (serverStartAttempted) {
      try {
        await runCommand(postgres('pg_ctl'), ['-D', dataDirectory, 'status'], {
          cwd: root,
          env: environment,
        });
        try {
          await runCommand(postgres('pg_ctl'), [
            '-D', dataDirectory,
            '-w',
            '-t', '15',
            '-m', 'fast',
            'stop',
          ], { cwd: root, env: environment });
        } catch (fastStopError) {
          try {
            await runCommand(postgres('pg_ctl'), [
              '-D', dataDirectory,
              '-w',
              '-t', '15',
              '-m', 'immediate',
              'stop',
            ], { cwd: root, env: environment });
          } catch (immediateStopError) {
            safeToRemoveRunRoot = false;
            cleanupError = new AggregateError(
              [fastStopError, immediateStopError],
              'postgres_stop_failed_temp_root_retained',
            );
          }
        }
      } catch {
        // A failed start has no server to stop. The scoped cluster can be
        // removed safely after pg_ctl confirms it is not running.
      }
    }
    if (safeToRemoveRunRoot) {
      try {
        await cleanupRunRoot(runRoot, resolvedTemporaryBase);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (primaryError !== null && cleanupError !== null) {
      throw new AggregateError(
        [primaryError, cleanupError],
        'postgres_integration_and_cleanup_failed',
      );
    }
    if (primaryError !== null) throw primaryError;
    if (cleanupError !== null) throw cleanupError;
  }

  return Object.freeze({
    status: 'passed-and-cleaned',
    postgresMajor,
    host: '127.0.0.1',
    database: integrationDatabaseName,
    integrationTest: 'backend/test/postgres_foundation.integration.test.js',
  });
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length !== 0) throw new Error(`unknown_argument: ${args[0]}`);
  const result = await runLocalPostgresIntegration();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await runCli();
  } catch (error) {
    if (error instanceof AggregateError) {
      for (const nested of error.errors) {
        process.stderr.write(`ERROR: ${nested?.message ?? 'unknown failure'}\n`);
      }
    } else {
      process.stderr.write(`ERROR: ${error?.message ?? 'unknown failure'}\n`);
    }
    process.exitCode = 1;
  }
}
