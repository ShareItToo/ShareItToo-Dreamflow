import { missionNeedDigest as digest, normalizeMissionNeedPayload } from './mission_need_workflow.js';

export class MissionQuorumReadbackProjectionError extends Error {
  constructor(code) {
    super(`mission_quorum_readback_projection_${code}`);
    this.code = this.message;
  }
}

function requireTruth(value, code) {
  if (!value) throw new MissionQuorumReadbackProjectionError(code);
}

function unique(rows, key) {
  requireTruth(new Set(rows.map((row) => row[key])).size === rows.length, 'collision');
  return new Map(rows.map((row) => [row[key], row]));
}

function iso(value) {
  requireTruth(value != null && Number.isFinite(new Date(value).getTime()), 'timestamp');
  return new Date(value).toISOString();
}

function same(a, b) {
  return digest(a) === digest(b);
}

function demandState(demand, mission, resolution, slot, observedAt) {
  if (!demand) return { itemId: null, ownerId: null, release: 'not_bound', available: 'unknown' };
  requireTruth(demand.requester_id === mission.owner_id
    && demand.recipient_id !== mission.owner_id
    && demand.mission_need_id === mission.id
    && Number(demand.mission_need_revision) === Number(mission.current_revision)
    && demand.mission_payload_sha256 === mission.payload_sha256
    && demand.resolution_id === resolution.id
    && Number(demand.resolution_revision) === Number(resolution.current_revision)
    && demand.need_key === slot.needKey
    && demand.necessity === slot.necessity
    && Number(demand.slot_ordinal) === slot.ordinal
    && demand.quantity === 1
    && demand.purpose === 'mission_gap_supply_v1'
    && demand.shelf_owner_id === demand.recipient_id, 'demand_binding');
  requireTruth(demand.revision_status === demand.current_status
    && Number(demand.revision_number) === Number(demand.current_revision), 'demand_revision');
  const expired = iso(demand.expires_at) <= observedAt;
  if (['released', 'revoked'].includes(demand.current_status)) {
    const releaseRevision = Number(demand.current_revision)
      - (demand.current_status === 'revoked' ? 1 : 0);
    requireTruth(demand.release_id
      && demand.release_recipient_id === demand.recipient_id
      && demand.release_shelf_item_id === demand.candidate_shelf_item_id
      && Number(demand.released_revision) === releaseRevision
      && demand.revision_actor_id === demand.recipient_id, 'release_binding');
  }
  const release = expired && demand.current_status === 'released' ? 'expired'
    : expired && demand.current_status === 'pending' ? 'expired_no_response'
    : demand.current_status;
  const available = demand.participation_status === 'active'
    && demand.item_availability_status === 'confirmed_available'
    && !expired ? 'observed_available' : 'unknown';
  return {
    itemId: demand.candidate_shelf_item_id,
    ownerId: demand.recipient_id,
    release,
    available,
  };
}

function privateShelfFit(fits, mission, itemId, needKey, ownerId) {
  const relevant = fits.filter((fit) => fit.shelf_item_id === itemId && fit.need_key === needKey);
  // P4 fit checks are same-owner only. A foreign P6 Shelf never becomes covered
  // merely because an unrelated fit row happens to share its item and need keys.
  const approved = relevant.filter((fit) => fit.owner_id === mission.owner_id
    && fit.mission_need_id === mission.id
    && fit.shelf_owner_id === mission.owner_id
    && ownerId === mission.owner_id
    && Number(fit.mission_need_revision) === Number(mission.current_revision)
    && fit.mission_payload_sha256 === mission.payload_sha256
    && fit.shelf_snapshot_sha256 === digest(fit.live_shelf_snapshot)
    && fit.evaluation?.status === 'fit'
    && fit.evaluation.releaseBlocked === false);
  return approved.length === 1 && relevant.length === 1 ? 'fit' : 'unknown';
}

/**
 * Runtime-safe P6-C4 projector. It intentionally has no lifecycle, fixture,
 * acceptance, payment, booking, or synthetic P7 dependency.
 */
export function projectMissionQuorumReadback({
  mission, resolution, assignments, listings, demands, fits, observedAt,
}) {
  const observed = iso(observedAt);
  requireTruth(resolution.owner_id === mission.owner_id
    && resolution.mission_need_id === mission.id, 'principal');
  requireTruth(Number(resolution.mission_need_revision) === Number(mission.current_revision)
    && resolution.mission_payload_sha256 === mission.payload_sha256, 'revision');
  requireTruth(digest(mission.payload) === mission.payload_sha256
    && digest(resolution.resolution_snapshot) === resolution.resolution_snapshot_sha256, 'source_digest');
  const needs = normalizeMissionNeedPayload(mission.payload).needs;
  const slots = needs.flatMap((need) => Array.from({ length: need.quantity }, (_, index) => ({
    slotKey: `${need.necessity}:${need.needKey}:${index + 1}`,
    needKey: need.needKey,
    necessity: need.necessity,
    ordinal: index + 1,
  }))).sort((a, b) => a.slotKey.localeCompare(b.slotKey));
  const assigned = unique(assignments, 'slot_key');
  const stored = unique(resolution.resolution_snapshot.slots, 'slotKey');
  requireTruth(assignments.length === slots.length && stored.size === slots.length, 'slots_incomplete');
  const listingMap = unique(listings, 'id');
  const demandMap = unique(demands, 'slot_key');
  const fitRows = Array.isArray(fits) ? fits : [];
  requireTruth([...demandMap.keys()].every((key) => assigned.has(key)), 'unknown_slot');
  const itemIds = new Set();
  const components = slots.map((slot) => {
    const assignment = assigned.get(slot.slotKey);
    const storedSlot = stored.get(slot.slotKey);
    requireTruth(assignment && storedSlot
      && assignment.revision_id === resolution.revision_id
      && assignment.resolution_id === resolution.id
      && Number(assignment.resolution_revision) === Number(resolution.current_revision)
      && assignment.need_key === slot.needKey
      && assignment.necessity === slot.necessity
      && Number(assignment.slot_ordinal) === slot.ordinal
      && storedSlot.needKey === slot.needKey
      && storedSlot.necessity === slot.necessity
      && storedSlot.ordinal === slot.ordinal
      && assignment.listing_id === (storedSlot.assignment?.listingId ?? null)
      && assignment.gap_reason === storedSlot.gapReason, 'slot_binding');
    const demand = demandMap.get(slot.slotKey);
    requireTruth(!(demand && assignment.listing_id), 'collision');
    let state = demandState(demand, mission, resolution, slot, observed);
    let itemType = demand ? 'private_shelf' : null;
    let listing = null;
    if (assignment.listing_id) {
      listing = listingMap.get(assignment.listing_id);
      requireTruth(listing
        && assignment.listing_snapshot?.listingId === listing.id
        && same(assignment.quote_snapshot, storedSlot.assignment.quote)
        && Object.entries(assignment.listing_snapshot)
          .every(([key, value]) => same(value, storedSlot.assignment[key])), 'listing_binding');
      state = {
        itemId: listing.id,
        ownerId: listing.owner_id,
        release: 'not_bound',
        available: listing.status === 'active'
          && listing.is_active === true
          && listing.moderation_status === 'active'
          && Number(listing.catalog_revision) === Number(storedSlot.assignment.catalogRevision)
          && Number(listing.availability_revision) === Number(storedSlot.assignment.availabilityRevision)
          ? 'observed_available' : 'unknown',
      };
      itemType = 'listing';
    }
    const fit = itemType === 'private_shelf'
      ? privateShelfFit(fitRows, mission, state.itemId, slot.needKey, state.ownerId)
      : 'unknown';
    if (state.itemId) {
      requireTruth(!itemIds.has(state.itemId), 'collision');
      itemIds.add(state.itemId);
    }
    return {
      ...slot,
      itemId: state.itemId,
      itemType,
      ownerId: state.ownerId,
      axes: { availability: state.available, fit, supplyRelease: state.release },
      sourceDigest: digest({ assignment, listing, demand: demand ?? null, fits: fitRows
        .filter((row) => row.shelf_item_id === state.itemId && row.need_key === slot.needKey) }),
      status: 'incomplete',
    };
  });
  return {
    missionNeedId: mission.id,
    missionRevision: Number(mission.current_revision),
    missionPayloadDigest: mission.payload_sha256,
    resolutionId: resolution.id,
    resolutionRevision: Number(resolution.current_revision),
    resolutionDigest: resolution.resolution_snapshot_sha256,
    observedAt: observed,
    status: 'incomplete',
    components,
  };
}
