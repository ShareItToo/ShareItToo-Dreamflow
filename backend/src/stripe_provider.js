import crypto from 'node:crypto';

import Stripe from 'stripe';

import { PaymentDomainError, requestHash } from './payment_domain.js';

function memoryId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function providerError(error) {
  if (error instanceof PaymentDomainError) return error;
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  const code = typeof error?.code === 'string' && error.code
    ? error.code
    : 'stripe_request_failed';
  const providerType = typeof error?.type === 'string' && error.type
    ? error.type.slice(0, 80)
    : (typeof error?.constructor?.name === 'string'
      ? error.constructor.name.slice(0, 80)
      : undefined);
  return new PaymentDomainError(status >= 500 || status === 0 ? 503 : 409, code, {
    providerStatus: status || undefined,
    providerType,
    declineCode: typeof error?.decline_code === 'string' ? error.decline_code : undefined,
  });
}

function integrationIdentifier(paymentId) {
  const digest = crypto.createHash('sha256').update(paymentId).digest();
  const suffix = Array.from(digest.subarray(0, 8), (value) => String.fromCharCode(97 + (value % 26))).join('');
  return `shareittoo_android_${suffix}`;
}

function memoryConnectedAccount({ userId, country, currency }) {
  const now = new Date().toISOString();
  return {
    id: `acct_memory_${crypto.createHash('sha256').update(userId).digest('hex').slice(0, 20)}`,
    object: 'v2.core.account',
    applied_configurations: ['recipient'],
    configuration: {
      recipient: {
        applied: true,
        capabilities: {
          stripe_balance: {
            payouts: { status: 'active', status_details: [] },
            stripe_transfers: { status: 'active', status_details: [] },
          },
        },
      },
    },
    dashboard: 'express',
    defaults: {
      currency: currency.toLowerCase(),
      locales: ['de-DE'],
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
    },
    identity: { country, entity_type: 'individual' },
    requirements: { entries: [], summary: {} },
    future_requirements: { entries: [], summary: {} },
    livemode: false,
    created: now,
  };
}

export class StripeProvider {
  constructor({
    mode,
    secretKey = '',
    apiVersion = '2026-08-26.dahlia',
    livemode = false,
    stripeClient = null,
  }) {
    this.mode = mode;
    this.secretKey = secretKey;
    this.apiVersion = apiVersion;
    this.livemode = livemode;
    this.client = stripeClient ?? (mode === 'stripe'
      ? new Stripe(secretKey, {
        apiVersion,
        appInfo: { name: 'ShareItToo', version: '1.0.0' },
        maxNetworkRetries: 2,
        timeout: 15_000,
      })
      : null);
    this.memory = new Map();
  }

  get enabled() {
    return this.mode !== 'disabled';
  }

  async call(operation) {
    if (this.mode !== 'stripe' || !this.client) {
      throw new PaymentDomainError(503, 'stripe_transport_not_enabled');
    }
    try {
      return await operation(this.client);
    } catch (error) {
      throw providerError(error);
    }
  }

  parseWebhookEvent({ rawBody, signatureHeader, webhookSecret, connectWebhookSecret }) {
    if (this.mode !== 'stripe' || !this.client) {
      throw new PaymentDomainError(404, 'webhook_not_enabled');
    }
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new PaymentDomainError(400, 'empty_webhook_payload');
    }
    if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
      throw new PaymentDomainError(400, 'missing_webhook_signature');
    }
    let envelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new PaymentDomainError(400, 'invalid_webhook_json');
    }
    // The unsigned type only selects a destination. Trust still requires the
    // original bytes to verify with that destination's own secret; never try
    // the other destination's key as a fallback.
    const thin = String(envelope?.type ?? '').startsWith('v2.');
    const destinationSecret = thin ? connectWebhookSecret : webhookSecret;
    if (typeof destinationSecret !== 'string' || !destinationSecret) {
      throw new PaymentDomainError(503, 'webhook_destination_not_configured');
    }
    try {
      return thin
        ? this.client.parseEventNotification(rawBody, signatureHeader, destinationSecret)
        : this.client.webhooks.constructEvent(rawBody, signatureHeader, destinationSecret);
    } catch {
      throw new PaymentDomainError(400, 'invalid_webhook_signature');
    }
  }

  async createConnectedAccount({ userId, email, country, currency, idempotencyKey }) {
    if (this.mode === 'memory') {
      const account = memoryConnectedAccount({ userId, country, currency });
      this.memory.set(account.id, account);
      return account;
    }
    return this.call((client) => client.v2.core.accounts.create({
      contact_email: email,
      dashboard: 'express',
      defaults: {
        currency: currency.toLowerCase(),
        locales: ['de-DE'],
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      identity: { country, entity_type: 'individual' },
      include: [
        'configuration.recipient',
        'defaults',
        'future_requirements',
        'identity',
        'requirements',
      ],
      metadata: { sit_user_id: userId },
    }, { idempotencyKey }));
  }

  async retrieveConnectedAccount(accountId) {
    if (this.mode === 'memory') {
      const account = this.memory.get(accountId);
      if (!account) throw new PaymentDomainError(404, 'stripe_account_not_found');
      return account;
    }
    return this.call((client) => client.v2.core.accounts.retrieve(accountId, {
      include: [
        'configuration.recipient',
        'defaults',
        'future_requirements',
        'identity',
        'requirements',
      ],
    }));
  }

  async createAccountLink({ accountId, refreshUrl, returnUrl, idempotencyKey }) {
    if (this.mode === 'memory') {
      const token = memoryId('onboard');
      const url = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}memory_onboarding=${encodeURIComponent(token)}`;
      this.memory.set(token, { type: 'account_link', accountId });
      return {
        object: 'v2.core.account_link',
        account: accountId,
        url,
        created: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
        livemode: false,
        use_case: { type: 'account_onboarding' },
      };
    }
    return this.call((client) => client.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          collection_options: {
            fields: 'eventually_due',
            future_requirements: 'include',
          },
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    }, { idempotencyKey }));
  }

  async createCustomer({ userId, email, name, idempotencyKey }) {
    if (this.mode === 'memory') {
      return { id: `cus_memory_${crypto.createHash('sha256').update(userId).digest('hex').slice(0, 20)}`, livemode: false };
    }
    return this.call((client) => client.customers.create(
      { email, name, metadata: { sit_user_id: userId } },
      { idempotencyKey },
    ));
  }

  async createIdentityVerificationSession({ idempotencyKey, providerIdempotencyKey = idempotencyKey }) {
    if (this.mode === 'memory') {
      const digest = crypto.createHash('sha256')
        .update(String(providerIdempotencyKey))
        .digest('hex');
      const id = `vs_test_sit_${digest.slice(0, 24)}`;
      const session = {
        id,
        object: 'identity.verification_session',
        status: 'requires_input',
        livemode: false,
        // The memory provider is a local deterministic fixture. It must not
        // manufacture a real Stripe-hosted URL or cause provider interaction;
        // only the Stripe transport may return that entrypoint.
        url: null,
      };
      this.memory.set(providerIdempotencyKey, session);
      this.memory.set(id, session);
      return session;
    }
    return this.call((client) => client.identity.verificationSessions.create({
      type: 'document',
      metadata: { sit_flow: 'identity_verification' },
    }, { idempotencyKey: providerIdempotencyKey }));
  }

  async retrieveIdentityVerificationSession(providerSessionId) {
    if (this.mode === 'memory') {
      const session = this.memory.get(providerSessionId);
      if (!session) throw new PaymentDomainError(404, 'identity_verification_session_not_found');
      return session;
    }
    return this.call((client) => client.identity.verificationSessions.retrieve(providerSessionId));
  }

  async redactIdentityVerificationSession(providerSessionId) {
    if (this.mode === 'memory') {
      const session = this.memory.get(providerSessionId);
      if (!session) throw new PaymentDomainError(404, 'identity_verification_session_not_found');
      session.redaction = { status: 'redacted' };
      session.status = session.status === 'canceled' ? 'canceled' : session.status;
      return { id: providerSessionId, status: session.status, redaction: { status: 'redacted' }, livemode: false };
    }
    return this.call((client) => client.identity.verificationSessions.redact(providerSessionId));
  }

  async createPaymentCheckout({
    paymentId,
    bookingId,
    customerId,
    amountMinor,
    currency,
    itemTitle,
    transferGroup,
    successUrl,
    cancelUrl,
    expiresAt,
    idempotencyKey,
  }) {
    if (this.mode === 'memory') {
      const idempotencyFingerprint = requestHash({
        paymentId,
        bookingId,
        customerId,
        amountMinor,
        currency,
        itemTitle,
        transferGroup,
        successUrl,
        cancelUrl,
        expiresAt,
      });
      const replay = this.memory.get(`checkout-idempotency:${idempotencyKey}`);
      if (replay) {
        if (replay.fingerprint !== idempotencyFingerprint) {
          throw new PaymentDomainError(409, 'provider_idempotency_payload_mismatch');
        }
        return replay.result;
      }
      const id = memoryId('cs_memory');
      const paymentIntent = memoryId('pi_memory');
      const url = `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id=${encodeURIComponent(id)}&memory=1`;
      const result = {
        id,
        object: 'checkout.session',
        status: 'open',
        url,
        payment_intent: paymentIntent,
        customer: customerId,
        expires_at: expiresAt,
        livemode: false,
      };
      this.memory.set(id, result);
      this.memory.set(`checkout-idempotency:${idempotencyKey}`, {
        fingerprint: idempotencyFingerprint,
        result,
      });
      return result;
    }
    return this.call((client) => client.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: expiresAt,
      client_reference_id: bookingId,
      integration_identifier: integrationIdentifier(paymentId),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amountMinor,
          product_data: { name: itemTitle },
        },
      }],
      payment_intent_data: {
        transfer_group: transferGroup,
        metadata: { sit_booking_id: bookingId, sit_payment_id: paymentId },
      },
      metadata: { sit_booking_id: bookingId, sit_payment_id: paymentId },
    }, { idempotencyKey }));
  }

  async expirePaymentCheckout({ sessionId }) {
    if (this.mode === 'memory') {
      const session = this.memory.get(sessionId);
      if (!session || session.object !== 'checkout.session') {
        throw new PaymentDomainError(404, 'provider_checkout_session_not_found');
      }
      if (session.status === 'complete') {
        throw new PaymentDomainError(409, 'provider_checkout_session_already_complete');
      }
      session.status = 'expired';
      session.url = null;
      return session;
    }
    return this.call((client) => client.checkout.sessions.expire(sessionId));
  }

  async createRefund({ chargeId, amountMinor, idempotencyKey, metadata }) {
    if (this.mode === 'memory') {
      const fingerprint = requestHash({ chargeId, amountMinor, metadata });
      const replay = this.memory.get(`refund-idempotency:${idempotencyKey}`);
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          throw new PaymentDomainError(409, 'provider_idempotency_payload_mismatch');
        }
        return replay.result;
      }
      const result = {
        id: memoryId('re_memory'),
        status: 'succeeded',
        charge: chargeId,
        amount: amountMinor,
        currency: metadata.currency.toLowerCase(),
        metadata,
        livemode: false,
      };
      this.memory.set(`refund:${result.id}`, result);
      this.memory.set(`refund-idempotency:${idempotencyKey}`, { fingerprint, result });
      return result;
    }
    return this.call((client) => client.refunds.create({
      charge: chargeId,
      amount: amountMinor,
      metadata,
    }, { idempotencyKey }));
  }

  async findRefund({ chargeId, refundId }) {
    if (typeof chargeId !== 'string' || !chargeId
        || typeof refundId !== 'string' || !refundId) {
      throw new PaymentDomainError(500, 'invalid_refund_lookup');
    }
    if (this.mode === 'memory') {
      const matching = [];
      for (const [key, refund] of this.memory) {
        if (key.startsWith('refund:')
            && refund.charge === chargeId
            && refund.metadata?.sit_refund_id === refundId) {
          matching.push(refund);
        }
      }
      if (matching.length > 1) {
        throw new PaymentDomainError(409, 'provider_refund_inventory_conflict');
      }
      return matching[0] ?? null;
    }
    const matching = [];
    let startingAfter;
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      const page = await this.call((client) => client.refunds.list({
        charge: chargeId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }));
      matching.push(...page.data.filter(
        (refund) => refund.metadata?.sit_refund_id === refundId,
      ));
      if (matching.length > 1) {
        throw new PaymentDomainError(409, 'provider_refund_inventory_conflict');
      }
      if (!page.has_more) return matching[0] ?? null;
      startingAfter = typeof page.data.at(-1)?.id === 'string'
        ? page.data.at(-1).id
        : '';
      if (!startingAfter) break;
    }
    throw new PaymentDomainError(503, 'stripe_refund_inventory_incomplete');
  }

  async createTransfer({ accountId, chargeId, amountMinor, currency, transferGroup, idempotencyKey, metadata }) {
    if (this.mode === 'memory') {
      const fingerprint = requestHash({
        accountId,
        chargeId,
        amountMinor,
        currency,
        transferGroup,
        metadata,
      });
      const replay = this.memory.get(`transfer-idempotency:${idempotencyKey}`);
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          throw new PaymentDomainError(409, 'provider_idempotency_payload_mismatch');
        }
        return replay.result;
      }
      const result = {
        id: memoryId('tr_memory'),
        destination: accountId,
        source_transaction: chargeId,
        amount: amountMinor,
        currency: currency.toLowerCase(),
        transfer_group: transferGroup,
        metadata,
        reversed: false,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
      };
      this.memory.set(`transfer:${result.id}`, { ...result, reversed_amount: 0 });
      this.memory.set(`transfer-idempotency:${idempotencyKey}`, { fingerprint, result });
      return result;
    }
    return this.call((client) => client.transfers.create({
      destination: accountId,
      source_transaction: chargeId,
      amount: amountMinor,
      currency: currency.toLowerCase(),
      transfer_group: transferGroup,
      metadata,
    }, { idempotencyKey }));
  }

  async findTransfer({ accountId, transferGroup, payoutId }) {
    if (typeof accountId !== 'string' || !accountId
        || typeof transferGroup !== 'string' || !transferGroup
        || typeof payoutId !== 'string' || !payoutId) {
      throw new PaymentDomainError(500, 'invalid_transfer_lookup');
    }
    if (this.mode === 'memory') {
      const matching = [];
      for (const [key, transfer] of this.memory) {
        if (key.startsWith('transfer:')
            && transfer.destination === accountId
            && transfer.transfer_group === transferGroup
            && transfer.metadata?.sit_payout_id === payoutId) {
          const providerTransfer = { ...transfer };
          delete providerTransfer.reversed_amount;
          matching.push(providerTransfer);
        }
      }
      if (matching.length > 1) {
        throw new PaymentDomainError(409, 'provider_transfer_inventory_conflict');
      }
      return matching[0] ?? null;
    }
    const matching = [];
    let startingAfter;
    const maximumPages = 4;
    for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
      const page = await this.call((client) => client.transfers.list({
        destination: accountId,
        transfer_group: transferGroup,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }, {
        maxNetworkRetries: 0,
        timeout: 2_500,
      }));
      matching.push(...page.data.filter(
        (transfer) => transfer.metadata?.sit_payout_id === payoutId,
      ));
      if (matching.length > 1) {
        throw new PaymentDomainError(409, 'provider_transfer_inventory_conflict');
      }
      if (!page.has_more) return matching[0] ?? null;
      startingAfter = typeof page.data.at(-1)?.id === 'string'
        ? page.data.at(-1).id
        : '';
      if (!startingAfter) break;
    }
    throw new PaymentDomainError(503, 'stripe_transfer_inventory_incomplete');
  }

  async reverseTransfer({ transferId, amountMinor, idempotencyKey, metadata }) {
    if (this.mode === 'memory') {
      const fingerprint = requestHash({ transferId, amountMinor, metadata });
      const replay = this.memory.get(`reversal-idempotency:${idempotencyKey}`);
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          throw new PaymentDomainError(409, 'provider_idempotency_payload_mismatch');
        }
        return replay.result;
      }
      const transfer = this.memory.get(`transfer:${transferId}`);
      if (transfer && transfer.reversed_amount + amountMinor > transfer.amount) {
        throw new PaymentDomainError(409, 'transfer_reversal_amount_too_large', {
          providerStatus: 400,
          providerType: 'StripeInvalidRequestError',
        });
      }
      const result = {
        id: memoryId('trr_memory'),
        transfer: transferId,
        amount: amountMinor,
        metadata,
        created: Math.floor(Date.now() / 1000),
      };
      if (transfer) transfer.reversed_amount += amountMinor;
      this.memory.set(`reversal:${result.id}`, result);
      this.memory.set(`reversal-idempotency:${idempotencyKey}`, {
        fingerprint,
        result,
      });
      return result;
    }
    return this.call((client) => client.transfers.createReversal(
      transferId,
      { amount: amountMinor, metadata },
      { idempotencyKey },
    ));
  }

  async findTransferReversal({
    transferId,
    recoveryId = null,
    refundTransferReversalId = null,
  }) {
    if ((typeof recoveryId === 'string' && recoveryId.length > 0)
        === (typeof refundTransferReversalId === 'string'
          && refundTransferReversalId.length > 0)) {
      throw new PaymentDomainError(500, 'invalid_transfer_reversal_lookup');
    }
    const metadataKey = recoveryId
      ? 'sit_recovery_id'
      : 'sit_refund_transfer_reversal_id';
    const metadataValue = recoveryId ?? refundTransferReversalId;
    if (this.mode === 'memory') {
      const matching = [];
      for (const [key, reversal] of this.memory) {
        if (key.startsWith('reversal:')
            && reversal.transfer === transferId
            && reversal.metadata?.[metadataKey] === metadataValue) {
          matching.push(reversal);
        }
      }
      if (matching.length > 1) {
        throw new PaymentDomainError(409, 'provider_reversal_inventory_conflict');
      }
      return matching[0] ?? null;
    }
    const matching = [];
    let startingAfter;
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      const page = await this.call((client) => client.transfers.listReversals(
        transferId,
        {
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
      ));
      matching.push(...page.data.filter(
        (reversal) => reversal.metadata?.[metadataKey] === metadataValue,
      ));
      if (matching.length > 1) {
        throw new PaymentDomainError(409, 'provider_reversal_inventory_conflict');
      }
      if (!page.has_more) return matching[0] ?? null;
      startingAfter = typeof page.data.at(-1)?.id === 'string'
        ? page.data.at(-1).id
        : '';
      if (!startingAfter) break;
    }
    throw new PaymentDomainError(503, 'stripe_reversal_inventory_incomplete');
  }
}
