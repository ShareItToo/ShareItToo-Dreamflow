#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { readStablePrivateFile } from '../backend/ops/stable_private_file.mjs';

const execFile = promisify(execFileCallback);
const localQaApiBaseUrl = 'http://127.0.0.1:18080/api/v1';
const localQaApiBaseUrls = new Set([localQaApiBaseUrl]);

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

export async function runLocalQaLogin({
  device,
  manifestPath,
  fetchImpl = fetch,
  readFileImpl = (filePath) => readStablePrivateFile(filePath, {
    expectedMode: 0o600,
    minBytes: 1,
    maxBytes: 16 * 1024,
    code: 'local_qa_manifest_private_file_required',
  }),
  execFileImpl = execFile,
  now = Date.now,
}) {
  if (!device?.trim()) throw new Error('SIT_ANDROID_DEVICE is required.');
  const adb = async (args) => {
    await execFileImpl('adb', ['-s', device, 'shell', ...args], {
      maxBuffer: 2 * 1024 * 1024,
    });
  };
  const manifest = JSON.parse(await readFileImpl(manifestPath));
  if (manifest.synthetic !== true || manifest.kind !== 'sit-android-local-qa-transient-session') {
    throw new Error('The local QA session manifest is not synthetic and current.');
  }
  assertLocalQaApiBaseUrl(manifest.apiBaseUrl);
  const login = await fetchImpl(`${localQaApiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: manifest.email, password: manifest.password }),
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok || typeof loginBody.accessToken !== 'string' ||
      loginBody.accessToken.length < 20 ||
      typeof loginBody.refreshToken !== 'string' || loginBody.refreshToken.length < 20) {
    throw new Error(`Local QA API login sanity failed with status ${login.status}.`);
  }

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
    const logout = await fetchImpl(`${localQaApiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
    }).catch(() => {});
    apiLoginSessionCleanup = logout?.status === 204;
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
