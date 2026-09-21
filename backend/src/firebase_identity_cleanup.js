import { safeOperationalErrorCode } from './observability.js';
import { decryptAppleRevocationMaterial, AppleRevocationError } from './apple_revocation.js';

export const firebaseIdentityCleanupIntervalMs = 5 * 60 * 1000;

const allowedProviders = new Set(['google', 'apple', 'facebook']);
const userNotFoundCodes = new Set(['auth/user-not-found', 'user-not-found']);
const appleCompletedStatuses = new Set(['not_required', 'succeeded']);

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

function appleErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code.trim() : '';
  return /^apple_[a-z0-9_-]{1,80}$/u.test(code) ? code : 'apple_revocation_failed';
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
       locked_at, last_error_code, apple_revocation_status,
       apple_revocation_material_kind, apple_revocation_material_ciphertext,
       apple_revocation_attempts, updated_at
     )
     SELECT DISTINCT firebase_user_id, provider, 'pending', 0, now(),
            NULL::timestamptz, NULL::text,
            CASE WHEN provider = 'apple' AND apple_revocation_material_ciphertext IS NOT NULL
                 THEN 'pending' ELSE CASE WHEN provider = 'apple' THEN 'needs_material' ELSE 'not_required' END END,
            apple_revocation_material_kind, apple_revocation_material_ciphertext,
            0, now()
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
           apple_revocation_status = CASE
             WHEN firebase_identity_deletion_outbox.apple_revocation_status = 'succeeded'
               THEN 'succeeded'
             ELSE EXCLUDED.apple_revocation_status
           END,
           apple_revocation_material_kind = COALESCE(
             EXCLUDED.apple_revocation_material_kind,
             firebase_identity_deletion_outbox.apple_revocation_material_kind
           ),
           apple_revocation_material_ciphertext = COALESCE(
             EXCLUDED.apple_revocation_material_ciphertext,
             firebase_identity_deletion_outbox.apple_revocation_material_ciphertext
           ),
           updated_at = now()
     RETURNING id`,
    [normalizedUserId],
  );
  return result.rows.map((row) => String(row.id));
}

export async function getAppleRevocationCleanupStatus(client, { ids } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Firebase identity cleanup requires a database client.');
  }
  const boundedIds = Array.isArray(ids)
    ? ids.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/iu.test(id)).slice(0, 50)
    : [];
  if (!boundedIds.length) return 'not_required';
  const result = await client.query(
    `SELECT apple_revocation_status
       FROM firebase_identity_deletion_outbox
      WHERE id = ANY($1::uuid[])`,
    [boundedIds],
  );
  if (result.rows.length !== boundedIds.length) return 'pending';
  if (!result.rows.some((row) => row.apple_revocation_status !== 'not_required')) return 'not_required';
  if (result.rows.some((row) => ['needs_material', 'blocked'].includes(row.apple_revocation_status))) return 'pending';
  return 'queued';
}

async function claimNext(client, ids) {
  const idFilterProvided = Array.isArray(ids);
  const boundedIds = Array.isArray(ids)
    ? ids.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/iu.test(id)).slice(0, 50)
    : [];
  const result = await client.query(
    `UPDATE firebase_identity_deletion_outbox AS target
     SET status = 'processing', attempts = target.attempts + 1,
         locked_at = now(), updated_at = now()
     WHERE target.id = (
       SELECT candidate.id
       FROM firebase_identity_deletion_outbox AS candidate
       WHERE (
         (candidate.status IN ('pending', 'retry') AND candidate.next_attempt_at <= now())
         OR (candidate.status = 'processing' AND candidate.locked_at < now() - interval '15 minutes')
         OR (candidate.status = 'retry'
             AND candidate.apple_revocation_status = 'blocked'
             AND candidate.apple_revocation_last_error_code = 'apple_revocation_provider_unavailable'
             AND candidate.next_attempt_at <= now())
       )
       AND ($1::uuid[] IS NULL OR candidate.id = ANY($1::uuid[]))
       ORDER BY candidate.next_attempt_at NULLS LAST, candidate.created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING target.id, target.firebase_user_id, target.provider, target.attempts,
       target.firebase_deleted_at, target.apple_revocation_status,
       target.apple_revocation_material_kind, target.apple_revocation_material_ciphertext,
       target.apple_revocation_attempts, target.apple_revocation_last_error_code`,
    [idFilterProvided ? boundedIds : null],
  );
  return result.rows[0] ?? null;
}

async function processAppleRevocation(client, row, { appleRevocationProvider, appleRevocationKey } = {}) {
  if (row.provider !== 'apple' || row.apple_revocation_status === undefined) return 'not_required';
  const current = row.apple_revocation_status;
  if (appleCompletedStatuses.has(current)) return current;
  if (current === 'blocked' && row.apple_revocation_last_error_code !== 'apple_revocation_provider_unavailable') {
    return current;
  }
  if (!row.apple_revocation_material_ciphertext
      || row.apple_revocation_material_kind !== 'refresh_token') {
    await client.query(
      `UPDATE firebase_identity_deletion_outbox
          SET apple_revocation_status = 'needs_material', apple_revocation_locked_at = NULL,
              next_attempt_at = NULL, updated_at = now()
        WHERE id = $1`,
      [row.id],
    );
    return 'needs_material';
  }
  if (!appleRevocationProvider || !Buffer.isBuffer(appleRevocationKey)) {
    await client.query(
      `UPDATE firebase_identity_deletion_outbox
          SET apple_revocation_status = 'blocked', apple_revocation_locked_at = NULL,
              next_attempt_at = NULL,
              apple_revocation_last_error_code = 'apple_revocation_provider_unavailable',
              updated_at = now()
        WHERE id = $1`,
      [row.id],
    );
    return 'blocked';
  }
  const claimed = await client.query(
    `UPDATE firebase_identity_deletion_outbox
        SET apple_revocation_status = 'processing',
            apple_revocation_attempts = apple_revocation_attempts + 1,
            apple_revocation_locked_at = now(), updated_at = now()
      WHERE id = $1 AND (
        apple_revocation_status IN ('pending', 'retry')
        OR (apple_revocation_status = 'blocked'
            AND apple_revocation_last_error_code = 'apple_revocation_provider_unavailable')
      )
      RETURNING apple_revocation_attempts`,
    [row.id],
  );
  if (!claimed.rowCount) return current;
  let material;
  try {
    material = decryptAppleRevocationMaterial(row.apple_revocation_material_ciphertext, appleRevocationKey);
    await appleRevocationProvider.revoke({
      kind: row.apple_revocation_material_kind,
      value: material,
      operationKey: `sit_apple_revoke_${row.id}`,
    });
    const completed = await client.query(
      `UPDATE firebase_identity_deletion_outbox
          SET apple_revocation_status = 'succeeded',
              apple_revocation_material_kind = NULL,
              apple_revocation_material_ciphertext = NULL,
              apple_revocation_locked_at = NULL,
              apple_revocation_last_error_code = NULL,
              next_attempt_at = now(), updated_at = now()
        WHERE id = $1 AND apple_revocation_status = 'processing'`,
      [row.id],
    );
    if (completed.rowCount !== 1) {
      throw new AppleRevocationError('apple_revocation_claim_lost', { retryable: true });
    }
    return 'succeeded';
  } catch (error) {
    const code = error instanceof AppleRevocationError ? error.code : appleErrorCode(error);
    const retryable = error instanceof AppleRevocationError ? error.retryable : true;
    if (!retryable) {
      await client.query(
        `UPDATE firebase_identity_deletion_outbox
            SET apple_revocation_status = 'blocked', apple_revocation_locked_at = NULL,
                next_attempt_at = NULL, apple_revocation_last_error_code = $2,
                updated_at = now()
          WHERE id = $1`,
        [row.id, code],
      );
      return 'blocked';
    }
    const retryMinutes = Math.min(24 * 60, 2 ** Math.min(Number(row.apple_revocation_attempts ?? 1), 10));
    await client.query(
      `UPDATE firebase_identity_deletion_outbox
          SET apple_revocation_status = 'retry', apple_revocation_locked_at = NULL,
              next_attempt_at = now() + ($2::int * interval '1 minute'),
              apple_revocation_last_error_code = $3, updated_at = now()
        WHERE id = $1`,
      [row.id, retryMinutes, code],
    );
    return 'retry';
  } finally {
    material = null;
  }
}

async function finishFirebaseDeletion(client, row, appleStatus) {
  if (!row.firebase_deleted_at) {
    await client.query(
      `UPDATE firebase_identity_deletion_outbox SET firebase_deleted_at = now(), updated_at = now() WHERE id = $1`,
      [row.id],
    );
  }
  if (row.provider !== 'apple' || appleCompletedStatuses.has(appleStatus)) {
    await client.query('DELETE FROM firebase_identity_deletion_outbox WHERE id = $1', [row.id]);
    return true;
  }
  await client.query(
    `UPDATE firebase_identity_deletion_outbox
            SET status = 'retry', locked_at = NULL,
            next_attempt_at = CASE WHEN apple_revocation_status = 'retry'
              THEN now() + interval '4 minutes'
              WHEN apple_revocation_status = 'blocked'
                AND apple_revocation_last_error_code = 'apple_revocation_provider_unavailable'
              THEN now() + interval '24 hours'
              ELSE NULL END,
            updated_at = now()
      WHERE id = $1`,
    [row.id],
  );
  return false;
}

export async function drainFirebaseIdentityDeletionOutbox({
  client,
  authClientFactory = defaultAuthClientFactory,
  appleRevocationProvider = null,
  appleRevocationKey = null,
  ids = null,
  limit = 20,
} = {}) {
  if (!client || typeof client.query !== 'function') throw new Error('Firebase identity cleanup requires a database client.');
  if (typeof authClientFactory !== 'function') throw new Error('Firebase identity cleanup requires an auth client factory.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Firebase identity cleanup limit must be between 1 and 100.');
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
    const appleStatus = await processAppleRevocation(client, row, { appleRevocationProvider, appleRevocationKey });
    if (!row.firebase_deleted_at) {
      try {
        const auth = await authClientFactory();
        await auth.deleteUser(firebaseUserId);
        deleted += 1;
      } catch (error) {
        const code = providerErrorCode(error);
        if (!userNotFoundCodes.has(code)) {
          const retryMinutes = Math.min(24 * 60, 2 ** Math.min(Number(row.attempts ?? 1), 10));
          await client.query(
            `UPDATE firebase_identity_deletion_outbox
             SET status = 'retry', next_attempt_at = now() + ($2::int * interval '1 minute'),
                 locked_at = NULL, last_error_code = $3, updated_at = now()
             WHERE id = $1`,
            [row.id, retryMinutes, code],
          );
          retried += 1;
          continue;
        }
        deleted += 1;
      }
    }
    if (!(await finishFirebaseDeletion(client, row, appleStatus))) retried += 1;
  }
  return { deleted, retried };
}

export function startFirebaseIdentityCleanupWorker({
  client,
  intervalMs = firebaseIdentityCleanupIntervalMs,
  authClientFactory = defaultAuthClientFactory,
  appleRevocationProvider = null,
  appleRevocationKey = null,
  onError = (error) => console.error('[privacy] Firebase identity cleanup failed', safeOperationalErrorCode(error, 'cleanup_failed')),
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 24 * 60 * 60 * 1000) throw new Error('Firebase identity cleanup interval must be between one minute and 24 hours.');
  if (!client || typeof client.query !== 'function') throw new Error('Firebase identity cleanup requires a database client.');
  const run = () => {
    void drainFirebaseIdentityDeletionOutbox({ client, authClientFactory, appleRevocationProvider, appleRevocationKey }).catch(onError);
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
