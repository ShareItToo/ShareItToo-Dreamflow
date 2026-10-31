// Test-only closed fixture measurement, not telemetry or a live-data adapter.
// Every duration/event is invented and reproducible, never observed human effort.
import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { syntheticQuorumDisplayFixture, buildSyntheticQuorumDisplay } from './mission_quorum_web_fixture.js';
import { missionNeedDigest as digest } from '../../src/mission_need_workflow.js';
import { projectMissionQuorum, quorumRootBinding } from '../../src/mission_quorum_projection.js';

const version = 'D5-synthetic-measurement-2026-10-03.3';
// Exact A2a golden at the authorized source; a changed golden needs a reviewed successor.
const fixtureDigest = 'f4439ed9b9b7b78a70e2a711bc24529e5484d59b0a2ac8838cc07fe629c1e3ae';
const names = ['baseline', 'clock_only', 'source_drift', 'missing_photo', 'rejection',
  'timeout', 'optional_conflict', 'dispute', 'not_started', 'aborted', 'error', 'open', 'invalid'];
const states = ['completed', 'not_started', 'aborted', 'error', 'open', 'invalid'];
const slots = ['overview', 'detail', 'accessories', 'critical'];
// Invented phase-start facts, independent of scenario/planning state. A count of
// one explicitly selects the first component in the fixed projection order.
const phaseStarts = {
  baseline: [2, 2], clock_only: [2, 2], source_drift: [2, 2], missing_photo: [2, 2],
  rejection: [0, 0], timeout: [0, 0], optional_conflict: [2, 2], dispute: [2, 2],
  not_started: [0, 0], aborted: [1, 0], error: [0, 0], open: [1, 0], invalid: [1, 1],
};
const schemaDigest = digest({ version, fixtureDigest, names, states, slots,
  segmentStarts: { pickup: [0, 1, 2], return: [0, 1, 2], order: 'fixed_projection_prefix', catalog: phaseStarts },
  evidenceClass: 'synthetisch', authentic: false,
  events: ['mismatch', 'contact_attempt', 'support_attempt'],
  safety: ['no_violation', 'safe_rejection', 'violation_accepted'],
  time: 'invented_tick', plannedRechecks: 'includes_missing', activation: 'not_applicable_no_demands' });

// Reject proxies BEFORE reflection, and descriptors BEFORE reading their values.
// Repeated references are fine; ancestor cycles, hidden keys and executable shapes are not.
function safeClone(input) {
  let budget = 100000;
  const ancestors = new Set();
  const visit = (value, depth = 0) => {
    if (--budget < 0 || depth > 32) throw new Error('invalid');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.length > 512) throw new Error('invalid');
      return value;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value !== 'object' || isProxy(value) || ancestors.has(value)) throw new Error('invalid');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) throw new Error('invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > 1000 || keys.some((k) => typeof k !== 'string')) throw new Error('invalid');
    ancestors.add(value);
    let result;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length > 1000 || keys.length !== length + 1) throw new Error('invalid');
      result = [];
      for (let i = 0; i < length; i++) {
        const d = descriptors[String(i)];
        if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw new Error('invalid');
        result.push(visit(d.value, depth + 1));
      }
    } else {
      result = {};
      for (const key of keys.sort()) {
        const d = descriptors[key];
        if (!d.enumerable || !Object.hasOwn(d, 'value') || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('invalid');
        result[key] = visit(d.value, depth + 1);
      }
    }
    ancestors.delete(value);
    return result;
  };
  return visit(input);
}

function rebind(x) {
  x.source.mission.payload_sha256 = digest(x.source.mission.payload);
  x.source.resolution.mission_payload_sha256 = x.source.mission.payload_sha256;
  x.source.resolution.resolution_snapshot_sha256 = digest(x.source.resolution.resolution_snapshot);
  const bare = projectMissionQuorum(x.source).projection;
  for (const f of x.fixtures) {
    f.root = quorumRootBinding(x.source);
    const component = bare.components.find((c) => c.itemId === f.binding.itemId);
    f.binding.slotKey = component.slotKey;
    f.binding.sourceDigest = component.sourceDigest;
    for (const name of ['pickup', 'return']) {
      const setDigest = digest(f[name].photos);
      f[name].confirmation.evidenceSetDigest = setDigest;
      f[name].verification.evidenceSetDigest = setDigest;
    }
  }
}

function snapshot(kind = 'baseline') {
  const x = syntheticQuorumDisplayFixture();
  if (kind === 'clock_only') x.source.observedAt = '2026-10-03T12:01:00.000Z';
  if (kind === 'source_drift') {
    x.source.listings[0].catalog_revision = 2;
    rebind(x);
  }
  if (kind === 'missing_photo') {
    x.fixtures[0].pickup.photos.pop();
    delete x.fixtures[0].pickup.confirmation;
    delete x.fixtures[0].pickup.verification;
  }
  if (kind === 'rejection' || kind === 'timeout') x.fixtures[0].acceptance = kind === 'rejection' ? 'rejected' : 'timeout';
  if (kind === 'optional_conflict') {
    x.source.mission.payload.needs = [
      { needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 },
      { needKey: 'optional_tool', necessity: 'optional', quantity: 1 },
    ];
    Object.assign(x.source.assignments[1], { slot_key: 'optional:optional_tool:1', need_key: 'optional_tool', necessity: 'optional', slot_ordinal: 1 });
    Object.assign(x.source.resolution.resolution_snapshot.slots[1], { slotKey: 'optional:optional_tool:1', needKey: 'optional_tool', necessity: 'optional', ordinal: 1 });
    rebind(x);
    x.fixtures[1].returnState = 'needsReview';
  }
  if (kind === 'dispute') {
    x.fixtures[0].returnState = 'needsReview';
    x.fixtures[0].returnCase = { id: `${x.namespace}:return-case`, binding: x.fixtures[0].binding, status: 'needsReview' };
  }
  // Never present later-phase evidence in an unbegun phase. In these fixed
  // variants fixture order equals the declared projection component order.
  for (const [index, f] of x.fixtures.entries()) {
    if (index >= phaseStarts[kind][0]) delete f.pickup;
    if (index >= phaseStarts[kind][1]) {
      delete f.return;
      f.returnState = 'not_started';
    }
  }
  return buildSyntheticQuorumDisplay(x);
}

function assertPhaseSequence(cases) {
  for (const c of cases) for (const phase of ['pickup', 'return']) {
    const starts = c.segmentStarts[phase];
    if (![0, 1, 2].includes(starts)) throw new Error('phase_sequence_invalid');
    for (const s of c.snapshots) {
      for (const component of s.envelope.projection.components.slice(starts)) {
        const segment = s.envelope.details.find((d) => d.slotKey === component.slotKey)[phase];
        if (segment.evidenceSetDigest !== null || segment.confirmation !== null || segment.verification !== null
          || component.axes[phase] !== 'unknown' || segment.slots.some((p) => p.present !== false
            || p.evidenceId !== null || p.uploadId !== null || p.uploadSha256 !== null)) {
          throw new Error('phase_sequence_invalid');
        }
      }
    }
  }
}

function catalog() {
  if (snapshot().digest !== fixtureDigest) throw new Error('fixture_source_mismatch');
  const cases = names.map((name, index) => {
    const state = states.includes(name) ? name : 'completed';
    const hasObservation = state === 'completed' || state === 'open';
    const snapshots = !hasObservation ? [] : ['clock_only', 'source_drift'].includes(name)
      ? [snapshot(), snapshot(name)] : [snapshot(name)];
    return { case: name, state, snapshots,
      segmentStarts: { pickup: phaseStarts[name][0], return: phaseStarts[name][1] },
      plannedRechecks: ['clock_only', 'source_drift', 'open'].includes(name) ? 1 : 0,
      planningTicks: state === 'completed' ? [0, 10 + index] : null,
      events: name === 'missing_photo' ? ['mismatch', 'contact_attempt']
        : name === 'dispute' ? ['mismatch', 'support_attempt'] : [],
      safety: name === 'invalid' ? 'safe_rejection' : 'no_violation' };
  });
  assertPhaseSequence(cases);
  return { version, synthetic: true, authentic: false, evidenceClass: 'synthetisch', schemaDigest,
    registryDigest: digest(cases), cases };
}

// Each call returns a new fixed dataset; the evaluator never accepts caller-chosen IDs.
export function syntheticMeasurementFixture() { return catalog(); }

const common = () => ({ version, evidenceClass: 'synthetisch', authentic: false,
  bindingStatus: 'non_binding', legalBindingStatus: 'not_determined', paymentStatus: 'not_determined',
  pilotEvidence: false, public: { status: 'unavailable' } });
const failure = (status) => ({ ...common(), status, metrics: null,
  register: { planned: names.length, observed: null } });

function sourceDigest(snapshotValue) {
  const { observedAt: ignored, ...semantic } = snapshotValue.envelope.projection;
  // Original bytes/digests remain separately available, never overwritten with this comparison key.
  return digest(semantic);
}

function evidenceCount(envelope, name, starts) {
  if (starts === 0) return { status: 'not_applicable', denominator: 0, complete: 0 };
  if (!envelope) return { status: 'unavailable', denominator: starts, complete: 0 };
  let complete = 0;
  // Sequence invariants have already rejected evidence for every unbegun phase.
  // Count only the explicitly begun fixed components, not a cap on total evidence.
  for (const component of envelope.projection.components.slice(0, starts)) {
    const detail = envelope.details.find((row) => row.slotKey === component.slotKey);
    const segment = detail[name];
    const c = envelope.projection.components.find((row) => row.slotKey === detail.slotKey);
    const presenter = name === 'pickup' ? c.ownerId : envelope.projection.missionOwnerId;
    const verifier = name === 'pickup' ? envelope.projection.missionOwnerId : c.ownerId;
    const confirm = segment.confirmation; const verify = segment.verification;
    const photos = segment.slots.filter((s) => s.present);
    const bound = detail.sourceDigest === c.sourceDigest && detail.lifecycleDigest === c.lifecycleDigest
      && segment.segment === name && segment.presenterId === presenter && segment.verifierId === verifier;
    const photoSet = photos.length === 4 && slots.every((s) => photos.some((p) => p.slot === s))
      && new Set(photos.map((p) => p.evidenceId)).size === 4 && new Set(photos.map((p) => p.uploadId)).size === 4;
    const confirmed = confirm?.decision === 'confirmed' && confirm.actorId === verifier
      && confirm.evidenceSetDigest === segment.evidenceSetDigest;
    const verified = verify?.presenterId === presenter && verify.verifierId === verifier
      && verify.evidenceSetDigest === segment.evidenceSetDigest
      && (verify.method === 'qr_v3' || (verify.method === 'six_digit_fallback' && verify.codeLength === 6 && verify.digitsOnly === true));
    if (bound && photoSet && confirmed && verified) complete++;
  }
  return { status: 'synthetic_observation', denominator: starts, complete };
}

/** Only the entire fixed catalog (case order irrelevant) is measurable.
 * Missing/extra/changed data is an invalid measurement, not a filtered cohort.
 * This deliberately cannot collect real/private data or certify a pilot.
 */
export function evaluateSyntheticMeasurement(input) {
  let supplied;
  try { supplied = safeClone(input); } catch { return failure('measurement_invalid'); }
  let expected;
  try { expected = catalog(); } catch { return failure('source_mismatch'); }
  if (!supplied || !Array.isArray(supplied.cases) || supplied.cases.length !== names.length) return failure('measurement_invalid');
  const byName = new Map(supplied.cases.map((c) => [c?.case, c]));
  if (byName.size !== names.length || names.some((n) => !byName.has(n))) return failure('measurement_invalid');
  try { assertPhaseSequence(supplied.cases); } catch { return failure('measurement_invalid'); }
  let violation = false;
  supplied.cases = names.map((n) => byName.get(n));
  for (let i = 0; i < names.length; i++) {
    if (supplied.cases[i].safety === 'violation_accepted') {
      violation = true;
      supplied.cases[i].safety = expected.cases[i].safety;
    }
  }
  // Exact byte-content whitelist, not a caller-provided digest or namespace assertion.
  if (digest(supplied) !== digest(expected)) return failure('measurement_invalid');
  if (violation) return failure('safety_stop');
  const counts = Object.fromEntries(states.map((s) => [s, supplied.cases.filter((c) => c.state === s).length]));
  const started = names.length - counts.not_started;
  const coverage = { denominator: 0, assigned: 0, proven: 0, unknown: 0 };
  const pickup = { denominator: 0, complete: 0 }; const returned = { denominator: 0, complete: 0 };
  const stability = { denominator: 0, stableIncomplete: 0, sourceDrift: 0, incompleteObservation: 0 };
  const effort = { denominator: started, mismatch: 0, contactAttempt: 0, supportAttempt: 0 };
  const cases = supplied.cases.map((c) => {
    const latest = c.snapshots.at(-1)?.envelope;
    const fingerprints = c.snapshots.map(sourceDigest);
    const status = !c.plannedRechecks ? 'not_applicable' : fingerprints.length < 2 ? 'incomplete_observation'
      : fingerprints[0] === fingerprints[1] ? 'stable_incomplete' : 'source_drift';
    stability.denominator += c.plannedRechecks;
    if (status === 'stable_incomplete') stability.stableIncomplete++;
    if (status === 'source_drift') stability.sourceDrift++;
    if (status === 'incomplete_observation') stability.incompleteObservation++;
    // All predeclared required units remain in the denominator, even without a readback.
    const requiredUnits = c.case === 'optional_conflict' ? 1 : 2;
    coverage.denominator += requiredUnits;
    coverage.unknown += requiredUnits;
    for (const component of latest?.projection.components ?? []) if (component.necessity === 'required') {
      if (component.itemId) coverage.assigned++;
      // The fixed listing fixture has no supported Fit proof; assignment is not coverage.
    }
    // Scenario start is not phase start. Explicit begun segments remain in the
    // denominator despite missing observations; unbegun phases cannot complete.
    const p = evidenceCount(latest, 'pickup', c.segmentStarts.pickup);
    const r = evidenceCount(latest, 'return', c.segmentStarts.return);
    pickup.denominator += p.denominator; pickup.complete += p.complete;
    returned.denominator += r.denominator; returned.complete += r.complete;
    effort.mismatch += c.events.filter((e) => e === 'mismatch').length;
    effort.contactAttempt += c.events.filter((e) => e === 'contact_attempt').length;
    effort.supportAttempt += c.events.filter((e) => e === 'support_attempt').length;
    return { case: c.case, state: c.state, originalDigests: c.snapshots.map((s) => s.digest),
      projectionDigests: c.snapshots.map((s) => s.envelope.projectionDigest), sourceDigests: fingerprints,
      stability: status, quorumStatus: latest?.projection.status ?? 'unavailable',
      disputes: latest?.projection.components.map((p) => p.axes.dispute) ?? [], pickup: p, return: r };
  });
  const result = { ...common(), status: 'synthetic_measurement_only', schemaDigest, fixtureDigest,
    registryDigest: expected.registryDigest, register: { planned: names.length, observed: names.length, states: counts }, cases,
    metrics: { planning: { denominator: started, completed: counts.completed,
      unavailable: started - counts.completed, unit: 'invented_tick',
      durations: supplied.cases.filter((c) => c.planningTicks).map((c) => c.planningTicks[1] - c.planningTicks[0]) },
    coverage, stability,
    // There are no demands in the fixed display fixture. Release/acceptance semantics are not measured here.
    activation: { status: 'not_applicable', denominator: 0, released: 0, accepted: 0, rate: null },
    effort, pickup, return: returned, safety: { denominator: names.length, acceptedViolations: 0,
      safeRejections: supplied.cases.filter((c) => c.safety === 'safe_rejection').length }, missionSuccess: 'not_determined' } };
  return { ...result, digest: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
}
