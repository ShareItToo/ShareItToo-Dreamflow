import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSyntheticQuorumDisplay, syntheticQuorumDisplayFixture } from './support/mission_quorum_web_fixture.js';
import { missionNeedDigest as digest } from '../src/mission_need_workflow.js';
import { readFile } from 'node:fs/promises';
import { quorumRootBinding, projectMissionQuorum } from '../src/mission_quorum_projection.js';

test('A2a exposes only exact validated synthetic slots and method, bound to A1 and visible bytes', () => {
  const { source, fixtures, namespace } = syntheticQuorumDisplayFixture();
  const value = buildSyntheticQuorumDisplay({ source, fixtures, namespace });
  assert.equal(value.digest, digest(value.envelope));
  assert.equal(value.envelope.bindingStatus, 'non_binding');
  assert.equal(value.envelope.projectionDigest, digest(value.envelope.projection));
  assert.equal(value.envelope.details.length, 2);
  assert.equal(value.envelope.details[0].pickup.slots.filter((s) => s.present).length, 4);
  assert.equal(value.envelope.details[0].return.verification.method, 'six_digit_fallback');
  assert.equal(value.envelope.details[0].return.verification.codeLength, 6);
});

test('A2a Flutter golden is the exact backend-derived display envelope', async () => {
  const file = await readFile(new URL('../../test/support/mission_quorum_web_golden.dart', import.meta.url), 'utf8');
  const golden = JSON.parse(file.match(/p7DisplayGoldenJson = r'''(.*)''';/u)[1]);
  const value = buildSyntheticQuorumDisplay(syntheticQuorumDisplayFixture());
  assert.deepEqual(golden, value);
  assert.ok(file.includes(`p7DisplayGoldenDigest = '${value.digest}'`));
});

test('A2a rejects real identity, wrong principal, duplicate/missing bound evidence, QR binding and fallback shape', () => {
  for (const change of [
    (x) => { x.namespace = 'production'; },
    (x) => { x.fixtures[0].binding.ownerId = 'real-user'; },
    (x) => { x.fixtures[0].binding.bookingId = 'real-booking'; },
    (x) => { x.fixtures[0].pickup.photos[0].evidenceId = 'real-evidence'; },
    (x) => { x.fixtures[0].pickup.photos[1].slot = 'overview'; },
    (x) => { x.fixtures[0].pickup.photos[0].binding = x.fixtures[1].binding; },
    (x) => { x.fixtures[0].pickup.confirmation.evidenceSetDigest = 'f'.repeat(64); },
    (x) => { x.fixtures[0].pickup.verification.verifierId = x.fixtures[0].binding.ownerId; },
    (x) => { x.fixtures[0].pickup.verification.binding = x.fixtures[1].binding; },
    (x) => { x.fixtures[0].return.verification.codeLength = 5; },
    (x) => { x.fixtures[0].return.verification.codeLength = 7; },
    (x) => { x.fixtures[0].return.verification.digitsOnly = false; },
    (x) => { x.fixtures[0].pickup.photos.pop(); },
  ]) {
    const x = syntheticQuorumDisplayFixture(); change(x);
    assert.throws(() => buildSyntheticQuorumDisplay(x), /mission_quorum_|p7_display_/u);
  }
});

test('A2a rejects validly rebound parent IDs outside the synthetic fixture namespace', () => {
  const x = syntheticQuorumDisplayFixture();
  x.source.mission.id = 'mission_need_11111111-1111-4111-8111-111111111111';
  x.source.resolution.mission_need_id = x.source.mission.id;
  x.source.resolution.id = 'mission_inventory_11111111-1111-4111-8111-111111111111';
  for (const a of x.source.assignments) a.resolution_id = x.source.resolution.id;
  const p = projectMissionQuorum(x.source).projection;
  x.fixtures.forEach((f, i) => {
    f.root = quorumRootBinding(x.source);
    f.binding.sourceDigest = p.components[i].sourceDigest;
    for (const name of ['pickup', 'return']) {
      const hash = digest(f[name].photos);
      f[name].confirmation.evidenceSetDigest = hash;
      f[name].verification.evidenceSetDigest = hash;
    }
  });
  assert.doesNotThrow(() => projectMissionQuorum(x.source, x.fixtures));
  assert.throws(() => buildSyntheticQuorumDisplay(x), /p7_display_/u);
});

test('A2a missing photo stays 3/4 with no inferred confirmation or verification', () => {
  const x = syntheticQuorumDisplayFixture();
  x.fixtures[0].pickup.photos.pop();
  delete x.fixtures[0].pickup.confirmation; delete x.fixtures[0].pickup.verification;
  const result = buildSyntheticQuorumDisplay(x).envelope;
  assert.equal(result.projection.components[0].axes.pickup, 'unknown');
  assert.equal(result.details[0].pickup.slots.length, 4);
  assert.equal(result.details[0].pickup.slots.filter((s) => s.present).length, 3);
  assert.equal(result.details[0].pickup.verification, null);
  assert.equal(result.details[0].pickup.confirmation, null);
});

test('A2a whitelist drops extraneous text and media, while rejection/timeout/dispute remain per component', () => {
  const x = syntheticQuorumDisplayFixture();
  x.fixtures[0].unapprovedText = 'DO-NOT-EXPOSE';
  x.fixtures[0].pickup.photos[0].privateMedia = 'DO-NOT-EXPOSE';
  // The original evidence-set binding must track the changed synthetic fixture bytes.
  const evidenceSetDigest = digest(x.fixtures[0].pickup.photos);
  x.fixtures[0].pickup.confirmation.evidenceSetDigest = evidenceSetDigest;
  x.fixtures[0].pickup.verification.evidenceSetDigest = evidenceSetDigest;
  x.fixtures[0].acceptance = 'rejected';
  let value = buildSyntheticQuorumDisplay(x);
  assert.doesNotMatch(JSON.stringify(value), /DO-NOT-EXPOSE/u);
  assert.equal(value.envelope.projection.status, 'incomplete');
  x.fixtures[0].acceptance = 'timeout';
  assert.equal(buildSyntheticQuorumDisplay(x).envelope.projection.status, 'readback_required');
  x.fixtures[0].returnState = 'needsReview';
  x.fixtures[0].returnCase = { id: `${x.namespace}:return-case`, binding: x.fixtures[0].binding, status: 'needsReview' };
  value = buildSyntheticQuorumDisplay(x);
  assert.equal(value.envelope.projection.status, 'needs_clarification');
  assert.equal(value.envelope.projection.components[0].axes.dispute, 'open');
  assert.equal(value.envelope.projection.components[1].axes.dispute, 'none');
});

test('A2a optional conflict remains globally visible, source/caller objects are never changed', () => {
  const x = syntheticQuorumDisplayFixture();
  x.source.mission.payload.needs = [
    { needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 },
    { needKey: 'optional_tool', necessity: 'optional', quantity: 1 },
  ];
  x.source.mission.payload_sha256 = digest(x.source.mission.payload);
  x.source.resolution.mission_payload_sha256 = x.source.mission.payload_sha256;
  Object.assign(x.source.assignments[1], { slot_key: 'optional:optional_tool:1', need_key: 'optional_tool', necessity: 'optional', slot_ordinal: 1 });
  Object.assign(x.source.resolution.resolution_snapshot.slots[1], { slotKey: 'optional:optional_tool:1', needKey: 'optional_tool', necessity: 'optional', ordinal: 1 });
  x.source.resolution.resolution_snapshot_sha256 = digest(x.source.resolution.resolution_snapshot);
  const bare = projectMissionQuorum(x.source).projection;
  for (const f of x.fixtures) {
    f.root = quorumRootBinding(x.source);
    const component = bare.components.find((c) => c.itemId === f.binding.itemId);
    f.binding.slotKey = component.slotKey; f.binding.sourceDigest = component.sourceDigest;
    for (const name of ['pickup', 'return']) {
      const setDigest = digest(f[name].photos);
      f[name].confirmation.evidenceSetDigest = setDigest; f[name].verification.evidenceSetDigest = setDigest;
    }
  }
  x.fixtures[1].returnState = 'needsReview';
  const before = structuredClone(x);
  assert.equal(buildSyntheticQuorumDisplay(x).envelope.projection.status, 'needs_clarification');
  assert.deepEqual(x, before);
});
