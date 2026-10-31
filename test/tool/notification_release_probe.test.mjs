import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { assetName, checkMatrix, readOwnedBrowserVersion, readProbeSourceFile,
  notificationActionExpression, notificationDiagnostic, notificationFailureCode,
  notificationToolchainMetadata } from '../support/notification_release_probe.mjs';

const origin = 'http://127.0.0.1:49152';
const files = new Set(['index.html', 'main.dart.js', 'canvaskit/canvaskit.wasm']);

test('browser action code uses only literal selectors and fixture commands', () => {
  for (const label of ['owner thread update', 'Zum Chat']) {
    const expression = notificationActionExpression('click', label);
    const context = { document: { querySelectorAll: () => [{
      getAttribute: () => label, getBoundingClientRect: () => ({ x: 10, y: 20, width: 8, height: 6 }),
    }] } };
    assert.equal(JSON.stringify(vm.runInNewContext(expression, context)), '{"x":14,"y":23}');
    assert.equal(vm.runInNewContext(expression, { document: { querySelectorAll: () => [] } }), null);
  }
  for (const cmd of ['capture-row', 'capture-cta', 'replay-row', 'replay-cta', 'renter', 'owner', 'logout']) {
    const events = [];
    const context = { document: { dispatchEvent: event => events.push(event) },
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
    assert.equal(vm.runInNewContext(notificationActionExpression('fixture', cmd), context), true);
    assert.deepEqual(events.map(({ type, detail }) => ({ type, detail })), [{ type: 'sit-notification-command', detail: cmd }]);
  }
});

test('untrusted labels, commands and action names never become executable source', () => {
  for (const value of ['\");globalThis.injected=true;//', "');globalThis.injected=true;//", '</script>',
    'owner thread update\n', 'https://provider.invalid/private', '/private/synthetic', '__proto__', 'toString',
    1, null, { toJSON: () => 'owner' }]) {
    for (const action of ['click', 'fixture', 'untrusted']) {
      assert.throws(() => notificationActionExpression(action, value), { message: 'probe-action' });
    }
  }
});

test('timeout diagnostics preserve only bounded counts and booleans, never raw AX/provider/path data', () => {
  const raw = 'owner https://provider.invalid/private /Users/synthetic token browser-error';
  const ax = [{ role: { value: raw }, name: { value: raw }, value: { value: raw }, description: { value: raw } }];
  const diagnostic = notificationDiagnostic(ax, { mode: raw, session: raw, rows: [raw], failure: raw, instance: raw });
  assert.deepEqual(diagnostic, { providerOff: false, session: false, rowCount: 1, accessibilityNodeCount: 1 });
  assert.doesNotMatch(JSON.stringify(diagnostic), /provider\.invalid|Users|token|browser-error|owner/u);
  assert.deepEqual(notificationDiagnostic(new Array(10001), { mode: 'release-provider-off', session: true, rows: new Array(10001) }),
    { providerOff: true, session: true, rowCount: 10000, accessibilityNodeCount: 10000 });
  assert.deepEqual(notificationDiagnostic(raw, { rows: { length: raw } }),
    { providerOff: false, session: false, rowCount: null, accessibilityNodeCount: null });
});

test('failure output accepts exact static codes only and never reads a changing error twice', () => {
  for (const message of ['https://provider.invalid/private', '/Users/synthetic/private', 'owned-command-failed\nprivate',
    'cdp-error:provider details', 'observation-timeout:private', '<script>', 'x'.repeat(20000)]) {
    assert.equal(notificationFailureCode(new Error(message)), 'probe-failure');
  }
  assert.equal(notificationFailureCode(new Error('owned-command-failed')), 'owned-command-failed');
  assert.equal(notificationFailureCode({ get message() { throw Error('private'); } }), 'probe-failure');
  let reads = 0;
  assert.equal(notificationFailureCode({ get message() { return ++reads === 1 ? 'evaluation' : '/private/path'; } }), 'evaluation');
  assert.equal(reads, 1);
});

test('toolchain evidence drops raw output and unrelated fields instead of persisting private paths', () => {
  const fields = { frameworkVersion: '3.41.7', frameworkRevision: 'a'.repeat(40), dartSdkVersion: '3.11.5' };
  assert.equal(notificationToolchainMetadata(JSON.stringify({ ...fields, flutterRoot: '/private/path', providerError: 'raw error' })), JSON.stringify(fields));
  for (const raw of ['invalid /private/path', 'x'.repeat(16001), 'null', JSON.stringify({ ...fields, dartSdkVersion: '/private/path' }),
    JSON.stringify({ ...fields, frameworkVersion: 'https://provider.invalid' }), JSON.stringify({ ...fields, frameworkRevision: { raw: 'private' } })]) {
    assert.throws(() => notificationToolchainMetadata(raw), { message: 'toolchain-metadata' });
  }
});

test('probe routes diagnostics, command failure and evidence through safe projections', () => {
  const source = fs.readFileSync(new URL('../support/notification_release_probe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /JSON\.stringify\((?:label|cmd)\)|process\.stderr\.write\(output\)|\$\{error\.message\}/u);
  assert.match(source, /diagnostic = notificationDiagnostic\(ax, state\)/u);
  assert.match(source, /toolchain: notificationToolchainMetadata\(await command/u);
  assert.match(source, /notification-release: \$\{notificationFailureCode\(error\)\}/u);
});
function sourceFixture(t) {
  const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-notification-source-')));
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
  const root = path.join(outer, 'source'); fs.mkdirSync(root, { mode: 0o700 });
  const parent = path.join(root, 'nested'); fs.mkdirSync(parent, { mode: 0o700 });
  const file = path.join(parent, 'fixture.dart'); const bytes = Buffer.from('synthetic source bytes');
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  return { root, parent, file, name: 'nested/fixture.dart', bytes };
}

test('source snapshot reads exact bytes on a retained descriptor, including short reads', (t) => {
  const f = sourceFixture(t); const original = fs.readSync; const descriptors = [];
  fs.chmodSync(f.file, 0o644); // Ordinary repository files need not be private 0600 files.
  t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
    descriptors.push(fd); return original(fd, buffer, offset, Math.min(length, 3), position);
  });
  assert.deepEqual(readProbeSourceFile(f.root, f.name), f.bytes);
  assert.equal(new Set(descriptors).size, 1); assert.ok(descriptors.length > 2);
});

for (const variant of ['symlink', 'directory-symlink', 'hardlink', 'writable', 'directory', 'oversized', 'traversal']) {
  test(`source snapshot rejects ${variant} before reading`, (t) => {
    const f = sourceFixture(t); let name = f.name;
    if (variant === 'symlink') { fs.renameSync(f.file, `${f.file}.original`); fs.symlinkSync(`${f.file}.original`, f.file); }
    if (variant === 'directory-symlink') { fs.renameSync(f.parent, `${f.parent}.original`); fs.symlinkSync(`${f.parent}.original`, f.parent, 'dir'); }
    if (variant === 'hardlink') fs.linkSync(f.file, `${f.file}.linked`);
    if (variant === 'writable') fs.chmodSync(f.file, 0o666);
    if (variant === 'directory') { fs.unlinkSync(f.file); fs.mkdirSync(f.file); }
    if (variant === 'oversized') fs.truncateSync(f.file, 16 * 1024 * 1024 + 1);
    if (variant === 'traversal') name = '../outside';
    let reads = 0; t.mock.method(fs, 'readSync', () => { reads++; throw Error('unexpected read'); });
    assert.throws(() => readProbeSourceFile(f.root, name), { message: 'source-file' });
    assert.equal(reads, 0);
  });
}

for (const variant of ['file-open', 'parent-open', 'file-replacement', 'parent-replacement', 'parent-alias', 'root-replacement', 'growth', 'truncate', 'same-size-write', 'mode', 'hardlink']) {
  test(`source snapshot fails closed on ${variant} race`, (t) => {
    const f = sourceFixture(t); const originalOpen = fs.openSync; const originalRead = fs.readSync;
    let changed = false; let totalRead = 0;
    const mutate = () => {
      changed = true;
      if (variant === 'file-open' || variant === 'file-replacement') {
        fs.renameSync(f.file, `${f.file}.old`); fs.writeFileSync(f.file, f.bytes, { mode: 0o600 });
      } else if (variant === 'parent-open' || variant === 'parent-replacement') {
        fs.renameSync(f.parent, `${f.parent}.old`); fs.mkdirSync(f.parent, { mode: 0o700 }); fs.writeFileSync(f.file, f.bytes, { mode: 0o600 });
      } else if (variant === 'parent-alias') {
        fs.renameSync(f.parent, `${f.parent}.old`); fs.symlinkSync(`${f.parent}.old`, f.parent, 'dir');
      } else if (variant === 'root-replacement') {
        fs.renameSync(f.root, `${f.root}.old`); fs.mkdirSync(f.root, { mode: 0o700 });
        fs.mkdirSync(f.parent, { mode: 0o700 }); fs.writeFileSync(f.file, f.bytes, { mode: 0o600 });
      } else if (variant === 'growth') fs.appendFileSync(f.file, Buffer.alloc(32768));
      else if (variant === 'truncate') fs.truncateSync(f.file, 1);
      else if (variant === 'same-size-write') fs.writeFileSync(f.file, Buffer.alloc(f.bytes.length, 65));
      else if (variant === 'mode') fs.chmodSync(f.file, 0o644);
      else if (variant === 'hardlink') fs.linkSync(f.file, `${f.file}.linked`);
    };
    t.mock.method(fs, 'openSync', (target, ...args) => {
      const fd = originalOpen(target, ...args);
      if (!changed && ((variant === 'file-open' && target === f.file) || (variant === 'parent-open' && target === f.parent))) mutate();
      return fd;
    });
    t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
      if (!changed) mutate();
      assert.ok(buffer.length <= f.bytes.length);
      const count = originalRead(fd, buffer, offset, length, position); totalRead += count; return count;
    });
    assert.throws(() => readProbeSourceFile(f.root, f.name), { message: /^(?:source-file|source-file-changed)$/u });
    assert.equal(changed, true); assert.ok(totalRead <= f.bytes.length + 1);
    if (variant.endsWith('-open')) assert.equal(totalRead, 0);
  });
}

for (const operation of ['openSync', 'readSync', 'closeSync']) {
  test(`source ${operation} failure is sanitized and releases acquired descriptors`, (t) => {
    const f = sourceFixture(t); const originalOpen = fs.openSync; const originalClose = fs.closeSync;
    const opened = []; const closed = [];
    t.mock.method(fs, 'openSync', (...args) => {
      if (operation === 'openSync') throw Error('/private/synthetic/source');
      const fd = originalOpen(...args); opened.push(fd); return fd;
    });
    t.mock.method(fs, 'closeSync', fd => {
      originalClose(fd); closed.push(fd); if (operation === 'closeSync') throw Error('/private/synthetic/source');
    });
    if (operation === 'readSync') t.mock.method(fs, 'readSync', () => { throw Error('/private/synthetic/source'); });
    assert.throws(() => readProbeSourceFile(f.root, f.name), { message: 'source-file' });
    assert.deepEqual(closed.toSorted(), opened.toSorted());
  });
}
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
