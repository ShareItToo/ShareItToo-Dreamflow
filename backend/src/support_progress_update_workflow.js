import crypto from 'node:crypto';

import { shapeSupportCase, SupportCaseError } from './support_case_workflow.js';
import { createSupportMessage, publishSupportMessage, shapeSupportMessage } from './support_message_workflow.js';
import {
  normalizeSupportProgressPublication,
  normalizeSupportProgressUpdate,
  supportProgressUpdateIdempotencyKey,
} from './support_progress_update_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function shapeSupportProgressUpdate(row) {
  return Object.freeze({
    id: row.id,
    caseId: row.case_id,
    messageId: row.message_id,
    version: row.progress_version,
    templateId: row.template_id,
    priorNextUpdateAt: iso(row.prior_next_update_at),
    proposedNextUpdateAt: iso(row.proposed_next_update_at),
    wasOverdue: row.was_overdue === true,
    expectedCaseVersion: Number(row.expected_case_version),
    resultingCaseVersion: row.resulting_case_version == null
      ? null
      : Number(row.resulting_case_version),
    proposalStatus: row.proposal_status,
    reviewedAt: iso(row.reviewed_at),
    publishedAt: iso(row.published_at),
    proposalVersion: Number(row.lock_version),
    createdAt: iso(row.created_at),
    externalMessageSent: false,
  });
}

async function writeAudit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_progress_update', $4, $5::jsonb)`,
    [actor.id, actor.role, action, resourceId, JSON.stringify(metadata)],
  );
}

async function loadMessage(client, messageId) {
  const result = await client.query(
    'SELECT * FROM support_messages WHERE id = $1',
    [messageId],
  );
  if (!result.rowCount) {
    throw new SupportCaseError(409, 'support_progress_update_message_missing');
  }
  return result.rows[0];
}

export async function proposeSupportProgressUpdate(client, {
  actor,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const key = supportProgressUpdateIdempotencyKey(
    idempotencyKey,
    'support.progress.propose',
  );
  const replay = await client.query(
    `SELECT progress.*, support_case.current_owner_id AS case_current_owner_id
       FROM support_case_progress_updates AS progress
       JOIN support_cases AS support_case ON support_case.id = progress.case_id
      WHERE progress.idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    if (String(replay.rows[0].case_id) !== caseId) {
      throw new SupportCaseError(409, 'support_progress_update_idempotency_scope_conflict');
    }
    if (actor?.role === 'support'
        && replay.rows[0].case_current_owner_id !== actor.id) {
      throw new SupportCaseError(403, 'support_case_assignment_required');
    }
    const message = await loadMessage(client, replay.rows[0].message_id);
    return Object.freeze({
      progressUpdate: shapeSupportProgressUpdate(replay.rows[0]),
      message: shapeSupportMessage(message, { staff: true }),
      replayed: true,
    });
  }

  const current = await client.query(
    'SELECT * FROM support_cases WHERE id::text = $1 FOR UPDATE',
    [caseId],
  );
  if (!current.rowCount) throw new SupportCaseError(404, 'support_case_not_found');
  const supportCase = current.rows[0];
  const proposal = normalizeSupportProgressUpdate(supportCase, raw, { actor, now });
  const pending = await client.query(
    `SELECT id FROM support_case_progress_updates
      WHERE case_id = $1 AND proposal_status IN ('pending_review', 'approved')
      FOR UPDATE`,
    [supportCase.id],
  );
  if (pending.rowCount) {
    throw new SupportCaseError(409, 'support_progress_update_already_pending');
  }

  const messageResult = await createSupportMessage(client, {
    actor,
    caseId,
    raw: {
      templateId: proposal.templateId,
      recipientUserId: proposal.recipientUserId,
      variables: proposal.variables,
      publishNow: false,
    },
    idempotencyKey: `${idempotencyKey}:message`,
    now,
    progressUpdateDraft: true,
    nextUpdateAtBinding: proposal.nextUpdateAt,
  });
  const id = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO support_case_progress_updates (
       id, case_id, message_id, progress_version, template_id,
       prior_next_update_at, proposed_next_update_at, was_overdue,
       expected_case_version, next_action, proposal_status, proposed_by,
       idempotency_key, created_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, 'pending_review', $11,
       $12, $13
     ) RETURNING *`,
    [
      id,
      supportCase.id,
      messageResult.message.id,
      proposal.version,
      proposal.templateId,
      proposal.priorNextUpdateAt,
      proposal.nextUpdateAt,
      proposal.wasOverdue,
      proposal.expectedVersion,
      proposal.nextAction,
      actor.id,
      key,
      now,
    ],
  );
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at, template_version
     ) VALUES (
       $1, 'case.progress_update_proposed', $2, $3,
       'support_progress_update', $4, $5::jsonb,
       false, 'internal', $6, 'sit-api', $7, $8
     )`,
    [
      supportCase.id,
      actor.role,
      actor.id,
      id,
      JSON.stringify({
        templateId: proposal.templateId,
        priorNextUpdateAt: proposal.priorNextUpdateAt.toISOString(),
        proposedNextUpdateAt: proposal.nextUpdateAt.toISOString(),
        wasOverdue: proposal.wasOverdue,
        messageId: messageResult.message.id,
        independentReviewRequired: true,
        externalMessageSent: false,
      }),
      `${key}:event`,
      now,
      proposal.version,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.progress_update_proposed',
    resourceId: id,
    metadata: {
      caseId: supportCase.id,
      messageId: messageResult.message.id,
      templateId: proposal.templateId,
      wasOverdue: proposal.wasOverdue,
      expectedCaseVersion: proposal.expectedVersion,
      independentReviewRequired: true,
      externalMessageSent: false,
    },
  });
  return Object.freeze({
    progressUpdate: shapeSupportProgressUpdate(inserted.rows[0]),
    message: messageResult.message,
    replayed: false,
  });
}

export async function publishSupportProgressUpdate(client, {
  actor,
  caseId,
  progressUpdateId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  const key = supportProgressUpdateIdempotencyKey(
    idempotencyKey,
    'support.progress.publish',
  );
  const replay = await client.query(
    `SELECT progress.*,
            row_to_json(support_case) AS support_case_row,
            row_to_json(message) AS message_row
       FROM support_case_progress_updates AS progress
       JOIN support_cases AS support_case ON support_case.id = progress.case_id
       JOIN support_messages AS message ON message.id = progress.message_id
      WHERE progress.publication_idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    const row = replay.rows[0];
    if (String(row.case_id) !== caseId || String(row.id) !== progressUpdateId) {
      throw new SupportCaseError(409, 'support_progress_update_idempotency_scope_conflict');
    }
    if (actor?.role === 'support'
        && row.support_case_row.current_owner_id !== actor.id) {
      throw new SupportCaseError(403, 'support_case_assignment_required');
    }
    return Object.freeze({
      progressUpdate: shapeSupportProgressUpdate(row),
      supportCase: shapeSupportCase(row.support_case_row, { staff: true }),
      message: shapeSupportMessage(row.message_row, { staff: true }),
      replayed: true,
    });
  }

  const locked = await client.query(
    `SELECT progress.*,
            row_to_json(support_case) AS support_case_row,
            row_to_json(message) AS message_row
       FROM support_case_progress_updates AS progress
       JOIN support_cases AS support_case ON support_case.id = progress.case_id
       JOIN support_messages AS message ON message.id = progress.message_id
      WHERE progress.id::text = $1 AND support_case.id::text = $2
      FOR UPDATE OF progress, support_case, message`,
    [progressUpdateId, caseId],
  );
  if (!locked.rowCount) {
    throw new SupportCaseError(404, 'support_progress_update_not_found');
  }
  const progressUpdate = locked.rows[0];
  const supportCase = progressUpdate.support_case_row;
  const message = progressUpdate.message_row;
  const publication = normalizeSupportProgressPublication(
    supportCase,
    progressUpdate,
    message,
    raw,
    { actor, now },
  );

  const updatedCase = await client.query(
    `UPDATE support_cases
        SET next_action = $2,
            next_update_at = $3,
            lock_version = lock_version + 1,
            updated_at = GREATEST($4, updated_at + INTERVAL '1 microsecond')
      WHERE id = $1 AND lock_version = $5
        AND date_trunc('milliseconds', next_update_at)
          = date_trunc('milliseconds', $6::timestamptz)
      RETURNING *`,
    [
      supportCase.id,
      publication.nextAction,
      publication.nextUpdateAt,
      now,
      Number(progressUpdate.expected_case_version),
      progressUpdate.prior_next_update_at,
    ],
  );
  if (!updatedCase.rowCount) {
    throw new SupportCaseError(409, 'support_progress_update_case_changed');
  }

  const messageResult = await publishSupportMessage(client, {
    actor,
    caseId,
    messageId: message.id,
    raw: {
      expectedVersion: publication.expectedMessageVersion,
      expectedPayloadSha256: publication.expectedPayloadSha256,
    },
    idempotencyKey: `${idempotencyKey}:message`,
    now,
    progressUpdatePublication: true,
  });
  const updatedProgress = await client.query(
    `UPDATE support_case_progress_updates
        SET proposal_status = 'published',
            resulting_case_version = $2,
            published_by = $3,
            published_at = $4,
            publication_idempotency_key = $5,
            lock_version = lock_version + 1
      WHERE id = $1 AND lock_version = $6 AND proposal_status = 'approved'
      RETURNING *`,
    [
      progressUpdate.id,
      Number(updatedCase.rows[0].lock_version),
      actor.id,
      now,
      key,
      publication.expectedProgressVersion,
    ],
  );
  if (!updatedProgress.rowCount) {
    throw new SupportCaseError(409, 'support_progress_update_version_conflict');
  }
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at, template_version
     ) VALUES (
       $1, 'case.progress_update_published', $2, $3,
       'support_progress_update', $4, $5::jsonb,
       false, 'internal', $6, 'sit-api', $7, $8
     )`,
    [
      supportCase.id,
      actor.role,
      actor.id,
      progressUpdate.id,
      JSON.stringify({
        templateId: progressUpdate.template_id,
        priorNextUpdateAt: iso(progressUpdate.prior_next_update_at),
        nextUpdateAt: publication.nextUpdateAt.toISOString(),
        wasOverdue: progressUpdate.was_overdue === true,
        messageId: message.id,
        inAppMessageRecorded: true,
        externalMessageSent: false,
      }),
      `${key}:event`,
      now,
      progressUpdate.progress_version,
    ],
  );
  await writeAudit(client, {
    actor,
    action: 'support.progress_update_published',
    resourceId: progressUpdate.id,
    metadata: {
      caseId: supportCase.id,
      messageId: message.id,
      templateId: progressUpdate.template_id,
      wasOverdue: progressUpdate.was_overdue === true,
      resultingCaseVersion: Number(updatedCase.rows[0].lock_version),
      inAppMessageRecorded: true,
      externalMessageSent: false,
    },
  });
  return Object.freeze({
    progressUpdate: shapeSupportProgressUpdate(updatedProgress.rows[0]),
    supportCase: shapeSupportCase(updatedCase.rows[0], { staff: true }),
    message: messageResult.message,
    replayed: false,
  });
}
