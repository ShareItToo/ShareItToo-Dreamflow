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
        url,
        payment_intent: paymentIntent,
        customer: customerId,
        expires_at: expiresAt,
        livemode: false,
      };
      this.memory.set(id, { ...result, bookingId, paymentId, amountMinor, currency, transferGroup });
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

  async createRefund({ chargeId, amountMinor, idempotencyKey, metadata }) {
    if (this.mode === 'memory') {
      return {
        id: memoryId('re_memory'),
        status: 'succeeded',
        charge: chargeId,
        amount: amountMinor,
        currency: metadata.currency.toLowerCase(),
        livemode: false,
      };
    }
    return this.call((client) => client.refunds.create({
      charge: chargeId,
      amount: amountMinor,
      metadata,
    }, { idempotencyKey }));
  }

  async createTransfer({ accountId, chargeId, amountMinor, currency, transferGroup, idempotencyKey, metadata }) {
    if (this.mode === 'memory') {
      return {
        id: memoryId('tr_memory'),
        destination: accountId,
        source_transaction: chargeId,
        amount: amountMinor,
        currency: currency.toLowerCase(),
        transfer_group: transferGroup,
        reversed: false,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
      };
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
      const result = {
        id: memoryId('trr_memory'),
        transfer: transferId,
        amount: amountMinor,
        metadata,
        created: Math.floor(Date.now() / 1000),
      };
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

  async findTransferReversal({ transferId, recoveryId }) {
    if (this.mode === 'memory') {
      for (const [key, reversal] of this.memory) {
        if (key.startsWith('reversal:')
            && reversal.transfer === transferId
            && reversal.metadata?.sit_recovery_id === recoveryId) {
          return reversal;
        }
      }
      return null;
    }
    const page = await this.call((client) => client.transfers.listReversals(
      transferId,
      { limit: 100 },
    ));
    const matching = page.data.filter(
      (reversal) => reversal.metadata?.sit_recovery_id === recoveryId,
    );
    if (matching.length > 1 || (page.has_more && matching.length === 0)) {
      throw new PaymentDomainError(503, 'stripe_reversal_inventory_incomplete');
    }
    return matching[0] ?? null;
  }
}
