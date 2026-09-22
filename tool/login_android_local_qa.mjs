#!/usr/bin/env node

import { execFile as execFileCallback, spawn as spawnCallback } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { readStablePrivateFile } from '../backend/ops/stable_private_file.mjs';

const execFile = promisify(execFileCallback);
const localQaApiBaseUrl = 'http://127.0.0.1:18080/api/v1';
const localQaApiBaseUrls = new Set([localQaApiBaseUrl]);
const localQaApiTransportPath = fileURLToPath(
  new URL('./local_qa_api_transport.mjs', import.meta.url),
);

function assertLocalQaApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? ''));
  } catch {
    throw new Error('The local QA API base is not a valid URL.');
  }
  const normalized = parsed.href.replace(/\/$/u, '');
  if (parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
      || !localQaApiBaseUrls.has(normalized)) {
    throw new Error('The local QA API base is not the exact loopback-only endpoint.');
  }
}

export function parseBounds(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(value ?? '');
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return { left, top, right, bottom };
}

export function parseUiNodes(xml) {
  return [...xml.matchAll(/<node\b([^>]*)\/>/gu)].map((match) => {
    const attrs = {};
    for (const [, key, value] of match[1].matchAll(/([\w-]+)="([^"]*)"/gu)) {
      attrs[key] = value;
    }
    return {
      hint: attrs.hint ?? '',
      contentDesc: attrs['content-desc'] ?? '',
      clickable: attrs.clickable === 'true',
      bounds: parseBounds(attrs.bounds),
    };
  });
}

export function buildUiLoginCommands(nodes, email, password) {
  const field = (hint) => nodes.find((node) => node.hint === hint && node.bounds);
  const emailField = field('E-Mail');
  const passwordField = field('Passwort');
  const loginButtons = nodes.filter(
    (node) => node.contentDesc === 'Anmelden' && node.clickable && node.bounds,
  );
  const submit = loginButtons.at(-1);
  if (!emailField || !passwordField || !submit) {
    throw new Error('Current UI is not the expected login form.');
  }
  const center = ({ left, top, right, bottom }) => [
    Math.round((left + right) / 2),
    Math.round((top + bottom) / 2),
  ];
  const clearAndSet = (node, value) => {
    const [x, y] = center(node.bounds);
    // The current field value is cleared deterministically by selecting all
    // via Android's real key-combination primitive, then replacing it once.
    return [
      ['tap', String(x), String(y)],
      ['keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_A'],
      ['keyevent', 'KEYCODE_DEL'],
      ['text', value],
    ];
  };
  return [
    ...clearAndSet(emailField, email),
    ...clearAndSet(passwordField, password),
    ['tap', ...center(submit.bounds).map(String)],
  ];
}

async function readTransportMessage(iterator, child, label, timeoutMs) {
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Local QA API transport ${label} timed out.`)),
      timeoutMs,
    );
  });
  try {
    const next = await Promise.race([iterator.next(), child.failure, timeout]);
    if (next?.transportError) throw next.transportError;
    if (next.done) throw new Error(`Local QA API transport ${label} closed unexpectedly.`);
    try {
      return JSON.parse(next.value);
    } catch {
      child.kill();
      throw new Error(`Local QA API transport ${label} returned invalid status.`);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function waitForChildClose(childClosed, timeoutMs) {
  let timeoutHandle;
  const timeout = new Promise((resolve) => {
    timeoutHandle = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([childClosed, timeout]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function localQaTransportEnvironment() {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin' };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function runAdbShellInput({ device, args, spawnImpl }) {
  const child = spawnImpl('adb', ['-s', device, 'shell'], {
    env: localQaTransportEnvironment(),
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  child.failure = new Promise((resolve) => {
    child.once('error', () => resolve({ transportError: new Error('ADB shell input transport failed.') }));
  });
  const result = new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('ADB shell input transport timed out.')), 10_000);
  });
  try {
    child.stdin.end(`${args.map(shellQuote).join(' ')}\n`);
    const completed = await Promise.race([result, child.failure, timeout]);
    if (completed?.transportError) throw completed.transportError;
    if (completed.code !== 0) throw new Error('ADB shell input transport failed.');
  } catch (error) {
    if (!child.killed) child.kill();
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function startLocalQaApiSession({
  email,
  password,
  spawnImpl = spawnCallback,
  execPath = process.execPath,
  transportPath = localQaApiTransportPath,
  transportTimeoutMs = 10_000,
}) {
  const child = spawnImpl(execPath, [transportPath], {
    env: localQaTransportEnvironment(),
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const output = createInterface({ input: child.stdout });
  const outputIterator = output[Symbol.asyncIterator]();
  child.failure = new Promise((resolve) => {
    child.once('error', () => resolve({ transportError: new Error('Local QA API transport failed.') }));
  });
  const childClosed = new Promise((resolve) => child.once('close', resolve));
  let loggedIn = false;
  let cleaned = false;
  const stopChild = async () => {
    if (!child.killed) child.kill();
    await waitForChildClose(childClosed, transportTimeoutMs);
    output.close();
  };
  const send = (message) => {
    if (child.stdin.destroyed) throw new Error('Local QA API transport stdin is closed.');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  try {
    send({ op: 'login', email, password });
    const login = await readTransportMessage(outputIterator, child, 'login', transportTimeoutMs);
    if (login.type !== 'login' || login.ok !== true) {
      throw new Error('Local QA API login sanity failed.');
    }
    loggedIn = true;
  } catch (error) {
    await stopChild().catch(() => {});
    throw error;
  }

  return {
    cleanup: async () => {
      if (cleaned) return false;
      cleaned = true;
      if (!loggedIn) {
        await stopChild().catch(() => {});
        return false;
      }
      try {
        send({ op: 'logout' });
        const logout = await readTransportMessage(outputIterator, child, 'logout', transportTimeoutMs);
        return logout.type === 'logout' && logout.ok === true && logout.status === 204;
      } catch {
        if (!child.killed) child.kill();
        return false;
      } finally {
        if (!child.killed) child.stdin.end();
        await waitForChildClose(childClosed, transportTimeoutMs);
        output.close();
      }
    },
  };
}

export async function runLocalQaLogin({
  device,
  manifestPath,
  readFileImpl = (filePath) => readStablePrivateFile(filePath, {
    expectedMode: 0o600,
    minBytes: 1,
    maxBytes: 16 * 1024,
    code: 'local_qa_manifest_private_file_required',
  }),
  execFileImpl = execFile,
  apiSessionImpl = startLocalQaApiSession,
  adbSpawnImpl = spawnCallback,
  now = Date.now,
}) {
  if (!device?.trim()) throw new Error('SIT_ANDROID_DEVICE is required.');
  const adb = async (args) => {
    if (args[0] === 'input' && args[1] === 'text') {
      await runAdbShellInput({ device, args, spawnImpl: adbSpawnImpl });
      return;
    }
    await execFileImpl('adb', ['-s', device, 'shell', ...args], {
      maxBuffer: 2 * 1024 * 1024,
    });
  };
  const manifest = JSON.parse(await readFileImpl(manifestPath));
  if (manifest.synthetic !== true || manifest.kind !== 'sit-android-local-qa-transient-session') {
    throw new Error('The local QA session manifest is not synthetic and current.');
  }
  assertLocalQaApiBaseUrl(manifest.apiBaseUrl);
  const apiSession = await apiSessionImpl({
    email: manifest.email,
    password: manifest.password,
    apiBaseUrl: localQaApiBaseUrl,
  });

  const dumpPath = `/sdcard/sit_local_qa_login_${now()}.xml`;
  let uiSubmitted = false;
  let apiLoginSessionCleanup = false;
  try {
    await adb(['uiautomator', 'dump', dumpPath]);
    const { stdout: xml } = await execFileImpl('adb', ['-s', device, 'shell', 'cat', dumpPath]);
    const commands = buildUiLoginCommands(parseUiNodes(xml), manifest.email, manifest.password);
    for (const command of commands) await adb(['input', ...command]);
    uiSubmitted = true;
  } finally {
    await adb(['rm', '-f', dumpPath]).catch(() => {});
    apiLoginSessionCleanup = await apiSession.cleanup().catch(() => false);
  }
  if (!uiSubmitted || !apiLoginSessionCleanup) {
    throw new Error('Local QA login helper could not complete UI submit and API session cleanup.');
  }
  return { status: 'passed', apiLogin: 'ok', apiLoginSessionCleanup: 'revoked', ui: 'submitted' };
}

async function main() {
  const device = process.env.SIT_ANDROID_DEVICE?.trim();
  const manifestPath = `${process.env.HOME}/Library/Application Support/ShareItToo/qa/android/live-r3/session.json`;
  const result = await runLocalQaLogin({ device, manifestPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
