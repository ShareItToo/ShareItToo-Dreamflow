import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import pg from 'pg';
import sharp from 'sharp';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('private shelf PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P3-A private shelf is durable, owner-only, exportable and file-clean', async () => {
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-private-shelf-'));
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory',
      PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'false',
      UPLOAD_DIR: uploadDir,
    });
    const { Pool } = pg;
    const setupPool = new Pool({ connectionString: databaseUrl, max: 4 });
    let applicationPool;
    let server;
    try {
      const schema = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
      await setupPool.query(schema);
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setupPool);
      await runMigrations(setupPool);
      const terminal = await setupPool.query('SELECT name FROM schema_migrations ORDER BY name');
      assert.equal(terminal.rows.at(-1).name, '102_mission_inventory_resolutions.up.sql');

      const ownerId = 'private-shelf-owner';
      const otherId = 'private-shelf-other';
      const deletionId = 'private-shelf-delete';
      const sessions = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status, email_verified_at)
         VALUES
           ($1, 'shelf-owner@example.invalid', '{"displayName":"Shelf Owner"}'::jsonb, 'user', 'active', now()),
           ($2, 'shelf-other@example.invalid', '{"displayName":"Shelf Other"}'::jsonb, 'user', 'active', now()),
           ($3, 'shelf-delete@example.invalid', '{"displayName":"Shelf Delete"}'::jsonb, 'user', 'active', now())`,
        [ownerId, otherId, deletionId],
      );
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, $4, 'Shelf owner'), ($2, $5, 'Shelf other'), ($3, $6, 'Shelf delete')`,
        [...sessions, ownerId, otherId, deletionId],
      );
      const cart = await setupPool.query(
        'INSERT INTO rental_carts (user_id) VALUES ($1) RETURNING id',
        [ownerId],
      );
      await setupPool.query(
        `INSERT INTO rental_cart_projects (cart_id, client_project_id, title, answers, sort_order)
         VALUES ($1, 'shelf_legacy_project', 'Unveränderter Altbestand', '{"legacy":true}'::jsonb, 3)`,
        [cart.rows[0].id],
      );
      const legacyListingId = 'private-shelf-legacy-listing';
      const legacyUploadName = `${crypto.randomUUID()}-full.webp`;
      await setupPool.query(
        `INSERT INTO listings (
           id, owner_id, payload, is_active, catalog_version, catalog_revision,
           status, currency, price_per_day_minor, title, description,
           category_id, subcategory, condition, location_text, city, country,
           latitude, longitude, min_days, max_days, protection_model
         ) VALUES (
           $1, $2, '{"legacy":true,"photos":[]}'::jsonb, false, 0, 0,
           'draft', 'EUR', 100, 'Legacy listing', 'Legacy listing unchanged',
           'legacy', 'Sonstiges', 'good', 'Heilbronn', 'Heilbronn', 'Deutschland',
           49.14, 9.22, 1, 30, 'none'
         )`,
        [legacyListingId, ownerId],
      );
      await setupPool.query(
        `INSERT INTO uploads (
           owner_id, storage_name, mime_type, byte_size, purpose, visibility,
           listing_id, thumbnail_storage_name, thumbnail_mime_type,
           thumbnail_byte_size, image_width, image_height, content_sha256,
           content_scan_status
         ) VALUES (
           $1, $2, 'image/webp', 1, 'listing_image', 'private', $3,
           $4, 'image/webp', 1, 1, 1, $5, 'passed'
         )`,
        [ownerId, legacyUploadName, legacyListingId,
          legacyUploadName.replace('-full.webp', '-thumb.webp'), 'b'.repeat(64)],
      );
      const legacySnapshot = async () => (await setupPool.query(
        `SELECT jsonb_build_object(
           'cart', (SELECT to_jsonb(c) FROM rental_carts c WHERE c.id = $1),
           'projects', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM rental_cart_projects p WHERE p.cart_id = $1),
           'listings', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) FROM listings l),
           'uploads', (SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb) FROM uploads u)
         ) AS value`,
        [cart.rows[0].id],
      )).rows[0].value;
      const legacyBefore = await legacySnapshot();
      const effects = async () => (await setupPool.query(
        `SELECT (SELECT count(*)::int FROM bookings) AS bookings,
                (SELECT count(*)::int FROM rental_requests) AS requests,
                (SELECT count(*)::int FROM payments) AS payments,
                (SELECT count(*)::int FROM platform_contracts) AS contracts`,
      )).rows[0];
      const effectsBefore = await effects();

      const {
        createApp, eraseAccount,
      } = await import('../src/app.js');
      const {
        activatePrivateShelfMediaCleanup,
        attemptPrivateShelfMediaCleanup,
        drainPrivateShelfMediaCleanup,
        enqueuePrivateShelfMediaCleanup,
        retryPrivateShelfMediaCleanup,
      } = await import('../src/private_shelf_media_files.js');
      const { deletePrivateShelfItem } = await import('../src/private_shelf_workflow.js');
      const { inTransaction, pool } = await import('../src/db.js');
      const { buildAccountExport } = await import('../src/privacy_export.js');
      const { signAccessToken } = await import('../src/security.js');
      applicationPool = pool;
      const tokenFor = (id, sessionId) => signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId },
      );
      const ownerToken = tokenFor(ownerId, sessions[0]);
      const otherToken = tokenFor(otherId, sessions[1]);
      const deletionToken = tokenFor(deletionId, sessions[2]);
      const auth = (token) => ({ Authorization: `Bearer ${token}` });
      const json = (token, idempotencyKey) => ({
        ...auth(token),
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      });
      const start = async () => {
        server = http.createServer(createApp());
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${server.address().port}`;
      };
      const stop = async () => {
        if (!server) return;
        await new Promise((resolve, reject) => server.close((error) => (
          error ? reject(error) : resolve()
        )));
        server = null;
      };
      let baseUrl = await start();
      const payload = { title: 'Private Bohrmaschine', categoryKey: 'tools.drills', condition: 'good' };
      const createdResponse = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(ownerToken, 'private-shelf-create-001'), body: JSON.stringify(payload),
      });
      assert.equal(createdResponse.status, 201);
      assert.match(createdResponse.headers.get('cache-control'), /no-store/u);
      const created = await createdResponse.json();
      const shelfItemId = created.shelfItem.shelfItemId;
      assert.match(shelfItemId, /^shelf_item_[0-9a-f-]{36}$/u);
      assert.deepEqual(created.shelfItem, {
        shelfItemId,
        domainVersion: 'P3-A-2026-10-01.1',
        ...payload,
        media: [],
        visibility: 'private_owner_only',
        publicListingCreated: false,
        reservationCreated: false,
        bookingCreated: false,
        paymentCreated: false,
        externalGenerativeAiUsed: false,
        createdAt: created.shelfItem.createdAt,
        updatedAt: created.shelfItem.updatedAt,
      });
      assert.equal(Object.hasOwn(created.shelfItem, 'address'), false);

      const replay = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(ownerToken, 'private-shelf-create-001'), body: JSON.stringify(payload),
      });
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).shelfItem.shelfItemId, shelfItemId);
      const collision = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(ownerToken, 'private-shelf-create-001'),
        body: JSON.stringify({ ...payload, title: 'Andere Sache' }),
      });
      assert.equal(collision.status, 409);
      assert.equal((await collision.json()).error, 'private_shelf_idempotency_key_reused');

      const otherList = await fetch(`${baseUrl}/v1/private-shelf`, { headers: auth(otherToken) });
      assert.equal(otherList.status, 200);
      assert.deepEqual((await otherList.json()).shelfItems, []);
      const foreignRead = await fetch(`${baseUrl}/v1/private-shelf/${shelfItemId}`, { headers: auth(otherToken) });
      assert.equal(foreignRead.status, 404);
      assert.equal((await foreignRead.json()).error, 'private_shelf_item_not_found');

      const image = await sharp({
        create: { width: 64, height: 64, channels: 4, background: '#2563eb' },
      }).png().toBuffer();
      const form = new FormData();
      form.append('file', new Blob([image], { type: 'image/png' }), 'shelf.png');
      const mediaResponse = await fetch(`${baseUrl}/v1/private-shelf/${shelfItemId}/media`, {
        method: 'POST', headers: auth(ownerToken), body: form,
      });
      assert.equal(mediaResponse.status, 201);
      const media = (await mediaResponse.json()).media;
      assert.match(media.mediaId, /^[0-9a-f-]{36}$/u);
      assert.equal(media.mimeType, 'image/webp');

      const beforeForeignUpload = (await fs.readdir(path.join(uploadDir, 'private-shelf'))).sort();
      const foreignForm = new FormData();
      foreignForm.append('file', new Blob([image], { type: 'image/png' }), 'foreign.png');
      const foreignUpload = await fetch(`${baseUrl}/v1/private-shelf/${shelfItemId}/media`, {
        method: 'POST', headers: auth(otherToken), body: foreignForm,
      });
      assert.equal(foreignUpload.status, 404);
      assert.equal((await foreignUpload.json()).error, 'private_shelf_item_not_found');
      assert.deepEqual((await fs.readdir(path.join(uploadDir, 'private-shelf'))).sort(), beforeForeignUpload);

      const ownerMedia = await fetch(`${baseUrl}${media.fullUrl}`, { headers: auth(ownerToken) });
      assert.equal(ownerMedia.status, 200);
      assert.equal(ownerMedia.headers.get('cache-control'), 'private, no-store');
      assert.equal(ownerMedia.headers.get('content-type'), 'image/webp');
      const foreignMedia = await fetch(`${baseUrl}${media.fullUrl}`, { headers: auth(otherToken) });
      assert.equal(foreignMedia.status, 404);
      assert.equal((await foreignMedia.json()).error, 'private_shelf_media_not_found');
      const missingMedia = await fetch(
        `${baseUrl}/v1/private-shelf/${shelfItemId}/media/${crypto.randomUUID()}/full`,
        { headers: auth(ownerToken) },
      );
      assert.equal(missingMedia.status, 404);
      assert.equal((await missingMedia.json()).error, 'private_shelf_media_not_found');

      const storedMedia = await setupPool.query(
        `SELECT storage_name, thumbnail_storage_name
           FROM private_shelf_media WHERE id = $1::uuid`, [media.mediaId],
      );
      const storageNames = Object.values(storedMedia.rows[0]);
      for (const storageName of storageNames) {
        assert.equal((await fs.stat(path.join(uploadDir, 'private-shelf', storageName))).isFile(), true);
        const publicAttempt = await fetch(`${baseUrl}/v1/uploads/${storageName}`);
        assert.equal(publicAttempt.status, 404);
      }
      const fullPath = path.join(uploadDir, 'private-shelf', storedMedia.rows[0].storage_name);
      const approvedFull = await fs.readFile(fullPath);
      await fs.writeFile(fullPath, Buffer.alloc(approvedFull.length, 0x5a), { mode: 0o640 });
      const swappedMedia = await fetch(`${baseUrl}${media.fullUrl}`, { headers: auth(ownerToken) });
      assert.equal(swappedMedia.status, 404);
      assert.equal((await swappedMedia.json()).error, 'private_shelf_media_not_found');
      await fs.writeFile(fullPath, approvedFull, { mode: 0o640 });
      const approvedPath = `${fullPath}.approved`;
      await fs.rename(fullPath, approvedPath);
      await fs.symlink(approvedPath, fullPath);
      const symlinkMedia = await fetch(`${baseUrl}${media.fullUrl}`, { headers: auth(ownerToken) });
      assert.equal(symlinkMedia.status, 404);
      assert.equal((await symlinkMedia.json()).error, 'private_shelf_media_not_found');
      await fs.unlink(fullPath);
      await fs.rename(approvedPath, fullPath);
      const catalog = await fetch(`${baseUrl}/v1/listings?sort=newest&limit=100&offset=0`);
      assert.equal(catalog.status, 200);
      assert.equal(JSON.stringify(await catalog.json()).includes(payload.title), false);

      await stop();
      baseUrl = await start();
      const restartRead = await fetch(`${baseUrl}/v1/private-shelf/${shelfItemId}`, { headers: auth(ownerToken) });
      assert.equal(restartRead.status, 200);
      assert.equal((await restartRead.json()).shelfItem.media[0].mediaId, media.mediaId);

      await assert.rejects(
        setupPool.query(
          `INSERT INTO private_shelf_media (
             id, shelf_item_id, owner_id, storage_name, thumbnail_storage_name,
             mime_type, byte_size, thumbnail_byte_size, image_width, image_height,
             content_sha256, thumbnail_content_sha256
           ) VALUES ($1::uuid, $2, $3, $4, $5, 'image/webp', 1, 1, 1, 1, $6, $6)`,
          [crypto.randomUUID(), shelfItemId, otherId, `${crypto.randomUUID()}-full.webp`,
            `${crypto.randomUUID()}-thumb.webp`, 'a'.repeat(64)],
        ),
        /private_shelf_media_shelf_item_id_owner_id_fkey/u,
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO private_shelf_item_commands (
             owner_id, idempotency_key, request_sha256, shelf_item_id
           ) VALUES ($1, 'foreign-shelf-command', $2, $3)`,
          [otherId, 'c'.repeat(64), shelfItemId],
        ),
        /private_shelf_item_commands_shelf_item_id_owner_id_fkey/u,
      );

      const exported = await buildAccountExport(setupPool, ownerId);
      assert.equal(exported.data.marketplace.privateShelf.items.length, 1);
      assert.equal(exported.data.marketplace.privateShelf.media.length, 1);
      assert.equal(exported.data.marketplace.privateShelf.commands.length, 1);
      assert.equal(exported.data.marketplace.privateShelf.visibility, 'private_owner_only');
      assert.equal(exported.data.marketplace.privateShelf.mediaBinaryIncluded, false);
      const exportedMedia = exported.data.marketplace.privateShelf.media[0];
      assert.deepEqual(Object.keys(exportedMedia).sort(), [
        'binaryContentIncluded', 'byteSize', 'contentDigest', 'createdAt',
        'downloadRequiresOwnerAuthentication', 'fullDownloadPath', 'height', 'mediaId',
        'mimeType', 'shelfItemId', 'thumbnailByteSize', 'thumbnailContentDigest',
        'thumbnailDownloadPath', 'width',
      ].sort());
      assert.match(exportedMedia.mediaId, /^ref_[0-9]{6}$/u);
      assert.match(exportedMedia.shelfItemId, /^ref_[0-9]{6}$/u);
      assert.equal(exportedMedia.mimeType, 'image/webp');
      assert.equal(exportedMedia.byteSize, approvedFull.length);
      assert.equal(exportedMedia.width, 64);
      assert.equal(exportedMedia.height, 64);
      assert.equal(exportedMedia.contentDigest, crypto.createHash('sha256').update(approvedFull).digest('hex'));
      assert.match(exportedMedia.thumbnailContentDigest, /^[0-9a-f]{64}$/u);
      assert.match(exportedMedia.createdAt, /^20[0-9]{2}-/u);
      assert.equal(exportedMedia.fullDownloadPath, media.fullUrl);
      assert.equal(exportedMedia.thumbnailDownloadPath, media.thumbnailUrl);
      assert.equal(exportedMedia.downloadRequiresOwnerAuthentication, true);
      assert.equal(exportedMedia.binaryContentIncluded, false);
      const portable = await buildAccountExport(setupPool, ownerId, { purpose: 'data_portability' });
      assert.equal(portable.data.marketplace.privateShelf.items.length, 1);
      assert.equal((await buildAccountExport(setupPool, otherId)).data.marketplace.privateShelf.items.length, 0);

      const foreignDelete = await fetch(`${baseUrl}/v1/private-shelf/${shelfItemId}`, {
        method: 'DELETE', headers: auth(otherToken),
      });
      assert.equal(foreignDelete.status, 404);
      const ownerDelete = await fetch(`${baseUrl}/v1/private-shelf/${shelfItemId}`, {
        method: 'DELETE', headers: auth(ownerToken),
      });
      assert.equal(ownerDelete.status, 204);
      assert.equal(ownerDelete.headers.get('x-sit-private-shelf-media-cleanup'), 'complete');
      for (const storageName of storageNames) {
        await assert.rejects(fs.stat(path.join(uploadDir, 'private-shelf', storageName)), { code: 'ENOENT' });
      }
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM private_shelf_media_cleanup_outbox',
      )).rows[0].count, 0);

      const retryCreate = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(ownerToken, 'private-shelf-retry-001'), body: JSON.stringify(payload),
      });
      const retryItemId = (await retryCreate.json()).shelfItem.shelfItemId;
      const retryForm = new FormData();
      retryForm.append('file', new Blob([image], { type: 'image/png' }), 'retry.png');
      const retryMediaResponse = await fetch(`${baseUrl}/v1/private-shelf/${retryItemId}/media`, {
        method: 'POST', headers: auth(ownerToken), body: retryForm,
      });
      assert.equal(retryMediaResponse.status, 201);
      const retryNames = (await setupPool.query(
        'SELECT storage_name, thumbnail_storage_name FROM private_shelf_media WHERE shelf_item_id = $1',
        [retryItemId],
      )).rows[0];
      const retryDelete = await inTransaction((client) => deletePrivateShelfItem(client, {
        actorId: ownerId, shelfItemId: retryItemId,
      }));
      assert.deepEqual(await attemptPrivateShelfMediaCleanup({
        client: { query: async () => { throw new Error('synthetic_database_unavailable'); } },
        uploadDir: '/not-used',
        ids: retryDelete.cleanupIds,
      }), { attempted: 0, failures: [{ code: 'cleanup_attempt_failed' }] });
      assert.deepEqual((await setupPool.query(
        `SELECT status, attempts, last_error_code
           FROM private_shelf_media_cleanup_outbox ORDER BY storage_name`,
      )).rows, [
        { status: 'pending', attempts: 0, last_error_code: null },
        { status: 'pending', attempts: 0, last_error_code: null },
      ]);
      assert.deepEqual(await retryPrivateShelfMediaCleanup({ client: setupPool, uploadDir }), {
        attempted: 2, failures: [],
      });
      for (const storageName of Object.values(retryNames)) {
        await assert.rejects(fs.stat(path.join(uploadDir, 'private-shelf', storageName)), { code: 'ENOENT' });
      }
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM private_shelf_media_cleanup_outbox',
      )).rows[0].count, 0);

      const failedInsertFull = `${crypto.randomUUID()}-full.webp`;
      const failedInsertThumb = failedInsertFull.replace('-full.webp', '-thumb.webp');
      const failedInsertIds = await inTransaction((client) => enqueuePrivateShelfMediaCleanup(
        client, [failedInsertFull, failedInsertThumb], { status: 'reserved' },
      ));
      await fs.writeFile(path.join(uploadDir, 'private-shelf', failedInsertFull), approvedFull, { mode: 0o640 });
      await fs.writeFile(path.join(uploadDir, 'private-shelf', failedInsertThumb), approvedFull, { mode: 0o640 });
      await assert.rejects(
        setupPool.query('INSERT INTO private_shelf_media (id) VALUES ($1::uuid)', [crypto.randomUUID()]),
        /null value/u,
      );
      assert.deepEqual(await retryPrivateShelfMediaCleanup({ client: setupPool, uploadDir }), {
        attempted: 0, failures: [],
      });
      assert.equal((await fs.stat(path.join(uploadDir, 'private-shelf', failedInsertFull))).isFile(), true);
      assert.equal((await fs.stat(path.join(uploadDir, 'private-shelf', failedInsertThumb))).isFile(), true);
      await inTransaction((client) => activatePrivateShelfMediaCleanup(client, failedInsertIds));
      const failedInsertDrain = await drainPrivateShelfMediaCleanup({
        client: setupPool, uploadDir, ids: failedInsertIds,
        unlink: async () => { throw Object.assign(new Error('synthetic_unlink_failure'), { code: 'EACCES' }); },
      });
      assert.equal(failedInsertDrain.failures.length, 2);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM private_shelf_media_cleanup_outbox
          WHERE status = 'retry' AND attempts = 1 AND last_error_code = 'unlink_failed'`,
      )).rows[0].count, 2);
      assert.deepEqual(await retryPrivateShelfMediaCleanup({ client: setupPool, uploadDir }), {
        attempted: 2, failures: [],
      });
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM private_shelf_media_cleanup_outbox',
      )).rows[0].count, 0);

      const deletionCreate = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(deletionToken, 'private-shelf-delete-001'), body: JSON.stringify(payload),
      });
      assert.equal(deletionCreate.status, 201);
      const deletionItemId = (await deletionCreate.json()).shelfItem.shelfItemId;
      const deletionForm = new FormData();
      deletionForm.append('file', new Blob([image], { type: 'image/png' }), 'delete.png');
      assert.equal((await fetch(`${baseUrl}/v1/private-shelf/${deletionItemId}/media`, {
        method: 'POST', headers: auth(deletionToken), body: deletionForm,
      })).status, 201);
      const deletionMedia = await setupPool.query(
        'SELECT storage_name, thumbnail_storage_name FROM private_shelf_media WHERE owner_id = $1',
        [deletionId],
      );
      const deletionNames = Object.values(deletionMedia.rows[0]);
      const deletionOutcome = await inTransaction((client) => eraseAccount(client, { id: deletionId }));
      assert.equal(deletionOutcome.privateShelfMediaCleanupIds.length, 2);
      assert.deepEqual((await drainPrivateShelfMediaCleanup({
        client: setupPool, uploadDir, ids: deletionOutcome.privateShelfMediaCleanupIds,
      })).failures, []);
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM private_shelf_items WHERE owner_id = $1', [deletionId],
      )).rows[0].count, 0);
      for (const storageName of deletionNames) {
        await assert.rejects(fs.stat(path.join(uploadDir, 'private-shelf', storageName)), { code: 'ENOENT' });
      }

      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM private_shelf_items',
      )).rows[0].count, 0);
      const retainedCleanupId = crypto.randomUUID();
      await setupPool.query(
        `INSERT INTO private_shelf_media_cleanup_outbox (
           id, storage_name, status, attempts, last_error_code
         ) VALUES ($1::uuid, $2, 'retry', 1, 'unlink_failed')`,
        [retainedCleanupId, `${crypto.randomUUID()}-full.webp`],
      );
      const downMigration = await fs.readFile(
        new URL('../sql/migrations/100_private_shelf_items.down.sql', import.meta.url),
        'utf8',
      );
      await assert.rejects(
        setupPool.query(downMigration),
        /private_shelf_media_cleanup_outbox_active/u,
      );
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM private_shelf_media_cleanup_outbox WHERE id = $1::uuid',
        [retainedCleanupId],
      )).rows[0].count, 1);
      await setupPool.query(
        'DELETE FROM private_shelf_media_cleanup_outbox WHERE id = $1::uuid',
        [retainedCleanupId],
      );

      assert.deepEqual(await legacySnapshot(), legacyBefore);
      assert.deepEqual(await effects(), effectsBefore);
      await stop();
    } finally {
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      await setupPool.end().catch(() => {});
      if (applicationPool) await applicationPool.end().catch(() => {});
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });
}
