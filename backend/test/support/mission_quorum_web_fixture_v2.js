// Test-support only: no executable, server, I/O, storage or product entry point.
import { missionNeedDigest as digest } from '../../src/mission_need_workflow.js';
import { projectMissionQuorumV2 } from '../../src/mission_quorum_projection_v2.js';
import { bookingGroupEvidenceSlots as slots } from '../../src/booking_group_handover_domain.js';

export const displayVersion = 'P7-A2-display-v2-2026-10-03.1';
const namespacePattern = /^p7v2-synthetic-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const check = (condition) => { if (!condition) throw new Error('p7_display_v2_invalid'); };
const equal = (a, b) => digest(a) === digest(b);

// Validate all caller bytes before any display read, clone or digest. V2 rejects
// private extras and executable shapes; this wrapper never strips them to pass.
export function buildSyntheticQuorumDisplayV2(input) {
  try { return build(input); } catch { throw new Error('p7_display_v2_invalid'); }
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function build(input) {
  const result = projectMissionQuorumV2(input);
  const { context: { namespace }, fixtures } = structuredClone(input);
  check(namespacePattern.test(namespace));
  const p = result.projection;
  check(p.components.length === 2);
  const principal = (id) => typeof id === 'string'
    && id.startsWith(`${namespace}:principal:`) && /^[a-zA-Z0-9:_-]+$/u.test(id);
  check(principal(p.missionOwnerId) && p.components.every((c) => principal(c.ownerId))
    && new Set(p.components.map((c) => c.ownerId)).size === 2);
  const used = new Set();
  const identity = (id) => {
    check(typeof id === 'string' && id.startsWith(`${namespace}:`) && /^[a-zA-Z0-9:_-]+$/u.test(id)
      && id.length < 240 && !used.has(id)); used.add(id);
  };
  const details = p.components.map((c) => {
    const f = fixtures.find((x) => x.binding.slotKey === c.slotKey);
    const empty = (name) => ({ segment: name,
      presenterId: name === 'pickup' ? c.ownerId : p.missionOwnerId,
      verifierId: name === 'pickup' ? p.missionOwnerId : c.ownerId,
      evidenceSetDigest: null, slots: slots.map((slot) => ({ slot, present: false,
        evidenceId: null, uploadId: null, uploadSha256: null })), confirmation: null, verification: null });
    if (!f) {
      check(c.lifecycleDigest === undefined);
      return { slotKey: c.slotKey, sourceDigest: c.sourceDigest, lifecycleDigest: null,
        bookingBindingDigest: null, returnState: null, returnCaseStatus: null,
        pickup: empty('pickup'), return: empty('return') };
    }
    check(f.synthetic === true && f.authentic === false && c.itemType === 'listing');
    // A rejected/unknown attempt must not display impossible later lifecycle truth.
    if (f.acceptance !== 'accepted') check(!f.pickup && !f.return && !f.contract
      && !f.payment && !f.refund && !f.payout && !f.returnCase
      && (!f.returnState || f.returnState === 'not_started'));
    if (f.return) check(f.pickup && c.axes.pickup === 'evidenced');
    const returnCaseStatus = f.returnCase?.status ?? null;
    const openCase = ['needsReview', 'awaitingResponse', 'unresolved'].includes(returnCaseStatus);
    check((c.axes.dispute === 'open') === openCase);
    identity(f.id);
    for (const key of ['bookingId', 'contractId', 'quoteId']) identity(f.binding[key]);
    // A1 hashes its normalized fixture with the server-derived slotKey.
    check(digest({ ...f, slotKey: c.slotKey }) === c.lifecycleDigest);
    const segment = (name) => {
      const s = f[name];
      const presenterId = name === 'pickup' ? c.ownerId : p.missionOwnerId;
      const verifierId = name === 'pickup' ? p.missionOwnerId : c.ownerId;
      if (!s) return { segment: name, presenterId, verifierId, evidenceSetDigest: null,
        slots: slots.map((slot) => ({ slot, present: false, evidenceId: null, uploadId: null, uploadSha256: null })),
        confirmation: null, verification: null };
      check(equal(s.binding, f.binding) && s.segment === name);
      const photos = slots.map((slot) => s.photos.find((photo) => photo.slot === slot)).filter(Boolean);
      check(photos.length === s.photos.length);
      const evidenceSetDigest = digest(photos);
      for (const photo of photos) { identity(photo.evidenceId); identity(photo.uploadId); }
      const confirmation = s.confirmation;
      const verification = s.verification;
      if (confirmation) {
        identity(confirmation.id);
        check(photos.length === 4 && equal(confirmation.binding, f.binding)
          && confirmation.segment === name && confirmation.actorId === verifierId
          && confirmation.evidenceSetDigest === evidenceSetDigest
          && ['confirmed', 'deviation'].includes(confirmation.decision));
      }
      if (verification) {
        identity(verification.id);
        check(confirmation && photos.length === 4 && equal(verification.binding, f.binding)
          && verification.segment === name && verification.verifierId === verifierId
          && verification.presenterId === presenterId && verification.evidenceSetDigest === evidenceSetDigest
          && verification.verified === true && (verification.method === 'qr_v3'
            || (verification.method === 'six_digit_fallback' && verification.codeLength === 6 && verification.digitsOnly === true)));
      }
      return { segment: name, presenterId, verifierId, evidenceSetDigest,
        slots: slots.map((slot) => {
          const photo = photos.find((x) => x.slot === slot);
          return { slot, present: Boolean(photo), evidenceId: photo?.evidenceId ?? null,
            uploadId: photo?.uploadId ?? null, uploadSha256: photo?.uploadSha256 ?? null };
        }),
        confirmation: confirmation ? { decision: confirmation.decision, actorId: verifierId, evidenceSetDigest } : null,
        verification: verification ? { method: verification.method, presenterId, verifierId, evidenceSetDigest,
          codeLength: verification.method === 'six_digit_fallback' ? 6 : null,
          digitsOnly: verification.method === 'six_digit_fallback' ? true : null } : null };
    };
    if (f.returnCase) identity(f.returnCase.id);
    return { slotKey: c.slotKey, sourceDigest: c.sourceDigest, lifecycleDigest: c.lifecycleDigest,
      bookingBindingDigest: digest(f.binding), returnState: f.returnState ?? null,
      returnCaseStatus, pickup: segment('pickup'), return: segment('return') };
  });
  const envelope = { version: displayVersion, namespace, synthetic: true, authentic: false,
    bindingStatus: 'non_binding', projection: p, projectionDigest: result.digest, details };
  return freeze({ envelope, digest: digest(envelope) });
}

const namespace = 'p7v2-synthetic-00000000-0000-4000-8000-000000000001';
const id = (kind, n = 1) => `${namespace}:${kind}:${n}`;
const clone = (x) => structuredClone(x);
const rootKeys = ['missionNeedId', 'missionOwnerId', 'missionRevision', 'missionPayloadDigest',
  'resolutionId', 'resolutionRevision', 'resolutionDigest', 'fitSourceSnapshotDigest'];
function fixture() {
  const payload = { title: 'Synthetic mission fixture', status: 'planned', needs: [
    { needKey: 'synthetic_need_1', necessity: 'required', quantity: 2 },
  ] };
  const listings = [1, 2].map((n) => ({ id: id('listing', n), owner_id: id('principal', n + 1),
    status: 'active', is_active: true, moderation_status: 'active', catalog_revision: 1, availability_revision: 1 }));
  const snapshot = { slots: listings.map((l, i) => ({ slotKey: `required:synthetic_need_1:${i + 1}`,
    needKey: 'synthetic_need_1', necessity: 'required', ordinal: i + 1,
    gapReason: null, assignment: { listingId: l.id, catalogRevision: 1, availabilityRevision: 1,
      quote: { quoteHash: 'a'.repeat(64), availabilityRevision: 1, preview: true, persisted: false } } })) };
  const source = { mission: { id: id('mission'), owner_id: id('principal'), current_revision: 1, payload, payload_sha256: digest(payload) },
    resolution: { id: id('resolution'), owner_id: id('principal'), mission_need_id: id('mission'), current_revision: 1,
      revision_id: id('revision'), mission_need_revision: 1, mission_payload_sha256: digest(payload),
      resolution_snapshot: snapshot, resolution_snapshot_sha256: digest(snapshot) },
    assignments: snapshot.slots.map((s) => ({ revision_id: id('revision'), resolution_id: id('resolution'), resolution_revision: 1,
      slot_key: s.slotKey, need_key: s.needKey, necessity: s.necessity, slot_ordinal: s.ordinal, listing_id: s.assignment.listingId,
      listing_snapshot: { listingId: s.assignment.listingId, catalogRevision: 1, availabilityRevision: 1 }, quote_snapshot: clone(s.assignment.quote), gap_reason: null })),
    listings, demands: [], fits: [], observedAt: '2026-10-03T12:00:00.000Z' };
  return { context: { version: 'P7-synthetic-context-v2', namespace, synthetic: true, authentic: false }, source, fixtures: [] };
}
function lifecycle(x) {
  const p = projectMissionQuorumV2(x).projection;
  x.fixtures = p.components.map((c, i) => {
    const binding = { slotKey: c.slotKey, itemId: c.itemId, ownerId: c.ownerId, renterId: p.missionOwnerId,
      sourceDigest: c.sourceDigest, bookingId: id('booking', i + 1), contractId: id('contract', i + 1), quoteId: id('quote', i + 1),
      quoteHash: digest(x.source.assignments.find((a) => a.slot_key === c.slotKey).quote_snapshot) };
    const f = { id: id('fixture', i + 1), synthetic: true, authentic: false,
      root: Object.fromEntries(rootKeys.map((key) => [key, p[key]])), binding,
      acceptance: 'accepted', contract: 'bound', payment: 'paid', refund: 'none', payout: 'held', dispute: 'none', returnState: 'reportWindowOpen' };
    for (const [j, segment] of ['pickup', 'return'].entries()) {
      const presenterId = segment === 'pickup' ? c.ownerId : p.missionOwnerId;
      const verifierId = segment === 'pickup' ? p.missionOwnerId : c.ownerId;
      const photos = slots.map((slot, k) => ({ binding, segment, slot, actorId: presenterId,
        uploadPurpose: segment === 'pickup' ? 'handover_evidence' : 'return_evidence',
        evidenceId: id('evidence', 1 + i * 8 + j * 4 + k), uploadId: id('upload', 1 + i * 8 + j * 4 + k),
        uploadSha256: 'e'.repeat(64), synthetic: true, authentic: false }));
      const evidenceSetDigest = digest(photos);
      f[segment] = { binding, segment, photos,
        confirmation: { id: id('confirmation', 1 + i * 2 + j), binding, segment, actorId: verifierId, evidenceSetDigest, decision: 'confirmed' },
        verification: { id: id('verification', 1 + i * 2 + j), binding, segment, presenterId, verifierId, evidenceSetDigest,
          verified: true, method: j ? 'six_digit_fallback' : 'qr_v3', ...(j ? { codeLength: 6, digitsOnly: true } : {}) } };
    }
    return f;
  });
  return x;
}
function supply() {
  const x = fixture(); const s = x.source; const a = s.assignments[0];
  Object.assign(a, { listing_id: null, listing_snapshot: null, quote_snapshot: null, gap_reason: 'no_current_unique_candidate' });
  Object.assign(s.resolution.resolution_snapshot.slots[0], { assignment: null, gapReason: a.gap_reason });
  s.resolution.resolution_snapshot_sha256 = digest(s.resolution.resolution_snapshot); s.listings.shift();
  s.demands = [{ id: id('demand'), slot_key: a.slot_key, requester_id: id('principal'), recipient_id: id('principal', 2),
    mission_need_id: s.mission.id, mission_need_revision: 1, mission_payload_sha256: s.mission.payload_sha256,
    resolution_id: s.resolution.id, resolution_revision: 1, need_key: a.need_key, necessity: a.necessity,
    slot_ordinal: a.slot_ordinal, quantity: 1, purpose: 'mission_gap_supply_v1', shelf_owner_id: id('principal', 2),
    expires_at: '2026-11-01T00:00:00.000Z', current_status: 'released', current_revision: 2,
    revision_status: 'released', revision_number: 2, revision_actor_id: id('principal', 2),
    release_id: id('release'), release_recipient_id: id('principal', 2), release_shelf_item_id: id('shelf'),
    candidate_shelf_item_id: id('shelf'), released_revision: 2, participation_status: 'active', participation_revision: 1,
    item_availability_status: 'confirmed_available', item_revision: 1 }];
  s.fits = [{ id: id('fit'), shelf_item_id: id('shelf'), need_key: a.need_key, owner_id: s.mission.owner_id,
    mission_need_id: s.mission.id, shelf_owner_id: s.mission.owner_id, mission_need_revision: 1,
    mission_payload_sha256: s.mission.payload_sha256, shelf_snapshot_sha256: digest({ shelfItemId: id('shelf') }),
    live_shelf_snapshot: { shelfItemId: id('shelf') }, revision: 1, evaluation: { status: 'fit', releaseBlocked: false } }];
  return x;
}

// Closed invented catalog, not observations of people or a persisted attempt.
export function syntheticQuorumDisplayFixtureV2(scenario = 'complete') {
  check(['complete', 'partial', 'rejected', 'timeout', 'optional_conflict', 'released', 'deviation'].includes(scenario));
  if (scenario === 'released') return supply();
  const x = fixture();
  if (scenario === 'optional_conflict') {
    x.source.mission.payload.needs = [
      { needKey: 'synthetic_need_1', necessity: 'required', quantity: 1 },
      { needKey: 'synthetic_need_2', necessity: 'optional', quantity: 1 },
    ];
    x.source.mission.payload_sha256 = digest(x.source.mission.payload);
    x.source.resolution.mission_payload_sha256 = x.source.mission.payload_sha256;
    Object.assign(x.source.assignments[1], { slot_key: 'optional:synthetic_need_2:1',
      need_key: 'synthetic_need_2', necessity: 'optional', slot_ordinal: 1 });
    Object.assign(x.source.resolution.resolution_snapshot.slots[1], {
      slotKey: 'optional:synthetic_need_2:1', needKey: 'synthetic_need_2', necessity: 'optional', ordinal: 1 });
    x.source.resolution.resolution_snapshot_sha256 = digest(x.source.resolution.resolution_snapshot);
  }
  lifecycle(x);
  if (scenario === 'partial') {
    x.fixtures[0].pickup.photos.pop(); delete x.fixtures[0].pickup.confirmation;
    delete x.fixtures[0].pickup.verification; delete x.fixtures[0].return;
    x.fixtures[0].returnState = 'not_started';
  }
  if (['rejected', 'timeout'].includes(scenario)) {
    const f = x.fixtures[0]; f.acceptance = scenario;
    for (const key of ['contract', 'payment', 'refund', 'payout', 'pickup', 'return']) delete f[key];
    f.returnState = 'not_started';
  }
  if (scenario === 'optional_conflict') {
    const f = x.fixtures[0]; f.returnState = 'reportWindowOpen';
    f.returnCase = { id: id('returncase'), binding: clone(f.binding), status: 'needsReview' };
  }
  if (scenario === 'deviation') x.fixtures[0].return.confirmation.decision = 'deviation';
  return x;
}
