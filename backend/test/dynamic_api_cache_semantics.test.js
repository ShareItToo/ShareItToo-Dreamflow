import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';

process.env.DATABASE_URL ??=
  'postgres://example:example@127.0.0.1:5432/example';
process.env.JWT_SECRET ??=
  'dynamic-api-cache-test-secret-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.MAIL_TRANSPORT = 'memory';
process.env.PAYMENT_TRANSPORT = 'memory';
process.env.PUSH_TRANSPORT = 'memory';
process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.SIT_STAGING_ACCESS_GATE_ENABLED = 'false';
const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-cache-semantics-'));
process.env.UPLOAD_DIR = uploadDir;

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { attachRealtime } = await import('../src/realtime.js');
const { signAccessToken } = await import('../src/security.js');

const actor = {
  id: 'cache-semantics-user',
  email: 'cache-semantics@example.invalid',
  role: 'user',
  account_status: 'active',
  deactivated_at: null,
  email_verified_at: new Date('2026-01-01T00:00:00.000Z'),
  phone_verified_at: null,
  terms_accepted_at: new Date('2026-01-01T00:00:00.000Z'),
  privacy_accepted_at: new Date('2026-01-01T00:00:00.000Z'),
  minimum_age_confirmed_at: new Date('2026-01-01T00:00:00.000Z'),
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  profile: {},
};

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on('error', reject);
  });
}

test('dynamic REST reads return complete no-store JSON without changing health or realtime', async (t) => {
  t.after(() => fs.rm(uploadDir, { recursive: true, force: true }));
  let catalogQueries = 0;
  let activeAccountQueries = 0;
  let profileQueries = 0;
  t.mock.method(pool, 'query', async (sql) => {
    const statement = String(sql);
    if (statement.includes('FROM listings')) {
      catalogQueries += 1;
      return { rows: [] };
    }
    if (statement.includes('LEFT JOIN auth_sessions AS session')) {
      activeAccountQueries += 1;
      return {
        rows: [{
          ...actor,
          session_id: 'cache-semantics-session',
          session_revoked_at: null,
          mfa_status: null,
          mfa_enabled_at: null,
          mfa_verified_at: null,
        }],
      };
    }
    if (statement.includes('SELECT * FROM users')) {
      profileQueries += 1;
      return { rowCount: 1, rows: [actor] };
    }
    if (statement.includes('FROM uploads AS upload')) {
      return {
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          owner_id: actor.id,
          visibility: 'public',
          purpose: 'profile_image',
          storage_name: 'cache-semantics.webp',
          thumbnail_storage_name: null,
          mime_type: 'image/webp',
          thumbnail_mime_type: null,
          byte_size: 12,
          thumbnail_byte_size: null,
          user1_id: null,
          user2_id: null,
          listing_status: null,
          listing_is_active: null,
          listing_catalog_version: null,
        }],
      };
    }
    throw new Error(`unexpected query: ${statement}`);
  });

  const server = http.createServer(createApp());
  const websocketServer = attachRealtime(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await fs.writeFile(path.join(uploadDir, 'cache-semantics.webp'), 'static-bytes');
    const catalog = await get(`${baseUrl}/v1/listings?sort=newest&limit=100`);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers['cache-control'], 'no-store');
    const catalogEtag = catalog.headers.etag;
    assert.ok(catalogEtag);
    assert.deepEqual(JSON.parse(catalog.body), {
      listings: [],
      page: { limit: 100, offset: 0, count: 0, hasMore: false },
    });

    const catalogConditional = await get(
      `${baseUrl}/v1/listings?sort=newest&limit=100`,
      { 'If-None-Match': catalogEtag },
    );
    assert.equal(catalogConditional.status, 200);
    assert.equal(catalogConditional.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(catalogConditional.body), {
      listings: [],
      page: { limit: 100, offset: 0, count: 0, hasMore: false },
    });
    assert.equal(catalogQueries, 2);

    const authorization = `Bearer ${signAccessToken(actor, {
      sessionId: 'cache-semantics-session',
    })}`;
    const profile = await get(`${baseUrl}/v1/auth/me`, { Authorization: authorization });
    assert.equal(profile.status, 200);
    assert.equal(profile.headers['cache-control'], 'no-store');
    const profileEtag = profile.headers.etag;
    assert.ok(profileEtag);
    const expectedProfile = JSON.parse(profile.body);

    const profileConditional = await get(`${baseUrl}/v1/auth/me`, {
      Authorization: authorization,
      'If-None-Match': profileEtag,
    });
    assert.equal(profileConditional.status, 200);
    assert.equal(profileConditional.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(profileConditional.body), expectedProfile);
    assert.equal(activeAccountQueries, 2);
    assert.equal(profileQueries, 2);

    const health = await get(`${baseUrl}/health/live`);
    assert.equal(health.status, 200);
    assert.notEqual(health.headers['cache-control'], 'no-store');
    const healthEtag = health.headers.etag;
    assert.ok(healthEtag);
    const healthConditional = await get(`${baseUrl}/health/live`, {
      'If-None-Match': healthEtag,
    });
    assert.equal(healthConditional.status, 304);

    const upload = await get(`${baseUrl}/v1/uploads/cache-semantics.webp`);
    assert.equal(upload.status, 200);
    assert.equal(upload.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(upload.body.toString(), 'static-bytes');
    const uploadEtag = upload.headers.etag;
    assert.ok(uploadEtag);
    const uploadConditional = await get(`${baseUrl}/v1/uploads/cache-semantics.webp`, {
      'If-None-Match': uploadEtag,
    });
    assert.equal(uploadConditional.status, 304);
    assert.equal(
      uploadConditional.headers['cache-control'],
      'public, max-age=31536000, immutable',
    );

    const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/v1/realtime`);
    await once(socket, 'open');
    assert.equal(socket.readyState, WebSocket.OPEN);
    socket.close(1000, 'test_complete');
    await once(socket, 'close');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
    websocketServer.close();
  }
});
