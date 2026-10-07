import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { digest, migrationInventory, objectDigest, repositoryRoot } from '../ops/green_staging_98_106_contract.mjs';
import { requiredEnvironment } from '../ops/green_staging_98_106_promotion.mjs';
import { successorSourcePaths, validateSuccessorSource } from '../ops/green_staging_106_106_binding.mjs';
import { assertCollectorRead, collectSuccessor, verifyCollectedTarget } from '../ops/green_staging_106_106_collector.mjs';
import { assertSuccessorStartup, decodeSnapshot, snapshotSql } from '../ops/green_staging_106_106_database.mjs';
import { parseArguments } from '../../tool/validate_green_staging_106_106_runtime.mjs';

import { fixture, hex } from "./fixtures/green_106106_readonly.js";
const run = f => collectSuccessor({ binding: f.binding, publicationBytes: f.publicationBytes, mode: 'collect' },
  { command: f.command, sourceOptions: { git: f.git } });

test('read-only collection binds current identities, complete router membership and populated Mission state without values', async () => {
  const f = fixture(), result = await run(f);
  assert.equal(result.status, 'collected_not_authorized');
  assert.equal(result.target.database.data.business.mission_needs.count, 3);
  assert.equal(result.target.networks[0].members.length, 3);
  assert.equal(verifyCollectedTarget(result.target, result.targetSha256), true);
  assert.ok(!JSON.stringify(result).includes('synthetic-only'));
  assert.ok(!JSON.stringify(result).includes('Config'));
  f.calls.forEach(assertCollectorRead);
  assert.equal(f.calls.filter(c => c.input).length, 1);
  assert.equal(f.calls.find(c => c.input).input, snapshotSql);
  assert.throws(() => verifyCollectedTarget(result.target, hex(99)));
});
test('default plan makes zero Docker calls and rejects mutation modes', async () => {
  const f = fixture();
  await collectSuccessor(f, { command: f.command, sourceOptions: { git: f.git } });
  assert.equal(f.calls.length, 0);
  for (const mode of ['rehearse', 'promote', 'execute']) await assert.rejects(collectSuccessor({ ...f, mode }));
  assert.throws(() => parseArguments(['--mode', 'promote']));
});
test('source bytes, commit, complete closure and runtime migration checks fail before Docker', async t => {
  for (const [label, change] of Object.entries({ missing: f => { delete f.binding.sourceInventory[successorSourcePaths()[0]]; },
    extra: f => { f.binding.sourceInventory.extra = hex(99); }, hash: f => { f.binding.sourceInventory[successorSourcePaths()[0]] = hex(99); },
    head: f => { f.binding.opsCommit = 'd'.repeat(40); }, schema: f => { f.binding.schemaVersion = 2; },
    extraMigration: f => { const prior = f.git; f.git = a => a[0] === 'ls-tree' ? `${prior(a)}\n107_foreign.up.sql` : prior(a); },
    runtime: f => { const prior = f.git; f.git = a => a[0] === 'show' && a[1].startsWith(`${f.binding.runtimeCommit}:`) ? Buffer.from('drift') : prior(a); } })) {
    await t.test(label, async () => { const f = fixture(); change(f); await assert.rejects(run(f)); assert.equal(f.calls.length, 0); });
  }
  assert.equal(validateSuccessorSource(fixture().binding, { git: fixture().git }), 'b'.repeat(40));
});
test('foreign/missing identity, provider activation, mount/config/network/witness drift fail closed', async t => {
  const cases = {
    wrongImage: f => { f.records[hex(1)].Image = `sha256:${hex(99)}`; },
    oldRevision: f => { f.records[`sha256:${hex(11)}`].Config.Labels['org.opencontainers.image.revision'] = 'd'.repeat(40); },
    paused: f => { f.records[hex(1)].State.Paused = true; },
    witnessRunning: f => { f.records[hex(3)].State.Running = true; },
    provider: f => { f.records[hex(1)].Config.Env.push('STRIPE_SECRET_KEY=' + ['synthetic', 'only'].join('-')); },
    mountDuplicate: f => { f.records[hex(1)].Mounts.push(f.records[hex(1)].Mounts[0]); },
    missingApi: f => { delete f.records[hex(31)].Containers[hex(1)]; },
    missingDb: f => { delete f.records[hex(31)].Containers[hex(2)]; },
    malformedWitnesses: f => { f.binding.scope.witnesses = null; },
    untypedExtra: f => { f.binding.scope.api.privateValue = 'must-not-serialize'; },
    duplicateWitness: f => { f.binding.scope.witnesses.push(f.binding.scope.witnesses[0]); },
    foreignWitness: f => { const prior = f.command; f.command = e => e.args[0] === 'ps' ? `${hex(1)}\n${hex(2)}\n${hex(3)}\n${hex(99)}` : prior(e); },
    changedRouter: f => { const prior = f.command; let count = 0; f.command = e => {
      if (e.args[0] === 'network' && e.args.at(-1) === hex(31) && ++count === 2) f.records[hex(31)].Containers[hex(60)].Name = 'changed';
      return prior(e); }; },
    joinedMember: f => { const prior = f.command; let count = 0; f.command = e => {
      if (e.args[0] === 'network' && e.args.at(-1) === hex(31) && ++count === 2) f.records[hex(31)].Containers[hex(99)] = { Name: 'foreign' };
      return prior(e); }; },
    removedMember: f => { const prior = f.command; let count = 0; f.command = e => {
      if (e.args[0] === 'network' && e.args.at(-1) === hex(31) && ++count === 2) delete f.records[hex(31)].Containers[hex(60)];
      return prior(e); }; },
    changedConfig: f => { const prior = f.command; let count = 0; f.command = e => {
      if (e.args[0] === 'inspect' && e.args.at(-1) === hex(1) && ++count === 2) f.records[hex(1)].HostConfig.ReadonlyRootfs = false;
      return prior(e); }; },
  };
  for (const [label, change] of Object.entries(cases)) await t.test(label, async () => { const f = fixture(); change(f); await assert.rejects(run(f)); });
});
test('only exact inspect/list and fixed read-only SQL transport are accepted', () => {
  for (const args of [['start', hex(1)], ['exec', hex(1), 'sh'], ['inspect', 'mutable-name'], ['pull', 'image'], ['network', 'connect', hex(1)]]) {
    assert.throws(() => assertCollectorRead({ args }));
  }
  assert.throws(() => assertCollectorRead({ args: ['inspect', hex(1)], input: 'DELETE FROM users;' }));
  assert.match(snapshotSql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(snapshotSql, /COMMIT;/u);
});
test('one heartbeat allowed; populated Mission data, ledger, inventory, readiness and errors remain strict', () => {
  const f = fixture(), before = decodeSnapshot(f.sqlRows.map(r => JSON.stringify(r)).join('\n'));
  const after = structuredClone(before);
  after.watchdog.last_started_at = after.watchdog.last_succeeded_at = after.watchdog.updated_at = '2020-01-01T00:00:01.000Z';
  after.watchdog.attempt_count++; after.watchdog.success_count++;
  assert.equal(assertSuccessorStartup(before, after), true);
  for (const change of [s => { s.data.business.mission_needs.count++; }, s => { s.ledgerRowsSha256 = hex(99); },
    s => { delete s.data.business.users; }, s => { s.readiness.supportNextUpdateOverdue.push({}); },
    s => { s.watchdog.attempt_count++; }, s => { s.watchdog.last_alert_count++; }, s => { s.watchdog.singleton = false; }]) {
    const broken = structuredClone(after); change(broken); assert.throws(() => assertSuccessorStartup(before, broken));
  }
  assert.equal(objectDigest(before.data.business), objectDigest(after.data.business));
});
test('database decoding rejects malformed ledger, table hashes/counts, readiness and singleton state', () => {
  for (const change of [r => { r[0].pop(); }, r => { r[0][0].applied_at = null; },
    r => { r[1].mission_needs.count = -1; }, r => { r[1].mission_needs.sha256 = 'bad'; },
    r => { r[1].mission_needs.extra = true; }, r => { r[1].schema_migrations = r[1].users; },
    r => { r[2] = []; }, r => { r[2].push(r[2][0]); }, r => { r[2][0].success_count = '1'; },
    r => { r[2][0].worker_version = 'foreign'; }, r => { r[3].extra = true; },
    r => { r[3].supportNextUpdateOverdue = [{}]; }]) {
    const rows = fixture().sqlRows; change(rows);
    assert.throws(() => decodeSnapshot(rows.map(r => JSON.stringify(r)).join('\n')));
  }
});
