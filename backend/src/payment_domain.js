import crypto from 'node:crypto';

export class PaymentDomainError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function requestHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function payloadHash(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function paymentIdempotencyKey(value, prefix) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key.length >= 12 && key.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(key)) return key;
  throw new PaymentDomainError(400, 'invalid_idempotency_key', { prefix });
}

export function providerOperationIdempotencyKey(kind, durableId) {
  const namespace = typeof kind === 'string' ? kind.trim() : '';
  const identifier = typeof durableId === 'string' ? durableId.trim() : '';
  if (!/^[a-z][a-z0-9_]{2,40}$/u.test(namespace) || identifier.length < 1) {
    throw new PaymentDomainError(500, 'invalid_provider_operation_identity');
  }
  const digest = crypto.createHash('sha256')
    .update(`${namespace}\0${identifier}`)
    .digest('hex');
  return `sit_${namespace}_${digest}`;
}

function providerObjectId(value) {
  if (typeof value === 'string') return value.trim();
  return value && typeof value === 'object' && typeof value.id === 'string'
    ? value.id.trim()
    : '';
}

export function assertProviderPaymentBinding({ payment, event, object }) {
  const paymentId = typeof payment?.id === 'string' ? payment.id : '';
  const bookingId = typeof payment?.booking_id === 'string' ? payment.booking_id : '';
  const metadata = object?.metadata;
  const objectType = typeof object?.object === 'string' ? object.object : '';
  const sameMode = payment?.livemode === true === (event?.livemode === true);
  const sameMetadata = metadata?.sit_payment_id === paymentId
    && metadata?.sit_booking_id === bookingId;
  const knownCustomer = providerObjectId(payment?.provider_customer_id);
  const eventCustomer = providerObjectId(object?.customer);
  const sameCustomer = !knownCustomer || eventCustomer === knownCustomer;

  let sameProviderObject = true;
  let sameCheckoutReference = true;
  let sameTransferGroup = true;
  if (objectType === 'payment_intent') {
    const knownPaymentIntent = providerObjectId(payment?.provider_payment_id);
    sameProviderObject = !knownPaymentIntent || providerObjectId(object?.id) === knownPaymentIntent;
    sameTransferGroup = typeof payment?.transfer_group === 'string'
      && payment.transfer_group.length > 0
      && object?.transfer_group === payment.transfer_group;
  } else if (objectType === 'checkout.session') {
    const knownCheckoutSession = providerObjectId(payment?.provider_checkout_session_id);
    sameProviderObject = !knownCheckoutSession
      || providerObjectId(object?.id) === knownCheckoutSession;
    sameCheckoutReference = object?.client_reference_id === bookingId;
  } else {
    sameProviderObject = false;
  }

  if (!paymentId || !bookingId || !sameMode || !sameMetadata || !sameCustomer
      || !sameProviderObject || !sameCheckoutReference || !sameTransferGroup) {
    throw new PaymentDomainError(409, 'provider_payment_binding_mismatch');
  }
  return true;
}

export function normalizePaymentCurrency(value, expected = 'EUR') {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) throw new PaymentDomainError(400, 'invalid_payment_currency');
  if (expected && currency !== expected) {
    throw new PaymentDomainError(409, 'unsupported_payment_currency', { expected });
  }
  return currency;
}

export function paymentAmounts(booking) {
  const amountMinor = Number(booking.quoted_total_minor);
  const ownerPayoutMinor = Number(booking.owner_payout_minor);
  const rentalSubtotalMinor = Number(booking.rental_subtotal_minor);
  const integers = [amountMinor, ownerPayoutMinor, rentalSubtotalMinor];
  if (!integers.every(Number.isSafeInteger) || amountMinor <= 0
      || ownerPayoutMinor < 0 || ownerPayoutMinor > amountMinor
      || rentalSubtotalMinor < 0) {
    throw new PaymentDomainError(409, 'invalid_booking_payment_amounts');
  }
  return Object.freeze({
    amountMinor,
    ownerPayoutMinor,
    platformFeeMinor: amountMinor - ownerPayoutMinor,
    rentalSubtotalMinor,
    securityDepositMinor: 0,
    currency: normalizePaymentCurrency(booking.currency),
  });
}

export function captureLedger({ amountMinor, ownerPayoutMinor, platformFeeMinor, ownerId }) {
  if (ownerPayoutMinor + platformFeeMinor !== amountMinor) {
    throw new PaymentDomainError(500, 'unbalanced_payment_breakdown');
  }
  return Object.freeze([
    { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: amountMinor, creditMinor: 0 },
    { accountCode: 'owner_payable', accountOwnerId: ownerId, debitMinor: 0, creditMinor: ownerPayoutMinor },
    { accountCode: 'platform_revenue', accountOwnerId: null, debitMinor: 0, creditMinor: platformFeeMinor },
  ].filter((entry) => entry.debitMinor > 0 || entry.creditMinor > 0));
}

export function transferLedger({ amountMinor, ownerId }) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new PaymentDomainError(500, 'invalid_transfer_amount');
  }
  return Object.freeze([
    { accountCode: 'owner_payable', accountOwnerId: ownerId, debitMinor: amountMinor, creditMinor: 0 },
    { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: 0, creditMinor: amountMinor },
  ]);
}

export function refundLedger({ amountMinor, ownerShareMinor, platformShareMinor, ownerId }) {
  if (![amountMinor, ownerShareMinor, platformShareMinor].every(Number.isSafeInteger)
      || amountMinor <= 0 || ownerShareMinor < 0 || platformShareMinor < 0
      || ownerShareMinor + platformShareMinor !== amountMinor) {
    throw new PaymentDomainError(500, 'invalid_refund_breakdown');
  }
  return Object.freeze([
    ...(ownerShareMinor ? [{ accountCode: 'owner_payable', accountOwnerId: ownerId, debitMinor: ownerShareMinor, creditMinor: 0 }] : []),
    ...(platformShareMinor ? [{ accountCode: 'platform_revenue', accountOwnerId: null, debitMinor: platformShareMinor, creditMinor: 0 }] : []),
    { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: 0, creditMinor: amountMinor },
  ]);
}

export function splitRefund({ amountMinor, paymentAmountMinor, ownerPayoutMinor }) {
  if (![amountMinor, paymentAmountMinor, ownerPayoutMinor].every(Number.isSafeInteger)
      || amountMinor <= 0 || amountMinor > paymentAmountMinor || ownerPayoutMinor < 0) {
    throw new PaymentDomainError(400, 'invalid_refund_amount');
  }
  const ownerShareMinor = amountMinor === paymentAmountMinor
    ? ownerPayoutMinor
    : Math.min(ownerPayoutMinor, Math.round(amountMinor * ownerPayoutMinor / paymentAmountMinor));
  return Object.freeze({
    ownerShareMinor,
    platformShareMinor: amountMinor - ownerShareMinor,
  });
}

export function disputeTransferRecoveryAmount({
  disputeAmountMinor,
  paymentAmountMinor,
  ownerPayoutMinor,
  transferredMinor,
  alreadyRecoveredMinor = 0,
}) {
  const values = [
    disputeAmountMinor,
    paymentAmountMinor,
    ownerPayoutMinor,
    transferredMinor,
    alreadyRecoveredMinor,
  ];
  if (!values.every(Number.isSafeInteger)
      || disputeAmountMinor <= 0
      || disputeAmountMinor > paymentAmountMinor
      || ownerPayoutMinor < 0
      || ownerPayoutMinor > paymentAmountMinor
      || transferredMinor < 0
      || alreadyRecoveredMinor < 0) {
    throw new PaymentDomainError(400, 'invalid_dispute_transfer_recovery_amount');
  }
  const disputedOwnerShareMinor = splitRefund({
    amountMinor: disputeAmountMinor,
    paymentAmountMinor,
    ownerPayoutMinor,
  }).ownerShareMinor;
  const paidOwnerExposureMinor = transferredMinor + alreadyRecoveredMinor;
  const targetOwnerRecoveryMinor = Math.min(
    disputedOwnerShareMinor,
    paidOwnerExposureMinor,
  );
  return Object.freeze({
    disputedOwnerShareMinor,
    targetOwnerRecoveryMinor,
    remainingOwnerRecoveryMinor: Math.max(
      0,
      targetOwnerRecoveryMinor - alreadyRecoveredMinor,
    ),
  });
}

export function disputeOwnerRecoveryLedger({ amountMinor }) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new PaymentDomainError(500, 'invalid_dispute_owner_recovery_amount');
  }
  return Object.freeze([
    { accountCode: 'stripe_clearing', accountOwnerId: null, debitMinor: amountMinor, creditMinor: 0 },
    { accountCode: 'chargeback_expense', accountOwnerId: null, debitMinor: 0, creditMinor: amountMinor },
  ]);
}

export function disputeOwnerRecoveryReinstatementLedger({ amountMinor, ownerId }) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0
      || typeof ownerId !== 'string' || ownerId.length === 0) {
    throw new PaymentDomainError(500, 'invalid_dispute_owner_reinstatement_amount');
  }
  return Object.freeze([
    { accountCode: 'chargeback_expense', accountOwnerId: null, debitMinor: amountMinor, creditMinor: 0 },
    { accountCode: 'owner_payable', accountOwnerId: ownerId, debitMinor: 0, creditMinor: amountMinor },
  ]);
}

const definiteDisputeRecoveryRejectionCodes = new Set([
  'amount_too_large',
  'parameter_invalid_integer',
  'parameter_missing',
  'resource_missing',
  'transfer_reversal_amount_too_large',
]);

export function classifyDisputeTransferRecoveryFailure(error) {
  const code = typeof error?.code === 'string' && error.code
    ? error.code.slice(0, 120)
    : 'unstructured_provider_failure';
  const providerStatus = Number(error?.details?.providerStatus ?? 0);
  const providerType = typeof error?.details?.providerType === 'string'
    ? error.details.providerType.slice(0, 80)
    : '';
  if (code === 'balance_insufficient') {
    return Object.freeze({
      category: 'insufficient_balance',
      disposition: 'retryable',
      needsReview: true,
      safeCode: code,
    });
  }
  if (providerStatus === 0 || providerStatus === 408 || providerStatus === 425
      || providerStatus === 429 || providerStatus >= 500
      || Number(error?.status ?? 0) === 503) {
    return Object.freeze({
      category: 'uncertain_provider_outcome',
      disposition: 'uncertain',
      needsReview: true,
      safeCode: code,
    });
  }
  const structuredStripeRejection = providerType === 'StripeInvalidRequestError'
    && providerStatus >= 400
    && providerStatus < 500
    && definiteDisputeRecoveryRejectionCodes.has(code);
  if (structuredStripeRejection) {
    return Object.freeze({
      category: 'definite_provider_rejection',
      disposition: 'manual_review',
      needsReview: true,
      safeCode: code,
    });
  }
  return Object.freeze({
    category: 'uncertain_provider_outcome',
    disposition: 'uncertain',
    needsReview: true,
    safeCode: code,
  });
}

export function privatePilotReleasableOwnerAmount({
  paymentAmountMinor,
  ownerPayoutMinor,
  refundedOwnerMinor = 0,
  transferredMinor = 0,
  contestedAuthorizedMinor = 0,
}) {
  const values = [
    paymentAmountMinor,
    ownerPayoutMinor,
    refundedOwnerMinor,
    transferredMinor,
    contestedAuthorizedMinor,
  ];
  if (!values.every(Number.isSafeInteger)
      || paymentAmountMinor <= 0
      || ownerPayoutMinor < 0
      || ownerPayoutMinor > paymentAmountMinor
      || refundedOwnerMinor < 0
      || transferredMinor < 0
      || contestedAuthorizedMinor < 0) {
    throw new PaymentDomainError(400, 'invalid_private_pilot_payout_amount');
  }
  const ownerAfterRefunds = Math.max(0, ownerPayoutMinor - refundedOwnerMinor);
  const proportionalHold = contestedAuthorizedMinor >= paymentAmountMinor
    ? ownerPayoutMinor
    : Math.round(contestedAuthorizedMinor * ownerPayoutMinor / paymentAmountMinor);
  const heldOwnerMinor = Math.min(ownerAfterRefunds, proportionalHold);
  return Object.freeze({
    ownerAfterRefundsMinor: ownerAfterRefunds,
    heldOwnerMinor,
    releasableMinor: Math.max(0, ownerAfterRefunds - transferredMinor - heldOwnerMinor),
  });
}

export function paymentStatusForProvider(eventType, object = {}) {
  if (eventType === 'checkout.session.expired') return 'cancelled';
  if (eventType === 'checkout.session.async_payment_failed') return 'failed';
  if (eventType === 'payment_intent.succeeded') return 'captured';
  if (eventType === 'payment_intent.payment_failed') return 'failed';
  if (eventType === 'payment_intent.canceled') return 'cancelled';
  if (eventType === 'payment_intent.requires_action') return 'requires_action';
  if (eventType === 'payment_intent.amount_capturable_updated') return 'authorized';
  // Checkout completion is not sufficient settlement evidence for delayed
  // methods. The canonical PaymentIntent event carries the captured amount and
  // charge needed for refunds and destination transfers.
  return null;
}

export function stripeSignatureHeader({ payload, secret, timestamp = Math.floor(Date.now() / 1000) }) {
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyStripeSignature({ rawBody, header, secret, now = Date.now(), toleranceSeconds = 300 }) {
  if (!Buffer.isBuffer(rawBody) || !rawBody.length) throw new PaymentDomainError(400, 'empty_webhook_payload');
  if (typeof header !== 'string' || !header) throw new PaymentDomainError(400, 'missing_webhook_signature');
  const values = header.split(',').map((part) => part.trim().split('=', 2));
  const timestamp = Number(values.find(([key]) => key === 't')?.[1]);
  const signatures = values.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isSafeInteger(timestamp) || !signatures.length) {
    throw new PaymentDomainError(400, 'invalid_webhook_signature');
  }
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) {
    throw new PaymentDomainError(400, 'expired_webhook_signature');
  }
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest();
  const valid = signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const supplied = Buffer.from(candidate, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
  if (!valid) throw new PaymentDomainError(400, 'invalid_webhook_signature');
  return true;
}

export function safeProviderObjectId(value, prefix) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id.startsWith(prefix) || id.length > 255 || !/^[A-Za-z0-9_]+$/.test(id)) {
    throw new PaymentDomainError(400, 'invalid_provider_object_id');
  }
  return id;
}
