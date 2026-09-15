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
  assert.match(script, /deletedProfileRestoreGuard/u);
  assert.match(script, /personal_data_erased_at IS NOT NULL/u);
  assert.match(script, /account_status <> 'closed'/u);
  assert.match(script, /password_hash IS NOT NULL/u);
  assert.match(script, /email !~ '\^deleted\\\\\+\[\^@\]\+@anonymized\\\\\.invalid\$'/u);
  assert.match(script, /revived or incompletely erased profile state/u);
});
