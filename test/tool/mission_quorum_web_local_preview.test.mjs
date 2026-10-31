import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createTestTempTracker } from './test_temp_fixtures.mjs';
import { boundFiles, parseArgs, preflight, startPreview, managedCommands, runCli } from '../support/mission_quorum_web_local_preview.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const temps = createTestTempTracker();
const build = async ({ directory }) => {
  await fs.mkdir(path.join(directory, 'build/web'), { recursive: true });
  await fs.writeFile(path.join(directory, 'build/web/index.html'), '<!doctype html>synthetic');
  await fs.writeFile(path.join(directory, 'build/web/main.dart.js'), '// synthetic');
};

test('strict arguments reject absent/malformed head, arbitrary port, host and duplicate inputs', () => {
  assert.deepEqual(parseArgs(['--source-head', head, '--port', '0']), { sourceHead: head, port: 0 });
  for (const args of [[], ['--source-head', 'bad', '--port', '0'], ['--source-head', head, '--port', '8000'],
    ['--source-head', head, '--port', '0', '--host', '0.0.0.0'], ['--source-head', head, '--port', '0', '--port', '0']]) {
    assert.throws(() => parseArgs(args), /preview_arguments/u);
  }
});

test('source preflight pins HEAD, tracked bytes and no symlinks', async () => {
  const proof = await preflight(repo, head);
  assert.equal(Object.keys(proof.hashes).length, boundFiles.length);
  await assert.rejects(preflight(repo, '0'.repeat(40)), /preview_head/u);
  const root = temps.makeSync('sit-p7-preview-source-');
  for (const file of boundFiles) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.copyFile(path.join(repo, file), path.join(root, file));
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q'); git('add', '--', ...boundFiles);
  git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'fixture');
  const fixtureHead = git('rev-parse', 'HEAD').toString().trim();
  await fs.appendFile(path.join(root, boundFiles[0]), '\n// dirty');
  await assert.rejects(preflight(root, fixtureHead), /preview_source/u);
  await fs.unlink(path.join(root, boundFiles[0]));
  await fs.symlink(path.join(repo, boundFiles[0]), path.join(root, boundFiles[0]));
  await assert.rejects(preflight(root, fixtureHead), /preview_source/u);
});

test('normal loopback session copies exact sources, serves no-store and cleans idempotently', async () => {
  const foreign = temps.makeSync('sit-p7-preview-foreign-');
  await fs.writeFile(path.join(foreign, 'keep'), 'unrelated');
  const session = await startPreview({ root: repo, sourceHead: head, port: 0 }, { build });
  try {
    const r = session.ready;
    assert.match(r.url, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
    assert.equal(r.head, head);
    assert.equal(r.runnerPid, process.pid);
    assert.equal(r.browserOwned, false);
    for (const [from, to] of [['test/support/mission_quorum_web_preview.dart', 'lib/mission_quorum_web_preview.dart'],
      ['test/support/mission_quorum_web_golden.dart', 'lib/mission_quorum_web_golden.dart'],
      ['assets/fonts/Roboto-Regular.ttf', 'assets/fonts/Roboto-Regular.ttf']]) {
      assert.deepEqual(await fs.readFile(path.join(r.tempRoot, to)), await fs.readFile(path.join(repo, from)));
    }
    const response = await fetch(r.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /worker-src 'none'/u);
    assert.equal((await fetch(`${r.url}unknown`)).status, 404);
    assert.equal((await fetch(r.url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${r.url}flutter_service_worker.js`)).status, 404);
    const foreignHost = await new Promise((resolve, reject) => {
      const request = http.get(r.url, { headers: { host: 'evil.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); });
      request.once('error', reject);
    });
    assert.equal(foreignHost, 403);
    const spec = await fs.readFile(path.join(r.tempRoot, 'pubspec.yaml'), 'utf8');
    assert.match(spec, /crypto: 3\.0\.7/u);
    assert.doesNotMatch(spec, /firebase|http:|shared_preferences|camera|scanner/u);
  } finally { await session.close(); }
  assert.deepEqual(await session.close(), session.cleanup);
  assert.equal(session.cleanup.status, 'p7-preview-cleaned');
  assert.equal(session.cleanup.processesRemaining, 0);
  await assert.rejects(fs.access(session.ready.tempRoot));
  await assert.rejects(fetch(session.ready.url));
  assert.equal(await fs.readFile(path.join(foreign, 'keep'), 'utf8'), 'unrelated');
});

test('owned running process group is terminated and proven absent', async () => {
  const commands = managedCommands();
  const running = commands.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], repo).catch((e) => e);
  assert.equal(commands.pids.length, 1);
  await commands.close();
  assert.match((await running).message, /preview_command_failed/u);
  assert.throws(() => process.kill(-commands.pids[0], 0), { code: 'ESRCH' });
  await commands.close();
});

test('actual CLI SIGINT/SIGTERM handlers report cleanup once and remove their listeners', async () => {
  for (const name of ['SIGINT', 'SIGTERM']) {
    const before = process.listenerCount(name); const records = [];
    const session = await runCli(['--source-head', head, '--port', '0'], { build, emit: (r) => records.push(r) });
    process.emit(name);
    await session.close();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(process.listenerCount(name), before);
    assert.equal(records.filter((r) => r.status === 'p7-preview-ready').length, 1);
    assert.equal(records.filter((r) => r.status === 'p7-preview-cleaned').length, 1);
    await assert.rejects(fs.access(session.ready.tempRoot));
    await assert.rejects(fetch(session.ready.url));
  }
});

test('build/bind errors and abort signal clean owned temporary state', async () => {
  for (const phase of ['build', 'bind', 'signal']) {
    let directory;
    const controller = new AbortController();
    const hooks = { build: async (ctx) => {
      directory = ctx.directory;
      if (phase === 'build') throw Error('synthetic_build_failure');
      await build(ctx);
      if (phase === 'signal') controller.abort();
    } };
    if (phase === 'bind') hooks.listen = async () => { throw Error('synthetic_bind_failure'); };
    await assert.rejects(startPreview({ root: repo, sourceHead: head, port: 0, signal: controller.signal }, hooks));
    await assert.rejects(fs.access(directory));
  }
});

test('abort after readiness closes the real listener and erases only its owned root', async () => {
  const controller = new AbortController();
  const session = await startPreview({ root: repo, sourceHead: head, port: 0, signal: controller.signal }, { build });
  controller.abort();
  await session.close();
  await assert.rejects(fs.access(session.ready.tempRoot));
  await assert.rejects(fetch(session.ready.url));
  assert.equal(session.cleanup.listenerClosed, true);
});

test('runtime server errors are failure outcomes even when owned cleanup succeeds', async () => {
  let listener;
  const previousExitCode = process.exitCode;
  const session = await startPreview({ root: repo, sourceHead: head, port: 0 }, { build,
    listen: (server) => new Promise((resolve) => { listener = server; server.listen(0, '127.0.0.1', resolve); }),
  });
  try {
    listener.emit('error', Error('synthetic_runtime_error'));
    await session.close();
    assert.equal(process.exitCode, 1);
    await assert.rejects(fs.access(session.ready.tempRoot));
    await assert.rejects(fetch(session.ready.url));
  } finally { process.exitCode = previousExitCode; }
});

test('runner stays test-only, offline and does not depend on product bootstrap or providers', async () => {
  const source = await fs.readFile(new URL('../support/mission_quorum_web_local_preview.mjs', import.meta.url), 'utf8');
  assert.match(source, /--offline/u);
  assert.match(source, /--enforce-lockfile/u);
  assert.match(source, /--no-web-resources-cdn/u);
  assert.match(source, /--pwa-strategy=none/u);
  assert.doesNotMatch(source, /import .*?(?:backend|lib\/|staging_web|firebase|shared_preferences)/u);
  assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1)/u);
  assert.match(source, /SIGINT/u); assert.match(source, /SIGTERM/u);
});
