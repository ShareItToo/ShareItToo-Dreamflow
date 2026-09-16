import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { config } from './config.js';
import { validateFirebaseServiceAccount } from './firebase_service_account.js';

function pushError(code, cause = undefined) {
  const error = new Error(code, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function safePushText(value, maxLength) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maxLength) throw pushError('push_payload_invalid');
  return normalized;
}

export const V52_PUSH_CONTRACT_VERSION = 'v52';
export const V52_PUSH_TITLE = 'Neue ShareItToo-Aktualisierung';
export const V52_PUSH_BODY = 'In der App ansehen.';

// TTLs are intentionally short and event-specific. No approved event may fall
// back to FCM's four-week default. Detail is always loaded from the
// authenticated SIT notification API after the app opens.
const TRANSACTIONAL_PUSH_TTL_SECONDS = Object.freeze({
  message_received: 15 * 60,
  booking_requested: 60 * 60,
  booking_accepted: 60 * 60,
  booking_confirmed: 60 * 60,
  booking_active: 60 * 60,
  booking_returned: 60 * 60,
  payment_failed: 60 * 60,
  return_confirmation_reminder: 60 * 60,
  return_case_response_due: 60 * 60,
  support_case_update: 60 * 60,
  platform_withdrawal_received: 6 * 60 * 60,
  return_case_opened: 6 * 60 * 60,
  booking_completed: 24 * 60 * 60,
  booking_declined: 24 * 60 * 60,
  booking_cancelled: 24 * 60 * 60,
  booking_refunded: 24 * 60 * 60,
  booking_disputed: 24 * 60 * 60,
  payment_confirmed: 24 * 60 * 60,
  payout_sent: 24 * 60 * 60,
  return_confirmation_window_closed: 24 * 60 * 60,
  return_report_window_closed: 24 * 60 * 60,
  return_case_status_update: 24 * 60 * 60,
});

export function transactionalPushContractForTest(kind) {
  const safeKind = safePushText(kind, 120);
  const ttlSeconds = TRANSACTIONAL_PUSH_TTL_SECONDS[safeKind];
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw pushError('push_kind_not_allowlisted');
  }
  return Object.freeze({
    kind: safeKind,
    title: V52_PUSH_TITLE,
    body: V52_PUSH_BODY,
    data: Object.freeze({
      contract: V52_PUSH_CONTRACT_VERSION,
      route: 'notifications',
    }),
    ttlSeconds,
  });
}

let messagingClientPromise;

async function fcmMessagingClient() {
  if (!messagingClientPromise) {
    const initialization = (async () => {
      let serviceAccount;
      try {
        serviceAccount = validateFirebaseServiceAccount(
          await fs.readFile(config.push.firebaseServiceAccountFile, 'utf8'),
          config.push.firebaseProjectId,
        );
      } catch (error) {
        throw pushError('push_fcm_credentials_invalid', error);
      }
      const app = getApps().find((candidate) => candidate.name === 'shareittoo-push') ??
        initializeApp({
          credential: cert(serviceAccount),
          projectId: config.push.firebaseProjectId,
        }, 'shareittoo-push');
      return getMessaging(app);
    })();
    messagingClientPromise = initialization.catch((error) => {
      messagingClientPromise = undefined;
      throw error;
    });
  }
  return messagingClientPromise;
}

export function buildFcmMessageForTest(device, kind, { nowMs = Date.now() } = {}) {
  const payload = transactionalPushContractForTest(kind);
  if (!Number.isFinite(nowMs) || nowMs < 0) throw pushError('push_payload_invalid');
  const expiration = Math.floor(nowMs / 1000) + payload.ttlSeconds;
  return {
    token: device.token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
    android: {
      priority: 'high',
      ttl: payload.ttlSeconds * 1000,
      notification: {
        icon: 'ic_stat_shareittoo_v2',
        sound: 'default',
        clickAction: 'com.shareittoo.app.SIT_NOTIFICATION_CLICK',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-expiration': String(expiration),
      },
      payload: {
        aps: {
          sound: 'default',
          category: 'SIT_TRANSACTIONAL_UPDATE',
        },
      },
    },
  };
}

const invalidFcmTokenErrorCodes = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

export function isInvalidFcmTokenErrorForTest(error) {
  return invalidFcmTokenErrorCodes.has(error?.code);
}

async function sendWithFcm(client, devices, kind, userId) {
  const messaging = await fcmMessagingClient();
  const contract = transactionalPushContractForTest(kind);
  const invalidHashes = [];
  const messageIds = [];
  let transientFailureCount = 0;
  for (let index = 0; index < devices.length; index += 500) {
    const batch = devices.slice(index, index + 500);
    let result;
    try {
      result = await messaging.sendEach(
        batch.map((device) => buildFcmMessageForTest(device, contract.kind)),
      );
    } catch (error) {
      throw pushError('push_fcm_unavailable', error);
    }
    result.responses.forEach((response, responseIndex) => {
      if (response.success) {
        if (response.messageId) messageIds.push(response.messageId);
        return;
      }
      if (isInvalidFcmTokenErrorForTest(response.error)) {
        invalidHashes.push(batch[responseIndex].token_hash);
      } else {
        transientFailureCount += 1;
      }
    });
  }
  if (invalidHashes.length) {
    await client.query(
      `UPDATE push_devices SET enabled = false
       WHERE user_id = $1 AND token_hash = ANY($2::text[])`,
      [userId, invalidHashes],
    );
  }
  if (!messageIds.length && transientFailureCount > 0) {
    throw pushError('push_fcm_unavailable');
  }
  return {
    outcome: messageIds.length ? 'sent' : 'suppressed',
    provider: 'fcm',
    deviceCount: devices.length,
    providerMessageId: messageIds[0] ?? null,
    invalidDeviceCount: invalidHashes.length,
    failedDeviceCount: transientFailureCount,
    ttlSeconds: contract.ttlSeconds,
    contractVersion: V52_PUSH_CONTRACT_VERSION,
  };
}

export async function sendPushToUser(client, {
  userId,
  eventKey,
  kind,
}) {
  const payload = transactionalPushContractForTest(kind);
  const devices = await client.query(
    `SELECT id, platform, token, token_hash, locale
     FROM push_devices
     WHERE user_id = $1 AND enabled = true
     ORDER BY last_seen_at DESC`,
    [userId],
  );
  if (config.push.transport === 'disabled') {
    return {
      outcome: 'suppressed',
      provider: 'disabled',
      deviceCount: devices.rowCount,
      ttlSeconds: payload.ttlSeconds,
      contractVersion: V52_PUSH_CONTRACT_VERSION,
    };
  }
  if (!devices.rowCount) {
    return {
      outcome: 'suppressed',
      provider: config.push.transport,
      deviceCount: 0,
      ttlSeconds: payload.ttlSeconds,
      contractVersion: V52_PUSH_CONTRACT_VERSION,
    };
  }

  const safeEventKey = safePushText(eventKey, 240);

  if (config.push.transport === 'memory') {
    return {
      outcome: 'sent',
      provider: 'memory',
      deviceCount: devices.rowCount,
      providerMessageId: `memory:${crypto.createHash('sha256').update(safeEventKey).digest('hex').slice(0, 24)}`,
      ttlSeconds: payload.ttlSeconds,
      contractVersion: V52_PUSH_CONTRACT_VERSION,
    };
  }

  if (config.push.transport === 'fcm') {
    return sendWithFcm(client, devices.rows, payload.kind, userId);
  }

  let response;
  try {
    response = await fetch(config.push.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.push.webhookToken
          ? { Authorization: `Bearer ${config.push.webhookToken}` }
          : {}),
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: payload.data,
        ttlSeconds: payload.ttlSeconds,
        contractVersion: V52_PUSH_CONTRACT_VERSION,
        devices: devices.rows.map((device) => ({
          platform: device.platform,
          token: device.token,
          tokenHash: device.token_hash,
          locale: device.locale,
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw pushError('push_webhook_unavailable', error);
  }
  if (!response.ok) throw pushError(`push_webhook_http_${response.status}`);

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  const invalidHashes = Array.isArray(result.invalidTokenHashes)
    ? result.invalidTokenHashes.filter((value) => /^[0-9a-f]{64}$/.test(String(value)))
    : [];
  if (invalidHashes.length) {
    await client.query(
      `UPDATE push_devices SET enabled = false
       WHERE user_id = $1 AND token_hash = ANY($2::text[])`,
      [userId, invalidHashes],
    );
  }
  return {
    outcome: 'sent',
    provider: 'webhook',
    deviceCount: devices.rowCount,
    providerMessageId: typeof result.messageId === 'string'
      ? result.messageId.slice(0, 500)
      : null,
    invalidDeviceCount: invalidHashes.length,
    ttlSeconds: payload.ttlSeconds,
    contractVersion: V52_PUSH_CONTRACT_VERSION,
  };
}
