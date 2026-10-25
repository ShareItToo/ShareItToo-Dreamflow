import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPersistence, supportedCanonicalRestartPolicy } from '../ops/green_staging_106_106_resources.mjs';

function fixture() {
  const records = [1, 2].map(n => ({ Id: String(n).repeat(64), Name: n === 1 ? '/canonical-api' : '/canonical-db',
    Image: `sha256:${String(n + 2).repeat(64)}`, State: { Running: true, Paused: false },
    Config: { Env: ['SYNTHETIC=1'], Labels: { 'com.shareittoo.sit.green': 'true' } },
    HostConfig: { RestartPolicy: { Name: 'no', MaximumRetryCount: 0 }, Privileged: false },
    Mounts: [{ Type: 'bind', Source: '/synthetic/source', Destination: '/synthetic/target', RW: false }],
    NetworkSettings: { Networks: { internal: { NetworkID: 'a'.repeat(64), Aliases: ['canonical'] } } } }));
  const calls = [];
  const command = async e => {
    calls.push(e); const record = records.find(r => r.Id === e.args.at(-1)); assert.ok(record);
    if (e.args[0] === 'inspect') return JSON.stringify([record]);
    assert.deepEqual(e.args.slice(0, 2), ['update', '--restart']); assert.equal(e.args.length, 4);
    assert.ok(['no', 'unless-stopped'].includes(e.args[2]));
    record.HostConfig.RestartPolicy = { Name: e.args[2], MaximumRetryCount: 0 }; return record.Id;
  };
  return { records, calls, command };
}
test('canonical restart policies reject always, retry policies, missing/extra fields and retry counts', () => {
  for (const Name of ['no', 'unless-stopped']) assert.equal(supportedCanonicalRestartPolicy({ Name, MaximumRetryCount: 0 }), true);
  for (const policy of [null, {}, { Name: 'no' }, { Name: 'always', MaximumRetryCount: 0 },
    { Name: 'on-failure', MaximumRetryCount: 0 }, { Name: 'unless-stopped', MaximumRetryCount: 2 },
    { Name: 'no', MaximumRetryCount: 0, Extra: true }]) assert.equal(supportedCanonicalRestartPolicy(policy), false);
});
test('policy transition mutates only captured IDs, preserves runtime configuration and reverses exactly', async () => {
  const f = fixture(), baseline = structuredClone(f.records), transition = canonicalPersistence(f.records, f.command);
  await transition.apply(); assert.equal(f.calls.filter(c => c.args[0] === 'update').length, 2);
  await assert.rejects(transition.apply(), /persistence_replay/u);
  assert.equal(await transition.rollback(), true); assert.deepEqual(f.records, baseline);
});
test('a fully persistent pair is a verified no-op and rollback leaves it persistent', async () => {
  const f = fixture(); for (const r of f.records) r.HostConfig.RestartPolicy.Name = 'unless-stopped';
  const transition = canonicalPersistence(f.records, f.command);
  await transition.apply(); assert.equal(await transition.rollback(), true);
  assert.equal(f.calls.some(c => c.args[0] === 'update'), false);
});
test('all identity, config, mounts, env and network drift fails before either policy update', async t => {
  const mutations = {
    id: r => { r.Id = 'f'.repeat(64); }, name: r => { r.Name = '/foreign'; }, image: r => { r.Image = 'foreign'; },
    env: r => { r.Config.Env.push('FOREIGN=1'); }, mount: r => { r.Mounts[0].RW = true; },
    host: r => { r.HostConfig.Privileged = true; }, network: r => { r.NetworkSettings.Networks.internal.NetworkID = 'b'.repeat(64); },
    alias: r => { r.NetworkSettings.Networks.internal.Aliases.push('foreign'); },
    stopped: r => { r.State.Running = false; }, paused: r => { r.State.Paused = true; },
    policy: r => { r.HostConfig.RestartPolicy.Name = 'always'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async () => {
    const f = fixture(), transition = canonicalPersistence(f.records, f.command); mutate(f.records[1]);
    await assert.rejects(transition.apply()); assert.equal(f.calls.some(c => c.args[0] === 'update'), false);
  });
});
test('response loss is reconciled only by rollback readback; rollback refuses collateral drift', async () => {
  const f = fixture();
  const transition = canonicalPersistence(f.records, async e => {
    const result = await f.command(e); if (e.phase === 'persistence_update') throw Error('lost reply'); return result;
  });
  await assert.rejects(transition.apply());
  f.records[0].Config.Env.push('FOREIGN=1');
  assert.equal(await transition.rollback(), false);
  assert.equal(f.calls.filter(e => e.args[0] === 'update').length, 1);
});
test('lost rollback reply is accepted only after exact restored readback', async () => {
  const f = fixture(), transition = canonicalPersistence(f.records, async e => {
    const result = await f.command(e); if (e.phase === 'persistence_rollback') throw Error('lost reply'); return result;
  });
  await transition.apply(); assert.equal(await transition.rollback(), true);
  assert.equal(f.calls.filter(e => e.phase === 'persistence_rollback').length, 2);
});
test('successful update reply without policy effect cannot pass', async () => {
  const f = fixture(), transition = canonicalPersistence(f.records, async e => {
    if (e.phase === 'persistence_update') { f.calls.push(e); return e.args.at(-1); }
    return f.command(e);
  });
  await assert.rejects(transition.apply(), /persistence_readback/u);
  assert.equal(await transition.rollback(), true);
  assert.equal(f.calls.filter(e => e.phase === 'persistence_update').length, 1);
});
