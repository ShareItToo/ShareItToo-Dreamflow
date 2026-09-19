import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  loadProvisioningBundle,
  provisionV51LegalSnapshots,
} from '../ops/provision_v51_legal_snapshots.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);

test('reviewed V5.1 draft validates but remains impossible to provision', async () => {
  const bundle = loadProvisioningBundle({ repositoryRoot });
  assert.equal(bundle.documents.length, 7);
  assert.equal(bundle.ready, false);
  let poolCreated = false;
  await assert.rejects(
    provisionV51LegalSnapshots({
      repositoryRoot,
      databaseUrl: 'postgresql://unused',
      PoolClass: class {
        constructor() { poolCreated = true; }
      },
    }),
    /v51_legal_bundle_not_approved/,
  );
  assert.equal(poolCreated, false);
});

test('only a complete approved hash-bound fixture can be inserted and read back', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-v51-legal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const assetRoot = resolve(root, 'assets/legal/de');
  mkdirSync(assetRoot, { recursive: true });
  const types = [
    'platform_terms',
    'private_rental_terms',
    'cancellation',
    'community_moderation',
    'privacy',
    'imprint',
    'withdrawal',
  ];
  const documents = types.map((type) => {
    const path = `assets/legal/de/${type}_v5.html`;
    const content = `<!doctype html><title>${type}</title>`;
    writeFileSync(resolve(root, path), content);
    return {
      type,
      path,
      version: 'V5.1-2026-08-16',
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  });
  const manifestPath = resolve(assetRoot, 'legal_manifest_v5.json');
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    version: 'V5.1-2026-08-16',
    status: 'approved',
    activationAllowed: true,
    productionProvisioningAllowed: true,
    effectiveDate: '2026-08-20T00:00:00.000Z',
    openFacts: [],
    boundaries: { containsLivePlaceholders: false },
    documents,
  }));
  const inserted = new Map();
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('INSERT INTO legal_document_snapshots')) {
        inserted.set(params[0], params[5]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('SELECT document_key, content_sha256')) {
        return {
          rowCount: inserted.size,
          rows: [...inserted].map(([document_key, content_sha256]) => ({
            document_key,
            content_sha256,
          })),
        };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    release() {},
  };
  class FakePool {
    async connect() { return client; }
    async end() {}
  }
  const result = await provisionV51LegalSnapshots({
    repositoryRoot: root,
    manifestPath,
    databaseUrl: 'postgresql://fixture',
    PoolClass: FakePool,
  });
  assert.deepEqual(result, {
    inserted: 7,
    verified: 7,
    version: 'V5.1-2026-08-16',
  });
  assert.equal(readFileSync(manifestPath, 'utf8').includes('openFacts'), true);
});
