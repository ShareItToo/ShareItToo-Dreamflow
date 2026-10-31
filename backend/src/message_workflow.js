import crypto from 'node:crypto';

import {
  parseConditionEvidence,
  recordConditionEvidenceForMessage,
} from './booking_condition_evidence_workflow.js';
import { enqueueMessageNotification } from './notifications.js';

const CHAT_ENABLED_STATUSES = Object.freeze([
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'returned',
  'disputed',
]);

export class MessageWorkflowError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function safeText(value, maxLength = 4000) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= maxLength ? text : '';
}

function safeIdentifier(value, prefix) {
  const text = safeText(value, 120);
  if (text && /^[A-Za-z0-9_.:-]+$/.test(text)) return text;
  return `${prefix}_${crypto.randomUUID()}`;
}

function itemTitle(payload) {
  const title = safeText(payload?.title, 240);
  return title || 'Artikel';
}

function messagePayload(row, actorId) {
  return {
    id: row.id,
    senderId: row.sender_type === 'system' ? 'system' : row.sender_id,
    text: row.body,
    timestamp: new Date(row.created_at).toISOString(),
    isRead: row.sender_type === 'system'
      || row.sender_id === actorId
      || Boolean(row.read_at)
      || row.is_read === true,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

function threadPayload(row, messages = []) {
  return {
    ...(row.payload ?? {}),
    id: row.id,
    requestId: row.request_id,
    bookingId: row.booking_id ?? row.request_id,
    itemId: row.item_id,
    itemTitle: itemTitle(row.listing_payload ?? row.payload),
    user1Id: row.user1_id,
    user2Id: row.user2_id,
    bookingStatus: row.workflow_status ?? row.payload?.bookingStatus ?? null,
    archivedForUserIds: Array.isArray(row.archived_for) ? row.archived_for : [],
    communicationVersion: Number(row.communication_version ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
    messages,
  };
}

async function lockedThread(client, threadId, actorId) {
  const result = await client.query(
    `SELECT thread.*, booking.workflow_status, booking.workflow_version,
            booking.owner_id, booking.renter_id,
            booking.return_state, booking.return_report_deadline,
            active_case.id AS active_return_case_id,
            listing.payload AS listing_payload
     FROM message_threads AS thread
     JOIN bookings AS booking ON booking.id = thread.booking_id
     JOIN listings AS listing ON listing.id = thread.item_id
     LEFT JOIN LATERAL (
       SELECT booking_case.id
         FROM booking_cases AS booking_case
        WHERE booking_case.booking_id = booking.id
          AND booking_case.status <> 'closed'
        ORDER BY booking_case.opened_at DESC
        LIMIT 1
     ) AS active_case ON true
     WHERE thread.id = $1
     FOR UPDATE OF thread`,
    [threadId],
  );
  if (!result.rowCount) throw new MessageWorkflowError(404, 'message_thread_not_found');
  const row = result.rows[0];
  if (row.user1_id !== actorId && row.user2_id !== actorId) {
    throw new MessageWorkflowError(403, 'message_thread_forbidden');
  }
  if (Number(row.communication_version) !== 1 || Number(row.workflow_version) !== 1) {
    throw new MessageWorkflowError(409, 'message_thread_requires_b7');
  }
  return row;
}

export function bookingMessagingAllowed(row, { now = new Date() } = {}) {
  if (CHAT_ENABLED_STATUSES.includes(row.workflow_status)) return true;
  if (row.workflow_status !== 'completed') return false;
  if (row.return_state === 'needsReview') return Boolean(row.active_return_case_id);
  const deadline = new Date(row.return_report_deadline ?? '');
  const current = now instanceof Date ? now : new Date(now);
  return Number.isFinite(deadline.getTime())
    && Number.isFinite(current.getTime())
    && current <= deadline;
}

async function assertMessagingAllowed(client, row, actorId) {
  if (!bookingMessagingAllowed(row)) {
    throw new MessageWorkflowError(409, 'message_thread_closed', { status: row.workflow_status });
  }
  const recipientId = row.user1_id === actorId ? row.user2_id : row.user1_id;
  const restrictions = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM user_suspensions
         WHERE user_id = $1 AND scope IN ('account', 'messaging')
           AND lifted_at IS NULL AND starts_at <= now()
           AND (ends_at IS NULL OR ends_at > now())
       ) AS suspended,
       EXISTS (
         SELECT 1 FROM user_blocks
         WHERE unblocked_at IS NULL
           AND ((blocker_id = $1 AND blocked_id = $2)
             OR (blocker_id = $2 AND blocked_id = $1))
       ) AS blocked`,
    [actorId, recipientId],
  );
  if (restrictions.rows[0]?.suspended) throw new MessageWorkflowError(403, 'messaging_suspended');
  if (restrictions.rows[0]?.blocked) throw new MessageWorkflowError(403, 'contact_blocked');
  return recipientId;
}

export async function ensureBookingThread(client, { bookingId, actorId }) {
  const bookingResult = await client.query(
    `SELECT booking.id, booking.listing_id, booking.owner_id, booking.renter_id,
            booking.workflow_status, booking.workflow_version,
            request.payload AS request_payload, listing.payload AS listing_payload
     FROM bookings AS booking
     JOIN rental_requests AS request ON request.id = booking.id
     JOIN listings AS listing ON listing.id = booking.listing_id
     WHERE booking.id = $1
     FOR UPDATE OF booking`,
    [bookingId],
  );
  if (!bookingResult.rowCount) throw new MessageWorkflowError(404, 'booking_not_found');
  const booking = bookingResult.rows[0];
  if (booking.owner_id !== actorId && booking.renter_id !== actorId) {
    throw new MessageWorkflowError(403, 'booking_forbidden');
  }
  if (Number(booking.workflow_version) !== 1) {
    throw new MessageWorkflowError(409, 'booking_requires_b6_revalidation');
  }
  if (!CHAT_ENABLED_STATUSES.includes(booking.workflow_status)
      && booking.workflow_status !== 'completed') {
    throw new MessageWorkflowError(409, 'booking_chat_unavailable', { status: booking.workflow_status });
  }

  let existing = await client.query(
    'SELECT * FROM message_threads WHERE booking_id = $1 OR request_id = $1 FOR UPDATE',
    [bookingId],
  );
  if (!existing.rowCount) {
    const threadId = `thread_${crypto.randomUUID()}`;
    const title = itemTitle(booking.listing_payload);
    const payload = {
      id: threadId,
      requestId: booking.id,
      bookingId: booking.id,
      itemId: booking.listing_id,
      itemTitle: title,
      user1Id: booking.renter_id,
      user2Id: booking.owner_id,
      bookingStatus: booking.workflow_status,
      threadType: 'booking',
    };
    existing = await client.query(
      `INSERT INTO message_threads (
         id, request_id, booking_id, item_id, user1_id, user2_id,
         payload, communication_version, created_at, last_message_at
       ) VALUES ($1, $2, $2, $3, $4, $5, $6::jsonb, 1, now(), now())
       RETURNING *`,
      [threadId, booking.id, booking.listing_id, booking.renter_id, booking.owner_id, JSON.stringify(payload)],
    );
    await client.query(
      `INSERT INTO messages (
         id, thread_id, sender_id, sender_type, body, is_read,
         client_message_id, message_version, created_at
       ) VALUES ($1, $2, NULL, 'system', $3, true, $4, 1, now())`,
      [
        `message_${crypto.randomUUID()}`,
        threadId,
        'Der Buchungs-Chat ist geöffnet. Teile hier keine Zahlungsdaten, Passwörter oder Sicherheitscodes.',
        `system:thread-opened:${booking.id}`,
      ],
    );
  } else if (Number(existing.rows[0].communication_version) !== 1) {
    existing = await client.query(
      `UPDATE message_threads
       SET booking_id = $2, communication_version = 1,
           payload = payload || $3::jsonb
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        booking.id,
        JSON.stringify({
          bookingId: booking.id,
          bookingStatus: booking.workflow_status,
          itemTitle: itemTitle(booking.listing_payload),
        }),
      ],
    );
    await client.query(
      'UPDATE messages SET message_version = 1 WHERE thread_id = $1',
      [existing.rows[0].id],
    );
  }
  const row = {
    ...existing.rows[0],
    workflow_status: booking.workflow_status,
    listing_payload: booking.listing_payload,
  };
  const messages = await client.query(
    `SELECT message.*, receipt.read_at
     FROM messages AS message
     LEFT JOIN message_reads AS receipt
       ON receipt.message_id = message.id AND receipt.user_id = $2
     WHERE message.thread_id = $1
     ORDER BY message.created_at DESC, message.id DESC
     LIMIT 50`,
    [row.id, actorId],
  );
  return threadPayload(row, messages.rows.reverse().map((message) => messagePayload(message, actorId)));
}

export async function listCommunicationThreads(client, {
  actorId,
  limit = 100,
  offset = 0,
  includeArchived = false,
}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
  const safeOffset = Math.min(5000, Math.max(0, Number(offset) || 0));
  const result = await client.query(
    `SELECT thread.*, booking.workflow_status, listing.payload AS listing_payload
     FROM message_threads AS thread
     JOIN bookings AS booking ON booking.id = thread.booking_id
     JOIN listings AS listing ON listing.id = thread.item_id
     WHERE thread.communication_version = 1
       AND (thread.user1_id = $1 OR thread.user2_id = $1)
       AND ($2::boolean OR NOT thread.archived_for ? $1)
     ORDER BY COALESCE(thread.last_message_at, thread.created_at) DESC, thread.id DESC
     LIMIT $3 OFFSET $4`,
    [actorId, includeArchived, safeLimit, safeOffset],
  );
  const threads = [];
  for (const row of result.rows) {
    const messages = await client.query(
      `SELECT message.*, receipt.read_at
       FROM messages AS message
       LEFT JOIN message_reads AS receipt
         ON receipt.message_id = message.id AND receipt.user_id = $2
       WHERE message.thread_id = $1
       ORDER BY message.created_at DESC, message.id DESC
       LIMIT 50`,
      [row.id, actorId],
    );
    threads.push(threadPayload(row, messages.rows.reverse().map((message) => messagePayload(message, actorId))));
  }
  return { threads, limit: safeLimit, offset: safeOffset, nextOffset: result.rowCount === safeLimit ? safeOffset + safeLimit : null };
}

export async function listThreadMessages(client, {
  threadId,
  actorId,
  limit = 50,
  before = null,
}) {
  await lockedThread(client, threadId, actorId);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
  const result = await client.query(
    `SELECT message.*, receipt.read_at
     FROM messages AS message
     LEFT JOIN message_reads AS receipt
       ON receipt.message_id = message.id AND receipt.user_id = $2
     WHERE message.thread_id = $1
       AND ($3::timestamptz IS NULL OR message.created_at < $3)
     ORDER BY message.created_at DESC, message.id DESC
     LIMIT $4`,
    [threadId, actorId, beforeDate, safeLimit],
  );
  const messages = result.rows.reverse().map((message) => messagePayload(message, actorId));
  return {
    messages,
    nextBefore: result.rowCount === safeLimit ? messages[0]?.timestamp ?? null : null,
  };
}

async function validatedAttachments(client, {
  actorId,
  threadId,
  raw,
  requiredPurpose = 'message_attachment',
}) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 5) {
    throw new MessageWorkflowError(400, 'invalid_message_attachments');
  }
  const ids = raw.map((value) => safeText(value, 200)).filter(Boolean);
  if (ids.length !== raw.length) throw new MessageWorkflowError(400, 'invalid_message_attachments');
  if (!ids.length) return [];
  const result = await client.query(
    `SELECT id::text, storage_name, thumbnail_storage_name, mime_type, byte_size,
            image_width, image_height, content_sha256, content_scan_status
     FROM uploads
     WHERE owner_id = $1 AND thread_id = $2
       AND purpose = $3 AND visibility = 'private'
       AND (id::text = ANY($4::text[]) OR storage_name = ANY($4::text[]))`,
    [actorId, threadId, requiredPurpose, ids],
  );
  if (result.rowCount !== new Set(ids).size) {
    throw new MessageWorkflowError(400, 'message_attachment_not_owned');
  }
  return result.rows.map((row) => ({
    id: row.id,
    storageName: row.storage_name,
    thumbnailStorageName: row.thumbnail_storage_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.image_width,
    height: row.image_height,
    contentSha256: row.content_sha256,
    contentScanStatus: row.content_scan_status,
  }));
}

export async function sendThreadMessage(client, {
  threadId,
  actor,
  raw,
  idempotencyKey,
}) {
  const row = await lockedThread(client, threadId, actor.id);
  const recipientId = await assertMessagingAllowed(client, row, actor.id);
  const body = safeText(raw?.text, 4000);
  const clientMessageId = safeIdentifier(idempotencyKey ?? raw?.clientMessageId, 'client');
  const existing = await client.query(
    `SELECT message.*, receipt.read_at
     FROM messages AS message
     LEFT JOIN message_reads AS receipt
       ON receipt.message_id = message.id AND receipt.user_id = $3
     WHERE message.thread_id = $1 AND message.client_message_id = $2`,
    [threadId, clientMessageId, actor.id],
  );
  if (existing.rowCount) {
    return { message: messagePayload(existing.rows[0], actor.id), replayed: true, recipientId };
  }
  const conditionEvidence = parseConditionEvidence(raw?.conditionEvidence, {
    booking: row,
    actorId: actor.id,
  });
  const attachments = await validatedAttachments(client, {
    actorId: actor.id,
    threadId,
    raw: raw?.attachmentIds,
    requiredPurpose: conditionEvidence?.requiredUploadPurpose,
  });
  if (conditionEvidence && attachments.length !== 1) {
    throw new MessageWorkflowError(400, 'condition_evidence_requires_one_photo');
  }
  if (!body && !attachments.length) throw new MessageWorkflowError(400, 'message_empty');
  const messageId = safeIdentifier(raw?.id, 'message');
  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO messages (
         id, thread_id, sender_id, sender_type, body, is_read,
         client_message_id, attachments, message_version, created_at
       ) VALUES ($1, $2, $3, 'user', $4, false, $5, $6::jsonb, 1, now())
       RETURNING *, NULL::timestamptz AS read_at`,
      [messageId, threadId, actor.id, body || 'Anhang', clientMessageId, JSON.stringify(attachments)],
    );
  } catch (error) {
    if (error?.code !== '23505') throw error;
    const replay = await client.query(
      `SELECT message.*, receipt.read_at
       FROM messages AS message
       LEFT JOIN message_reads AS receipt
         ON receipt.message_id = message.id AND receipt.user_id = $3
       WHERE message.thread_id = $1 AND message.client_message_id = $2`,
      [threadId, clientMessageId, actor.id],
    );
    if (!replay.rowCount) throw error;
    return { message: messagePayload(replay.rows[0], actor.id), replayed: true, recipientId };
  }
  await recordConditionEvidenceForMessage(client, {
    bookingId: row.booking_id,
    actorId: actor.id,
    messageId,
    attachments,
    evidence: conditionEvidence,
  });
  await client.query(
    `UPDATE message_threads
     SET last_message_at = now(), archived_for = archived_for - $2
     WHERE id = $1`,
    [threadId, recipientId],
  );
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'message.sent', 'message', $3, $4::jsonb)`,
    [actor.id, actor.role, messageId, JSON.stringify({
      threadId,
      bookingId: row.booking_id,
      hasAttachments: attachments.length > 0,
      conditionEvidence: conditionEvidence == null ? null : {
        segment: conditionEvidence.segment,
        kind: conditionEvidence.kind,
        semanticSlot: conditionEvidence.semanticSlot,
      },
    })],
  );
  await enqueueMessageNotification(client, {
    messageId,
    threadId,
    bookingId: row.booking_id,
    recipientId,
    item: itemTitle(row.listing_payload),
  });
  return { message: messagePayload(inserted.rows[0], actor.id), replayed: false, recipientId };
}

export async function markThreadRead(client, { threadId, actorId }) {
  await lockedThread(client, threadId, actorId);
  const result = await client.query(
    `INSERT INTO message_reads (message_id, thread_id, user_id, read_at)
     SELECT message.id, message.thread_id, $2, now()
     FROM messages AS message
     WHERE message.thread_id = $1
       AND message.sender_type = 'user'
       AND message.sender_id IS DISTINCT FROM $2
     ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
     RETURNING message_id`,
    [threadId, actorId],
  );
  await client.query(
    `UPDATE messages SET is_read = true
     WHERE thread_id = $1 AND sender_type = 'user' AND sender_id IS DISTINCT FROM $2`,
    [threadId, actorId],
  );
  return result.rowCount;
}

export async function setThreadArchived(client, { threadId, actorId, archived }) {
  await lockedThread(client, threadId, actorId);
  const result = await client.query(
    `UPDATE message_threads
     SET archived_for = CASE
       WHEN $3::boolean THEN CASE WHEN archived_for ? $2 THEN archived_for ELSE archived_for || to_jsonb($2::text) END
       ELSE archived_for - $2
     END
     WHERE id = $1
     RETURNING archived_for`,
    [threadId, actorId, archived],
  );
  return Array.isArray(result.rows[0]?.archived_for) ? result.rows[0].archived_for : [];
}

export async function reportMessage(client, { actor, messageId, reasonCode, details }) {
  const result = await client.query(
    `SELECT message.id, message.thread_id, thread.user1_id, thread.user2_id
     FROM messages AS message
     JOIN message_threads AS thread ON thread.id = message.thread_id
     WHERE message.id = $1`,
    [messageId],
  );
  if (!result.rowCount) throw new MessageWorkflowError(404, 'message_not_found');
  const row = result.rows[0];
  if (row.user1_id !== actor.id && row.user2_id !== actor.id) {
    throw new MessageWorkflowError(403, 'message_forbidden');
  }
  const reason = safeText(reasonCode, 120);
  const note = details === undefined || details === null ? null : safeText(details, 8000);
  if (!reason || (details && !note)) throw new MessageWorkflowError(400, 'invalid_report');
  const inserted = await client.query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason_code, details)
     VALUES ($1, 'message', $2, $3, $4)
     RETURNING id, status, created_at`,
    [actor.id, messageId, reason, note],
  );
  return {
    id: inserted.rows[0].id,
    status: inserted.rows[0].status,
    createdAt: new Date(inserted.rows[0].created_at).toISOString(),
  };
}

export async function listBlocks(client, actorId) {
  const result = await client.query(
    `SELECT blocked_id, created_at
     FROM user_blocks
     WHERE blocker_id = $1 AND unblocked_at IS NULL
     ORDER BY created_at DESC`,
    [actorId],
  );
  return result.rows.map((row) => ({
    userId: row.blocked_id,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function blockUser(client, { actor, blockedId, reasonCode = 'user_request' }) {
  if (!safeText(blockedId, 120) || blockedId === actor.id) {
    throw new MessageWorkflowError(400, 'invalid_block_target');
  }
  const target = await client.query(
    'SELECT id FROM users WHERE id = $1 AND account_status = \'active\'',
    [blockedId],
  );
  if (!target.rowCount) throw new MessageWorkflowError(404, 'user_not_found');
  const existing = await client.query(
    `SELECT id FROM user_blocks
     WHERE blocker_id = $1 AND blocked_id = $2 AND unblocked_at IS NULL`,
    [actor.id, blockedId],
  );
  if (!existing.rowCount) {
    await client.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id, reason_code)
       VALUES ($1, $2, $3)`,
      [actor.id, blockedId, safeText(reasonCode, 120) || 'user_request'],
    );
  }
  await client.query(
    `UPDATE message_threads
     SET archived_for = CASE WHEN archived_for ? $1 THEN archived_for ELSE archived_for || to_jsonb($1::text) END
     WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
    [actor.id, blockedId],
  );
}

export async function unblockUser(client, { actorId, blockedId }) {
  const result = await client.query(
    `UPDATE user_blocks SET unblocked_at = now()
     WHERE blocker_id = $1 AND blocked_id = $2 AND unblocked_at IS NULL
     RETURNING id`,
    [actorId, blockedId],
  );
  return result.rowCount > 0;
}
