import { safeOperationalErrorCode } from './observability.js';

export const firebaseIdentityCleanupIntervalMs = 5 * 60 * 1000;

const allowedProviders = new Set(['google', 'apple', 'facebook']);
const userNotFoundCodes = new Set(['auth/user-not-found', 'user-not-found']);

async function defaultAuthClientFactory() {
  const { firebaseAuthClient } = await import('./firebase_social_auth.js');
  return firebaseAuthClient();
}

function boundedFirebaseUid(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && normalized.length <= 180 ? normalized : '';
}

function providerErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code.trim() : '';
  if (/^(?:auth\/)?[a-z0-9_-]{1,80}$/u.test(code)) return code;
  return 'provider_delete_failed';
}

export async function enqueueFirebaseIdentityDeletions(client, { userId } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Firebase identity cleanup requires a database client.');
  }
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) throw new Error('Firebase identity cleanup requires a user ID.');
  const result = await client.query(
    `INSERT INTO firebase_identity_deletion_outbox (
       firebase_user_id, provider, status, attempts, next_attempt_at,
       locked_at, last_error_code, updated_at
     )
     SELECT DISTINCT firebase_user_id, provider, 'pending', 0, now(),
            NULL::timestamptz, NULL::text, now()
     FROM auth_identities
     WHERE user_id = $1
       AND provider IN ('google', 'apple', 'facebook')
       AND firebase_user_id IS NOT NULL
       AND char_length(firebase_user_id) BETWEEN 1 AND 180
     ON CONFLICT (firebase_user_id) DO UPDATE
       SET provider = EXCLUDED.provider,
           status = 'pending',
           attempts = 0,
           next_attempt_at = now(),
           locked_at = NULL,
           last_error_code = NULL,
           updated_at = now()
     RETURNING id`,
    [normalizedUserId],
  );
  return result.rows.map((row) => String(row.id));
}

async function claimNext(client, ids) {
  const idFilterProvided = Array.isArray(ids);
  const boundedIds = Array.isArray(ids)
    ? ids.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/iu.test(id)).slice(0, 50)
    : [];
  const result = await client.query(
    `UPDATE firebase_identity_deletion_outbox AS target
     SET status = 'processing',
         attempts = target.attempts + 1,
         locked_at = now(),
         updated_at = now()
     WHERE target.id = (
       SELECT candidate.id
       FROM firebase_identity_deletion_outbox AS candidate
       WHERE (
         (candidate.status IN ('pending', 'retry') AND candidate.next_attempt_at <= now())
         OR (candidate.status = 'processing' AND candidate.locked_at < now() - interval '15 minutes')
       )
       AND ($1::uuid[] IS NULL OR candidate.id = ANY($1::uuid[]))
       ORDER BY candidate.next_attempt_at, candidate.created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING target.id, target.firebase_user_id, target.provider, target.attempts`,
    [idFilterProvided ? boundedIds : null],
  );
  return result.rows[0] ?? null;
}

export async function drainFirebaseIdentityDeletionOutbox({
  client,
  authClientFactory = defaultAuthClientFactory,
  ids = null,
  limit = 20,
} = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Firebase identity cleanup requires a database client.');
  }
  if (typeof authClientFactory !== 'function') {
    throw new Error('Firebase identity cleanup requires an auth client factory.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Firebase identity cleanup limit must be between 1 and 100.');
  }
  if (Array.isArray(ids) && ids.length === 0) return { deleted: 0, retried: 0 };
  let deleted = 0;
  let retried = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await claimNext(client, ids);
    if (!row) break;
    const firebaseUserId = boundedFirebaseUid(row.firebase_user_id);
    const provider = typeof row.provider === 'string' ? row.provider : '';
    if (!firebaseUserId || !allowedProviders.has(provider)) {
      await client.query(
        `UPDATE firebase_identity_deletion_outbox
         SET status = 'retry', next_attempt_at = now() + interval '24 hours',
             locked_at = NULL, last_error_code = 'invalid_queued_identity', updated_at = now()
         WHERE id = $1`,
        [row.id],
      );
      retried += 1;
      continue;
    }
    try {
      const auth = await authClientFactory();
      await auth.deleteUser(firebaseUserId);
      await client.query(
        'DELETE FROM firebase_identity_deletion_outbox WHERE id = $1',
        [row.id],
      );
      deleted += 1;
    } catch (error) {
      const code = providerErrorCode(error);
      if (userNotFoundCodes.has(code)) {
        await client.query(
          'DELETE FROM firebase_identity_deletion_outbox WHERE id = $1',
          [row.id],
        );
        deleted += 1;
        continue;
      }
      const retryMinutes = Math.min(24 * 60, 2 ** Math.min(Number(row.attempts ?? 1), 10));
      await client.query(
        `UPDATE firebase_identity_deletion_outbox
         SET status = 'retry',
             next_attempt_at = now() + ($2::int * interval '1 minute'),
             locked_at = NULL,
             last_error_code = $3,
             updated_at = now()
         WHERE id = $1`,
        [row.id, retryMinutes, code],
      );
      retried += 1;
    }
  }
  return { deleted, retried };
}

export function startFirebaseIdentityCleanupWorker({
  client,
  intervalMs = firebaseIdentityCleanupIntervalMs,
  authClientFactory = defaultAuthClientFactory,
  onError = (error) => console.error(
    '[privacy] Firebase identity cleanup failed',
    safeOperationalErrorCode(error, 'cleanup_failed'),
  ),
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 24 * 60 * 60 * 1000) {
    throw new Error('Firebase identity cleanup interval must be between one minute and 24 hours.');
  }
  if (!client || typeof client.query !== 'function') {
    throw new Error('Firebase identity cleanup requires a database client.');
  }
  const run = () => {
    void drainFirebaseIdentityDeletionOutbox({ client, authClientFactory }).catch(onError);
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
