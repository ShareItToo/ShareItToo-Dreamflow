import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

import pg from 'pg';

import { resolveSyntheticMissionSupplyRecipient } from '../src/mission_supply_synthetic_resolver.js';
import {
  createMissionSupplyDemand,
  missionSupplyDemandDigest,
} from '../src/mission_supply_demand_workflow.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('synthetic participation bridge PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P6-C2 HTTP create uses one current C1 participation and fails closed on block/withdrawal', async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory',
      PAYMENT_TRANSPORT: 'memory',
      PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true',
      PLANNER_NEW_ENTRIES_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'true',
      PLANNER_DEMAND_ENABLED: 'true',
      PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'false',
      PRIVATE_PILOT_V4_ENABLED: 'false',
    });
    const setup = new pg.Pool({ connectionString: databaseUrl, max: 6 });
    let server;
    let applicationPool;
    try {
      await setup.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setup);

      const requester = `p6c2-requester-${crypto.randomUUID()}`;
      const recipient = `p6c2-recipient-${crypto.randomUUID()}`;
      const ids = [requester, recipient];
      const sessions = ids.map(() => crypto.randomUUID());
      await setup.query(
        `INSERT INTO users (id, email, profile, role, account_status,
             email_verified_at, private_use_confirmed_at,
             private_marketplace_review_status)
         SELECT id, id || '@example.invalid', '{}'::jsonb, 'user', 'active',
                now(), now(), 'clear'
           FROM unnest($1::text[]) AS input(id)`,
        [ids],
      );
      await setup.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         SELECT id::uuid, user_id, 'P6-C2 synthetic bridge'
           FROM unnest($1::text[], $2::text[]) AS input(id, user_id)`,
        [sessions, ids],
      );

      const shelfItemId = `shelf_item_${crypto.randomUUID()}`;
      const participationId = `mission_supply_participation_${crypto.randomUUID()}`;
      await setup.query(
        `INSERT INTO private_shelf_items
           (id, owner_id, domain_version, title, category_key, condition)
         VALUES ($1, $2, 'P3-A-2026-10-01.1', 'P6-C2 synthetic item',
                 'private.plant.container', 'good')`,
        [shelfItemId, recipient],
      );
      await setup.query(
        `INSERT INTO mission_supply_participations (id, owner_id, domain_version)
         VALUES ($1, $2, 'P6-C1-2026-10-02.1')`,
        [participationId, recipient],
      );
      await setup.query(
        `INSERT INTO mission_supply_participation_revisions
           (participation_id, owner_id, revision, actor_id, status)
         VALUES ($1, $2, 1, $2, 'active')`,
        [participationId, recipient],
      );
      await setup.query(
        `INSERT INTO mission_supply_participation_item_revisions
           (participation_id, owner_id, shelf_item_id, need_key, revision,
            actor_id, availability_status)
         VALUES ($1, $2, $3, 'plant_container_equipment', 1, $2,
                 'confirmed_available')`,
        [participationId, recipient, shelfItemId],
      );

      const insertGap = async (ordinal) => {
        const missionId = `mission_need_${crypto.randomUUID()}`;
        const resolutionId = `mission_inventory_${crypto.randomUUID()}`;
        const slotKey = `required:plant_container_equipment:${ordinal}`;
        const payload = {
          title: `P6-C2 synthetic mission ${ordinal}`,
          status: 'planned',
          needs: [{ needKey: 'plant_container_equipment', necessity: 'required', quantity: 1 }],
        };
        const payloadDigest = missionSupplyDemandDigest(payload);
        const region = {
          sourceType: 'owner_confirmed_search_origin', sourceVersion: 'p6-c2-test-v1',
          ownerConfirmed: true, radiusKm: 25, coordinateDigest: 'c'.repeat(64),
          exactCoordinatesStored: false,
        };
        const resolutionSnapshot = {
          coverage: [{ needKey: 'plant_container_equipment', necessity: 'required',
            requestedQuantity: 1, coveredQuantity: 0, gapQuantity: 1 }],
          slots: [{ slotKey, needKey: 'plant_container_equipment', necessity: 'required',
            ordinal, status: 'gap', gapReason: 'no_current_unique_candidate', assignment: null }],
          requiredCoverageComplete: false, searchLimited: false, quotePersisted: false,
          revalidationRequiredBeforeRequest: true, bindingStatus: 'non_binding',
          reservationCreated: false, bookingCreated: false, contractCreated: false,
          paymentCreated: false, publicShelfCreated: false, publicListingCreated: false,
          automaticPublicationPerformed: false, externalGenerativeAiUsed: false,
        };
        const startDate = '2026-11-01';
        const endDate = '2026-11-03';
        const resolutionDigest = missionSupplyDemandDigest(resolutionSnapshot);
        await setup.query(
          `INSERT INTO mission_needs (id, owner_id, domain_version, status)
           VALUES ($1, $2, 'P2-A-2026-10-01.1', 'planned')`, [missionId, requester],
        );
        await setup.query(
          `INSERT INTO mission_need_revisions
             (mission_need_id, revision, status, payload, payload_sha256)
           VALUES ($1, 1, 'planned', $2::jsonb, $3)`,
          [missionId, JSON.stringify(payload), payloadDigest],
        );
        await setup.query(
          `INSERT INTO mission_inventory_resolutions
             (id, owner_id, mission_need_id, domain_version,
              planner_core_version, planner_inventory_version)
           VALUES ($1, $2, $3, 'P5-A-2026-10-01.1',
                   'G4A-2026-08-21.1', 'G4B-2026-08-21.1')`,
          [resolutionId, requester, missionId],
        );
        const revision = await setup.query(
          `INSERT INTO mission_inventory_resolution_revisions
             (resolution_id, mission_need_id, revision, mission_need_revision,
              mission_payload_sha256, start_date, end_date, location_snapshot,
              location_snapshot_sha256, resolution_snapshot, resolution_snapshot_sha256)
           VALUES ($1, $2, 1, 1, $3, $4::date, $5::date, $6::jsonb, $7,
                   $8::jsonb, $9) RETURNING id`,
          [resolutionId, missionId, payloadDigest, startDate, endDate,
            JSON.stringify(region), missionSupplyDemandDigest(region),
            JSON.stringify(resolutionSnapshot), resolutionDigest],
        );
        await setup.query(
          `INSERT INTO mission_inventory_resolution_assignments
             (revision_id, resolution_id, resolution_revision, slot_key, need_key,
              necessity, slot_ordinal, gap_reason)
           VALUES ($1, $2, 1, $3, 'plant_container_equipment', 'required', $4,
                   'no_current_unique_candidate')`,
          [revision.rows[0].id, resolutionId, slotKey, ordinal],
        );
        return { resolutionId, slotKey };
      };

      const { createApp } = await import('../src/app.js');
      const { inTransaction, pool } = await import('../src/db.js');
      applicationPool = pool;
      const { signAccessToken } = await import('../src/security.js');
      const tokens = Object.fromEntries(ids.map((id, index) => [id, signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId: sessions[index] },
      )]));
      server = http.createServer(createApp({
        resolveMissionSupplyRecipient: resolveSyntheticMissionSupplyRecipient,
      }));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const headers = { Authorization: `Bearer ${tokens[requester]}`,
        'Content-Type': 'application/json', 'Idempotency-Key': 'p6c2-http-create-0001' };
      const effects = async () => (await setup.query(
        `SELECT (SELECT count(*)::int FROM listings) AS listings,
                (SELECT count(*)::int FROM notifications) AS notifications,
                (SELECT count(*)::int FROM rental_requests) AS requests,
                (SELECT count(*)::int FROM bookings) AS bookings,
                (SELECT count(*)::int FROM platform_contracts) AS contracts,
                (SELECT count(*)::int FROM payments) AS payments`,
      )).rows[0];
      const effectsBefore = await effects();
      const first = await insertGap(1);
      const create = await fetch(`${base}/v1/mission-inventory-resolutions/${first.resolutionId}/supply-demands`, {
        method: 'POST', headers,
        body: JSON.stringify({ resolutionRevision: 1, slotKey: first.slotKey,
          purpose: 'mission_gap_supply_v1', expiresAt: '2026-10-20T00:00:00.000Z' }),
      });
      assert.equal(create.status, 201);
      const created = await create.json();
      assert.equal(created.demand.participantRole, 'requester');
      assert.equal(created.demand.need.needKey, 'plant_container_equipment');
      for (const hidden of [recipient, shelfItemId, participationId, 'participationRevision', 'itemRevision']) {
        assert.equal(JSON.stringify(created).includes(hidden), false, hidden);
      }
      assert.deepEqual(await effects(), effectsBefore);

      const directCreate = (gap, key, resolver) => inTransaction((client) => createMissionSupplyDemand(client, {
        actorId: requester,
        resolutionId: gap.resolutionId,
        raw: {
          resolutionRevision: 1, slotKey: gap.slotKey,
          purpose: 'mission_gap_supply_v1', expiresAt: '2026-10-20T00:00:00.000Z',
        },
        idempotencyKey: key,
        recipientResolver: resolver,
      }));
      const staleParticipationGap = await insertGap(2);
      await assert.rejects(
        directCreate(staleParticipationGap, 'p6c2-stale-participation-0001', async (_client, request) => ({
          recipientOwnerId: recipient, shelfItemId, needKey: request.needKey,
          purpose: request.purpose, eligibilityVersion: 'p6-c2-tampered-v1',
          participationId, participationRevision: 99, itemRevision: 1,
        })),
        (error) => error.code === 'mission_supply_recipient_not_eligible',
      );
      const staleItemGap = await insertGap(3);
      await assert.rejects(
        directCreate(staleItemGap, 'p6c2-stale-item-0001', async (_client, request) => ({
          recipientOwnerId: recipient, shelfItemId, needKey: request.needKey,
          purpose: request.purpose, eligibilityVersion: 'p6-c2-tampered-v1',
          participationId, participationRevision: 1, itemRevision: 99,
        })),
        (error) => error.code === 'mission_supply_recipient_not_eligible',
      );

      await setup.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`,
        [requester, recipient],
      );
      const blockedGap = await insertGap(4);
      const blocked = await fetch(`${base}/v1/mission-inventory-resolutions/${blockedGap.resolutionId}/supply-demands`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': 'p6c2-http-blocked-0001' },
        body: JSON.stringify({ resolutionRevision: 1, slotKey: blockedGap.slotKey,
          purpose: 'mission_gap_supply_v1', expiresAt: '2026-10-20T00:00:00.000Z' }),
      });
      assert.equal(blocked.status, 404);
      assert.equal((await blocked.json()).error, 'mission_supply_recipient_not_eligible');
      await setup.query('UPDATE user_blocks SET unblocked_at = now() WHERE blocker_id = $1 AND blocked_id = $2', [requester, recipient]);

      const admin = `p6c2-admin-${crypto.randomUUID()}`;
      await setup.query(
        `INSERT INTO users (id, email, profile, role, account_status)
         VALUES ($1, $2, '{}'::jsonb, 'admin', 'active')`,
        [admin, `${admin}@example.invalid`],
      );
      const { setUserSuspension } = await import('../src/moderation_workflow.js');
      const suspend = (userId) => inTransaction((client) => setUserSuspension(client, {
        actor: { id: admin, role: 'admin' }, userId, idempotencyKey: crypto.randomUUID(),
        raw: {
          scope: 'booking', reasonCode: 'synthetic_test',
          decision: {
            facts: 'Synthetic fixture for P6-C2 suspension recheck.',
            basis: 'Synthetic test fixture only.',
            reasoning: 'Verify current owner eligibility is rechecked at demand creation.',
            detectionMethod: 'human', statementOfReasons: {
              decisionGround: 'terms_violation', decisionOrigin: 'notice',
              territorialScope: 'Synthetic isolated test only.',
              durationType: 'until_reversed', automationRole: 'none',
            },
          },
        },
      }));
      const recipientSuspension = await suspend(recipient);
      const suspendedRecipientGap = await insertGap(5);
      const suspendedRecipient = await fetch(`${base}/v1/mission-inventory-resolutions/${suspendedRecipientGap.resolutionId}/supply-demands`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': 'p6c2-http-suspended-recipient-0001' },
        body: JSON.stringify({ resolutionRevision: 1, slotKey: suspendedRecipientGap.slotKey,
          purpose: 'mission_gap_supply_v1', expiresAt: '2026-10-20T00:00:00.000Z' }),
      });
      assert.equal(suspendedRecipient.status, 404);
      assert.equal((await suspendedRecipient.json()).error, 'mission_supply_recipient_not_eligible');
      await setup.query('DELETE FROM user_suspensions WHERE id = $1', [recipientSuspension.suspension.id]);
      const requesterSuspension = await suspend(requester);
      const suspendedRequesterGap = await insertGap(6);
      await assert.rejects(
        directCreate(suspendedRequesterGap, 'p6c2-http-suspended-requester-0001', resolveSyntheticMissionSupplyRecipient),
        (error) => error.code === 'mission_supply_recipient_not_eligible',
      );
      await setup.query('DELETE FROM user_suspensions WHERE id = $1', [requesterSuspension.suspension.id]);
      await setup.query(
        `INSERT INTO mission_supply_participation_revisions
           (participation_id, owner_id, revision, actor_id, status)
         VALUES ($1, $2, 2, $2, 'withdrawn')`, [participationId, recipient],
      );
      const withdrawnGap = await insertGap(7);
      const withdrawn = await fetch(`${base}/v1/mission-inventory-resolutions/${withdrawnGap.resolutionId}/supply-demands`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': 'p6c2-http-withdrawn-0001' },
        body: JSON.stringify({ resolutionRevision: 1, slotKey: withdrawnGap.slotKey,
          purpose: 'mission_gap_supply_v1', expiresAt: '2026-10-20T00:00:00.000Z' }),
      });
      assert.equal(withdrawn.status, 404);
      assert.equal((await withdrawn.json()).error, 'mission_supply_recipient_not_eligible');
    } finally {
      if (server) {
        server.closeIdleConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      if (applicationPool) await applicationPool.end();
      await setup.end();
    }
  });
}
