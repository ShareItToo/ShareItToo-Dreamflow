#!/usr/bin/env node

import crypto from 'node:crypto';

export const remediationVersion = 'wp251-refund-reference-remediation-v1';

function fail(code) {
  const error = new Error(`Refund reference remediation failed: ${code}`);
  error.code = code;
  throw error;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) fail('rows_invalid');
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || typeof row.payment_id !== 'string' || typeof row.refund_id !== 'string') fail('row_shape_invalid');
    if (row.provider_refund_id != null && !row.provider_refund_id.startsWith('re_memory_')) fail('provider_reference_shape_invalid');
    return {
      payment_hash: hash(row.payment_id),
      refund_hash: hash(row.refund_id),
      provider_reference_class: row.provider_refund_id?.startsWith('re_memory_') ? 'synthetic_memory' : 'missing',
      refund_status: String(row.refund_status ?? ''),
      payment_status: String(row.payment_status ?? ''),
      local_settlement_status: row.local_settlement_status ?? null,
      provider_observation_status: row.provider_observation_status ?? null,
    };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function buildExactSetFingerprint(rows) {
  const normalized = normalizeRows(rows);
  return Object.freeze({
    count: normalized.length,
    hashes: normalized.map((row) => row.refund_hash),
    sha256: hash(JSON.stringify(normalized)),
  });
}

export function classifyRefundReferenceRemediation({ rows, expectedBackupSha256, actualBackupSha256, mode = 'dry-run' } = {}) {
  if (typeof expectedBackupSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedBackupSha256)
      || expectedBackupSha256 !== actualBackupSha256) fail('backup_binding_mismatch');
  if (mode !== 'dry-run') fail('canonical_mutation_forbidden');
  const normalized = normalizeRows(rows);
  const synthetic = normalized.filter((row) => row.provider_reference_class === 'synthetic_memory');
  return Object.freeze({
    decision: synthetic.length > 0 ? 'quarantine-plan-only-no-canonical-mutation' : 'no-action-required',
    mode,
    exactSet: buildExactSetFingerprint(rows),
    syntheticCount: synthetic.length,
    canonicalFinancialTruthPreserved: true,
    providerOutcomeFabricated: false,
    liveDatabaseAllowed: false,
    remediation: synthetic.length > 0
      ? 'record hashed references in a disposable TEMP quarantine table, rollback transaction, drop database; do not update/delete refunds or payment truth'
      : 'no disposable quarantine required',
  });
}

export async function runDisposableRefundReferenceDryRun({ client, rows, expectedBackupSha256, actualBackupSha256 } = {}) {
  if (!client || typeof client.query !== 'function') fail('client_invalid');
  const before = buildExactSetFingerprint(rows);
  const decision = classifyRefundReferenceRemediation({ rows, expectedBackupSha256, actualBackupSha256, mode: 'dry-run' });
  await client.query('BEGIN');
  try {
    await client.query('CREATE TEMP TABLE wp251_refund_reference_quarantine (refund_hash TEXT PRIMARY KEY, reason TEXT NOT NULL) ON COMMIT DROP');
    for (const refundHash of before.hashes) {
      await client.query('INSERT INTO wp251_refund_reference_quarantine (refund_hash, reason) VALUES ($1, $2)', [refundHash, 'synthetic_provider_reference']);
    }
    const quarantined = await client.query('SELECT count(*)::int AS count FROM wp251_refund_reference_quarantine');
    await client.query('ROLLBACK');
    const after = buildExactSetFingerprint(rows);
    if (JSON.stringify(before) !== JSON.stringify(after)) fail('exact_set_drift');
    return Object.freeze({ ...decision, transaction: 'rolled-back', quarantinedCount: Number(quarantined.rows?.[0]?.count ?? 0), before, after });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
