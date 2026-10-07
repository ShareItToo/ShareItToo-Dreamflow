import { safeOperationalErrorCode } from './observability.js';
import { reconcilePendingIdentityVerificationSessions } from './identity_verification_workflow.js';
import { identityVerificationProviderHash } from './identity_verification_tombstone.js';

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Queue every remaining provider-backed identity session for pilot-end
 * redaction. This is an explicit operator action; the normal worker only
 * drains already queued work and never enables identity verification itself. */
export async function queueAllIdentityVerificationRedactions(client, { limit = 500 } = {}) {
  const boundedLimit = Math.max(1, Math.min(5_000, Number(limit) || 500));
  const result = await client.query(
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
        LIMIT $1
     )
     INSERT INTO identity_verification_redaction_outbox (provider_session_id, identity_session_id)
     SELECT provider_session_id, id FROM candidates
     ON CONFLICT (provider_session_id) DO UPDATE
       SET status = CASE WHEN identity_verification_redaction_outbox.status = 'redacted'
                         THEN identity_verification_redaction_outbox.status ELSE 'pending' END,
           next_attempt_at = now(), locked_at = NULL, last_error_code = NULL,
           updated_at = now()
     RETURNING id`,
    [boundedLimit],
  );
  return { queued: result.rowCount };
}

export async function enqueueIdentityVerificationRedactions(client, { userId }) {
  const result = await client.query(
      `INSERT INTO identity_verification_redaction_outbox (provider_session_id, identity_session_id)
      SELECT provider_session_id, id
       FROM identity_verification_sessions
      WHERE user_id = $1 AND provider_session_id IS NOT NULL AND status <> 'redacted'
     ON CONFLICT (provider_session_id) DO UPDATE
       SET status = CASE WHEN identity_verification_redaction_outbox.status = 'redacted'
                         THEN identity_verification_redaction_outbox.status ELSE 'pending' END,
           attempts = CASE WHEN identity_verification_redaction_outbox.status = 'redacted'
                           THEN identity_verification_redaction_outbox.attempts ELSE 0 END,
           next_attempt_at = now(), locked_at = NULL, last_error_code = NULL, updated_at = now()
      RETURNING id`,
    [userId],
  );
  return result.rows.map((row) => String(row.id));
}

async function claim(client, ids = null) {
  const filter = Array.isArray(ids) && ids.length > 0 ? ids : null;
  const result = await client.query(
    `UPDATE identity_verification_redaction_outbox AS target
        SET status = 'processing', attempts = target.attempts + 1,
            locked_at = now(), updated_at = now()
      WHERE target.id = (
        SELECT candidate.id
          FROM identity_verification_redaction_outbox AS candidate
         WHERE ((candidate.status IN ('pending', 'retry') AND candidate.next_attempt_at <= now())
            OR (candidate.status = 'processing' AND candidate.locked_at < now() - interval '15 minutes')
           ) AND ($1::uuid[] IS NULL OR candidate.id = ANY($1::uuid[]))
         ORDER BY candidate.next_attempt_at, candidate.created_at
         FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING target.id, target.provider_session_id, target.attempts`,
    [filter],
  );
  return result.rows[0] ?? null;
}

export async function drainIdentityVerificationRedactions({ client, provider, ids = null, limit = 20 } = {}) {
  if (Array.isArray(ids) && ids.length === 0) return { redacted: 0, retried: 0 };
  const boundedIds = Array.isArray(ids)
    ? ids.filter((id) => typeof id === 'string' && CANONICAL_UUID.test(id)).slice(0, 50)
    : null;
  if (Array.isArray(ids) && boundedIds.length !== ids.length) {
    throw new Error('identity redaction outbox ids invalid');
  }
  let redacted = 0;
  let retried = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = await claim(client, boundedIds);
    if (!row) break;
    try {
      let providerSessionId = row.provider_session_id;
      if (providerSessionId.startsWith('pending_')) {
        const local = await client.query(
          `SELECT id, user_id, provider_session_id
             FROM identity_verification_sessions
            WHERE provider_session_id = $1`,
          [providerSessionId],
        );
        const localSession = local.rows[0] ?? null;
        const pendingId = providerSessionId.slice('pending_'.length);
        if (!CANONICAL_UUID.test(pendingId)) {
          throw new Error('identity_redaction_pending_session_invalid');
        }
        const localId = localSession?.id ?? pendingId;
        const providerKey = `sit_identity_${String(localId).replace(/[^A-Za-z0-9]/g, '')}`;
        const recovered = await provider.createIdentityVerificationSession({
          idempotencyKey: providerKey,
          providerIdempotencyKey: providerKey,
        });
        if (typeof recovered?.id !== 'string' || recovered.livemode !== false) {
          throw new Error('identity_redaction_provider_response_invalid');
        }
        providerSessionId = recovered.id;
        const tx = typeof client.connect === 'function' ? await client.connect() : client;
        const transactional = tx !== client;
        try {
          if (transactional) await tx.query('BEGIN');
          if (localSession) await tx.query(
              `UPDATE identity_verification_sessions SET provider_session_id = $2
                WHERE id = $1 AND provider_session_id = $3`,
              [localSession.id, providerSessionId, localSession.provider_session_id],
            );
          await tx.query(
            `UPDATE identity_verification_redaction_outbox SET provider_session_id = $2
              WHERE id = $1 AND provider_session_id = $3`,
            [row.id, providerSessionId, row.provider_session_id],
          );
          if (transactional) await tx.query('COMMIT');
        } catch (error) {
          if (transactional) await tx.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          if (transactional) tx.release();
        }
      }
      const current = await provider.retrieveIdentityVerificationSession(providerSessionId);
      let result = current;
      if (current?.redaction?.status !== 'redacted') {
        if (current?.redaction?.status === 'processing') {
          await client.query(
            `UPDATE identity_verification_redaction_outbox
                SET status = 'retry', next_attempt_at = now() + interval '1 hour',
                    locked_at = NULL, updated_at = now()
              WHERE id = $1`, [row.id]);
          retried += 1;
          continue;
        }
        result = await provider.redactIdentityVerificationSession(providerSessionId);
      }
      if (result?.redaction?.status !== 'redacted') {
        await client.query(
          `UPDATE identity_verification_redaction_outbox
              SET status = 'retry', next_attempt_at = now() + interval '1 hour',
                  locked_at = NULL, updated_at = now()
            WHERE id = $1`, [row.id]);
        retried += 1;
        continue;
      }
      const tx = typeof client.connect === 'function' ? await client.connect() : client;
      const transactional = tx !== client;
      try {
        if (transactional) await tx.query('BEGIN');
        const providerSessionHash = identityVerificationProviderHash(providerSessionId);
        await tx.query(
          `INSERT INTO identity_verification_provider_tombstones (provider_session_hash, expires_at)
           VALUES ($1, now() + interval '30 days')
           ON CONFLICT (provider_session_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          [providerSessionHash],
        );
        await tx.query(
        `UPDATE identity_verification_redaction_outbox
            SET status = 'redacted', provider_session_id = NULL, provider_session_hash = $2,
                locked_at = NULL, last_error_code = NULL, updated_at = now()
          WHERE id = $1`,
          [row.id, providerSessionHash],
        );
        await tx.query(
        `UPDATE identity_verification_sessions
            SET status = 'redacted', provider_session_id = NULL, provider_session_hash = $2
          WHERE provider_session_id = $1`, [providerSessionId, providerSessionHash],
        );
        await tx.query(
        `UPDATE identity_verification_webhook_events
            SET provider_session_id = NULL, provider_session_hash = $2
          WHERE provider_session_id = $1`, [providerSessionId, providerSessionHash],
        );
        if (transactional) await tx.query('COMMIT');
      } catch (error) {
        if (transactional) await tx.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        if (transactional) tx.release();
      }
      redacted += 1;
    } catch (error) {
      const code = safeOperationalErrorCode(error, 'identity_redaction_failed');
      const delayMinutes = Math.min(1440, 2 ** Math.min(Number(row.attempts ?? 1), 10));
      await client.query(
        `UPDATE identity_verification_redaction_outbox
            SET status = 'retry', next_attempt_at = now() + ($2::int * interval '1 minute'),
                locked_at = NULL, last_error_code = $3, updated_at = now()
          WHERE id = $1`,
        [row.id, delayMinutes, code],
      );
      retried += 1;
    }
  }
  return { redacted, retried };
}

export async function pruneIdentityVerificationTombstones(client, { limit = 100 } = {}) {
  const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = await client.query(
    `WITH candidates AS (
       SELECT provider_session_hash
         FROM identity_verification_provider_tombstones
        WHERE expires_at <= now()
        ORDER BY expires_at, provider_session_hash
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     DELETE FROM identity_verification_provider_tombstones AS tombstone
      USING candidates
      WHERE tombstone.provider_session_hash = candidates.provider_session_hash
      RETURNING tombstone.provider_session_hash`,
    [boundedLimit],
  );
  return result.rowCount;
}

export async function expireIdentityVerificationInputs(client, { limit = 50 } = {}) {
  const result = await client.query(
    `WITH candidates AS (
       SELECT id
         FROM identity_verification_sessions
        WHERE status = 'requires_input'
          AND created_at <= now() - interval '24 hours'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), expired AS (
       UPDATE identity_verification_sessions AS session
          SET status = 'canceled'
         FROM candidates
        WHERE session.id = candidates.id
        RETURNING session.id, session.provider_session_id
     )
     INSERT INTO identity_verification_redaction_outbox (provider_session_id, identity_session_id)
     SELECT provider_session_id, id FROM expired
     WHERE provider_session_id IS NOT NULL
     ON CONFLICT (provider_session_id) DO NOTHING
     RETURNING id`,
    [Math.max(1, Math.min(200, Number(limit) || 50))],
  );
  return result.rowCount;
}

export async function pruneIdentityVerificationRecords(client, { limit = 100 } = {}) {
  const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const prune = async (db) => {
    await db.query("SELECT set_config('sit.identity_audit_retention', '1', true)");
    const outbox = await db.query(
    `WITH candidates AS (
       SELECT id
         FROM identity_verification_redaction_outbox
        WHERE status = 'redacted' AND created_at <= now() - interval '30 days'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     DELETE FROM identity_verification_redaction_outbox AS outbox
      USING candidates
      WHERE outbox.id = candidates.id`,
      [boundedLimit],
    );
    const events = await db.query(
      `WITH candidates AS (
         SELECT event.provider_event_id
           FROM identity_verification_webhook_events AS event
          WHERE COALESCE(event.event_created_at, event.received_at) <= now() - interval '30 days'
            AND (
              event.identity_session_id IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM identity_verification_sessions AS session
                 WHERE session.id = event.identity_session_id
              )
              OR EXISTS (
                SELECT 1 FROM identity_verification_sessions AS session
                 WHERE session.id = event.identity_session_id
                   AND session.status = 'redacted'
                   AND session.created_at <= now() - interval '30 days'
              )
            )
          ORDER BY COALESCE(event.event_created_at, event.received_at), event.provider_event_id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       DELETE FROM identity_verification_webhook_events AS event
        USING candidates
        WHERE event.provider_event_id = candidates.provider_event_id`,
      [boundedLimit],
    );
    const audit = await db.query(
      `WITH candidates AS (
         SELECT audit.id
           FROM audit_log AS audit
           JOIN identity_verification_sessions AS session
             ON session.id = audit.resource_id
          WHERE audit.resource_type = 'identity_verification_session'
            AND session.status = 'redacted'
            AND session.created_at <= now() - interval '30 days'
            AND audit.created_at <= now() - interval '30 days'
          ORDER BY audit.created_at, audit.id
          FOR UPDATE OF audit SKIP LOCKED
          LIMIT $1
       )
       DELETE FROM audit_log AS audit
        USING candidates
        WHERE audit.id = candidates.id`,
      [boundedLimit],
    );
    const sessions = await db.query(
    `WITH candidates AS (
       SELECT id
         FROM identity_verification_sessions
        WHERE status = 'redacted' AND created_at <= now() - interval '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM identity_verification_webhook_events AS event
             WHERE event.identity_session_id = identity_verification_sessions.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM identity_verification_redaction_outbox AS outbox
             WHERE outbox.identity_session_id = identity_verification_sessions.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM audit_log AS audit
             WHERE audit.resource_type = 'identity_verification_session'
               AND audit.resource_id = identity_verification_sessions.id
          )
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     DELETE FROM identity_verification_sessions AS session
      USING candidates
      WHERE session.id = candidates.id`,
      [boundedLimit],
    );
    return { outbox: outbox.rowCount, sessions: sessions.rowCount, events: events.rowCount, audit: audit.rowCount };
  };
  // Pool clients expose a release method and are already checked out inside
  // the caller's transaction; never call connect() on those clients.
  if (typeof client.connect !== 'function' || typeof client.release === 'function') {
    return prune(client);
  }
  const tx = await client.connect();
  try {
    await tx.query('BEGIN');
    const result = await prune(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}

export function startIdentityVerificationRedactionWorker({
  client,
  provider,
  intervalMs = 5 * 60 * 1000,
  onError = (error) => console.error(
    '[identity-verification] redaction cleanup failed',
    safeOperationalErrorCode(error, 'identity_redaction_cleanup_failed'),
  ),
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 24 * 60 * 60 * 1000) {
    throw new Error('Identity redaction cleanup interval must be between one minute and 24 hours.');
  }
  const run = () => void Promise.resolve()
    .then(() => expireIdentityVerificationInputs(client))
    .then(() => pruneIdentityVerificationTombstones(client))
    .then(() => pruneIdentityVerificationRecords(client))
    .then(() => drainIdentityVerificationRedactions({ client, provider }))
    .catch(onError);
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export function startIdentityVerificationReconciliationWorker({
  client,
  provider,
  intervalMs = 60_000,
  audit,
  onError = (error) => console.error(
    '[identity-verification] pending-session reconciliation failed',
    safeOperationalErrorCode(error, 'identity_reconciliation_failed'),
  ),
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 30_000 || intervalMs > 24 * 60 * 60 * 1000) {
    throw new Error('Identity reconciliation interval must be between 30 seconds and 24 hours.');
  }
  const run = () => void reconcilePendingIdentityVerificationSessions({
    client,
    provider,
    limit: 20,
    audit,
  }).catch(onError);
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
