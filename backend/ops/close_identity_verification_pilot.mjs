#!/usr/bin/env node
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    `UPDATE identity_verification_control
        SET pilot_closed = true, closed_at = COALESCE(closed_at, now()), updated_at = now()
      WHERE id = true`,
  );
  let queuedCount = 0;
  while (true) {
    const queued = await client.query(
    `WITH candidates AS (
       SELECT id, provider_session_id
         FROM identity_verification_sessions
        WHERE status <> 'redacted' AND provider_session_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM identity_verification_redaction_outbox AS outbox
             WHERE outbox.identity_session_id = identity_verification_sessions.id
               AND outbox.status <> 'redacted'
          )
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 500
     )
     INSERT INTO identity_verification_redaction_outbox (provider_session_id, identity_session_id)
     SELECT provider_session_id, id FROM candidates
     ON CONFLICT (provider_session_id) DO UPDATE
       SET status = CASE WHEN identity_verification_redaction_outbox.status = 'redacted'
                         THEN identity_verification_redaction_outbox.status ELSE 'pending' END,
           next_attempt_at = now(), locked_at = NULL, last_error_code = NULL,
           updated_at = now()
     RETURNING id`,
    );
    queuedCount += queued.rowCount;
    if (queued.rowCount === 0) break;
  }
  await client.query('COMMIT');
  const summary = await client.query(
    `SELECT
       (SELECT pilot_closed FROM identity_verification_control WHERE id = true) AS pilot_closed,
       (SELECT count(*)::int FROM identity_verification_redaction_outbox
         WHERE status IN ('pending', 'processing', 'retry')) AS pending_redactions,
       (SELECT count(*)::int FROM identity_verification_sessions WHERE status = 'redacted') AS redacted_sessions,
       (SELECT count(*)::int FROM identity_verification_sessions
         WHERE provider_session_id IS NOT NULL) AS raw_session_ids,
       (SELECT count(*)::int FROM identity_verification_redaction_outbox
         WHERE provider_session_id IS NOT NULL) AS raw_outbox_ids,
       (SELECT count(*)::int FROM identity_verification_webhook_events
         WHERE provider_session_id IS NOT NULL) AS raw_event_ids`,
  );
  process.stdout.write(JSON.stringify({
    pilotClosed: summary.rows[0]?.pilot_closed === true,
    queued: queuedCount,
    pendingRedactions: summary.rows[0]?.pending_redactions ?? 0,
    redactedSessions: summary.rows[0]?.redacted_sessions ?? 0,
    rawSessionIds: summary.rows[0]?.raw_session_ids ?? 0,
    rawOutboxIds: summary.rows[0]?.raw_outbox_ids ?? 0,
    rawEventIds: summary.rows[0]?.raw_event_ids ?? 0,
  }) + '\n');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
