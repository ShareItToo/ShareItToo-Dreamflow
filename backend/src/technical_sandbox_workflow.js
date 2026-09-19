import crypto from 'node:crypto';

import { config } from './config.js';
import { inTransaction, pool } from './db.js';
import { PaymentDomainError } from './payment_domain.js';
import { StripeProvider } from './stripe_provider.js';
import { technicalSandboxUserAllowed } from './technical_sandbox_config.js';

export const technicalSandboxFlow = 'technical_sandbox';
const technicalSandboxEventTypes = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'payment_intent.succeeded',
]);

export class TechnicalSandboxError extends PaymentDomainError {}

export const technicalSandboxProvider = new StripeProvider({
  mode: config.technicalSandbox.available ? 'stripe' : 'disabled',
  secretKey: config.technicalSandbox.secretKey,
  apiVersion: config.technicalSandbox.apiVersion,
  livemode: false,
});

function fail(status, code, details = undefined) {
  throw new TechnicalSandboxError(status, code, details);
}

function text(value, maximum = 255) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nowDate(value) {
  const parsed = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(parsed.getTime())) fail(400, 'technical_sandbox_time_invalid');
  return parsed;
}

function actorId(actor) {
  const value = text(actor?.id, 160);
  if (!value) fail(401, 'authentication_required');
  return value;
}

function idempotencyKey(raw) {
  const value = text(raw, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,159}$/u.test(value)) {
    fail(400, 'technical_sandbox_idempotency_key_invalid');
  }
  return value;
}

function assertAvailable(userId, configuration, now = new Date()) {
  if (!configuration?.available || configuration.killSwitch) {
    fail(503, 'technical_sandbox_unavailable');
  }
  if (configuration.provider !== 'stripe'
      || configuration.mode !== 'test'
      || configuration.amountMinor !== 100
      || configuration.currency !== 'EUR'
      || configuration.maxRunsPerUser24h !== 3
      || configuration.syntheticEmailDomain !== 'example.invalid'
      || !/^acct_[A-Za-z0-9]+$/u.test(configuration.expectedAccountId ?? '')) {
    fail(503, 'technical_sandbox_configuration_invalid');
  }
  if (!technicalSandboxUserAllowed(userId, configuration)) {
    fail(403, 'technical_sandbox_user_forbidden');
  }
  if (configuration.authorizationExpiresAt <= now) {
    fail(503, 'technical_sandbox_authorization_expired');
  }
}

export function technicalSandboxCapabilitiesFor(userId, configuration = config.technicalSandbox) {
  const eligible = technicalSandboxUserAllowed(userId, configuration);
  const available = configuration?.available === true
    && configuration.killSwitch !== true
    && eligible
    && configuration.authorizationExpiresAt > new Date();
  return Object.freeze({
    technicalSandboxAvailable: available,
    provider: 'stripe',
    mode: available ? 'test' : 'disabled',
    professionalReview: false,
    amountMinor: 100,
    currency: 'EUR',
    maxRunsPerUser24h: 3,
    syntheticOnly: true,
    liveMoney: false,
    bookingEffect: false,
    ledgerEffect: false,
    connectEffect: false,
  });
}

export function technicalSandboxConfigRevision(configuration = config.technicalSandbox) {
  return payloadHash(canonical({
    available: configuration.available,
    killSwitch: configuration.killSwitch,
    provider: configuration.provider,
    mode: configuration.mode,
    amountMinor: configuration.amountMinor,
    currency: configuration.currency,
    maxRunsPerUser24h: configuration.maxRunsPerUser24h,
    expectedAccountId: configuration.expectedAccountId,
    authorizationId: configuration.authorizationId,
    authorizationExpiresAt: configuration.authorizationExpiresAt?.toISOString?.() ?? null,
    allowlistedUserIds: [...(configuration.allowlistedUserIds ?? [])].sort(),
    syntheticEmailDomain: configuration.syntheticEmailDomain,
    apiVersion: configuration.apiVersion,
  }));
}

export function technicalSandboxRequestFingerprint({
  userId,
  configuration = config.technicalSandbox,
}) {
  return payloadHash(canonical({
    flow: technicalSandboxFlow,
    userId,
    amountMinor: configuration.amountMinor,
    currency: configuration.currency,
    authorizationId: configuration.authorizationId,
    configRevision: technicalSandboxConfigRevision(configuration),
  }));
}

export function syntheticTechnicalSandboxEmail(userId, configuration = config.technicalSandbox) {
  const digest = payloadHash(String(userId)).slice(0, 20);
  return `technical-sandbox+${digest}@${configuration.syntheticEmailDomain}`;
}

function expectedMetadata({ runId, userId, configuration }) {
  return {
    sit_flow: technicalSandboxFlow,
    technical_sandbox_run_id: runId,
    technical_sandbox_user_id: userId,
    technical_sandbox_authorization_id: configuration.authorizationId,
    technical_sandbox_config_revision: technicalSandboxConfigRevision(configuration),
  };
}

function metadataMatches(metadata, expected) {
  return metadata && Object.entries(expected).every(([key, value]) => metadata[key] === value);
}

export function validateTechnicalSandboxReceipt({
  session,
  paymentIntent,
  accountId,
  accountLivemode = false,
  runId,
  userId,
  configuration = config.technicalSandbox,
}) {
  const expected = expectedMetadata({ runId, userId, configuration });
  const exactAmount = Number(session?.amount_total) === configuration.amountMinor
    && Number(paymentIntent?.amount) === configuration.amountMinor;
  const exactCurrency = String(session?.currency ?? '').toUpperCase() === configuration.currency
    && String(paymentIntent?.currency ?? '').toUpperCase() === configuration.currency;
  const paymentIntentBinding = (session?.payment_intent?.id ?? session?.payment_intent)
    === paymentIntent?.id;
  const paid = session?.object === 'checkout.session'
    && session?.status === 'complete'
    && session?.payment_status === 'paid'
    && paymentIntent?.object === 'payment_intent'
    && paymentIntent?.status === 'succeeded';
  const valid = accountId === configuration.expectedAccountId
    && accountLivemode === false
    && session?.livemode === false
    && paymentIntent?.livemode === false
    && exactAmount
    && exactCurrency
    && session?.client_reference_id === runId
    && paymentIntentBinding
    && paid
    && metadataMatches(session?.metadata, expected)
    && metadataMatches(paymentIntent?.metadata, expected);
  return Object.freeze({
    valid,
    code: valid ? null : 'technical_sandbox_receipt_not_confirmed',
    amountMinor: valid ? configuration.amountMinor : null,
    currency: valid ? configuration.currency : null,
    runId: valid ? runId : null,
    providerSessionId: valid ? session.id : null,
    providerPaymentIntentId: valid ? paymentIntent.id : null,
  });
}

function providerSessionMetadataValid(session, { runId, userId, configuration }) {
  return session?.object === 'checkout.session'
    && session?.livemode === false
    && session?.id
    && /^https:\/\//u.test(String(session.url ?? ''))
    && session.client_reference_id === runId
    && session.customer_email === syntheticTechnicalSandboxEmail(userId, configuration)
    && Number(session.amount_total) === configuration.amountMinor
    && String(session.currency ?? '').toUpperCase() === configuration.currency
    && metadataMatches(session.metadata, expectedMetadata({ runId, userId, configuration }));
}

function replayBindingMatches(row, { userId, configuration }) {
  const metadata = row?.metadata ?? {};
  return row?.user_id === userId
    && row?.authorization_id === configuration.authorizationId
    && Number(row?.amount_minor) === configuration.amountMinor
    && row?.currency === configuration.currency
    && row?.synthetic_email === syntheticTechnicalSandboxEmail(userId, configuration)
    && metadata.flow === technicalSandboxFlow
    && metadata.configRevision === technicalSandboxConfigRevision(configuration)
    && metadata.requestFingerprint === technicalSandboxRequestFingerprint({ userId, configuration });
}

function publicRun(row, { checkoutUrl = null, receipt = null } = {}) {
  return {
    id: row.id,
    status: row.status,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    checkoutUrl,
    checkoutExpiresAt: row.checkout_expires_at
      ? new Date(row.checkout_expires_at).toISOString()
      : null,
    receipt,
    syntheticOnly: true,
    professionalReview: false,
    bookingEffect: false,
    ledgerEffect: false,
    connectEffect: false,
  };
}

async function reconcileTechnicalSandboxRun({
  row,
  configuration,
  provider,
  databasePool,
  transaction,
}) {
  if (!row.provider_session_id) return publicRun(row);
  let readback;
  try {
    readback = await provider.retrieveTechnicalSandboxCheckout({
      sessionId: row.provider_session_id,
      expectedAccountId: configuration.expectedAccountId,
    });
  } catch {
    return publicRun(row);
  }
  const receipt = validateTechnicalSandboxReceipt({
    session: readback?.session,
    paymentIntent: readback?.paymentIntent,
    accountId: readback?.accountId,
    accountLivemode: readback?.accountLivemode,
    runId: row.id,
    userId: row.user_id,
    configuration,
  });
  if (!receipt.valid) return publicRun(row);
  const updated = await transaction(async (client) => {
    const result = await client.query(
      `UPDATE technical_sandbox_runs
          SET status = 'paid', provider_payment_intent_id = $2,
              provider_account_id = $3, provider_livemode = false,
              provider_session_status = $4, provider_payment_status = $5,
              provider_payment_intent_status = $6, completed_at = COALESCE(completed_at, now()),
              updated_at = now()
        WHERE id = $1 AND user_id = $7
          AND status IN ('pending', 'unknown')
        RETURNING *`,
      [row.id, receipt.providerPaymentIntentId, configuration.expectedAccountId,
        readback.session.status, readback.session.payment_status,
        readback.paymentIntent.status, row.user_id],
    );
    return result.rows[0] ?? row;
  });
  if (updated !== row) return publicRun(updated, { receipt });
  if (row.status === 'paid') return publicRun(row, { receipt });
  return publicRun(row);
}

export async function createTechnicalSandboxCheckout({
  actor,
  key,
  configuration = config.technicalSandbox,
  provider = technicalSandboxProvider,
  databasePool = pool,
  transaction = inTransaction,
  now = new Date(),
  successUrl = `${config.appPublicUrl}/v1/payments/technical-sandbox/success`,
  cancelUrl = `${config.appPublicUrl}/v1/payments/technical-sandbox/cancel`,
}) {
  const userId = actorId(actor);
  const exactNow = nowDate(now);
  assertAvailable(userId, configuration, exactNow);
  const idempotency = idempotencyKey(key);
  const prepared = await transaction(async (client) => {
    let existing = await client.query(
      'SELECT * FROM technical_sandbox_runs WHERE idempotency_key = $1 FOR UPDATE',
      [idempotency],
    );
    if (existing.rowCount) {
      if (existing.rows[0].user_id !== userId) fail(409, 'technical_sandbox_idempotency_conflict');
      if (!replayBindingMatches(existing.rows[0], { userId, configuration })) {
        fail(409, 'technical_sandbox_replay_binding_conflict');
      }
      return { row: existing.rows[0], replayed: true };
    }
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      [`technical_sandbox_user:${userId}`],
    );
    existing = await client.query(
      'SELECT * FROM technical_sandbox_runs WHERE idempotency_key = $1 FOR UPDATE',
      [idempotency],
    );
    if (existing.rowCount) {
      if (existing.rows[0].user_id !== userId) fail(409, 'technical_sandbox_idempotency_conflict');
      if (!replayBindingMatches(existing.rows[0], { userId, configuration })) {
        fail(409, 'technical_sandbox_replay_binding_conflict');
      }
      return { row: existing.rows[0], replayed: true };
    }
    const count = await client.query(
      `SELECT count(*)::int AS count FROM technical_sandbox_runs
        WHERE user_id = $1 AND created_at >= $2`,
      [userId, new Date(exactNow.getTime() - 24 * 60 * 60 * 1000)],
    );
    if (Number(count.rows[0]?.count ?? 0) >= configuration.maxRunsPerUser24h) {
      fail(429, 'technical_sandbox_run_limit_reached');
    }
    const runId = `technical_sandbox_${crypto.randomUUID()}`;
    const syntheticEmail = syntheticTechnicalSandboxEmail(userId, configuration);
    const expiresAt = new Date(exactNow.getTime() + 30 * 60 * 1000);
    const inserted = await client.query(
      `INSERT INTO technical_sandbox_runs (
         id, user_id, idempotency_key, authorization_id, amount_minor,
         currency, synthetic_email, checkout_expires_at, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [runId, userId, idempotency, configuration.authorizationId,
        configuration.amountMinor, configuration.currency, syntheticEmail,
        expiresAt, JSON.stringify({
          flow: technicalSandboxFlow,
          requestFingerprint: technicalSandboxRequestFingerprint({ userId, configuration }),
          configRevision: technicalSandboxConfigRevision(configuration),
        })],
    );
    return { row: inserted.rows[0], replayed: false };
  });
  if (prepared.replayed && prepared.row.provider_session_id) {
    return reconcileTechnicalSandboxRun({
      row: prepared.row,
      configuration,
      provider,
      databasePool,
      transaction,
    });
  }

  const session = await provider.createTechnicalSandboxCheckout({
    runId: prepared.row.id,
    userId,
    amountMinor: configuration.amountMinor,
    currency: configuration.currency,
    syntheticEmail: prepared.row.synthetic_email,
    successUrl,
    cancelUrl,
    expiresAt: prepared.row.checkout_expires_at,
    authorizationId: configuration.authorizationId,
    configRevision: technicalSandboxConfigRevision(configuration),
    idempotencyKey: `technical-sandbox:${idempotency}`,
  });
  if (!providerSessionMetadataValid(session, {
    runId: prepared.row.id,
    userId,
    configuration,
  })) {
    fail(502, 'technical_sandbox_provider_session_invalid');
  }
  const updated = await databasePool.query(
    `UPDATE technical_sandbox_runs
        SET provider_session_id = $2, provider_livemode = $3,
            provider_session_status = $4, updated_at = now()
      WHERE id = $1 AND user_id = $5
        AND provider_session_id IS NULL
        AND status IN ('pending', 'unknown')
      RETURNING *`,
    [prepared.row.id, session.id, session.livemode, session.status, userId],
  );
  if (updated.rowCount) return publicRun(updated.rows[0], { checkoutUrl: session.url });
  const current = await databasePool.query(
    'SELECT * FROM technical_sandbox_runs WHERE id = $1 AND user_id = $2',
    [prepared.row.id, userId],
  );
  if (!current.rowCount) fail(409, 'technical_sandbox_run_attach_conflict');
  return publicRun(current.rows[0], { checkoutUrl: session.url });
}

export async function recoverTechnicalSandboxPendingRuns({
  configuration = config.technicalSandbox,
  provider = technicalSandboxProvider,
  databasePool = pool,
  transaction = inTransaction,
  limit = 10,
  now = new Date(),
}) {
  const exactNow = nowDate(now);
  if (!configuration?.available || configuration.killSwitch) {
    fail(503, 'technical_sandbox_unavailable');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    fail(400, 'technical_sandbox_recovery_limit_invalid');
  }
  const result = await databasePool.query(
    `SELECT id, user_id, idempotency_key
       FROM technical_sandbox_runs
      WHERE provider_session_id IS NULL
        AND status IN ('pending', 'unknown')
        AND checkout_expires_at > $1
      ORDER BY created_at
      LIMIT $2`,
    [exactNow, limit],
  );
  const recovered = [];
  for (const row of result.rows) {
    try {
      recovered.push(await createTechnicalSandboxCheckout({
        actor: { id: row.user_id },
        key: row.idempotency_key,
        configuration,
        provider,
        databasePool,
        transaction,
        now: exactNow,
      }));
    } catch {
      // A bounded recovery pass leaves unresolved work for the next pass.
    }
  }
  return recovered;
}

export async function getTechnicalSandboxRun({
  actor,
  runId,
  configuration = config.technicalSandbox,
  provider = technicalSandboxProvider,
  databasePool = pool,
  transaction = inTransaction,
}) {
  const userId = actorId(actor);
  assertAvailable(userId, configuration);
  const id = text(runId, 120);
  const result = await databasePool.query(
    'SELECT * FROM technical_sandbox_runs WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if (!result.rowCount) fail(404, 'technical_sandbox_run_not_found');
  return reconcileTechnicalSandboxRun({
    row: result.rows[0],
    configuration,
    provider,
    databasePool,
    transaction,
  });
}

export function validateTechnicalSandboxWebhook(
  event,
  configuration = config.technicalSandbox,
  { signatureVerified = false } = {},
) {
  const object = event?.data?.object;
  const metadata = object?.metadata;
  if (!event?.id || !event?.type || !technicalSandboxEventTypes.has(event.type)
      || event.livemode !== false) {
    fail(409, 'technical_sandbox_webhook_mode_invalid');
  }
  if (event.account && event.account !== configuration.expectedAccountId) {
    fail(409, 'technical_sandbox_webhook_account_invalid');
  }
  if (!event.account && !signatureVerified) {
    fail(409, 'technical_sandbox_webhook_account_unverified');
  }
  if (!metadataMatches(metadata, { sit_flow: technicalSandboxFlow })) {
    fail(409, 'technical_sandbox_webhook_flow_invalid');
  }
  const runId = text(metadata.technical_sandbox_run_id, 120);
  const userId = text(metadata.technical_sandbox_user_id, 160);
  if (!/^technical_sandbox_[A-Za-z0-9_-]{20,120}$/u.test(runId)
      || !technicalSandboxUserAllowed(userId, configuration)) {
    fail(409, 'technical_sandbox_webhook_binding_invalid');
  }
  return Object.freeze({
    eventId: text(event.id, 255),
    eventType: text(event.type, 255),
    runId,
    userId,
  });
}

export async function applyTechnicalSandboxWebhook({
  event,
  rawPayload,
  configuration = config.technicalSandbox,
  databasePool = pool,
  transaction = inTransaction,
  provider = technicalSandboxProvider,
  signatureVerified = false,
}) {
  if (!Buffer.isBuffer(rawPayload) || rawPayload.length === 0) {
    fail(400, 'technical_sandbox_webhook_raw_payload_required');
  }
  if (signatureVerified !== true) {
    fail(401, 'technical_sandbox_webhook_signature_required');
  }
  const binding = validateTechnicalSandboxWebhook(event, configuration, { signatureVerified });
  const raw = rawPayload;
  const hash = payloadHash(raw);
  const inserted = await transaction(async (client) => {
    const existing = await client.query(
      'SELECT payload_sha256 FROM technical_sandbox_provider_events WHERE provider_event_id = $1 FOR UPDATE',
      [binding.eventId],
    );
    if (existing.rowCount) {
      if (existing.rows[0].payload_sha256 !== hash) fail(409, 'technical_sandbox_webhook_payload_mismatch');
      return { duplicate: true };
    }
    const run = await client.query(
      'SELECT id FROM technical_sandbox_runs WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [binding.runId, binding.userId],
    );
    if (!run.rowCount) fail(409, 'technical_sandbox_webhook_run_invalid');
    await client.query(
      `INSERT INTO technical_sandbox_provider_events (
         provider_event_id, run_id, event_type, provider_account_id,
         livemode, payload_sha256, processed_at
       ) VALUES ($1, $2, $3, $4, false, $5, now())`,
      [binding.eventId, binding.runId, binding.eventType,
        configuration.expectedAccountId, hash],
    );
    await client.query(
      `UPDATE technical_sandbox_runs
          SET provider_event_received_at = COALESCE(provider_event_received_at, now()),
              updated_at = now()
        WHERE id = $1`,
      [binding.runId],
    );
    return { duplicate: false };
  });
  const runResult = await databasePool.query(
    'SELECT * FROM technical_sandbox_runs WHERE id = $1 AND user_id = $2',
    [binding.runId, binding.userId],
  );
  if (!runResult.rowCount) fail(409, 'technical_sandbox_webhook_run_invalid');
  const reconciled = await reconcileTechnicalSandboxRun({
    row: runResult.rows[0],
    configuration,
    provider,
    databasePool,
    transaction,
  });
  return { ...reconciled, duplicate: inserted.duplicate };
}

export function parseTechnicalSandboxWebhook({
  rawBody,
  signatureHeader,
  configuration = config.technicalSandbox,
  provider = technicalSandboxProvider,
}) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    fail(400, 'technical_sandbox_webhook_raw_payload_required');
  }
  const event = provider.parseWebhookEvent({
    rawBody,
    signatureHeader,
    webhookSecret: configuration.webhookSecret,
  });
  validateTechnicalSandboxWebhook(event, configuration, { signatureVerified: true });
  return event;
}

export async function handleTechnicalSandboxWebhook({
  rawBody,
  signatureHeader,
  configuration = config.technicalSandbox,
  provider = technicalSandboxProvider,
  ...rest
}) {
  const event = parseTechnicalSandboxWebhook({
    rawBody,
    signatureHeader,
    configuration,
    provider,
  });
  return applyTechnicalSandboxWebhook({
    ...rest,
    event,
    rawPayload: rawBody,
    configuration,
    provider,
    signatureVerified: true,
  });
}
