import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  lockBookingFinancialPrincipals,
  lockPaymentFinancialPrincipals,
} from '../src/account_financial_fence.js';

function clientFor({ binding, principals }) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM payments AS payment') || sql.includes('FROM bookings')) {
        return { rowCount: 1, rows: [binding] };
      }
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('FROM users')) {
        return { rowCount: principals.length, rows: principals };
      }
      throw new Error(`unexpected_financial_fence_query:${sql}`);
    },
  };
}

test('suspension blocks new commerce without erasing the existing financial binding', async () => {
  const client = clientFor({
    binding: { owner_id: 'owner-1', renter_id: 'renter-1' },
    principals: [
      { id: 'owner-1', account_status: 'suspended', deactivated_at: null },
      { id: 'renter-1', account_status: 'active', deactivated_at: null },
    ],
  });

  const fence = await lockBookingFinancialPrincipals(client, 'booking-1');

  assert.equal(fence.principalsPresent, true);
  assert.equal(fence.commerceActive, false);
  assert.deepEqual(
    client.calls.filter(({ sql }) => sql.includes('pg_advisory_xact_lock'))
      .map(({ values }) => values[0]),
    ['account-financial:owner-1', 'account-financial:renter-1'],
  );
});

test('pseudonymized principal remains settlement-bound but cannot start commerce', async () => {
  const client = clientFor({
    binding: { owner_id: 'owner-1', renter_id: 'renter-1' },
    principals: [
      {
        id: 'owner-1',
        account_status: 'closed',
        deactivated_at: new Date('2026-09-15T00:00:00.000Z'),
      },
      { id: 'renter-1', account_status: 'active', deactivated_at: null },
    ],
  });

  const fence = await lockPaymentFinancialPrincipals(client, 'payment-1');

  assert.equal(fence.principalsPresent, true);
  assert.equal(fence.commerceActive, false);
});

test('missing financial principal is distinct from a non-active retained principal', async () => {
  const client = clientFor({
    binding: { owner_id: 'owner-1', renter_id: 'renter-1' },
    principals: [{ id: 'renter-1', account_status: 'active', deactivated_at: null }],
  });

  const fence = await lockPaymentFinancialPrincipals(client, 'payment-1');

  assert.equal(fence.principalsPresent, false);
  assert.equal(fence.commerceActive, false);
});

test('checkout and existing settlement consumers use different lifecycle policies', () => {
  const source = readFileSync(new URL('../src/payment_workflow.js', import.meta.url), 'utf8');
  const checkout = source.slice(
    source.indexOf('export async function createPaymentCheckout'),
    source.indexOf('export async function getBookingPayment'),
  );
  const refund = source.slice(
    source.indexOf('export async function refundPayment'),
    source.indexOf('async function markPayoutTransferFailure'),
  );
  const payout = source.slice(
    source.indexOf('export async function releasePayout'),
    source.indexOf('export async function reconcilePaymentLifecycle'),
  );

  assert.match(checkout, /principalFence\??\.commerceActive/u);
  assert.match(checkout, /expireAndRecordAbandonedCheckout/u);
  assert.match(checkout, /payment_checkout_expired/u);
  assert.match(checkout, /throw error;/u);
  assert.doesNotMatch(checkout, /principalFence\??\.principalsPresent/u);
  assert.match(refund, /principalFence\??\.principalsPresent/u);
  assert.doesNotMatch(refund, /principalFence\??\.commerceActive/u);
  assert.match(payout, /principalFence\??\.principalsPresent/u);
  assert.doesNotMatch(payout, /principalFence\??\.commerceActive/u);
});
