// Synthetic diagnostic only. Supplied observations cannot establish their own
// server origin, source completeness, legal validity or persistent execution.
const version = 'mission_acceptance_outcome_v1';
const projectionVersion = 'P7-A1-2026-10-03.1';
const namespacePattern = /^p7a1-synthetic-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const rootKeys = ['version', 'missionNeedId', 'missionOwnerId', 'missionRevision', 'missionPayloadDigest',
  'resolutionId', 'resolutionRevision', 'resolutionDigest', 'fitSourceSnapshotDigest', 'projectionDigest'];
const componentKeys = ['slotKey', 'needKey', 'necessity', 'ordinal', 'itemId', 'itemType', 'ownerId', 'renterId',
  'sourceDigest', 'bindingStatus'];
const requestKeys = ['actorId', 'quoteId', 'quoteHash', 'commandId', 'idempotencyKey', 'requestDigest'];
const resourceKeys = ['quoteId', 'commandId', 'idempotencyKey'];
const effectKeys = ['bookingId', 'contractId'];
const rowKeys = ['slotKey', 'root', 'binding', 'request', 'freshness', 'attempt', 'readback', 'effect', 'replay'];
const replayKeys = ['status', 'actorId', 'commandId', 'idempotencyKey', 'requestDigest'];
const globalOrder = ['envelope_invalid', 'root_invalid', 'components_invalid', 'component_collision',
  'idempotency_collision', 'requests_invalid', 'observations_invalid', 'unknown_observation', 'effect_collision'];
const componentOrder = ['observation_missing', 'observation_duplicate', 'observation_conflicting',
  'observation_invalid', 'root_mismatch', 'component_mismatch', 'request_mismatch', 'request_phase_conflict', 'idempotency_collision',
  'observation_stale', 'state_conflict', 'effect_invalid', 'effect_mismatch', 'replay_invalid', 'replay_mismatch', 'replay_state_conflict'];
const stateMatrix = Object.freeze({
  'not_started/not_requested/not_observed': 'not_started',
  'in_flight/unknown/not_observed': 'readback_required',
  'response_unknown/unknown/not_observed': 'readback_required',
  'completed/no_effect/none': 'no_effect_observed',
  'completed/effect_observed/observed': 'effects_observed_only',
});
const publicOutcome = Object.freeze({ status: 'unavailable' });

function dataRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}
function exact(value, keys) {
  return dataRecord(value) && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function dataArray(value) {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && Reflect.ownKeys(value).length === value.length + 1
    && Reflect.ownKeys(value).every((key) => key === 'length' || (
      typeof key === 'string' && /^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')
      && Object.getOwnPropertyDescriptor(value, key).enumerable));
}
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const revision = (value) => Number.isSafeInteger(value) && value > 0;
function syntheticId(value, namespace) {
  return typeof value === 'string' && value.startsWith(`${namespace}:`)
    && value.length > namespace.length + 1 && value.length < 240
    && /^[A-Za-z0-9:_-]+$/u.test(value);
}
function same(left, right, keys) {
  return exact(left, keys) && exact(right, keys) && keys.every((key) => left[key] === right[key]);
}
function sameEffect(left, right) {
  return same(left, right, ['status']) || (exact(left, ['status', 'identifiers']) && exact(right, ['status', 'identifiers'])
    && left.status === right.status && same(left.identifiers, right.identifiers, effectKeys));
}
function sameRequest(left, right) { return (left === null && right === null) || same(left, right, requestKeys); }
function sameRow(left, right) {
  return ['slotKey', 'freshness', 'attempt'].every((key) => left[key] === right[key])
    && same(left.root, right.root, rootKeys) && same(left.binding, right.binding, componentKeys)
    && sameRequest(left.request, right.request) && sameEffect(left.readback, right.readback) && sameEffect(left.effect, right.effect)
    && (same(left.replay, right.replay, ['status']) || same(left.replay, right.replay, replayKeys));
}
function rootValid(root, namespace) {
  return exact(root, rootKeys) && root.version === projectionVersion
    && ['missionNeedId', 'missionOwnerId', 'resolutionId'].every((key) => syntheticId(root[key], namespace))
    && new Set([root.missionNeedId, root.missionOwnerId, root.resolutionId]).size === 3
    && revision(root.missionRevision) && revision(root.resolutionRevision)
    && ['missionPayloadDigest', 'resolutionDigest', 'fitSourceSnapshotDigest', 'projectionDigest'].every((key) => digest(root[key]));
}
function componentValid(component, root, namespace) {
  return exact(component, componentKeys) && component.needKey === 'plant_container_equipment'
    && ['required', 'optional'].includes(component.necessity) && revision(component.ordinal)
    && component.slotKey === `${component.necessity}:${component.needKey}:${component.ordinal}`
    && ['listing', 'private_shelf'].includes(component.itemType) && component.bindingStatus === 'non_binding'
    && ['itemId', 'ownerId', 'renterId'].every((key) => syntheticId(component[key], namespace))
    && component.renterId === root.missionOwnerId
    && component.ownerId !== component.renterId
    && digest(component.sourceDigest);
}
function requestValid(request, component, namespace) {
  return request === null || (exact(request, requestKeys) && request.actorId === component.ownerId
    && resourceKeys.every((key) => syntheticId(request[key], namespace))
    && digest(request.quoteHash) && digest(request.requestDigest));
}
function effectValid(value, positiveStatus, negativeStatuses, namespace) {
  if (exact(value, ['status']) && negativeStatuses.includes(value.status)) return true;
  return exact(value, ['status', 'identifiers']) && value.status === positiveStatus
    && exact(value.identifiers, effectKeys) && effectKeys.every((key) => syntheticId(value.identifiers[key], namespace));
}
function ordered(reasons, order) { return Object.freeze(order.filter((reason) => reasons.has(reason))); }
function result(status, reasons, components = []) {
  return Object.freeze({
    schemaVersion: version, bindingStatus: 'non_binding', status,
    legalBindingStatus: 'not_determined', missionBindingStatus: 'not_determined', paymentStatus: 'not_determined',
    remediation: 'none', reasons: ordered(reasons, globalOrder), components: Object.freeze(components), publicOutcome,
  });
}

function componentOutcome(component, request, rows, root, namespace, componentIndex) {
  const reasons = new Set();
  if (!rows.length) reasons.add('observation_missing');
  if (rows.length > 1) reasons.add('observation_duplicate');
  let first;
  let status = 'unavailable';
  let replayStatus = 'not_claimed';
  for (const row of rows) {
    if (!exact(row, rowKeys)) { reasons.add('observation_invalid'); continue; }
    if (first && !sameRow(first, row)) reasons.add('observation_conflicting');
    first ??= row;
    if (!same(row.root, root, rootKeys)) reasons.add('root_mismatch');
    if (!same(row.binding, component, componentKeys)) reasons.add('component_mismatch');
    if (!sameRequest(row.request, request)) reasons.add('request_mismatch');
    if ((row.attempt === 'not_started') !== (request === null)) reasons.add('request_phase_conflict');
    if (request && dataRecord(row.request) && row.request.idempotencyKey === request.idempotencyKey
        && row.request.requestDigest !== request.requestDigest) reasons.add('idempotency_collision');
    if (row.freshness !== 'current') reasons.add('observation_stale');
    // Type checks precede interpolation: caller objects must never be coerced.
    const primitiveState = typeof row.attempt === 'string' && dataRecord(row.readback) && dataRecord(row.effect)
      && typeof row.readback.status === 'string' && typeof row.effect.status === 'string';
    const key = primitiveState ? `${row.attempt}/${row.readback.status}/${row.effect.status}` : '';
    status = Object.hasOwn(stateMatrix, key) ? stateMatrix[key] : 'unavailable';
    if (status === 'unavailable') reasons.add('state_conflict');
    const validReadback = effectValid(row.readback, 'effect_observed', ['not_requested', 'unknown', 'no_effect'], namespace);
    const validEffect = effectValid(row.effect, 'observed', ['not_observed', 'none'], namespace);
    if (!validReadback || !validEffect) reasons.add('effect_invalid');
    if (validReadback && validEffect && status === 'effects_observed_only'
        && !same(row.readback.identifiers, row.effect.identifiers, effectKeys)) reasons.add('effect_mismatch');
    if (exact(row.replay, ['status']) && row.replay.status === 'not_claimed') continue;
    if (!exact(row.replay, replayKeys) || row.replay.status !== 'supplied_consistent') {
      reasons.add('replay_invalid'); continue;
    }
    if (!request || ['actorId', 'commandId', 'idempotencyKey'].some((field) => row.replay[field] !== request[field])) reasons.add('replay_mismatch');
    if (request && row.replay.requestDigest !== request.requestDigest) reasons.add('idempotency_collision');
    if (!['no_effect_observed', 'effects_observed_only'].includes(status)) reasons.add('replay_state_conflict');
    replayStatus = 'supplied_consistent_only';
  }
  return Object.freeze({
    componentIndex,
    status: reasons.size ? 'needs_clarification' : status,
    replayStatus: reasons.size ? 'not_determined' : replayStatus,
    reasons: ordered(reasons, componentOrder),
  });
}

/** Synthetic closed-set observation evaluator, never an execution coordinator. */
export function evaluateSyntheticMissionAcceptanceOutcome(input) {
  const reasons = new Set();
  if (!exact(input, ['schemaVersion', 'synthetic', 'authentic', 'namespace', 'root', 'componentSlots', 'components', 'requests', 'observations'])
      || input.schemaVersion !== version || input.synthetic !== true || input.authentic !== false
      || typeof input.namespace !== 'string' || !namespacePattern.test(input.namespace)) {
    reasons.add('envelope_invalid'); return result('unavailable', reasons);
  }
  if (!rootValid(input.root, input.namespace)) {
    reasons.add('root_invalid'); return result('unavailable', reasons);
  }
  if (!dataArray(input.componentSlots) || !input.componentSlots.length
      || !input.componentSlots.every((slot) => typeof slot === 'string')
      || new Set(input.componentSlots).size !== input.componentSlots.length
      || !dataArray(input.components) || input.components.length !== input.componentSlots.length
      || !input.components.every((component) => componentValid(component, input.root, input.namespace))
      || new Set(input.components.map((c) => c.slotKey)).size !== input.componentSlots.length
      || !input.components.every((c) => input.componentSlots.includes(c.slotKey))) {
    reasons.add('components_invalid'); return result('unavailable', reasons);
  }
  if (!dataArray(input.requests) || input.requests.length !== input.components.length
      || !input.requests.every((row) => exact(row, ['slotKey', 'binding']) && typeof row.slotKey === 'string'
        && input.components.some((c) => c.slotKey === row.slotKey && requestValid(row.binding, c, input.namespace)))
      || new Set(input.requests.map((row) => row.slotKey)).size !== input.components.length) {
    reasons.add('requests_invalid'); return result('unavailable', reasons);
  }
  const requests = new Map(input.requests.map((row) => [row.slotKey, row.binding]));
  const identities = new Set([input.root.missionNeedId, input.root.resolutionId, input.root.missionOwnerId]);
  for (const component of input.components) {
    if ([input.root.missionNeedId, input.root.resolutionId].includes(component.ownerId)) reasons.add('component_collision');
    identities.add(component.ownerId);
  }
  const keys = new Map();
  for (const component of input.components) {
    if (identities.has(component.itemId)) reasons.add('component_collision');
    identities.add(component.itemId);
  }
  for (const request of requests.values()) {
    if (!request) continue;
    for (const field of resourceKeys) {
      if (identities.has(request[field])) reasons.add('component_collision');
      identities.add(request[field]);
    }
    if (keys.has(request.idempotencyKey) && keys.get(request.idempotencyKey) !== request.requestDigest) reasons.add('idempotency_collision');
    keys.set(request.idempotencyKey, request.requestDigest);
  }
  if (reasons.size) return result('unavailable', reasons);
  if (!dataArray(input.observations)) {
    reasons.add('observations_invalid'); return result('unavailable', reasons);
  }
  const bySlot = new Map(input.componentSlots.map((slot) => [slot, []]));
  for (const row of input.observations) {
    if (!dataRecord(row)) { reasons.add('observations_invalid'); continue; }
    if (!Object.hasOwn(row, 'slotKey') || typeof row.slotKey !== 'string' || !bySlot.has(row.slotKey)) {
      reasons.add('unknown_observation'); continue;
    }
    bySlot.get(row.slotKey).push(row);
  }
  const effectIdentities = new Map();
  for (const [slot, rows] of bySlot) for (const row of rows) {
    if (!exact(row, rowKeys)) continue;
    for (const [field, positive, negative] of [['readback', 'effect_observed', ['not_requested', 'unknown', 'no_effect']], ['effect', 'observed', ['not_observed', 'none']]]) {
      if (!effectValid(row[field], positive, negative, input.namespace) || row[field].status !== positive) continue;
      for (const key of effectKeys) {
        const value = row[field].identifiers[key];
        const prior = effectIdentities.get(value);
        if (identities.has(value) || (prior && (prior.slot !== slot || prior.key !== key))) reasons.add('effect_collision');
        effectIdentities.set(value, { slot, key });
      }
    }
  }
  const components = [...input.components].sort((a, b) => a.slotKey < b.slotKey ? -1 : a.slotKey > b.slotKey ? 1 : 0)
    .map((component, index) => componentOutcome(component, requests.get(component.slotKey), bySlot.get(component.slotKey), input.root, input.namespace, index));
  if (reasons.size || components.some((component) => component.reasons.length)) return result('needs_clarification', reasons, components);
  const effects = components.filter((component) => component.status === 'effects_observed_only').length;
  const status = effects === components.length ? 'effects_observed_only'
    : effects > 0 ? 'partial_effects_need_recovery'
      : components.some((component) => component.status === 'readback_required') ? 'readback_required'
        : components.every((component) => component.status === 'not_started') ? 'not_started'
          : components.every((component) => component.status === 'no_effect_observed') ? 'no_effect_observed' : 'readback_required';
  return result(status, reasons, components);
}
