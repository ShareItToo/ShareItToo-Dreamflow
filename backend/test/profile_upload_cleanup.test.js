import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exactUploadStorageNames,
  isUploadId,
  ownedUploadCleanupDecision,
} from '../src/profile_upload_cleanup.js';

const upload = {
  owner_id: 'owner-1',
  purpose: 'profile_image',
  storage_name: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp',
  thumbnail_storage_name: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-thumb.webp',
};

test('accepts UUID upload ids and rejects malformed ids', () => {
  assert.equal(isUploadId('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isUploadId('not-an-upload-id'), false);
  assert.equal(isUploadId('123e4567-e89b-62d3-a456-426614174000'), false);
});

test('returns idempotent not-found for absent or foreign rows', () => {
  assert.deepEqual(ownedUploadCleanupDecision(), { status: 404, code: 'upload_not_found' });
  assert.deepEqual(ownedUploadCleanupDecision({ upload: { ...upload, owner_id: null } }), { status: 404, code: 'upload_not_found' });
});

test('blocks every bound reference with non-leaking conflict semantics', () => {
  for (const key of ['profile', 'listing', 'thread', 'report', 'condition', 'v52Return', 'v52Loss']) {
    assert.deepEqual(ownedUploadCleanupDecision({ upload, references: { [key]: true } }), {
      status: 409,
      code: 'upload_in_use',
    });
  }
});

test('limits owner cleanup to unreferenced profile images', () => {
  assert.deepEqual(ownedUploadCleanupDecision({
    upload: { ...upload, purpose: 'listing_image' },
    references: {},
  }), {
    status: 409,
    code: 'upload_in_use',
  });
});

test('returns exact full/thumb storage names only after an unreferenced decision', () => {
  assert.deepEqual(ownedUploadCleanupDecision({ upload, references: {} }), {
    status: 204,
    code: 'upload_deleted',
    storageNames: [upload.storage_name, upload.thumbnail_storage_name],
  });
  assert.deepEqual(exactUploadStorageNames(upload), [upload.storage_name, upload.thumbnail_storage_name]);
});
