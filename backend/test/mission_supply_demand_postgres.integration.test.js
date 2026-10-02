import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('mission supply demand PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P6-A keeps one server-selected demand private, replay-safe and revocable', async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory',
      PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'true',
      PLANNER_DEMAND_ENABLED: 'true',
      PRIVATE_PILOT_V4_ENABLED: 'false',
    });
    const setupPool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    let applicationPool;
    let server;
    let lifecycleServer;
    let limiterServer;
    try {
      await setupPool.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setupPool);
      await runMigrations(setupPool);
      const terminal = await setupPool.query('SELECT name FROM schema_migrations ORDER BY name');
      assert.equal(terminal.rows.at(-1).name, '104_mission_supply_participation.up.sql');

      const requesterId = `p6-requester-${crypto.randomUUID()}`;
      const recipientId = `p6-recipient-${crypto.randomUUID()}`;
      const foreignId = `p6-foreign-${crypto.randomUUID()}`;
      const deleteId = `p6-delete-${crypto.randomUUID()}`;
      const userIds = [requesterId, recipientId, foreignId, deleteId];
      await setupPool.query(
        `INSERT INTO users (
           id, email, profile, role, account_status, email_verified_at,
           private_use_confirmed_at, private_marketplace_review_status
         ) SELECT id, email, jsonb_build_object('displayName', name), 'user', 'active',
                  now(), now(), 'clear'
             FROM unnest($1::text[], $2::text[], $3::text[]) AS input(id, email, name)`,
        [userIds, userIds.map((id) => `${id}@example.invalid`),
          ['P6 requester', 'P6 recipient', 'P6 foreign', 'P6 delete requester']],
      );
      const sessionIds = userIds.map(() => crypto.randomUUID());
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         SELECT id::uuid, user_id, 'P6 source-only'
           FROM unnest($1::text[], $2::text[]) AS input(id, user_id)`,
        [sessionIds, userIds],
      );

      const shelfItemId = `shelf_item_${crypto.randomUUID()}`;
      await setupPool.query(
        `INSERT INTO private_shelf_items (
           id, owner_id, domain_version, title, category_key, condition
         ) VALUES ($1, $2, 'P3-A-2026-10-01.1',
           'Private synthetic container', 'private.plant.container', 'good')`,
        [shelfItemId, recipientId],
      );

      const {
        createMissionSupplyDemand,
        getMissionSupplyDemand,
        missionSupplyDemandDigest,
        respondToMissionSupplyDemand,
      } = await import('../src/mission_supply_demand_workflow.js');

      const futureDate = (days) => new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
      const startDate = futureDate(30).toISOString().slice(0, 10);
      const endDate = futureDate(32).toISOString().slice(0, 10);
      const expiresAt = futureDate(10).toISOString();
      const region = Object.freeze({
        sourceType: 'owner_confirmed_search_origin',
        sourceVersion: 'p6-synthetic-origin-v1',
        ownerConfirmed: true,
        radiusKm: 25,
        coordinateDigest: 'a'.repeat(64),
        exactCoordinatesStored: false,
      });
      const regionDigest = missionSupplyDemandDigest(region);

      const insertGap = async (ownerId, ordinal) => {
        const missionId = `mission_need_${crypto.randomUUID()}`;
        const resolutionId = `mission_inventory_${crypto.randomUUID()}`;
        const slotKey = `required:plant_container_equipment:${ordinal}`;
        const payload = {
          title: `P6 synthetic mission ${ordinal}`,
          status: 'planned',
          needs: [{ needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 }],
        };
        const payloadDigest = missionSupplyDemandDigest(payload);
        const resolutionSnapshot = {
          coverage: [{
            needKey: 'plant_container_equipment', necessity: 'required',
            requestedQuantity: 1, coveredQuantity: 0, gapQuantity: 1,
          }],
          slots: [{
            slotKey, needKey: 'plant_container_equipment', necessity: 'required',
            ordinal, status: 'gap', gapReason: 'no_current_unique_candidate', assignment: null,
          }],
          requiredCoverageComplete: false,
          searchLimited: false,
          quotePersisted: false,
          revalidationRequiredBeforeRequest: true,
          bindingStatus: 'non_binding',
          reservationCreated: false,
          bookingCreated: false,
          contractCreated: false,
          paymentCreated: false,
          publicShelfCreated: false,
          publicListingCreated: false,
          automaticPublicationPerformed: false,
          externalGenerativeAiUsed: false,
        };
        await setupPool.query(
          `INSERT INTO mission_needs (id, owner_id, domain_version, status)
           VALUES ($1, $2, 'P2-A-2026-10-01.1', 'planned')`,
          [missionId, ownerId],
        );
        await setupPool.query(
          `INSERT INTO mission_need_revisions (
             mission_need_id, revision, status, payload, payload_sha256
           ) VALUES ($1, 1, 'planned', $2::jsonb, $3)`,
          [missionId, JSON.stringify(payload), payloadDigest],
        );
        await setupPool.query(
          `INSERT INTO mission_inventory_resolutions (
             id, owner_id, mission_need_id, domain_version,
             planner_core_version, planner_inventory_version
           ) VALUES ($1, $2, $3, 'P5-A-2026-10-01.1',
             'G4A-2026-08-21.1', 'G4B-2026-08-21.1')`,
          [resolutionId, ownerId, missionId],
        );
        const revision = await setupPool.query(
          `INSERT INTO mission_inventory_resolution_revisions (
             resolution_id, mission_need_id, revision, mission_need_revision,
             mission_payload_sha256, start_date, end_date, location_snapshot,
             location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256
           ) VALUES ($1, $2, 1, 1, $3, $4::date, $5::date, $6::jsonb, $7,
             $8::jsonb, $9) RETURNING id`,
          [resolutionId, missionId, payloadDigest, startDate, endDate,
            JSON.stringify(region), regionDigest, JSON.stringify(resolutionSnapshot),
            missionSupplyDemandDigest(resolutionSnapshot)],
        );
        await setupPool.query(
          `INSERT INTO mission_inventory_resolution_assignments (
             revision_id, resolution_id, resolution_revision, slot_key, need_key,
             necessity, slot_ordinal, gap_reason
           ) VALUES ($1, $2, 1, $3, 'plant_container_equipment', 'required', $4,
             'no_current_unique_candidate')`,
          [revision.rows[0].id, resolutionId, slotKey, ordinal],
        );
        return {
          missionId,
          resolutionId,
          slotKey,
          payload,
          payloadDigest,
          resolutionSnapshot,
        };
      };

      const effects = async () => (await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM listings) AS listings,
           (SELECT count(*)::int FROM notifications) AS notifications,
           (SELECT count(*)::int FROM notification_outbox) AS outbox,
           (SELECT count(*)::int FROM rental_requests) AS requests,
           (SELECT count(*)::int FROM bookings) AS bookings,
           (SELECT count(*)::int FROM platform_contracts) AS contracts,
           (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0];
      const effectsBefore = await effects();

      const { createApp, eraseAccount } = await import('../src/app.js');
      const { pool, inTransaction } = await import('../src/db.js');
      const { signAccessToken } = await import('../src/security.js');
      const { buildAccountExport } = await import('../src/privacy_export.js');
      applicationPool = pool;
      const tokens = Object.fromEntries(userIds.map((id, index) => [id, signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId: sessionIds[index] },
      )]));
      const auth = (id) => ({ Authorization: `Bearer ${tokens[id]}` });
      const json = (id, key) => ({
        ...auth(id),
        'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      });
      let resolverCalls = 0;
      const recipientShelfBySlot = new Map();
      const resolver = async (_client, input) => {
        resolverCalls += 1;
        assert.equal(Object.hasOwn(input, 'recipientOwnerId'), false);
        assert.equal(Object.hasOwn(input, 'shelfItemId'), false);
        assert.equal(input.needKey, 'plant_container_equipment');
        return {
          recipientOwnerId: recipientId,
          shelfItemId: recipientShelfBySlot.get(input.slotKey) ?? shelfItemId,
          needKey: input.needKey,
          purpose: input.purpose,
          eligibilityVersion: 'p6-synthetic-resolver-v1',
        };
      };
      server = http.createServer(createApp({ resolveMissionSupplyRecipient: resolver }));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      let baseUrl = `http://127.0.0.1:${server.address().port}`;

      const createDemand = async (gap, key, overrides = {}) => fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${gap.resolutionId}/supply-demands`,
        {
          method: 'POST',
          headers: json(requesterId, key),
          body: JSON.stringify({
            resolutionRevision: 1,
            slotKey: gap.slotKey,
            purpose: 'mission_gap_supply_v1',
            expiresAt,
            ...overrides,
          }),
        },
      );
      const releaseDirect = (demandId, key) => inTransaction((client) => (
        respondToMissionSupplyDemand(client, {
          actorId: recipientId,
          demandId,
          raw: { expectedRevision: 1, decision: 'release' },
          idempotencyKey: key,
        })
      ));
      const createDirect = (gap, key, now, { actorId = requesterId, ...overrides } = {}) => (
        inTransaction((client) => createMissionSupplyDemand(client, {
          actorId, resolutionId: gap.resolutionId, idempotencyKey: key,
          raw: {
            resolutionRevision: 1, slotKey: gap.slotKey,
            purpose: 'mission_gap_supply_v1', expiresAt, ...overrides,
          },
          recipientResolver: resolver, now,
        }))
      );
      const demandCounts = async () => (await setupPool.query(
        `SELECT
           (SELECT count(*)::int FROM mission_supply_demands) AS demands,
           (SELECT count(*)::int FROM mission_supply_demand_commands) AS commands,
           (SELECT count(*)::int FROM mission_supply_demand_revisions) AS revisions,
           (SELECT count(*)::int FROM mission_supply_releases) AS releases`,
      )).rows[0];

      const firstGap = await insertGap(requesterId, 1);
      const clientSelected = await createDemand(firstGap, 'p6-client-selection-0001', {
        recipientOwnerId: recipientId,
      });
      assert.equal(clientSelected.status, 400);
      assert.equal((await clientSelected.json()).error, 'mission_supply_request_fields_invalid');
      assert.equal(resolverCalls, 0);

      const createdResponse = await createDemand(firstGap, 'p6-create-demand-0001');
      assert.equal(createdResponse.status, 201);
      assert.match(createdResponse.headers.get('cache-control'), /no-store/u);
      const created = (await createdResponse.json()).demand;
      assert.match(created.demandId, /^mission_demand_[0-9a-f-]{36}$/u);
      assert.equal(created.participantRole, 'requester');
      assert.equal(created.status, 'pending');
      assert.deepEqual(created.need, {
        needKey: 'plant_container_equipment', necessity: 'required', quantity: 1,
      });
      assert.equal(created.region.exactCoordinatesStored, false);
      const createdJson = JSON.stringify(created);
      for (const privateValue of [recipientId, shelfItemId, 'Private synthetic container']) {
        assert.equal(createdJson.includes(privateValue), false);
      }
      for (const forbiddenKey of [
        'recipientOwnerId', 'shelfItemId', 'ownerEmail', 'photos', 'address',
        'latitudeE5', 'longitudeE5',
      ]) assert.equal(createdJson.includes(forbiddenKey), false);
      for (const key of [
        'publicShelfCreated', 'publicListingCreated', 'marketingContactCreated',
        'notificationCreated', 'providerNotificationSent',
        'automaticPublicationPerformed', 'reservationCreated', 'bookingCreated',
        'contractCreated', 'paymentCreated', 'externalGenerativeAiUsed',
      ]) assert.equal(created[key], false);

      const replay = await createDemand(firstGap, 'p6-create-demand-0001');
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).demand.demandId, created.demandId);
      assert.equal(resolverCalls, 1);
      const collision = await createDemand(firstGap, 'p6-create-demand-0001', {
        expiresAt: futureDate(11).toISOString(),
      });
      assert.equal(collision.status, 409);
      assert.equal((await collision.json()).error, 'mission_supply_idempotency_key_reused');
      const duplicateGap = await createDemand(firstGap, 'p6-create-demand-0002');
      assert.equal(duplicateGap.status, 409);
      assert.equal((await duplicateGap.json()).error, 'mission_supply_gap_demand_exists');

      const foreign = await fetch(
        `${baseUrl}/v1/mission-supply-demands/${created.demandId}`,
        { headers: auth(foreignId) },
      );
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).error, 'mission_supply_demand_not_found');
      const recipientList = await fetch(`${baseUrl}/v1/mission-supply-demands`, {
        headers: auth(recipientId),
      });
      assert.equal(recipientList.status, 200);
      const recipientDemand = (await recipientList.json()).demands[0];
      assert.equal(recipientDemand.participantRole, 'recipient');
      const recipientJson = JSON.stringify(recipientDemand);
      assert.equal(recipientJson.includes(requesterId), false);
      for (const hidden of [
        'missionNeedId', 'resolutionId', 'resolutionRevision', 'slotKey',
      ]) assert.equal(Object.hasOwn(recipientDemand, hidden), false);
      assert.equal(recipientJson.includes('coordinateDigest'), false);
      assert.equal(recipientJson.includes('sourceVersion'), false);
      assert.deepEqual(recipientDemand.region, {
        sourceType: 'owner_confirmed_search_origin',
        radiusKm: 25,
        exactCoordinatesStored: false,
      });

      const releaseResponse = await fetch(
        `${baseUrl}/v1/mission-supply-demands/${created.demandId}/respond`,
        {
          method: 'POST', headers: json(recipientId, 'p6-release-demand-0001'),
          body: JSON.stringify({ expectedRevision: 1, decision: 'release' }),
        },
      );
      assert.equal(releaseResponse.status, 201);
      const released = (await releaseResponse.json()).demand;
      assert.equal(released.status, 'released');
      assert.equal(released.requestBoundRelease.purpose, 'mission_gap_supply_v1');
      assert.equal(released.requestBoundRelease.visibilityStatus, 'active');
      assert.equal(JSON.stringify(released).includes(shelfItemId), false);
      const expiredReleaseReplay = await createDirect(
        firstGap, 'p6-create-demand-0001', new Date(expiresAt),
      );
      assert.equal(expiredReleaseReplay.replayed, true);
      assert.equal(expiredReleaseReplay.demand.status, 'released');
      assert.equal(expiredReleaseReplay.demand.revision, 2);
      assert.equal(expiredReleaseReplay.demand.requestBoundRelease.visibilityStatus, 'expired');
      const releaseReplay = await fetch(
        `${baseUrl}/v1/mission-supply-demands/${created.demandId}/respond`,
        {
          method: 'POST', headers: json(recipientId, 'p6-release-demand-0001'),
          body: JSON.stringify({ expectedRevision: 1, decision: 'release' }),
        },
      );
      assert.equal(releaseReplay.status, 200);
      assert.equal((await releaseReplay.json()).demand.revision, 2);

      lifecycleServer = http.createServer(createApp());
      await new Promise((resolve) => lifecycleServer.listen(0, '127.0.0.1', resolve));
      const lifecycleBaseUrl = `http://127.0.0.1:${lifecycleServer.address().port}`;
      const lifecycleList = await fetch(`${lifecycleBaseUrl}/v1/mission-supply-demands`, {
        headers: auth(recipientId),
      });
      assert.equal(lifecycleList.status, 200);
      assert.ok((await lifecycleList.json()).demands.some(
        (demand) => demand.demandId === created.demandId,
      ));
      const lifecycleLoad = await fetch(
        `${lifecycleBaseUrl}/v1/mission-supply-demands/${created.demandId}`,
        { headers: auth(recipientId) },
      );
      assert.equal(lifecycleLoad.status, 200);
      assert.equal((await lifecycleLoad.json()).demand.demandId, created.demandId);
      const noResolverCreate = await fetch(
        `${lifecycleBaseUrl}/v1/mission-inventory-resolutions/${firstGap.resolutionId}/supply-demands`,
        {
          method: 'POST', headers: json(requesterId, 'p6-no-resolver-create-0001'),
          body: JSON.stringify({
            resolutionRevision: 1, slotKey: firstGap.slotKey,
            purpose: 'mission_gap_supply_v1', expiresAt,
          }),
        },
      );
      assert.equal(noResolverCreate.status, 404);
      assert.equal((await noResolverCreate.json()).error, 'mission_supply_demand_not_enabled');

      const adminId = `p6-revoke-admin-${crypto.randomUUID()}`;
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status)
         VALUES ($1, $2, '{}'::jsonb, 'admin', 'active')`,
        [adminId, `${adminId}@example.invalid`],
      );
      const { setUserSuspension } = await import('../src/moderation_workflow.js');
      const suspensionEndsAt = futureDate(1).toISOString();
      const suspend = (userId, scope) => inTransaction((client) => setUserSuspension(client, {
        actor: { id: adminId, role: 'admin' }, userId, idempotencyKey: crypto.randomUUID(),
        raw: { scope, reasonCode: 'synthetic_test',
          ...(scope === 'account' ? { provisional: true, endsAt: suspensionEndsAt } : {}),
          decision: {
            facts: 'Synthetic fixture for safe mission release revocation.',
            basis: 'Synthetic test fixture only.',
            reasoning: 'Verify suspension boundaries in an isolated database.',
            detectionMethod: 'human', statementOfReasons: {
              decisionGround: 'terms_violation', decisionOrigin: 'notice',
              territorialScope: 'Synthetic isolated test only.',
              durationType: scope === 'account' ? 'fixed' : 'until_reversed',
              ...(scope === 'account' ? { endsAt: suspensionEndsAt } : {}),
              automationRole: 'none',
            },
          },
        },
      }));
      const bookingSuspension = await suspend(recipientId, 'booking');
      const revoke = (actor = recipientId, expectedRevision = 2,
        key = crypto.randomUUID(), id = created.demandId) => fetch(
        `${lifecycleBaseUrl}/v1/mission-supply-demands/${id}/revoke`, {
          method: 'POST', headers: json(actor, key),
          body: JSON.stringify({ expectedRevision }),
        },
      );
      const expectError = async (pending, status, code) => {
        const response = await pending;
        assert.equal(response.status, status);
        assert.equal((await response.json()).error, code);
      };
      const countsBeforeRevoke = await demandCounts();
      const resolverCallsBeforeRevoke = resolverCalls;
      const revokeEffectsBefore = await effects();
      for (const actor of [requesterId, foreignId]) {
        await expectError(revoke(actor), 404, 'mission_supply_demand_not_found');
      }
      await expectError(revoke(recipientId, 2, crypto.randomUUID(),
        `mission_demand_${crypto.randomUUID()}`), 404, 'mission_supply_demand_not_found');
      await expectError(revoke(recipientId, 1), 409, 'mission_supply_revision_conflict');
      await expectError(fetch(
        `${lifecycleBaseUrl}/v1/mission-supply-demands/${created.demandId}/revoke`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: 2 }),
        },
      ), 401, 'authentication_required');
      for (const suffix of ['', `/${created.demandId}`]) {
        await expectError(fetch(`${lifecycleBaseUrl}/v1/mission-supply-demands${suffix}`, {
          headers: auth(recipientId),
        }), 403, 'action_blocked_by_moderation');
      }
      for (const decision of ['release', 'reject']) {
        await expectError(fetch(
          `${lifecycleBaseUrl}/v1/mission-supply-demands/${created.demandId}/respond`, {
            method: 'POST', headers: json(recipientId, crypto.randomUUID()),
            body: JSON.stringify({ expectedRevision: 2, decision }),
          },
        ), 403, 'action_blocked_by_moderation');
      }
      const requesterSuspension = await suspend(requesterId, 'booking');
      await expectError(fetch(
        `${lifecycleBaseUrl}/v1/mission-inventory-resolutions/${firstGap.resolutionId}/supply-demands`, {
          method: 'POST', headers: json(requesterId, 'p6-suspended-create-0001'),
          body: JSON.stringify({
            resolutionRevision: 1, slotKey: firstGap.slotKey,
            purpose: 'mission_gap_supply_v1', expiresAt,
          }),
        },
      ), 403, 'action_blocked_by_moderation');
      await setupPool.query('DELETE FROM user_suspensions WHERE id = $1', [requesterSuspension.suspension.id]);
      await setupPool.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [sessionIds[1]]);
      await expectError(revoke(), 401, 'account_not_active');
      await setupPool.query('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [sessionIds[1]]);
      await setupPool.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [recipientId]);
      await expectError(revoke(), 401, 'account_not_active');
      await setupPool.query("UPDATE users SET account_status = 'active', deactivated_at = now() WHERE id = $1", [recipientId]);
      await expectError(revoke(), 401, 'account_not_active');
      await setupPool.query('UPDATE users SET deactivated_at = NULL WHERE id = $1', [recipientId]);
      const { encryptTotpSecret, generateTotpSecret } = await import('../src/mfa_totp.js');
      await setupPool.query(
        `INSERT INTO mfa_totp_factors (user_id, status, enabled_at, encrypted_secret)
         VALUES ($1, 'enabled', now(), $2)`,
        [recipientId, encryptTotpSecret(generateTotpSecret(), crypto.randomBytes(32))],
      );
      await expectError(revoke(), 401, 'account_not_active');
      await setupPool.query('DELETE FROM mfa_totp_factors WHERE user_id = $1', [recipientId]);
      const accountSuspension = await suspend(recipientId, 'account');
      await expectError(revoke(), 401, 'account_not_active');
      // Isolate the account-scope guard even if an otherwise active session exists.
      await setupPool.query("UPDATE users SET account_status = 'active' WHERE id = $1", [recipientId]);
      await setupPool.query('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [sessionIds[1]]);
      await expectError(revoke(), 403, 'action_blocked_by_moderation');
      await setupPool.query('DELETE FROM user_suspensions WHERE id = $1', [accountSuspension.suspension.id]);
      assert.deepEqual(await demandCounts(), countsBeforeRevoke);
      const revokeResponse = await fetch(
        `${lifecycleBaseUrl}/v1/mission-supply-demands/${created.demandId}/revoke`,
        {
          method: 'POST', headers: json(recipientId, 'p6-revoke-demand-0001'),
          body: JSON.stringify({ expectedRevision: 2 }),
        },
      );
      assert.equal(revokeResponse.status, 201);
      const revoked = (await revokeResponse.json()).demand;
      assert.equal(revoked.status, 'revoked');
      assert.equal(revoked.revision, 3);
      assert.equal(revoked.requestBoundRelease.visibilityStatus, 'revoked');
      assert.match(revokeResponse.headers.get('cache-control'), /no-store/u);
      const countsAfterRevoke = await demandCounts();
      assert.deepEqual(countsAfterRevoke, {
        ...countsBeforeRevoke,
        revisions: countsBeforeRevoke.revisions + 1,
        commands: countsBeforeRevoke.commands + 1,
      });
      const revokeReplay = await revoke(recipientId, 2, 'p6-revoke-demand-0001');
      assert.equal(revokeReplay.status, 200);
      const replayedRevoke = await revokeReplay.json();
      assert.equal(replayedRevoke.replayed, true);
      assert.deepEqual(replayedRevoke.demand, revoked);
      await expectError(revoke(recipientId, 3, 'p6-revoke-demand-0001'),
        409, 'mission_supply_idempotency_key_reused');
      const requesterRevoked = await fetch(
        `${lifecycleBaseUrl}/v1/mission-supply-demands/${created.demandId}`,
        { headers: auth(requesterId) },
      );
      assert.equal(requesterRevoked.status, 200);
      const requesterRevokedDemand = (await requesterRevoked.json()).demand;
      assert.equal(requesterRevokedDemand.status, 'revoked');
      assert.equal(requesterRevokedDemand.requestBoundRelease.visibilityStatus, 'revoked');
      assert.deepEqual(await demandCounts(), countsAfterRevoke);
      assert.equal(resolverCalls, resolverCallsBeforeRevoke);
      assert.deepEqual(await effects(), revokeEffectsBefore);
      await setupPool.query('DELETE FROM user_suspensions WHERE id = $1', [bookingSuspension.suspension.id]);

      const lifecycleGap = await insertGap(requesterId, 13);
      const lifecycleCreate = await createDemand(
        lifecycleGap,
        'p6-lifecycle-create-0001',
      );
      assert.equal(lifecycleCreate.status, 201);
      const lifecycleDemand = (await lifecycleCreate.json()).demand;
      const lifecycleReject = await fetch(
        `${lifecycleBaseUrl}/v1/mission-supply-demands/${lifecycleDemand.demandId}/respond`,
        {
          method: 'POST', headers: json(recipientId, 'p6-lifecycle-reject-0001'),
          body: JSON.stringify({ expectedRevision: 1, decision: 'reject' }),
        },
      );
      assert.equal(lifecycleReject.status, 201);
      assert.equal((await lifecycleReject.json()).demand.status, 'rejected');

      const rejectGap = await insertGap(requesterId, 2);
      const rejectCreate = await createDemand(rejectGap, 'p6-create-reject-0001');
      const rejectDemand = (await rejectCreate.json()).demand;
      const concurrent = await Promise.all(['reject', 'release'].map((decision, index) => fetch(
        `${baseUrl}/v1/mission-supply-demands/${rejectDemand.demandId}/respond`,
        {
          method: 'POST', headers: json(recipientId, `p6-race-${index + 1}-0001`),
          body: JSON.stringify({ expectedRevision: 1, decision }),
        },
      )));
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
      assert.equal((await setupPool.query(
        `SELECT count(*)::int AS count FROM mission_supply_demand_revisions
          WHERE demand_id = $1 AND revision = 2`,
        [rejectDemand.demandId],
      )).rows[0].count, 1);

      const expiryGap = await insertGap(requesterId, 3);
      const expiryCreate = await createDemand(expiryGap, 'p6-create-expiry-0001');
      const expiryDemand = (await expiryCreate.json()).demand;
      const afterExpiry = new Date(new Date(expiresAt).getTime() + 1_000);
      const countsBeforeExpiryReplay = await demandCounts();
      const resolverCallsBeforeExpiryReplay = resolverCalls;
      for (const offset of [-1, 0, 1]) {
        const boundaryReplay = await createDirect(
          expiryGap, 'p6-create-expiry-0001', new Date(Date.parse(expiresAt) + offset),
        );
        assert.equal(boundaryReplay.replayed, true);
        assert.equal(boundaryReplay.demand.demandId, expiryDemand.demandId);
        assert.equal(boundaryReplay.demand.revision, 1);
        assert.equal(boundaryReplay.demand.status, offset < 0 ? 'pending' : 'expired_no_response');
        assert.equal(boundaryReplay.demand.requestBoundRelease, null);
      }
      const lateRetries = await Promise.all(Array.from({ length: 4 }, () => (
        createDirect(expiryGap, 'p6-create-expiry-0001', afterExpiry)
      )));
      for (const lateReplay of lateRetries) {
        assert.equal(lateReplay.replayed, true);
        assert.equal(lateReplay.demand.demandId, expiryDemand.demandId);
        assert.equal(lateReplay.demand.status, 'expired_no_response');
      }
      await assert.rejects(createDirect(expiryGap, 'p6-create-expiry-0001', afterExpiry, {
        expiresAt: new Date(Date.parse(expiresAt) - 1_000).toISOString(),
      }), (error) => error.status === 409 && error.code === 'mission_supply_idempotency_key_reused');
      await assert.rejects(createDirect(expiryGap, 'p6-new-expired-0001', afterExpiry),
        (error) => error.status === 400 && error.code === 'mission_supply_expiry_not_future');
      for (const retryTime of [new Date(Date.parse(expiresAt) - 1), afterExpiry]) {
        await assert.rejects(createDirect(expiryGap, 'p6-create-expiry-0001', retryTime, {
          actorId: foreignId,
        }), (error) => error.status === (retryTime < new Date(expiresAt) ? 404 : 400));
      }
      const revokedReplay = await createDirect(firstGap, 'p6-create-demand-0001', afterExpiry);
      assert.equal(revokedReplay.replayed, true);
      assert.equal(revokedReplay.demand.status, 'revoked');
      assert.equal(revokedReplay.demand.requestBoundRelease.visibilityStatus, 'revoked');
      const rejectedReplay = await createDirect(
        lifecycleGap, 'p6-lifecycle-create-0001', afterExpiry,
      );
      assert.equal(rejectedReplay.demand.status, 'rejected');
      assert.equal(rejectedReplay.replayed, true);
      assert.deepEqual(await demandCounts(), countsBeforeExpiryReplay);
      assert.equal(resolverCalls, resolverCallsBeforeExpiryReplay);
      const projected = await inTransaction((client) => getMissionSupplyDemand(client, {
        actorId: recipientId, demandId: expiryDemand.demandId, now: afterExpiry,
      }));
      assert.equal(projected.demand.status, 'expired_no_response');
      await assert.rejects(
        inTransaction((client) => respondToMissionSupplyDemand(client, {
          actorId: recipientId,
          demandId: expiryDemand.demandId,
          raw: { expectedRevision: 1, decision: 'release' },
          idempotencyKey: 'p6-expired-response-0001',
          now: afterExpiry,
        })),
        (error) => error.code === 'mission_supply_demand_expired',
      );

      const blockedGap = await insertGap(requesterId, 4);
      await setupPool.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id, reason_code)
         VALUES ($1, $2, 'p6_synthetic_block')`,
        [recipientId, requesterId],
      );
      const blocked = await createDemand(blockedGap, 'p6-create-blocked-0001');
      assert.equal(blocked.status, 404);
      assert.equal((await blocked.json()).error, 'mission_supply_recipient_not_eligible');
      await setupPool.query(
        'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [recipientId, requesterId],
      );

      const releaseBlockedGap = await insertGap(requesterId, 6);
      const releaseBlockedDemand = (await (await createDemand(
        releaseBlockedGap,
        'p6-create-release-blocked-0001',
      )).json()).demand;
      await setupPool.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id, reason_code)
         VALUES ($1, $2, 'p6_release_block')`,
        [requesterId, recipientId],
      );
      await assert.rejects(
        releaseDirect(releaseBlockedDemand.demandId, 'p6-release-blocked-0001'),
        (error) => error.code === 'mission_supply_recipient_not_eligible',
      );
      await setupPool.query(
        'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [requesterId, recipientId],
      );

      await new Promise((resolve) => server.close(() => resolve()));
      server = http.createServer(createApp({ resolveMissionSupplyRecipient: resolver }));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;

      const recipientInactiveGap = await insertGap(requesterId, 7);
      const recipientInactiveDemand = (await (await createDemand(
        recipientInactiveGap,
        'p6-create-recipient-inactive-0001',
      )).json()).demand;
      await setupPool.query(
        'UPDATE users SET deactivated_at = now() WHERE id = $1',
        [recipientId],
      );
      await assert.rejects(
        releaseDirect(recipientInactiveDemand.demandId, 'p6-release-recipient-inactive-0001'),
        (error) => error.code === 'mission_supply_recipient_not_eligible',
      );
      await setupPool.query(
        'UPDATE users SET deactivated_at = NULL WHERE id = $1',
        [recipientId],
      );

      const requesterInactiveGap = await insertGap(requesterId, 8);
      const requesterInactiveDemand = (await (await createDemand(
        requesterInactiveGap,
        'p6-create-requester-inactive-0001',
      )).json()).demand;
      await setupPool.query(
        'UPDATE users SET deactivated_at = now() WHERE id = $1',
        [requesterId],
      );
      await assert.rejects(
        releaseDirect(requesterInactiveDemand.demandId, 'p6-release-requester-inactive-0001'),
        (error) => error.code === 'mission_supply_demand_stale',
      );
      await setupPool.query(
        'UPDATE users SET deactivated_at = NULL WHERE id = $1',
        [requesterId],
      );

      const missionDriftGap = await insertGap(requesterId, 9);
      const missionDriftDemand = (await (await createDemand(
        missionDriftGap,
        'p6-create-mission-drift-0001',
      )).json()).demand;
      const correctedMissionPayload = {
        ...missionDriftGap.payload,
        title: `${missionDriftGap.payload.title} corrected`,
      };
      await setupPool.query(
        `INSERT INTO mission_need_revisions (
           mission_need_id, revision, status, payload, payload_sha256
         ) VALUES ($1, 2, 'planned', $2::jsonb, $3)`,
        [missionDriftGap.missionId, JSON.stringify(correctedMissionPayload),
          missionSupplyDemandDigest(correctedMissionPayload)],
      );
      await assert.rejects(
        releaseDirect(missionDriftDemand.demandId, 'p6-release-mission-drift-0001'),
        (error) => error.code === 'mission_supply_demand_stale',
      );

      const inventoryDriftGap = await insertGap(requesterId, 10);
      const inventoryDriftDemand = (await (await createDemand(
        inventoryDriftGap,
        'p6-create-inventory-drift-0001',
      )).json()).demand;
      const inventoryRevision = await setupPool.query(
        `INSERT INTO mission_inventory_resolution_revisions (
           resolution_id, mission_need_id, revision, mission_need_revision,
           mission_payload_sha256, start_date, end_date, location_snapshot,
           location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256
         ) SELECT resolution_id, mission_need_id, 2, mission_need_revision,
                  mission_payload_sha256, start_date, end_date, location_snapshot,
                  location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256
             FROM mission_inventory_resolution_revisions
            WHERE resolution_id = $1 AND revision = 1
         RETURNING id`,
        [inventoryDriftGap.resolutionId],
      );
      await setupPool.query(
        `INSERT INTO mission_inventory_resolution_assignments (
           revision_id, resolution_id, resolution_revision, slot_key, need_key,
           necessity, slot_ordinal, gap_reason
         ) VALUES ($1, $2, 2, $3, 'plant_container_equipment', 'required', 10,
           'no_current_unique_candidate')`,
        [inventoryRevision.rows[0].id, inventoryDriftGap.resolutionId,
          inventoryDriftGap.slotKey],
      );
      await assert.rejects(
        releaseDirect(inventoryDriftDemand.demandId, 'p6-release-inventory-drift-0001'),
        (error) => error.code === 'mission_supply_demand_stale',
      );

      const removableShelfItemId = `shelf_item_${crypto.randomUUID()}`;
      await setupPool.query(
        `INSERT INTO private_shelf_items (
           id, owner_id, domain_version, title, category_key, condition
         ) VALUES ($1, $2, 'P3-A-2026-10-01.1',
           'Disposable private synthetic container', 'private.plant.container', 'good')`,
        [removableShelfItemId, recipientId],
      );
      const removedShelfGap = await insertGap(requesterId, 11);
      recipientShelfBySlot.set(removedShelfGap.slotKey, removableShelfItemId);
      const removedShelfDemand = (await (await createDemand(
        removedShelfGap,
        'p6-create-shelf-removed-0001',
      )).json()).demand;
      await setupPool.query('DELETE FROM private_shelf_items WHERE id = $1', [removableShelfItemId]);
      await assert.rejects(
        inTransaction((client) => getMissionSupplyDemand(client, {
          actorId: recipientId,
          demandId: removedShelfDemand.demandId,
        })),
        (error) => error.code === 'mission_supply_demand_not_found',
      );

      const unconsumedGap = await setupPool.query(
        `SELECT resolution.owner_id AS requester_id, resolution.id AS resolution_id,
                revision.revision AS resolution_revision,
                revision.mission_need_id, revision.mission_need_revision,
                revision.mission_payload_sha256, revision.start_date,
                revision.end_date, revision.location_snapshot AS region_snapshot,
                revision.location_snapshot_sha256 AS region_snapshot_sha256,
                assignment.slot_key, assignment.need_key, assignment.necessity,
                assignment.slot_ordinal, assignment.gap_reason
           FROM mission_inventory_resolutions AS resolution
           JOIN mission_inventory_resolution_revisions AS revision
             ON revision.resolution_id = resolution.id
            AND revision.revision = resolution.current_revision
           JOIN mission_inventory_resolution_assignments AS assignment
             ON assignment.revision_id = revision.id
          WHERE resolution.id = $1`,
        [blockedGap.resolutionId],
      );
      const rootRow = unconsumedGap.rows[0];
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_supply_demands (
             id, requester_id, recipient_id, resolution_id, resolution_revision,
             mission_need_id, mission_need_revision, mission_payload_sha256,
             slot_key, need_key, necessity, quantity, slot_ordinal, gap_reason,
             candidate_shelf_item_id, eligibility_version, purpose, start_date,
             end_date, region_snapshot, region_snapshot_sha256, expires_at, domain_version
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $13,
             $14, $15, $16, ($17::date + 1), $18::date, $19::jsonb, $20, $21,
             'P6-A-2026-10-01.1')`,
          [`mission_demand_${crypto.randomUUID()}`, rootRow.requester_id,
            recipientId, rootRow.resolution_id, rootRow.resolution_revision,
            rootRow.mission_need_id, rootRow.mission_need_revision,
            rootRow.mission_payload_sha256, rootRow.slot_key, rootRow.need_key,
            rootRow.necessity, rootRow.slot_ordinal, rootRow.gap_reason,
            shelfItemId, 'p6-synthetic-resolver-v1',
            'mission_gap_supply_v1', rootRow.start_date, rootRow.end_date,
            JSON.stringify(rootRow.region_snapshot), rootRow.region_snapshot_sha256,
            expiresAt],
        ),
        (error) => error.code === '23503',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_supply_demand_revisions (
             demand_id, revision, actor_id, action, status
           ) VALUES ($1, 4, $2, 'release', 'released')`,
          [created.demandId, requesterId],
        ),
        (error) => error.code === '23514'
          && /mission_supply_demand_revision_invalid/u.test(error.message),
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_supply_releases (
             id, demand_id, recipient_id, shelf_item_id, purpose,
             released_revision, expires_at
           ) VALUES ($1, $2, $3, $4, 'mission_gap_supply_v1', 1, $5)`,
          [`mission_release_${crypto.randomUUID()}`, expiryDemand.demandId,
            recipientId, `shelf_item_${crypto.randomUUID()}`, expiresAt],
        ),
        (error) => error.code === '23503',
      );
      await assert.rejects(
        setupPool.query(
          `INSERT INTO mission_supply_releases (
             id, demand_id, recipient_id, shelf_item_id, purpose,
             released_revision, expires_at
           ) SELECT $1, id, recipient_id, candidate_shelf_item_id, purpose, 1, expires_at
               FROM mission_supply_demands WHERE id = $2`,
          [`mission_release_${crypto.randomUUID()}`, expiryDemand.demandId],
        ),
        (error) => error.code === '23503',
      );

      const exportExpiryGap = await insertGap(requesterId, 12);
      const exportExpiresAt = new Date(Date.now() + 1_200).toISOString();
      const exportExpiryCreate = await createDemand(
        exportExpiryGap,
        'p6-create-export-expiry-0001',
        { expiresAt: exportExpiresAt },
      );
      assert.equal(exportExpiryCreate.status, 201);
      await exportExpiryCreate.json();
      await new Promise((resolve) => setTimeout(resolve, 1_300));
      const requesterExport = await buildAccountExport(setupPool, requesterId);
      const recipientExport = await buildAccountExport(setupPool, recipientId);
      assert.ok(requesterExport.data.marketplace.missionSupplyDemands);
      assert.ok(recipientExport.data.marketplace.missionSupplyDemands);
      const exportedExpiredDemand = requesterExport.data.marketplace
        .missionSupplyDemands.demands.find((demand) => demand.slotKey === exportExpiryGap.slotKey);
      assert.ok(exportedExpiredDemand);
      assert.equal(exportedExpiredDemand.storedStatus, 'pending');
      assert.equal(exportedExpiredDemand.effectiveStatus, 'expired_no_response');
      for (const exported of [requesterExport, recipientExport]) {
        const text = JSON.stringify(exported.data.marketplace.missionSupplyDemands);
        assert.equal(text.includes(shelfItemId), false);
        assert.equal(text.includes('latitudeE5'), false);
        assert.equal(text.includes('longitudeE5'), false);
      }
      assert.deepEqual(await effects(), effectsBefore);
      const publicCatalog = await fetch(`${baseUrl}/v1/listings?sort=newest&limit=100&offset=0`);
      assert.equal(publicCatalog.status, 200);
      assert.doesNotMatch(JSON.stringify(await publicCatalog.json()), /mission_demand_/u);

      const deleteGap = await insertGap(deleteId, 5);
      const deleteCreate = await fetch(
        `${baseUrl}/v1/mission-inventory-resolutions/${deleteGap.resolutionId}/supply-demands`,
        {
          method: 'POST', headers: json(deleteId, 'p6-delete-create-0001'),
          body: JSON.stringify({
            resolutionRevision: 1, slotKey: deleteGap.slotKey,
            purpose: 'mission_gap_supply_v1', expiresAt,
          }),
        },
      );
      assert.equal(deleteCreate.status, 201);
      const deleteDemandId = (await deleteCreate.json()).demand.demandId;
      await inTransaction((client) => eraseAccount(client, { id: deleteId }));
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM mission_supply_demands WHERE id = $1',
        [deleteDemandId],
      )).rows[0].count, 0);

      const countsAfterErasure = await demandCounts();
      const resolverCallsAfterErasure = resolverCalls;
      for (const retryTime of [new Date(Date.parse(expiresAt) - 1), afterExpiry]) {
        await assert.rejects(createDirect(deleteGap, 'p6-delete-create-0001', retryTime, {
          actorId: deleteId,
        }), (error) => error.status === (retryTime < new Date(expiresAt) ? 404 : 400));
      }
      assert.equal((await setupPool.query(
        'SELECT count(*)::int AS count FROM mission_supply_demand_commands WHERE actor_id = $1',
        [deleteId],
      )).rows[0].count, 0);
      assert.deepEqual(await demandCounts(), countsAfterErasure);
      assert.equal(resolverCalls, resolverCallsAfterErasure);

      // A fresh app bounds this fixture's budget; every request below uses the
      // same listener and loopback client, with no store reset or restart.
      limiterServer = http.createServer(createApp({ resolveMissionSupplyRecipient: resolver }));
      await new Promise((resolve) => limiterServer.listen(0, '127.0.0.1', resolve));
      const limiterBaseUrl = `http://127.0.0.1:${limiterServer.address().port}`;
      const limiterGap = await insertGap(requesterId, 20);
      const limitedGap = await insertGap(requesterId, 21);
      const limiterCreate = (gap, key) => fetch(
        `${limiterBaseUrl}/v1/mission-inventory-resolutions/${gap.resolutionId}/supply-demands`, {
          method: 'POST', headers: json(requesterId, key),
          body: JSON.stringify({
            resolutionRevision: 1, slotKey: gap.slotKey,
            purpose: 'mission_gap_supply_v1', expiresAt,
          }),
        },
      );
      const assertCreateBudget = (response, remaining) => {
        const policy = response.headers.get('ratelimit-policy')?.split(',').find(
          (entry) => /; q=10; w=900;/u.test(entry),
        );
        assert.ok(policy, 'the existing ten-request/fifteen-minute policy is exposed');
        const name = policy.trim().split(';')[0];
        const budget = response.headers.get('ratelimit')?.split(',').find(
          (entry) => entry.trim().startsWith(`${name};`),
        );
        assert.ok(budget?.includes(`; r=${remaining}; t=`));
      };
      const limiterCountsBefore = await demandCounts();
      const limiterResolverBefore = resolverCalls;
      const limiterEffectsBefore = await effects();
      let limiterDemand;
      for (let request = 1; request <= 10; request += 1) {
        const response = await limiterCreate(limiterGap, 'p6-limiter-create-0001');
        assert.equal(response.status, request === 1 ? 201 : 200);
        assertCreateBudget(response, 10 - request);
        const result = await response.json();
        assert.equal(result.replayed, request > 1);
        if (request === 1) limiterDemand = result.demand;
        else assert.deepEqual(result.demand, limiterDemand);
      }
      const limiterCountsAtLimit = await demandCounts();
      assert.deepEqual(limiterCountsAtLimit, {
        ...limiterCountsBefore,
        demands: limiterCountsBefore.demands + 1,
        commands: limiterCountsBefore.commands + 1,
        revisions: limiterCountsBefore.revisions + 1,
      });
      assert.equal(resolverCalls, limiterResolverBefore + 1);
      const limitedResponse = await limiterCreate(limitedGap, 'p6-limiter-rejected-0001');
      assert.equal(limitedResponse.status, 429);
      assertCreateBudget(limitedResponse, 0);
      assert.match(limitedResponse.headers.get('retry-after'), /^[1-9][0-9]*$/u);
      const limitedError = await limitedResponse.json();
      assert.equal(limitedError.error, 'rate_limit_exceeded');
      assert.equal(typeof limitedError.requestId, 'string');
      assert.ok(limitedError.requestId.length > 0);
      assert.deepEqual(await demandCounts(), limiterCountsAtLimit);
      assert.equal(resolverCalls, limiterResolverBefore + 1);

      for (const suffix of ['', `/${limiterDemand.demandId}`]) {
        const response = await fetch(`${limiterBaseUrl}/v1/mission-supply-demands${suffix}`, {
          headers: auth(recipientId),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control'), /no-store/u);
        const body = await response.json();
        assert.ok((suffix ? [body.demand] : body.demands).some(
          (demand) => demand.demandId === limiterDemand.demandId && demand.status === 'pending',
        ));
      }
      const limiterCommand = (actor, action, raw, key) => fetch(
        `${limiterBaseUrl}/v1/mission-supply-demands/${limiterDemand.demandId}/${action}`, {
          method: 'POST', headers: json(actor, key), body: JSON.stringify(raw),
        },
      );
      await expectError(limiterCommand(foreignId, 'respond',
        { expectedRevision: 1, decision: 'release' }, 'p6-limiter-foreign-0001'),
      404, 'mission_supply_demand_not_found');
      for (const [action, raw, key, status, revision] of [
        ['respond', { expectedRevision: 1, decision: 'release' }, 'p6-limiter-release-0001', 'released', 2],
        ['revoke', { expectedRevision: 2 }, 'p6-limiter-revoke-0001', 'revoked', 3],
      ]) {
        const response = await limiterCommand(recipientId, action, raw, key);
        assert.equal(response.status, 201);
        const result = await response.json();
        assert.equal(result.demand.status, status);
        assert.equal(result.demand.revision, revision);
        const countsAfterCommand = await demandCounts();
        const replayResponse = await limiterCommand(recipientId, action, raw, key);
        assert.equal(replayResponse.status, 200);
        const replayResult = await replayResponse.json();
        assert.equal(replayResult.replayed, true);
        assert.deepEqual(replayResult.demand, result.demand);
        assert.deepEqual(await demandCounts(), countsAfterCommand);
      }
      assert.deepEqual(await demandCounts(), {
        ...limiterCountsAtLimit,
        commands: limiterCountsAtLimit.commands + 2,
        revisions: limiterCountsAtLimit.revisions + 2,
        releases: limiterCountsAtLimit.releases + 1,
      });
      assert.equal(resolverCalls, limiterResolverBefore + 1);
      assert.deepEqual(await effects(), limiterEffectsBefore);

      await assert.rejects(
        setupPool.query(await fs.readFile(
          new URL('../sql/migrations/103_mission_supply_demands.down.sql', import.meta.url),
          'utf8',
        )),
        (error) => error.code === '55000'
          && /mission_supply_demand_rows_active/u.test(error.message),
      );
    } finally {
      if (limiterServer) await new Promise((resolve) => limiterServer.close(() => resolve()));
      if (lifecycleServer) {
        await new Promise((resolve) => lifecycleServer.close(() => resolve()));
      }
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      await setupPool.end().catch(() => {});
      if (applicationPool) await applicationPool.end().catch(() => {});
    }
  });
}
