import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

import pg from 'pg';

import { missionFitCheckDigest } from '../src/mission_fit_check_workflow.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('mission FitCheck PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P4-A FitChecks are owner-bound, immutable, restart-safe and drift-aware', async () => {
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
    const setupPool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    let applicationPool;
    let server;
    try {
      await setupPool.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setupPool);
      await runMigrations(setupPool);
      const terminal = await setupPool.query('SELECT name FROM schema_migrations ORDER BY name');
      assert.equal(terminal.rows.at(-1).name, '105_staging_password_enrollment_redemptions.up.sql');

      const ownerId = `fit-owner-${crypto.randomUUID()}`;
      const otherId = `fit-other-${crypto.randomUUID()}`;
      const deletionId = `fit-delete-${crypto.randomUUID()}`;
      const sessions = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status, email_verified_at)
         VALUES ($1, $4, '{"displayName":"Fit owner"}'::jsonb, 'user', 'active', now()),
                ($2, $5, '{"displayName":"Fit other"}'::jsonb, 'user', 'active', now()),
                ($3, $6, '{"displayName":"Fit delete"}'::jsonb, 'user', 'active', now())`,
        [ownerId, otherId, deletionId,
          `${crypto.randomUUID()}@example.invalid`, `${crypto.randomUUID()}@example.invalid`,
          `${crypto.randomUUID()}@example.invalid`],
      );
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, $4, 'Fit owner'), ($2, $5, 'Fit other'), ($3, $6, 'Fit delete')`,
        [...sessions, ownerId, otherId, deletionId],
      );
      const legacyCart = await setupPool.query(
        'INSERT INTO rental_carts (user_id) VALUES ($1) RETURNING id', [ownerId],
      );
      await setupPool.query(
        `INSERT INTO rental_cart_projects (cart_id, client_project_id, title, answers, sort_order)
         VALUES ($1, 'fit_legacy_project', 'Altbestand', '{"unchanged":true}'::jsonb, 4)`,
        [legacyCart.rows[0].id],
      );
      const legacySnapshot = async () => (await setupPool.query(
        `SELECT jsonb_build_object(
           'cart', (SELECT to_jsonb(c) FROM rental_carts c WHERE c.id = $1),
           'projects', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
                         FROM rental_cart_projects p WHERE p.cart_id = $1),
           'listings', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)
                        FROM listings l),
           'uploads', (SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb)
                       FROM uploads u)) AS value`, [legacyCart.rows[0].id],
      )).rows[0].value;
      const legacyBefore = await legacySnapshot();
      const effects = async () => (await setupPool.query(
        `SELECT (SELECT count(*)::int FROM bookings) AS bookings,
                (SELECT count(*)::int FROM rental_requests) AS requests,
                (SELECT count(*)::int FROM platform_contracts) AS contracts,
                (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0];
      const effectsBefore = await effects();

      const { createApp, eraseAccount } = await import('../src/app.js');
      const { pool, inTransaction } = await import('../src/db.js');
      const { signAccessToken } = await import('../src/security.js');
      const { buildAccountExport } = await import('../src/privacy_export.js');
      applicationPool = pool;
      const tokenFor = (id, session) => signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId: session },
      );
      const tokens = sessions.map((session, index) => tokenFor(
        [ownerId, otherId, deletionId][index], session,
      ));
      const auth = (token) => ({ Authorization: `Bearer ${token}` });
      const json = (token, key) => ({
        ...auth(token), 'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
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
      const missionPayload = {
        title: 'Pflanzgefäß dimensional prüfen', status: 'draft',
        needs: [{ needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 }],
      };
      const missionResponse = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST', headers: json(tokens[0], 'fit-mission-create-0001'),
        body: JSON.stringify(missionPayload),
      });
      assert.equal(missionResponse.status, 201);
      const mission = (await missionResponse.json()).missionNeed;
      const shelfResponse = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(tokens[0], 'fit-shelf-create-0001'),
        body: JSON.stringify({
          title: 'Privater Pflanzkübel', categoryKey: 'garden.plant_container', condition: 'good',
        }),
      });
      assert.equal(shelfResponse.status, 201);
      const shelf = (await shelfResponse.json()).shelfItem;
      const provenance = (sourceReference) => ({
        sourceType: 'owner_confirmed_measurement', sourceReference,
        sourceVersion: 'measurement-v1', ownerConfirmed: true,
      });
      const fitPayload = {
        definitionId: 'plant_container_dimensional_fit_v1',
        missionRevision: mission.revision,
        missionPayloadDigest: mission.payloadDigest,
        shelfItemId: shelf.shelfItemId,
        shelfUpdatedAt: shelf.updatedAt,
        requirement: {
          ownerConfirmed: true,
          facts: [
            { key: 'minimumUsableVolumeMl', value: 20_000, unit: 'ml' },
            { key: 'maximumFootprintWidthMm', value: 500, unit: 'mm' },
            { key: 'maximumFootprintDepthMm', value: 400, unit: 'mm' },
            { key: 'maximumHeightMm', value: 600, unit: 'mm' },
          ],
        },
        itemFacts: [
          { key: 'usableVolumeMl', value: 25_000, unit: 'ml', provenance: provenance('owner-volume-01') },
          { key: 'footprintWidthMm', value: 390, unit: 'mm', provenance: provenance('owner-width-01') },
          { key: 'footprintDepthMm', value: 490, unit: 'mm', provenance: provenance('owner-depth-01') },
          { key: 'heightMm', value: 550, unit: 'mm', provenance: provenance('owner-height-01') },
        ],
      };
      const create = await fetch(`${baseUrl}/v1/mission-needs/${mission.missionNeedId}/fit-checks`, {
        method: 'POST', headers: json(tokens[0], 'fit-create-command-0001'),
        body: JSON.stringify(fitPayload),
      });
      assert.equal(create.status, 201);
      assert.match(create.headers.get('cache-control'), /no-store/u);
      const created = (await create.json()).fitCheck;
      assert.match(created.fitCheckId, /^mission_fit_[0-9a-f-]{36}$/u);
      assert.equal(created.definitionId, 'plant_container_dimensional_fit_v1');
      assert.equal(created.needKey, 'plant_container_equipment');
      assert.equal(created.storedEvaluation.status, 'fit');
      assert.equal(created.storedEvaluation.orientation, 'rotated');
      assert.equal(created.currentApplicability, 'current');
      assert.equal(created.currentEvaluation.releaseBlocked, false);
      assert.equal(created.bindingStatus, 'non_binding');
      assert.equal(created.safetyGuarantee, false);
      for (const value of [created.reservationCreated, created.bookingCreated,
        created.contractCreated, created.paymentCreated, created.externalGenerativeAiUsed,
        created.automaticPhotoAnalysisUsed, created.publicListingCreated]) assert.equal(value, false);
      assert.equal(created.requirementDigest, missionFitCheckDigest(created.requirement));
      assert.equal(created.itemFactsDigest, missionFitCheckDigest(created.itemFacts));
      assert.equal(created.payloadDigest, missionFitCheckDigest({
        domainVersion: created.domainVersion,
        definitionId: created.definitionId,
        definitionVersion: created.definitionVersion,
        plannerCoreVersion: created.plannerCoreVersion,
        missionNeedId: created.missionNeedId,
        missionRevision: created.missionRevision,
        missionPayloadDigest: created.missionPayloadDigest,
        shelfSnapshotDigest: created.shelfSnapshotDigest,
        revision: created.revision,
        requirementDigest: created.requirementDigest,
        itemFactsDigest: created.itemFactsDigest,
        evaluation: created.storedEvaluation,
      }));

      const replay = await fetch(`${baseUrl}/v1/mission-needs/${mission.missionNeedId}/fit-checks`, {
        method: 'POST', headers: json(tokens[0], 'fit-create-command-0001'),
        body: JSON.stringify(fitPayload),
      });
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).fitCheck.fitCheckId, created.fitCheckId);
      const collision = await fetch(`${baseUrl}/v1/mission-needs/${mission.missionNeedId}/fit-checks`, {
        method: 'POST', headers: json(tokens[0], 'fit-create-command-0001'),
        body: JSON.stringify({ ...fitPayload, itemFacts: fitPayload.itemFacts.slice(0, 3) }),
      });
      assert.equal(collision.status, 409);
      assert.equal((await collision.json()).error, 'mission_fit_check_idempotency_key_reused');

      const foreignRead = await fetch(`${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}`, {
        headers: auth(tokens[1]),
      });
      assert.equal(foreignRead.status, 404);
      assert.equal((await foreignRead.json()).error, 'mission_fit_check_not_found');
      const foreignCorrection = await fetch(
        `${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}/revisions`,
        {
          method: 'POST', headers: json(tokens[1], 'fit-foreign-command-0001'),
          body: JSON.stringify({ ...fitPayload, expectedRevision: 1 }),
        },
      );
      assert.equal(foreignCorrection.status, 404);
      assert.equal((await foreignCorrection.json()).error, 'mission_fit_check_not_found');
      const missingRead = await fetch(
        `${baseUrl}/v1/mission-fit-checks/mission_fit_${crypto.randomUUID()}`,
        { headers: auth(tokens[0]) },
      );
      assert.equal(missingRead.status, 404);
      assert.equal((await missingRead.json()).error, 'mission_fit_check_not_found');
      const foreignList = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/fit-checks`,
        { headers: auth(tokens[1]) },
      );
      assert.equal(foreignList.status, 404);

      const correctionPayload = {
        ...fitPayload, expectedRevision: 1,
        itemFacts: fitPayload.itemFacts.map((fact) => (
          fact.key === 'heightMm' ? { ...fact, value: 700 } : fact
        )),
      };
      const correction = await fetch(`${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}/revisions`, {
        method: 'POST', headers: json(tokens[0], 'fit-correct-command-0001'),
        body: JSON.stringify(correctionPayload),
      });
      assert.equal(correction.status, 201);
      const corrected = (await correction.json()).fitCheck;
      assert.equal(corrected.revision, 2);
      assert.equal(corrected.storedEvaluation.status, 'unfit');
      assert.equal(corrected.storedEvaluation.releaseBlocked, true);
      const staleCorrection = await fetch(`${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}/revisions`, {
        method: 'POST', headers: json(tokens[0], 'fit-correct-command-0002'),
        body: JSON.stringify(correctionPayload),
      });
      assert.equal(staleCorrection.status, 409);
      assert.equal((await staleCorrection.json()).error, 'mission_fit_check_revision_conflict');

      await stop();
      baseUrl = await start();
      const restartRead = await fetch(`${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}`, {
        headers: auth(tokens[0]),
      });
      assert.equal(restartRead.status, 200);
      assert.equal((await restartRead.json()).fitCheck.revision, 2);

      await setupPool.query(
        `UPDATE private_shelf_items
            SET title = 'Privater Pflanzkübel, neu vermessen',
                updated_at = updated_at + interval '1 second'
          WHERE id = $1 AND owner_id = $2`,
        [shelf.shelfItemId, ownerId],
      );
      const shelfDriftRead = await fetch(
        `${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}`,
        { headers: auth(tokens[0]) },
      );
      const shelfDrift = (await shelfDriftRead.json()).fitCheck;
      assert.equal(shelfDrift.storedEvaluation.status, 'unfit');
      assert.equal(shelfDrift.currentApplicability, 'stale');
      assert.equal(shelfDrift.currentEvaluation.status, 'unknown');
      assert.deepEqual(shelfDrift.currentEvaluation.reasonCodes, ['shelf_snapshot_changed']);

      const revisedMissionPayload = { ...missionPayload, title: 'Pflanzgefäß neu vermessen' };
      const reviseMission = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/revisions`,
        {
          method: 'POST', headers: json(tokens[0], 'fit-mission-correct-0001'),
          body: JSON.stringify({ expectedRevision: 1, ...revisedMissionPayload }),
        },
      );
      assert.equal(reviseMission.status, 201);
      const staleRead = await fetch(`${baseUrl}/v1/mission-fit-checks/${created.fitCheckId}`, {
        headers: auth(tokens[0]),
      });
      const stale = (await staleRead.json()).fitCheck;
      assert.equal(stale.storedEvaluation.status, 'unfit');
      assert.equal(stale.currentApplicability, 'stale');
      assert.equal(stale.currentEvaluation.status, 'unknown');
      assert.equal(stale.currentEvaluation.releaseBlocked, true);
      assert.deepEqual(stale.currentEvaluation.reasonCodes, [
        'mission_snapshot_changed', 'shelf_snapshot_changed',
      ]);

      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_fit_checks (
             id, owner_id, mission_need_id, shelf_item_id, domain_version, definition_id,
             definition_version, planner_core_version, need_key
           ) VALUES ($1, $2, $3, $4, 'P4-A-2026-10-01.1',
             'plant_container_dimensional_fit_v1',
             'P4-A-PLANT-CONTAINER-DIMENSIONAL-2026-10-01.1',
             'G4A-2026-08-21.1', 'plant_container_equipment')`,
          [`mission_fit_${crypto.randomUUID()}`, otherId, mission.missionNeedId, shelf.shelfItemId],
        ),
        (error) => error.code === '23503',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_fit_check_revisions (
             fit_check_id, mission_need_id, revision, mission_need_revision,
             mission_payload_sha256, shelf_snapshot, shelf_snapshot_sha256,
             requirement_snapshot, requirement_sha256, item_facts, item_facts_sha256,
             evaluation, outcome, release_blocked, payload_sha256
           ) SELECT fit_check_id, mission_need_id, 4, mission_need_revision,
                    mission_payload_sha256, shelf_snapshot, shelf_snapshot_sha256,
                    requirement_snapshot, requirement_sha256, item_facts, item_facts_sha256,
                    evaluation, outcome, release_blocked, payload_sha256
               FROM mission_fit_check_revisions
              WHERE fit_check_id = $1 AND revision = 2`, [created.fitCheckId],
        ),
        (error) => error.code === '23514',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE mission_fit_check_revisions SET item_facts = '[]'::jsonb
            WHERE fit_check_id = $1 AND revision = 2`, [created.fitCheckId],
        ),
        (error) => error.code === '55000',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE mission_fit_checks SET created_at = created_at + interval '1 second'
            WHERE id = $1`, [created.fitCheckId],
        ),
        (error) => error.code === '55000',
      );
      await assert.rejects(
        setupPool.query(
          `UPDATE mission_fit_checks
              SET current_revision = current_revision + 1,
                  updated_at = now()
            WHERE id = $1`, [created.fitCheckId],
        ),
        (error) => error.code === '55000',
      );

      const exported = await buildAccountExport(setupPool, ownerId);
      assert.equal(exported.data.marketplace.missionFitChecks.fitChecks.length, 1);
      assert.equal(exported.data.marketplace.missionFitChecks.revisions.length, 2);
      assert.equal(exported.data.marketplace.missionFitChecks.commands.length, 2);
      assert.equal(
        exported.data.marketplace.missionFitChecks.revisions[0]
          .itemFacts[0].provenance.ownerConfirmed,
        true,
      );
      assert.deepEqual(await effects(), effectsBefore);
      assert.deepEqual(await legacySnapshot(), legacyBefore);
      const catalog = await fetch(`${baseUrl}/v1/listings?sort=newest&limit=100&offset=0`);
      assert.equal(catalog.status, 200);
      assert.doesNotMatch(JSON.stringify(await catalog.json()), /mission_fit_|FitCheck/u);

      const deleteMission = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST', headers: json(tokens[2], 'fit-delete-mission-0001'),
        body: JSON.stringify(missionPayload),
      });
      const deleteShelf = await fetch(`${baseUrl}/v1/private-shelf`, {
        method: 'POST', headers: json(tokens[2], 'fit-delete-shelf-0001'),
        body: JSON.stringify({ title: 'Löschkübel', categoryKey: 'garden.pot', condition: 'good' }),
      });
      const deleteMissionValue = (await deleteMission.json()).missionNeed;
      const deleteShelfValue = (await deleteShelf.json()).shelfItem;
      const deleteFit = await fetch(
        `${baseUrl}/v1/mission-needs/${deleteMissionValue.missionNeedId}/fit-checks`,
        {
          method: 'POST', headers: json(tokens[2], 'fit-delete-command-0001'),
          body: JSON.stringify({
            ...fitPayload,
            missionRevision: deleteMissionValue.revision,
            missionPayloadDigest: deleteMissionValue.payloadDigest,
            shelfItemId: deleteShelfValue.shelfItemId,
            shelfUpdatedAt: deleteShelfValue.updatedAt,
          }),
        },
      );
      assert.equal(deleteFit.status, 201);
      await inTransaction((client) => eraseAccount(client, { id: deletionId }));
      const deleted = await setupPool.query(
        `SELECT (SELECT count(*)::int FROM mission_fit_checks WHERE owner_id = $1) AS roots,
                (SELECT count(*)::int FROM mission_fit_check_revisions
                  WHERE fit_check_id = $2) AS revisions,
                (SELECT count(*)::int FROM mission_fit_check_commands WHERE owner_id = $1) AS commands`,
        [deletionId, (await deleteFit.json()).fitCheck.fitCheckId],
      );
      assert.deepEqual(deleted.rows[0], { roots: 0, revisions: 0, commands: 0 });

      await assert.rejects(
        setupPool.query(await fs.readFile(
          new URL('../sql/migrations/101_mission_fit_checks.down.sql', import.meta.url), 'utf8',
        )),
        (error) => error.code === '55000' && /mission_fit_check_rows_active/u.test(error.message),
      );
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM mission_fit_checks WHERE owner_id = $1', [ownerId],
      )).rows[0].count, 1);
      await stop();
    } finally {
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      await setupPool.end().catch(() => {});
      if (applicationPool) await applicationPool.end().catch(() => {});
    }
  });
}
