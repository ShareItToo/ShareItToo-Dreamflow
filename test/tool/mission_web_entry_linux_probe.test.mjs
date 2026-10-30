import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inventoryContracts, parseArgs, validateInventory, validateNetwork, validateObservation,
  validateCleanup, runProbe, launchArgs, privilegeArgs, summarizeTargets, validateTargetDiagnostic,
  inventoryPhases, runInventoryPhases, classifyCommandFailure, validateTargetInventory, selectBlankTarget } from '../support/mission_web_entry_linux_probe.mjs';

const sha = 'a'.repeat(40);
const expectedInventories = [
  { inventoryCommit: '1275e33f5019b02660b81ecc5622fe196211fa89', imageOS: 'ubuntu24',
    imageVersion: '20260927.320.1', arch: 'x64', node: '22.23.3', chrome: '154.0.8037.57' },
  { inventoryCommit: 'e3fe113a581eb9a44ca43f479b69f9c93f36df34', imageOS: 'ubuntu24',
    imageVersion: '20261004.327.1', arch: 'x64', node: '22.23.3', chrome: '154.0.8037.97' },
  { inventoryCommit: 'bf62c713fd9c48247e2a4d3ce99a9f0554cd745e', imageOS: 'ubuntu24',
    imageVersion: '20261023.334.3', arch: 'x64', node: '22.23.3', chrome: '155.0.8059.39' },
  { inventoryCommit: '799bcd0daf03c14c460e2662bcc9ca94a4a8aaa8', imageOS: 'ubuntu24',
    imageVersion: '20261026.354.1', arch: 'x64', node: '22.23.4', chrome: '156.0.8078.47' },
];
const digests = () => ({ runnerSha256: '1'.repeat(64), chromeSha256: '2'.repeat(64), nodeSha256: '3'.repeat(64) });
const inventory = () => ({ platform: 'linux', arch: 'x64', imageOS: 'ubuntu24',
  imageVersion: '20260927.320.1', node: '22.23.3', chrome: '154.0.8037.57',
  uid: 1001, gid: 1001, head: sha, clean: true, digests: digests() });
const network = () => ({ links: ['lo'], routes4: [], routes6: [], resolverEmpty: true });
const targetCounts = () => ({ pageBlank: 1, pageOther: 0, browserUi: 2, extension: 0, serviceWorker: 0, other: 0 });
const observation = () => ({ browser: 'Chrome/154.0.8037.57', protocol: '1.3', httpStatus: 200,
  targetCounts: targetCounts(), evaluated: true,
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
test('inventory diagnosis identifies every failed condition before adapter return or launch', async () => {
  const base = fake().adapter; const valid = await base.inventory();
  const changes = [
    ...Object.entries({ platform: 'darwin', arch: 'arm64', imageOS: 'ubuntu22',
      imageVersion: '20261019.341.1', node: '22.23.5', chrome: '155.0.8059.40',
      head: 'f'.repeat(40), clean: false, uid: 0, gid: 0 }).map(([key, value]) => [key, { ...valid, [key]: value }]),
    ...['uid', 'gid'].flatMap(key => [undefined, null, false, '1001', -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(value => [key, { ...valid, [key]: value }])),
    ...Object.keys(valid.digests).map(key => {
      const digests = { ...valid.digests }; delete digests[key]; return ['digestKeys', { ...valid, digests }];
    }),
    ...[undefined, null, [], {}, { ...valid.digests, extra: 'private' },
      { ...valid.digests, [Symbol('private')]: true }].map(digests => ['digestKeys', { ...valid, digests }]),
    ...Object.keys(valid.digests).flatMap(key =>
      [undefined, 'A'.repeat(64), 'g'.repeat(64), '1'.repeat(63), '1'.repeat(65), 1, '/private/digest']
        .map(value => [key, { ...valid, digests: { ...valid.digests, [key]: value } }])),
  ];
  for (const [failed, supplied] of changes) for (const validateBeforeReturn of [false, true]) {
    const calls = []; const journal = [];
    const result = await runProbe({ expectedHead: sha, journal: row => journal.push(row), adapter: {
      ...base, inventory: async () => {
        if (validateBeforeReturn) validateInventory(supplied, sha);
        return supplied;
      }, build: async () => calls.push('build'), prepare: async () => calls.push('prepare'),
      cleanup: async () => { calls.push('cleanup'); return base.cleanup(); },
    } });
    assert.equal(result.status, 'fail'); assert.equal(result.code, ['uid', 'gid'].includes(failed) ? 'probe_sandbox' : 'probe_inventory');
    assert.equal(result.diagnostic.checks[failed], false, failed);
    assert.deepEqual(calls, ['cleanup']); assert.equal(result.inventory, undefined); assert.equal(result.proof, undefined);
    assert.deepEqual(Object.keys(result.diagnostic), ['observed', 'checks']);
    assert.deepEqual(Object.keys(result.diagnostic.observed), ['platform', 'arch', 'imageOS', 'imageVersion', 'node', 'chrome']);
    assert.deepEqual(Object.keys(result.diagnostic.checks), ['platform', 'arch', 'imageOS', 'imageVersion', 'node', 'chrome',
      'tuple', 'head', 'clean', 'uid', 'gid', 'digestKeys', 'runnerSha256', 'chromeSha256', 'nodeSha256']);
    assert.ok(Object.values(result.diagnostic.checks).every(value => typeof value === 'boolean'));
    assert.ok(JSON.stringify(result.diagnostic).length < 700);
    assert.doesNotMatch(JSON.stringify({ result, journal }), /private|1001|[a-f0-9]{40}/);
  }
  const mixed = { ...valid, ...inventoryContracts[0], chrome: inventoryContracts[1].chrome };
  const result = await runProbe({ expectedHead: sha, adapter: { ...base, inventory: async () => mixed } });
  assert.equal(result.diagnostic.checks.tuple, false);
  assert.ok(['arch', 'imageOS', 'imageVersion', 'node', 'chrome'].every(key => result.diagnostic.checks[key]));
  assert.deepEqual(result.diagnostic.observed, Object.fromEntries(
    ['platform', 'arch', 'imageOS', 'imageVersion', 'node', 'chrome'].map(key => [key, mixed[key]])));
});

test('inventory diagnosis never serializes private values, coercion hooks or unknown fields', async () => {
  const base = fake().adapter; const valid = await base.inventory();
  const privateValue = '/private/synthetic-user/credential?token=synthetic-secret';
  const fields = ['platform', 'arch', 'imageOS', 'imageVersion', 'node', 'chrome', 'head', 'uid', 'gid', 'clean', 'digests'];
  const coercion = { toString() { throw Error(privateValue); }, toJSON() { throw Error(privateValue); } };
  for (const key of fields) for (const value of [privateValue, undefined, null, [], coercion, Symbol(privateValue),
    privateValue.repeat(1000), String(valid[key]) + '\n']) {
    const supplied = { ...valid, clean: false, [key]: value, path: privateValue, bytes: [{ file: privateValue, digest: 'e'.repeat(64) }],
      env: { privateValue }, username: privateValue, stdout: privateValue, stderr: privateValue, toJSON: coercion.toJSON };
    const result = await runProbe({ expectedHead: sha, adapter: { ...base, inventory: async () => {
      validateInventory(supplied, sha); return supplied;
    } } });
    assert.equal(result.status, 'fail'); assert.equal(result.code, 'probe_inventory');
    if (Object.hasOwn(result.diagnostic.observed, key)) assert.equal(result.diagnostic.observed[key], null);
    assert.doesNotMatch(JSON.stringify(result), /private|synthetic-user|synthetic-secret|credential|token|username|stdout|stderr|bytes|[a-f0-9]{40}/);
  }
  for (const supplied of [undefined, null, [], coercion]) {
    const result = await runProbe({ expectedHead: sha, adapter: { ...base, inventory: async () => supplied } });
    assert.equal(result.code, 'probe_inventory'); assert.ok(result.diagnostic);
    assert.doesNotMatch(JSON.stringify(result), /private|synthetic-user|synthetic-secret/);
  }
  // A throwing accessor or Proxy cannot leak its exception or trigger a raw diagnostic fallback.
  for (const supplied of [Object.defineProperty({ ...valid }, 'arch', { get() { throw Error(privateValue); } }),
    new Proxy({}, { get() { throw Error(privateValue); } })]) {
    const result = await runProbe({ expectedHead: sha, adapter: { ...base, inventory: async () => supplied } });
    assert.equal(result.code, 'probe_failure'); assert.equal(result.diagnostic, undefined);
  }
});

test('inventory diagnosis is trusted, stage-specific and subordinate to cleanup failure', async () => {
  const base = fake().adapter; const supplied = { ...await base.inventory(), clean: false };
  for (const stage of ['inventory', 'prepare']) {
    const result = await runProbe({ expectedHead: sha, adapter: { ...base, [stage]: async () => {
      throw Object.assign(Error('probe_inventory'), { diagnostic: { secret: '/private/value' } });
    } } });
    assert.equal(result.code, 'probe_inventory'); assert.equal(result.diagnostic, undefined);
  }
  const result = await runProbe({ expectedHead: sha, adapter: { ...base,
    inventory: async () => { validateInventory(supplied, sha); return supplied; },
    cleanup: async () => ({ ...await base.cleanup(), portClosed: false }),
  } });
  assert.equal(result.code, 'probe_cleanup'); assert.equal(result.diagnostic.portClosed, false);
  assert.equal(result.diagnostic.observed, undefined); assert.equal(result.diagnostic.checks, undefined);
  const success = await runProbe({ expectedHead: sha, adapter: base });
  assert.equal(success.status, 'pass'); assert.equal(success.diagnostic, undefined);
  assert.deepEqual(success.inventory.digests, supplied.digests);
});

test('inventory subphases are ordered, bracket every step and stop at the failed phase', () => {
  assert.deepEqual(inventoryPhases, ['environment', 'chrome-version', 'git-identity', 'git-status', 'binary-check', 'byte-hash']);
  const journal = []; const called = [];
  runInventoryPhases((phase, result) => journal.push([phase, result]),
    Object.fromEntries(inventoryPhases.map(name => [name, () => called.push(name)])));
  assert.deepEqual(called, inventoryPhases);
  assert.deepEqual(journal, inventoryPhases.flatMap(name => [[name, 'begin'], [name, 'confirmed']]));
  for (const failed of inventoryPhases) {
    const rows = [];
    assert.throws(() => runInventoryPhases((phase, result) => rows.push([phase, result]),
      Object.fromEntries(inventoryPhases.map(name => [name, () => { if (name === failed) throw Error('private-command-path-output'); }]))), /^(Error: )?probe_failure$/);
    assert.deepEqual(rows.at(-1), [failed, 'failed']);
    assert.equal(rows.length, (inventoryPhases.indexOf(failed) + 1) * 2);
    assert.doesNotMatch(JSON.stringify(rows), /private-command-path-output/);
  }
});
test('exec timeout or kill maps to stable timeout without command or output leakage', async () => {
  for (const properties of [{ code: 'ETIMEDOUT' }, { killed: true }, { signal: 'SIGTERM' }, { signal: 'SIGKILL' }]) {
    const error = Object.assign(Error('private-command-path-output'), properties, { stdout: 'secret', stderr: 'secret' });
    assert.equal(classifyCommandFailure(error), 'probe_timeout');
    const f = fake({ inventory: async () => runInventoryPhases(() => {}, Object.fromEntries(inventoryPhases.map(name =>
      [name, () => { if (name === 'chrome-version') throw error; }]))) });
    const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
    assert.equal(result.code, 'probe_timeout'); assert.doesNotMatch(JSON.stringify(result), /private|secret|SIGTERM|SIGKILL/);
  }
  for (const error of [{ code: 'EACCES' }, { code: 'ENOENT' }, { signal: 'SIGABRT' }, undefined])
    assert.equal(classifyCommandFailure(error), 'probe_failure');
});
test('closed CLI, source and exact official image versions reject drift', () => {
  assert.equal(parseArgs(['--linux-blank-preflight', '--source-head', sha]), sha);
  for (const args of [[], ['--linux-blank-preflight'], ['--worker'], ['--linux-blank-preflight', '--source-head', sha, 'https://foreign.invalid']]) assert.throws(() => parseArgs(args));
  validateInventory(inventory(), sha);
  for (const [key, value] of Object.entries({ platform: 'darwin', arch: 'arm64', imageOS: 'ubuntu22', imageVersion: 'next', node: '22.0.0', chrome: '154.0.8037.93', uid: 0, gid: 0, head: 'b'.repeat(40), clean: false })) assert.throws(() => validateInventory({ ...inventory(), [key]: value }, sha));
  assert.deepEqual(inventoryContracts, expectedInventories);
  assert.ok(Object.isFrozen(inventoryContracts) && inventoryContracts.every(Object.isFrozen));
});
test('each complete official tuple binds browser observation and sanitized proof', async () => {
  for (const expected of expectedInventories) {
    const supplied = { ...inventory(), ...expected };
    assert.deepEqual(validateInventory(supplied, sha), expected);
    const f = fake({ inventory: async () => supplied,
      observe: async () => ({ ...observation(), browser: `Chrome/${expected.chrome}` }) });
    const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.inventory, { ...expected, digests: digests() });
    assert.deepEqual(result.cleanup, cleanup());
    assert.equal(f.calls.at(-1), 'cleanup');
  }
});
test('mixed official tuples and nearby runtime drift fail closed and clean up before launch', async () => {
  for (const expected of expectedInventories) {
    const mixed = expectedInventories.filter(other => other !== expected)
      .flatMap(other => [{ chrome: other.chrome }, { imageVersion: other.imageVersion }]);
    for (const change of [...mixed,
      { imageVersion: expected.imageVersion + '0' }, { node: '22.23.5' }, { chrome: expected.chrome + '0' },
      { imageOS: 'ubuntu22' }, { arch: 'arm64' }]) {
      const supplied = { ...inventory(), ...expected, ...change };
      assert.throws(() => validateInventory(supplied, sha), /probe_inventory/);
      const f = fake({ inventory: async () => supplied });
      const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
      assert.equal(result.status, 'fail'); assert.equal(result.code, 'probe_inventory');
      assert.deepEqual(f.calls, ['cleanup']);
      assert.equal(result.inventory, undefined); assert.equal(result.proof, undefined);
    }
  }
});
test('browser from any other accepted tuple or a nearby version cannot satisfy the selected inventory', async () => {
  for (const expected of expectedInventories) {
    const otherVersions = expectedInventories.filter(other => other !== expected).map(other => other.chrome);
    for (const chrome of [...otherVersions, expected.chrome + '0']) {
      const f = fake({ inventory: async () => ({ ...inventory(), ...expected }),
        observe: async () => ({ ...observation(), browser: `Chrome/${chrome}` }) });
      const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
      assert.equal(result.status, 'fail'); assert.equal(result.code, 'probe_version');
      assert.deepEqual(f.calls, ['prepare', 'cleanup']);
      assert.equal(result.inventory, undefined); assert.equal(result.proof, undefined);
    }
  }
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
  for (const change of [{ targetCounts: undefined }, { targetCounts: { ...targetCounts(), pageBlank: 2 } }, { targetCounts: { ...targetCounts(), serviceWorker: 1 } }, { evaluated: false }, { renderers: [] }, { externalTcp: 'EPERM' }, { externalTcp: 'connected' }, { loopback: 500 }, { httpStatus: 302 }, { browser: 'other' }, { protocol: '2' }, { workerPrivileges: false }]) assert.throws(() => validateObservation({ ...observation(), ...change }, inventory()));
  for (const [key, value] of Object.entries({ uid: 0, gid: 0, seccomp: 0, filters: 0, noNewPrivs: 0, capabilities: '1', nestedPidNamespace: false, forbiddenFlags: true })) assert.throws(() => validateObservation({ ...observation(), renderers: [{ ...observation().renderers[0], [key]: value }] }, inventory()));
});
test('only the observed exact target vector is accepted; every single-field drift fails', () => {
  validateTargetInventory(targetCounts());
  for (const key of Object.keys(targetCounts())) {
    for (const value of [0, 1, 2, 3, 256]) {
      if (value === targetCounts()[key]) continue;
      assert.throws(() => validateTargetInventory({ ...targetCounts(), [key]: value }), /probe_targets|probe_failure/);
      assert.throws(() => validateObservation({ ...observation(), targetCounts: { ...targetCounts(), [key]: value } }, inventory()));
    }
    const missing = targetCounts(); delete missing[key]; assert.throws(() => validateTargetInventory(missing));
  }
});
test('unique blank page is selected explicitly independently of target array order', () => {
  const blank = { type: 'page', url: 'about:blank', targetId: 'synthetic-blank' };
  const ui = { type: 'browser_ui', url: 'chrome://synthetic', targetId: 'synthetic-ui' };
  for (const targets of [[blank, ui, ui], [ui, blank, ui], [ui, ui, blank]]) assert.equal(selectBlankTarget(targets), blank);
  for (const extra of [blank, ui, { type: 'page', url: 'https://private.invalid' },
    { type: 'service_worker', url: 'chrome-extension://private/' }, { type: 'service_worker', url: 'https://private.invalid' },
    { type: 'other', url: 'private' }]) assert.throws(() => selectBlankTarget([blank, ui, ui, extra]));
  for (const targets of [[], [blank], [blank, ui], [ui, ui], [{ ...blank, targetId: undefined }, ui, ui]])
    assert.throws(() => selectBlankTarget(targets));
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
  assert.deepEqual(result.inventory, { ...expectedInventories[0], digests: digests() });
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
test('primary target failure survives complete resource cleanup and real-shaped exit 1', async () => {
  const diagnostic = { pageBlank: 1, pageOther: 0, browserUi: 1, extension: 0, serviceWorker: 0, other: 0 };
  for (const code of ['probe_targets', 'probe_timeout', 'probe_sandbox']) {
    const f = fake({ observe: async () => { throw Error(code); }, targetDiagnostic: () => diagnostic,
      cleanup: async () => ({ ...cleanup(), exitCode: 1 }) });
    const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
    assert.equal(result.code, code);
    assert.deepEqual(Object.keys(result), code === 'probe_targets'
      ? ['schemaVersion', 'mode', 'status', 'code', 'diagnostic'] : ['schemaVersion', 'mode', 'status', 'code']);
    if (code === 'probe_targets') { assert.deepEqual(result.diagnostic, diagnostic); assert.notEqual(result.diagnostic, diagnostic); }
  }
  const abnormal = fake({ cleanup: async () => ({ ...cleanup(), exitCode: 1 }) });
  const result = await runProbe({ expectedHead: sha, adapter: abnormal.adapter });
  assert.equal(result.status, 'fail'); assert.equal(result.code, 'probe_cleanup'); assert.equal(result.diagnostic, undefined);
  const signalled = fake({ observe: async () => { throw Error('probe_timeout'); },
    cleanup: async () => ({ ...cleanup(), exitCode: null, exitSignal: 'SIGTERM' }) });
  assert.equal((await runProbe({ expectedHead: sha, adapter: signalled.adapter })).code, 'probe_timeout');
  for (const key of ['processesAbsent', 'groupAbsent', 'namespaceRemoved', 'resolverRemoved', 'portClosed', 'profileRemoved']) {
    const missing = cleanup(); delete missing[key];
    const f = fake({ observe: async () => { throw Error('probe_timeout'); }, cleanup: async () => missing });
    const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
    assert.equal(result.code, 'probe_cleanup'); assert.equal(result.diagnostic[key], false);
  }
});
test('target diagnostics are only six bounded counts, never URLs or identifiers', () => {
  const summary = summarizeTargets([{ type: 'page', url: 'about:blank' }, { type: 'page', url: 'https://private.invalid' },
    { type: 'browser_ui', url: 'chrome://private' }, { type: 'service_worker', url: 'chrome-extension://private/' },
    { type: 'service_worker', url: 'https://private.invalid' }, { type: 'unknown', url: 'private' }]);
  assert.deepEqual(summary, { pageBlank: 1, pageOther: 1, browserUi: 1, extension: 1, serviceWorker: 1, other: 1 });
  assert.doesNotMatch(JSON.stringify(summary), /private|url|targetId|pid|path/);
  for (const value of [undefined, [], { ...summary, url: 'private' }, { ...summary, pageBlank: -1 },
    { ...summary, pageBlank: 257 }, { ...summary, pageBlank: 256 }, { ...summary, pageBlank: 0.5 },
    { ...summary, pageBlank: '1' }, { ...summary, [Symbol('private')]: 0 }])
    assert.throws(() => validateTargetDiagnostic(value));
  for (const key of Object.keys(summary)) { const value = { ...summary }; delete value[key]; assert.throws(() => validateTargetDiagnostic(value)); }
});
test('resource failure overrides primary only with fixed cleanup booleans and exit class', async () => {
  const f = fake({ observe: async () => { throw Error('probe_targets'); },
    cleanup: async () => ({ ...cleanup(), portClosed: false, exitCode: 1, private: 'secret' }) });
  const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
  assert.equal(result.code, 'probe_cleanup');
  assert.deepEqual(result.diagnostic, { processesAbsent: true, groupAbsent: true, namespaceRemoved: true,
    resolverRemoved: true, portClosed: false, profileRemoved: true, exitClass: 'nonzero' });
  assert.doesNotMatch(JSON.stringify(result), /secret|private|exitCode|exitSignal/);
});
test('malformed target summary fails closed without exposing its contents', async () => {
  const f = fake({ observe: async () => { throw Error('probe_targets'); }, targetDiagnostic: () => ({ url: 'secret' }) });
  const result = await runProbe({ expectedHead: sha, adapter: f.adapter });
  assert.equal(result.code, 'probe_failure'); assert.equal(result.diagnostic, undefined);
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
  assert.ok(source.includes('`SIT_D6_INVENTORY_COMMIT=${validateInventory(inventory, expectedHead).inventoryCommit}`'));
  assert.match(source, /inventoryContracts\.find\(candidate => candidate\.inventoryCommit === process\.env\.SIT_D6_INVENTORY_COMMIT\)/);
  assert.match(source, /check\(matchedInventory && process\.arch === matchedInventory\.arch && process\.versions\.node === matchedInventory\.node, 'probe_inventory'\)/);
  assert.ok(source.includes('data.Browser === `Chrome/${matchedInventory.chrome}`'));
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
  assert.match(source, /send\(\{ event: 'targets', value: summarizeTargets\(targets\) \}\);\s+const blankTarget = selectBlankTarget\(targets\);/);
  assert.match(source, /targetId: blankTarget\.targetId/);
  assert.doesNotMatch(source, /targets\[0\]|targets: targets\.map/);
  assert.match(source, /targetSummary = validateTargetDiagnostic\(row\.value\)/);
  assert.match(source, /encoding: 'utf8', timeout: 3000/);
  assert.match(source, /command\(chrome, \['--version'\], \{ timeout: 10000 \}\)/);
  assert.match(source, /command\('\/usr\/bin\/git', \['status', '--porcelain', '--untracked-files=all'\], \{ timeout: 15000 \}\)/);
  assert.match(source, /command\('\/usr\/bin\/git', \['rev-parse', 'HEAD'\]\)/);
  assert.match(source, /command\('\/usr\/bin\/git', \['ls-files', '--error-unmatch', self\]\)/);
  assert.equal((source.match(/\{ timeout: (?:10000|15000) \}/gu) ?? []).length, 2);
  assert.match(source, /'route', 'show', 'table', 'all'/);
  assert.doesNotMatch(source, /--no-sandbox|--disable-setuid-sandbox|--ignore-certificate-errors/);
  const suite = fs.readFileSync(import.meta.filename, 'utf8'); assert.doesNotMatch(suite, /execFileSync\(|spawn\(/);
  const runner = fs.readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8'); assert.match(runner, /^node --test test\/tool\/\*\.test\.mjs$/mu);
});
