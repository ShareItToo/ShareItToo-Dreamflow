import { safeOperationalErrorCode } from './observability.js';

export const credentialCleanupIntervalMs = 6 * 60 * 60 * 1000;

const cleanupStatement = `
WITH deleted_action_tokens AS (
  DELETE FROM auth_action_tokens
  WHERE expires_at <= now() OR consumed_at IS NOT NULL
  RETURNING 1
),
deleted_refresh_tokens AS (
  DELETE FROM refresh_tokens
  WHERE expires_at <= now()
  RETURNING 1
),
deleted_staff_elevations AS (
  DELETE FROM staff_elevations
  WHERE expires_at <= now() OR revoked_at IS NOT NULL
  RETURNING 1
),
scrubbed_booking_challenges AS (
  UPDATE booking_confirmation_challenges
  SET code_digest = repeat('0', 64),
      revoked_at = CASE
        WHEN consumed_at IS NULL THEN COALESCE(revoked_at, now())
        ELSE revoked_at
      END
  WHERE (expires_at <= now() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
    AND code_digest <> repeat('0', 64)
  RETURNING 1
)
SELECT
  (SELECT count(*)::int FROM deleted_action_tokens) AS deleted_action_tokens,
  (SELECT count(*)::int FROM deleted_refresh_tokens) AS deleted_refresh_tokens,
  (SELECT count(*)::int FROM deleted_staff_elevations) AS deleted_staff_elevations,
  (SELECT count(*)::int FROM scrubbed_booking_challenges) AS scrubbed_booking_challenges`;

export async function purgeExpiredCredentials({ client } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Credential cleanup requires a database client.');
  }
  const result = await client.query(cleanupStatement);
  const row = result.rows[0] ?? {};
  return {
    deletedActionTokens: Number(row.deleted_action_tokens ?? 0),
    deletedRefreshTokens: Number(row.deleted_refresh_tokens ?? 0),
    deletedStaffElevations: Number(row.deleted_staff_elevations ?? 0),
    scrubbedBookingChallenges: Number(row.scrubbed_booking_challenges ?? 0),
  };
}

export function startCredentialCleanupWorker({
  client,
  intervalMs = credentialCleanupIntervalMs,
  onError = (error) => console.error(
    '[security] expired credential cleanup failed',
    safeOperationalErrorCode(error, 'credential_cleanup_failed'),
  ),
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 24 * 60 * 60 * 1000) {
    throw new Error('Credential cleanup interval must be between one minute and 24 hours.');
  }
  if (!client || typeof client.query !== 'function') {
    throw new Error('Credential cleanup requires a database client.');
  }
  const run = () => {
    void purgeExpiredCredentials({ client }).catch(onError);
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
