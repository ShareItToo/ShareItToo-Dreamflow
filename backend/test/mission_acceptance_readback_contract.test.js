import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { evaluateSyntheticAcceptanceReadback as evaluate } from '../src/mission_acceptance_readback_contract.js';

const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const namespace = `p7a1-synthetic-${uuid(1)}`;
const principal = (role) => `${namespace}:principal:${role}`;
const digest = 'a'.repeat(64);
const clone = (x) => structuredClone(x);
function fixture(phase = 'not_started', commandType = 'booking.create') {
  const root = { version: 'P7-A1-2026-10-03.1', missionNeedId: `mission_need_${uuid(2)}`,
    missionOwnerId: principal('renter'), missionRevision: 1, missionPayloadDigest: digest,
    resolutionId: `mission_inventory_${uuid(3)}`, resolutionRevision: 2, resolutionDigest: digest,
    fitSourceSnapshotDigest: digest, projectionDigest: digest };
  const component = { slotKey: 'required:plant_container_equipment:1', needKey: 'plant_container_equipment',
    necessity: 'required', ordinal: 1, itemId: `${namespace}:listing:one`, itemType: 'listing',
    ownerId: principal('owner'), renterId: root.missionOwnerId, sourceDigest: digest, bindingStatus: 'non_binding' };
  const owner = commandType === 'booking.transition';
  const plannedRequest = phase === 'not_started' ? null : { commandType, requestedState: owner ? 'accepted' : 'requested',
    actorRole: owner ? 'owner' : 'renter', actorId: principal(owner ? 'owner' : 'renter'),
    idempotencyKey: `${namespace}:command:one`, requestDigest: digest, quoteId: `quote_${uuid(4)}`, quoteHash: digest };
  const association = { kind: 'synthetic_slot_command_association_v2', root: clone(root), component: clone(component),
    request: clone(plannedRequest), snapshotDigest: digest };
  const ids = { bookingId: `${namespace}:booking:one`, contractId: uuid(5), quoteId: `quote_${uuid(4)}`, quoteHash: digest };
  const preExistingContext = owner && phase !== 'not_started' ? {
    kind: 'pre_existing_booking_contract_v2', association: clone(association), ...ids,
    bookingStatus: 'requested', bookingRevision: 1, contractUserId: principal('renter'),
    creationActorRole: 'renter', creationActorId: principal('renter'), creationCommandType: 'booking.create',
  } : null;
  const observedEffect = phase === 'effect_observed' ? {
    kind: owner ? 'owner_acceptance_transition_v2' : 'renter_request_created_v2', association: clone(association), ...ids,
    bookingStatus: owner ? 'accepted' : 'requested', bookingRevision: owner ? 2 : 1,
    contractUserId: principal('renter'), actorRole: plannedRequest.actorRole, actorId: plannedRequest.actorId,
    commandType, idempotencyKey: plannedRequest.idempotencyKey, requestDigest: plannedRequest.requestDigest,
  } : null;
  const fixtureIdentities = [
    { kind: 'mission', value: root.missionNeedId }, { kind: 'resolution', value: root.resolutionId },
    { kind: 'listing', value: component.itemId },
    ...(plannedRequest ? [{ kind: 'quote', value: plannedRequest.quoteId }] : []),
    ...(preExistingContext || observedEffect ? [{ kind: 'booking', value: ids.bookingId }, { kind: 'contract', value: ids.contractId }] : []),
  ];
  return { schemaVersion: 'mission_acceptance_readback_v2', synthetic: true, authentic: false,
    fixtureNamespace: namespace, fixtureIdentities, root, component, plannedRequest, association,
    readback: { origin: 'synthetic_server_fixture', snapshotDigest: digest, freshness: 'current', phase,
      completion: phase === 'not_started' ? 'not_started' : ['no_effect', 'effect_observed'].includes(phase) ? 'completed' : 'unknown',
      effect: clone(observedEffect), noEffectProof: phase === 'no_effect'
        ? { kind: 'synthetic_terminal_no_effect_v2', association: clone(association) } : null },
    preExistingContext, observedEffect, replay: { status: 'not_claimed' } };
}
function rejected(x, reason) {
  const out = evaluate(x); assert.ok(['unavailable', 'needs_clarification'].includes(out.status), JSON.stringify(out));
  if (reason) assert.ok(out.reasons.includes(reason), JSON.stringify(out)); return out;
}
function safe(out) {
  assert.deepEqual(out.publicOutcome, { status: 'unavailable' });
  for (const key of ['legalBindingStatus', 'missionBindingStatus', 'paymentStatus', 'retrySafety']) assert.equal(out[key], 'not_determined');
  assert.equal(out.bindingStatus, 'non_binding'); assert.equal(out.remediation, 'none');
  assert.doesNotMatch(JSON.stringify(out), /mission_need_|quote_|bookingId|contractId|principal:|slotKey|requestDigest/u);
}

test('native synthetic root stays byte-exact; baseline carries no future context/effect IDs', () => {
  const input = fixture(); const before = clone(input); const out = evaluate(input);
  assert.equal(out.status, 'not_started'); safe(out); assert.deepEqual(input, before);
  assert.doesNotMatch(JSON.stringify(input), /bookingId|contractId|paymentId|providerId/u);
  input.root.missionRevision = 9; assert.equal(out.status, 'not_started');
  for (const v of [out, out.reasons, out.publicOutcome]) assert.ok(Object.isFrozen(v));
});

for (const commandType of ['booking.create', 'booking.transition']) for (const phase of ['in_flight', 'response_unknown', 'no_effect', 'effect_observed']) {
  test(`${commandType}/${phase}: explicit role and separate context/effect`, () => {
    const x = fixture(phase, commandType); const out = evaluate(x); safe(out);
    assert.equal(out.status, phase === 'effect_observed' ? 'effects_observed_only' : phase === 'no_effect' ? 'no_effect_observed' : 'readback_required');
    assert.equal(out.contextStatus, commandType === 'booking.transition' ? 'pre_existing_context_only' : 'none');
    assert.equal(out.effectStatus, phase === 'effect_observed' ? 'observed_only' : 'not_observed');
  });
}

test('missing association always remains unmapped, never no-effect or retry-safe', () => {
  for (const phase of ['not_started', 'in_flight', 'response_unknown', 'no_effect', 'effect_observed']) {
    const x = fixture(phase); x.association = null; const out = rejected(x, 'association_missing');
    assert.equal(out.status, 'unavailable'); assert.equal(out.mappingStatus, 'unmapped'); safe(out);
  }
});

for (const group of ['root', 'component', 'plannedRequest']) {
  for (const key of Object.keys(fixture('effect_observed').association[group === 'plannedRequest' ? 'request' : group])) {
    test(`association ${group}.${key}: missing, partial, foreign binding rejected`, () => {
      for (const value of [undefined, null, 'foreign']) {
        const x = fixture('effect_observed'); const target = x.association[group === 'plannedRequest' ? 'request' : group];
        if (value === undefined) delete target[key]; else target[key] = value;
        rejected(x, 'association_mismatch');
      }
    });
  }
}

test('actors cannot be relabelled across create/accept; command types are not inferred', () => {
  for (const command of ['booking.create', 'booking.transition']) for (const [key, value] of [
    ['actorRole', 'admin'], ['actorRole', command === 'booking.create' ? 'owner' : 'renter'],
    ['actorId', principal('foreign')], ['commandType', 'booking_group.renter_consent'],
    ['requestedState', 'confirmed'], ['idempotencyKey', 'real-key'],
  ]) { const x = fixture('no_effect', command); x.plannedRequest[key] = value; rejected(x, 'request_invalid'); }
});

test('a pre-existing requested contract before owner acceptance is context, not an effect', () => {
  const x = fixture('response_unknown', 'booking.transition'); const out = evaluate(x);
  assert.equal(out.status, 'readback_required'); assert.equal(out.effectStatus, 'not_observed');
  const moved = clone(x); moved.observedEffect = moved.preExistingContext; moved.preExistingContext = null; rejected(moved);
  for (const phase of ['not_started', 'no_effect', 'response_unknown']) {
    const extra = fixture(phase); extra.observedEffect = fixture('effect_observed').observedEffect; rejected(extra, 'effect_phase_conflict');
  }
  const creation = fixture('no_effect'); creation.preExistingContext = x.preExistingContext; rejected(creation, 'context_phase_conflict');
});

for (const group of ['preExistingContext', 'observedEffect']) for (const key of Object.keys(fixture('effect_observed', 'booking.transition')[group])) {
  test(`${group}.${key}: exact complete lifecycle/actor/parent proof required`, () => {
    for (const value of [undefined, null, 'foreign']) {
      const x = fixture('effect_observed', 'booking.transition');
      if (value === undefined) delete x[group][key]; else x[group][key] = value;
      rejected(x, group === 'preExistingContext' ? 'context_invalid' : 'effect_invalid');
    }
  });
}

test('native IDs are fixture registered, never prefixed aliases or invented future inventory', () => {
  for (const group of ['root', 'plannedRequest', 'preExistingContext', 'observedEffect']) {
    const fields = group === 'root' ? ['missionNeedId', 'resolutionId'] : group === 'plannedRequest' ? ['quoteId'] : ['bookingId', 'contractId', 'quoteId'];
    for (const field of fields) {
      const x = fixture('effect_observed', 'booking.transition'); x[group][field] = `${namespace}:${x[group][field]}`; rejected(x);
    }
  }
  for (const mutate of [(x) => x.fixtureIdentities.pop(), (x) => x.fixtureIdentities.push(clone(x.fixtureIdentities[0])),
    (x) => x.fixtureIdentities.push({ kind: 'contract', value: uuid(9) }), (x) => { x.synthetic = false; },
    (x) => { x.authentic = true; }, (x) => { x.schemaVersion = 'v1'; }, (x) => { x.fixtureNamespace = 'real'; }]) {
    const x = fixture(); mutate(x); rejected(x);
  }
});

test('readback must bind same snapshot and exact effect; no effect requires explicit terminal proof', () => {
  for (const [field, value] of [['origin', 'client'], ['snapshotDigest', 'b'.repeat(64)], ['freshness', 'stale'], ['completion', 'unknown']]) {
    const x = fixture('effect_observed'); x.readback[field] = value; rejected(x);
  }
  const absent = fixture('no_effect'); absent.readback.noEffectProof = null; rejected(absent, 'no_effect_unproven');
  const mismatch = fixture('effect_observed'); mismatch.readback.effect.bookingRevision = 99; rejected(mismatch, 'readback_mismatch');
  const unknown = fixture('response_unknown'); unknown.readback.noEffectProof = fixture('no_effect').readback.noEffectProof; rejected(unknown);
  const missing = fixture('effect_observed', 'booking.transition'); missing.preExistingContext = null; rejected(missing, 'context_invalid');
});

test('replay is supplied consistency only and key/digest/actor/type collisions fail closed', () => {
  const x = fixture('no_effect'); x.replay = { status: 'supplied_consistent', request: clone(x.plannedRequest), association: clone(x.association) };
  assert.equal(evaluate(x).replayStatus, 'supplied_consistent_only');
  for (const field of ['idempotencyKey', 'requestDigest', 'actorId', 'actorRole', 'commandType']) {
    const changed = clone(x); changed.replay.request[field] = 'foreign'; rejected(changed, 'replay_invalid');
  }
  const unknown = fixture('response_unknown'); unknown.replay = x.replay; rejected(unknown, 'replay_invalid');
});

test('output and reason order are detached, deterministic, non-identifying', () => {
  const x = fixture('effect_observed', 'booking.transition'); x.readback.freshness = 'stale'; x.observedEffect.actorId = principal('foreign');
  const out = rejected(x); safe(out); const before = JSON.stringify(out);
  const reversed = (v) => Array.isArray(v) ? v.map(reversed).reverse() : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).reverse().map(([k, child]) => [k, reversed(child)])) : v;
  assert.deepEqual(evaluate(reversed(x)), out); x.observedEffect = null; assert.equal(JSON.stringify(out), before);
});

test('hidden/accessor/inherited/symbol/executable shapes reject without invocation', () => {
  const targets = [(x) => x, (x) => x.root, (x) => x.component, (x) => x.plannedRequest, (x) => x.association,
    (x) => x.association.root, (x) => x.readback, (x) => x.preExistingContext, (x) => x.observedEffect, (x) => x.fixtureIdentities[0], (x) => x.replay];
  for (const target of targets) for (const mode of ['hidden', 'accessor', 'inherited', 'symbol', 'executable']) {
    const x = fixture('effect_observed', 'booking.transition'); const v = target(x);
    if (mode === 'hidden') Object.defineProperty(v, 'hidden', { value: 1 });
    if (mode === 'accessor') Object.defineProperty(v, 'hidden', { enumerable: true, get() { throw Error('executed'); } });
    if (mode === 'inherited') Object.setPrototypeOf(v, { extra: 1 });
    if (mode === 'symbol') v[Symbol('private')] = 1;
    if (mode === 'executable') v.extra = () => { throw Error('executed'); };
    rejected(x);
  }
  for (const mode of ['sparse', 'accessor', 'prototype']) {
    const x = fixture();
    if (mode === 'sparse') x.fixtureIdentities = new Array(3);
    if (mode === 'accessor') Object.defineProperty(x.fixtureIdentities, '0', { get() { throw Error('executed'); } });
    if (mode === 'prototype') Object.setPrototypeOf(x.fixtureIdentities, Object.create(Array.prototype));
    rejected(x);
  }
});

test('every required top-level, stable and readback field fails closed when missing', () => {
  for (const target of [null, 'root', 'component', 'plannedRequest', 'readback', 'replay']) {
    for (const key of Object.keys(target ? fixture('no_effect')[target] : fixture('no_effect'))) {
      const x = fixture('no_effect'); delete (target ? x[target] : x)[key]; rejected(x);
    }
  }
  for (const group of ['root', 'component', 'plannedRequest']) for (const key of Object.keys(fixture('no_effect')[group])) {
    for (const value of [null, false, {}, [], 'wrong']) {
      const x = fixture('no_effect'); x[group][key] = value; rejected(x);
    }
  }
});

test('unknown, no-effect, completion and observed-effect presence never imply retry permission', () => {
  for (const phase of ['not_started', 'in_flight', 'response_unknown', 'no_effect', 'effect_observed']) {
    for (const completion of ['not_started', 'unknown', 'completed', 'rolled_back', 'missing_row']) {
      const x = fixture(phase); const correct = x.readback.completion; x.readback.completion = completion;
      if (correct !== completion) rejected(x, 'readback_invalid'); else safe(evaluate(x));
    }
  }
  for (const phase of ['not_started', 'in_flight', 'response_unknown', 'no_effect']) {
    const x = fixture(phase); x.readback.effect = fixture('effect_observed').observedEffect; rejected(x, 'readback_mismatch');
  }
  const absent = fixture('effect_observed'); absent.observedEffect = null; absent.readback.effect = null; rejected(absent, 'effect_invalid');
});

test('private Shelf, coercible revisions and monetary/provider fields cannot widen this envelope', () => {
  for (const value of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    const x = fixture('no_effect'); x.root.missionRevision = value; rejected(x, 'root_invalid');
  }
  const shelf = fixture('no_effect'); shelf.component.itemType = 'private_shelf'; shelf.component.itemId = `shelf_item_${uuid(9)}`;
  rejected(shelf, 'component_invalid');
  for (const target of [null, 'plannedRequest', 'preExistingContext', 'observedEffect', 'readback']) for (const field of ['paymentId', 'providerId', 'retrySafe', 'cancel', 'refund']) {
    const x = fixture('effect_observed', 'booking.transition'); (target ? x[target] : x)[field] = 'unsupported'; rejected(x);
  }
  const optional = fixture(); optional.component.necessity = 'optional'; optional.component.slotKey = 'optional:plant_container_equipment:1';
  optional.association.component = clone(optional.component); assert.equal(evaluate(optional).status, 'not_started');
});

test('null, executable, cyclic and over-deep values stay outside inert data contract', () => {
  for (const value of [undefined, null, [], '', 1, () => 1]) rejected(value);
  const cycle = fixture(); cycle.association = cycle; rejected(cycle, 'envelope_invalid');
  const deep = fixture(); let pointer = deep;
  for (let i = 0; i < 40; i += 1) { pointer.extra = {}; pointer = pointer.extra; }
  rejected(deep, 'envelope_invalid');
});

test('pure source and no consumers beyond this exact source/test/document package', () => {
  const root = new URL('../../', import.meta.url);
  const paths = ['backend/src/mission_acceptance_readback_contract.js', 'backend/test/mission_acceptance_readback_contract.test.js',
    'docs/operations/SIT_MISSION_D1_D2_SERVER_READBACK_CONTRACT_2026-10-03.md'];
  assert.doesNotMatch(readFileSync(new URL(paths[0], root), 'utf8'), /\bimport\b|\brequire\s*\(|\bprocess\b|\bDate\b|Math\.random|randomUUID|\bfetch\b|setTimeout|setInterval|node:|https?:|localStorage|sessionStorage|SharedPreferences|\.query\s*\(/u);
  for (const p of new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))) {
    if (paths.includes(p) || !/\.(js|mjs|cjs|ts|dart|json|ya?ml|md|sh|html|toml|sql)$/u.test(p)) continue;
    assert.doesNotMatch(readFileSync(new URL(p, root), 'utf8'), /mission_acceptance_readback_contract|evaluateSyntheticAcceptanceReadback/u, p);
  }
});
