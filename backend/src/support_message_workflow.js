import crypto from 'node:crypto';

import { SupportCaseError } from './support_case_domain.js';
import {
  assertSupportAccountRecoveryPublication,
} from './support_account_recovery_domain.js';
import { enqueueSupportCaseUpdateNotification } from './support_notifications.js';
import {
  assertSupportMessageDeadlineCurrent,
  assertSupportMessageNextUpdateBindingCurrent,
  normalizeSupportMessageDraft,
  normalizeSupportMessagePublication,
  normalizeSupportMessageReview,
  supportMessageIdempotencyKey,
} from './support_message_domain.js';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function shapeSupportMessage(row, { staff = false } = {}) {
  const base = {
    id: row.id,
    caseId: row.case_id,
    title: row.message_title,
    content: row.rendered_content,
    sentAt: iso(row.sent_at),
    createdAt: iso(row.created_at),
    correctedMessageId: row.corrects_message_id ?? null,
    externalMessageSent: false,
  };
  if (!staff) return Object.freeze(base);
  return Object.freeze({
    ...base,
    recipientUserId: row.recipient_user_id,
    senderType: row.sender_type,
    senderId: row.sender_id ?? null,
    messageType: row.message_type,
    templateId: row.template_id,
    templateVersion: row.template_version,
    locale: row.locale,
    approvalLevel: row.approval_level,
    approvedBy: row.approved_by ?? null,
    approvedAt: iso(row.approved_at),
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: iso(row.reviewed_at),
    reviewOutcome: row.review_outcome ?? null,
    sendStatus: row.send_status,
    renderedContentSha256: row.rendered_content_sha256,
    approvalPayloadSha256: row.approval_payload_sha256 ?? null,
    version: Number(row.lock_version),
    externalMessageSent: false,
  });
}

async function audit(client, { actor, action, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_log (
       actor_id, actor_role, action, resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, 'support_message', $4, $5::jsonb)`,
    [actor?.id ?? null, actor?.role ?? 'system', action, resourceId, JSON.stringify(metadata)],
  );
}

async function event(client, {
  caseId,
  actor,
  eventType,
  messageId,
  payload,
  visibility,
  idempotencyKey,
  now,
  automationUsed = false,
}) {
  await client.query(
    `INSERT INTO support_case_events (
       case_id, event_type, actor_type, actor_id, entity_type, entity_id,
       structured_payload, automation_used, visibility, idempotency_key,
       source_system, created_at, template_version
     ) VALUES (
       $1, $2, $3, $4, 'support_message', $5,
       $6::jsonb, $7, $8, $9,
       'sit-api', $10, $11
     )`,
    [
      caseId,
      eventType,
      actor.role,
      actor.id,
      messageId,
      JSON.stringify(payload),
      automationUsed,
      visibility,
      idempotencyKey,
      now,
      payload.templateVersion,
    ],
  );
}

function assertActor(actor, allowed, code) {
  if (!actor?.id || !allowed.includes(actor.role)) throw new SupportCaseError(403, code);
}

function assertAssignment(actor, supportCase) {
  if (actor.role === 'support' && supportCase.current_owner_id !== actor.id) {
    throw new SupportCaseError(403, 'support_case_assignment_required');
  }
}

function isHumanReviewableMessage(row) {
  return row.approval_level === 'yellow_human_review'
    || (row.approval_level === 'red_explicit_decision'
      && row.template_id === 'T-053');
}

function assertNonLive(supportCase) {
  if (!['simulation', 'internal_testing'].includes(supportCase.operating_mode)) {
    throw new SupportCaseError(409, 'support_message_live_delivery_forbidden');
  }
}

function recipientBelongsToCase(supportCase, recipientUserId) {
  return supportCase.reporter_user_id === recipientUserId
    || (supportCase.affected_user_ids ?? []).includes(recipientUserId);
}

export async function createSupportMessage(client, {
  actor,
  caseId,
  raw,
  idempotencyKey,
  now = new Date(),
  progressUpdateDraft = false,
  accountRecoveryDraft = false,
  nextUpdateAtBinding = null,
}) {
  assertActor(actor, ['support', 'admin'], 'support_message_create_forbidden');
  const key = supportMessageIdempotencyKey(idempotencyKey, 'support.message.create');
  const replay = await client.query(
    `SELECT message.*, support_case.current_owner_id AS case_current_owner_id
       FROM support_messages AS message
       JOIN support_cases AS support_case ON support_case.id = message.case_id
      WHERE message.idempotency_key = $1`,
    [key],
  );
  if (replay.rowCount) {
    if (String(replay.rows[0].case_id) !== caseId) {
      throw new SupportCaseError(409, 'support_message_idempotency_scope_conflict');
    }
    if (actor.role === 'support' && replay.rows[0].case_current_owner_id !== actor.id) {
      throw new SupportCaseError(403, 'support_case_assignment_required');
    }
    return { message: shapeSupportMessage(replay.rows[0], { staff: true }), replayed: true };
  }
  const locked = await client.query(
    'SELECT * FROM support_cases WHERE id::text = $1 FOR UPDATE',
    [caseId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_case_not_found');
  const supportCase = locked.rows[0];
  assertAssignment(actor, supportCase);
  assertNonLive(supportCase);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_message_invalid');
  }
  const recipientUserId = typeof raw.recipientUserId === 'string'
    ? raw.recipientUserId.trim()
    : '';
  if (!recipientUserId || !recipientBelongsToCase(supportCase, recipientUserId)) {
    throw new SupportCaseError(403, 'support_message_recipient_forbidden');
  }
  if (String(raw.templateId ?? '').trim().toUpperCase() === 'T-053'
      && actor.role !== 'admin') {
    throw new SupportCaseError(403, 'support_consumer_dispute_notice_requires_admin');
  }
  const progressTemplate = ['T-008', 'T-010'].includes(
    String(raw.templateId ?? '').trim().toUpperCase(),
  );
  if (progressTemplate !== (progressUpdateDraft === true)) {
    throw new SupportCaseError(409, 'support_progress_update_workflow_required');
  }
  const accountRecoveryTemplate = String(raw.templateId ?? '').trim().toUpperCase()
    === 'T-035';
  if (accountRecoveryTemplate !== (accountRecoveryDraft === true)) {
    throw new SupportCaseError(409, 'support_account_recovery_workflow_required');
  }
  const activeRecipient = await client.query(
    `SELECT recipient.id,
            recipient.password_hash IS NOT NULL
              AS password_reauthentication_available,
            EXISTS (
              SELECT 1
                FROM auth_sessions AS session
                JOIN refresh_tokens AS token ON token.session_id = session.id
               WHERE session.user_id = recipient.id
                 AND session.revoked_at IS NULL
                 AND token.revoked_at IS NULL
                 AND token.expires_at > $2
            ) AS active_authenticated_session
       FROM users AS recipient
      WHERE recipient.id = $1
        AND recipient.account_status = 'active'
        AND recipient.deactivated_at IS NULL
      FOR KEY SHARE`,
    [recipientUserId, now],
  );
  if (!activeRecipient.rowCount) {
    throw new SupportCaseError(409, 'support_message_recipient_account_closed');
  }
  const draftCase = progressTemplate
    ? { ...supportCase, next_update_at: nextUpdateAtBinding }
    : supportCase;
  const draft = normalizeSupportMessageDraft(raw, {
    supportCase: draftCase,
    now,
    accountRecoveryContext: accountRecoveryTemplate
      ? {
        recipientUserId,
        activeAuthenticatedSession:
          activeRecipient.rows[0].active_authenticated_session === true,
        passwordReauthenticationAvailable:
          activeRecipient.rows[0].password_reauthentication_available === true,
      }
      : null,
  });
  if (draft.correctsMessageId) {
    const correctionTarget = await client.query(
      `SELECT id FROM support_messages
        WHERE id = $1 AND case_id = $2 AND recipient_user_id = $3
          AND send_status = 'sent' AND sent_at IS NOT NULL`,
      [draft.correctsMessageId, supportCase.id, recipientUserId],
    );
    if (!correctionTarget.rowCount) {
      throw new SupportCaseError(409, 'support_message_correction_target_invalid');
    }
  }
  const concurrentReplay = await client.query(
    'SELECT * FROM support_messages WHERE idempotency_key = $1',
    [key],
  );
  if (concurrentReplay.rowCount) {
    if (String(concurrentReplay.rows[0].case_id) !== String(supportCase.id)) {
      throw new SupportCaseError(409, 'support_message_idempotency_scope_conflict');
    }
    return { message: shapeSupportMessage(concurrentReplay.rows[0], { staff: true }), replayed: true };
  }
  const id = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO support_messages (
       id, case_id, sender_type, sender_id, recipient_user_id,
       message_type, message_title, template_id, template_version, locale,
       rendered_content, rendered_content_sha256, structured_variables,
       approval_level, approved_by, approved_at, approval_payload_sha256,
       send_status, sent_at, delivery_status, notification_ids,
       ai_disclosure_included, human_handoff_available, corrects_message_id,
       idempotency_key, lock_version, created_at
     ) VALUES (
       $1, $2, 'support', $3, $4,
       'support_template', $5, $6, $7, $8,
       $9, $10, $11::jsonb,
       $12, NULL, NULL, NULL,
       $13, $14, $15, '{}',
       false, true, $16,
       $17, 1, $18
     ) RETURNING *`,
    [
      id,
      supportCase.id,
      actor.id,
      recipientUserId,
      draft.title,
      draft.templateId,
      draft.templateVersion,
      draft.locale,
      draft.renderedContent,
      draft.renderedContentSha256,
      JSON.stringify(draft.structuredVariables),
      draft.approvalLevel,
      draft.sendStatus,
      draft.publishNow ? now : null,
      draft.publishNow ? 'in_app_recorded' : null,
      draft.correctsMessageId,
      key,
      now,
    ],
  );
  const eventType = draft.publishNow ? 'message.published' : 'message.drafted';
  const eventKey = `${key}:${draft.publishNow ? 'published' : 'drafted'}`;
  const payload = {
    templateId: draft.templateId,
    templateVersion: draft.templateVersion,
    renderedContentSha256: draft.renderedContentSha256,
    approvalLevel: draft.approvalLevel,
    sendStatus: draft.sendStatus,
    correctsMessageId: draft.correctsMessageId,
    inAppMessageRecorded: draft.publishNow,
    externalMessageSent: false,
  };
  await event(client, {
    caseId: supportCase.id,
    actor,
    eventType,
    messageId: id,
    payload,
    visibility: draft.publishNow ? 'user_visible' : 'internal',
    idempotencyKey: eventKey,
    now,
    automationUsed: draft.publishNow,
  });
  await audit(client, {
    actor,
    action: draft.publishNow ? 'support.message_published' : 'support.message_drafted',
    resourceId: id,
    metadata: {
      caseId: supportCase.id,
      templateId: draft.templateId,
      templateVersion: draft.templateVersion,
      renderedContentSha256: draft.renderedContentSha256,
      approvalLevel: draft.approvalLevel,
      correctsMessageId: draft.correctsMessageId,
      inAppMessageRecorded: draft.publishNow,
      externalMessageSent: false,
    },
  });
  if (draft.publishNow) {
    await enqueueSupportCaseUpdateNotification(client, {
      caseId: supportCase.id,
      recipientUserId,
      eventKey: `${eventKey}:notification`,
    });
  }
  return { message: shapeSupportMessage(inserted.rows[0], { staff: true }), replayed: false };
}

export async function reviewSupportMessage(client, {
  actor,
  caseId,
  messageId,
  raw,
  idempotencyKey,
  now = new Date(),
}) {
  assertActor(actor, ['admin'], 'support_message_review_forbidden');
  const key = supportMessageIdempotencyKey(idempotencyKey, 'support.message.review');
  const replay = await client.query(
    `SELECT message.* FROM support_case_events AS event
       JOIN support_messages AS message ON message.id::text = event.entity_id
      WHERE event.case_id::text = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [caseId, messageId, key],
  );
  if (replay.rowCount) {
    return { message: shapeSupportMessage(replay.rows[0], { staff: true }), replayed: true };
  }
  const review = normalizeSupportMessageReview(raw);
  const locked = await client.query(
    `SELECT message.*, support_case.operating_mode AS case_operating_mode
       FROM support_messages AS message
       JOIN support_cases AS support_case ON support_case.id = message.case_id
      WHERE message.id::text = $1 AND support_case.id::text = $2
      FOR UPDATE OF message`,
    [messageId, caseId],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_message_not_found');
  const row = locked.rows[0];
  assertNonLive({ operating_mode: row.case_operating_mode });
  const concurrentReplay = await client.query(
    `SELECT 1 FROM support_case_events
      WHERE case_id = $1 AND entity_id = $2 AND idempotency_key = $3`,
    [row.case_id, String(row.id), key],
  );
  if (concurrentReplay.rowCount) {
    return { message: shapeSupportMessage(row, { staff: true }), replayed: true };
  }
  if (row.sender_id === actor.id) throw new SupportCaseError(409, 'support_message_self_review_forbidden');
  if (!isHumanReviewableMessage(row)
      || row.send_status !== 'pending_approval') {
    throw new SupportCaseError(409, 'support_message_review_state_invalid');
  }
  if (Number(row.lock_version) !== review.expectedVersion) {
    throw new SupportCaseError(409, 'support_message_version_conflict');
  }
  if (row.rendered_content_sha256 !== review.expectedPayloadSha256) {
    throw new SupportCaseError(409, 'support_message_payload_changed');
  }
  const approved = review.outcome === 'approved';
  const updated = await client.query(
    `UPDATE support_messages
        SET reviewed_by = $2,
            reviewed_at = $3,
            review_outcome = $4,
            review_notes = $5,
            approved_by = $6,
            approved_at = $7,
            approval_payload_sha256 = $8,
            send_status = $9,
            lock_version = lock_version + 1
      WHERE id = $1 AND lock_version = $10 AND send_status = 'pending_approval'
      RETURNING *`,
    [
      row.id,
      actor.id,
      now,
      review.outcome,
      review.reviewNotes,
      approved ? actor.id : null,
      approved ? now : null,
      approved ? row.rendered_content_sha256 : null,
      approved ? 'approved' : 'suppressed',
      review.expectedVersion,
    ],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_message_version_conflict');
  if (['T-008', 'T-010'].includes(row.template_id)) {
    const progressUpdate = await client.query(
      `UPDATE support_case_progress_updates
          SET proposal_status = $2,
              reviewed_by = $3,
              reviewed_at = $4,
              lock_version = lock_version + 1
        WHERE message_id = $1 AND proposal_status = 'pending_review'
        RETURNING id`,
      [row.id, approved ? 'approved' : 'rejected', actor.id, now],
    );
    if (!progressUpdate.rowCount) {
      throw new SupportCaseError(409, 'support_progress_update_proposal_missing');
    }
  }
  const payload = {
    templateId: row.template_id,
    templateVersion: row.template_version,
    renderedContentSha256: row.rendered_content_sha256,
    reviewOutcome: review.outcome,
    externalMessageSent: false,
  };
  await event(client, {
    caseId: row.case_id,
    actor,
    eventType: approved ? 'message.approved' : 'message.rejected',
    messageId: row.id,
    payload,
    visibility: 'internal',
    idempotencyKey: key,
    now,
  });
  await audit(client, {
    actor,
    action: approved ? 'support.message_approved' : 'support.message_rejected',
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      templateId: row.template_id,
      renderedContentSha256: row.rendered_content_sha256,
      reviewOutcome: review.outcome,
      reviewNotesRecorded: true,
      externalMessageSent: false,
    },
  });
  return { message: shapeSupportMessage(updated.rows[0], { staff: true }), replayed: false };
}

export async function publishSupportMessage(client, {
  actor,
  caseId,
  messageId,
  raw,
  idempotencyKey,
  now = new Date(),
  progressUpdatePublication = false,
}) {
  assertActor(actor, ['support', 'admin'], 'support_message_publish_forbidden');
  const key = supportMessageIdempotencyKey(idempotencyKey, 'support.message.publish');
  const replay = await client.query(
    `SELECT message.*, support_case.current_owner_id AS case_current_owner_id
       FROM support_case_events AS event
       JOIN support_messages AS message ON message.id::text = event.entity_id
       JOIN support_cases AS support_case ON support_case.id = message.case_id
      WHERE event.case_id::text = $1 AND event.entity_id = $2
        AND event.idempotency_key = $3`,
    [caseId, messageId, key],
  );
  if (replay.rowCount) {
    if (actor.role === 'support' && replay.rows[0].case_current_owner_id !== actor.id) {
      throw new SupportCaseError(403, 'support_case_assignment_required');
    }
    return { message: shapeSupportMessage(replay.rows[0], { staff: true }), replayed: true };
  }
  const publication = normalizeSupportMessagePublication(raw);
  const locked = await client.query(
    `SELECT message.*, support_case.current_owner_id AS case_current_owner_id,
            support_case.operating_mode AS case_operating_mode,
            support_case.next_update_at AS case_next_update_at,
            support_case.case_type AS case_type,
            support_case.case_subtype AS case_subtype,
            support_case.priority AS case_priority,
            support_case.severity AS case_severity,
            support_case.safety_flag AS case_safety_flag,
            support_case.account_takeover_flag AS case_account_takeover_flag,
            support_case.approval_level AS case_approval_level,
            support_case.reporter_user_id AS case_reporter_user_id,
            recipient.account_status AS recipient_account_status,
            recipient.deactivated_at AS recipient_deactivated_at,
            recipient.password_hash IS NOT NULL
              AS recipient_password_reauthentication_available,
            EXISTS (
              SELECT 1
                FROM auth_sessions AS session
                JOIN refresh_tokens AS token ON token.session_id = session.id
               WHERE session.user_id = recipient.id
                 AND session.revoked_at IS NULL
                 AND token.revoked_at IS NULL
                 AND token.expires_at > $3
            ) AS recipient_active_authenticated_session
       FROM support_messages AS message
       JOIN support_cases AS support_case ON support_case.id = message.case_id
       JOIN users AS recipient ON recipient.id = message.recipient_user_id
      WHERE message.id::text = $1 AND support_case.id::text = $2
      FOR UPDATE OF message, recipient`,
    [messageId, caseId, now],
  );
  if (!locked.rowCount) throw new SupportCaseError(404, 'support_message_not_found');
  const row = locked.rows[0];
  assertAssignment(actor, { current_owner_id: row.case_current_owner_id });
  assertNonLive({ operating_mode: row.case_operating_mode });
  if (row.recipient_account_status !== 'active' || row.recipient_deactivated_at) {
    throw new SupportCaseError(409, 'support_message_recipient_account_closed');
  }
  const progressTemplate = ['T-008', 'T-010'].includes(row.template_id);
  if (progressTemplate !== (progressUpdatePublication === true)) {
    throw new SupportCaseError(409, 'support_progress_update_publication_required');
  }
  const concurrentReplay = await client.query(
    `SELECT 1 FROM support_case_events
      WHERE case_id = $1 AND entity_id = $2 AND idempotency_key = $3`,
    [row.case_id, String(row.id), key],
  );
  if (concurrentReplay.rowCount) {
    return { message: shapeSupportMessage(row, { staff: true }), replayed: true };
  }
  if (Number(row.lock_version) !== publication.expectedVersion) {
    throw new SupportCaseError(409, 'support_message_version_conflict');
  }
  if (row.rendered_content_sha256 !== publication.expectedPayloadSha256) {
    throw new SupportCaseError(409, 'support_message_payload_changed');
  }
  assertSupportMessageDeadlineCurrent(
    row,
    { next_update_at: row.case_next_update_at },
    now,
  );
  assertSupportMessageNextUpdateBindingCurrent(
    row,
    { next_update_at: row.case_next_update_at },
  );
  assertSupportAccountRecoveryPublication({
    message: row,
    supportCase: {
      case_type: row.case_type,
      case_subtype: row.case_subtype,
      priority: row.case_priority,
      severity: row.case_severity,
      safety_flag: row.case_safety_flag,
      account_takeover_flag: row.case_account_takeover_flag,
      approval_level: row.case_approval_level,
      reporter_user_id: row.case_reporter_user_id,
    },
    recipientState: {
      activeAuthenticatedSession:
        row.recipient_active_authenticated_session === true,
      passwordReauthenticationAvailable:
        row.recipient_password_reauthentication_available === true,
    },
  });
  const greenDraft = row.approval_level === 'green_automatic' && row.send_status === 'draft';
  const reviewedHuman = isHumanReviewableMessage(row)
    && row.send_status === 'approved'
    && row.approved_by
    && row.approved_at
    && row.approval_payload_sha256 === row.rendered_content_sha256;
  if (!greenDraft && !reviewedHuman) {
    throw new SupportCaseError(409, 'support_message_publication_not_approved');
  }
  const updated = await client.query(
    `UPDATE support_messages
        SET send_status = 'sent',
            sent_at = $2,
            delivery_status = 'in_app_recorded',
            lock_version = lock_version + 1
      WHERE id = $1 AND lock_version = $3
        AND send_status = $4
      RETURNING *`,
    [row.id, now, publication.expectedVersion, row.send_status],
  );
  if (!updated.rowCount) throw new SupportCaseError(409, 'support_message_version_conflict');
  const payload = {
    templateId: row.template_id,
    templateVersion: row.template_version,
    renderedContentSha256: row.rendered_content_sha256,
    approvalLevel: row.approval_level,
    inAppMessageRecorded: true,
    externalMessageSent: false,
  };
  await event(client, {
    caseId: row.case_id,
    actor,
    eventType: 'message.published',
    messageId: row.id,
    payload,
    visibility: 'user_visible',
    idempotencyKey: key,
    now,
  });
  await audit(client, {
    actor,
    action: 'support.message_published',
    resourceId: row.id,
    metadata: {
      caseId: row.case_id,
      templateId: row.template_id,
      renderedContentSha256: row.rendered_content_sha256,
      approvalLevel: row.approval_level,
      inAppMessageRecorded: true,
      externalMessageSent: false,
    },
  });
  await enqueueSupportCaseUpdateNotification(client, {
    caseId: row.case_id,
    recipientUserId: row.recipient_user_id,
    eventKey: `${key}:notification`,
  });
  return { message: shapeSupportMessage(updated.rows[0], { staff: true }), replayed: false };
}
