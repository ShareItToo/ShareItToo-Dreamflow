// Owned macOS release-Web acceptance. No user browser/profile/provider access.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolateGoogleRegistrationGraph, inventoryTree, artifactDigest,
  validateIsolatedRegistrant } from './mission_web_history_build.mjs';
import { launchArgs, policy } from './mission_web_entry_browser_probe.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const flutter = '/opt/homebrew/bin/flutter';
const prefix = 'sit-notification-release-';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, code) => { if (!value) throw Error(code); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => fs.readFileSync(file, 'utf8');
const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' });
// Flutter 3.41.7's own headless test launcher uses these flags. Chromium's
// nested sandbox stalls Page.enable on this macOS host; Seatbelt remains the
// enforced outer network boundary. This is test-runner debt, not release flags.
export const headlessTestFlags = ['--no-sandbox', '--disable-gpu', '--window-size=1024,900'];

// The only HTTP-derived persisted field is a validated browser version, never a
// download or a destination path. Keep the owned DevTools handshake loopback-only
// even though this supervisor runs outside Chrome's network sandbox.
export async function readOwnedBrowserVersion(port, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const code = 'browser-version';
  check(Number.isInteger(port) && port > 0 && port < 65536
    && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 3000, code);
  const url = `http://127.0.0.1:${port}/json/version`;
  const controller = new AbortController(); const expiresAt = performance.now() + timeoutMs;
  let response; let reader; let complete = false;
  const bounded = async operation => {
    const remaining = expiresAt - performance.now(); check(remaining > 0, code);
    let timer;
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Error(code)); }, remaining);
      })]);
    } finally { clearTimeout(timer); }
  };
  try {
    response = await bounded(() => fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
    }));
    check(response.status === 200 && response.redirected === false && response.url === url, code);
    check(/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? ''), code);
    const encoding = response.headers.get('content-encoding'); check(encoding === null || encoding === 'identity', code);
    const length = response.headers.get('content-length'); const maximum = 65536;
    check(length === null || (/^[1-9][0-9]{0,4}$/u.test(length) && Number(length) <= maximum), code);
    const bytes = Buffer.alloc(maximum); let size = 0;
    reader = response.body.getReader();
    while (true) {
      const { done, value } = await bounded(() => reader.read());
      if (done) break;
      check(value instanceof Uint8Array && value.length > 0 && value.length <= maximum - size, code);
      bytes.set(value, size); size += value.length;
    }
    check(size > 0 && (length === null || Number(length) === size), code);
    const info = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
    check(info !== null && typeof info === 'object' && !Array.isArray(info)
      && typeof info.Browser === 'string'
      && /^(?:Headless)?Chrome\/[0-9]{1,4}(?:\.[0-9]{1,5}){3}$/u.test(info.Browser)
      && typeof info.webSocketDebuggerUrl === 'string' && info.webSocketDebuggerUrl.length <= 128, code);
    const ws = new URL(info.webSocketDebuggerUrl);
    check(ws.protocol === 'ws:' && ws.hostname === '127.0.0.1' && ws.port === String(port)
      && !ws.username && !ws.password && !ws.search && !ws.hash
      && ws.href === info.webSocketDebuggerUrl
      && /^\/devtools\/browser\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(ws.pathname), code);
    complete = true;
    // Discard all other response fields; do not persist URLs, arbitrary text or bytes.
    return Object.freeze({ version: info.Browser, debuggerUrl: ws.href });
  } catch { throw Error(code); }
  finally {
    if (!complete) {
      controller.abort();
      try { Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(() => {}); } catch {}
    }
    try { reader?.releaseLock(); } catch {}
  }
}

export function assetName(raw, origin, files) {
  let url; try { url = new URL(raw); } catch { return null; }
  if (url.origin !== origin || url.search || url.hash || url.username || url.password) return null;
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  return /^[\w./-]+$/u.test(name) && !name.split('/').some(p => !p || p === '.' || p === '..')
    && files.has(name) ? name : null;
}

export function checkMatrix(matrix) {
  const expected = ['initial-owner', 'current-cta-opens-chat', 'page-reload-read', 'process-relaunch-read',
    'renter-after-switch', 'old-row-rejected', 'owner-new-session',
    'same-owner-session-detail-closed', 'old-cta-rejected', 'logout-empty',
    'logout-page-reload-empty', 'logout-process-relaunch-empty'];
  check(JSON.stringify(matrix.map(r => r.phase)) === JSON.stringify(expected), 'matrix-phases');
  check(matrix.every(r => r.passed === true), 'matrix-failure');
}

async function command(bin, args, cwd, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, detached: true,
      env: { ...process.env, CI: 'true', FLUTTER_SUPPRESS_ANALYTICS: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', b => { output = (output + b).slice(-16000); });
    child.stderr.on('data', b => { output = (output + b).slice(-16000); });
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 || signal) {
        process.stderr.write(output); reject(Error('owned-command-failed'));
      } else resolve(output);
    });
  });
}

async function build(directory) {
  const checkout = path.join(directory, 'checkout'); fs.mkdirSync(checkout);
  const sourceHead = git('rev-parse', 'HEAD').trim();
  const names = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'lib', 'assets', 'pubspec.yaml', 'pubspec.lock',
    'test/support/test_builders.dart', 'test/support/notification_release_harness.dart')
    .split('\0').filter(Boolean))].sort();
  const sources = names.map(name => {
    const source = path.join(root, name); const stat = fs.lstatSync(source);
    check(stat.isFile() && !stat.isSymbolicLink(), 'source-file');
    const bytes = fs.readFileSync(source); const target = path.join(checkout, name);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
    return { path: name, sha256: hash(bytes) };
  });
  check(sources.every(s => hash(fs.readFileSync(path.join(root, s.path))) === s.sha256), 'source-copy-race');
  fs.mkdirSync(path.join(checkout, 'web'));
  fs.writeFileSync(path.join(checkout, 'web/index.html'), '<!doctype html><html lang="de"><head><base href="/"><meta charset="UTF-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script src="flutter_bootstrap.js" defer></script></body></html>');
  fs.writeFileSync(path.join(checkout, 'web/flutter_bootstrap.js'), '{{flutter_js}}\n{{flutter_build_config}}\n_flutter.loader.load({config:{canvasKitBaseUrl:"canvaskit/"}});\n');
  const flutterRun = args => command('/usr/bin/sandbox-exec', ['-p', policy, flutter,
    '--suppress-analytics', '--no-version-check', ...args], checkout);
  process.stdout.write('phase=offline-dependencies\n');
  await flutterRun(['pub', 'get', '--offline', '--enforce-lockfile']);
  const graphPath = path.join(checkout, '.dart_tool/package_graph.json');
  const before = read(graphPath); const after = isolateGoogleRegistrationGraph(before);
  const registrantBefore = read(path.join(checkout, '.dart_tool/dartpad/web_plugin_registrant.dart'));
  fs.writeFileSync(graphPath, after);
  // Test-only plugin discovery isolation, identical bounded seam to the
  // accepted history harness. Production package graph/source remain untouched.
  const args = ['build', 'web', '--release', '--no-pub', '--no-web-resources-cdn',
    '--pwa-strategy=none', '--target=test/support/notification_release_harness.dart',
    ...['SIT_BACKEND_ENABLED', 'SIT_SOCIAL_GOOGLE_ENABLED', 'SIT_SOCIAL_APPLE_ENABLED',
      'SIT_SOCIAL_FACEBOOK_ENABLED'].map(name => `--dart-define=${name}=false`)];
  process.stdout.write('phase=release-build\n'); await flutterRun(args);
  const web = path.join(checkout, 'build/web'); const files = inventoryTree(web);
  const registrants = fs.readdirSync(path.join(checkout, '.dart_tool/flutter_build'), { recursive: true })
    .filter(name => /^[a-f0-9]{32}\/web_plugin_registrant\.dart$/u.test(name));
  check(registrants.length === 1, 'registrant-count');
  const registrantAfter = read(path.join(checkout, '.dart_tool/flutter_build', registrants[0]));
  validateIsolatedRegistrant(registrantBefore, registrantAfter, files.filter(f => /\.(js|html)$/u.test(f.path)).map(f => read(path.join(web, f.path))));
  check(read(graphPath) === after && sources.every(s => hash(fs.readFileSync(path.join(checkout, s.path))) === s.sha256), 'build-source-drift');
  return { web, files, sourceHead, sources, sourceDigest: hash(JSON.stringify(sources)),
    artifactDigest: artifactDigest(files), buildArgs: args,
    registrationIsolation: { scope: 'temporary-test-checkout-only', before: hash(before), after: hash(after), registrant: hash(registrantAfter) } };
}

async function browser(profile, origin, files, network) {
  const activePort = path.join(profile, 'DevToolsActivePort');
  if (fs.existsSync(activePort)) fs.unlinkSync(activePort);
  const child = spawn('/usr/bin/sandbox-exec', ['-p', policy, chrome, ...headlessTestFlags, ...launchArgs(profile)],
    { detached: true, stdio: 'ignore' });
  let exited = false; let exitCode; let exitSignal; let socket; let port;
  child.once('exit', (code, signal) => { exited = true; exitCode = code; exitSignal = signal; });
  const pending = new Map(); let nextId = 0; let session;
  const alive = () => { try { process.kill(-child.pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
  async function stop() {
    socket?.close();
    if (alive()) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    for (let i = 0; i < 50 && alive(); i++) await delay(100);
    if (alive()) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    for (let i = 0; i < 30 && (!exited || alive()); i++) await delay(100);
    check(exited && !alive(), 'browser-cleanup');
    const references = execFileSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(profile));
    check(references.length === 0, 'browser-profile-process-leak');
    if (port) {
      const closed = await new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port });
        const done = value => { socket.destroy(); resolve(value); };
        socket.once('connect', () => done(false)); socket.once('error', e => done(e.code === 'ECONNREFUSED'));
        socket.setTimeout(1000, () => done(false));
      });
      check(closed, 'browser-port-leak');
    }
    return { exited, groupAbsent: !alive(), profileReferences: 0, portClosed: true, exitCode, exitSignal };
  }
  const cdp = (method, params = {}, sid = session) => new Promise((resolve, reject) => {
    const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(Error(`cdp-timeout:${method}`)); }, 5000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });
  try {
    for (let i = 0; i < 150 && !exited; i++) {
      if (fs.existsSync(activePort)) { port = Number(read(activePort).split('\n')[0]); break; }
      await delay(100);
    }
    check(port > 0 && port < 65536 && !exited, 'browser-start');
    const info = await readOwnedBrowserVersion(port);
    socket = new WebSocket(info.debuggerUrl);
    socket.addEventListener('message', event => {
      const value = JSON.parse(event.data); const p = pending.get(value.id);
      if (p) { pending.delete(value.id); value.error ? p.reject(Error(`cdp-error:${value.error.code}`)) : p.resolve(value.result); return; }
      if (value.method === 'Runtime.exceptionThrown') network.runtimeErrors++;
      if (value.method !== 'Fetch.requestPaused') return;
      const req = value.params; const name = assetName(req.request.url, origin, files);
      if (req.request.method !== 'GET' || !name) {
        network.blocked++; cdp('Fetch.failRequest', { requestId: req.requestId, errorReason: 'BlockedByClient' }).catch(() => { network.controlErrors++; });
      } else {
        network.allowed++; cdp('Fetch.continueRequest', { requestId: req.requestId }).catch(() => { network.controlErrors++; });
      }
    });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('browser-socket')), { once: true }); });
    const targets = (await cdp('Target.getTargets', {}, null)).targetInfos;
    check(targets.filter(t => t.type === 'page').length === 1 && !targets.some(t => ['service_worker', 'background_page'].includes(t.type) || t.url.startsWith('chrome-extension:')), 'fresh-profile-targets');
    const blank = targets.find(t => t.type === 'page' && t.url === 'about:blank'); check(blank, 'blank-page');
    session = (await cdp('Target.attachToTarget', { targetId: blank.targetId, flatten: true }, null)).sessionId;
    for (const method of ['Page.enable', 'Runtime.enable', 'Accessibility.enable']) await cdp(method);
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      check(!result.exceptionDetails, 'evaluation'); return result.result?.value;
    };
    return { pid: child.pid, version: info.version, cdp, evaluate, stop,
      async close() { await cdp('Browser.close', {}, null); for (let i = 0; i < 50 && !exited; i++) await delay(100); return stop(); } };
  } catch (error) { await stop(); throw error; }
}

export async function run() {
  check(process.platform === 'darwin', 'macos-only');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const identity = fs.lstatSync(directory); const matrix = []; const cleanup = [];
  const network = { allowed: 0, blocked: 0, runtimeErrors: 0, controlErrors: 0, serverRejected: 0 };
  let app; let server; let evidence;
  try {
    const denied = await command('/usr/bin/sandbox-exec', ['-p', policy, process.execPath, '--input-type=module', '-e',
      "import net from 'node:net';const s=net.connect({host:'192.0.2.1',port:443});s.once('connect',()=>{s.destroy();process.exit(2)});s.once('error',e=>{console.log(e.code);process.exit(e.code==='EPERM'?0:3)});s.setTimeout(1500,()=>{s.destroy();process.exit(4)});"], root, 5000);
    check(denied.trim() === 'EPERM', 'kernel-network-denial');
    const artifact = await build(directory); const files = new Map(artifact.files.map(f => [f.path, f]));
    const profile = path.join(directory, 'profile'); fs.mkdirSync(profile, { mode: 0o700 });
    let origin;
    server = http.createServer((req, res) => {
      const name = assetName(`${origin}${req.url}`, origin, files);
      if (req.method !== 'GET' || !name) { network.serverRejected++; res.writeHead(404); res.end(); return; }
      const bytes = fs.readFileSync(path.join(artifact.web, name)); check(hash(bytes) === files.get(name).sha256, 'served-artifact-drift');
      const mime = { html: 'text/html', js: 'text/javascript', json: 'application/json', wasm: 'application/wasm', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[name.split('.').at(-1)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
    const instances = []; const pids = []; let version;
    async function launch() {
      app = await browser(profile, origin, files, network); pids.push(app.pid); version = app.version;
      await app.cdp('Page.navigate', { url: `${origin}/` });
    }
    async function observe(predicate, code) {
      let diagnostic;
      for (let i = 0; i < 150; i++) {
        check(network.blocked === 0 && network.runtimeErrors === 0 && network.controlErrors === 0 && network.serverRejected === 0, 'network-or-runtime-failure');
        const ax = (await app.cdp('Accessibility.getFullAXTree')).nodes ?? [];
        const state = await app.evaluate(`({mode:document.documentElement.dataset.sitMode,instance:document.documentElement.dataset.sitInstance,failure:document.documentElement.dataset.sitFailure,rows:JSON.parse(JSON.parse(localStorage.getItem('flutter.notifications')||'"[]"')),session:!!localStorage.getItem('flutter.auth_session_v1')})`);
        diagnostic = { mode: state.mode, session: state.session, rowCount: state.rows.length,
          ax: ax.filter(n => /owner|renter|gelesen|nachricht|anmelden|Sitzung/i.test(String(n.name?.value ?? '')))
            .map(n => ({ role: n.role?.value, name: n.name?.value, value: n.value?.value, description: n.description?.value })).slice(0, 15) };
        if (state.failure) throw Error('fixture-failure');
        if (state.mode === 'release-provider-off' && predicate(ax, state)) return { ax, state };
        await delay(100);
      }
      process.stderr.write(`synthetic-diagnostic:${JSON.stringify(diagnostic)}\n`);
      throw Error(`observation-timeout:${code}`);
    }
    const contains = (ax, value) => ax.some(n => String(n.name?.value ?? '').includes(value));
    const row = (ax, value, status) => ax.some(n => n.role?.value === 'button' && String(n.name?.value ?? '').includes(value) &&
      [n.name?.value, n.value?.value, n.description?.value].some(v => String(v ?? '').includes(status)));
    const own = (ax, user) => contains(ax, `${user} booking update`) && !contains(ax, 'foreign thread update') &&
      !contains(ax, `${user === 'owner' ? 'renter' : 'owner'} booking update`);
    const record = phase => { matrix.push({ phase, passed: true }); process.stdout.write(`phase=${phase}:pass\n`); };
    async function click(label) {
      const point = await app.evaluate(`(()=>{const e=[...document.querySelectorAll('[role="button"]')].find(e=>(e.getAttribute('aria-label')||e.textContent||'').includes(${JSON.stringify(label)}));if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      check(point && Number.isFinite(point.x), 'click-target');
      for (const type of ['mousePressed', 'mouseReleased']) await app.cdp('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
    }
    async function fixture(cmd) {
      const before = await app.evaluate('document.documentElement.dataset.sitAck');
      await app.evaluate(`document.dispatchEvent(new CustomEvent('sit-notification-command',{detail:${JSON.stringify(cmd)}}));true`);
      for (let i = 0; i < 50; i++) { const ack = await app.evaluate('document.documentElement.dataset.sitAck'); if (ack !== before && ack?.endsWith(`:${cmd}`)) return; await delay(100); }
      throw Error('fixture-ack');
    }
    await launch();
    const initial = await observe((ax, s) => own(ax, 'owner') && row(ax, 'owner thread update', 'Ungelesen') && s.rows.length === 4, 'initial');
    instances.push(initial.state.instance); record('initial-owner');
    await click('owner thread update');
    await observe((ax, s) => contains(ax, 'Zum Chat') && s.rows.find(r => r.id === 'owner-thread')?.read === true, 'read');
    await click('Zum Chat');
    await observe(ax => contains(ax, 'Synthetic item') && !contains(ax, 'owner thread update'), 'current-cta');
    record('current-cta-opens-chat');
    await app.cdp('Page.reload', { ignoreCache: true });
    const reloaded = await observe((ax, s) => s.instance !== instances[0] && own(ax, 'owner') && row(ax, 'owner thread update', 'Gelesen') && s.rows.length === 4, 'reload');
    instances.push(reloaded.state.instance); record('page-reload-read');
    cleanup.push(await app.close()); app = null; await launch();
    const relaunched = await observe((ax, s) => !instances.includes(s.instance) && own(ax, 'owner') && row(ax, 'owner thread update', 'Gelesen') && s.rows.length === 4, 'relaunch');
    instances.push(relaunched.state.instance); record('process-relaunch-read');
    await fixture('capture-row'); await click('owner thread update');
    await observe(ax => contains(ax, 'Zum Chat'), 'detail'); await fixture('capture-cta');
    await fixture('renter'); await observe(ax => own(ax, 'renter') && !contains(ax, 'Zum Chat') && !contains(ax, 'owner thread update'), 'switch'); record('renter-after-switch');
    await fixture('replay-row'); await fixture('replay-cta'); await delay(300);
    await observe(ax => own(ax, 'renter') && !contains(ax, 'Zum Chat') && !contains(ax, 'owner thread update'), 'stale-row'); record('old-row-rejected');
    await fixture('owner'); await observe(ax => own(ax, 'owner') && row(ax, 'owner thread update', 'Gelesen'), 'owner'); record('owner-new-session');
    await click('owner thread update'); await observe(ax => contains(ax, 'Zum Chat'), 'same-owner-detail'); await fixture('capture-cta');
    await fixture('owner'); await observe(ax => own(ax, 'owner') && !contains(ax, 'Zum Chat'), 'same-owner-switch'); record('same-owner-session-detail-closed');
    await fixture('replay-row'); await fixture('replay-cta'); await delay(300); await observe(ax => own(ax, 'owner') && !contains(ax, 'Zum Chat') && !contains(ax, 'Synthetic item'), 'stale-cta'); record('old-cta-rejected');
    await click('owner thread update'); await observe(ax => contains(ax, 'Zum Chat'), 'logout-detail');
    await fixture('logout');
    const empty = (ax, s) => !s.session && !contains(ax, 'owner thread update') && !contains(ax, 'owner booking update') && !contains(ax, 'renter booking update') && !contains(ax, 'Zum Chat');
    const loggedOut = await observe(empty, 'logout'); record('logout-empty');
    await app.cdp('Page.reload', { ignoreCache: true });
    const emptyReload = await observe((ax, s) => s.instance !== loggedOut.state.instance && empty(ax, s), 'logout-reload'); record('logout-page-reload-empty');
    cleanup.push(await app.close()); app = null; await launch();
    await observe((ax, s) => s.instance !== emptyReload.state.instance && empty(ax, s), 'logout-relaunch'); record('logout-process-relaunch-empty');
    cleanup.push(await app.close()); app = null;
    checkMatrix(matrix); check(new Set(pids).size === 3, 'new-browser-processes');
    check(artifactDigest(inventoryTree(artifact.web)) === artifact.artifactDigest, 'artifact-drift');
    evidence = { schemaVersion: 1, status: 'pass', sourceHead: artifact.sourceHead, sourceDigest: artifact.sourceDigest,
      artifactDigest: artifact.artifactDigest, sourceFiles: artifact.sources, buildFiles: artifact.files,
      buildArgs: artifact.buildArgs, registrationIsolation: artifact.registrationIsolation,
      runnerSources: ['test/support/notification_release_probe.mjs', 'test/support/mission_web_history_build.mjs',
        'test/support/mission_web_entry_browser_probe.mjs', 'test/tool/notification_release_probe.test.mjs']
        .map(name => ({ path: name, sha256: hash(fs.readFileSync(path.join(root, name))) })),
      browser: version, toolchain: await command('/usr/bin/sandbox-exec', ['-p', policy, flutter, '--suppress-analytics', '--no-version-check', '--version', '--machine'], root),
      headlessTestFlags, kernelExternalConnectDenied: denied.trim() === 'EPERM',
      matrix, network, threeDistinctBrowserProcesses: true, cleanup, scope: 'synthetic-release-harness-not-AppRoot-or-human-AT' };
  } finally {
    if (app) cleanup.push(await app.stop());
    if (server) await new Promise(resolve => server.close(resolve));
    const now = fs.lstatSync(directory);
    check(path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith(prefix)
      && now.isDirectory() && !now.isSymbolicLink() && now.ino === identity.ino && now.dev === identity.dev, 'temp-cleanup-target');
    fs.rmSync(directory, { recursive: true, force: false });
    check(!fs.existsSync(directory), 'temp-cleanup');
  }
  evidence.tempRemoved = true;
  const output = path.join(root, 'build/notification-release-evidence'); fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, `readback-${Date.now()}.json`); fs.writeFileSync(file, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: evidence.status, artifactDigest: evidence.artifactDigest, sourceDigest: evidence.sourceDigest, matrix: matrix.length, network, evidence: file, evidenceSha256: hash(fs.readFileSync(file)), tempRemoved: true }) + '\n');
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check(process.argv.length === 3 && process.argv[2] === '--run', 'arguments');
  run().catch(error => { process.stderr.write(`notification-release: ${error.message}\n`); process.exitCode = 1; });
}
