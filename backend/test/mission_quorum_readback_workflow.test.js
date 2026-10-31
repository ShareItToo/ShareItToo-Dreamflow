import assert from 'node:assert/strict';
import test from 'node:test';
import { missionNeedDigest as digest } from '../src/mission_need_workflow.js';
import {
  getMissionQuorumReadback,
  MissionQuorumReadbackError,
} from '../src/mission_quorum_readback_workflow.js';

const missionId = 'mission_need_00000000-0000-4000-8000-000000000001';
const resolutionId = 'mission_inventory_00000000-0000-4000-8000-000000000001';
const ownerId = 'account-owner';
const recipientId = 'account-recipient';
const shelfId = 'shelf-item-1';
const revisionId = 'resolution-revision-1';
const payload = { title: 'Werkzeug', status: 'planned', needs: [
  { needKey: 'drill', necessity: 'required', quantity: 1 },
] };
const snapshot = { slots: [{
  slotKey: 'required:drill:1', needKey: 'drill', necessity: 'required', ordinal: 1,
  gapReason: 'no_current_unique_candidate', assignment: null,
}] };

function source({ foreignFit = false, stale = false } = {}) {
  const mission = {
    id: missionId, owner_id: ownerId, current_revision: stale ? 2 : 1,
    payload, payload_sha256: digest(payload), observed_at: '2026-10-05T08:00:00.000Z',
  };
  const resolution = {
    id: resolutionId, owner_id: ownerId, mission_need_id: missionId,
    current_revision: 1, revision_id: revisionId, revision: 1,
    mission_need_revision: stale ? 1 : 1, mission_payload_sha256: digest(payload),
    resolution_snapshot: snapshot, resolution_snapshot_sha256: digest(snapshot),
  };
  const assignment = {
    revision_id: revisionId, resolution_id: resolutionId, resolution_revision: 1,
    slot_key: 'required:drill:1', need_key: 'drill', necessity: 'required', slot_ordinal: 1,
    listing_id: null, listing_snapshot: null, quote_snapshot: null,
    gap_reason: 'no_current_unique_candidate',
  };
  const demand = {
    id: 'demand-1', slot_key: 'required:drill:1', requester_id: ownerId,
    recipient_id: recipientId, mission_need_id: missionId, mission_need_revision: 1,
    mission_payload_sha256: digest(payload), resolution_id: resolutionId,
    resolution_revision: 1, need_key: 'drill', necessity: 'required', slot_ordinal: 1,
    quantity: 1, purpose: 'mission_gap_supply_v1', shelf_owner_id: recipientId,
    expires_at: '2026-11-01T00:00:00.000Z', current_status: 'released', current_revision: 2,
    revision_status: 'released', revision_number: 2, revision_actor_id: recipientId,
    release_id: 'release-1', release_recipient_id: recipientId,
    release_shelf_item_id: shelfId, released_revision: 2,
    participation_status: 'active', participation_revision: 1,
    item_availability_status: 'confirmed_available', item_revision: 1,
    candidate_shelf_item_id: shelfId,
  };
  const fit = {
    id: 'fit-1', owner_id: ownerId, mission_need_id: missionId, shelf_item_id: shelfId,
    need_key: 'drill', revision: 1, mission_need_revision: 1,
    mission_payload_sha256: digest(payload), shelf_snapshot_sha256: digest({ shelfItemId: shelfId }),
    payload_sha256: digest({ status: 'fit' }), evaluation: { status: 'fit', releaseBlocked: false },
    shelf_owner_id: foreignFit ? ownerId : ownerId,
    live_shelf_snapshot: { shelfItemId: shelfId },
  };
  return { mission, resolution, assignment, demand, fit };
}

function fakeClient(value) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^SET TRANSACTION/u.test(sql)) return { rows: [] };
      if (sql.includes('FROM mission_needs AS need')) {
        return params[0] === ownerId ? { rows: [{ value: value.mission }] } : { rows: [] };
      }
      if (sql.includes('FROM mission_inventory_resolutions AS resolution')) {
        return params[0] === ownerId ? { rows: [{ value: value.resolution }] } : { rows: [] };
      }
      if (sql.includes('FROM mission_inventory_resolution_assignments')) return { rows: [{ value: value.assignment }] };
      if (sql.includes('FROM mission_supply_demands AS demand')) return { rows: [{ value: value.demand }] };
      if (sql.includes('FROM mission_fit_checks AS fit')) return { rows: [{ value: value.fit }] };
      if (sql.includes('FROM listings AS listing')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test('readback is non-binding, private, and marks P4 foreign-owner fit stale', async () => {
  const client = fakeClient(source({ foreignFit: true }));
  const result = await getMissionQuorumReadback(client, { actorId: ownerId, resolutionId });
  const quorum = result.quorum;
  assert.equal(quorum.bindingStatus, 'non_binding');
  assert.equal(quorum.persisted, false);
  assert.equal(quorum.paymentStatus, 'not_determined');
  assert.equal(quorum.components[0].state, 'stale_or_unknown');
  assert.deepEqual(Object.keys(quorum.components[0]).sort(),
    ['needKey', 'necessity', 'ordinal', 'slotKey', 'state'].sort());
  assert.equal(JSON.stringify(quorum).includes(ownerId), false);
  assert.equal(JSON.stringify(quorum).includes(shelfId), false);
  assert.equal(client.calls.some(({ sql }) => /\b(INSERT|UPDATE|DELETE|COMMIT|ROLLBACK)\b/iu.test(sql)), false);
});

test('foreign owner and source drift fail closed before projection output', async () => {
  await assert.rejects(
    getMissionQuorumReadback(fakeClient(source()), { actorId: 'foreign-owner', resolutionId }),
    (error) => error instanceof MissionQuorumReadbackError && error.status === 404,
  );
  await assert.rejects(
    getMissionQuorumReadback(fakeClient(source({ stale: true })), { actorId: ownerId, resolutionId }),
    (error) => error instanceof MissionQuorumReadbackError && error.status === 409
      && error.code === 'mission_quorum_readback_source_stale',
  );
});

test('route contract keeps one repeatable-read read-only snapshot and no-store cache', async () => {
  const app = await import('node:fs/promises');
  const sourceText = await app.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const routeStart = sourceText.indexOf("/v1/mission-inventory-resolutions/:id/quorum");
  assert.ok(routeStart >= 0);
  const route = sourceText.slice(routeStart, routeStart + 1100);
  assert.match(route, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(route, /Cache-Control', 'private, no-store'/u);
});
