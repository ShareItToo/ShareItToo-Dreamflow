// Dormant synthetic-only successor. No adapter, persistence or action authority.
// Deliberately duplicated projection rules: V1's frozen consumer boundary forbids
// a new source consumer. Parity tests own this bounded maintenance debt.
import { types } from 'node:util';
import { missionNeedDigest as digest, normalizeMissionNeedPayload } from './mission_need_workflow.js';
import { bookingGroupEvidenceSlots } from './booking_group_handover_domain.js';

export const missionQuorumProjectionV2Version = 'P7-A1-synthetic-v2-2026-10-03.1';
const invalid = () => { throw new Error('mission_quorum_v2_invalid'); };
const check = (ok) => { if (!ok) invalid(); };
const scalar = (predicate) => ({ scalar: predicate });
const enumeration = (...values) => scalar((v) => values.includes(v));
const integer = scalar((v) => Number.isSafeInteger(v) && v > 0 && v <= 1000000);
const hash = scalar((v) => typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v));
const timestamp = scalar((v) => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
const nullable = (schema) => ({ nullable: schema });
const optional = (schema) => ({ optional: schema });
const list = (schema, max = 5000) => ({ list: schema, max });
const record = (fields) => ({ fields });
const bool = enumeration(true, false);
const namespaceSchema = scalar((v) => typeof v === 'string'
  && /^p7v2-synthetic-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v));
const contextSchema = record({ version: enumeration('P7-synthetic-context-v2'),
  namespace: namespaceSchema, synthetic: enumeration(true), authentic: enumeration(false) });

// Read only own enumerable data descriptors. Reject proxies before any trap can
// run; no coercion, accessor, custom prototype, hidden key or caller toJSON.
function detached(value, schema, budget = { remaining: 100000 }, depth = 0) {
  check(--budget.remaining >= 0 && depth < 40);
  check(!types.isProxy(value));
  if (schema.optional) return detached(value, schema.optional, budget, depth);
  if (schema.nullable) return value === null ? null : detached(value, schema.nullable, budget, depth);
  if (schema.scalar) { check(schema.scalar(value)); return value; }
  check(value !== null && typeof value === 'object');
  const proto = Object.getPrototypeOf(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (schema.list) {
    check(Array.isArray(value) && proto === Array.prototype);
    const length = descriptors.length?.value;
    check(Number.isSafeInteger(length) && length >= 0 && length <= schema.max && keys.length === length + 1);
    const result = [];
    for (let i = 0; i < length; i++) {
      const d = descriptors[String(i)];
      check(d && Object.hasOwn(d, 'value') && d.enumerable);
      result.push(detached(d.value, schema.list, budget, depth + 1));
    }
    return result;
  }
  check(!Array.isArray(value) && (proto === Object.prototype || proto === null));
  check(keys.every((key) => typeof key === 'string' && Object.hasOwn(schema.fields, key)));
  const result = {};
  for (const [key, child] of Object.entries(schema.fields)) {
    const d = descriptors[key];
    if (!d && child.optional) continue;
    check(d && Object.hasOwn(d, 'value') && d.enumerable);
    result[key] = detached(d.value, child, budget, depth + 1);
  }
  return result;
}

function schemas(namespace) {
  // Typed numeric fixture tokens cannot carry names, addresses or arbitrary text.
  const id = (...kinds) => scalar((v) => typeof v === 'string' && kinds.some((kind) =>
    v.startsWith(`${namespace}:${kind}:`) && /^[1-9][0-9]{0,8}$/u.test(v.slice(namespace.length + kind.length + 2))));
  const principal = id('principal');
  const need = scalar((v) => typeof v === 'string' && /^synthetic_need_[1-9][0-9]{0,2}$/u.test(v));
  const slot = scalar((v) => typeof v === 'string' && /^(required|optional):synthetic_need_[1-9][0-9]{0,2}:[1-9][0-9]{0,2}$/u.test(v));
  const necessity = enumeration('required', 'optional');
  const gap = nullable(enumeration('no_current_unique_candidate', 'no_candidate', 'unknown_fit'));
  const quote = record({ quoteHash: hash, availabilityRevision: integer,
    preview: enumeration(true), persisted: enumeration(false), currency: optional(enumeration('EUR')) });
  const listingSnapshot = record({ listingId: id('listing'), catalogRevision: integer, availabilityRevision: integer });
  const assignmentSnapshot = record({ ...listingSnapshot.fields, quote });
  const root = record({ missionNeedId: id('mission'), missionOwnerId: principal, missionRevision: integer,
    missionPayloadDigest: hash, resolutionId: id('resolution'), resolutionRevision: integer,
    resolutionDigest: hash, fitSourceSnapshotDigest: hash });
  const binding = record({ slotKey: slot, itemId: id('listing', 'shelf'), ownerId: principal, renterId: principal,
    sourceDigest: hash, bookingId: id('booking'), contractId: id('contract'), quoteId: id('quote'), quoteHash: hash });
  const segmentName = enumeration('pickup', 'return');
  const evidence = record({ binding, segment: segmentName, slot: enumeration(...bookingGroupEvidenceSlots),
    actorId: principal, uploadPurpose: enumeration('handover_evidence', 'return_evidence'),
    evidenceId: id('evidence'), uploadId: id('upload'), uploadSha256: hash, synthetic: enumeration(true), authentic: enumeration(false) });
  const segment = record({ binding, segment: segmentName, photos: list(evidence, 4),
    confirmation: optional(record({ id: id('confirmation'), binding, segment: segmentName, actorId: principal,
      evidenceSetDigest: hash, decision: enumeration('confirmed', 'deviation') })),
    verification: optional(record({ id: id('verification'), binding, segment: segmentName, presenterId: principal, verifierId: principal,
      evidenceSetDigest: hash, verified: enumeration(true), method: enumeration('qr_v3', 'six_digit_fallback'),
      codeLength: optional(enumeration(6)), digitsOnly: optional(enumeration(true)) })) });
  const demandStatus = enumeration('pending', 'released', 'rejected', 'revoked');
  return {
    source: record({
      mission: record({ id: id('mission'), owner_id: principal, current_revision: integer,
        payload: record({ title: enumeration('Synthetic mission fixture'), status: enumeration('draft', 'planned'),
          needs: list(record({ needKey: need, necessity, quantity: scalar((v) => Number.isSafeInteger(v) && v >= 1 && v <= 100) }), 50) }),
        payload_sha256: hash }),
      resolution: record({ id: id('resolution'), owner_id: principal, mission_need_id: id('mission'), current_revision: integer,
        revision_id: id('revision'), mission_need_revision: integer, mission_payload_sha256: hash,
        resolution_snapshot: record({ slots: list(record({ slotKey: slot, needKey: need, necessity, ordinal: integer,
          assignment: nullable(assignmentSnapshot), gapReason: gap })) }), resolution_snapshot_sha256: hash }),
      assignments: list(record({ revision_id: id('revision'), resolution_id: id('resolution'), resolution_revision: integer,
        slot_key: slot, need_key: need, necessity, slot_ordinal: integer, listing_id: nullable(id('listing')),
        listing_snapshot: nullable(listingSnapshot), quote_snapshot: nullable(quote), gap_reason: gap })),
      listings: list(record({ id: id('listing'), owner_id: principal, status: enumeration('active', 'inactive'),
        is_active: bool, moderation_status: enumeration('active', 'pending', 'blocked'), catalog_revision: integer, availability_revision: integer })),
      demands: list(record({ id: id('demand'), slot_key: slot, requester_id: principal, recipient_id: principal,
        mission_need_id: id('mission'), mission_need_revision: integer, mission_payload_sha256: hash,
        resolution_id: id('resolution'), resolution_revision: integer, need_key: need, necessity, slot_ordinal: integer,
        quantity: enumeration(1), purpose: enumeration('mission_gap_supply_v1'), shelf_owner_id: principal,
        expires_at: timestamp, current_status: demandStatus, current_revision: integer, revision_status: demandStatus,
        revision_number: integer, revision_actor_id: principal, release_id: nullable(id('release')),
        release_recipient_id: nullable(principal), release_shelf_item_id: nullable(id('shelf')),
        candidate_shelf_item_id: id('shelf'), released_revision: nullable(integer),
        participation_status: enumeration('active', 'paused', 'withdrawn'), participation_revision: integer,
        item_availability_status: enumeration('confirmed_available', 'unavailable', 'unknown'), item_revision: integer })),
      fits: list(record({ id: id('fit'), shelf_item_id: id('shelf'), need_key: need, owner_id: principal,
        mission_need_id: id('mission'), shelf_owner_id: principal, mission_need_revision: integer, mission_payload_sha256: hash,
        shelf_snapshot_sha256: hash, live_shelf_snapshot: record({ shelfItemId: id('shelf') }),
        revision: integer, evaluation: record({ status: enumeration('fit', 'unknown', 'not_fit'), releaseBlocked: bool }) })),
      observedAt: timestamp,
    }),
    fixtures: list(record({ id: id('fixture'), synthetic: enumeration(true), authentic: enumeration(false), root, binding,
      acceptance: optional(enumeration('accepted', 'rejected', 'timeout')), contract: optional(enumeration('bound')),
      payment: optional(enumeration('paid', 'pending', 'failed')), refund: optional(enumeration('none', 'pending', 'refunded')),
      payout: optional(enumeration('held', 'pending', 'paid')), dispute: optional(enumeration('none', 'open', 'resolved')),
      pickup: optional(segment), return: optional(segment),
      returnState: optional(enumeration('not_started', 'awaitingReturnConfirmation', 'reportWindowOpen', 'needsReview', 'payoutEligible', 'closed')),
      returnCase: optional(record({ id: id('returncase'), binding, status: enumeration('submitted', 'needsReview', 'awaitingResponse', 'unresolved', 'closed') })) })),
  };
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/** Synthetic data assertion only, never proof of server origin or real authority. */
export function projectMissionQuorumV2(input) {
  try {
    // Context first, but never access a caller property before descriptor checks.
    check(!types.isProxy(input) && input && typeof input === 'object');
    check(Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null);
    const fields = Object.getOwnPropertyDescriptors(input);
    check(Reflect.ownKeys(fields).length === 3 && ['context', 'source', 'fixtures'].every((key) =>
      fields[key] && Object.hasOwn(fields[key], 'value') && fields[key].enumerable));
    const context = detached(fields.context.value, contextSchema);
    const schema = schemas(context.namespace);
    const source = detached(fields.source.value, schema.source);
    const fixtures = detached(fields.fixtures.value, schema.fixtures);
    // All caller bytes have passed recursive shape/identity validation before
    // any digest, domain helper or projection evaluation occurs.
    const uniqueIds = new Set();
    const take = (id) => { check(!uniqueIds.has(id)); uniqueIds.add(id); };
    for (const fixture of fixtures) {
      const a = source.assignments.find((row) => row.slot_key === fixture.binding.slotKey);
      check(a && a.quote_snapshot !== null && fixture.binding.quoteHash === digest(a.quote_snapshot));
      for (const value of [fixture.id, fixture.binding.bookingId, fixture.binding.contractId, fixture.binding.quoteId]) take(value);
      for (const name of ['pickup', 'return']) {
        const s = fixture[name]; if (!s) continue;
        for (const photo of s.photos) { take(photo.evidenceId); take(photo.uploadId); }
        if (s.confirmation) take(s.confirmation.id);
        if (s.verification) {
          take(s.verification.id);
          check(s.verification.method === 'qr_v3'
            ? !Object.hasOwn(s.verification, 'codeLength') && !Object.hasOwn(s.verification, 'digitsOnly')
            : s.verification.codeLength === 6 && s.verification.digitsOnly === true);
        }
      }
      if (fixture.returnCase) take(fixture.returnCase.id);
    }
    const { projection } = projectValidated(source, fixtures);
    projection.version = missionQuorumProjectionV2Version;
    projection.context = context;
    return freeze({ projection, digest: digest(projection) });
  } catch { invalid(); }
}
function requireTruth(value, code) { if (!value) invalid(); }
function equal(a, b) { return digest(a) === digest(b); }
function unique(rows, key) {
  requireTruth(new Set(rows.map((r) => r[key])).size === rows.length, 'collision');
  return new Map(rows.map((r) => [r[key], r]));
}
function iso(value) {
  requireTruth(value != null && Number.isFinite(new Date(value).getTime()), 'timestamp');
  return new Date(value).toISOString();
}

function quorumRootBinding({ mission, resolution, fits = [] }) {
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
function projectValidated(source, fixtures = []) {
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
  const projection = { version: missionQuorumProjectionV2Version, ...root, observedAt,
    synthetic: true, bindingStatus: 'non_binding', status, components,
    replayClaim: 'none', persisted: false };
  return { projection, digest: digest(projection) };
}
