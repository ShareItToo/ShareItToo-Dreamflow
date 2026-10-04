import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createSyntheticMissionSupplyRecipientResolver,
  missionSupplySyntheticEligibilityVersion,
  resolveSyntheticMissionSupplyRecipient,
} from '../src/mission_supply_synthetic_resolver.js';
import { MissionSupplyDemandError } from '../src/mission_supply_demand_workflow.js';

const input = {
  requesterId: 'synthetic-requester',
  needKey: 'plant_container_equipment',
  purpose: 'mission_gap_supply_v1',
};

const row = {
  participation_id: 'mission_supply_participation_11111111-1111-4111-8111-111111111111',
  recipient_owner_id: 'synthetic-recipient',
  participation_revision: 4,
  shelf_item_id: 'shelf_item_22222222-2222-4222-8222-222222222222',
  need_key: 'plant_container_equipment',
  item_revision: 5,
};

function client(rows) {
  return {
    calls: [],
    async query(sql, values) {
      this.calls.push({ sql, values });
      return { rows };
    },
  };
}

test('synthetic bridge returns one current C1 candidate with only internal bindings', async () => {
  const db = client([row]);
  const result = await resolveSyntheticMissionSupplyRecipient(db, input);
  assert.deepEqual(result, {
    recipientOwnerId: row.recipient_owner_id,
    shelfItemId: row.shelf_item_id,
    needKey: input.needKey,
    purpose: input.purpose,
    eligibilityVersion: missionSupplySyntheticEligibilityVersion,
    participationId: row.participation_id,
    participationRevision: 4,
    itemRevision: 5,
  });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(db.calls[0].values, [input.requesterId, input.needKey]);
  assert.match(db.calls[0].sql, /current_status = 'active'/u);
  assert.match(db.calls[0].sql, /availability_status = 'confirmed_available'/u);
  assert.match(db.calls[0].sql, /ORDER BY history\.shelf_item_id, history\.need_key, history\.revision DESC/u);
  assert.match(db.calls[0].sql, /user_blocks/u);
  assert.match(db.calls[0].sql, /^\s*SELECT/u);
  assert.doesNotMatch(db.calls[0].sql, /ORDER BY\s+random\s*\(/iu);
  for (const forbidden of ['latitude', 'longitude', 'address', 'listing', 'notification', 'payment', 'provider']) {
    assert.doesNotMatch(db.calls[0].sql, new RegExp(`\\b${forbidden}\\b`, 'iu'));
  }
});

test('missing, withdrawn, duplicate, self and malformed candidates fail closed', async () => {
  for (const rows of [[], [row, row], [{ ...row, recipient_owner_id: input.requesterId }]]) {
    await assert.rejects(
      resolveSyntheticMissionSupplyRecipient(client(rows), input),
      (error) => error instanceof MissionSupplyDemandError
        && error.status === 404 && error.code === 'mission_supply_recipient_not_eligible',
    );
  }
  for (const badInput of [
    { ...input, needKey: 'vehicle' },
    { ...input, purpose: 'marketing' },
    { ...input, requesterId: '' },
  ]) {
    await assert.rejects(
      resolveSyntheticMissionSupplyRecipient(client([row]), badInput),
      (error) => error instanceof MissionSupplyDemandError
        && error.code === 'mission_supply_recipient_not_eligible',
    );
  }
  await assert.rejects(
    resolveSyntheticMissionSupplyRecipient(client([{
      ...row, participation_revision: 0,
    }]), input),
    /mission_supply_recipient_not_eligible/u,
  );
});

test('bridge factory is explicit and P6-A app wiring remains injection-only', async () => {
  assert.equal(createSyntheticMissionSupplyRecipientResolver(), resolveSyntheticMissionSupplyRecipient);
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const demand = await readFile(new URL('../src/mission_supply_demand_workflow.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /mission_supply_synthetic_resolver/u);
  assert.match(app, /resolveMissionSupplyRecipient = null/u);
  assert.match(demand, /suspension\.scope IN \('account', 'booking'\)/u);
  assert.match(demand, /participation\.current_revision = \$5/u);
  assert.match(demand, /latest\.revision = \$7/u);
  assert.match(demand, /latest\.availability_status = 'confirmed_available'/u);
  assert.match(demand, /FOR KEY SHARE OF participation, item/u);
});
