import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExactSetFingerprint, classifyRefundReferenceRemediation, runDisposableRefundReferenceDryRun } from '../ops/staging_refund_reference_remediation.mjs';

const backup = '0fb025cad33f9ca9642603e0239103d85368996456af540de3d394c2bd64e193';
const rows = [
  { payment_id: 'p1', refund_id: 'r1', provider_refund_id: 're_memory_a', refund_status: 'succeeded', payment_status: 'refunded' },
  { payment_id: 'p1', refund_id: 'r2', provider_refund_id: 're_memory_b', refund_status: 'succeeded', payment_status: 'refunded' },
];

test('synthetic references produce quarantine-plan-only decision and preserve truth', () => {
  const result = classifyRefundReferenceRemediation({ rows, expectedBackupSha256: backup, actualBackupSha256: backup });
  assert.equal(result.decision, 'quarantine-plan-only-no-canonical-mutation');
  assert.equal(result.syntheticCount, 2);
  assert.equal(result.canonicalFinancialTruthPreserved, true);
  assert.equal(result.providerOutcomeFabricated, false);
  assert.throws(() => classifyRefundReferenceRemediation({ rows, expectedBackupSha256: backup, actualBackupSha256: backup, mode: 'apply' }), /canonical_mutation_forbidden/u);
});

test('dry-run transaction rolls back temp quarantine and exact set remains identical', async () => {
  const calls = [];
  const client = { async query(sql, params) { calls.push({ sql, params }); if (sql.startsWith('SELECT count')) return { rows: [{ count: 2 }] }; return { rows: [] }; } };
  const result = await runDisposableRefundReferenceDryRun({ client, rows, expectedBackupSha256: backup, actualBackupSha256: backup });
  assert.equal(result.transaction, 'rolled-back');
  assert.equal(result.quarantinedCount, 2);
  assert.deepEqual(result.before, result.after);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.ok(calls.every((call) => !/\b(?:UPDATE|DELETE|TRUNCATE)\b/iu.test(call.sql)));
});

test('backup binding and exact-set fingerprints fail closed', () => {
  assert.throws(() => classifyRefundReferenceRemediation({ rows, expectedBackupSha256: backup, actualBackupSha256: 'a'.repeat(64) }), /backup_binding_mismatch/u);
  assert.equal(buildExactSetFingerprint(rows).sha256, buildExactSetFingerprint([...rows].reverse()).sha256);
});
