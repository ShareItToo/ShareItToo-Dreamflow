import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { digest, objectDigest } from '../ops/green_staging_98_106_contract.mjs';
import { executionPreflight, physicalSchemaSql, writersSql, constraintsSql, validateExecutionInputs, bindExecutionMaterials,
  disposableResourcePlan, assertOwnedResource, assertOwnedNetwork } from '../ops/green_staging_106_106_preflight.mjs';
import { readCandidateArchive, tarEntries } from '../ops/green_staging_106_106_image.mjs';
import { isolatedSpec } from '../ops/green_staging_106_106_resources.mjs';
import { hex } from './fixtures/green_106106_readonly.js';
import { candidateArchive, tar } from './fixtures/green_106106_archive.js';

import { inputs } from "./fixtures/green_106106_preflight.js";
const seal = s => {
  s.config.sourceState = 'sealed'; s.manifest.configSha256 = objectDigest(s.config);
  s.f.records[hex(1)].Name = `/${s.config.sealedSourceName}`; s.f.records[hex(1)].State.Running = false;
  for (const n of s.f.binding.scope.networks) delete s.f.records[n.id].Containers[hex(1)];
};
test('read-only running and sealed preflight execute all bindings and leave authorization false', async () => {
  for (const sealed of [false, true]) {
    const s = await inputs(); if (sealed) seal(s);
    const result = await executionPreflight(s.data, s.dependencies);
    assert.equal(result.status, 'read_only_preflight_passed'); assert.equal(result.candidateContent.migrations.length, 106);
    assert.equal(result.candidateContent.uid, 10001); assert.equal(s.open.size, 0);
    for (const key of ['namespaceReadabilityVerified', 'rehearsalPassed', 'promotionAuthorized', 'mutationAdapterImplemented']) assert.equal(result[key], false);
  }
});
test('sealed exact source and full membership CAS reject every altered identity or extra member', async t => {
  const changes = {
    running: s => { s.f.records[hex(1)].State.Running = true; },
    wrongName: s => { s.f.records[hex(1)].Name = '/arbitrary'; },
    wrongId: s => { s.f.records[hex(1)].Id = hex(90); },
    sourceMember: s => { s.f.records[hex(31)].Containers[hex(1)] = { Name: s.config.sealedSourceName }; },
    removedRouter: s => { delete s.f.records[hex(31)].Containers[hex(60)]; },
    routerRenamed: s => { s.f.records[hex(31)].Containers[hex(60)].Name = 'foreign'; },
    foreignMember: s => { s.f.records[hex(31)].Containers[hex(90)] = { Name: 'foreign' }; },
    mount: s => { s.f.records[hex(1)].Mounts[0].RW = false; },
    writer: s => { const prior = s.dependencies.command; s.dependencies.command = e => e.input === writersSql ? '1' : prior(e); },
    schema: s => { const prior = s.dependencies.command; s.dependencies.command = e => e.input === physicalSchemaSql ? hex(90) : prior(e); },
    constraints: s => { const prior = s.dependencies.command; s.dependencies.command = e => e.input === constraintsSql ? '1' : prior(e); },
    mission: s => { s.f.sqlRows[1].mission_needs.count++; },
    heartbeat: s => { s.f.sqlRows[2][0].attempt_count++; },
    uid: s => { s.config.uid++; s.manifest.configSha256 = objectDigest(s.config); },
  };
  for (const [label, change] of Object.entries(changes)) await t.test(label, async () => {
    const s = await inputs(); seal(s); change(s); await assert.rejects(executionPreflight(s.data, s.dependencies)); assert.equal(s.open.size, 0);
  });
});
test('versioned execution/runtime inputs reject hash/version/unknown-field and material-scope drift', async () => {
  for (const change of [s => { s.config.schemaVersion = 0; }, s => { s.config.extra = true; },
    s => { s.manifest.schemaVersion = 2; }, s => { s.manifest.targetSha256 = hex(90); },
    s => { s.config.materials[0].mode = 0o644; }, s => { s.config.materials.push(s.config.materials[0]); },
    s => { s.config.materials[0].source = '/private/../unsafe'; }, s => { s.config.materials[0].destination = '/app/src/server.js'; }]) {
    const s = await inputs(); change(s); assert.throws(() => validateExecutionInputs(s.config, s.manifest, s.f.binding, s.target));
  }
});
test('stable material descriptors reject changed bytes, metadata, path identity and env/image overrides', async t => {
  const changes = {
    bytes: s => { s.files.set(s.config.materials[0].source, Buffer.from('changed')); },
    mode: s => { s.io.lstatSync(s.config.materials[0].source); s.stats.get(s.config.materials[0].source).mode = 0o644n; },
    owner: s => { s.io.lstatSync(s.config.materials[0].source); s.stats.get(s.config.materials[0].source).uid = 1n; },
    hardlink: s => { s.io.lstatSync(s.config.materials[0].source); s.stats.get(s.config.materials[0].source).nlink = 2n; },
    parent: s => { s.io.lstatSync('/private/sit-preflight'); s.stats.get('/private/sit-preflight').mode = 0o755n; },
    race: s => { const prior = s.io.lstatSync; s.io.lstatSync = n => ({ ...prior(n), ino: 999n }); },
    symlink: s => { s.io.openSync = () => { throw new Error('ELOOP'); }; },
    envOverride: s => { const b = Buffer.from('APP_COMMIT=forged\n'); s.files.set(s.config.envFile.source, b); s.config.envFile.sha256 = digest(b); },
    missingOverride: s => { s.c.image.Config.Env = ['NODE_ENV=production']; },
  };
  for (const [label, change] of Object.entries(changes)) await t.test(label, async () => {
    const s = await inputs(); change(s);
    assert.throws(() => bindExecutionMaterials(s.config, s.f.records[hex(1)], s.c.image, s.io)); assert.equal(s.open.size, 0);
  });
  const s = await inputs(), held = bindExecutionMaterials(s.config, s.f.records[hex(1)], s.c.image, s.io);
  assert.deepEqual(held.supplementalGroups, ['65532']);
  s.stats.get(s.config.materials[0].source).mtimeNs++; assert.throws(held.recheck); held.close(); assert.equal(s.open.size, 0);
});
test('mixed material gids require exact strict source supplemental groups', async t => {
  const changes = {
    missing: source => { source.HostConfig.GroupAdd = []; },
    foreign: source => { source.HostConfig.GroupAdd = ['65531']; },
    root: source => { source.HostConfig.GroupAdd = ['0', '65532']; },
    malformed: source => { source.HostConfig.GroupAdd = ['065532']; },
    nonString: source => { source.HostConfig.GroupAdd = [65532]; },
    duplicate: source => { source.HostConfig.GroupAdd = ['65532', '65532']; },
  };
  for (const [label, change] of Object.entries(changes)) await t.test(label, async () => {
    const s = await inputs(), source = s.f.records[hex(1)]; change(source);
    assert.throws(() => bindExecutionMaterials(s.config, source, s.c.image, s.io)); assert.equal(s.open.size, 0);
  });
  const s = await inputs(), source = s.f.records[hex(1)];
  source.HostConfig.GroupAdd = ['65533', '65532'];
  const held = bindExecutionMaterials(s.config, source, s.c.image, s.io);
  assert.deepEqual(held.supplementalGroups, ['65532']); held.close(); assert.equal(s.open.size, 0);
});
test('isolated specs sort necessary groups and reject foreign observed groups exactly', async () => {
  const s = await inputs(), built = isolatedSpec(s.c.image, null, {}, { groups: ['65533', '65532'] });
  assert.deepEqual(built.spec.groups, ['65532', '65533']);
  assert.deepEqual(built.args.filter((value, index) => value === '--group-add' || built.args[index - 1] === '--group-add'),
    ['--group-add', '65532', '--group-add', '65533']);
  const record = { Image: s.c.image.Id, Config: { Image: s.c.image.Id, User: s.c.image.Config.User,
    Env: s.c.image.Config.Env, Entrypoint: s.c.image.Config.Entrypoint, Cmd: s.c.image.Config.Cmd },
    HostConfig: { Privileged: false, NetworkMode: 'none', PortBindings: null, GroupAdd: ['65533', '65532'],
      RestartPolicy: { Name: 'no' }, CapAdd: [], Devices: [], VolumesFrom: [], PidMode: '' },
    State: { Running: false, Paused: false }, Mounts: [], NetworkSettings: { Networks: { none: { NetworkID: '' } } } };
  built.validate(record);
  const foreign = structuredClone(record); foreign.HostConfig.GroupAdd.push('65531'); assert.throws(() => built.validate(foreign));
  for (const groups of [['0'], ['065532'], [65532], ['65532', '65532']]) {
    assert.throws(() => isolatedSpec(s.c.image, null, {}, { groups }));
  }
});
test('candidate archive binds actual config/layer bytes, complete ledger and resolved nonroot user', () => {
  const c = candidateArchive([]); assert.equal(readCandidateArchive(c.archive, c.image).migrations.length, 106);
  const broken = Buffer.from(c.archive); broken[0] ^= 1; assert.throws(() => readCandidateArchive(broken, c.image));
  assert.throws(() => readCandidateArchive(c.archive, { ...c.image, Id: `sha256:${hex(90)}` }));
  for (const changeEntries of [entries => { entries.find(e => e.name.endsWith('.up.sql')).data = 'changed'; },
    entries => { entries.splice(entries.findIndex(e => e.name.endsWith('.up.sql')), 1); },
    entries => { entries.push({ name: 'app/sql/migrations/107_foreign.up.sql', data: 'SELECT 1;' }); },
    entries => { entries.find(e => e.name.endsWith('.up.sql')).type = '2'; },
    entries => { entries.find(e => e.name === 'app/sql').mode = 0o600; },
    entries => { entries.find(e => e.name === 'etc/passwd').data = 'sitworker:x:0:10001:root:/root:/bin/sh\n'; }]) {
    const bad = candidateArchive([], { changeEntries }); assert.throws(() => readCandidateArchive(bad.archive, bad.image));
  }
  const whiteout = candidateArchive([], { extraLayers: [[{ name: 'app/sql/migrations/.wh..wh..opq', data: '' }]] });
  assert.throws(() => readCandidateArchive(whiteout.archive, whiteout.image));
  const originalLayer = tarEntries(tarEntries(c.archive).find(e => e.name === 'layer0.tar').data);
  const originalFile = originalLayer.find(e => e.name.endsWith('.up.sql'));
  const whiteoutName = originalFile.name.replace(/([^/]+)$/u, '.wh.$1');
  const removed = candidateArchive([], { extraLayers: [[{ name: whiteoutName, data: '' }]] });
  assert.throws(() => readCandidateArchive(removed.archive, removed.image));
  const replaced = candidateArchive([], { extraLayers: [[{ name: whiteoutName, data: '' }, originalFile]] });
  assert.equal(readCandidateArchive(replaced.archive, replaced.image).migrations.length, 106);
  const tamperedLayer = Buffer.from(c.archive);
  tarEntries(tamperedLayer).find(e => e.name === 'layer0.tar').data[600] ^= 1;
  assert.throws(() => readCandidateArchive(tamperedLayer, c.image));
  assert.throws(() => tarEntries(tar([{ name: '../escape', data: '' }])));
  const duplicate = candidateArchive([], { changeEntries: entries => { entries.push(entries[0]); } });
  assert.throws(() => readCandidateArchive(duplicate.archive, duplicate.image));
});
test('tar reader supports bounded POSIX PAX paths and rejects malformed metadata', () => {
  const pax = value => {
    let size = value.length + 3;
    while (`${size} ${value}\n`.length !== size) size = `${size} ${value}\n`.length;
    return `${size} ${value}\n`;
  };
  const entries = tarEntries(tar([{ name: 'pax-header', type: 'x', data: pax('path=app/sql/migrations/synthetic.up.sql') },
    { name: 'short', data: 'synthetic' }]));
  assert.equal(entries[0].name, 'app/sql/migrations/synthetic.up.sql');
  assert.throws(() => tarEntries(tar([{ name: 'pax-header', type: 'x', data: pax('path=../escape') }, { name: 'short', data: '' }])));
  assert.throws(() => tarEntries(tar([{ name: 'pax-header', type: 'x', data: '999 path=bad\n' }, { name: 'short', data: '' }])));
  const invalidUtf8 = Buffer.concat([Buffer.from('11 path='), Buffer.from([0xc3, 0x28]), Buffer.from('\n')]);
  assert.equal(invalidUtf8.length, 11);
  assert.throws(() => tarEntries(tar([{ name: 'pax-header', type: 'x', data: invalidUtf8 }, { name: 'short', data: '' }])), /archive_utf8/u);
});
test('gzip image layers accept exact content but reject oversized expansion before layer parsing', () => {
  const c = candidateArchive([]), entries = tarEntries(c.archive);
  const layer = entries.find(e => e.name === 'layer0.tar');
  const layerSize = layer.data.length; layer.data = gzipSync(layer.data);
  const compressed = tar(entries);
  assert.equal(readCandidateArchive(compressed, c.image).migrations.length, 106);
  assert.throws(() => readCandidateArchive(compressed, c.image, { maxLayerBytes: layerSize - 1 }), /archive_layer_size/u);
  assert.throws(() => readCandidateArchive(compressed, c.image, { maxLayerBytes: 512 * 1024 * 1024 + 1 }), /archive_layer_size/u);
});
test('disposable resource primitives bind run, role, immutable ID/image and ownership labels', () => {
  const plan = disposableResourcePlan('synthetic-run', `sha256:${hex(1)}`, `sha256:${hex(2)}`), id = hex(5);
  const record = { Id: id, Name: `/${plan.roles[2].name}`, Image: plan.candidateImageId, Config: { Labels: plan.labels } };
  assert.equal(assertOwnedResource(record, plan, 'candidate', id), id);
  for (const patch of [{ Id: hex(6) }, { Name: '/foreign' }, { Image: `sha256:${hex(7)}` }, { Config: { Labels: {} } }]) {
    assert.throws(() => assertOwnedResource({ ...record, ...patch }, plan, 'candidate', id));
  }
  assert.equal(plan.network.internal, true); assert.equal(plan.storage, 'anonymous_attached_only');
  assert.equal(plan.mutationAdapterImplemented, false);
  const network = { Id: hex(6), Name: plan.network.name, Internal: true, Labels: plan.labels };
  assert.equal(assertOwnedNetwork(network, plan, network.Id), network.Id);
  assert.throws(() => assertOwnedNetwork({ ...network, Internal: false }, plan, network.Id));
  const database = { Id: id, Name: `/${plan.roles[0].name}`, Image: plan.roles[0].imageId, Config: { Labels: plan.labels },
    HostConfig: { Binds: null, Mounts: [] }, Mounts: [{ Type: 'volume', Name: hex(8), Destination: '/var/lib/postgresql/data', RW: true }] };
  assert.equal(assertOwnedResource(database, plan, 'database', id), id);
  for (const change of [r => { r.Mounts[0].Name = 'named-volume'; }, r => { r.Mounts.push(r.Mounts[0]); },
    r => { r.HostConfig.Binds = ['foreign:/var/lib/postgresql/data']; }, r => { r.Image = plan.candidateImageId; }]) {
    const bad = structuredClone(database); change(bad); assert.throws(() => assertOwnedResource(bad, plan, 'database', id));
  }
});
