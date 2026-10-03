import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contract, parseArgs, validateInventory, validateNetwork, validateObservation,
  validateCleanup, runProbe, launchArgs, privilegeArgs } from '../support/mission_web_entry_linux_probe.mjs';

const sha = 'a'.repeat(40);
const digests = () => ({ runnerSha256: '1'.repeat(64), chromeSha256: '2'.repeat(64), nodeSha256: '3'.repeat(64) });
const inventory = () => ({ platform: 'linux', arch: 'x64', imageOS: 'ubuntu24',
  imageVersion: '20260927.320.1', node: '22.23.3', chrome: '154.0.8037.57',
  uid: 1001, gid: 1001, head: sha, clean: true, digests: digests() });
const network = () => ({ links: ['lo'], routes4: [], routes6: [], resolverEmpty: true });
const observation = () => ({ browser: 'Chrome/154.0.8037.57', protocol: '1.3', httpStatus: 200,
  targets: [{ type: 'page', url: 'about:blank' }], evaluated: true,
  renderers: [{ uid: 1001, gid: 1001, seccomp: 2, filters: 1, noNewPrivs: 1,
    capabilities: '0000000000000000', nestedPidNamespace: true, forbiddenFlags: false }],
  externalTcp: 'ENETUNREACH', loopback: 200, workerPrivileges: true });
const cleanup = () => ({ processesAbsent: true, groupAbsent: true, namespaceRemoved: true,
  resolverRemoved: true, portClosed: true, profileRemoved: true, exitCode: 0, exitSignal: null });
function fake(overrides = {}) { const calls = []; return { calls, adapter: {
  inventory: async () => { calls.push('inventory'); return inventory(); },
  prepare: async () => { calls.push('prepare'); return network(); },
  observe: async () => { calls.push('observe'); return observation(); },
  cleanup: async () => { calls.push('cleanup'); return cleanup(); }, ...overrides,
} }; }
test('closed CLI, source and exact official image versions reject drift', () => {
  assert.equal(parseArgs(['--linux-blank-preflight', '--source-head', sha]), sha);
  for (const args of [[], ['--linux-blank-preflight'], ['--worker'], ['--linux-blank-preflight', '--source-head', sha, 'https://foreign.invalid']]) assert.throws(() => parseArgs(args));
  validateInventory(inventory(), sha);
  for (const [key, value] of Object.entries({ platform: 'darwin', arch: 'arm64', imageOS: 'ubuntu22', imageVersion: 'next', node: '22.0.0', chrome: '154.0.8037.93', uid: 0, gid: 0, head: 'b'.repeat(40), clean: false })) assert.throws(() => validateInventory({ ...inventory(), [key]: value }, sha));
  assert.equal(contract.inventoryCommit, 'db776964592d0362a6bed85f90bc4e2980250e49');
});
test('inventory requires exactly three named lowercase SHA-256 digests without paths', () => {
  for (const value of [undefined, null, [], {}, { ...digests(), extra: '4'.repeat(64) }])
    assert.throws(() => validateInventory({ ...inventory(), digests: value }, sha));
  for (const key of Object.keys(digests())) {
    const missing = digests(); delete missing[key];
    assert.throws(() => validateInventory({ ...inventory(), digests: missing }, sha));
    for (const invalid of ['A'.repeat(64), 'g'.repeat(64), '1'.repeat(63), '1'.repeat(65), 1, '/tmp/private'])
      assert.throws(() => validateInventory({ ...inventory(), digests: { ...digests(), [key]: invalid } }, sha));
  }
});
test('only loopback with empty main route tables and resolver is accepted', () => {
  validateNetwork(network());
  for (const change of [{ links: [] }, { links: ['lo', 'eth0'] }, { routes4: [{ dst: 'default' }] }, { routes6: [{ dst: 'default' }] }, { resolverEmpty: false }]) assert.throws(() => validateNetwork({ ...network(), ...change }));
});
test('blank, evaluated renderer and positive sandbox proofs are all mandatory', () => {
  validateObservation(observation(), inventory());
  for (const change of [{ targets: [] }, { targets: [...observation().targets, { type: 'page', url: 'about:blank' }] }, { targets: [{ type: 'service_worker', url: 'chrome-extension://synthetic/' }] }, { evaluated: false }, { renderers: [] }, { externalTcp: 'EPERM' }, { externalTcp: 'connected' }, { loopback: 500 }, { httpStatus: 302 }, { browser: 'other' }, { protocol: '2' }, { workerPrivileges: false }]) assert.throws(() => validateObservation({ ...observation(), ...change }, inventory()));
  for (const [key, value] of Object.entries({ uid: 0, gid: 0, seccomp: 0, filters: 0, noNewPrivs: 0, capabilities: '1', nestedPidNamespace: false, forbiddenFlags: true })) assert.throws(() => validateObservation({ ...observation(), renderers: [{ ...observation().renderers[0], [key]: value }] }, inventory()));
});
test('every cleanup field is required; abnormal Chrome exit never passes', () => {
  validateCleanup(cleanup());
  for (const key of Object.keys(cleanup())) { const value = cleanup(); delete value[key]; assert.throws(() => validateCleanup(value)); }
  for (const change of [{ processesAbsent: false }, { portClosed: false }, { namespaceRemoved: false }, { exitCode: 1 }, { exitSignal: 'SIGTRAP' }]) assert.throws(() => validateCleanup({ ...cleanup(), ...change }));
});
test('fake-only successful run is detached, ordered and sanitized', async () => {
  const f = fake(); const journal = [];
  const result = await runProbe({ expectedHead: sha, adapter: f.adapter, journal: row => journal.push(row) });
  assert.equal(result.status, 'pass'); assert.deepEqual(f.calls, ['inventory', 'prepare', 'observe', 'cleanup']);
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'mode', 'status', 'sourceHead', 'inventory', 'proof', 'cleanup']);
  assert.deepEqual(result.inventory, { ...contract, digests: digests() });
  const supplied = inventory();
  const detached = await runProbe({ expectedHead: sha, adapter: fake({ inventory: async () => supplied }).adapter });
  supplied.digests.runnerSha256 = '4'.repeat(64);
  assert.deepEqual(detached.inventory.digests, digests());
  assert.deepEqual(journal.map(x => x.sequence), journal.map((_, i) => i + 1));
  assert.ok(journal.every(x => Object.keys(x).join(',') === 'sequence,phase,result'));
  assert.doesNotMatch(JSON.stringify(result), /1001|about:blank|\/tmp|targetId/);
});
test('every failure cleans up, never echoes payload and cleanup failure overrides', async () => {
  for (const stage of ['inventory', 'prepare', 'observe']) { const f = fake({ [stage]: async () => { throw Error('private URL or account'); } }); const r = await runProbe({ expectedHead: sha, adapter: f.adapter }); assert.equal(r.status, 'fail'); assert.equal(f.calls.at(-1), 'cleanup'); assert.doesNotMatch(JSON.stringify(r), /private|account|URL/); }
  const f = fake({ cleanup: async () => { throw Error('private'); } }); assert.equal((await runProbe({ expectedHead: sha, adapter: f.adapter })).code, 'probe_cleanup');
});
test('abort before launch and during observation cleans without positive result', async () => {
  const controller = new AbortController(); controller.abort(); const early = fake();
  assert.equal((await runProbe({ expectedHead: sha, adapter: early.adapter, signal: controller.signal })).code, 'probe_aborted');
  assert.deepEqual(early.calls, ['cleanup']);
  const late = new AbortController(); const f = fake({ observe: async () => { late.abort(); return observation(); } });
  assert.equal((await runProbe({ expectedHead: sha, adapter: f.adapter, signal: late.signal })).code, 'probe_aborted');
  assert.equal(f.calls.at(-1), 'cleanup');
});
test('privileges and launch flags preserve Chrome sandbox without inherited environment', () => {
  const flags = launchArgs('/tmp/synthetic');
  assert.equal(flags.at(-1), 'about:blank');
  assert.doesNotMatch(flags.join(' '), /--no-sandbox|--disable-setuid-sandbox|ignore-certificate|proxy|host-resolver/);
  const args = privilegeArgs(1001, 1001);
  for (const value of ['--clear-groups', '--no-new-privs', '--inh-caps=-all', '--ambient-caps=-all', '--bounding-set=-all']) assert.ok(args.includes(value));
  assert.throws(() => privilegeArgs(0, 1001));
});
test('workflow is narrowly triggered, read-only and software-download-free', () => {
  const source = fs.readFileSync(new URL('../../.github/workflows/mission-browser-preflight.yml', import.meta.url), 'utf8');
  for (const expected of ['ubuntu-24.04', 'contents: read', 'persist-credentials: false', 'timeout-minutes: 5', 'workflow_dispatch:', 'pull_request:', 'cancel-in-progress: true']) assert.ok(source.includes(expected));
  assert.doesNotMatch(source, /secrets\.|id-token:|packages:|deployments:|setup-node|apt-get|npm install|pnpm install|curl |wget |pull_request_target|schedule:/);
  assert.equal((source.match(/^      - '(?:\.github|test)\//gmu) ?? []).length, 4);
});
test('real execution is explicitly gated; tests and regression only exercise fakes', () => {
  const source = fs.readFileSync(new URL('../support/mission_web_entry_linux_probe.mjs', import.meta.url), 'utf8');
  assert.match(source, /NODE_TEST_CONTEXT/); assert.match(source, /GITHUB_ACTIONS/);
  assert.match(source, /60000/); assert.match(source, /SIGTERM/); assert.match(source, /SIGKILL/);
  assert.match(source, /Seccomp_filters/); assert.match(source, /NoNewPrivs/);
  assert.match(source, /s\.Groups === ''/);
  assert.match(source, /child\.stdin\.end\('verified\\n'\)/);
  assert.match(source, /await acknowledgement/);
  assert.match(source, /profileProcessRefs\(\)\.length === 0/);
  assert.match(source, /signalOwned\('-TERM'/);
  assert.match(source, /launcherAbsent/);
  assert.match(source, /resolverBaseCreated/);
  assert.match(source, /hash\(item\.file\) === item\.digest/);
  assert.match(source, /'route', 'show', 'table', 'all'/);
  assert.doesNotMatch(source, /--no-sandbox|--disable-setuid-sandbox|--ignore-certificate-errors/);
  const suite = fs.readFileSync(import.meta.filename, 'utf8'); assert.doesNotMatch(suite, /execFileSync\(|spawn\(/);
  const runner = fs.readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8'); assert.match(runner, /^node --test test\/tool\/\*\.test\.mjs$/mu);
});
