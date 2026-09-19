const fullUploadNamePattern = /^[0-9a-f-]{36}-full\.(?:webp|jpe?g|png)$/iu;

function reject(code, status = 400) {
  return { accepted: false, code, status };
}

/**
 * Resolve only an exact, managed full-size upload URL. Query strings,
 * fragments, thumbnails, alternate origins and alternate path prefixes are
 * deliberately rejected before any database lookup.
 */
export function profilePhotoStorageName(photoUrl, publicBaseUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl || typeof publicBaseUrl !== 'string') {
    return null;
  }
  let photo;
  let base;
  try {
    photo = new URL(photoUrl);
    base = new URL(publicBaseUrl);
  } catch {
    return null;
  }
  const prefix = `${base.pathname.replace(/\/$/u, '')}/uploads/`;
  if (photo.origin !== base.origin
      || photo.pathname !== photo.pathname.trim()
      || !photo.pathname.startsWith(prefix)
      || photo.search
      || photo.hash) {
    return null;
  }
  let storageName;
  try {
    storageName = decodeURIComponent(photo.pathname.slice(prefix.length));
  } catch {
    return null;
  }
  return fullUploadNamePattern.test(storageName) ? storageName : null;
}

/**
 * Authorize a profile image reference against the server-owned upload row.
 * `findUpload` is injected so the exact decision can be tested without a
 * live database or provider traffic.
 */
export async function authorizeProfilePhoto({
  photoUrl,
  ownerId,
  publicBaseUrl,
  findUpload,
}) {
  if (photoUrl === null || photoUrl === '') {
    return { accepted: true, clear: true, storageName: null };
  }
  const storageName = profilePhotoStorageName(photoUrl, publicBaseUrl);
  if (!storageName) return reject('profile_photo_must_be_uploaded');
  const upload = await findUpload(storageName);
  if (!upload) return reject('profile_photo_not_found');
  if (upload.owner_id !== ownerId) return reject('profile_photo_forbidden', 403);
  if (upload.storage_name !== storageName
      || upload.purpose !== 'profile_image'
      || upload.visibility !== 'public'
      || upload.content_scan_status !== 'passed') {
    return reject('profile_photo_not_approved');
  }
  return { accepted: true, clear: false, storageName };
}
