import crypto from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const storageNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(?:full|thumb)[.]webp$/u;

export function privateShelfStoragePath(uploadDir, storageName) {
  if (!storageNamePattern.test(storageName)) return null;
  const root = path.resolve(uploadDir, 'private-shelf');
  const candidate = path.resolve(root, storageName);
  return path.dirname(candidate) === root ? candidate : null;
}

export async function openPrivateShelfMediaFile({ uploadDir, storageName, expectedBytes }) {
  const candidate = privateShelfStoragePath(uploadDir, storageName);
  if (!candidate) throw Object.assign(new Error('private_shelf_media_unavailable'), { code: 'private_shelf_media_unavailable' });
  let handle;
  try {
    handle = await fs.open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o027) !== 0
        || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0
        || metadata.size !== expectedBytes) {
      throw Object.assign(new Error('private_shelf_media_unavailable'), { code: 'private_shelf_media_unavailable' });
    }
    return handle;
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }
}

export async function readPrivateShelfMediaFile(options) {
  const handle = await openPrivateShelfMediaFile(options);
  try {
    const contents = await handle.readFile();
    if (!/^[0-9a-f]{64}$/u.test(options.expectedSha256 ?? '')) {
      throw Object.assign(new Error('private_shelf_media_unavailable'), { code: 'private_shelf_media_unavailable' });
    }
    const expected = Buffer.from(options.expectedSha256, 'hex');
    const actual = crypto.createHash('sha256').update(contents).digest();
    if (!crypto.timingSafeEqual(actual, expected)) {
      throw Object.assign(new Error('private_shelf_media_unavailable'), { code: 'private_shelf_media_unavailable' });
    }
    return contents;
  } finally {
    await handle.close();
  }
}

export async function enqueuePrivateShelfMediaCleanup(client, storageNames, { status = 'pending' } = {}) {
  if (!['pending', 'reserved'].includes(status)) throw new Error('private_shelf_cleanup_status_invalid');
  const ids = [];
  for (const storageName of [...new Set(storageNames)]) {
    if (!storageNamePattern.test(storageName)) throw new Error('private_shelf_storage_name_invalid');
    const result = await client.query(
      `INSERT INTO private_shelf_media_cleanup_outbox (id, storage_name, status)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (storage_name) DO UPDATE
         SET status = EXCLUDED.status, last_error_code = NULL, updated_at = now()
       RETURNING id`,
      [crypto.randomUUID(), storageName, status],
    );
    ids.push(result.rows[0].id);
  }
  return ids;
}

export async function activatePrivateShelfMediaCleanup(client, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const result = await client.query(
    `UPDATE private_shelf_media_cleanup_outbox
        SET status = 'pending', updated_at = now()
      WHERE id = ANY($1::uuid[]) AND status = 'reserved'`,
    [ids],
  );
  if (result.rowCount !== ids.length) throw new Error('private_shelf_cleanup_reservation_invalid');
}

export async function clearPrivateShelfMediaCleanup(client, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  await client.query(
    'DELETE FROM private_shelf_media_cleanup_outbox WHERE id = ANY($1::uuid[])',
    [ids],
  );
}

async function processCleanupRows({ client, uploadDir, selected, unlink }) {
  const failures = [];
  for (const row of selected.rows) {
    const candidate = privateShelfStoragePath(uploadDir, row.storage_name);
    try {
      if (!candidate) throw new Error('private_shelf_storage_name_invalid');
      await unlink(candidate);
      await client.query('DELETE FROM private_shelf_media_cleanup_outbox WHERE id = $1::uuid', [row.id]);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        await client.query('DELETE FROM private_shelf_media_cleanup_outbox WHERE id = $1::uuid', [row.id]);
        continue;
      }
      const code = candidate ? 'unlink_failed' : 'invalid_storage_name';
      await client.query(
        `UPDATE private_shelf_media_cleanup_outbox
            SET status = 'retry', attempts = attempts + 1,
                last_error_code = $2, updated_at = now()
          WHERE id = $1::uuid`,
        [row.id, code],
      );
      failures.push({ id: row.id, code });
    }
  }
  return { attempted: selected.rowCount, failures };
}

export async function drainPrivateShelfMediaCleanup({ client, uploadDir, ids, unlink = fs.unlink }) {
  if (!Array.isArray(ids) || ids.length === 0) return { attempted: 0, failures: [] };
  const selected = await client.query(
    `SELECT id, storage_name
       FROM private_shelf_media_cleanup_outbox
      WHERE id = ANY($1::uuid[]) AND status IN ('pending', 'retry')
      ORDER BY created_at, id`,
    [ids],
  );
  return processCleanupRows({ client, uploadDir, selected, unlink });
}

export async function attemptPrivateShelfMediaCleanup(options) {
  try {
    return await drainPrivateShelfMediaCleanup(options);
  } catch {
    return { attempted: 0, failures: [{ code: 'cleanup_attempt_failed' }] };
  }
}

export async function retryPrivateShelfMediaCleanup({ client, uploadDir, unlink = fs.unlink }) {
  const selected = await client.query(
    `SELECT id, storage_name
       FROM private_shelf_media_cleanup_outbox
      WHERE status IN ('pending', 'retry')
      ORDER BY updated_at, created_at, id
      LIMIT 100`,
  );
  return processCleanupRows({ client, uploadDir, selected, unlink });
}
