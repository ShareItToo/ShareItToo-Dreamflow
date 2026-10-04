import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { TARGET, profile, sealArtifact, sha256, stagingBootstrap, validateArtifact } from '../../tool/staging_web_contract.mjs';

const source = 'a'.repeat(40);
const nextSource = 'b'.repeat(40);
const version = '1.0.0+2026092905';
const release = (commit = source) => ({ target: TARGET, source: commit, version,
  profileDigest: sha256(JSON.stringify(profile(commit, version))) });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('legacy bootstrap bytes stay identical to the accepted pre-monitor checkpoint', () => {
  // Verified against c611797f5f5513038bb5fb77841fce5410b82c82, never rebind to a new template.
  assert.equal(sha256(stagingBootstrap), '80ba043bb8e2664aa53e9286552e70599fd3cba3450611703448cd0ba8f50513');
});

function artifact(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-freshness-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'web'));
  for (const [name, bytes] of Object.entries({ 'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'fixture', 'manifest.json': '{}', 'flutter_bootstrap.js': 'fixture' })) {
    fs.writeFileSync(path.join(directory, 'web', name), bytes);
  }
  const hash = sealArtifact({ directory, source, version, flutterVersion: {}, builderDigest: 'c'.repeat(64) });
  return { directory, hash, script: fs.readFileSync(path.join(directory, 'web/staging_bootstrap.js'), 'utf8') };
}

async function browser(script, { origin = TARGET, visible = true, initial = release(), response = {} } = {}) {
  let now = 0; let serial = 0; let remote = initial; let failure = null;
  const timers = new Map(); const listeners = new Map(); const requests = []; const mutations = [];
  const input = { value: 'ungespeicherter Entwurf' }; const children = [input];
  const listen = (type, callback) => listeners.set(type, callback);
  const document = { visibilityState: visible ? 'visible' : 'hidden', activeElement: input,
    addEventListener: listen, removeEventListener: (type) => listeners.delete(type),
    createElement: (tag) => ({ tag, attributes: {}, style: {}, children: [],
      setAttribute(key, value) { this.attributes[key] = value; },
      appendChild(child) { this.children.push(child); },
      addEventListener(type, callback) { this[type] = callback; },
      remove() { children.splice(children.indexOf(this), 1); },
    }),
    body: { appendChild: (element) => children.push(element), textContent: '' },
  };
  const context = { URL, AbortController, Date: { now: () => now }, document,
    addEventListener: listen, removeEventListener: (type) => listeners.delete(type),
    location: { origin, reload: () => mutations.push('reload'), assign: () => mutations.push('navigate') },
    navigator: { serviceWorker: { controller: null, getRegistrations: async () => [] } },
    caches: { delete: async (key) => mutations.push(`cache:${key}`) },
    sessionStorage: { getItem: () => null, setItem: () => mutations.push('storage:set'), removeItem: () => mutations.push('storage:remove') },
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (failure === 'hang') return new Promise(() => {});
      if (failure) throw Error('offline');
      return { ok: true, status: 200, url: `${TARGET}/staging-release.json`, redirected: false,
        headers: { get: () => 'application/json' }, text: async () => JSON.stringify(remote), ...response };
    },
  };
  context.window = context;
  await vm.runInNewContext(script, context); await flush();
  // Existing one-time, pre-app cache retirement is not part of the monitor.
  mutations.length = 0;
  return { requests, mutations, timers, listeners, document, input,
    notices: () => children.filter((element) => element.attributes?.role === 'status'),
    remote: (value) => { remote = value; }, fail: (value) => { failure = value; },
    async event(type) { listeners.get(type)?.(); await flush(); },
    async advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      await flush();
    },
  };
}

test('running visible client reports changed exact source even when version is unchanged, preserving input', async (t) => {
  const b = await browser(artifact(t).script);
  b.remote(release(nextSource)); await b.advance(300000);
  assert.equal(b.notices().length, 1);
  const notice = b.notices()[0];
  assert.match(notice.textContent, /Neue sichere Staging-Version verfügbar\. Eingaben sichern und Seite manuell neu laden/u);
  assert.equal(notice.attributes['aria-live'], 'polite');
  assert.equal(b.input.value, 'ungespeicherter Entwurf');
  assert.equal(b.document.activeElement, b.input);
  assert.deepEqual(b.mutations, []);
  for (const { url, options } of b.requests) {
    assert.equal(url, '/staging-release.json');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers, undefined);
  }
  await b.event('focus'); await b.advance(600000);
  assert.equal(b.notices().length, 1);
  await b.event('visibilitychange'); await b.advance(600000);
  assert.equal(b.notices().length, 1, 'warning persists until manual reload');
  assert.deepEqual(notice.children, [], 'no dismiss or reload action');
});

for (const [name, identity] of Object.entries({
  version: { ...release(), version: '1.0.0+2026100201', profileDigest: sha256(JSON.stringify(profile(source, '1.0.0+2026100201'))) },
  profile: { ...release(), profileDigest: 'd'.repeat(64) },
})) test(`same-source changed ${name} identity also requires a persistent notice`, async (t) => {
  const b = await browser(artifact(t).script);
  b.remote(identity); await b.advance(300000);
  assert.equal(b.notices().length, 1); assert.deepEqual(b.mutations, []);
});

test('hidden clients do not poll; visibility and focus resume bounded checks', async (t) => {
  const b = await browser(artifact(t).script, { visible: false });
  await b.advance(600000); assert.equal(b.requests.length, 0);
  b.document.visibilityState = 'visible'; await b.event('visibilitychange');
  assert.equal(b.requests.length, 1);
  await b.event('focus'); await b.event('focus'); assert.equal(b.requests.length, 1);
  b.document.visibilityState = 'hidden'; await b.event('visibilitychange');
  await b.advance(600000); assert.equal(b.requests.length, 1);
  b.remote(release(nextSource)); b.document.visibilityState = 'visible'; await b.event('focus');
  assert.equal(b.notices().length, 1);
});

test('offline and stalled requests never invent updates or retry without a bound', async (t) => {
  const b = await browser(artifact(t).script);
  b.fail('offline');
  for (let i = 0; i < 5; i++) await b.advance(300000);
  assert.equal(b.requests.length, 4, 'initial success and at most three automatic failures');
  assert.equal(b.notices().length, 0);
  b.fail('hang'); await b.event('focus');
  const count = b.requests.length;
  await b.event('focus'); assert.equal(b.requests.length, count, 'one in-flight request');
  await b.advance(8000); assert.equal(b.requests.at(-1).options.signal.aborted, true);
  b.fail(null); b.remote(release(nextSource)); await b.advance(30000); await b.event('focus');
  assert.equal(b.notices().length, 1);
  assert.deepEqual(b.mutations, []);
});

for (const [name, value] of Object.entries({
  missing: {}, array: [], null: null, extra: { ...release(nextSource), trusted: true },
  origin: { ...release(nextSource), target: 'https://shareittoo.com' },
  short: { ...release(nextSource), source: 'b'.repeat(39) },
  invalid: { ...release(nextSource), source: 'g'.repeat(40) },
  version: { ...release(nextSource), version: 'unknown' },
  digest: { ...release(nextSource), profileDigest: 'x' },
})) test(`invalid release response ${name} cannot claim an update`, async (t) => {
  const b = await browser(artifact(t).script, { initial: value });
  assert.equal(b.notices().length, 0); assert.deepEqual(b.mutations, []);
});

for (const [name, response] of Object.entries({
  unavailable: { ok: false, status: 503 },
  redirected: { redirected: true },
  foreignUrl: { url: 'https://foreign.invalid/staging-release.json' },
  html: { headers: { get: () => 'text/html' } },
  malformed: { text: async () => '{' },
  oversized: { text: async () => 'x'.repeat(4097) },
})) test(`invalid HTTP release response ${name} cannot claim an update`, async (t) => {
  const b = await browser(artifact(t).script, { initial: release(nextSource), response });
  assert.equal(b.notices().length, 0); assert.deepEqual(b.mutations, []);
});

test('Production never fetches a release or installs freshness handlers', async (t) => {
  const b = await browser(artifact(t).script, { origin: 'https://shareittoo.com' });
  await b.event('focus'); await b.advance(600000);
  assert.equal(b.requests.length, 0); assert.equal(b.listeners.size, 0);
});

function rewrite(f, mutate, bootstrap = null) {
  const file = path.join(f.directory, 'staging-web-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file)); mutate(manifest);
  if (bootstrap !== null) {
    fs.writeFileSync(path.join(f.directory, 'web/staging_bootstrap.js'), bootstrap);
    manifest.files['staging_bootstrap.js'] = sha256(bootstrap);
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const hash = sha256(fs.readFileSync(file));
  fs.writeFileSync(path.join(f.directory, 'SHA256SUMS'), `${hash}  staging-web-manifest.json\n${Object.entries(manifest.files).map(([name, digest]) => `${digest}  web/${name}\n`).join('')}`);
  return hash;
}

test('sealed candidate binds the monitor to its exact source and contract', (t) => {
  const f = artifact(t);
  const manifest = validateArtifact(f.directory, f.hash, source);
  assert.equal(manifest.bootstrapContractVersion, 2);
  assert.ok(f.script.includes(source));
  const monitor = f.script.slice(f.script.indexOf('(function monitorStagingRelease'));
  assert.doesNotMatch(monitor, /location\.(?:reload|assign|replace)|(?:local|session)Storage|caches\.|\.focus\(|innerHTML/u);
  const bad = rewrite(f, () => {}, f.script.replace(source, nextSource));
  assert.throws(() => validateArtifact(f.directory, bad, source), /artifact_cache_contract/u);
});

test('invalid artifact validation mode fails closed', (t) => {
  const f = artifact(t);
  assert.throws(() => validateArtifact(f.directory, f.hash, source, { mode: 'legacy' }), /artifact_validation_mode_invalid/u);
});

for (const variant of ['missing', 'extra']) test(`v2 ${variant} sealed identity is rejected before requests and by artifact validation`, async (t) => {
  const f = artifact(t);
  const { target: _, ...identity } = release();
  const changed = { ...identity };
  if (variant === 'missing') delete changed.profileDigest;
  else changed.extra = true;
  const script = f.script.replace(JSON.stringify(identity), JSON.stringify(changed));
  assert.notEqual(script, f.script);
  const b = await browser(script);
  assert.equal(b.requests.length, 0); assert.equal(b.listeners.size, 0);
  const hash = rewrite(f, () => {}, script);
  assert.throws(() => validateArtifact(f.directory, hash, source), /artifact_cache_contract/u);
});

test('rehashed legacy candidates fail; exact legacy bytes validate only in explicit current or rollback mode', (t) => {
  const f = artifact(t);
  const hash = rewrite(f, (m) => { delete m.bootstrapContractVersion; }, stagingBootstrap);
  assert.throws(() => validateArtifact(f.directory, hash, source), /artifact_bootstrap_contract/u);
  for (const mode of ['current', 'rollback']) {
    assert.equal(validateArtifact(f.directory, hash, source, { mode }).source, source);
  }
  const altered = rewrite(f, () => {}, `${stagingBootstrap}\n// altered`);
  assert.throws(() => validateArtifact(f.directory, altered, source, { mode: 'current' }), /artifact_cache_contract/u);
  assert.throws(() => validateArtifact(f.directory, altered, source, { mode: 'rollback' }), /artifact_cache_contract/u);
});

for (const value of [null, 1, 3, '2']) test(`invalid bootstrap contract ${JSON.stringify(value)} fails closed`, (t) => {
  const f = artifact(t); const hash = rewrite(f, (m) => { m.bootstrapContractVersion = value; });
  assert.throws(() => validateArtifact(f.directory, hash, source), /artifact_bootstrap_contract/u);
});
