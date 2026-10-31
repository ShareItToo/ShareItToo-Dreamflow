import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectGreenScope } from '../ops/green_staging_106_106_scope_collector.mjs';
import { parseArguments, runCli } from '../../tool/collect_green_staging_106_106_scope.mjs';

const hex = value => value.toString(16).padStart(64, '0');
const commit = '7'.repeat(40);
const input = directory => ({ runtimeCommit: commit, apiContainerName: 'sit-api', databaseContainerName: 'sit-db',
  internalNetworkName: 'green-internal', externalNetworkName: 'provider-egress', uploadsVolumeName: 'green-uploads',
  databaseUser: 'shareittoo_green', databaseName: 'shareittoo_green', evidenceDirectory: directory, outputName: 'scope.json' });

function fixture(directory) {
  const ids = { api: hex(1), db: hex(2), witness: hex(3) };
  const imageIds = { api: `sha256:${hex(11)}`, db: `sha256:${hex(12)}`, witness: `sha256:${hex(13)}` };
  const networkIds = { internal: hex(21), external: hex(22) };
  const image = (id, revision = '6'.repeat(40)) => ({ Id: id, RepoDigests: [`registry.example/sit@${id}`],
    Config: { Labels: { 'org.opencontainers.image.revision': revision } } });
  const api = { Id: ids.api, Name: '/sit-api', Image: imageIds.api, State: { Running: true, Paused: false },
    Config: { Labels: { 'com.shareittoo.sit.green': 'true' }, Env: ['SECRET_CANARY=do-not-write'] },
    NetworkSettings: { Networks: {
      'green-internal': { NetworkID: networkIds.internal }, 'provider-egress': { NetworkID: networkIds.external },
    } },
    Mounts: [{ Type: 'volume', Name: 'green-uploads', Destination: '/data/uploads', RW: true },
      { Type: 'bind', Source: '/private/secret-source', Destination: '/run/secrets', RW: false }] };
  const db = { Id: ids.db, Name: '/sit-db', Image: imageIds.db, State: { Running: true, Paused: false },
    Config: { Labels: { 'com.shareittoo.sit.green': 'true' }, Env: [
      'POSTGRES_USER=shareittoo_green', 'POSTGRES_DB=shareittoo_green', 'POSTGRES_PASSWORD=secret-canary',
    ] }, Mounts: [] };
  const witness = { Id: ids.witness, Name: '/sealed-witness', Image: imageIds.witness,
    State: { Running: false, Paused: false }, Config: { Labels: { 'com.shareittoo.sit.green': 'true' }, Env: [] }, Mounts: [] };
  const containers = new Map([[ids.api, api], [ids.db, db], [ids.witness, witness]]);
  const images = new Map([[imageIds.api, image(imageIds.api, commit)], [imageIds.db, image(imageIds.db)],
    [imageIds.witness, image(imageIds.witness)]]);
  const networks = new Map([
    [networkIds.internal, { Id: networkIds.internal, Name: 'green-internal', Internal: true, Containers: {
      [ids.api]: { Name: 'sit-api' }, [ids.db]: { Name: 'sit-db' },
    } }],
    [networkIds.external, { Id: networkIds.external, Name: 'provider-egress', Internal: false, Containers: {
      [ids.api]: { Name: 'sit-api' },
    } }],
  ]);
  const volume = { Name: 'green-uploads', Driver: 'local', Mountpoint: '/hidden/path' };
  const calls = [];
  const command = (binary, args) => {
    assert.equal(binary, 'docker');
    calls.push(args.slice());
    if (args[0] === 'ps') return Object.values(ids).join('\n');
    if (args[0] === 'inspect') return JSON.stringify([containers.get(args[1])]);
    if (args[0] === 'image') return JSON.stringify([images.get(args[2])]);
    if (args[0] === 'network' && args[1] === 'ls') return [...networks.values()]
      .map(n => JSON.stringify({ ID: n.Id, Name: n.Name })).join('\n');
    if (args[0] === 'network' && args[1] === 'inspect') return JSON.stringify([networks.get(args[2])]);
    if (args[0] === 'volume' && args[1] === 'ls') return JSON.stringify({ Name: volume.Name, Driver: volume.Driver });
    if (args[0] === 'volume' && args[1] === 'inspect') return JSON.stringify([volume]);
    throw new Error('unlisted command');
  };
  return { ids, imageIds, networkIds, containers, images, networks, calls, command, dir: directory };
}

function privateTemp(t) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-scope-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('collects exact current IDs/resources, writes owner-only scope, and emits secret-free receipt', t => {
  const directory = privateTemp(t), f = fixture(directory);
  const receipt = collectGreenScope(input(directory), { command: f.command });
  assert.equal(receipt.status, 'scope_collected_read_only');
  assert.equal(receipt.greenContainerCount, 3);
  assert.equal(receipt.stoppedWitnessCount, 1);
  assert.equal(receipt.containsSecrets, false);
  assert.doesNotMatch(JSON.stringify(receipt), /canary|do-not-write|hidden\/path/i);
  const filename = path.join(directory, receipt.artifact);
  const stat = fs.lstatSync(filename);
  assert.equal(stat.mode & 0o7777, 0o600);
  assert.equal(stat.nlink, 1);
  assert.equal(stat.uid, process.getuid());
  const scope = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.deepEqual(Object.keys(scope).sort(), ['api', 'database', 'databaseName', 'databaseUser', 'networks', 'uploads', 'witnesses']);
  assert.equal(scope.api.id, f.ids.api);
  assert.equal(scope.api.runtimeCommit, commit);
  assert.equal(scope.api.imageId, f.imageIds.api);
  assert.equal(scope.api.imageDigest, f.imageIds.api);
  assert.equal(scope.database.id, f.ids.db);
  assert.equal(scope.database.imageId, f.imageIds.db);
  assert.equal(scope.database.imageDigest, f.imageIds.db);
  assert.deepEqual(scope.witnesses, [{ id: f.ids.witness, name: 'sealed-witness',
    imageId: f.imageIds.witness, imageDigest: f.imageIds.witness }]);
  assert.equal(scope.networks.length, 2);
  assert.equal(scope.uploads, 'green-uploads');
  assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /canary|secret|hidden\/path/i);
  assert.ok(f.calls.every(args => args[0] !== 'exec' && !['start', 'stop', 'create', 'pull', 'rm', 'connect', 'disconnect'].includes(args[0])));
  assert.ok(f.calls.some(args => args[0] === 'inspect' && args[1] === f.ids.api));
  assert.ok(f.calls.some(args => args[0] === 'network' && args[1] === 'inspect' && args[2] === f.networkIds.internal));
});

test('rejects duplicate/stale inventory and never writes a partial scope', t => {
  const directory = privateTemp(t), f = fixture(directory);
  let inventoryCount = 0;
  const command = (binary, args, options) => {
    const result = f.command(binary, args, options);
    if (args[0] === 'ps' && ++inventoryCount === 3) return `${result}\n${hex(99)}`;
    return result;
  };
  assert.throws(() => collectGreenScope(input(directory), { command }), /scope_inventory_drift/u);
  assert.deepEqual(fs.readdirSync(directory), []);
  const duplicateDirectory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-scope-duplicate-'));
  fs.chmodSync(duplicateDirectory, 0o700);
  try {
    const duplicateFixture = fixture(duplicateDirectory);
    const duplicateCommand = (binary, args, options) => args[0] === 'ps'
      ? `${duplicateFixture.ids.api}\n${duplicateFixture.ids.api}`
      : duplicateFixture.command(binary, args, options);
    assert.throws(() => collectGreenScope(input(duplicateDirectory), { command: duplicateCommand }), /scope_inventory/u);
    assert.deepEqual(fs.readdirSync(duplicateDirectory), []);
  } finally { fs.rmSync(duplicateDirectory, { recursive: true, force: true }); }
});

test('rejects image digest ambiguity, foreign runtime, running witness, and post-read drift', t => {
  const cases = [
    f => { f.images.get(f.imageIds.api).RepoDigests.push(`other/repo@sha256:${hex(99)}`); },
    f => { f.images.get(f.imageIds.api).Config.Labels['org.opencontainers.image.revision'] = '8'.repeat(40); },
    f => { f.containers.get(f.ids.witness).State.Running = true; },
  ];
  for (const change of cases) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sit-green-scope-reject-'));
    fs.chmodSync(directory, 0o700);
    try {
      const f = fixture(directory); change(f);
      assert.throws(() => collectGreenScope(input(directory), { command: f.command }));
      assert.deepEqual(fs.readdirSync(directory), []);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  const directory = privateTemp(t), f = fixture(directory);
  let apiReads = 0;
  const drifting = (binary, args, options) => {
    const result = f.command(binary, args, options);
    if (args[0] === 'inspect' && args[1] === f.ids.api && ++apiReads === 2) {
      const changed = JSON.parse(result); changed[0].Config.Env.push('LATE_DRIFT=true'); return JSON.stringify(changed);
    }
    return result;
  };
  assert.throws(() => collectGreenScope(input(directory), { command: drifting }), /scope_container_drift/u);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('Mounts reordering is stable while mount, network, config, and state changes fail', t => {
  const reorderDirectory = privateTemp(t), reorderFixture = fixture(reorderDirectory);
  let reorderReads = 0;
  const reorderCommand = (binary, args, options) => {
    const result = reorderFixture.command(binary, args, options);
    if (args[0] === 'inspect' && args[1] === reorderFixture.ids.api && ++reorderReads === 2) {
      const value = JSON.parse(result); value[0].Mounts.reverse(); return JSON.stringify(value);
    }
    return result;
  };
  assert.equal(collectGreenScope(input(reorderDirectory), { command: reorderCommand }).status, 'scope_collected_read_only');

  for (const change of ['mount', 'network', 'config', 'state']) {
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-scope-semantic-drift-'));
    fs.chmodSync(directory, 0o700);
    try {
      const f = fixture(directory);
      let apiReads = 0;
      const command = (binary, args, options) => {
        const result = f.command(binary, args, options);
        if (args[0] !== 'inspect' || args[1] !== f.ids.api || ++apiReads !== 2) return result;
        const value = JSON.parse(result)[0];
        if (change === 'mount') value.Mounts[0].RW = false;
        if (change === 'network') value.NetworkSettings.Networks['green-internal'].NetworkID = hex(99);
        if (change === 'config') value.Config.Env.push('LATE_DRIFT=true');
        if (change === 'state') value.State.Running = false;
        return JSON.stringify([value]);
      };
      assert.throws(() => collectGreenScope(input(directory), { command }), /scope_container_drift/u);
      assert.deepEqual(fs.readdirSync(directory), []);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('rejects network and volume changes between direct readbacks', t => {
  for (const target of ['network', 'volume']) {
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-green-scope-resource-drift-'));
    fs.chmodSync(directory, 0o700);
    try {
      const f = fixture(directory);
      let reads = 0;
      const command = (binary, args, options) => {
        const result = f.command(binary, args, options);
        if (target === 'network' && args[0] === 'network' && args[1] === 'inspect'
            && args[2] === f.networkIds.internal && ++reads === 2) {
          const value = JSON.parse(result); value[0].Containers[hex(99)] = { Name: 'late-join' }; return JSON.stringify(value);
        }
        if (target === 'volume' && args[0] === 'volume' && args[1] === 'inspect' && ++reads === 2) {
          const value = JSON.parse(result); value[0].Mountpoint = '/changed'; return JSON.stringify(value);
        }
        return result;
      };
      assert.throws(() => collectGreenScope(input(directory), { command }), new RegExp(`scope_${target === 'network' ? 'network_drift' : 'uploads_drift'}`, 'u'));
      assert.deepEqual(fs.readdirSync(directory), []);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('CLI requires explicit expected identities and sanitizes Docker failures', t => {
  const directory = privateTemp(t);
  const args = ['--runtime-commit', commit, '--api-container-name', 'sit-api', '--database-container-name', 'sit-db',
    '--internal-network-name', 'green-internal', '--external-network-name', 'provider-egress',
    '--uploads-volume-name', 'green-uploads', '--database-user', 'shareittoo_green', '--database-name', 'shareittoo_green',
    '--evidence-directory', directory, '--output-name', 'cli-scope.json'];
  assert.equal(parseArguments(args).apiContainerName, 'sit-api');
  assert.throws(() => parseArguments([...args, '--unexpected', 'value']));
  let stdout = '', stderr = '';
  const status = runCli(args, { stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } }, dependencies: { command: () => { throw new Error('SECRET_CANARY'); } } });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, 'green_106_106_scope_collect_failed\n');
  assert.doesNotMatch(stderr, /SECRET_CANARY/u);
  assert.deepEqual(fs.readdirSync(directory), []);
});
