import assert from 'node:assert/strict';
import test from 'node:test';
import { StripeProvider } from '../src/stripe_provider.js';

import {
  assertProviderPaymentBinding,
  assertProviderRefundBinding,
  classifyDisputeTransferRecoveryFailure,
  captureLedger,
  disputeOwnerRecoveryLedger,
  disputeOwnerRecoveryReinstatementLedger,
  disputeTransferRecoveryAmount,
  paymentAmounts,
  paymentStatusForProvider,
  refundLedger,
  refundTransferReversalPlan,
  requestHash,
  splitRefund,
  privatePilotReleasableOwnerAmount,
  providerOperationIdempotencyKey,
  stripeSignatureHeader,
  transferLedger,
  verifyStripeSignature,
} from '../src/payment_domain.js';

test('private pilot payout releases only the undisputed authorized owner share', () => {
  const result = privatePilotReleasableOwnerAmount({
    paymentAmountMinor: 1100,
    ownerPayoutMinor: 1000,
    contestedAuthorizedMinor: 330,
  });
  assert.deepEqual(result, {
    ownerAfterRefundsMinor: 1000,
    heldOwnerMinor: 300,
    releasableMinor: 700,
  });
});

test('private pilot payout accounts for refunds and prior transfers', () => {
  const result = privatePilotReleasableOwnerAmount({
    paymentAmountMinor: 1100,
    ownerPayoutMinor: 1000,
    refundedOwnerMinor: 500,
    transferredMinor: 100,
    contestedAuthorizedMinor: 110,
  });
  assert.equal(result.heldOwnerMinor, 100);
  assert.equal(result.releasableMinor, 300);
});

function balanced(entries) {
  return entries.reduce((sum, entry) => sum + entry.debitMinor - entry.creditMinor, 0) === 0;
}

test('payment amounts are copied from the authoritative booking quote', () => {
  assert.deepEqual(paymentAmounts({
    quoted_total_minor: '1190',
    owner_payout_minor: '1000',
    rental_subtotal_minor: '900',
    security_deposit_minor: '5000',
    currency: 'EUR',
  }), {
    amountMinor: 1190,
    ownerPayoutMinor: 1000,
    platformFeeMinor: 190,
    rentalSubtotalMinor: 900,
    securityDepositMinor: 0,
    currency: 'EUR',
  });
  assert.throws(() => paymentAmounts({
    quoted_total_minor: '100', owner_payout_minor: '101', rental_subtotal_minor: '100', currency: 'EUR',
  }), /invalid_booking_payment_amounts/);
});

test('capture, transfer and refund ledger entries always balance', () => {
  const capture = captureLedger({ amountMinor: 1190, ownerPayoutMinor: 1000, platformFeeMinor: 190, ownerId: 'owner' });
  const transfer = transferLedger({ amountMinor: 1000, ownerId: 'owner' });
  const split = splitRefund({ amountMinor: 595, paymentAmountMinor: 1190, ownerPayoutMinor: 1000 });
  const refund = refundLedger({ amountMinor: 595, ...split, ownerId: 'owner' });
  assert.equal(balanced(capture), true);
  assert.equal(balanced(transfer), true);
  assert.equal(balanced(refund), true);
  assert.deepEqual(split, { ownerShareMinor: 500, platformShareMinor: 95 });
});

test('refund transfer reversal plan spans immutable payouts newest first', () => {
  assert.deepEqual(refundTransferReversalPlan({
    ownerShareMinor: 800,
    transferredMinor: 1000,
    payouts: [
      {
        id: 'payout-new',
        provider_transfer_id: 'tr_new',
        amount_minor: '300',
        reversed_minor: '0',
      },
      {
        id: 'payout-old',
        provider_transfer_id: 'tr_old',
        amount_minor: '700',
        reversed_minor: '0',
      },
    ],
  }), {
    targetMinor: 800,
    allocations: [
      { payoutId: 'payout-new', providerTransferId: 'tr_new', amountMinor: 300 },
      { payoutId: 'payout-old', providerTransferId: 'tr_old', amountMinor: 500 },
    ],
  });
});

test('refund transfer reversal plan fails closed on missing payout exposure', () => {
  assert.throws(() => refundTransferReversalPlan({
    ownerShareMinor: 800,
    transferredMinor: 1000,
    payouts: [{
      id: 'payout-only',
      provider_transfer_id: 'tr_only',
      amount_minor: '700',
      reversed_minor: '0',
    }],
  }), (error) => error.code === 'refund_transfer_exposure_mismatch');
});

test('chargeback recovery is proportional, paid-exposure-bounded and replay-aware', () => {
  assert.deepEqual(disputeTransferRecoveryAmount({
    disputeAmountMinor: 595,
    paymentAmountMinor: 1190,
    ownerPayoutMinor: 1000,
    transferredMinor: 800,
  }), {
    disputedOwnerShareMinor: 500,
    targetOwnerRecoveryMinor: 500,
    remainingOwnerRecoveryMinor: 500,
  });
  assert.deepEqual(disputeTransferRecoveryAmount({
    disputeAmountMinor: 1190,
    paymentAmountMinor: 1190,
    ownerPayoutMinor: 1000,
    transferredMinor: 200,
    alreadyRecoveredMinor: 300,
  }), {
    disputedOwnerShareMinor: 1000,
    targetOwnerRecoveryMinor: 500,
    remainingOwnerRecoveryMinor: 200,
  });
});

test('chargeback owner recovery and later reinstatement remain balanced and distinct', () => {
  const recovered = disputeOwnerRecoveryLedger({ amountMinor: 500 });
  const reinstated = disputeOwnerRecoveryReinstatementLedger({
    amountMinor: 500,
    ownerId: 'owner-1',
  });
  assert.equal(balanced(recovered), true);
  assert.equal(balanced(reinstated), true);
  assert.deepEqual(recovered.map((entry) => entry.accountCode), [
    'stripe_clearing',
    'chargeback_expense',
  ]);
  assert.deepEqual(reinstated.map((entry) => entry.accountCode), [
    'chargeback_expense',
    'owner_payable',
  ]);
});

test('only exact structured reversal rejections are definite', () => {
  const definite = classifyDisputeTransferRecoveryFailure({
    status: 409,
    code: 'resource_missing',
    details: { providerStatus: 404, providerType: 'StripeInvalidRequestError' },
  });
  assert.equal(definite.disposition, 'manual_review');
  assert.equal(definite.category, 'definite_provider_rejection');

  for (const error of [
    { status: 503, code: 'stripe_request_failed', details: { providerStatus: 0 } },
    { status: 409, code: 'timeout', details: { providerStatus: 408 } },
    { status: 409, code: 'too_many_requests', details: { providerStatus: 429 } },
    { status: 409, code: 'bad_request', details: { providerStatus: 400 } },
    { status: 409, code: 'resource_missing', details: { providerStatus: 404 } },
    { status: 409, code: 'resource_missing', details: {
      providerStatus: 404,
      providerType: 'ProxyError',
    } },
  ]) {
    assert.equal(
      classifyDisputeTransferRecoveryFailure(error).disposition,
      'uncertain',
    );
  }
  assert.equal(classifyDisputeTransferRecoveryFailure({
    status: 409,
    code: 'balance_insufficient',
    details: { providerStatus: 400, providerType: 'StripeInvalidRequestError' },
  }).disposition, 'retryable');
});

test('Stripe webhook signatures reject tampering, expiry and malformed headers', () => {
  const secret = 'whsec_unit_test_secret';
  const rawBody = Buffer.from('{"id":"evt_test","type":"payment_intent.succeeded"}');
  const now = Date.now();
  const header = stripeSignatureHeader({ payload: rawBody, secret, timestamp: Math.floor(now / 1000) });
  assert.equal(verifyStripeSignature({ rawBody, header, secret, now }), true);
  assert.throws(() => verifyStripeSignature({ rawBody: Buffer.from(`${rawBody}x`), header, secret, now }), /invalid_webhook_signature/);
  assert.throws(() => verifyStripeSignature({ rawBody, header, secret, now: now + 301_000 }), /expired_webhook_signature/);
  assert.throws(() => verifyStripeSignature({ rawBody, header: 'invalid', secret, now }), /invalid_webhook_signature/);
});

test('provider events map to authoritative payment states', () => {
  assert.equal(paymentStatusForProvider('payment_intent.succeeded', {}), 'captured');
  assert.equal(paymentStatusForProvider('payment_intent.payment_failed', {}), 'failed');
  assert.equal(paymentStatusForProvider('checkout.session.expired', {}), 'cancelled');
  assert.equal(paymentStatusForProvider('checkout.session.async_payment_failed', {}), 'failed');
  assert.equal(paymentStatusForProvider('payment_intent.amount_capturable_updated', {}), 'authorized');
  assert.equal(paymentStatusForProvider('checkout.session.completed', { status: 'complete', payment_status: 'paid' }), null);
  assert.equal(paymentStatusForProvider('checkout.session.async_payment_succeeded', { status: 'complete', payment_status: 'paid' }), null);
  assert.equal(paymentStatusForProvider('charge.refund.updated', { status: 'succeeded' }), null);
  assert.equal(paymentStatusForProvider('payment_intent.processing', { status: 'processing' }), null);
  assert.equal(paymentStatusForProvider('unrelated.event', {}), null);
});

test('request hashes are stable across object key order', () => {
  assert.equal(requestHash({ b: 2, a: { d: 4, c: 3 } }), requestHash({ a: { c: 3, d: 4 }, b: 2 }));
});

test('provider idempotency is durable, namespaced and does not expose local identifiers', () => {
  const first = providerOperationIdempotencyKey('checkout', 'private-payment-id');
  assert.equal(first, providerOperationIdempotencyKey('checkout', 'private-payment-id'));
  assert.notEqual(first, providerOperationIdempotencyKey('refund', 'private-payment-id'));
  assert.notEqual(first, providerOperationIdempotencyKey('checkout', 'different-payment-id'));
  assert.equal(first.includes('private-payment-id'), false);
  assert.match(first, /^sit_checkout_[a-f0-9]{64}$/u);
  assert.throws(
    () => providerOperationIdempotencyKey('Invalid namespace', 'payment'),
    /invalid_provider_operation_identity/u,
  );
});

test('provider payment events require exact local principal, object and mode binding', () => {
  const payment = {
    id: 'payment-1',
    booking_id: 'booking-1',
    provider_payment_id: 'pi-1',
    provider_checkout_session_id: 'cs-1',
    provider_customer_id: 'cus-1',
    transfer_group: 'booking_booking-1',
    livemode: false,
  };
  const event = { livemode: false };
  const intent = {
    id: 'pi-1',
    object: 'payment_intent',
    customer: 'cus-1',
    transfer_group: 'booking_booking-1',
    metadata: { sit_payment_id: 'payment-1', sit_booking_id: 'booking-1' },
  };
  assert.equal(assertProviderPaymentBinding({ payment, event, object: intent }), true);
  assert.equal(assertProviderPaymentBinding({
    payment: { ...payment, provider_payment_id: null },
    event,
    object: intent,
  }), true);
  assert.equal(assertProviderPaymentBinding({
    payment,
    event,
    object: {
      id: 'cs-1',
      object: 'checkout.session',
      customer: 'cus-1',
      client_reference_id: 'booking-1',
      metadata: { sit_payment_id: 'payment-1', sit_booking_id: 'booking-1' },
    },
  }), true);

  for (const [changedPayment, changedEvent, changedObject] of [
    [payment, event, { ...intent, id: 'pi-other' }],
    [payment, event, { ...intent, customer: 'cus-other' }],
    [payment, event, { ...intent, transfer_group: 'booking_other' }],
    [payment, event, { ...intent, metadata: { ...intent.metadata, sit_payment_id: 'payment-other' } }],
    [payment, event, { ...intent, metadata: { ...intent.metadata, sit_booking_id: 'booking-other' } }],
    [payment, { livemode: true }, intent],
    [payment, event, { ...intent, object: 'charge' }],
  ]) {
    assert.throws(
      () => assertProviderPaymentBinding({
        payment: changedPayment,
        event: changedEvent,
        object: changedObject,
      }),
      (error) => error.status === 409 && error.code === 'provider_payment_binding_mismatch',
    );
  }
});

test('provider refunds require exact payment, amount, currency, mode and metadata binding', () => {
  const refund = { id: 'refund-1', amount_minor: '595' };
  const payment = {
    id: 'payment-1',
    booking_id: 'booking-1',
    provider_charge_id: 'ch-1',
    currency: 'EUR',
    livemode: false,
  };
  const providerRefund = {
    id: 're-1',
    charge: 'ch-1',
    amount: 595,
    currency: 'eur',
    livemode: false,
    status: 'succeeded',
    metadata: {
      sit_booking_id: 'booking-1',
      sit_payment_id: 'payment-1',
      sit_refund_id: 'refund-1',
    },
  };
  assert.equal(assertProviderRefundBinding({ refund, payment, providerRefund }), true);
  for (const changed of [
    { ...providerRefund, id: '' },
    { ...providerRefund, charge: 'ch-other' },
    { ...providerRefund, amount: 596 },
    { ...providerRefund, currency: 'usd' },
    { ...providerRefund, livemode: true },
    { ...providerRefund, metadata: { ...providerRefund.metadata, sit_booking_id: 'booking-other' } },
    { ...providerRefund, metadata: { ...providerRefund.metadata, sit_payment_id: 'payment-other' } },
    { ...providerRefund, metadata: { ...providerRefund.metadata, sit_refund_id: 'refund-other' } },
  ]) {
    assert.throws(
      () => assertProviderRefundBinding({ refund, payment, providerRefund: changed }),
      (error) => error.status === 409 && error.code === 'provider_refund_binding_mismatch',
    );
  }
  assert.throws(
    () => assertProviderRefundBinding({
      refund, payment, providerRefund: { ...providerRefund, status: 'failed' },
    }),
    (error) => error.status === 409 && error.code === 'provider_refund_failed',
  );
  assert.throws(
    () => assertProviderRefundBinding({
      refund, payment, providerRefund: { ...providerRefund, status: 'pending' },
    }),
    (error) => error.status === 503 && error.code === 'provider_refund_pending',
  );
});

test('memory Checkout emulates provider idempotency and rejects parameter drift', async () => {
  const provider = new StripeProvider({ mode: 'memory' });
  const request = {
    paymentId: 'payment-1',
    bookingId: 'booking-1',
    customerId: 'customer-1',
    amountMinor: 1190,
    currency: 'EUR',
    itemTitle: 'Kamera',
    transferGroup: 'booking_booking-1',
    successUrl: 'https://example.test/success',
    cancelUrl: 'https://example.test/cancel',
    expiresAt: 1799539200,
    idempotencyKey: 'stable-provider-key',
  };
  const first = await provider.createPaymentCheckout(request);
  assert.deepEqual(await provider.createPaymentCheckout(request), first);
  await assert.rejects(
    provider.createPaymentCheckout({ ...request, expiresAt: request.expiresAt + 60 }),
    (error) => error.status === 409 && error.code === 'provider_idempotency_payload_mismatch',
  );
  const second = await provider.createPaymentCheckout({
    ...request,
    idempotencyKey: 'different-provider-key',
  });
  assert.notEqual(second.id, first.id);
});

test('Stripe transport creates recipient-only Accounts v2 onboarding', async () => {
  const captured = [];
  const stripeClient = {
    v2: { core: {
      accounts: {
        create: async (...args) => {
          captured.push(['account', ...args]);
          return { id: 'acct_test' };
        },
      },
      accountLinks: {
        create: async (...args) => {
          captured.push(['accountLink', ...args]);
          return { url: 'https://connect.stripe.test/onboard' };
        },
      },
    } },
  };
  const provider = new StripeProvider({
    mode: 'stripe',
    secretKey: 'sk_test_unit',
    stripeClient,
  });
  await provider.createConnectedAccount({
    userId: 'owner-1', email: 'person@example.invalid', country: 'DE', currency: 'EUR',
    idempotencyKey: 'connect:owner-1',
  });
  const [accountKind, accountParams, accountOptions] = captured[0];
  assert.equal(accountKind, 'account');
  assert.equal(accountParams.dashboard, 'express');
  assert.deepEqual(accountParams.defaults.responsibilities, {
    fees_collector: 'application', losses_collector: 'application',
  });
  assert.deepEqual(accountParams.configuration, {
    recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
  });
  assert.equal(Object.hasOwn(accountParams.configuration, 'merchant'), false);
  assert.equal(accountParams.identity.entity_type, 'individual');
  assert.equal(accountOptions.idempotencyKey, 'connect:owner-1');

  await provider.createAccountLink({
    accountId: 'acct_test',
    refreshUrl: 'https://staging.example.test/refresh',
    returnUrl: 'https://staging.example.test/return',
    idempotencyKey: 'connect:owner-1:link',
  });
  const [linkKind, linkParams, linkOptions] = captured[1];
  assert.equal(linkKind, 'accountLink');
  assert.deepEqual(linkParams.use_case.account_onboarding.configurations, ['recipient']);
  assert.equal(linkParams.use_case.account_onboarding.collection_options.fields, 'eventually_due');
  assert.equal(linkOptions.idempotencyKey, 'connect:owner-1:link');
});

test('Stripe SDK checkout, refund and transfer preserve separate-charges semantics', async () => {
  const captured = [];
  const stripeClient = {
    customers: { create: async (...args) => {
      captured.push(['customer', ...args]);
      return { id: 'cus_test' };
    } },
    checkout: { sessions: { create: async (...args) => {
      captured.push(['checkout', ...args]);
      return { id: 'cs_test' };
    } } },
    refunds: { create: async (...args) => {
      captured.push(['refund', ...args]);
      return { id: 're_test' };
    } },
    transfers: {
      create: async (...args) => {
        captured.push(['transfer', ...args]);
        return { id: 'tr_test' };
      },
      createReversal: async (...args) => {
        captured.push(['reversal', ...args]);
        return { id: 'trr_test' };
      },
    },
  };
  const provider = new StripeProvider({ mode: 'stripe', secretKey: 'rk_test_unit', stripeClient });
  await provider.createCustomer({
    userId: 'user-1', email: 'person@example.invalid', name: 'Person', idempotencyKey: 'customer:user-1',
  });
  assert.deepEqual(captured[0][1].metadata, { sit_user_id: 'user-1' });
  assert.equal(captured[0][2].idempotencyKey, 'customer:user-1');

  await provider.createPaymentCheckout({
    paymentId: 'payment-1',
    bookingId: 'booking-1',
    customerId: 'cus_test',
    amountMinor: 1190,
    currency: 'EUR',
    itemTitle: 'Kamera',
    transferGroup: 'booking_booking-1',
    successUrl: 'https://shareittoo.com/api/v1/open/payment/booking-1?result=success',
    cancelUrl: 'https://shareittoo.com/api/v1/open/payment/booking-1?result=cancelled',
    expiresAt: 1799539200,
    idempotencyKey: 'checkout:booking-1',
  });
  const checkoutParams = captured[1][1];
  assert.equal(Object.hasOwn(checkoutParams, 'payment_method_types'), false);
  assert.equal(checkoutParams.payment_intent_data.transfer_group, 'booking_booking-1');
  assert.equal(Object.hasOwn(checkoutParams.payment_intent_data, 'transfer_data'), false);
  assert.equal(Object.hasOwn(checkoutParams.payment_intent_data, 'application_fee_amount'), false);
  assert.equal(Object.hasOwn(checkoutParams.payment_intent_data, 'on_behalf_of'), false);
  assert.equal(Object.hasOwn(checkoutParams.payment_intent_data, 'setup_future_usage'), false);
  assert.match(checkoutParams.integration_identifier, /^shareittoo_android_[a-z]{8}$/u);
  assert.equal(captured[1][2].idempotencyKey, 'checkout:booking-1');

  await provider.createRefund({
    chargeId: 'ch_test', amountMinor: 595, idempotencyKey: 'refund:payment-1',
    metadata: { currency: 'EUR', sit_payment_id: 'payment-1' },
    reverseTransfer: true, refundPlatformFee: true,
  });
  const refundParams = captured[2][1];
  assert.equal(Object.hasOwn(refundParams, 'reverse_transfer'), false);
  assert.equal(Object.hasOwn(refundParams, 'refund_application_fee'), false);
  assert.equal(captured[2][2].idempotencyKey, 'refund:payment-1');

  await provider.createTransfer({
    accountId: 'acct_test', chargeId: 'ch_test', amountMinor: 500,
    currency: 'EUR', transferGroup: 'booking_booking-1',
    idempotencyKey: 'transfer:payment-1', metadata: { sit_payment_id: 'payment-1' },
  });
  assert.equal(captured[3][1].amount, 500);
  assert.equal(captured[3][1].destination, 'acct_test');
  assert.equal(captured[3][1].source_transaction, 'ch_test');
  assert.equal(captured[3][1].transfer_group, 'booking_booking-1');

  await provider.reverseTransfer({
    transferId: 'tr_test', amountMinor: 100, idempotencyKey: 'reversal:payment-1',
    metadata: { sit_payment_id: 'payment-1', sit_recovery_id: 'recovery-1' },
  });
  assert.equal(captured[4][1], 'tr_test');
  assert.equal(captured[4][2].amount, 100);
  assert.equal(captured[4][3].idempotencyKey, 'reversal:payment-1');

  stripeClient.transfers.listReversals = async (...args) => {
    captured.push(['reversal-list', ...args]);
    return {
      data: [{
        id: 'trr_test',
        transfer: 'tr_test',
        amount: 100,
        metadata: { sit_recovery_id: 'recovery-1' },
      }],
      has_more: false,
    };
  };
  assert.equal((await provider.findTransferReversal({
    transferId: 'tr_test',
    recoveryId: 'recovery-1',
  })).id, 'trr_test');
  assert.deepEqual(captured[5].slice(0, 3), [
    'reversal-list',
    'tr_test',
    { limit: 100 },
  ]);

  stripeClient.refunds.list = async (...args) => {
    captured.push(['refund-list', ...args]);
    return {
      data: [{
        id: 're_test',
        charge: 'ch_test',
        amount: 595,
        metadata: { sit_refund_id: 'refund-1' },
      }],
      has_more: false,
    };
  };
  assert.equal((await provider.findRefund({
    chargeId: 'ch_test',
    refundId: 'refund-1',
  })).id, 're_test');
  assert.deepEqual(captured[6].slice(0, 2), [
    'refund-list',
    { charge: 'ch_test', limit: 100 },
  ]);
});

test('memory refund is idempotent, discoverable and rejects parameter drift', async () => {
  const provider = new StripeProvider({ mode: 'memory' });
  const request = {
    chargeId: 'ch-memory-refund',
    amountMinor: 595,
    idempotencyKey: 'memory-refund-stable-key',
    metadata: {
      currency: 'EUR',
      sit_booking_id: 'booking-memory-refund',
      sit_payment_id: 'payment-memory-refund',
      sit_refund_id: 'refund-memory-1',
    },
  };
  const first = await provider.createRefund(request);
  assert.deepEqual(await provider.createRefund(request), first);
  assert.deepEqual(await provider.findRefund({
    chargeId: request.chargeId,
    refundId: request.metadata.sit_refund_id,
  }), first);
  await assert.rejects(
    provider.createRefund({ ...request, amountMinor: 596 }),
    (error) => error.code === 'provider_idempotency_payload_mismatch',
  );
});

test('memory transfer reversal is idempotent and discoverable after an uncertain replay', async () => {
  const provider = new StripeProvider({ mode: 'memory' });
  const request = {
    transferId: 'tr_memory_test',
    amountMinor: 250,
    idempotencyKey: 'stable-recovery-key',
    metadata: { sit_recovery_id: 'recovery-memory-1' },
  };
  const first = await provider.reverseTransfer(request);
  assert.deepEqual(await provider.reverseTransfer(request), first);
  assert.deepEqual(await provider.findTransferReversal({
    transferId: request.transferId,
    recoveryId: request.metadata.sit_recovery_id,
  }), first);
  await assert.rejects(
    provider.reverseTransfer({ ...request, amountMinor: 251 }),
    (error) => error.code === 'provider_idempotency_payload_mismatch',
  );
});

test('memory provider enforces transfer idempotency and cumulative reversal limit', async () => {
  const provider = new StripeProvider({ mode: 'memory' });
  const transferRequest = {
    accountId: 'acct_memory_owner',
    chargeId: 'ch_memory_payment',
    amountMinor: 700,
    currency: 'EUR',
    transferGroup: 'booking_memory_refund',
    idempotencyKey: 'memory-transfer-stable-key',
    metadata: { sit_payment_id: 'payment-memory-refund' },
  };
  const transfer = await provider.createTransfer(transferRequest);
  assert.deepEqual(await provider.createTransfer(transferRequest), transfer);
  await assert.rejects(
    provider.createTransfer({ ...transferRequest, amountMinor: 701 }),
    (error) => error.code === 'provider_idempotency_payload_mismatch',
  );
  await provider.reverseTransfer({
    transferId: transfer.id,
    amountMinor: 500,
    idempotencyKey: 'memory-reversal-first-key',
    metadata: { sit_refund_transfer_reversal_id: 'refund-reversal-first' },
  });
  await assert.rejects(
    provider.reverseTransfer({
      transferId: transfer.id,
      amountMinor: 201,
      idempotencyKey: 'memory-reversal-over-limit-key',
      metadata: { sit_refund_transfer_reversal_id: 'refund-reversal-over-limit' },
    }),
    (error) => error.code === 'transfer_reversal_amount_too_large',
  );
});

test('Stripe SDK verifies both snapshot and thin webhook envelopes', () => {
  const provider = new StripeProvider({
    mode: 'stripe',
    secretKey: 'sk_test_localunitfixture',
  });
  const webhookSecret = 'whsec_localunitfixture';
  const connectWebhookSecret = 'whsec_connectunitfixture';
  const snapshotPayload = JSON.stringify({
    id: 'evt_snapshot_fixture',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_fixture' } },
    livemode: false,
  });
  const snapshot = provider.parseWebhookEvent({
    rawBody: Buffer.from(snapshotPayload),
    signatureHeader: stripeSignatureHeader({ payload: snapshotPayload, secret: webhookSecret }),
    webhookSecret,
  });
  assert.equal(snapshot.id, 'evt_snapshot_fixture');

  const thinPayload = JSON.stringify({
    id: 'evt_thin_fixture',
    object: 'v2.core.event',
    type: 'v2.core.account[requirements].updated',
    related_object: { id: 'acct_fixture', type: 'v2.core.account' },
    livemode: false,
  });
  const thin = provider.parseWebhookEvent({
    rawBody: Buffer.from(thinPayload),
    signatureHeader: stripeSignatureHeader({ payload: thinPayload, secret: connectWebhookSecret }),
    webhookSecret,
    connectWebhookSecret,
  });
  assert.equal(thin.type, 'v2.core.account[requirements].updated');
  assert.equal(thin.related_object.id, 'acct_fixture');

  assert.throws(
    () => provider.parseWebhookEvent({
      rawBody: Buffer.from(thinPayload),
      signatureHeader: stripeSignatureHeader({ payload: `${thinPayload}tampered`, secret: webhookSecret }),
      webhookSecret,
      connectWebhookSecret,
    }),
    (error) => error.status === 400 && error.code === 'invalid_webhook_signature',
  );
});
