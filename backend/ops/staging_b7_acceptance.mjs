import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  assertClosedPilotLegalReadiness,
  closedPilotBookingBody,
  closedPilotListingCategory,
  closedPilotLocation,
  closedPilotOwnerAcceptanceBody,
  closedPilotQuoteBody,
} from './closed_pilot_acceptance.mjs';
import { createEphemeralAcceptancePassword } from './ephemeral_acceptance_password.mjs';

import { pool } from '../src/db.js';
import { hashPassword, signAccessToken } from '../src/security.js';

const baseUrl = (process.env.ACCEPTANCE_BASE_URL || 'http://127.0.0.1:8080/v1')
  .replace(/\/$/, '');
const acceptancePushTransport = (process.env.ACCEPTANCE_PUSH_TRANSPORT || 'memory')
  .trim()
  .toLowerCase();
const acceptanceUploadDir = (process.env.ACCEPTANCE_UPLOAD_DIR || '').trim() || null;
const acceptanceClientIp = (process.env.ACCEPTANCE_CLIENT_IP || '').trim() || null;
const runId = `b7-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const password = createEphemeralAcceptancePassword();

if (!['memory', 'fcm'].includes(acceptancePushTransport)) {
  throw new Error('ACCEPTANCE_PUSH_TRANSPORT must be memory or fcm.');
}
if (acceptanceClientIp && !/^198\.51\.100\.(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/.test(acceptanceClientIp)) {
  throw new Error('ACCEPTANCE_CLIENT_IP must use the reserved 198.51.100.0/24 documentation range.');
}

function dateOnly(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

async function api(path, {
  method = 'GET',
  token = null,
  body = undefined,
  headers = {},
  expected = [200],
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(acceptanceClientIp ? { 'X-Forwarded-For': acceptanceClientIp } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
    body: body === undefined || body instanceof FormData
      ? body
      : JSON.stringify(body),
  });
  const text = await response.text();
  let value = text;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    // HTML responses are deliberately returned as text.
  }
  assert.ok(
    expected.includes(response.status),
    `${method} ${path}: expected ${expected.join('/')} but received ${response.status}: ${text.slice(0, 500)}`,
  );
  return { response, value, text };
}

async function waitFor(label, callback, { timeoutMs = 20_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await callback();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function waitForOutbox(eventKey, expectedChannels) {
  return waitFor(`outbox ${eventKey}`, async () => {
    const result = await pool.query(
      `SELECT channel, status, attempt_count, provider_message_id
       FROM notification_outbox
       WHERE event_key = $1
       ORDER BY channel`,
      [eventKey],
    );
    if (result.rowCount !== expectedChannels.length) return null;
    if (!result.rows.every((row) => ['sent', 'suppressed'].includes(row.status))) return null;
    assert.deepEqual(result.rows.map((row) => row.channel), [...expectedChannels].sort());
    return result.rows;
  });
}

async function insertAcceptancePushDevice(user, platform) {
  const token = `${runId}-${platform}-acceptance-push-token`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(
    `INSERT INTO push_devices (
       user_id, session_id, platform, token, token_hash, locale
     ) VALUES ($1, $2, $3, $4, $5, 'de-DE')`,
    [user.id, user.sessionId, platform, token, tokenHash],
  );
}

async function main() {
  await assertClosedPilotLegalReadiness(pool);
  const passwordHash = await hashPassword(password);
  const users = {
    owner: {
      id: `${runId}-owner`,
      email: `${runId}-owner@example.invalid`,
      displayName: 'B7 Live Owner',
      sessionId: crypto.randomUUID(),
    },
    renter: {
      id: `${runId}-renter`,
      email: `${runId}-renter@example.invalid`,
      displayName: 'B7 Live Renter',
      sessionId: crypto.randomUUID(),
    },
    outsider: {
      id: `${runId}-outsider`,
      email: `${runId}-outsider@example.invalid`,
      displayName: 'B7 Live Outsider',
      sessionId: crypto.randomUUID(),
    },
  };

  for (const user of Object.values(users)) {
    await pool.query(
      `INSERT INTO users (
         id, email, password_hash, profile, role, account_status,
         email_verified_at, terms_accepted_at, privacy_accepted_at,
         minimum_age_confirmed_at, private_use_confirmed_at
       ) VALUES ($1, $2, $3, $4::jsonb, 'user', 'active', now(), now(), now(), now(), now())`,
      [
        user.id,
        user.email,
        passwordHash,
        JSON.stringify({
          displayName: user.displayName,
          emailVerified: true,
          phoneVerified: false,
          isVerified: true,
          isBanned: false,
          role: 'user',
        }),
      ],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, device_label)
       VALUES ($1, $2, 'B7 staging acceptance')`,
      [user.sessionId, user.id],
    );
    user.token = signAccessToken(
      { id: user.id, email: user.email },
      { sessionId: user.sessionId },
    );
  }

  for (const [role, user] of Object.entries(users)) {
    if (role === 'outsider') continue;
    if (acceptancePushTransport === 'memory') {
      await insertAcceptancePushDevice(user, role === 'owner' ? 'android' : 'ios');
    }
  }

  const listingImage = await sharp({
    create: {
      width: 960,
      height: 640,
      channels: 3,
      background: { r: 26, g: 96, b: 166 },
    },
  }).jpeg({ quality: 91 }).toBuffer();
  const listingForm = new FormData();
  listingForm.append('purpose', 'listing_image');
  listingForm.append('file', new Blob([listingImage], { type: 'image/jpeg' }), 'b7-camera.jpg');
  const listingUpload = (await api('/uploads', {
    method: 'POST',
    token: users.owner.token,
    body: listingForm,
    expected: [201],
  })).value;

  const listingId = `${runId}-listing`;
  const listing = (await api('/listings', {
    method: 'POST',
    token: users.owner.token,
    body: {
      id: listingId,
      title: 'B7 Live Testkamera',
      description: 'Isoliertes Staging-Inserat für die B7 Kommunikationsabnahme.',
      ...closedPilotListingCategory,
      tags: ['b7', 'kamera'],
      pricePerDay: 20,
      priceRaw: 20,
      priceUnit: 'day',
      currency: 'EUR',
      photos: [listingUpload.url],
      ...closedPilotLocation,
      geohash: 'private',
      condition: 'good',
      minDays: 1,
      maxDays: 14,
      protectionModel: 'none',
      privateStatusConfirmed: true,
      status: 'active',
      isActive: true,
    },
    expected: [201],
  })).value.listing;
  assert.equal(listing.ownerId, users.owner.id);

  await api(`/listings/${listingId}/availability`, {
    method: 'PUT',
    token: users.owner.token,
    body: {
      timezone: 'Europe/Berlin',
      minimumDays: 1,
      maximumDays: 14,
      noticeHours: 0,
      acceptanceWindowMinutes: 30,
      rules: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        localStart: '00:00',
        localEnd: '23:59',
        isAvailable: true,
      })),
      blocks: [],
    },
  });

  const bookingId = `${runId}-booking`;
  const createKey = `${runId}-create-booking`;
  const bookingDates = {
    itemId: listingId,
    startDate: dateOnly(45),
    endDate: dateOnly(47),
  };
  const quote = (await api('/bookings/quote', {
    method: 'POST',
    token: users.renter.token,
    body: closedPilotQuoteBody(bookingDates),
  })).value;
  const bookingPayload = closedPilotBookingBody({
    id: bookingId,
    ...bookingDates,
    quote,
  });
  const created = await api('/bookings', {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': createKey },
    body: bookingPayload,
    expected: [201],
  });
  assert.equal(created.value.booking.workflowStatus, 'requested');
  const replayedBooking = await api('/bookings', {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': createKey },
    body: bookingPayload,
  });
  assert.equal(replayedBooking.value.replayed, true);

  const requestedEvent = `booking:${bookingId}:requested:${createKey}`;
  const requestedChannels = ['email', 'in_app', 'push'];
  const requestedDelivery = await waitForOutbox(requestedEvent, requestedChannels);
  assert.deepEqual(
    requestedDelivery.map((row) => `${row.channel}:${row.status}:${row.attempt_count}`),
    acceptancePushTransport === 'memory'
      ? ['email:sent:1', 'in_app:sent:1', 'push:sent:1']
      : ['email:sent:1', 'in_app:sent:1', 'push:suppressed:1'],
  );

  const acceptKey = `${runId}-accept-booking`;
  const accepted = await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': acceptKey },
    body: closedPilotOwnerAcceptanceBody(),
  });
  assert.equal(accepted.value.booking.workflowStatus, 'accepted');
  const acceptedEvent = `booking:${bookingId}:accepted:${acceptKey}:0`;
  const acceptedDelivery = await waitForOutbox(acceptedEvent, requestedChannels);
  assert.deepEqual(
    acceptedDelivery.map((row) => `${row.channel}:${row.status}:${row.attempt_count}`),
    acceptancePushTransport === 'memory'
      ? ['email:sent:1', 'in_app:sent:1', 'push:sent:1']
      : ['email:sent:1', 'in_app:sent:1', 'push:suppressed:1'],
  );

  const threadResponse = await api(`/message-threads/booking/${bookingId}`, {
    method: 'POST',
    token: users.renter.token,
    expected: [201],
  });
  const threadId = threadResponse.value.thread.id;
  assert.equal(threadResponse.value.thread.communicationVersion, 1);

  const attachmentImage = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 240, g: 180, b: 36 },
    },
  }).png().toBuffer();
  const attachmentForm = new FormData();
  attachmentForm.append('purpose', 'message_attachment');
  attachmentForm.append('threadId', threadId);
  attachmentForm.append('file', new Blob([attachmentImage], { type: 'image/png' }), 'handover-photo.png');
  const attachment = (await api('/uploads', {
    method: 'POST',
    token: users.renter.token,
    body: attachmentForm,
    expected: [201],
  })).value;

  const messageKey = `${runId}-message-1`;
  const sendMessage = () => api(`/message-threads/${threadId}/messages`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': messageKey },
    body: {
      text: 'Treffen wir uns um 18 Uhr? Das Foto ist privat angehängt.',
      attachmentIds: [attachment.id],
    },
    expected: [200, 201],
  });
  const sent = await sendMessage();
  assert.equal(sent.response.status, 201);
  assert.equal(sent.value.message.attachments.length, 1);
  assert.equal(sent.value.message.attachments[0].storageName, attachment.storageName);
  assert.equal(
    sent.value.message.attachments[0].thumbnailStorageName,
    attachment.thumbnailUrl.split('/').pop(),
  );
  const replayed = await sendMessage();
  assert.equal(replayed.response.status, 200);
  assert.equal(replayed.value.message.id, sent.value.message.id);

  const outsiderRead = await api(`/message-threads/${threadId}/messages`, {
    token: users.outsider.token,
    expected: [403],
  });
  assert.equal(outsiderRead.value.error, 'message_thread_forbidden');
  const outsiderAttachment = await api(`/uploads/${encodeURIComponent(attachment.storageName)}`, {
    token: users.outsider.token,
    expected: [403],
  });
  assert.equal(outsiderAttachment.value.error, 'upload_forbidden');
  const participantAttachment = await api(`/uploads/${encodeURIComponent(attachment.storageName)}`, {
    token: users.owner.token,
  });
  assert.equal(participantAttachment.response.headers.get('cache-control'), 'private, no-store');
  const participantThumbnail = await api(
    `/uploads/${encodeURIComponent(sent.value.message.attachments[0].thumbnailStorageName)}`,
    { token: users.owner.token },
  );
  assert.equal(participantThumbnail.response.headers.get('cache-control'), 'private, no-store');

  const reported = await api(`/messages/${sent.value.message.id}/reports`, {
    method: 'POST',
    token: users.owner.token,
    body: { reasonCode: 'staging_acceptance', details: 'B7 Meldeweg geprüft.' },
    expected: [201],
  });
  assert.equal(reported.value.report.status, 'open');
  await api(`/user-blocks/${users.renter.id}`, {
    method: 'PUT',
    token: users.owner.token,
    body: { reasonCode: 'staging_acceptance' },
    expected: [204],
  });
  const blockedSend = await api(`/message-threads/${threadId}/messages`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-blocked-message` },
    body: { text: 'Diese Nachricht darf nicht ankommen.' },
    expected: [403],
  });
  assert.equal(blockedSend.value.error, 'contact_blocked');
  await api(`/user-blocks/${users.renter.id}`, {
    method: 'DELETE',
    token: users.owner.token,
    expected: [204],
  });

  const messageEvent = `message:${sent.value.message.id}`;
  const messageChannels = ['in_app', 'push'];
  const messageDelivery = await waitForOutbox(messageEvent, messageChannels);
  assert.deepEqual(
    messageDelivery.map((row) => `${row.channel}:${row.status}:${row.attempt_count}`),
    acceptancePushTransport === 'memory'
      ? ['in_app:sent:1', 'push:sent:1']
      : ['in_app:sent:1', 'push:suppressed:1'],
  );
  const messageRows = await pool.query(
    `SELECT count(*)::int AS count FROM messages
     WHERE thread_id = $1 AND client_message_id = $2`,
    [threadId, messageKey],
  );
  assert.equal(messageRows.rows[0].count, 1);
  const messageNotifications = await pool.query(
    `SELECT count(*)::int AS count FROM notifications
     WHERE event_key = $1 AND user_id = $2`,
    [messageEvent, users.owner.id],
  );
  assert.equal(messageNotifications.rows[0].count, 1);

  const feed = await api('/notifications?limit=100', { token: users.owner.token });
  const feedMessage = feed.value.notifications.find((entry) => entry.threadId === threadId);
  assert.ok(feedMessage);
  await api(`/notifications/${feedMessage.id}`, {
    method: 'PATCH',
    token: users.owner.token,
    body: { read: true },
  });
  const readReceipt = await api(`/message-threads/${threadId}/read`, {
    method: 'POST',
    token: users.owner.token,
  });
  assert.ok(readReceipt.value.readCount >= 1);

  await api('/notification-preferences', {
    method: 'PUT',
    token: users.owner.token,
    body: {
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      messagePushEnabled: false,
      bookingPushEnabled: true,
      locale: 'de-DE',
    },
  });
  const optOutMessage = await api(`/message-threads/${threadId}/messages`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-message-optout` },
    body: { text: 'Push-Opt-out-Test; In-App bleibt aktiv.' },
    expected: [201],
  });
  const optOutEvent = `message:${optOutMessage.value.message.id}`;
  const optOutDelivery = await waitForOutbox(optOutEvent, messageChannels);
  assert.deepEqual(
    optOutDelivery.map((row) => `${row.channel}:${row.status}`),
    ['in_app:sent', 'push:suppressed'],
  );

  const chatFallback = await api(`/open/chat/${encodeURIComponent(threadId)}`);
  assert.match(chatFallback.text, /In der App öffnen/);
  const bookingFallback = await api(`/open/booking/${encodeURIComponent(bookingId)}`);
  assert.match(bookingFallback.text, /In der App öffnen/);
  const invalidFallback = await api(`/open/unsupported/${encodeURIComponent(bookingId)}`, {
    expected: [404],
  });
  assert.match(invalidFallback.text, /Link nicht verfügbar/);
  const expiredLink = await api(
    `/auth/email-verification/confirm?token=${encodeURIComponent(`${runId}-expired-token`)}`,
    { expected: [400] },
  );
  assert.match(expiredLink.text, /Link nicht mehr gültig/);

  const retryEvent = `acceptance:retry:${runId}`;
  const retryPayload = {
    push: {
      title: '',
      body: 'Kontrollierter Wiederholungsversuch',
      actionUrl: `${baseUrl}/open/chat/${threadId}`,
      data: { acceptance: true },
    },
  };
  if (acceptancePushTransport === 'memory') await pool.query(
    `INSERT INTO notification_outbox (
       event_key, user_id, channel, kind, thread_id, booking_id, payload
     ) VALUES ($1, $2, 'push', 'message_received', $3, $4, $5::jsonb)`,
    [retryEvent, users.renter.id, threadId, bookingId, JSON.stringify(retryPayload)],
  );
  if (acceptancePushTransport === 'memory') await waitFor('controlled retry', async () => {
    const row = (await pool.query(
      `SELECT status, attempt_count FROM notification_outbox WHERE event_key = $1`,
      [retryEvent],
    )).rows[0];
    return row?.status === 'retry' && row.attempt_count === 1 ? row : null;
  });
  retryPayload.push.title = 'Wiederholungsversuch erfolgreich';
  if (acceptancePushTransport === 'memory') await pool.query(
    `UPDATE notification_outbox
     SET payload = $2::jsonb, status = 'retry', not_before = now()
     WHERE event_key = $1`,
    [retryEvent, JSON.stringify(retryPayload)],
  );
  const retryResult = acceptancePushTransport === 'memory' ? await waitFor('controlled retry recovery', async () => {
    const row = (await pool.query(
      `SELECT status, attempt_count FROM notification_outbox WHERE event_key = $1`,
      [retryEvent],
    )).rows[0];
    return row?.status === 'sent' && row.attempt_count === 2 ? row : null;
  }) : { attempt_count: 0 };
  const retryAttempts = acceptancePushTransport === 'memory' ? await pool.query(
    `SELECT outcome FROM notification_delivery_attempts AS attempt
     JOIN notification_outbox AS outbox ON outbox.id = attempt.outbox_id
     WHERE outbox.event_key = $1 ORDER BY attempt.attempt_number`,
    [retryEvent],
  ) : { rows: [] };
  if (acceptancePushTransport === 'memory') {
    assert.deepEqual(retryAttempts.rows.map((row) => row.outcome), ['retry', 'sent']);
  }

  await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-activate` },
    body: { status: 'active' },
  });
  const completed = await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-complete` },
    body: { status: 'completed' },
  });
  assert.equal(completed.value.booking.workflowStatus, 'completed');
  await api(`/listings/${listingId}`, {
    method: 'DELETE',
    token: users.owner.token,
    expected: [204],
  });

  await waitFor('notification queue drain', async () => {
    const row = (await pool.query(
      `SELECT count(*)::int AS pending
       FROM notification_outbox WHERE status IN ('pending', 'retry', 'processing')`,
    )).rows[0];
    return row.pending === 0 ? row : null;
  }, { timeoutMs: 30_000 });

  const attachmentStorageNames = [
    attachment.storageName,
    sent.value.message.attachments[0].thumbnailStorageName,
  ];
  if (acceptanceUploadDir) {
    for (const storageName of attachmentStorageNames) {
      assert.equal(existsSync(resolve(acceptanceUploadDir, storageName)), true);
    }
  }

  const blockedDeletion = await api('/account/deletion-preflight', { token: users.owner.token });
  assert.equal(blockedDeletion.value.canDelete, false);
  assert.deepEqual(
    blockedDeletion.value.blockers.map((blocker) => `${blocker.id}:${blocker.count}`),
    ['open_reports:1'],
  );
  const closedSyntheticReport = await pool.query(
    `UPDATE reports
     SET status = 'closed', closed_at = now(),
         resolution = '{"outcome":"synthetic_acceptance_completed"}'::jsonb
     WHERE id = $1 AND reporter_id = $2 AND status = 'open'
     RETURNING id`,
    [reported.value.report.id, users.owner.id],
  );
  assert.equal(closedSyntheticReport.rowCount, 1);

  for (const user of [users.outsider, users.renter, users.owner]) {
    const preflight = await api('/account/deletion-preflight', { token: user.token });
    assert.equal(preflight.value.canDelete, true);
    const deletion = await api('/account/deletion', {
      method: 'POST',
      token: user.token,
      body: { currentPassword: password },
    });
    assert.deepEqual(deletion.value, { deleted: true });
  }

  const cleanup = await pool.query(
    `SELECT
       count(*) FILTER (WHERE account_status = 'closed')::int AS closed_users,
       count(*) FILTER (WHERE account_status = 'active')::int AS active_users
     FROM users WHERE id = ANY($1::text[])`,
    [Object.values(users).map((user) => user.id)],
  );
  assert.deepEqual(cleanup.rows[0], { closed_users: 3, active_users: 0 });
  const erasedUploads = await pool.query(
    `SELECT count(*)::int AS count FROM uploads
     WHERE storage_name = ANY($1::text[]) OR thumbnail_storage_name = ANY($1::text[])`,
    [attachmentStorageNames],
  );
  assert.equal(erasedUploads.rows[0].count, 0);
  if (acceptanceUploadDir) {
    for (const storageName of attachmentStorageNames) {
      assert.equal(existsSync(resolve(acceptanceUploadDir, storageName)), false);
    }
  }
  const catalog = await api(`/listings?q=${encodeURIComponent(runId)}`);
  assert.deepEqual(catalog.value.listings, []);
  const queueHealth = (await pool.query(
    `SELECT
       count(*) FILTER (WHERE status IN ('pending', 'retry', 'processing'))::int AS pending,
       count(*) FILTER (WHERE status = 'dead')::int AS dead
     FROM notification_outbox`,
  )).rows[0];
  assert.deepEqual(queueHealth, { pending: 0, dead: 0 });

  const versionResponse = await fetch(`${baseUrl.replace(/\/v1$/, '')}/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  const evidence = {
    status: 'passed',
    block: 'B7',
    runId,
    verifiedAt: new Date().toISOString(),
    releaseCommit: version.commit ?? process.env.APP_COMMIT ?? null,
    image: process.env.APP_COMMIT ?? null,
    bookingId,
    threadId,
    messageId: sent.value.message.id,
    attachmentStorageName: attachment.storageName,
    idempotentMessageRows: messageRows.rows[0].count,
    messageNotifications: messageNotifications.rows[0].count,
    requestedChannels: requestedDelivery.map((row) => `${row.channel}:${row.status}`),
    acceptedChannels: acceptedDelivery.map((row) => `${row.channel}:${row.status}`),
    messageChannels: messageDelivery.map((row) => `${row.channel}:${row.status}`),
    optOutChannels: optOutDelivery.map((row) => `${row.channel}:${row.status}`),
    retry: {
      attempts: retryResult.attempt_count,
      outcomes: retryAttempts.rows.map((row) => row.outcome),
    },
    privateAttachment: 'participant-only',
    outsiderAccess: 'denied',
    reportAndBlock: 'passed',
    deletionBlockedByOpenReport: 'passed',
    generatedImageErasure: acceptanceUploadDir ? 'database-and-filesystem-passed' : 'database-passed',
    deepLinkFallbacks: 'booking-chat-invalid-expired-passed',
    cleanup: cleanup.rows[0],
    queue: queueHealth,
    pushTransport: acceptancePushTransport,
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

try {
  await main();
} finally {
  await pool.end();
}
