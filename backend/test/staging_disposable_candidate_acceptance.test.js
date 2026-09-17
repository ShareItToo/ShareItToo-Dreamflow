import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  disposableCandidateCommit,
  disposableCandidateOpsCommit,
  disposablePostgresImage,
  pollVersion,
  runDisposableCandidateAcceptance,
} from '../ops/staging_disposable_candidate_acceptance.mjs';

test('disposable candidate runner orchestrates isolated restore, candidate checks and cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-disposable-candidate-'));
  try {
    const backupPath = join(root, 'backup.dump');
    const manifestPath = `${backupPath}.sha256`;
    await writeFile(backupPath, 'deterministic-backup');
    await chmod(backupPath, 0o600);
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha256').update('deterministic-backup').digest('hex');
    await writeFile(manifestPath, `${hash}  ${backupPath}\n`, { mode: 0o600 });
    const calls = [];
    let fingerprintReads = 0;
    let driftMode = false;
    const command = async (_command, args, options = {}) => {
      calls.push({ args, phase: options.phase });
      if (options.phase === 'ops_head_read') return '7ccf56ccf7caf335c93c0bd7ed36d0fa2c5bb926';
      if (options.phase === 'candidate_image_identity') return 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620|f0bb868a8a487cbf33ae67a555946fb9c67f4e9f';
      if (options.phase === 'bootstrap_wait') return '0';
      if (options.phase === 'fk_count') return '367';
      if (options.phase?.endsWith('_identity')) return JSON.stringify({
        'com.shareittoo.staging.rehearsal': 'true',
        'com.shareittoo.staging.rehearsal_run_id': (args.find((arg) => /-(\d{14}-[0-9a-f]{8})$/u.test(arg)) ?? '').match(/-(\d{14}-[0-9a-f]{8})$/u)?.[1] ?? 'ignored',
      });
      if (options.phase === 'candidate_port') return '19090';
      if (options.phase === 'ledger') return '87|87|1|87';
      if (options.phase === 'readiness_fingerprint') {
        fingerprintReads += 1;
        return JSON.stringify(driftMode && fingerprintReads === 2
          ? { paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'a'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }], supportNextUpdateOverdue: [] }
          : { paymentRecoveryNeedsReview: [], supportNextUpdateOverdue: [] });
      }
      return '';
    };
    const cleanup = [];
    const fetchImpl = async (url) => {
      if (url.endsWith('/version')) return { ok: true, status: 200, json: async () => ({ commit: disposableCandidateCommit }) };
      if (url.endsWith('/health/live')) return { ok: true, status: 200 };
      return { ok: false, status: 503, json: async () => ({ status: 'degraded', checks: {
        mail: 'disabled', notifications: { dead: 0 },
        payments: { recoveryNeedsReview: 0, failedEvents: 0, unbalanced: 0, recoveryPending: 0 },
        supportDeadlines: { nextUpdateOverdue: 0, stale: false, lastErrorCode: null, p0WithoutOwner: 0, criticalNextUpdateOverdue: 0, privacyDeadlineNear: 0, privacyDeadlineOverdue: 0, privacyIncidentDeadlineNear: 0, privacyIncidentDeadlineOverdue: 0 },
      } }) };
    };
    const result = await runDisposableCandidateAcceptance({
      backupPath,
      manifestPath,
      execute: true,
      confirmation: disposableCandidateCommit,
      opsCommit: disposableCandidateOpsCommit,
      command,
      commandWithFileInput: async (_command, args, _file, options = {}) => { calls.push({ args, phase: options.phase }); },
      removeResource: async (kind, name) => { cleanup.push([kind, name]); return null; },
      prepareMfaKey: async () => ({ filePath: '/tmp/disposable-mfa-test-key', root: '/tmp' }),
      cleanupMfaKey: async () => {},
      fetchImpl,
      evidencePath: join(root, 'evidence.json'),
    });
    assert.equal(result.status, 'technical-probes-passed-operational-release-blocked');
    assert.equal(result.image, 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620');
    assert.equal(result.readiness.http, 503);
    assert.deepEqual(cleanup.map(([kind]) => kind), ['container', 'container', 'container', 'volume', 'network']);
    assert.ok(calls.some(({ phase }) => phase === 'candidate_start'));
    assert.ok(calls.some(({ phase }) => phase === 'mfa_probe'));
    assert.ok(calls.every(({ args }) => !args.includes('shareittoo_staging_backend')));
    const apiCreate = calls.find(({ phase }) => phase === 'candidate_create');
    const dbCreate = calls.find(({ phase }) => phase === 'database_create');
    assert.ok(apiCreate.args.includes('MFA_ENCRYPTION_KEY_FILE=/run/secrets/mfa-encryption-key'));
    assert.ok(!apiCreate.args.some((arg) => arg.startsWith('MFA_ENCRYPTION_KEY=')));
    assert.equal(apiCreate.args.at(-1), 'sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620');
    assert.equal(dbCreate.args.at(-1), disposablePostgresImage);
    const evidenceMode = (await stat(join(root, 'evidence.json'))).mode & 0o777;
    assert.equal(evidenceMode, 0o600);
    fingerprintReads = 0;
    driftMode = true;
    await assert.rejects(
      () => runDisposableCandidateAcceptance({
        backupPath,
        manifestPath,
        execute: true,
        confirmation: disposableCandidateCommit,
        opsCommit: disposableCandidateOpsCommit,
        command,
        commandWithFileInput: async () => {},
        removeResource: async () => null,
        prepareMfaKey: async () => ({ filePath: '/tmp/disposable-mfa-test-key', root: '/tmp' }),
        cleanupMfaKey: async () => {},
        fetchImpl,
        evidencePath: join(root, 'drift-evidence.json'),
      }),
      (error) => error.code === 'readiness_fingerprint_drift',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('candidate version polling is bounded and times out deterministically', async () => {
  await assert.rejects(
    () => pollVersion(async () => null, 'http://127.0.0.1:1/version', { attempts: 2, intervalMs: 0 }),
    (error) => error.code === 'candidate_version_timeout',
  );
});

test('candidate runner fails closed on Ops mismatch and unsafe evidence path before Docker', async () => {
  const command = async (_command, _args, options = {}) => (options.phase === 'ops_head_read' ? disposableCandidateOpsCommit : '');
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: disposableCandidateCommit, opsCommit: '1'.repeat(40), command, evidencePath: '/tmp/unused-evidence.json' }),
    (error) => error.code === 'ops_checkout_commit_mismatch',
  );
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: disposableCandidateCommit, opsCommit: disposableCandidateOpsCommit, command, evidencePath: '/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808/evidence.json' }),
    (error) => error.code === 'evidence_path_inside_repository',
  );
});

test('disposable candidate runner rejects live target and missing owner confirmation before Docker', async () => {
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: 'wrong' }),
    (error) => error.code === 'exact_candidate_confirmation_required',
  );
});
