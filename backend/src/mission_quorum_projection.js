// P7-A1 is an in-memory observation contract, never an acceptance coordinator.
import { missionNeedDigest as digest, normalizeMissionNeedPayload } from './mission_need_workflow.js';
import { bookingGroupEvidenceSlots } from './booking_group_handover_domain.js';

export const missionQuorumProjectionVersion = 'P7-A1-2026-10-03.1';
export class MissionQuorumError extends Error {
  constructor(code) { super(`mission_quorum_${code}`); this.code = this.message; }
}
function requireTruth(value, code) { if (!value) throw new MissionQuorumError(code); }
function equal(a, b) { return digest(a) === digest(b); }
function unique(rows, key) {
  requireTruth(new Set(rows.map((r) => r[key])).size === rows.length, 'collision');
  return new Map(rows.map((r) => [r[key], r]));
}
function iso(value) {
  requireTruth(value != null && Number.isFinite(new Date(value).getTime()), 'timestamp');
  return new Date(value).toISOString();
}

export function quorumRootBinding({ mission, resolution, fits = [] }) {
  return { missionNeedId: mission.id, missionOwnerId: mission.owner_id,
    missionRevision: Number(mission.current_revision), missionPayloadDigest: mission.payload_sha256,
    resolutionId: resolution.id, resolutionRevision: Number(resolution.current_revision),
    resolutionDigest: resolution.resolution_snapshot_sha256,
    fitSourceSnapshotDigest: digest(fits) };
}

function demandState(d, mission, resolution, slot, observedAt) {
  if (!d) return { itemId: null, ownerId: null, release: 'not_bound', available: 'unknown' };
  requireTruth(d.requester_id === mission.owner_id && d.recipient_id !== mission.owner_id
    && d.mission_need_id === mission.id && Number(d.mission_need_revision) === Number(mission.current_revision)
    && d.mission_payload_sha256 === mission.payload_sha256
    && d.resolution_id === resolution.id
    && Number(d.resolution_revision) === Number(resolution.current_revision)
    && d.need_key === slot.needKey && d.necessity === slot.necessity
    && Number(d.slot_ordinal) === slot.ordinal && d.quantity === 1
    && d.purpose === 'mission_gap_supply_v1' && d.shelf_owner_id === d.recipient_id,
  'demand_binding');
  requireTruth(d.revision_status === d.current_status
    && Number(d.revision_number) === Number(d.current_revision), 'demand_revision');
  const expired = iso(d.expires_at) <= observedAt;
  if (d.current_status === 'released' || d.current_status === 'revoked') {
    const releaseRevision = Number(d.current_revision) - (d.current_status === 'revoked' ? 1 : 0);
    requireTruth(d.release_id && d.release_recipient_id === d.recipient_id
      && d.release_shelf_item_id === d.candidate_shelf_item_id
      && Number(d.released_revision) === releaseRevision
      && d.revision_actor_id === d.recipient_id, 'release_binding');
  }
  const release = expired && d.current_status === 'released' ? 'expired'
    : expired && d.current_status === 'pending' ? 'expired_no_response' : d.current_status;
  const available = d.participation_status === 'active'
    && d.item_availability_status === 'confirmed_available' && !expired
    ? 'observed_available' : 'unknown';
  return { itemId: d.candidate_shelf_item_id, ownerId: d.recipient_id, release, available };
}

function fitState(fits, mission, itemId, ownerId, needKey) {
  const relevant = fits.filter((f) => f.shelf_item_id === itemId && f.need_key === needKey);
  if (!relevant.length) return 'unknown';
  // P4 is explicitly a same-owner contract. Never reuse it for a P6 recipient.
  requireTruth(relevant.every((f) => f.owner_id === mission.owner_id
    && f.mission_need_id === mission.id && f.shelf_owner_id === mission.owner_id), 'fit_principal');
  if (ownerId !== mission.owner_id) return 'unknown';
  if (relevant.length !== 1) return 'unknown';
  const f = relevant[0];
  if (Number(f.mission_need_revision) !== Number(mission.current_revision)
    || f.mission_payload_sha256 !== mission.payload_sha256
    || f.shelf_snapshot_sha256 !== digest(f.live_shelf_snapshot)) return 'unknown';
  return f.evaluation?.status === 'fit' && f.evaluation.releaseBlocked === false ? 'fit' : 'unknown';
}

const lifecycleAxes = ['acceptance', 'contract', 'payment', 'pickup', 'return', 'refund', 'payout', 'dispute'];
const choices = {
  acceptance: ['accepted', 'rejected', 'timeout'], contract: ['bound'],
  payment: ['paid', 'pending', 'failed'], refund: ['none', 'pending', 'refunded'],
  payout: ['held', 'pending', 'paid'], dispute: ['none', 'open', 'resolved'],
};

function evidenceState(fixture, segment, binding) {
  const state = fixture[segment];
  if (!state) return 'unknown';
  const presenter = segment === 'pickup' ? binding.ownerId : binding.renterId;
  const verifier = segment === 'pickup' ? binding.renterId : binding.ownerId;
  const purpose = segment === 'pickup' ? 'handover_evidence' : 'return_evidence';
  requireTruth(equal(state.binding, binding) && state.segment === segment, 'segment_binding');
  const photos = state.photos;
  requireTruth(Array.isArray(photos), 'evidence');
  unique(photos, 'evidenceId'); unique(photos, 'uploadId'); unique(photos, 'slot');
  for (const photo of photos) {
    requireTruth(equal(photo.binding, binding) && photo.segment === segment
      && photo.actorId === presenter && photo.uploadPurpose === purpose
      && photo.synthetic === true && photo.authentic === false
      && bookingGroupEvidenceSlots.includes(photo.slot)
      && /^[0-9a-f]{64}$/u.test(photo.uploadSha256 ?? ''), 'evidence_binding');
  }
  if (photos.length !== 4) return 'unknown';
  const set = bookingGroupEvidenceSlots.map((slot) => photos.find((p) => p.slot === slot));
  const setDigest = digest(set);
  if (!state.confirmation || !state.verification) return 'unknown';
  const c = state.confirmation; const v = state.verification;
  requireTruth(equal(c.binding, binding) && equal(v.binding, binding)
    && c.segment === segment && v.segment === segment
    && c.actorId === verifier && v.verifierId === verifier && v.presenterId === presenter
    && c.evidenceSetDigest === setDigest && v.evidenceSetDigest === setDigest,
  'confirmation_binding');
  requireTruth(v.verified === true && (v.method === 'qr_v3'
    || (v.method === 'six_digit_fallback' && v.codeLength === 6 && v.digitsOnly === true)),
  'verification');
  requireTruth(['confirmed', 'deviation'].includes(c.decision), 'confirmation');
  if (c.decision === 'deviation') return 'needs_clarification';
  return 'evidenced';
}

function applyLifecycle(component, fixture, root) {
  if (!fixture) return;
  requireTruth(fixture.synthetic === true && fixture.authentic === false, 'synthetic_marker');
  const b = fixture.binding;
  requireTruth(equal(fixture.root, root) && b.slotKey === component.slotKey
    && b.itemId === component.itemId && b.ownerId === component.ownerId
    && b.renterId === root.missionOwnerId && b.sourceDigest === component.sourceDigest,
  'fixture_parent');
  requireTruth(b.bookingId && b.contractId && b.quoteId && /^[0-9a-f]{64}$/u.test(b.quoteHash ?? ''), 'fixture_contract');
  for (const [axis, allowed] of Object.entries(choices)) {
    if (fixture[axis] !== undefined) {
      requireTruth(allowed.includes(fixture[axis]), 'fixture_axis');
      component.axes[axis] = fixture[axis];
    }
  }
  for (const segment of ['pickup', 'return']) component.axes[segment] = evidenceState(fixture, segment, b);
  if (fixture.returnState !== undefined) requireTruth(['not_started', 'awaitingReturnConfirmation',
    'reportWindowOpen', 'needsReview', 'payoutEligible', 'closed'].includes(fixture.returnState), 'return_state');
  const open = ['needsReview', 'awaitingResponse', 'unresolved'].includes(fixture.returnCase?.status);
  if (fixture.returnCase) requireTruth(equal(fixture.returnCase.binding, b)
    && ['submitted', 'needsReview', 'awaitingResponse', 'unresolved', 'closed'].includes(fixture.returnCase.status), 'return_case_binding');
  if ((fixture.returnState === 'needsReview') !== open) component.axes.return = 'needs_clarification';
  if (open) { component.axes.return = 'needs_clarification'; component.axes.dispute = 'open'; }
  component.lifecycleDigest = digest(fixture);
}

/** Pure projection of a complete, transaction-scoped server snapshot. No raw payload is returned. */
export function projectMissionQuorum(source, fixtures = []) {
  const { mission, resolution, assignments, listings, demands, fits } = source;
  const observedAt = iso(source.observedAt);
  requireTruth(resolution.owner_id === mission.owner_id && resolution.mission_need_id === mission.id, 'principal');
  requireTruth(Number(resolution.mission_need_revision) === Number(mission.current_revision)
    && resolution.mission_payload_sha256 === mission.payload_sha256, 'revision');
  requireTruth(digest(mission.payload) === mission.payload_sha256
    && digest(resolution.resolution_snapshot) === resolution.resolution_snapshot_sha256, 'source_digest');
  const needs = normalizeMissionNeedPayload(mission.payload).needs;
  const slots = needs.flatMap((n) => Array.from({ length: n.quantity }, (_, i) => ({
    slotKey: `${n.necessity}:${n.needKey}:${i + 1}`, needKey: n.needKey, necessity: n.necessity, ordinal: i + 1,
  }))).sort((a, b) => a.slotKey.localeCompare(b.slotKey));
  const assigned = unique(assignments, 'slot_key');
  const stored = unique(resolution.resolution_snapshot.slots, 'slotKey');
  requireTruth(assignments.length === slots.length && stored.size === slots.length, 'slots_incomplete');
  const listingMap = unique(listings, 'id'); const demandMap = unique(demands, 'slot_key');
  const fixtureMap = unique(fixtures.map((f) => ({ ...f, slotKey: f.binding.slotKey })), 'slotKey');
  requireTruth([...demandMap.keys(), ...fixtureMap.keys()].every((k) => assigned.has(k)), 'unknown_slot');
  const root = quorumRootBinding(source);
  const itemIds = new Set(); const bookingIds = new Set();
  const components = slots.map((slot) => {
    const a = assigned.get(slot.slotKey); const s = stored.get(slot.slotKey);
    requireTruth(a && s && a.revision_id === resolution.revision_id
      && a.resolution_id === resolution.id && Number(a.resolution_revision) === root.resolutionRevision
      && a.need_key === slot.needKey && a.necessity === slot.necessity && Number(a.slot_ordinal) === slot.ordinal
      && s.needKey === slot.needKey && s.necessity === slot.necessity && s.ordinal === slot.ordinal
      && a.listing_id === (s.assignment?.listingId ?? null)
      && a.gap_reason === s.gapReason, 'slot_binding');
    const d = demandMap.get(slot.slotKey);
    requireTruth(!(d && a.listing_id), 'collision');
    let state = demandState(d, mission, resolution, slot, observedAt);
    const listing = listingMap.get(a.listing_id);
    if (a.listing_id) {
      requireTruth(listing && a.listing_snapshot?.listingId === listing.id
        && equal(a.quote_snapshot, s.assignment.quote)
        && Object.entries(a.listing_snapshot).every(([k, v]) => equal(v, s.assignment[k])), 'listing_binding');
      state = { itemId: listing.id, ownerId: listing.owner_id, release: 'not_bound',
        available: listing.status === 'active' && listing.is_active === true
          && listing.moderation_status === 'active'
          && Number(listing.catalog_revision) === s.assignment.catalogRevision
          && Number(listing.availability_revision) === s.assignment.availabilityRevision
          ? 'observed_available' : 'unknown' };
    }
    if (state.itemId) {
      requireTruth(!itemIds.has(state.itemId), 'collision'); itemIds.add(state.itemId);
    }
    const itemType = a.listing_id ? 'listing' : d ? 'private_shelf' : null;
    const relevantFits = itemType === 'private_shelf' ? fits.filter((f) => f.shelf_item_id === state.itemId) : [];
    const component = { ...slot, itemId: state.itemId, itemType, ownerId: state.ownerId,
      bindingStatus: 'non_binding', sourceDigest: digest({ assignment: a, listing: listing ?? null,
        demand: d ?? null, fits: relevantFits }),
      axes: { availability: state.available, fit: itemType === 'private_shelf'
        ? fitState(fits, mission, state.itemId, state.ownerId, slot.needKey) : 'unknown',
        supplyRelease: state.release, ...Object.fromEntries(lifecycleAxes.map((axis) => [axis,
          ['acceptance', 'contract'].includes(axis) ? 'not_bound' : 'unknown'])) } };
    const fixture = fixtureMap.get(slot.slotKey);
    if (fixture) {
      requireTruth(!bookingIds.has(fixture.binding.bookingId), 'collision');
      bookingIds.add(fixture.binding.bookingId);
      applyLifecycle(component, fixture, root);
    }
    component.status = Object.values(component.axes).includes('needs_clarification') ? 'needs_clarification'
      : component.axes.acceptance === 'timeout' ? 'readback_required' : 'incomplete';
    // No P7 legal/acceptance or foreign-owner Fit adapter is approved. Even a fully
    // evidenced synthetic lifecycle cannot manufacture a complete binding quorum.
    return component;
  });
  const required = components.filter((c) => c.necessity === 'required');
  const status = components.some((c) => c.status === 'needs_clarification') ? 'needs_clarification'
    : required.some((c) => c.status === 'readback_required') ? 'readback_required' : 'incomplete';
  const projection = { version: missionQuorumProjectionVersion, ...root, observedAt,
    synthetic: true, bindingStatus: 'non_binding', status, components,
    replayClaim: 'none', persisted: false };
  return { projection, digest: digest(projection) };
}
