import crypto from 'node:crypto';

export const missionNeedDomainVersion = 'P2-A-2026-10-01.1';

export class MissionNeedError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code = 'invalid_mission_need_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MissionNeedError(400, code);
  }
  return { ...value };
}

function exactKeys(value, expected, code) {
  const keys = Object.keys(value).sort();
  const required = [...expected].sort();
  if (keys.length !== required.length || keys.some((key, index) => key !== required[index])) {
    throw new MissionNeedError(400, code);
  }
}

function text(value, maximum, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || candidate.length > maximum) throw new MissionNeedError(400, code);
  return candidate;
}

function idempotencyKey(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)) {
    throw new MissionNeedError(400, 'invalid_mission_need_idempotency_key');
  }
  return candidate;
}

function missionNeedId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate)) {
    throw new MissionNeedError(400, 'invalid_mission_need_id');
  }
  return candidate;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function missionNeedDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

export function normalizeMissionNeedPayload(raw) {
  const candidate = object(raw);
  exactKeys(candidate, ['needs', 'status', 'title'], 'invalid_mission_need_fields');
  const status = candidate.status;
  if (!['draft', 'planned'].includes(status)) {
    throw new MissionNeedError(400, 'invalid_mission_need_status');
  }
  if (!Array.isArray(candidate.needs) || candidate.needs.length < 1 || candidate.needs.length > 50) {
    throw new MissionNeedError(400, 'invalid_mission_need_items');
  }
  const needs = candidate.needs.map((rawNeed) => {
    const need = object(rawNeed, 'invalid_mission_need_item');
    exactKeys(need, ['needKey', 'necessity', 'quantity'], 'invalid_mission_need_item_fields');
    const needKey = text(need.needKey, 80, 'invalid_mission_need_key');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$/u.test(needKey)) {
      throw new MissionNeedError(400, 'invalid_mission_need_key');
    }
    if (!['required', 'optional'].includes(need.necessity)) {
      throw new MissionNeedError(400, 'invalid_mission_need_necessity');
    }
    if (!Number.isSafeInteger(need.quantity) || need.quantity < 1 || need.quantity > 100) {
      throw new MissionNeedError(400, 'invalid_mission_need_quantity');
    }
    return { needKey, necessity: need.necessity, quantity: need.quantity };
  });
  if (new Set(needs.map((need) => need.needKey)).size !== needs.length) {
    throw new MissionNeedError(400, 'duplicate_mission_need_key');
  }
  return {
    title: text(candidate.title, 160, 'invalid_mission_need_title'),
    status,
    needs,
  };
}

function expectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MissionNeedError(400, 'invalid_mission_need_expected_revision');
  }
  return value;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function shape(row) {
  return Object.freeze({
    missionNeedId: row.id ?? row.mission_need_id,
    domainVersion: row.domain_version,
    revision: Number(row.revision ?? row.current_revision),
    status: row.status,
    payload: row.payload,
    payloadDigest: row.payload_sha256,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at ?? row.created_at),
    bindingStatus: 'non_binding',
    reservationCreated: false,
    bookingCreated: false,
    contractCreated: false,
    paymentCreated: false,
    externalGenerativeAiUsed: false,
    automaticPhotoAnalysisUsed: false,
  });
}

export function assertMissionNeedTechnicalAccess(configuration) {
  if (configuration?.planner?.enabled !== true
      || configuration.planner.publicReleaseAllowed !== false
      || configuration.planner.externalGenerativeAiAllowed !== false
      || configuration.planner.inventoryResolutionAllowed !== false) {
    throw new MissionNeedError(404, 'mission_need_not_enabled');
  }
  return true;
}

async function lockCommand(client, ownerId, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `mission_need:${ownerId}:${key}`,
  ]);
}

async function replayCommand(client, { ownerId, key, commandType, requestSha256 }) {
  const existing = await client.query(
    `SELECT command_type, request_sha256, mission_need_id, result_revision
       FROM mission_need_commands
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, key],
  );
  const command = existing.rows[0];
  if (!command) return null;
  if (command.command_type !== commandType || command.request_sha256 !== requestSha256) {
    throw new MissionNeedError(409, 'mission_need_idempotency_key_reused');
  }
  const revision = await client.query(
    `SELECT need.id, need.domain_version, revision.revision, revision.status, revision.payload,
            revision.payload_sha256, need.created_at, revision.created_at AS updated_at
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id AND revision.revision = $3
      WHERE need.owner_id = $1 AND need.id = $2`,
    [ownerId, command.mission_need_id, command.result_revision],
  );
  if (revision.rowCount !== 1) throw new MissionNeedError(500, 'mission_need_replay_state_invalid');
  return { missionNeed: shape(revision.rows[0]), replayed: true };
}

async function insertCommand(client, { ownerId, key, commandType, requestSha256, id, revision }) {
  await client.query(
    `INSERT INTO mission_need_commands (
       owner_id, idempotency_key, command_type, request_sha256,
       mission_need_id, result_revision
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [ownerId, key, commandType, requestSha256, id, revision],
  );
}

async function revisionByNumber(client, ownerId, id, revision) {
  const result = await client.query(
    `SELECT need.id, need.domain_version, revision.revision, revision.status, revision.payload,
            revision.payload_sha256, need.created_at, revision.created_at AS updated_at
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id AND revision.revision = $3
      WHERE need.owner_id = $1 AND need.id = $2`,
    [ownerId, id, revision],
  );
  return result.rows[0] ?? null;
}

export async function createMissionNeed(client, { actorId, raw, idempotencyKey: rawKey }) {
  const ownerId = text(actorId, 160, 'invalid_mission_need_actor');
  const key = idempotencyKey(rawKey);
  const payload = normalizeMissionNeedPayload(raw);
  const requestSha256 = missionNeedDigest({ command: 'create', payload });
  await lockCommand(client, ownerId, key);
  const replay = await replayCommand(client, {
    ownerId, key, commandType: 'create', requestSha256,
  });
  if (replay) return replay;

  const id = `mission_need_${crypto.randomUUID()}`;
  const payloadSha256 = missionNeedDigest(payload);
  await client.query(
    `INSERT INTO mission_needs (id, owner_id, domain_version, status)
     VALUES ($1, $2, $3, $4)`,
    [id, ownerId, missionNeedDomainVersion, payload.status],
  );
  await client.query(
    `INSERT INTO mission_need_revisions (
       mission_need_id, revision, status, payload, payload_sha256
     ) VALUES ($1, 1, $2, $3::jsonb, $4)`,
    [id, payload.status, JSON.stringify(payload), payloadSha256],
  );
  await insertCommand(client, {
    ownerId, key, commandType: 'create', requestSha256, id, revision: 1,
  });
  const row = await revisionByNumber(client, ownerId, id, 1);
  return { missionNeed: shape(row), replayed: false };
}

export async function correctMissionNeed(client, {
  actorId, missionNeedId: rawId, raw, idempotencyKey: rawKey,
}) {
  const ownerId = text(actorId, 160, 'invalid_mission_need_actor');
  const id = missionNeedId(rawId);
  const key = idempotencyKey(rawKey);
  const candidate = object(raw);
  exactKeys(candidate, ['expectedRevision', 'needs', 'status', 'title'], 'invalid_mission_need_correction_fields');
  const revision = expectedRevision(candidate.expectedRevision);
  const payload = normalizeMissionNeedPayload({
    title: candidate.title,
    status: candidate.status,
    needs: candidate.needs,
  });
  const requestSha256 = missionNeedDigest({
    command: 'correct', missionNeedId: id, expectedRevision: revision, payload,
  });
  await lockCommand(client, ownerId, key);
  const replay = await replayCommand(client, {
    ownerId, key, commandType: 'correct', requestSha256,
  });
  if (replay) return replay;

  const current = await client.query(
    `SELECT current_revision FROM mission_needs
      WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
    [id, ownerId],
  );
  if (current.rowCount !== 1) throw new MissionNeedError(404, 'mission_need_not_found');
  const actualRevision = Number(current.rows[0].current_revision);
  if (actualRevision !== revision) {
    throw new MissionNeedError(409, 'mission_need_revision_conflict', {
      expectedRevision: revision,
      actualRevision,
    });
  }
  const nextRevision = revision + 1;
  const payloadSha256 = missionNeedDigest(payload);
  await client.query(
    `INSERT INTO mission_need_revisions (
       mission_need_id, revision, status, payload, payload_sha256
     ) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, nextRevision, payload.status, JSON.stringify(payload), payloadSha256],
  );
  await insertCommand(client, {
    ownerId, key, commandType: 'correct', requestSha256, id, revision: nextRevision,
  });
  const row = await revisionByNumber(client, ownerId, id, nextRevision);
  return { missionNeed: shape(row), replayed: false };
}

export async function getMissionNeed(client, { actorId, missionNeedId: rawId }) {
  const ownerId = text(actorId, 160, 'invalid_mission_need_actor');
  const id = missionNeedId(rawId);
  const current = await client.query(
    `SELECT need.id, need.domain_version, need.current_revision, revision.revision, revision.status,
            revision.payload, revision.payload_sha256, need.created_at, need.updated_at
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id
        AND revision.revision = need.current_revision
      WHERE need.owner_id = $1 AND need.id = $2`,
    [ownerId, id],
  );
  if (current.rowCount !== 1) throw new MissionNeedError(404, 'mission_need_not_found');
  const revisions = await client.query(
    `SELECT revision, status, payload, payload_sha256, created_at
       FROM mission_need_revisions
      WHERE mission_need_id = $1 ORDER BY revision`,
    [id],
  );
  return {
    missionNeed: {
      ...shape(current.rows[0]),
      revisions: revisions.rows.map((row) => Object.freeze({
        revision: Number(row.revision),
        status: row.status,
        payload: row.payload,
        payloadDigest: row.payload_sha256,
        createdAt: iso(row.created_at),
      })),
    },
  };
}

export async function listMissionNeeds(client, { actorId }) {
  const ownerId = text(actorId, 160, 'invalid_mission_need_actor');
  const result = await client.query(
    `SELECT need.id, need.domain_version, need.current_revision, revision.revision, revision.status,
            revision.payload, revision.payload_sha256, need.created_at, need.updated_at
       FROM mission_needs AS need
       JOIN mission_need_revisions AS revision
         ON revision.mission_need_id = need.id
        AND revision.revision = need.current_revision
      WHERE need.owner_id = $1
      ORDER BY need.updated_at DESC, need.id`,
    [ownerId],
  );
  return { missionNeeds: result.rows.map(shape) };
}
