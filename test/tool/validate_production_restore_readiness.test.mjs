import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateProductionRestoreReadiness } from
  '../../tool/validate_production_restore_readiness.mjs';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../docs/evidence/b11/production-restore-readiness-20260813.json',
  import.meta.url), 'utf8'));
const currentSource = await readFile(new URL(
  '../../backend/ops/verify_restore.sh', import.meta.url), 'utf8');
const terminalHook = currentSource.slice(currentSource.lastIndexOf(
  '# Notification failure cannot retroactively fail the verified restore check.'));

async function fixture(mutate, mutateSource = (value) => value) {
  const root = await mkdtemp(join(tmpdir(), 'sit-restore-readiness-'));
  const evidence = structuredClone(canonical);
  mutate(evidence);
  const evidencePath = join(root, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await mkdir(join(root, 'backend/ops'), { recursive: true });
  await writeFile(join(root, 'backend/ops/verify_restore.sh'), mutateSource(currentSource));
  return { root, evidencePath, repositoryRoot: root };
}

test('validates retained evidence and exact source compatibility without current runtime proof', () => {
  assert.deepEqual(validateProductionRestoreReadiness({ repositoryRoot }), {
    status: 'isolated-restore-verified', databaseTables: 8, uploadFiles: 0,
    retainedEvidenceValidated: true, currentSourceCompatible: true,
    currentRuntimeVerified: false,
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

for (const [name, mutateSource] of [
  ['missing hook', (value) => value.slice(0, -terminalHook.length)],
  ['relocated hook', (value) => terminalHook + value.slice(0, -terminalHook.length)],
  ['mutated hook', (value) => value.replace('recovery || true', 'recovery || false')],
  ['duplicated hook', (value) => value + terminalHook],
  ['extra trailing bytes', (value) => value + '\n'],
  ['prefix drift', (value) => value.replace('seq 1 60', 'seq 1 61')],
  ['TCP readiness drift', (value) => value.replace('pg_isready -h 127.0.0.1', 'pg_isready')],
]) {
  test(`rejects current source compatibility with ${name}`, async (t) => {
    const data = await fixture(() => {}, mutateSource);
    t.after(() => rm(data.root, { recursive: true, force: true }));
    assert.throws(() => validateProductionRestoreReadiness(data),
      /stable TCP readiness|exact terminal recovery hook/);
  });
}

test('rejects rebinding historical evidence to the complete current script', async (t) => {
  const { createHash } = await import('node:crypto');
  const data = await fixture((evidence) => {
    evidence.source.sha256 = createHash('sha256').update(currentSource).digest('hex');
  });
  t.after(() => rm(data.root, { recursive: true, force: true }));
  assert.throws(() => validateProductionRestoreReadiness(data), /stable TCP readiness/);
});
