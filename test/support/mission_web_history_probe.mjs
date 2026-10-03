// Versioned exact-production-code history harness; not AppRoot or staging proof.
// Namespace/privilege/cleanup mechanics are a bounded copy of the accepted blank infrastructure; its source is unchanged.
import http from 'node:http';
import { buildArtifact, validateArtifact, validateHistoryMatrix, classifyAsset, classifyBlockedRequest,
  networkReasonKeys, validateNetworkDiagnostic, isolationScope, inventoryTree, artifactDigest } from './mission_web_history_build.mjs';
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
const mode = 'linux-history-harness';
export const inventoryPhases = Object.freeze(['environment', 'chrome-version', 'git-identity', 'git-status', 'binary-check', 'byte-hash']);
const phases = ['inventory', 'prepare', 'launch', 'cdp-connect', 'Browser.getVersion', 'Target.getTargets',
  'Target.attachToTarget', 'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'SystemInfo.getProcessInfo',
  'build', 'locked-dependencies', 'registration-isolation', 'registration-verify', 'flutter-build', 'asset-server', 'Network.enable', 'Fetch.enable', 'Fetch.requestPaused', 'Fetch.fulfillRequest', 'Fetch.failRequest', 'Page.navigate', 'Page.reload', 'Page.getNavigationHistory', 'Page.navigateToHistoryEntry', 'Accessibility.enable', 'Accessibility.getFullAXTree', 'Input.dispatchMouseEvent', 'history-matrix', 'history-stale-seed', 'network', 'Browser.close', 'observe', 'terminate', 'cleanup', ...inventoryPhases];
const codes = new Set(['probe_arguments', 'probe_inventory', 'probe_network', 'probe_targets', 'probe_sandbox',
  'history_state', 'history_matrix', 'history_serial', 'history_artifact', 'history_source', 'history_toolchain', 'history_build', 'history_isolation', 'history_network', 'probe_version', 'probe_cleanup', 'probe_timeout', 'probe_aborted', 'probe_failure', 'probe_test_hooks']);
const check = (ok, code) => { if (!ok) throw Error(code); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function classifyCommandFailure(error) {
  return error?.code === 'ETIMEDOUT' || error?.killed === true || ['SIGTERM', 'SIGKILL'].includes(error?.signal)
    ? 'probe_timeout' : 'probe_failure';
}
export function runInventoryPhases(emit, operations) {
  for (const name of inventoryPhases) {
    emit(name, 'begin');
    try { operations[name](); emit(name, 'confirmed'); }
    catch (error) { emit(name, 'failed'); throw Error(codes.has(error?.message) ? error.message : classifyCommandFailure(error)); }
  }
}
const command = (bin, args, options = {}) => {
  try { return execFileSync(bin, args, { encoding: 'utf8', timeout: 3000,
    maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim(); }
  catch (error) { throw Error(classifyCommandFailure(error)); }
};
const rootCommand = (bin, args, options) => command('/usr/bin/sudo', ['-n', '--', bin, ...args], options);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Freeze the validated build inventory before accepting any HTTP request. The
// returned responder only selects bytes; request text never reaches a fs API.
export function preloadHistoryAssetResponses(webRoot, artifact) {
  const assets = new Map(); const descriptors = []; const directories = new Map();
  const same = (a, b) => ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
  const lstat = file => fs.lstatSync(file, { bigint: true });
  const fstat = fd => fs.fstatSync(fd, { bigint: true });
  const open = (file, flags) => { const fd = fs.openSync(file, flags | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); descriptors.push(fd); return fd; };
  const stableDirectories = () => {
    for (const [file, entry] of directories) check(same(entry.before, fstat(entry.fd)) && same(entry.before, lstat(file)), 'history_artifact');
    check(fs.realpathSync(webRoot) === webRoot, 'history_artifact');
  };
  try {
    const validated = validateArtifact(artifact);
    check(typeof webRoot === 'string' && path.isAbsolute(webRoot) && webRoot !== '/'
      && path.normalize(webRoot) === webRoot && fs.realpathSync(webRoot) === webRoot, 'history_artifact');
    check(validated.files.every(file => file.bytes <= 64 * 1024 * 1024)
      && validated.files.reduce((total, file) => total + file.bytes, 0) <= 256 * 1024 * 1024, 'history_artifact');
    const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript', json: 'application/json',
      wasm: 'application/wasm', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', bin: 'application/octet-stream' };
    for (const file of validated.files) {
      let parent = webRoot;
      for (const part of ['', ...file.path.split('/').slice(0, -1)]) {
        if (part) parent = path.join(parent, part);
        if (directories.has(parent)) continue;
        const fd = open(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY); const before = fstat(fd);
        check(before.isDirectory() && same(before, lstat(parent)), 'history_artifact');
        directories.set(parent, { fd, before });
      }
      const target = path.join(webRoot, file.path);
      const fd = open(target, fs.constants.O_RDONLY); const before = fstat(fd);
      check(before.isFile() && before.nlink === 1n && before.size === BigInt(file.bytes)
        && same(before, lstat(target)), 'history_artifact');
      stableDirectories();
      const bytes = Buffer.alloc(file.bytes); let offset = 0;
      while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0, 'history_artifact'); offset += count; }
      check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0
        && same(before, fstat(fd)) && same(before, lstat(target))
        && createHash('sha256').update(bytes).digest('hex') === file.sha256, 'history_artifact');
      stableDirectories();
      fs.closeSync(fd); descriptors.pop();
      assets.set(`/${file.path}`, { bytes, contentType: mime[file.path.split('.').at(-1)] ?? 'application/octet-stream' });
    }
    stableDirectories();
  } catch { throw Error('history_artifact'); }
  finally {
    let failed = false;
    for (const fd of descriptors.reverse()) { try { fs.closeSync(fd); } catch { failed = true; } }
    check(!failed, 'history_artifact');
  }
  return (method, url) => {
    if (method !== 'GET' || typeof url !== 'string') return null;
    const asset = assets.get(url);
    return asset ? { body: Buffer.from(asset.bytes), contentType: asset.contentType } : null;
  };
}

const fail = (code, diagnostic) => ({ schemaVersion: 1, mode, status: 'fail', code: codes.has(code) ? code : 'probe_failure',
  ...(diagnostic ? { diagnostic } : {}) });
const targetClasses = ['pageBlank', 'pageOther', 'browserUi', 'extension', 'serviceWorker', 'other'];
const cleanupFields = ['processesAbsent', 'groupAbsent', 'namespaceRemoved', 'resolverRemoved', 'portClosed', 'profileRemoved'];
export function validateTargetDiagnostic(value) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).length === targetClasses.length
    && targetClasses.every(key => Object.hasOwn(value, key) && Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 256)
    && targetClasses.reduce((sum, key) => sum + value[key], 0) <= 256, 'probe_failure');
  return Object.fromEntries(targetClasses.map(key => [key, value[key]]));
}
export function summarizeTargets(targets) {
  check(Array.isArray(targets) && targets.length <= 256, 'probe_failure');
  const summary = Object.fromEntries(targetClasses.map(key => [key, 0]));
  for (const target of targets) {
    const key = typeof target?.url === 'string' && target.url.startsWith('chrome-extension:') ? 'extension'
      : target?.type === 'page' ? (target.url === 'about:blank' ? 'pageBlank' : 'pageOther')
        : target?.type === 'browser_ui' ? 'browserUi' : target?.type === 'service_worker' ? 'serviceWorker' : 'other';
    summary[key]++;
  }
  return validateTargetDiagnostic(summary);
}
export function validateTargetInventory(value) {
  const counts = validateTargetDiagnostic(value);
  // Exact sanitized vector observed in CI run 37102625787; no other target classes.
  const expected = { pageBlank: 1, pageOther: 0, browserUi: 2, extension: 0, serviceWorker: 0, other: 0 };
  check(targetClasses.every(key => counts[key] === expected[key]), 'probe_targets');
}
export function selectBlankTarget(targets) {
  validateTargetInventory(summarizeTargets(targets));
  const blank = targets.find(target => target.type === 'page' && target.url === 'about:blank');
  check(typeof blank?.targetId === 'string' && blank.targetId.length > 0, 'probe_targets');
  return blank;
}
function cleanupDiagnostic(value) {
  return { ...Object.fromEntries(cleanupFields.map(key => [key, value?.[key] === true])),
    exitClass: value?.exitSignal ? 'signal' : value?.exitCode === 0 ? 'normal'
      : Number.isInteger(value?.exitCode) && value.exitCode > 0 ? 'nonzero' : 'unknown' };
}
export function parseArgs(args) {
  check(args.length === 3 && args[0] === '--linux-history-harness' && args[1] === '--source-head'
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
export function validateObservation(v, inventory, artifact) {
  check(v?.artifactDigest === artifact.artifactDigest && v.sourceDigest === artifact.sourceDigest
    && v.sourceHead === artifact.sourceHead && v.isolation === isolationScope
    && JSON.stringify(v.isolationHashes) === JSON.stringify(artifact.isolationHashes), 'history_artifact');
  check(v?.browser === `Chrome/${contract.chrome}` && v.protocol === '1.3' && v.httpStatus === 200, 'probe_version');
  validateTargetInventory(v.targetCounts);
  check(v.evaluated === true && v.workerPrivileges === true && v.renderers?.length > 0, 'probe_sandbox');
  for (const r of v.renderers) check(r.uid === inventory.uid && r.gid === inventory.gid && r.seccomp === 2
    && r.filters >= 1 && r.noNewPrivs === 1 && r.capabilities === '0000000000000000'
    && r.nestedPidNamespace === true && r.forbiddenFlags === false, 'probe_sandbox');
  validateHistoryMatrix(v.historyMatrix); check(v.blockedUnexpected === 0
    && Object.values(validateNetworkDiagnostic(v.networkCounts)).every(count => count === 0), 'history_network');
  check(v.externalTcp === 'ENETUNREACH' && v.loopback === 200, 'probe_network');
}
export function validateCleanup(v, requireNormalExit = true) {
  check(cleanupFields.every(key => v?.[key] === true)
    && (!requireNormalExit || (v.exitCode === 0 && v.exitSignal === null)), 'probe_cleanup');
}
export async function runProbe({ expectedHead, adapter, journal = () => {}, signal } = {}) {
  if (adapter && !process.env.NODE_TEST_CONTEXT) return fail('probe_test_hooks');
  let sequence = 0; let code; let inventory; let artifact; let activeStage; let diagnostic; let networkDiagnostic;
  const emit = (phase, result) => {
    check(phases.includes(phase) && ['begin', 'confirmed', 'failed'].includes(result), 'probe_failure');
    journal(Object.freeze({ sequence: ++sequence, phase, result }));
  };
  const active = adapter ?? realAdapter(expectedHead, emit, signal);
  const abort = () => check(!signal?.aborted, 'probe_aborted');
  try {
    for (const stage of ['inventory', 'build', 'prepare', 'observe']) {
      abort(); activeStage = stage; emit(stage, 'begin');
      if (stage === 'inventory') { inventory = await active.inventory(); validateInventory(inventory, expectedHead); }
      if (stage === 'build') { artifact = validateArtifact(await active.build()); check(artifact.sourceHead === expectedHead, 'history_source'); }
      if (stage === 'prepare') validateNetwork(await active.prepare());
      if (stage === 'observe') validateObservation(await active.observe(), inventory, artifact);
      abort(); emit(stage, 'confirmed');
    }
  } catch (error) {
    code = codes.has(error?.message) ? error.message : 'probe_failure'; if (activeStage) emit(activeStage, 'failed');
    if (code === 'probe_targets') {
      try { diagnostic = validateTargetDiagnostic(active.targetDiagnostic?.()); }
      catch { code = 'probe_failure'; }
    }
    if (code === 'history_network') {
      try { networkDiagnostic = validateNetworkDiagnostic(active.networkDiagnostic?.()); }
      catch { code = 'probe_failure'; }
    }
  }
  finally {
    emit('cleanup', 'begin');
    let readback;
    try {
      readback = await active.cleanup(); validateCleanup(readback, false); emit('cleanup', 'confirmed');
      // A nonzero/signalled exit after a primary failure is not a resource leak.
      if (!code) { try { validateCleanup(readback); } catch { code = 'probe_cleanup'; } }
    } catch {
      code = 'probe_cleanup'; emit('cleanup', 'failed');
      try { diagnostic = cleanupDiagnostic(readback ?? active.cleanupReadback?.()); }
      catch { diagnostic = cleanupDiagnostic(); }
    }
  }
  if (signal?.aborted && !code) code = 'probe_aborted';
  if (code) return fail(code, code === 'history_network' ? networkDiagnostic : diagnostic);
  return { schemaVersion: 1, mode, status: 'pass', sourceHead: expectedHead, inventory: { ...contract, digests: { ...inventory.digests } },
    evidenceClass: 'exact-production-navigation-code-harness', fullAppRoot: false,
    isolation: isolationScope, providerBootstrap: false, googleAuth: false,
    artifact: { sourceDigest: artifact.sourceDigest, sourceHashes: artifact.sourceHashes, lockSha256: artifact.lockSha256,
      toolchain: artifact.toolchain, artifactDigest: artifact.artifactDigest, fileCount: artifact.files.length,
      isolationHashes: artifact.isolationHashes },
    proof: { rendererSandbox: true, loopback: true, externalTcp: 'ENETUNREACH', defaultOff: true,
      sdkEnvelopeAndNestedCursor: true, coldPushBackForwardReload: true, duplicateSuppressed: true,
      staleCursor: 'adversarial-browser-history-entry-rejected' },
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
// Numeric PGIDs alone are not ownership. A live, previously observed start
// identity anchors surviving descendants after the original leader exits.
export function ownsBuildGroup(identity, members) {
  if (!identity || !Number.isSafeInteger(identity.id) || identity.id <= 1
    || !Array.isArray(identity.known) || !Array.isArray(members) || !members.length
    || members.some(p => p.group !== identity.id)) return false;
  const leader = members.find(p => p.pid === identity.id);
  if (leader && leader.start !== identity.start) return false;
  return members.some(p => identity.known.some(k => k.pid === p.pid && k.start === p.start));
}
function realAdapter(expectedHead, emit, signal) {
  let directory; let identity; let namespace; let resolver; let created = false; let resolverCreated = false; let resolverBaseCreated = false;
  let artifact; const buildGroups = [];
  const ownsBuildRoot = () => {
    if (!directory || !identity) return false;
    const current = fs.lstatSync(directory);
    return current.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino
      && current.dev === identity.dev && current.uid === process.getuid() && path.dirname(directory) === '/tmp';
  };
  const buildMembers = id => fs.readdirSync('/proc').filter(v => /^\d+$/u.test(v)).flatMap(v => {
    try { const info = procStat(Number(v)); return info.group === id ? [{ pid: Number(v), ...info }] : []; }
    catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return []; throw Error('probe_cleanup'); }
  });
  const ownBuildGroup = id => {
    check(ownsBuildRoot(), 'history_build');
    const leader = procStat(id); check(leader.group === id, 'history_build');
    const identity = { id, start: leader.start, known: [{ pid: id, start: leader.start }] };
    const observe = () => {
      const members = buildMembers(id);
      if (ownsBuildGroup(identity, members)) for (const member of members) {
        if (!identity.known.some(k => k.pid === member.pid && k.start === member.start))
          identity.known.push({ pid: member.pid, start: member.start });
      }
      return members;
    };
    const record = { identity, observe, tracker: null, trackingFailed: false };
    record.tracker = setInterval(() => { try { observe(); } catch { record.trackingFailed = true; } }, 100);
    buildGroups.push(record);
    return () => {
      const members = observe(); if (!members.length) return;
      check(ownsBuildRoot() && !record.trackingFailed && ownsBuildGroup(identity, members), 'probe_cleanup');
      signalOwned('-KILL', -id, () => ownsBuildRoot() && ownsBuildGroup(identity, observe()));
    };
  };
  let child; let group; let workerIdentity; let childExit; let proof; let port; let inventory; let closing; let targetSummary;
  let networkSummary = Object.fromEntries(networkReasonKeys.map(key => [key, 0]));
  let resourceReadback = Object.fromEntries(cleanupFields.map(key => [key, false]));
  const ip = args => rootCommand('/usr/sbin/ip', args);
  const groupMembers = () => fs.readdirSync('/proc').filter(name => /^\d+$/u.test(name)).filter(name => {
    try { return group && procStat(Number(name)).group === group; } catch { return false; }
  }).map(Number);
  const signalOwned = (signalName, target, stillPresent) => {
    if (!stillPresent()) return;
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
    targetDiagnostic: () => targetSummary,
    networkDiagnostic: () => networkSummary,
    cleanupReadback: () => resourceReadback,
    async inventory() {
      runInventoryPhases(emit, {
        environment: () => {
          check(process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true' && !process.env.NODE_TEST_CONTEXT, 'probe_inventory');
          inventory = { platform: process.platform, arch: process.arch, imageOS: process.env.ImageOS,
            imageVersion: process.env.ImageVersion, node: process.versions.node, uid: process.getuid(), gid: process.getgid() };
        },
        'chrome-version': () => {
          inventory.chrome = command(chrome, ['--version'], { timeout: 10000 }).match(/\b(\d+\.\d+\.\d+\.\d+)\b/u)?.[1];
        },
        'git-identity': () => {
          inventory.head = command('/usr/bin/git', ['rev-parse', 'HEAD']);
          command('/usr/bin/git', ['ls-files', '--error-unmatch', self]);
        },
        'git-status': () => {
          inventory.clean = command('/usr/bin/git', ['status', '--porcelain', '--untracked-files=all'], { timeout: 15000 }) === '';
        },
        'binary-check': () => {
          for (const executable of [chrome, process.execPath, '/usr/bin/setpriv', '/usr/sbin/ip', '/usr/bin/ss'])
            check(fs.statSync(executable).isFile(), 'probe_inventory');
        },
        'byte-hash': () => {
          // Byte provenance is verified before and after execution; no source or binary download.
          inventory.bytes = [self, chrome, process.execPath].map(file => ({ file, digest: hash(file) }));
          inventory.digests = { runnerSha256: inventory.bytes[0].digest, chromeSha256: inventory.bytes[1].digest,
            nodeSha256: inventory.bytes[2].digest };
        },
      });
      validateInventory(inventory, expectedHead);
      return inventory;
    },
    async build() {
      directory = fs.mkdtempSync('/tmp/sit-d6-history-'); fs.chmodSync(directory, 0o700); identity = fs.lstatSync(directory);
      artifact = await buildArtifact(directory, expectedHead, emit, signal, ownBuildGroup);
      return artifact;
    },
    async prepare() {
      namespace = path.basename(directory); check(/^sit-d6-history-[a-zA-Z0-9]{6}$/u.test(namespace), 'probe_inventory');
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
        `HOME=${directory}`, `TMPDIR=${directory}`, 'LANG=C.UTF-8', 'SIT_D6_HISTORY_WORKER=1',
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
              else if (row.event === 'targets') {
                check(!targetSummary && Object.keys(row).length === 2, 'probe_failure');
                targetSummary = validateTargetDiagnostic(row.value);
              }
              else if (row.event === 'network') {
                check(Object.keys(row).length === 2, 'probe_failure');
                networkSummary = validateNetworkDiagnostic(row.value, networkSummary);
              }
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
                check(Object.values(networkSummary).every(count => count === 0), 'history_network');
                validateObservation(row.value, inventory, artifact); proof = row.value;
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
        for (const record of buildGroups) clearInterval(record.tracker);
        for (const record of buildGroups) {
          const { identity, observe } = record;
          const members = observe();
          if (members.length) {
            check(ownsBuildRoot() && !record.trackingFailed && ownsBuildGroup(identity, members), 'probe_cleanup');
            signalOwned('-KILL', -identity.id, () => ownsBuildRoot() && ownsBuildGroup(identity, observe()));
          }
          for (let i = 0; i < 20 && observe().length; i++) await delay(100);
          check(observe().length === 0, 'probe_cleanup');
        }
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
        if (created) portClosed = ip(['netns', 'exec', namespace, '/usr/bin/ss', '-ltnH']) === '';
        Object.assign(resourceReadback, { groupAbsent, processesAbsent, portClosed,
          exitCode: !child ? 0 : childExit?.code ?? null, exitSignal: childExit?.signal ?? null });
        check(groupAbsent && processesAbsent && portClosed, 'probe_cleanup'); emit('terminate', 'confirmed');
        if (created) ip(['netns', 'delete', namespace]);
        resourceReadback.namespaceRemoved = !namespace || !fs.existsSync(`/run/netns/${namespace}`);
        if (resolverCreated) {
          // An interrupted install may leave only the newly-owned empty directory.
          if (rootCommand('/usr/bin/find', [resolver, '-mindepth', '1', '-maxdepth', '1', '-name', 'resolv.conf']))
            rootCommand('/usr/bin/unlink', [`${resolver}/resolv.conf`]);
          rootCommand('/usr/bin/rmdir', [resolver]);
        }
        if (resolverBaseCreated) rootCommand('/usr/bin/rmdir', ['/etc/netns']);
        resourceReadback.resolverRemoved = !resolver || !fs.existsSync(resolver);
        if (directory) {
          const current = fs.lstatSync(directory);
          check(current.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino
            && current.dev === identity.dev && current.uid === process.getuid() && path.dirname(directory) === '/tmp', 'probe_cleanup');
          fs.rmSync(directory, { recursive: true });
        }
        resourceReadback.profileRemoved = !directory || !fs.existsSync(directory);
        return { ...resourceReadback };
      })();
    },
  };
}

async function worker(directory) {
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const phase = (name, result) => send({ event: 'phase', phase: name, result });
  check(process.platform === 'linux' && process.env.SIT_D6_HISTORY_WORKER === '1'
    && /^\/tmp\/sit-d6-history-[a-zA-Z0-9]{6}$/u.test(directory), 'probe_arguments');
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
  let assetServer; let browser; let socket; let exited; let port; let nextId = 0;
  let onEvent = () => {}; let failedRequest = false; let blockedUnexpected = 0; const pending = new Map();
  const networkCounts = Object.fromEntries(networkReasonKeys.map(key => [key, 0]));
  const recordBlock = reason => {
    check(networkReasonKeys.includes(reason), 'probe_failure');
    networkCounts[reason]++; blockedUnexpected++; failedRequest = true;
    send({ event: 'network', value: validateNetworkDiagnostic(networkCounts) });
  };
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
        const value = JSON.parse(event.data); const entry = pending.get(value.id); if (!entry) { onEvent(value); return; }
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
    send({ event: 'targets', value: summarizeTargets(targets) });
    const blankTarget = selectBlankTarget(targets);
    const session = (await cdp('Target.attachToTarget', { targetId: blankTarget.targetId, flatten: true })).sessionId;
    await cdp('Page.enable', {}, session); await cdp('Runtime.enable', {}, session);
    await cdp('Accessibility.enable', {}, session);
    const artifact = validateArtifact(JSON.parse(fs.readFileSync(path.join(directory, 'artifact.json'), 'utf8')));
    const webRoot = path.join(directory, 'checkout/build/web');
    check(artifactDigest(inventoryTree(webRoot)) === artifact.artifactDigest, 'history_artifact');
    const files = new Map(artifact.files.map(file => [file.path, file]));
    const assetResponse = preloadHistoryAssetResponses(webRoot, artifact);
    const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript', json: 'application/json',
      wasm: 'application/wasm', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', bin: 'application/octet-stream' };
    phase('asset-server', 'begin');
    assetServer = http.createServer((request, response) => {
      const asset = assetResponse(request.method, request.url);
      if (!asset) { response.writeHead(404); response.end(); failedRequest = true; return; }
      try {
        response.writeHead(200, { 'Content-Type': asset.contentType, 'Cache-Control': 'no-store' });
        response.end(asset.body);
      } catch { failedRequest = true; response.writeHead(500); response.end(); }
    });
    await new Promise((resolve, reject) => { assetServer.once('error', () => reject(Error('history_network'))); assetServer.listen(0, '127.0.0.1', resolve); });
    const assetPort = assetServer.address().port;
    const local = await fetch(`http://127.0.0.1:${assetPort}/index.html`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
    check(local.status === 200, 'history_network'); await local.arrayBuffer(); phase('asset-server', 'confirmed');
    const requests = new Set();
    onEvent = event => {
      if (event.method === 'Network.webSocketCreated') recordBlock('websocket');
      if (event.method !== 'Fetch.requestPaused') return;
      const fulfill = async () => {
        phase('Fetch.requestPaused', 'begin');
        const request = event.params; const name = classifyAsset(request.request?.url, request.resourceType, new Set(files.keys()));
        if (!name || request.request?.method !== 'GET' || request.responseStatusCode) {
          recordBlock(classifyBlockedRequest({ method: request.request?.method, url: request.request?.url,
            type: request.resourceType, responseStatusCode: request.responseStatusCode }, new Set(files.keys())));
          await cdp('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' }, session);
        } else {
          const response = await fetch(`http://127.0.0.1:${assetPort}/${name}`, { redirect: 'error', signal: AbortSignal.timeout(3000) });
          check(response.status === 200, 'history_network'); const bytes = Buffer.from(await response.arrayBuffer());
          check(createHash('sha256').update(bytes).digest('hex') === files.get(name).sha256, 'history_artifact');
          await cdp('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: mime[name.split('.').at(-1)] ?? 'application/octet-stream' },
              { name: 'Cache-Control', value: 'no-store' }], body: bytes.toString('base64') }, session);
        }
        phase('Fetch.requestPaused', 'confirmed');
      };
      const operation = fulfill().catch(() => { failedRequest = true; phase('Fetch.requestPaused', 'failed'); });
      requests.add(operation); operation.finally(() => requests.delete(operation));
    };
    await cdp('Network.enable', {}, session);
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, session);
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
      check(!result.exceptionDetails, 'history_matrix'); return result.result?.value;
    };
    const snapshot = async expected => {
      for (let i = 0; i < 100; i++) {
        check(!failedRequest, 'history_network');
        const value = await evaluate('({path:location.href==="https://shareittoo.com/mission"?"mission":location.href==="https://shareittoo.com/"?"root":"rejected",sdkState:history.state})');
        const ax = await cdp('Accessibility.getFullAXTree', {}, session);
        const names = (ax.nodes ?? []).map(node => node.name?.value);
        const visible = names.includes('Der Mission-Web-Einstieg ist derzeit nicht verfügbar.') ? 'unavailable'
          : names.includes('Synthetic Mission ingress') ? 'harness-root' : 'loading';
        if (value?.path === expected && value.sdkState?.state?.version === 1
          && visible === (expected === 'mission' ? 'unavailable' : 'harness-root')) return { ...value, visible };
        await delay(100);
      }
      throw Error('probe_timeout');
    };
    phase('history-matrix', 'begin');
    const historyMatrix = [];
    await cdp('Page.navigate', { url: 'https://shareittoo.com/mission' }, session); historyMatrix.push(await snapshot('mission'));
    await cdp('Page.navigate', { url: 'https://shareittoo.com/' }, session); historyMatrix.push(await snapshot('root'));
    const point = await evaluate(`(() => {const e=[...document.querySelectorAll('[role="button"]')].find(e=>e.textContent==='Synthetic Mission ingress'||e.getAttribute('aria-label')==='Synthetic Mission ingress');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    check(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'history_matrix');
    for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 }, session);
    historyMatrix.push(await snapshot('mission'));
    const travel = async delta => {
      const history = await cdp('Page.getNavigationHistory', {}, session); const entry = history.entries[history.currentIndex + delta];
      check(entry && Number.isInteger(entry.id), 'history_matrix');
      await cdp('Page.navigateToHistoryEntry', { entryId: entry.id }, session);
    };
    await travel(-1); historyMatrix.push(await snapshot('root'));
    await travel(1); historyMatrix.push(await snapshot('mission'));
    await cdp('Page.reload', { ignoreCache: true }, session);
    // Wait for a genuinely new document cursor, not the pre-reload frame.
    let reloaded;
    for (let i = 0; i < 100; i++) { reloaded = await snapshot('mission'); if (reloaded.sdkState.state.instance !== historyMatrix[4].sdkState.state.instance) break; await delay(100); }
    historyMatrix.push(reloaded);
    phase('history-stale-seed', 'begin');
    // Deliberately adversarial browser entry, not an asserted production push:
    // real Back/Forward below delivers the old-document cursor through the SDK.
    const old = historyMatrix[4].sdkState.state;
    await evaluate(`history.pushState({serialCount:history.state.serialCount+1,state:${JSON.stringify(old)}},'', '/mission');true`);
    phase('history-stale-seed', 'confirmed');
    await travel(-1); historyMatrix.push(await snapshot('mission'));
    await travel(1); historyMatrix.push(await snapshot('root'));
    await Promise.all(requests); check(!failedRequest, 'history_network'); validateHistoryMatrix(historyMatrix);
    check(artifactDigest(inventoryTree(webRoot)) === artifact.artifactDigest, 'history_artifact');
    const finalTargets = (await cdp('Target.getTargets')).targetInfos;
    const finalCounts = summarizeTargets(finalTargets);
    check(JSON.stringify(finalCounts) === JSON.stringify({ pageBlank: 0, pageOther: 1, browserUi: 2,
      extension: 0, serviceWorker: 0, other: 0 }) && finalTargets.some(t => t.targetId === blankTarget.targetId
        && t.type === 'page' && t.url === 'https://shareittoo.com/'), 'probe_targets');
    phase('history-matrix', 'confirmed');
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
        targetCounts: summarizeTargets(targets), evaluated: result.result?.value === 2,
        workerPrivileges, externalTcp, loopback: response.status, historyMatrix, blockedUnexpected,
        artifactDigest: artifact.artifactDigest, sourceDigest: artifact.sourceDigest, sourceHead: artifact.sourceHead,
        isolation: artifact.isolation, isolationHashes: artifact.isolationHashes, networkCounts } });
    await acknowledgement;
    await cdp('Browser.close');
    for (let i = 0; i < 30 && !exited; i++) await delay(100);
    check(exited?.code === 0 && exited?.signal === null, 'probe_cleanup');
  } finally { clearTimeout(watchdog); if (assetServer) await new Promise(resolve => { assetServer.closeAllConnections(); assetServer.close(resolve); }); socket?.close(); if (!exited) browser?.kill('SIGTERM'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  if (process.argv.length === 4 && process.argv[2] === '--worker' && process.env.SIT_D6_HISTORY_WORKER === '1') {
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
