import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const upUrl = new URL(
  '../sql/migrations/073_listing_ai_on_device_provider.up.sql',
  import.meta.url,
);
const downUrl = new URL(
  '../sql/migrations/073_listing_ai_on_device_provider.down.sql',
  import.meta.url,
);

test('on-device provider migration is paired, zero-cost compatible and rollback guarded', async () => {
  const [up, down] = await Promise.all([
    readFile(upUrl, 'utf8'),
    readFile(downUrl, 'utf8'),
  ]);

  for (const table of ['listing_ai_cost_ledger', 'listing_ai_budget_aggregates']) {
    assert.match(up, new RegExp(`ALTER TABLE ${table}`, 'u'));
    assert.match(down, new RegExp(`ALTER TABLE ${table}`, 'u'));
  }
  assert.equal((up.match(/'on_device'/gu) ?? []).length, 2);
  assert.match(down, /durable provider history exists/u);
  assert.match(down, /WHERE provider = 'on_device'/u);
  assert.equal((down.match(/'on_device'/gu) ?? []).length, 2);
});
