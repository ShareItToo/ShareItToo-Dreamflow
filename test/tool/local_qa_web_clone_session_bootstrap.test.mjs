import assert from 'node:assert/strict';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  acquireBoundWebCloneAuthSession,
  buildWebCloneAuthSessionSeed,
  installWebCloneAuthSessionSeed,
  readWebCloneAccountManifest,
  verifyWebCloneAuthSessionReadback,
  WEB_CLONE_AUTH_SESSION_STORAGE_KEY,
} from '../../tool/local_qa_web_clone_session_bootstrap.mjs';
import { WEB_CLONE_ORIGIN } from '../../tool/run_local_qa_web_clone.mjs';

const account = {
  origin: WEB_CLONE_ORIGIN,
  role: 'renter',
  id: '00000000-0000-4000-8000-000000000012',
  email: 'wp255-renter@example.invalid',
  password: 'synthetic-renter-password-long-enough',
};

const authResponse = {
  user: {
    id: account.id,
    email: account.email,
    createdAt: '2026-10-31T03:00:00.000Z',
  },
  accessToken: 'synthetic-access-token-with-enough-length',
  refreshToken: 'synthetic-refresh-token-with-enough-length',
  sessionId: 'synthetic-session-id',
  expiresIn: 900,
};

function seed() {
  return buildWebCloneAuthSessionSeed({
    authResponse,
    expectedUserId: account.id,
    expectedEmail: account.email,
    now: new Date('2026-10-31T04:00:00.000Z'),
  });
}

async function verifiedSeed() {
  return acquireBoundWebCloneAuthSession({
    account,
    now: new Date('2026-10-31T04:00:00.000Z'),
    fetchImpl: async (url) => url.endsWith('/auth/login')
      ? { ok: true, json: async () => authResponse }
      : { ok: true, json: async () => ({ user: { id: account.id, email: account.email } }) },
  });
}

test('local browser session seed matches AuthService storage key and wire shape', () => {
  const value = seed();
  const session = JSON.parse(value.encodedSession);
  assert.equal(value.storageKey, 'flutter.auth_session_v1');
  assert.equal(value.storageKey, WEB_CLONE_AUTH_SESSION_STORAGE_KEY);
  assert.deepEqual(Object.keys(session), [
    'userId', 'email', 'createdAt', 'accessToken', 'refreshToken', 'sessionId',
    'accessTokenExpiresAt',
  ]);
  assert.equal(session.userId, account.id);
  assert.equal(session.email, account.email);
  assert.equal(session.createdAt, authResponse.user.createdAt);
  assert.equal(session.accessTokenExpiresAt, '2026-10-31T04:15:00.000Z');
});

test('session seed rejects nonmatching principal and malformed token response', () => {
  assert.throws(() => buildWebCloneAuthSessionSeed({
    authResponse: { ...authResponse, user: { ...authResponse.user, id: 'other-user' } },
    expectedUserId: account.id,
    expectedEmail: account.email,
  }), /web_clone_session_auth_response_invalid/u);
  assert.throws(() => buildWebCloneAuthSessionSeed({
    authResponse: { ...authResponse, user: { ...authResponse.user, email: 'other@example.invalid' } },
    expectedUserId: account.id,
    expectedEmail: account.email,
  }), /web_clone_session_auth_response_invalid/u);
  assert.throws(() => buildWebCloneAuthSessionSeed({
    authResponse: { ...authResponse, sessionId: '' },
    expectedUserId: account.id,
    expectedEmail: account.email,
  }), /web_clone_session_auth_response_invalid/u);
});

test('session acquisition logs into only the fixed local origin and verifies exact user', async () => {
  const calls = [];
  const value = await acquireBoundWebCloneAuthSession({
    account,
    now: new Date('2026-10-31T04:00:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method ?? 'GET', authorization: options.headers?.authorization });
      if (url.endsWith('/auth/login')) {
        return { ok: true, json: async () => authResponse };
      }
      return {
        ok: true,
        json: async () => ({ user: { id: account.id, email: account.email } }),
      };
    },
  });
  assert.deepEqual(calls.map((call) => [call.url, call.method]), [
    [WEB_CLONE_ORIGIN + '/api/v1/auth/login', 'POST'],
    [WEB_CLONE_ORIGIN + '/api/v1/auth/me', 'GET'],
  ]);
  assert.equal(calls[1].authorization, 'Bearer ' + authResponse.accessToken);
  assert.equal(value.expectedUserId, account.id);
  assert.equal(value.expectedEmail, account.email);

  await assert.rejects(acquireBoundWebCloneAuthSession({
    account,
    origin: 'https://shareittoo.com',
    fetchImpl: async () => { throw new Error('unexpected call'); },
  }), /web_clone_origin_loopback_required/u);
  await assert.rejects(acquireBoundWebCloneAuthSession({
    account,
    fetchImpl: async (url) => url.endsWith('/auth/login')
      ? { ok: false, json: async () => authResponse }
      : { ok: true, json: async () => ({ user: { id: 'successor', email: account.email } }) },
  }), /web_clone_session_local_login_failed/u);
});

test('local API session is refused when /auth/me returns another principal', async () => {
  let calls = 0;
  await assert.rejects(acquireBoundWebCloneAuthSession({
    account,
    fetchImpl: async (url) => {
      calls++;
      return url.endsWith('/auth/login')
        ? { ok: true, json: async () => authResponse }
        : { ok: true, json: async () => ({ user: { id: 'successor', email: account.email } }) };
    },
  }), /web_clone_session_principal_mismatch/u);
  assert.equal(calls, 2);
});

function sessionManifest(overrides = {}) {
  return {
    synthetic: true,
    containsProductionCredentials: false,
    runId: 'wp255-20261031041730-a864741c',
    datasetId: 'wp255-green-clone-99dfa2c5cb30',
    origin: WEB_CLONE_ORIGIN,
    accounts: [
      {
        ...account,
        id: '00000000-0000-4000-8000-000000000011',
        displayName: 'WP255 Synthetic Owner',
      },
      { ...account, displayName: 'WP255 Synthetic Renter' },
    ],
    ...overrides,
  };
}

function writeSessionManifest(path, value = sessionManifest()) {
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
}

test('manifest reader accepts only owner-controlled mode-0700 directory and mode-0600 single-link file', () => {
  const root = mkdtempSync(join(tmpdir(), 'sit-web-session-test-'));
  try {
    const path = join(root, 'synthetic-session.json');
    writeSessionManifest(path);
    const parentStat = lstatSync(root);
    const fileStat = lstatSync(path);
    assert.equal(parentStat.uid, process.getuid());
    assert.equal(parentStat.mode & 0o777, 0o700);
    assert.equal(fileStat.uid, process.getuid());
    assert.equal(fileStat.mode & 0o777, 0o600);
    assert.equal(fileStat.nlink, 1);
    assert.equal(readWebCloneAccountManifest(path, 'renter').id, account.id);
    assert.equal(readWebCloneAccountManifest(path, 'owner').role, 'owner');
    assert.throws(() => readWebCloneAccountManifest(path, 'admin'), /web_clone_session_role_invalid/u);

    const hardlink = join(root, 'hardlink.json');
    linkSync(path, hardlink);
    assert.throws(
      () => readWebCloneAccountManifest(path, 'renter'),
      /web_clone_session_manifest_permissions_invalid/u,
    );
    rmSync(hardlink);

    const link = join(root, 'linked-session.json');
    symlinkSync(path, link);
    assert.throws(
      () => readWebCloneAccountManifest(link, 'renter'),
      /web_clone_session_manifest_permissions_invalid/u,
    );

    const linkedParent = join(root, 'linked-parent');
    symlinkSync(root, linkedParent, 'dir');
    assert.throws(
      () => readWebCloneAccountManifest(join(linkedParent, 'synthetic-session.json'), 'renter'),
      /web_clone_session_manifest_parent_invalid/u,
    );

    chmodSync(root, 0o755);
    assert.throws(
      () => readWebCloneAccountManifest(path, 'renter'),
      /web_clone_session_manifest_parent_invalid/u,
    );
    chmodSync(root, 0o700);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manifest reader rejects empty, oversized, and production-credential-marked files', () => {
  const root = mkdtempSync(join(tmpdir(), 'sit-web-session-size-test-'));
  try {
    const empty = join(root, 'empty.json');
    writeFileSync(empty, '', { mode: 0o600 });
    assert.throws(
      () => readWebCloneAccountManifest(empty, 'renter'),
      /web_clone_session_manifest_permissions_invalid/u,
    );

    const oversized = join(root, 'oversized.json');
    writeFileSync(oversized, Buffer.alloc(1_048_577, 0x20), { mode: 0o600 });
    assert.throws(
      () => readWebCloneAccountManifest(oversized, 'renter'),
      /web_clone_session_manifest_permissions_invalid/u,
    );

    const marked = join(root, 'marked.json');
    writeSessionManifest(
      marked,
      sessionManifest({ containsProductionCredentials: undefined }),
    );
    assert.throws(
      () => readWebCloneAccountManifest(marked, 'renter'),
      /web_clone_session_manifest_binding_invalid/u,
    );
    writeSessionManifest(marked, sessionManifest({ containsProductionCredentials: true }));
    assert.throws(
      () => readWebCloneAccountManifest(marked, 'renter'),
      /web_clone_session_manifest_binding_invalid/u,
    );
    writeSessionManifest(marked, sessionManifest({ containsProductionCredentials: false }));
    assert.equal(readWebCloneAccountManifest(marked, 'renter').id, account.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('storage readback requires exact local origin, bytes, and principal', () => {
  const value = seed();
  assert.equal(verifyWebCloneAuthSessionReadback({
    expectedOrigin: WEB_CLONE_ORIGIN,
    actualOrigin: WEB_CLONE_ORIGIN,
    actualValue: value.encodedSession,
    seed: value,
  }), true);
  assert.throws(() => verifyWebCloneAuthSessionReadback({
    expectedOrigin: WEB_CLONE_ORIGIN,
    actualOrigin: 'https://shareittoo.com',
    actualValue: value.encodedSession,
    seed: value,
  }), /web_clone_session_storage_readback_invalid/u);
  assert.throws(() => verifyWebCloneAuthSessionReadback({
    expectedOrigin: WEB_CLONE_ORIGIN,
    actualOrigin: WEB_CLONE_ORIGIN,
    actualValue: value.encodedSession + ' ',
    seed: value,
  }), /web_clone_session_storage_readback_mismatch/u);
});

test('CDP install binds one local page, verifies storage, then reloads', async () => {
  const value = await verifiedSeed();
  const storage = new Map();
  const calls = [];
  class FakeWebSocket {
    listeners = new Map();
    constructor(url) { this.url = url; }
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) ?? [];
      callbacks.push(callback);
      this.listeners.set(name, callbacks);
      if (name === 'open') queueMicrotask(() => callback(new Event('open')));
    }
    dispatch(name, event) {
      for (const callback of this.listeners.get(name) ?? []) callback(event);
    }
    send(raw) {
      const command = JSON.parse(raw);
      calls.push(command.method);
      let result = {};
      if (command.method === 'Runtime.evaluate') {
        const location = { origin: WEB_CLONE_ORIGIN };
        const localStorage = {
          setItem: (key, value) => storage.set(key, value),
          getItem: (key) => storage.get(key) ?? null,
          removeItem: (key) => storage.delete(key),
        };
        const valueResult = Function('location', 'localStorage', 'return ' + command.params.expression)(
          location, localStorage,
        );
        result = { result: { result: { value: valueResult } } };
      }
      queueMicrotask(() => this.dispatch('message', {
        data: JSON.stringify({ id: command.id, ...result }),
      }));
    }
    close() {}
  }
  const output = await installWebCloneAuthSessionSeed({
    seed: value,
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{
        type: 'page',
        url: WEB_CLONE_ORIGIN + '/',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9228/devtools/page/synthetic',
      }],
    }),
    WebSocketImpl: FakeWebSocket,
  });
  assert.deepEqual(output, {
    originMatches: true, exactStorageReadback: true, userMatches: true, reloaded: true,
  });
  assert.equal(storage.get(WEB_CLONE_AUTH_SESSION_STORAGE_KEY), value.encodedSession);
  assert.deepEqual(calls, ['Runtime.evaluate', 'Page.reload']);
});

test('CDP install refuses a seed that did not pass exact local API principal readback', async () => {
  let cdpCalls = 0;
  await assert.rejects(installWebCloneAuthSessionSeed({
    seed: seed(),
    fetchImpl: async () => { cdpCalls++; throw new Error('unexpected CDP call'); },
  }), /web_clone_session_install_input_invalid/u);
  assert.equal(cdpCalls, 0);
});
