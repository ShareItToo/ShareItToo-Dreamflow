import crypto from 'node:crypto';

import { config } from './config.js';
import { inTransaction, pool } from './db.js';
import {
  assertProviderPaymentBinding,
  captureLedger,
  PaymentDomainError,
  paymentAmounts,
  paymentIdempotencyKey,
  paymentStatusForProvider,
  payloadHash,
  privatePilotReleasableOwnerAmount,
  providerOperationIdempotencyKey,
  refundLedger,
  requestHash,
  splitRefund,
  transferLedger,
} from './payment_domain.js';
import {
  enqueueBookingNotifications,
  enqueueFinancialNotification,
} from './notifications.js';
import { StripeProvider } from './stripe_provider.js';

export const stripeProvider = new StripeProvider({
  mode: config.payments.transport,
  secretKey: config.payments.secretKey,
  apiVersion: config.payments.apiVersion,
  livemode: config.payments.livemode,
});

function ensurePaymentsEnabled(userId = null) {
  if (!config.payments.enabled) throw new PaymentDomainError(503, 'payments_disabled');
  if (userId && config.payments.pilotUserIds.length
      && !config.payments.pilotUserIds.includes(userId)) {
    throw new PaymentDomainError(403, 'payment_pilot_forbidden');
  }
}

function text(value, max = 255) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function providerInstant(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return null;
  if (typeof seconds === 'number' || /^\d+(?:\.\d+)?$/u.test(String(seconds))) {
    return Number.isFinite(Number(seconds)) ? new Date(Number(seconds) * 1000) : null;
  }
  const parsed = new Date(String(seconds));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function providerId(value) {
  if (value && typeof value === 'object') return text(value.id, 255) || null;
  return text(value, 255) || null;
}

const connectedAccountEventTypes = new Set([
  'account.updated',
  'v2.core.account.created',
  'v2.core.account.updated',
  'v2.core.account.closed',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account[defaults].updated',
  'v2.core.account[future_requirements].updated',
  'v2.core.account[identity].updated',
  'v2.core.account[requirements].updated',
]);

export function isConnectedAccountProviderEvent(type) {
  return connectedAccountEventTypes.has(type);
}

export function connectedAccountSnapshot(account) {
  const v2 = account?.object === 'v2.core.account';
  const recipientApplied = v2
    && account?.closed !== true
    && account?.configuration?.recipient?.applied === true
    && Array.isArray(account?.applied_configurations)
    && account.applied_configurations.includes('recipient');
  const rawTransfersStatus = v2
    ? account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status
    : account?.capabilities?.transfers;
  const transfersStatusValue = text(rawTransfersStatus, 30).toLowerCase();
  const reportedTransfersStatus = ['active', 'pending', 'inactive', 'restricted', 'unsupported'].includes(transfersStatusValue)
    ? transfersStatusValue
    : 'restricted';
  const transfersStatus = v2 && !recipientApplied ? 'restricted' : reportedTransfersStatus;
  const rawPayoutsStatus = v2
    ? account?.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status
    : null;
  const payoutsStatusValue = text(rawPayoutsStatus, 30).toLowerCase();
  const reportedPayoutsStatus = ['active', 'pending', 'inactive', 'restricted', 'unsupported'].includes(payoutsStatusValue)
    ? payoutsStatusValue
    : 'restricted';
  const payoutsStatus = v2 && recipientApplied ? reportedPayoutsStatus : 'restricted';
  const transfersStatusDetails = v2
    ? account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status_details
    : [];
  const payoutsStatusDetails = v2
    ? account?.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status_details
    : [];
  const statusDetails = transfersStatus !== 'active'
    ? transfersStatusDetails
    : payoutsStatus !== 'active' ? payoutsStatusDetails : [];
  const disabledReason = text(
    v2 ? statusDetails?.[0]?.code : account?.requirements?.disabled_reason,
    255,
  ) || null;
  const dashboard = v2 ? text(account?.dashboard, 30) || null : null;
  const feesCollector = v2
    ? text(account?.defaults?.responsibilities?.fees_collector, 30) || null
    : null;
  const lossesCollector = v2
    ? text(account?.defaults?.responsibilities?.losses_collector, 30) || null
    : null;
  const ready = v2
    && recipientApplied
    && transfersStatus === 'active'
    && payoutsStatus === 'active'
    && dashboard === 'express'
    && feesCollector === 'application'
    && lossesCollector === 'application';
  return {
    apiVersion: v2 ? 'v2' : 'v1',
    country: text(v2 ? account?.identity?.country : account?.country, 2).toUpperCase(),
    currency: text(v2 ? account?.defaults?.currency : account?.default_currency, 3).toUpperCase(),
    dashboard,
    feesCollector,
    lossesCollector,
    transfersStatus,
    payoutsStatus,
    detailsSubmitted: ready,
    chargesEnabled: false,
    payoutsEnabled: ready,
    requirements: account?.requirements ?? {},
    futureRequirements: v2 ? account?.future_requirements ?? {} : {},
    disabledReason,
  };
}

export function connectedAccountRowReady(row) {
  return row?.account_api_version === 'v2'
    && row.recipient_transfers_status === 'active'
    && row.payouts_enabled === true
    && row.dashboard_type === 'express'
    && row.fees_collector === 'application'
    && row.losses_collector === 'application';
}

function shapeConnect(row) {
  if (!row) return { exists: false, ready: false, onboardingRequired: true };
  const ready = connectedAccountRowReady(row);
  return {
    exists: true,
    ready,
    onboardingRequired: !ready,
    country: row.country,
    currency: row.default_currency,
    detailsSubmitted: row.details_submitted,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    transfersCapability: row.transfers_capability,
    accountApiVersion: row.account_api_version,
    recipientTransfersStatus: row.recipient_transfers_status,
    dashboard: row.dashboard_type,
    feeCollection: row.fees_collector,
    negativeBalanceLiability: row.losses_collector,
    disabledReason: row.disabled_reason,
    requirements: row.requirements ?? {},
    livemode: row.livemode,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function shapePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    status: row.status,
    amountMinor: Number(row.amount_minor),
    capturedMinor: Number(row.captured_minor),
    refundedMinor: Number(row.refunded_minor),
    transferredMinor: Number(row.transferred_minor),
    platformFeeMinor: Number(row.platform_fee_minor),
    ownerPayoutMinor: Number(row.owner_payout_minor),
    currency: row.currency,
    failureCode: row.failure_code,
    checkoutExpiresAt: row.checkout_expires_at ? new Date(row.checkout_expires_at).toISOString() : null,
    capturedAt: row.captured_at ? new Date(row.captured_at).toISOString() : null,
    livemode: row.livemode,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function audit(client, { actorId = null, actorRole = 'system', action, resourceType, resourceId, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorId, actorRole, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

async function beginCommand(client, { key, actorId, type, request, bookingId = null, paymentId = null }) {
  const hash = requestHash(request);
  await client.query(
    `INSERT INTO payment_commands (
       idempotency_key, actor_id, command_type, request_hash, booking_id, payment_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [key, actorId, type, hash, bookingId, paymentId],
  );
  const result = await client.query(
    'SELECT * FROM payment_commands WHERE idempotency_key = $1 FOR UPDATE',
    [key],
  );
  const command = result.rows[0];
  if (command.command_type !== type || command.request_hash !== hash || command.actor_id !== actorId) {
    throw new PaymentDomainError(409, 'idempotency_key_reused');
  }
  return command;
}

async function completeCommand(client, key, paymentId, response) {
  await client.query(
    `UPDATE payment_commands
     SET payment_id = COALESCE(payment_id, $2), response_payload = $3::jsonb, completed_at = now()
     WHERE idempotency_key = $1`,
    [key, paymentId, JSON.stringify(response)],
  );
}

async function insertLedger(client, {
  key,
  bookingId,
  paymentId,
  refundId = null,
  payoutId = null,
  type,
  currency,
  providerReference,
  metadata = {},
  entries,
}) {
  const existing = await client.query('SELECT id FROM ledger_transactions WHERE idempotency_key = $1', [key]);
  if (existing.rowCount) return { id: existing.rows[0].id, inserted: false };
  const transaction = await client.query(
    `INSERT INTO ledger_transactions (
       idempotency_key, booking_id, payment_id, refund_id, payout_id,
       transaction_type, currency, provider_reference, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id`,
    [key, bookingId, paymentId, refundId, payoutId, type, currency, providerReference, JSON.stringify(metadata)],
  );
  for (const entry of entries) {
    await client.query(
      `INSERT INTO ledger_entries (
         transaction_id, account_code, account_owner_id, debit_minor, credit_minor
       ) VALUES ($1, $2, $3, $4, $5)`,
      [transaction.rows[0].id, entry.accountCode, entry.accountOwnerId, entry.debitMinor, entry.creditMinor],
    );
  }
  return { id: transaction.rows[0].id, inserted: true };
}

export async function getConnectStatus(userId) {
  ensurePaymentsEnabled(userId);
  const result = await pool.query('SELECT * FROM stripe_connect_accounts WHERE user_id = $1', [userId]);
  return shapeConnect(result.rows[0]);
}

export async function createConnectOnboarding({ actor, raw, key: rawKey }) {
  ensurePaymentsEnabled(actor.id);
  const key = paymentIdempotencyKey(rawKey, 'connect.onboard');
  const country = text(raw?.country, 2).toUpperCase() || config.payments.connectCountry;
  const currency = text(raw?.currency, 3).toUpperCase() || config.payments.currency;
  if (country !== config.payments.connectCountry || currency !== config.payments.currency) {
    throw new PaymentDomainError(409, 'connect_region_not_enabled');
  }
  const command = await inTransaction((client) => beginCommand(client, {
    key,
    actorId: actor.id,
    type: 'connect.onboard',
    request: { country, currency },
  }));
  if (command.completed_at) return { ...command.response_payload, replayed: true };
  let accountResult = await pool.query('SELECT * FROM stripe_connect_accounts WHERE user_id = $1', [actor.id]);
  let account = accountResult.rows[0];
  if (!account) {
    const created = await stripeProvider.createConnectedAccount({
      userId: actor.id,
      email: actor.email,
      country,
      currency,
      idempotencyKey: providerOperationIdempotencyKey('connect_account', actor.id),
    });
    const snapshot = connectedAccountSnapshot(created);
    if (snapshot.apiVersion !== 'v2'
        || snapshot.dashboard !== 'express'
        || snapshot.feesCollector !== 'application'
        || snapshot.lossesCollector !== 'application'
        || snapshot.country !== country
        || snapshot.currency !== currency
        || created.livemode === true !== config.payments.livemode) {
      throw new PaymentDomainError(409, 'stripe_connected_account_configuration_mismatch');
    }
    accountResult = await pool.query(
      `INSERT INTO stripe_connect_accounts (
         user_id, provider_account_id, country, default_currency,
         details_submitted, charges_enabled, payouts_enabled,
         transfers_capability, requirements, disabled_reason,
         livemode, provider_created_at, last_provider_event_at,
         account_api_version, dashboard_type, fees_collector,
         losses_collector, recipient_transfers_status, future_requirements
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, now(),
         $13, $14, $15, $16, $17, $18::jsonb
       )
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [
        actor.id, created.id, snapshot.country || country, snapshot.currency || currency,
        snapshot.detailsSubmitted, snapshot.chargesEnabled,
        snapshot.payoutsEnabled, snapshot.transfersStatus,
        JSON.stringify(snapshot.requirements), snapshot.disabledReason,
        created.livemode === true, providerInstant(created.created),
        snapshot.apiVersion, snapshot.dashboard, snapshot.feesCollector,
        snapshot.lossesCollector, snapshot.transfersStatus,
        JSON.stringify(snapshot.futureRequirements),
      ],
    );
    account = accountResult.rows[0];
  }
  if (account.account_api_version !== 'v2') {
    throw new PaymentDomainError(409, 'stripe_connected_account_v2_migration_required');
  }
  const refreshUrl = `${config.publicBaseUrl}/payments/connect/return?state=refresh`;
  const returnUrl = `${config.publicBaseUrl}/payments/connect/return?state=complete`;
  const link = await stripeProvider.createAccountLink({
    accountId: account.provider_account_id,
    refreshUrl,
    returnUrl,
    idempotencyKey: `${key}:link`,
  });
  const response = {
    account: shapeConnect(account),
    onboardingUrl: link.url,
    expiresAt: providerInstant(link.expires_at)?.toISOString() ?? null,
    providerMode: config.payments.transport,
    replayed: false,
  };
  await inTransaction(async (client) => {
    await completeCommand(client, key, null, response);
    await audit(client, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'connect.onboarding_started',
      resourceType: 'stripe_connect_account',
      resourceId: actor.id,
      metadata: { livemode: account.livemode, transport: config.payments.transport },
    });
  });
  return response;
}

async function ensureCustomer(actor) {
  const existing = await pool.query('SELECT * FROM stripe_customers WHERE user_id = $1', [actor.id]);
  if (existing.rowCount) return existing.rows[0];
  const name = text(actor.profile?.displayName, 120);
  const created = await stripeProvider.createCustomer({
    userId: actor.id,
    email: actor.email,
    name,
    idempotencyKey: providerOperationIdempotencyKey('customer', actor.id),
  });
  const result = await pool.query(
    `INSERT INTO stripe_customers (user_id, provider_customer_id, livemode)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [actor.id, created.id, created.livemode === true],
  );
  return result.rows[0];
}

export async function createPaymentCheckout({ actor, bookingId, key: rawKey }) {
  ensurePaymentsEnabled(actor.id);
  const key = paymentIdempotencyKey(rawKey, 'payment.checkout');
  const requestedCheckoutExpiresAt = new Date(Date.now() + 45 * 60_000);
  const request = { bookingId };
  const prepared = await inTransaction(async (client) => {
    const command = await beginCommand(client, {
      key, actorId: actor.id, type: 'payment.checkout', request, bookingId,
    });
    if (command.completed_at) return { replay: command.response_payload };
    const result = await client.query(
      `SELECT booking.*, listing.payload AS listing_payload,
              connected.provider_account_id, connected.account_api_version,
              connected.recipient_transfers_status, connected.payouts_enabled,
              connected.dashboard_type,
              connected.fees_collector, connected.losses_collector
       FROM bookings AS booking
       JOIN listings AS listing ON listing.id = booking.listing_id
       LEFT JOIN stripe_connect_accounts AS connected ON connected.user_id = booking.owner_id
       WHERE booking.id = $1 FOR UPDATE OF booking`,
      [bookingId],
    );
    if (!result.rowCount) throw new PaymentDomainError(404, 'booking_not_found');
    const booking = result.rows[0];
    if (booking.renter_id !== actor.id) throw new PaymentDomainError(403, 'payment_forbidden');
    if (booking.simulation_only === true) {
      throw new PaymentDomainError(409, 'pilot_simulation_payment_forbidden');
    }
    if (!['accepted', 'payment_pending'].includes(booking.workflow_status)) {
      throw new PaymentDomainError(409, 'booking_not_ready_for_payment', { status: booking.workflow_status });
    }
    if (!booking.provider_account_id || !connectedAccountRowReady(booking)) {
      throw new PaymentDomainError(409, 'owner_payout_account_not_ready');
    }
    const amounts = paymentAmounts(booking);
    const existing = await client.query(
      `SELECT * FROM payments
       WHERE booking_id = $1 AND payment_version = 1
         AND status IN ('created', 'requires_action', 'authorized', 'captured', 'partially_refunded')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [bookingId],
    );
    let payment = existing.rows[0];
    if (payment?.status === 'captured' || payment?.status === 'partially_refunded') {
      throw new PaymentDomainError(409, 'booking_already_paid');
    }
    if (!payment) {
      const paymentId = crypto.randomUUID();
      const inserted = await client.query(
        `INSERT INTO payments (
           id, booking_id, provider, idempotency_key, status,
           amount_minor, currency, rental_subtotal_minor, platform_fee_minor,
           owner_payout_minor, security_deposit_minor, transfer_group,
           checkout_command_key, checkout_expires_at, livemode
         ) VALUES ($1, $2, 'stripe', $3, 'created', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          paymentId, bookingId, key, amounts.amountMinor, amounts.currency,
          amounts.rentalSubtotalMinor, amounts.platformFeeMinor,
          amounts.ownerPayoutMinor, amounts.securityDepositMinor,
          `booking_${bookingId}`, key, requestedCheckoutExpiresAt, config.payments.livemode,
        ],
      );
      payment = inserted.rows[0];
      await client.query(
        `INSERT INTO payment_attempts (payment_id, status, metadata)
         VALUES ($1, 'created', $2::jsonb)`,
        [payment.id, JSON.stringify({ transport: config.payments.transport })],
      );
    } else {
      const activeExpiry = payment.checkout_expires_at
        ? new Date(payment.checkout_expires_at).getTime()
        : Number.NaN;
      if (!Number.isFinite(activeExpiry) || activeExpiry <= Date.now()) {
        throw new PaymentDomainError(409, 'payment_checkout_reconciliation_required');
      }
      if (!payment.checkout_command_key) {
        throw new PaymentDomainError(409, 'payment_checkout_reconciliation_required');
      }
      if (payment.checkout_command_key !== key) {
        const priorCommandResult = await client.query(
          `SELECT actor_id, command_type, request_hash, response_payload, completed_at
           FROM payment_commands WHERE idempotency_key = $1 FOR UPDATE`,
          [payment.checkout_command_key],
        );
        const priorCommand = priorCommandResult.rows[0];
        if (priorCommand?.completed_at
            && priorCommand.actor_id === actor.id
            && priorCommand.command_type === 'payment.checkout'
            && priorCommand.request_hash === requestHash(request)
            && priorCommand.response_payload?.payment?.id === payment.id
            && priorCommand.response_payload?.payment?.bookingId === bookingId
            && typeof priorCommand.response_payload?.checkoutUrl === 'string') {
          await completeCommand(client, key, payment.id, priorCommand.response_payload);
          return { replay: priorCommand.response_payload };
        }
      }
    }
    await client.query(
      'UPDATE payment_commands SET payment_id = $2 WHERE idempotency_key = $1',
      [key, payment.id],
    );
    if (booking.workflow_status === 'accepted') {
      await client.query(
        `UPDATE bookings SET workflow_status = 'payment_pending', payment_due_at = COALESCE(payment_due_at, now()),
             workflow_revision = workflow_revision + 1, version = version + 1
         WHERE id = $1`,
        [bookingId],
      );
      await client.query(
        `INSERT INTO booking_events (
           booking_id, actor_id, event_type, from_status, to_status, idempotency_key, metadata
         ) VALUES ($1, $2, 'booking.payment_started', 'accepted', 'payment_pending', $3, $4::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [bookingId, actor.id, `${key}:payment-started`, JSON.stringify({ paymentId: payment.id })],
      );
      await enqueueBookingNotifications(client, {
        bookingId,
        eventKey: `booking:${bookingId}:payment_pending:${key}`,
        workflowStatus: 'payment_pending',
      });
    }
    return {
      booking,
      payment,
      amounts,
      checkoutExpiresAt: new Date(payment.checkout_expires_at),
      commandKeysToComplete: payment.checkout_command_key === key
        ? [key]
        : [payment.checkout_command_key, key],
    };
  });
  if (prepared.replay) return { ...prepared.replay, replayed: true };

  const customer = await ensureCustomer(actor);
  const expiresAt = Math.floor(prepared.checkoutExpiresAt.getTime() / 1000);
  // Keep provider parameters immutable across retries. Listing fields remain
  // editable after booking creation and must not change the payload associated
  // with this payment's durable provider idempotency key.
  const title = 'ShareItToo Buchung';
  const successUrl = `${config.publicBaseUrl}/open/payment/${encodeURIComponent(bookingId)}?result=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${config.publicBaseUrl}/open/payment/${encodeURIComponent(bookingId)}?result=cancelled`;
  const session = await stripeProvider.createPaymentCheckout({
    paymentId: prepared.payment.id,
    bookingId,
    customerId: customer.provider_customer_id,
    amountMinor: prepared.amounts.amountMinor,
    currency: prepared.amounts.currency,
    itemTitle: title,
    transferGroup: prepared.payment.transfer_group,
    successUrl,
    cancelUrl,
    expiresAt,
    idempotencyKey: providerOperationIdempotencyKey('checkout', prepared.payment.id),
  });
  const response = {
    payment: shapePayment({
      ...prepared.payment,
      provider_checkout_session_id: session.id,
      provider_payment_id: providerId(session.payment_intent),
      provider_customer_id: customer.provider_customer_id,
      checkout_expires_at: providerInstant(session.expires_at),
      updated_at: new Date(),
    }),
    checkoutUrl: session.url,
    providerMode: config.payments.transport,
    replayed: false,
  };
  await inTransaction(async (client) => {
    await client.query(
      `UPDATE payments
       SET provider_checkout_session_id = $2, provider_payment_id = COALESCE($3, provider_payment_id),
           provider_customer_id = $4, checkout_expires_at = $5
       WHERE id = $1`,
      [prepared.payment.id, session.id, providerId(session.payment_intent), customer.provider_customer_id, providerInstant(session.expires_at)],
    );
    for (const commandKey of new Set(prepared.commandKeysToComplete)) {
      await completeCommand(client, commandKey, prepared.payment.id, response);
    }
    await audit(client, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'payment.checkout_created',
      resourceType: 'payment',
      resourceId: prepared.payment.id,
      metadata: { bookingId, amountMinor: prepared.amounts.amountMinor, currency: prepared.amounts.currency },
    });
  });
  return response;
}

export async function getBookingPayment({ actor, bookingId }) {
  ensurePaymentsEnabled(actor.id);
  const result = await pool.query(
    `SELECT payment.*, booking.owner_id, booking.renter_id, booking.workflow_status,
            booking.simulation_only,
            booking.quoted_total_minor AS booking_total_minor,
            booking.rental_subtotal_minor AS booking_rental_subtotal_minor,
            booking.owner_payout_minor AS booking_owner_payout_minor,
            booking.currency AS booking_currency,
            payout.id AS payout_id, payout.status AS payout_status,
            payout.available_at, payout.paid_at
     FROM bookings AS booking
     LEFT JOIN LATERAL (
       SELECT * FROM payments WHERE booking_id = booking.id ORDER BY created_at DESC LIMIT 1
     ) AS payment ON true
     LEFT JOIN LATERAL (
       SELECT * FROM payouts WHERE booking_id = booking.id ORDER BY created_at DESC LIMIT 1
     ) AS payout ON true
     WHERE booking.id = $1`,
    [bookingId],
  );
  if (!result.rowCount) throw new PaymentDomainError(404, 'booking_not_found');
  const row = result.rows[0];
  if (![row.owner_id, row.renter_id].includes(actor.id) && actor.role !== 'admin') {
    throw new PaymentDomainError(403, 'payment_forbidden');
  }
  if (row.simulation_only === true) {
    throw new PaymentDomainError(409, 'pilot_simulation_payment_forbidden');
  }
  return {
    bookingId,
    bookingStatus: row.workflow_status,
    quote: {
      amountMinor: Number(row.booking_total_minor),
      rentalSubtotalMinor: Number(row.booking_rental_subtotal_minor),
      platformFeeMinor: Number(row.booking_total_minor) - Number(row.booking_owner_payout_minor),
      ownerPayoutMinor: Number(row.booking_owner_payout_minor),
      currency: row.booking_currency,
    },
    payment: row.id ? shapePayment(row) : null,
    payout: row.payout_id ? {
      id: row.payout_id,
      status: row.payout_status,
      availableAt: row.available_at ? new Date(row.available_at).toISOString() : null,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    } : null,
  };
}

async function recordCapture(client, payment, event) {
  if (payment.status === 'captured' || payment.status === 'partially_refunded' || payment.status === 'refunded') return false;
  const object = event.data.object;
  const chargeId = providerId(object.latest_charge) || payment.provider_charge_id;
  const capturedMinor = Number(object.amount_received ?? object.amount ?? payment.amount_minor);
  if (capturedMinor !== Number(payment.amount_minor)) {
    throw new PaymentDomainError(409, 'provider_amount_mismatch');
  }
  const currency = text(object.currency, 3).toUpperCase() || payment.currency;
  if (currency !== payment.currency) throw new PaymentDomainError(409, 'provider_currency_mismatch');
  await client.query(
    `UPDATE payments SET status = 'captured', provider_payment_id = COALESCE(provider_payment_id, $2),
         provider_charge_id = COALESCE($3, provider_charge_id), provider_customer_id = COALESCE($4, provider_customer_id),
         provider_payment_method_id = COALESCE($5, provider_payment_method_id), captured_minor = $6,
         captured_at = COALESCE(captured_at, now()), failure_code = NULL,
         latest_provider_event_at = GREATEST(COALESCE(latest_provider_event_at, '-infinity'), $7)
     WHERE id = $1`,
    [
      payment.id, object.id, chargeId, providerId(object.customer), providerId(object.payment_method),
      capturedMinor, providerInstant(event.created) ?? new Date(),
    ],
  );
  await client.query(
    `INSERT INTO payment_attempts (payment_id, provider_event_id, status, metadata)
     VALUES ($1, $2, 'succeeded', $3::jsonb)`,
    [payment.id, event.id, JSON.stringify({ providerStatus: object.status })],
  );
  await insertLedger(client, {
    key: `provider:${event.id}:capture`,
    bookingId: payment.booking_id,
    paymentId: payment.id,
    type: 'payment_captured',
    currency: payment.currency,
    providerReference: chargeId ?? object.id,
    entries: captureLedger({
      amountMinor: Number(payment.amount_minor),
      ownerPayoutMinor: Number(payment.owner_payout_minor),
      platformFeeMinor: Number(payment.platform_fee_minor),
      ownerId: payment.owner_id,
    }),
  });
  const booking = await client.query('SELECT workflow_status FROM bookings WHERE id = $1 FOR UPDATE', [payment.booking_id]);
  if (['accepted', 'payment_pending'].includes(booking.rows[0]?.workflow_status)) {
    const from = booking.rows[0].workflow_status;
    await client.query(
      `UPDATE bookings SET status = 'accepted', workflow_status = 'confirmed', hold_expires_at = NULL,
           confirmed_at = COALESCE(confirmed_at, now()), workflow_revision = workflow_revision + 1,
           version = version + 1 WHERE id = $1`,
      [payment.booking_id],
    );
    await client.query(
      `UPDATE rental_requests SET status = 'accepted',
         payload = payload || $2::jsonb WHERE id = $1`,
      [payment.booking_id, JSON.stringify({ status: 'accepted', workflowStatus: 'confirmed', paymentStatus: 'captured' })],
    );
    await client.query(
      `INSERT INTO booking_events (
         booking_id, event_type, from_status, to_status, idempotency_key, metadata
       ) VALUES ($1, 'booking.payment_confirmed', $2, 'confirmed', $3, $4::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [payment.booking_id, from, `provider:${event.id}:booking`, JSON.stringify({ paymentId: payment.id })],
    );
    await enqueueBookingNotifications(client, {
      bookingId: payment.booking_id,
      eventKey: `booking:${payment.booking_id}:confirmed:${event.id}`,
      workflowStatus: 'confirmed',
    });
  }
  await enqueueFinancialNotification(client, {
    bookingId: payment.booking_id,
    eventKey: `payment:${payment.id}:captured`,
    kind: 'payment_confirmed',
    recipientRole: 'renter',
    amountMinor: payment.amount_minor,
    currency: payment.currency,
  });
  await audit(client, {
    action: 'payment.captured', resourceType: 'payment', resourceId: payment.id,
    metadata: { bookingId: payment.booking_id, eventId: event.id, amountMinor: capturedMinor },
  });
  return true;
}

async function processProviderEvent(client, event) {
  const object = event?.data?.object ?? {};
  if (isConnectedAccountProviderEvent(event.type)) {
    const snapshot = connectedAccountSnapshot(object);
    const eventAt = providerInstant(event.created) ?? new Date();
    await client.query(
      `UPDATE stripe_connect_accounts
       SET details_submitted = $2, charges_enabled = $3, payouts_enabled = $4,
           transfers_capability = $5, requirements = $6::jsonb,
           disabled_reason = $7, last_provider_event_at = $8, livemode = $9,
           account_api_version = CASE WHEN $10 = 'v2' THEN 'v2' ELSE account_api_version END,
           dashboard_type = CASE WHEN $10 = 'v2' THEN $11 ELSE dashboard_type END,
           fees_collector = CASE WHEN $10 = 'v2' THEN $12 ELSE fees_collector END,
           losses_collector = CASE WHEN $10 = 'v2' THEN $13 ELSE losses_collector END,
           recipient_transfers_status = CASE
             WHEN $10 = 'v2' THEN $5
             ELSE recipient_transfers_status
           END,
           future_requirements = CASE
             WHEN $10 = 'v2' THEN $14::jsonb
             ELSE future_requirements
           END
       WHERE provider_account_id = $1
         AND (last_provider_event_at IS NULL OR last_provider_event_at <= $8)
         AND (account_api_version <> 'v2' OR $10 = 'v2')`,
      [
        object.id, snapshot.detailsSubmitted, snapshot.chargesEnabled,
        snapshot.payoutsEnabled, snapshot.transfersStatus,
        JSON.stringify(snapshot.requirements), snapshot.disabledReason,
        eventAt, event.livemode === true,
        snapshot.apiVersion, snapshot.dashboard, snapshot.feesCollector,
        snapshot.lossesCollector, JSON.stringify(snapshot.futureRequirements),
      ],
    );
    return 'processed';
  }
  // A delayed webhook from the retired deposit flow must never revive it.
  if (object.metadata?.sit_mandate_id) return 'ignored';
  const mappedStatus = paymentStatusForProvider(event.type, object);
  if (mappedStatus) {
    const paymentId = text(object.metadata?.sit_payment_id, 80);
    const paymentResult = await client.query(
      `SELECT payment.*, booking.owner_id
       FROM payments AS payment JOIN bookings AS booking ON booking.id = payment.booking_id
       WHERE payment.id::text = $1 OR payment.provider_payment_id = $2
       ORDER BY payment.created_at DESC LIMIT 1 FOR UPDATE OF payment`,
      [paymentId, object.id],
    );
    if (!paymentResult.rowCount) return 'ignored';
    const payment = paymentResult.rows[0];
    assertProviderPaymentBinding({ payment, event, object });
    if (mappedStatus === 'captured') {
      await recordCapture(client, payment, event);
    } else {
      const eventAt = providerInstant(event.created) ?? new Date();
      await client.query(
        `UPDATE payments SET status = $2, failure_code = $3,
             cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
             latest_provider_event_at = GREATEST(COALESCE(latest_provider_event_at, '-infinity'), $4)
         WHERE id = $1 AND status NOT IN ('captured', 'partially_refunded', 'refunded')
           AND (latest_provider_event_at IS NULL OR latest_provider_event_at <= $4)`,
        [payment.id, mappedStatus, text(object.last_payment_error?.code, 120) || null, eventAt],
      );
      await client.query(
        `INSERT INTO payment_attempts (payment_id, provider_event_id, status, failure_code, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          payment.id, event.id,
          mappedStatus === 'requires_action' ? 'requires_action' : (mappedStatus === 'authorized' ? 'processing' : mappedStatus),
          text(object.last_payment_error?.code, 120) || null,
          JSON.stringify({ providerStatus: object.status }),
        ],
      );
      if (mappedStatus === 'failed') {
        await enqueueFinancialNotification(client, {
          bookingId: payment.booking_id,
          eventKey: `payment:${payment.id}:failed:${event.id}`,
          kind: 'payment_failed', recipientRole: 'renter',
          amountMinor: payment.amount_minor, currency: payment.currency,
        });
      }
    }
    return 'processed';
  }
  if (event.type.startsWith('charge.dispute.')) {
    const chargeId = providerId(object.charge);
    const paymentResult = await client.query(
      `SELECT payment.*, booking.renter_id, booking.owner_id, booking.workflow_status
       FROM payments AS payment JOIN bookings AS booking ON booking.id = payment.booking_id
       WHERE payment.provider_charge_id = $1 FOR UPDATE OF payment, booking`,
      [chargeId],
    );
    if (!paymentResult.rowCount) return 'ignored';
    const payment = paymentResult.rows[0];
    const disputeStatus = text(object.status, 60);
    await client.query(
      `INSERT INTO disputes (
         booking_id, opened_by, status, reason_code, summary, resolution,
         provider_dispute_id, provider_status, provider_evidence_due_at, livemode
       ) VALUES ($1, $2, 'investigating', $3, $4, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (provider_dispute_id) WHERE provider_dispute_id IS NOT NULL
       DO UPDATE SET provider_status = EXCLUDED.provider_status,
         provider_evidence_due_at = EXCLUDED.provider_evidence_due_at, updated_at = now()`,
      [
        payment.booking_id, payment.renter_id, text(object.reason, 120) || 'provider_chargeback',
        'Stripe-Streitfall; Auszahlung automatisch gesperrt.',
        JSON.stringify({ source: 'stripe', amountMinor: object.amount }), object.id,
        disputeStatus, providerInstant(object.evidence_details?.due_by), event.livemode === true,
      ],
    );
    const amount = Number(object.amount);
    const currency = text(object.currency, 3).toUpperCase() || payment.currency;
    if (Number.isSafeInteger(amount) && amount > 0 && currency === payment.currency
        && event.type === 'charge.dispute.funds_withdrawn') {
      await insertLedger(client, {
        key: `provider:${event.id}:chargeback`, bookingId: payment.booking_id,
        paymentId: payment.id, type: 'chargeback', currency,
        providerReference: object.id,
        metadata: { providerDisputeId: object.id },
        entries: [
          { accountCode: 'chargeback_expense', accountOwnerId: null, debitMinor: amount, creditMinor: 0 },
          { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: 0, creditMinor: amount },
        ],
      });
    }
    if (Number.isSafeInteger(amount) && amount > 0 && currency === payment.currency
        && event.type === 'charge.dispute.funds_reinstated') {
      await insertLedger(client, {
        key: `provider:${event.id}:chargeback-reversed`, bookingId: payment.booking_id,
        paymentId: payment.id, type: 'chargeback_reversed', currency,
        providerReference: object.id,
        metadata: { providerDisputeId: object.id },
        entries: [
          { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: amount, creditMinor: 0 },
          { accountCode: 'chargeback_expense', accountOwnerId: null, debitMinor: 0, creditMinor: amount },
        ],
      });
    }
    if (payment.workflow_status !== 'disputed'
        && !['charge.dispute.closed', 'charge.dispute.funds_reinstated'].includes(event.type)) {
      await client.query(
        `UPDATE bookings SET workflow_status = 'disputed', disputed_at = COALESCE(disputed_at, now()),
             workflow_revision = workflow_revision + 1, version = version + 1 WHERE id = $1`,
        [payment.booking_id],
      );
      await enqueueBookingNotifications(client, {
        bookingId: payment.booking_id,
        eventKey: `booking:${payment.booking_id}:disputed:${event.id}`,
        workflowStatus: 'disputed',
      });
    }
    return 'processed';
  }
  return 'ignored';
}

export async function applyProviderEvent(event, rawPayload = null) {
  if (!event || typeof event !== 'object' || !text(event.id, 255) || !text(event.type, 255)) {
    throw new PaymentDomainError(400, 'invalid_provider_event');
  }
  if (event.livemode === true !== config.payments.livemode) {
    throw new PaymentDomainError(409, 'provider_livemode_mismatch');
  }
  const raw = rawPayload ?? Buffer.from(JSON.stringify(event));
  const hash = payloadHash(raw);
  const inserted = await pool.query(
    `INSERT INTO payment_provider_events (
       provider_event_id, event_type, object_id, account_id, payload_sha256,
       livemode, provider_created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider_event_id) DO NOTHING RETURNING provider_event_id`,
    [
      event.id, event.type, providerId(event.data?.object), text(event.account, 255) || null,
      hash, event.livemode === true, providerInstant(event.created),
    ],
  );
  const isFirstDelivery = inserted.rowCount > 0;
  if (!isFirstDelivery) {
    const existing = await pool.query(
      'SELECT payload_sha256 FROM payment_provider_events WHERE provider_event_id = $1',
      [event.id],
    );
    if (!existing.rowCount || existing.rows[0].payload_sha256 !== hash) {
      throw new PaymentDomainError(409, 'provider_event_payload_mismatch');
    }
  }
  try {
    return await inTransaction(async (client) => {
      const storedResult = await client.query(
        'SELECT * FROM payment_provider_events WHERE provider_event_id = $1 FOR UPDATE',
        [event.id],
      );
      const stored = storedResult.rows[0];
      if (!stored || stored.payload_sha256 !== hash) {
        throw new PaymentDomainError(409, 'provider_event_payload_mismatch');
      }
      if (['processed', 'ignored'].includes(stored.status)) {
        return { duplicate: true, status: stored.status };
      }
      const status = await processProviderEvent(client, event);
      await client.query(
        `UPDATE payment_provider_events SET status = $2, processing_attempts = processing_attempts + 1,
             processed_at = now() WHERE provider_event_id = $1`,
        [event.id, status],
      );
      return { duplicate: !isFirstDelivery, status };
    }, { deadlockRetries: 2 });
  } catch (error) {
    if (error.code !== 'provider_event_payload_mismatch') {
      await pool.query(
        `UPDATE payment_provider_events SET status = 'failed',
             processing_attempts = processing_attempts + 1, last_error_code = $2
         WHERE provider_event_id = $1`,
        [event.id, text(error.code ?? error.message, 120)],
      );
    }
    throw error;
  }
}

export async function verifyAndApplyWebhook(rawBody, signatureHeader) {
  if (config.payments.transport !== 'stripe') throw new PaymentDomainError(404, 'webhook_not_enabled');
  let event = stripeProvider.parseWebhookEvent({
    rawBody,
    signatureHeader,
    webhookSecret: config.payments.webhookSecret,
    connectWebhookSecret: config.payments.connectWebhookSecret,
  });
  // Reject a wrong or absent mode before thin-event account retrieval, not
  // just later at the database boundary in applyProviderEvent.
  if (event.livemode !== config.payments.livemode) {
    throw new PaymentDomainError(409, 'provider_livemode_mismatch');
  }
  if (isConnectedAccountProviderEvent(event.type) && event.type !== 'account.updated') {
    const accountId = providerId(event.related_object?.id)
      || providerId(event.data?.object?.id)
      || providerId(event.data?.object);
    if (!accountId) throw new PaymentDomainError(400, 'invalid_connected_account_event');
    const account = await stripeProvider.retrieveConnectedAccount(accountId);
    event = { ...event, data: { object: account } };
  }
  return applyProviderEvent(event, rawBody);
}

export async function simulatePaymentEvent({ actor, paymentId, scenario, duplicate = false }) {
  if (config.payments.transport !== 'memory') throw new PaymentDomainError(404, 'simulation_not_available');
  const result = await pool.query(
    `SELECT payment.*, booking.renter_id, booking.owner_id
     FROM payments AS payment JOIN bookings AS booking ON booking.id = payment.booking_id
     WHERE payment.id::text = $1`,
    [paymentId],
  );
  if (!result.rowCount) throw new PaymentDomainError(404, 'payment_not_found');
  const payment = result.rows[0];
  if (![payment.renter_id, payment.owner_id].includes(actor.id) && actor.role !== 'admin') {
    throw new PaymentDomainError(403, 'payment_forbidden');
  }
  const types = {
    succeeded: 'payment_intent.succeeded',
    failed: 'payment_intent.payment_failed',
    requires_action: 'payment_intent.requires_action',
    cancelled: 'payment_intent.canceled',
  };
  const type = types[scenario];
  if (!type) throw new PaymentDomainError(400, 'invalid_payment_simulation');
  const eventId = duplicate
    ? `evt_memory_${payment.id.replaceAll('-', '').slice(0, 20)}_${scenario}`
    : `evt_memory_${crypto.randomBytes(12).toString('hex')}`;
  const event = {
    id: eventId,
    object: 'event',
    type,
    created: duplicate
      ? Math.floor(new Date(payment.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: {
      id: payment.provider_payment_id || `pi_memory_${crypto.randomBytes(8).toString('hex')}`,
      object: 'payment_intent',
      status: scenario === 'succeeded' ? 'succeeded' : scenario,
      amount: Number(payment.amount_minor),
      amount_received: scenario === 'succeeded' ? Number(payment.amount_minor) : 0,
      currency: payment.currency.toLowerCase(),
      latest_charge: scenario === 'succeeded' ? `ch_memory_${payment.id.replaceAll('-', '').slice(0, 20)}` : null,
      customer: payment.provider_customer_id,
      payment_method: `pm_memory_${payment.id.replaceAll('-', '').slice(0, 20)}`,
      transfer_group: payment.transfer_group,
      metadata: { sit_payment_id: payment.id, sit_booking_id: payment.booking_id },
      ...(scenario === 'failed' ? { last_payment_error: { code: 'card_declined' } } : {}),
    } },
  };
  const applied = await applyProviderEvent(event);
  return { eventId, scenario, ...applied };
}

export async function refundPayment({ actor = null, paymentId, amountMinor = null, reason = 'booking_cancelled', key: rawKey }) {
  ensurePaymentsEnabled(actor?.id ?? null);
  if (actor && actor.role !== 'admin') throw new PaymentDomainError(403, 'refund_requires_admin');
  const key = paymentIdempotencyKey(rawKey, 'payment.refund');
  const prepared = await inTransaction(async (client) => {
    const result = await client.query(
      `SELECT payment.*, booking.owner_id, booking.renter_id, booking.workflow_status,
              payout.id AS payout_id, payout.provider_transfer_id, payout.status AS payout_status,
              payout.amount_minor AS payout_amount_minor, payout.reversed_minor AS payout_reversed_minor,
              COALESCE(refunded.owner_share_minor, 0) AS refunded_owner_minor
       FROM payments AS payment
       JOIN bookings AS booking ON booking.id = payment.booking_id
       LEFT JOIN LATERAL (
         SELECT * FROM payouts WHERE payment_id = payment.id AND status = 'paid'
         ORDER BY created_at DESC LIMIT 1
       ) AS payout ON true
       LEFT JOIN LATERAL (
         SELECT sum(owner_share_minor)::bigint AS owner_share_minor
         FROM refunds WHERE payment_id = payment.id AND status = 'succeeded'
       ) AS refunded ON true
       WHERE payment.id::text = $1 FOR UPDATE OF payment, booking`,
      [paymentId],
    );
    if (!result.rowCount) throw new PaymentDomainError(404, 'payment_not_found');
    const payment = result.rows[0];
    if (!['captured', 'partially_refunded'].includes(payment.status)) {
      if (payment.status === 'refunded') return { replay: true, payment };
      throw new PaymentDomainError(409, 'payment_not_refundable');
    }
    const activeRefund = await client.query(
      `SELECT idempotency_key FROM refunds
       WHERE payment_id = $1 AND status IN ('created', 'pending')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [paymentId],
    );
    if (activeRefund.rowCount && activeRefund.rows[0].idempotency_key !== key) {
      throw new PaymentDomainError(409, 'refund_in_progress');
    }
    const remaining = Number(payment.captured_minor) - Number(payment.refunded_minor);
    const requestedAmount = amountMinor == null ? remaining : Number(amountMinor);
    if (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0 || requestedAmount > remaining) {
      throw new PaymentDomainError(400, 'invalid_refund_amount');
    }
    const command = await beginCommand(client, {
      key, actorId: actor?.id ?? null, type: 'payment.refund',
      request: { paymentId, amountMinor: requestedAmount, reason },
      bookingId: payment.booking_id, paymentId,
    });
    if (command.completed_at) return { commandReplay: command.response_payload };
    const existingRefund = await client.query('SELECT * FROM refunds WHERE idempotency_key = $1', [key]);
    if (existingRefund.rowCount) {
      const refund = existingRefund.rows[0];
      return {
        payment,
        refund,
        split: {
          ownerShareMinor: Number(refund.owner_share_minor),
          platformShareMinor: Number(refund.platform_share_minor),
        },
      };
    }
    const previousOwnerShare = Number(payment.refunded_owner_minor);
    const remainingOwnerShare = Math.max(0, Number(payment.owner_payout_minor) - previousOwnerShare);
    const proportionalSplit = splitRefund({
      amountMinor: requestedAmount,
      paymentAmountMinor: Number(payment.amount_minor),
      ownerPayoutMinor: Number(payment.owner_payout_minor),
    });
    const ownerShareMinor = requestedAmount === remaining
      ? Math.min(requestedAmount, remainingOwnerShare)
      : Math.min(requestedAmount, remainingOwnerShare, proportionalSplit.ownerShareMinor);
    const split = {
      ownerShareMinor,
      platformShareMinor: requestedAmount - ownerShareMinor,
    };
    const refund = await client.query(
      `INSERT INTO refunds (
         payment_id, idempotency_key, status, amount_minor, currency, reason,
         provider_charge_id, owner_share_minor, platform_share_minor,
         reverse_transfer, refund_platform_fee, livemode
       ) VALUES ($1, $2, 'created', $3, $4, $5, $6, $7, $8, $9, true, $10)
       RETURNING *`,
      [
        paymentId, key, requestedAmount, payment.currency, text(reason, 500),
        payment.provider_charge_id, split.ownerShareMinor, split.platformShareMinor,
        Boolean(payment.payout_id), config.payments.livemode,
      ],
    );
    return { payment, refund: refund.rows[0], split };
  });
  if (prepared.commandReplay) return { ...prepared.commandReplay, replayed: true };
  if (prepared.replay) return { payment: shapePayment(prepared.payment), replayed: true };
  if (prepared.payment.provider_transfer_id) {
    const reverseAmount = Math.min(prepared.split.ownerShareMinor, Number(prepared.payment.transferred_minor));
    if (reverseAmount > 0) {
      const reversal = await stripeProvider.reverseTransfer({
        transferId: prepared.payment.provider_transfer_id,
        amountMinor: reverseAmount,
        idempotencyKey: providerOperationIdempotencyKey(
          'refund_transfer_reversal',
          prepared.refund.id,
        ),
        metadata: { sit_booking_id: prepared.payment.booking_id, sit_payment_id: paymentId },
      });
      const reversalInserted = await inTransaction(async (client) => {
        const reversalLedger = await insertLedger(client, {
          key: `${key}:transfer-reversal`, bookingId: prepared.payment.booking_id,
          paymentId, payoutId: prepared.payment.payout_id,
          type: 'owner_transfer_reversed', currency: prepared.payment.currency,
          providerReference: reversal.id,
          entries: [
            { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: reverseAmount, creditMinor: 0 },
            { accountCode: 'owner_payable', accountOwnerId: prepared.payment.owner_id, debitMinor: 0, creditMinor: reverseAmount },
          ],
        });
        if (reversalLedger.inserted) {
          await client.query(
            `UPDATE payouts
             SET reversed_minor = reversed_minor + $2,
                 status = CASE WHEN reversed_minor + $2 >= amount_minor THEN 'reversed' ELSE status END
             WHERE id = $1`,
            [prepared.payment.payout_id, reverseAmount],
          );
          await client.query(
            'UPDATE payments SET transferred_minor = GREATEST(0, transferred_minor - $2) WHERE id = $1',
            [paymentId, reverseAmount],
          );
        }
        return reversalLedger.inserted;
      });
      if (reversalInserted) {
        prepared.payment.transferred_minor = Math.max(
          0,
          Number(prepared.payment.transferred_minor) - reverseAmount,
        );
      }
    }
  }
  const providerRefund = await stripeProvider.createRefund({
    chargeId: prepared.payment.provider_charge_id,
    amountMinor: Number(prepared.refund.amount_minor),
    reverseTransfer: false,
    refundPlatformFee: false,
    idempotencyKey: providerOperationIdempotencyKey('refund', prepared.refund.id),
    metadata: { sit_booking_id: prepared.payment.booking_id, sit_payment_id: paymentId, currency: prepared.payment.currency },
  });
  const response = await inTransaction(async (client) => {
    const totalRefunded = Number(prepared.payment.refunded_minor) + Number(prepared.refund.amount_minor);
    const finalStatus = totalRefunded === Number(prepared.payment.captured_minor) ? 'refunded' : 'partially_refunded';
    await client.query(
      `UPDATE refunds SET provider_refund_id = $2, status = 'succeeded', succeeded_at = now()
       WHERE id = $1`,
      [prepared.refund.id, providerRefund.id],
    );
    await client.query(
      `UPDATE payments SET status = $2, refunded_minor = $3 WHERE id = $1`,
      [paymentId, finalStatus, totalRefunded],
    );
    await insertLedger(client, {
      key: `${key}:refund-ledger`, bookingId: prepared.payment.booking_id,
      paymentId, refundId: prepared.refund.id,
      type: 'payment_refunded', currency: prepared.payment.currency,
      providerReference: providerRefund.id,
      entries: refundLedger({
        amountMinor: Number(prepared.refund.amount_minor),
        ownerShareMinor: prepared.split.ownerShareMinor,
        platformShareMinor: prepared.split.platformShareMinor,
        ownerId: prepared.payment.owner_id,
      }),
    });
    if (finalStatus === 'refunded') {
      await client.query(
        `UPDATE bookings SET status = 'completed', workflow_status = 'refunded',
             refunded_at = COALESCE(refunded_at, now()), workflow_revision = workflow_revision + 1,
             version = version + 1 WHERE id = $1`,
        [prepared.payment.booking_id],
      );
      await enqueueBookingNotifications(client, {
        bookingId: prepared.payment.booking_id,
        eventKey: `booking:${prepared.payment.booking_id}:refunded:${key}`,
        workflowStatus: 'refunded',
      });
    }
    await enqueueFinancialNotification(client, {
      bookingId: prepared.payment.booking_id,
      eventKey: `refund:${prepared.refund.id}:succeeded`,
      kind: 'booking_refunded', recipientRole: 'renter',
      amountMinor: prepared.refund.amount_minor, currency: prepared.payment.currency,
    });
    const value = {
      refund: {
        id: prepared.refund.id, status: 'succeeded',
        amountMinor: Number(prepared.refund.amount_minor), currency: prepared.payment.currency,
      },
      payment: shapePayment({ ...prepared.payment, status: finalStatus, refunded_minor: totalRefunded, updated_at: new Date() }),
      replayed: false,
    };
    await completeCommand(client, key, paymentId, value);
    await audit(client, {
      actorId: actor?.id ?? null, actorRole: actor?.role ?? 'system',
      action: 'payment.refunded', resourceType: 'payment', resourceId: paymentId,
      metadata: { amountMinor: prepared.refund.amount_minor, reason },
    });
    return value;
  });
  return response;
}

export async function releasePayout({ actor = null, paymentId, key: rawKey }) {
  ensurePaymentsEnabled(actor?.id ?? null);
  if (actor && actor.role !== 'admin') throw new PaymentDomainError(403, 'payout_release_requires_admin');
  const key = paymentIdempotencyKey(rawKey, 'payment.release');
  const prepared = await inTransaction(async (client) => {
    const result = await client.query(
      `SELECT payment.*, booking.owner_id, booking.workflow_status, booking.completed_at,
              booking.ends_at, booking.return_state, booking.payout_instruction_due_at,
              request.payload AS booking_payload,
              connected.provider_account_id, connected.account_api_version,
              connected.recipient_transfers_status, connected.payouts_enabled,
              connected.dashboard_type,
              connected.fees_collector, connected.losses_collector,
              COALESCE(refunded.owner_share_minor, 0) AS refunded_owner_minor
       FROM payments AS payment
       JOIN bookings AS booking ON booking.id = payment.booking_id
       JOIN rental_requests AS request ON request.id = booking.id
       LEFT JOIN stripe_connect_accounts AS connected ON connected.user_id = booking.owner_id
       LEFT JOIN LATERAL (
         SELECT sum(owner_share_minor)::bigint AS owner_share_minor
         FROM refunds WHERE payment_id = payment.id AND status = 'succeeded'
       ) AS refunded ON true
       WHERE payment.id::text = $1 FOR UPDATE OF payment, booking`,
      [paymentId],
    );
    if (!result.rowCount) throw new PaymentDomainError(404, 'payment_not_found');
    const payment = result.rows[0];
    if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
      throw new PaymentDomainError(409, 'payment_not_settled');
    }
    if (!['completed', 'cancelled'].includes(payment.workflow_status)) {
      throw new PaymentDomainError(409, 'booking_not_completed');
    }
    const fallbackBase = payment.workflow_status === 'cancelled'
      ? payment.ends_at
      : payment.completed_at;
    const availableAt = payment.workflow_status === 'completed'
      && payment.payout_instruction_due_at
      ? new Date(payment.payout_instruction_due_at)
      : new Date(new Date(fallbackBase).getTime()
          + config.payments.payoutHoldHours * 3_600_000);
    if (Date.now() < availableAt.getTime()) {
      throw new PaymentDomainError(409, 'payout_hold_active', { availableAt: availableAt.toISOString() });
    }
    const dispute = await client.query(
      `SELECT 1 FROM disputes
       WHERE booking_id = $1 AND (
         status IN ('open', 'investigating', 'waiting_for_user')
         OR (provider_dispute_id IS NOT NULL AND COALESCE(provider_status, '') <> 'won')
       ) LIMIT 1`,
      [payment.booking_id],
    );
    if (dispute.rowCount) throw new PaymentDomainError(409, 'payout_blocked_by_dispute');
    const suspension = await client.query(
      `SELECT 1 FROM user_suspensions
       WHERE user_id = $1 AND scope IN ('account', 'payout')
         AND lifted_at IS NULL AND starts_at <= now()
         AND (ends_at IS NULL OR ends_at > now())
       LIMIT 1`,
      [payment.owner_id],
    );
    if (suspension.rowCount) throw new PaymentDomainError(409, 'payout_blocked_by_moderation');
    if (!payment.provider_account_id || !connectedAccountRowReady(payment)) {
      throw new PaymentDomainError(409, 'owner_payout_account_not_ready');
    }
    const activePayout = await client.query(
      `SELECT idempotency_key FROM payouts
       WHERE payment_id = $1 AND status IN ('scheduled', 'pending')
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [paymentId],
    );
    if (activePayout.rowCount && activePayout.rows[0].idempotency_key !== key) {
      throw new PaymentDomainError(409, 'payout_in_progress');
    }
    const payload = payment.booking_payload && typeof payment.booking_payload === 'object'
      ? payment.booking_payload
      : {};
    const contestedAuthorizedMinor = payment.return_state === 'needsReview'
      && !payload.returnCaseClosedAt
      ? Number(payload.contestedAuthorizedMinor ?? 0)
      : 0;
    const payoutAmounts = privatePilotReleasableOwnerAmount({
      paymentAmountMinor: Number(payment.amount_minor),
      ownerPayoutMinor: Number(payment.owner_payout_minor),
      refundedOwnerMinor: Number(payment.refunded_owner_minor),
      transferredMinor: Number(payment.transferred_minor),
      contestedAuthorizedMinor,
    });
    const amount = payoutAmounts.releasableMinor;
    if (amount <= 0) {
      const existing = await client.query('SELECT * FROM payouts WHERE payment_id = $1 ORDER BY created_at DESC LIMIT 1', [paymentId]);
      if (!existing.rowCount && payoutAmounts.heldOwnerMinor > 0) {
        throw new PaymentDomainError(409, 'payout_held_by_return_case', {
          heldOwnerMinor: payoutAmounts.heldOwnerMinor,
        });
      }
      return { replay: true, payment, payout: existing.rows[0] };
    }
    const command = await beginCommand(client, {
      key, actorId: actor?.id ?? null, type: 'payment.release',
      request: { paymentId, amountMinor: amount }, bookingId: payment.booking_id, paymentId,
    });
    if (command.completed_at) return { commandReplay: command.response_payload };
    const existingPayout = await client.query('SELECT * FROM payouts WHERE idempotency_key = $1', [key]);
    const payout = existingPayout.rowCount ? existingPayout : await client.query(
      `INSERT INTO payouts (
         booking_id, payee_id, payment_id, idempotency_key, status,
         amount_minor, currency, available_at, provider_connected_account_id, livemode
       ) VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8, $9)
       RETURNING *`,
      [payment.booking_id, payment.owner_id, paymentId, key, amount, payment.currency, availableAt, payment.provider_account_id, config.payments.livemode],
    );
    return { payment, payout: payout.rows[0], amount };
  });
  if (prepared.commandReplay) return { ...prepared.commandReplay, replayed: true };
  if (prepared.replay) return {
    payout: prepared.payout ? { id: prepared.payout.id, status: prepared.payout.status } : null,
    payment: shapePayment(prepared.payment), replayed: true,
  };
  const transfer = await stripeProvider.createTransfer({
    accountId: prepared.payment.provider_account_id,
    chargeId: prepared.payment.provider_charge_id,
    amountMinor: prepared.amount,
    currency: prepared.payment.currency,
    transferGroup: prepared.payment.transfer_group,
    idempotencyKey: providerOperationIdempotencyKey('payout_transfer', prepared.payout.id),
    metadata: { sit_booking_id: prepared.payment.booking_id, sit_payment_id: paymentId, sit_payout_id: prepared.payout.id },
  });
  return inTransaction(async (client) => {
    await client.query(
      `UPDATE payouts SET status = 'paid', provider_transfer_id = $2,
           transferred_at = now(), paid_at = now() WHERE id = $1`,
      [prepared.payout.id, transfer.id],
    );
    await client.query('UPDATE payments SET transferred_minor = transferred_minor + $2 WHERE id = $1', [paymentId, prepared.amount]);
    await insertLedger(client, {
      key: `${key}:transfer-ledger`, bookingId: prepared.payment.booking_id,
      paymentId, payoutId: prepared.payout.id,
      type: 'owner_transfer', currency: prepared.payment.currency,
      providerReference: transfer.id,
      entries: transferLedger({ amountMinor: prepared.amount, ownerId: prepared.payment.owner_id }),
    });
    await enqueueFinancialNotification(client, {
      bookingId: prepared.payment.booking_id,
      eventKey: `payout:${prepared.payout.id}:paid`, kind: 'payout_sent',
      recipientRole: 'owner', amountMinor: prepared.amount, currency: prepared.payment.currency,
    });
    const value = {
      payout: { id: prepared.payout.id, status: 'paid', amountMinor: prepared.amount, currency: prepared.payment.currency },
      payment: shapePayment({ ...prepared.payment, transferred_minor: Number(prepared.payment.transferred_minor) + prepared.amount, updated_at: new Date() }),
      replayed: false,
    };
    await completeCommand(client, key, paymentId, value);
    await audit(client, {
      actorId: actor?.id ?? null, actorRole: actor?.role ?? 'system',
      action: 'payout.released', resourceType: 'payout', resourceId: prepared.payout.id,
      metadata: { paymentId, amountMinor: prepared.amount },
    });
    return value;
  });
}

export async function reconcilePaymentLifecycle() {
  if (!config.payments.enabled) return { refunds: 0, payouts: 0, failures: 0 };
  let refunds = 0;
  let payouts = 0;
  let failures = 0;
  const cancelled = await pool.query(
    `SELECT payment.id, payment.captured_minor, payment.refunded_minor,
            request.payload AS booking_payload
     FROM payments AS payment
     JOIN bookings AS booking ON booking.id = payment.booking_id
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.workflow_status = 'cancelled'
       AND payment.status IN ('captured', 'partially_refunded')
       AND payment.captured_minor > payment.refunded_minor
     ORDER BY booking.updated_at LIMIT 20`,
  );
  for (const row of cancelled.rows) {
    try {
      const outcome = row.booking_payload?.cancellationOutcome;
      if (outcome?.calculationStatus !== 'final') continue;
      const configuredTarget = Number(outcome?.refundMinor);
      if (!Number.isSafeInteger(configuredTarget)) continue;
      const targetRefundMinor = Math.min(
        Number(row.captured_minor),
        Math.max(0, configuredTarget),
      );
      const remainingRefundMinor = targetRefundMinor - Number(row.refunded_minor);
      if (remainingRefundMinor <= 0) continue;
      await refundPayment({
        paymentId: row.id,
        amountMinor: remainingRefundMinor,
        key: `system:cancel-refund:${row.id}`,
      });
      refunds += 1;
    } catch (error) {
      if (!['payment_not_refundable'].includes(error.code)) failures += 1;
    }
  }
  const resolvedReturnCases = await pool.query(
    `SELECT payment.id, payment.captured_minor, payment.refunded_minor,
            request.payload AS booking_payload
     FROM payments AS payment
     JOIN bookings AS booking ON booking.id = payment.booking_id
     JOIN rental_requests AS request ON request.id = booking.id
     WHERE booking.workflow_status = 'completed'
       AND booking.return_state = 'closed'
       AND payment.status IN ('captured', 'partially_refunded')
       AND payment.captured_minor > payment.refunded_minor
       AND request.payload #> '{returnCaseResolution}' IS NOT NULL
     ORDER BY booking.updated_at LIMIT 20`,
  );
  for (const row of resolvedReturnCases.rows) {
    try {
      const configuredTarget = Number(
        row.booking_payload?.returnCaseResolution?.authorizedRefundMinor,
      );
      if (!Number.isSafeInteger(configuredTarget)) continue;
      const targetRefundMinor = Math.min(
        Number(row.captured_minor),
        Math.max(0, configuredTarget),
      );
      const remainingRefundMinor = targetRefundMinor - Number(row.refunded_minor);
      if (remainingRefundMinor <= 0) continue;
      await refundPayment({
        paymentId: row.id,
        amountMinor: remainingRefundMinor,
        reason: 'return_case_resolution',
        key: `system:return-case-refund:${row.id}`,
      });
      refunds += 1;
    } catch (error) {
      if (!['payment_not_refundable'].includes(error.code)) failures += 1;
    }
  }
  const eligible = await pool.query(
    `SELECT payment.id, payment.transferred_minor, booking.return_state
     FROM payments AS payment JOIN bookings AS booking ON booking.id = payment.booking_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(owner_share_minor), 0)::bigint AS owner_share_minor
       FROM refunds WHERE payment_id = payment.id AND status = 'succeeded'
     ) AS refunded ON true
     WHERE booking.workflow_status IN ('completed', 'cancelled')
       AND payment.status IN ('captured', 'partially_refunded')
       AND payment.transferred_minor < payment.owner_payout_minor - refunded.owner_share_minor
       AND (
         (booking.workflow_status = 'completed' AND (
           booking.payout_instruction_due_at <= now()
           OR (
             booking.payout_instruction_due_at IS NULL
             AND booking.completed_at <= now() - ($1::text || ' hours')::interval
           )
         ))
         OR (
           booking.workflow_status = 'cancelled'
           AND booking.ends_at <= now() - ($1::text || ' hours')::interval
         )
       )
     ORDER BY COALESCE(booking.payout_instruction_due_at, booking.completed_at, booking.ends_at)
     LIMIT 20`,
    [config.payments.payoutHoldHours],
  );
  for (const row of eligible.rows) {
    try {
      await releasePayout({
        paymentId: row.id,
        key: `system:payout:${row.id}:${row.transferred_minor}:${row.return_state}`,
      });
      payouts += 1;
    } catch (error) {
      if (!['payout_blocked_by_dispute', 'owner_payout_account_not_ready'].includes(error.code)) failures += 1;
    }
  }
  return { refunds, payouts, failures };
}

export async function paymentHealth() {
  if (!config.payments.enabled) return { transport: 'disabled', pending: 0, failedEvents: 0, unbalanced: 0 };
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM payments WHERE status IN ('created', 'requires_action', 'authorized')) AS pending,
       (SELECT count(*)::int FROM payment_provider_events WHERE status = 'failed') AS failed_events,
       (SELECT count(*)::int FROM (
          SELECT transaction_id FROM ledger_entries GROUP BY transaction_id
          HAVING sum(debit_minor) <> sum(credit_minor)
        ) AS mismatch) AS unbalanced`,
  );
  return {
    transport: config.payments.transport,
    livemode: config.payments.livemode,
    pending: result.rows[0].pending,
    failedEvents: result.rows[0].failed_events,
    unbalanced: result.rows[0].unbalanced,
  };
}
