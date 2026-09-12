import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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

import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { applyProviderEvent } from '../src/payment_workflow.js';
import { hashPassword, signAccessToken } from '../src/security.js';

const baseUrl = (process.env.ACCEPTANCE_BASE_URL || 'http://127.0.0.1:8080/v1')
  .replace(/\/$/, '');
const runId = `b8-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const password = createEphemeralAcceptancePassword();

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
  const responseText = await response.text();
  let value = responseText;
  try {
    value = responseText ? JSON.parse(responseText) : null;
  } catch {
    // HTML responses are deliberately returned as text.
  }
  assert.ok(
    expected.includes(response.status),
    `${method} ${path}: expected ${expected.join('/')} but received ${response.status}: ${responseText.slice(0, 500)}`,
  );
  return { response, value, text: responseText };
}

async function main() {
  assert.equal(config.payments.transport, 'memory', 'B8 acceptance requires PAYMENT_TRANSPORT=memory');
  assert.equal(config.payments.livemode, false, 'B8 acceptance must never run in live mode');
  await assertClosedPilotLegalReadiness(pool);

  const passwordHash = await hashPassword(password);
  const users = {
    owner: {
      id: `${runId}-owner`,
      email: `${runId}-owner@example.invalid`,
      displayName: 'B8 Staging Owner',
      role: 'user',
      sessionId: crypto.randomUUID(),
    },
    renter: {
      id: `${runId}-renter`,
      email: `${runId}-renter@example.invalid`,
      displayName: 'B8 Staging Renter',
      role: 'user',
      sessionId: crypto.randomUUID(),
    },
    admin: {
      id: `${runId}-admin`,
      email: `${runId}-admin@example.invalid`,
      displayName: 'B8 Staging Admin',
      role: 'admin',
      sessionId: crypto.randomUUID(),
    },
  };

  for (const user of Object.values(users)) {
    await pool.query(
      `INSERT INTO users (
         id, email, password_hash, profile, role, account_status,
         email_verified_at, terms_accepted_at, privacy_accepted_at,
         minimum_age_confirmed_at, private_use_confirmed_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, 'active', now(), now(), now(), now(), now())`,
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
          role: user.role,
        }),
        user.role,
      ],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, device_label)
       VALUES ($1, $2, 'B8 staging acceptance')`,
      [user.sessionId, user.id],
    );
    user.token = signAccessToken(
      { id: user.id, email: user.email },
      { sessionId: user.sessionId },
    );
  }

  const adminElevation = await api('/admin/step-up', {
    method: 'POST',
    token: users.admin.token,
    body: { currentPassword: password },
  });
  const adminStepUpHeaders = {
    'X-Admin-Step-Up': adminElevation.value.elevation.token,
  };

  const connect = await api('/payments/connect/onboarding', {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-connect-owner` },
    body: { country: 'DE', currency: 'EUR' },
    expected: [201],
  });
  assert.equal(connect.value.providerMode, 'memory');
  assert.equal(connect.value.account.ready, true);
  assert.match(connect.value.onboardingUrl, /^http/);
  const connectStatus = await api('/payments/connect/status', { token: users.owner.token });
  assert.equal(connectStatus.value.account.ready, true);

  const listingImage = await sharp({
    create: {
      width: 960,
      height: 640,
      channels: 3,
      background: { r: 17, g: 116, b: 96 },
    },
  }).jpeg({ quality: 91 }).toBuffer();
  const listingForm = new FormData();
  listingForm.append('purpose', 'listing_image');
  listingForm.append('file', new Blob([listingImage], { type: 'image/jpeg' }), 'b8-camera.jpg');
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
      title: 'B8 Staging Zahlungstestkamera',
      description: 'Isoliertes Staging-Inserat für die B8 Zahlungs- und Ledger-Abnahme.',
      ...closedPilotListingCategory,
      tags: ['b8', 'payment'],
      pricePerDay: 20,
      priceRaw: 20,
      priceUnit: 'day',
      currency: 'EUR',
      deposit: null,
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
  assert.equal(listing.deposit, null);
  assert.equal(listing.protectionModel, 'none');

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
  const bookingDates = {
    itemId: listingId,
    startDate: dateOnly(60),
    endDate: dateOnly(62),
  };
  const quote = (await api('/bookings/quote', {
    method: 'POST',
    token: users.renter.token,
    body: closedPilotQuoteBody(bookingDates),
  })).value;
  const created = await api('/bookings', {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-create-booking` },
    body: closedPilotBookingBody({
      id: bookingId,
      ...bookingDates,
      quote,
    }),
    expected: [201],
  });
  assert.equal(created.value.booking.workflowStatus, 'requested');
  assert.equal(created.value.booking.quote.securityDepositMinor, 0);

  const accepted = await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-accept-booking` },
    body: closedPilotOwnerAcceptanceBody(),
  });
  assert.equal(accepted.value.booking.workflowStatus, 'accepted');

  const checkoutRequest = () => api(`/bookings/${bookingId}/payment/checkout`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-checkout` },
    body: {},
    expected: [200, 201],
  });
  const checkout = await checkoutRequest();
  assert.equal(checkout.response.status, 201);
  assert.equal(checkout.value.providerMode, 'memory');
  assert.equal(checkout.value.payment.status, 'created');
  assert.ok(checkout.value.payment.amountMinor > 0);
  assert.equal(
    checkout.value.payment.ownerPayoutMinor + checkout.value.payment.platformFeeMinor,
    checkout.value.payment.amountMinor,
  );
  const checkoutReplay = await checkoutRequest();
  assert.equal(checkoutReplay.response.status, 200);
  assert.equal(checkoutReplay.value.replayed, true);

  const paymentId = checkout.value.payment.id;
  const requiresAction = await api(`/payments/${paymentId}/simulate`, {
    method: 'POST',
    token: users.renter.token,
    body: { scenario: 'requires_action' },
  });
  assert.equal(requiresAction.value.status, 'processed');

  const successRequest = () => api(`/payments/${paymentId}/simulate`, {
    method: 'POST',
    token: users.renter.token,
    body: { scenario: 'succeeded', duplicate: true },
  });
  const success = await successRequest();
  assert.equal(success.value.duplicate, false);
  const duplicateSuccess = await successRequest();
  assert.equal(duplicateSuccess.value.duplicate, true);

  const paid = await api(`/bookings/${bookingId}/payment`, { token: users.renter.token });
  assert.equal(paid.value.bookingStatus, 'confirmed');
  assert.equal(paid.value.payment.status, 'captured');
  assert.equal(paid.value.payment.capturedMinor, paid.value.payment.amountMinor);
  assert.equal(Object.hasOwn(paid.value, 'depositConsentVersion'), false);

  const captured = (await pool.query(
    `SELECT provider_payment_id, provider_charge_id FROM payments WHERE id = $1`,
    [paymentId],
  )).rows[0];
  assert.ok(captured.provider_payment_id);
  assert.ok(captured.provider_charge_id);

  const providerDisputeId = `dp_memory_${runId}`;
  const providerDisputeObject = {
    id: providerDisputeId,
    object: 'dispute',
    charge: captured.provider_charge_id,
    amount: paid.value.payment.amountMinor,
    currency: 'eur',
    reason: 'fraudulent',
    status: 'under_review',
    evidence_details: { due_by: Math.floor(Date.now() / 1000) + 604800 },
  };
  for (const [suffix, type, status] of [
    ['created', 'charge.dispute.created', 'under_review'],
    ['withdrawn', 'charge.dispute.funds_withdrawn', 'under_review'],
    ['reinstated', 'charge.dispute.funds_reinstated', 'won'],
  ]) {
    const event = {
      id: `evt_memory_${runId}_${suffix}`,
      object: 'event',
      type,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: { ...providerDisputeObject, status } },
    };
    const result = await applyProviderEvent(event, Buffer.from(JSON.stringify(event)));
    assert.equal(result.status, 'processed');
  }
  const chargebackLedger = await pool.query(
    `SELECT transaction_type FROM ledger_transactions
     WHERE provider_reference = $1 ORDER BY created_at, transaction_type`,
    [providerDisputeId],
  );
  assert.deepEqual(
    chargebackLedger.rows.map((row) => row.transaction_type).sort(),
    ['chargeback', 'chargeback_reversed'],
  );
  await pool.query(
    `UPDATE disputes SET status = 'closed', resolved_at = now()
     WHERE provider_dispute_id = $1`,
    [providerDisputeId],
  );
  await pool.query(
    `UPDATE bookings SET workflow_status = 'confirmed', workflow_revision = workflow_revision + 1
     WHERE id = $1`,
    [bookingId],
  );

  const disabledDepositRoute = await api(`/bookings/${bookingId}/deposit/setup`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-deposit-disabled` },
    body: {},
    expected: [404],
  });
  assert.equal(disabledDepositRoute.response.status, 404);

  const active = await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-activate` },
    body: { status: 'active' },
  });
  assert.equal(active.value.booking.workflowStatus, 'active');
  const completed = await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-complete` },
    body: { status: 'completed' },
  });
  assert.equal(completed.value.booking.workflowStatus, 'completed');
  await pool.query(
    `UPDATE bookings
     SET completed_at = now() - ($2::text || ' hours')::interval - interval '1 minute'
     WHERE id = $1`,
    [bookingId, config.payments.payoutHoldHours],
  );

  await pool.query(
    `UPDATE disputes SET provider_status = 'lost' WHERE provider_dispute_id = $1`,
    [providerDisputeId],
  );
  const blockedPayout = await api(`/payments/${paymentId}/payout-release`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUpHeaders, 'Idempotency-Key': `${runId}-blocked-payout` },
    body: {},
    expected: [409],
  });
  assert.equal(blockedPayout.value.error, 'payout_blocked_by_dispute');
  await pool.query(
    `UPDATE disputes SET provider_status = 'won' WHERE provider_dispute_id = $1`,
    [providerDisputeId],
  );

  const payout = await api(`/payments/${paymentId}/payout-release`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUpHeaders, 'Idempotency-Key': `${runId}-release-payout` },
    body: {},
    expected: [201],
  });
  assert.equal(payout.value.payout.status, 'paid');
  assert.equal(payout.value.payout.amountMinor, paid.value.payment.ownerPayoutMinor);

  const firstRefundMinor = Math.floor(paid.value.payment.amountMinor / 2);
  const finalRefundMinor = paid.value.payment.amountMinor - firstRefundMinor;
  const partialRefund = await api(`/payments/${paymentId}/refunds`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUpHeaders, 'Idempotency-Key': `${runId}-partial-refund` },
    body: { amountMinor: firstRefundMinor, reason: 'staging_partial_refund' },
    expected: [201],
  });
  assert.equal(partialRefund.value.payment.status, 'partially_refunded');

  const noDuplicatePayout = await api(`/payments/${paymentId}/payout-release`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUpHeaders, 'Idempotency-Key': `${runId}-duplicate-payout-probe` },
    body: {},
  });
  assert.equal(noDuplicatePayout.value.replayed, true);

  const finalRefund = await api(`/payments/${paymentId}/refunds`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUpHeaders, 'Idempotency-Key': `${runId}-final-refund` },
    body: { amountMinor: finalRefundMinor, reason: 'staging_final_refund' },
    expected: [201],
  });
  assert.equal(finalRefund.value.payment.status, 'refunded');
  const payoutState = (await pool.query(
    `SELECT status, amount_minor, reversed_minor FROM payouts WHERE payment_id = $1`,
    [paymentId],
  )).rows[0];
  assert.equal(payoutState.status, 'reversed');
  assert.equal(payoutState.reversed_minor, payoutState.amount_minor);

  const ledgerBalance = await pool.query(
    `SELECT tx.id, tx.transaction_type,
            sum(entry.debit_minor)::bigint AS debit,
            sum(entry.credit_minor)::bigint AS credit
     FROM ledger_transactions AS tx
     JOIN ledger_entries AS entry ON entry.transaction_id = tx.id
     WHERE tx.booking_id = $1
     GROUP BY tx.id, tx.transaction_type
     ORDER BY min(tx.created_at), tx.id`,
    [bookingId],
  );
  assert.ok(ledgerBalance.rowCount >= 7);
  assert.ok(ledgerBalance.rows.every((row) => row.debit === row.credit));
  await assert.rejects(
    pool.query(
      `UPDATE ledger_entries SET debit_minor = debit_minor + 1
       WHERE id = (
         SELECT min(entry.id) FROM ledger_entries AS entry
         JOIN ledger_transactions AS tx ON tx.id = entry.transaction_id
         WHERE tx.booking_id = $1
       )`,
      [bookingId],
    ),
    (error) => error?.code === '55000',
  );

  const providerEvents = await pool.query(
    `SELECT event_type, status, processing_attempts
     FROM payment_provider_events
     WHERE object_id IN ($1, $2)
        OR provider_event_id LIKE $3
     ORDER BY received_at, provider_event_id`,
    [captured.provider_payment_id, providerDisputeId, `%${runId}%`],
  );
  assert.ok(providerEvents.rows.length >= 5);
  assert.ok(providerEvents.rows.every((row) => row.status === 'processed'));

  const paymentDeepLink = await api(`/open/payment/${bookingId}`);
  assert.match(paymentDeepLink.text, /Zahlung öffnen/);

  await api(`/listings/${listingId}`, {
    method: 'DELETE',
    token: users.owner.token,
    expected: [204],
  });
  for (const user of [users.renter, users.owner, users.admin]) {
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
  const catalog = await api(`/listings?q=${encodeURIComponent(runId)}`);
  assert.deepEqual(catalog.value.listings, []);

  const versionResponse = await fetch(`${baseUrl.replace(/\/v1$/, '')}/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  const evidence = {
    status: 'passed',
    block: 'B8',
    runId,
    verifiedAt: new Date().toISOString(),
    releaseCommit: version.commit ?? process.env.APP_COMMIT ?? null,
    image: process.env.APP_COMMIT ?? null,
    transport: config.payments.transport,
    livemode: config.payments.livemode,
    bookingId,
    paymentId,
    quote: paid.value.quote,
    checkoutReplay: checkoutReplay.value.replayed,
    requiresAction: requiresAction.value.status,
    providerDuplicateSuppressed: duplicateSuccess.value.duplicate,
    chargebackLedger: chargebackLedger.rows.map((row) => row.transaction_type).sort(),
    deposit: { enabled: false, securityDepositMinor: 0 },
    payout: {
      blockedWhileLost: blockedPayout.value.error,
      paidAmountMinor: payout.value.payout.amountMinor,
      finalStatus: payoutState.status,
      reversedMinor: Number(payoutState.reversed_minor),
    },
    refunds: [firstRefundMinor, finalRefundMinor],
    ledger: {
      transactions: ledgerBalance.rowCount,
      balanced: true,
      appendOnly: true,
    },
    providerEvents: providerEvents.rows.length,
    paymentDeepLink: 'passed',
    cleanup: cleanup.rows[0],
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

try {
  await main();
} finally {
  await pool.end();
}
