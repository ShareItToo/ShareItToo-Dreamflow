#!/usr/bin/env node

/**
 * Starts the existing synthetic clone lane for a local Flutter Web browser.
 * The frontend/API origin is loopback-only; the backend uses an ephemeral
 * PostgreSQL database and process-local clone state. No Android/ADB actions.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdtemp, stat as statFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  findAvailableLoopbackPort,
  resolvePostgresBinDir,
} from './run_local_postgres_integration.mjs';

export const WEB_CLONE_ORIGIN = 'http://127.0.0.1:18080';
export const WEB_CLONE_PRIVATE_PILOT_ALLOWED_REGIONS = 'heilbronn';
const API_PREFIX = '/api/';
const RUN_PREFIX = 'sit-web-clone-';
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export async function getFreshWebCloneCleanupToken({ login, readUserId, expectedUserId } = {}) {
  if (typeof login !== 'function' || typeof readUserId !== 'function'
      || typeof expectedUserId !== 'string' || expectedUserId.length === 0) {
    fail('web_clone_cleanup_owner_input_invalid');
  }
  const token = await login();
  if (typeof token !== 'string' || token.length < 16
      || await readUserId(token) !== expectedUserId) {
    fail('web_clone_cleanup_owner_mismatch');
  }
  return token;
}

export function validateLocalWebOrigin(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value
      || value === '*' || value.includes(',')) fail('web_clone_origin_invalid');
  let url;
  try { url = new URL(value); } catch { fail('web_clone_origin_invalid'); }
  if (!['http:', 'https:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase())
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || url.origin !== value) fail('web_clone_origin_loopback_required');
  return value;
}

export function resolveWebCloneSyntheticPaymentFlag(value) {
  const flag = value ?? '0';
  if (!['0', '1'].includes(flag)) fail('web_clone_synthetic_payment_flag_invalid');
  return flag;
}

export function assertLocalWebCloneBuildSource(source) {
  if (typeof source !== 'string'
      || !source.includes(`${WEB_CLONE_ORIGIN}/api/v1`)
      || source.includes('https://shareittoo.com/api/v1')) {
    fail('web_clone_web_build_api_origin_mismatch');
  }
  return true;
}

export function assertWebCloneEnvironment(env, { origin = WEB_CLONE_ORIGIN } = {}) {
  validateLocalWebOrigin(origin);
  const paymentFlag = resolveWebCloneSyntheticPaymentFlag(
    env?.SIT_WEB_CLONE_SYNTHETIC_PAYMENT,
  );
  const guards = {
    NODE_ENV: 'test', DEPLOYMENT_ENVIRONMENT: 'test', BIND_HOST: '127.0.0.1',
    BOOKING_PILOT_MODE: 'pilot', PRIVATE_PILOT_V4_ENABLED: 'true',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_SYNTHETIC_CLONE_BOOKING_LANE: '1',
    SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'false',
    TECHNICAL_SANDBOX_ENABLED: '0', TECHNICAL_SANDBOX_KILL_SWITCH: '1',
  };
  for (const [key, expected] of Object.entries(guards)) {
    if (env?.[key] !== expected) fail('web_clone_environment_guard_failed');
  }
  if (env.SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE !== paymentFlag
      || env.CORS_ORIGINS !== origin || env.SIT_LISTING_AI_PROVIDER !== 'mock'
      || env.PRIVATE_PILOT_ALLOWED_REGIONS !== WEB_CLONE_PRIVATE_PILOT_ALLOWED_REGIONS
      || env.MAIL_TRANSPORT !== 'memory' || env.PUSH_TRANSPORT !== 'memory'
      || env.IDENTITY_VERIFICATION_TRANSPORT !== 'memory'
      || env.SIT_SYNTHETIC_TARGET_KIND !== 'clone'
      || env.FIREBASE_AUTH_ENABLED !== 'false'
      || env.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || !/^wp255-green-clone-[a-z0-9-]+$/u.test(env.SIT_SYNTHETIC_DATASET_ID ?? '')
      || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(env.SIT_SYNTHETIC_CLONE_RUN_ID ?? '')
      || typeof env.SIT_SYNTHETIC_CLONE_OWNER_ID !== 'string'
      || typeof env.SIT_SYNTHETIC_CLONE_RENTER_ID !== 'string'
      || env.SIT_SYNTHETIC_CLONE_OWNER_ID === env.SIT_SYNTHETIC_CLONE_RENTER_ID
      || typeof env.SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET !== 'string'
      || env.SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET.length < 32) {
    fail('web_clone_environment_guard_failed');
  }
  return true;
}

export function safeStaticPath(root, requestPath) {
  if (typeof requestPath !== 'string' || /%(?:2e|2f|5c)/iu.test(requestPath)
      || requestPath.split(/[?#]/u, 1)[0].split('/').includes('..')) {
    fail('web_clone_static_path_invalid');
  }
  let decoded;
  try { decoded = decodeURIComponent(new URL(requestPath, 'http://127.0.0.1').pathname); }
  catch { fail('web_clone_static_path_invalid'); }
  const target = resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) fail('web_clone_static_path_invalid');
  return target;
}

export function webCloneProxyAccessRecord(method, requestPath, status) {
  const path = typeof requestPath === 'string' ? requestPath.split(/[?#]/u, 1)[0] : '';
  return { event: 'web_clone_proxy_access', method, path, status };
}

const SYNTHETIC_HEILBRONN_PLACE_ID = 'sit-synthetic-heilbronn-v1';
const SYNTHETIC_HEILBRONN_AUTOCOMPLETE_INPUTS = new Set([
  'Heilbronn',
  'Heilbronn Hauptbahnhof',
]);

/**
 * Local-only Maps fixture for listing creation. Every Maps request is handled
 * here (including denied/unknown requests), so this browser clone never calls
 * the production Maps proxy or an external provider.
 */
export async function resolveWebCloneMapsFixture({
  method, requestPath, authorization, ownerToken, renterToken,
  isBoundPrincipalToken,
}) {
  let parsed;
  try { parsed = new URL(requestPath, WEB_CLONE_ORIGIN); } catch { return null; }
  if (parsed.pathname !== '/api/v1/maps/places/autocomplete'
      && !parsed.pathname.startsWith('/api/v1/maps/places/')) return null;

  const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length) : '';
  const authorized = bearer.length > 0 && (
    [ownerToken, renterToken].some((token) => typeof token === 'string'
      && token.length > 0 && bearer === token)
    || (typeof isBoundPrincipalToken === 'function'
      && await isBoundPrincipalToken(bearer))
  );
  if (!authorized) return { status: 401, body: { error: 'unauthorized' } };
  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };

  if (parsed.pathname === '/api/v1/maps/places/autocomplete'
      && parsed.searchParams.size === 3
      && SYNTHETIC_HEILBRONN_AUTOCOMPLETE_INPUTS.has(parsed.searchParams.get('input'))
      && parsed.searchParams.get('language') === 'de'
      && parsed.searchParams.get('country') === 'de') {
    return { status: 200, body: { suggestions: [{
      description: 'Heilbronn, Deutschland', placeId: SYNTHETIC_HEILBRONN_PLACE_ID,
    }] } };
  }
  if (parsed.pathname === `/api/v1/maps/places/${SYNTHETIC_HEILBRONN_PLACE_ID}`
      && parsed.searchParams.size === 1
      && parsed.searchParams.get('language') === 'de') {
    return { status: 200, body: { place: {
      placeId: SYNTHETIC_HEILBRONN_PLACE_ID,
      formattedAddress: 'Heilbronn, Deutschland',
      lat: 49.1427, lng: 9.2109,
    } } };
  }
  return { status: 404, body: { error: 'synthetic_place_not_found' } };
}

export function isAllowedWebCloneRealtimeUpgrade(requestPath, requestOrigin, origin = WEB_CLONE_ORIGIN) {
  validateLocalWebOrigin(origin);
  let path;
  try { path = new URL(requestPath, origin).pathname; }
  catch { return false; }
  return path === '/api/v1/realtime' && requestOrigin === origin;
}

function run(command, args, { cwd, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command.split('/').at(-1)} failed (${code ?? signal}). ${stderr.trim().slice(-1000)}`));
    });
  });
}

function spawnBackend({ backendRoot, env, logDescriptor }) {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot, env, detached: true,
    stdio: ['ignore', logDescriptor, logDescriptor],
  });
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.off('close', onClose);
      resolvePromise(false);
    }, timeoutMs);
    const onClose = () => { clearTimeout(timer); resolvePromise(true); };
    child.once('close', onClose);
  });
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForClose(child, 12_000)) return;
  child.kill('SIGKILL');
  if (!(await waitForClose(child, 5_000))) fail('web_clone_backend_stop_timeout');
}

async function waitReady(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail('web_clone_backend_exited_before_ready');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* bounded readiness retry while migrations run */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  fail('web_clone_backend_readiness_timeout');
}

function createWebCloneServer({
  origin, backendPort, webRoot, ownerToken, renterToken, ownerId, renterId,
}) {
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    const requestPath = request.url ?? '/';
    if (requestPath.startsWith(API_PREFIX)) {
      const mapsFixture = await resolveWebCloneMapsFixture({
        method: request.method, requestPath,
        authorization: request.headers.authorization,
        ownerToken, renterToken,
        isBoundPrincipalToken: async (token) => {
          try {
            const principalResponse = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/me`, {
              headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2_000),
            });
            if (!principalResponse.ok) return false;
            const principal = await principalResponse.json();
            return [ownerId, renterId].includes(principal.user?.id);
          } catch { return false; }
        },
      });
      if (mapsFixture) {
        process.stdout.write(`${JSON.stringify(webCloneProxyAccessRecord(
          request.method, requestPath.slice('/api'.length), mapsFixture.status,
        ))}\n`);
        response.writeHead(mapsFixture.status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        response.end(`${JSON.stringify(mapsFixture.body)}\n`);
        return;
      }
      const upstreamPath = requestPath.slice('/api'.length);
      const upstream = http.request({
        host: '127.0.0.1', port: backendPort, method: request.method,
        path: upstreamPath, headers: { ...request.headers, host: `127.0.0.1:${backendPort}` },
      }, (upstreamResponse) => {
        process.stdout.write(`${JSON.stringify(webCloneProxyAccessRecord(
          request.method, upstreamPath, upstreamResponse.statusCode ?? 502,
        ))}\n`);
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
        response.end('{"error":"local_web_clone_upstream_unavailable"}\n');
      });
      request.pipe(upstream);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let filePath;
    try { filePath = safeStaticPath(webRoot, requestPath); }
    catch {
      response.writeHead(400);
      response.end();
      return;
    }
    try {
      const info = await statFile(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
      const bodyStat = await statFile(filePath);
      if (!bodyStat.isFile()) throw new Error('not_file');
    } catch {
      // Flutter path routes share the app shell; missing assets remain 404.
      if (extname(filePath)) {
        response.writeHead(404);
        response.end();
        return;
      }
      filePath = join(webRoot, 'index.html');
    }
    const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      'content-type': type, 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self' data: blob:; connect-src 'self' blob: ws://127.0.0.1:18080; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    });
    if (request.method === 'HEAD') { response.end(); return; }
    createReadStream(filePath).pipe(response);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (request, clientSocket, head) => {
    if (!isAllowedWebCloneRealtimeUpgrade(request.url ?? '/', request.headers.origin, origin)) {
      process.stdout.write(`${JSON.stringify(webCloneProxyAccessRecord(request.method, request.url ?? '/', 403))}\n`);
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const handshakeHeaders = {
      host: `127.0.0.1:${backendPort}`,
      connection: 'Upgrade', upgrade: 'websocket',
      origin,
      'sec-websocket-key': request.headers['sec-websocket-key'],
      'sec-websocket-version': request.headers['sec-websocket-version'],
    };
    if (typeof request.headers['sec-websocket-extensions'] === 'string') {
      handshakeHeaders['sec-websocket-extensions'] = request.headers['sec-websocket-extensions'];
    }
    const upstream = http.request({ host: '127.0.0.1', port: backendPort,
      method: 'GET', path: '/v1/realtime', headers: handshakeHeaders });
    upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
      process.stdout.write(`${JSON.stringify(webCloneProxyAccessRecord(request.method, request.url ?? '/', upstreamResponse.statusCode ?? 101))}\n`);
      clientSocket.write(`HTTP/1.1 ${upstreamResponse.statusCode ?? 101} Switching Protocols\r\n`);
      for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
        clientSocket.write(`${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1]}\r\n`);
      }
      clientSocket.write('\r\n');
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) clientSocket.write(upstreamHead);
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
      sockets.add(clientSocket);
      sockets.add(upstreamSocket);
      clientSocket.on('error', () => upstreamSocket.destroy());
      upstreamSocket.on('error', () => clientSocket.destroy());
      clientSocket.on('close', () => { sockets.delete(clientSocket); upstreamSocket.destroy(); });
      upstreamSocket.on('close', () => { sockets.delete(upstreamSocket); clientSocket.destroy(); });
    });
    upstream.on('response', (upstreamResponse) => {
      process.stdout.write(`${JSON.stringify(webCloneProxyAccessRecord(request.method, request.url ?? '/', upstreamResponse.statusCode ?? 502))}\n`);
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
    upstream.on('error', () => {
      process.stdout.write(`${JSON.stringify(webCloneProxyAccessRecord(request.method, request.url ?? '/', 502))}\n`);
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
    upstream.end();
  });
  server.syntheticCloneSockets = sockets;
  return server;
}

function listenLoopback(server, port) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    for (const socket of server.syntheticCloneSockets ?? []) socket.destroy();
  });
}

function secureSession({ runRoot, owner, renter, runId, datasetId }) {
  const path = join(runRoot, 'synthetic-session.json');
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify({
      synthetic: true, containsProductionCredentials: false,
      runId, datasetId, origin: WEB_CLONE_ORIGIN,
      accounts: [owner, renter],
      marker: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
    })}\n`);
  } finally { closeSync(descriptor); }
  return path;
}

export async function startLocalWebClone({ origin = WEB_CLONE_ORIGIN, webRoot } = {}) {
  validateLocalWebOrigin(origin);
  if (new URL(origin).protocol !== 'http:' || origin !== WEB_CLONE_ORIGIN) fail('web_clone_origin_must_match_compiled_loopback_api');
  const syntheticPaymentFlag = resolveWebCloneSyntheticPaymentFlag(
    process.env.SIT_WEB_CLONE_SYNTHETIC_PAYMENT,
  );
  const root = resolve(webRoot ?? process.env.SIT_WEB_BUILD_DIR ?? '');
  if (!webRoot && !process.env.SIT_WEB_BUILD_DIR) fail('web_clone_web_build_dir_required');
  if (!(await statFile(join(root, 'index.html')).catch(() => null))?.isFile()) fail('web_clone_web_build_invalid');
  let compiledWebSource;
  try { compiledWebSource = readFileSync(join(root, 'main.dart.js'), 'utf8'); }
  catch { fail('web_clone_web_build_invalid'); }
  assertLocalWebCloneBuildSource(compiledWebSource);
  const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
  const backendRoot = join(repositoryRoot, 'backend');
  const pgBin = await resolvePostgresBinDir();
  const pg = (name) => join(pgBin, name);
  const runRoot = await mkdtemp(join(tmpdir(), RUN_PREFIX));
  chmodSync(runRoot, 0o700);
  const dataDirectory = join(runRoot, 'postgres');
  const uploadDirectory = join(runRoot, 'uploads');
  mkdirSync(uploadDirectory, { mode: 0o700 });
  const pgLog = join(runRoot, 'postgres.log');
  const backendLog = join(runRoot, 'backend.log');
  const pgPort = await findAvailableLoopbackPort();
  const backendPort = await findAvailableLoopbackPort();
  const runId = `wp255-${new Date().toISOString().replace(/[-:TZ.]/gu, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
  const datasetId = `wp255-green-clone-${crypto.randomBytes(6).toString('hex')}`;
  const dbName = `sit_web_${crypto.randomBytes(6).toString('hex')}`;
  const dbUser = `sit_web_${crypto.randomBytes(4).toString('hex')}`;
  const jwtSecret = crypto.randomBytes(48).toString('hex');
  const cloneSecret = crypto.randomBytes(48).toString('base64url');
  const owner = {
    email: `wp255-owner-${crypto.randomBytes(8).toString('hex')}@example.invalid`,
    password: `Qa${crypto.randomBytes(18).toString('hex')}9!`, displayName: 'WP255 Synthetic Owner',
  };
  const renter = {
    email: `wp255-renter-${crypto.randomBytes(8).toString('hex')}@example.invalid`,
    password: `Qa${crypto.randomBytes(18).toString('hex')}9!`, displayName: 'WP255 Synthetic Renter',
  };
  let postgresStarted = false;
  let backend;
  let apiUiServer;
  let backendLogFd;
  let primaryError;
  let cleanupSummary;
  const pgEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    LC_ALL: 'C', PGUSER: dbUser, PGPASSWORD: '',
  };
  try {
    await run(pg('initdb'), ['-D', dataDirectory, '--no-locale', '--encoding=UTF8', `--username=${dbUser}`, '--auth-local=reject', '--auth-host=trust'], { cwd: repositoryRoot, env: pgEnv });
    postgresStarted = true;
    await run(pg('pg_ctl'), ['-D', dataDirectory, '-l', pgLog, '-w', '-t', '15', '-o', `-h 127.0.0.1 -p ${pgPort} -c unix_socket_directories=`, 'start'], { cwd: repositoryRoot, env: pgEnv });
    await run(pg('createdb'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, dbName], { cwd: repositoryRoot, env: pgEnv });
    const databaseUrl = `postgresql://${dbUser}@127.0.0.1:${pgPort}/${dbName}`;
    const baseEnvironment = {
      PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NODE_ENV: 'test', DEPLOYMENT_ENVIRONMENT: 'test', BIND_HOST: '127.0.0.1',
      PORT: String(backendPort), DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret,
      CORS_ORIGINS: origin, PUBLIC_BASE_URL: `${origin}/api/v1`, APP_PUBLIC_URL: origin,
      UPLOAD_DIR: uploadDirectory, MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', BOOKING_PILOT_MODE: 'pilot',
      PRIVATE_PILOT_V4_ENABLED: 'false', SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: '0',
      SIT_WEB_CLONE_SYNTHETIC_PAYMENT: syntheticPaymentFlag,
      PRIVATE_PILOT_ALLOWED_REGIONS: WEB_CLONE_PRIVATE_PILOT_ALLOWED_REGIONS,
      FIREBASE_AUTH_ENABLED: 'false',
      FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
      MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64url'),
      SIT_LISTING_AI_PROVIDER: 'mock', SIT_LISTING_AI_MODEL: 'listing-ai-mock-v1',
      SIT_LISTING_AI_BUDGET_CENTS: '0', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
      SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'false', TECHNICAL_SANDBOX_ENABLED: '0',
      TECHNICAL_SANDBOX_KILL_SWITCH: '1', SIT_STAGING_ACCESS_GATE_ENABLED: 'false',
      SIT_STAGING_ALLOWED_USER_IDS: '', SIT_SYNTHETIC_CLONE_BOOKING_LANE: '0',
    };
    backendLogFd = openSync(backendLog, 'a', 0o600);
    const startAndReady = async (env) => {
      const child = spawnBackend({ backendRoot, env, logDescriptor: backendLogFd });
      try {
        await waitReady(`http://127.0.0.1:${backendPort}/health/ready`, child);
      } catch (error) {
        await stopBackend(child).catch(() => {});
        throw error;
      }
      return child;
    };
    backend = await startAndReady(baseEnvironment);
    async function register(account) {
      const response = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password,
          displayName: account.displayName, termsAccepted: true, privacyAccepted: true,
          minimumAgeConfirmed: true, privateUseConfirmed: true,
          registrationActionLabel: 'Kostenlos registrieren' }),
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status !== 202) fail('web_clone_synthetic_account_setup_failed');
    }
    await register(owner);
    await register(renter);
    await run(pg('psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName,
      '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE users SET email_verified_at = now(), profile = jsonb_set(profile, '{emailVerified}', 'true'::jsonb) WHERE email LIKE 'wp255-%@example.invalid';"],
    { cwd: repositoryRoot, env: pgEnv });
    const login = async (account) => {
      const response = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) fail('web_clone_synthetic_account_login_failed');
      const { accessToken } = await response.json();
      if (typeof accessToken !== 'string' || accessToken.length < 16) fail('web_clone_synthetic_account_token_missing');
      return accessToken;
    };
    const ownerToken = await login(owner);
    const renterToken = await login(renter);
    const me = async (token) => {
      const response = await fetch(`http://127.0.0.1:${backendPort}/v1/auth/me`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) fail('web_clone_synthetic_principal_readback_failed');
      return (await response.json()).user?.id;
    };
    const ownerId = await me(ownerToken);
    const renterId = await me(renterToken);
    if (!ownerId || !renterId || ownerId === renterId) fail('web_clone_synthetic_principals_invalid');
    await stopBackend(backend);
    backend = undefined;
    const cloneEnvironment = {
      ...baseEnvironment, PRIVATE_PILOT_V4_ENABLED: 'true',
      SIT_SYNTHETIC_CLONE_BOOKING_LANE: '1', SIT_SYNTHETIC_TARGET_KIND: 'clone',
      SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: syntheticPaymentFlag,
      SIT_SYNTHETIC_DATASET_ID: datasetId, SIT_SYNTHETIC_CLONE_RUN_ID: runId,
      SIT_SYNTHETIC_CLONE_OWNER_ID: ownerId, SIT_SYNTHETIC_CLONE_RENTER_ID: renterId,
      SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET: cloneSecret,
    };
    assertWebCloneEnvironment(cloneEnvironment, { origin });
    backend = await startAndReady(cloneEnvironment);
    const statusResponse = await fetch(`http://127.0.0.1:${backendPort}/v1/synthetic-clone/status`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    if (!statusResponse.ok) fail('web_clone_lane_status_failed');
    const laneStatus = await statusResponse.json();
    if (laneStatus.principals?.ownerId !== ownerId || laneStatus.principals?.renterId !== renterId || laneStatus.cleaned !== false) {
      fail('web_clone_lane_principal_binding_failed');
    }
    if (syntheticPaymentFlag === '1'
        ? laneStatus.paymentTest?.enabled !== true
        : laneStatus.paymentTest !== undefined) {
      fail('web_clone_synthetic_payment_readback_invalid');
    }
    const sessionPath = secureSession({ runRoot, owner: { ...owner, id: ownerId }, renter: { ...renter, id: renterId }, runId, datasetId });
    apiUiServer = createWebCloneServer({
      origin, backendPort, webRoot: root, ownerToken, renterToken, ownerId, renterId,
    });
    await listenLoopback(apiUiServer, 18080);
    const ready = {
      status: 'ready-loopback-web-clone', origin, apiBaseUrl: `${origin}/api/v1`,
      backendBinding: '127.0.0.1', database: 'ephemeral-postgresql',
      payments: {
        transport: 'memory', livemode: false,
        syntheticPaymentLane: syntheticPaymentFlag === '1',
      },
      listingAi: { provider: 'mock', externalExecution: false },
      stageANonBindingPilot: true, syntheticPrincipals: 2,
      datasetId, runId, sessionManifest: sessionPath,
      warning: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
    };
    process.stdout.write(`${JSON.stringify(ready)}\n`);
    const waitForSignal = () => new Promise((resolvePromise) => {
      process.once('SIGINT', () => resolvePromise('SIGINT'));
      process.once('SIGTERM', () => resolvePromise('SIGTERM'));
    });
    await Promise.race([waitForSignal(), new Promise((_, reject) => backend.once('close', () => reject(new Error('web_clone_backend_unexpected_exit'))))]);
    const cleanupOwnerToken = await getFreshWebCloneCleanupToken({
      login: () => login(owner), readUserId: me, expectedUserId: ownerId,
    });
    const cleanupResponse = await fetch(`http://127.0.0.1:${backendPort}/v1/synthetic-clone/bookings`, {
      method: 'DELETE', headers: { authorization: `Bearer ${cleanupOwnerToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!cleanupResponse.ok) fail('web_clone_cleanup_failed');
    cleanupSummary = await cleanupResponse.json();
    if (cleanupSummary.cleanupVerified !== true || cleanupSummary.remainingResources?.bookings !== 0
        || cleanupSummary.auditRetained !== true || !Array.isArray(cleanupSummary.audit)
        || !cleanupSummary.audit.some((entry) => entry.action === 'synthetic_clone.cleanup_verified')
        || cleanupSummary.auditEventCount !== cleanupSummary.audit.length
        || (syntheticPaymentFlag === '1' && (
          cleanupSummary.paymentTest?.enabled !== false
          || cleanupSummary.paymentTest?.states !== 0
          || cleanupSummary.paymentTest?.commands !== 0
          || cleanupSummary.paymentTest?.auditEvents !== 0
        ))
        || (syntheticPaymentFlag === '0' && cleanupSummary.paymentTest !== undefined)) {
      fail('web_clone_cleanup_readback_invalid');
    }
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      if (apiUiServer) await closeServer(apiUiServer);
    } catch { primaryError ??= new Error('web_clone_ui_server_cleanup_failed'); }
    if (backend) {
      try { await stopBackend(backend); }
      catch { primaryError ??= new Error('web_clone_backend_cleanup_failed'); }
    }
    if (backendLogFd !== undefined) closeSync(backendLogFd);
    if (postgresStarted) {
      try { await run(pg('pg_ctl'), ['-D', dataDirectory, '-w', '-t', '15', '-m', 'fast', 'stop'], { cwd: repositoryRoot, env: pgEnv }); }
      catch { primaryError ??= new Error('web_clone_postgres_cleanup_failed'); }
    }
    rmSync(runRoot, { recursive: true, force: true });
  }
  if (primaryError) throw primaryError;
  return cleanupSummary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startLocalWebClone({ origin: process.env.SIT_WEB_CLONE_ORIGIN ?? WEB_CLONE_ORIGIN })
    .then((result) => process.stdout.write(`${JSON.stringify({ status: 'cleaned', cleanup: result })}\n`))
    .catch((error) => {
      process.stderr.write(`ERROR: ${error?.code ?? error?.message ?? 'web_clone_failed'}\n`);
      process.exitCode = 1;
    });
}
