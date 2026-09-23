import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import {
  listingPhotoTruthPolicyText,
  listingPhotoTruthPolicyVersion,
} from '../src/listing_photo_truth_policy.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('Private-pilot activation integration requires TEST_DATABASE_URL');
} else {
  test('draft activation requires declaration and writes append-only evidence', async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    process.env.MAIL_TRANSPORT = 'memory';
    process.env.PAYMENT_TRANSPORT = 'memory';
    const [{ createApp }, { runMigrations }, { signAccessToken }] = await Promise.all([
      import('../src/app.js'),
      import('../src/migrations.js'),
      import('../src/security.js'),
    ]);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const schema = await fs.readFile(path.resolve(currentDir, '../sql/schema.sql'), 'utf8');
    let server;
    try {
      await pool.query(schema);
      await runMigrations(pool);
      await pool.query('TRUNCATE users CASCADE');
      await pool.query(
        `INSERT INTO users (
           id, email, profile, role, account_status, email_verified_at,
           private_use_confirmed_at, private_marketplace_review_status
         ) VALUES (
           'pilot-owner', 'pilot-owner@example.invalid', '{}'::jsonb, 'user', 'active', now(), now(), 'clear'
         )`,
      );
      const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      await pool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, 'pilot-owner', 'Private-pilot activation integration')`,
        [sessionId],
      );
      const photoUrl = 'https://shareittoo.com/api/v1/uploads/pilot-photo-full.webp';
      await pool.query(
        `INSERT INTO listings (
           id, owner_id, payload, is_active, catalog_version, catalog_revision,
           status, currency, price_per_day_minor, title, description,
           category_id, subcategory, condition, location_text, city, country,
           latitude, longitude, min_days, max_days, protection_model,
           private_pilot_region_code
         ) VALUES (
           'pilot-draft', 'pilot-owner', $1::jsonb, false, 1, 1,
           'draft', 'EUR', 1200, 'Pilot camera', 'Draft camera for activation proof.',
           'cat3', 'Kameras', 'good', 'Berlin', 'Berlin', 'Deutschland',
           52.52, 13.405, 1, 30, 'none', 'berlin'
         )`,
        [JSON.stringify({
          id: 'pilot-draft',
          ownerId: 'pilot-owner',
          title: 'Pilot camera',
          description: 'Draft camera for activation proof.',
          categoryId: 'cat3',
          subcategory: 'Kameras',
          condition: 'good',
          city: 'Berlin',
          country: 'Deutschland',
          photos: [photoUrl],
          status: 'draft',
          isActive: false,
          privateStatusConfirmed: false,
          photoTruthPolicyVersion: listingPhotoTruthPolicyVersion,
          photoTruthAttestation: listingPhotoTruthPolicyText,
          photoTruthClassifications: ['unknown'],
        })],
      );
      await pool.query(
        `INSERT INTO uploads (
           owner_id, storage_name, mime_type, byte_size, purpose, visibility,
           listing_id, content_sha256, content_scan_status
         ) VALUES (
           'pilot-owner', 'pilot-photo-full.webp', 'image/webp', 10,
           'listing_image', 'public', 'pilot-draft', $1, 'passed'
         )`,
        ['c'.repeat(64)],
      );
      const app = createApp({});
      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const headers = {
        Authorization: `Bearer ${signAccessToken(
          { id: 'pilot-owner', email: 'pilot-owner@example.invalid' },
          { sessionId },
        )}`,
        'Content-Type': 'application/json',
      };
      const missing = await fetch(`${baseUrl}/v1/listings/pilot-draft/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active' }),
      });
      assert.equal(missing.status, 400);
      assert.equal((await missing.json()).error, 'private_status_confirmation_required');
      const stillDraft = await pool.query(
        `SELECT status, is_active, private_status_confirmed_at
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.deepEqual(stillDraft.rows[0], {
        status: 'draft',
        is_active: false,
        private_status_confirmed_at: null,
      });

      const activated = await fetch(`${baseUrl}/v1/listings/pilot-draft/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active', privateStatusConfirmed: true }),
      });
      assert.equal(activated.status, 200);
      const active = await pool.query(
        `SELECT status, is_active, private_status_confirmed_at,
                payload->>'privateStatusConfirmed' AS payload_private_status_confirmed
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.equal(active.rows[0].status, 'active');
      assert.equal(active.rows[0].is_active, true);
      assert.ok(active.rows[0].private_status_confirmed_at);
      assert.equal(active.rows[0].payload_private_status_confirmed, 'true');
      const activeRow = await pool.query(
        `SELECT id, owner_id, status, is_active, catalog_version, moderation_status
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.deepEqual(activeRow.rows[0], {
        id: 'pilot-draft',
        owner_id: 'pilot-owner',
        status: 'active',
        is_active: true,
        catalog_version: 1,
        moderation_status: 'active',
      });
      const firstDeclaration = await pool.query(
        `SELECT id, declared_at
           FROM legal_declarations
          WHERE listing_id = 'pilot-draft' AND declaration_type = 'listing_private'
          ORDER BY declared_at, id`,
      );
      assert.equal(firstDeclaration.rowCount, 1);

      const paused = await fetch(`${baseUrl}/v1/listings/pilot-draft/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'paused' }),
      });
      assert.equal(paused.status, 200, await paused.text());
      const pausedState = await pool.query(
        `SELECT status, is_active, private_status_confirmed_at
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.equal(pausedState.rows[0].status, 'paused');
      assert.equal(pausedState.rows[0].is_active, false);
      assert.ok(pausedState.rows[0].private_status_confirmed_at);

      const reactivated = await fetch(`${baseUrl}/v1/listings/pilot-draft/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active', privateStatusConfirmed: true }),
      });
      assert.equal(reactivated.status, 200);
      const reactivatedState = await pool.query(
        `SELECT status, is_active, private_status_confirmed_at
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.equal(reactivatedState.rows[0].status, 'active');
      assert.equal(reactivatedState.rows[0].is_active, true);
      assert.ok(reactivatedState.rows[0].private_status_confirmed_at);
      assert.ok(
        reactivatedState.rows[0].private_status_confirmed_at
          >= firstDeclaration.rows[0].declared_at,
      );
      const declarations = await pool.query(
        `SELECT id, declared_at
           FROM legal_declarations
          WHERE listing_id = 'pilot-draft' AND declaration_type = 'listing_private'
          ORDER BY declared_at, id`,
      );
      assert.equal(declarations.rowCount, 2);
      assert.equal(declarations.rows[0].id, firstDeclaration.rows[0].id);
      assert.ok(declarations.rows[1].declared_at >= declarations.rows[0].declared_at);
    } finally {
      if (server) {
        await new Promise((resolve, reject) => server.close((error) => (
          error ? reject(error) : resolve()
        )));
      }
      await pool.end();
    }
  });
}
