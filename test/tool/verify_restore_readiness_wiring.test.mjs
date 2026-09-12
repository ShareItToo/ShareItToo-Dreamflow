import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL(
  '../../backend/ops/verify_restore.sh', import.meta.url), 'utf8');

test('isolated restore waits for the final Postgres TCP server', () => {
  const readinessProbes = script.match(
    /pg_isready -h 127\.0\.0\.1 \\\n\s+-U shareittoo_restore -d shareittoo_restore/g,
  ) ?? [];

  assert.equal(readinessProbes.length, 2);
  assert.doesNotMatch(script, /pg_isready -U shareittoo_restore/);
});
