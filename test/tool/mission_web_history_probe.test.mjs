import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSdkState, validateHistoryMatrix, artifactDigest, buildArguments,
  validateArtifact, classifyAsset, contract } from '../support/mission_web_history_build.mjs';
import { runProbe, parseArgs, launchArgs, privilegeArgs, ownsBuildGroup } from '../support/mission_web_history_probe.mjs';

const instance = n => String(n).repeat(32);
const state = (n, entry, serialCount) => ({ serialCount, state: { version: 1, instance: instance(n), entry } });
const row = (path, value) => ({ path, sdkState: value, visible: path === 'mission' ? 'unavailable' : 'harness-root' });
const matrix = () => [row('mission', state(1, 1, 0)), row('root', state(2, 0, 0)),
  row('mission', state(2, 1, 1)), row('root', state(2, 0, 0)), row('mission', state(2, 1, 1)),
  row('mission', state(3, 1, 1)), row('mission', state(3, 1, 1)), row('root', state(3, 0, 2))];
const head = 'a'.repeat(40);
const artifact = () => {
  const files = ['flutter_bootstrap.js', 'index.html', 'main.dart.js'].map(path => ({ path, sha256: 'b'.repeat(64), bytes: 1 }));
  return { schemaVersion: 1, sourceHead: head, sourceDigest: 'c'.repeat(64),
    sourceHashes: { harness: 'd'.repeat(64), router: 'e'.repeat(64), controller: 'f'.repeat(64), host: '1'.repeat(64) },
    lockSha256: '2'.repeat(64), toolchain: { ...contract }, files, artifactDigest: artifactDigest(files) };
};
const fake = overrides => ({
  inventory: async () => ({ platform: 'linux', arch: 'x64', imageOS: 'ubuntu24', imageVersion: '20260927.320.1',
    node: '22.23.3', chrome: '154.0.8037.57', uid: 1001, gid: 1001, head, clean: true,
    digests: { runnerSha256: '3'.repeat(64), chromeSha256: '4'.repeat(64), nodeSha256: '5'.repeat(64) } }),
  build: async () => artifact(),
  prepare: async () => ({ links: ['lo'], routes4: [], routes6: [], resolverEmpty: true }),
  observe: async () => ({ browser: 'Chrome/154.0.8037.57', protocol: '1.3', httpStatus: 200,
    targetCounts: {pageBlank: 1, pageOther: 0, browserUi: 2, extension: 0, serviceWorker: 0, other: 0},
    evaluated: true, workerPrivileges: true, externalTcp: 'ENETUNREACH', loopback: 200,
    renderers: [{ uid: 1001, gid: 1001, seccomp: 2, filters: 1, noNewPrivs: 1,
      capabilities: '0000000000000000', nestedPidNamespace: true, forbiddenFlags: false }],
    historyMatrix: matrix(), blockedUnexpected: 0, artifactDigest: artifact().artifactDigest,
    sourceDigest: artifact().sourceDigest, sourceHead: head }),
  cleanup: async () => ({ processesAbsent: true, groupAbsent: true, namespaceRemoved: true, resolverRemoved: true,
    portClosed: true, profileRemoved: true, exitCode: 0, exitSignal: null }), ...overrides,
});

test('exact SDK envelope and nested application cursor are different contracts', () => {
  assert.doesNotThrow(() => validateSdkState(state(1, 1, 0)));
  for (const mutate of [v => delete v.serialCount, v => v.extra = true,
    v => delete v.state.entry, v => v.state.url = 'private', v => v.serialCount = -1,
    v => v.serialCount = 1.5, v => v.state.instance = 'private', v => v.state.version = 2]) {
    const v = state(1, 1, 0); mutate(v);
    assert.throws(() => validateSdkState(v), /^Error: history_state$/u);
  }
});
test('ordered matrix proves SDK serial changes, same-document replay and new reload instance', () => {
  assert.doesNotThrow(() => validateHistoryMatrix(matrix()));
  for (const index of [0,1,2,3,4,5,6,7]) {
    const rows = matrix(); rows[index].sdkState.serialCount += 2;
    assert.throws(() => validateHistoryMatrix(rows));
  }
  for (const mutate of [r => r.pop(), r => r[5].sdkState.state.instance = instance(2),
    r => r[7].path = 'mission', r => r[2].sdkState.state.entry = 2,
    r => r[4].sdkState.state.instance = instance(4), r => r[0].visible = 'activated',
    r => r[0].private = 'never emit']) {
    const rows = matrix(); mutate(rows); assert.throws(() => validateHistoryMatrix(rows));
  }
});
test('artifact bytes, source lock and toolchain contract are bound and fail closed', () => {
  assert.equal(contract.flutter, '3.41.7');
  assert.equal(contract.dart, '3.11.5');
  assert.ok(buildArguments.every(x => !x.includes('=true')));
  assert.ok(buildArguments.includes('--no-web-resources-cdn'));
  assert.ok(buildArguments.includes('--pwa-strategy=none'));
  const files = [{ path: 'index.html', sha256: 'a'.repeat(64), bytes: 1 }];
  assert.equal(artifactDigest(files), artifactDigest(structuredClone(files)));
  assert.notEqual(artifactDigest(files), artifactDigest([{...files[0], bytes: 2}]));
  assert.throws(() => validateArtifact({}), /^Error: history_artifact$/u);
  for (const mutate of [v => v.private = 'rejected', v => delete v.lockSha256,
    v => v.sourceHashes.extra = 'a'.repeat(64), v => v.toolchain.flutter = 'other',
    v => v.files[0].path = '../outside', v => v.files[0].extra = 'rejected']) {
    const v = artifact(); mutate(v); assert.throws(() => validateArtifact(v), /^Error: history_artifact$/u);
  }
});
test('request classifier admits only exact locally bound asset requests', () => {
  const files = new Set(['index.html', 'main.dart.js']);
  assert.equal(classifyAsset('https://shareittoo.com/mission', 'Document', files), 'index.html');
  assert.equal(classifyAsset('https://shareittoo.com/main.dart.js', 'Script', files), 'main.dart.js');
  for (const [url, type] of [['https://foreign.invalid/', 'Document'],
    ['https://shareittoo.com/api/v1', 'Fetch'], ['https://shareittoo.com/missing.js', 'Script'],
    ['https://shareittoo.com/main.dart.js?secret', 'Script'], ['ws://shareittoo.com/', 'WebSocket'],
    ['https://shareittoo.com/%6dission', 'Document']]) assert.equal(classifyAsset(url, type, files), null);
});
test('harness uses production classes, not test route hooks or a replacement router', () => {
  const source = fs.readFileSync('test/support/mission_web_history_harness.dart', 'utf8');
  for (const name of ['AppLinkController', 'AppLinkHost', 'WebAppRouterHost', 'FirebaseRuntime.openForegroundMessage']) assert.ok(source.includes(name));
  assert.doesNotMatch(source, /restoreForTesting|testEnabled|testWeb:|RouterDelegate|pushState|replaceState|AppRoot\(/u);
});

test('sanitized proof binds artifact/source/toolchain but never emits raw history or target data', async () => {
  const journal = [];
  const result = await runProbe({ expectedHead: head, adapter: fake(), journal: row => journal.push(row) });
  assert.equal(result.status, 'pass');
  assert.equal(result.evidenceClass, 'exact-production-code-harness'); assert.equal(result.fullAppRoot, false);
  assert.equal(result.artifact.artifactDigest, artifact().artifactDigest);
  assert.deepEqual(Object.keys(result.artifact).sort(), ['sourceDigest', 'sourceHashes', 'lockSha256', 'toolchain', 'artifactDigest', 'fileCount'].sort());
  assert.doesNotMatch(JSON.stringify(result), /https:|127\.0\.0|sdkState|serialCount|"instance"|"entry"|\/tmp\/|"pid"|"port"/u);
  assert.deepEqual(journal.map(v => v.sequence), journal.map((_,i) => i + 1));
  assert.deepEqual(journal.filter(v => v.result === 'begin').map(v => v.phase), ['inventory', 'build', 'prepare', 'observe', 'cleanup']);
});
test('build/network/matrix failures are stable and always clean up; abnormal exit preserves primary error', async () => {
  for (const stage of ['inventory', 'build', 'prepare', 'observe']) {
    let cleaned = false;
    const adapter = fake({ [stage]: async () => { throw Error('private arbitrary failure'); } });
    const original = adapter.cleanup; adapter.cleanup = async () => { cleaned = true; return { ...await original(), exitCode: 1 }; };
    const result = await runProbe({ expectedHead: head, adapter });
    assert.equal(result.status, 'fail'); assert.equal(result.code, 'probe_failure'); assert.equal(cleaned, true);
    assert.deepEqual(Object.keys(result), ['schemaVersion', 'mode', 'status', 'code']);
  }
  for (const [stage, change] of [
    ['inventory', v => v.clean = false], ['inventory', v => v.chrome = 'wrong'],
    ['build', v => v.sourceHead = 'b'.repeat(40)], ['build', v => v.files[0].sha256 = '0'.repeat(64)],
    ['prepare', v => v.links.push('eth0')], ['prepare', v => v.routes4.push({})],
    ['observe', v => v.blockedUnexpected = 1], ['observe', v => v.historyMatrix[2].sdkState.serialCount = 2],
    ['observe', v => v.artifactDigest = '0'.repeat(64)], ['observe', v => v.sourceHead = '0'.repeat(40)],
    ['observe', v => v.renderers[0].seccomp = 0], ['cleanup', v => v.profileRemoved = false],
  ]) {
    const adapter = fake(); const original = adapter[stage]; adapter[stage] = async () => { const v = await original(); change(v); return v; };
    assert.equal((await runProbe({ expectedHead: head, adapter })).status, 'fail');
  }
});
test('successor consumers are exact test support only and fake tests register automatically', () => {
  const allowed = new Set(['test/support/mission_web_history_harness.dart',
    'test/support/mission_web_history_build.mjs', 'test/support/mission_web_history_probe.mjs',
    'test/tool/mission_web_history_probe.test.mjs', 'test/tool/web_app_router_boundary.test.mjs',
    '.github/workflows/mission-web-history-proof.yml']);
  for (const directory of ['lib', 'backend/src', 'test', 'web', 'tool', '.github/workflows']) {
    for (const name of fs.readdirSync(directory, { recursive: true })) {
      const file = `${directory}/${name}`;
      if (!/\.(dart|mjs|js|html|ya?ml)$/u.test(name) || allowed.has(file)) continue;
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /mission_web_history_(?:harness|build|probe)/u, file);
    }
  }
  assert.match(fs.readFileSync('scripts/technical_regression_check.sh', 'utf8'), /test\/tool\/\*\.test\.mjs/u);
});
test('strict mode, Linux isolation, deadlines and external cleanup remain source-locked', () => {
  assert.equal(parseArgs(['--linux-history-harness', '--source-head', head]), head);
  for (const args of [[], ['https://shareittoo.com'], ['--linux-history-harness', '--source-head', head, '--url', 'arbitrary']]) assert.throws(() => parseArgs(args));
  assert.doesNotMatch(launchArgs('/tmp/owned').join(' '), /--no-sandbox|--disable-setuid-sandbox|--ignore-certificate-errors|--proxy|--host-resolver/u);
  assert.ok(privilegeArgs(1001,1001).includes('--no-new-privs'));
  const source = fs.readFileSync('test/support/mission_web_history_probe.mjs', 'utf8');
  assert.match(source, /setTimeout\(\(\) => finish\(Error\('probe_timeout'\)\), 60000\)/u);
  assert.match(source, /ip\(\['netns', 'delete', namespace\]\)/u);
  assert.match(source, /'\/usr\/bin\/env', '-i'/u);
  assert.match(source, /ss', '-ltnH'\]/u);
  assert.match(source, /assetServer\.listen\(0, '127\.0\.0\.1'/u);
  assert.match(source, /validateObservation\(row\.value, inventory, artifact\)/u);
  const build = fs.readFileSync('test/support/mission_web_history_build.mjs', 'utf8');
  assert.match(build, /'pub', 'get', '--enforce-lockfile'/u);
  assert.match(build, /source\.path\)\)\) === source\.sha256/u);
});
test('build cleanup refuses PID/PGID reuse and requires a surviving observed start identity', () => {
  const identity = { id: 101, start: '1000', known: [{ pid: 101, start: '1000' }, { pid: 102, start: '1001' }] };
  const leader = { pid: 101, start: '1000', group: 101 };
  const descendant = { pid: 102, start: '1001', group: 101 };
  assert.equal(ownsBuildGroup(identity, [leader, descendant]), true);
  assert.equal(ownsBuildGroup(identity, [descendant, { pid: 103, start: '1002', group: 101 }]), true);
  for (const members of [[], [{ ...leader, start: '2000' }], [{ ...descendant, start: '2001' }],
    [{ pid: 999, start: '2002', group: 101 }], [{ ...descendant, group: 999 }],
    [{ ...leader, start: '2000' }, descendant]]) assert.equal(ownsBuildGroup(identity, members), false);
  const source = fs.readFileSync('test/support/mission_web_history_probe.mjs', 'utf8');
  assert.match(source, /const leader = procStat\(id\); check\(leader\.group === id/u);
  assert.match(source, /signalOwned\('-KILL', -identity\.id, \(\) => ownsBuildRoot\(\) && ownsBuildGroup\(identity, observe\(\)\)\)/u);
  assert.match(source, /if \(!stillPresent\(\)\) return;/u);
  const build = fs.readFileSync('test/support/mission_web_history_build.mjs', 'utf8');
  assert.doesNotMatch(build, /process\.kill\(-child\.pid/u);
  assert.match(build, /stopOwned = ownGroup\(child\.pid\)/u);
});
test('manual-only workflow provisions before isolated runner without secrets, publishing or downloads inside worker', () => {
  const workflow = fs.readFileSync('.github/workflows/mission-web-history-proof.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/u); assert.doesNotMatch(workflow, /^  (?:pull_request|push):/mu);
  assert.match(workflow, /persist-credentials: false/u); assert.match(workflow, /contents: read/u);
  assert.match(workflow, /flutter-version: 3\.41\.7/u); assert.match(workflow, /timeout-minutes: 10/u);
  assert.doesNotMatch(workflow, /secrets\.|id-token|packages:|upload-artifact|deploy/u);
  const source = fs.readFileSync('test/support/mission_web_history_probe.mjs', 'utf8');
  const worker = source.slice(source.indexOf('async function worker(directory)'));
  assert.doesNotMatch(worker, /pub get|npm |curl |wget |flutter build/u);
});
