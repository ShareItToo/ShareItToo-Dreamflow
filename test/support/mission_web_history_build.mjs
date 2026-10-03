// Versioned test-support artifact/matrix contract. Never imported by production.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

export const contract = Object.freeze({ flutter: '3.41.7', dart: '3.11.5',
  framework: 'cc0734ac716fbb8b90f3f9db8020958b1553afa7', engine: '59aa584fdf100e6c78c785d8a5b565d1de4b48ab' });
const check = (ok, code) => { if (!ok) throw Error(code); };
const digest = value => createHash('sha256').update(value).digest('hex');
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const integer = value => Number.isSafeInteger(value) && value >= 0;
export const buildArguments = Object.freeze(['build', 'web', '--release', '--no-pub', '--no-web-resources-cdn',
  '--pwa-strategy=none', '--target=test/support/mission_web_history_harness.dart',
  ...['SIT_BACKEND_ENABLED', 'SIT_MISSION_WEB_PREVIEW_ENABLED', 'SIT_STAGE_A_NON_BINDING_PILOT',
    'SIT_SOCIAL_GOOGLE_ENABLED', 'SIT_SOCIAL_APPLE_ENABLED', 'SIT_SOCIAL_FACEBOOK_ENABLED',
    'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED', 'SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED',
    'SIT_PLANNER_TECHNICAL_UI_ENABLED', 'SIT_PLANNER_DEMAND_UI_ENABLED',
    'SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED', 'SIT_LISTING_SETS_TECHNICAL_UI_ENABLED']
    .map(name => `--dart-define=${name}=false`)]);

export function validateSdkState(value) {
  check(exact(value, ['serialCount', 'state']) && integer(value.serialCount)
    && exact(value.state, ['version', 'instance', 'entry']) && value.state.version === 1
    && /^[a-f0-9]{32}$/u.test(value.state.instance) && integer(value.state.entry), 'history_state');
  return value;
}
export function validateHistoryMatrix(rows) {
  check(Array.isArray(rows) && rows.length === 8, 'history_matrix');
  const paths = ['mission', 'root', 'mission', 'root', 'mission', 'mission', 'mission', 'root'];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; check(exact(r, ['path', 'sdkState', 'visible']) && r.path === paths[i]
      && r.visible === (paths[i] === 'mission' ? 'unavailable' : 'harness-root'), 'history_matrix');
    validateSdkState(r.sdkState);
  }
  const s = rows.map(r => r.sdkState); const a = s.map(v => v.state);
  check(JSON.stringify(s.map(v => v.serialCount)) === '[0,0,1,0,1,1,1,2]', 'history_serial');
  check(JSON.stringify(a.map(v => v.entry)) === '[1,0,1,0,1,1,1,0]', 'history_matrix');
  check(a[0].instance !== a[1].instance && a[1].instance !== a[5].instance
    && [2,3,4].every(i => a[i].instance === a[1].instance)
    && [6,7].every(i => a[i].instance === a[5].instance), 'history_matrix');
}
export const artifactDigest = files => digest(JSON.stringify(files));
export function validateArtifact(a) {
  check(exact(a, ['schemaVersion', 'sourceHead', 'sourceDigest', 'sourceHashes', 'lockSha256',
    'toolchain', 'files', 'artifactDigest']) && a.schemaVersion === 1 && /^[a-f0-9]{40}$/u.test(a.sourceHead)
    && [a.sourceDigest, a.lockSha256, a.artifactDigest].every(v => /^[a-f0-9]{64}$/u.test(v))
    && exact(a.sourceHashes, ['harness', 'router', 'controller', 'host'])
    && Object.values(a.sourceHashes).every(v => /^[a-f0-9]{64}$/u.test(v))
    && JSON.stringify(a.toolchain) === JSON.stringify(contract)
    && Array.isArray(a.files) && a.files.length > 2 && a.files.length < 10000, 'history_artifact');
  let previous = '';
  for (const file of a.files) {
    check(exact(file, ['path', 'sha256', 'bytes']) && typeof file.path === 'string'
      && /^[a-zA-Z0-9_.\-/]+$/u.test(file.path) && !file.path.split('/').some(p => !p || p === '.' || p === '..')
      && file.path > previous && /^[a-f0-9]{64}$/u.test(file.sha256) && integer(file.bytes), 'history_artifact');
    previous = file.path;
  }
  check(['index.html', 'main.dart.js', 'flutter_bootstrap.js'].every(name => a.files.some(f => f.path === name))
    && artifactDigest(a.files) === a.artifactDigest, 'history_artifact');
  return a;
}
export function classifyAsset(url, type, files) {
  if (type === 'Document' && ['https://shareittoo.com/', 'https://shareittoo.com/mission'].includes(url)) return files.has('index.html') ? 'index.html' : null;
  if (!['Script', 'Stylesheet', 'Font', 'Image', 'Fetch', 'XHR', 'Other'].includes(type)) return null;
  if (!url.startsWith('https://shareittoo.com/')) return null;
  const name = url.slice('https://shareittoo.com/'.length);
  return /^[a-zA-Z0-9_.\-/]+$/u.test(name) && !name.split('/').some(p => !p || p === '.' || p === '..')
    && files.has(name) ? name : null;
}
// Diagnostic precedence only; this never grants request admission.
export const networkReasonKeys = Object.freeze(['non_get', 'response_stage', 'unsupported_type',
  'non_https_scheme', 'foreign_origin', 'query_or_fragment', 'unsafe_path', 'untracked_asset', 'websocket']);
export function classifyBlockedRequest({ method, url, type, responseStatusCode }, files) {
  if (method !== 'GET') return 'non_get';
  if (responseStatusCode) return 'response_stage';
  if (type === 'WebSocket') return 'websocket';
  if (!['Document', 'Script', 'Stylesheet', 'Font', 'Image', 'Fetch', 'XHR', 'Other'].includes(type)) return 'unsupported_type';
  if (typeof url !== 'string' || !url.startsWith('https://')) return 'non_https_scheme';
  if (!url.startsWith('https://shareittoo.com/')) return 'foreign_origin';
  if (/[?#]/u.test(url)) return 'query_or_fragment';
  const name = url.slice('https://shareittoo.com/'.length);
  if (type === 'Document' && name !== '' && name !== 'mission') return 'unsafe_path';
  if (!(type === 'Document' && name === '') && (!/^[a-zA-Z0-9_.\-/]+$/u.test(name)
    || name.split('/').some(p => !p || p === '.' || p === '..'))) return 'unsafe_path';
  return classifyAsset(url, type, files) ? null : 'untracked_asset';
}
export function validateNetworkDiagnostic(value, previous) {
  check(value && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === networkReasonKeys.length, 'probe_failure');
  const detached = {};
  for (const key of networkReasonKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable
      && Number.isSafeInteger(descriptor.value) && descriptor.value >= 0 && descriptor.value <= 4096, 'probe_failure');
    detached[key] = descriptor.value;
  }
  const total = v => Object.values(v).reduce((sum, count) => sum + count, 0);
  check(total(detached) <= 4096, 'probe_failure');
  if (previous !== undefined) {
    const before = validateNetworkDiagnostic(previous);
    check(networkReasonKeys.every(key => detached[key] >= before[key])
      && total(detached) === total(before) + 1, 'probe_failure');
  }
  return detached;
}
export function inventoryTree(root) {
  const files = [];
  const walk = prefix => {
    for (const name of fs.readdirSync(path.join(root, prefix)).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name; const file = path.join(root, relative);
      const stat = fs.lstatSync(file); check(!stat.isSymbolicLink(), 'history_artifact');
      if (stat.isDirectory()) walk(relative);
      else { check(stat.isFile() && stat.nlink === 1, 'history_artifact'); files.push({ path: relative, sha256: digest(fs.readFileSync(file)), bytes: stat.size }); }
    }
  }; walk(''); return files.sort((a,b) => a.path < b.path ? -1 : 1);
}

// Provision/build precedes network namespace entry. Source and lock are exact;
// there is no download fallback after entering the namespace.
export async function buildArtifact(directory, sourceHead, emit, signal, ownGroup = () => {}) {
  const root = path.resolve(import.meta.dirname, '../..');
  const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: root, timeout: 15000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
  const flutterRoot = process.env.FLUTTER_ROOT;
  check(typeof flutterRoot === 'string' && path.isAbsolute(flutterRoot), 'history_toolchain');
  const version = JSON.parse(fs.readFileSync(path.join(flutterRoot, 'bin/cache/flutter.version.json'), 'utf8'));
  check(version.frameworkVersion === contract.flutter && version.dartSdkVersion === contract.dart
    && version.frameworkRevision === contract.framework && version.engineRevision === contract.engine, 'history_toolchain');
  const project = path.join(directory, 'checkout'); fs.mkdirSync(project, { mode: 0o700 });
  const names = git('ls-files', '-z', '--', 'lib', 'assets', 'pubspec.yaml', 'pubspec.lock',
    'test/support/mission_web_history_harness.dart', 'test/support/mission_web_history_build.mjs',
    'test/support/mission_web_history_probe.mjs').toString().split('\0').filter(Boolean).sort();
  check(names.length > 10 && git('rev-parse', 'HEAD').toString().trim() === sourceHead
    && git('status', '--porcelain', '--untracked-files=all').length === 0, 'history_source');
  const sources = [];
  for (const name of names) {
    check(!path.isAbsolute(name) && !name.split('/').includes('..'), 'history_source');
    const original = path.join(root, name); check(fs.lstatSync(original).isFile() && !fs.lstatSync(original).isSymbolicLink(), 'history_source');
    const bytes = fs.readFileSync(original); const destination = path.join(project, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
    sources.push({ path: name, sha256: digest(bytes) });
  }
  const find = name => { const v = sources.find(v => v.path === name)?.sha256; check(v, 'history_source'); return v; };
  const sourceHashes = { harness: find('test/support/mission_web_history_harness.dart'),
    router: find('lib/navigation/web_app_router.dart'), controller: find('lib/services/app_link_service.dart'),
    host: find('lib/screens/app_link_destination_screen.dart') };
  fs.mkdirSync(path.join(project, 'web'));
  fs.writeFileSync(path.join(project, 'web/index.html'), '<!doctype html><html lang="de"><head><base href="/"><meta charset="UTF-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script src="flutter_bootstrap.js" defer></script></body></html>');
  fs.writeFileSync(path.join(project, 'web/flutter_bootstrap.js'), '{{flutter_js}}\n{{flutter_build_config}}\n_flutter.loader.load({config:{canvasKitBaseUrl:"canvaskit/"}});\n');
  const env = { PATH: `${flutterRoot}/bin:/usr/bin:/bin`, HOME: directory, PUB_CACHE: path.join(directory, 'pub-cache'),
    LANG: 'C.UTF-8', CI: 'true', FLUTTER_SUPPRESS_ANALYTICS: 'true' };
  const run = (args, phase) => new Promise((resolve, reject) => {
    emit(phase, 'begin');
    const child = spawn(path.join(flutterRoot, 'bin/flutter'), ['--suppress-analytics', '--no-version-check', ...args],
      { cwd: project, env, detached: true, stdio: 'ignore' });
    let stopOwned;
    try { if (child.pid) { stopOwned = ownGroup(child.pid); check(typeof stopOwned === 'function', 'history_build'); } }
    catch { child.kill('SIGKILL'); emit(phase, 'failed'); reject(Error('history_build')); return; }
    let timedOut = false;
    const stop = () => { timedOut = true; try { stopOwned?.(); } catch { reject(Error('probe_cleanup')); } };
    const timer = setTimeout(stop, 180000); signal?.addEventListener('abort', stop, { once: true });
    child.once('error', () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); emit(phase, 'failed'); reject(Error('history_build')); });
    child.once('exit', (code, killed) => { clearTimeout(timer); signal?.removeEventListener('abort', stop);
      const ok = code === 0 && killed === null && !timedOut; emit(phase, ok ? 'confirmed' : 'failed'); ok ? resolve() : reject(Error('history_build')); });
  });
  await run(['pub', 'get', '--enforce-lockfile'], 'locked-dependencies');
  await run(buildArguments, 'flutter-build');
  for (const source of sources) check(digest(fs.readFileSync(path.join(project, source.path))) === source.sha256
    && digest(fs.readFileSync(path.join(root, source.path))) === source.sha256, 'history_source');
  check(git('status', '--porcelain', '--untracked-files=all').length === 0, 'history_source');
  const files = inventoryTree(path.join(project, 'build/web'));
  const artifact = validateArtifact({ schemaVersion: 1, sourceHead, sourceDigest: digest(JSON.stringify(sources)),
    sourceHashes, lockSha256: find('pubspec.lock'), toolchain: { ...contract }, files, artifactDigest: artifactDigest(files) });
  fs.writeFileSync(path.join(directory, 'artifact.json'), JSON.stringify(artifact), { flag: 'wx', mode: 0o600 });
  return artifact;
}
