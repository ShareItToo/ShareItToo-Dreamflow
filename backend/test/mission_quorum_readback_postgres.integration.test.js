import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('P6-C4 quorum PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('authenticated quorum route uses one read-only snapshot and fails closed', async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory', PAYMENT_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true', PLANNER_NEW_ENTRIES_ENABLED: 'true',
      PLANNER_INVENTORY_ENABLED: 'true', PRIVATE_PILOT_V4_ENABLED: 'false',
    });
    const setupPool = new pg.Pool({ connectionString: databaseUrl, max: 6 });
    let server;
    let applicationPool;
    try {
      await setupPool.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setupPool);
      const { createApp } = await import('../src/app.js');
      const { pool } = await import('../src/db.js');
      const { signAccessToken } = await import('../src/security.js');
      const { missionInventoryResolutionDigest } = await import(
        '../src/mission_inventory_resolution_workflow.js'
      );
      applicationPool = pool;
      const ownerId = `p6c4-owner-${crypto.randomUUID()}`;
      const foreignId = `p6c4-foreign-${crypto.randomUUID()}`;
      const sessionIds = [crypto.randomUUID(), crypto.randomUUID()];
      await setupPool.query(
        `INSERT INTO users (id, email, profile, role, account_status, email_verified_at)
         VALUES ($1, $2, '{"displayName":"P6-C4 owner"}', 'user', 'active', now()),
                ($3, $4, '{"displayName":"P6-C4 foreign"}', 'user', 'active', now())`,
        [ownerId, `${ownerId}@example.invalid`, foreignId, `${foreignId}@example.invalid`],
      );
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, $3, 'P6-C4 owner'), ($2, $4, 'P6-C4 foreign')`,
        [...sessionIds, ownerId, foreignId],
      );
      const tokenFor = (id, sessionId) => signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId },
      );
      const ownerToken = tokenFor(ownerId, sessionIds[0]);
      const foreignToken = tokenFor(foreignId, sessionIds[1]);
      server = http.createServer(createApp());
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const headers = (token, key) => ({
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}),
      });
      const missionResponse = await fetch(`${baseUrl}/v1/mission-needs`, {
        method: 'POST', headers: headers(ownerToken, 'p6c4-mission-create-0001'),
        body: JSON.stringify({ title: 'P6-C4 mission', status: 'planned', needs: [
          { needKey: 'drill', necessity: 'required', quantity: 1 },
        ] }),
      });
      assert.equal(missionResponse.status, 201);
      const mission = (await missionResponse.json()).missionNeed;
      const resolutionResponse = await fetch(
        `${baseUrl}/v1/mission-needs/${mission.missionNeedId}/inventory-resolutions`,
        { method: 'POST', headers: headers(ownerToken, 'p6c4-resolution-create-0001'),
          body: JSON.stringify({ missionRevision: mission.revision,
            missionPayloadDigest: mission.payloadDigest, startDate: '2026-11-10',
            endDate: '2026-11-12', location: { latitudeE5: 4914000,
              longitudeE5: 922000, radiusKm: 25, sourceVersion: 'owner-location-v1',
              ownerConfirmed: true } }) },
      );
      assert.equal(resolutionResponse.status, 201);
      const resolution = (await resolutionResponse.json()).resolution;
      const before = await setupPool.query(
        `SELECT (SELECT count(*) FROM mission_inventory_resolutions) AS resolutions,
                (SELECT count(*) FROM mission_inventory_resolution_revisions) AS revisions,
                (SELECT count(*) FROM mission_inventory_resolution_assignments) AS assignments`,
      );
      const transactionStatements = [];
      const connect = applicationPool.connect.bind(applicationPool);
      applicationPool.connect = async () => {
        const client = await connect();
        const query = client.query.bind(client);
        client.query = (...args) => {
          if (typeof args[0] === 'string') transactionStatements.push(args[0]);
          return query(...args);
        };
        return client;
      };
      try {
        const read = await fetch(`${baseUrl}/v1/mission-inventory-resolutions/${resolution.resolutionId}/quorum`, {
          headers: headers(ownerToken),
        });
        assert.equal(read.status, 200);
        assert.match(read.headers.get('cache-control') ?? '', /private, no-store/u);
        const quorum = (await read.json()).quorum;
        assert.equal(quorum.bindingStatus, 'non_binding');
        assert.equal(quorum.persisted, false);
        assert.equal(quorum.paymentStatus, 'not_determined');
        assert.equal(
          quorum.resolutionDigest,
          missionInventoryResolutionDigest(resolution.storedResolution),
        );
        assert.equal(JSON.stringify(quorum).includes(ownerId), false);
        assert.equal(JSON.stringify(quorum).includes('latitudeE5'), false);
        assert.ok(transactionStatements.some((sql) =>
          sql.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')));
      } finally {
        applicationPool.connect = connect;
      }
      const foreign = await fetch(`${baseUrl}/v1/mission-inventory-resolutions/${resolution.resolutionId}/quorum`, {
        headers: headers(foreignToken),
      });
      assert.equal(foreign.status, 404);
      const revised = await fetch(`${baseUrl}/v1/mission-needs/${mission.missionNeedId}/revisions`, {
        method: 'POST', headers: headers(ownerToken, 'p6c4-mission-revise-0001'),
        body: JSON.stringify({ title: 'P6-C4 mission revised', status: 'planned', needs: [
          { needKey: 'drill', necessity: 'required', quantity: 1 },
        ] }),
      });
      assert.equal(revised.status, 201);
      const stale = await fetch(`${baseUrl}/v1/mission-inventory-resolutions/${resolution.resolutionId}/quorum`, {
        headers: headers(ownerToken),
      });
      assert.equal(stale.status, 409);
      const after = await setupPool.query(
        `SELECT (SELECT count(*) FROM mission_inventory_resolutions) AS resolutions,
                (SELECT count(*) FROM mission_inventory_resolution_revisions) AS revisions,
                (SELECT count(*) FROM mission_inventory_resolution_assignments) AS assignments`,
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    } finally {
      if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await setupPool.end();
    }
  });
}
