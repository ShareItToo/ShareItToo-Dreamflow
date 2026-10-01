import crypto from 'node:crypto';

export const missionSupplyDemandDomainVersion = 'P6-A-2026-10-01.1';
export const missionSupplyDemandPurpose = 'mission_gap_supply_v1';

const demandEffects = Object.freeze({
  publicShelfCreated: false,
  publicListingCreated: false,
  marketingContactCreated: false,
  notificationCreated: false,
  providerNotificationSent: false,
  automaticPublicationPerformed: false,
  reservationCreated: false,
  bookingCreated: false,
  contractCreated: false,
  paymentCreated: false,
  externalGenerativeAiUsed: false,
});

export class MissionSupplyDemandError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MissionSupplyDemandError(400, code);
  }
  return { ...value };
}

function exactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    throw new MissionSupplyDemandError(400, code);
  }
}

function text(value, maximum, code, status = 400) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || candidate.length > maximum) {
    throw new MissionSupplyDemandError(status, code);
  }
  return candidate;
}

function identifier(value, pattern, code, status = 400) {
  const candidate = text(value, 240, code, status);
  if (!pattern.test(candidate)) throw new MissionSupplyDemandError(status, code);
  return candidate;
}

function positiveRevision(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MissionSupplyDemandError(400, code);
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function missionSupplyDemandDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function demandId(value) {
  return identifier(
    value,
    /^mission_demand_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    'mission_supply_demand_not_found',
    404,
  );
}

function resolutionId(value) {
  return identifier(
    value,
    /^mission_inventory_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    'mission_supply_resolution_not_found',
    404,
  );
}

function commandKey(value) {
  return identifier(
    value,
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/u,
    'mission_supply_idempotency_key_invalid',
  );
}

function actorId(value) {
  return text(value, 160, 'mission_supply_actor_invalid');
}

function dateTime(value, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(candidate)) {
    throw new MissionSupplyDemandError(400, code);
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) throw new MissionSupplyDemandError(400, code);
  return parsed.toISOString();
}

function iso(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new MissionSupplyDemandError(500, 'mission_supply_timestamp_invalid');
  }
  return parsed.toISOString();
}

export function normalizeMissionSupplyDemandRequest(raw, { now = new Date() } = {}) {
  const candidate = object(raw, 'mission_supply_request_invalid');
  exactKeys(
    candidate,
    ['expiresAt', 'purpose', 'resolutionRevision', 'slotKey'],
    'mission_supply_request_fields_invalid',
  );
  if (candidate.purpose !== missionSupplyDemandPurpose) {
    throw new MissionSupplyDemandError(400, 'mission_supply_purpose_invalid');
  }
  const expiresAt = dateTime(candidate.expiresAt, 'mission_supply_expiry_invalid');
  if (new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    throw new MissionSupplyDemandError(400, 'mission_supply_expiry_not_future');
  }
  return Object.freeze({
    resolutionRevision: positiveRevision(
      candidate.resolutionRevision,
      'mission_supply_resolution_revision_invalid',
    ),
    slotKey: identifier(
      candidate.slotKey,
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{4,239}$/u,
      'mission_supply_slot_key_invalid',
    ),
    purpose: missionSupplyDemandPurpose,
    expiresAt,
  });
}

export function normalizeMissionSupplyDemandResponse(raw) {
  const candidate = object(raw, 'mission_supply_response_invalid');
  exactKeys(candidate, ['decision', 'expectedRevision'], 'mission_supply_response_fields_invalid');
  if (!['reject', 'release'].includes(candidate.decision)) {
    throw new MissionSupplyDemandError(400, 'mission_supply_decision_invalid');
  }
  return Object.freeze({
    decision: candidate.decision,
    expectedRevision: positiveRevision(
      candidate.expectedRevision,
      'mission_supply_expected_revision_invalid',
    ),
  });
}

export function normalizeMissionSupplyDemandRevoke(raw) {
  const candidate = object(raw, 'mission_supply_revoke_invalid');
  exactKeys(candidate, ['expectedRevision'], 'mission_supply_revoke_fields_invalid');
  return Object.freeze({
    expectedRevision: positiveRevision(
      candidate.expectedRevision,
      'mission_supply_expected_revision_invalid',
    ),
  });
}

export function assertMissionSupplyDemandTechnicalAccess(configuration) {
  if (configuration?.planner?.enabled !== true
      || configuration.planner.inventoryResolutionEnabled !== true
      || configuration.planner.demandEnabled !== true
      || configuration.planner.publicReleaseAllowed !== false
      || configuration.planner.demandActivationAllowed !== false
      || configuration.planner.externalGenerativeAiAllowed !== false
      || configuration.planner.inventoryResolutionAllowed !== false) {
    throw new MissionSupplyDemandError(404, 'mission_supply_demand_not_enabled');
  }
  return true;
}

export function assertMissionSupplyDemandCreateTechnicalAccess(
  configuration,
  recipientResolver,
) {
  assertMissionSupplyDemandTechnicalAccess(configuration);
  if (typeof recipientResolver !== 'function') {
    throw new MissionSupplyDemandError(404, 'mission_supply_demand_not_enabled');
  }
  return true;
}

function validateResolvedRecipient(raw, expected) {
  const candidate = object(raw, 'mission_supply_recipient_resolution_invalid');
  exactKeys(candidate, [
    'eligibilityVersion', 'needKey', 'purpose', 'recipientOwnerId', 'shelfItemId',
  ], 'mission_supply_recipient_resolution_fields_invalid');
  const normalized = Object.freeze({
    recipientOwnerId: text(
      candidate.recipientOwnerId,
      160,
      'mission_supply_recipient_resolution_invalid',
      404,
    ),
    shelfItemId: identifier(
      candidate.shelfItemId,
      /^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      'mission_supply_recipient_resolution_invalid',
      404,
    ),
    needKey: text(candidate.needKey, 80, 'mission_supply_recipient_resolution_invalid', 404),
    purpose: candidate.purpose,
    eligibilityVersion: identifier(
      candidate.eligibilityVersion,
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/u,
      'mission_supply_recipient_resolution_invalid',
      404,
    ),
  });
  if (normalized.recipientOwnerId === expected.requesterId
      || normalized.needKey !== expected.needKey
      || normalized.purpose !== expected.purpose) {
    throw new MissionSupplyDemandError(404, 'mission_supply_recipient_not_eligible');
  }
  return normalized;
}

async function assertResolvedRecipientEligible(client, requesterId, resolved) {
  const result = await client.query(
    `SELECT item.id
       FROM private_shelf_items AS item
       JOIN users AS owner ON owner.id = item.owner_id
      WHERE item.id = $1
        AND item.owner_id = $2
        AND owner.account_status = 'active'
        AND owner.deactivated_at IS NULL
        AND owner.private_use_confirmed_at IS NOT NULL
        AND owner.private_marketplace_review_status = 'clear'
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks AS block
           WHERE block.unblocked_at IS NULL
             AND ((block.blocker_id = $2 AND block.blocked_id = $3)
               OR (block.blocker_id = $3 AND block.blocked_id = $2))
        )`,
    [resolved.shelfItemId, resolved.recipientOwnerId, requesterId],
  );
  if (result.rowCount !== 1) {
    throw new MissionSupplyDemandError(404, 'mission_supply_recipient_not_eligible');
  }
}

async function lockCommand(client, principalId, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `mission_supply:${principalId}:${key}`,
  ]);
}

async function lockGap(client, id, revision, slotKey) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `mission_supply_gap:${id}:${revision}:${slotKey}`,
  ]);
}

const demandSelect = `SELECT demand.id, demand.requester_id, demand.recipient_id,
        demand.resolution_id, demand.resolution_revision, demand.mission_need_id,
        demand.mission_need_revision, demand.mission_payload_sha256,
        demand.slot_key, demand.need_key, demand.necessity, demand.quantity,
        demand.slot_ordinal, demand.gap_reason, demand.candidate_shelf_item_id,
        demand.eligibility_version, demand.purpose,
        demand.start_date::text AS start_date, demand.end_date::text AS end_date,
        demand.region_snapshot, demand.region_snapshot_sha256,
        demand.expires_at, demand.domain_version,
        demand.current_revision, demand.current_status,
        demand.created_at, demand.updated_at,
        release.id AS release_id, release.expires_at AS release_expires_at,
        release.created_at AS release_created_at
   FROM mission_supply_demands AS demand
   LEFT JOIN mission_supply_releases AS release ON release.demand_id = demand.id`;

function effectiveStatus(row, now) {
  if (row.current_status === 'pending'
      && new Date(row.expires_at).getTime() <= new Date(now).getTime()) {
    return 'expired_no_response';
  }
  return row.current_status;
}

function shapeDemand(row, principalId, now) {
  const role = row.requester_id === principalId
    ? 'requester'
    : (row.recipient_id === principalId ? 'recipient' : null);
  if (!role) throw new MissionSupplyDemandError(404, 'mission_supply_demand_not_found');
  const status = effectiveStatus(row, now);
  const release = row.release_id ? Object.freeze({
    releaseId: row.release_id,
    purpose: row.purpose,
    expiresAt: iso(row.release_expires_at),
    visibilityStatus: row.current_status === 'revoked'
      ? 'revoked'
      : (new Date(row.release_expires_at).getTime() <= new Date(now).getTime()
        ? 'expired'
        : 'active'),
    createdAt: iso(row.release_created_at),
  }) : null;
  return Object.freeze({
    demandId: row.id,
    domainVersion: row.domain_version,
    participantRole: role,
    ...(role === 'requester' ? {
      missionNeedId: row.mission_need_id,
      resolutionId: row.resolution_id,
      resolutionRevision: Number(row.resolution_revision),
      slotKey: row.slot_key,
    } : {}),
    need: Object.freeze({
      needKey: row.need_key,
      necessity: row.necessity,
      quantity: Number(row.quantity),
    }),
    period: Object.freeze({ startDate: row.start_date, endDate: row.end_date }),
    region: Object.freeze({
      sourceType: 'owner_confirmed_search_origin',
      radiusKm: Number(row.region_snapshot.radiusKm),
      exactCoordinatesStored: false,
    }),
    purpose: row.purpose,
    revision: Number(row.current_revision),
    status,
    expiresAt: iso(row.expires_at),
    requestBoundRelease: release,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...demandEffects,
  });
}

async function demandForParticipant(client, principalId, id, { lock = false } = {}) {
  const result = await client.query(
    `${demandSelect}
      WHERE demand.id = $1 AND (demand.requester_id = $2 OR demand.recipient_id = $2)
      ${lock ? 'FOR UPDATE OF demand' : ''}`,
    [id, principalId],
  );
  if (result.rowCount !== 1) {
    throw new MissionSupplyDemandError(404, 'mission_supply_demand_not_found');
  }
  return result.rows[0];
}

async function replayCommand(client, {
  principalId, key, commandType, requestDigest, now,
}) {
  const result = await client.query(
    `SELECT command_type, request_sha256, demand_id
       FROM mission_supply_demand_commands
      WHERE actor_id = $1 AND idempotency_key = $2`,
    [principalId, key],
  );
  const command = result.rows[0];
  if (!command) return null;
  if (command.command_type !== commandType || command.request_sha256 !== requestDigest) {
    throw new MissionSupplyDemandError(409, 'mission_supply_idempotency_key_reused');
  }
  const row = await demandForParticipant(client, principalId, command.demand_id);
  return { demand: shapeDemand(row, principalId, now), replayed: true };
}

async function insertRevision(client, { id, revision, principalId, action, status }) {
  await client.query(
    `INSERT INTO mission_supply_demand_revisions (
       demand_id, revision, actor_id, action, status
     ) VALUES ($1, $2, $3, $4, $5)`,
    [id, revision, principalId, action, status],
  );
}

async function insertCommand(client, {
  principalId, key, commandType, requestDigest, id, revision,
}) {
  await client.query(
    `INSERT INTO mission_supply_demand_commands (
       actor_id, idempotency_key, command_type, request_sha256,
       demand_id, result_revision
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [principalId, key, commandType, requestDigest, id, revision],
  );
}

async function exactGap(client, requesterId, id, request) {
  const result = await client.query(
    `SELECT resolution.mission_need_id, resolution.current_revision,
            revision.mission_need_revision, revision.mission_payload_sha256,
            revision.start_date::text AS start_date,
            revision.end_date::text AS end_date,
            revision.location_snapshot, revision.location_snapshot_sha256,
            assignment.slot_key, assignment.need_key, assignment.necessity,
            assignment.slot_ordinal, assignment.gap_reason
       FROM mission_inventory_resolutions AS resolution
       JOIN mission_inventory_resolution_revisions AS revision
         ON revision.resolution_id = resolution.id
        AND revision.revision = $3
       JOIN mission_needs AS mission
         ON mission.id = resolution.mission_need_id
        AND mission.owner_id = resolution.owner_id
        AND mission.current_revision = revision.mission_need_revision
       JOIN mission_need_revisions AS mission_revision
         ON mission_revision.mission_need_id = mission.id
        AND mission_revision.revision = mission.current_revision
        AND mission_revision.payload_sha256 = revision.mission_payload_sha256
       JOIN mission_inventory_resolution_assignments AS assignment
         ON assignment.revision_id = revision.id
        AND assignment.slot_key = $4
      WHERE resolution.id = $2
        AND resolution.owner_id = $1
        AND resolution.current_revision = $3
        AND assignment.listing_id IS NULL
        AND assignment.gap_reason = 'no_current_unique_candidate'
      FOR KEY SHARE OF resolution`,
    [requesterId, id, request.resolutionRevision, request.slotKey],
  );
  if (result.rowCount !== 1) {
    throw new MissionSupplyDemandError(404, 'mission_supply_gap_not_found');
  }
  const gap = result.rows[0];
  const endBoundary = new Date(`${gap.end_date}T23:59:59.999Z`).getTime();
  if (new Date(request.expiresAt).getTime() > endBoundary) {
    throw new MissionSupplyDemandError(400, 'mission_supply_expiry_after_period');
  }
  if (missionSupplyDemandDigest(gap.location_snapshot) !== gap.location_snapshot_sha256) {
    throw new MissionSupplyDemandError(409, 'mission_supply_region_snapshot_invalid');
  }
  return gap;
}

async function assertDemandStillReleasable(client, row) {
  await assertResolvedRecipientEligible(client, row.requester_id, {
    recipientOwnerId: row.recipient_id,
    shelfItemId: row.candidate_shelf_item_id,
  });
  const result = await client.query(
    `SELECT demand.id
       FROM mission_supply_demands AS demand
       JOIN users AS requester ON requester.id = demand.requester_id
       JOIN mission_inventory_resolutions AS resolution
         ON resolution.id = demand.resolution_id
        AND resolution.owner_id = demand.requester_id
        AND resolution.mission_need_id = demand.mission_need_id
        AND resolution.current_revision = demand.resolution_revision
       JOIN mission_inventory_resolution_revisions AS revision
         ON revision.resolution_id = demand.resolution_id
        AND revision.revision = demand.resolution_revision
        AND revision.mission_need_id = demand.mission_need_id
        AND revision.mission_need_revision = demand.mission_need_revision
        AND revision.mission_payload_sha256 = demand.mission_payload_sha256
        AND revision.start_date = demand.start_date
        AND revision.end_date = demand.end_date
        AND revision.location_snapshot = demand.region_snapshot
        AND revision.location_snapshot_sha256 = demand.region_snapshot_sha256
       JOIN mission_needs AS mission
         ON mission.id = demand.mission_need_id
        AND mission.owner_id = demand.requester_id
        AND mission.current_revision = demand.mission_need_revision
       JOIN mission_need_revisions AS mission_revision
         ON mission_revision.mission_need_id = demand.mission_need_id
        AND mission_revision.revision = demand.mission_need_revision
        AND mission_revision.payload_sha256 = demand.mission_payload_sha256
       JOIN mission_inventory_resolution_assignments AS assignment
         ON assignment.resolution_id = demand.resolution_id
        AND assignment.resolution_revision = demand.resolution_revision
        AND assignment.slot_key = demand.slot_key
        AND assignment.need_key = demand.need_key
        AND assignment.necessity = demand.necessity
        AND assignment.slot_ordinal = demand.slot_ordinal
        AND assignment.gap_reason = demand.gap_reason
        AND assignment.listing_id IS NULL
      WHERE demand.id = $1
        AND requester.account_status = 'active'
        AND requester.deactivated_at IS NULL
        AND requester.private_use_confirmed_at IS NOT NULL
        AND requester.private_marketplace_review_status = 'clear'`,
    [row.id],
  );
  if (result.rowCount !== 1) {
    throw new MissionSupplyDemandError(409, 'mission_supply_demand_stale');
  }
}

export async function createMissionSupplyDemand(client, {
  actorId: rawActorId,
  resolutionId: rawResolutionId,
  raw,
  idempotencyKey,
  recipientResolver,
  now = new Date(),
}) {
  const requesterId = actorId(rawActorId);
  const inventoryId = resolutionId(rawResolutionId);
  const request = normalizeMissionSupplyDemandRequest(raw, { now });
  const key = commandKey(idempotencyKey);
  const requestDigest = missionSupplyDemandDigest({
    command: 'create', resolutionId: inventoryId, request,
  });
  await lockCommand(client, requesterId, key);
  const replay = await replayCommand(client, {
    principalId: requesterId, key, commandType: 'create', requestDigest, now,
  });
  if (replay) return replay;
  await lockGap(client, inventoryId, request.resolutionRevision, request.slotKey);
  const gap = await exactGap(client, requesterId, inventoryId, request);
  const existing = await client.query(
    `SELECT id FROM mission_supply_demands
      WHERE resolution_id = $1 AND resolution_revision = $2 AND slot_key = $3`,
    [inventoryId, request.resolutionRevision, request.slotKey],
  );
  if (existing.rowCount) {
    throw new MissionSupplyDemandError(409, 'mission_supply_gap_demand_exists');
  }
  const rawRecipient = await recipientResolver(client, Object.freeze({
    requesterId,
    resolutionId: inventoryId,
    resolutionRevision: request.resolutionRevision,
    missionNeedId: gap.mission_need_id,
    missionNeedRevision: Number(gap.mission_need_revision),
    slotKey: gap.slot_key,
    needKey: gap.need_key,
    necessity: gap.necessity,
    quantity: 1,
    startDate: gap.start_date,
    endDate: gap.end_date,
    region: Object.freeze({ ...gap.location_snapshot }),
    purpose: request.purpose,
  }));
  const recipient = validateResolvedRecipient(rawRecipient, {
    requesterId, needKey: gap.need_key, purpose: request.purpose,
  });
  await assertResolvedRecipientEligible(client, requesterId, recipient);
  const id = `mission_demand_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO mission_supply_demands (
       id, requester_id, recipient_id, resolution_id, resolution_revision,
       mission_need_id, mission_need_revision, mission_payload_sha256,
       slot_key, need_key, necessity, quantity, slot_ordinal, gap_reason,
       candidate_shelf_item_id,
       eligibility_version, purpose, start_date, end_date, region_snapshot,
       region_snapshot_sha256, expires_at, domain_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12,
       'no_current_unique_candidate', $13, $14, $15, $16::date, $17::date,
       $18::jsonb, $19, $20::timestamptz, $21
     )`,
    [id, requesterId, recipient.recipientOwnerId, inventoryId,
      request.resolutionRevision, gap.mission_need_id, Number(gap.mission_need_revision),
      gap.mission_payload_sha256, gap.slot_key, gap.need_key, gap.necessity,
      Number(gap.slot_ordinal), recipient.shelfItemId, recipient.eligibilityVersion,
      request.purpose,
      gap.start_date, gap.end_date, JSON.stringify(gap.location_snapshot),
      gap.location_snapshot_sha256, request.expiresAt, missionSupplyDemandDomainVersion],
  );
  await insertRevision(client, {
    id, revision: 1, principalId: requesterId, action: 'create', status: 'pending',
  });
  await insertCommand(client, {
    principalId: requesterId, key, commandType: 'create', requestDigest, id, revision: 1,
  });
  const row = await demandForParticipant(client, requesterId, id);
  return { demand: shapeDemand(row, requesterId, now), replayed: false };
}

export async function respondToMissionSupplyDemand(client, {
  actorId: rawActorId,
  demandId: rawDemandId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const principalId = actorId(rawActorId);
  const id = demandId(rawDemandId);
  const request = normalizeMissionSupplyDemandResponse(raw);
  const key = commandKey(idempotencyKey);
  const requestDigest = missionSupplyDemandDigest({ command: 'respond', demandId: id, request });
  await lockCommand(client, principalId, key);
  const replay = await replayCommand(client, {
    principalId, key, commandType: 'respond', requestDigest, now,
  });
  if (replay) return replay;
  const row = await demandForParticipant(client, principalId, id, { lock: true });
  if (row.recipient_id !== principalId) {
    throw new MissionSupplyDemandError(404, 'mission_supply_demand_not_found');
  }
  if (Number(row.current_revision) !== request.expectedRevision) {
    throw new MissionSupplyDemandError(409, 'mission_supply_revision_conflict');
  }
  if (row.current_status !== 'pending') {
    throw new MissionSupplyDemandError(409, 'mission_supply_response_not_pending');
  }
  if (effectiveStatus(row, now) === 'expired_no_response') {
    throw new MissionSupplyDemandError(409, 'mission_supply_demand_expired');
  }
  if (request.decision === 'release') {
    await assertDemandStillReleasable(client, row);
  }
  const nextRevision = request.expectedRevision + 1;
  const status = request.decision === 'release' ? 'released' : 'rejected';
  await insertRevision(client, {
    id, revision: nextRevision, principalId, action: request.decision, status,
  });
  if (request.decision === 'release') {
    await client.query(
      `INSERT INTO mission_supply_releases (
         id, demand_id, recipient_id, shelf_item_id, purpose,
         released_revision, expires_at
       ) SELECT $1, id, recipient_id, candidate_shelf_item_id, purpose, $2, expires_at
           FROM mission_supply_demands WHERE id = $3 AND recipient_id = $4`,
      [`mission_release_${crypto.randomUUID()}`, nextRevision, id, principalId],
    );
  }
  await insertCommand(client, {
    principalId, key, commandType: 'respond', requestDigest, id, revision: nextRevision,
  });
  const shaped = await demandForParticipant(client, principalId, id);
  return { demand: shapeDemand(shaped, principalId, now), replayed: false };
}

export async function revokeMissionSupplyRelease(client, {
  actorId: rawActorId,
  demandId: rawDemandId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const principalId = actorId(rawActorId);
  const id = demandId(rawDemandId);
  const request = normalizeMissionSupplyDemandRevoke(raw);
  const key = commandKey(idempotencyKey);
  const requestDigest = missionSupplyDemandDigest({ command: 'revoke', demandId: id, request });
  await lockCommand(client, principalId, key);
  const replay = await replayCommand(client, {
    principalId, key, commandType: 'revoke', requestDigest, now,
  });
  if (replay) return replay;
  const row = await demandForParticipant(client, principalId, id, { lock: true });
  if (row.recipient_id !== principalId) {
    throw new MissionSupplyDemandError(404, 'mission_supply_demand_not_found');
  }
  if (Number(row.current_revision) !== request.expectedRevision) {
    throw new MissionSupplyDemandError(409, 'mission_supply_revision_conflict');
  }
  if (row.current_status !== 'released' || !row.release_id) {
    throw new MissionSupplyDemandError(409, 'mission_supply_release_not_active');
  }
  const nextRevision = request.expectedRevision + 1;
  await insertRevision(client, {
    id, revision: nextRevision, principalId, action: 'revoke', status: 'revoked',
  });
  await insertCommand(client, {
    principalId, key, commandType: 'revoke', requestDigest, id, revision: nextRevision,
  });
  const shaped = await demandForParticipant(client, principalId, id);
  return { demand: shapeDemand(shaped, principalId, now), replayed: false };
}

export async function getMissionSupplyDemand(client, {
  actorId: rawActorId, demandId: rawDemandId, now = new Date(),
}) {
  const principalId = actorId(rawActorId);
  const row = await demandForParticipant(client, principalId, demandId(rawDemandId));
  return { demand: shapeDemand(row, principalId, now) };
}

export async function listMissionSupplyDemands(client, {
  actorId: rawActorId, now = new Date(),
}) {
  const principalId = actorId(rawActorId);
  const result = await client.query(
    `${demandSelect}
      WHERE demand.requester_id = $1 OR demand.recipient_id = $1
      ORDER BY demand.updated_at DESC, demand.id`,
    [principalId],
  );
  return { demands: result.rows.map((row) => shapeDemand(row, principalId, now)) };
}
