import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { missionNeedDigest as digest } from '../src/mission_need_workflow.js';
import { buildSyntheticQuorumDisplayV2 as build, syntheticQuorumDisplayFixtureV2 as fixture } from './support/mission_quorum_web_fixture_v2.js';

const reject = (x) => assert.throws(() => build(x), (e) => e.message === 'p7_display_v2_invalid' && e.cause === undefined);
test('V2 display binds exact visible bytes, eleven axes and actual 4+4 QR/fallback fixture details', () => {
  const x = fixture(); const r = build(x); const p = r.envelope.projection;
  assert.equal(r.envelope.version, 'P7-A2-display-v2-2026-10-03.1');
  assert.equal(p.version, 'P7-A1-synthetic-v2-2026-10-03.1');
  assert.equal(r.digest, digest(r.envelope)); assert.equal(r.envelope.projectionDigest, digest(p));
  assert.equal(p.bindingStatus, 'non_binding'); assert.equal(p.persisted, false); assert.equal(p.replayClaim, 'none');
  for (const [i, c] of p.components.entries()) {
    assert.equal(Object.keys(c.axes).length, 11);
    assert.equal(x.fixtures[i].binding.quoteHash, digest(x.source.assignments[i].quote_snapshot));
    assert.equal(r.envelope.details[i].returnState, x.fixtures[i].returnState);
    assert.equal(r.envelope.details[i].returnCaseStatus, null);
    for (const name of ['pickup', 'return']) {
      const d = r.envelope.details[i][name];
      assert.deepEqual(d.slots.map((s) => s.slot), ['overview', 'detail', 'accessories', 'critical']);
      assert.equal(d.slots.filter((s) => s.present).length, 4);
      assert.equal(d.evidenceSetDigest, digest(x.fixtures[i][name].photos));
    }
    assert.equal(r.envelope.details[i].pickup.verification.method, 'qr_v3');
    assert.equal(r.envelope.details[i].return.verification.codeLength, 6);
  }
});
test('V2 golden catalog is byte-derived, never a relabelled V1 golden', async () => {
  const text = await readFile(new URL('../../test/support/mission_quorum_web_golden_v2.dart', import.meta.url), 'utf8');
  const catalog = JSON.parse(text.match(/p7V2DisplayCatalogJson =\s*r'''(.*)''';/u)[1]);
  for (const scenario of ['complete', 'partial', 'rejected', 'timeout', 'optional_conflict', 'released', 'deviation']) {
    assert.deepEqual(catalog[scenario], build(fixture(scenario)), scenario);
  }
  assert.equal(text.match(/p7V2DisplayGoldenDigest =\s*'([a-f0-9]{64})'/u)[1], build(fixture()).digest);
});
test('V2 rejects context, namespace, exact quote rebind, root/owner/booking swaps and private extras', () => {
  for (const change of [
    (x) => { delete x.context; }, (x) => { x.context.namespace = 'foreign'; },
    (x) => { x.privateText = 'PRIVATE-MARKER'; }, (x) => { x.source.mission.payload.privateText = 'PRIVATE-MARKER'; },
    (x) => { x.fixtures[0].pickup.photos[0].privateMedia = 'PRIVATE-MARKER'; },
    (x) => { x.fixtures[0].binding.quoteHash = 'f'.repeat(64); },
    (x) => { x.fixtures[0].binding.ownerId = x.fixtures[1].binding.ownerId; },
    (x) => { x.fixtures[0].binding.bookingId = x.fixtures[1].binding.bookingId; },
    (x) => { x.fixtures[0].root.missionRevision++; },
    (x) => { x.fixtures[0].pickup.verification.verifierId = x.fixtures[0].binding.ownerId; },
    (x) => { x.fixtures[0].pickup.verification.evidenceSetDigest = 'f'.repeat(64); },
    (x) => { x.fixtures[0].return.verification.codeLength = 5; },
    (x) => { x.fixtures[0].return.verification.codeLength = 7; },
    (x) => { x.fixtures[0].return.verification.digitsOnly = false; },
    (x) => { x.fixtures[0].pickup.photos[1].slot = 'overview'; },
  ]) { const x = fixture(); change(x); reject(x); }
});
test('V2 rejects executable/inherited/proxy input without calling traps or echoing it', () => {
  let calls = 0; const x = fixture();
  Object.defineProperty(x.source.mission, 'extra', { enumerable: true, get() { calls++; throw new Error('PRIVATE-MARKER'); } });
  reject(x);
  const y = fixture(); y.fixtures[0].pickup.photos = new Proxy([], { ownKeys() { calls++; throw new Error('PRIVATE-MARKER'); } });
  reject(y); assert.equal(calls, 0);
  const z = fixture(); Object.setPrototypeOf(z.fixtures[0], { hidden: true }); reject(z);
});
test('3/4 has unknown evidence and no inferred confirmation/verification; residual confirmation fails', () => {
  const x = fixture('partial'); const r = build(x).envelope;
  assert.equal(r.details[0].pickup.slots.filter((s) => s.present).length, 3);
  assert.equal(r.details[0].pickup.confirmation, null); assert.equal(r.details[0].pickup.verification, null);
  assert.equal(r.projection.components[0].axes.pickup, 'unknown');
  const y = fixture(); y.fixtures[0].pickup.photos.pop(); reject(y);
});
test('partial rejection and timeout contain no impossible later evidence or effect assertions', () => {
  for (const scenario of ['rejected', 'timeout']) {
    const x = fixture(scenario); const r = build(x).envelope;
    assert.equal(r.projection.status, scenario === 'timeout' ? 'readback_required' : 'incomplete');
    assert.equal(r.projection.components[0].axes.contract, 'not_bound');
    for (const phase of ['pickup', 'return']) {
      assert.equal(r.details[0][phase].slots.some((s) => s.present), false);
      assert.equal(r.details[0][phase].confirmation, null); assert.equal(r.details[0][phase].verification, null);
      x.fixtures[0][phase] = fixture().fixtures[0][phase]; reject(x); delete x.fixtures[0][phase];
    }
    x.fixtures[0].payment = 'paid'; reject(x);
  }
});
test('optional contradictory ReturnCase is visible and dispute never leaks to another component', () => {
  const x = fixture('optional_conflict'); const e = build(x).envelope; const p = e.projection;
  assert.equal(e.details[0].returnState, 'reportWindowOpen');
  assert.equal(e.details[0].returnCaseStatus, 'needsReview');
  assert.equal(Object.hasOwn(e.details[0], 'returnCaseId'), false);
  assert.equal(p.status, 'needs_clarification'); assert.equal(p.components[0].necessity, 'optional');
  assert.equal(p.components[0].axes.dispute, 'open'); assert.equal(p.components[1].axes.dispute, 'none');
  x.fixtures[0].returnCase.binding = x.fixtures[1].binding; reject(x);
});
test('display rejects unbound open dispute and preserves actual deviation rather than inventing evidence', () => {
  const x = fixture(); x.fixtures[0].dispute = 'open'; reject(x);
  const y = fixture(); y.fixtures[0].return.confirmation.decision = 'deviation';
  const e = build(y).envelope;
  assert.equal(e.projection.components[0].axes.return, 'needs_clarification');
  assert.equal(e.projection.components[0].axes.dispute, 'none');
  assert.equal(e.details[0].return.confirmation.decision, 'deviation');
  assert.equal(e.details[0].returnCaseStatus, null);
});
test('released without acceptance is preserved separately and carries no invented lifecycle identifiers', () => {
  const x = fixture('released'); const r = build(x).envelope;
  assert.equal(r.projection.components[0].axes.supplyRelease, 'released');
  assert.equal(r.projection.components[0].axes.acceptance, 'not_bound');
  assert.equal(r.projection.components[0].axes.fit, 'unknown');
  assert.equal(r.details[0].lifecycleDigest, null); assert.equal(r.details[0].bookingBindingDigest, null);
  assert.equal(x.fixtures.some((f) => f.binding.slotKey === r.projection.components[0].slotKey), false);
});
test('source drift fails old binding; observedAt only changes visible digest, not source; output detached/frozen', () => {
  const x = fixture(); const before = structuredClone(x); const a = build(x); const b = build(x);
  assert.deepEqual(a, b); assert.deepEqual(x, before); assert.ok(Object.isFrozen(a.envelope.details[0]));
  x.source.observedAt = '2026-10-03T12:01:00.000Z'; const c = build(x);
  assert.notEqual(a.digest, c.digest); assert.equal(a.envelope.projection.components[0].sourceDigest, c.envelope.projection.components[0].sourceDigest);
  x.source.listings[0].availability_revision++; reject(x);
  assert.deepEqual(a, b);
});
