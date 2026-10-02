import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
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
            participation_id, result_revision)
         VALUES ($1, 'p6c1-part-command-001', 'activate', repeat('b', 64), $2, 1)`,
        [ids.owner, participationId],
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
