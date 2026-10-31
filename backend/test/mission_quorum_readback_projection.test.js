import assert from 'node:assert/strict';
import test from 'node:test';
import { missionNeedDigest as digest } from '../src/mission_need_workflow.js';
import { projectMissionQuorumReadback } from '../src/mission_quorum_readback_projection.js';

function source() {
  const payload = { title: 'P6-C4', status: 'planned', needs: [
    { needKey: 'drill', necessity: 'required', quantity: 1 },
  ] };
  const mission = { id: 'mission_need_1', owner_id: 'owner-a', current_revision: 1,
    payload, payload_sha256: digest(payload) };
  const snapshot = { slots: [{ slotKey: 'required:drill:1', needKey: 'drill',
    necessity: 'required', ordinal: 1, gapReason: 'no_current_unique_candidate', assignment: null }] };
  const resolution = { id: 'mission_inventory_1', owner_id: 'owner-a', mission_need_id: mission.id,
    current_revision: 1, revision_id: 'revision-1', mission_need_revision: 1,
    mission_payload_sha256: mission.payload_sha256, resolution_snapshot: snapshot,
    resolution_snapshot_sha256: digest(snapshot) };
  return { mission, resolution, assignments: [{ revision_id: 'revision-1',
    resolution_id: resolution.id, resolution_revision: 1, slot_key: 'required:drill:1',
    need_key: 'drill', necessity: 'required', slot_ordinal: 1, listing_id: null,
    listing_snapshot: null, quote_snapshot: null, gap_reason: 'no_current_unique_candidate' }],
  listings: [], demands: [], fits: [], observedAt: '2026-10-05T08:00:00.000Z' };
}

test('P6-C4 projector is runtime-safe and emits no lifecycle or private fields', () => {
  const result = projectMissionQuorumReadback(source());
  assert.equal(result.status, 'incomplete');
  assert.equal(result.components[0].axes.availability, 'unknown');
  assert.deepEqual(Object.keys(result.components[0].axes),
    ['availability', 'fit', 'supplyRelease']);
  assert.equal(Object.hasOwn(result.components[0], 'acceptance'), false);
  assert.equal(Object.hasOwn(result.components[0], 'ownerId'), true);
});

test('foreign private Shelf remains unknown even with released supply and fit-shaped input', () => {
  const value = source();
  const assignment = value.assignments[0];
  assignment.gap_reason = null;
  assignment.listing_id = null;
  value.resolution.resolution_snapshot.slots[0].gapReason = null;
  value.resolution.resolution_snapshot.slots[0].assignment = null;
  value.resolution.resolution_snapshot_sha256 = digest(
    value.resolution.resolution_snapshot,
  );
  value.demands = [{ id: 'demand-1', slot_key: assignment.slot_key, requester_id: 'owner-a',
    recipient_id: 'owner-b', mission_need_id: value.mission.id, mission_need_revision: 1,
    mission_payload_sha256: value.mission.payload_sha256, resolution_id: value.resolution.id,
    resolution_revision: 1, need_key: 'drill', necessity: 'required', slot_ordinal: 1,
    quantity: 1, purpose: 'mission_gap_supply_v1', shelf_owner_id: 'owner-b',
    expires_at: '2026-11-01T00:00:00.000Z', current_status: 'released', current_revision: 2,
    revision_status: 'released', revision_number: 2, revision_actor_id: 'owner-b',
    release_id: 'release-1', release_recipient_id: 'owner-b', release_shelf_item_id: 'shelf-1',
    released_revision: 2, candidate_shelf_item_id: 'shelf-1', participation_status: 'active',
    item_availability_status: 'confirmed_available' }];
  value.fits = [{ shelf_item_id: 'shelf-1', need_key: 'drill', owner_id: 'owner-a',
    mission_need_id: value.mission.id, shelf_owner_id: 'owner-a', mission_need_revision: 1,
    mission_payload_sha256: value.mission.payload_sha256,
    shelf_snapshot_sha256: digest({ shelfItemId: 'shelf-1' }),
    live_shelf_snapshot: { shelfItemId: 'shelf-1' }, evaluation: { status: 'fit', releaseBlocked: false } }];
  const result = projectMissionQuorumReadback(value);
  assert.equal(result.components[0].axes.supplyRelease, 'released');
  assert.equal(result.components[0].axes.fit, 'unknown');
});

test('P6-C4 rejects assignment reparenting and count drift', () => {
  for (const mutate of [
    (value) => { value.assignments.pop(); },
    (value) => { value.assignments[0].resolution_id = 'other'; },
    (value) => { value.resolution.owner_id = 'foreign'; },
  ]) {
    const value = source(); mutate(value);
    assert.throws(() => projectMissionQuorumReadback(value), /mission_quorum_readback_projection_/u);
  }
});

test('P6-C4 rejects unknown demand slots and duplicate item reuse', () => {
  const unknown = source();
  unknown.demands = [{ slot_key: 'required:other:1' }];
  assert.throws(() => projectMissionQuorumReadback(unknown), /unknown_slot/u);

  const duplicate = source();
  const second = structuredClone(duplicate.assignments[0]);
  second.slot_key = 'required:drill:2';
  second.slot_ordinal = 2;
  duplicate.assignments.push(second);
  duplicate.resolution.resolution_snapshot.slots.push({
    slotKey: 'required:drill:2', needKey: 'drill', necessity: 'required', ordinal: 2,
    gapReason: null, assignment: null,
  });
  duplicate.resolution.resolution_snapshot_sha256 = digest(
    duplicate.resolution.resolution_snapshot,
  );
  duplicate.mission.payload.needs[0].quantity = 2;
  duplicate.mission.payload_sha256 = digest(duplicate.mission.payload);
  duplicate.resolution.mission_payload_sha256 = duplicate.mission.payload_sha256;
  // Both slots point to one listing, which is not an independent quorum unit.
  duplicate.assignments[0].listing_id = 'listing-1';
  duplicate.assignments[0].listing_snapshot = { listingId: 'listing-1', catalogRevision: 1, availabilityRevision: 1 };
  duplicate.assignments[0].quote_snapshot = { quoteHash: 'a'.repeat(64), availabilityRevision: 1, preview: true, persisted: false };
  duplicate.assignments[0].gap_reason = null;
  duplicate.assignments[1].listing_id = 'listing-1';
  duplicate.assignments[1].listing_snapshot = duplicate.assignments[0].listing_snapshot;
  duplicate.assignments[1].quote_snapshot = duplicate.assignments[0].quote_snapshot;
  duplicate.assignments[1].gap_reason = null;
  for (const slot of duplicate.resolution.resolution_snapshot.slots) {
    slot.gapReason = null;
    slot.assignment = { listingId: 'listing-1', catalogRevision: 1, availabilityRevision: 1,
      quote: duplicate.assignments[0].quote_snapshot };
  }
  duplicate.resolution.resolution_snapshot_sha256 = digest(
    duplicate.resolution.resolution_snapshot,
  );
  duplicate.listings = [{ id: 'listing-1', owner_id: 'owner-b', status: 'active', is_active: true,
    moderation_status: 'active', catalog_revision: 1, availability_revision: 1 }];
  assert.throws(() => projectMissionQuorumReadback(duplicate), /collision/u);
});
