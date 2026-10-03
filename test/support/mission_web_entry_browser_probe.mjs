// Blank-only test support. No product imports, routes or app loading.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = 'Chrome/154.0.8037.93';
const protocol = '1.3';
const prefix = 'sit-d6-blank-preflight-';
export const policy = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
export const limits = Object.freeze({ startup: 10000, request: 3000, network: 6000, terminate: 3000, kill: 2000 });
const requireThat = (value, code) => { if (!value) throw Error(code); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const codes = new Set(['probe_arguments', 'probe_unsupported', 'probe_test_hooks', 'probe_aborted',
  'probe_startup', 'probe_timeout', 'probe_targets', 'probe_version', 'probe_network', 'probe_cleanup', 'probe_failure']);
const failure = code => ({ schemaVersion: 1, mode: 'blank-preflight', status: 'fail', code });
const checkAbort = signal => requireThat(!signal?.aborted, 'probe_aborted');

export function parseArgs(args) {
  requireThat(args.length === 1 && args[0] === '--blank-preflight', 'probe_arguments');
  return 'blank-preflight';
}
export function validateTargets(targets) {
  requireThat(Array.isArray(targets) && targets.length === 3, 'probe_targets');
  let browserUi = 0; let blankPages = 0;
  for (const target of targets) {
    let url; try { url = new URL(target?.url); } catch { throw Error('probe_targets'); }
    if (target.type === 'browser_ui' && url.protocol === 'chrome:') browserUi++;
    else if (target.type === 'page' && target.url === 'about:blank') blankPages++;
    else throw Error('probe_targets');
  }
  requireThat(browserUi === 2 && blankPages === 1, 'probe_targets');
  return { browserUi, blankPages, extensions: 0, other: 0 };
}
export function validateVersion(value) {
  requireThat(value?.httpStatus === 200 && value.browser === browser && value.protocol === protocol
    && value.cdpBrowser === browser && value.cdpProtocol === protocol, 'probe_version');
}
export function validateNetwork(value) {
  requireThat(value?.loopbackHttpStatus === 200 && value.externalTcp === 'EPERM', 'probe_network');
}
export function validateCleanup(value) {
  requireThat(value?.exitCode === 0 && value.exitSignal === null && value.processGroupAbsent === true
    && value.processReferences === 0 && value.portClosed === true && value.profileRemoved === true, 'probe_cleanup');
}
export function launchArgs(directory) {
  return ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-crash-reporter', '--disable-breakpad',
    '--disable-extensions', '--disable-component-extensions-with-background-pages', '--user-data-dir=' + directory,
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', 'about:blank'];
}

// The supervisor is deliberately outside the Chrome sandbox: sandboxed ps is
// denied on this host. Only the exact owned groups/profile may be stopped/removed.
function realAdapter() {
  let directory; let identity; let child; let port; let exitCode = null; let exitSignal = null;
  let exited = false; let socket; let closing;
  const auxiliary = new Set();
  const alive = pid => { try { process.kill(-pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false; throw error;
  } };
  const stop = async pid => {
    if (!pid || !alive(pid)) return;
    try { process.kill(-pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    for (let i = 0; i < limits.terminate / 100 && alive(pid); i++) await sleep(100);
    if (alive(pid)) { try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    for (let i = 0; i < limits.kill / 100 && alive(pid); i++) await sleep(100);
    requireThat(!alive(pid), 'probe_cleanup');
  };
  const readJson = async endpoint => {
    const response = await fetch('http://127.0.0.1:' + port + endpoint,
      { signal: AbortSignal.timeout(limits.request), redirect: 'error' });
    requireThat(response.status === 200, 'probe_version');
    const text = await response.text(); requireThat(text.length < 65536, 'probe_version');
    return { response, value: JSON.parse(text) };
  };
  return {
    async start(signal) {
      checkAbort(signal);
      const binary = await fs.lstat(chrome);
      requireThat(binary.isFile() && !binary.isSymbolicLink(), 'probe_startup');
      directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
      identity = await fs.lstat(directory); await fs.chmod(directory, 0o700);
      requireThat(identity.uid === process.getuid() && (identity.mode & 0o777) === 0o700, 'probe_startup');
      child = spawn('/usr/bin/sandbox-exec', ['-p', policy, chrome, ...launchArgs(directory)],
        { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
      child.once('error', () => { exited = true; });
      child.once('exit', (code, signal) => { exited = true; exitCode = code; exitSignal = signal; });
      for (let i = 0; i < limits.startup / 100 && !exited; i++) {
        checkAbort(signal);
        try {
          const file = path.join(directory, 'DevToolsActivePort');
          const stat = await fs.lstat(file);
          requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size < 1024, 'probe_startup');
          const raw = (await fs.readFile(file, 'utf8')).split('\n')[0];
          if (/^[0-9]{1,5}$/u.test(raw) && Number(raw) > 0 && Number(raw) <= 65535) { port = Number(raw); return; }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await sleep(100);
      }
      throw Error(exited ? 'probe_startup' : 'probe_timeout');
    },
    async observe() {
      const { response, value } = await readJson('/json/version');
      const { value: targets } = await readJson('/json/list');
      validateTargets(targets);
      const url = new URL(value.webSocketDebuggerUrl);
      requireThat(url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.port === String(port)
        && !url.username && !url.password && !url.search && !url.hash && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/u.test(url.pathname), 'probe_version');
      const cdp = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('probe_timeout')), limits.request);
        socket = new WebSocket(url);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.getVersion' })), { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('probe_version')); }, { once: true });
        socket.addEventListener('message', event => {
          try {
            requireThat(typeof event.data === 'string' && event.data.length < 65536, 'probe_version');
            const message = JSON.parse(event.data);
            if (message.id === 1) { clearTimeout(timer); resolve(message.result); }
          } catch { clearTimeout(timer); reject(Error('probe_version')); }
        });
      });
      return { targets, version: { httpStatus: response.status, browser: value.Browser, protocol: value['Protocol-Version'],
        cdpBrowser: cdp?.product, cdpProtocol: cdp?.protocolVersion } };
    },
    async network() {
      // Child inherits this exact sandbox policy. Connect only: never send data.
      const script = `import net from 'node:net';const r=await fetch('http://127.0.0.1:${port}/json/version',{signal:AbortSignal.timeout(3000),redirect:'error'});const externalTcp=await new Promise(resolve=>{const s=net.connect({host:'192.0.2.1',port:443});const done=v=>{s.destroy();resolve(v);};s.once('connect',()=>done('connected'));s.once('error',e=>done(e.code==='EPERM'?'EPERM':'other_error'));s.setTimeout(1500,()=>done('timeout'));});console.log(JSON.stringify({loopbackHttpStatus:r.status,externalTcp}));`;
      const probe = spawn('/usr/bin/sandbox-exec', ['-p', policy, process.execPath, '--input-type=module', '-e', script],
        { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
      if (probe.pid) auxiliary.add(probe.pid);
      let bytes = '';
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('probe_timeout')), limits.network);
          probe.stdout.on('data', chunk => { bytes = (bytes + chunk).slice(-4096); });
          probe.once('error', () => { clearTimeout(timer); reject(Error('probe_network')); });
          probe.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('probe_network')); });
        });
        return JSON.parse(bytes);
      } finally { await stop(probe.pid); auxiliary.delete(probe.pid); }
    },
    close() {
      return closing ??= (async () => {
        if (socket) { socket.addEventListener('error', () => {}); try { socket.close(); } catch {} }
        for (const pid of auxiliary) await stop(pid);
        if (child?.pid) {
          // Send one SIGTERM via stop; a second immediate signal can interrupt
          // Chrome's graceful exit. Never name-match user Chrome.
          await stop(child.pid);
          for (let i = 0; i < limits.kill / 100 && !exited; i++) await sleep(100);
        }
        const processGroupAbsent = !child?.pid || !alive(child.pid);
        const rows = execFileSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8', timeout: limits.request });
        const processReferences = directory ? rows.split('\n').filter(row => row.includes(directory)).length : 0;
        let portClosed = true;
        if (port) portClosed = await new Promise(resolve => {
          const probe = net.connect({ host: '127.0.0.1', port });
          const done = closed => { probe.destroy(); resolve(closed); };
          probe.once('connect', () => done(false));
          probe.once('error', error => done(error.code === 'ECONNREFUSED'));
          probe.setTimeout(500, () => done(false));
        });
        requireThat(processGroupAbsent && processReferences === 0 && portClosed, 'probe_cleanup');
        let profileRemoved = !directory;
        if (directory) {
          const current = await fs.lstat(directory);
          requireThat(path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith(prefix)
            && current.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino
            && current.dev === identity.dev && current.uid === process.getuid(), 'probe_cleanup');
          await fs.rm(directory, { recursive: true, force: false });
          try { await fs.lstat(directory); } catch (error) { profileRemoved = error.code === 'ENOENT'; }
        }
        return { exitCode, exitSignal, processGroupAbsent, processReferences, portClosed, profileRemoved };
      })();
    },
  };
}

export async function runBlankPreflight(options = {}) {
  const { signal } = options;
  if ((options.platform !== undefined || options.adapter !== undefined) && !process.env.NODE_TEST_CONTEXT) return failure('probe_test_hooks');
  if ((options.platform ?? process.platform) !== 'darwin') return failure('probe_unsupported');
  const adapter = options.adapter ?? realAdapter();
  let code; let targets; let clean;
  try {
    checkAbort(signal); await adapter.start(signal); checkAbort(signal);
    const observation = await adapter.observe(); checkAbort(signal);
    validateVersion(observation.version); targets = validateTargets(observation.targets);
    validateNetwork(await adapter.network()); checkAbort(signal);
  } catch (error) { code = codes.has(error?.message) ? error.message : 'probe_failure'; }
  finally { try { clean = await adapter.close(); validateCleanup(clean); } catch { code = 'probe_cleanup'; } }
  if (!code && signal?.aborted) code = 'probe_aborted';
  if (code) return failure(code);
  return { schemaVersion: 1, mode: 'blank-preflight', status: 'pass', browser, protocol, targets,
    network: { loopbackHttpStatus: 200, externalTcp: 'EPERM' },
    cleanup: { exitCode: 0, exitSignal: null, processGroupAbsent: true, processReferences: 0, portClosed: true, profileRemoved: true } };
}

async function main() {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  let result;
  try { parseArgs(process.argv.slice(2)); result = await runBlankPreflight({ signal: controller.signal }); }
  catch (error) { result = failure(codes.has(error?.message) ? error.message : 'probe_failure'); }
  finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.status === 'pass' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
