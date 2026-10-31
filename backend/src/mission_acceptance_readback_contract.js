// Pure synthetic comparison only: supplied provenance is not authenticated origin.
const version = 'mission_acceptance_readback_v2';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const native = (value, prefix = '') => typeof value === 'string' && new RegExp(`^${prefix}${uuid}$`, 'u').test(value);
const digest = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const rootKeys = ['version', 'missionNeedId', 'missionOwnerId', 'missionRevision', 'missionPayloadDigest',
  'resolutionId', 'resolutionRevision', 'resolutionDigest', 'fitSourceSnapshotDigest', 'projectionDigest'];
const componentKeys = ['slotKey', 'needKey', 'necessity', 'ordinal', 'itemId', 'itemType', 'ownerId', 'renterId', 'sourceDigest', 'bindingStatus'];
const requestKeys = ['commandType', 'requestedState', 'actorRole', 'actorId', 'idempotencyKey', 'requestDigest', 'quoteId', 'quoteHash'];
const contextKeys = ['kind', 'association', 'bookingId', 'contractId', 'quoteId', 'quoteHash', 'bookingStatus',
  'bookingRevision', 'contractUserId', 'creationActorRole', 'creationActorId', 'creationCommandType'];
const effectKeys = ['kind', 'association', 'bookingId', 'contractId', 'quoteId', 'quoteHash', 'bookingStatus',
  'bookingRevision', 'contractUserId', 'actorRole', 'actorId', 'commandType', 'idempotencyKey', 'requestDigest'];
const reasonOrder = ['envelope_invalid', 'root_invalid', 'component_invalid', 'request_invalid', 'identity_invalid',
  'identity_collision', 'association_missing', 'association_mismatch', 'readback_invalid', 'snapshot_mismatch',
  'observation_stale', 'request_phase_conflict', 'context_phase_conflict', 'context_invalid',
  'effect_phase_conflict', 'effect_invalid', 'readback_mismatch', 'no_effect_unproven', 'replay_invalid'];
const publicOutcome = Object.freeze({ status: 'unavailable' });

// Reject executable descriptors before touching nested values. Cycles and exotic
// prototypes are outside the inert transport contract, as are hostile Proxies.
function inert(value, stack = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 32 || stack.has(value)) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) return false;
  stack.add(value);
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || !inert(descriptor.value, stack, depth + 1)) return false;
  }
  stack.delete(value); return true;
}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
}
function namespaced(value, namespace, kind) {
  return typeof value === 'string' && value.startsWith(`${namespace}:${kind}:`)
    && value.length > namespace.length + kind.length + 2 && value.length <= 120 && /^[A-Za-z0-9:_-]+$/u.test(value);
}
function result(status, reasons, { mapped = false, context = false, effect = false, replay = false } = {}) {
  return Object.freeze({ schemaVersion: version, status, bindingStatus: 'non_binding',
    mappingStatus: mapped ? 'supplied_mapping_only' : 'unmapped',
    contextStatus: context ? 'pre_existing_context_only' : 'none', effectStatus: effect ? 'observed_only' : 'not_observed',
    replayStatus: replay ? 'supplied_consistent_only' : 'not_claimed', provenanceStatus: 'supplied_synthetic_only',
    legalBindingStatus: 'not_determined', missionBindingStatus: 'not_determined', paymentStatus: 'not_determined',
    retrySafety: 'not_determined', remediation: 'none', reasons: Object.freeze(reasonOrder.filter((r) => reasons.has(r))), publicOutcome });
}

/** One component/attempt only; never a coordinator, authenticator or executor. */
export function evaluateSyntheticAcceptanceReadback(input) {
  const reasons = new Set();
  if (!inert(input) || !exact(input, ['schemaVersion', 'synthetic', 'authentic', 'fixtureNamespace', 'fixtureIdentities',
    'root', 'component', 'plannedRequest', 'association', 'readback', 'preExistingContext', 'observedEffect', 'replay'])
    || input.schemaVersion !== version || input.synthetic !== true || input.authentic !== false
    || !native(input.fixtureNamespace, 'p7a1-synthetic-')) {
    reasons.add('envelope_invalid'); return result('unavailable', reasons);
  }
  const { root, component, plannedRequest: request, fixtureNamespace: namespace, readback, preExistingContext: context, observedEffect: effect } = input;
  const validRoot = exact(root, rootKeys) && root.version === 'P7-A1-2026-10-03.1'
    && native(root.missionNeedId, 'mission_need_') && native(root.resolutionId, 'mission_inventory_')
    && namespaced(root.missionOwnerId, namespace, 'principal') && positive(root.missionRevision) && positive(root.resolutionRevision)
    && ['missionPayloadDigest', 'resolutionDigest', 'fitSourceSnapshotDigest', 'projectionDigest'].every((k) => digest(root[k]));
  if (!validRoot) reasons.add('root_invalid');
  const validComponent = validRoot && exact(component, componentKeys) && component.needKey === 'plant_container_equipment'
    && ['required', 'optional'].includes(component.necessity) && positive(component.ordinal)
    && component.slotKey === `${component.necessity}:${component.needKey}:${component.ordinal}`
    && component.itemType === 'listing' && namespaced(component.itemId, namespace, 'listing')
    && namespaced(component.ownerId, namespace, 'principal') && component.renterId === root.missionOwnerId
    && component.ownerId !== component.renterId && digest(component.sourceDigest) && component.bindingStatus === 'non_binding';
  if (!validComponent) reasons.add('component_invalid');
  const owner = request?.commandType === 'booking.transition';
  const validRequest = request === null || (validComponent && exact(request, requestKeys)
    && ['booking.create', 'booking.transition'].includes(request.commandType)
    && request.actorRole === (owner ? 'owner' : 'renter') && request.actorId === (owner ? component.ownerId : component.renterId)
    && request.requestedState === (owner ? 'accepted' : 'requested') && namespaced(request.idempotencyKey, namespace, 'command')
    && digest(request.requestDigest) && native(request.quoteId, 'quote_') && digest(request.quoteHash));
  if (!validRequest) reasons.add('request_invalid');
  if (reasons.size) return result('unavailable', reasons);
  const rbValid = exact(readback, ['origin', 'snapshotDigest', 'freshness', 'phase', 'completion', 'effect', 'noEffectProof'])
    && readback.origin === 'synthetic_server_fixture' && digest(readback.snapshotDigest)
    && ['not_started', 'in_flight', 'response_unknown', 'no_effect', 'effect_observed'].includes(readback.phase)
    && readback.completion === (readback.phase === 'not_started' ? 'not_started'
      : ['no_effect', 'effect_observed'].includes(readback.phase) ? 'completed' : 'unknown');
  if (!rbValid) reasons.add('readback_invalid');
  if (readback?.freshness !== 'current') reasons.add('observation_stale');
  const expectedAssociation = { kind: 'synthetic_slot_command_association_v2', root, component, request,
    snapshotDigest: readback?.snapshotDigest };
  const mapped = same(input.association, expectedAssociation);
  if (input.association === null) reasons.add('association_missing');
  else if (!mapped) reasons.add('association_mismatch');
  if (digest(input.association?.snapshotDigest) && input.association.snapshotDigest !== readback?.snapshotDigest) reasons.add('snapshot_mismatch');
  const phase = readback?.phase;
  if ((phase === 'not_started') !== (request === null)) reasons.add('request_phase_conflict');

  const identityPairs = [['mission', root.missionNeedId], ['resolution', root.resolutionId], ['listing', component.itemId]];
  if (request) identityPairs.push(['quote', request.quoteId]);
  function boundIdentifiers(value) {
    return namespaced(value.bookingId, namespace, 'booking') && native(value.contractId)
      && value.quoteId === request?.quoteId && value.quoteHash === request?.quoteHash
      && value.contractUserId === component.renterId && same(value.association, expectedAssociation);
  }
  const needsContext = owner && request !== null && phase !== 'not_started';
  let contextValid = false;
  if (needsContext) {
    contextValid = exact(context, contextKeys) && context.kind === 'pre_existing_booking_contract_v2' && boundIdentifiers(context)
      && context.bookingStatus === 'requested' && positive(context.bookingRevision)
      && context.creationActorId === component.renterId && context.creationActorRole === 'renter'
      && context.creationCommandType === 'booking.create';
    if (!contextValid) reasons.add('context_invalid');
  } else if (context !== null) reasons.add('context_phase_conflict');
  let effectValid = false;
  if (phase === 'effect_observed') {
    effectValid = request !== null && exact(effect, effectKeys) && boundIdentifiers(effect)
      && effect.kind === (owner ? 'owner_acceptance_transition_v2' : 'renter_request_created_v2')
      && effect.bookingStatus === (owner ? 'accepted' : 'requested')
      && effect.bookingRevision === (owner && contextValid ? context.bookingRevision + 1 : 1)
      && positive(effect.bookingRevision)
      && ['actorRole', 'actorId', 'commandType', 'idempotencyKey', 'requestDigest'].every((k) => effect[k] === request[k])
      && (!owner || (contextValid && effect.bookingId === context.bookingId && effect.contractId === context.contractId));
    if (!effectValid) reasons.add('effect_invalid');
  } else if (effect !== null) reasons.add('effect_phase_conflict');
  if (!same(readback?.effect, effect)) reasons.add('readback_mismatch');
  if (phase === 'no_effect') {
    if (!same(readback?.noEffectProof, { kind: 'synthetic_terminal_no_effect_v2', association: expectedAssociation })) reasons.add('no_effect_unproven');
  } else if (readback?.noEffectProof !== null) reasons.add('no_effect_unproven');
  for (const value of [context, effect]) if (value && typeof value === 'object') {
    for (const [kind, key] of [['booking', 'bookingId'], ['contract', 'contractId']]) {
      if (typeof value[key] === 'string') identityPairs.push([kind, value[key]]);
    }
  }
  const used = new Map();
  for (const [kind, value] of identityPairs) {
    if (used.has(value) && used.get(value) !== kind) reasons.add('identity_collision');
    used.set(value, kind);
  }
  const inventory = input.fixtureIdentities;
  if (!Array.isArray(inventory) || inventory.length !== used.size
    || !inventory.every((v) => exact(v, ['kind', 'value']) && typeof v.value === 'string' && used.get(v.value) === v.kind)
    || new Set(inventory.map((v) => v.value)).size !== used.size) reasons.add('identity_invalid');
  let replay = false;
  if (!(exact(input.replay, ['status']) && input.replay.status === 'not_claimed')) {
    replay = exact(input.replay, ['status', 'request', 'association']) && input.replay.status === 'supplied_consistent'
      && request !== null && same(input.replay.request, request) && same(input.replay.association, expectedAssociation)
      && ['no_effect', 'effect_observed'].includes(phase);
    if (!replay) reasons.add('replay_invalid');
  }
  if (reasons.size) return result(input.association === null ? 'unavailable' : 'needs_clarification', reasons);
  const status = phase === 'effect_observed' ? 'effects_observed_only' : phase === 'no_effect' ? 'no_effect_observed'
    : phase === 'not_started' ? 'not_started' : 'readback_required';
  return result(status, reasons, { mapped, context: contextValid, effect: effectValid, replay });
}
