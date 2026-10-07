import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const path = 'docs/operations/SIT_MISSION_D5_PREREGISTRATION_CONTRACT_2026-10-03.json';
const registered = JSON.parse(readFileSync(root + path, 'utf8'));
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const hash = (v) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const bytesHash = (v) => createHash('sha256').update(v).digest('hex');
// Independent registration seal: self-rehashing edited thresholds cannot authorize them.
const registeredDigest = 'adab6f0067f0fd20ab2129fbc1a5af8890772599251a8fcfc74b30d6e70a5552';
const sections = ['schema', 'source', 'cohort', 'tasks', 'window', 'thresholds'];
const denied = Object.freeze({ status: 'invalid', activationReady: false });

// Exact candidate validator, intentionally test-only, not a general human-data intake.
// No private payload is logged, hashed or returned on a shape/value mismatch.
function exactSafe(value, expected) {
  if (value === null || typeof value !== 'object') return Object.is(value, expected);
  if (isProxy(value) || expected === null || typeof expected !== 'object') return false;
  const array = Array.isArray(value);
  if (array !== Array.isArray(expected) || Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const expectedKeys = Reflect.ownKeys(expected);
  if (keys.length !== expectedKeys.length || keys.some((k) => typeof k !== 'string' || !Object.hasOwn(expected, k))) return false;
  return keys.every((k) => {
    const d = descriptors[k];
    return Object.hasOwn(d, 'value') && (d.enumerable || (array && k === 'length')) && exactSafe(d.value, expected[k]);
  });
}

function validate(value) {
  try {
    if (!exactSafe(value, registered)) return { ...denied };
    const { bindings, ...body } = value;
    if (hash(body) !== registeredDigest || bindings.contractDigest !== registeredDigest) return { ...denied };
    for (const name of sections) if (bindings[`${name}Digest`] !== hash(body[name])) return { ...denied };
    return { status: 'valid_draft', activationReady: false, productDecision: 'pending_gemini', observationsAccepted: false };
  } catch { return { ...denied }; }
}
const fixture = () => structuredClone(registered);
const reject = (change) => { const value = fixture(); change(value); assert.deepEqual(validate(value), denied); };
const reseal = (value) => {
  const { bindings, ...body } = value;
  for (const name of sections) bindings[`${name}Digest`] = hash(body[name]);
  bindings.contractDigest = hash(body);
};

test('D5 candidate is a sealed valid draft with unresolved product thresholds, never activation-ready', () => {
  assert.deepEqual(validate(fixture()), { status: 'valid_draft', activationReady: false,
    productDecision: 'pending_gemini', observationsAccepted: false });
  assert.equal(registered.thresholds.state, 'proposed_pending_gemini');
  assert.equal(registered.thresholds.finalized, null);
  assert.equal(registered.governance.gatekeeper, 'Gemini');
  assert.equal(registered.governance.walidEscalation, 'unavoidable_physical_action_only');
});

test('D5 source HEAD and each primary source byte hash bind the recorded Git snapshot', () => {
  assert.match(registered.source.head, /^[a-f0-9]{40}$/u);
  execFileSync('git', ['cat-file', '-e', `${registered.source.head}^{commit}`], { cwd: root });
  for (const source of registered.source.inventory) {
    assert.match(source.path, /^(?:docs|store|backend)\/[A-Za-z0-9_./-]+$/u);
    assert.ok(!source.path.split('/').includes('..'));
    assert.equal(bytesHash(execFileSync('git', ['show', `${registered.source.head}:${source.path}`], { cwd: root })), source.sha256);
  }
  // Later worktree drift cannot rebind this immutable preregistration, even
  // when every dependent section digest is recomputed consistently.
  const rebound = fixture();
  const driftHash = bytesHash(Buffer.from('synthetic later worktree source bytes'));
  assert.notEqual(driftHash, rebound.source.inventory[0].sha256);
  rebound.source.inventory[0].sha256 = driftHash;
  reseal(rebound);
  assert.deepEqual(validate(rebound), denied);
});

test('D5 all seven metrics, complete nine-task register and exact evidence classes remain separate', () => {
  assert.deepEqual(registered.metrics.map((m) => m.id), ['planning_effort', 'required_coverage', 'quorum_stability',
    'supply_activation', 'mismatch_effort', 'handover_return', 'safety_quality']);
  assert.deepEqual(registered.schema.evidenceClasses, ['synthetisch', 'beobachtet_staging', 'beobachtet_freigegebener_pilot']);
  assert.equal(registered.tasks.entries.length, 9);
  assert.equal(new Set(registered.tasks.entries.map((t) => t.ordinal)).size, 9);
  assert.ok(registered.tasks.entries.every((t) => t.state === 'not_started'));
  assert.equal(registered.measurementPolicy.nullDenominator, 'not_applicable_no_rate');
  assert.equal(registered.measurementPolicy.missingReadback, 'unavailable_retained_in_begun_denominator');
  assert.equal(registered.measurementPolicy.evidenceMixing, 'forbidden');
  assert.deepEqual(registered.observations, []);
});

test('D5 proposed cohort/window is bounded but not a roster, schedule, token or statistical claim', () => {
  assert.equal(registered.cohort.state, 'proposed_pending_gemini');
  assert.equal(registered.cohort.maximumAdults, 3);
  assert.equal(registered.cohort.regionLabel, 'Heilbronn');
  assert.equal(registered.window.maximumTestDays, 1);
  assert.equal(registered.window.startsAt, null);
  assert.equal(registered.window.endsAt, null);
  assert.equal(registered.claims.statisticalMarketValidation, false);
});

const mutations = {
  activated: (x) => { x.activationReady = true; },
  pilot_ready: (x) => { x.claims.pilotReady = true; },
  live_success: (x) => { x.claims.observedSuccess = true; },
  approved_thresholds: (x) => { x.thresholds.state = 'approved'; },
  forged_gemini: (x) => { x.governance.decision = 'PASS'; },
  missing_thresholds: (x) => { delete x.thresholds; },
  finalized_thresholds: (x) => { x.thresholds.finalized = []; },
  mixed_evidence: (x) => { x.measurementPolicy.evidenceMixing = 'allowed'; },
  unknown_evidence: (x) => { x.schema.evidenceClasses.push('invented_fixture'); },
  lost_case: (x) => { x.tasks.entries.pop(); },
  duplicate_case: (x) => { x.tasks.entries[1] = x.tasks.entries[0]; },
  case_reclassified: (x) => { x.tasks.entries[0].state = 'completed'; },
  missing_readback_zero: (x) => { x.measurementPolicy.missingReadback = 'zero'; },
  null_denominator_success: (x) => { x.measurementPolicy.nullDenominator = '100_percent'; },
  failed_case_removed: (x) => { x.measurementPolicy.abortedAndErrorCases = 'excluded'; },
  private_key: (x) => { x.email = 'private@example.invalid'; },
  private_value: (x) => { x.cohort.regionLabel = 'private@example.invalid'; },
  real_identifier: (x) => { x.tasks.entries[0].accountId = 'private-account'; },
  photo: (x) => { x.tasks.entries[0].photo = 'private-data'; },
  free_text: (x) => { x.tasks.entries[0].note = 'private-data'; },
  observations_mixed: (x) => { x.observations = [{ evidenceClass: 'synthetisch' }, { evidenceClass: 'beobachtet_staging' }]; },
  null_denominator_result: (x) => { x.observations = [{ numerator: 0, denominator: 0, rate: 1 }]; },
  cohort_expansion: (x) => { x.cohort.maximumAdults = 4; },
  window_expansion: (x) => { x.window.maximumTestDays = 2; },
  retrospectively_started: (x) => { x.window.startsAt = '2026-10-02'; },
  source_drift: (x) => { x.source.head = '0'.repeat(40); },
  source_hash: (x) => { x.source.inventory[0].sha256 = '0'.repeat(64); },
  schema_digest: (x) => { x.bindings.schemaDigest = '0'.repeat(64); },
  cohort_digest: (x) => { x.bindings.cohortDigest = '0'.repeat(64); },
  task_digest: (x) => { x.bindings.tasksDigest = '0'.repeat(64); },
  window_digest: (x) => { x.bindings.windowDigest = '0'.repeat(64); },
  thresholds_digest: (x) => { x.bindings.thresholdsDigest = '0'.repeat(64); },
  source_digest: (x) => { x.bindings.sourceDigest = '0'.repeat(64); },
  safety_relaxation: (x) => { x.safety.maximumAcceptedViolations = 1; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`D5 refuses ${name} without payload echo`, () => reject(mutate));

test('D5 after-the-fact threshold/cohort/window edits cannot be healed by rehashing', () => {
  for (const mutate of [mutations.cohort_expansion, mutations.window_expansion, mutations.approved_thresholds]) {
    const value = fixture(); mutate(value); reseal(value); assert.deepEqual(validate(value), denied);
  }
});

test('D5 inherited/accessor/proxy/private shapes are never executed or echoed', () => {
  let calls = 0;
  const x = fixture(); Object.defineProperty(x, 'activationReady', { get() { calls++; throw Error('private'); } });
  assert.deepEqual(validate(x), denied);
  const y = fixture(); Object.setPrototypeOf(y.cohort, { private: true }); assert.deepEqual(validate(y), denied);
  const z = fixture(); Object.defineProperty(z, 'private', { value: 'private' }); assert.deepEqual(validate(z), denied);
  const p = new Proxy(fixture(), { ownKeys() { calls++; throw Error('private'); } }); assert.deepEqual(validate(p), denied);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); assert.deepEqual(validate(revoked.proxy), denied);
  assert.equal(calls, 0);
});

test('D5 validation does not mutate the draft or expose personal observation storage', () => {
  const x = fixture(); const before = structuredClone(x); const a = validate(x);
  assert.deepEqual(x, before); assert.deepEqual(validate(x), a);
  assert.equal(registered.privacy.retentionDuration, null);
  assert.equal(registered.privacy.realMissionDataAllowed, false);
  assert.equal(registered.privacy.output, 'synthetic_or_reviewed_non_identifying_aggregates_only');
});

test('D5 draft and validator have no runtime/app/route/config consumer', () => {
  for (const directory of ['lib', 'backend/src', 'backend/ops', 'tool', 'scripts', 'web']) {
    for (const name of readdirSync(root + directory, { recursive: true })) {
      if (!/\.(?:dart|js|mjs|json|sh|html)$/u.test(name)) continue;
      assert.doesNotMatch(readFileSync(`${root}${directory}/${name}`, 'utf8'), /mission_d5_preregistration|SIT_MISSION_D5_PREREGISTRATION/u);
    }
  }
});
