#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  findAvailableLoopbackPort,
  resolvePostgresBinDir,
} from './run_local_postgres_integration.mjs';

const publicPort = 18080;
const databaseName = 'sit_android_local_qa';
const databaseUser = 'sit_android_qa';
const tempPrefix = 'sit-android-local-qa-';

function fail(message) {
  throw new Error(message);
}

function compact(value) {
  return String(value).trim().split(/\r?\n/u).slice(-8).join('\n').slice(0, 2_000);
}

function run(command, args, { cwd, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(new Error(
          `${command.split('/').at(-1)} failed with ${code ?? signal}: ${compact(stderr)}`,
        ));
      }
    });
  });
}

function waitForSignal() {
  return new Promise((resolvePromise) => {
    const finish = (signal) => resolvePromise(signal);
    process.once('SIGINT', () => finish('SIGINT'));
    process.once('SIGTERM', () => finish('SIGTERM'));
  });
}

function waitForUnexpectedExit(child) {
  return new Promise((_, reject) => {
    child.once('close', (code, signal) => {
      reject(new Error(
        `Local QA backend exited unexpectedly with ${code ?? signal ?? 'unknown status'}.`,
      ));
    });
  });
}

function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let timer;
    const closed = () => {
      clearTimeout(timer);
      resolvePromise(true);
    };
    child.once('close', closed);
    timer = setTimeout(() => {
      child.off('close', closed);
      resolvePromise(false);
    }, timeoutMs);
  });
}

async function terminateChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForChildClose(child, 12_000)) return;
  child.kill('SIGKILL');
  if (!(await waitForChildClose(child, 5_000))) {
    fail('Local QA backend termination deadline expired.');
  }
}

async function waitForReady(url, backendChild, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (backendChild.exitCode !== null) fail('Local QA backend exited before readiness.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // A bounded readiness probe is expected while migrations and startup run.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  fail('Local QA backend readiness deadline expired.');
}

function createApiPrefixProxy(targetPort) {
  const server = http.createServer((request, response) => {
    const sourcePath = request.url ?? '/';
    if (!sourcePath.startsWith('/api/')) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"local_qa_api_prefix_required"}\n');
      return;
    }
    const upstream = http.request({
      host: '127.0.0.1',
      port: targetPort,
      method: request.method,
      path: sourcePath.slice(4),
      headers: { ...request.headers, host: `127.0.0.1:${targetPort}` },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
      response.end('{"error":"local_qa_upstream_unavailable"}\n');
    });
    request.pipe(upstream);
  });
  return server;
}

async function listenLoopback(server, port) {
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolvePromise);
  });
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolvePromise, reject) => {
    let forceTimer;
    let failureTimer;
    const finish = (error) => {
      clearTimeout(forceTimer);
      clearTimeout(failureTimer);
      if (error) reject(error);
      else resolvePromise();
    };
    server.close(finish);
    server.closeIdleConnections?.();
    forceTimer = setTimeout(() => {
      server.closeAllConnections?.();
      failureTimer = setTimeout(
        () => finish(new Error('Local QA API proxy termination deadline expired.')),
        5_000,
      );
    }, 12_000);
  });
}

function writeSyntheticSession({ email, password, accounts, cloneManifest }) {
  const directory = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'android',
    'live-r3',
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = resolve(directory, 'session.json');
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY
        | constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail('A previous local QA session manifest still exists.');
    }
    fail('Transient local QA session manifest could not be created securely.');
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-android-local-qa-transient-session',
    synthetic: true,
    apiBaseUrl: `http://127.0.0.1:${publicPort}/api/v1`,
    email,
    password,
    accounts,
    transientCredentialsOwnerOnly: true,
    syntheticClone: { ...cloneManifest, enabled: true },
    createdAt: new Date().toISOString(),
    })}\n`);
  } catch {
    rmSync(path, { force: true });
    fail('Transient local QA session manifest could not be written.');
  } finally {
    closeSync(descriptor);
  }
  return path;
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
  const backendRoot = resolve(repositoryRoot, 'backend');
  const postgresBin = await resolvePostgresBinDir();
  const pg = (name) => resolve(postgresBin, name);
  const runRoot = mkdtempSync(join(tmpdir(), tempPrefix));
  chmodSync(runRoot, 0o700);
  const dataDirectory = resolve(runRoot, 'postgres');
  const uploadDirectory = resolve(runRoot, 'uploads');
  mkdirSync(uploadDirectory, { mode: 0o700 });
  const postgresLog = resolve(runRoot, 'postgres.log');
  const backendLog = resolve(runRoot, 'backend.log');
  const postgresPort = await findAvailableLoopbackPort();
  const backendPort = await findAvailableLoopbackPort();
  let backendChild;
  let proxy;
  let postgresStarted = false;
  let sessionPath;
  let cloneCleanupToken;
  let device;
  let logDescriptor;
  let primaryError;

  try {
    await run(pg('initdb'), [
      '-D', dataDirectory,
      '--no-locale',
      '--encoding=UTF8',
      '--username', databaseUser,
      '--auth-local=reject',
      '--auth-host=trust',
    ], { cwd: repositoryRoot });
    postgresStarted = true;
    await run(pg('pg_ctl'), [
      '-D', dataDirectory,
      '-l', postgresLog,
      '-w',
      '-t', '15',
      '-o', `-h 127.0.0.1 -p ${postgresPort} -c unix_socket_directories=`,
      'start',
    ], { cwd: repositoryRoot });
    await run(pg('createdb'), [
      '-h', '127.0.0.1',
      '-p', String(postgresPort),
      '-U', databaseUser,
      databaseName,
    ], { cwd: repositoryRoot });

    const ownerEmail = `r3-owner-${crypto.randomBytes(8).toString('hex')}@example.invalid`;
    const renterEmail = `r3-renter-${crypto.randomBytes(8).toString('hex')}@example.invalid`;
    const ownerPassword = `Qa${crypto.randomBytes(18).toString('hex')}9!`;
    const renterPassword = `Qa${crypto.randomBytes(18).toString('hex')}9!`;
    const email = ownerEmail;
    const password = ownerPassword;
    const cloneRunId = `wp255-${new Date().toISOString().replace(/[-:TZ.]/gu, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
    const cloneDatasetId = `wp255-green-clone-${crypto.randomBytes(6).toString('hex')}`;
    const cloneConfirmationSecret = crypto.randomBytes(48).toString('base64url');
    const backendEnvironment = {
      ...process.env,
      NODE_ENV: 'test',
      DEPLOYMENT_ENVIRONMENT: 'test',
      BIND_HOST: '127.0.0.1',
      PORT: String(backendPort),
      DATABASE_URL:
        `postgresql://${databaseUser}@127.0.0.1:${postgresPort}/${databaseName}`,
      JWT_SECRET: crypto.randomBytes(48).toString('hex'),
      CORS_ORIGINS: '',
      PUBLIC_BASE_URL: `http://127.0.0.1:${publicPort}/api/v1`,
      APP_PUBLIC_URL: `http://127.0.0.1:${publicPort}`,
      UPLOAD_DIR: uploadDirectory,
      MAIL_TRANSPORT: 'memory',
      PUSH_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory',
      STRIPE_LIVEMODE: 'false',
      BOOKING_PILOT_MODE: 'pilot',
      PRIVATE_PILOT_V4_ENABLED: 'false',
      PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn_wave0',
      BOOKING_GROUPS_ENABLED: 'true',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'true',
      LISTING_SUPPLY_ENRICHMENT_ENABLED: 'true',
      LISTING_SETS_ENABLED: 'true',
      SIT_LISTING_AI_PROVIDER: 'mock',
      SIT_LISTING_AI_MODEL: 'listing-ai-mock-v1',
      SIT_LISTING_AI_BUDGET_CENTS: '0',
      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
      SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true',
      FIREBASE_AUTH_ENABLED: 'false',
      FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
      FIREBASE_CRASH_REPORT_DELETION_ENABLED: '0',
      APPLE_REVOCATION_ENABLED: '0',
      PUBLIC_COMPLIANCE_APPROVED: 'false',
      FINANCIAL_DOCUMENTS_LIVE_ISSUANCE_APPROVED: 'false',
      // Local QA must exercise the server-authoritative MFA and identity
      // flows without relying on a developer shell's ambient configuration.
      // The key is generated per process, never logged or persisted.
      MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64url'),
      IDENTITY_VERIFICATION_TRANSPORT: 'memory',
      TECHNICAL_SANDBOX_ENABLED: '0',
      TECHNICAL_SANDBOX_KILL_SWITCH: '1',
      SIT_STAGING_ACCESS_GATE_ENABLED: 'false',
      SIT_STAGING_ALLOWED_USER_IDS: '',
      SIT_SYNTHETIC_CLONE_BOOKING_LANE: '0',
    };
    logDescriptor = openSync(backendLog, 'a', 0o600);
    const startBackend = (environment) => spawn(process.execPath, ['src/server.js'], {
        cwd: backendRoot,
        env: environment,
        stdio: ['ignore', logDescriptor, logDescriptor],
      });
    backendChild = startBackend(backendEnvironment);
    await waitForReady(`http://127.0.0.1:${backendPort}/health/ready`, backendChild);
    const registerAccount = async ({ accountEmail, accountPassword, displayName }) => {
      const registration = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: accountEmail,
          password: accountPassword,
          displayName,
          termsAccepted: true,
          privacyAccepted: true,
          minimumAgeConfirmed: true,
          privateUseConfirmed: true,
          registrationActionLabel: 'Kostenlos registrieren',
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (registration.status !== 202) fail('Synthetic local QA registration failed.');
    };
    await registerAccount({ accountEmail: ownerEmail, accountPassword: ownerPassword, displayName: 'SIT R3 Synthetic Owner' });
    await registerAccount({ accountEmail: renterEmail, accountPassword: renterPassword, displayName: 'SIT R3 Synthetic Renter' });
    await run(pg('psql'), [
      '-h', '127.0.0.1',
      '-p', String(postgresPort),
      '-U', databaseUser,
      '-d', databaseName,
      '-v', 'ON_ERROR_STOP=1',
      '-c', `UPDATE users SET email_verified_at = now(), profile = jsonb_set(profile, '{emailVerified}', 'true'::jsonb) WHERE email IN ('${ownerEmail}', '${renterEmail}');`,
    ], { cwd: repositoryRoot });
    const loginAccount = async ({ accountEmail, accountPassword }) => {
      const response = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: accountEmail, password: accountPassword }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) fail(`Synthetic local QA login failed for ${accountEmail}.`);
      const session = await response.json();
      if (!session.accessToken) fail(`Synthetic local QA access token missing for ${accountEmail}.`);
      const me = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/me`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!me.ok) fail(`Synthetic local QA /auth/me failed for ${accountEmail}.`);
      const user = (await me.json()).user;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(user?.id ?? '')) {
        fail(`Synthetic local QA /auth/me did not return a UUID for ${accountEmail}.`);
      }
      return { email: accountEmail, password: accountPassword, userId: user.id, accessToken: session.accessToken };
    };
    const ownerAccount = await loginAccount({ accountEmail: ownerEmail, accountPassword: ownerPassword });
    const renterAccount = await loginAccount({ accountEmail: renterEmail, accountPassword: renterPassword });
    if (ownerAccount.userId === renterAccount.userId) fail('Synthetic local QA owner and renter IDs must be distinct.');

    await terminateChild(backendChild);
    backendChild = undefined;
    const cloneEnvironment = {
      ...backendEnvironment,
      SIT_SYNTHETIC_CLONE_BOOKING_LANE: '1',
      SIT_SYNTHETIC_CLONE_OWNER_ID: ownerAccount.userId,
      SIT_SYNTHETIC_CLONE_RENTER_ID: renterAccount.userId,
      SIT_SYNTHETIC_DATASET_ID: cloneDatasetId,
      SIT_SYNTHETIC_CLONE_RUN_ID: cloneRunId,
      SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET: cloneConfirmationSecret,
    };
    backendChild = startBackend(cloneEnvironment);
    await waitForReady(`http://127.0.0.1:${backendPort}/health/ready`, backendChild);
    const cloneStatusResponse = await fetch(`http://127.0.0.1:${backendPort}/v1/synthetic-clone/status`, {
      headers: { authorization: `Bearer ${ownerAccount.accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!cloneStatusResponse.ok) fail('Synthetic local QA clone status readback failed.');
    const cloneStatus = await cloneStatusResponse.json();
    if (cloneStatus.principals.ownerId !== ownerAccount.userId
        || cloneStatus.principals.renterId !== renterAccount.userId
        || cloneStatus.cleaned !== false) {
      fail('Synthetic local QA clone status principal binding is invalid.');
    }
    cloneCleanupToken = ownerAccount.accessToken;
    sessionPath = writeSyntheticSession({
      email,
      password,
      accounts: [ownerAccount, renterAccount].map(({ accessToken: _accessToken, ...account }) => account),
      cloneManifest: {
        runId: cloneRunId,
        datasetId: cloneDatasetId,
        ownerId: ownerAccount.userId,
        renterId: renterAccount.userId,
        listingId: 'synthetic_clone_listing_wp255',
        routePrefix: '/api/v1/synthetic-clone',
        marker: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
      },
    });

    const devices = parseAdbDevices(String(await run('adb', ['devices', '-l'], {
      cwd: repositoryRoot,
    }).then((value) => value.stdout)));
    device = selectSinglePhysicalDevice(devices);
    const deviceSummary = inspectPhysicalDevice({ device });
    await run('adb', [
      '-s', device.serial,
      'reverse',
      `tcp:${publicPort}`,
      `tcp:${publicPort}`,
    ], { cwd: repositoryRoot });
    proxy = createApiPrefixProxy(backendPort);
    await listenLoopback(proxy, publicPort);

    process.stdout.write(`${JSON.stringify({
      status: 'ready-local-qa-only',
      postgresMajor: 16,
      apiBinding: 'loopback-adb-reverse-only',
      apiPrefix: '/api/v1',
      syntheticAccountSeeded: true,
      syntheticAccounts: 2,
      syntheticClone: {
        enabled: true,
        runId: cloneRunId,
        datasetId: cloneDatasetId,
        ownerId: ownerAccount.userId,
        renterId: renterAccount.userId,
        listingId: 'synthetic_clone_listing_wp255',
        routePrefix: '/api/v1/synthetic-clone',
        marker: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
        sideEffects: cloneStatus.sideEffects,
      },
      transientCredentialsOwnerOnly: true,
      listingAiProvider: 'mock',
      listingAiBudgetCents: 0,
      g3G4G5TechnicalOnly: true,
      physicalDevice: deviceSummary,
      production: false,
      cloud: false,
      payment: 'memory-no-real-money',
      store: false,
      containsCredentials: false,
      containsPrivateFilesystemPaths: false,
    })}\n`);
    await Promise.race([
      waitForSignal(),
      waitForUnexpectedExit(backendChild),
    ]);
  } catch (error) {
    primaryError = error;
  } finally {
    if (backendChild && cloneCleanupToken) {
      try {
        const cleanupResponse = await fetch(`http://127.0.0.1:${backendPort}/v1/synthetic-clone/bookings`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${cloneCleanupToken}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (!cleanupResponse.ok || (await cleanupResponse.json()).cleanupVerified !== true) {
          primaryError ??= new Error('Synthetic local QA clone cleanup verification failed.');
        }
      } catch {
        primaryError ??= new Error('Synthetic local QA clone cleanup request failed.');
      }
    }
    try {
      if (device) {
        await run('adb', [
          '-s', device.serial,
          'reverse',
          '--remove',
          `tcp:${publicPort}`,
        ], { cwd: repositoryRoot });
      }
    } catch {
      primaryError ??= new Error('ADB reverse cleanup failed.');
    }
    try {
      if (proxy) await closeServer(proxy);
    } catch {
      primaryError ??= new Error('Local QA API proxy cleanup failed.');
    }
    if (backendChild) {
      try {
        await terminateChild(backendChild);
      } catch {
        primaryError ??= new Error('Local QA backend cleanup failed.');
      }
    }
    if (logDescriptor !== undefined) closeSync(logDescriptor);
    if (postgresStarted) {
      try {
        await run(pg('pg_ctl'), [
          '-D', dataDirectory,
          '-w',
          '-t', '15',
          '-m', 'fast',
          'stop',
        ], { cwd: repositoryRoot });
      } catch {
        primaryError ??= new Error('Ephemeral PostgreSQL cleanup failed.');
      }
    }
    if (sessionPath) rmSync(sessionPath, { force: true });
    rmSync(runRoot, { recursive: true, force: true });
  }
  if (primaryError) throw primaryError;
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Android local QA backend failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
