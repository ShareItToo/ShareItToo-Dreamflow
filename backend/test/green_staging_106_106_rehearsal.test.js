import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { objectDigest } from '../ops/green_staging_98_106_contract.mjs';
import { runSuccessorRehearsal, rehearsalConfirmation } from '../ops/green_staging_106_106_rehearsal.mjs';
import { executionPreflight } from '../ops/green_staging_106_106_preflight.mjs';
import { rehearsalFixture } from './fixtures/green_106106_rehearsal.js';

async function scoped(run) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-successor-rehearsal-')); fs.chmodSync(directory, 0o700);
  try { await run(await rehearsalFixture(directory), directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
const owned = f => Object.values(f.records).filter(r => r.Name?.includes('sit-106-106-'));
const groupAdds = call => call.args.flatMap((value, index) => value === '--group-add' ? [call.args[index + 1]] : []);
test('isolated lifecycle seals by exact ID, verifies backup/restore106/startup/probes and cleanup before PASS', async () => scoped(async (f, directory) => {
  const baseline = structuredClone(f.states.get(f.dbSource.Id));
  let result;
  try { result = await runSuccessorRehearsal(f.data, f.options, f.dependencies); }
  catch (error) { throw new Error(`synthetic phases: ${f.calls.slice(-15).map(c => c.phase ?? c.args[0]).join(', ')}`, { cause: error }); }
  assert.equal(result.status, 'rehearsal_passed_services_sealed'); assert.equal(f.probeRan(), true);
  assert.equal(f.source.State.Running, false); assert.equal(f.source.Name, `/${f.config.sealedSourceName}`);
  assert.equal(owned(f).length, 0); assert.deepEqual([...f.volumes], ['green-uploads']);
  assert.deepEqual(f.states.get(f.dbSource.Id), baseline); assert.equal(f.open.size, 0);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.rehearsal.json')));
  for (const field of ['cleanupVerified', 'fixtureCleanupVerified', 'namespaceReadabilityVerified', 'servicesRemainSealed']) assert.equal(receipt[field], true);
  assert.equal(receipt.canonicalPromotionImplemented, false);
  const starts = f.calls.filter(c => c.args[0] === 'start'); assert.ok(starts.length > 0);
  assert.ok(starts.every(c => c.args[1] !== f.source.Id));
  assert.ok(f.calls.filter(c => c.args[0] === 'rm').every(c => c.args[1] === '--force' && c.args[2] === '--volumes' && /^[a-f0-9]{64}$/u.test(c.args[3])));
  assert.ok(!f.calls.some(c => c.args.includes('--publish') || (c.args[0] === 'volume' && ['rm', 'create'].includes(c.args[1]))));
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_materials')), ['65532']);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_database')), []);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_candidate')), []);
}));
test('candidate receives exactly the supplemental gid required by its mounted material', async () => scoped(async f => {
  const [mfa, firebase] = f.config.materials;
  f.io.lstatSync(mfa.source); f.io.lstatSync(firebase.source);
  mfa.gid = 65532; firebase.gid = f.config.gid;
  f.stats.get(mfa.source).gid = 65532n; f.stats.get(firebase.source).gid = BigInt(f.config.gid);
  f.manifest.configSha256 = objectDigest(f.config);
  f.options.preflight = await executionPreflight(f.data, f.dependencies);
  f.options.preflightSha256 = objectDigest(f.options.preflight);
  f.options.confirmation = rehearsalConfirmation(f.data, f.options.preflightSha256); f.calls.length = 0;
  await runSuccessorRehearsal(f.data, f.options, f.dependencies);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_materials')), ['65532']);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_database')), []);
  assert.deepEqual(groupAdds(f.calls.find(c => c.phase === 'create_candidate')), ['65532']);
}));
test('consent, stale/schema1 receipt and evidence collisions fail before any command or write', async t => {
  for (const [label, change] of Object.entries({ consent: f => { f.options.confirmation = 'no'; },
    stale: f => { f.options.preflight.createdAt = '2020-01-01T00:00:00.000Z'; },
    old: f => { f.options.preflight.schemaVersion = 1; },
    binding: f => { f.options.preflight.targetSha256 = '0'.repeat(64); },
    collision: (f, d) => fs.writeFileSync(path.join(d, 'synthetic-run.pgdump'), 'retained', { mode: 0o600 }) })) {
    await t.test(label, async () => scoped(async (f, directory) => {
      change(f, directory);
      if (label !== 'consent') { f.options.preflightSha256 = objectDigest(f.options.preflight); f.options.confirmation = rehearsalConfirmation(f.data, f.options.preflightSha256); }
      const before = fs.readdirSync(directory); await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
      assert.equal(f.calls.length, 0); assert.deepEqual(fs.readdirSync(directory), before); assert.equal(f.source.State.Running, true);
    }));
  }
});
test('lost responses are reconciled from exact state without replaying mutations', async () => scoped(async f => {
  for (const phase of ['create_materials', 'start_materials', 'remove_materials', 'source_stop', 'source_seal', 'create_network',
    'create_database', 'start_database', 'create_candidate', 'start_candidate', 'remove_candidate', 'remove_database', 'remove_network']) f.losses.add(phase);
  await runSuccessorRehearsal(f.data, f.options, f.dependencies);
  for (const phase of ['source_stop', 'source_seal', 'create_database', 'start_candidate', 'remove_database']) assert.equal(f.calls.filter(c => c.phase === phase).length, 1);
  assert.equal(owned(f).length, 0); assert.equal(f.losses.size, 0);
}));
test('prerequisite/start/probe failures never restart the source and leave no owned fixtures', async t => {
  for (const phase of ['create_materials', 'protected_backup', 'restore106', 'synthetic_mfa_identity']) await t.test(phase, async () => scoped(async (f, directory) => {
    f.beforeFailures.add(phase); await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
    assert.equal(f.beforeFailures.size, 0); assert.ok(f.calls.some(c => c.phase === phase));
    assert.equal(owned(f).length, 0); assert.deepEqual([...f.volumes], ['green-uploads']);
    assert.ok(!f.calls.some(c => c.args[0] === 'start' && c.args[1] === f.source.Id));
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json'))).cleanupVerified, true);
  }));
});
test('foreign network member prevents progress and cleanup failure overrides all successful checks', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command; let inserted = false;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase === 'start_candidate' && !inserted) {
      const net = Object.values(f.records).find(r => r.Name === `sit-106-106-${f.config.runId}`);
      net.Containers['f'.repeat(64)] = { Name: 'foreign-router' }; inserted = true;
    }
    return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies), /cleanup_failed/u);
  const failure = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.failure.json')));
  assert.equal(failure.cleanupVerified, false); assert.equal(f.probeRan(), false);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
  assert.ok(!f.calls.some(c => c.args.at(-1) === 'f'.repeat(64)));
}));
test('wrong exact version is read-only-polled, never restarts candidate or reaches probes', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase !== 'candidate_readiness') return result;
    const value = JSON.parse(result); value.version.buildTime = null; return JSON.stringify(value);
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  assert.equal(f.calls.filter(c => c.phase === 'candidate_readiness').length, 30);
  assert.equal(f.calls.filter(c => c.phase === 'start_candidate').length, 1); assert.equal(f.probeRan(), false);
  assert.equal(owned(f).length, 0); assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
}));
test('canonical router drift after isolated cleanup prevents final PASS', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await prior(e);
    if (e.phase === 'remove_network') f.records[f.binding?.scope?.networks?.[0]?.id ?? f.f.binding.scope.networks[0].id].Containers['e'.repeat(64)] = { Name: 'foreign' };
    return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies));
  assert.equal(f.probeRan(), true); assert.equal(owned(f).length, 0);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
}));
test('retained owned volume is a cleanup failure, never a PASS', async () => scoped(async (f, directory) => {
  const prior = f.dependencies.command; let retained;
  f.dependencies.command = async e => {
    if (e.phase === 'remove_database') retained = f.records[e.args.at(-1)].Mounts[0].Name;
    const result = await prior(e); if (retained) f.volumes.add(retained); return result;
  };
  await assert.rejects(runSuccessorRehearsal(f.data, f.options, f.dependencies), /cleanup_failed/u);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.rehearsal.json')));
}));
