import crypto from 'node:crypto';

export const missionSupplyParticipationDomainVersion = 'P6-C1-2026-10-02.1';
export const missionSupplyParticipationNeedKey = 'plant_container_equipment';

export class MissionSupplyParticipationError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function fail(status, suffix) {
  throw new MissionSupplyParticipationError(status, `mission_supply_participation_${suffix}`);
}

// This pure reader is also called by the real application config at startup.
export function readMissionSupplyParticipationEnabled(env, {
  deploymentEnvironment, coreEnabled, inventoryEnabled, demandEnabled,
}) {
  const value = (env.PLANNER_SUPPLY_PARTICIPATION_ENABLED ?? 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(value)) fail(500, 'configuration_invalid');
  if (value === 'false') return false;
  if (!['development', 'test', 'staging'].includes(deploymentEnvironment)
      || coreEnabled !== true || inventoryEnabled !== true || demandEnabled !== true) {
    fail(500, 'configuration_unsafe');
  }
  return true;
}

export function assertMissionSupplyParticipationTechnicalAccess(configuration) {
  const planner = configuration?.planner;
  if (planner?.enabled !== true || planner.inventoryResolutionEnabled !== true
      || planner.demandEnabled !== true || planner.supplyParticipationEnabled !== true
      || planner.demandActivationAllowed !== false || planner.publicReleaseAllowed !== false
      || planner.externalGenerativeAiAllowed !== false || planner.inventoryResolutionAllowed !== false) {
    fail(404, 'not_enabled');
  }
}

function exactKeys(raw, keys) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || Object.keys(raw).length !== keys.length
      || keys.some((key) => !Object.hasOwn(raw, key))) fail(400, 'fields_invalid');
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2147483647) {
    fail(400, 'revision_invalid');
  }
  return value;
}

export function normalizeMissionSupplyParticipation(raw) {
  exactKeys(raw, ['expectedRevision', 'status']);
  if (!['active', 'withdrawn'].includes(raw.status)) fail(400, 'status_invalid');
  return { expectedRevision: revision(raw.expectedRevision), status: raw.status };
}

export function normalizeMissionSupplyParticipationItem(raw) {
  exactKeys(raw, ['expectedParticipationRevision', 'expectedRevision', 'needKey', 'availabilityStatus']);
  if (raw.needKey !== missionSupplyParticipationNeedKey) fail(400, 'need_key_invalid');
  if (!['confirmed_available', 'withdrawn'].includes(raw.availabilityStatus)) fail(400, 'status_invalid');
  return {
    expectedParticipationRevision: revision(raw.expectedParticipationRevision),
    expectedRevision: revision(raw.expectedRevision),
    needKey: raw.needKey,
    availabilityStatus: raw.availabilityStatus,
  };
}

function commandKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/u.test(value)) {
    fail(400, 'idempotency_key_invalid');
  }
  return value;
}

function itemId(value) {
  if (typeof value !== 'string'
      || !/^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) {
    fail(404, 'item_not_found');
  }
  return value;
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(500, 'timestamp_invalid');
  return date.toISOString();
}

// All operations lock the owner before the root and item. This serializes
// first creation, snapshots and every command, including different keys.
async function lockOwner(client, actorId) {
  if (typeof actorId !== 'string' || !actorId || actorId.length > 160) fail(401, 'owner_unavailable');
  const result = await client.query(
    `SELECT id, private_use_confirmed_at, private_marketplace_review_status
       FROM users WHERE id = $1 AND account_status = 'active'
        AND deactivated_at IS NULL FOR UPDATE`, [actorId],
  );
  if (result.rowCount !== 1) fail(401, 'owner_unavailable');
  const suspension = await client.query(
    `SELECT scope FROM user_suspensions WHERE user_id = $1
       AND lifted_at IS NULL AND starts_at <= now()
       AND (ends_at IS NULL OR ends_at > now()) AND scope IN ('account', 'booking')`,
    [actorId],
  );
  if (suspension.rows.some((row) => row.scope === 'account')) fail(403, 'owner_suspended');
  return { ...result.rows[0], bookingSuspended: suspension.rowCount > 0 };
}

function assertCanEnable(owner) {
  if (owner.bookingSuspended || !owner.private_use_confirmed_at
      || owner.private_marketplace_review_status !== 'clear') fail(403, 'owner_not_eligible');
}

async function rootForOwner(client, ownerId) {
  const result = await client.query(
    'SELECT * FROM mission_supply_participations WHERE owner_id = $1 FOR UPDATE', [ownerId],
  );
  return result.rows[0] ?? null;
}

async function ownedItem(client, ownerId, id) {
  const result = await client.query(
    'SELECT id FROM private_shelf_items WHERE id = $1 AND owner_id = $2 FOR UPDATE', [id, ownerId],
  );
  if (result.rowCount !== 1) fail(404, 'item_not_found');
}

async function snapshot(client, ownerId) {
  const root = await rootForOwner(client, ownerId);
  const items = root ? (await client.query(
    `SELECT DISTINCT ON (history.shelf_item_id, history.need_key)
            history.shelf_item_id, history.need_key, history.revision,
            history.availability_status, history.created_at
       FROM mission_supply_participation_item_revisions AS history
       JOIN private_shelf_items AS item
         ON item.id = history.shelf_item_id AND item.owner_id = history.owner_id
      WHERE history.participation_id = $1 AND history.owner_id = $2
      ORDER BY history.shelf_item_id, history.need_key, history.revision DESC`, [root.id, ownerId],
  )).rows : [];
  return {
    participation: root ? {
      participationId: root.id,
      domainVersion: root.domain_version,
      currentRevision: root.current_revision,
      status: root.current_status,
      createdAt: iso(root.created_at),
      updatedAt: iso(root.updated_at),
      items: items.map((row) => ({
        shelfItemId: row.shelf_item_id, needKey: row.need_key,
        revision: row.revision, availabilityStatus: row.availability_status,
        createdAt: iso(row.created_at),
      })),
    } : null,
    visibility: 'private_owner_only',
    matchingActivated: false,
  };
}

async function priorCommand(client, ownerId, key, digest, itemCommand) {
  const table = itemCommand ? 'mission_supply_participation_item_commands' : 'mission_supply_participation_commands';
  const result = await client.query(
    `SELECT * FROM ${table} WHERE owner_id = $1 AND idempotency_key = $2`, [ownerId, key],
  );
  const prior = result.rows[0];
  if (prior && prior.request_sha256 !== digest) fail(409, 'idempotency_key_reused');
  return prior;
}

function commandResult(row, itemCommand) {
  return {
    participationId: row.participation_id,
    revision: row.result_revision,
    status: row.result_status,
    ...(itemCommand ? { shelfItemId: row.shelf_item_id, needKey: row.need_key } : {}),
  };
}

async function response(client, ownerId, command, itemCommand, replayed) {
  return { ...await snapshot(client, ownerId), commandResult: commandResult(command, itemCommand), replayed };
}

export async function getMissionSupplyParticipation(client, { actorId }) {
  await lockOwner(client, actorId);
  return snapshot(client, actorId);
}

export async function setMissionSupplyParticipation(client, { actorId, raw, idempotencyKey }) {
  const payload = normalizeMissionSupplyParticipation(raw);
  const key = commandKey(idempotencyKey);
  const commandType = payload.status === 'active' ? 'activate' : 'withdraw';
  const digest = crypto.createHash('sha256').update(JSON.stringify({ commandType, payload })).digest('hex');
  const owner = await lockOwner(client, actorId);
  const prior = await priorCommand(client, actorId, key, digest, false);
  if (prior) return response(client, actorId, prior, false, true);
  if (payload.status === 'active') assertCanEnable(owner);
  let root = await rootForOwner(client, actorId);
  if ((root?.current_revision ?? 0) !== payload.expectedRevision) fail(409, 'revision_conflict');
  if (!root) {
    root = (await client.query(
      `INSERT INTO mission_supply_participations (id, owner_id, domain_version)
       VALUES ($1, $2, $3) RETURNING *`,
      [`mission_supply_participation_${crypto.randomUUID()}`, actorId, missionSupplyParticipationDomainVersion],
    )).rows[0];
  }
  const next = root.current_revision + 1;
  await client.query(
    `INSERT INTO mission_supply_participation_revisions
       (participation_id, owner_id, revision, actor_id, status) VALUES ($1, $2, $3, $2, $4)`,
    [root.id, actorId, next, payload.status],
  );
  const command = (await client.query(
    `INSERT INTO mission_supply_participation_commands
       (owner_id, idempotency_key, command_type, request_sha256, participation_id, result_revision, result_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [actorId, key, commandType, digest, root.id, next, payload.status],
  )).rows[0];
  return response(client, actorId, command, false, false);
}

export async function setMissionSupplyParticipationItem(client, { actorId, shelfItemId, raw, idempotencyKey }) {
  const payload = normalizeMissionSupplyParticipationItem(raw);
  const id = itemId(shelfItemId);
  const key = commandKey(idempotencyKey);
  const commandType = payload.availabilityStatus === 'confirmed_available' ? 'confirm' : 'withdraw';
  const digest = crypto.createHash('sha256').update(JSON.stringify({ commandType, shelfItemId: id, payload })).digest('hex');
  const owner = await lockOwner(client, actorId);
  const root = await rootForOwner(client, actorId);
  await ownedItem(client, actorId, id);
  const prior = await priorCommand(client, actorId, key, digest, true);
  if (prior) return response(client, actorId, prior, true, true);
  if (!root) fail(409, 'revision_conflict');
  if (payload.availabilityStatus === 'confirmed_available') {
    assertCanEnable(owner);
    if (root.current_status !== 'active') fail(409, 'withdrawn');
  }
  if (root.current_revision !== payload.expectedParticipationRevision) fail(409, 'revision_conflict');
  const latest = (await client.query(
    `SELECT COALESCE(MAX(revision), 0)::int AS revision FROM mission_supply_participation_item_revisions
      WHERE participation_id = $1 AND owner_id = $2 AND shelf_item_id = $3 AND need_key = $4`,
    [root.id, actorId, id, payload.needKey],
  )).rows[0].revision;
  if (latest !== payload.expectedRevision) fail(409, 'revision_conflict');
  const next = latest + 1;
  await client.query(
    `INSERT INTO mission_supply_participation_item_revisions
       (participation_id, owner_id, shelf_item_id, need_key, revision, actor_id, availability_status)
     VALUES ($1, $2, $3, $4, $5, $2, $6)`,
    [root.id, actorId, id, payload.needKey, next, payload.availabilityStatus],
  );
  const command = (await client.query(
    `INSERT INTO mission_supply_participation_item_commands
       (owner_id, idempotency_key, command_type, request_sha256, participation_id,
        shelf_item_id, need_key, result_revision, result_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [actorId, key, commandType, digest, root.id, id, payload.needKey, next, payload.availabilityStatus],
  )).rows[0];
  return response(client, actorId, command, true, false);
}
