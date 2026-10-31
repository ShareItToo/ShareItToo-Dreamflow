import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { evaluateMissionSupplySafety } from '../src/mission_supply_safety_contract.js';

const version = 'mission_supply_safety_v1';
const principal = ['actorId', 'requesterId', 'recipientId'];
const mission = ['requesterId', 'missionNeedId', 'missionRevision', 'missionDigest'];
const resolution = [...mission, 'resolutionId', 'resolutionRevision', 'resolutionDigest', 'slotKey', 'needKey'];
const participation = ['recipientId', 'participationId', 'participationRevision'];
const item = [...participation, 'shelfItemId', 'itemRevision', 'needKey'];
const demand = [...new Set([...principal, ...resolution, ...item]), 'demandId', 'demandRevision', 'purpose'];
// Independent, explicit fixture binding matrix, not imported from the implementation.
const bindings = {
  principal, mission, resolution, participation, item, demand,
  release: [...demand, 'releaseId', 'releasedRevision'],
  expiry: [...demand, 'releaseId', 'releasedRevision'],
  blocks: [...demand], rateLimit: [...demand],
  support: [...demand, 'supportReference'],
};
const states = {
  principal: 'confirmed', mission: 'current', resolution: 'current',
  participation: 'active', item: 'confirmed_available', demand: 'released',
  release: 'active', expiry: 'active', blocks: 'clear', rateLimit: 'permitted', support: 'authorized',
};

function fixture() {
  const expected = {
    actorId: 'synthetic-requester', requesterId: 'synthetic-requester', recipientId: 'synthetic-recipient',
    missionNeedId: 'synthetic-mission', missionRevision: 2, missionDigest: 'a'.repeat(64),
    resolutionId: 'synthetic-resolution', resolutionRevision: 3, resolutionDigest: 'b'.repeat(64),
    slotKey: 'plant_container_equipment:required:1', needKey: 'plant_container_equipment',
    participationId: 'synthetic-participation', participationRevision: 4,
    shelfItemId: 'synthetic-item', itemRevision: 5,
    demandId: 'synthetic-demand', demandRevision: 2, purpose: 'mission_gap_supply_v1',
    releaseId: 'synthetic-release', releasedRevision: 2, supportReference: 'synthetic-support',
  };
  return {
    schemaVersion: version, expected,
    observations: Object.fromEntries(Object.entries(bindings).map(([key, fields]) => [key, [{
      binding: Object.fromEntries(fields.map((field) => [field, expected[field]])),
      freshness: 'current', state: states[key],
    }]])),
  };
}

function abort(input, reason) {
  const result = evaluateMissionSupplySafety(input);
  assert.equal(result.evaluation, 'abort');
  assert.equal(result.bindingStatus, 'non_binding');
  assert.deepEqual(result.publicOutcome, { status: 'unavailable' });
  assert.ok(result.abortReasons.length);
  if (reason) assert.ok(result.abortReasons.includes(reason), `${reason}: ${result.abortReasons}`);
  return result;
}

test('complete bound server observations permit only an internal non-binding recheck', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = evaluateMissionSupplySafety(input);
  assert.deepEqual(result, {
    schemaVersion: version, bindingStatus: 'non_binding', evaluation: 'allow_to_evaluate',
    abortReasons: [], publicOutcome: { status: 'unavailable' },
  });
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.abortReasons));
  assert.ok(Object.isFrozen(result.publicOutcome));
});

test('absent, malformed and non-data envelopes fail closed without getters or exceptions', () => {
  for (const input of [undefined, null, [], 'anything', 1, {}, { ...fixture(), schemaVersion: 'v0' }]) abort(input);
  const input = fixture();
  Object.defineProperty(input, 'expected', { get() { throw new Error('getter executed'); } });
  abort(input, 'envelope_invalid');
  abort(Object.create(fixture()), 'envelope_invalid');
  const extra = fixture(); extra.mediaUrl = 'private-data'; abort(extra, 'envelope_invalid');
});

for (const field of Object.keys(fixture().expected)) {
  test(`expected field ${field}: absent, invalid and changed without corresponding observation fail closed`, () => {
    for (const value of [undefined, null, {}, [], true, '']) {
      const input = fixture();
      if (value === undefined) delete input.expected[field]; else input.expected[field] = value;
      abort(input, 'expected_invalid');
    }
    const input = fixture();
    input.expected[field] = typeof input.expected[field] === 'number'
      ? input.expected[field] + 1 : `${input.expected[field]}x`;
    abort(input);
  });
}

for (const [source, fields] of Object.entries(bindings)) {
  test(`${source}: missing, unknown, stale, duplicated and conflicting observations abort`, () => {
    const missing = fixture(); delete missing.observations[source]; abort(missing, `${source}_missing`);
    const empty = fixture(); empty.observations[source] = []; abort(empty, `${source}_missing`);
    for (const freshness of ['stale', 'unknown', null, false]) {
      const input = fixture(); input.observations[source][0].freshness = freshness;
      abort(input, `${source}_not_current`);
    }
    const duplicate = fixture();
    duplicate.observations[source].push(structuredClone(duplicate.observations[source][0]));
    abort(duplicate, `${source}_duplicate`);
    const conflicting = fixture();
    conflicting.observations[source].push({ ...structuredClone(conflicting.observations[source][0]), state: 'unknown' });
    const result = abort(conflicting, `${source}_conflicting`);
    assert.ok(result.abortReasons.includes(`${source}_duplicate`));
    assert.ok(result.abortReasons.includes(`${source}_state_unproven`));
    const unknown = fixture(); unknown.observations[source][0].state = 'unknown';
    abort(unknown, `${source}_state_unproven`);
    for (const value of [null, {}, 'available', true]) {
      const malformed = fixture(); malformed.observations[source] = value;
      abort(malformed, `${source}_invalid`);
    }
  });
  for (const field of fields) {
    test(`${source}.${field}: exact principal/parent/slot/revision/digest binding`, () => {
      for (const action of ['delete', 'replace']) {
        const input = fixture();
        if (action === 'delete') delete input.observations[source][0].binding[field];
        else input.observations[source][0].binding[field] = typeof input.expected[field] === 'number'
          ? input.expected[field] + 1 : `foreign-${input.expected[field]}`;
        abort(input, `${source}_binding_mismatch`);
      }
    });
  }
  test(`${source}: extra details, inherited/accessor properties and bad shapes rejected`, () => {
    const extra = fixture(); extra.observations[source][0].binding.privateMedia = 'private-data';
    abort(extra, `${source}_binding_mismatch`);
    for (const value of [null, [], 42, { ...fixture().observations[source][0], privateMedia: 'private-data' }]) {
      const input = fixture(); input.observations[source][0] = value;
      abort(input, `${source}_invalid`);
    }
    const input = fixture();
    Object.defineProperty(input.observations[source][0], 'state', { get() { throw new Error('getter executed'); } });
    abort(input, `${source}_invalid`);
  });
}

test('all adverse states, including revoked plus expired, abort with complete ordered reasons', () => {
  const matrix = {
    principal: ['unknown', 'blocked'], mission: ['stale', 'unknown'], resolution: ['stale', 'unknown'],
    participation: ['withdrawn', 'unknown'], item: ['withdrawn', 'unconfirmed', 'unknown'],
    demand: ['pending', 'rejected', 'revoked', 'expired_no_response', 'unknown'],
    release: ['revoked', 'expired', 'unknown'], expiry: ['expired', 'unknown'],
    blocks: ['blocked', 'unknown'], rateLimit: ['rate_limited', 'unknown'], support: ['denied', 'unknown'],
  };
  for (const [source, values] of Object.entries(matrix)) {
    for (const state of values) {
      const input = fixture(); input.observations[source][0].state = state;
      abort(input, `${source}_state_unproven`);
    }
  }
  const input = fixture();
  for (const [source, values] of Object.entries(matrix)) input.observations[source][0].state = values[0];
  assert.deepEqual(abort(input).abortReasons, Object.keys(bindings).map((key) => `${key}_state_unproven`));
});

test('self recipient, actor swap, cross-entity collisions and impossible release revision fail closed', () => {
  for (const mutate of [
    (x) => { x.actorId = x.recipientId; },
    (x) => { x.recipientId = x.requesterId; },
    (x) => { x.releasedRevision = x.demandRevision + 1; },
  ]) {
    const input = fixture(); mutate(input.expected);
    abort(input, 'expected_conflicting');
  }
  const ids = ['missionNeedId', 'resolutionId', 'participationId', 'shelfItemId', 'demandId', 'releaseId', 'supportReference'];
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) {
      const input = fixture(); input.expected[ids[a]] = input.expected[ids[b]];
      abort(input, 'expected_conflicting');
    }
  }
  for (const id of ids) {
    for (const principalId of ['actorId', 'requesterId', 'recipientId']) {
      const input = fixture(); input.expected[id] = input.expected[principalId];
      abort(input, 'expected_conflicting');
    }
  }
  for (const revision of [1, 3, 100]) {
    const input = fixture();
    input.expected.demandRevision = revision;
    input.expected.releasedRevision = revision;
    for (const rows of Object.values(input.observations)) {
      for (const row of rows) {
        for (const key of ['demandRevision', 'releasedRevision']) {
          if (Object.hasOwn(row.binding, key)) row.binding[key] = revision;
        }
      }
    }
    abort(input, 'expected_conflicting');
  }
});

test('sparse, accessor and inherited executable observation arrays fail closed', () => {
  const sparse = fixture(); sparse.observations.item = new Array(1); abort(sparse, 'item_invalid');
  const accessor = fixture();
  Object.defineProperty(accessor.observations.item, '0', { get() { throw new Error('getter executed'); } });
  abort(accessor, 'item_invalid');
  const input = fixture();
  const prototype = Object.create(Array.prototype);
  prototype[Symbol.iterator] = () => { throw new Error('iterator executed'); };
  Object.setPrototypeOf(input.observations.item, prototype);
  abort(input, 'item_invalid');
});

test('revision and digest grammar reject coercion, overflows, noncanonical hashes and unsupported purposes', () => {
  for (const field of ['missionRevision', 'resolutionRevision', 'participationRevision', 'itemRevision', 'demandRevision', 'releasedRevision']) {
    for (const value of [0, -1, 1.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const input = fixture(); input.expected[field] = value; abort(input, 'expected_invalid');
    }
  }
  for (const field of ['missionDigest', 'resolutionDigest']) {
    for (const value of ['A'.repeat(64), 'a'.repeat(63), 'z'.repeat(64)]) {
      const input = fixture(); input.expected[field] = value; abort(input, 'expected_invalid');
    }
  }
  for (const [field, value] of [['needKey', 'vehicle'], ['purpose', 'marketing'], ['actorId', ' a ']]) {
    const input = fixture(); input.expected[field] = value; abort(input, 'expected_invalid');
  }
});

test('permutation, independent failures and identity substitution cannot change public disclosure', () => {
  const input = fixture();
  input.observations.support[0].binding.recipientId = 'private-foreign-recipient';
  input.observations.blocks[0].state = 'blocked';
  input.observations.rateLimit[0].state = 'rate_limited';
  const result = abort(input);
  assert.deepEqual(result.abortReasons, ['blocks_state_unproven', 'rateLimit_state_unproven', 'support_binding_mismatch']);
  const reversed = structuredClone(input);
  reversed.observations = Object.fromEntries(Object.entries(reversed.observations).reverse());
  reversed.expected = Object.fromEntries(Object.entries(reversed.expected).reverse());
  for (const rows of Object.values(reversed.observations)) rows[0].binding = Object.fromEntries(Object.entries(rows[0].binding).reverse());
  assert.deepEqual(evaluateMissionSupplySafety(reversed), result);
  for (const candidate of [fixture(), input, null, { ...fixture(), observations: {} }]) {
    const output = evaluateMissionSupplySafety(candidate);
    assert.deepEqual(output.publicOutcome, { status: 'unavailable' });
    const bytes = JSON.stringify(output);
    for (const value of Object.values(fixture().expected).filter((x) => typeof x === 'string')) assert.ok(!bytes.includes(value));
    assert.ok(!bytes.includes('private-foreign-recipient'));
  }
});

test('unknown observation/source keys never silently pass; data input is not executed', () => {
  const extra = fixture(); extra.observations.extra = []; abort(extra, 'observations_invalid');
  const input = fixture(); input.expected.extra = 'private-data'; abort(input, 'expected_invalid');
  const binding = fixture();
  Object.defineProperty(binding.observations.support[0].binding, 'recipientId', { get() { throw new Error('getter executed'); } });
  abort(binding, 'support_binding_mismatch');
  const hidden = fixture();
  Object.defineProperty(hidden.observations, 'privateMedia', { value: 'private-data' });
  abort(hidden, 'observations_invalid');
});

test('multiple conflicting observations retain all independent reasons in either order', () => {
  const input = fixture();
  input.observations.item.push(structuredClone(input.observations.item[0]));
  input.observations.item[1].freshness = 'stale';
  input.observations.item[1].state = 'withdrawn';
  input.observations.item[1].binding.recipientId = 'foreign-owner';
  const expected = ['item_duplicate', 'item_conflicting', 'item_not_current', 'item_binding_mismatch', 'item_state_unproven'];
  assert.deepEqual(abort(input).abortReasons, expected);
  input.observations.item.reverse();
  assert.deepEqual(abort(input).abortReasons, expected);
  input.expected.demandRevision = 3;
  input.observations.demand[0].state = 'revoked';
  input.observations.release[0].state = 'revoked';
  input.observations.expiry[0].state = 'expired';
  const reasons = abort(input).abortReasons;
  for (const code of ['expected_conflicting', 'demand_state_unproven', 'release_state_unproven', 'expiry_state_unproven']) assert.ok(reasons.includes(code));
});

test('source is import-free, effect-free and unreachable from product/runtime trees', async () => {
  const source = await readFile(new URL('../src/mission_supply_safety_contract.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|\brequire\s*\(|\bprocess\b|\bDate\b|Math\.random|randomUUID|\bfetch\b|XMLHttpRequest|setTimeout|setInterval/u);
  assert.doesNotMatch(source, /node:|https?:|localStorage|sessionStorage|SharedPreferences|\.query\s*\(|\.write\s*\(/u);
  const root = new URL('../../', import.meta.url);
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await scan(url);
      else if (/\.(?:js|mjs|cjs|dart|json|ya?ml)$/u.test(entry.name) && entry.name !== 'mission_supply_safety_contract.js') {
        assert.doesNotMatch(await readFile(url, 'utf8'), /mission_supply_safety_contract|evaluateMissionSupplySafety/u, url.pathname);
      }
    }
  }
  for (const directory of ['backend/src/', 'backend/ops/', 'lib/', 'web/', 'tool/', 'scripts/']) await scan(new URL(directory, root));
  const pkg = await readFile(new URL('backend/package.json', root), 'utf8');
  assert.doesNotMatch(pkg, /mission_supply_safety_contract|evaluateMissionSupplySafety/u);
});
