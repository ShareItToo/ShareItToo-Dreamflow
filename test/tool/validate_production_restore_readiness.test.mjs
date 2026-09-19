import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateProductionRestoreReadiness } from
  '../../tool/validate_production_restore_readiness.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../docs/evidence/b11/production-restore-readiness-20260813.json',
  import.meta.url), 'utf8'));

async function fixture(mutate) {
  const root = await mkdtemp(join(tmpdir(), 'sit-restore-readiness-'));
  const evidence = structuredClone(canonical);
  mutate(evidence);
  const evidencePath = join(root, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { root, evidencePath };
}

test('accepts the isolated production-backup restore proof', () => {
  assert.deepEqual(validateProductionRestoreReadiness({ repositoryRoot }), {
    status: 'isolated-restore-verified', databaseTables: 8, uploadFiles: 0,
  });
});

test('rejects a restore that touched production data', async (t) => {
  const data = await fixture((evidence) => {
    evidence.boundaries.productionDataChanged = true;
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateProductionRestoreReadiness({ repositoryRoot, ...data }),
    /boundaries/);
});

test('rejects a stale restore-script hash', async (t) => {
  const data = await fixture((evidence) => { evidence.source.sha256 = '0'.repeat(64); });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateProductionRestoreReadiness({ repositoryRoot, ...data }),
    /stable TCP readiness/);
});
