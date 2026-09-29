import path from 'node:path';

function emptyAuthorization(status = 'anonymous') {
  return Object.freeze({
    status,
    userId: null,
    sessionId: null,
    participantAuthorized: false,
    ownerAuthorized: false,
  });
}

/**
 * Resolve upload-read access from a verified access token and a live session.
 * The caller must use the returned authorization facts, never the raw token,
 * when deciding whether private media or response metadata may be exposed.
 */
export async function resolveUploadReadAuthorization({
  token,
  uploadRecord,
  verifyToken,
  findActiveSession,
}) {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) return emptyAuthorization();

  let payload;
  try {
    payload = verifyToken(normalizedToken);
  } catch {
    return emptyAuthorization('invalid_token');
  }

  const userId = typeof payload?.sub === 'string' ? payload.sub : null;
  const sessionId = typeof payload?.sid === 'string' ? payload.sid : null;
  if (!userId || !sessionId) return emptyAuthorization('invalid_token');

  const active = await findActiveSession({ userId, sessionId });
  if (!active) {
    return Object.freeze({
      ...emptyAuthorization('inactive_session'),
      userId,
      sessionId,
    });
  }

  const participantAuthorized = [
    uploadRecord?.owner_id,
    uploadRecord?.user1_id,
    uploadRecord?.user2_id,
  ].includes(userId);
  return Object.freeze({
    status: 'authenticated',
    userId,
    sessionId,
    participantAuthorized,
    ownerAuthorized: userId === uploadRecord?.owner_id,
  });
}

export function shouldExposeUploadId({ authorization, uploadRecord }) {
  return authorization?.ownerAuthorized === true
    && uploadRecord?.purpose === 'profile_image'
    && uploadRecord?.visibility !== 'public';
}

export function resolveUploadStoragePath(uploadDir, storageName) {
  if (typeof uploadDir !== 'string' || !storageNamePattern.test(storageName ?? '')) return null;
  const root = path.resolve(uploadDir);
  const candidate = path.resolve(root, storageName);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

const storageNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/u;
