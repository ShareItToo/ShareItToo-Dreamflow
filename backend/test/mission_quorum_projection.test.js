import assert from 'node:assert/strict';
import test from 'node:test';
import { missionNeedDigest } from '../src/mission_need_workflow.js';
import { projectMissionQuorum, quorumRootBinding } from '../src/mission_quorum_projection.js';
import { createSyntheticQuorumFixtureAdapter, readSyntheticMissionQuorum } from '../src/mission_quorum_projection_workflow.js';
import { bookingGroupEvidenceSlots } from '../src/booking_group_handover_domain.js';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

function source() {
  const payload = { title: 'Synthetic P7', status: 'planned', needs: [
    { needKey: 'plant_container_equipment', necessity: 'required', quantity: 2 },
  ] };
  const mission = { id: 'mission', owner_id: 'owner', current_revision: 1,
    payload, payload_sha256: missionNeedDigest(payload) };
  const slots = [1, 2].map((ordinal) => ({ slotKey: `required:plant_container_equipment:${ordinal}`,
    needKey: 'plant_container_equipment', necessity: 'required', ordinal,
    assignment: null, gapReason: 'no_current_unique_candidate' }));
  const resolution = { id: 'resolution', owner_id: 'owner', mission_need_id: mission.id,
    current_revision: 1, revision_id: 'revision', mission_need_revision: 1,
    mission_payload_sha256: mission.payload_sha256, resolution_snapshot: { slots },
    resolution_snapshot_sha256: missionNeedDigest({ slots }) };
  return { mission, resolution, assignments: slots.map((s) => ({
    revision_id: 'revision', resolution_id: 'resolution', resolution_revision: 1,
    slot_key: s.slotKey, need_key: s.needKey, necessity: s.necessity,
    slot_ordinal: s.ordinal, listing_id: null, gap_reason: s.gapReason,
    listing_snapshot: null, quote_snapshot: null,
  })), listings: [], demands: [], fits: [], observedAt: '2026-10-03T12:00:00.000Z' };
}

test('P7 derives every required slot and missing lifecycle never means complete', () => {
  const value = projectMissionQuorum(source());
  assert.equal(value.projection.components.length, 2);
  assert.equal(value.projection.status, 'incomplete');
  assert.equal(value.projection.bindingStatus, 'non_binding');
  assert.equal(value.digest, missionNeedDigest(value.projection));
  assert.equal(value.projection.components[0].axes.acceptance, 'not_bound');
});

test('P7 rejects omitted, duplicate or reparented slots with equal counts', () => {
  for (const change of [
    (s) => s.assignments.pop(),
    (s) => { s.assignments[1] = s.assignments[0]; },
    (s) => { s.assignments[0].resolution_id = 'other'; },
    (s) => { s.resolution.owner_id = 'other'; },
  ]) {
    const s = source(); change(s);
    assert.throws(() => projectMissionQuorum(s), /mission_quorum_/u);
  }
});

test('P7 digest repeats for unchanged bytes and changes with observed source drift', () => {
  const s = source();
  assert.deepEqual(projectMissionQuorum(s), projectMissionQuorum(structuredClone(s)));
  const previous = projectMissionQuorum(s).digest;
  s.observedAt = '2026-10-03T12:00:01.000Z';
  assert.notEqual(projectMissionQuorum(s).digest, previous);
  s.mission.current_revision++;
  assert.throws(() => projectMissionQuorum(s), /mission_quorum_revision/u);
});

function assignedSource() {
  const s = source();
  for (const [i, a] of s.assignments.entries()) {
    const listing = { id: `listing-${i}`, owner_id: `owner-${i}`, status: 'active',
      is_active: true, moderation_status: 'active', catalog_revision: 1, availability_revision: 1 };
    s.listings.push(listing);
    const snapshot = { listingId: listing.id, catalogRevision: 1, availabilityRevision: 1 };
    const quote = { quoteHash: 'a'.repeat(64), availabilityRevision: 1, preview: true, persisted: false };
    Object.assign(a, { listing_id: listing.id, listing_snapshot: snapshot, quote_snapshot: quote, gap_reason: null });
    Object.assign(s.resolution.resolution_snapshot.slots[i], { assignment: { ...snapshot, quote }, gapReason: null });
  }
  s.resolution.resolution_snapshot_sha256 = missionNeedDigest(s.resolution.resolution_snapshot);
  return s;
}

function lifecycle(s) {
  const p = projectMissionQuorum(s).projection;
  return p.components.map((c, i) => {
    const binding = { slotKey: c.slotKey, itemId: c.itemId, ownerId: c.ownerId,
      renterId: p.missionOwnerId, sourceDigest: c.sourceDigest, bookingId: `booking-${i}`,
      contractId: `contract-${i}`, quoteId: `quote-${i}`, quoteHash: 'a'.repeat(64) };
    const f = { synthetic: true, authentic: false, id: `fixture-${i}`,
      root: quorumRootBinding(s), binding, acceptance: 'accepted', contract: 'bound', payment: 'paid',
      refund: 'none', payout: 'held', dispute: 'none', returnState: 'reportWindowOpen' };
    for (const segment of ['pickup', 'return']) {
      const actorId = segment === 'pickup' ? binding.ownerId : binding.renterId;
      const verifier = segment === 'pickup' ? binding.renterId : binding.ownerId;
      const photos = bookingGroupEvidenceSlots.map((slot) => ({ binding, segment, slot, actorId,
        uploadPurpose: segment === 'pickup' ? 'handover_evidence' : 'return_evidence',
        evidenceId: `evidence-${i}-${segment}-${slot}`, uploadId: `upload-${i}-${segment}-${slot}`,
        uploadSha256: 'b'.repeat(64), synthetic: true, authentic: false }));
      const evidenceSetDigest = missionNeedDigest(photos);
      f[segment] = { binding, segment, photos,
        confirmation: { id: `confirmation-${i}-${segment}`, binding, segment, actorId: verifier,
          evidenceSetDigest, decision: 'confirmed' },
        verification: { id: `verification-${i}-${segment}`, binding, segment, presenterId: actorId,
          verifierId: verifier, evidenceSetDigest, method: 'qr_v3', verified: true } };
    }
    return f;
  });
}

test('P7 keeps all eleven axes separate and exact 4+4 synthetic evidence visible as evidence only', () => {
  const s = assignedSource(); const fixtures = lifecycle(s);
  const p = projectMissionQuorum(s, fixtures).projection;
  assert.deepEqual(Object.keys(p.components[0].axes), ['availability', 'fit', 'supplyRelease',
    'acceptance', 'contract', 'payment', 'pickup', 'return', 'refund', 'payout', 'dispute']);
  assert.equal(p.components[0].axes.pickup, 'evidenced');
  assert.equal(p.components[0].axes.return, 'evidenced');
  assert.equal(p.components[0].axes.fit, 'unknown');
  assert.equal(p.status, 'incomplete');
  const v = fixtures[0].pickup.verification;
  Object.assign(v, { method: 'six_digit_fallback', codeLength: 6, digitsOnly: true });
  assert.equal(projectMissionQuorum(s, fixtures).projection.components[0].axes.pickup, 'evidenced');
  v.codeLength = 5;
  assert.throws(() => projectMissionQuorum(s, fixtures), /verification/u);
});

test('P7 rejects swapped booking, principal, quote, segment, purpose and evidence set at unchanged counts', () => {
  const changes = [
    (f) => { f[0].binding = { ...f[0].binding, ownerId: 'foreign' }; },
    (f) => { f[0].pickup.photos[0].binding = f[1].binding; },
    (f) => { f[0].pickup.confirmation.binding = { ...f[0].binding, bookingId: 'foreign' }; },
    (f) => { f[0].pickup.verification.binding = { ...f[0].binding, quoteId: 'foreign' }; },
    (f) => { f[0].pickup.photos[0].actorId = 'foreign'; },
    (f) => { f[0].pickup.photos[0].segment = 'return'; },
    (f) => { f[0].pickup.photos[0].uploadPurpose = 'return_evidence'; },
    (f) => { f[0].pickup.confirmation.evidenceSetDigest = 'c'.repeat(64); },
    (f) => { f[0].pickup.verification.verifierId = 'foreign'; },
    (f) => { f[0].pickup.photos[1].slot = f[0].pickup.photos[0].slot; },
    (f) => { f[0].pickup.photos[1].uploadId = f[0].pickup.photos[0].uploadId; },
    (f) => { f[0].pickup.photos[0].authentic = true; },
  ];
  for (const change of changes) {
    const s = assignedSource(); const f = lifecycle(s); change(f);
    assert.throws(() => projectMissionQuorum(s, f), /mission_quorum_/u);
  }
});

test('P7 missing photo, partial rejection, timeout and conflicting return review remain honest', () => {
  const s = assignedSource(); const f = lifecycle(s);
  f[0].pickup.photos.pop();
  assert.equal(projectMissionQuorum(s, f).projection.components[0].axes.pickup, 'unknown');
  f[0].acceptance = 'rejected';
  assert.equal(projectMissionQuorum(s, f).projection.status, 'incomplete');
  f[0].acceptance = 'timeout';
  assert.equal(projectMissionQuorum(s, f).projection.status, 'readback_required');
  f[0].returnState = 'needsReview';
  let p = projectMissionQuorum(s, f).projection;
  assert.equal(p.status, 'needs_clarification');
  assert.equal(p.components[1].axes.dispute, 'none');
  assert.equal(p.components[1].axes.return, 'evidenced');
  f[0].returnCase = { id: 'case', binding: f[0].binding, status: 'needsReview' };
  p = projectMissionQuorum(s, f).projection;
  assert.equal(p.components[0].axes.dispute, 'open');
  assert.equal(p.components[1].axes.dispute, 'none');
  f[0].returnCase.binding = f[1].binding;
  assert.throws(() => projectMissionQuorum(s, f), /return_case_binding/u);
});

test('P7 source correction invalidates previously bound synthetic observations', () => {
  for (const change of [
    (s) => { s.listings[0].availability_revision++; },
    (s) => { s.listings[0].catalog_revision++; },
    (s) => { s.listings[0].owner_id = 'other'; },
    (s) => { s.resolution.current_revision++; },
    (s) => { s.mission.current_revision++; },
  ]) {
    const s = assignedSource(); const f = lifecycle(s); change(s);
    assert.throws(() => projectMissionQuorum(s, f), /mission_quorum_/u);
  }
});

test('P7 rejects double article assignment even when aggregate slot counts match', () => {
  const s = assignedSource();
  Object.assign(s.assignments[1], { listing_id: s.assignments[0].listing_id,
    listing_snapshot: s.assignments[0].listing_snapshot, quote_snapshot: s.assignments[0].quote_snapshot });
  s.resolution.resolution_snapshot.slots[1].assignment = s.resolution.resolution_snapshot.slots[0].assignment;
  s.resolution.resolution_snapshot_sha256 = missionNeedDigest(s.resolution.resolution_snapshot);
  assert.throws(() => projectMissionQuorum(s), /collision/u);
});

function releasedSource() {
  const s = source(); const a = s.assignments[0];
  s.demands.push({ id: 'demand', slot_key: a.slot_key, requester_id: 'owner', recipient_id: 'foreign-owner',
    mission_need_id: 'mission', mission_need_revision: 1, mission_payload_sha256: s.mission.payload_sha256,
    resolution_id: 'resolution', resolution_revision: 1, need_key: a.need_key, necessity: a.necessity,
    slot_ordinal: a.slot_ordinal, quantity: 1, purpose: 'mission_gap_supply_v1', shelf_owner_id: 'foreign-owner',
    expires_at: '2026-11-01T00:00:00.000Z', current_status: 'released', current_revision: 2,
    revision_status: 'released', revision_number: 2, revision_actor_id: 'foreign-owner',
    release_id: 'release', release_recipient_id: 'foreign-owner', release_shelf_item_id: 'shelf',
    candidate_shelf_item_id: 'shelf', released_revision: 2,
    participation_status: 'active', item_availability_status: 'confirmed_available' });
  return s;
}

test('P7 released is not accepted and same-owner P4 is never applied to a foreign P6 Shelf', () => {
  const s = releasedSource();
  let p = projectMissionQuorum(s).projection;
  assert.equal(p.components[0].axes.supplyRelease, 'released');
  assert.equal(p.components[0].axes.acceptance, 'not_bound');
  assert.equal(p.components[0].axes.fit, 'unknown');
  s.fits = [{ shelf_item_id: 'shelf', need_key: s.assignments[0].need_key, owner_id: 'foreign-owner',
    mission_need_id: 'mission', shelf_owner_id: 'foreign-owner', evaluation: { status: 'fit', releaseBlocked: false } }];
  assert.throws(() => projectMissionQuorum(s), /fit_principal/u);
  s.fits = [];
  const previous = projectMissionQuorum(s).digest;
  Object.assign(s.demands[0], { current_status: 'revoked', current_revision: 3, revision_status: 'revoked', revision_number: 3 });
  p = projectMissionQuorum(s);
  assert.notEqual(p.digest, previous);
  assert.equal(p.projection.components[0].axes.supplyRelease, 'revoked');
});

test('P7 workflow fails closed without its test adapter or with non-synthetic identity before SQL', async () => {
  const pool = { connect() { throw new Error('must not connect'); } };
  await assert.rejects(() => readSyntheticMissionQuorum(pool, { actorId: 'real' }), /adapter_required/u);
  const adapter = createSyntheticQuorumFixtureAdapter({ namespace: 'p7a1-synthetic-00000000-0000-4000-8000-000000000001', read: () => [] });
  await assert.rejects(() => readSyntheticMissionQuorum(pool, { actorId: 'real', adapter }), /synthetic_principal/u);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import {createSyntheticQuorumFixtureAdapter as create} from './src/mission_quorum_projection_workflow.js'; create({});"],
  { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /synthetic_adapter_unavailable/u);
});

test('P7 binds Fit-source drift and never aliases a Listing to an equal-ID Shelf', () => {
  const s = assignedSource();
  s.listings[0].owner_id = s.mission.owner_id;
  const liveShelf = { shelfItemId: s.listings[0].id };
  s.fits = [{ id: 'fit', shelf_item_id: s.listings[0].id, need_key: s.assignments[0].need_key,
    owner_id: s.mission.owner_id, mission_need_id: s.mission.id, shelf_owner_id: s.mission.owner_id,
    mission_need_revision: 1, mission_payload_sha256: s.mission.payload_sha256,
    shelf_snapshot_sha256: missionNeedDigest(liveShelf), live_shelf_snapshot: liveShelf,
    revision: 1, evaluation: { status: 'fit', releaseBlocked: false } }];
  const old = projectMissionQuorum(s);
  assert.equal(old.projection.components[0].itemType, 'listing');
  assert.equal(old.projection.components[0].axes.fit, 'unknown');
  const fixtures = lifecycle(s);
  s.fits[0].revision++;
  assert.notEqual(projectMissionQuorum(s).digest, old.digest);
  assert.throws(() => projectMissionQuorum(s, fixtures), /fixture_parent/u);
});

test('P7 expired releases still require their exact authoritative release record', () => {
  for (const change of [
    (d) => { d.release_id = null; },
    (d) => { d.release_recipient_id = 'wrong-owner'; },
    (d) => { d.release_shelf_item_id = 'wrong-shelf'; },
  ]) {
    const s = releasedSource(); s.demands[0].expires_at = '2026-10-01T00:00:00.000Z';
    change(s.demands[0]);
    assert.throws(() => projectMissionQuorum(s), /release_binding/u);
  }
  const s = releasedSource(); s.demands[0].expires_at = '2026-10-01T00:00:00.000Z';
  assert.equal(projectMissionQuorum(s).projection.components[0].axes.supplyRelease, 'expired');
});

test('P7 optional component contradictions require clarification without turning optional absence into a requirement', () => {
  const s = assignedSource();
  s.mission.payload.needs = [
    { needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 },
    { needKey: 'optional_tool', necessity: 'optional', quantity: 1 },
  ];
  s.mission.payload_sha256 = missionNeedDigest(s.mission.payload);
  s.resolution.mission_payload_sha256 = s.mission.payload_sha256;
  Object.assign(s.assignments[1], { slot_key: 'optional:optional_tool:1', need_key: 'optional_tool', necessity: 'optional', slot_ordinal: 1 });
  Object.assign(s.resolution.resolution_snapshot.slots[1], { slotKey: 'optional:optional_tool:1', needKey: 'optional_tool', necessity: 'optional', ordinal: 1 });
  s.resolution.resolution_snapshot_sha256 = missionNeedDigest(s.resolution.resolution_snapshot);
  const f = lifecycle(s);
  const optional = f.find((entry) => entry.binding.slotKey.startsWith('optional:'));
  optional.acceptance = 'timeout';
  assert.equal(projectMissionQuorum(s, f).projection.status, 'incomplete');
  optional.returnState = 'needsReview';
  assert.equal(projectMissionQuorum(s, f).projection.status, 'needs_clarification');
});

test('P7 revoked demand retains an exact historical release binding before and after expiry', () => {
  for (const expiresAt of ['2026-11-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z']) {
    for (const change of [
      (d) => { d.release_id = null; },
      (d) => { d.release_recipient_id = 'wrong-owner'; },
      (d) => { d.release_shelf_item_id = 'wrong-shelf'; },
      (d) => { d.released_revision = d.current_revision; },
      (d) => { d.released_revision = 1; },
    ]) {
      const s = releasedSource();
      Object.assign(s.demands[0], { current_status: 'revoked', current_revision: 3,
        revision_status: 'revoked', revision_number: 3, expires_at: expiresAt });
      change(s.demands[0]);
      assert.throws(() => projectMissionQuorum(s), /release_binding/u);
    }
  }
});

test('P7 expiry preserves explicit decisions and distinguishes unanswered demand', () => {
  for (const [status, revision, expected] of [
    ['pending', 1, 'expired_no_response'], ['released', 2, 'expired'],
    ['rejected', 2, 'rejected'], ['revoked', 3, 'revoked'],
  ]) {
    const s = releasedSource();
    Object.assign(s.demands[0], { current_status: status, current_revision: revision,
      revision_status: status, revision_number: revision, expires_at: '2026-10-01T00:00:00.000Z' });
    if (status === 'pending' || status === 'rejected') s.demands[0].release_id = null;
    assert.equal(projectMissionQuorum(s).projection.components[0].axes.supplyRelease, expected);
  }
});

test('P7 remains absent from runtime, app, jobs and flags; only its test runner is wired', async () => {
  const root = new URL('../../', import.meta.url);
  const allowed = new Set([
    'backend/src/mission_quorum_projection.js',
    'backend/src/mission_quorum_projection_workflow.js',
    'tool/run_local_postgres_integration.mjs',
  ]);
  for (const directory of ['backend/src', 'backend/ops', 'lib', 'tool']) {
    for (const relative of await readdir(new URL(`${directory}/`, root), { recursive: true })) {
      const file = `${directory}/${relative}`;
      if (!/\.(?:js|mjs|dart|json)$/u.test(file) || allowed.has(file)) continue;
      const text = await readFile(new URL(file, root), 'utf8');
      assert.doesNotMatch(text, /mission_quorum_projection|readSyntheticMissionQuorum|createSyntheticQuorumFixtureAdapter/u,
        `${file} must not activate the unapproved synthetic lane`);
    }
  }
});
