import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runSuccessorPromotion, validatePromotionReceipt, canonicalSuccessorSpec, promotionGatewayReadback, temporaryPromotionName, convergePromotionGateway } from '../ops/green_staging_106_106_promotion.mjs';
import { promotionFixture } from './fixtures/green_106106_promotion.js';
import { canonicalMounts } from '../ops/green_staging_98_106_promotion.mjs';
import { objectDigest } from '../ops/green_staging_98_106_contract.mjs';
import { constraintsSql } from '../ops/green_staging_106_106_preflight.mjs';

const scoped = async fn => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-promotion-')); fs.chmodSync(directory, 0o700);
  try { await fn(await promotionFixture(directory), directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
};
test('promotion defaults to a read-only plan with no dependencies', async () => {
  assert.equal((await runSuccessorPromotion({}, {}, { command: () => assert.fail() })).status, 'read_only_promotion_plan');
});
test('exact rehearsed schema106 successor preserves canonical resources and stops at owner-smoke pending', async () => scoped(async (f, directory) => {
  const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
  assert.equal(result.status, 'promoted_owner_smoke_pending');
  assert.equal(result.ownerSmokePassed, false); assert.equal(result.publicReleaseComplete, false);
  const r = f.records[result.candidateId]; assert.equal(r.State.Running, true);
  assert.deepEqual(canonicalMounts(r.Mounts), canonicalMounts(f.source.Mounts)); assert.deepEqual(r.HostConfig.GroupAdd, f.source.HostConfig.GroupAdd);
  assert.equal(result.intentionalProviderCalls, 0);
  assert.equal(f.source.State.Running, false);
  for (const name of ['promotion-lock.json', 'canonical-started.json', 'promotion.json', 'pgdump', 'rehearsal.json']) {
    assert.ok(fs.existsSync(path.join(directory, `synthetic-run.${name}`)));
  }
  assert.ok(!f.calls.some(e => e.args[0] === 'rm' || e.args.includes('--volumes')));
  assert.equal(f.calls.filter(e => e.phase === 'promotion_rename').length, 1);
  const boundary = f.routing.findIndex(e => e.phase === 'promotion_rename');
  assert.ok(boundary > 0); assert.ok(f.routing.slice(0, boundary).every(e => e.resolved.length === 0));
  assert.deepEqual(f.routing[boundary].resolved, [result.candidateId]);
  assert.equal(result.gatewayVerified, true); assert.equal(result.visibilityBoundary, 'captured_id_rename');
  const gateway = await f.dependencies.publicReadback();
  assert.equal(result.gatewayVersionSha256, objectDigest(gateway.version));
  assert.equal(result.gatewayReadbackSha256, objectDigest(gateway));
  const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.promotion.json')));
  assert.equal(evidence.gatewayReadbackSha256, result.gatewayReadbackSha256);
  assert.ok(!f.calls.some(e => e.args[0] === 'start' && e.args[1] === f.source.Id));
}));
test('receipt rejects wrong commit/hash/snapshot/probes/freshness and payment-mode drift', async () => scoped(async f => {
  for (const mutate of [r => { r.opsCommit = '0'.repeat(40); }, r => { r.backupSha256 = 'bad'; },
    r => { r.cleanupVerified = false; }, r => { r.source.data.business.users.count++; },
    r => { r.probes.identity = 'not_run'; }, r => { r.createdAt = '2020-01-01T00:00:00Z'; },
    r => { r.createdAt = new Date(Date.now() + 100000).toISOString(); }]) {
    const r = structuredClone(f.receipt); mutate(r); assert.throws(() => validatePromotionReceipt(r, f.data, Date.now()));
  }
  const source = structuredClone(f.source); source.Config.Env = source.Config.Env.map(e => e.startsWith('PAYMENT_TRANSPORT=') ? 'PAYMENT_TRANSPORT=stripe' : e);
  assert.throws(() => canonicalSuccessorSpec(source, f.c.image, f.data), /provider_modes/u);
}));
test('post-create/start/attach response loss isolates captured successor, retains lock and never claims rollback', async t => {
  for (const phase of ['promotion_create', 'promotion_start', 'promotion_attach']) await t.test(phase, () => scoped(async (f, directory) => {
    f.promotionLosses.add(phase);
    const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'forward_recovery_required'); assert.equal(result.successorIsolationVerified, true);
    assert.equal(f.records[result.candidateId].State.Running, false); assert.equal(f.source.State.Running, false);
    assert.equal(result.oldImageRestarted, false); assert.equal(result.lockRetained, true);
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
    assert.equal(f.calls.filter(e => e.phase === phase).length, 1);
  }));
});

test('rename response loss is reconciled by captured ID once; no replay or early Caddy resolution', async () => scoped(async f => {
  f.promotionLosses.add('promotion_rename');
  const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
  assert.equal(result.status, 'promoted_owner_smoke_pending'); assert.equal(result.renameReconciled, true);
  assert.equal(f.calls.filter(e => e.phase === 'promotion_rename').length, 1);
  assert.ok(f.routing.slice(0, f.routing.findIndex(e => e.phase === 'promotion_rename')).every(e => e.resolved.length === 0));
}));
test('canonical boundary artifact immediately precedes rename and requires all previsibility acceptance', async () => scoped(async (f, directory) => {
  const command = f.dependencies.command; let readbacks = 0;
  f.dependencies.command = async e => {
    if (e.phase === 'promotion_readiness') readbacks++;
    const filename = path.join(directory, 'synthetic-run.canonical-started.json');
    if (e.phase === 'promotion_rename') {
      assert.ok(readbacks >= 2); assert.deepEqual(f.caddyResolve(), []);
      const evidence = JSON.parse(fs.readFileSync(filename));
      assert.equal(evidence.schemaVersion, 2); assert.equal(evidence.boundary, 'captured_id_rename');
      assert.deepEqual(e.args, ['rename', evidence.candidateId, 'shareittoo-staging-api']);
      assert.equal(evidence.temporaryName, temporaryPromotionName(f.data));
    } else if (readbacks < 2) assert.ok(!fs.existsSync(filename));
    return command(e);
  };
  assert.equal((await runSuccessorPromotion(f.data, f.options, f.dependencies)).status, 'promoted_owner_smoke_pending');
}));
test('rename no-effect, foreign canonical name, or gateway drift isolate only the captured successor', async t => {
  for (const kind of ['no_effect', 'foreign_name', 'gateway', 'alias']) await t.test(kind, () => scoped(async (f, directory) => {
    const command = f.dependencies.command;
    f.dependencies.command = async e => {
      if (e.phase === 'promotion_rename' && kind === 'no_effect') { f.calls.push(e); throw Error('lost before effect'); }
      if (e.phase === 'promotion_rename' && kind === 'foreign_name') {
        f.records['e'.repeat(64)] = { Id: 'e'.repeat(64), Name: '/shareittoo-staging-api', State: { Running: false } };
      }
      const value = await command(e);
      if (kind === 'alias' && e.phase === 'promotion_create') f.records[value].NetworkSettings.Networks.internal.Aliases.push('shareittoo-staging-api');
      return value;
    };
    if (kind === 'gateway') f.dependencies.publicReadback = async () => ({ ready: { status: 'ok' }, version: { commit: 'wrong' } });
    const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'forward_recovery_required'); assert.equal(result.oldImageRestarted, false);
    assert.equal(f.source.State.Running, false); assert.equal(result.lockRetained, true);
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
    if (kind !== 'alias') assert.equal(result.successorIsolationVerified, true);
    else assert.equal(f.calls.some(e => e.phase === 'promotion_start'), false);
    if (kind === 'foreign_name') assert.equal(f.records['e'.repeat(64)].Name, '/shareittoo-staging-api');
  }));
});
test('public readback binds exact gateway paths and rejects redirects/non-200 without provider/auth calls', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url); assert.equal(options.redirect, 'manual'); return { status: 200, json: async () => ({ status: 'ok' }) };
  });
  await promotionGatewayReadback();
  assert.deepEqual(urls, ['https://staging.shareittoo.com/api/version', 'https://staging.shareittoo.com/api/health/ready']);
  t.mock.method(globalThis, 'fetch', async () => ({ status: 302 }));
  await assert.rejects(promotionGatewayReadback(), /gateway_status/u);
});
test('public version/readiness fetches begin concurrently under the same bounded signal', async t => {
  const pending = [], signals = [];
  t.mock.method(globalThis, 'fetch', (_url, options) => { signals.push(options.signal);
    return new Promise(resolve => pending.push(resolve)); });
  const result = promotionGatewayReadback();
  assert.equal(pending.length, 2); assert.equal(signals[0], signals[1]);
  for (const resolve of pending) resolve({ status: 200, json: async () => ({ status: 'ok' }) });
  await result;
});
test('gateway convergence budgets at most 59 seconds work and rejects success past its 60-second deadline', async () => {
  let clock = 0, attempts = 0, pauses = 0;
  await assert.rejects(convergePromotionGateway({ commit: 'expected' }, {
    monotonic: () => clock,
    read: async ({ timeoutMs, signal }) => { assert.equal(timeoutMs, 5000); assert.equal(signal.aborted, false);
      attempts++; clock += timeoutMs; return { version: {}, ready: { status: 'ok' } }; },
    delay: async ms => { assert.equal(ms, 1000); pauses++; clock += ms; },
  }), /promotion_gateway/u);
  assert.equal(attempts, 10); assert.equal(pauses, 9); assert.equal(clock, 59000);
  clock = 0; attempts = 0;
  await assert.rejects(convergePromotionGateway({ commit: 'expected' }, {
    monotonic: () => clock,
    read: async () => { attempts++; clock = 60001; return { version: { commit: 'expected' }, ready: { status: 'ok' } }; },
    delay: async () => assert.fail('no late delay'),
  }), /promotion_gateway/u);
  assert.equal(attempts, 1);
});

test('candidate labels are the exact image-OCI/source-non-OCI/ownership map; missing or foreign labels fail', async t => {
  for (const kind of ['missing_green', 'foreign_green', 'missing_source', 'foreign_label', 'oci']) await t.test(kind, () => scoped(async (f, directory) => {
    const built = canonicalSuccessorSpec(f.source, f.c.image, f.data);
    assert.deepEqual(built.spec.labels, { ...f.c.image.Config.Labels, ...f.source.Config.Labels,
      'com.shareittoo.green.106_106.promotion': f.config.runId });
    const command = f.dependencies.command;
    f.dependencies.command = async e => {
      const out = await command(e);
      if (e.phase === 'promotion_create') {
        const labels = f.records[out].Config.Labels;
        if (kind === 'missing_green') delete labels['com.shareittoo.sit.green'];
        if (kind === 'foreign_green') labels['com.shareittoo.sit.green'] = 'false';
        if (kind === 'missing_source') delete labels['com.shareittoo.sit.green.run_id'];
        if (kind === 'foreign_label') labels['com.shareittoo.sit.green.foreign'] = 'true';
        if (kind === 'oci') labels['org.opencontainers.image.revision'] = '0'.repeat(40);
      }
      return out;
    };
    assert.equal((await runSuccessorPromotion(f.data, f.options, f.dependencies)).status, 'forward_recovery_required');
    assert.ok(!f.calls.some(e => e.phase === 'promotion_start'));
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
  }));
});
test('complete Green inventory rejects foreign/missing containers before create, before rename and after gateway', async t => {
  for (const phase of ['before_create', 'before_rename', 'after_gateway']) for (const kind of ['foreign', 'missing']) {
    await t.test(`${phase} ${kind}`, () => scoped(async (f, directory) => {
      const drift = () => {
        if (kind === 'foreign') f.records['e'.repeat(64)] = { Id: 'e'.repeat(64), Name: '/foreign-green', Config: { Labels: { 'com.shareittoo.sit.green': 'true' } } };
        else delete f.records[f.target.containers[2].id].Config.Labels['com.shareittoo.sit.green'];
      };
      if (phase === 'before_create') drift();
      if (phase === 'before_rename') {
        const command = f.dependencies.command; let readiness = 0;
        f.dependencies.command = async e => { const v = await command(e);
          if (e.phase === 'promotion_readiness' && ++readiness === 2) drift(); return v; };
      }
      if (phase === 'after_gateway') { const read = f.dependencies.publicReadback;
        f.dependencies.publicReadback = async () => { const value = await read(); drift(); return value; }; }
      const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
      assert.equal(result.status, phase === 'before_create' ? 'preflight_rejected' : 'forward_recovery_required');
      if (phase !== 'after_gateway') assert.ok(!f.calls.some(e => e.phase === 'promotion_rename'));
      assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
      if (kind === 'foreign') assert.ok(f.records['e'.repeat(64)]);
    }));
  }
});
test('unvalidated constraint appearing after successful public gateway prevents PASS', async () => scoped(async (f, directory) => {
  let gateway = false; const read = f.dependencies.publicReadback, command = f.dependencies.command;
  f.dependencies.publicReadback = async () => { const v = await read(); gateway = true; return v; };
  f.dependencies.command = e => gateway && e.input === constraintsSql ? '1' : command(e);
  const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
  assert.equal(result.status, 'forward_recovery_required'); assert.equal(result.successorIsolationVerified, true);
  assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
}));
test('readiness failure and foreign membership fail closed; foreign resources remain untouched', async t => {
  for (const kind of ['readiness', 'foreign']) await t.test(kind, () => scoped(async (f, directory) => {
    const original = f.dependencies.command;
    f.dependencies.command = async e => {
      if (kind === 'readiness' && e.phase === 'promotion_readiness') return '{}';
      const v = await original(e);
      if (kind === 'foreign' && e.phase === 'promotion_start') f.records[f.target.networks[0].id].Containers['e'.repeat(64)] = { Name: 'foreign' };
      return v;
    };
    const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'forward_recovery_required'); assert.equal(f.source.State.Running, false);
    assert.equal(result.successorIsolationVerified, kind === 'readiness');
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
    if (kind === 'foreign') assert.ok(f.records[f.target.networks[0].id].Containers['e'.repeat(64)]);
  }));
});

test('protected receipt/backup and pre-create drift leave canonical state untouched', async t => {
  for (const kind of ['receipt', 'backup', 'source', 'network', 'consent']) await t.test(kind, () => scoped(async (f, directory) => {
    if (kind === 'receipt') fs.appendFileSync(path.join(directory, 'synthetic-run.rehearsal.json'), ' ');
    if (kind === 'backup') fs.appendFileSync(path.join(directory, 'synthetic-run.pgdump'), 'changed');
    if (kind === 'source') f.source.HostConfig.GroupAdd.push('555');
    if (kind === 'network') f.records[f.target.networks[0].id].Containers['e'.repeat(64)] = { Name: 'foreign' };
    if (kind === 'consent') f.options.confirmation = 'yes';
    if (kind === 'consent') await assert.rejects(runSuccessorPromotion(f.data, f.options, f.dependencies));
    else assert.equal((await runSuccessorPromotion(f.data, f.options, f.dependencies)).status, 'preflight_rejected');
    assert.equal(f.source.State.Running, false);
    assert.ok(!f.calls.some(e => ['create', 'start', 'stop', 'rename', 'rm'].includes(e.args[0])));
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion-lock.json')));
  }));
});
test('post-start data/schema/identity/group/mount drift never leaves a PASS receipt', async t => {
  for (const kind of ['table', 'readiness', 'watchdog', 'schema', 'identity', 'group', 'mount']) await t.test(kind, () => scoped(async (f, directory) => {
    const original = f.dependencies.command; let started = false;
    f.dependencies.command = async e => {
      if (started && kind === 'schema' && e.input?.includes("'columns'")) return '0'.repeat(64);
      const out = await original(e);
      if (e.phase === 'promotion_start') {
        started = true; const rows = f.states.get(f.dbSource.Id), r = f.records[e.args[1]];
        if (kind === 'table') rows[1].users.count++;
        if (kind === 'readiness') rows[3].paymentRecoveryNeedsReview.push({ changed: true });
        if (kind === 'watchdog') rows[2][0].attempt_count++;
        if (kind === 'identity') r.Config.Labels['com.shareittoo.green.106_106.promotion'] = 'foreign';
        if (kind === 'group') r.HostConfig.GroupAdd.push('555');
        if (kind === 'mount') r.Mounts[0].RW = false;
      }
      return out;
    };
    const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'forward_recovery_required'); assert.equal(result.oldImageRestarted, false);
    assert.equal(result.successorIsolationVerified, !['identity', 'group', 'mount'].includes(kind));
    assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
  }));
});
