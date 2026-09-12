import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  getV52ActualLossReceipt,
  openV52ActualLossCase,
  V52ActualLossError,
} from '../src/v52_actual_loss_workflow.js';

const contentText = '<h1>Storno und Refund</h1>';
const contentSha256 = crypto.createHash('sha256').update(contentText).digest('hex');

function binding(overrides = {}) {
  return {
    id: 'booking-1',
    owner_id: 'owner-1',
    renter_id: 'renter-1',
    currency: 'EUR',
    rental_subtotal_minor: 10000,
    platform_fee_minor: 1000,
    platform_contract_id: '11111111-1111-4111-8111-111111111111',
    contract_version: 'V5.2-2026-08-20',
    contract_locale: 'de',
    quote_id: 'quote-1',
    quote_hash: 'a'.repeat(64),
    cancellation_refund_snapshot_id: '22222222-2222-4222-8222-222222222222',
    document_key: 'cancellation_refund',
    document_version: 'V5.2-2026-08-20',
    document_locale: 'de',
    content_text: contentText,
    content_sha256: contentSha256,
    ...overrides,
  };
}

function clientForOpen(row = binding()) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('JOIN platform_contracts AS contract')) {
        return { rowCount: 1, rows: [row] };
      }
      if (sql.includes('FROM v51_cancellation_refund_obligations')) {
        return {
          rowCount: 2,
          rows: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              refund_type: 'rent_refund',
              debtor_role: 'owner',
              status: 'pending_actual_loss_assessment',
              maximum_minor: 10000,
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              refund_type: 'sit_fee_refund',
              debtor_role: 'sit',
              status: 'pending_actual_loss_assessment',
              maximum_minor: 1000,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO v52_actual_loss_cases')) {
        return {
          rowCount: 1,
          rows: [{ id: '55555555-5555-4555-8555-555555555555' }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  };
}

test('opens a V5.2 case only with exact document and separate pending obligations', async () => {
  const client = clientForOpen();
  const result = await openV52ActualLossCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    cause: 'renter_no_show',
    rentRefundObligationId: '33333333-3333-4333-8333-333333333333',
    sitFeeRefundObligationId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'cancel-command:actual-loss',
    now: new Date('2026-09-01T10:00:00Z'),
  });
  assert.deepEqual(result, {
    id: '55555555-5555-4555-8555-555555555555',
    status: 'evidence_pending',
    cause: 'renter_no_show',
  });
  const insert = client.calls.find(({ sql }) => sql.includes('INSERT INTO v52_actual_loss_cases'));
  assert.equal(insert.values[5], 'renter_no_show');
  assert.equal(insert.values[9], 'a'.repeat(64));
  assert.ok(client.calls.some(({ sql }) => sql.includes("'booking.actual_loss_case_opened'")));
});

test('fails closed when the contract-bound cancellation document hash is stale', async () => {
  const client = clientForOpen(binding({ content_sha256: 'b'.repeat(64) }));
  await assert.rejects(() => openV52ActualLossCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    cause: 'after_start',
    rentRefundObligationId: '33333333-3333-4333-8333-333333333333',
    sitFeeRefundObligationId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'cancel-command:actual-loss',
  }), (error) => error instanceof V52ActualLossError
    && error.code === 'v52_cancellation_contract_binding_invalid');
});

test('leaves historical V5.1 cancellation pending without inventing a V5.2 case', async () => {
  const client = clientForOpen(binding({ contract_version: 'V5.1-2026-08-16' }));
  const result = await openV52ActualLossCase(client, {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    cause: 'after_start',
    rentRefundObligationId: '33333333-3333-4333-8333-333333333333',
    sitFeeRefundObligationId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'cancel-command:actual-loss',
  });
  assert.equal(result, null);
  assert.equal(client.calls.some(({ sql }) => sql.includes('INSERT INTO v52_actual_loss_cases')), false);
});

test('rejects invalid workflow times and receipt identifiers before a database call', async () => {
  const client = clientForOpen();
  await assert.rejects(() => openV52ActualLossCase(client, {
    actor: { id: 'owner-1', role: 'user' },
    bookingId: 'booking-1',
    cause: 'after_start',
    rentRefundObligationId: '33333333-3333-4333-8333-333333333333',
    sitFeeRefundObligationId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'cancel-command:actual-loss',
    now: 'not-a-time',
  }), (error) => error instanceof V52ActualLossError
    && error.code === 'v52_actual_loss_opened_at_invalid');
  assert.equal(client.calls.length, 0);

  await assert.rejects(() => getV52ActualLossReceipt(client, {
    actor: { id: 'renter-1', role: 'user' },
    resolutionId: 'not-a-uuid',
  }), (error) => error instanceof V52ActualLossError
    && error.code === 'v52_actual_loss_resolution_id_invalid');
  assert.equal(client.calls.length, 0);
});
