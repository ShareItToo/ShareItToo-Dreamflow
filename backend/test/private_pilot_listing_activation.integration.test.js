import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import sharp from 'sharp';

import {
  listingPhotoTruthPolicyText,
  listingPhotoTruthPolicyVersion,
} from '../src/listing_photo_truth_policy.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('Private-pilot activation integration requires TEST_DATABASE_URL');
} else {
  test('private-pilot activation and managed-image listing create/edit round-trip', async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    process.env.MAIL_TRANSPORT = 'memory';
    process.env.PAYMENT_TRANSPORT = 'memory';
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-pilot-listing-'));
    process.env.UPLOAD_DIR = uploadDir;
    // This isolated fixture must activate the policy whose rejection it proves;
    // do not depend on an operator's inherited environment or default region.
    process.env.PRIVATE_PILOT_V4_ENABLED = 'true';
    process.env.PRIVATE_PILOT_ALLOWED_REGIONS = 'berlin';
    const [{ createApp }, { runMigrations }, { signAccessToken }, { config }] = await Promise.all([
      import('../src/app.js'),
      import('../src/migrations.js'),
      import('../src/security.js'),
      import('../src/config.js'),
    ]);
    assert.equal(config.privatePilotV4Enabled, true);
    assert.deepEqual(config.privatePilot.allowedRegions, ['berlin']);
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
                payload->>'privateStatusConfirmed' AS payload_private_status_confirmed,
                catalog_revision
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.equal(active.rows[0].status, 'active');
      assert.equal(active.rows[0].is_active, true);
      assert.ok(active.rows[0].private_status_confirmed_at);
      assert.equal(active.rows[0].payload_private_status_confirmed, 'true');
      assert.equal(active.rows[0].catalog_revision, 2);
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
        `SELECT status, is_active, private_status_confirmed_at, catalog_revision
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.equal(pausedState.rows[0].status, 'paused');
      assert.equal(pausedState.rows[0].is_active, false);
      assert.ok(pausedState.rows[0].private_status_confirmed_at);
      assert.equal(pausedState.rows[0].catalog_revision, 3);

      const reactivated = await fetch(`${baseUrl}/v1/listings/pilot-draft/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active', privateStatusConfirmed: true }),
      });
      assert.equal(reactivated.status, 200);
      const reactivatedState = await pool.query(
        `SELECT status, is_active, private_status_confirmed_at, catalog_revision
           FROM listings WHERE id = 'pilot-draft'`,
      );
      assert.equal(reactivatedState.rows[0].status, 'active');
      assert.equal(reactivatedState.rows[0].is_active, true);
      assert.ok(reactivatedState.rows[0].private_status_confirmed_at);
      assert.equal(reactivatedState.rows[0].catalog_revision, 4);
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
      const syntheticImage = await sharp({
        create: {
          width: 960,
          height: 640,
          channels: 3,
          background: { r: 32, g: 96, b: 160 },
        },
      }).jpeg({ quality: 90 }).toBuffer();
      const form = new FormData();
      form.append('purpose', 'listing_image');
      form.append(
        'file',
        new Blob([syntheticImage], { type: 'image/jpeg' }),
        'synthetic-sonstiges.jpg',
      );
      const uploaded = await fetch(`${baseUrl}/v1/uploads`, {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: form,
      });
      assert.equal(uploaded.status, 201);
      const managedPhoto = await uploaded.json();
      assert.match(managedPhoto.url, /\/uploads\/[0-9a-f-]{36}-full\.webp$/u);
      const storageName = new URL(managedPhoto.url).pathname.split('/').at(-1);
      const unboundUpload = await pool.query(
        `SELECT owner_id, purpose, content_scan_status, listing_id, visibility
           FROM uploads WHERE storage_name = $1`,
        [storageName],
      );
      assert.deepEqual(unboundUpload.rows[0], {
        owner_id: 'pilot-owner',
        purpose: 'listing_image',
        content_scan_status: 'passed',
        listing_id: null,
        visibility: 'private',
      });

      const journeyListing = {
        id: 'pilot-sonstiges-journey',
        title: 'Synthetic Sonstiges camera',
        description: 'Synthetic private-pilot listing journey for backend acceptance.',
        categoryId: 'cat3',
        subcategory: 'Sonstiges',
        tags: ['synthetic-journey'],
        pricePerDay: 10,
        priceRaw: 10,
        priceUnit: 'day',
        currency: 'EUR',
        photos: [managedPhoto.url],
        locationText: 'Berlin',
        city: 'Berlin',
        country: 'Deutschland',
        lat: 52.52,
        lng: 13.405,
        geohash: 'private-synthetic-geohash',
        condition: 'good',
        minDays: 1,
        maxDays: 30,
        status: 'active',
        isActive: true,
        privateStatusConfirmed: true,
        photoTruthPolicyVersion: listingPhotoTruthPolicyVersion,
        photoTruthAttestation: listingPhotoTruthPolicyText,
        photoTruthClassifications: ['unknown'],
      };
      const createdResponse = await fetch(`${baseUrl}/v1/listings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(journeyListing),
      });
      assert.equal(createdResponse.status, 201);
      const created = (await createdResponse.json()).listing;
      assert.equal(created.ownerId, 'pilot-owner');
      assert.equal(created.status, 'active');
      assert.equal(created.categoryId, 'cat3');
      assert.equal(created.subcategory, 'Sonstiges');
      assert.equal(created.photos[0], managedPhoto.url);
      assert.equal(created.catalogRevision, 1);
      const boundUpload = await pool.query(
        `SELECT listing_id, visibility FROM uploads WHERE storage_name = $1`,
        [storageName],
      );
      assert.deepEqual(boundUpload.rows[0], {
        listing_id: journeyListing.id,
        visibility: 'public',
      });
      const persistedCreate = await pool.query(
        `SELECT owner_id, status, category_id, subcategory, catalog_revision,
                payload->'photos' AS photos
           FROM listings WHERE id = $1`,
        [journeyListing.id],
      );
      assert.deepEqual(persistedCreate.rows[0], {
        owner_id: 'pilot-owner',
        status: 'active',
        category_id: 'cat3',
        subcategory: 'Sonstiges',
        catalog_revision: 1,
        photos: [managedPhoto.url],
      });

      const mineResponse = await fetch(`${baseUrl}/v1/listings/mine`, { headers });
      assert.equal(mineResponse.status, 200);
      const mine = (await mineResponse.json()).listings.find(
        (entry) => entry.id === journeyListing.id,
      );
      assert.ok(mine);
      assert.equal(mine.ownerId, 'pilot-owner');
      assert.equal(mine.subcategory, 'Sonstiges');
      assert.equal(mine.photos[0], managedPhoto.url);
      assert.equal(mine.catalogRevision, 1);

      const publicRead = async () => {
        const response = await fetch(
          `${baseUrl}/v1/listings?q=Synthetic%20Sonstiges&categories=cat3`,
        );
        assert.equal(response.status, 200);
        return (await response.json()).listings.find(
          (entry) => entry.id === journeyListing.id,
        );
      };
      const publicBeforeEdit = await publicRead();
      assert.ok(publicBeforeEdit, 'active created listing is publicly searchable');
      assert.equal(publicBeforeEdit.subcategory, 'Sonstiges');
      assert.equal(publicBeforeEdit.photos[0], managedPhoto.url);
      assert.equal(publicBeforeEdit.locationText, 'Berlin, Deutschland');
      assert.equal('photoTruthAttestation' in publicBeforeEdit, false);

      const editedResponse = await fetch(
        `${baseUrl}/v1/listings/${journeyListing.id}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            ...created,
            title: 'Synthetic Sonstiges camera edited',
            categoryId: 'cat3',
            subcategory: 'Sonstiges',
            catalogRevision: created.catalogRevision,
          }),
        },
      );
      assert.equal(editedResponse.status, 200);
      const edited = (await editedResponse.json()).listing;
      assert.equal(edited.ownerId, 'pilot-owner');
      assert.equal(edited.title, 'Synthetic Sonstiges camera edited');
      assert.equal(edited.categoryId, 'cat3');
      assert.equal(edited.subcategory, 'Sonstiges');
      assert.equal(edited.photos[0], managedPhoto.url);
      assert.equal(edited.catalogRevision, 2);
      const persistedEdit = await pool.query(
        `SELECT owner_id, status, title, category_id, subcategory,
                catalog_revision, payload->'photos' AS photos
           FROM listings WHERE id = $1`,
        [journeyListing.id],
      );
      assert.deepEqual(persistedEdit.rows[0], {
        owner_id: 'pilot-owner',
        status: 'active',
        title: edited.title,
        category_id: 'cat3',
        subcategory: 'Sonstiges',
        catalog_revision: 2,
        photos: [managedPhoto.url],
      });
      const publicAfterEdit = await publicRead();
      assert.ok(publicAfterEdit);
      assert.equal(publicAfterEdit.title, edited.title);
      assert.equal(publicAfterEdit.subcategory, 'Sonstiges');
      const mineAfterEdit = (await (await fetch(
        `${baseUrl}/v1/listings/mine`, { headers },
      )).json()).listings.find((entry) => entry.id === journeyListing.id);
      assert.equal(mineAfterEdit.catalogRevision, 2);
      assert.equal(mineAfterEdit.photos[0], managedPhoto.url);
    } finally {
      if (server) {
        await new Promise((resolve, reject) => server.close((error) => (
          error ? reject(error) : resolve()
        )));
      }
      await pool.end();
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });
}
