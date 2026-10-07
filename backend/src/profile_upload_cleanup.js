const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isUploadId(value) {
  return typeof value === 'string' && uploadIdPattern.test(value);
}

export function ownedUploadCleanupDecision({ upload, references = {} } = {}) {
  if (!upload) return { status: 404, code: 'upload_not_found' };
  if (upload.owner_id === undefined || upload.owner_id === null) {
    return { status: 404, code: 'upload_not_found' };
  }
  if (upload.purpose !== 'profile_image') {
    return { status: 409, code: 'upload_in_use' };
  }
  if (Object.values(references).some(Boolean)) {
    return { status: 409, code: 'upload_in_use' };
  }
  return {
    status: 204,
    code: 'upload_deleted',
    storageNames: [upload.storage_name, upload.thumbnail_storage_name].filter(Boolean),
  };
}

export function exactUploadStorageNames(upload) {
  return [upload?.storage_name, upload?.thumbnail_storage_name]
    .filter((value) => typeof value === 'string' && value.length > 0);
}
