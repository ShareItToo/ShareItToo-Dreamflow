import crypto from 'node:crypto';

import { enqueuePrivateShelfMediaCleanup } from './private_shelf_media_files.js';

export const privateShelfDomainVersion = 'P3-A-2026-10-01.1';

export class PrivateShelfError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function text(value, maximum, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || candidate.length > maximum) throw new PrivateShelfError(400, code);
  return candidate;
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrivateShelfError(400, code);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new PrivateShelfError(400, code);
  }
}

function itemId(value, code = 'private_shelf_item_not_found') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate)) {
    throw new PrivateShelfError(404, code);
  }
  return candidate;
}

function mediaId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate)) {
    throw new PrivateShelfError(404, 'private_shelf_media_not_found');
  }
  return candidate;
}

function key(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)) {
    throw new PrivateShelfError(400, 'invalid_private_shelf_idempotency_key');
  }
  return candidate;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((name) => [name, stable(value[name])]));
}

export function privateShelfDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

export function normalizePrivateShelfItem(raw) {
  exactKeys(raw, ['categoryKey', 'condition', 'title'], 'invalid_private_shelf_item_fields');
  const categoryKey = text(raw.categoryKey, 80, 'invalid_private_shelf_category');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$/u.test(categoryKey)) {
    throw new PrivateShelfError(400, 'invalid_private_shelf_category');
  }
  const condition = text(raw.condition, 20, 'invalid_private_shelf_condition');
  if (!['new', 'like-new', 'good', 'acceptable', 'worn', 'used'].includes(condition)) {
    throw new PrivateShelfError(400, 'invalid_private_shelf_condition');
  }
  return Object.freeze({
    title: text(raw.title, 160, 'invalid_private_shelf_title'),
    categoryKey,
    condition,
  });
}

export function assertPrivateShelfTechnicalAccess(configuration) {
  if (configuration?.planner?.enabled !== true
      || configuration.planner.publicReleaseAllowed !== false
      || configuration.planner.externalGenerativeAiAllowed !== false
      || configuration.planner.inventoryResolutionAllowed !== false) {
    throw new PrivateShelfError(404, 'private_shelf_not_enabled');
  }
  return true;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function shapeMedia(row, item) {
  return Object.freeze({
    mediaId: row.id,
    mimeType: row.mime_type,
    width: Number(row.image_width),
    height: Number(row.image_height),
    fullUrl: `/v1/private-shelf/${item}/media/${row.id}/full`,
    thumbnailUrl: `/v1/private-shelf/${item}/media/${row.id}/thumbnail`,
    createdAt: iso(row.created_at),
  });
}

function shapeItem(row, media = []) {
  return Object.freeze({
    shelfItemId: row.id,
    domainVersion: row.domain_version,
    title: row.title,
    categoryKey: row.category_key,
    condition: row.condition,
    media: media.map((entry) => shapeMedia(entry, row.id)),
    visibility: 'private_owner_only',
    publicListingCreated: false,
    reservationCreated: false,
    bookingCreated: false,
    paymentCreated: false,
    externalGenerativeAiUsed: false,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

async function mediaFor(client, ownerId, id) {
  const result = await client.query(
    `SELECT id, mime_type, image_width, image_height, created_at
       FROM private_shelf_media
      WHERE owner_id = $1 AND shelf_item_id = $2
      ORDER BY created_at, id`,
    [ownerId, id],
  );
  return result.rows;
}

async function readItem(client, ownerId, id) {
  const result = await client.query(
    `SELECT id, domain_version, title, category_key, condition, created_at, updated_at
       FROM private_shelf_items
      WHERE owner_id = $1 AND id = $2`,
    [ownerId, id],
  );
  if (result.rowCount !== 1) throw new PrivateShelfError(404, 'private_shelf_item_not_found');
  return shapeItem(result.rows[0], await mediaFor(client, ownerId, id));
}

export async function createPrivateShelfItem(client, { actorId, raw, idempotencyKey }) {
  const ownerId = text(actorId, 160, 'invalid_private_shelf_actor');
  const commandKey = key(idempotencyKey);
  const payload = normalizePrivateShelfItem(raw);
  const requestSha256 = privateShelfDigest({ command: 'create', payload });
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `private_shelf:${ownerId}:${commandKey}`,
  ]);
  const prior = await client.query(
    `SELECT request_sha256, shelf_item_id
       FROM private_shelf_item_commands
      WHERE owner_id = $1 AND idempotency_key = $2`,
    [ownerId, commandKey],
  );
  if (prior.rowCount) {
    if (prior.rows[0].request_sha256 !== requestSha256) {
      throw new PrivateShelfError(409, 'private_shelf_idempotency_key_reused');
    }
    return { shelfItem: await readItem(client, ownerId, prior.rows[0].shelf_item_id), replayed: true };
  }
  const id = `shelf_item_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO private_shelf_items (
       id, owner_id, domain_version, title, category_key, condition
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, ownerId, privateShelfDomainVersion, payload.title, payload.categoryKey, payload.condition],
  );
  await client.query(
    `INSERT INTO private_shelf_item_commands (
       owner_id, idempotency_key, request_sha256, shelf_item_id
     ) VALUES ($1, $2, $3, $4)`,
    [ownerId, commandKey, requestSha256, id],
  );
  return { shelfItem: await readItem(client, ownerId, id), replayed: false };
}

export async function getPrivateShelfItem(client, { actorId, shelfItemId }) {
  const ownerId = text(actorId, 160, 'invalid_private_shelf_actor');
  return { shelfItem: await readItem(client, ownerId, itemId(shelfItemId)) };
}

export async function listPrivateShelfItems(client, { actorId }) {
  const ownerId = text(actorId, 160, 'invalid_private_shelf_actor');
  const result = await client.query(
    `SELECT id, domain_version, title, category_key, condition, created_at, updated_at
       FROM private_shelf_items
      WHERE owner_id = $1
      ORDER BY updated_at DESC, id`,
    [ownerId],
  );
  const items = [];
  for (const row of result.rows) items.push(shapeItem(row, await mediaFor(client, ownerId, row.id)));
  return { shelfItems: items };
}

export async function deletePrivateShelfItem(client, { actorId, shelfItemId }) {
  const ownerId = text(actorId, 160, 'invalid_private_shelf_actor');
  const id = itemId(shelfItemId);
  const locked = await client.query(
    `SELECT id FROM private_shelf_items
      WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
    [ownerId, id],
  );
  if (locked.rowCount !== 1) throw new PrivateShelfError(404, 'private_shelf_item_not_found');
  const media = await client.query(
    `SELECT storage_name, thumbnail_storage_name
       FROM private_shelf_media
      WHERE owner_id = $1 AND shelf_item_id = $2`,
    [ownerId, id],
  );
  const cleanupIds = await enqueuePrivateShelfMediaCleanup(client, media.rows.flatMap((row) => [
    row.storage_name, row.thumbnail_storage_name,
  ]));
  await client.query('DELETE FROM private_shelf_items WHERE owner_id = $1 AND id = $2', [ownerId, id]);
  return { shelfItemId: id, cleanupIds };
}

export async function addPrivateShelfMedia(client, { actorId, shelfItemId, media }) {
  const ownerId = text(actorId, 160, 'invalid_private_shelf_actor');
  const id = itemId(shelfItemId);
  const owner = await client.query(
    'SELECT id FROM private_shelf_items WHERE owner_id = $1 AND id = $2 FOR UPDATE',
    [ownerId, id],
  );
  if (owner.rowCount !== 1) throw new PrivateShelfError(404, 'private_shelf_item_not_found');
  const result = await client.query(
    `INSERT INTO private_shelf_media (
       id, shelf_item_id, owner_id, storage_name, thumbnail_storage_name,
       mime_type, byte_size, thumbnail_byte_size, image_width, image_height, content_sha256
       , thumbnail_content_sha256
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, mime_type, image_width, image_height, created_at`,
    [media.id, id, ownerId, media.storageName, media.thumbnailStorageName, media.mimeType,
      media.byteSize, media.thumbnailByteSize, media.width, media.height,
      media.contentSha256, media.thumbnailContentSha256],
  );
  return { media: shapeMedia(result.rows[0], id) };
}

export async function getPrivateShelfMedia(client, { actorId, shelfItemId, shelfMediaId }) {
  const ownerId = text(actorId, 160, 'invalid_private_shelf_actor');
  const id = itemId(shelfItemId, 'private_shelf_media_not_found');
  const photoId = mediaId(shelfMediaId);
  const result = await client.query(
    `SELECT media.id, media.storage_name, media.thumbnail_storage_name,
            media.mime_type, media.byte_size, media.thumbnail_byte_size,
            media.content_sha256, media.thumbnail_content_sha256
       FROM private_shelf_media AS media
       JOIN private_shelf_items AS item
         ON item.id = media.shelf_item_id AND item.owner_id = media.owner_id
      WHERE media.owner_id = $1 AND media.shelf_item_id = $2 AND media.id = $3::uuid`,
    [ownerId, id, photoId],
  );
  if (result.rowCount !== 1) throw new PrivateShelfError(404, 'private_shelf_media_not_found');
  return result.rows[0];
}
