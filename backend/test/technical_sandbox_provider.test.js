import assert from 'node:assert/strict';
import test from 'node:test';

import { PaymentDomainError } from '../src/payment_domain.js';
import { StripeProvider } from '../src/stripe_provider.js';

const checkoutInput = {
  runId: 'technical_sandbox_12345678901234567890',
  userId: 'synthetic_sandbox_user_owner',
  amountMinor: 100,
  currency: 'EUR',
  syntheticEmail: 'technical-sandbox+0123456789abcdef0123@example.invalid',
  successUrl: 'https://example.invalid/success',
  cancelUrl: 'https://example.invalid/cancel',
  expiresAt: new Date('2026-09-19T10:30:00.000Z'),
  authorizationId: 'wp266-sandbox-auth-001',
  configRevision: 'a'.repeat(64),
  idempotencyKey: 'technical-sandbox:key-00000001',
};

test('memory technical checkout is idempotent and visibly synthetic', async () => {
  const provider = new StripeProvider({ mode: 'memory', livemode: false });
  const first = await provider.createTechnicalSandboxCheckout(checkoutInput);
  const replay = await provider.createTechnicalSandboxCheckout(checkoutInput);
  assert.deepEqual(replay, first);
  assert.equal(first.amount_total, 100);
  assert.equal(first.currency, 'eur');
  assert.equal(first.metadata.sit_flow, 'technical_sandbox');
  assert.match(first.customer_email, /@example\.invalid$/u);
  assert.match(first.url, /[?&]run_id=technical_sandbox_/u);
  assert.match(first.integration_identifier, /^shareittoo_android_[a-z]{8}$/u);
  assert.equal(replay.integration_identifier, first.integration_identifier);
  assert.equal(Object.hasOwn(first, 'transfer_group'), false);
  assert.equal(Object.hasOwn(first, 'transfer_data'), false);
  await assert.rejects(
    () => provider.createTechnicalSandboxCheckout({ ...checkoutInput, amountMinor: 101 }),
    (error) => error instanceof PaymentDomainError
      && error.code === 'technical_sandbox_checkout_payload_invalid',
  );
  await assert.rejects(
    () => provider.createTechnicalSandboxCheckout({ ...checkoutInput, successUrl: 'https://example.invalid/other' }),
    (error) => error.code === 'provider_idempotency_payload_mismatch',
  );
});

test('stripe technical checkout request has no Connect or live-money fields', async () => {
  const calls = [];
  const client = {
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.push({ params, options });
          return { id: 'cs_test_technical', object: 'checkout.session', status: 'open', livemode: false };
        },
      },
    },
  };
  const provider = new StripeProvider({ mode: 'stripe', secretKey: 'rk_test_fixture', stripeClient: client });
  await provider.createTechnicalSandboxCheckout(checkoutInput);
  assert.equal(calls.length, 1);
  const { params, options } = calls[0];
  assert.equal(params.mode, 'payment');
  assert.equal(Object.hasOwn(params, 'payment_method_types'), false);
  assert.match(params.integration_identifier, /^shareittoo_android_[a-z]{8}$/u);
  assert.equal(params.line_items[0].price_data.unit_amount, 100);
  assert.equal(params.line_items[0].price_data.currency, 'eur');
  assert.equal(params.metadata.sit_flow, 'technical_sandbox');
  assert.equal(params.customer_email.endsWith('@example.invalid'), true);
  for (const forbidden of ['transfer_group', 'transfer_data', 'application_fee_amount', 'on_behalf_of', 'payment_method_configuration', 'automatic_tax']) {
    assert.equal(Object.hasOwn(params, forbidden), false, forbidden);
    assert.equal(Object.hasOwn(params.payment_intent_data, forbidden), false, forbidden);
  }
  assert.equal(options.idempotencyKey, checkoutInput.idempotencyKey);
});

test('strict provider readback retrieves the expected account and expanded intent', async () => {
  const calls = [];
  const client = {
    checkout: {
      sessions: {
        retrieve: async (...args) => {
          calls.push(['session', ...args]);
          return {
            id: 'cs_test_technical',
            payment_intent: { id: 'pi_test_technical', object: 'payment_intent', status: 'succeeded' },
          };
        },
      },
    },
    accounts: {
      retrieve: async (...args) => {
        calls.push(['account', ...args]);
        return { id: 'acct_synthetic1234', livemode: false };
      },
    },
  };
  const provider = new StripeProvider({ mode: 'stripe', secretKey: 'rk_test_fixture', stripeClient: client });
  const result = await provider.retrieveTechnicalSandboxCheckout({
    sessionId: 'cs_test_technical',
    expectedAccountId: 'acct_synthetic1234',
  });
  assert.equal(result.accountId, 'acct_synthetic1234');
  assert.equal(result.accountLivemode, false);
  assert.deepEqual(calls[0][2], { expand: ['payment_intent'] });
  assert.deepEqual(calls[1], ['account']);
});
