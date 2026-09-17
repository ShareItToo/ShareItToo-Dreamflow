import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  disposableCandidateCommit,
  disposableCandidateImage,
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
      if (options.phase === 'candidate_image_identity') return `${disposableCandidateCommit}|["shareittoo-api-wp244@sha256:38be66d170746b20bfc4c08c70655a72f9a6ce9eb700278a129d5acdedc22620"]`;
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
      return { ok: false, status: 503, json: async () => ({ status: 'degraded' }) };
    };
    const result = await runDisposableCandidateAcceptance({
      backupPath,
      manifestPath,
      execute: true,
      confirmation: disposableCandidateCommit,
      command,
      commandWithFileInput: async (_command, args, _file, options = {}) => { calls.push({ args, phase: options.phase }); },
      removeResource: async (kind, name) => { cleanup.push([kind, name]); return null; },
      fetchImpl,
      evidencePath: join(root, 'evidence.json'),
    });
    assert.equal(result.status, 'technical-probes-passed-operational-release-blocked');
    assert.equal(result.image, disposableCandidateImage);
    assert.equal(result.readiness.http, 503);
    assert.deepEqual(cleanup.map(([kind]) => kind), ['container', 'container', 'volume', 'network']);
    assert.ok(calls.some(({ phase }) => phase === 'candidate_start'));
    assert.ok(calls.some(({ phase }) => phase === 'mfa_probe'));
    assert.ok(calls.every(({ args }) => !args.includes('shareittoo_staging_backend')));
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
        command,
        commandWithFileInput: async () => {},
        removeResource: async () => null,
        fetchImpl,
        evidencePath: join(root, 'drift-evidence.json'),
      }),
      (error) => error.code === 'readiness_fingerprint_drift',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('disposable candidate runner rejects live target and missing owner confirmation before Docker', async () => {
  await assert.rejects(
    () => runDisposableCandidateAcceptance({ targetCommit: disposableCandidateCommit, execute: true, confirmation: 'wrong' }),
    (error) => error.code === 'exact_candidate_confirmation_required',
  );
});
