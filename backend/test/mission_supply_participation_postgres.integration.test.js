import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('mission supply participation PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('P6-C1 keeps participation/item eligibility owner-bound, revisioned and erasable', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    const ids = {
      owner: `p6c1-owner-${crypto.randomUUID()}`,
      foreignOwner: `p6c1-foreign-${crypto.randomUUID()}`,
    };
    const participationId = `mission_supply_participation_${crypto.randomUUID()}`;
    const itemId = `shelf_item_${crypto.randomUUID()}`;
    const foreignItemId = `shelf_item_${crypto.randomUUID()}`;
    const deleteUserId = `p6c1-delete-${crypto.randomUUID()}`;
    try {
      await pool.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(pool);
      const terminal = await pool.query(
        'SELECT name FROM schema_migrations ORDER BY name',
      );
      assert.equal(terminal.rows.at(-1).name, '104_mission_supply_participation.up.sql');

      await pool.query(
        `INSERT INTO users (id, email, profile, role, account_status,
             email_verified_at, private_use_confirmed_at,
             private_marketplace_review_status)
         VALUES
           ($1, $2, '{}'::jsonb, 'user', 'active', now(), now(), 'clear'),
           ($3, $4, '{}'::jsonb, 'user', 'active', now(), now(), 'clear'),
           ($5, $6, '{}'::jsonb, 'user', 'active', now(), now(), 'clear')`,
        [ids.owner, `${ids.owner}@example.invalid`, ids.foreignOwner,
          `${ids.foreignOwner}@example.invalid`, deleteUserId,
          `${deleteUserId}@example.invalid`],
      );
      await pool.query(
        `INSERT INTO private_shelf_items
           (id, owner_id, domain_version, title, category_key, condition)
         VALUES
           ($1, $2, 'P3-A-2026-10-01.1', 'owner item', 'synthetic.container', 'good'),
           ($3, $4, 'P3-A-2026-10-01.1', 'foreign item', 'synthetic.container', 'good')`,
        [itemId, ids.owner, foreignItemId, ids.foreignOwner],
      );
      await pool.query(
        `INSERT INTO mission_supply_participations
           (id, owner_id, domain_version)
         VALUES ($1, $2, 'P6-C1-2026-10-02.1')`,
        [participationId, ids.owner],
      );
      await pool.query(
        `INSERT INTO mission_supply_participation_revisions
           (participation_id, owner_id, revision, actor_id, status)
         VALUES ($1, $2, 1, $2, 'active')`,
        [participationId, ids.owner],
      );
      await pool.query(
        `INSERT INTO mission_supply_participation_item_revisions
           (participation_id, owner_id, shelf_item_id, need_key, revision,
            actor_id, availability_status)
         VALUES ($1, $2, $3, 'plant_container_equipment', 1, $2,
                 'confirmed_available')`,
        [participationId, ids.owner, itemId],
      );
      await pool.query(
        `INSERT INTO mission_supply_participation_item_commands
           (owner_id, idempotency_key, command_type, request_sha256,
            participation_id, shelf_item_id, need_key, result_revision,
            result_status)
         VALUES ($1, 'p6c1-item-command-001', 'confirm', repeat('a', 64),
                 $2, $3, 'plant_container_equipment', 1,
                 'confirmed_available')`,
        [ids.owner, participationId, itemId],
      );
      await pool.query(
        `INSERT INTO mission_supply_participation_commands
           (owner_id, idempotency_key, command_type, request_sha256,
            participation_id, result_revision, result_status)
         VALUES ($1, 'p6c1-part-command-001', 'activate', repeat('b', 64),
                 $2, 1, 'active')`,
        [ids.owner, participationId],
      );

      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participations
             (id, owner_id, domain_version, current_revision, current_status)
           VALUES ($1, $2, 'P6-C1-2026-10-02.1', 0, 'active')`,
          [`mission_supply_participation_${crypto.randomUUID()}`, ids.foreignOwner],
        ),
        /mission_supply_participation_initial_state_invalid/u,
        'participation roots cannot start active',
      );
      await assert.rejects(
        () => pool.query(
          `UPDATE mission_supply_participations
              SET current_status = 'withdrawn'
            WHERE id = $1`,
          [participationId],
        ),
        /mission_supply_participation_root_update_invalid/u,
        'direct root status changes are rejected',
      );
      await assert.rejects(
        () => pool.query(
          `UPDATE mission_supply_participations
              SET current_revision = current_revision + 1
            WHERE id = $1`,
          [participationId],
        ),
        /mission_supply_participation_root_update_invalid/u,
        'direct root revision changes are rejected',
      );
      await assert.rejects(
        () => pool.query(
          `UPDATE mission_supply_participations
              SET owner_id = $2
            WHERE id = $1`,
          [participationId, ids.foreignOwner],
        ),
        /mission_supply_participation_root_update_invalid/u,
        'direct root owner changes are rejected',
      );
      await assert.rejects(
        () => pool.query(
          `UPDATE mission_supply_participations
              SET domain_version = 'P6-C1-forged'
            WHERE id = $1`,
          [participationId],
        ),
        /mission_supply_participation_root_update_invalid/u,
        'direct root domain changes are rejected',
      );

      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_revisions
             (participation_id, owner_id, revision, actor_id, status)
           VALUES ($1, $2, 3, $2, 'withdrawn')`,
          [participationId, ids.owner],
        ),
        /mission_supply_participation_revision_invalid/u,
        'root revision gaps are rejected',
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_item_revisions
             (participation_id, owner_id, shelf_item_id, need_key, revision,
              actor_id, availability_status)
           VALUES ($1, $2, $3, 'plant_container_equipment', 3, $2, 'withdrawn')`,
          [participationId, ids.owner, itemId],
        ),
        /mission_supply_participation_item_revision_invalid/u,
        'item revision gaps are rejected',
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_item_revisions
             (participation_id, owner_id, shelf_item_id, need_key, revision,
              actor_id, availability_status)
           VALUES ($1, $2, $3, 'plant_container_equipment', 1, $2,
                   'confirmed_available')`,
          [participationId, ids.owner, foreignItemId],
        ),
        /foreign key/u,
        'an item from a different owner cannot be bound',
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_item_revisions
             (participation_id, owner_id, shelf_item_id, need_key, revision,
              actor_id, availability_status)
           VALUES ($1, $2, $3, 'synthetic_other_key', 1, $2,
                   'confirmed_available')`,
          [participationId, ids.owner, itemId],
        ),
        /check constraint|violates check/u,
        'syntactically valid but unapproved need keys are rejected',
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_item_commands
             (owner_id, idempotency_key, command_type, request_sha256,
              participation_id, shelf_item_id, need_key, result_revision,
              result_status)
           VALUES ($1, 'p6c1-item-command-001', 'confirm', repeat('c', 64),
                   $2, $3, 'plant_container_equipment', 1,
                   'confirmed_available')`,
          [ids.owner, participationId, itemId],
        ),
        /duplicate key/u,
        'idempotency keys are owner-scoped and collision-safe',
      );
      await assert.rejects(
        () => pool.query(
          `UPDATE mission_supply_participation_revisions
              SET status = 'withdrawn'
            WHERE participation_id = $1 AND revision = 1`,
          [participationId],
        ),
        /mission_supply_participation_immutable_record/u,
        'history rows are immutable',
      );

      const current = await pool.query(
        `SELECT participation.current_status,
                latest.availability_status, latest.need_key
           FROM mission_supply_participations AS participation
           JOIN LATERAL (
             SELECT item.availability_status, item.need_key
               FROM mission_supply_participation_item_revisions AS item
              WHERE item.participation_id = participation.id
              ORDER BY item.revision DESC
              LIMIT 1
           ) AS latest ON true
          WHERE participation.id = $1 AND participation.owner_id = $2`,
        [participationId, ids.owner],
      );
      assert.deepEqual(current.rows, [{
        current_status: 'active',
        availability_status: 'confirmed_available',
        need_key: 'plant_container_equipment',
      }]);

      await pool.query(
        `INSERT INTO mission_supply_participation_revisions
           (participation_id, owner_id, revision, actor_id, status)
         VALUES ($1, $2, 2, $2, 'withdrawn')`,
        [participationId, ids.owner],
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_commands
             (owner_id, idempotency_key, command_type, request_sha256,
              participation_id, result_revision, result_status)
           VALUES ($1, 'p6c1-root-drift-activate', 'activate', repeat('d', 64),
                   $2, 2, 'active')`,
          [ids.owner, participationId],
        ),
        /foreign key/u,
        'root command cannot point to a withdrawn revision',
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_commands
             (owner_id, idempotency_key, command_type, request_sha256,
              participation_id, result_revision, result_status)
           VALUES ($1, 'p6c1-root-drift-withdraw', 'withdraw', repeat('e', 64),
                   $2, 1, 'withdrawn')`,
          [ids.owner, participationId],
        ),
        /foreign key/u,
        'root command cannot point to an active revision as withdrawn',
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO mission_supply_participation_item_commands
             (owner_id, idempotency_key, command_type, request_sha256,
              participation_id, shelf_item_id, need_key, result_revision,
              result_status)
           VALUES ($1, 'p6c1-item-drift-withdraw', 'withdraw', repeat('f', 64),
                   $2, $3, 'plant_container_equipment', 1, 'withdrawn')`,
          [ids.owner, participationId, itemId],
        ),
        /foreign key/u,
        'item command cannot point to a confirmed revision as withdrawn',
      );

      await pool.query(
        `INSERT INTO mission_supply_participations
           (id, owner_id, domain_version)
         VALUES ($1, $2, 'P6-C1-2026-10-02.1')`,
        [`mission_supply_participation_${crypto.randomUUID()}`, deleteUserId],
      );
      await pool.query('DELETE FROM users WHERE id = $1', [deleteUserId]);
      const erased = await pool.query(
        `SELECT
           (SELECT count(*) FROM mission_supply_participations WHERE owner_id = $1) AS participations,
           (SELECT count(*) FROM mission_supply_participation_revisions WHERE owner_id = $1) AS revisions,
           (SELECT count(*) FROM mission_supply_participation_item_revisions WHERE owner_id = $1) AS items,
           (SELECT count(*) FROM mission_supply_participation_item_commands WHERE owner_id = $1) AS item_commands
         `,
        [deleteUserId],
      );
      assert.deepEqual(erased.rows[0], {
        participations: '0', revisions: '0', items: '0', item_commands: '0',
      });
    } finally {
      await pool.end();
    }
  });
}

if (databaseUrl) {
  test('P6-C2 owner HTTP commands are private, serialized, replay-safe and erased with populated graphs', async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl, DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      MAIL_TRANSPORT: 'memory', PAYMENT_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      PLANNER_CORE_ENABLED: 'true', PLANNER_INVENTORY_ENABLED: 'true',
      PLANNER_NEW_ENTRIES_ENABLED: 'true',
      PLANNER_DEMAND_ENABLED: 'true', PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'true',
      PRIVATE_PILOT_V4_ENABLED: 'false',
    });
    const setup = new pg.Pool({ connectionString: databaseUrl, max: 6 });
    let server;
    let applicationPool;
    const users = Array.from({ length: 4 }, () => `p6c2-${crypto.randomUUID()}`);
    const [owner, foreign, hardDelete, softDelete] = users;
    const sessions = users.map(() => crypto.randomUUID());
    const items = users.map(() => `shelf_item_${crypto.randomUUID()}`);
    try {
      await setup.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(setup);
      await setup.query(
        `INSERT INTO users (id, email, profile, role, account_status, email_verified_at,
          private_use_confirmed_at, private_marketplace_review_status)
         SELECT id, id || '@example.invalid', '{}'::jsonb, 'user', 'active', now(), now(), 'clear'
           FROM unnest($1::text[]) AS id`, [users],
      );
      await setup.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         SELECT id::uuid, user_id, 'P6-C2 synthetic' FROM unnest($1::text[], $2::text[]) AS input(id, user_id)`,
        [sessions, users],
      );
      await setup.query(
        `INSERT INTO private_shelf_items (id, owner_id, domain_version, title, category_key, condition)
         SELECT id, owner_id, 'P3-A-2026-10-01.1', 'P6-C2 private item', 'synthetic.container', 'good'
           FROM unnest($1::text[], $2::text[]) AS input(id, owner_id)`, [items, users],
      );
      const disabledGraph = async () => {
        const counts = {};
        for (const table of ['mission_supply_participations', 'mission_supply_participation_revisions', 'mission_supply_participation_commands', 'mission_supply_participation_item_revisions', 'mission_supply_participation_item_commands']) {
          counts[table] = (await setup.query(
            `SELECT count(*)::int AS count FROM ${table} WHERE owner_id = $1`, [owner],
          )).rows[0].count;
        }
        return counts;
      };
      const disabledEffects = async () => (await setup.query(`SELECT
        (SELECT count(*) FROM mission_supply_demands) AS demands,
        (SELECT count(*) FROM listings) AS listings,
        (SELECT count(*) FROM rental_requests) AS requests,
        (SELECT count(*) FROM bookings) AS bookings,
        (SELECT count(*) FROM platform_contracts) AS contracts,
        (SELECT count(*) FROM payments) AS payments,
        (SELECT count(*) FROM notifications) AS notifications,
        (SELECT count(*) FROM notification_outbox) AS outbox`)).rows[0];
      const disabledGraphBefore = await disabledGraph();
      assert.ok(Object.values(disabledGraphBefore).every((count) => count === 0));
      const disabledEffectsBefore = await disabledEffects();
      // Separate process proves every real HTTP route remains closed with all
      // older flags on, valid authentication, owned item and canonical payloads.
      const disabled = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import crypto from 'node:crypto';
        import http from 'node:http';
        import { createApp } from ${JSON.stringify(new URL('../src/app.js', import.meta.url).href)};
        import { pool } from ${JSON.stringify(new URL('../src/db.js', import.meta.url).href)};
        import { signAccessToken } from ${JSON.stringify(new URL('../src/security.js', import.meta.url).href)};
        const server = http.createServer(createApp());
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const token = signAccessToken({ id: ${JSON.stringify(owner)}, email: 'synthetic@example.invalid' }, { sessionId: ${JSON.stringify(sessions[0])} });
        const base = 'http://127.0.0.1:' + server.address().port + '/v1/mission-supply-participation';
        const results = [];
        for (const [action, suffix, body] of [
          ['read', '', null],
          ['activate', '', { expectedRevision: 0, status: 'active' }],
          ['withdraw', '', { expectedRevision: 0, status: 'withdrawn' }],
          ['confirm-item', ${JSON.stringify(`/items/${items[0]}`)}, {
            expectedParticipationRevision: 0, expectedRevision: 0,
            needKey: 'plant_container_equipment', availabilityStatus: 'confirmed_available',
          }],
          ['withdraw-item', ${JSON.stringify(`/items/${items[0]}`)}, {
            expectedParticipationRevision: 0, expectedRevision: 0,
            needKey: 'plant_container_equipment', availabilityStatus: 'withdrawn',
          }],
        ]) {
          const response = await fetch(base + suffix, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: 'Bearer ' + token,
              ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          results.push({ action, status: response.status,
            cacheControl: response.headers.get('cache-control'), body: await response.json() });
        }
        console.log('P6C2_RESULT ' + JSON.stringify(results));
        await new Promise(resolve => server.close(resolve)); await pool.end();
      `], { env: { ...process.env, PLANNER_SUPPLY_PARTICIPATION_ENABLED: 'false' }, encoding: 'utf8', timeout: 20000 });
      assert.equal(disabled.status, 0, disabled.stderr);
      const disabledResult = JSON.parse(disabled.stdout.split('\n').find((line) => line.startsWith('P6C2_RESULT ')).slice(12));
      assert.deepEqual(disabledResult.map((result) => result.action),
        ['read', 'activate', 'withdraw', 'confirm-item', 'withdraw-item']);
      for (const result of disabledResult) {
        assert.equal(result.status, 404, result.action);
        assert.equal(result.body.error, 'mission_supply_participation_not_enabled', result.action);
        assert.equal(result.cacheControl, 'private, no-store', result.action);
      }
      assert.deepEqual(await disabledGraph(), disabledGraphBefore);
      assert.deepEqual(await disabledEffects(), disabledEffectsBefore);

      const { createApp, eraseAccount } = await import('../src/app.js');
      const { pool, inTransaction } = await import('../src/db.js');
      const { signAccessToken } = await import('../src/security.js');
      const { buildAccountExport } = await import('../src/privacy_export.js');
      const { setMissionSupplyParticipation, setMissionSupplyParticipationItem } = await import('../src/mission_supply_participation_workflow.js');
      applicationPool = pool;
      const tokens = Object.fromEntries(users.map((id, index) => [id, signAccessToken(
        { id, email: `${id}@example.invalid` }, { sessionId: sessions[index] },
      )]));
      server = http.createServer(createApp());
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}/v1/mission-supply-participation`;
      const request = async (actor, body, suffix = '', key = crypto.randomUUID()) => {
        const result = await fetch(`${base}${suffix}`, {
          method: body ? 'POST' : 'GET',
          headers: { ...(actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}),
            'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        assert.equal(result.headers.get('cache-control'), 'private, no-store');
        return { status: result.status, body: await result.json() };
      };
      const root = (expectedRevision, status = 'active') => ({ expectedRevision, status });
      const item = (expectedParticipationRevision, expectedRevision, availabilityStatus = 'confirmed_available') => ({
        expectedParticipationRevision, expectedRevision, needKey: 'plant_container_equipment', availabilityStatus,
      });
      const itemPath = (index = 0) => `/items/${items[index]}`;
      const error = async (promise, status, suffix) => {
        const result = await promise;
        assert.equal(result.status, status, JSON.stringify(result.body));
        if (suffix) assert.equal(result.body.error, `mission_supply_participation_${suffix}`);
        return result;
      };
      const effects = async () => (await setup.query(`SELECT
        (SELECT count(*) FROM mission_supply_demands) AS demands,
        (SELECT count(*) FROM listings) AS listings,
        (SELECT count(*) FROM bookings) AS bookings,
        (SELECT count(*) FROM payments) AS payments,
        (SELECT count(*) FROM notifications) AS notifications,
        (SELECT count(*) FROM notification_outbox) AS outbox`)).rows[0];
      const effectsBefore = await effects();
      await error(request(null), 401);
      assert.equal((await request(owner)).body.participation, null);
      await error(request(owner, root(0), '', null), 400, 'idempotency_key_invalid');
      await error(request(owner, { ...root(0), ownerId: foreign }), 400, 'fields_invalid');
      const firstKey = crypto.randomUUID();
      const duplicate = await Promise.all([request(owner, root(0), '', firstKey), request(owner, root(0), '', firstKey)]);
      assert.deepEqual(duplicate.map((result) => result.status).sort(), [200, 201]);
      assert.equal(duplicate[0].body.participation.currentRevision, 1);
      await error(request(owner, root(0, 'withdrawn'), '', firstKey), 409, 'idempotency_key_reused');
      await error(request(owner, root(0)), 409, 'revision_conflict');
      await error(request(foreign, item(1, 0), itemPath()), 404, 'item_not_found');
      const absent = await error(request(owner, item(1, 0), `/items/shelf_item_${crypto.randomUUID()}`), 404, 'item_not_found');
      assert.equal(absent.body.error, (await request(owner, item(1, 0), itemPath(1))).body.error);
      await error(request(owner, { ...item(1, 0), needKey: 'vehicle' }, itemPath()), 400, 'need_key_invalid');
      const itemKey = crypto.randomUUID();
      const confirmed = await request(owner, item(1, 0), itemPath(), itemKey);
      assert.equal(confirmed.status, 201);
      assert.equal(confirmed.body.participation.items[0].revision, 1);
      assert.equal(confirmed.body.matchingActivated, false);
      const serialized = JSON.stringify(confirmed.body);
      for (const hidden of [owner, foreign, firstKey, itemKey, 'private item', 'requestDigest', 'ownerId', 'recipientId', 'latitude', 'longitude']) {
        assert.equal(serialized.includes(hidden), false, hidden);
      }
      const competed = await Promise.all([
        request(owner, item(1, 1, 'withdrawn'), itemPath()),
        request(owner, item(1, 1, 'withdrawn'), itemPath()),
      ]);
      assert.deepEqual(competed.map((result) => result.status).sort(), [201, 409]);
      const replay = await request(owner, item(1, 0), itemPath(), itemKey);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.commandResult.status, 'confirmed_available');
      assert.equal(replay.body.commandResult.revision, 1);
      assert.equal(replay.body.participation.items[0].availabilityStatus, 'withdrawn');
      assert.equal(replay.body.participation.items[0].revision, 2);
      await error(request(owner, item(1, 2), itemPath(), itemKey), 409, 'idempotency_key_reused');
      assert.equal((await request(owner, root(1, 'withdrawn'))).status, 201);
      await error(request(owner, item(2, 2), itemPath()), 409, 'withdrawn');
      assert.equal((await request(owner, item(2, 2, 'withdrawn'), itemPath())).status, 201);
      const rootReplay = await request(owner, root(0), '', firstKey);
      assert.equal(rootReplay.body.commandResult.status, 'active');
      assert.equal(rootReplay.body.participation.status, 'withdrawn');
      assert.equal((await request(owner, root(2))).status, 201);
      await error(request(owner, item(2, 3), itemPath()), 409, 'revision_conflict');
      assert.equal((await request(owner, item(3, 3), itemPath())).status, 201);

      // A failed command after its revision write rolls back root, history and command together.
      const rollbackKey = crypto.randomUUID();
      await assert.rejects(inTransaction(async (client) => {
        const failingClient = { query: (sql, args) => {
          if (sql.includes('INSERT INTO mission_supply_participation_commands')) throw new Error('synthetic_command_failure');
          return client.query(sql, args);
        } };
        return setMissionSupplyParticipation(failingClient, { actorId: owner, raw: root(3, 'withdrawn'), idempotencyKey: rollbackKey });
      }), /synthetic_command_failure/u);
      assert.equal((await request(owner)).body.participation.currentRevision, 3);
      assert.equal((await setup.query('SELECT count(*)::int AS count FROM mission_supply_participation_commands WHERE owner_id = $1 AND idempotency_key = $2', [owner, rollbackKey])).rows[0].count, 0);
      await assert.rejects(inTransaction(async (client) => {
        const failingClient = { query: (sql, args) => {
          if (sql.includes('INSERT INTO mission_supply_participation_item_commands')) throw new Error('synthetic_item_command_failure');
          return client.query(sql, args);
        } };
        return setMissionSupplyParticipationItem(failingClient, {
          actorId: owner, shelfItemId: items[0], raw: item(3, 4, 'withdrawn'), idempotencyKey: crypto.randomUUID(),
        });
      }), /synthetic_item_command_failure/u);
      assert.equal((await request(owner)).body.participation.items[0].revision, 4);

      for (const field of ['private_use_confirmed_at', 'private_marketplace_review_status']) {
        await setup.query(`UPDATE users SET ${field} = ${field === 'private_use_confirmed_at' ? 'NULL' : "'review_required'"} WHERE id = $1`, [foreign]);
        await error(request(foreign, root(0)), 403, 'owner_not_eligible');
        await setup.query(`UPDATE users SET ${field} = ${field === 'private_use_confirmed_at' ? 'now()' : "'clear'"} WHERE id = $1`, [foreign]);
      }
      assert.equal((await request(foreign, root(0))).status, 201);
      assert.equal((await request(foreign, item(1, 0), itemPath(1))).status, 201);
      const foreignBefore = (await request(foreign)).body;
      const adminId = `p6c2-admin-${crypto.randomUUID()}`;
      await setup.query(`INSERT INTO users (id, email, profile, role, account_status)
        VALUES ($1, $2, '{}'::jsonb, 'admin', 'active')`, [adminId, `${adminId}@example.invalid`]);
      const { setUserSuspension } = await import('../src/moderation_workflow.js');
      const suspension = await inTransaction((client) => setUserSuspension(client, {
        actor: { id: adminId, role: 'admin' }, userId: owner, idempotencyKey: crypto.randomUUID(),
        raw: { scope: 'booking', reasonCode: 'synthetic_test', decision: {
          facts: 'Synthetic fixture for an owner API suspension check.',
          basis: 'Synthetic test fixture only.',
          reasoning: 'Exercise the current suspension contract in an isolated database.',
          detectionMethod: 'human', statementOfReasons: {
            decisionGround: 'terms_violation', decisionOrigin: 'notice',
            territorialScope: 'Synthetic isolated test only.',
            durationType: 'until_reversed', automationRole: 'none',
          },
        } },
      }));
      const suspensionId = suspension.suspension.id;
      await error(request(owner, item(3, 4), itemPath()), 403, 'owner_not_eligible');
      assert.equal((await request(owner, root(3, 'withdrawn'))).status, 201);
      assert.equal((await request(owner, item(4, 4, 'withdrawn'), itemPath())).status, 201);
      await setup.query('DELETE FROM user_suspensions WHERE id = $1', [suspensionId]);
      await setup.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [sessions[0]]);
      await error(request(owner), 401);
      await setup.query('UPDATE auth_sessions SET revoked_at = NULL WHERE id = $1', [sessions[0]]);
      await setup.query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [owner]);
      await error(request(owner), 401);
      await setup.query("UPDATE users SET account_status = 'active' WHERE id = $1", [owner]);
      await setup.query('UPDATE users SET deactivated_at = now() WHERE id = $1', [owner]);
      await error(request(owner), 401);
      await setup.query('UPDATE users SET deactivated_at = NULL WHERE id = $1', [owner]);
      const { encryptTotpSecret, generateTotpSecret } = await import('../src/mfa_totp.js');
      await setup.query(`INSERT INTO mfa_totp_factors (user_id, status, enabled_at, encrypted_secret)
        VALUES ($1, 'enabled', now(), $2)`, [owner, encryptTotpSecret(generateTotpSecret(), crypto.randomBytes(32))]);
      await error(request(owner), 401);
      await setup.query('DELETE FROM mfa_totp_factors WHERE user_id = $1', [owner]);

      const exported = (await buildAccountExport(setup, owner)).data.marketplace.missionSupplyParticipation;
      for (const name of ['participations', 'revisions', 'commands', 'itemRevisions', 'itemCommands']) assert.ok(exported[name].length > 0, name);
      assert.equal(exported.visibility, 'private_owner_only');
      assert.doesNotMatch(JSON.stringify(exported), new RegExp(`${owner}|${foreign}|${items[0]}`));
      assert.deepEqual((await request(foreign)).body, foreignBefore);
      assert.deepEqual(await effects(), effectsBefore);

      const countGraph = async (id) => {
        const result = {};
        for (const table of ['mission_supply_participations', 'mission_supply_participation_revisions', 'mission_supply_participation_commands', 'mission_supply_participation_item_revisions', 'mission_supply_participation_item_commands']) {
          result[table] = (await setup.query(`SELECT count(*)::int AS count FROM ${table} WHERE owner_id = $1`, [id])).rows[0].count;
        }
        return result;
      };
      for (const id of [hardDelete, softDelete]) {
        const index = users.indexOf(id);
        assert.equal((await request(id, root(0))).status, 201);
        assert.equal((await request(id, item(1, 0), itemPath(index))).status, 201);
        assert.ok(Object.values(await countGraph(id)).every((count) => count === 1));
      }
      const rootItemRace = await Promise.all([
        request(hardDelete, root(1, 'withdrawn')),
        request(hardDelete, item(1, 1), itemPath(2)),
      ]);
      assert.equal(rootItemRace[0].status, 201);
      assert.ok([201, 409].includes(rootItemRace[1].status));
      assert.equal((await request(hardDelete)).body.participation.status, 'withdrawn');
      await setup.query('DELETE FROM users WHERE id = $1', [hardDelete]);
      assert.ok(Object.values(await countGraph(hardDelete)).every((count) => count === 0));
      const erased = await inTransaction((client) => eraseAccount(client, { id: softDelete, email: `${softDelete}@example.invalid`, role: 'user' }));
      assert.deepEqual(erased.privateShelfMediaCleanupIds, []);
      assert.ok(Object.values(await countGraph(softDelete)).every((count) => count === 0));
      assert.equal((await setup.query('SELECT account_status FROM users WHERE id = $1', [softDelete])).rows[0].account_status, 'closed');
      await setup.query('DELETE FROM private_shelf_items WHERE id = $1 AND owner_id = $2', [items[0], owner]);
      await error(request(owner, item(3, 0), itemPath(), itemKey), 404, 'item_not_found');
      const afterItemDelete = await countGraph(owner);
      assert.equal(afterItemDelete.mission_supply_participation_item_revisions, 0);
      assert.equal(afterItemDelete.mission_supply_participation_item_commands, 0);
      assert.ok(afterItemDelete.mission_supply_participation_commands > 0);
      assert.equal((await request(owner)).body.participation.items.length, 0);
      assert.deepEqual((await request(foreign)).body, foreignBefore);

      // Real transactional API helper rejects a foreign item independently of HTTP middleware.
      await assert.rejects(inTransaction((client) => setMissionSupplyParticipationItem(client, {
        actorId: owner, shelfItemId: items[1], raw: item(4, 0), idempotencyKey: crypto.randomUUID(),
      })), /item_not_found/u);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (applicationPool) await applicationPool.end();
      await setup.end();
    }
  });
}
