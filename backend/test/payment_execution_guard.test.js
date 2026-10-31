import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPaymentExecutionActive,
  boundedPaymentCheckoutExpiresAt,
  stripeSandboxExecutionActive,
} from '../src/payment_execution_guard.js';

function configuration(overrides = {}) {
  return {
    payments: {
      transport: 'stripe',
      livemode: false,
      pilotUserIds: ['admin', 'owner', 'renter'],
      sandboxAuthorization: {
        id: 'WP146-AUTH-UNIT-001',
        issuedAt: '2026-09-14T09:00:00.000Z',
        expiresAt: '2026-09-14T10:00:00.000Z',
      },
      ...overrides,
    },
  };
}

test('Stripe sandbox execution is active only inside the bounded authorization window', () => {
  assert.equal(stripeSandboxExecutionActive(
    configuration(),
    new Date('2026-09-14T09:30:00.000Z'),
  ), true);
  for (const current of [
    '2026-09-14T08:59:59.999Z',
    '2026-09-14T10:00:00.000Z',
  ]) {
    assert.equal(stripeSandboxExecutionActive(configuration(), new Date(current)), false);
  }
});

test('missing users and an overlong authorization fail closed at runtime', () => {
  assert.equal(stripeSandboxExecutionActive(
    configuration({ pilotUserIds: [] }),
    new Date('2026-09-14T09:30:00.000Z'),
  ), false);
  assert.equal(stripeSandboxExecutionActive(configuration({
    sandboxAuthorization: {
      id: 'WP146-AUTH-UNIT-002',
      issuedAt: '2026-09-14T00:00:00.000Z',
      expiresAt: '2026-09-15T00:00:00.001Z',
    },
  }), new Date('2026-09-14T09:30:00.000Z')), false);
  assert.throws(
    () => assertPaymentExecutionActive(configuration(), new Date('2026-09-14T10:00:00.000Z')),
    (error) => error.code === 'payment_sandbox_authorization_expired',
  );
});

test('memory and live transport do not use the sandbox-expiry decision', () => {
  assert.equal(stripeSandboxExecutionActive(configuration({ transport: 'memory' })), true);
  assert.equal(stripeSandboxExecutionActive(configuration({ livemode: true })), true);
});

test('Stripe checkout expiry is clamped to the sandbox authorization', () => {
  assert.equal(boundedPaymentCheckoutExpiresAt(configuration(), {
    now: new Date('2026-09-14T09:20:00.000Z'),
  }).toISOString(), '2026-09-14T10:00:00.000Z');
  assert.throws(() => boundedPaymentCheckoutExpiresAt(configuration(), {
    now: new Date('2026-09-14T09:29:01.000Z'),
  }), (error) => error.code === 'payment_sandbox_authorization_too_short');
});

test('non-sandbox checkout expiry keeps the requested bounded lifetime', () => {
  assert.equal(boundedPaymentCheckoutExpiresAt(configuration({ transport: 'memory' }), {
    now: new Date('2026-09-14T09:20:00.000Z'),
  }).toISOString(), '2026-09-14T10:05:00.000Z');
});
