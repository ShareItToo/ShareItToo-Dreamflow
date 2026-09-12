import crypto from 'node:crypto';

import { config } from './config.js';
import { inTransaction, pool } from './db.js';
import { sendTransactionalEmail } from './mailer.js';
import { sendPushToUser } from './push_sender.js';

const BOOKING_NOTIFICATION_DEFINITIONS = Object.freeze({
  requested: {
    recipients: ['owner'],
    kind: 'booking_requested',
    category: 'rentals',
    title: 'Neue Buchungsanfrage',
    body: ({ itemTitle }) => `Für „${itemTitle}“ ist eine neue Buchungsanfrage eingegangen.`,
  },
  accepted: {
    recipients: ['renter'],
    kind: 'booking_accepted',
    category: 'bookings',
    title: 'Anfrage angenommen',
    body: ({ itemTitle }) => `Deine Anfrage für „${itemTitle}“ wurde angenommen.`,
  },
  payment_pending: {
    recipients: ['renter'],
    kind: 'booking_accepted',
    category: 'payments',
    title: 'Zahlung erforderlich',
    body: ({ itemTitle }) => `Für „${itemTitle}“ wartet die Buchung auf die Zahlung.`,
  },
  confirmed: {
    recipients: ['owner', 'renter'],
    kind: 'booking_confirmed',
    category: 'bookings',
    title: 'Buchung bestätigt',
    body: ({ itemTitle }) => `Die Buchung für „${itemTitle}“ ist bestätigt.`,
  },
  active: {
    recipients: ['owner', 'renter'],
    kind: 'booking_active',
    category: 'handover',
    title: 'Miete gestartet',
    body: ({ itemTitle }) => `Die Miete für „${itemTitle}“ ist jetzt aktiv.`,
  },
  returned: {
    recipients: ['owner', 'renter'],
    kind: 'booking_returned',
    category: 'handover',
    title: 'Rückgabe erfasst',
    body: ({ itemTitle }) => `Die Rückgabe für „${itemTitle}“ wurde erfasst.`,
  },
  completed: {
    recipients: ['owner', 'renter'],
    kind: 'booking_completed',
    category: 'bookings',
    title: 'Buchung abgeschlossen',
    body: ({ itemTitle }) => `Die Buchung für „${itemTitle}“ ist abgeschlossen.`,
  },
  declined: {
    recipients: ['renter'],
    kind: 'booking_declined',
    category: 'bookings',
    title: 'Anfrage abgelehnt',
    body: ({ itemTitle }) => `Die Anfrage für „${itemTitle}“ wurde abgelehnt.`,
  },
  cancelled: {
    recipients: ['owner', 'renter'],
    kind: 'booking_cancelled',
    category: 'bookings',
    title: 'Buchung storniert',
    body: ({ itemTitle }) => `Die Buchung für „${itemTitle}“ wurde storniert.`,
  },
  refunded: {
    recipients: ['renter'],
    kind: 'booking_refunded',
    category: 'payments',
    title: 'Erstattung bestätigt',
    body: ({ itemTitle }) => `Die Erstattung für „${itemTitle}“ wurde bestätigt.`,
  },
  disputed: {
    recipients: ['owner', 'renter'],
    kind: 'booking_disputed',
    category: 'support',
    title: 'Klärung erforderlich',
    body: ({ itemTitle }) => `Für „${itemTitle}“ wurde ein Klärungsfall eröffnet.`,
  },
});

const RETURN_LIFECYCLE_DEFINITIONS = Object.freeze({
  return_confirmation_reminder: {
    title: 'Rückgabebestätigung fehlt',
    body: ({ itemTitle, deadlineLabel }) =>
      `Bitte bestätige die Rückgabe für „${itemTitle}“. Das neutrale Bestätigungsfenster endet ${deadlineLabel}.`,
  },
  return_confirmation_window_closed: {
    title: 'Bestätigungsfenster beendet',
    body: ({ itemTitle }) =>
      `Das neutrale Bestätigungsfenster für „${itemTitle}“ ist beendet. Ohne belegten Fall entsteht keine automatische Prüfung.`,
  },
  return_report_window_closed: {
    title: 'Rückgabefenster beendet',
    body: ({ itemTitle }) =>
      `Das 48-Stunden-Fenster für „${itemTitle}“ ist beendet. Ein nicht belegter Hinweis hält die Abwicklung nicht automatisch an.`,
  },
  return_case_opened: {
    title: 'Klärungsfall eröffnet',
    body: ({ itemTitle }) =>
      `Für „${itemTitle}“ wurde ein substantiierter Klärungsfall eröffnet. Nur der konkret bestrittene bereits autorisierte Betrag darf vorläufig gehalten werden.`,
  },
  return_case_response_due: {
    title: 'Stellungnahme erforderlich',
    body: ({ itemTitle, deadlineLabel }) =>
      `Zu „${itemTitle}“ ist deine Stellungnahme fällig (${deadlineLabel}). Bitte antworte mit überprüfbaren Tatsachen.`,
  },
  return_case_status_update: {
    title: 'Status zum Klärungsfall',
    body: ({ itemTitle, deadlineLabel }) =>
      `Der Klärungsfall zu „${itemTitle}“ ist weiterhin offen. Nächstes begründetes Statusupdate spätestens ${deadlineLabel}.`,
  },
});

function profileName(profile) {
  const name = typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
  return name.slice(0, 120);
}

function itemTitle(payload) {
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  return (title || 'deinen Artikel').slice(0, 240);
}

function eventLabel(row) {
  const start = row.rental_start_date ? String(row.rental_start_date) : '';
  const end = row.rental_end_date ? String(row.rental_end_date) : '';
  return start && end ? `${start} bis ${end}` : '';
}

function bookingActionUrl(bookingId) {
  return `${config.publicBaseUrl}/open/booking/${encodeURIComponent(bookingId)}`;
}

function chatActionUrl(threadId) {
  return `${config.publicBaseUrl}/open/chat/${encodeURIComponent(threadId)}`;
}

function paymentActionUrl(bookingId) {
  return `${config.publicBaseUrl}/open/payment/${encodeURIComponent(bookingId)}`;
}

function germanDeadlineLabel(value, timezone = 'Europe/Berlin') {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(parsed);
}

async function enqueueForUser(client, {
  eventKey,
  userId,
  kind,
  bookingId = null,
  threadId = null,
  channels,
  payload,
}) {
  for (const channel of channels) {
    await client.query(
      `INSERT INTO notification_outbox (
         event_key, user_id, channel, kind, booking_id, thread_id, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (event_key, user_id, channel) DO NOTHING`,
      [eventKey, userId, channel, kind, bookingId, threadId, JSON.stringify(payload)],
    );
  }
}

export async function enqueueBookingNotifications(client, {
  bookingId,
  eventKey,
  workflowStatus,
}) {
  const definition = BOOKING_NOTIFICATION_DEFINITIONS[workflowStatus];
  if (!definition) return 0;
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.simulation_only,
            booking.currency, booking.quoted_total_minor,
            booking.rental_start_date, booking.rental_end_date,
            listing.payload AS listing_payload,
            owner.profile AS owner_profile,
            renter.profile AS renter_profile
     FROM bookings AS booking
     JOIN listings AS listing ON listing.id = booking.listing_id
     JOIN users AS owner ON owner.id = booking.owner_id
     JOIN users AS renter ON renter.id = booking.renter_id
     WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) return 0;
  const row = result.rows[0];
  const simulationOnly = row.simulation_only === true;
  const title = itemTitle(row.listing_payload);
  const actionUrl = bookingActionUrl(bookingId);
  let count = 0;
  for (const role of definition.recipients) {
    const userId = role === 'owner' ? row.owner_id : row.renter_id;
    const displayName = profileName(role === 'owner' ? row.owner_profile : row.renter_profile);
    const notificationBody = simulationOnly
      ? `Pilot-Simulation: ${definition.body({ itemTitle: title })} Es entstehen kein Vertrag, keine Reservierung und keine Zahlung.`
      : definition.body({ itemTitle: title });
    const notificationTitle = simulationOnly
      ? `Pilot-Simulation · ${definition.title}`
      : definition.title;
    const payload = {
      notification: {
        category: definition.category,
        kind: definition.kind,
        priority: ['support', 'payments'].includes(definition.category) ? 3 : 2,
        title: notificationTitle,
        body: notificationBody,
        entityType: 'booking',
        entityId: bookingId,
        bookingId,
        requestId: bookingId,
        actionUrl,
        ctaLabel: role === 'owner' ? 'Zur Vermietung' : 'Zur Buchung',
        payload: { role, workflowStatus, simulationOnly },
      },
      email: {
        displayName,
        bookingReference: bookingId,
        itemTitle: title,
        amount: Number(row.quoted_total_minor ?? 0) / 100,
        currency: row.currency ?? 'EUR',
        eventLabel: eventLabel(row),
        actionUrl,
      },
    };
    await enqueueForUser(client, {
      eventKey,
      userId,
      kind: definition.kind,
      bookingId,
      channels: simulationOnly ? ['in_app', 'push'] : ['in_app', 'email', 'push'],
      payload,
    });
    count += 1;
  }
  return count;
}

export async function enqueueV51WithdrawalNotifications(client, {
  bookingId,
  withdrawalId,
  eventKey,
  phase,
  returnRequired,
  manualReviewRequired = false,
}) {
  const result = await client.query(
    `SELECT booking.owner_id, booking.renter_id,
            listing.payload AS listing_payload,
            owner.profile AS owner_profile,
            renter.profile AS renter_profile
       FROM bookings AS booking
       JOIN listings AS listing ON listing.id = booking.listing_id
       JOIN users AS owner ON owner.id = booking.owner_id
       JOIN users AS renter ON renter.id = booking.renter_id
      WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) return 0;
  const row = result.rows[0];
  const title = itemTitle(row.listing_payload);
  const actionUrl = bookingActionUrl(bookingId);
  const ownerBody = manualReviewRequired
    ? `Eine Widerrufserklärung zu „${title}“ ist nach dem garantierten 14-Tage-Fenster eingegangen und wird auf mögliche längere Rechte geprüft. Buchung und Geldstatus bleiben unverändert.`
    : phase === 'before_handover'
    ? `Der SIT-Plattformvertrag zu „${title}“ wurde widerrufen. Die Buchung ist beendet; Mietpreis und SIT-Gebühr werden getrennt abgewickelt.`
    : `Der SIT-Plattformvertrag zu „${title}“ wurde widerrufen. ${returnRequired ? 'Die dokumentierte Rückgabe ist jetzt erforderlich.' : 'Die bestätigte Rückgabe wird zeitanteilig abgerechnet.'}`;
  const renterBody = manualReviewRequired
    ? `Deine Erklärung zu „${title}“ ist eingegangen. Mögliche längere gesetzliche Rechte werden geprüft; bis dahin wurden Buchung und Erstattungen nicht automatisch verändert.`
    : phase === 'before_handover'
    ? `Dein Widerruf zu „${title}“ ist eingegangen. Die Buchung wurde kostenfrei beendet und beide Erstattungen wurden getrennt vorgemerkt.`
    : `Dein Widerruf zu „${title}“ ist eingegangen. ${returnRequired ? 'Bitte schließe jetzt die dokumentierte Rückgabe ab.' : 'Die zeitanteilige Mietpreiserstattung und die vollständige SIT-Gebührenerstattung wurden getrennt vorgemerkt.'}`;
  for (const [role, userId, body, profile] of [
    ['owner', row.owner_id, ownerBody, row.owner_profile],
    ['renter', row.renter_id, renterBody, row.renter_profile],
  ]) {
    await enqueueForUser(client, {
      eventKey,
      userId,
      kind: 'platform_withdrawal_received',
      bookingId,
      channels: ['in_app', 'email', 'push'],
      payload: {
        notification: {
          category: 'bookings',
          kind: 'platform_withdrawal_received',
          priority: 3,
          title: 'Vertragswiderruf eingegangen',
          body,
          entityType: 'booking',
          entityId: bookingId,
          bookingId,
          requestId: bookingId,
          actionUrl,
          ctaLabel: role === 'owner' ? 'Zur Vermietung' : 'Zur Buchung',
          payload: {
            role,
            withdrawalId,
            phase,
            returnRequired,
            manualReviewRequired,
          },
        },
        email: {
          displayName: profileName(profile),
          bookingReference: bookingId,
          itemTitle: title,
          actionUrl,
          withdrawalId,
          phase,
          returnRequired,
          manualReviewRequired,
        },
      },
    });
  }
  return 2;
}

export async function enqueueReturnLifecycleNotification(client, {
  bookingId,
  eventKey,
  kind,
  recipientRoles,
  deadline = null,
}) {
  const definition = RETURN_LIFECYCLE_DEFINITIONS[kind];
  if (!definition) return 0;
  const roles = [...new Set(Array.isArray(recipientRoles) ? recipientRoles : [])]
    .filter((role) => role === 'owner' || role === 'renter');
  if (roles.length === 0) return 0;
  const result = await client.query(
    `SELECT booking.owner_id, booking.renter_id,
            booking.rental_start_date, booking.rental_end_date,
            booking.rental_timezone,
            listing.payload AS listing_payload,
            owner.profile AS owner_profile,
            renter.profile AS renter_profile
       FROM bookings AS booking
       JOIN listings AS listing ON listing.id = booking.listing_id
       JOIN users AS owner ON owner.id = booking.owner_id
       JOIN users AS renter ON renter.id = booking.renter_id
      WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) return 0;
  const row = result.rows[0];
  const title = itemTitle(row.listing_payload);
  const actionUrl = bookingActionUrl(bookingId);
  const deadlineLabel = germanDeadlineLabel(
    deadline,
    row.rental_timezone ?? 'Europe/Berlin',
  );
  let count = 0;
  for (const role of roles) {
    const userId = role === 'owner' ? row.owner_id : row.renter_id;
    const profile = role === 'owner' ? row.owner_profile : row.renter_profile;
    const body = definition.body({ itemTitle: title, deadlineLabel });
    await enqueueForUser(client, {
      eventKey,
      userId,
      kind,
      bookingId,
      channels: ['in_app', 'email', 'push'],
      payload: {
        notification: {
          category: 'handover',
          kind,
          priority: kind.startsWith('return_case_') ? 3 : 2,
          title: definition.title,
          body,
          entityType: 'booking',
          entityId: bookingId,
          bookingId,
          requestId: bookingId,
          actionUrl,
          ctaLabel: kind.startsWith('return_case_') ? 'Fall öffnen' : 'Rückgabe öffnen',
          payload: { role, deadline: deadline ? new Date(deadline).toISOString() : null },
        },
        email: {
          displayName: profileName(profile),
          bookingReference: bookingId,
          itemTitle: title,
          eventLabel: deadlineLabel || eventLabel(row),
          actionUrl,
        },
      },
    });
    count += 1;
  }
  return count;
}

export async function enqueueMessageNotification(client, {
  messageId,
  threadId,
  bookingId,
  recipientId,
  item,
}) {
  const title = itemTitle({ title: item });
  const actionUrl = chatActionUrl(threadId);
  const eventKey = `message:${messageId}`;
  const body = `Du hast eine neue Nachricht zu „${title}“ erhalten.`;
  await enqueueForUser(client, {
    eventKey,
    userId: recipientId,
    kind: 'message_received',
    bookingId,
    threadId,
    channels: ['in_app', 'push'],
    payload: {
      notification: {
        category: 'messages',
        kind: 'message_received',
        priority: 2,
        title: 'Neue Nachricht',
        body,
        entityType: 'thread',
        entityId: threadId,
        bookingId,
        requestId: bookingId,
        threadId,
        actionUrl,
        ctaLabel: 'Chat öffnen',
        payload: {},
      },
    },
  });
}

export async function enqueueFinancialNotification(client, {
  bookingId,
  eventKey,
  kind,
  recipientRole,
  amountMinor,
  currency,
}) {
  const definitions = {
    payment_confirmed: {
      title: 'Zahlung bestätigt',
      body: (title) => `Die Zahlung für „${title}“ wurde sicher bestätigt.`,
      ctaLabel: 'Zahlung ansehen',
    },
    booking_refunded: {
      title: 'Erstattung bestätigt',
      body: (title) => `Die Erstattung für „${title}“ wurde veranlasst.`,
      ctaLabel: 'Erstattung ansehen',
    },
    payout_sent: {
      title: 'Auszahlung freigegeben',
      body: (title) => `Der Erlös für „${title}“ wurde an dein bestätigtes Auszahlungskonto übertragen.`,
      ctaLabel: 'Auszahlung ansehen',
    },
    payment_failed: {
      title: 'Zahlung nicht abgeschlossen',
      body: (title) => `Die Zahlung für „${title}“ benötigt deine Aufmerksamkeit.`,
      ctaLabel: 'Zahlung fortsetzen',
    },
  };
  const definition = definitions[kind];
  if (!definition) return 0;
  const result = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.rental_start_date, booking.rental_end_date,
            listing.payload AS listing_payload,
            owner.profile AS owner_profile,
            renter.profile AS renter_profile
     FROM bookings AS booking
     JOIN listings AS listing ON listing.id = booking.listing_id
     JOIN users AS owner ON owner.id = booking.owner_id
     JOIN users AS renter ON renter.id = booking.renter_id
     WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) return 0;
  const row = result.rows[0];
  const userId = recipientRole === 'owner' ? row.owner_id : row.renter_id;
  const displayName = profileName(recipientRole === 'owner' ? row.owner_profile : row.renter_profile);
  const title = itemTitle(row.listing_payload);
  const actionUrl = paymentActionUrl(bookingId);
  const body = definition.body(title);
  await enqueueForUser(client, {
    eventKey,
    userId,
    kind,
    bookingId,
    channels: kind === 'payment_failed'
      ? ['in_app', 'push']
      : ['in_app', 'email', 'push'],
    payload: {
      notification: {
        category: 'payments',
        kind,
        priority: 3,
        title: definition.title,
        body,
        entityType: 'payment',
        entityId: bookingId,
        bookingId,
        requestId: bookingId,
        actionUrl,
        ctaLabel: definition.ctaLabel,
        payload: { recipientRole },
      },
      email: {
        displayName,
        bookingReference: bookingId,
        itemTitle: title,
        amount: Number(amountMinor ?? 0) / 100,
        currency,
        eventLabel: eventLabel(row),
        actionUrl,
      },
    },
  });
  return 1;
}

async function userDeliveryContext(userId) {
  const result = await pool.query(
    `SELECT user_account.email, user_account.account_status,
            COALESCE(pref.in_app_enabled, true) AS in_app_enabled,
            COALESCE(pref.email_enabled, true) AS email_enabled,
            COALESCE(pref.push_enabled, true) AS push_enabled,
            COALESCE(pref.message_push_enabled, true) AS message_push_enabled,
            COALESCE(pref.booking_push_enabled, true) AS booking_push_enabled
     FROM users AS user_account
     LEFT JOIN notification_preferences AS pref ON pref.user_id = user_account.id
     WHERE user_account.id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

function channelEnabled(row, context) {
  if (!context || context.account_status !== 'active') return false;
  if (row.channel === 'in_app') return context.in_app_enabled;
  if (row.channel === 'email') return context.email_enabled;
  if (row.channel === 'push') {
    if (!context.push_enabled) return false;
    return row.kind === 'message_received'
      ? context.message_push_enabled
      : context.booking_push_enabled;
  }
  return false;
}

async function deliverClaim(row) {
  const context = await userDeliveryContext(row.user_id);
  if (!channelEnabled(row, context)) {
    return { outcome: 'suppressed', provider: 'preference', providerMessageId: null, metadata: {} };
  }
  const payload = row.payload ?? {};
  if (row.channel === 'in_app') {
    const notification = payload.notification ?? {};
    const result = await pool.query(
      `INSERT INTO notifications (
         event_key, user_id, category, kind, priority, title, body,
         entity_type, entity_id, booking_id, thread_id, action_url, payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
       ) ON CONFLICT (event_key, user_id) DO NOTHING
       RETURNING id`,
      [
        row.event_key,
        row.user_id,
        notification.category,
        row.kind,
        notification.priority ?? 1,
        notification.title,
        notification.body,
        notification.entityType ?? null,
        notification.entityId ?? null,
        row.booking_id,
        row.thread_id,
        notification.actionUrl ?? null,
        JSON.stringify({
          ...(notification.payload ?? {}),
          requestId: notification.requestId ?? null,
          ctaLabel: notification.ctaLabel ?? null,
        }),
      ],
    );
    return {
      outcome: 'sent',
      provider: 'postgres',
      providerMessageId: result.rows[0]?.id ?? null,
      metadata: { replayed: !result.rowCount },
    };
  }
  if (row.channel === 'email') {
    const info = await sendTransactionalEmail({
      email: context.email,
      kind: row.kind,
      ...(payload.email ?? {}),
    });
    return {
      outcome: 'sent',
      provider: config.mail.transport,
      providerMessageId: typeof info?.messageId === 'string' ? info.messageId : null,
      metadata: {},
    };
  }
  const result = await sendPushToUser(pool, {
    userId: row.user_id,
    eventKey: row.event_key,
    kind: row.kind,
  });
  return {
    outcome: result.outcome,
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    metadata: {
      deviceCount: result.deviceCount ?? 0,
      invalidDeviceCount: result.invalidDeviceCount ?? 0,
      failedDeviceCount: result.failedDeviceCount ?? 0,
      ttlSeconds: result.ttlSeconds,
      contractVersion: result.contractVersion,
    },
  };
}

async function claimNext(workerId) {
  return inTransaction(async (client) => {
    await client.query(
      `UPDATE notification_outbox
       SET status = 'retry', locked_at = NULL, locked_by = NULL,
           last_error_code = COALESCE(last_error_code, 'stale_worker_lock')
       WHERE status = 'processing' AND locked_at < now() - interval '5 minutes'`,
    );
    const result = await client.query(
      `SELECT * FROM notification_outbox
       WHERE status IN ('pending', 'retry') AND not_before <= now()
       ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    await client.query(
      `UPDATE notification_outbox
       SET status = 'processing', locked_at = now(), locked_by = $2,
           attempt_count = attempt_count + 1
       WHERE id = $1`,
      [row.id, workerId],
    );
    return { ...row, attempt_count: Number(row.attempt_count) + 1 };
  });
}

async function finishAttempt(row, result) {
  await inTransaction(async (client) => {
    const status = result.outcome === 'suppressed' ? 'suppressed' : 'sent';
    await client.query(
      `UPDATE notification_outbox
       SET status = $2, sent_at = now(), provider_message_id = $3,
           locked_at = NULL, locked_by = NULL, last_error_code = NULL
       WHERE id = $1`,
      [row.id, status, result.providerMessageId],
    );
    await client.query(
      `INSERT INTO notification_delivery_attempts (
         outbox_id, attempt_number, channel, outcome, provider,
         provider_message_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        row.id,
        row.attempt_count,
        row.channel,
        result.outcome,
        result.provider,
        result.providerMessageId,
        JSON.stringify(result.metadata ?? {}),
      ],
    );
  });
}

async function failAttempt(row, error) {
  const errorCode = String(error?.code ?? error?.message ?? 'notification_delivery_failed').slice(0, 240);
  const dead = row.attempt_count >= config.notifications.maxAttempts;
  const delaySeconds = Math.min(3600, 2 ** Math.min(10, row.attempt_count) * 5);
  await inTransaction(async (client) => {
    await client.query(
      `UPDATE notification_outbox
       SET status = $2, not_before = now() + ($3 * interval '1 second'),
           locked_at = NULL, locked_by = NULL, last_error_code = $4
       WHERE id = $1`,
      [row.id, dead ? 'dead' : 'retry', delaySeconds, errorCode],
    );
    await client.query(
      `INSERT INTO notification_delivery_attempts (
         outbox_id, attempt_number, channel, outcome, provider, error_code
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        row.id,
        row.attempt_count,
        row.channel,
        dead ? 'dead' : 'retry',
        row.channel === 'email' ? config.mail.transport : (row.channel === 'push' ? config.push.transport : 'postgres'),
        errorCode,
      ],
    );
  });
}

let draining = null;

export function drainNotificationOutbox({ limit = config.notifications.batchSize } = {}) {
  if (draining) return draining;
  draining = (async () => {
    const workerId = `worker:${crypto.randomUUID()}`;
    let processed = 0;
    while (processed < limit) {
      const row = await claimNext(workerId);
      if (!row) break;
      try {
        await finishAttempt(row, await deliverClaim(row));
      } catch (error) {
        await failAttempt(row, error);
      }
      processed += 1;
    }
    return processed;
  })().finally(() => {
    draining = null;
  });
  return draining;
}

export async function notificationHealth() {
  const result = await pool.query(
    `SELECT
       count(*) FILTER (WHERE status IN ('pending', 'retry'))::int AS pending,
       count(*) FILTER (WHERE status = 'dead')::int AS dead,
       min(created_at) FILTER (WHERE status IN ('pending', 'retry')) AS oldest_pending
     FROM notification_outbox`,
  );
  return {
    pending: result.rows[0]?.pending ?? 0,
    dead: result.rows[0]?.dead ?? 0,
    oldestPending: result.rows[0]?.oldest_pending
      ? new Date(result.rows[0].oldest_pending).toISOString()
      : null,
  };
}
