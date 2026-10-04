// Test-support only: no executable, server, I/O, storage or product entry point.
import { missionNeedDigest as digest } from '../../src/mission_need_workflow.js';
import { projectMissionQuorum, quorumRootBinding } from '../../src/mission_quorum_projection.js';
import { bookingGroupEvidenceSlots as slots } from '../../src/booking_group_handover_domain.js';

export const displayVersion = 'P7-A2a-display-2026-10-03.1';
const namespacePattern = /^p7a1-synthetic-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const check = (condition) => { if (!condition) throw new Error('p7_display_fixture_invalid'); };
const equal = (a, b) => digest(a) === digest(b);

export function buildSyntheticQuorumDisplay({ source, fixtures, namespace }) {
  check(namespacePattern.test(namespace));
  const result = projectMissionQuorum(source, fixtures);
  const p = result.projection;
  const fixtureUuid = namespace.slice('p7a1-synthetic-'.length);
  check(p.missionNeedId === `mission_need_${fixtureUuid}`
    && p.resolutionId === `mission_inventory_${fixtureUuid}`);
  check(p.components.length === 2 && fixtures.length === 2);
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
    check(f && f.synthetic === true && f.authentic === false && c.itemType === 'listing');
    check(c.itemId.startsWith(`${namespace}:listing:`));
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
      bookingBindingDigest: digest(f.binding), pickup: segment('pickup'), return: segment('return') };
  });
  const envelope = { version: displayVersion, namespace, synthetic: true, authentic: false,
    bindingStatus: 'non_binding', projection: p, projectionDigest: result.digest, details };
  return { envelope, digest: digest(envelope) };
}

export function syntheticQuorumDisplayFixture() {
  const namespace = 'p7a1-synthetic-00000000-0000-4000-8000-000000000002';
  const renter = `${namespace}:principal:renter`;
  const payload = { title: 'Synthetic display only', status: 'planned', needs: [
    { needKey: 'plant_container_equipment', necessity: 'required', quantity: 2 },
  ] };
  const mission = { id: 'mission_need_00000000-0000-4000-8000-000000000002', owner_id: renter,
    current_revision: 1, payload, payload_sha256: digest(payload) };
  const resolution = { id: 'mission_inventory_00000000-0000-4000-8000-000000000002', owner_id: renter,
    mission_need_id: mission.id, current_revision: 1, revision_id: '00000000-0000-4000-8000-000000000002',
    mission_need_revision: 1, mission_payload_sha256: mission.payload_sha256 };
  const listings = [1, 2].map((i) => ({ id: `${namespace}:listing:${i}`, owner_id: `${namespace}:principal:owner${i}`,
    status: 'active', is_active: true, moderation_status: 'active', catalog_revision: 1, availability_revision: 1 }));
  const snapshotSlots = listings.map((l, i) => ({ slotKey: `required:plant_container_equipment:${i + 1}`,
    needKey: 'plant_container_equipment', necessity: 'required', ordinal: i + 1, gapReason: null,
    assignment: { listingId: l.id, catalogRevision: 1, availabilityRevision: 1,
      quote: { quoteHash: 'a'.repeat(64), availabilityRevision: 1, preview: true, persisted: false } } }));
  resolution.resolution_snapshot = { slots: snapshotSlots };
  resolution.resolution_snapshot_sha256 = digest(resolution.resolution_snapshot);
  const assignments = snapshotSlots.map((s) => ({ revision_id: resolution.revision_id, resolution_id: resolution.id,
    resolution_revision: 1, slot_key: s.slotKey, need_key: s.needKey, necessity: s.necessity,
    slot_ordinal: s.ordinal, listing_id: s.assignment.listingId, gap_reason: null,
    listing_snapshot: { listingId: s.assignment.listingId, catalogRevision: 1, availabilityRevision: 1 },
    quote_snapshot: s.assignment.quote }));
  const source = { mission, resolution, listings, assignments, fits: [], demands: [], observedAt: '2026-10-03T12:00:00.000Z' };
  const projection = projectMissionQuorum(source).projection;
  const fixtures = projection.components.map((c, i) => {
    const id = (name) => `${namespace}:fixture${i}:${name}`;
    const binding = { slotKey: c.slotKey, itemId: c.itemId, ownerId: c.ownerId, renterId: renter,
      sourceDigest: c.sourceDigest, bookingId: id('booking'), contractId: id('contract'), quoteId: id('quote'), quoteHash: 'a'.repeat(64) };
    const f = { id: id('fixture'), synthetic: true, authentic: false, root: quorumRootBinding(source), binding,
      acceptance: 'accepted', contract: 'bound', payment: 'paid', refund: 'none', payout: 'held', dispute: 'none', returnState: 'reportWindowOpen' };
    for (const name of ['pickup', 'return']) {
      const presenterId = name === 'pickup' ? c.ownerId : renter;
      const verifierId = name === 'pickup' ? renter : c.ownerId;
      const photos = slots.map((slot) => ({ binding, segment: name, slot, actorId: presenterId,
        uploadPurpose: name === 'pickup' ? 'handover_evidence' : 'return_evidence',
        evidenceId: id(`${name}-${slot}-evidence`), uploadId: id(`${name}-${slot}-upload`),
        uploadSha256: 'e'.repeat(64), synthetic: true, authentic: false }));
      const evidenceSetDigest = digest(photos);
      f[name] = { binding, segment: name, photos,
        confirmation: { id: id(`${name}-confirmation`), binding, segment: name, actorId: verifierId, evidenceSetDigest, decision: 'confirmed' },
        verification: { id: id(`${name}-verification`), binding, segment: name, presenterId, verifierId, evidenceSetDigest,
          method: name === 'pickup' ? 'qr_v3' : 'six_digit_fallback', verified: true,
          ...(name === 'return' ? { codeLength: 6, digitsOnly: true } : {}) } };
    }
    return f;
  });
  return { namespace, source, fixtures };
}
