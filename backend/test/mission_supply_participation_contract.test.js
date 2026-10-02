import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const up = await readFile(new URL('../sql/migrations/104_mission_supply_participation.up.sql', import.meta.url), 'utf8');
const down = await readFile(new URL('../sql/migrations/104_mission_supply_participation.down.sql', import.meta.url), 'utf8');
const sql = up.replace(/^--.*$/gmu, '');

test('P6-C1 is private, deterministic and fail-closed for unproven location/legal activation', () => {
  assert.match(up, /current_status TEXT NOT NULL DEFAULT 'withdrawn'/u);
  assert.match(up, /current_status IN \('active', 'withdrawn'\)/u);
  assert.match(up, /availability_status IN \('confirmed_available', 'withdrawn'\)/u);
  assert.match(up, /FOREIGN KEY \(shelf_item_id, owner_id\)/u);
  assert.match(up, /FOREIGN KEY \(participation_id, owner_id\)/u);
  assert.match(up, /PRIMARY KEY \(owner_id, idempotency_key\)/gu);
  assert.match(up, /mission_supply_participation_item_revisions_sequence_guard/u);
  assert.match(up, /mission_supply_participation_revisions_sequence_guard/u);
  assert.doesNotMatch(sql, /\b(latitude|longitude|address|location_snapshot|listing_id|notification|email|push|payment|provider)\b/iu);
  assert.doesNotMatch(sql, /ORDER BY\s+random\s*\(/iu);
  assert.doesNotMatch(sql, /RETENTION|TTL|expires_at/iu);
  assert.match(down, /mission_supply_participation_rows_active/u);
  assert.match(down, /DROP TABLE mission_supply_participations/u);
});

test('P6-C1 never widens the existing injected-only P6-A create resolver', async () => {
  const workflow = await readFile(new URL('../src/mission_supply_demand_workflow.js', import.meta.url), 'utf8');
  assert.match(workflow, /recipientResolver/u);
  assert.match(workflow, /mission_supply_demand_not_enabled/u);
  assert.doesNotMatch(workflow, /mission_supply_participation_(?:items?|revisions)/u);
});
