// Test-only Linux infrastructure spike. Never loads product pages or imports product code.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Official inventory, accessed 2026-10-03; runner labels alone are not immutable.
// https://github.com/actions/runner-images/blob/db776964592d0362a6bed85f90bc4e2980250e49/images/ubuntu/Ubuntu2404-Readme.md
export const contract = Object.freeze({ inventoryCommit: 'db776964592d0362a6bed85f90bc4e2980250e49',
  imageOS: 'ubuntu24', imageVersion: '20260927.320.1', arch: 'x64', node: '22.23.3', chrome: '154.0.8037.57' });
const self = fileURLToPath(import.meta.url);
const chrome = '/opt/google/chrome/chrome';
const mode = 'linux-blank-preflight';
const phases = ['inventory', 'prepare', 'launch', 'cdp-connect', 'Browser.getVersion', 'Target.getTargets',
  'Target.attachToTarget', 'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'SystemInfo.getProcessInfo',
  'network', 'Browser.close', 'observe', 'terminate', 'cleanup'];
const codes = new Set(['probe_arguments', 'probe_inventory', 'probe_network', 'probe_targets', 'probe_sandbox',
  'probe_version', 'probe_cleanup', 'probe_timeout', 'probe_aborted', 'probe_failure', 'probe_test_hooks']);
const check = (ok, code) => { if (!ok) throw Error(code); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const command = (bin, args, options = {}) => execFileSync(bin, args, { encoding: 'utf8', timeout: 3000,
  maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const rootCommand = (bin, args, options) => command('/usr/bin/sudo', ['-n', '--', bin, ...args], options);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = code => ({ schemaVersion: 1, mode, status: 'fail', code: codes.has(code) ? code : 'probe_failure' });
export function parseArgs(args) {
  check(args.length === 3 && args[0] === '--linux-blank-preflight' && args[1] === '--source-head'
    && /^[a-f0-9]{40}$/u.test(args[2]), 'probe_arguments'); return args[2];
}
export function privilegeArgs(uid, gid) {
  check(Number.isSafeInteger(uid) && uid > 0 && Number.isSafeInteger(gid) && gid > 0, 'probe_sandbox');
  return [`--reuid=${uid}`, `--regid=${gid}`, '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all',
    '--bounding-set=-all', '--no-new-privs'];
}
export function launchArgs(directory) {
  return ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-crash-reporter', '--disable-breakpad',
    '--disable-extensions', '--disable-component-extensions-with-background-pages', `--user-data-dir=${directory}`,
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', 'about:blank'];
}
export function validateInventory(v, expectedHead) {
  check(v?.platform === 'linux' && v.arch === contract.arch && v.imageOS === contract.imageOS
    && v.imageVersion === contract.imageVersion && v.node === contract.node && v.chrome === contract.chrome
    && v.head === expectedHead && v.clean === true, 'probe_inventory'); privilegeArgs(v.uid, v.gid);
  const names = ['runnerSha256', 'chromeSha256', 'nodeSha256'];
  check(v.digests && typeof v.digests === 'object' && !Array.isArray(v.digests)
    && Reflect.ownKeys(v.digests).length === names.length
    && names.every(name => Object.hasOwn(v.digests, name) && typeof v.digests[name] === 'string'
      && /^[a-f0-9]{64}$/u.test(v.digests[name])), 'probe_inventory');
}
export function validateNetwork(v) {
  check(JSON.stringify(v?.links) === '["lo"]' && Array.isArray(v.routes4) && v.routes4.length === 0
    && Array.isArray(v.routes6) && v.routes6.length === 0 && v.resolverEmpty === true, 'probe_network');
}
export function validateObservation(v, inventory) {
  check(v?.browser === `Chrome/${contract.chrome}` && v.protocol === '1.3' && v.httpStatus === 200, 'probe_version');
  check(v.targets?.length === 1 && v.targets[0].type === 'page' && v.targets[0].url === 'about:blank', 'probe_targets');
  check(v.evaluated === true && v.workerPrivileges === true && v.renderers?.length > 0, 'probe_sandbox');
  for (const r of v.renderers) check(r.uid === inventory.uid && r.gid === inventory.gid && r.seccomp === 2
    && r.filters >= 1 && r.noNewPrivs === 1 && r.capabilities === '0000000000000000'
    && r.nestedPidNamespace === true && r.forbiddenFlags === false, 'probe_sandbox');
  check(v.externalTcp === 'ENETUNREACH' && v.loopback === 200, 'probe_network');
}
export function validateCleanup(v) {
  check(v?.processesAbsent === true && v.groupAbsent === true && v.namespaceRemoved === true
    && v.resolverRemoved === true && v.portClosed === true && v.profileRemoved === true
    && v.exitCode === 0 && v.exitSignal === null, 'probe_cleanup');
}
export async function runProbe({ expectedHead, adapter, journal = () => {}, signal } = {}) {
  if (adapter && !process.env.NODE_TEST_CONTEXT) return fail('probe_test_hooks');
  let sequence = 0; let code; let inventory; let activeStage;
  const emit = (phase, result) => {
    check(phases.includes(phase) && ['begin', 'confirmed', 'failed'].includes(result), 'probe_failure');
    journal(Object.freeze({ sequence: ++sequence, phase, result }));
  };
  const active = adapter ?? realAdapter(expectedHead, emit, signal);
  const abort = () => check(!signal?.aborted, 'probe_aborted');
  try {
    for (const stage of ['inventory', 'prepare', 'observe']) {
      abort(); activeStage = stage; emit(stage, 'begin');
      if (stage === 'inventory') { inventory = await active.inventory(); validateInventory(inventory, expectedHead); }
      if (stage === 'prepare') validateNetwork(await active.prepare());
      if (stage === 'observe') validateObservation(await active.observe(), inventory);
      abort(); emit(stage, 'confirmed');
    }
  } catch (error) { code = codes.has(error?.message) ? error.message : 'probe_failure'; if (activeStage) emit(activeStage, 'failed'); }
  finally {
    emit('cleanup', 'begin');
    try { validateCleanup(await active.cleanup()); emit('cleanup', 'confirmed'); }
    catch { code = 'probe_cleanup'; emit('cleanup', 'failed'); }
  }
  if (signal?.aborted && !code) code = 'probe_aborted';
  if (code) return fail(code);
  return { schemaVersion: 1, mode, status: 'pass', sourceHead: expectedHead, inventory: { ...contract, digests: { ...inventory.digests } },
    proof: { blankPage: true, rendererSandbox: true, loopback: true, externalTcp: 'ENETUNREACH' },
    cleanup: { processesAbsent: true, groupAbsent: true, namespaceRemoved: true, resolverRemoved: true,
      portClosed: true, profileRemoved: true, exitCode: 0, exitSignal: null } };
}

function statusFields(text) { return Object.fromEntries(text.trim().split('\n').map(line => {
  const index = line.indexOf(':'); return [line.slice(0, index), line.slice(index + 1).trim()];
})); }
function procStat(pid) {
  const text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  return { parent: Number(fields[1]), group: Number(fields[2]), start: fields[19] };
}
function realAdapter(expectedHead, emit, signal) {
  let directory; let identity; let namespace; let resolver; let created = false; let resolverCreated = false; let resolverBaseCreated = false;
  let child; let group; let workerIdentity; let childExit; let proof; let port; let inventory; let closing;
  const ip = args => rootCommand('/usr/sbin/ip', args);
  const groupMembers = () => fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).filter(name => {
    try { return group && procStat(Number(name)).group === group; } catch { return false; }
  }).map(Number);
  const signalOwned = (signalName, target, stillPresent) => {
    try { rootCommand('/bin/kill', [signalName, '--', String(target)]); }
    catch { check(!stillPresent(), 'probe_cleanup'); }
  };
  const profileProcessRefs = () => !directory ? [] : fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).filter(name => {
    try { return fs.readFileSync(`/proc/${name}/cmdline`, 'utf8').includes(directory); }
    catch (error) { check(['ENOENT', 'ESRCH'].includes(error.code), 'probe_cleanup'); return false; }
  });
  // Only kernel-created local loopback routes are exempt, never another routing table.
  const loopbackRoute = r => r.dev === 'lo' && r.table === 'local' && r.protocol === 'kernel'
    && ['local', 'broadcast'].includes(r.type) && ['127.0.0.0/8', '127.0.0.1', '127.255.255.255', '::1'].includes(r.dst);
  const snapshot = () => ({ links: JSON.parse(ip(['-n', namespace, '-j', 'link'])).map(v => v.ifname).sort(),
    routes4: JSON.parse(ip(['-n', namespace, '-j', '-4', 'route', 'show', 'table', 'all'])).filter(r => !loopbackRoute(r)),
    routes6: JSON.parse(ip(['-n', namespace, '-j', '-6', 'route', 'show', 'table', 'all'])).filter(r => !loopbackRoute(r)),
    resolverEmpty: rootCommand('/usr/bin/stat', ['-c', '%s', `${resolver}/resolv.conf`]) === '0' });
  return {
    async inventory() {
      check(process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true' && !process.env.NODE_TEST_CONTEXT, 'probe_inventory');
      inventory = { platform: process.platform, arch: process.arch, imageOS: process.env.ImageOS,
        imageVersion: process.env.ImageVersion, node: process.versions.node,
        chrome: command(chrome, ['--version']).match(/\b(\d+\.\d+\.\d+\.\d+)\b/u)?.[1],
        uid: process.getuid(), gid: process.getgid(), head: command('/usr/bin/git', ['rev-parse', 'HEAD']),
        clean: command('/usr/bin/git', ['status', '--porcelain', '--untracked-files=all']) === '' };
      command('/usr/bin/git', ['ls-files', '--error-unmatch', self]);
      for (const executable of [chrome, process.execPath, '/usr/bin/setpriv', '/usr/sbin/ip', '/usr/bin/ss'])
        check(fs.statSync(executable).isFile(), 'probe_inventory');
      // Byte provenance is verified before and after execution; no source or binary download.
      inventory.bytes = [self, chrome, process.execPath].map(file => ({ file, digest: hash(file) }));
      inventory.digests = { runnerSha256: inventory.bytes[0].digest, chromeSha256: inventory.bytes[1].digest,
        nodeSha256: inventory.bytes[2].digest };
      validateInventory(inventory, expectedHead);
      return inventory;
    },
    async prepare() {
      directory = fs.mkdtempSync('/tmp/sit-d6-linux-'); fs.chmodSync(directory, 0o700); identity = fs.lstatSync(directory);
      namespace = path.basename(directory); check(/^sit-d6-linux-[a-zA-Z0-9]{6}$/u.test(namespace), 'probe_inventory');
      resolver = `/etc/netns/${namespace}`;
      check(!fs.existsSync(`/run/netns/${namespace}`) && !fs.existsSync(resolver), 'probe_inventory');
      ip(['netns', 'add', namespace]); created = true;
      if (!fs.existsSync('/etc/netns')) {
        rootCommand('/usr/bin/mkdir', ['-m', '755', '/etc/netns']); resolverBaseCreated = true;
      }
      check(fs.lstatSync('/etc/netns').isDirectory() && !fs.lstatSync('/etc/netns').isSymbolicLink(), 'probe_inventory');
      rootCommand('/usr/bin/mkdir', ['-m', '700', resolver]); resolverCreated = true;
      rootCommand('/usr/bin/install', ['-m', '644', '/dev/null', `${resolver}/resolv.conf`]);
      ip(['-n', namespace, 'link', 'set', 'lo', 'up']);
      return snapshot();
    },
    async observe() {
      emit('launch', 'begin');
      const args = ['-n', '--', '/usr/sbin/ip', 'netns', 'exec', namespace, '/usr/bin/setpriv',
        ...privilegeArgs(inventory.uid, inventory.gid), '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin',
        `HOME=${directory}`, `TMPDIR=${directory}`, 'LANG=C.UTF-8', 'SIT_D6_LINUX_WORKER=1',
        process.execPath, self, '--worker', directory];
      child = spawn('/usr/bin/sudo', args, { detached: true, stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: '/usr/bin:/bin' } });
      child.stdin.on('error', () => {});
      child.once('exit', (code, signal) => { childExit = { code, signal }; });
      const result = await new Promise((resolve, reject) => {
        let bytes = ''; let size = 0;
        const finish = (error, value) => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); error ? reject(error) : resolve(value); };
        const aborted = () => finish(Error('probe_aborted'));
        const timer = setTimeout(() => finish(Error('probe_timeout')), 60000);
        signal?.addEventListener('abort', aborted, { once: true });
        child.once('error', () => { if (!child.pid) childExit = { code: null, signal: null }; finish(Error('probe_failure')); });
        child.once('exit', code => finish(code === 0 && proof ? null : Error('probe_failure'), proof));
        child.stdout.on('data', data => {
          try {
            size += data.length; check(size < 65536, 'probe_failure'); bytes += data;
            while (bytes.includes('\n')) {
              const end = bytes.indexOf('\n'); const row = JSON.parse(bytes.slice(0, end)); bytes = bytes.slice(end + 1);
              if (row.event === 'owned') {
                check(!workerIdentity && Number.isInteger(row.pid) && row.pid > 1, 'probe_failure');
                workerIdentity = { pid: row.pid, ...procStat(row.pid) }; group = workerIdentity.group;
                check(group !== procStat(process.pid).group && group > 1, 'probe_failure');
                check(fs.readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').includes(directory), 'probe_failure');
                emit('launch', 'confirmed');
              } else if (row.event === 'phase') emit(row.phase, row.result);
              else if (row.event === 'port') { check(Number.isInteger(row.port) && row.port > 0 && row.port < 65536, 'probe_failure'); port = row.port; }
              else if (row.event === 'observation') {
                check(!proof && Array.isArray(row.pids) && row.pids.length > 0, 'probe_sandbox');
                row.value.renderers = row.pids.map(pid => {
                  check(Number.isInteger(pid) && pid > 1 && procStat(pid).group === group, 'probe_sandbox');
                  const s = statusFields(rootCommand('/usr/bin/cat', [`/proc/${pid}/status`]));
                  const cmd = rootCommand('/usr/bin/cat', [`/proc/${pid}/cmdline`]);
                  check(cmd.includes('--type=renderer'), 'probe_sandbox');
                  return { uid: Number(s.Uid?.split(/\s+/u)[0]), gid: Number(s.Gid?.split(/\s+/u)[0]),
                    seccomp: Number(s.Seccomp), filters: Number(s.Seccomp_filters), noNewPrivs: Number(s.NoNewPrivs),
                    capabilities: s.CapEff, nestedPidNamespace: s.NSpid?.split(/\s+/u).length >= 2,
                    forbiddenFlags: /--(?:no-sandbox|disable-\S*sandbox|ignore-certificate-errors)/u.test(cmd) };
                });
                validateObservation(row.value, inventory); proof = row.value;
                // Keep renderers alive until the external controller verified /proc.
                child.stdin.end('verified\n');
              } else if (row.event === 'failure') {
                check(codes.has(row.code), 'probe_failure'); finish(Error(row.code));
              } else check(false, 'probe_failure');
            }
          } catch (error) { finish(Error(codes.has(error?.message) ? error.message : 'probe_failure')); }
        });
      });
      validateNetwork(snapshot());
      for (const item of inventory.bytes) check(hash(item.file) === item.digest, 'probe_inventory');
      return result;
    },
    cleanup() {
      return closing ??= (async () => {
        emit('terminate', 'begin');
        // The root controller stays outside the namespace. Kill only this captured group.
        if (group && groupMembers().length) {
          signalOwned('-TERM', -group, () => groupMembers().length > 0);
          for (let i = 0; i < 30 && groupMembers().length; i++) await delay(100);
          if (groupMembers().length) signalOwned('-KILL', -group, () => groupMembers().length > 0);
          for (let i = 0; i < 20 && groupMembers().length; i++) await delay(100);
        }
        if (child?.pid && !childExit) {
          // Also own the detached sudo launcher group before worker handback.
          try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
          for (let i = 0; i < 20 && !childExit; i++) await delay(100);
          if (!childExit) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
          for (let i = 0; i < 20 && !childExit; i++) await delay(100);
        }
        // Covers launch failure before worker ownership handback, without name matching.
        if (created) {
          const pids = ip(['netns', 'pids', namespace]).split(/\s+/u).filter(Boolean);
          for (const pid of pids) {
            check(/^\d+$/u.test(pid) && Number(pid) > 1, 'probe_cleanup');
            signalOwned('-KILL', pid, () => ip(['netns', 'pids', namespace]).split(/\s+/u).includes(pid));
          }
          for (let i = 0; i < 20 && ip(['netns', 'pids', namespace]); i++) await delay(100);
        }
        const launcherAbsent = !child?.pid || !fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).some(name => {
          try { return procStat(Number(name)).group === child.pid; } catch { return false; }
        });
        const groupAbsent = (!group || groupMembers().length === 0) && (!child || Boolean(childExit)) && launcherAbsent;
        const processesAbsent = (!created || ip(['netns', 'pids', namespace]) === '') && profileProcessRefs().length === 0;
        let portClosed = !port;
        if (created && port) portClosed = ip(['netns', 'exec', namespace, '/usr/bin/ss', '-ltnH', 'sport', '=', `:${port}`]) === '';
        check(groupAbsent && processesAbsent && portClosed, 'probe_cleanup'); emit('terminate', 'confirmed');
        if (created) ip(['netns', 'delete', namespace]);
        if (resolverCreated) {
          // An interrupted install may leave only the newly-owned empty directory.
          if (rootCommand('/usr/bin/find', [resolver, '-mindepth', '1', '-maxdepth', '1', '-name', 'resolv.conf']))
            rootCommand('/usr/bin/unlink', [`${resolver}/resolv.conf`]);
          rootCommand('/usr/bin/rmdir', [resolver]);
        }
        if (resolverBaseCreated) rootCommand('/usr/bin/rmdir', ['/etc/netns']);
        if (directory) {
          const current = fs.lstatSync(directory);
          check(current.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino
            && current.dev === identity.dev && current.uid === process.getuid() && path.dirname(directory) === '/tmp', 'probe_cleanup');
          fs.rmSync(directory, { recursive: true });
        }
        return { processesAbsent, groupAbsent, namespaceRemoved: !namespace || !fs.existsSync(`/run/netns/${namespace}`),
          resolverRemoved: !resolver || !fs.existsSync(resolver), portClosed, profileRemoved: !directory || !fs.existsSync(directory),
          exitCode: !child || (proof && childExit?.code === 0) ? 0 : null, exitSignal: childExit?.signal ?? null };
      })();
    },
  };
}

async function worker(directory) {
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const phase = (name, result) => send({ event: 'phase', phase: name, result });
  check(process.platform === 'linux' && process.env.SIT_D6_LINUX_WORKER === '1'
    && /^\/tmp\/sit-d6-linux-[a-zA-Z0-9]{6}$/u.test(directory), 'probe_arguments');
  const s = statusFields(fs.readFileSync('/proc/self/status', 'utf8'));
  const workerPrivileges = process.getuid() > 0 && process.getgid() > 0 && s.Groups === ''
    && s.NoNewPrivs === '1' && ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'].every(key => s[key] === '0000000000000000');
  check(workerPrivileges && fs.readFileSync('/etc/resolv.conf', 'utf8') === '', 'probe_sandbox');
  send({ event: 'owned', pid: process.pid });
  let acknowledge; let rejectAcknowledgement;
  const acknowledgement = new Promise((resolve, reject) => { acknowledge = resolve; rejectAcknowledgement = reject; });
  // Attach rejection handling before any read; no raw control bytes are logged.
  acknowledgement.catch(() => {});
  let control = '';
  process.stdin.on('data', data => { control += data; if (control.length > 32) rejectAcknowledgement(Error('probe_failure')); });
  process.stdin.on('end', () => control === 'verified\n' ? acknowledge() : rejectAcknowledgement(Error('probe_failure')));
  process.stdin.on('error', () => rejectAcknowledgement(Error('probe_failure')));
  let browser; let socket; let exited; let port; let nextId = 0; const pending = new Map();
  const watchdog = setTimeout(() => { process.exitCode = 1; rejectAcknowledgement(Error('probe_timeout')); browser?.kill('SIGKILL'); socket?.close(); }, 50000);
  try {
    browser = spawn(chrome, launchArgs(directory), { stdio: ['ignore', 'ignore', 'ignore'], env: process.env });
    browser.once('error', () => { exited = { code: null, signal: null }; });
    browser.once('exit', (code, signal) => { exited = { code, signal }; for (const entry of pending.values()) entry.reject(Error('probe_failure')); });
    for (let i = 0; i < 100 && !exited; i++) {
      const file = path.join(directory, 'DevToolsActivePort');
      if (fs.existsSync(file)) { const data = fs.readFileSync(file, 'utf8').split('\n')[0]; check(/^\d{1,5}$/u.test(data), 'probe_version'); port = Number(data); break; }
      await delay(100);
    }
    check(port > 0 && port < 65536 && !exited, 'probe_timeout'); send({ event: 'port', port });
    phase('cdp-connect', 'begin');
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    check(response.status === 200, 'probe_version'); const data = await response.json();
    check(data.Browser === `Chrome/${contract.chrome}` && data['Protocol-Version'] === '1.3', 'probe_version');
    const url = new URL(data.webSocketDebuggerUrl);
    check(url.protocol === 'ws:' && url.hostname === '127.0.0.1' && url.port === String(port)
      && /^\/devtools\/browser\/[\w-]+$/u.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash, 'probe_version');
    socket = new WebSocket(url);
    socket.addEventListener('message', event => {
      try { check(typeof event.data === 'string' && event.data.length < 1024 * 1024, 'probe_failure');
        const value = JSON.parse(event.data); const entry = pending.get(value.id); if (!entry) return;
        pending.delete(value.id); value.error ? entry.reject(Error('probe_failure')) : entry.resolve(value.result);
      } catch { for (const entry of pending.values()) entry.reject(Error('probe_failure')); }
    });
    socket.addEventListener('error', () => { for (const entry of pending.values()) entry.reject(Error('probe_failure')); });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('probe_timeout')), 3000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true }); });
    phase('cdp-connect', 'confirmed');
    const cdp = async (method, params = {}, sessionId) => {
      phase(method, 'begin'); const id = ++nextId;
      let value;
      try { value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error('probe_timeout')); }, 3000);
        pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      }); } catch (error) { phase(method, 'failed'); throw error; }
      phase(method, 'confirmed'); return value;
    };
    const version = await cdp('Browser.getVersion');
    const targets = (await cdp('Target.getTargets')).targetInfos;
    check(targets.length === 1 && targets[0].type === 'page' && targets[0].url === 'about:blank', 'probe_targets');
    const session = (await cdp('Target.attachToTarget', { targetId: targets[0].targetId, flatten: true })).sessionId;
    await cdp('Page.enable', {}, session); await cdp('Runtime.enable', {}, session);
    const result = await cdp('Runtime.evaluate', { expression: '1+1', returnByValue: true }, session);
    const processes = await cdp('SystemInfo.getProcessInfo');
    phase('network', 'begin');
    const externalTcp = await new Promise(resolve => {
      const connection = net.connect({ host: '192.0.2.1', port: 443 });
      const done = value => { connection.destroy(); resolve(value); };
      connection.once('connect', () => done('connected')); connection.once('error', e => done(e.code === 'ENETUNREACH' ? e.code : 'other'));
      connection.setTimeout(1000, () => done('timeout'));
    }); phase('network', 'confirmed');
    send({ event: 'observation', pids: processes.processInfo.filter(p => p.type === 'renderer').map(p => p.id),
      value: { browser: version.product, protocol: version.protocolVersion, httpStatus: response.status,
        targets: targets.map(t => ({ type: t.type, url: t.url })), evaluated: result.result?.value === 2,
        workerPrivileges, externalTcp, loopback: response.status } });
    await acknowledgement;
    await cdp('Browser.close');
    for (let i = 0; i < 30 && !exited; i++) await delay(100);
    check(exited?.code === 0 && exited?.signal === null, 'probe_cleanup');
  } finally { clearTimeout(watchdog); socket?.close(); if (!exited) browser?.kill('SIGTERM'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  if (process.argv.length === 4 && process.argv[2] === '--worker' && process.env.SIT_D6_LINUX_WORKER === '1') {
    try { await worker(process.argv[3]); } catch (error) {
      process.stdout.write(JSON.stringify({ event: 'failure', code: codes.has(error?.message) ? error.message : 'probe_failure' }) + '\n');
      process.exitCode = 1;
    }
  } else {
    const controller = new AbortController(); const abort = () => controller.abort();
    process.once('SIGTERM', abort); process.once('SIGINT', abort);
    let result;
    try { const expectedHead = parseArgs(process.argv.slice(2)); result = await runProbe({ expectedHead, signal: controller.signal,
      journal: row => process.stderr.write(JSON.stringify(row) + '\n') }); }
    catch (error) { result = fail(error?.message); }
    finally { process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); }
    process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.status === 'pass' ? 0 : 1;
  }
}
