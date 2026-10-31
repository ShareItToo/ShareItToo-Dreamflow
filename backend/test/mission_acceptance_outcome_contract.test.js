import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { evaluateSyntheticMissionAcceptanceOutcome as evaluate } from '../src/mission_acceptance_outcome_contract.js';

const version = 'mission_acceptance_outcome_v1';
const namespace = 'p7a1-synthetic-11111111-1111-4111-8111-111111111111';
const id = (kind, suffix) => `${namespace}:${kind}:${suffix}`;
function fixture() {
  const root = {
    version: 'P7-A1-2026-10-03.1', missionNeedId: id('mission', 'one'), missionOwnerId: id('principal', 'renter'),
    missionRevision: 1, missionPayloadDigest: 'a'.repeat(64), resolutionId: id('resolution', 'one'),
    resolutionRevision: 2, resolutionDigest: 'b'.repeat(64), fitSourceSnapshotDigest: 'c'.repeat(64),
    projectionDigest: 'd'.repeat(64),
  };
  const components = [1, 2].map((ordinal) => ({
    slotKey: `required:plant_container_equipment:${ordinal}`, needKey: 'plant_container_equipment',
    necessity: 'required', ordinal, itemId: id('item', `${ordinal}`), itemType: 'listing',
    ownerId: id('principal', `owner${ordinal}`), renterId: root.missionOwnerId,
    sourceDigest: `${ordinal}`.repeat(64), bindingStatus: 'non_binding',
  }));
  return {
    schemaVersion: version, synthetic: true, authentic: false, namespace, root,
    componentSlots: components.map((component) => component.slotKey), components,
    requests: components.map((component) => ({ slotKey: component.slotKey, binding: null })),
    observations: components.map((binding) => ({
      slotKey: binding.slotKey, root: structuredClone(root), binding: structuredClone(binding), freshness: 'current',
      request: null, attempt: 'not_started', readback: { status: 'not_requested' }, effect: { status: 'not_observed' }, replay: { status: 'not_claimed' },
    })),
  };
}
function state(input, index, status) {
  const states = {
    not_started: ['not_started', 'not_requested', 'not_observed'],
    in_flight: ['in_flight', 'unknown', 'not_observed'],
    response_unknown: ['response_unknown', 'unknown', 'not_observed'],
    no_effect: ['completed', 'no_effect', 'none'],
    effect: ['completed', 'effect_observed', 'observed'],
  };
  const row = input.observations[index];
  row.attempt = states[status][0]; row.readback = { status: states[status][1] }; row.effect = { status: states[status][2] };
  const component = input.components.find((c) => c.slotKey === row.slotKey);
  const request = status === 'not_started' ? null : {
    actorId: component.ownerId, quoteId: id('quote', `${index}`), quoteHash: 'e'.repeat(64),
    commandId: id('command', `${index}`), idempotencyKey: id('key', `${index}`), requestDigest: `${index + 3}`.repeat(64),
  };
  input.requests.find((r) => r.slotKey === row.slotKey).binding = request;
  row.request = structuredClone(request);
  if (status === 'effect') {
    row.readback.identifiers = { bookingId: id('booking', `${index}`), contractId: id('contract', `${index}`) };
    row.effect.identifiers = structuredClone(row.readback.identifiers);
  }
  return input;
}
function rejected(input, reason) {
  const output = evaluate(input);
  assert.ok(['unavailable', 'needs_clarification'].includes(output.status), JSON.stringify(output));
  if (reason) assert.ok(output.reasons.includes(reason) || output.components.some((c) => c.reasons.includes(reason)), JSON.stringify(output));
  return output;
}

test('complete synthetic closed set is initially not started, detached, immutable and non-binding', () => {
  const input = fixture(); const before = structuredClone(input);
  assert.doesNotMatch(JSON.stringify(input), /bookingId|contractId|paymentId|providerId|quoteId|commandId|idempotencyKey/u);
  const result = evaluate(input);
  assert.equal(result.schemaVersion, version);
  assert.equal(result.status, 'not_started');
  assert.equal(result.bindingStatus, 'non_binding');
  assert.equal(result.legalBindingStatus, 'not_determined');
  assert.equal(result.missionBindingStatus, 'not_determined');
  assert.equal(result.paymentStatus, 'not_determined');
  assert.equal(result.remediation, 'none');
  assert.deepEqual(result.publicOutcome, { status: 'unavailable' });
  assert.deepEqual(result.components.map((c) => c.componentIndex), [0, 1]);
  assert.deepEqual(input, before);
  const saved = JSON.stringify(result);
  input.root.missionRevision = 90; input.observations[0].effect = 'observed'; input.components.pop();
  assert.equal(JSON.stringify(result), saved);
  for (const value of [result, result.components, result.reasons, result.publicOutcome, ...result.components, ...result.components.map((c) => c.reasons)]) assert.ok(Object.isFrozen(value));
});

test('full two-component state matrix preserves partial effects ahead of unresolved readback', () => {
  const values = ['not_started', 'in_flight', 'response_unknown', 'no_effect', 'effect'];
  const expected = [
    ['not_started', 'readback_required', 'readback_required', 'readback_required', 'partial_effects_need_recovery'],
    ['readback_required', 'readback_required', 'readback_required', 'readback_required', 'partial_effects_need_recovery'],
    ['readback_required', 'readback_required', 'readback_required', 'readback_required', 'partial_effects_need_recovery'],
    ['readback_required', 'readback_required', 'readback_required', 'no_effect_observed', 'partial_effects_need_recovery'],
    ['partial_effects_need_recovery', 'partial_effects_need_recovery', 'partial_effects_need_recovery', 'partial_effects_need_recovery', 'effects_observed_only'],
  ];
  for (const [a, first] of values.entries()) for (const [b, second] of values.entries()) {
    const result = evaluate(state(state(fixture(), 0, first), 1, second));
    assert.equal(result.status, expected[a][b], `${first}/${second}`);
    assert.equal(result.components.length, 2);
    assert.equal(result.legalBindingStatus, 'not_determined');
    assert.equal(result.paymentStatus, 'not_determined');
    assert.equal(result.missionBindingStatus, 'not_determined');
    assert.equal(result.remediation, 'none');
  }
});

test('optional component effects are never discarded or inferred as Mission success', () => {
  const input = fixture();
  for (const component of [input.components[1], input.observations[1].binding]) {
    component.necessity = 'optional'; component.slotKey = 'optional:plant_container_equipment:2';
  }
  input.componentSlots[1] = 'optional:plant_container_equipment:2';
  input.observations[1].slotKey = input.componentSlots[1];
  input.requests[1].slotKey = input.componentSlots[1];
  state(input, 1, 'effect');
  assert.equal(evaluate(input).status, 'partial_effects_need_recovery');
  input.observations[1].effect = 'none';
  assert.equal(rejected(input).status, 'needs_clarification');
});

for (const field of Object.keys(fixture().root)) {
  test(`root ${field}: missing, foreign and changed parent/revision/digest rejected`, () => {
    for (const operation of ['missing', 'changed', 'invalid']) {
      const input = fixture();
      if (operation === 'missing') delete input.observations[0].root[field];
      else input.observations[0].root[field] = operation === 'invalid' ? null
        : typeof input.root[field] === 'number' ? input.root[field] + 1 : `${input.root[field]}x`;
      rejected(input, 'root_mismatch');
    }
    const invalid = fixture(); delete invalid.root[field]; rejected(invalid, 'root_invalid');
  });
}
for (const field of Object.keys(fixture().components[0])) {
  test(`component ${field}: every observed field must match exactly`, () => {
    for (const value of [undefined, null, typeof fixture().components[0][field] === 'number' ? 99 : 'foreign-value']) {
      const input = fixture();
      if (value === undefined) delete input.observations[0].binding[field];
      else input.observations[0].binding[field] = value;
      rejected(input, 'component_mismatch');
    }
    const missing = fixture(); delete missing.components[0][field]; rejected(missing, 'components_invalid');
  });
}

test('missing/duplicate/extra component membership and duplicate identities fail closed', () => {
  for (const mutate of [
    (x) => x.components.pop(), (x) => x.componentSlots.pop(),
    (x) => x.componentSlots.push(x.componentSlots[0]), (x) => x.components.push(structuredClone(x.components[0])),
    (x) => { x.components = []; x.componentSlots = []; x.observations = []; },
  ]) { const input = fixture(); mutate(input); rejected(input); }
  for (const field of ['itemId']) {
    const input = fixture(); input.components[1][field] = input.components[0][field]; rejected(input, 'component_collision');
  }
  for (const pair of [['itemId', 'ownerId'], ['itemId', 'renterId']]) {
    const input = fixture(); input.components[0][pair[0]] = input.components[0][pair[1]];
    rejected(input, 'component_collision');
  }
});

test('synthetic namespace, markers, version, grammar, owner and actor are strict even on coherent input', () => {
  for (const [key, value] of [['synthetic', false], ['authentic', true], ['schemaVersion', 'v0'], ['namespace', 'real']]) {
    const input = fixture(); input[key] = value; rejected(input, 'envelope_invalid');
  }
  for (const key of ['missionNeedId', 'missionOwnerId', 'resolutionId']) {
    const input = fixture(); input.root[key] = 'real-identifier'; rejected(input, 'root_invalid');
  }
  for (const key of ['missionRevision', 'resolutionRevision']) for (const value of [0, -1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const input = fixture(); input.root[key] = value; rejected(input, 'root_invalid');
  }
  for (const [field, value] of [
    ['renterId', id('principal', 'foreign')],
    ['ownerId', id('principal', 'renter')], ['itemId', 'real-item'], ['needKey', 'vehicle'],
    ['ordinal', 0], ['ordinal', 1.5], ['sourceDigest', 'A'.repeat(64)],
    ['slotKey', 'required:plant_container_equipment:99'], ['bindingStatus', 'bound'],
  ]) {
    const input = fixture(); input.components[0][field] = value;
    input.observations[0].binding = structuredClone(input.components[0]); rejected(input, 'components_invalid');
  }
});

test('a coherently substituted component principal cannot alias a root resource', () => {
  for (const field of ['missionNeedId', 'resolutionId']) {
    const input = fixture();
    input.components[0].ownerId = input.root[field];
    input.observations[0].binding = structuredClone(input.components[0]);
    rejected(input, 'component_collision');
  }
});

test('request collision on a duplicated cross-component key is explicit, independent of ordering', () => {
  const input = state(state(fixture(), 0, 'no_effect'), 1, 'no_effect');
  input.requests[1].binding.idempotencyKey = input.requests[0].binding.idempotencyKey;
  const result = rejected(input, 'idempotency_collision');
  assert.deepEqual(result.reasons, ['component_collision', 'idempotency_collision']);
  input.components.reverse();
  assert.deepEqual(evaluate(input), result);
});

test('missing, extra, duplicated and contradictory observation sets never collapse to success', () => {
  const missing = fixture(); missing.observations.pop(); rejected(missing, 'observation_missing');
  const extra = fixture(); extra.observations[0].slotKey = 'foreign:slot'; rejected(extra, 'unknown_observation');
  const duplicate = fixture(); duplicate.observations.push(structuredClone(duplicate.observations[0]));
  rejected(duplicate, 'observation_duplicate');
  duplicate.observations[2].freshness = 'stale'; rejected(duplicate, 'observation_conflicting');
  const before = evaluate(duplicate); duplicate.observations.reverse();
  assert.deepEqual(evaluate(duplicate), before);
});

test('every malformed, stale, unknown or incompatible attempt/readback/effect fails closed', () => {
  for (const field of ['freshness', 'attempt', 'readback', 'effect', 'replay']) {
    for (const value of [undefined, null, false, {}, [], 'unknown-value']) {
      const input = fixture();
      if (value === undefined) delete input.observations[0][field]; else input.observations[0][field] = value;
      rejected(input);
    }
  }
  for (const value of ['stale', 'unknown']) {
    const input = fixture(); input.observations[0].freshness = value; rejected(input, 'observation_stale');
  }
  for (const attempt of ['not_started', 'in_flight', 'response_unknown', 'completed']) {
    for (const readback of ['not_requested', 'unknown', 'no_effect', 'effect_observed']) {
      for (const effect of ['not_observed', 'none', 'observed']) {
        const allowed = [
          'not_started/not_requested/not_observed', 'in_flight/unknown/not_observed',
          'response_unknown/unknown/not_observed', 'completed/no_effect/none', 'completed/effect_observed/observed',
        ];
        if (allowed.includes(`${attempt}/${readback}/${effect}`)) continue;
        const input = fixture(); Object.assign(input.observations[0], { attempt, readback: { status: readback }, effect: { status: effect } });
        rejected(input, 'state_conflict');
      }
    }
  }
});

test('replay consistency is an explicit bound observation only; every replay field collision rejects', () => {
  const input = state(fixture(), 0, 'effect');
  const component = input.requests[0].binding;
  input.observations[0].replay = {
    status: 'supplied_consistent', actorId: component.actorId, commandId: component.commandId,
    idempotencyKey: component.idempotencyKey, requestDigest: component.requestDigest,
  };
  const result = evaluate(input);
  assert.equal(result.components[0].replayStatus, 'supplied_consistent_only');
  for (const field of ['actorId', 'commandId', 'idempotencyKey', 'requestDigest']) {
    const changed = structuredClone(input); changed.observations[0].replay[field] = 'foreign';
    rejected(changed, field === 'requestDigest' ? 'idempotency_collision' : 'replay_mismatch');
    const missing = structuredClone(input); delete missing.observations[0].replay[field]; rejected(missing, 'replay_invalid');
  }
  const falseClaim = fixture(); falseClaim.observations[0].replay = structuredClone(input.observations[0].replay);
  rejected(falseClaim, 'replay_state_conflict');
  const collided = state(fixture(), 0, 'no_effect'); collided.observations[0].request.requestDigest = '0'.repeat(64);
  rejected(collided, 'idempotency_collision');
});

test('reason/component order is deterministic; a foreign observation cannot contaminate another component', () => {
  const input = state(fixture(), 1, 'effect');
  input.observations[0].freshness = 'stale'; input.observations[0].binding.ownerId = id('principal', 'foreign');
  input.observations[0].root.missionRevision += 1;
  const result = rejected(input);
  assert.deepEqual(result.components[0].reasons, ['root_mismatch', 'component_mismatch', 'observation_stale']);
  assert.equal(result.components[1].status, 'effects_observed_only');
  input.components.reverse(); input.componentSlots.reverse(); input.requests.reverse(); input.observations.reverse();
  input.root = Object.fromEntries(Object.entries(input.root).reverse());
  assert.deepEqual(evaluate(input), result);
});

test('all output is non-identifying and public output never distinguishes any state', () => {
  const inputs = [fixture(), state(fixture(), 0, 'effect'), state(state(fixture(), 0, 'effect'), 1, 'effect'), null];
  for (const input of inputs) {
    const result = evaluate(input); assert.deepEqual(result.publicOutcome, { status: 'unavailable' });
    const bytes = JSON.stringify(result);
    assert.ok(!bytes.includes(namespace));
    for (const value of ['missionNeedId', 'ownerId', 'quoteId', 'requestDigest', 'slotKey', 'plant_container_equipment']) assert.ok(!bytes.includes(value));
    assert.equal(result.legalBindingStatus, 'not_determined');
    assert.equal(result.missionBindingStatus, 'not_determined');
    assert.equal(result.paymentStatus, 'not_determined');
    assert.equal(result.remediation, 'none');
  }
});

test('hidden, inherited, symbolic, accessor and executable shapes never execute or pass', () => {
  for (const value of [undefined, null, [], '', 1, Object.create(fixture())]) rejected(value);
  const targets = [
    (x) => x, (x) => x.root, (x) => x.components[0], (x) => x.observations[0],
    (x) => x.observations[0].root, (x) => x.observations[0].binding, (x) => x.observations[0].replay,
    (x) => x.requests[0], (x) => x.requests[0].binding, (x) => x.observations[0].request,
    (x) => x.observations[0].readback, (x) => x.observations[0].effect,
    (x) => x.observations[0].effect.identifiers, (x) => x.observations[0].readback.identifiers,
  ];
  for (const target of targets) for (const mode of ['hidden', 'getter', 'symbol', 'inherited']) {
    const input = state(fixture(), 0, 'effect'); const object = target(input);
    if (mode === 'hidden') Object.defineProperty(object, 'extra', { value: 'private' });
    if (mode === 'getter') Object.defineProperty(object, 'extra', { enumerable: true, get() { throw new Error('executed'); } });
    if (mode === 'symbol') object[Symbol('extra')] = 'private';
    if (mode === 'inherited') Object.setPrototypeOf(object, { extra: 'private' });
    rejected(input);
  }
  for (const key of ['componentSlots', 'components', 'requests', 'observations']) {
    for (const mode of ['sparse', 'getter', 'iterator']) {
      const input = fixture();
      if (mode === 'sparse') input[key] = new Array(2);
      if (mode === 'getter') Object.defineProperty(input[key], '0', { get() { throw new Error('executed'); } });
      if (mode === 'iterator') { const prototype = Object.create(Array.prototype); prototype[Symbol.iterator] = () => { throw new Error('executed'); }; Object.setPrototypeOf(input[key], prototype); }
      rejected(input);
    }
  }
});

for (const field of Object.keys(state(fixture(), 0, 'no_effect').requests[0].binding)) {
  test(`request ${field}: complete exact attempted binding only`, () => {
    for (const value of [undefined, null, 'foreign']) {
      const input = state(fixture(), 0, 'no_effect');
      if (value === undefined) delete input.observations[0].request[field]; else input.observations[0].request[field] = value;
      rejected(input, 'request_mismatch');
    }
    const input = state(fixture(), 0, 'no_effect'); delete input.requests[0].binding[field]; rejected(input, 'requests_invalid');
  });
}

test('no phase invents future effect IDs or an unattempted request', () => {
  for (const phase of ['not_started', 'no_effect', 'in_flight', 'response_unknown']) {
    const baseline = state(fixture(), 0, phase);
    assert.doesNotMatch(JSON.stringify(baseline), /bookingId|contractId|paymentId|providerId/u);
    for (const target of ['binding', 'readback', 'effect']) for (const field of ['bookingId', 'contractId', 'paymentId', 'providerId']) {
      const input = structuredClone(baseline); input.observations[0][target][field] = id(field, 'future'); rejected(input);
    }
    const nested = structuredClone(baseline); nested.observations[0].effect.identifiers = { bookingId: id('booking', 'future'), contractId: id('contract', 'future') };
    rejected(nested, 'effect_invalid');
  }
  const unstarted = fixture();
  unstarted.requests[0].binding = structuredClone(state(fixture(), 0, 'no_effect').requests[0].binding);
  unstarted.observations[0].request = structuredClone(unstarted.requests[0].binding);
  rejected(unstarted, 'request_phase_conflict');
  const started = state(fixture(), 0, 'in_flight'); started.requests[0].binding = null; started.observations[0].request = null;
  rejected(started, 'request_phase_conflict');
});

test('effect identifiers exist only as complete exact matching authoritative observations', () => {
  for (const side of ['readback', 'effect']) for (const field of ['bookingId', 'contractId']) {
    for (const value of [undefined, null, 'real-id', id('foreign', 'effect')]) {
      const input = state(fixture(), 0, 'effect');
      if (value === undefined) delete input.observations[0][side].identifiers[field]; else input.observations[0][side].identifiers[field] = value;
      rejected(input);
    }
    const missing = state(fixture(), 0, 'effect'); delete missing.observations[0][side].identifiers; rejected(missing, 'effect_invalid');
    for (const extra of ['paymentId', 'providerId']) {
      const input = state(fixture(), 0, 'effect'); input.observations[0][side].identifiers[extra] = id(extra, 'one'); rejected(input, 'effect_invalid');
    }
  }
  const duplicate = state(state(fixture(), 0, 'effect'), 1, 'effect');
  for (const side of ['readback', 'effect']) duplicate.observations[1][side].identifiers = structuredClone(duplicate.observations[0][side].identifiers);
  rejected(duplicate, 'effect_collision');
  for (const value of [fixture().components[0].itemId, fixture().components[0].ownerId, fixture().root.missionNeedId, id('quote', '0')]) {
    const input = state(fixture(), 0, 'effect');
    for (const side of ['readback', 'effect']) input.observations[0][side].identifiers.bookingId = value;
    rejected(input, 'effect_collision');
  }
});

test('request membership and coherent foreign actors or collided resources fail closed', () => {
  for (const mutate of [(x) => x.requests.pop(), (x) => x.requests.push(structuredClone(x.requests[0])), (x) => { x.requests[0].slotKey = 'foreign'; }]) {
    const input = fixture(); mutate(input); rejected(input, 'requests_invalid');
  }
  for (const [key, value] of [['actorId', id('principal', 'foreign')], ['quoteHash', 'A'.repeat(64)], ['commandId', 'real']]) {
    const input = state(fixture(), 0, 'no_effect'); input.requests[0].binding[key] = value; rejected(input, 'requests_invalid');
  }
  for (const field of ['quoteId', 'commandId', 'idempotencyKey']) {
    const input = state(state(fixture(), 0, 'no_effect'), 1, 'no_effect'); input.requests[1].binding[field] = input.requests[0].binding[field]; rejected(input, 'component_collision');
  }
});

test('module is pure and no repository consumer exists outside the exact three package files', async () => {
  const sourcePath = 'backend/src/mission_acceptance_outcome_contract.js';
  const testPath = 'backend/test/mission_acceptance_outcome_contract.test.js';
  const docPath = 'docs/operations/SIT_MISSION_D1_D2_SYNTHETIC_ACCEPTANCE_OUTCOME_CONTRACT_2026-10-03.md';
  const root = new URL('../../', import.meta.url);
  const source = await readFile(new URL(sourcePath, root), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|\brequire\s*\(|\bprocess\b|\bDate\b|Math\.random|randomUUID|\bfetch\b|setTimeout|setInterval|node:|https?:|localStorage|sessionStorage|SharedPreferences|\.query\s*\(/u);
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of new Set(paths)) {
    if ([sourcePath, testPath, docPath].includes(path)) continue;
    if (!/\.(?:js|mjs|cjs|jsx|ts|tsx|py|dart|json|ya?ml|md|sh|html|toml|sql)$/u.test(path)) continue;
    assert.doesNotMatch(await readFile(new URL(path, root), 'utf8'), /mission_acceptance_outcome_contract|evaluateSyntheticMissionAcceptanceOutcome/u, path);
  }
});
