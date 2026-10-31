import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  disposableCandidateCommit,
  disposablePostgresImage,
  probeInternalEndpoint,
  buildCandidateRuntimeEnv,
  waitForFinalPostgresReady,
  runDisposableCandidateAcceptance,
} from '../ops/staging_disposable_candidate_acceptance.mjs';

const testOpsCommit = '1'.repeat(40);

test('disposable candidate runner orchestrates isolated restore, candidate checks and cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-disposable-candidate-'));
  try {
    const backupPath = join(root, 'backup.dump');
    const manifestPath = `${backupPath}.sha256`;
    const replacementPath = join(root, 'replacement.dump');
    await writeFile(backupPath, 'deterministic-backup');
    await writeFile(replacementPath, 'unverified-replacement');
    await chmod(backupPath, 0o600);
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update('deterministic-backup').digest('hex');
    await writeFile(manifestPath, `${hash}  ${backupPath}\n`, { mode: 0o600 });
    const calls = [];
    let fingerprintReads = 0;
    let driftMode = false;
    let restoreInput;
    const command = async (_command, args, options = {}) => {
      calls.push({ args, phase: options.phase });
      if (options.phase === 'ops_head_read') return testOpsCommit;
      if (options.phase === 'candidate_image_identity') return 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620|f0bb868a8a487cbf33ae67a555946fb9c67f4e9f';
      if (options.phase === 'bootstrap_wait') return '0';
      if (options.phase === 'fk_count') return '367';
      if (options.phase === 'internal_probe_version') return JSON.stringify({ status: 200, payload: { commit: disposableCandidateCommit } });
      if (options.phase === 'internal_probe_health_live') return JSON.stringify({ status: 200, payload: { status: 'ok' } });
      if (options.phase === 'internal_probe_health_ready') return JSON.stringify({ status: 503, payload: { status: 'degraded', checks: { mail: 'disabled', notifications: { dead: 0 }, database: 'ok', payments: { recoveryNeedsReview: 2, failedEvents: 0, unbalanced: 0, recoveryPending: 0 }, supportDeadlines: { status: 'degraded', nextUpdateOverdue: 1, stale: false, lastErrorCode: null, p0WithoutOwner: 0, criticalNextUpdateOverdue: 0, privacyDeadlineNear: 0, privacyDeadlineOverdue: 0, privacyIncidentDeadlineNear: 0, privacyIncidentDeadlineOverdue: 0 } } } });
      if (options.phase?.endsWith('_identity') || options.phase === 'cleanup_identity') return JSON.stringify({
        'com.shareittoo.staging.rehearsal': 'true',
        'com.shareittoo.staging.rehearsal_run_id': (args.find((arg) => /-(\d{14}-[0-9a-f]{8})$/u.test(arg)) ?? '').match(/-(\d{14}-[0-9a-f]{8})$/u)?.[1] ?? 'ignored',
      });
      if (options.phase === 'candidate_port') return '19090';
      if (options.phase === 'ledger') return '91|91|1|91';
      if (options.phase === 'readiness_fingerprint') {
        fingerprintReads += 1;
        return JSON.stringify(driftMode && fingerprintReads === 2
          ? { paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'c'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }, { source: 'dispute', id_hash: 'd'.repeat(64), cause: 'transfer_recovery_needs_review', status: 'open', time_class: '1-24h' }], supportNextUpdateOverdue: [{ id_hash: 'e'.repeat(64), cause: 'next_update_overdue', status: 'open', priority: 'p1', time_class: '<1h' }] }
          : { paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'a'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }, { source: 'dispute', id_hash: 'b'.repeat(64), cause: 'transfer_recovery_needs_review', status: 'open', time_class: '1-24h' }], supportNextUpdateOverdue: [{ id_hash: 'e'.repeat(64), cause: 'next_update_overdue', status: 'open', priority: 'p1', time_class: '<1h' }] });
      }
      return '';
    };
    const cleanup = [];
    const fetchImpl = async (url) => {
      if (url.endsWith('/version')) return { ok: true, status: 200, json: async () => ({ commit: disposableCandidateCommit }) };
      if (url.endsWith('/health/live')) return { ok: true, status: 200 };
      return { ok: false, status: 503, json: async () => ({ status: 'degraded', checks: {
        mail: 'disabled', notifications: { dead: 0 },
        database: 'ok',
        payments: { recoveryNeedsReview: 2, failedEvents: 0, unbalanced: 0, recoveryPending: 0 },
        supportDeadlines: { status: 'degraded', nextUpdateOverdue: 1, stale: false, lastErrorCode: null, p0WithoutOwner: 0, criticalNextUpdateOverdue: 0, privacyDeadlineNear: 0, privacyDeadlineOverdue: 0, privacyIncidentDeadlineNear: 0, privacyIncidentDeadlineOverdue: 0 },
      } }) };
    };
    const result = await runDisposableCandidateAcceptance({
      backupPath,
      manifestPath,
      execute: true,
      confirmation: disposableCandidateCommit,
      opsCommit: testOpsCommit,
      command,
      commandWithFileInput: async (_command, args, file, options = {}) => {
        calls.push({ args, phase: options.phase });
        if (options.phase === 'restore') {
          restoreInput = file;
          await rm(backupPath);
          await symlink(replacementPath, backupPath);
        }
      },
      removeResource: async (kind, name) => { cleanup.push([kind, name]); return null; },
      prepareMfaKey: async () => ({ filePath: '/tmp/disposable-mfa-test-key', root: '/tmp' }),
      cleanupMfaKey: async () => {},
      waitForPostgres: async () => { calls.push({ args: [], phase: 'final_init_gate' }); },
      fetchImpl,
      evidencePath: join(root, 'evidence.json'),
    });
    assert.equal(result.status, 'technical-probes-passed-operational-release-blocked');
    assert.equal(result.image, 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620');
    assert.equal(result.opsCommit, testOpsCommit);
    assert.equal(result.acceptanceTarget, 'docker-exec-internal');
    assert.equal(result.hostPortPublished, false);
    assert.equal(result.readiness.http, 503);
    assert.deepEqual(restoreInput, Buffer.from('deterministic-backup'));
    assert.deepEqual(result.backup, {
      bytes: Buffer.byteLength('deterministic-backup'),
      sha256: hash,
    });
    assert.doesNotMatch(JSON.stringify(result), /deterministic-backup/u);
    assert.deepEqual(cleanup.map(([kind]) => kind), ['container', 'container', 'container', 'volume', 'network']);
    assert.ok(calls.some(({ phase }) => phase === 'candidate_start'));
    assert.ok(calls.some(({ phase }) => phase === 'mfa_probe'));
    assert.ok(calls.some(({ phase }) => phase === 'internal_probe_version'));
    assert.ok(calls.some(({ phase }) => phase === 'internal_probe_health_live'));
    assert.ok(calls.some(({ phase }) => phase === 'internal_probe_health_ready'));
    assert.ok(calls.every(({ args }) => !args.includes('shareittoo_staging_backend')));
    const apiCreate = calls.find(({ phase }) => phase === 'candidate_create');
    const dbCreate = calls.find(({ phase }) => phase === 'database_create');
    const bootstrapCreate = calls.find(({ phase }) => phase === 'bootstrap_create');
    assert.ok(apiCreate.args.includes('MFA_ENCRYPTION_KEY_FILE=/run/secrets/mfa-encryption-key'));
    assert.ok(apiCreate.args.includes('--group-add'));
    assert.ok(apiCreate.args.includes('65532'));
    assert.ok(!apiCreate.args.some((arg) => arg.startsWith('MFA_ENCRYPTION_KEY=')));
    assert.ok(!apiCreate.args.includes('-p'));
    assert.equal(apiCreate.args.at(-1), 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620');
    assert.equal(dbCreate.args.at(-1), disposablePostgresImage);
    const envValues = (call) => call.args.filter((arg) => arg.startsWith('DATABASE_URL=') || arg.startsWith('JWT_SECRET=') || arg.startsWith('MFA_ENCRYPTION_KEY_FILE=') || arg.startsWith('PAYMENT_TRANSPORT=') || arg.startsWith('DEPLOYMENT_ENVIRONMENT=')).sort();
    assert.deepEqual(envValues(apiCreate), envValues(bootstrapCreate));
    assert.ok(bootstrapCreate.args.includes('--group-add') && bootstrapCreate.args.includes('65532'));
    const evidenceMode = (await stat(join(root, 'evidence.json'))).mode & 0o777;
    assert.equal(evidenceMode, 0o600);
    await rm(backupPath);
    await writeFile(backupPath, 'deterministic-backup');
    await chmod(backupPath, 0o600);
    fingerprintReads = 0;
    driftMode = true;
    await assert.rejects(
      () => runDisposableCandidateAcceptance({
        backupPath,
        manifestPath,
        execute: true,
        confirmation: disposableCandidateCommit,
        opsCommit: testOpsCommit,
        command,
        commandWithFileInput: async () => {},
        removeResource: async () => null,
        prepareMfaKey: async () => ({ filePath: '/tmp/disposable-mfa-test-key', root: '/tmp' }),
        cleanupMfaKey: async () => {},
        waitForPostgres: async () => {},
        fetchImpl,
        evidencePath: join(root, 'drift-evidence.json'),
      }),
      (error) => error.code === 'readiness_fingerprint_drift',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('candidate runtime env contract is shared and rejects short JWT secrets', () => {
  const runtime = buildCandidateRuntimeEnv({ databasePassword: 'db', mfaPath: '/tmp/key', targetCommit: 'a'.repeat(40), api: true });
  assert.equal(runtime.env.DEPLOYMENT_ENVIRONMENT, 'staging');
  assert.equal(runtime.env.MFA_ENCRYPTION_KEY_FILE, '/run/secrets/mfa-encryption-key');
  assert.equal(runtime.groupAdd, '65532');
  assert.throws(() => buildCandidateRuntimeEnv({ databasePassword: 'db', mfaPath: '/tmp/key', targetCommit: 'a'.repeat(40), jwtSecret: 'short' }), /candidate_runtime_env_invalid/u);
});

test('fresh PostgreSQL readiness requires init marker and two stable SQL successes before restore', async () => {
  const events = [];
  let logReads = 0;
  let sqlReads = 0;
  const command = async (_command, args, options = {}) => {
    events.push(options.phase);
    if (options.phase === 'database_init_logs') {
      logReads += 1;
      return logReads < 3
        ? { stdout: 'database system is ready to accept connections', stderr: '' }
        : { stdout: '', stderr: 'PostgreSQL init process complete; ready for start up.' };
    }
    if (options.phase === 'database_stable_sql') {
      sqlReads += 1;
      if (sqlReads === 1) throw new Error('temporary restart');
      return '1';
    }
    return '';
  };
  assert.equal(await waitForFinalPostgresReady({ command, container: 'sit-staging-rehearsal-pg-test', attempts: 6, intervalMs: 0 }), true);
  assert.deepEqual(events.slice(0, 5), ['database_init_logs', 'database_init_logs', 'database_init_logs', 'database_stable_sql', 'database_init_logs']);
  assert.equal(sqlReads, 3);
  await assert.rejects(
    () => waitForFinalPostgresReady({ command: async () => '', container: 'pg', attempts: 1, intervalMs: 0 }),
    (error) => error.code === 'database_final_init_timeout',
  );
});

test('internal endpoint polling is bounded and times out deterministically', async () => {
  await assert.rejects(
    () => probeInternalEndpoint(async () => '', { container: 'api', path: '/version', expectedStatus: 200, attempts: 2, intervalMs: 0 }),
    (error) => error.code === 'internal_probe_version_timeout',
  );
});

test('candidate runner fails closed on Ops mismatch and unsafe evidence path before Docker', async () => {
  const command = async (_command, _args, options = {}) => (options.phase === 'ops_head_read' ? testOpsCommit : '');
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: disposableCandidateCommit, opsCommit: '2'.repeat(40), command, evidencePath: '/tmp/unused-evidence.json' }),
    (error) => error.code === 'ops_checkout_commit_mismatch',
  );
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: disposableCandidateCommit, opsCommit: testOpsCommit, command, evidencePath: join(process.cwd(), 'evidence.json') }),
    (error) => error.code === 'evidence_path_inside_repository',
  );
});

test('disposable candidate runner rejects live target and missing owner confirmation before Docker', async () => {
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: 'wrong' }),
    (error) => error.code === 'exact_candidate_confirmation_required',
  );
});
