import crypto from 'node:crypto';

import { plannerCoreVersion } from './planner_core.js';

export const missionFitCheckDomainVersion = 'P4-A-2026-10-01.1';
export const plantContainerFitDefinitionId = 'plant_container_dimensional_fit_v1';
export const plantContainerFitDefinitionVersion = 'P4-A-PLANT-CONTAINER-DIMENSIONAL-2026-10-01.1';
export const plantContainerNeedKey = 'plant_container_equipment';

const requirementDefinitions = Object.freeze({
  minimumUsableVolumeMl: Object.freeze({ unit: 'ml', minimum: 1, maximum: 10_000_000 }),
  maximumFootprintWidthMm: Object.freeze({ unit: 'mm', minimum: 1, maximum: 10_000 }),
  maximumFootprintDepthMm: Object.freeze({ unit: 'mm', minimum: 1, maximum: 10_000 }),
  maximumHeightMm: Object.freeze({ unit: 'mm', minimum: 1, maximum: 10_000 }),
});
const itemFactDefinitions = Object.freeze({
  usableVolumeMl: Object.freeze({ unit: 'ml', minimum: 1, maximum: 10_000_000 }),
  footprintWidthMm: Object.freeze({ unit: 'mm', minimum: 1, maximum: 10_000 }),
  footprintDepthMm: Object.freeze({ unit: 'mm', minimum: 1, maximum: 10_000 }),
  heightMm: Object.freeze({ unit: 'mm', minimum: 1, maximum: 10_000 }),
});
const sourceTypes = new Set(['owner_confirmed_measurement', 'manufacturer_documentation']);

export class MissionFitCheckError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MissionFitCheckError(400, code);
  }
  return { ...value };
}

function exactKeys(value, expected, code) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new MissionFitCheckError(400, code);
  }
}

function text(value, maximum, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || candidate.length > maximum) throw new MissionFitCheckError(400, code);
  return candidate;
}

function opaqueIdentifier(value, code) {
  const candidate = text(value, 160, code);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/u.test(candidate)) {
    throw new MissionFitCheckError(400, code);
  }
  return candidate;
}

function hexDigest(value, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-f0-9]{64}$/u.test(candidate)) throw new MissionFitCheckError(400, code);
  return candidate;
}

function positiveRevision(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) throw new MissionFitCheckError(400, code);
  return value;
}

function timestamp(value, code) {
  const candidate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(candidate.getTime())) throw new MissionFitCheckError(400, code);
  return candidate.toISOString();
}

function missionNeedId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate)) {
    throw new MissionFitCheckError(404, 'mission_fit_check_mission_not_found');
  }
  return candidate;
}

function shelfItemId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate)) {
    throw new MissionFitCheckError(404, 'mission_fit_check_shelf_item_not_found');
  }
  return candidate;
}

function fitCheckId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^mission_fit_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate)) {
    throw new MissionFitCheckError(404, 'mission_fit_check_not_found');
  }
  return candidate;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function missionFitCheckDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function normalizeMeasurement(raw, definitions, codePrefix, { provenance = false } = {}) {
  const candidate = object(raw, `${codePrefix}_invalid`);
  exactKeys(candidate, provenance
    ? ['key', 'provenance', 'unit', 'value']
    : ['key', 'unit', 'value'], `${codePrefix}_fields_invalid`);
  const key = text(candidate.key, 80, `${codePrefix}_key_invalid`);
  const definition = definitions[key];
  if (!definition) throw new MissionFitCheckError(400, `${codePrefix}_key_invalid`);
  if (candidate.unit !== definition.unit) {
    throw new MissionFitCheckError(400, `${codePrefix}_unit_invalid`);
  }
  if (!Number.isSafeInteger(candidate.value)
      || candidate.value < definition.minimum
      || candidate.value > definition.maximum) {
    throw new MissionFitCheckError(400, `${codePrefix}_value_invalid`);
  }
  const normalized = { key, value: candidate.value, unit: definition.unit };
  if (provenance) {
    const source = object(candidate.provenance, 'mission_fit_check_provenance_invalid');
    exactKeys(source, [
      'ownerConfirmed', 'sourceReference', 'sourceType', 'sourceVersion',
    ], 'mission_fit_check_provenance_fields_invalid');
    if (!sourceTypes.has(source.sourceType)) {
      throw new MissionFitCheckError(400, 'mission_fit_check_source_type_invalid');
    }
    if (typeof source.ownerConfirmed !== 'boolean') {
      throw new MissionFitCheckError(400, 'mission_fit_check_owner_confirmation_invalid');
    }
    normalized.provenance = {
      sourceType: source.sourceType,
      sourceReference: opaqueIdentifier(
        source.sourceReference,
        'mission_fit_check_source_reference_invalid',
      ),
      sourceVersion: opaqueIdentifier(
        source.sourceVersion,
        'mission_fit_check_source_version_invalid',
      ),
      ownerConfirmed: source.ownerConfirmed,
    };
  }
  return Object.freeze(normalized);
}

function normalizeMeasurements(raw, definitions, codePrefix, options = {}) {
  if (!Array.isArray(raw) || raw.length > Object.keys(definitions).length) {
    throw new MissionFitCheckError(400, `${codePrefix}_list_invalid`);
  }
  const normalized = raw.map((entry) => normalizeMeasurement(
    entry,
    definitions,
    codePrefix,
    options,
  ));
  if (new Set(normalized.map((entry) => entry.key)).size !== normalized.length) {
    throw new MissionFitCheckError(400, `${codePrefix}_duplicate`);
  }
  return Object.freeze(normalized.sort((left, right) => left.key.localeCompare(right.key)));
}

export function normalizeMissionFitCheckSnapshot(raw) {
  const candidate = object(raw, 'mission_fit_check_payload_invalid');
  exactKeys(candidate, [
    'definitionId', 'itemFacts', 'missionPayloadDigest', 'missionRevision',
    'requirement', 'shelfItemId', 'shelfUpdatedAt',
  ], 'mission_fit_check_payload_fields_invalid');
  if (candidate.definitionId !== plantContainerFitDefinitionId) {
    throw new MissionFitCheckError(400, 'mission_fit_check_definition_invalid');
  }
  const requirement = object(candidate.requirement, 'mission_fit_check_requirement_invalid');
  exactKeys(requirement, ['facts', 'ownerConfirmed'], 'mission_fit_check_requirement_fields_invalid');
  if (typeof requirement.ownerConfirmed !== 'boolean') {
    throw new MissionFitCheckError(400, 'mission_fit_check_requirement_confirmation_invalid');
  }
  return Object.freeze({
    definitionId: plantContainerFitDefinitionId,
    missionRevision: positiveRevision(
      candidate.missionRevision,
      'mission_fit_check_mission_revision_invalid',
    ),
    missionPayloadDigest: hexDigest(
      candidate.missionPayloadDigest,
      'mission_fit_check_mission_digest_invalid',
    ),
    shelfItemId: shelfItemId(candidate.shelfItemId),
    shelfUpdatedAt: timestamp(candidate.shelfUpdatedAt, 'mission_fit_check_shelf_time_invalid'),
    requirement: Object.freeze({
      ownerConfirmed: requirement.ownerConfirmed,
      facts: normalizeMeasurements(
        requirement.facts,
        requirementDefinitions,
        'mission_fit_check_requirement_fact',
      ),
    }),
    itemFacts: normalizeMeasurements(
      candidate.itemFacts,
      itemFactDefinitions,
      'mission_fit_check_item_fact',
      { provenance: true },
    ),
  });
}

export function normalizeMissionFitCheckCorrection(raw) {
  const candidate = object(raw, 'mission_fit_check_correction_invalid');
  exactKeys(candidate, [
    'definitionId', 'expectedRevision', 'itemFacts', 'missionPayloadDigest',
    'missionRevision', 'requirement', 'shelfItemId', 'shelfUpdatedAt',
  ], 'mission_fit_check_correction_fields_invalid');
  return Object.freeze({
    expectedRevision: positiveRevision(
      candidate.expectedRevision,
      'mission_fit_check_expected_revision_invalid',
    ),
    snapshot: normalizeMissionFitCheckSnapshot({
      definitionId: candidate.definitionId,
      itemFacts: candidate.itemFacts,
      missionPayloadDigest: candidate.missionPayloadDigest,
      missionRevision: candidate.missionRevision,
      requirement: candidate.requirement,
      shelfItemId: candidate.shelfItemId,
      shelfUpdatedAt: candidate.shelfUpdatedAt,
    }),
  });
}

function factsByKey(facts) {
  return new Map(facts.map((entry) => [entry.key, entry]));
}

export function evaluatePlantContainerDimensionalFit({ requirement, itemFacts }) {
  const missing = [];
  const requirementByKey = factsByKey(requirement.facts);
  const itemByKey = factsByKey(itemFacts);
  if (requirement.ownerConfirmed !== true) missing.push('requirement_not_owner_confirmed');
  for (const key of Object.keys(requirementDefinitions)) {
    if (!requirementByKey.has(key)) missing.push(`requirement_missing:${key}`);
  }
  for (const key of Object.keys(itemFactDefinitions)) {
    const fact = itemByKey.get(key);
    if (!fact) missing.push(`item_fact_missing:${key}`);
    else if (fact.provenance.ownerConfirmed !== true) missing.push(`item_fact_unconfirmed:${key}`);
  }
  if (missing.length > 0) {
    return Object.freeze({
      status: 'unknown',
      releaseBlocked: true,
      reasonCodes: Object.freeze(missing.sort()),
      orientation: null,
      scope: 'dimensional_capacity_only',
      bindingStatus: 'non_binding',
      safetyGuarantee: false,
    });
  }

  const required = Object.fromEntries([...requirementByKey].map(([key, fact]) => [key, fact.value]));
  const item = Object.fromEntries([...itemByKey].map(([key, fact]) => [key, fact.value]));
  const reasonCodes = [];
  if (item.usableVolumeMl < required.minimumUsableVolumeMl) {
    reasonCodes.push('usable_volume_below_required_minimum');
  }
  if (item.heightMm > required.maximumHeightMm) reasonCodes.push('height_exceeds_maximum');
  const direct = item.footprintWidthMm <= required.maximumFootprintWidthMm
    && item.footprintDepthMm <= required.maximumFootprintDepthMm;
  const rotated = item.footprintDepthMm <= required.maximumFootprintWidthMm
    && item.footprintWidthMm <= required.maximumFootprintDepthMm;
  if (!direct && !rotated) reasonCodes.push('footprint_exceeds_maximum');
  const status = reasonCodes.length === 0 ? 'fit' : 'unfit';
  return Object.freeze({
    status,
    releaseBlocked: status !== 'fit',
    reasonCodes: Object.freeze(reasonCodes),
    orientation: status !== 'fit' ? null : (direct ? 'direct' : 'rotated'),
    scope: 'dimensional_capacity_only',
    bindingStatus: 'non_binding',
    safetyGuarantee: false,
  });
}

export function assertMissionFitCheckTechnicalAccess(configuration) {
  if (configuration?.planner?.enabled !== true
      || configuration.planner.publicReleaseAllowed !== false
      || configuration.planner.externalGenerativeAiAllowed !== false
      || configuration.planner.inventoryResolutionAllowed !== false) {
    throw new MissionFitCheckError(404, 'mission_fit_check_not_enabled');
  }
  return true;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function snapshotFromShelf(row) {
  const snapshot = Object.freeze({
    shelfItemId: row.id,
    domainVersion: row.domain_version,
    title: row.title,
    categoryKey: row.category_key,
    condition: row.condition,
    updatedAt: iso(row.updated_at),
  });
  return Object.freeze({ snapshot, digest: missionFitCheckDigest(snapshot) });
}

async function currentMission(client, ownerId, id) {
  const result = await client.query(
    `SELECT need.id, need.current_revision, revision.payload, revision.payload_sha256
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id
        AND revision.revision = need.current_revision
      WHERE need.owner_id = $1 AND need.id = $2`,
    [ownerId, id],
  );
  if (result.rowCount !== 1) {
    throw new MissionFitCheckError(404, 'mission_fit_check_mission_not_found');
  }
  return result.rows[0];
}

async function currentShelf(client, ownerId, id) {
  const result = await client.query(
    `SELECT id, domain_version, title, category_key, condition, updated_at
       FROM private_shelf_items
      WHERE owner_id = $1 AND id = $2`,
    [ownerId, id],
  );
  if (result.rowCount !== 1) {
    throw new MissionFitCheckError(404, 'mission_fit_check_shelf_item_not_found');
  }
  return result.rows[0];
}

function assertMissionBinding(row, snapshot) {
  if (Number(row.current_revision) !== snapshot.missionRevision
      || row.payload_sha256 !== snapshot.missionPayloadDigest) {
    throw new MissionFitCheckError(409, 'mission_fit_check_mission_snapshot_stale');
  }
  const needs = Array.isArray(row.payload?.needs) ? row.payload.needs : [];
  if (!needs.some((entry) => entry?.needKey === plantContainerNeedKey)) {
    throw new MissionFitCheckError(409, 'mission_fit_check_need_type_not_present');
  }
}

function assertShelfBinding(row, snapshot) {
  if (iso(row.updated_at) !== snapshot.shelfUpdatedAt) {
    throw new MissionFitCheckError(409, 'mission_fit_check_shelf_snapshot_stale');
  }
}

function commandKey(value) {
  return opaqueIdentifier(value, 'mission_fit_check_idempotency_key_invalid');
}

async function lockCommand(client, ownerId, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `mission_fit_check:${ownerId}:${key}`,
  ]);
}

const revisionSelect = `SELECT fit.id, fit.owner_id, fit.mission_need_id, fit.shelf_item_id,
        fit.domain_version, fit.definition_id, fit.definition_version,
        fit.planner_core_version, fit.need_key, fit.created_at, fit.updated_at,
        revision.revision, revision.mission_need_revision, revision.mission_payload_sha256,
        revision.shelf_snapshot, revision.shelf_snapshot_sha256,
        revision.requirement_snapshot, revision.requirement_sha256,
        revision.item_facts, revision.item_facts_sha256,
        revision.evaluation, revision.payload_sha256, revision.created_at AS revision_created_at
   FROM mission_fit_checks AS fit
   JOIN mission_fit_check_revisions AS revision ON revision.fit_check_id = fit.id`;

async function revisionByNumber(client, ownerId, id, revision) {
  const result = await client.query(
    `${revisionSelect}
      WHERE fit.owner_id = $1 AND fit.id = $2 AND revision.revision = $3`,
    [ownerId, id, revision],
  );
  return result.rows[0] ?? null;
}

async function shapeFitCheck(client, ownerId, row) {
  const mission = await currentMission(client, ownerId, row.mission_need_id);
  const shelf = await currentShelf(client, ownerId, row.shelf_item_id);
  const liveShelf = snapshotFromShelf(shelf);
  const driftReasons = [];
  if (Number(mission.current_revision) !== Number(row.mission_need_revision)
      || mission.payload_sha256 !== row.mission_payload_sha256) {
    driftReasons.push('mission_snapshot_changed');
  }
  if (liveShelf.digest !== row.shelf_snapshot_sha256) driftReasons.push('shelf_snapshot_changed');
  const storedEvaluation = row.evaluation;
  const currentEvaluation = driftReasons.length === 0
    ? storedEvaluation
    : {
        status: 'unknown',
        releaseBlocked: true,
        reasonCodes: driftReasons,
        orientation: null,
        scope: 'dimensional_capacity_only',
        bindingStatus: 'non_binding',
        safetyGuarantee: false,
      };
  return Object.freeze({
    fitCheckId: row.id,
    domainVersion: row.domain_version,
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    plannerCoreVersion: row.planner_core_version,
    needKey: row.need_key,
    missionNeedId: row.mission_need_id,
    missionRevision: Number(row.mission_need_revision),
    missionPayloadDigest: row.mission_payload_sha256,
    shelfItemId: row.shelf_item_id,
    shelfSnapshot: row.shelf_snapshot,
    shelfSnapshotDigest: row.shelf_snapshot_sha256,
    revision: Number(row.revision),
    requirement: row.requirement_snapshot,
    requirementDigest: row.requirement_sha256,
    itemFacts: row.item_facts,
    itemFactsDigest: row.item_facts_sha256,
    storedEvaluation,
    currentApplicability: driftReasons.length === 0 ? 'current' : 'stale',
    currentEvaluation,
    payloadDigest: row.payload_sha256,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revisionCreatedAt: iso(row.revision_created_at),
    bindingStatus: 'non_binding',
    safetyGuarantee: false,
    reservationCreated: false,
    bookingCreated: false,
    contractCreated: false,
    paymentCreated: false,
    externalGenerativeAiUsed: false,
    automaticPhotoAnalysisUsed: false,
    publicListingCreated: false,
  });
}

async function replayCommand(client, { ownerId, key, commandType, requestDigest }) {
  const result = await client.query(
    `SELECT command_type, request_sha256, fit_check_id, result_revision
       FROM mission_fit_check_commands
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, key],
  );
  const command = result.rows[0];
  if (!command) return null;
  if (command.command_type !== commandType || command.request_sha256 !== requestDigest) {
    throw new MissionFitCheckError(409, 'mission_fit_check_idempotency_key_reused');
  }
  const row = await revisionByNumber(
    client,
    ownerId,
    command.fit_check_id,
    Number(command.result_revision),
  );
  if (!row) throw new MissionFitCheckError(500, 'mission_fit_check_replay_state_invalid');
  return { fitCheck: await shapeFitCheck(client, ownerId, row), replayed: true };
}

async function insertRevision(client, {
  id,
  revision,
  missionId,
  snapshot,
  shelf,
  evaluation,
}) {
  const requirementDigest = missionFitCheckDigest(snapshot.requirement);
  const itemFactsDigest = missionFitCheckDigest(snapshot.itemFacts);
  const payloadDigest = missionFitCheckDigest({
    domainVersion: missionFitCheckDomainVersion,
    definitionId: plantContainerFitDefinitionId,
    definitionVersion: plantContainerFitDefinitionVersion,
    plannerCoreVersion,
    missionNeedId: missionId,
    missionRevision: snapshot.missionRevision,
    missionPayloadDigest: snapshot.missionPayloadDigest,
    shelfSnapshotDigest: shelf.digest,
    revision,
    requirementDigest,
    itemFactsDigest,
    evaluation,
  });
  await client.query(
    `INSERT INTO mission_fit_check_revisions (
       fit_check_id, mission_need_id, revision, mission_need_revision,
       mission_payload_sha256, shelf_snapshot, shelf_snapshot_sha256,
       requirement_snapshot, requirement_sha256, item_facts, item_facts_sha256,
       evaluation, outcome, release_blocked, payload_sha256
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9,
               $10::jsonb, $11, $12::jsonb, $13, $14, $15)`,
    [id, missionId, revision, snapshot.missionRevision, snapshot.missionPayloadDigest,
      JSON.stringify(shelf.snapshot), shelf.digest, JSON.stringify(snapshot.requirement),
      requirementDigest, JSON.stringify(snapshot.itemFacts), itemFactsDigest,
      JSON.stringify(evaluation), evaluation.status, evaluation.releaseBlocked, payloadDigest],
  );
}

async function insertCommand(client, {
  ownerId, key, commandType, requestDigest, id, revision,
}) {
  await client.query(
    `INSERT INTO mission_fit_check_commands (
       owner_id, idempotency_key, command_type, request_sha256,
       fit_check_id, result_revision
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [ownerId, key, commandType, requestDigest, id, revision],
  );
}

export async function createMissionFitCheck(client, {
  actorId,
  missionNeedId: rawMissionId,
  raw,
  idempotencyKey,
}) {
  const ownerId = text(actorId, 160, 'mission_fit_check_actor_invalid');
  const missionId = missionNeedId(rawMissionId);
  const snapshot = normalizeMissionFitCheckSnapshot(raw);
  const key = commandKey(idempotencyKey);
  const requestDigest = missionFitCheckDigest({ command: 'create', missionId, snapshot });
  await lockCommand(client, ownerId, key);
  const replay = await replayCommand(client, {
    ownerId, key, commandType: 'create', requestDigest,
  });
  if (replay) return replay;
  const mission = await currentMission(client, ownerId, missionId);
  assertMissionBinding(mission, snapshot);
  const shelfRow = await currentShelf(client, ownerId, snapshot.shelfItemId);
  assertShelfBinding(shelfRow, snapshot);
  const shelf = snapshotFromShelf(shelfRow);
  const evaluation = evaluatePlantContainerDimensionalFit(snapshot);
  const id = `mission_fit_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO mission_fit_checks (
       id, owner_id, mission_need_id, shelf_item_id, domain_version, definition_id,
       definition_version, planner_core_version, need_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, ownerId, missionId, snapshot.shelfItemId,
      missionFitCheckDomainVersion, plantContainerFitDefinitionId,
      plantContainerFitDefinitionVersion, plannerCoreVersion, plantContainerNeedKey],
  );
  await insertRevision(client, {
    id, revision: 1, missionId, snapshot, shelf, evaluation,
  });
  await insertCommand(client, {
    ownerId, key, commandType: 'create', requestDigest, id, revision: 1,
  });
  const row = await revisionByNumber(client, ownerId, id, 1);
  return { fitCheck: await shapeFitCheck(client, ownerId, row), replayed: false };
}

export async function correctMissionFitCheck(client, {
  actorId,
  fitCheckId: rawFitCheckId,
  raw,
  idempotencyKey,
}) {
  const ownerId = text(actorId, 160, 'mission_fit_check_actor_invalid');
  const id = fitCheckId(rawFitCheckId);
  const correction = normalizeMissionFitCheckCorrection(raw);
  const key = commandKey(idempotencyKey);
  const requestDigest = missionFitCheckDigest({ command: 'correct', id, correction });
  await lockCommand(client, ownerId, key);
  const replay = await replayCommand(client, {
    ownerId, key, commandType: 'correct', requestDigest,
  });
  if (replay) return replay;
  const locked = await client.query(
    `SELECT id, mission_need_id, shelf_item_id, current_revision
       FROM mission_fit_checks
      WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
    [ownerId, id],
  );
  if (locked.rowCount !== 1) throw new MissionFitCheckError(404, 'mission_fit_check_not_found');
  const root = locked.rows[0];
  if (Number(root.current_revision) !== correction.expectedRevision) {
    throw new MissionFitCheckError(409, 'mission_fit_check_revision_conflict', {
      expectedRevision: correction.expectedRevision,
      actualRevision: Number(root.current_revision),
    });
  }
  if (root.shelf_item_id !== correction.snapshot.shelfItemId) {
    throw new MissionFitCheckError(409, 'mission_fit_check_shelf_item_immutable');
  }
  const mission = await currentMission(client, ownerId, root.mission_need_id);
  assertMissionBinding(mission, correction.snapshot);
  const shelfRow = await currentShelf(client, ownerId, root.shelf_item_id);
  assertShelfBinding(shelfRow, correction.snapshot);
  const shelf = snapshotFromShelf(shelfRow);
  const evaluation = evaluatePlantContainerDimensionalFit(correction.snapshot);
  const revision = correction.expectedRevision + 1;
  await insertRevision(client, {
    id, revision, missionId: root.mission_need_id,
    snapshot: correction.snapshot, shelf, evaluation,
  });
  await insertCommand(client, {
    ownerId, key, commandType: 'correct', requestDigest, id, revision,
  });
  const row = await revisionByNumber(client, ownerId, id, revision);
  return { fitCheck: await shapeFitCheck(client, ownerId, row), replayed: false };
}

export async function getMissionFitCheck(client, { actorId, fitCheckId: rawFitCheckId }) {
  const ownerId = text(actorId, 160, 'mission_fit_check_actor_invalid');
  const id = fitCheckId(rawFitCheckId);
  const result = await client.query(
    `${revisionSelect}
      WHERE fit.owner_id = $1 AND fit.id = $2
        AND revision.revision = fit.current_revision`,
    [ownerId, id],
  );
  if (result.rowCount !== 1) throw new MissionFitCheckError(404, 'mission_fit_check_not_found');
  return { fitCheck: await shapeFitCheck(client, ownerId, result.rows[0]) };
}

export async function listMissionFitChecks(client, { actorId, missionNeedId: rawMissionId }) {
  const ownerId = text(actorId, 160, 'mission_fit_check_actor_invalid');
  const missionId = missionNeedId(rawMissionId);
  await currentMission(client, ownerId, missionId);
  const result = await client.query(
    `${revisionSelect}
      WHERE fit.owner_id = $1 AND fit.mission_need_id = $2
        AND revision.revision = fit.current_revision
      ORDER BY fit.updated_at DESC, fit.id`,
    [ownerId, missionId],
  );
  const fitChecks = [];
  for (const row of result.rows) fitChecks.push(await shapeFitCheck(client, ownerId, row));
  return { fitChecks };
}
