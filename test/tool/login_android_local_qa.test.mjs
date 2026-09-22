import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  buildUiLoginCommands,
  parseUiNodes,
  runLocalQaLogin,
} from '../../tool/login_android_local_qa.mjs';

const manifest = JSON.stringify({
  synthetic: true,
  kind: 'sit-android-local-qa-transient-session',
  apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
  email: 'qa@example.invalid',
  password: process.env.SIT_LOCAL_QA_PASSWORD ?? `Qa-${randomBytes(18).toString('base64url')}`,
});
const loginXml = '<hierarchy>' +
  '<node hint="E-Mail" bounds="[10,20][210,120]" />' +
  '<node hint="Passwort" bounds="[10,140][210,240]" />' +
  '<node content-desc="Anmelden" clickable="true" bounds="[10,260][210,360]" />' +
  '</hierarchy>';

function fakeFetchFactory(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'x'.repeat(24), refreshToken: 'r'.repeat(24) }),
      };
    }
    return { ok: true, status: 204, json: async () => ({}) };
  };
}

function fakeExecFactory(xml, calls) {
  return async (file, args) => {
    calls.push({ file, args });
    if (args.at(-2) === 'cat') return { stdout: xml, stderr: '' };
    return { stdout: '', stderr: '' };
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
        fetchImpl: fakeFetchFactory(calls),
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
        fetchImpl: fakeFetchFactory([]),
        execFileImpl: fakeExecFactory(loginXml, []),
      }),
      /ELOOP|private_file|manifest/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('helper performs one API sanity login, revokes it, and always removes the UI dump', async () => {
  const fetchCalls = [];
  const execCalls = [];
  const result = await runLocalQaLogin({
    device: 'fake-device',
    manifestPath: '/private/session.json',
    readFileImpl: async () => manifest,
    fetchImpl: fakeFetchFactory(fetchCalls),
    execFileImpl: fakeExecFactory(loginXml, execCalls),
    now: () => 123,
  });
  assert.deepEqual(result, {
    status: 'passed',
    apiLogin: 'ok',
    apiLoginSessionCleanup: 'revoked',
    ui: 'submitted',
  });
  assert.deepEqual(fetchCalls.map((call) => [call.url, call.options.method]), [
    ['http://127.0.0.1:18080/api/v1/auth/login', 'POST'],
    ['http://127.0.0.1:18080/api/v1/auth/logout', 'POST'],
  ]);
  assert.ok(execCalls.some((call) => call.args.includes('rm') && call.args.includes('/sdcard/sit_local_qa_login_123.xml')));
  assert.equal(JSON.stringify(result).includes('accessToken'), false);
});

test('helper removes the UI dump and revokes API sanity session when UI parsing fails', async () => {
  const fetchCalls = [];
  const execCalls = [];
  await assert.rejects(
    runLocalQaLogin({
      device: 'fake-device',
      manifestPath: '/private/session.json',
      readFileImpl: async () => manifest,
      fetchImpl: fakeFetchFactory(fetchCalls),
      execFileImpl: fakeExecFactory('<hierarchy />', execCalls),
      now: () => 456,
    }),
    /expected login form/u,
  );
  assert.equal(fetchCalls.length, 2);
  assert.ok(execCalls.some((call) => call.args.includes('rm') && call.args.includes('/sdcard/sit_local_qa_login_456.xml')));
});
