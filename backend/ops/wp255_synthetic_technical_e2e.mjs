#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

function fail(code) {
  const error = new Error(`WP255 synthetic technical E2E failed: ${code}`);
  error.code = code;
  throw error;
}

function fullSha(value, name) {
  if (!/^[0-9a-f]{40}$/u.test(value ?? '')) fail(`${name}_must_be_full_sha`);
  return value;
}

export function assertSyntheticCloneTarget({
  targetKind,
  targetName,
  expectedRunId,
  expectedSourceCommit,
  actualSourceCommit,
  expectedSchemaDigest,
  actualSchemaDigest,
} = {}) {
  if (targetKind !== 'clone') fail('target_kind_not_clone');
  if (typeof expectedRunId !== 'string' || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(expectedRunId)) {
    fail('run_id_invalid');
  }
  if (targetName !== `sit-synthetic-clone-${expectedRunId}`) fail('target_name_mismatch');
  fullSha(expectedSourceCommit, 'expected_source_commit');
  fullSha(actualSourceCommit, 'actual_source_commit');
  if (expectedSourceCommit !== actualSourceCommit) fail('runtime_source_drift');
  if (typeof expectedSchemaDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedSchemaDigest)) {
    fail('expected_schema_digest_invalid');
  }
  if (typeof actualSchemaDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(actualSchemaDigest)) {
    fail('actual_schema_digest_invalid');
  }
  if (expectedSchemaDigest !== actualSchemaDigest) fail('schema_drift');
  return Object.freeze({ targetKind, targetName, runId: expectedRunId, sourceCommit: actualSourceCommit, schemaDigest: actualSchemaDigest });
}

export function assertCloneCleanupTarget({ resourceKind, resourceName, runId, protectedNames = [] } = {}) {
  if (!['container', 'network', 'volume', 'secret', 'job'].includes(resourceKind)) fail('cleanup_resource_kind_invalid');
  if (typeof runId !== 'string' || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(runId)) fail('cleanup_run_id_invalid');
  if (typeof resourceName !== 'string' || resourceName.length === 0) fail('cleanup_resource_name_invalid');
  const expectedPrefix = `sit-synthetic-clone-${runId}-`;
  if (!resourceName.startsWith(expectedPrefix)) fail('cleanup_target_not_clone');
  if (protectedNames.some((name) => name === resourceName || resourceName.startsWith(`${name}-`))) {
    fail('cleanup_protected_resource');
  }
  if (/(?:prod|production|staging|green|shareittoo[-_](?:staging|postgres|api))/iu.test(resourceName)) {
    fail('cleanup_target_name_unsafe');
  }
  return true;
}

export function assertCloneFixtureMarker(fixture) {
  if (!fixture || fixture.syntheticTestOnly !== true || fixture.releaseEligible !== false
      || fixture.contractEligible !== false || typeof fixture.datasetId !== 'string'
      || !/^wp255-green-clone-[a-z0-9-]+$/u.test(fixture.datasetId)) {
    fail('fixture_marker_invalid');
  }
  return true;
}

export function sha256Text(value) {
  if (typeof value !== 'string') fail('hash_input_invalid');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const legalParts = Object.freeze([
  ['A', 'platform_terms', 'part_a_platform_terms.html'],
  ['B', 'private_rental_terms', 'part_b_private_rental_terms.html'],
  ['C', 'cancellation_refund', 'part_c_cancellation_refund.html'],
  ['D', 'handover_return_damage', 'part_d_handover_return_damage.html'],
  ['E', 'payment_payout', 'part_e_payment_payout.html'],
  ['F', 'community_safety', 'part_f_community_safety.html'],
  ['G', 'reporting_moderation_review', 'part_g_reporting_moderation_review.html'],
  ['H', 'privacy', 'part_h_privacy.html'],
  ['I', 'imprint_withdrawal_shorttexts', 'part_i_imprint_withdrawal_shorttexts.html'],
]);

export function assertSyntheticLegalSeedEnvironment({ env = process.env } = {}) {
  if (env.SIT_SYNTHETIC_LEGAL_SEED !== '1') fail('synthetic_legal_seed_flag_required');
  if (env.DEPLOYMENT_ENVIRONMENT !== 'test') fail('synthetic_legal_seed_test_environment_required');
  if (typeof env.SIT_SYNTHETIC_DATASET_ID !== 'string'
      || !/^wp255-green-clone-[a-z0-9-]+$/u.test(env.SIT_SYNTHETIC_DATASET_ID)) {
    fail('synthetic_legal_seed_dataset_invalid');
  }
  if (typeof env.SIT_SYNTHETIC_CLONE_RUN_ID !== 'string'
      || !/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(env.SIT_SYNTHETIC_CLONE_RUN_ID)) {
    fail('synthetic_legal_seed_run_invalid');
  }
  return true;
}

export function syntheticLegalContent({ content, datasetId, runId, part }) {
  if (typeof content !== 'string' || content.length === 0) fail('synthetic_legal_content_empty');
  if (!/^[A-I]$/u.test(part)) fail('synthetic_legal_part_invalid');
  const marker = `<!-- SYNTHETIC_TEST_ONLY / NOT_FOR_CONTRACT_OR_RELEASE; dataset=${datasetId}; run=${runId}; part=${part} -->`;
  return `${marker}\n${content}`;
}

export async function seedSyntheticLegalSnapshots({
  databaseUrl = process.env.DATABASE_URL,
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  env = process.env,
  PoolClass = Pool,
  effectiveAt = '2099-01-01T00:00:00.000Z',
} = {}) {
  assertSyntheticLegalSeedEnvironment({ env });
  if (typeof databaseUrl !== 'string' || !databaseUrl.includes('shareittoo_clone')) fail('synthetic_legal_seed_database_invalid');
  if (!Number.isFinite(Date.parse(effectiveAt)) || new Date(effectiveAt) <= new Date()) fail('synthetic_legal_seed_effective_at_must_be_future');
  const manifestPath = resolve(repositoryRoot, 'assets/legal/de/legal_manifest_v52.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 'V5.2-2026-08-16' || manifest.status !== 'draft-blocked'
      || manifest.activationAllowed !== false || manifest.productionProvisioningAllowed !== false) {
    fail('synthetic_legal_seed_manifest_not_draft_blocked');
  }
  const pool = new PoolClass({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT count(*)::int AS count FROM legal_document_snapshots
       WHERE document_version = $1 AND locale = 'de'`,
      ['V5.2-2026-08-16'],
    );
    if (existing.rows[0].count !== 0) fail('synthetic_legal_seed_existing_rows');
    await client.query('BEGIN');
    const inserted = [];
    for (const [part, key, filename] of legalParts) {
      const original = await readFile(resolve(repositoryRoot, 'assets/legal/de/v52', filename), 'utf8');
      const content = syntheticLegalContent({ content: original, datasetId: env.SIT_SYNTHETIC_DATASET_ID, runId: env.SIT_SYNTHETIC_CLONE_RUN_ID, part });
      const contentSha256 = sha256Text(content);
      const id = `${contentSha256.slice(0, 8)}-${contentSha256.slice(8, 12)}-4${contentSha256.slice(13, 16)}-8${contentSha256.slice(17, 20)}-${contentSha256.slice(20, 32)}`;
      await client.query(
        `INSERT INTO legal_document_snapshots
           (id, document_key, document_version, locale, content_type, content_text, content_sha256, effective_at)
         VALUES ($1, $2, 'V5.2-2026-08-16', 'de', 'text/html', $3, $4, $5)`,
        [id, key, content, contentSha256, effectiveAt],
      );
      inserted.push({ part, key, id, contentSha256, effectiveAt, marker: 'SYNTHETIC_TEST_ONLY / NOT_FOR_CONTRACT_OR_RELEASE' });
    }
    await client.query('COMMIT');
    return Object.freeze({ datasetId: env.SIT_SYNTHETIC_DATASET_ID, runId: env.SIT_SYNTHETIC_CLONE_RUN_ID, version: 'V5.2-2026-08-16', inserted: Object.freeze(inserted) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
