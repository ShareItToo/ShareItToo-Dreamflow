import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { syntheticMeasurementFixture, evaluateSyntheticMeasurement } from './support/mission_synthetic_measurement.js';

const fixture = () => syntheticMeasurementFixture();
const evaluate = (x = fixture()) => evaluateSyntheticMeasurement(x);
const baseline = (x) => x.cases.find((c) => c.case === 'baseline').snapshots[0];
const corrupt = (change) => { const x = fixture(); change(x); return evaluate(x); };
const denied = (out, status = 'measurement_invalid') => {
  assert.equal(out.status, status);
  assert.equal(out.metrics, null);
  assert.deepEqual(out.public, { status: 'unavailable' });
  assert.equal(out.bindingStatus, 'non_binding');
};

test('D5 fixed complete register keeps every planned outcome and never claims a live success', () => {
  const out = evaluate();
  assert.equal(out.status, 'synthetic_measurement_only');
  assert.equal(out.evidenceClass, 'synthetisch');
  assert.equal(out.authentic, false);
  assert.equal(out.bindingStatus, 'non_binding');
  assert.equal(out.pilotEvidence, false);
  assert.equal(out.legalBindingStatus, 'not_determined');
  assert.equal(out.paymentStatus, 'not_determined');
  assert.deepEqual(out.public, { status: 'unavailable' });
  assert.equal(out.register.planned, fixture().cases.length);
  assert.equal(out.register.observed, out.register.planned);
  for (const state of ['not_started', 'aborted', 'error', 'open', 'invalid']) assert.equal(out.register.states[state], 1);
  assert.equal(out.metrics.planning.denominator, out.register.planned - 1);
  assert.equal(out.metrics.planning.unit, 'invented_tick');
  assert.equal(out.metrics.coverage.denominator, out.register.planned * 2 - 1);
  for (const phase of ['pickup', 'return']) {
    assert.equal(out.metrics[phase].denominator, fixture().cases.reduce((sum, c) => sum + c.segmentStarts[phase], 0));
  }
  const unstarted = out.cases.find((c) => c.state === 'not_started');
  assert.equal(unstarted.pickup.denominator, 0);
  assert.equal(unstarted.pickup.status, 'not_applicable');
});

test('D5 rejection and timeout have no begun segments and cannot inflate completion', () => {
  const x = fixture(); const out = evaluate(x);
  for (const name of ['rejection', 'timeout']) {
    const input = x.cases.find((c) => c.case === name);
    assert.deepEqual(input.segmentStarts, { pickup: 0, return: 0 });
    for (const detail of input.snapshots[0].envelope.details) for (const phase of ['pickup', 'return']) {
      assert.equal(detail[phase].slots.filter((s) => s.present).length, 0);
      assert.equal(detail[phase].confirmation, null);
      assert.equal(detail[phase].verification, null);
    }
    const c = out.cases.find((row) => row.case === name);
    for (const phase of ['pickup', 'return']) assert.deepEqual(c[phase], { status: 'not_applicable', denominator: 0, complete: 0 });
  }
});

test('D5 every unbegun component phase has no evidence, confirmation or verification', () => {
  for (const c of fixture().cases) for (const s of c.snapshots) for (const phase of ['pickup', 'return']) {
    for (const component of s.envelope.projection.components.slice(c.segmentStarts[phase])) {
      const segment = s.envelope.details.find((d) => d.slotKey === component.slotKey)[phase];
      assert.equal(segment.evidenceSetDigest, null);
      assert.equal(segment.confirmation, null);
      assert.equal(segment.verification, null);
      for (const slot of segment.slots) assert.deepEqual(slot, {
        slot: slot.slot, present: false, evidenceId: null, uploadId: null, uploadSha256: null,
      });
      assert.equal(component.axes[phase], 'unknown');
    }
  }
});

test('D5 later evidence in a zero-start or unbegun component phase invalidates measurement', () => {
  for (const name of ['rejection', 'timeout', 'open']) for (const phase of ['pickup', 'return']) {
    denied(corrupt((x) => {
      const c = x.cases.find((row) => row.case === name);
      const i = c.segmentStarts[phase];
      c.snapshots[0].envelope.details[i][phase] = baseline(x).envelope.details[i][phase];
    }));
  }
});

test('D5 explicit starts retain missing observations only for begun phases; partial starts cap completions', () => {
  const x = fixture(); const out = evaluate(x);
  const starts = { aborted: [1, 0], error: [0, 0], open: [1, 0], invalid: [1, 1] };
  for (const [name, [pickup, returned]] of Object.entries(starts)) {
    const input = x.cases.find((c) => c.case === name);
    assert.deepEqual(input.segmentStarts, { pickup, return: returned });
    const c = out.cases.find((row) => row.case === name);
    for (const phase of ['pickup', 'return']) {
      assert.equal(c[phase].denominator, input.segmentStarts[phase]);
      assert.ok(c[phase].complete <= c[phase].denominator);
      if (input.snapshots.length === 0) {
        assert.equal(c[phase].complete, 0);
        assert.equal(c[phase].status, input.segmentStarts[phase] ? 'unavailable' : 'not_applicable');
      }
    }
  }
  assert.equal(out.cases.find((c) => c.case === 'open').pickup.complete, 1);
  assert.equal(out.metrics.pickup.denominator, 15);
  assert.equal(out.metrics.return.denominator, 13);
});

test('D5 missing, extra, noninteger and out-of-catalog phase starts fail closed', () => {
  denied(corrupt((x) => { delete x.cases[0].segmentStarts; }));
  for (const value of [-1, 3, 0.5, '2', null, 1]) denied(corrupt((x) => { x.cases[0].segmentStarts.pickup = value; }));
  denied(corrupt((x) => { x.cases.find((c) => c.case === 'rejection').segmentStarts.pickup = 2; }));
  denied(corrupt((x) => { x.cases[0].segmentStarts.extra = 0; }));
});

test('D5 original/schema/source evidence survives, time alone is not source drift', () => {
  const x = fixture(); const out = evaluate(x);
  assert.equal(out.schemaDigest, x.schemaDigest);
  for (const c of x.cases) {
    const proof = out.cases.find((p) => p.case === c.case);
    assert.deepEqual(proof.originalDigests, c.snapshots.map((s) => s.digest));
    assert.deepEqual(proof.projectionDigests, c.snapshots.map((s) => s.envelope.projectionDigest));
  }
  const clock = out.cases.find((c) => c.case === 'clock_only');
  assert.notEqual(clock.originalDigests[0], clock.originalDigests[1]);
  assert.equal(clock.sourceDigests[0], clock.sourceDigests[1]);
  assert.equal(clock.stability, 'stable_incomplete');
  assert.equal(out.cases.find((c) => c.case === 'source_drift').stability, 'source_drift');
  assert.equal(out.metrics.stability.denominator, 3);
  assert.equal(out.metrics.stability.incompleteObservation, 1);
});

test('D5 coverage is not assignment; no demand means activation is not applicable, not zero percent', () => {
  const out = evaluate();
  assert.ok(out.metrics.coverage.assigned > 0);
  assert.equal(out.metrics.coverage.proven, 0);
  assert.equal(out.metrics.coverage.unknown, out.metrics.coverage.denominator);
  assert.deepEqual(out.metrics.activation, { status: 'not_applicable', denominator: 0, released: 0, accepted: 0, rate: null });
  assert.equal(out.metrics.missionSuccess, 'not_determined');
  denied(corrupt((x) => { baseline(x).envelope.projection.components[0].axes.supplyRelease = 'released'; }));
});

test('D5 missing photo, timeout, rejection, optional conflict and dispute are not green quorum', () => {
  const out = evaluate();
  const c = (name) => out.cases.find((row) => row.case === name);
  assert.equal(c('missing_photo').pickup.complete, 1);
  assert.equal(c('missing_photo').pickup.denominator, 2);
  assert.equal(c('timeout').quorumStatus, 'readback_required');
  assert.equal(c('rejection').quorumStatus, 'incomplete');
  assert.equal(c('optional_conflict').quorumStatus, 'needs_clarification');
  assert.deepEqual(c('dispute').disputes, ['open', 'none']);
  assert.equal(c('baseline').pickup.complete, 2);
  assert.equal(c('baseline').return.complete, 2);
  assert.equal(c('baseline').quorumStatus, 'incomplete');
});

test('D5 every planned case includes lost/repeated cases and expected invalid observations', () => {
  denied(corrupt((x) => { x.cases.pop(); }));
  denied(corrupt((x) => { x.cases.push(x.cases[0]); }));
  denied(corrupt((x) => { x.cases[1] = x.cases[0]; }));
  denied(corrupt((x) => { x.cases = []; }));
  denied(corrupt((x) => { x.cases.find((c) => c.state === 'invalid').state = 'completed'; }));
});

test('D5 an accepted safety violation stops all positive aggregation, expected rejection does not', () => {
  const x = fixture(); x.cases[0].safety = 'violation_accepted';
  denied(evaluate(x), 'safety_stop');
  assert.equal(evaluate().metrics.safety.acceptedViolations, 0);
  assert.equal(evaluate().metrics.safety.denominator, fixture().cases.length);
});

const corruptions = {
  version: (x) => { x.version = 'future'; },
  synthetic: (x) => { x.synthetic = false; },
  evidence_class: (x) => { x.evidenceClass = 'observed_human'; },
  schema: (x) => { x.schemaDigest = '0'.repeat(64); },
  registry: (x) => { x.registryDigest = '0'.repeat(64); },
  private_key: (x) => { x.email = 'private-payload-must-not-echo'; },
  case_enum: (x) => { x.cases[0].case = 'private-payload-must-not-echo'; },
  state_enum: (x) => { x.cases[0].state = 'success'; },
  timing: (x) => { x.cases[0].planningTicks = [0, -1]; },
  nan: (x) => { x.cases[0].planningTicks = [0, NaN]; },
  infinite: (x) => { x.cases[0].planningTicks = [0, Infinity]; },
  contact: (x) => { x.cases[0].events.push('private-payload-must-not-echo'); },
  owner: (x) => { baseline(x).envelope.projection.components[0].ownerId = 'private-payload-must-not-echo'; },
  synthetic_aliased_owner: (x) => { baseline(x).envelope.projection.components[0].ownerId += 'private-payload-must-not-echo'; },
  parent: (x) => { baseline(x).envelope.projection.missionNeedId += 'other'; },
  revision: (x) => { baseline(x).envelope.projection.missionNeedRevision += 1; },
  original_digest: (x) => { baseline(x).digest = '0'.repeat(64); },
  source_digest: (x) => { baseline(x).envelope.details[0].sourceDigest = '0'.repeat(64); },
  projection_digest: (x) => { baseline(x).envelope.projectionDigest = '0'.repeat(64); },
  lifecycle_digest: (x) => { baseline(x).envelope.details[0].lifecycleDigest = '0'.repeat(64); },
  binding_digest: (x) => { baseline(x).envelope.details[0].bookingBindingDigest = '0'.repeat(64); },
  missing_slot: (x) => { baseline(x).envelope.details[0].pickup.slots.pop(); },
  duplicate_slot: (x) => { const s = baseline(x).envelope.details[0].pickup.slots; s[3] = s[0]; },
  duplicate_evidence: (x) => { const s = baseline(x).envelope.details[0].pickup.slots; s[3].evidenceId = s[0].evidenceId; },
  wrong_set: (x) => { baseline(x).envelope.details[0].pickup.confirmation.evidenceSetDigest = '0'.repeat(64); },
  missing_confirmation: (x) => { baseline(x).envelope.details[0].pickup.confirmation = null; },
  qr_principal: (x) => { baseline(x).envelope.details[0].pickup.verification.verifierId = 'private-payload-must-not-echo'; },
  qr_method: (x) => { baseline(x).envelope.details[0].pickup.verification.method = 'qr_v2'; },
  fallback_short: (x) => { baseline(x).envelope.details[0].return.verification.codeLength = 5; },
  fallback_long: (x) => { baseline(x).envelope.details[0].return.verification.codeLength = 7; },
  fallback_nondigits: (x) => { baseline(x).envelope.details[0].return.verification.digitsOnly = false; },
  raw_photo: (x) => { baseline(x).envelope.details[0].pickup.slots[0].bytes = 'private-payload-must-not-echo'; },
  preallocated_not_started: (x) => { x.cases.find((c) => c.state === 'not_started').snapshots = [baseline(x)]; },
};
for (const [name, change] of Object.entries(corruptions)) test(`D5 closed shape rejects ${name} without echo`, () => {
  const out = corrupt(change); denied(out);
  assert.ok(!JSON.stringify(out).includes('private-payload-must-not-echo'));
});

test('D5 rejects inherited, hidden, executable, cyclic and proxy shapes without invoking user code', () => {
  let calls = 0;
  const x = fixture(); Object.defineProperty(x, 'version', { get() { calls++; throw Error('private'); } }); denied(evaluate(x));
  const y = fixture(); Object.defineProperty(y.cases[0], 'hidden', { value: 'private', enumerable: false }); denied(evaluate(y));
  const z = fixture(); Object.setPrototypeOf(z.cases[0], { private: true }); denied(evaluate(z));
  const sym = fixture(); sym[Symbol('private')] = 1; denied(evaluate(sym));
  const cycle = fixture(); cycle.loop = cycle; denied(evaluate(cycle));
  const fn = fixture(); fn.toJSON = () => { calls++; }; denied(evaluate(fn));
  const proxy = new Proxy(fixture(), { ownKeys() { calls++; throw Error('private'); }, get() { calls++; throw Error('private'); } }); denied(evaluate(proxy));
  const nested = fixture(); nested.cases[0] = proxy; denied(evaluate(nested));
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); denied(evaluate(revoked.proxy));
  const sparse = fixture(); delete sparse.cases[0]; denied(evaluate(sparse));
  assert.equal(calls, 0);
});

test('D5 deterministic, order independent, detached, bounded and non-identifying result', () => {
  const x = fixture(); const before = structuredClone(x); const a = evaluate(x);
  assert.deepEqual(x, before);
  x.cases.reverse(); assert.deepEqual(evaluate(x), a);
  a.cases[0].originalDigests.length = 0; assert.deepEqual(evaluate(), evaluate(before));
  const text = JSON.stringify(evaluate());
  for (const privateFragment of ['p7a1-synthetic-', 'mission_need_', 'principal:', 'bookingId', 'evidenceId', 'uploadId', '2026-10-03T']) assert.ok(!text.includes(privateFragment));
  denied(evaluate(null)); denied(evaluate(new Array(100001).fill(null)));
});

test('D5 support import closure is test-only and has no I/O/time/random/storage/provider dependencies', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const support = 'backend/test/support/mission_synthetic_measurement.js';
  const self = 'backend/test/mission_synthetic_measurement.test.js';
  const walk = (dir) => readdirSync(root + dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git', 'build', '.dart_tool'].includes(e.name)) return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? walk(`${path}/`) : /\.(?:js|mjs|cjs|dart|json|ya?ml)$/u.test(e.name) ? [path] : [];
  });
  const files = ['backend/', 'lib/', 'tool/', 'scripts/', 'web/'].flatMap(walk);
  const refs = files.filter((p) => readFileSync(root + p, 'utf8').includes('mission_synthetic_measurement'));
  assert.deepEqual(refs.sort(), [self].sort());
  const source = readFileSync(root + support, 'utf8');
  const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/gu)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['node:crypto', 'node:util/types', './mission_quorum_web_fixture.js', '../../src/mission_need_workflow.js', '../../src/mission_quorum_projection.js'].sort());
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|Date|performance|process|eval|Function|localStorage|SharedPreferences)\b|Math\.random|node:(?:fs|net|http|https|child_process)|import\s*\(/u);
});
