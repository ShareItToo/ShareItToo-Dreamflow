import { hashRefreshToken } from './security.js';

const accountCredentialChangeReasons = new Set([
  'password_reset',
  'password_changed',
]);

export async function enforceActiveSessionLimitBeforeIssue(client, {
  userId,
  maximumActiveSessions,
}) {
  if (typeof userId !== 'string' || !userId
      || !Number.isInteger(maximumActiveSessions)
      || maximumActiveSessions < 1
      || maximumActiveSessions > 1000) {
    throw new Error('invalid_active_session_limit_scope');
  }
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const excess = await client.query(
    `SELECT id
       FROM auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY last_seen_at DESC, created_at DESC, id DESC
      OFFSET $2
      FOR UPDATE`,
    [userId, maximumActiveSessions - 1],
  );
  const sessionIds = excess.rows.map((row) => row.id);
  if (sessionIds.length === 0) {
    return Object.freeze({
      revokedSessionCount: 0,
      revokedRefreshTokenCount: 0,
      deletedPushDeviceCount: 0,
    });
  }
  const sessions = await client.query(
    `UPDATE auth_sessions
        SET revoked_at = COALESCE(revoked_at, now()),
            revoked_reason = COALESCE(revoked_reason, 'session_limit')
      WHERE id = ANY($1::uuid[]) AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [sessionIds, userId],
  );
  const refreshTokens = await client.query(
    `UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, now()),
            revoked_reason = COALESCE(revoked_reason, 'session_limit')
      WHERE session_id = ANY($1::uuid[]) AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [sessionIds, userId],
  );
  const pushDevices = await client.query(
    `DELETE FROM push_devices
      WHERE session_id = ANY($1::uuid[]) AND user_id = $2
      RETURNING id`,
    [sessionIds, userId],
  );
  return Object.freeze({
    revokedSessionCount: sessions.rowCount,
    revokedRefreshTokenCount: refreshTokens.rowCount,
    deletedPushDeviceCount: pushDevices.rowCount,
  });
}

export async function deletePushDevicesForSession(client, { sessionId, userId = null }) {
  const result = await client.query(
    `DELETE FROM push_devices
     WHERE session_id = $1
       AND ($2::text IS NULL OR user_id = $2::text)
     RETURNING id`,
    [sessionId, userId],
  );
  return result.rowCount;
}

export async function revokeSessionByRefreshToken(client, refreshToken) {
  const found = await client.query(
    `SELECT session_id FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [hashRefreshToken(refreshToken)],
  );
  const row = found.rows[0];
  if (!row) return false;

  await client.query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, 'logout')
     WHERE id = $1`,
    [row.session_id],
  );
  await client.query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, 'logout')
     WHERE session_id = $1`,
    [row.session_id],
  );
  await deletePushDevicesForSession(client, { sessionId: row.session_id });
  return true;
}

export async function revokeAllSessionsForCredentialChange(client, {
  userId,
  reason,
}) {
  if (typeof userId !== 'string' || !userId
      || !accountCredentialChangeReasons.has(reason)) {
    throw new Error('invalid_account_credential_change_scope');
  }
  const sessions = await client.query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, now()),
         revoked_reason = COALESCE(revoked_reason, $2)
     WHERE user_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [userId, reason],
  );
  const refreshTokens = await client.query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, now()),
         revoked_reason = COALESCE(revoked_reason, $2)
     WHERE user_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [userId, reason],
  );
  const pushDevices = await client.query(
    `DELETE FROM push_devices
     WHERE user_id = $1
     RETURNING id`,
    [userId],
  );
  return Object.freeze({
    userId,
    reason,
    revokedSessionCount: sessions.rowCount,
    revokedRefreshTokenCount: refreshTokens.rowCount,
    deletedPushDeviceCount: pushDevices.rowCount,
  });
}
