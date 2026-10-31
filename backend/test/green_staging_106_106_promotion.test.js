import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runSuccessorPromotion, validatePromotionReceipt, canonicalSuccessorSpec, promotionGatewayReadback, temporaryPromotionName, convergePromotionGateway } from '../ops/green_staging_106_106_promotion.mjs';
import { promotionFixture } from './fixtures/green_106106_promotion.js';
import { canonicalMounts } from '../ops/green_staging_98_106_promotion.mjs';
import { digest, objectDigest } from '../ops/green_staging_98_106_contract.mjs';
import { constraintsSql } from '../ops/green_staging_106_106_preflight.mjs';
import { runCli } from '../../tool/validate_green_staging_106_106_runtime.mjs';
import { validateSuccessorSource } from '../ops/green_staging_106_106_binding.mjs';
import { assertRecoveryBaseline } from '../ops/green_staging_106_106_database.mjs';

const scoped = async (fn, policies) => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-promotion-')); fs.chmodSync(directory, 0o700);
  try { await fn(await promotionFixture(directory, policies), directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
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
  for (const name of ['promotion-lock.json', 'canonical-started.json', 'promotion.json', 'pgdump', 'rehearsal.json', 'persistence-intent.json']) {
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
  assert.equal(result.schemaVersion, 2); assert.equal(result.canonicalRestartPolicyVerified, true);
  assert.equal(result.hostRebootVerified, false);
  for (const record of [r, f.dbSource]) assert.deepEqual(record.HostConfig.RestartPolicy, { Name: 'unless-stopped', MaximumRetryCount: 0 });
  const updates = f.calls.filter(e => e.phase === 'persistence_update');
  assert.deepEqual(updates.map(e => e.args), [r, f.dbSource].map(c => ['update', '--restart', 'unless-stopped', c.Id]));
  assert.ok(f.routing.findIndex(e => e.phase === 'gateway') < f.routing.findIndex(e => e.phase === 'persistence_update'));
  const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-run.promotion.json')));
  assert.equal(evidence.gatewayReadbackSha256, result.gatewayReadbackSha256);
  assert.ok(!f.calls.some(e => e.args[0] === 'start' && e.args[1] === f.source.Id));
}));
test('promotion accepts only the two Docker-equivalent HostConfig defaults and rejects non-default drift', async t => {
  await t.test('empty Dns/null and null/false OomKillDisable', () => scoped(async f => {
    assert.equal(f.source.HostConfig.Dns.length, 0); assert.equal(f.source.HostConfig.OomKillDisable, null);
    const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'promoted_owner_smoke_pending');
  }, { promotionDockerDefaults: true }));
  for (const [key, value] of [['Dns', ['8.8.8.8']], ['OomKillDisable', true]]) await t.test(`${key} non-default`, () => scoped(async f => {
    const command = f.dependencies.command;
    f.dependencies.command = async e => {
      const result = await command(e);
      if (e.phase === 'promotion_create') f.records[result].HostConfig[key] = value;
      return result;
    };
    assert.equal((await runSuccessorPromotion(f.data, f.options, f.dependencies)).status, 'forward_recovery_required');
    assert.ok(!f.calls.some(e => e.phase === 'promotion_start'));
  }, { promotionDockerDefaults: true }));
});
test('one-shot recovery resumes only the captured stopped create-stage candidate and never creates again', async () => scoped(async f => {
  const command = f.dependencies.command;
  f.dependencies.command = async e => {
    const result = await command(e);
    if (e.phase === 'promotion_create') f.records[result].HostConfig.Dns = ['8.8.8.8'];
    return result;
  };
  const failed = await runSuccessorPromotion(f.data, f.options, f.dependencies);
  assert.equal(failed.status, 'forward_recovery_required'); assert.equal(failed.stage, 'create');
  const id = failed.candidateId, failure = JSON.parse(fs.readFileSync(path.join(f.options.evidenceDirectory, 'synthetic-run.promotion-failure.json')));
  assert.equal(failure.candidateId, id); assert.equal(f.records[id].State.Running, false);
  f.records[id].HostConfig.Dns = null; f.records[id].HostConfig.OomKillDisable = false;
  fs.writeFileSync(path.join(f.options.evidenceDirectory, 'unrelated-protected-audit.json'), '{"retained":true}\n', { mode: 0o600 });
  const lockBytes = fs.readFileSync(path.join(f.options.evidenceDirectory, 'synthetic-run.promotion-lock.json'));
  const failureBytes = fs.readFileSync(path.join(f.options.evidenceDirectory, 'synthetic-run.promotion-failure.json'));
  const promotionLockSha256 = digest(lockBytes), promotionFailureSha256 = digest(failureBytes);
  const progressed = f.states.get(f.dbSource.Id)[2][0], advancedTime = new Date(Date.parse(f.receipt.source.watchdog.updated_at) + 3000).toISOString();
  progressed.last_started_at = progressed.last_succeeded_at = progressed.updated_at = advancedTime;
  progressed.attempt_count += 3; progressed.success_count += 3;
  f.calls.length = 0;
  f.dependencies.command = command;
  f.dependencies.now = () => Date.now() + 3600001;
  const recoveryOpsCommit = 'a'.repeat(40); f.dependencies.currentOpsCommit = recoveryOpsCommit;
  const sourceGit = f.dependencies.sourceOptions?.git;
  let corruptRecoverySource = false;
  f.dependencies.sourceOptions = { git: (args, root) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return recoveryOpsCommit;
    if (args[0] === 'show' && args[1].startsWith(`${recoveryOpsCommit}:`)) {
      const relative = args[1].slice(41), bytes = fs.readFileSync(path.join(root, relative));
      return corruptRecoverySource && relative.endsWith('green_staging_106_106_promotion.mjs')
        ? Buffer.concat([bytes, Buffer.from('\n// drift')]) : bytes;
    }
    return sourceGit(args, root);
  } };
  assert.equal(validateSuccessorSource(f.data.binding, { git: f.dependencies.sourceOptions.git, recoveryOpsCommit }), f.data.binding.opsCommit);
  corruptRecoverySource = true;
  assert.throws(() => validateSuccessorSource(f.data.binding, { git: f.dependencies.sourceOptions.git, recoveryOpsCommit }), /recovery_source_bytes/u);
  corruptRecoverySource = false;
  const recoveryOptions = { execute: true, evidenceDirectory: f.options.evidenceDirectory, rehearsalSha256: f.options.rehearsalSha256,
    recoverCandidateId: id, recoveryOpsCommit, promotionLockSha256, promotionFailureSha256,
    confirmation: `recover:${f.data.binding.runtimeCommit}:${f.data.binding.opsCommit}:${recoveryOpsCommit}:${f.options.rehearsalSha256}:${id}:${promotionLockSha256}:${promotionFailureSha256}` };
  const directory = f.options.evidenceDirectory, protectedFile = (name, value) => {
    const filename = path.join(directory, name), bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value)}\n`);
    fs.writeFileSync(filename, bytes, { mode: 0o600 }); return { filename, sha256: digest(bytes) };
  };
  const bindingFile = protectedFile('recovery-binding.json', f.data.binding);
  const publicationFile = protectedFile('recovery-publication.json', f.data.publicationBytes);
  const targetFile = protectedFile('recovery-target.json', f.data.target);
  const configFile = protectedFile('recovery-config.json', f.data.config);
  const manifestFile = protectedFile('recovery-manifest.json', f.data.manifest);
  const output = [], errors = [];
  const argv = ['--mode', 'recover', '--binding', bindingFile.filename, '--binding-sha256', bindingFile.sha256,
    '--publication', publicationFile.filename, '--publication-sha256', publicationFile.sha256,
    '--target', targetFile.filename, '--target-sha256', targetFile.sha256,
    '--execution-config', configFile.filename, '--execution-config-sha256', configFile.sha256,
    '--runtime-manifest', manifestFile.filename, '--runtime-manifest-sha256', manifestFile.sha256,
    '--rehearsal', path.join(directory, 'synthetic-run.rehearsal.json'), '--rehearsal-sha256', f.options.rehearsalSha256,
    '--evidence-directory', directory, '--candidate-id', id, '--recovery-ops-commit', recoveryOpsCommit,
    '--promotion-lock-sha256', promotionLockSha256, '--promotion-failure-sha256', promotionFailureSha256,
    '--confirm', recoveryOptions.confirmation];
  const exitCode = await runCli(argv, { dependencies: f.dependencies, stdout: { write: s => output.push(s) }, stderr: { write: s => errors.push(s) } });
  assert.equal(exitCode, 0, `${errors.join('')}${output.join('')}`);
  const result = JSON.parse(output.join(''));
  assert.equal(result.status, 'promoted_owner_smoke_pending', JSON.stringify(result)); assert.equal(result.candidateId, id);
  assert.equal(f.calls.filter(e => e.phase === 'promotion_create').length, 0);
  assert.equal(f.calls.filter(e => e.phase === 'promotion_start').length, 1);
  assert.equal(f.source.State.Running, false);
  assert.equal(result.recoveryOpsCommit, recoveryOpsCommit); assert.equal(result.promotionFailureSha256, promotionFailureSha256);
  assert.equal(fs.existsSync(path.join(f.options.evidenceDirectory, 'unrelated-protected-audit.json')), true);
}, { promotionDockerDefaults: true }));
test('recovery rejects current-ops-commit mismatch before any command', async () => scoped(async f => {
  f.dependencies.currentOpsCommit = 'a'.repeat(40);
  const id = 'b'.repeat(64), ops = 'b'.repeat(40);
  const options = { execute: true, evidenceDirectory: f.options.evidenceDirectory, rehearsalSha256: f.options.rehearsalSha256,
    recoverCandidateId: id, recoveryOpsCommit: ops, promotionLockSha256: 'c'.repeat(64), promotionFailureSha256: 'd'.repeat(64),
    confirmation: `recover:${f.data.binding.runtimeCommit}:${f.data.binding.opsCommit}:${ops}:${f.options.rehearsalSha256}:${id}:${'c'.repeat(64)}:${'d'.repeat(64)}` };
  await assert.rejects(runSuccessorPromotion(f.data, options, f.dependencies), /promotion_recovery_ops_commit/u);
  assert.equal(f.calls.length, 0);
}));
test('recovery rejects non-watchdog drift and unhealthy or mismatched watchdog progress before attach/start', async t => {
  for (const kind of ['business', 'readiness', 'ledger', 'failure_error', 'alert', 'count_delta', 'inspected', 'future']) {
    await t.test(kind, () => scoped(async f => {
      const command = f.dependencies.command;
      f.dependencies.command = async e => {
        const result = await command(e);
        if (e.phase === 'promotion_create') f.records[result].HostConfig.Dns = ['8.8.8.8'];
        return result;
      };
      const failed = await runSuccessorPromotion(f.data, f.options, f.dependencies), id = failed.candidateId;
      assert.equal(failed.status, 'forward_recovery_required'); f.records[id].HostConfig.Dns = null; f.records[id].HostConfig.OomKillDisable = false;
      const rows = f.states.get(f.dbSource.Id), w = rows[2][0], prior = f.receipt.source.watchdog;
      if (kind === 'business') rows[1].users.count++;
      if (kind === 'readiness') rows[3].paymentRecoveryNeedsReview.push({ source: 'dispute', id_hash: 'a'.repeat(64), cause: 'payout_failed', status: 'pending', time_class: 'derived' });
      if (kind === 'ledger') rows[0][0].checksum = 'b'.repeat(64);
      if (kind === 'failure_error') { w.attempt_count++; w.last_error_code = 'synthetic_failure'; w.last_failed_at = new Date(Date.parse(prior.updated_at) + 1000).toISOString(); w.updated_at = w.last_failed_at; }
      if (kind === 'alert') { w.last_alert_count++; w.updated_at = new Date(Date.parse(prior.updated_at) + 1000).toISOString(); }
      if (kind === 'count_delta') w.attempt_count++;
      if (kind === 'inspected') w.last_inspected_count++;
      if (kind === 'future') w.last_started_at = w.last_succeeded_at = w.updated_at = '2099-01-01T00:00:00.000Z';
      const lockSha = digest(fs.readFileSync(path.join(f.options.evidenceDirectory, 'synthetic-run.promotion-lock.json')));
      const failureSha = digest(fs.readFileSync(path.join(f.options.evidenceDirectory, 'synthetic-run.promotion-failure.json')));
      const recoveryOpsCommit = 'a'.repeat(40); f.dependencies.currentOpsCommit = recoveryOpsCommit;
      const sourceGit = f.dependencies.sourceOptions.git;
      f.dependencies.sourceOptions = { git: (args, root) => {
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return recoveryOpsCommit;
        if (args[0] === 'show' && args[1].startsWith(`${recoveryOpsCommit}:`)) return fs.readFileSync(path.join(root, args[1].slice(41)));
        return sourceGit(args, root);
      } };
      const options = { execute: true, evidenceDirectory: f.options.evidenceDirectory, rehearsalSha256: f.options.rehearsalSha256,
        recoverCandidateId: id, recoveryOpsCommit, promotionLockSha256: lockSha, promotionFailureSha256: failureSha,
        confirmation: `recover:${f.data.binding.runtimeCommit}:${f.data.binding.opsCommit}:${recoveryOpsCommit}:${f.options.rehearsalSha256}:${id}:${lockSha}:${failureSha}` };
      const result = await runSuccessorPromotion(f.data, options, f.dependencies);
      assert.equal(result.status, 'forward_recovery_required');
      assert.ok(!f.calls.some(e => ['promotion_attach', 'promotion_start'].includes(e.phase)));
    }, { promotionDockerDefaults: true }));
  }
});
test('persistent source and database support repeat rehearsal/promotion without weakening disposable policies', async () => scoped(async f => {
  assert.equal(f.source.State.Running, false); assert.equal(f.source.HostConfig.RestartPolicy.Name, 'unless-stopped');
  const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
  assert.equal(result.status, 'promoted_owner_smoke_pending');
  assert.deepEqual(f.calls.filter(e => e.phase === 'persistence_update').map(e => e.args.at(-1)), [result.candidateId]);
  assert.equal(f.dbSource.HostConfig.RestartPolicy.Name, 'unless-stopped');
  assert.equal(f.source.State.Running, false);
}, { restartPolicy: 'unless-stopped', databaseRestartPolicy: 'unless-stopped' }));
test('persistence before-effect and lost-reply failures restore exact prior policies and isolate successor without replay', async t => {
  for (const target of ['api', 'database']) for (const afterEffect of [false, true]) await t.test(`${target} afterEffect=${afterEffect}`, () => scoped(async (f, directory) => {
    const command = f.dependencies.command; let updates = 0;
    f.dependencies.command = async e => {
      if (e.phase === 'persistence_update' && ++updates === (target === 'api' ? 1 : 2)) {
        if (afterEffect) await command(e); else f.calls.push(e);
        throw Error('synthetic persistence failure');
      }
      return command(e);
    };
    const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
    assert.equal(result.status, 'forward_recovery_required'); assert.equal(result.stage, 'persistence');
    assert.equal(result.persistenceRollbackVerified, true); assert.equal(result.successorIsolationVerified, true);
    assert.equal(f.records[result.candidateId].State.Running, false); assert.equal(f.dbSource.State.Running, true);
    for (const r of [f.records[result.candidateId], f.dbSource]) assert.equal(r.HostConfig.RestartPolicy.Name, 'no');
    assert.equal(f.source.State.Running, false); assert.ok(!fs.existsSync(path.join(directory, 'synthetic-run.promotion.json')));
    assert.equal(f.calls.filter(e => e.phase === 'persistence_update').length, target === 'api' ? 1 : 2);
  }));
});
test('failed policy rollback stays explicit while exact successor is stopped', async () => scoped(async f => {
  const command = f.dependencies.command; let updates = 0;
  f.dependencies.command = async e => {
    if (e.phase === 'persistence_update' && ++updates === 2) throw Error('database refused');
    if (e.phase === 'persistence_rollback') throw Error('rollback refused');
    return command(e);
  };
  const result = await runSuccessorPromotion(f.data, f.options, f.dependencies);
  assert.equal(result.persistenceRollbackVerified, false); assert.equal(result.successorIsolationVerified, true);
  assert.equal(f.records[result.candidateId].HostConfig.RestartPolicy.Name, 'unless-stopped');
  assert.equal(f.records[result.candidateId].State.Running, false);
}));
test('protected intent binds both prior policies before the first exact-ID update', async () => scoped(async (f, directory) => {
  const command = f.dependencies.command;
  f.dependencies.command = async e => {
    if (e.phase === 'persistence_update') {
      const filename = path.join(directory, 'synthetic-run.persistence-intent.json'), intent = JSON.parse(fs.readFileSync(filename));
      assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
      assert.equal(intent.policy, 'unless-stopped'); assert.equal(intent.rehearsalSha256, f.options.rehearsalSha256);
      assert.equal(intent.containers.length, 2);
      assert.ok(intent.containers.some(c => c.id === e.args.at(-1)));
      for (const c of intent.containers) {
        assert.match(c.configSha256, /^[a-f0-9]{64}$/u);
        assert.deepEqual(c.previousPolicy, { Name: 'no', MaximumRetryCount: 0 });
        assert.equal(c.imageId, f.records[c.id].Image); assert.equal(c.name, f.records[c.id].Name);
      }
    }
    return command(e);
  };
  assert.equal((await runSuccessorPromotion(f.data, f.options, f.dependencies)).status, 'promoted_owner_smoke_pending');
}));
test('receipt rejects wrong commit/hash/snapshot/probes/freshness and payment-mode drift', async () => scoped(async f => {
  for (const mutate of [r => { r.opsCommit = '0'.repeat(40); }, r => { r.backupSha256 = 'bad'; },
    r => { r.cleanupVerified = false; }, r => { r.source.data.business.users.count++; },
    r => { r.probes.identity = 'not_run'; }, r => { r.createdAt = '2020-01-01T00:00:00Z'; },
    r => { r.createdAt = new Date(Date.now() + 100000).toISOString(); }]) {
    const r = structuredClone(f.receipt); mutate(r); assert.throws(() => validatePromotionReceipt(r, f.data, Date.now()));
  }
  assert.doesNotThrow(() => validatePromotionReceipt(f.receipt, f.data, Date.parse(f.receipt.createdAt) + 3600001, { allowExpired: true }));
  const future = structuredClone(f.receipt); future.createdAt = new Date(Date.now() + 60000).toISOString();
  assert.throws(() => validatePromotionReceipt(future, f.data, Date.now(), { allowExpired: true }), /promotion_freshness/u);
  const source = structuredClone(f.source); source.Config.Env = source.Config.Env.map(e => e.startsWith('PAYMENT_TRANSPORT=') ? 'PAYMENT_TRANSPORT=stripe' : e);
  assert.throws(() => canonicalSuccessorSpec(source, f.c.image, f.data), /provider_modes/u);
}));
test('receipt accepts only healthy watchdog progress since the collected database baseline', async () => scoped(async f => {
  const receipt = structuredClone(f.receipt), prior = f.data.target.database.watchdog;
  receipt.source.watchdog.attempt_count = prior.attempt_count + 2;
  receipt.source.watchdog.success_count = prior.success_count + 2;
  receipt.source.watchdog.last_started_at = receipt.source.watchdog.last_succeeded_at = receipt.source.watchdog.updated_at =
    new Date(Date.parse(prior.updated_at) + 1000).toISOString();
  receipt.started = structuredClone(receipt.source);
  receipt.started.watchdog.attempt_count++;
  receipt.started.watchdog.success_count++;
  receipt.started.watchdog.last_started_at = receipt.started.watchdog.last_succeeded_at = receipt.started.watchdog.updated_at =
    new Date(Date.parse(receipt.source.watchdog.updated_at) + 1000).toISOString();
  const now = Math.max(Date.parse(receipt.createdAt), Date.parse(receipt.started.watchdog.updated_at)) + 1000;
  assert.doesNotThrow(() => validatePromotionReceipt(receipt, f.data, now));
  receipt.source.watchdog.last_alert_count = 1;
  assert.throws(() => validatePromotionReceipt(receipt, f.data, now));
}));
test('recovery baseline requires equal historical counters and equal timestamps for healthy progressed ticks', async () => scoped(async f => {
  const prior = structuredClone(f.receipt.source), current = structuredClone(prior);
  current.watchdog.attempt_count++; current.watchdog.success_count++;
  current.watchdog.last_started_at = current.watchdog.last_succeeded_at = current.watchdog.updated_at =
    new Date(Date.parse(prior.watchdog.updated_at) + 1000).toISOString();
  assert.equal(assertRecoveryBaseline(prior, current, Date.parse(current.watchdog.updated_at) + 1000), true);
  current.watchdog.last_succeeded_at = new Date(Date.parse(current.watchdog.updated_at) + 1000).toISOString();
  assert.throws(() => assertRecoveryBaseline(prior, current, Date.parse(current.watchdog.updated_at) + 1000));
  const historicalGap = structuredClone(prior); historicalGap.watchdog.attempt_count++;
  const afterGap = structuredClone(historicalGap); afterGap.watchdog.attempt_count++; afterGap.watchdog.success_count++;
  afterGap.watchdog.last_started_at = afterGap.watchdog.last_succeeded_at = afterGap.watchdog.updated_at =
    new Date(Date.parse(prior.watchdog.updated_at) + 1000).toISOString();
  assert.throws(() => assertRecoveryBaseline(historicalGap, afterGap, Date.parse(afterGap.watchdog.updated_at) + 1000));
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
