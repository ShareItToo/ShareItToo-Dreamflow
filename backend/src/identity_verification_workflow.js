import crypto from 'node:crypto';

import { PaymentDomainError, requestHash } from './payment_domain.js';
import { identityVerificationProviderHash } from './identity_verification_tombstone.js';

const STATUSES = new Set(['requires_input', 'processing', 'verified', 'canceled', 'redacted']);
const WEBHOOK_TYPES = new Set([
  'identity.verification_session.created',
  'identity.verification_session.processing',
  'identity.verification_session.verified',
  'identity.verification_session.requires_input',
  'identity.verification_session.canceled',
  'identity.verification_session.redacted',
]);
const TRANSITIONS = Object.freeze({
  not_started: new Set(['requires_input']),
  requires_input: new Set(['requires_input', 'processing', 'verified', 'canceled', 'redacted']),
  processing: new Set(['processing', 'verified', 'canceled', 'redacted']),
  verified: new Set(['verified', 'redacted']),
  canceled: new Set(['canceled', 'redacted']),
  redacted: new Set(['redacted']),
});
export const IDENTITY_CONSENT_VERSION = 'sit-identity-test-consent-v1';

export class IdentityVerificationError extends PaymentDomainError {}

function safeStatus(value) {
  return STATUSES.has(value) ? value : null;
}

function safeProviderErrorCode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : null;
}

function requireKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,239}$/.test(value)) {
    throw new IdentityVerificationError(400, 'identity_verification_idempotency_key_invalid');
  }
  return value;
}

function publicSession(row, extras = {}) {
  if (!row?.id || !STATUSES.has(row.status) || row.livemode !== false) {
    throw new IdentityVerificationError(502, 'identity_verification_local_state_invalid');
  }
  return {
    sessionId: row?.id ?? row?.provider_session_id,
    status: row.status,
    livemode: false,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    redactionStatus: row?.redaction_status ?? extras.redactionStatus ?? null,
    ...extras,
  };
}

function providerPublicResult(result, { requireEntrypoint = true } = {}) {
  const sessionId = typeof result?.id === 'string' ? result.id : '';
  const status = safeStatus(result?.status);
  if (!sessionId || !status || result?.livemode !== false) {
    throw new IdentityVerificationError(502, 'identity_verification_provider_response_invalid');
  }
  let url = null;
  if (typeof result.url === 'string') {
    try {
      const parsed = new URL(result.url);
      if (parsed.protocol === 'https:' && parsed.hostname === 'verify.stripe.com'
          && (!parsed.port || parsed.port === '443')
          && !parsed.username && !parsed.password) {
        url = parsed.toString();
      }
    } catch {
      url = null;
    }
  }
  if (requireEntrypoint && !url) {
    throw new IdentityVerificationError(502, 'identity_verification_provider_entrypoint_missing');
  }
  return { providerSessionId: sessionId, status, url, livemode: false };
}

function publicEntrypoint(entry) {
  return entry?.status === 'requires_input' && entry.url ? { url: entry.url } : {};
}

async function queueTerminalRedaction(db, providerSessionId, identitySessionId = null) {
  await db.query(
    `INSERT INTO identity_verification_redaction_outbox (provider_session_id, identity_session_id)
     VALUES ($1, COALESCE($2, (SELECT id FROM identity_verification_sessions WHERE provider_session_id = $1 LIMIT 1)))
     ON CONFLICT (provider_session_id) DO NOTHING`,
    [providerSessionId, identitySessionId],
  );
}

async function finalizeCreatedSession(client, {
  rowId,
  expectedPendingProviderId,
  providerSessionId,
  status,
  audit,
  auditEntry,
}) {
  const update = (db) => db.query(
    `UPDATE identity_verification_sessions
        SET provider_session_id = $2, status = $3
      WHERE id = $1 AND provider_session_id = $4
      RETURNING id, provider_session_id, status, livemode, updated_at`,
    [rowId, providerSessionId, status, expectedPendingProviderId],
  );
  if (typeof client.connect !== 'function' || typeof client.release === 'function') {
    const result = await update(client);
    if (audit && result.rowCount === 1) await audit(auditEntry);
    if (result.rowCount === 1 && (status === 'verified' || status === 'canceled')) {
      await queueTerminalRedaction(client, providerSessionId, rowId);
    }
    return result;
  }
  const tx = await client.connect();
  try {
    await tx.query('BEGIN');
    const result = await update(tx);
    if (audit && result.rowCount === 1) await audit({ ...auditEntry, client: tx });
    if (result.rowCount === 1 && (status === 'verified' || status === 'canceled')) {
      await queueTerminalRedaction(tx, providerSessionId, rowId);
    }
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}

function assertActor(actor) {
  if (!actor?.id || actor.accountStatus !== 'active' || actor.deactivatedAt) {
    throw new IdentityVerificationError(401, 'account_not_active');
  }
}

export async function getIdentityVerificationStatus(client, { actor }) {
  assertActor(actor);
  const result = await client.query(
    `SELECT id, provider_session_id, status, livemode, updated_at,
            CASE WHEN status = 'redacted' THEN 'redacted'
                 ELSE (SELECT outbox.status FROM identity_verification_redaction_outbox AS outbox
                        WHERE outbox.identity_session_id = identity_verification_sessions.id
                        ORDER BY outbox.updated_at DESC LIMIT 1) END AS redaction_status
       FROM identity_verification_sessions
      WHERE user_id = $1
      ORDER BY CASE WHEN status IN ('requires_input', 'processing') THEN 0 ELSE 1 END,
               created_at DESC, id DESC
      LIMIT 1`,
    [actor.id],
  );
  return result.rowCount ? publicSession(result.rows[0]) : {
    sessionId: null,
    status: 'not_started',
    livemode: false,
    updatedAt: null,
  };
}

export async function startIdentityVerification({
  client,
  actor,
  provider,
  idempotencyKey,
  requestId = null,
  audit,
  consentVersion,
}) {
  assertActor(actor);
  if (!provider?.enabled) throw new IdentityVerificationError(503, 'identity_verification_disabled');
  if (provider.livemode) throw new IdentityVerificationError(503, 'identity_verification_live_mode_forbidden');
  if (consentVersion !== IDENTITY_CONSENT_VERSION) {
    throw new IdentityVerificationError(400, 'identity_verification_consent_required');
  }
  const key = requireKey(idempotencyKey);
  const pilotGate = await client.query(
    `SELECT pilot_closed FROM identity_verification_control WHERE id = true FOR UPDATE`,
  );
  if (pilotGate.rows[0]?.pilot_closed === true) {
    throw new IdentityVerificationError(409, 'identity_verification_pilot_closed');
  }
  const deletion = await client.query(
    `SELECT 1
       FROM identity_verification_sessions AS session
       LEFT JOIN identity_verification_redaction_outbox AS outbox
         ON outbox.identity_session_id = session.id
      WHERE session.user_id = $1
        AND session.status <> 'redacted'
        AND (
          session.consent_revoked_at IS NOT NULL
          OR outbox.status IN ('pending', 'processing', 'retry')
        )
      LIMIT 1`,
    [actor.id],
  );
  if (deletion.rowCount) {
    throw new IdentityVerificationError(409, 'identity_verification_deletion_in_progress');
  }
  const hash = requestHash({ version: 'identity-verification-v2', userId: actor.id, key, consentVersion });
  let existing = await client.query(
    `SELECT id, user_id, provider_session_id, status, livemode, idempotency_key, request_hash, consent_revoked_at, updated_at
       FROM identity_verification_sessions WHERE idempotency_key = $1`,
    [key],
  );
  if (!existing.rowCount) {
    const active = await client.query(
      `SELECT id, user_id, provider_session_id, status, livemode, idempotency_key, request_hash, consent_revoked_at, updated_at
        FROM identity_verification_sessions
        WHERE user_id = $1 AND status IN ('requires_input', 'processing')
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [actor.id],
    );
    if (active.rowCount) existing = active;
  }
  let row = existing.rows[0];
  if (row && row.user_id !== actor.id) throw new IdentityVerificationError(409, 'identity_verification_idempotency_conflict');
  if (row?.consent_revoked_at) throw new IdentityVerificationError(409, 'identity_verification_deletion_in_progress');
  if (row && row.idempotency_key === key && row.request_hash !== hash) {
    throw new IdentityVerificationError(409, 'identity_verification_idempotency_conflict');
  }
  if (row && !row.provider_session_id) {
    throw new IdentityVerificationError(409, 'identity_verification_session_redacted');
  }
  if (!row) {
    const id = crypto.randomUUID();
    const pendingProviderId = `pending_${id}`;
    try {
      const inserted = await client.query(
    `WITH gate AS (
       SELECT pilot_closed
         FROM identity_verification_control
        WHERE id = true
        FOR UPDATE
     )
     INSERT INTO identity_verification_sessions
       (id, user_id, provider, provider_session_id, status, livemode, idempotency_key, request_hash, consent_version, consented_at)
     SELECT $1, $2, 'stripe_identity', $3, 'requires_input', false, $4, $5, $6, now()
       FROM gate
      WHERE gate.pilot_closed = false
     RETURNING id, provider_session_id, status, livemode, updated_at`,
        [id, actor.id, pendingProviderId, key, hash, consentVersion],
      );
      if (!inserted.rowCount) {
        throw new IdentityVerificationError(409, 'identity_verification_pilot_closed');
      }
      row = inserted.rows[0];
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const raced = await client.query(
        `SELECT id, user_id, provider_session_id, status, livemode, idempotency_key, request_hash, consent_revoked_at, updated_at
           FROM identity_verification_sessions WHERE user_id = $1 AND status IN ('requires_input', 'processing')
           ORDER BY created_at DESC, id DESC LIMIT 1`,
        [actor.id],
      );
      row = raced.rows[0];
      if (!row) throw error;
      if (row.consent_revoked_at) throw new IdentityVerificationError(409, 'identity_verification_deletion_in_progress');
    }
  }
  const localSessionId = row.id;
  let entry;
  if (row.provider_session_id.startsWith('pending_')) {
    const providerKey = `sit_identity_${row.id.replace(/[^A-Za-z0-9]/g, '')}`;
    entry = providerPublicResult(await provider.createIdentityVerificationSession({
      idempotencyKey: key,
      providerIdempotencyKey: providerKey,
    }));
    const reconciled = await finalizeCreatedSession(client, {
      rowId: row.id,
      expectedPendingProviderId: row.provider_session_id,
      providerSessionId: entry.providerSessionId,
      status: entry.status,
      audit: audit ? audit : null,
      auditEntry: {
        actor,
        action: 'identity_verification.session_created',
        resourceType: 'identity_verification_session',
        resourceId: row.id,
        requestId,
        metadata: {
          provider: 'stripe_identity',
          status: entry.status,
          consentVersion,
          livemode: false,
        },
      },
    });
    if (reconciled.rowCount === 1) {
      row = reconciled.rows[0];
    } else {
      const current = await client.query(
        `SELECT id, provider_session_id, status, livemode, updated_at
           FROM identity_verification_sessions WHERE id = $1`,
        [localSessionId],
      );
      row = current.rows[0] ?? {
        id: localSessionId,
        provider_session_id: entry.providerSessionId,
      };
    }
  } else {
    const resumed = providerPublicResult(await provider.retrieveIdentityVerificationSession(row.provider_session_id), { requireEntrypoint: false });
    const nextStatus = TRANSITIONS[row.status]?.has(resumed.status) ? resumed.status : row.status;
    if (nextStatus !== row.status) {
      const update = (db) => db.query(
        `UPDATE identity_verification_sessions SET status = $2 WHERE id = $1
          AND status = $3
          RETURNING id, provider_session_id, status, livemode, updated_at`,
        [row.id, nextStatus, row.status],
      );
      let updated;
      const auditEntry = {
        actor,
        action: 'identity_verification.status_resumed',
        resourceType: 'identity_verification_session',
        resourceId: row.id,
        requestId,
        metadata: { provider: 'stripe_identity', status: nextStatus, livemode: false },
      };
      if (typeof client.connect !== 'function' || typeof client.release === 'function') {
        updated = await update(client);
        if (audit && updated.rowCount === 1) await audit(auditEntry);
        if (updated.rowCount === 1 && (nextStatus === 'verified' || nextStatus === 'canceled')) {
          await queueTerminalRedaction(client, resumed.providerSessionId, row.id);
        }
      } else {
        const tx = await client.connect();
        try {
          await tx.query('BEGIN');
          updated = await update(tx);
          if (audit && updated.rowCount === 1) await audit({ ...auditEntry, client: tx });
          if (updated.rowCount === 1 && (nextStatus === 'verified' || nextStatus === 'canceled')) {
            await queueTerminalRedaction(tx, resumed.providerSessionId, row.id);
          }
          await tx.query('COMMIT');
        } catch (error) {
          await tx.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          tx.release();
        }
      }
      if (updated.rowCount) row = updated.rows[0];
      else {
        const current = await client.query(
          `SELECT id, provider_session_id, status, livemode, updated_at
             FROM identity_verification_sessions WHERE id = $1`,
          [row.id],
        );
        row = current.rows[0];
      }
    }
    entry = resumed;
  }
  const postCreate = await client.query(
    `SELECT session.id, session.provider_session_id, session.status,
            session.livemode, session.updated_at, session.consent_revoked_at,
            control.pilot_closed,
            CASE WHEN session.status = 'redacted' THEN 'redacted'
                 ELSE (SELECT latest.status FROM identity_verification_redaction_outbox AS latest
                         WHERE latest.identity_session_id = session.id
                         ORDER BY latest.updated_at DESC LIMIT 1)
            END AS redaction_status,
            EXISTS (
              SELECT 1 FROM identity_verification_redaction_outbox AS pending
               WHERE pending.identity_session_id = session.id
                 AND pending.status IN ('pending', 'processing', 'retry')
            ) AS redaction_pending
       FROM identity_verification_sessions AS session
       CROSS JOIN identity_verification_control AS control
      WHERE session.id = $1`,
    [localSessionId],
  );
  const postCreateRow = postCreate.rows[0];
  if (!postCreateRow) {
    if (entry?.providerSessionId) {
      await queueTerminalRedaction(client, entry.providerSessionId, localSessionId);
    }
    throw new IdentityVerificationError(502, 'identity_verification_local_state_invalid');
  }
  if (postCreateRow &&
      (postCreateRow.consent_revoked_at || postCreateRow.redaction_pending || postCreateRow.pilot_closed)) {
    if (postCreateRow.provider_session_id) {
      await queueTerminalRedaction(client, postCreateRow.provider_session_id, row.id);
    }
    if (postCreateRow.pilot_closed) {
      throw new IdentityVerificationError(409, 'identity_verification_pilot_closed');
    }
    throw new IdentityVerificationError(409, 'identity_verification_deletion_in_progress');
  }
  const fresh = publicSession(postCreateRow, {
    ...(postCreateRow.provider_session_id === entry.providerSessionId
      ? publicEntrypoint(entry)
      : {}),
  });
  return { ...fresh, replayed: Boolean(existing.rowCount), resumed: Boolean(existing.rowCount) };
}

export async function refreshIdentityVerification({ client, actor, provider, requestId = null, audit }) {
  assertActor(actor);
  if (!provider?.enabled) throw new IdentityVerificationError(503, 'identity_verification_disabled');
  const local = await client.query(
    `SELECT id, user_id, provider_session_id, status, livemode, updated_at,
            CASE WHEN status = 'redacted' THEN 'redacted'
                 ELSE (SELECT outbox.status FROM identity_verification_redaction_outbox AS outbox
                        WHERE outbox.identity_session_id = identity_verification_sessions.id
                        ORDER BY outbox.updated_at DESC LIMIT 1) END AS redaction_status
       FROM identity_verification_sessions
      WHERE user_id = $1
      ORDER BY CASE WHEN status IN ('requires_input', 'processing') THEN 0 ELSE 1 END,
               created_at DESC, id DESC
      LIMIT 1`,
    [actor.id],
  );
  if (!local.rowCount) return getIdentityVerificationStatus(client, { actor });
  const row = local.rows[0];
  if (!row.provider_session_id || row.status === 'redacted') return publicSession(row);
  const remote = providerPublicResult(await provider.retrieveIdentityVerificationSession(row.provider_session_id), { requireEntrypoint: false });
  const nextStatus = TRANSITIONS[row.status]?.has(remote.status) ? remote.status : row.status;
  if (nextStatus === row.status) return publicSession(row);
  const update = (db) => db.query(
    `UPDATE identity_verification_sessions SET status = $2 WHERE id = $1
      AND status = $3
      RETURNING id, provider_session_id, status, livemode, updated_at`,
    [row.id, nextStatus, row.status],
  );
  let updated;
  if (typeof client.connect !== 'function' || typeof client.release === 'function') {
    updated = await update(client);
    if (audit && updated.rowCount === 1) await audit({
      actor,
      action: 'identity_verification.status_refreshed',
      resourceType: 'identity_verification_session',
      resourceId: row.id,
      requestId,
      metadata: { provider: 'stripe_identity', status: updated.rows[0].status, livemode: false },
    });
    if (updated.rowCount === 1 && (nextStatus === 'verified' || nextStatus === 'canceled')) {
      await queueTerminalRedaction(client, row.provider_session_id, row.id);
    }
  } else {
    const tx = await client.connect();
    try {
      await tx.query('BEGIN');
      updated = await update(tx);
      if (audit && updated.rowCount === 1) await audit({
        actor,
        action: 'identity_verification.status_refreshed',
        resourceType: 'identity_verification_session',
        resourceId: row.id,
        requestId,
        metadata: { provider: 'stripe_identity', status: updated.rows[0].status, livemode: false },
        client: tx,
      });
      if (updated.rowCount === 1 && (nextStatus === 'verified' || nextStatus === 'canceled')) {
        await queueTerminalRedaction(tx, row.provider_session_id, row.id);
      }
      await tx.query('COMMIT');
    } catch (error) {
      await tx.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      tx.release();
    }
  }
  return getIdentityVerificationStatus(client, { actor });
}

export async function revokeIdentityVerification({ client, actor, requestId = null, audit }) {
  assertActor(actor);
  const revoke = async (db) => {
    const local = await db.query(
      `SELECT id, provider_session_id, status, livemode, consent_revoked_at, updated_at
         FROM identity_verification_sessions
        WHERE user_id = $1
        ORDER BY CASE WHEN status IN ('requires_input', 'processing') THEN 0 ELSE 1 END,
                 created_at DESC, id DESC
        FOR UPDATE`,
      [actor.id],
    );
    if (!local.rowCount) return { sessionId: null, status: 'not_started', livemode: false, updatedAt: null };
    for (const row of local.rows) {
      if (row.provider_session_id && row.status !== 'redacted') {
        await queueTerminalRedaction(db, row.provider_session_id, row.id);
      }
      const updated = await db.query(
        `UPDATE identity_verification_sessions
            SET consent_revoked_at = COALESCE(consent_revoked_at, now())
          WHERE id = $1 AND user_id = $2`,
        [row.id, actor.id],
      );
      if (audit && !row.consent_revoked_at && updated.rowCount) await audit({
        actor,
        action: 'identity_verification.redaction_requested',
        resourceType: 'identity_verification_session',
        resourceId: row.id,
        requestId,
        metadata: { provider: 'stripe_identity', status: row.status, livemode: false },
        client: db,
      });
    }
    const current = await getIdentityVerificationStatus(db, { actor });
    return { ...current, redactionStatus: current.status === 'redacted' ? 'redacted' : 'queued' };
  };
  if (typeof client.connect !== 'function' || typeof client.release === 'function') return revoke(client);
  const tx = await client.connect();
  try {
    await tx.query('BEGIN');
    const result = await revoke(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}

export async function applyIdentityVerificationWebhook({ client, actor = null, event, audit }) {
  if (!event || !WEBHOOK_TYPES.has(event.type)) {
    throw new IdentityVerificationError(400, 'identity_verification_webhook_event_invalid');
  }
  const object = event.data?.object;
  const providerSessionId = typeof object?.id === 'string' ? object.id : '';
  if (!providerSessionId || object?.object !== 'identity.verification_session' || object?.livemode !== false) {
    throw new IdentityVerificationError(400, 'identity_verification_webhook_payload_invalid');
  }
  const eventStatus = ({
    'identity.verification_session.created': 'requires_input',
    'identity.verification_session.processing': 'processing',
    'identity.verification_session.verified': 'verified',
    'identity.verification_session.requires_input': 'requires_input',
    'identity.verification_session.canceled': 'canceled',
    'identity.verification_session.redacted': 'redacted',
  }[event.type]);
  const isRedaction = event.type === 'identity.verification_session.redacted';
  const redactionStatus = object.redaction?.status;
  if (isRedaction && redactionStatus !== 'redacted') {
    throw new IdentityVerificationError(400, 'identity_verification_webhook_redaction_invalid');
  }
  const objectStatus = safeStatus(object.status);
  if (!isRedaction && objectStatus && objectStatus !== eventStatus) {
    throw new IdentityVerificationError(400, 'identity_verification_webhook_status_mismatch');
  }
  const status = isRedaction ? 'redacted' : (objectStatus ?? eventStatus);
  const eventId = typeof event.id === 'string' ? event.id : '';
  if (!eventId || !status || !Number.isFinite(event.created)) throw new IdentityVerificationError(400, 'identity_verification_webhook_payload_invalid');
  const apply = async (db) => {
    const local = await db.query(
      `SELECT id, user_id, provider_session_id, status, last_provider_event_created_at
         FROM identity_verification_sessions WHERE provider_session_id = $1 FOR UPDATE`,
      [providerSessionId],
    );
    if (!local.rowCount) {
      if (isRedaction) {
        const tombstone = await db.query(
          `SELECT provider_session_hash FROM identity_verification_provider_tombstones
            WHERE provider_session_hash = $1 AND expires_at > now()`,
          [identityVerificationProviderHash(providerSessionId)],
        );
        if (tombstone.rowCount) return { replayed: true, tombstoned: true, status: 'redacted' };
      }
      return { replayed: false, pending: true, matched: false, status };
    }
    const previousCreated = local.rows[0].last_provider_event_created_at
      ? new Date(local.rows[0].last_provider_event_created_at).getTime()
      : -Infinity;
    const eventCreated = event.created * 1000;
    if (eventCreated < previousCreated || !TRANSITIONS[local.rows[0].status]?.has(status)) {
      return { replayed: true, stale: true, status: local.rows[0].status };
    }
    const replay = await db.query(
      `INSERT INTO identity_verification_webhook_events
        (provider_event_id, provider_session_id, identity_session_id, event_type, event_created_at)
       VALUES ($1, $2, $5, $3, to_timestamp($4))
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [eventId, providerSessionId, event.type, event.created, local.rows[0].id],
    );
    if (!replay.rowCount) return { replayed: true, status: local.rows[0].status };
    const providerSessionHash = identityVerificationProviderHash(providerSessionId);
    const updated = isRedaction
      ? await db.query(
        `UPDATE identity_verification_sessions
            SET status = 'redacted', provider_session_id = NULL,
                provider_session_hash = $2, last_provider_event_id = $3,
                last_provider_event_created_at = to_timestamp($4)
          WHERE provider_session_id = $1 AND livemode = false
          RETURNING id, user_id, provider_session_id, status, livemode, updated_at`,
        [providerSessionId, providerSessionHash, eventId, event.created],
      )
      : await db.query(
        `UPDATE identity_verification_sessions
            SET status = $2, last_provider_event_id = $3,
                last_provider_event_created_at = to_timestamp($4)
          WHERE provider_session_id = $1 AND livemode = false
          RETURNING id, user_id, provider_session_id, status, livemode, updated_at`,
        [providerSessionId, status, eventId, event.created],
      );
    if (updated.rowCount && audit) await audit({
      actor,
      action: 'identity_verification.webhook_applied',
      resourceType: 'identity_verification_session',
      resourceId: updated.rows[0].id,
      metadata: { provider: 'stripe_identity', eventType: event.type, status, livemode: false },
      client: db,
    });
    if (updated.rowCount && (status === 'verified' || status === 'canceled')) {
      await queueTerminalRedaction(db, providerSessionId, updated.rows[0].id);
    }
    if (updated.rowCount && isRedaction) {
      await db.query(
        `INSERT INTO identity_verification_provider_tombstones (provider_session_hash, expires_at)
         VALUES ($1, now() + interval '30 days')
         ON CONFLICT (provider_session_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [providerSessionHash],
      );
      await db.query(
        `UPDATE identity_verification_redaction_outbox
            SET status = 'redacted', provider_session_id = NULL, provider_session_hash = $2,
                locked_at = NULL, last_error_code = NULL, updated_at = now()
          WHERE provider_session_id = $1`,
        [providerSessionId, providerSessionHash],
      );
      await db.query(
        `UPDATE identity_verification_webhook_events
            SET provider_session_id = NULL, provider_session_hash = $2
          WHERE provider_session_id = $1`,
        [providerSessionId, providerSessionHash],
      );
    }
    return { replayed: false, status, matched: updated.rowCount === 1 };
  };
  if (typeof client.connect !== 'function' || typeof client.release === 'function') return apply(client);
  const tx = await client.connect();
  try {
    await tx.query('BEGIN');
    const result = await apply(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}

/**
 * Reconcile a locally claimed session whose provider response was lost after
 * the external create. The provider key, request shape and owner reference
 * are deterministic, so this is safe to run in a bounded background loop.
 */
export async function reconcilePendingIdentityVerificationSessions({
  client,
  provider,
  limit = 20,
  audit,
} = {}) {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.min(50, Math.max(1, limit)) : 20;
  const pending = await client.query(
    `SELECT id, user_id, provider_session_id
       FROM identity_verification_sessions
      WHERE provider_session_id LIKE 'pending_%'
      ORDER BY updated_at ASC
      LIMIT $1`,
    [boundedLimit],
  );
  let reconciled = 0;
  let failed = 0;
  for (const row of pending.rows) {
    const providerKey = `sit_identity_${String(row.id).replace(/[^A-Za-z0-9]/g, '')}`;
    try {
      const entry = providerPublicResult(await provider.createIdentityVerificationSession({
        idempotencyKey: providerKey,
        providerIdempotencyKey: providerKey,
      }), { requireEntrypoint: false });
      const result = await finalizeCreatedSession(client, {
        rowId: row.id,
        expectedPendingProviderId: row.provider_session_id,
        providerSessionId: entry.providerSessionId,
        status: entry.status,
        audit,
        auditEntry: {
          actor: { id: null, role: 'system' },
          action: 'identity_verification.session_reconciled',
          resourceType: 'identity_verification_session',
          resourceId: row.id,
          metadata: { provider: 'stripe_identity', status: entry.status, livemode: false },
        },
      });
      if (result.rowCount === 1) reconciled += 1;
    } catch {
      failed += 1;
    }
  }
  return { inspected: pending.rowCount, reconciled, failed };
}
