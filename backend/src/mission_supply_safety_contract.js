// Dormant, synchronous diagnostic contract. Trusted server observations only:
// this module cannot authenticate their origin or establish snapshot consistency.
// allow_to_evaluate is an internal recheck, never an action authorization.
const version = 'mission_supply_safety_v1';
const principal = ['actorId', 'requesterId', 'recipientId'];
const mission = ['requesterId', 'missionNeedId', 'missionRevision', 'missionDigest'];
const resolution = [...mission, 'resolutionId', 'resolutionRevision', 'resolutionDigest', 'slotKey', 'needKey'];
const participation = ['recipientId', 'participationId', 'participationRevision'];
const item = [...participation, 'shelfItemId', 'itemRevision', 'needKey'];
const demand = [...new Set([...principal, ...resolution, ...item]), 'demandId', 'demandRevision', 'purpose'];
const bindings = {
  principal, mission, resolution, participation, item, demand,
  release: [...demand, 'releaseId', 'releasedRevision'],
  expiry: [...demand, 'releaseId', 'releasedRevision'],
  blocks: [...demand], rateLimit: [...demand],
  support: [...demand, 'supportReference'],
};
const provenStates = {
  principal: 'confirmed', mission: 'current', resolution: 'current',
  participation: 'active', item: 'confirmed_available', demand: 'released',
  release: 'active', expiry: 'active', blocks: 'clear', rateLimit: 'permitted', support: 'authorized',
};
const sources = Object.keys(bindings);
const expectedKeys = [...new Set(Object.values(bindings).flat())];
const revisionKeys = new Set(['missionRevision', 'resolutionRevision', 'participationRevision', 'itemRevision', 'demandRevision', 'releasedRevision']);
const digestKeys = new Set(['missionDigest', 'resolutionDigest']);
const resourceKeys = ['missionNeedId', 'resolutionId', 'participationId', 'shelfItemId', 'demandId', 'releaseId', 'supportReference'];
const reasonOrder = [
  'envelope_invalid', 'expected_invalid', 'expected_conflicting', 'observations_invalid',
  ...sources.flatMap((source) => [
    'invalid', 'missing', 'duplicate', 'conflicting', 'not_current', 'binding_mismatch', 'state_unproven',
  ].map((reason) => `${source}_${reason}`)),
];
const publicOutcome = Object.freeze({ status: 'unavailable' });

// Only plain own data properties are consumed; accessors are never evaluated.
function dataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => typeof key === 'string'
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

function exactKeys(value, keys) {
  return dataRecord(value) && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function dataRows(value) {
  return Array.isArray(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && Reflect.ownKeys(value).length === value.length + 1
    && Reflect.ownKeys(value).every((key) => key === 'length'
      || (typeof key === 'string' && /^(0|[1-9][0-9]*)$/u.test(key)
        && Number(key) < value.length
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
}

function validExpected(value) {
  return exactKeys(value, expectedKeys) && expectedKeys.every((key) => {
    const entry = value[key];
    if (revisionKeys.has(key)) return Number.isSafeInteger(entry) && entry > 0;
    if (digestKeys.has(key)) return typeof entry === 'string' && /^[a-f0-9]{64}$/u.test(entry);
    if (key === 'purpose') return entry === 'mission_gap_supply_v1';
    if (key === 'needKey') return entry === 'plant_container_equipment';
    return typeof entry === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(entry);
  });
}

function sameObservation(left, right, fields) {
  return left.state === right.state && left.freshness === right.freshness
    && exactKeys(left.binding, fields) && exactKeys(right.binding, fields)
    && fields.every((field) => left.binding[field] === right.binding[field]);
}

/**
 * Pure re-evaluation of one already released request-bound demand. No client
 * adapter exists. Each source is a singleton observation from the same trusted
 * read context; duplicates are never collapsed. State/freshness/expiry/permit
 * checks are supplied verdicts, not facts independently established here.
 * Only publicOutcome may be publicly shaped. Diagnostics stay server-internal.
 */
export function evaluateMissionSupplySafety(input) {
  const reasons = new Set();
  if (!exactKeys(input, ['schemaVersion', 'expected', 'observations'])
      || input.schemaVersion !== version) {
    reasons.add('envelope_invalid');
  } else {
    const valid = validExpected(input.expected);
    const expected = valid ? input.expected : {};
    if (!valid) reasons.add('expected_invalid');
    if (valid && (expected.actorId !== expected.requesterId
        || expected.requesterId === expected.recipientId
        || expected.releasedRevision !== expected.demandRevision
        // Migration 103: pending(1) -> released(2) -> revoked(3), no re-release.
        || expected.releasedRevision !== 2
        || resourceKeys.some((key) => principal.some((field) => expected[key] === expected[field]))
        || new Set(resourceKeys.map((key) => expected[key])).size !== resourceKeys.length)) {
      reasons.add('expected_conflicting');
    }
    const observations = dataRecord(input.observations) ? input.observations : {};
    if (!dataRecord(input.observations)
        || Reflect.ownKeys(observations).some((key) => !sources.includes(key))) reasons.add('observations_invalid');
    for (const source of sources) {
      if (!Object.hasOwn(observations, source)) {
        reasons.add(`${source}_missing`);
        continue;
      }
      const rows = observations[source];
      if (!dataRows(rows)) {
        reasons.add(`${source}_invalid`);
        continue;
      }
      if (rows.length === 0) reasons.add(`${source}_missing`);
      if (rows.length > 1) reasons.add(`${source}_duplicate`);
      let first;
      for (const row of rows) {
        if (!exactKeys(row, ['binding', 'freshness', 'state'])) {
          reasons.add(`${source}_invalid`);
          continue;
        }
        if (first && !sameObservation(first, row, bindings[source])) reasons.add(`${source}_conflicting`);
        first ??= row;
        if (row.freshness !== 'current') reasons.add(`${source}_not_current`);
        if (!exactKeys(row.binding, bindings[source])
            || bindings[source].some((key) => row.binding[key] !== expected[key])) {
          reasons.add(`${source}_binding_mismatch`);
        }
        if (row.state !== provenStates[source]) reasons.add(`${source}_state_unproven`);
      }
    }
  }
  return Object.freeze({
    schemaVersion: version,
    bindingStatus: 'non_binding',
    evaluation: reasons.size === 0 ? 'allow_to_evaluate' : 'abort',
    abortReasons: Object.freeze(reasonOrder.filter((reason) => reasons.has(reason))),
    publicOutcome,
  });
}
