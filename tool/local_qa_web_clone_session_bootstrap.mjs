import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { WEB_CLONE_ORIGIN, validateLocalWebOrigin } from './run_local_qa_web_clone.mjs';

export const WEB_CLONE_AUTH_SESSION_STORAGE_KEY = 'flutter.auth_session_v1';
const verifiedSessionSeeds = new WeakSet();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function readWebCloneAccountManifest(path, role) {
  if (role !== 'owner' && role !== 'renter') fail('web_clone_session_role_invalid');
  const absolutePath = resolve(path);
  const parentPath = dirname(absolutePath);
  const expectedUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : -1n;
  if (expectedUid < 0n) fail('web_clone_session_manifest_owner_invalid');
  const fileFingerprint = (stat) => [
    stat.dev, stat.ino, stat.uid, stat.nlink, stat.size, stat.mode & 0o777n,
    stat.mtimeNs, stat.ctimeNs,
  ].join(':');
  const readStat = (target, options = { bigint: true }) => {
    try { return lstatSync(target, options); } catch { fail('web_clone_session_manifest_unavailable'); }
  };
  const assertParent = () => {
    const parent = readStat(parentPath);
    if (!parent.isDirectory() || parent.isSymbolicLink()
        || parent.uid !== expectedUid || (parent.mode & 0o777n) !== 0o700n) {
      fail('web_clone_session_manifest_parent_invalid');
    }
    return fileFingerprint(parent);
  };
  const initialParentFingerprint = assertParent();
  const stat = readStat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== expectedUid
      || stat.nlink !== 1n || (stat.mode & 0o777n) !== 0o600n
      || stat.size <= 1n || stat.size > 1_048_576n) {
    fail('web_clone_session_manifest_permissions_invalid');
  }
  let manifest;
  try {
    const descriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = fstatSync(descriptor, { bigint: true });
      if (!opened.isFile() || opened.uid !== expectedUid || opened.nlink !== 1n
          || (opened.mode & 0o777n) !== 0o600n
          || fileFingerprint(opened) !== fileFingerprint(stat)) {
        fail('web_clone_session_manifest_permissions_invalid');
      }
      const raw = readFileSync(descriptor);
      const secondRead = Buffer.alloc(Number(opened.size));
      const secondReadBytes = readSync(descriptor, secondRead, 0, secondRead.length, 0);
      const afterRead = fstatSync(descriptor, { bigint: true });
      const afterPath = readStat(absolutePath);
      if (BigInt(raw.length) !== opened.size || secondReadBytes !== raw.length
          || !raw.equals(secondRead)
          || fileFingerprint(afterRead) !== fileFingerprint(opened)
          || fileFingerprint(afterPath) !== fileFingerprint(opened)
          || assertParent() !== initialParentFingerprint) {
        fail('web_clone_session_manifest_unstable');
      }
      manifest = JSON.parse(raw.toString('utf8'));
    } finally { closeSync(descriptor); }
  } catch (error) {
    if (typeof error?.code === 'string'
        && error.code.startsWith('web_clone_session_manifest_')) throw error;
    fail('web_clone_session_manifest_invalid');
  }
  if (manifest?.synthetic !== true
      || manifest.origin !== WEB_CLONE_ORIGIN
      || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(manifest.runId ?? '')
      || !/^wp255-green-clone-[a-z0-9-]+$/u.test(manifest.datasetId ?? '')
      || manifest.containsProductionCredentials !== false
      || !Array.isArray(manifest.accounts)) {
    fail('web_clone_session_manifest_binding_invalid');
  }
  const suffix = role === 'owner' ? 'Owner' : 'Renter';
  const matches = manifest.accounts.filter((account) =>
    account?.displayName === 'WP255 Synthetic ' + suffix);
  if (matches.length !== 1) fail('web_clone_session_account_binding_invalid');
  const account = matches[0];
  if (!/^[0-9a-f-]{36}$/iu.test(account.id ?? '')
      || !/^wp255-[a-z0-9-]+@example\.invalid$/u.test(account.email ?? '')
      || typeof account.password !== 'string' || account.password.length < 24) {
    fail('web_clone_session_account_binding_invalid');
  }
  return {
    origin: manifest.origin,
    runId: manifest.runId,
    datasetId: manifest.datasetId,
    role,
    id: account.id,
    email: normalizedEmail(account.email),
    password: account.password,
  };
}

export function buildWebCloneAuthSessionSeed({
  authResponse,
  expectedUserId,
  expectedEmail,
  now = new Date(),
}) {
  const user = authResponse?.user;
  const email = normalizedEmail(user?.email);
  const normalizedExpectedEmail = normalizedEmail(expectedEmail);
  const expiresIn = authResponse?.expiresIn ?? 900;
  if (!user || typeof user !== 'object'
      || typeof expectedUserId !== 'string' || expectedUserId.length === 0
      || user.id !== expectedUserId
      || normalizedExpectedEmail.length === 0 || email !== normalizedExpectedEmail
      || typeof authResponse?.accessToken !== 'string' || authResponse.accessToken.length < 16
      || typeof authResponse?.refreshToken !== 'string' || authResponse.refreshToken.length < 16
      || typeof authResponse?.sessionId !== 'string' || authResponse.sessionId.length < 8
      || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)
      || expiresIn < 1 || expiresIn > 86_400
      || !(now instanceof Date) || Number.isNaN(now.valueOf())) {
    fail('web_clone_session_auth_response_invalid');
  }
  const createdAt = typeof user.createdAt === 'string' && !Number.isNaN(Date.parse(user.createdAt))
    ? new Date(user.createdAt) : now;
  const encodedSession = JSON.stringify({
    userId: user.id,
    email,
    createdAt: createdAt.toISOString(),
    accessToken: authResponse.accessToken,
    refreshToken: authResponse.refreshToken,
    sessionId: authResponse.sessionId,
    accessTokenExpiresAt: new Date(now.valueOf() + expiresIn * 1000).toISOString(),
  });
  return Object.freeze({
    origin: WEB_CLONE_ORIGIN,
    storageKey: WEB_CLONE_AUTH_SESSION_STORAGE_KEY,
    encodedSession,
    expectedUserId,
    expectedEmail: normalizedExpectedEmail,
  });
}

export async function acquireBoundWebCloneAuthSession({
  origin = WEB_CLONE_ORIGIN,
  account,
  fetchImpl = fetch,
  now = new Date(),
}) {
  validateLocalWebOrigin(origin);
  if (origin !== WEB_CLONE_ORIGIN || !account || account.origin !== origin
      || !['owner', 'renter'].includes(account.role)
      || typeof account.id !== 'string' || account.id.length === 0
      || !/^wp255-[a-z0-9-]+@example\.invalid$/u.test(account.email ?? '')
      || typeof account.password !== 'string' || account.password.length < 24
      || typeof fetchImpl !== 'function') {
    fail('web_clone_session_account_binding_invalid');
  }
  const loginResponse = await fetchImpl(origin + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!loginResponse.ok) fail('web_clone_session_local_login_failed');
  const authResponse = await loginResponse.json();
  const seed = buildWebCloneAuthSessionSeed({
    authResponse, expectedUserId: account.id, expectedEmail: account.email, now,
  });
  const principalResponse = await fetchImpl(origin + '/api/v1/auth/me', {
    headers: { authorization: 'Bearer ' + authResponse.accessToken },
    signal: AbortSignal.timeout(5_000),
  });
  if (!principalResponse.ok) fail('web_clone_session_principal_readback_failed');
  const principal = (await principalResponse.json())?.user;
  if (principal?.id !== account.id
      || normalizedEmail(principal?.email) !== normalizedEmail(account.email)) {
    fail('web_clone_session_principal_mismatch');
  }
  const verifiedSeed = Object.freeze({ ...seed, origin, role: account.role });
  verifiedSessionSeeds.add(verifiedSeed);
  return verifiedSeed;
}

export function verifyWebCloneAuthSessionReadback({
  expectedOrigin,
  actualOrigin,
  actualValue,
  seed,
}) {
  validateLocalWebOrigin(expectedOrigin);
  if (expectedOrigin !== WEB_CLONE_ORIGIN || actualOrigin !== expectedOrigin
      || typeof actualValue !== 'string' || !seed
      || seed.storageKey !== WEB_CLONE_AUTH_SESSION_STORAGE_KEY) {
    fail('web_clone_session_storage_readback_invalid');
  }
  let actual;
  let expected;
  try {
    actual = JSON.parse(actualValue);
    expected = JSON.parse(seed.encodedSession);
  } catch { fail('web_clone_session_storage_readback_invalid'); }
  if (actualValue !== seed.encodedSession
      || actual?.userId !== seed.expectedUserId
      || normalizedEmail(actual?.email) !== seed.expectedEmail
      || actual?.accessToken !== expected.accessToken
      || actual?.refreshToken !== expected.refreshToken
      || actual?.sessionId !== expected.sessionId) {
    fail('web_clone_session_storage_readback_mismatch');
  }
  return true;
}

export async function installWebCloneAuthSessionSeed({
  seed,
  cdpPort = 9228,
  expectedOrigin = WEB_CLONE_ORIGIN,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket,
}) {
  validateLocalWebOrigin(expectedOrigin);
  if (expectedOrigin !== WEB_CLONE_ORIGIN || !Number.isInteger(cdpPort)
      || cdpPort < 1 || cdpPort > 65_535
      || typeof fetchImpl !== 'function' || typeof WebSocketImpl !== 'function'
      || !seed || !verifiedSessionSeeds.has(seed)
      || seed.origin !== expectedOrigin
      || seed.storageKey !== WEB_CLONE_AUTH_SESSION_STORAGE_KEY) {
    fail('web_clone_session_install_input_invalid');
  }
  const response = await fetchImpl('http://127.0.0.1:' + cdpPort + '/json/list');
  if (!response.ok) fail('web_clone_session_cdp_unavailable');
  const targets = await response.json();
  const matches = targets.filter((target) => {
    if (target?.type !== 'page' || typeof target.url !== 'string') return false;
    try { return new URL(target.url).origin === expectedOrigin; } catch { return false; }
  });
  const wsUrl = matches[0]?.webSocketDebuggerUrl;
  if (matches.length !== 1 || typeof wsUrl !== 'string'
      || !wsUrl.startsWith('ws://127.0.0.1:' + cdpPort + '/')) {
    fail('web_clone_session_browser_target_invalid');
  }
  const socket = new WebSocketImpl(wsUrl);
  let nextId = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(
      new Error('web_clone_session_cdp_connection_failed'),
    ), { once: true });
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    resolve(message);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('web_clone_session_cdp_timeout'));
    }, 5_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  try {
    const expression = '(() => {'
      + 'const origin=' + JSON.stringify(expectedOrigin) + ';'
      + 'const key=' + JSON.stringify(seed.storageKey) + ';'
      + 'const raw=' + JSON.stringify(seed.encodedSession) + ';'
      + 'if(location.origin!==origin)return {originMatches:false};'
      + 'try{localStorage.setItem(key,raw);const value=localStorage.getItem(key);'
      + 'const row=JSON.parse(value);return {originMatches:true,actualValue:value,exactValue:value===raw,'
      + 'userMatches:row.userId===' + JSON.stringify(seed.expectedUserId) + ','
      + 'emailMatches:row.email===' + JSON.stringify(seed.expectedEmail) + '};}'
      + 'catch(_){return {originMatches:true,exactValue:false,userMatches:false,emailMatches:false};}'
      + '})()';
    const result = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    const readback = result?.result?.result?.value;
    if (!readback?.originMatches || !readback.exactValue
        || !readback.userMatches || !readback.emailMatches) {
      const rollback = '(() => {const key=' + JSON.stringify(seed.storageKey)
        + ';const raw=' + JSON.stringify(seed.encodedSession)
        + ';if(localStorage.getItem(key)===raw)localStorage.removeItem(key);return true;})()';
      await send('Runtime.evaluate', { expression: rollback, returnByValue: true });
      fail('web_clone_session_storage_readback_mismatch');
    }
    verifyWebCloneAuthSessionReadback({
      expectedOrigin,
      actualOrigin: expectedOrigin,
      actualValue: readback.actualValue,
      seed,
    });
    await send('Page.reload', { ignoreCache: true });
    return { originMatches: true, exactStorageReadback: true, userMatches: true, reloaded: true };
  } finally {
    socket.close();
  }
}

export async function bootstrapWebCloneBrowserSession({
  manifestPath,
  role,
  cdpPort = 9228,
}) {
  const account = readWebCloneAccountManifest(manifestPath, role);
  const seed = await acquireBoundWebCloneAuthSession({ account });
  return installWebCloneAuthSessionSeed({
    seed,
    cdpPort,
    expectedOrigin: account.origin,
  });
}
