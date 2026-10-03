import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

import pg from 'pg';

import { missionNeedDigest } from '../src/mission_need_workflow.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('mission need PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P2-A mission needs are durable, owner-isolated, revisioned and additive', async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory',
      PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_NEW_ENTRIES_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'false',
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
      const migrations = await setupPool.query(
        'SELECT name FROM schema_migrations ORDER BY name',
      );
      assert.equal(migrations.rows.at(-1).name, '106_apple_ownership_v2.up.sql');

      const ownerId = 'mission-need-owner';
      const otherId = 'mission-need-other';
      const deletionId = 'mission-need-delete';
      const ownerSession = crypto.randomUUID();
      const otherSession = crypto.randomUUID();
      const deletionSession = crypto.randomUUID();
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status, email_verified_at)
         VALUES
           ($1, 'mission-owner@example.invalid', '{"displayName":"Mission Owner"}'::jsonb, 'user', 'active', now()),
           ($2, 'mission-other@example.invalid', '{"displayName":"Mission Other"}'::jsonb, 'user', 'active', now()),
           ($3, 'mission-delete@example.invalid', '{"displayName":"Mission Delete"}'::jsonb, 'user', 'active', now())`,
        [ownerId, otherId, deletionId],
      );
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, $4, 'Mission owner'), ($2, $5, 'Mission other'), ($3, $6, 'Mission delete')`,
        [ownerSession, otherSession, deletionSession, ownerId, otherId, deletionId],
      );
      const cart = await setupPool.query(
        `INSERT INTO rental_carts (user_id) VALUES ($1) RETURNING id`,
        [ownerId],
      );
      await setupPool.query(
        `INSERT INTO rental_cart_projects (
           cart_id, client_project_id, title, answers, sort_order
         ) VALUES ($1, 'legacy_project_01', 'Unveränderter Altbestand', '{"kind":"legacy"}'::jsonb, 7)`,
        [cart.rows[0].id],
      );
      const rentalCartSnapshot = async () => (await setupPool.query(
        `SELECT jsonb_build_object(
           'cart', (SELECT to_jsonb(cart_row) FROM rental_carts AS cart_row WHERE user_id = $1),
           'projects', (SELECT COALESCE(jsonb_agg(to_jsonb(project_row) ORDER BY project_row.id), '[]'::jsonb)
                        FROM rental_cart_projects AS project_row WHERE project_row.cart_id = $2),
           'items', (SELECT COALESCE(jsonb_agg(to_jsonb(item_row) ORDER BY item_row.id), '[]'::jsonb)
                     FROM rental_cart_items AS item_row WHERE item_row.cart_id = $2)
         ) AS snapshot`,
        [ownerId, cart.rows[0].id],
      )).rows[0].snapshot;
      const oldCartBefore = await rentalCartSnapshot();
      const sideEffectCounts = async () => (await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM bookings) AS bookings,
           (SELECT count(*)::int FROM rental_requests) AS rental_requests,
           (SELECT count(*)::int FROM platform_contracts) AS contracts,
           (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0];
      const effectsBefore = await sideEffectCounts();

      const { createApp, eraseAccount } = await import('../src/app.js');
      const { inTransaction, pool } = await import('../src/db.js');
      const { buildAccountExport } = await import('../src/privacy_export.js');
      const { signAccessToken } = await import('../src/security.js');
      applicationPool = pool;
      const tokenFor = (id, sessionId) => signAccessToken(
        { id, email: `${id}@example.invalid` },
        { sessionId },
      );
      const headersFor = (token, key) => ({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      });
      const ownerToken = tokenFor(ownerId, ownerSession);
      const otherToken = tokenFor(otherId, otherSession);
      const deletionToken = tokenFor(deletionId, deletionSession);
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
      const payload = {
        title: 'Wohnungsrenovierung planen',
        status: 'draft',
        needs: [
          { needKey: 'paint_roller', necessity: 'required', quantity: 2 },
          { needKey: 'laser_level', necessity: 'optional', quantity: 1 },
        ],
      };
      const create = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST',
        headers: headersFor(ownerToken, 'mission-create-0001'),
        body: JSON.stringify(payload),
      });
      assert.equal(create.status, 201);
      const created = await create.json();
      assert.match(created.missionNeed.missionNeedId, /^mission_need_[0-9a-f-]{36}$/u);
      assert.equal(created.missionNeed.domainVersion, 'P2-A-2026-10-01.1');
      assert.equal(created.missionNeed.revision, 1);
      assert.equal(created.missionNeed.payloadDigest, missionNeedDigest(payload));
      assert.equal(created.missionNeed.bindingStatus, 'non_binding');
      for (const field of [
        'reservationCreated', 'bookingCreated', 'contractCreated', 'paymentCreated',
        'externalGenerativeAiUsed', 'automaticPhotoAnalysisUsed',
      ]) assert.equal(created.missionNeed[field], false);
      const missionNeedId = created.missionNeed.missionNeedId;

      const replay = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST',
        headers: headersFor(ownerToken, 'mission-create-0001'),
        body: JSON.stringify(payload),
      });
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).missionNeed.missionNeedId, missionNeedId);
      const collision = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST',
        headers: headersFor(ownerToken, 'mission-create-0001'),
        body: JSON.stringify({ ...payload, title: 'Andere Mission' }),
      });
      assert.equal(collision.status, 409);
      assert.equal((await collision.json()).error, 'mission_need_idempotency_key_reused');

      const otherList = await fetch(`${baseUrl}/v1/mission-needs`, {
        headers: headersFor(otherToken),
      });
      assert.equal(otherList.status, 200);
      assert.deepEqual((await otherList.json()).missionNeeds, []);
      const otherRead = await fetch(`${baseUrl}/v1/mission-needs/${missionNeedId}`, {
        headers: headersFor(otherToken),
      });
      assert.equal(otherRead.status, 404);
      assert.equal((await otherRead.json()).error, 'mission_need_not_found');

      const correctedPayload = {
        expectedRevision: 1,
        title: payload.title,
        status: 'planned',
        needs: [
          { needKey: 'paint_roller', necessity: 'required', quantity: 3 },
          { needKey: 'laser_level', necessity: 'optional', quantity: 1 },
        ],
      };
      const corrected = await fetch(`${baseUrl}/v1/mission-needs/${missionNeedId}/revisions`, {
        method: 'POST',
        headers: headersFor(ownerToken, 'mission-correct-0001'),
        body: JSON.stringify(correctedPayload),
      });
      assert.equal(corrected.status, 201);
      assert.equal((await corrected.json()).missionNeed.revision, 2);
      const correctionReplay = await fetch(`${baseUrl}/v1/mission-needs/${missionNeedId}/revisions`, {
        method: 'POST',
        headers: headersFor(ownerToken, 'mission-correct-0001'),
        body: JSON.stringify(correctedPayload),
      });
      assert.equal(correctionReplay.status, 200);
      assert.equal((await correctionReplay.json()).missionNeed.revision, 2);
      const stale = await fetch(`${baseUrl}/v1/mission-needs/${missionNeedId}/revisions`, {
        method: 'POST',
        headers: headersFor(ownerToken, 'mission-correct-0002'),
        body: JSON.stringify({ ...correctedPayload, status: 'draft' }),
      });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).error, 'mission_need_revision_conflict');

      const loaded = await fetch(`${baseUrl}/v1/mission-needs/${missionNeedId}`, {
        headers: headersFor(ownerToken),
      });
      assert.equal(loaded.status, 200);
      assert.deepEqual((await loaded.json()).missionNeed.revisions.map((row) => row.revision), [1, 2]);
      await stop();
      baseUrl = await start();
      const afterRestart = await fetch(`${baseUrl}/v1/mission-needs/${missionNeedId}`, {
        headers: headersFor(ownerToken),
      });
      assert.equal(afterRestart.status, 200);
      assert.equal((await afterRestart.json()).missionNeed.revision, 2);

      const stored = await setupPool.query(
        `SELECT revision, payload_sha256
           FROM mission_need_revisions
          WHERE mission_need_id = $1 ORDER BY revision`,
        [missionNeedId],
      );
      assert.equal(stored.rowCount, 2);
      assert.ok(stored.rows.every((row) => /^[0-9a-f]{64}$/u.test(row.payload_sha256)));
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_need_revisions (
             mission_need_id, revision, status, payload, payload_sha256
           ) SELECT $1, 4, status, payload, payload_sha256
               FROM mission_need_revisions
              WHERE mission_need_id = $1 AND revision = 2`,
          [missionNeedId],
        ),
        /mission_need_revision_invalid/u,
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_need_commands (
             owner_id, idempotency_key, command_type, request_sha256,
             mission_need_id, result_revision
           ) VALUES ($1, 'wrong-owner-command-01', 'correct', $2, $3, 2)`,
          [otherId, 'f'.repeat(64), missionNeedId],
        ),
        /mission_need_commands_mission_need_id_owner_id_fkey/u,
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE mission_need_revisions SET status = 'draft'
            WHERE mission_need_id = $1 AND revision = 2`,
          [missionNeedId],
        ),
        /mission_need_immutable_record/u,
      );
      assert.deepEqual(await rentalCartSnapshot(), oldCartBefore);
      assert.deepEqual(await sideEffectCounts(), effectsBefore);

      const exported = await buildAccountExport(setupPool, ownerId);
      assert.equal(exported.data.marketplace.missionNeeds.needs.length, 1);
      assert.equal(exported.data.marketplace.missionNeeds.revisions.length, 2);
      assert.equal(exported.data.marketplace.missionNeeds.commands.length, 2);
      const exportedMissionNeedId = exported.data.marketplace.missionNeeds.needs[0].id;
      assert.deepEqual(
        exported.data.marketplace.missionNeeds.commands.map((command) => ({
          idempotencyKey: command.idempotencyKey,
          commandType: command.commandType,
          requestDigest: command.requestDigest,
          missionNeedId: command.missionNeedId,
          resultRevision: command.resultRevision,
        })),
        [
          {
            idempotencyKey: 'mission-create-0001',
            commandType: 'create',
            requestDigest: missionNeedDigest({ command: 'create', payload }),
            missionNeedId: exportedMissionNeedId,
            resultRevision: 1,
          },
          {
            idempotencyKey: 'mission-correct-0001',
            commandType: 'correct',
            requestDigest: missionNeedDigest({
              command: 'correct', missionNeedId, expectedRevision: 1,
              payload: {
                title: correctedPayload.title,
                status: correctedPayload.status,
                needs: correctedPayload.needs,
              },
            }),
            missionNeedId: exportedMissionNeedId,
            resultRevision: 2,
          },
        ],
      );
      assert.equal(exported.data.marketplace.missionNeeds.bindingStatus, 'non_binding');
      const portable = await buildAccountExport(setupPool, ownerId, {
        purpose: 'data_portability',
      });
      assert.equal(portable.data.marketplace.missionNeeds.commands.length, 2);
      assert.ok(portable.data.marketplace.missionNeeds.commands.every(
        (command) => command.missionNeedId
          === portable.data.marketplace.missionNeeds.needs[0].id,
      ));
      assert.deepEqual(
        portable.data.marketplace.missionNeeds.commands.map((command) => ({
          idempotencyKey: command.idempotencyKey,
          commandType: command.commandType,
          requestDigest: command.requestDigest,
          resultRevision: command.resultRevision,
        })),
        exported.data.marketplace.missionNeeds.commands.map((command) => ({
          idempotencyKey: command.idempotencyKey,
          commandType: command.commandType,
          requestDigest: command.requestDigest,
          resultRevision: command.resultRevision,
        })),
      );

      const deletionCreate = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST',
        headers: headersFor(deletionToken, 'mission-delete-create-01'),
        body: JSON.stringify(payload),
      });
      assert.equal(deletionCreate.status, 201);
      await inTransaction((client) => eraseAccount(client, { id: deletionId }));
      const deletionRows = await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM mission_needs WHERE owner_id = $1) AS needs,
           (SELECT count(*)::int FROM mission_need_revisions AS revision
             JOIN mission_needs AS need ON need.id = revision.mission_need_id
            WHERE need.owner_id = $1) AS revisions,
           (SELECT count(*)::int FROM mission_need_commands WHERE owner_id = $1) AS commands`,
        [deletionId],
      );
      assert.deepEqual(deletionRows.rows[0], { needs: 0, revisions: 0, commands: 0 });
      await stop();
    } finally {
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      await setupPool.end().catch(() => {});
      if (applicationPool) await applicationPool.end().catch(() => {});
    }
  });
}
