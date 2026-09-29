import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveUploadReadAuthorization,
  resolveUploadStoragePath,
  shouldExposeUploadId,
} from '../src/upload_read_authorization.js';

const ownerId = 'owner-1';
const ownerSessionId = 'session-owner-1';
const profileUpload = {
  id: 'upload-1',
  owner_id: ownerId,
  user1_id: null,
  user2_id: null,
  visibility: 'private',
  purpose: 'profile_image',
};

function activeSession({ userId, sessionId }) {
  return userId === ownerId && sessionId === ownerSessionId;
}

function verifyToken(token) {
  if (token !== 'owner-token') throw new Error('invalid token');
  return { sub: ownerId, sid: ownerSessionId };
}

test('empty token remains anonymous and cannot expose X-Upload-Id', async () => {
  const authorization = await resolveUploadReadAuthorization({
    token: '   ',
    uploadRecord: profileUpload,
    verifyToken,
    findActiveSession: async () => assert.fail('anonymous request must not query a session'),
  });
  assert.equal(authorization.status, 'anonymous');
  assert.equal(shouldExposeUploadId({ authorization, uploadRecord: profileUpload }), false);
});

test('manipulated token is invalid and cannot expose X-Upload-Id', async () => {
  const authorization = await resolveUploadReadAuthorization({
    token: 'owner-token-manipulated',
    uploadRecord: profileUpload,
    verifyToken,
    findActiveSession: async () => assert.fail('invalid token must not query a session'),
  });
  assert.equal(authorization.status, 'invalid_token');
  assert.equal(shouldExposeUploadId({ authorization, uploadRecord: profileUpload }), false);
});

test('owner requires a live server-side session before X-Upload-Id is exposed', async () => {
  const authorization = await resolveUploadReadAuthorization({
    token: 'owner-token',
    uploadRecord: profileUpload,
    verifyToken,
    findActiveSession: activeSession,
  });
  assert.equal(authorization.status, 'authenticated');
  assert.equal(authorization.ownerAuthorized, true);
  assert.equal(shouldExposeUploadId({ authorization, uploadRecord: profileUpload }), true);
});

test('valid foreign token remains non-owner and cannot leak upload metadata', async () => {
  const authorization = await resolveUploadReadAuthorization({
    token: 'foreign-token',
    uploadRecord: profileUpload,
    verifyToken: () => ({ sub: 'foreign-1', sid: 'session-foreign-1' }),
    findActiveSession: async () => true,
  });
  assert.equal(authorization.status, 'authenticated');
  assert.equal(authorization.participantAuthorized, false);
  assert.equal(authorization.ownerAuthorized, false);
  assert.equal(shouldExposeUploadId({ authorization, uploadRecord: profileUpload }), false);
});

test('inactive server-side session is not authenticated', async () => {
  const authorization = await resolveUploadReadAuthorization({
    token: 'owner-token',
    uploadRecord: profileUpload,
    verifyToken,
    findActiveSession: async () => false,
  });
  assert.equal(authorization.status, 'inactive_session');
  assert.equal(authorization.ownerAuthorized, false);
  assert.equal(shouldExposeUploadId({ authorization, uploadRecord: profileUpload }), false);
});

test('storage paths accept one safe name and remain canonical under uploadDir', () => {
  const root = '/var/lib/shareittoo/uploads';
  const safePath = resolveUploadStoragePath(root, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp');
  assert.equal(safePath, `${root}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp`);
  for (const unsafeName of ['', '../secrets', 'nested/file.webp', '/absolute.webp', '..']) {
    assert.equal(resolveUploadStoragePath(root, unsafeName), null, unsafeName);
  }
});
