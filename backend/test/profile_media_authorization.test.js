import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeProfilePhoto,
  profilePhotoStorageName,
} from '../src/profile_media_authorization.js';

const baseUrl = 'https://shareittoo.com/api/v1';
const ownerId = 'owner-1';
const storageName = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
const photoUrl = `${baseUrl}/uploads/${storageName}`;
const approvedUpload = {
  owner_id: ownerId,
  storage_name: storageName,
  purpose: 'profile_image',
  visibility: 'public',
  content_scan_status: 'passed',
};

function lookup(row) {
  return async (requestedStorageName) => (
    row && requestedStorageName === row.storage_name ? row : null
  );
}

test('accepts an owned approved profile upload and allows explicit removal', async () => {
  const accepted = await authorizeProfilePhoto({
    photoUrl,
    ownerId,
    publicBaseUrl: baseUrl,
    findUpload: lookup(approvedUpload),
  });
  assert.deepEqual(accepted, {
    accepted: true,
    clear: false,
    storageName,
  });
  const cleared = await authorizeProfilePhoto({
    photoUrl: null,
    ownerId,
    publicBaseUrl: baseUrl,
    findUpload: lookup(approvedUpload),
  });
  assert.deepEqual(cleared, { accepted: true, clear: true, storageName: null });
});

test('rejects malformed, thumbnail and unmanaged profile references', async () => {
  for (const invalidUrl of [
    'not-a-url',
    `${baseUrl}/uploads/${storageName.replace('-full.webp', '-thumb.webp')}`,
    `${baseUrl}/uploads/${storageName}?cache=1`,
    `https://evil.example/uploads/${storageName}`,
    `${baseUrl}/other/${storageName}`,
  ]) {
    const result = await authorizeProfilePhoto({
      photoUrl: invalidUrl,
      ownerId,
      publicBaseUrl: baseUrl,
      findUpload: async () => assert.fail('malformed reference must not query uploads'),
    });
    assert.deepEqual(result, {
      accepted: false,
      code: 'profile_photo_must_be_uploaded',
      status: 400,
    });
  }
  assert.equal(profilePhotoStorageName(photoUrl, baseUrl), storageName);
});

test('rejects missing, foreign, wrong-purpose and unapproved uploads', async () => {
  const cases = [
    { row: null, code: 'profile_photo_not_found', status: 400 },
    { row: { ...approvedUpload, owner_id: 'owner-2' }, code: 'profile_photo_forbidden', status: 403 },
    { row: { ...approvedUpload, purpose: 'listing_image' }, code: 'profile_photo_not_approved', status: 400 },
    { row: { ...approvedUpload, visibility: 'private' }, code: 'profile_photo_not_approved', status: 400 },
    { row: { ...approvedUpload, content_scan_status: 'pending' }, code: 'profile_photo_not_approved', status: 400 },
    { row: { ...approvedUpload, storage_name: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-full.webp' }, code: 'profile_photo_not_found', status: 400 },
  ];
  for (const { row, code, status } of cases) {
    const result = await authorizeProfilePhoto({
      photoUrl,
      ownerId,
      publicBaseUrl: baseUrl,
      findUpload: lookup(row),
    });
    assert.deepEqual(result, { accepted: false, code, status });
  }
});
