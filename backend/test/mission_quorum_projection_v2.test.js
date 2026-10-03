import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { missionNeedDigest as digest } from '../src/mission_need_workflow.js';
import { bookingGroupEvidenceSlots as slots } from '../src/booking_group_handover_domain.js';
import { projectMissionQuorum as v1 } from '../src/mission_quorum_projection.js';
import { projectMissionQuorumV2 as project, missionQuorumProjectionV2Version } from '../src/mission_quorum_projection_v2.js';

const namespace = 'p7v2-synthetic-00000000-0000-4000-8000-000000000001';
const id = (kind, n = 1) => `${namespace}:${kind}:${n}`;
const clone = (x) => structuredClone(x);
const rootKeys = ['missionNeedId', 'missionOwnerId', 'missionRevision', 'missionPayloadDigest',
  'resolutionId', 'resolutionRevision', 'resolutionDigest', 'fitSourceSnapshotDigest'];
function fixture() {
  const payload = { title: 'Synthetic mission fixture', status: 'planned', needs: [
    { needKey: 'synthetic_need_1', necessity: 'required', quantity: 2 },
    { needKey: 'synthetic_need_2', necessity: 'optional', quantity: 1 },
  ] };
  const listings = [1, 2, 3].map((n) => ({ id: id('listing', n), owner_id: id('principal', n + 1),
    status: 'active', is_active: true, moderation_status: 'active', catalog_revision: 1, availability_revision: 1 }));
  const snapshot = { slots: listings.map((l, i) => ({ slotKey: i < 2 ? `required:synthetic_need_1:${i + 1}` : 'optional:synthetic_need_2:1',
    needKey: i < 2 ? 'synthetic_need_1' : 'synthetic_need_2', necessity: i < 2 ? 'required' : 'optional', ordinal: i < 2 ? i + 1 : 1,
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
  const p = v1(x.source).projection;
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
function reject(x) { assert.throws(() => project(x), (e) => e.message === 'mission_quorum_v2_invalid' && e.cause === undefined); }
function parity(x) {
  const result = project(x); const old = v1(x.source, x.fixtures);
  const p = clone(result.projection); delete p.context; p.version = old.projection.version;
  assert.deepEqual(p, old.projection);
  assert.equal(result.digest, digest(result.projection));
  assert.equal(result.projection.version, missionQuorumProjectionV2Version);
  assert.equal(result.projection.bindingStatus, 'non_binding');
  return result.projection;
}

test('V2 explicitly versioned synthetic bare/full projection preserves eleven V1 axes', () => {
  parity(fixture()); const p = parity(lifecycle(fixture()));
  assert.equal(Object.keys(p.components[0].axes).length, 11);
  assert.equal(p.status, 'incomplete');
  assert.equal(p.components[0].axes.pickup, 'evidenced');
  assert.equal(p.components[0].axes.return, 'evidenced');
});

test('V2 rejects missing/malformed/foreign context before source access', () => {
  for (const context of [undefined, null, {}, { ...fixture().context, version: 'v1' },
    { ...fixture().context, namespace: 'production' }, { ...fixture().context, authentic: true },
    { ...fixture().context, synthetic: false }]) reject({ ...fixture(), context });
});

test('V2 rejects every identity occurrence outside its exact namespace', () => {
  function visit(original, value, path = []) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const next = [...path, key];
      if (typeof child === 'string' && child.startsWith(`${namespace}:`)) {
        for (const replacement of ['real-person', child.replace(namespace, namespace.replace(/1$/u, '2')), child.replace(/:[0-9]+$/u, ':private-name')]) {
          const x = clone(original); let target = x; for (const k of next.slice(0, -1)) target = target[k];
          target[next.at(-1)] = replacement; reject(x);
        }
      } else visit(original, child, next);
    }
  }
  for (const original of [lifecycle(fixture()), supply()]) visit(original, original);
});

test('V2 recursively rejects extra private keys at every object and array nesting', () => {
  let count = 0;
  function visit(original, value, path = []) {
    if (!value || typeof value !== 'object') return;
    const x = clone(original); let target = x; for (const k of path) target = target[k];
    target.privatePayload = 'SYNTHETIC-REJECTED-MARKER'; reject(x); count++;
    for (const [key, child] of Object.entries(value)) visit(original, child, [...path, key]);
  }
  for (const original of [lifecycle(fixture()), supply()]) visit(original, original);
  assert.ok(count > 50);
});

test('V2 rejects executable, inherited, hidden, symbolic, cyclic and sparse input without invoking it', () => {
  let executed = 0;
  for (const mutate of [
    (x) => Object.defineProperty(x.source.mission, 'payload', { get() { executed++; return {}; } }),
    (x) => Object.defineProperty(x.source, 'hidden', { value: 'private' }),
    (x) => { x.source[Symbol('private')] = 1; },
    (x) => { x.source = Object.assign(Object.create({ inherited: true }), x.source); },
    (x) => { x.source = new Proxy(x.source, { ownKeys() { executed++; return []; } }); },
    (x) => { x.source.listings = new Proxy(x.source.listings, { get() { executed++; return 0; } }); },
    (x) => { delete x.source.listings[1]; },
    (x) => { x.source.mission.payload.title = x; },
    (x) => { x.source.observedAt = { toString() { executed++; return 'private'; } }; },
  ]) { const x = fixture(); mutate(x); reject(x); }
  assert.equal(executed, 0);
});

test('V2 rejects consistent quote rebind; quote hash means canonical complete source quote digest', () => {
  const x = lifecycle(fixture());
  x.fixtures[0].binding.quoteHash = x.source.assignments[0].quote_snapshot.quoteHash;
  for (const name of ['pickup', 'return']) {
    const d = digest(x.fixtures[0][name].photos);
    x.fixtures[0][name].confirmation.evidenceSetDigest = d; x.fixtures[0][name].verification.evidenceSetDigest = d;
  }
  assert.doesNotThrow(() => v1(x.source, x.fixtures)); reject(x);
});

test('V2 preserves partial rejection, timeout, 3/4 and optional ReturnCase conflict/dispute isolation', () => {
  for (const [change, expected] of [
    [(x) => { x.fixtures[1].acceptance = 'rejected'; }, 'incomplete'],
    [(x) => { x.fixtures[1].acceptance = 'timeout'; }, 'readback_required'],
    [(x) => { x.fixtures[0].pickup.photos.pop(); }, 'incomplete'],
    [(x) => { x.fixtures[0].returnState = 'needsReview'; }, 'needs_clarification'],
  ]) { const x = lifecycle(fixture()); change(x); assert.equal(parity(x).status, expected); }
  const x = lifecycle(fixture()); const optional = x.fixtures.find((f) => f.binding.slotKey.startsWith('optional:'));
  optional.returnState = 'needsReview'; optional.returnCase = { id: id('returncase'), binding: optional.binding, status: 'needsReview' };
  const p = parity(x); assert.equal(p.status, 'needs_clarification');
  assert.equal(p.components.filter((c) => c.axes.dispute === 'open').length, 1);
  optional.returnCase.binding = x.fixtures[1].binding; reject(x);
});

test('V2 preserves exact owner/parent/slot/booking/evidence binding and source drift rejection', () => {
  for (const change of [
    (x) => { x.source.assignments.pop(); },
    (x) => { x.source.assignments[1] = x.source.assignments[0]; },
    (x) => { x.source.resolution.owner_id = id('principal', 9); },
    (x) => { x.source.assignments[0].resolution_id = id('resolution', 9); },
    (x) => { x.source.listings[0].owner_id = id('principal', 9); },
    (x) => { x.source.listings[0].availability_revision++; },
    (x) => { x.source.mission.current_revision++; },
    (x) => { x.source.resolution.current_revision++; },
    (x) => { x.fixtures[0].binding.bookingId = x.fixtures[1].binding.bookingId; },
    (x) => { x.fixtures[0].pickup.photos[0].binding = x.fixtures[1].binding; },
    (x) => { x.fixtures[0].pickup.photos[0].actorId = id('principal', 9); },
    (x) => { x.fixtures[0].pickup.photos[1].slot = 'overview'; },
    (x) => { x.fixtures[0].pickup.verification.evidenceSetDigest = 'f'.repeat(64); },
    (x) => { x.fixtures[0].return.verification.codeLength = 5; },
  ]) { const x = lifecycle(fixture()); change(x); assert.throws(() => v1(x.source, x.fixtures)); reject(x); }
});

test('V2 deterministic detached output retains observedAt/source-digest separation', () => {
  const x = lifecycle(fixture()); const before = clone(x); const a = project(x);
  assert.deepEqual(a, project(clone(x))); assert.deepEqual(x, before);
  x.source.observedAt = '2026-10-03T12:00:01.000Z'; const b = project(x);
  assert.notEqual(a.digest, b.digest);
  assert.deepEqual(a.projection.components, b.projection.components);
  assert.ok(Object.isFrozen(a.projection.components[0].axes));
  x.fixtures[0].acceptance = 'rejected'; assert.equal(a.projection.components[0].axes.acceptance, 'accepted');
});

test('V2 preserves demand release/expiry/revocation and never lends foreign P4 Fit or acceptance', () => {
  for (const expired of [false, true]) for (const status of ['pending', 'released', 'rejected', 'revoked']) {
    const x = supply(); const d = x.source.demands[0];
    Object.assign(d, { current_status: status, revision_status: status,
      current_revision: status === 'revoked' ? 3 : 2, revision_number: status === 'revoked' ? 3 : 2 });
    if (expired) x.source.observedAt = '2026-11-02T00:00:00.000Z';
    const p = parity(x); const c = p.components.find((row) => row.itemType === 'private_shelf');
    assert.equal(c.axes.acceptance, 'not_bound'); assert.equal(c.axes.fit, 'unknown');
    assert.equal(c.axes.supplyRelease, expired && status === 'pending' ? 'expired_no_response'
      : expired && status === 'released' ? 'expired' : status);
    if (status === 'released' || status === 'revoked') {
      d.release_id = null; assert.throws(() => v1(x.source)); reject(x);
    }
  }
});

test('V2 preserves demand/principal/revision and Fit-source correction guards', () => {
  for (const change of [
    (x) => { x.source.demands[0].requester_id = id('principal', 8); },
    (x) => { x.source.demands[0].recipient_id = id('principal', 8); },
    (x) => { x.source.demands[0].release_shelf_item_id = id('shelf', 8); },
    (x) => { x.source.demands[0].revision_number++; },
    (x) => { x.source.demands[0].mission_need_revision++; },
    (x) => { x.source.fits[0].owner_id = id('principal', 8); },
    (x) => { x.source.fits[0].shelf_owner_id = id('principal', 8); },
  ]) { const x = supply(); change(x); assert.throws(() => v1(x.source)); reject(x); }
  const x = supply(); const before = parity(x); x.source.fits[0].revision++;
  const after = parity(x); assert.notEqual(before.fitSourceSnapshotDigest, after.fitSourceSnapshotDigest);
  assert.notEqual(before.components[1].sourceDigest, after.components[1].sourceDigest);
});

test('V2 preserves duplicate physical item rejection, all four named slots and deviation priority', () => {
  const x = fixture(); const s = x.source;
  Object.assign(s.assignments[1], { listing_id: s.assignments[0].listing_id,
    listing_snapshot: clone(s.assignments[0].listing_snapshot), quote_snapshot: clone(s.assignments[0].quote_snapshot) });
  s.resolution.resolution_snapshot.slots[1].assignment = clone(s.resolution.resolution_snapshot.slots[0].assignment);
  s.resolution.resolution_snapshot_sha256 = digest(s.resolution.resolution_snapshot);
  assert.throws(() => v1(s)); reject(x);
  for (const name of ['pickup', 'return']) for (const slot of slots) {
    const partial = lifecycle(fixture()); partial.fixtures[0][name].photos = partial.fixtures[0][name].photos.filter((p) => p.slot !== slot);
    assert.equal(parity(partial).components[0].axes[name], 'unknown');
  }
  const deviation = lifecycle(fixture()); deviation.fixtures[0].pickup.confirmation.decision = 'deviation';
  assert.equal(parity(deviation).status, 'needs_clarification');
});

test('V2 rejects closed-enum, omitted field, coerced revision and private value violations', () => {
  for (const change of [
    (x) => { delete x.source.mission.current_revision; },
    (x) => { x.source.mission.current_revision = '1'; },
    (x) => { x.source.mission.current_revision = 0; },
    (x) => { x.source.mission.payload.title = 'SYNTHETIC-PRIVATE-TEXT'; },
    (x) => { x.source.mission.payload.needs[0].needKey = 'private-name'; },
    (x) => { x.source.observedAt = '2026-02-30T12:00:00.000Z'; },
    (x) => { x.fixtures[0].payment = 'completed'; },
    (x) => { x.fixtures[0].pickup.verification.method = 'qr_v4'; },
    (x) => { x.fixtures[0].pickup.verification.codeLength = 6; },
    (x) => { delete x.fixtures[0].return.verification.digitsOnly; },
    (x) => { x.fixtures[0].binding.contractId = x.fixtures[1].binding.contractId; },
  ]) { const x = lifecycle(fixture()); change(x); reject(x); }
});

test('V2 has only exact projection/display test consumers and no I/O, provider or runtime imports', async () => {
  const root = new URL('../../', import.meta.url);
  for (const directory of ['backend/src', 'backend/test', 'backend/ops', 'lib', 'test', 'tool']) {
    for (const path of await readdir(new URL(`${directory}/`, root), { recursive: true })) {
      if (!/\.(js|mjs|dart|json)$/u.test(path) || ['backend/src/mission_quorum_projection_v2.js',
        'backend/test/mission_quorum_projection_v2.test.js',
        'backend/test/support/mission_quorum_web_fixture_v2.js',
        'test/tool/mission_quorum_web_preview_v2_contract.test.mjs'].includes(`${directory}/${path}`)) continue;
      assert.doesNotMatch(await readFile(new URL(`${directory}/${path}`, root), 'utf8'), /mission_quorum_projection_v2|projectMissionQuorumV2/u);
    }
  }
  const source = await readFile(new URL('../src/mission_quorum_projection_v2.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:process|console|fetch|setTimeout|setInterval|require)\b|Date\.now|Math\.random|import\s*\(/u);
  assert.deepEqual([...source.matchAll(/from '([^']+)'/gu)].map((m) => m[1]).sort(),
    ['./booking_group_handover_domain.js', './mission_need_workflow.js', 'node:util'].sort());
});
