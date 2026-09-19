import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const upPath = new URL('../sql/migrations/091_technical_sandbox_runs.up.sql', import.meta.url);
const downPath = new URL('../sql/migrations/091_technical_sandbox_runs.down.sql', import.meta.url);

test('technical sandbox migration is isolated, fixed amount and reversible in dependency order', async () => {
  const up = await readFile(upPath, 'utf8');
  const down = await readFile(downPath, 'utf8');
  assert.match(up, /CREATE TABLE technical_sandbox_runs/u);
  assert.match(up, /CREATE TABLE technical_sandbox_provider_events/u);
  assert.match(up, /amount_minor INTEGER NOT NULL CHECK \(amount_minor = 100\)/u);
  assert.match(up, /currency TEXT NOT NULL CHECK \(currency = 'EUR'\)/u);
  assert.match(up, /livemode BOOLEAN NOT NULL CHECK \(livemode = false\)/u);
  assert.match(up, /synthetic_email TEXT NOT NULL CHECK \(synthetic_email LIKE '%@example\.invalid'\)/u);
  assert.match(down, /DROP TABLE IF EXISTS technical_sandbox_provider_events;[\s\S]*DROP TABLE IF EXISTS technical_sandbox_runs;/u);
  assert.doesNotMatch(up, /\b(payments|bookings|ledger|financial_documents|refunds|payouts|connect)\b/iu);
  const retention = await readFile(new URL('../src/retention_inventory.js', import.meta.url), 'utf8');
  assert.match(retention, /technical_sandbox_runs/u);
  assert.match(retention, /technical_sandbox_provider_events/u);
});
