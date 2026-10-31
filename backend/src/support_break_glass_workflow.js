import crypto from 'node:crypto';

import {
  normalizeSupportBreakGlassRequest,
  normalizeSupportBreakGlassReview,
} from './support_break_glass_domain.js';
import { SupportCaseError } from './support_case_domain.js';

const grantLifetimeMs = 5 * 60 * 1000;

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function tokenSecret(value = process.env.JWT_SECRET) {
  if (typeof value !== 'string' || value.length < 32) {
    throw new SupportCaseError(500, 'support_break_glass_token_secret_unavailable');
  }
  return value;
}

function tokenFor(row, secret) {
  const material = [
    'sit-support-break-glass-v1',
    row.id,
    row.case_id,
    row.actor_id,
    row.session_id,
    iso(row.created_at),
  ].join(':');
  return crypto.createHmac('sha256', secret).update(material).digest('base64url');
}

function shapeGrant(row, { includeJustification = false } = {}) {
  const result = {
    id: row.id,
    caseId: row.case_id,
    actorId: row.actor_id,
    reasonCode: row.reason_code,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    lastUsedAt: iso(row.last_used_at),
    revokedAt: iso(row.revoked_at),
    reviewDueAt: iso(row.review_due_at),
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: iso(row.reviewed_at),
    reviewOutcome: row.review_outcome ?? null,
  };
  if (includeJustification) result.justification = row.justification;
  return Object.freeze(result);
}

function replayCreatedGrant(row, {
  caseId,
  normalized,
  tokenSigningSecret,
}) {
  if (row.case_id !== caseId
      || row.reason_code !== normalized.reasonCode
      || row.justification !== normalized.justification) {
    throw new SupportCaseError(409, 'support_break_glass_idempotency_conflict');
  }
  return Object.freeze({
    grant: shapeGrant(row),
    token: tokenFor(row, tokenSecret(tokenSigningSecret)),
    replayed: true,
  });
}

async function writeAudit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_case', $4, $5::jsonb)`,
    [actor.id, actor.role, action, resourceId, JSON.stringify(metadata)],
  );
}

export async function createSupportBreakGlassGrant(client, {
  actor,
  sessionId,
  staffElevationId,
  caseId,
  raw,
  idempotencyKey,
  tokenSigningSecret,
  now = new Date(),
}) {
  if (actor?.role !== 'support' || !actor.id) {
    throw new SupportCaseError(403, 'support_break_glass_support_role_required');
  }
  const normalized = normalizeSupportBreakGlassRequest(raw, idempotencyKey);
  const existing = await client.query(
    `SELECT * FROM support_break_glass_grants
      WHERE actor_id = $1 AND session_id = $2 AND idempotency_key = $3`,
    [actor.id, sessionId, normalized.idempotencyKey],
  );
  if (existing.rowCount) {
    return replayCreatedGrant(existing.rows[0], {
      caseId,
      normalized,
      tokenSigningSecret,
    });
  }

  const supportCase = await client.query(
    `SELECT id, priority, status, current_owner_id, operating_mode
       FROM support_cases
      WHERE id::text = $1
      FOR UPDATE`,
    [caseId],
  );
  const caseRow = supportCase.rows[0];
  if (!caseRow || caseRow.priority !== 'p0'
      || ['resolved', 'closed'].includes(caseRow.status)
      || !['simulation', 'internal_testing'].includes(caseRow.operating_mode)) {
    throw new SupportCaseError(404, 'support_break_glass_unavailable');
  }
  if (caseRow.current_owner_id === actor.id) {
    throw new SupportCaseError(409, 'support_break_glass_not_required');
  }

  const elevation = await client.query(
    `SELECT id, expires_at FROM staff_elevations
      WHERE id = $1 AND user_id = $2 AND session_id = $3 AND role = 'support'
        AND revoked_at IS NULL AND expires_at > $4`,
    [staffElevationId, actor.id, sessionId, now],
  );
  if (!elevation.rowCount) {
    throw new SupportCaseError(401, 'invalid_or_expired_staff_step_up');
  }
  const elevationExpiry = new Date(elevation.rows[0].expires_at);
  const expiresAt = new Date(Math.min(
    now.getTime() + grantLifetimeMs,
    elevationExpiry.getTime(),
  ));
  if (expiresAt <= now) {
    throw new SupportCaseError(401, 'invalid_or_expired_staff_step_up');
  }

  const id = crypto.randomUUID();
  const token = tokenFor({
    id,
    case_id: caseRow.id,
    actor_id: actor.id,
    session_id: sessionId,
    created_at: now,
  }, tokenSecret(tokenSigningSecret));
  const inserted = await client.query(
    `INSERT INTO support_break_glass_grants (
       id, case_id, actor_id, session_id, staff_elevation_id, token_hash,
       reason_code, justification, idempotency_key, created_at, expires_at,
       review_due_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     ON CONFLICT (actor_id, session_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      id,
      caseRow.id,
      actor.id,
      sessionId,
      staffElevationId,
      hashToken(token),
      normalized.reasonCode,
      normalized.justification,
      normalized.idempotencyKey,
      now,
      expiresAt,
    ],
  );
  if (!inserted.rowCount) {
    const winner = await client.query(
      `SELECT * FROM support_break_glass_grants
        WHERE actor_id = $1 AND session_id = $2 AND idempotency_key = $3`,
      [actor.id, sessionId, normalized.idempotencyKey],
    );
    if (!winner.rowCount) {
      throw new SupportCaseError(409, 'support_break_glass_create_conflict');
    }
    return replayCreatedGrant(winner.rows[0], {
      caseId,
      normalized,
      tokenSigningSecret,
    });
  }
  await writeAudit(client, {
    actor,
    action: 'support.break_glass_grant_created',
    resourceId: caseRow.id,
    metadata: {
      grantId: id,
      reasonCode: normalized.reasonCode,
      expiresAt: expiresAt.toISOString(),
      reviewDueAt: expiresAt.toISOString(),
      p0Only: true,
    },
  });
  return Object.freeze({
    grant: shapeGrant(inserted.rows[0]),
    token,
    replayed: false,
  });
}

export async function verifySupportBreakGlassGrant(client, {
  actor,
  sessionId,
  staffElevationId,
  caseId,
  token,
  now = new Date(),
}) {
  if (actor?.role !== 'support' || typeof token !== 'string'
      || token.length < 32 || token.length > 500) return null;
  const result = await client.query(
    `UPDATE support_break_glass_grants AS access_grant
        SET last_used_at = $6
      WHERE access_grant.case_id::text = $1
        AND access_grant.actor_id = $2
        AND access_grant.session_id = $3
        AND access_grant.staff_elevation_id = $4
        AND access_grant.token_hash = $5
        AND access_grant.revoked_at IS NULL
        AND access_grant.expires_at > $6
        AND EXISTS (
          SELECT 1 FROM staff_elevations AS elevation
           WHERE elevation.id = access_grant.staff_elevation_id
             AND elevation.user_id = access_grant.actor_id
             AND elevation.session_id = access_grant.session_id
             AND elevation.role = 'support'
             AND elevation.revoked_at IS NULL
             AND elevation.expires_at > $6
        )
        AND EXISTS (
          SELECT 1 FROM users AS actor_user
           WHERE actor_user.id = access_grant.actor_id
             AND actor_user.role = 'support'
             AND actor_user.account_status = 'active'
             AND actor_user.deactivated_at IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM support_cases AS support_case
           WHERE support_case.id = access_grant.case_id
             AND support_case.priority = 'p0'
             AND support_case.status NOT IN ('resolved', 'closed')
             AND support_case.operating_mode IN ('simulation', 'internal_testing')
        )
      RETURNING access_grant.*`,
    [caseId, actor.id, sessionId, staffElevationId, hashToken(token), now],
  );
  return result.rowCount ? shapeGrant(result.rows[0]) : null;
}

export async function listSupportBreakGlassReviews(client, {
  actor,
  status = 'pending',
  limit = 100,
} = {}) {
  if (actor?.role !== 'admin') {
    throw new SupportCaseError(403, 'support_break_glass_admin_review_required');
  }
  if (!['pending', 'completed', 'escalated'].includes(status)) {
    throw new SupportCaseError(400, 'support_break_glass_review_status_invalid');
  }
  const parsedLimit = Number(limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    throw new SupportCaseError(400, 'support_limit_invalid');
  }
  const result = await client.query(
    `SELECT * FROM support_break_glass_grants
      WHERE review_status = $1
      ORDER BY review_due_at, created_at, id
      LIMIT $2`,
    [status, parsedLimit],
  );
  return result.rows.map((row) => shapeGrant(row, { includeJustification: true }));
}

export async function reviewSupportBreakGlassGrant(client, {
  actor,
  sessionId,
  staffElevationId,
  grantId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  if (actor?.role !== 'admin' || !actor.id) {
    throw new SupportCaseError(403, 'support_break_glass_admin_review_required');
  }
  const normalized = normalizeSupportBreakGlassReview(raw, idempotencyKey);
  const replay = await client.query(
    `SELECT * FROM support_break_glass_grants
      WHERE review_idempotency_key = $1`,
    [normalized.idempotencyKey],
  );
  if (replay.rowCount) {
    const row = replay.rows[0];
    if (row.id !== grantId || row.reviewed_by !== actor.id
        || row.review_outcome !== normalized.outcome
        || row.review_notes !== normalized.notes) {
      throw new SupportCaseError(409, 'support_break_glass_review_idempotency_conflict');
    }
    return Object.freeze({ grant: shapeGrant(row, { includeJustification: true }), replayed: true });
  }

  const selected = await client.query(
    `SELECT * FROM support_break_glass_grants WHERE id::text = $1 FOR UPDATE`,
    [grantId],
  );
  const row = selected.rows[0];
  if (!row) throw new SupportCaseError(404, 'support_break_glass_review_not_found');
  if (row.actor_id === actor.id) {
    throw new SupportCaseError(409, 'support_break_glass_self_review_forbidden');
  }
  if (row.review_status !== 'pending') {
    if (row.review_idempotency_key === normalized.idempotencyKey
        && row.reviewed_by === actor.id
        && row.review_outcome === normalized.outcome
        && row.review_notes === normalized.notes) {
      return Object.freeze({
        grant: shapeGrant(row, { includeJustification: true }),
        replayed: true,
      });
    }
    throw new SupportCaseError(409, 'support_break_glass_review_already_completed');
  }
  if (new Date(row.review_due_at) > now) {
    throw new SupportCaseError(409, 'support_break_glass_review_not_due');
  }
  const reviewStatus = normalized.outcome === 'appropriate' ? 'completed' : 'escalated';
  const updated = await client.query(
    `UPDATE support_break_glass_grants
        SET review_status = $2,
            reviewed_by = $3,
            reviewed_session_id = $4,
            review_staff_elevation_id = $5,
            reviewed_at = $6,
            review_outcome = $7,
            review_notes = $8,
            review_idempotency_key = $9,
            revoked_at = COALESCE(revoked_at, $6)
      WHERE id = $1 AND review_status = 'pending'
      RETURNING *`,
    [
      row.id,
      reviewStatus,
      actor.id,
      sessionId,
      staffElevationId,
      now,
      normalized.outcome,
      normalized.notes,
      normalized.idempotencyKey,
    ],
  );
  if (!updated.rowCount) {
    throw new SupportCaseError(409, 'support_break_glass_review_conflict');
  }
  await writeAudit(client, {
    actor,
    action: 'support.break_glass_grant_reviewed',
    resourceId: row.case_id,
    metadata: {
      grantId: row.id,
      reviewStatus,
      reviewOutcome: normalized.outcome,
      originalActorId: row.actor_id,
    },
  });
  return Object.freeze({
    grant: shapeGrant(updated.rows[0], { includeJustification: true }),
    replayed: false,
  });
}
