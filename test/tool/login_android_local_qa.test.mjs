import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  buildUiLoginCommands,
  parseUiNodes,
  runLocalQaLogin,
  startLocalQaApiSession,
} from '../../tool/login_android_local_qa.mjs';

const manifest = JSON.stringify({
  synthetic: true,
  kind: 'sit-android-local-qa-transient-session',
  apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
  email: 'qa@example.invalid',
  password: ['Qa', 'test', 'transport', 'password'].join('-'),
});
const childTransportSecret = ['Qa', 'child', 'transport', 'secret'].join('-');
const loginXml = '<hierarchy>' +
  '<node hint="E-Mail" bounds="[10,20][210,120]" />' +
  '<node hint="Passwort" bounds="[10,140][210,240]" />' +
  '<node content-desc="Anmelden" clickable="true" bounds="[10,260][210,360]" />' +
  '</hierarchy>';

function fakeApiSessionFactory(calls, { cleanup = true } = {}) {
  return async (options) => {
    calls.push(options);
    return { cleanup: async () => cleanup };
  };
}

function fakeExecFactory(xml, calls) {
  return async (file, args) => {
    calls.push({ file, args });
    if (args.at(-2) === 'cat') return { stdout: xml, stderr: '' };
    return { stdout: '', stderr: '' };
  };
}

function fakeSpawnFactory(calls, outputPayloads, {
  loginOk = true,
  logoutStatus = 204,
  error = false,
  ignoreLogout = false,
} = {}) {
  return (execPath, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.stdout.end();
      child.emit('close', null, 'SIGTERM');
    };
    calls.push({ execPath, args, options });
    child.stdin.on('data', (chunk) => {
      if (error) return;
      const request = JSON.parse(String(chunk).trim());
      if (ignoreLogout && request.op === 'logout') return;
      const response = request.op === 'login'
        ? { type: 'login', ok: loginOk }
        : { type: 'logout', ok: logoutStatus === 204, status: logoutStatus };
      const serialized = `${JSON.stringify(response)}\n`;
      outputPayloads.push(serialized);
      child.stdout.write(serialized);
    });
    child.stdin.on('finish', () => {
      if (ignoreLogout) return;
      child.stdout.end();
      child.emit('close', 0, null);
    });
    if (error) queueMicrotask(() => child.emit('error', new Error('synthetic spawn failure')));
    return child;
  };
}

function fakeAdbSpawnFactory(calls, stdinPayloads, { error = false } = {}) {
  return (file, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.emit('close', null, 'SIGTERM');
    };
    calls.push({ file, args, options });
    child.stdin.on('data', (chunk) => stdinPayloads.push(String(chunk)));
    child.stdin.on('finish', () => {
      if (error) child.emit('error', new Error('synthetic adb spawn failure'));
      child.emit('close', error ? 1 : 0, error ? null : null);
    });
    return child;
  };
}

test('local QA login helper selects fields and submit by bounds without credential output', () => {
  const xml = `<hierarchy><node hint="E-Mail" bounds="[10,20][210,120]" />` +
    `<node hint="Passwort" bounds="[10,140][210,240]" password="true" />` +
    `<node content-desc="Anmelden" clickable="true" bounds="[10,260][210,360]" />` +
    `</hierarchy>`;
  const commands = buildUiLoginCommands(parseUiNodes(xml), 'qa@example.invalid', 'secret');
  assert.deepEqual(commands.slice(0, 4), [
    ['tap', '110', '70'],
    ['keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_A'],
    ['keyevent', 'KEYCODE_DEL'],
    ['text', 'qa@example.invalid'],
  ]);
  assert.deepEqual(commands.at(-1), ['tap', '110', '310']);
  assert.equal(commands.some((command) => command.join(' ').includes('accessToken')), false);
});

test('helper refuses a UI without exact login controls', () => {
  assert.throws(
    () => buildUiLoginCommands(parseUiNodes('<hierarchy><node hint="E-Mail" /></hierarchy>'), 'a', 'b'),
    /expected login form/u,
  );
});

test('helper rejects non-exact loopback API URLs before any outbound request', async () => {
  for (const apiBaseUrl of [
    'http://127.0.0.1:18080/api/v1.evil',
    'http://127.0.0.1:18080/api/v1?redirect=https://evil.example',
    'http://127.0.0.2:18080/api/v1',
  ]) {
    const calls = [];
    await assert.rejects(
      runLocalQaLogin({
        device: 'fake-device',
        manifestPath: '/private/session.json',
        readFileImpl: async () => manifest.replace('http://127.0.0.1:18080/api/v1', apiBaseUrl),
        apiSessionImpl: fakeApiSessionFactory(calls),
        execFileImpl: fakeExecFactory(loginXml, []),
      }),
      /exact loopback-only endpoint/u,
    );
    assert.equal(calls.length, 0);
  }
});

test('helper reads the manifest through a private no-follow descriptor', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sit-local-qa-login-'));
  const target = join(root, 'session.json');
  const link = join(root, 'session-link.json');
  try {
    writeFileSync(target, manifest, { mode: 0o600 });
    chmodSync(target, 0o600);
    symlinkSync(target, link);
    await assert.rejects(
      runLocalQaLogin({
        device: 'fake-device',
        manifestPath: link,
        apiSessionImpl: fakeApiSessionFactory([]),
        execFileImpl: fakeExecFactory(loginXml, []),
      }),
      /ELOOP|private_file|manifest/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('helper performs one API sanity login, revokes it, and always removes the UI dump', async () => {
  const apiSessionCalls = [];
  const execCalls = [];
  const result = await runLocalQaLogin({
    device: 'fake-device',
    manifestPath: '/private/session.json',
    readFileImpl: async () => manifest,
    apiSessionImpl: fakeApiSessionFactory(apiSessionCalls),
    execFileImpl: fakeExecFactory(loginXml, execCalls),
    adbSpawnImpl: fakeAdbSpawnFactory([], []),
    now: () => 123,
  });
  assert.deepEqual(result, {
    status: 'passed',
    apiLogin: 'ok',
    apiLoginSessionCleanup: 'revoked',
    ui: 'submitted',
  });
  assert.deepEqual(apiSessionCalls, [{
    email: 'qa@example.invalid',
    password: manifest.match(/"password":"([^"]+)"/u)[1],
    apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
  }]);
  assert.ok(execCalls.some((call) => call.args.includes('rm') && call.args.includes('/sdcard/sit_local_qa_login_123.xml')));
  assert.equal(JSON.stringify(result).includes('accessToken'), false);
});

test('helper sends UI credential text over ADB stdin, never ADB argv', async () => {
  const apiSessionCalls = [];
  const execCalls = [];
  const adbSpawnCalls = [];
  const adbStdinPayloads = [];
  const result = await runLocalQaLogin({
    device: 'fake-device',
    manifestPath: '/private/session.json',
    readFileImpl: async () => manifest,
    apiSessionImpl: fakeApiSessionFactory(apiSessionCalls),
    execFileImpl: fakeExecFactory(loginXml, execCalls),
    adbSpawnImpl: fakeAdbSpawnFactory(adbSpawnCalls, adbStdinPayloads),
    now: () => 321,
  });
  assert.equal(result.status, 'passed');
  assert.equal(adbSpawnCalls.length, 2);
  assert.equal(JSON.stringify(adbSpawnCalls).includes('qa@example.invalid'), false);
  assert.equal(JSON.stringify(adbSpawnCalls).includes(manifest.match(/"password":"([^"]+)"/u)[1]), false);
  assert.deepEqual(adbSpawnCalls.map(({ file, args }) => [file, args]), [
    ['adb', ['-s', 'fake-device', 'shell']],
    ['adb', ['-s', 'fake-device', 'shell']],
  ]);
  assert.ok(adbStdinPayloads.some((payload) => payload.includes("'input' 'text' 'qa@example.invalid'")));
  assert.ok(adbStdinPayloads.some((payload) => payload.includes(
    `'input' 'text' '${manifest.match(/"password":"([^"]+)"/u)[1]}'`,
  )));
  assert.equal(JSON.stringify(execCalls).includes('qa@example.invalid'), false);
  assert.equal(JSON.stringify(execCalls).includes(manifest.match(/"password":"([^"]+)"/u)[1]), false);
});

test('helper removes the UI dump and revokes API sanity session when UI parsing fails', async () => {
  const apiSessionCalls = [];
  const execCalls = [];
  await assert.rejects(
    runLocalQaLogin({
      device: 'fake-device',
      manifestPath: '/private/session.json',
      readFileImpl: async () => manifest,
      apiSessionImpl: fakeApiSessionFactory(apiSessionCalls),
      execFileImpl: fakeExecFactory('<hierarchy />', execCalls),
      now: () => 456,
    }),
    /expected login form/u,
  );
  assert.equal(apiSessionCalls.length, 1);
  assert.ok(execCalls.some((call) => call.args.includes('rm') && call.args.includes('/sdcard/sit_local_qa_login_456.xml')));
});

test('helper reports API cleanup failure after UI failure without exposing credentials', async () => {
  const secret = ['Qa', 'transport', 'secret'].join('-');
  const apiSessionCalls = [];
  const execCalls = [];
  const privateManifest = manifest.replace(/"password":"[^"]+"/u, `"password":"${secret}"`);
  await assert.rejects(
    runLocalQaLogin({
      device: 'fake-device',
      manifestPath: '/private/session.json',
      readFileImpl: async () => privateManifest,
      apiSessionImpl: fakeApiSessionFactory(apiSessionCalls, { cleanup: false }),
      execFileImpl: fakeExecFactory('<hierarchy />', execCalls),
      now: () => 789,
    }),
    /expected login form/u,
  );
  assert.equal(JSON.stringify(execCalls).includes(secret), false);
  assert.equal(JSON.stringify(apiSessionCalls).includes(secret), true);
  assert.ok(execCalls.some((call) => call.args.includes('rm') && call.args.includes('/sdcard/sit_local_qa_login_789.xml')));
});

test('child API transport keeps credentials out of process args, env, and status output', async () => {
  const secret = childTransportSecret;
  const spawnCalls = [];
  const outputPayloads = [];
  const session = await startLocalQaApiSession({
    email: 'qa@example.invalid',
    password: secret,
    spawnImpl: fakeSpawnFactory(spawnCalls, outputPayloads),
    execPath: '/usr/local/bin/node',
    transportPath: '/repo/tool/local_qa_api_transport.mjs',
  });
  assert.equal(await session.cleanup(), true);
  assert.equal(JSON.stringify(spawnCalls).includes(secret), false);
  assert.equal(outputPayloads.join('').includes(secret), false);
  assert.deepEqual(spawnCalls[0].args, ['/repo/tool/local_qa_api_transport.mjs']);
  assert.deepEqual(spawnCalls[0].options.env, { PATH: process.env.PATH ?? '/usr/bin:/bin' });
});

test('child API transport tears down after login failure and reports cleanup failure', async () => {
  const spawnCalls = [];
  const outputPayloads = [];
  await assert.rejects(
    startLocalQaApiSession({
      email: 'qa@example.invalid',
      password: childTransportSecret,
      spawnImpl: fakeSpawnFactory(spawnCalls, outputPayloads, { loginOk: false }),
      execPath: '/usr/local/bin/node',
      transportPath: '/repo/tool/local_qa_api_transport.mjs',
    }),
    /login sanity failed/u,
  );
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].options.env.SIT_LOCAL_QA_PASSWORD, undefined);

  const failedCleanupSession = await startLocalQaApiSession({
    email: 'qa@example.invalid',
    password: childTransportSecret,
    spawnImpl: fakeSpawnFactory([], [], { logoutStatus: 500 }),
    execPath: '/usr/local/bin/node',
    transportPath: '/repo/tool/local_qa_api_transport.mjs',
  });
  assert.equal(await failedCleanupSession.cleanup(), false);
});

test('child API transport handles spawn error without an unhandled event or hang', async () => {
  const spawnCalls = [];
  const outputPayloads = [];
  await assert.rejects(
    startLocalQaApiSession({
      email: 'qa@example.invalid',
      password: childTransportSecret,
      spawnImpl: fakeSpawnFactory(spawnCalls, outputPayloads, { error: true }),
      execPath: '/usr/local/bin/node',
      transportPath: '/repo/tool/local_qa_api_transport.mjs',
    }),
    /login sanity failed|transport failed|closed unexpectedly/u,
  );
});

test('child API transport kills a non-responding logout child within the injected bound', async () => {
  const spawnCalls = [];
  const outputPayloads = [];
  const session = await startLocalQaApiSession({
    email: 'qa@example.invalid',
    password: childTransportSecret,
    spawnImpl: fakeSpawnFactory(spawnCalls, outputPayloads, { ignoreLogout: true }),
    execPath: '/usr/local/bin/node',
    transportPath: '/repo/tool/local_qa_api_transport.mjs',
    transportTimeoutMs: 10,
  });
  const startedAt = Date.now();
  assert.equal(await session.cleanup(), false);
  assert.ok(Date.now() - startedAt < 500);
});

test('ADB stdin transport fails closed on child error', async () => {
  const apiSessionCalls = [];
  const execCalls = [];
  const adbSpawnCalls = [];
  const adbStdinPayloads = [];
  await assert.rejects(
    runLocalQaLogin({
      device: 'fake-device',
      manifestPath: '/private/session.json',
      readFileImpl: async () => manifest,
      apiSessionImpl: fakeApiSessionFactory(apiSessionCalls),
      execFileImpl: fakeExecFactory(loginXml, execCalls),
      adbSpawnImpl: fakeAdbSpawnFactory(adbSpawnCalls, adbStdinPayloads, { error: true }),
      now: () => 654,
    }),
    /ADB shell input transport failed/u,
  );
  assert.equal(adbSpawnCalls.length, 1);
  assert.equal(adbStdinPayloads.length, 1);
});
