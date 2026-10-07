// Local, test-support-only preview. Never imported by a product entry point.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDefault = path.resolve(import.meta.dirname, '../..');
const prefix = 'sit-p7-web-preview-';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (value, code) => { if (!value) throw Error(code); };
export const boundFiles = Object.freeze([
  'test/support/mission_quorum_web_preview.dart',
  'test/support/mission_quorum_web_golden.dart',
  'backend/test/support/mission_quorum_web_fixture.js',
  'backend/test/mission_quorum_web_envelope.test.js',
  'test/mission_quorum_web_view_test.dart',
  'test/tool/mission_quorum_web_preview_contract.test.mjs',
  'assets/fonts/Roboto-Regular.ttf', 'assets/fonts/Roboto-Bold.ttf', 'pubspec.lock',
]);

export function parseArgs(args) {
  check(args.length === 4 && args[0] === '--source-head' && /^[a-f0-9]{40}$/u.test(args[1])
    && args[2] === '--port' && args[3] === '0', 'preview_arguments');
  return { sourceHead: args[1], port: 0 };
}

async function regularBytes(file) {
  const fd = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await fd.stat();
    check(stat.isFile() && stat.nlink === 1, 'preview_source_file');
    return await fd.readFile();
  } finally { await fd.close(); }
}

export async function preflight(root, sourceHead) {
  check(/^[a-f0-9]{40}$/u.test(sourceHead), 'preview_head');
  const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  check(git('rev-parse', 'HEAD').toString().trim() === sourceHead, 'preview_head');
  const bytes = {}; const hashes = {};
  for (const file of boundFiles) {
    try {
      check(git('status', '--porcelain', '--', file).length === 0, 'preview_source_dirty');
      git('ls-files', '--error-unmatch', '--', file);
      bytes[file] = await regularBytes(path.join(root, file));
      check(bytes[file].equals(git('show', `${sourceHead}:${file}`)), 'preview_source_bytes');
      hashes[file] = sha(bytes[file]);
    } catch { throw Error('preview_source_invalid'); }
  }
  return { bytes, hashes };
}

function project(proof) {
  const sourceLock = proof.bytes['pubspec.lock'].toString();
  const names = ['characters', 'collection', 'crypto', 'flutter', 'material_color_utilities', 'meta', 'sky_engine', 'typed_data', 'vector_math'];
  const blocks = names.map((name) => {
    const block = sourceLock.match(new RegExp(`^  ${name}:\\n[\\s\\S]*?(?=^  [a-z_]+:|^sdks:)`, 'm'))?.[0];
    check(block, 'preview_lock_package'); return block;
  });
  const cryptoVersion = blocks[2].match(/version: "([0-9.]+)"/u)?.[1];
  check(cryptoVersion, 'preview_crypto_version');
  const lock = `# Subset of exact source lock; no plugin or application dependency.\npackages:\n${blocks.join('')}${sourceLock.slice(sourceLock.indexOf('\nsdks:') + 1)}`;
  return {
    'pubspec.yaml': `name: sit_p7_ephemeral_preview\npublish_to: none\nenvironment:\n  sdk: '>=3.10.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n  crypto: ${cryptoVersion}\nflutter:\n  uses-material-design: true\n  fonts:\n    - family: Roboto\n      fonts:\n        - asset: assets/fonts/Roboto-Regular.ttf\n        - asset: assets/fonts/Roboto-Bold.ttf\n          weight: 700\n`,
    'pubspec.lock': lock,
    'lib/mission_quorum_web_preview.dart': proof.bytes[boundFiles[0]],
    'lib/mission_quorum_web_golden.dart': proof.bytes[boundFiles[1]],
    'assets/fonts/Roboto-Regular.ttf': proof.bytes['assets/fonts/Roboto-Regular.ttf'],
    'assets/fonts/Roboto-Bold.ttf': proof.bytes['assets/fonts/Roboto-Bold.ttf'],
    'lib/main.dart': `import 'dart:convert';\nimport 'package:flutter/material.dart';\nimport 'mission_quorum_web_preview.dart';\nimport 'mission_quorum_web_golden.dart';\nvoid main() {\n  runApp(MaterialApp(theme: ThemeData(fontFamily: 'Roboto'), home: P7WebPreviewHarness.open(flag: true, raw: jsonDecode(p7DisplayGoldenJson), expectedDigest: p7DisplayGoldenDigest, expectedPrincipal: p7DisplayGoldenPrincipal)));\n}\n`,
    'web/index.html': '<!doctype html><html lang="de"><head><base href="/"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>P7 synthetischer lokaler Test</title></head><body><script src="flutter_bootstrap.js" defer></script></body></html>',
    'web/flutter_bootstrap.js': '{{flutter_js}}\n{{flutter_build_config}}\n_flutter.loader.load({config: {canvasKitBaseUrl: "canvaskit/"}});\n',
  };
}

// Dedicated detached process groups let cancellation stop only this build and
// its descendants. No shell, user browser or other Flutter process is targeted.
export function managedCommands() {
  const active = new Map(); const pids = []; let stopped = false;
  const alive = (pid) => { try { process.kill(-pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
  const stopGroup = async (pid) => {
    if (!alive(pid)) return;
    try { process.kill(-pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    for (let i = 0; i < 20 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
    if (alive(pid)) { try { process.kill(-pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    for (let i = 0; i < 20 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
    check(!alive(pid), 'preview_process_cleanup');
  };
  return {
    pids,
    async run(command, args, cwd) {
      check(!stopped, 'preview_aborted');
      const child = spawn(command, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: 'true', FLUTTER_SUPPRESS_ANALYTICS: 'true', DART_SUPPRESS_ANALYTICS: 'true' } });
      let output = '';
      child.stdout.on('data', (d) => { output = (output + d).slice(-12000); });
      child.stderr.on('data', (d) => { output = (output + d).slice(-12000); });
      const exit = new Promise((resolve, reject) => {
        child.once('error', reject); child.once('exit', (code) => resolve(code));
      });
      if (child.pid) { active.set(child.pid, exit); pids.push(child.pid); }
      try {
        const code = await exit;
        if (child.pid) await stopGroup(child.pid);
        if (code !== 0) { const error = Error('preview_command_failed'); error.diagnostic = output; throw error; }
        return output;
      } finally { if (child.pid) active.delete(child.pid); }
    },
    async close() {
      stopped = true;
      for (const [pid, exit] of active) { await stopGroup(pid); await exit.catch(() => {}); }
      check(pids.every((pid) => !alive(pid)), 'preview_process_cleanup');
    },
  };
}

async function buildProject({ directory, commands }) {
  // Current repository host is macOS. Deny all build-network traffic at the OS
  // boundary as well as asking pub/Flutter to use existing offline artifacts.
  check(process.platform === 'darwin', 'preview_offline_sandbox_unavailable');
  await fs.access('/usr/bin/sandbox-exec', constants.X_OK);
  const run = (args) => commands.run('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network*)',
    'flutter', '--suppress-analytics', '--no-version-check', ...args], directory);
  const version = JSON.parse(await run(['--version', '--machine']));
  check(version.frameworkVersion === '3.41.7' && version.dartSdkVersion.startsWith('3.11.5'), 'preview_toolchain');
  await run(['pub', 'get', '--offline', '--enforce-lockfile']);
  const lock = await fs.readFile(path.join(directory, 'pubspec.lock'));
  await run(['build', 'web', '--release', '--no-pub', '--no-web-resources-cdn', '--pwa-strategy=none']);
  check((await fs.readFile(path.join(directory, 'pubspec.lock'))).equals(lock), 'preview_lock_drift');
}

async function inventory(directory, relative = '') {
  const files = new Map();
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await inventory(directory, name)) files.set(key, value);
    } else {
      check(entry.isFile(), 'preview_artifact_type');
      // No service-worker endpoint is ever served, even if Flutter emits an
      // unused retirement/empty file for the explicit pwa-strategy=none build.
      if (/service_worker/iu.test(name)) continue;
      files.set(name, await regularBytes(path.join(directory, name)));
    }
  }
  return files;
}

export async function startPreview({ root = rootDefault, sourceHead, port, signal }, hooks = {}) {
  check(port === 0, 'preview_arguments');
  check(Object.keys(hooks).length === 0 || typeof process.env.NODE_TEST_CONTEXT === 'string', 'preview_test_hooks');
  const proof = await preflight(root, sourceHead);
  check(!signal?.aborted, 'preview_aborted');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const identity = await fs.lstat(directory);
  const commands = managedCommands();
  let server; let closing; let cleaned; let ready;
  const close = () => closing ??= (async () => {
    await commands.close();
    if (server) {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    }
    const current = await fs.lstat(directory);
    check(path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith(prefix)
      && current.isDirectory() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino, 'preview_cleanup_identity');
    await fs.rm(directory, { recursive: true, force: false });
    await assertAbsent(directory);
    signal?.removeEventListener('abort', onAbort);
    cleaned = { status: 'p7-preview-cleaned', head: sourceHead, tempRoot: directory,
      port: ready ? new URL(ready.url).port : null, processesRemaining: 0, tempAbsent: true, listenerClosed: !server?.listening };
    return cleaned;
  })();
  // During build, abort kills child groups but removal waits until build exits.
  const onAbort = () => { void commands.close().catch(() => {}); if (ready) void close().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (const [file, bytes] of Object.entries(project(proof))) {
      await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await fs.writeFile(path.join(directory, file), bytes, { flag: 'wx', mode: 0o600 });
    }
    await (hooks.build ?? buildProject)({ directory, commands });
    check(!signal?.aborted, 'preview_aborted');
    // Recheck after asynchronous compilation before publishing any bound bytes.
    await preflight(root, sourceHead);
    const files = await inventory(path.join(directory, 'build/web'));
    check(files.has('index.html') && files.has('main.dart.js'), 'preview_artifact_missing');
    const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', wasm: 'application/wasm', ttf: 'font/ttf', woff2: 'font/woff2', png: 'image/png' };
    server = http.createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'none'; frame-ancestors 'none'; base-uri 'self'");
      if (request.headers.host !== `127.0.0.1:${server.address().port}`) { response.writeHead(403).end(); return; }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const name = request.url === '/' ? 'index.html' : request.url.slice(1);
      const bytes = files.get(name);
      if (!bytes) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', types[name.split('.').at(-1)] ?? 'application/octet-stream');
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : bytes);
    });
    await (hooks.listen ?? ((s) => new Promise((resolve, reject) => {
      s.once('error', reject); s.listen(0, '127.0.0.1', resolve);
    })))(server);
    check(!signal?.aborted && server.address()?.address === '127.0.0.1', 'preview_bind');
    server.on('error', () => {
      process.exitCode = 1;
      void close().then(
        (record) => console.error(JSON.stringify({ ...record, status: 'p7-preview-server-error-cleaned' })),
        () => console.error(JSON.stringify({ status: 'p7-preview-cleanup-failed' })),
      );
    });
    ready = { status: 'p7-preview-ready', head: sourceHead, url: `http://127.0.0.1:${server.address().port}/`,
      sourceHashes: proof.hashes, artifactDigest: sha(JSON.stringify([...files].map(([name, bytes]) => [name, sha(bytes)]).sort())),
      tempRoot: directory, runnerPid: process.pid, buildProcessIds: commands.pids, browserOwned: false, nonBinding: true };
    return { ready, close, get cleanup() { return cleaned; } };
  } catch (error) { await close(); throw error; }
}

async function assertAbsent(directory) {
  try { await fs.lstat(directory); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw Error('preview_cleanup_remaining');
}

export async function runCli(args, hooks = {}) {
  check(Object.keys(hooks).length === 0 || typeof process.env.NODE_TEST_CONTEXT === 'string', 'preview_test_hooks');
  const { emit = (record) => console.log(JSON.stringify(record)), ...support } = hooks;
  const controller = new AbortController();
  let session;
  let announced = false;
  const detach = () => { process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); };
  const shutdown = async () => {
    controller.abort();
    if (session) {
      try { const record = await session.close(); if (!announced) { announced = true; emit(record); } }
      catch { emit({ status: 'p7-preview-cleanup-failed' }); process.exitCode = 1; }
      finally { detach(); }
    }
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  try {
    session = await startPreview({ ...parseArgs(args), signal: controller.signal }, support);
    emit(session.ready);
    return session;
  } catch (error) {
    detach();
    emit({ status: 'p7-preview-refused', reason: /^preview_[a-z_]+$/u.test(error.message) ? error.message : 'preview_failure' });
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli(process.argv.slice(2));
