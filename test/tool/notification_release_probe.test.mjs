import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { assetName, checkMatrix, readOwnedBrowserVersion } from '../support/notification_release_probe.mjs';

const origin = 'http://127.0.0.1:49152';
const files = new Set(['index.html', 'main.dart.js', 'canvaskit/canvaskit.wasm']);
const versionUrl = `${origin}/json/version`;
const debuggerUrl = 'ws://127.0.0.1:49152/devtools/browser/123e4567-e89b-12d3-a456-426614174000';
const versionInfo = { Browser: 'Chrome/154.0.8037.57', webSocketDebuggerUrl: debuggerUrl };
function response({ value = versionInfo, bytes = Buffer.from(JSON.stringify(value)), headers = {}, ...overrides } = {}) {
  return { status: 200, redirected: false, url: versionUrl,
    headers: new Headers({ 'content-type': 'application/json; charset=UTF-8', ...headers }),
    body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), ...overrides };
}
const inspect = (r, options = {}) => readOwnedBrowserVersion(49152, { fetchImpl: async () => r, ...options });

test('owned version handshake binds exact loopback GET and projects only bounded metadata', async () => {
  const info = await readOwnedBrowserVersion(49152, { fetchImpl: async (url, options) => {
    assert.equal(url, versionUrl); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/json', 'Accept-Encoding': 'identity' });
    assert.equal(options.signal.aborted, false);
    return response({ value: { ...versionInfo, arbitrary: '../../untrusted.json', body: '<html>untrusted</html>' },
      headers: { 'content-disposition': 'attachment; filename="../../untrusted.json"' } });
  } });
  assert.deepEqual(info, { version: versionInfo.Browser, debuggerUrl });
  assert.equal(Object.isFrozen(info), true);
  assert.deepEqual(await inspect(response({ value: { ...versionInfo, Browser: 'HeadlessChrome/154.0.8037.57' } })),
    { version: 'HeadlessChrome/154.0.8037.57', debuggerUrl });
});

test('invalid local ports fail before transport', async () => {
  for (const port of [0, -1, 65536, 1.5, '49152', NaN]) {
    let calls = 0;
    await assert.rejects(readOwnedBrowserVersion(port, { fetchImpl: async () => { calls++; } }), { message: 'browser-version' });
    assert.equal(calls, 0);
  }
});

for (const [label, change] of Object.entries({
  'redirect status': { status: 302 }, 'followed redirect': { redirected: true },
  'external final URL': { url: 'https://outside.invalid/json/version' },
  'wrong local port': { url: 'http://127.0.0.1:49153/json/version' },
  'wrong path': { url: `${origin}/other` }, 'failed status': { status: 500 },
  'HTML MIME': { headers: { 'content-type': 'text/html' } },
  'compressed body': { headers: { 'content-encoding': 'gzip' } },
  'oversized declaration': { headers: { 'content-length': '65537' } },
  'malformed declaration': { headers: { 'content-length': '1, 2' } },
  'incorrect declaration': { headers: { 'content-length': '2' } },
  'missing body': { body: null }, 'invalid JSON': { bytes: Buffer.from('<html>') },
  'invalid UTF8': { bytes: Buffer.from([255]) },
  'invalid version': { value: { ...versionInfo, Browser: '../../untrusted.json' } },
  'version object': { value: { ...versionInfo, Browser: { text: 'Chrome/1.2.3.4' } } },
  'missing version': { value: { webSocketDebuggerUrl: debuggerUrl } },
  'null response': { value: null },
})) {
  test(`owned version rejects ${label}`, async () => {
    await assert.rejects(inspect(response(change)), { message: 'browser-version' });
  });
}

for (const [label, url] of Object.entries({
  external: debuggerUrl.replace('127.0.0.1', 'outside.invalid'),
  port: debuggerUrl.replace('49152', '49153'), credentials: debuggerUrl.replace('ws://', 'ws://user:pass@'),
  query: `${debuggerUrl}?extra=1`, fragment: `${debuggerUrl}#fragment`, protocol: debuggerUrl.replace('ws:', 'wss:'),
  path: debuggerUrl.replace('/devtools/browser/', '/arbitrary/'), normalized: debuggerUrl.replace('/devtools/', '/other/../devtools/'),
})) {
  test(`owned version rejects ${label} debugger URL`, async () => {
    await assert.rejects(inspect(response({ value: { ...versionInfo, webSocketDebuggerUrl: url } })), { message: 'browser-version' });
  });
}

test('stream reads enforce 64 KiB independent of header and cancel excess data', async () => {
  let cancelled = false; let pulls = 0;
  const body = new ReadableStream({ pull(c) { pulls++; c.enqueue(Buffer.alloc(16384)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(inspect(response({ body })), { message: 'browser-version' });
  assert.equal(cancelled, true); assert.equal(pulls, 5);
  const bytes = Buffer.from(JSON.stringify(versionInfo).padEnd(65536, ' '));
  assert.deepEqual(await inspect(response({ bytes, headers: { 'content-length': '65536' } })),
    { version: versionInfo.Browser, debuggerUrl });
});

test('one deadline bounds headers and stalled body, even with uncooperative cancellation', async () => {
  let signal;
  await assert.rejects(readOwnedBrowserVersion(49152, { timeoutMs: 10,
    fetchImpl: async (_, options) => { signal = options.signal; return new Promise(() => {}); },
  }), { message: 'browser-version' });
  assert.equal(signal.aborted, true);
  let cancelled = false;
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  await assert.rejects(inspect(response({ body }), { timeoutMs: 10 }), { message: 'browser-version' });
  assert.equal(cancelled, true);
});

test('transport errors expose no raw URLs, private paths or response details', async () => {
  await assert.rejects(readOwnedBrowserVersion(49152, { fetchImpl: async () => { throw Error('http://outside.invalid /private/synthetic'); } }), { message: 'browser-version' });
});

test('HTTP metadata cannot select evidence path or be written as raw downloaded bytes', () => {
  const source = fs.readFileSync(new URL('../support/notification_release_probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /const output = path\.join\(root, 'build\/notification-release-evidence'\)/u);
  assert.match(source, /const file = path\.join\(output, `readback-\$\{Date\.now\(\)\}\.json`\); fs\.writeFileSync\(file, JSON\.stringify\(evidence, null, 2\), \{ flag: 'wx' \}\)/u);
  assert.match(source, /version: info\.version/u);
  assert.doesNotMatch(source, /response\.arrayBuffer|response\.json\(|response\.text\(/u);
});

test('only exact loopback-origin inventoried assets are admitted', () => {
  assert.equal(assetName(`${origin}/`, origin, files), 'index.html');
  assert.equal(assetName(`${origin}/main.dart.js`, origin, files), 'main.dart.js');
  assert.equal(assetName(`${origin}/canvaskit/canvaskit.wasm`, origin, files), 'canvaskit/canvaskit.wasm');
  for (const value of [
    'https://shareittoo.com/api/v1/notifications', 'https://outside.invalid/',
    'http://127.0.0.1:49153/main.dart.js', `${origin}/main.dart.js?token=synthetic`,
    `${origin}/main.dart.js#fragment`, `${origin}/api/v1/notifications`,
    `${origin}/%6dain.dart.js`, `${origin}/.env`, 'data:text/plain,synthetic',
    'http://user@127.0.0.1:49152/main.dart.js',
  ]) assert.equal(assetName(value, origin, files), null);
});

test('release/relaunch matrix requires every ordered pass, not partial completion', () => {
  const rows = ['initial-owner', 'current-cta-opens-chat', 'page-reload-read', 'process-relaunch-read',
    'renter-after-switch', 'old-row-rejected', 'owner-new-session',
    'same-owner-session-detail-closed', 'old-cta-rejected', 'logout-empty',
    'logout-page-reload-empty', 'logout-process-relaunch-empty'].map(phase => ({ phase, passed: true }));
  assert.doesNotThrow(() => checkMatrix(rows));
  assert.throws(() => checkMatrix(rows.slice(0, -1)), /matrix-phases/);
  assert.throws(() => checkMatrix([...rows].reverse()), /matrix-phases/);
  assert.throws(() => checkMatrix(rows.map((r, i) => i === 2 ? { ...r, passed: false } : r)), /matrix-failure/);
});
