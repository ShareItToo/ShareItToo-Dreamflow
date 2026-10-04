import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  assertCorsPreState, corsBefore, corsContainerFingerprint, readCorsWitnesses,
} from '../ops/staging_web_cors_transition.mjs';

function fixture() {
  return {
    Id: 'a'.repeat(64), Name: '/shareittoo-staging-api', Image: `sha256:${'b'.repeat(64)}`,
    State: { Running: true },
    Config: { Env: ['FIRST=1', 'SECOND=2'], Cmd: ['node', 'server.js'], Labels: { pilot: 'true' } },
    HostConfig: {
      NetworkMode: 'primary-id', Privileged: false, Memory: 123,
      SecurityOpt: ['no-new-privileges', 'seccomp=profile'], Dns: ['127.0.0.2', '127.0.0.3'],
    },
    Mounts: [
      { Type: 'bind', Source: '/fixture/env', Destination: '/app/env', Mode: 'ro', RW: false, Propagation: 'rprivate' },
      { Type: 'volume', Name: 'uploads', Source: '/fixture/uploads', Destination: '/app/uploads', Driver: 'local', Mode: 'rw', RW: true, Propagation: '' },
      { Type: 'bind', Source: '/fixture/legal', Destination: '/app/legal', Mode: 'ro', RW: false, Propagation: 'rprivate' },
    ],
    NetworkSettings: {
      Networks: { primary: { NetworkID: 'primary-id', Aliases: ['api', 'pilot'] }, provider: { NetworkID: 'provider-id' } },
      Ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }] },
    },
  };
}

test('fingerprint binds complete mount records independently of all six inspect permutations without mutation', () => {
  const record = fixture();
  const before = structuredClone(record);
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    const permuted = structuredClone(record);
    permuted.Mounts = order.map((index) => Object.fromEntries(Object.entries(record.Mounts[index]).reverse()));
    assert.equal(corsContainerFingerprint(permuted), corsContainerFingerprint(record));
  }
  assert.deepEqual(record, before);
});

test('mount sorting retains every known and unknown field and duplicates, including equal-key records', () => {
  const record = fixture();
  for (const field of ['Type', 'Name', 'Source', 'Destination', 'Driver', 'Mode', 'RW', 'Propagation', 'FutureSecurityField']) {
    const changed = structuredClone(record);
    changed.Mounts[1][field] = field === 'RW' ? false : 'changed';
    assert.notEqual(corsContainerFingerprint(changed), corsContainerFingerprint(record), field);
  }
  for (const change of [
    (r) => r.Mounts.pop(), (r) => r.Mounts.push(structuredClone(r.Mounts[0])),
    (r) => { delete r.Mounts; }, (r) => { r.Mounts = null; }, (r) => { r.Mounts = []; },
  ]) {
    const changed = structuredClone(record); change(changed);
    assert.notEqual(corsContainerFingerprint(changed), corsContainerFingerprint(record));
  }
  const tied = structuredClone(record);
  tied.Mounts.push({ ...tied.Mounts[0], FutureSecurityField: 'bound' });
  const reversed = structuredClone(tied); reversed.Mounts.reverse();
  assert.equal(corsContainerFingerprint(tied), corsContainerFingerprint(reversed));
});

test('identity, env, labels, security, resources, network identity and port changes still drift', () => {
  for (const change of [
    (r) => { r.Id = 'c'.repeat(64); }, (r) => { r.Name += '-foreign'; },
    (r) => { r.Image = 'different'; }, (r) => { r.State.Running = false; },
    (r) => { r.Config.Env[0] = 'FIRST=changed'; }, (r) => { r.Config.Labels.pilot = 'false'; },
    (r) => { r.HostConfig.Privileged = true; }, (r) => { r.HostConfig.Memory += 1; },
    (r) => { r.HostConfig.NetworkMode = 'foreign'; },
    (r) => { r.NetworkSettings.Networks.primary.NetworkID = 'foreign'; },
    (r) => { delete r.NetworkSettings.Networks.provider; },
    (r) => { r.NetworkSettings.Networks.extra = { NetworkID: 'foreign' }; },
    (r) => { r.NetworkSettings.Ports['8080/tcp'][0].HostIp = '0.0.0.0'; },
  ]) {
    const record = fixture(); const changed = structuredClone(record); change(changed);
    assert.notEqual(corsContainerFingerprint(changed), corsContainerFingerprint(record));
  }
});

test('unobserved or order-sensitive Config, HostConfig and network arrays remain strict', () => {
  for (const list of [
    (r) => r.Config.Env, (r) => r.Config.Cmd, (r) => r.HostConfig.SecurityOpt,
    (r) => r.HostConfig.Dns, (r) => r.NetworkSettings.Networks.primary.Aliases,
  ]) {
    const record = fixture(); const changed = structuredClone(record); list(changed).reverse();
    assert.notEqual(corsContainerFingerprint(changed), corsContainerFingerprint(record));
  }
});

test('API prestate accepts permuted mounts but rejects mount drift with exact env still bound', () => {
  const record = fixture();
  const content = 'exact protected fixture bytes';
  const manifest = { safetyEnv: {}, corsBinding: {
    apiFingerprint: corsContainerFingerprint(record),
    envSha256: crypto.createHash('sha256').update(content).digest('hex'),
  } };
  const values = { CORS_ORIGINS: corsBefore, SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false' };
  record.Mounts.reverse();
  assert.doesNotThrow(() => assertCorsPreState(manifest, record, content, values));
  assert.throws(() => assertCorsPreState(manifest, record, `${content}\n`, values), /cors_prestate_binding_invalid/u);
  record.Mounts[0].RW = true;
  assert.throws(() => assertCorsPreState(manifest, record, content, values), /cors_prestate_binding_invalid/u);
});

test('Production API and web witnesses accept mount order only, never mount value drift', async () => {
  const records = Object.fromEntries(['shareittoo-api', 'shareittoo-web'].map((name, index) => {
    const record = fixture(); record.Name = `/${name}`; record.Id = String(index + 1).repeat(64);
    return [name, record];
  }));
  const manifest = { corsBinding: {
    productionApiId: records['shareittoo-api'].Id, productionApiFingerprint: corsContainerFingerprint(records['shareittoo-api']),
    webId: records['shareittoo-web'].Id, webFingerprint: corsContainerFingerprint(records['shareittoo-web']),
    productionRootSha256: 'f'.repeat(64),
  } };
  const command = async (bin, args) => ({ stdout: JSON.stringify(bin === 'docker'
    ? records[args.at(-1)] : { productionRootSha256: manifest.corsBinding.productionRootSha256 }) });
  for (const record of Object.values(records)) record.Mounts.reverse();
  await readCorsWitnesses({ manifest, command, phase: 'fixture' });
  for (const record of Object.values(records)) {
    record.Mounts[0].Source += '-foreign';
    await assert.rejects(readCorsWitnesses({ manifest, command, phase: 'fixture' }), /cors_production_witness_drift/u);
    record.Mounts[0].Source = record.Mounts[0].Source.replace(/-foreign$/u, '');
  }
});
