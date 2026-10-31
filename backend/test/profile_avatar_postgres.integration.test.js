import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import sharp from 'sharp';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('Profile avatar PostgreSQL integration requires TEST_DATABASE_URL');
} else {
  test('managed profile avatar survives upload, profile PATCH, restart, and new session', async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    process.env.JWT_SECRET ??= crypto.randomBytes(48).toString('base64url');
    process.env.MAIL_TRANSPORT = 'memory';
    process.env.PAYMENT_TRANSPORT = 'memory';
    process.env.PUSH_TRANSPORT = 'memory';
    const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-profile-avatar-'));
    process.env.UPLOAD_DIR = uploadDir;

    const { Pool } = pg;
    const setupPool = new Pool({ connectionString: databaseUrl, max: 4 });
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const schema = await fs.readFile(path.resolve(currentDir, '../sql/schema.sql'), 'utf8');
    const { runMigrations } = await import('../src/migrations.js');
    const ownerId = 'profile-avatar-owner';
    const foreignId = 'profile-avatar-foreign';
    const ownerSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const freshSessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const foreignSessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    let server;
    let applicationPool;

    try {
      await setupPool.query(schema);
      await runMigrations(setupPool);
      await runMigrations(setupPool);
      await setupPool.query(
        'DELETE FROM users WHERE id = ANY($1::text[])',
        [[ownerId, foreignId]],
      );
      await setupPool.query(
        `INSERT INTO users (
           id, email, profile, role, account_status, email_verified_at
         ) VALUES
           ($1, 'profile-avatar-owner@example.invalid', '{"displayName":"Avatar Owner"}'::jsonb, 'user', 'active', now()),
           ($2, 'profile-avatar-foreign@example.invalid', '{"displayName":"Other User"}'::jsonb, 'user', 'active', now())`,
        [ownerId, foreignId],
      );
      await setupPool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES
           ($1, $4, 'Profile avatar owner'),
           ($2, $4, 'Profile avatar fresh session'),
           ($3, $5, 'Profile avatar foreign session')
         ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id`,
        [ownerSessionId, freshSessionId, foreignSessionId, ownerId, foreignId],
      );

      const { createApp } = await import('../src/app.js');
      ({ pool: applicationPool } = await import('../src/db.js'));
      const { signAccessToken } = await import('../src/security.js');
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
      const ownerToken = signAccessToken(
        { id: ownerId, email: 'profile-avatar-owner@example.invalid' },
        { sessionId: ownerSessionId },
      );
      const freshToken = signAccessToken(
        { id: ownerId, email: 'profile-avatar-owner@example.invalid' },
        { sessionId: freshSessionId },
      );
      const foreignToken = signAccessToken(
        { id: foreignId, email: 'profile-avatar-foreign@example.invalid' },
        { sessionId: foreignSessionId },
      );
      const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
      const jsonHeaders = (token) => ({
        ...authHeaders(token),
        'Content-Type': 'application/json',
      });
      let baseUrl = await startServer();

      const image = await sharp({
        create: {
          width: 40,
          height: 40,
          channels: 4,
          background: { r: 36, g: 99, b: 235, alpha: 1 },
        },
      }).png().toBuffer();
      const form = new FormData();
      form.append('purpose', 'profile_image');
      form.append('file', new Blob([image], { type: 'image/png' }), 'avatar.png');
      const uploadResponse = await fetch(`${baseUrl}/v1/uploads`, {
        method: 'POST',
        headers: authHeaders(ownerToken),
        body: form,
      });
      assert.equal(uploadResponse.status, 201);
      const upload = await uploadResponse.json();
      assert.match(upload.url, /\/uploads\/[0-9a-f-]{36}-full\.webp$/u);
      const storedUpload = await setupPool.query(
        `SELECT owner_id, purpose, visibility, content_scan_status
           FROM uploads WHERE storage_name = $1`,
        [upload.storageName],
      );
      assert.deepEqual(storedUpload.rows[0], {
        owner_id: ownerId,
        purpose: 'profile_image',
        visibility: 'public',
        content_scan_status: 'passed',
      });

      const patchResponse = await fetch(`${baseUrl}/v1/profile`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({ profile: { photoURL: upload.url } }),
      });
      assert.equal(patchResponse.status, 200);
      assert.equal((await patchResponse.json()).user.photoURL, upload.url);
      const storedProfile = await setupPool.query(
        `SELECT profile->>'photoURL' AS photo_url
           FROM users WHERE id = $1`,
        [ownerId],
      );
      assert.equal(storedProfile.rows[0].photo_url, upload.url);

      await stopServer();
      baseUrl = await startServer();
      const afterRestart = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: authHeaders(ownerToken),
      });
      assert.equal(afterRestart.status, 200);
      assert.equal((await afterRestart.json()).user.photoURL, upload.url);

      const afterNewSession = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: authHeaders(freshToken),
      });
      assert.equal(afterNewSession.status, 200);
      assert.equal((await afterNewSession.json()).user.photoURL, upload.url);

      const foreignBinding = await fetch(`${baseUrl}/v1/profile`, {
        method: 'PATCH',
        headers: jsonHeaders(foreignToken),
        body: JSON.stringify({ profile: { photoURL: upload.url } }),
      });
      assert.equal(foreignBinding.status, 403);
      assert.equal((await foreignBinding.json()).error, 'profile_photo_forbidden');

      const unmanagedBinding = await fetch(`${baseUrl}/v1/profile`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({
          profile: { photoURL: 'https://example.invalid/not-an-sit-upload.png' },
        }),
      });
      assert.equal(unmanagedBinding.status, 400);
      assert.equal(
        (await unmanagedBinding.json()).error,
        'profile_photo_must_be_uploaded',
      );
      await stopServer();
    } finally {
      await setupPool.query(
        'DELETE FROM users WHERE id = ANY($1::text[])',
        [[ownerId, foreignId]],
      ).catch(() => {});
      await setupPool.end();
      if (applicationPool) await applicationPool.end().catch(() => {});
      if (server) {
        await new Promise((resolve) => server.close(() => resolve()));
      }
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });
}
