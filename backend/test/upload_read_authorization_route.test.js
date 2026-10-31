import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.MAIL_TRANSPORT = 'memory';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.SIT_STAGING_ACCESS_GATE_ENABLED = 'false';
const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-upload-read-'));
process.env.UPLOAD_DIR = uploadDir;

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/security.js');

const storageName = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
const thumbnailStorageName = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp';
const owner = { id: 'owner-1', email: 'owner@example.test' };

function uploadRecord({
  visibility = 'public',
  purpose = 'profile_image',
  listing = false,
  participantId = null,
} = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    owner_id: owner.id,
    user1_id: participantId,
    user2_id: null,
    visibility,
    purpose: listing ? 'listing_image' : purpose,
    storage_name: storageName,
    thumbnail_storage_name: thumbnailStorageName,
    mime_type: 'image/webp',
    thumbnail_mime_type: 'image/webp',
    byte_size: 8,
    thumbnail_byte_size: 8,
    listing_catalog_version: listing ? 1 : null,
    listing_status: listing ? 'active' : null,
    listing_is_active: listing ? true : null,
  };
}

function requester(t) {
  let current = { record: uploadRecord(), activeSession: true };
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('FROM uploads AS upload')) return { rows: [current.record] };
    if (sql.includes('FROM users AS u')) {
      return {
        rowCount: current.activeSession ? 1 : 0,
        rows: current.activeSession ? [{ id: owner.id }] : [],
      };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  return async ({ record, authorization, activeSession = true }) => {
    current = { record, activeSession };
    await fs.writeFile(path.join(uploadDir, storageName), 'upload');
    const server = http.createServer(createApp());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      const headers = authorization ? { Authorization: authorization } : undefined;
      return await fetch(`http://127.0.0.1:${address.port}/v1/uploads/${storageName}`, { headers });
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

test('public media does not leak X-Upload-Id for empty or manipulated tokens', async (t) => {
  const request = requester(t);
  const cases = [undefined, 'Bearer ', 'Bearer owner-token-manipulated'];
  for (const authorization of cases) {
    const response = await request({
      record: uploadRecord(),
      authorization,
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('x-upload-id'), null);
  }
});

test('public profile media never exposes X-Upload-Id, including to the verified owner', async (t) => {
  const request = requester(t);
  const token = signAccessToken(owner, { sessionId: 'session-owner-1' });
  const response = await request({
    record: uploadRecord(),
    authorization: `Bearer ${token}`,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('x-upload-id'), null);
});

test('public listing media remains readable without exposing profile upload metadata', async (t) => {
  const request = requester(t);
  const foreignToken = signAccessToken(
    { id: 'foreign-1', email: 'foreign@example.test' },
    { sessionId: 'session-foreign-1' },
  );
  const response = await request({
    record: uploadRecord({ listing: true }),
    authorization: `Bearer ${foreignToken}`,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('x-upload-id'), null);
});

test('anonymous catalog reads serve only public active catalog media; forged client opt-in has no authority', async (t) => {
  const request = requester(t);
  const publicListing = uploadRecord({ listing: true });
  const publicResponse = await request({ record: publicListing });
  assert.equal(publicResponse.status, 200);
  assert.match(publicResponse.headers.get('content-type'), /^image\/webp/u);
  assert.equal(publicResponse.headers.get('x-upload-id'), null);
  assert.equal(await publicResponse.text(), 'upload');
  assert.equal(pool.query.mock.calls.length, 1,
    'anonymous public read performs only the authoritative upload/listing lookup');

  for (const record of [
    { ...publicListing, visibility: 'private' },
    { ...publicListing, listing_is_active: false },
    { ...publicListing, listing_status: 'paused' },
    { ...publicListing, listing_status: 'draft' },
    { ...publicListing, listing_catalog_version: 0 },
  ]) {
    const denied = await request({ record });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).error, 'invalid_or_expired_session');
    assert.equal(denied.headers.get('x-upload-id'), null);
  }
  const missing = await request({ record: null });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'upload_not_found');
});

test('a database storage name that is not one safe filename fails closed', async (t) => {
  const request = requester(t);
  const response = await request({
    record: { ...uploadRecord(), storage_name: '../outside-upload.webp' },
  });
  assert.equal(response.status, 404, await response.clone().text());
  assert.equal(response.headers.get('x-upload-id'), null);
});

test('private media still requires a verified participant session', async (t) => {
  const request = requester(t);
  const missing = await request({ record: uploadRecord({ visibility: 'private' }) });
  assert.equal(missing.status, 401, await missing.clone().text());

  const ownerResponse = await request({
    record: uploadRecord({ visibility: 'private' }),
    authorization: `Bearer ${signAccessToken(owner, { sessionId: 'session-owner-1' })}`,
  });
  assert.equal(ownerResponse.status, 200, await ownerResponse.clone().text());
  assert.equal(ownerResponse.headers.get('x-upload-id'), uploadRecord({ visibility: 'private' }).id);

  const participant = await request({
    record: uploadRecord({ visibility: 'private', participantId: 'participant-1' }),
    authorization: `Bearer ${signAccessToken(
      { id: 'participant-1', email: 'participant@example.test' },
      { sessionId: 'session-participant-1' },
    )}`,
  });
  assert.equal(participant.status, 200, await participant.clone().text());
  assert.equal(participant.headers.get('x-upload-id'), null);

  const invalid = await request({
    record: uploadRecord({ visibility: 'private' }),
    authorization: 'Bearer manipulated-token',
  });
  assert.equal(invalid.status, 401, await invalid.clone().text());

  const foreignToken = signAccessToken(
    { id: 'foreign-1', email: 'foreign@example.test' },
    { sessionId: 'session-foreign-1' },
  );
  const foreign = await request({
    record: uploadRecord({ visibility: 'private' }),
    authorization: `Bearer ${foreignToken}`,
  });
  assert.equal(foreign.status, 403);

  const revoked = await request({
    record: uploadRecord({ visibility: 'private' }),
    authorization: `Bearer ${signAccessToken(owner, { sessionId: 'revoked-session' })}`,
    activeSession: false,
  });
  assert.equal(revoked.status, 401, await revoked.clone().text());
});
