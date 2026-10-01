import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('mission inventory resolution PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P5-A resolves bounded quantities without double-use and preserves private owner truth', async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory',
      PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'true',
      PRIVATE_PILOT_V4_ENABLED: 'false',
    });
    const setupPool = new pg.Pool({ connectionString: databaseUrl, max: 6 });
    let applicationPool;
    let server;
    try {
      await setupPool.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setupPool);
      await runMigrations(setupPool);
      const terminal = await setupPool.query('SELECT name FROM schema_migrations ORDER BY name');
      assert.equal(terminal.rows.at(-1).name, '102_mission_inventory_resolutions.up.sql');

      const renterId = `inventory-renter-${crypto.randomUUID()}`;
      const otherId = `inventory-other-${crypto.randomUUID()}`;
      const listingOwnerId = `inventory-listing-owner-${crypto.randomUUID()}`;
      const deletionId = `inventory-delete-${crypto.randomUUID()}`;
      const userIds = [renterId, otherId, listingOwnerId, deletionId];
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status, email_verified_at)
         SELECT id, email, jsonb_build_object('displayName', name), 'user', 'active', now()
           FROM unnest($1::text[], $2::text[], $3::text[]) AS input(id, email, name)`,
        [userIds, userIds.map((id) => `${id}@example.invalid`),
          ['Mission owner', 'Other owner', 'Listing owner', 'Delete owner']],
      );
      const sessions = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, $4, 'P5 owner'), ($2, $5, 'P5 other'), ($3, $6, 'P5 delete')`,
        [...sessions, renterId, otherId, deletionId],
      );

      const listingId = `p5-listing-${crypto.randomUUID()}`;
      await setupPool.query(
        `INSERT INTO listings (
           id, owner_id, payload, is_active, catalog_version, catalog_revision,
           status, currency, price_per_day_minor, title, description,
           category_id, subcategory, condition, location_text, city, country,
           latitude, longitude, min_days, max_days, availability_timezone,
           moderation_status, protection_model
         ) VALUES (
           $1, $2, $3::jsonb, true, 1, 1, 'active', 'EUR', 1000,
           'P5 synthetic plant container', 'Synthetic P5 source-only candidate',
           'cat7', 'Pflanzkisten', 'good', 'Private exact handover text',
           'Heilbronn', 'Deutschland', 49.14123, 9.22123, 1, 30,
           'Europe/Berlin', 'active', 'none'
         )`,
        [listingId, listingOwnerId, JSON.stringify({
          id: listingId,
          ownerId: listingOwnerId,
          title: 'P5 synthetic plant container',
          categoryId: 'cat7',
          subcategory: 'Pflanzkisten',
          condition: 'good',
          currency: 'EUR',
          pricePerDay: 10,
          minDays: 1,
          maxDays: 30,
          status: 'active',
          isActive: true,
          photos: ['/uploads/p5-synthetic.webp'],
        })],
      );
      await setupPool.query(
        `INSERT INTO uploads (
           owner_id, storage_name, mime_type, byte_size, purpose, visibility,
           listing_id, content_sha256, content_scan_status
         ) VALUES ($1, $2, 'image/webp', 1, 'listing_image', 'public', $3, $4, 'passed')`,
        [listingOwnerId, `${crypto.randomUUID()}-p5.webp`, listingId, 'd'.repeat(64)],
      );

      const legacyCart = await setupPool.query(
        'INSERT INTO rental_carts (user_id) VALUES ($1) RETURNING id', [renterId],
      );
      await setupPool.query(
        `INSERT INTO rental_cart_projects (cart_id, client_project_id, title, answers, sort_order)
         VALUES ($1, 'p5_legacy_project', 'Legacy unchanged', '{"legacy":true}'::jsonb, 9)`,
        [legacyCart.rows[0].id],
      );
      const legacySnapshot = async () => (await setupPool.query(
        `SELECT jsonb_build_object(
           'cart', (SELECT to_jsonb(c) FROM rental_carts c WHERE c.id = $1),
           'projects', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
                         FROM rental_cart_projects p WHERE p.cart_id = $1)
         ) AS value`,
        [legacyCart.rows[0].id],
      )).rows[0].value;
      const legacyBefore = await legacySnapshot();
      const effects = async () => (await setupPool.query(
        `SELECT (SELECT count(*)::int FROM bookings) AS bookings,
                (SELECT count(*)::int FROM rental_requests) AS requests,
                (SELECT count(*)::int FROM booking_quotes) AS quotes,
                (SELECT count(*)::int FROM platform_contracts) AS contracts,
                (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0];
      const effectsBefore = await effects();

      const { buildAccountExport } = await import('../src/privacy_export.js');
      const { createApp, eraseAccount } = await import('../src/app.js');
      const { missionInventoryResolutionDigest } = await import(
        '../src/mission_inventory_resolution_workflow.js'
      );
      const { pool, inTransaction } = await import('../src/db.js');
      const { signAccessToken } = await import('../src/security.js');
      applicationPool = pool;
      const tokenFor = (id, sessionId) => signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId },
      );
      const tokens = [renterId, otherId, deletionId].map((id, index) => (
        tokenFor(id, sessions[index])
      ));
      const auth = (token) => ({ Authorization: `Bearer ${token}` });
      const json = (token, key) => ({
        ...auth(token),
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      });
      const startServer = async () => {
        server = http.createServer(createApp());
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${server.address().port}`;
      };
      const stopServer = async () => {
        if (!server) return;
        await new Promise((resolve, reject) => server.close((error) => (
          error ? reject(error) : resolve()
        )));
        server = null;
      };
      let baseUrl = await startServer();
      const startDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
        .toISOString().slice(0, 10);
      const endDate = new Date(Date.now() + (32 * 24 * 60 * 60 * 1000))
        .toISOString().slice(0, 10);
      const missionPayload = {
        title: 'P5 inventory mission',
        status: 'planned',
        needs: [
          { needKey: 'plant_container_equipment', necessity: 'required', quantity: 2 },
          { needKey: 'unsupported_custom_need', necessity: 'optional', quantity: 1 },
        ],
      };
      const createMission = async (token, key, payload = missionPayload) => {
        const response = await fetch(`${baseUrl}/v1/mission-needs`, {
          method: 'POST', headers: json(token, key), body: JSON.stringify(payload),
        });
        assert.equal(response.status, 201);
        return (await response.json()).missionNeed;
      };
      const mission = await createMission(tokens[0], 'p5-mission-create-0001');
      const request = {
        missionRevision: mission.revision,
        missionPayloadDigest: mission.payloadDigest,
        startDate,
        endDate,
        location: {
          latitudeE5: 4_914_000,
          longitudeE5: 922_000,
          radiusKm: 25,
          sourceVersion: 'owner-location-v1',
          ownerConfirmed: true,
        },
      };
      const create = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/inventory-resolutions`,
        {
          method: 'POST', headers: json(tokens[0], 'p5-inventory-create-0001'),
          body: JSON.stringify(request),
        },
      );
      assert.equal(create.status, 201);
      assert.match(create.headers.get('cache-control'), /no-store/u);
      const created = (await create.json()).resolution;
      assert.match(created.resolutionId, /^mission_inventory_[0-9a-f-]{36}$/u);
      assert.equal(created.currentApplicability, 'current_snapshot_inputs');
      assert.equal(created.currentStatus, 'current_non_binding_preview');
      assert.equal(created.quoteRevalidationRequired, false);
      assert.equal(created.storedResolution.coverage[0].requestedQuantity, 2);
      assert.equal(created.storedResolution.coverage[0].coveredQuantity, 1);
      assert.equal(created.storedResolution.coverage[0].gapQuantity, 1);
      assert.equal(created.storedResolution.requiredCoverageComplete, false);
      assert.equal(created.storedResolution.slots.filter((slot) => slot.assignment).length, 1);
      assert.equal(created.storedResolution.slots.at(-1).gapReason, 'unsupported_need_key');
      assert.equal(Object.hasOwn(created, 'storedResolutionDigest'), false);
      assert.equal(
        created.locationSnapshotDigest,
        missionInventoryResolutionDigest(created.locationSnapshot),
      );
      assert.equal(created.locationSnapshot.exactCoordinatesStored, false);
      assert.equal(JSON.stringify(created).includes('latitudeE5'), false);
      assert.equal(JSON.stringify(created).includes('longitudeE5'), false);
      assert.equal(JSON.stringify(created).includes('handoverLocationKey'), false);
      for (const key of [
        'reservationCreated', 'bookingCreated', 'contractCreated', 'paymentCreated',
        'publicShelfCreated', 'publicListingCreated', 'automaticPublicationPerformed',
        'externalGenerativeAiUsed',
      ]) assert.equal(created[key], false);

      const replay = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/inventory-resolutions`,
        {
          method: 'POST', headers: json(tokens[0], 'p5-inventory-create-0001'),
          body: JSON.stringify(request),
        },
      );
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).resolution.resolutionId, created.resolutionId);
      const collision = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/inventory-resolutions`,
        {
          method: 'POST', headers: json(tokens[0], 'p5-inventory-create-0001'),
          body: JSON.stringify({
            ...request, location: { ...request.location, radiusKm: 26 },
          }),
        },
      );
      assert.equal(collision.status, 409);
      assert.equal((await collision.json()).error, 'mission_inventory_idempotency_key_reused');

      const foreignRead = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[1]) },
      );
      assert.equal(foreignRead.status, 404);
      assert.equal((await foreignRead.json()).error, 'mission_inventory_resolution_not_found');
      const foreignList = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/inventory-resolutions`,
        { headers: auth(tokens[1]) },
      );
      assert.equal(foreignList.status, 404);

      const revisionBodies = [30, 35].map((radiusKm) => ({
        ...request,
        expectedRevision: 1,
        location: { ...request.location, radiusKm },
      }));
      const concurrent = await Promise.all(revisionBodies.map((body, index) => fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}/revisions`,
        {
          method: 'POST', headers: json(tokens[0], `p5-revise-concurrent-000${index + 1}`),
          body: JSON.stringify(body),
        },
      )));
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);

      await stopServer();
      baseUrl = await startServer();
      const restart = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[0]) },
      );
      assert.equal(restart.status, 200);
      const restarted = (await restart.json()).resolution;
      assert.equal(restarted.revision, 2);
      const historicalQuoteHash = restarted.storedResolution.slots
        .find((slot) => slot.assignment).assignment.quote.quoteHash;

      await setupPool.query(
        `UPDATE listings
            SET price_per_day_minor = 1100, catalog_revision = catalog_revision + 1
          WHERE id = $1`,
        [listingId],
      );
      const quoteDriftResponse = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[0]) },
      );
      assert.equal(quoteDriftResponse.status, 200);
      const quoteDrift = (await quoteDriftResponse.json()).resolution;
      assert.equal(quoteDrift.currentApplicability, 'stale');
      assert.ok(quoteDrift.driftReasons.includes('listing_catalog_changed'));
      assert.ok(quoteDrift.driftReasons.includes('quote_snapshot_changed'));
      assert.equal(
        quoteDrift.storedResolution.slots.find((slot) => slot.assignment).assignment.quote.quoteHash,
        historicalQuoteHash,
      );

      await setupPool.query(
        `UPDATE listings
            SET price_per_day_minor = 1000,
                catalog_revision = 1,
                location_text = 'Changed private handover text'
          WHERE id = $1`,
        [listingId],
      );
      const locationDriftResponse = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[0]) },
      );
      const locationDrift = (await locationDriftResponse.json()).resolution;
      assert.deepEqual(locationDrift.driftReasons, ['listing_location_changed']);

      await setupPool.query(
        'UPDATE users SET deactivated_at = now() WHERE id = $1',
        [listingOwnerId],
      );
      const ownerEligibilityDrift = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[0]) },
      );
      assert.ok((await ownerEligibilityDrift.json()).resolution.driftReasons
        .includes('listing_no_longer_candidate'));
      await setupPool.query(
        'UPDATE users SET deactivated_at = NULL WHERE id = $1',
        [listingOwnerId],
      );

      await setupPool.query(
        `INSERT INTO listing_availability_blocks (
           listing_id, created_by, kind, starts_at, ends_at, reason
         ) VALUES ($1, $2, 'owner_block', $3::date, $4::date, 'P5 collision proof')`,
        [listingId, listingOwnerId, startDate, endDate],
      );
      const unavailableResponse = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[0]) },
      );
      assert.equal(unavailableResponse.status, 200);
      const unavailable = (await unavailableResponse.json()).resolution;
      assert.ok(unavailable.driftReasons.includes('listing_unavailable_or_quote_rejected'));

      const missionCorrection = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/revisions`,
        {
          method: 'POST', headers: json(tokens[0], 'p5-mission-revise-0001'),
          body: JSON.stringify({
            expectedRevision: 1,
            ...missionPayload,
            title: 'P5 inventory mission changed',
          }),
        },
      );
      assert.equal(missionCorrection.status, 201);
      const missionDriftResponse = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${created.resolutionId}`,
        { headers: auth(tokens[0]) },
      );
      assert.ok((await missionDriftResponse.json()).resolution.driftReasons
        .includes('mission_snapshot_changed'));

      const revisionRow = await setupPool.query(
        `SELECT revision.id
           FROM mission_inventory_resolution_revisions AS revision
          WHERE revision.resolution_id = $1 AND revision.revision = 2`,
        [created.resolutionId],
      );
      const assignedRow = await setupPool.query(
        `SELECT * FROM mission_inventory_resolution_assignments
          WHERE revision_id = $1 AND listing_id IS NOT NULL`,
        [revisionRow.rows[0].id],
      );
      const assignment = assignedRow.rows[0];
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_inventory_resolution_assignments (
             revision_id, resolution_id, resolution_revision, slot_key, need_key,
             necessity, slot_ordinal, listing_id, listing_snapshot, quote_snapshot
           ) VALUES ($1, $2, 2, 'required:plant_container_equipment:99',
             'plant_container_equipment', 'required', 99, $3, $4::jsonb, $5::jsonb)`,
          [revisionRow.rows[0].id, created.resolutionId, listingId,
            JSON.stringify(assignment.listing_snapshot), JSON.stringify(assignment.quote_snapshot)],
        ),
        (error) => error.code === '23505',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_inventory_resolutions (
             id, owner_id, mission_need_id, domain_version,
             planner_core_version, planner_inventory_version
           ) VALUES ($1, $2, $3, 'P5-A-2026-10-01.1',
             'G4A-2026-08-21.1', 'G4B-2026-08-21.1')`,
          [`mission_inventory_${crypto.randomUUID()}`, otherId, mission.missionNeedId],
        ),
        (error) => error.code === '23503',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_inventory_resolution_revisions (
             resolution_id, mission_need_id, revision, mission_need_revision,
             mission_payload_sha256, start_date, end_date, location_snapshot,
             location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256
           ) SELECT resolution_id, mission_need_id, 4, mission_need_revision,
                    mission_payload_sha256, start_date, end_date, location_snapshot,
                    location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256
               FROM mission_inventory_resolution_revisions
              WHERE resolution_id = $1 AND revision = 2`,
          [created.resolutionId],
        ),
        (error) => error.code === '23514',
      );

      const exported = await buildAccountExport(setupPool, renterId);
      const exportedP5 = exported.data.marketplace.missionInventory;
      assert.equal(exportedP5.roots.length, 1);
      assert.equal(exportedP5.revisions.length, 2);
      assert.equal(exportedP5.assignments.length, 6);
      assert.equal(exportedP5.commands.length, 2);
      assert.match(exportedP5.roots[0].missionInventoryId, /^ref_\d{6}$/u);
      assert.equal(
        exportedP5.revisions[0].missionInventoryId,
        exportedP5.roots[0].missionInventoryId,
      );
      assert.ok(exportedP5.revisions[0].inventorySnapshot);
      assert.equal(
        exportedP5.assignments[0].missionInventoryId,
        exportedP5.roots[0].missionInventoryId,
      );
      assert.equal(
        exportedP5.commands[0].missionInventoryId,
        exportedP5.roots[0].missionInventoryId,
      );
      assert.equal(exportedP5.exactSearchCoordinatesStored, false);
      assert.equal(JSON.stringify(exportedP5).includes('latitudeE5'), false);
      assert.equal(JSON.stringify(exportedP5).includes('handoverLocationKey'), false);
      assert.equal(
        exportedP5.revisions.some((revision) => Object.hasOwn(revision, 'inventorySnapshotDigest')),
        false,
      );
      assert.equal(JSON.stringify(exportedP5).includes('resolution'), false);
      assert.deepEqual(await effects(), effectsBefore);
      assert.deepEqual(await legacySnapshot(), legacyBefore);
      const publicCatalog = await fetch(`${baseUrl}/v1/listings?sort=newest&limit=100&offset=0`);
      assert.equal(publicCatalog.status, 200);
      assert.doesNotMatch(JSON.stringify(await publicCatalog.json()), /mission_inventory_/u);

      await setupPool.query('DELETE FROM listing_availability_blocks WHERE listing_id = $1', [listingId]);
      const deletionMission = await createMission(tokens[2], 'p5-delete-mission-0001', {
        ...missionPayload,
        needs: [{ needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 }],
      });
      const deletionResolution = await fetch(
        `${baseUrl}/v1/mission-needs/${deletionMission.missionNeedId}/inventory-resolutions`,
        {
          method: 'POST', headers: json(tokens[2], 'p5-delete-resolution-0001'),
          body: JSON.stringify({
            ...request,
            missionRevision: deletionMission.revision,
            missionPayloadDigest: deletionMission.payloadDigest,
          }),
        },
      );
      assert.equal(deletionResolution.status, 201);
      const deletionResolutionId = (await deletionResolution.json()).resolution.resolutionId;
      await inTransaction((client) => eraseAccount(client, { id: deletionId }));
      const deleted = await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM mission_inventory_resolutions
             WHERE owner_id = $1) AS roots,
           (SELECT count(*)::int FROM mission_inventory_resolution_revisions
             WHERE resolution_id = $2) AS revisions,
           (SELECT count(*)::int FROM mission_inventory_resolution_assignments
             WHERE resolution_id = $2) AS assignments,
           (SELECT count(*)::int FROM mission_inventory_resolution_commands
             WHERE owner_id = $1) AS commands`,
        [deletionId, deletionResolutionId],
      );
      assert.deepEqual(deleted.rows[0], { roots: 0, revisions: 0, assignments: 0, commands: 0 });

      await assert.rejects(
        setupPool.query(await fs.readFile(
          new URL('../sql/migrations/102_mission_inventory_resolutions.down.sql', import.meta.url),
          'utf8',
        )),
        (error) => error.code === '55000'
          && /mission_inventory_resolution_rows_active/u.test(error.message),
      );
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM mission_inventory_resolutions WHERE owner_id = $1',
        [renterId],
      )).rows[0].count, 1);
      await stopServer();
    } finally {
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      await setupPool.end().catch(() => {});
      if (applicationPool) await applicationPool.end().catch(() => {});
    }
  });
}
