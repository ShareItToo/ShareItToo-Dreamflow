#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const documentKeyByType = Object.freeze({
  platform_terms: 'platform_terms',
  private_rental_terms: 'private_rental_terms',
  cancellation: 'cancellation',
  community_moderation: 'community_moderation',
  privacy: 'privacy',
  imprint: 'imprint',
  withdrawal: 'withdrawal',
});

function fail(message) {
  throw new Error(message);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function loadProvisioningBundle({ repositoryRoot, manifestPath }) {
  const path = manifestPath ?? resolve(repositoryRoot, 'assets/legal/de/legal_manifest_v5.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.version !== 'V5.1-2026-08-16') {
    fail('v51_legal_manifest_invalid');
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length !== 7) {
    fail('v51_legal_documents_incomplete');
  }
  const documents = manifest.documents.map((entry) => {
    const documentKey = documentKeyByType[entry.type];
    if (!documentKey || typeof entry.path !== 'string') {
      fail('v51_legal_document_entry_invalid');
    }
    const absolute = resolve(repositoryRoot, entry.path);
    if (!absolute.startsWith(`${resolve(repositoryRoot)}/`)) {
      fail('v51_legal_document_path_invalid');
    }
    const content = readFileSync(absolute, 'utf8');
    if (hash(content) !== entry.sha256) fail('v51_legal_document_hash_mismatch');
    return Object.freeze({
      documentKey,
      version: entry.version,
      locale: 'de',
      contentType: 'text/html',
      content,
      contentSha256: entry.sha256,
    });
  });
  const ready = manifest.status === 'approved'
    && manifest.activationAllowed === true
    && manifest.productionProvisioningAllowed === true
    && typeof manifest.effectiveDate === 'string'
    && Number.isFinite(Date.parse(manifest.effectiveDate))
    && Array.isArray(manifest.openFacts)
    && manifest.openFacts.length === 0
    && manifest.boundaries?.containsLivePlaceholders === false;
  return Object.freeze({ manifest, documents: Object.freeze(documents), ready });
}

export async function provisionV51LegalSnapshots({
  repositoryRoot,
  manifestPath,
  databaseUrl,
  PoolClass,
}) {
  const bundle = loadProvisioningBundle({ repositoryRoot, manifestPath });
  if (!bundle.ready) fail('v51_legal_bundle_not_approved');
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    fail('database_url_required');
  }
  if (typeof PoolClass !== 'function') fail('postgres_pool_required');
  const pool = new PoolClass({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const document of bundle.documents) {
      const result = await client.query(
        `INSERT INTO legal_document_snapshots (
           document_key, document_version, locale, content_type,
           content_text, content_sha256, effective_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (
           document_key, document_version, locale, content_sha256
         ) DO NOTHING`,
        [
          document.documentKey,
          document.version,
          document.locale,
          document.contentType,
          document.content,
          document.contentSha256,
          bundle.manifest.effectiveDate,
        ],
      );
      inserted += result.rowCount;
    }
    const verified = await client.query(
      `SELECT document_key, content_sha256
         FROM legal_document_snapshots
        WHERE document_version = $1 AND locale = 'de'
          AND document_key = ANY($2::text[])`,
      [bundle.manifest.version, bundle.documents.map((entry) => entry.documentKey)],
    );
    const observed = new Map(verified.rows.map((row) => [row.document_key, row.content_sha256]));
    if (bundle.documents.some((entry) => observed.get(entry.documentKey) !== entry.contentSha256)) {
      fail('v51_legal_database_verification_failed');
    }
    await client.query('COMMIT');
    return { inserted, verified: observed.size, version: bundle.manifest.version };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const args = new Set(process.argv.slice(2));
  const bundle = loadProvisioningBundle({ repositoryRoot });
  if (!args.has('--apply')) {
    process.stdout.write(JSON.stringify({
      version: bundle.manifest.version,
      status: bundle.manifest.status,
      ready: bundle.ready,
      documentCount: bundle.documents.length,
      openFactCount: bundle.manifest.openFacts?.length ?? null,
      applied: false,
    }) + '\n');
    return;
  }
  if (process.argv.slice(2).some((arg) => arg !== '--apply')) fail('unknown_argument');
  const { Pool } = await import('pg');
  const result = await provisionV51LegalSnapshots({
    repositoryRoot,
    databaseUrl: process.env.DATABASE_URL,
    PoolClass: Pool,
  });
  process.stdout.write(JSON.stringify({ ...result, applied: true }) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? 'v51_legal_provisioning_failed'}\n`);
    process.exitCode = 1;
  });
}
