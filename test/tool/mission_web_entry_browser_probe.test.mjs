import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseArgs, validateTargets, validateVersion, validateNetwork, validateCleanup,
  runBlankPreflight, launchArgs, policy, limits, readStableStartupFile,
} from '../support/mission_web_entry_browser_probe.mjs';

const targets = () => [
  { type: 'browser_ui', url: 'chrome://synthetic-toolbar/' },
  { type: 'browser_ui', url: 'chrome://synthetic-panel/' },
  { type: 'page', url: 'about:blank' },
];
const version = () => ({ httpStatus: 200, browser: 'Chrome/154.0.8037.93',
  protocol: '1.3', cdpBrowser: 'Chrome/154.0.8037.93', cdpProtocol: '1.3' });
const network = () => ({ loopbackHttpStatus: 200, externalTcp: 'EPERM' });
const cleanup = () => ({ exitCode: 0, exitSignal: null, processGroupAbsent: true,
  processReferences: 0, portClosed: true, profileRemoved: true });
function fake(change = {}) {
  const calls = [];
  return { calls, adapter: {
    start: async () => { calls.push('start'); },
    observe: async () => { calls.push('observe'); return { version: version(), targets: targets() }; },
    network: async () => { calls.push('network'); return network(); },
    close: async () => { calls.push('close'); return cleanup(); },
    ...change,
  } };
}
test('only explicit blank mode is accepted; URLs, paths and flags cannot be forwarded', () => {
  assert.equal(parseArgs(['--blank-preflight']), 'blank-preflight');
  for (const args of [[], ['https://shareittoo.com'], ['--blank-preflight', 'x'],
    ['--blank-preflight', '--user-data-dir=/private'], ['--url', 'about:blank']]) {
    assert.throws(() => parseArgs(args), /^Error: probe_arguments$/);
  }
});
test('target inventory is exact and rejects extension/unknown/additional/missing targets', () => {
  assert.deepEqual(validateTargets(targets()), { browserUi: 2, blankPages: 1, extensions: 0, other: 0 });
  for (const value of [[], null, targets().slice(1), [...targets(), targets()[2]],
    [...targets(), { type: 'background_page', url: 'chrome-extension://private/' }],
    [...targets().slice(0, 2), { type: 'page', url: 'https://foreign.invalid/private' }],
    [...targets().slice(0, 2), { type: 'other', url: 'about:blank' }],
    [{ type: 'browser_ui', url: 'https://foreign.invalid' }, ...targets().slice(1)],
    [...targets().slice(0, 2), { type: 'page', url: 'about:blank#x' }]]) {
    assert.throws(() => validateTargets(value), /^Error: probe_targets$/);
  }
});
test('browser, protocol and HTTP are pinned on both HTTP and CDP readbacks', () => {
  validateVersion(version());
  for (const [key, value] of Object.entries({ httpStatus: 302, browser: 'Chrome/other', protocol: '2', cdpBrowser: 'Chrome/other', cdpProtocol: '2' })) {
    assert.throws(() => validateVersion({ ...version(), [key]: value }), /^Error: probe_version$/);
  }
});
test('only actual EPERM plus successful sandboxed loopback proves isolation', () => {
  validateNetwork(network());
  for (const value of ['EACCES', 'ETIMEDOUT', 'connected', null]) {
    assert.throws(() => validateNetwork({ ...network(), externalTcp: value }), /^Error: probe_network$/);
  }
  assert.throws(() => validateNetwork({ ...network(), loopbackHttpStatus: 500 }), /^Error: probe_network$/);
});
test('all cleanup proofs are mandatory including exact normal Chrome exit', () => {
  validateCleanup(cleanup());
  for (const [key, value] of Object.entries({ exitCode: 1, exitSignal: 'SIGTERM', processGroupAbsent: false,
    processReferences: 1, portClosed: false, profileRemoved: false })) {
    assert.throws(() => validateCleanup({ ...cleanup(), [key]: value }), /^Error: probe_cleanup$/);
    const missing = cleanup(); delete missing[key];
    assert.throws(() => validateCleanup(missing), /^Error: probe_cleanup$/);
  }
});
test('successful output is exact sanitized schema and call order', async () => {
  const f = fake();
  assert.deepEqual(await runBlankPreflight({ platform: 'darwin', adapter: f.adapter }), {
    schemaVersion: 1, mode: 'blank-preflight', status: 'pass', browser: 'Chrome/154.0.8037.93', protocol: '1.3',
    targets: { browserUi: 2, blankPages: 1, extensions: 0, other: 0 }, network: network(), cleanup: cleanup(),
  });
  assert.deepEqual(f.calls, ['start', 'observe', 'network', 'close']);
});
test('unsupported hosts fail closed without creating a profile', async () => {
  const f = fake();
  assert.deepEqual(await runBlankPreflight({ platform: 'linux', adapter: f.adapter }),
    { schemaVersion: 1, mode: 'blank-preflight', status: 'fail', code: 'probe_unsupported' });
  assert.deepEqual(f.calls, []);
});
test('every failed stage cleans up and never echoes arbitrary error details', async () => {
  for (const stage of ['start', 'observe', 'network']) {
    const f = fake({ [stage]: async () => { throw Error('private-path account secret'); } });
    const result = await runBlankPreflight({ platform: 'darwin', adapter: f.adapter });
    assert.deepEqual(result, { schemaVersion: 1, mode: 'blank-preflight', status: 'fail', code: 'probe_failure' });
    assert.equal(f.calls.at(-1), 'close');
  }
  const f = fake({ close: async () => ({ ...cleanup(), portClosed: false }) });
  assert.equal((await runBlankPreflight({ platform: 'darwin', adapter: f.adapter })).code, 'probe_cleanup');
});
test('unexpected targets stop before any network probe; abort cannot report success', async () => {
  const f = fake({ observe: async () => ({ version: version(), targets: [] }) });
  assert.equal((await runBlankPreflight({ platform: 'darwin', adapter: f.adapter })).code, 'probe_targets');
  assert.deepEqual(f.calls, ['start', 'close']);
  const controller = new AbortController(); controller.abort();
  const aborted = fake();
  assert.equal((await runBlankPreflight({ platform: 'darwin', adapter: aborted.adapter, signal: controller.signal })).code, 'probe_aborted');
  const late = new AbortController();
  const closing = fake({ close: async () => { late.abort(); return cleanup(); } });
  assert.equal((await runBlankPreflight({ platform: 'darwin', adapter: closing.adapter, signal: late.signal })).code, 'probe_aborted');
});
test('startup port bytes and metadata come from one stable no-follow descriptor', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sit-browser-port-read-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'DevToolsActivePort');
  fs.writeFileSync(file, '49152\n', { mode: 0o600 });
  assert.deepEqual(await readStableStartupFile(file), Buffer.from('49152\n'));
  fs.rmSync(file); fs.symlinkSync(path.join(directory, 'missing-target'), file);
  await assert.rejects(readStableStartupFile(file), /^Error: probe_startup$/);
});
for (const variant of ['replacement', 'growth', 'permission']) {
  test(`startup port descriptor rejects concurrent ${variant}`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sit-browser-port-race-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'DevToolsActivePort');
    fs.writeFileSync(file, '49152\n', { mode: 0o600 });
    const mutate = async () => {
      if (variant === 'replacement') {
        fs.renameSync(file, path.join(directory, 'retained-port'));
        fs.writeFileSync(file, '49152\n', { mode: 0o600 });
      }
      if (variant === 'growth') fs.appendFileSync(file, 'growth');
      if (variant === 'permission') fs.chmodSync(file, 0o644);
    };
    await assert.rejects(readStableStartupFile(file, mutate), /^Error: probe_startup$/);
  });
}
test('launch policy and bounded ownership/cleanup remain explicit; CI never launches Chrome', () => {
  assert.equal(policy, '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))');
  const args = launchArgs('/tmp/synthetic-owned-profile');
  for (const flag of ['--disable-extensions', '--disable-component-extensions-with-background-pages', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-crash-reporter', '--disable-breakpad', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0']) assert.ok(args.includes(flag));
  assert.equal(args.at(-1), 'about:blank');
  assert.ok(Object.values(limits).every(v => Number.isInteger(v) && v > 0 && v <= 10000));
  const source = fs.readFileSync(new URL('../support/mission_web_entry_browser_probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.NODE_TEST_CONTEXT/);
  assert.match(source, /detached: true/);
  assert.match(source, /await stop\(child\.pid\)/);
  assert.match(source, /process\.kill\(-pid, 'SIGTERM'\)/);
  assert.equal((source.match(/process\.kill\([^\n]+, 'SIGTERM'\)/gu) ?? []).length, 1);
  assert.match(source, /current\.ino === identity\.ino/);
  assert.match(source, /current\.dev === identity\.dev/);
  assert.match(source, /error\.code === 'ECONNREFUSED'/);
  assert.match(source, /probe\.setTimeout\(500, \(\) => done\(false\)\)/);
  assert.match(source, /setTimeout\(\(\) => reject\(Error\('probe_timeout'\)\), limits\.request\)/);
  assert.match(source, /setTimeout\(\(\) => reject\(Error\('probe_timeout'\)\), limits\.network\)/);
  assert.doesNotMatch(source, /shell: true|--no-sandbox|--ignore-certificate-errors|SIT_MISSION_WEB_PREVIEW_ENABLED|https:\/\/shareittoo/);
});

test('standard technical regression glob automatically registers this fake-only test', () => {
  const runner = fs.readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');
  assert.match(runner, /^node --test test\/tool\/\*\.test\.mjs$/mu);
  const source = fs.readFileSync(import.meta.filename, 'utf8');
  assert.doesNotMatch(source, /spawn\(|execFile\(|runBlankPreflight\(\)/u);
});
