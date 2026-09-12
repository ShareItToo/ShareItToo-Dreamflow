import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.MAIL_TRANSPORT = 'memory';
process.env.PUSH_TRANSPORT = 'disabled';
process.env.PAYMENT_TRANSPORT = 'memory';

const {
  getV51WithdrawalReceipt,
  recordV51Withdrawal,
  renderV51WithdrawalReceipt,
  settleV51WithdrawalRefundAtReturn,
  V51WithdrawalError,
} = await import('../src/v51_withdrawal_workflow.js');

const now = new Date('2026-08-17T10:00:00.000Z');

function document() {
  const contentText = 'Widerruf <script>nicht ausführen</script>';
  return {
    id: 'withdrawal-doc-1',
    document_version: 'V5.1-2026-08-16',
    content_type: 'text/plain',
    content_text: contentText,
    content_sha256: crypto.createHash('sha256').update(contentText).digest('hex'),
  };
}

function booking(workflowStatus = 'confirmed', returnedAt = null) {
  return {
    id: 'booking-1',
    owner_id: 'owner-1',
    renter_id: 'renter-1',
    status: workflowStatus === 'confirmed' ? 'accepted' : 'running',
    workflow_status: workflowStatus,
    starts_at: new Date('2026-08-18T10:00:00.000Z'),
    ends_at: new Date('2026-08-20T10:00:00.000Z'),
    returned_at: returnedAt,
    currency: 'EUR',
    rental_subtotal_minor: 10000,
    platform_fee_minor: 1000,
    workflow_revision: 3,
    payload: { id: 'booking-1' },
    platform_contract_id: 'contract-1',
    platform_contract_accepted_at: new Date('2026-08-16T09:00:00.000Z'),
  };
}

function clientForBooking(row) {
  const calls = [];
  let refundIndex = 0;
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM v51_withdrawals WHERE idempotency_key')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT email, profile FROM users')) {
        return { rowCount: 1, rows: [{ email: 'renter@example.test', profile: { displayName: 'Renter <One>' } }] };
      }
      if (sql.includes("document_key = 'withdrawal'")) return { rowCount: 1, rows: [document()] };
      if (sql.includes('INSERT INTO v51_withdrawals')) {
        return { rowCount: 1, rows: [{ id: 'withdrawal-1' }] };
      }
      if (sql.includes("scope = 'booking_contract'")) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM bookings AS booking') && sql.includes('platform_contracts')) {
        return { rowCount: 1, rows: [row] };
      }
      if (sql.includes('listing.payload AS listing_payload')) {
        return {
          rowCount: 1,
          rows: [{
            owner_id: row.owner_id,
            renter_id: row.renter_id,
            listing_payload: { title: 'Bohrmaschine' },
            owner_profile: { displayName: 'Owner' },
            renter_profile: { displayName: 'Renter' },
          }],
        };
      }
      if (sql.includes('INSERT INTO v51_refund_obligations')) {
        const type = values[2];
        refundIndex += 1;
        return {
          rowCount: 1,
          rows: [{
            id: `obligation-${refundIndex}`,
            refund_type: type,
            debtor_role: values[3],
            currency: values[4],
            status: values[5],
            amount_due_minor: values[6],
            maximum_minor: values[7],
            calculation_basis: JSON.parse(values[8]),
          }],
        };
      }
      if (sql.includes('INSERT INTO v51_withdrawal_receipts')) {
        return { rowCount: 1, rows: [{ id: 'receipt-1' }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
}

test('receipt contains scope, consequences, separate refunds and escaped source text', () => {
  const html = renderV51WithdrawalReceipt({
    withdrawalId: 'withdrawal-1',
    scope: 'booking_contract',
    actorName: 'Renter <One>',
    bookingId: 'booking-1',
    platformContractId: 'contract-1',
    submittedAt: now,
    electronicChannel: 'in_app_download',
    effect: { phase: 'before_handover' },
    withdrawalDocument: document(),
    refunds: [
      { type: 'rent_refund', debtorRole: 'owner', status: 'required', amountDueMinor: 10000, currency: 'EUR' },
      { type: 'sit_fee_refund', debtorRole: 'sit', status: 'required', amountDueMinor: 1000, currency: 'EUR' },
    ],
  });
  assert.match(html, /Renter &lt;One&gt;/u);
  assert.match(html, /rent_refund/u);
  assert.match(html, /sit_fee_refund/u);
  assert.match(html, /Widerruf &lt;script&gt;nicht ausführen&lt;\/script&gt;/u);
  assert.equal(html.includes('<script>'), false);
});

test('before-handover withdrawal atomically cancels and creates two full obligations', async () => {
  const client = clientForBooking(booking());
  const result = await recordV51Withdrawal(client, {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    raw: {
      scope: 'booking_contract',
      acknowledgedConsequences: true,
      electronicChannel: 'in_app_download',
    },
    idempotencyKey: 'withdrawal-booking-1',
    now,
  });
  assert.equal(result.booking.workflowStatus, 'cancelled');
  assert.equal(result.rentRefund.amountDueMinor, 10000);
  assert.equal(result.rentRefund.debtorRole, 'owner');
  assert.equal(result.sitFeeRefund.amountDueMinor, 1000);
  assert.equal(result.sitFeeRefund.debtorRole, 'sit');
  assert.match(result.withdrawal.receipt.downloadPath, /withdrawal-1\/receipt/u);
  assert.equal(client.calls.filter(({ sql }) => sql.includes('INSERT INTO v51_refund_obligations')).length, 2);
  const bookingUpdate = client.calls.find(({ sql }) => sql.includes('UPDATE bookings'));
  assert.deepEqual(bookingUpdate.values.slice(1, 3), ['cancelled', 'cancelled']);
  const receiptAt = client.calls.findIndex(({ sql }) => sql.includes('INSERT INTO v51_withdrawal_receipts'));
  const eventAt = client.calls.findIndex(({ sql }) => sql.includes("'platform.withdrawal_effect_applied'"));
  assert.ok(eventAt >= 0 && eventAt < receiptAt);
});

test('after-handover withdrawal requires return and never invents rent refund amount', async () => {
  const row = booking('active');
  row.starts_at = new Date('2026-08-16T10:00:00.000Z');
  const client = clientForBooking(row);
  const result = await recordV51Withdrawal(client, {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    raw: { scope: 'booking_contract', acknowledgedConsequences: true },
    idempotencyKey: 'withdrawal-active-1',
    now,
  });
  assert.equal(result.booking.workflowStatus, 'withdrawalReturnRequired');
  assert.equal(result.rentRefund.status, 'calculation_pending');
  assert.equal(result.rentRefund.amountDueMinor, null);
  assert.equal(result.sitFeeRefund.amountDueMinor, 1000);
  const bookingUpdate = client.calls.find(({ sql }) => sql.includes('UPDATE bookings'));
  assert.deepEqual(bookingUpdate.values.slice(1, 3), ['running', 'withdrawalReturnRequired']);
});

test('late declaration is receipted but never mutates booking or invents refunds', async () => {
  const row = booking('active');
  row.starts_at = new Date('2026-08-01T10:00:00.000Z');
  row.platform_contract_accepted_at = new Date('2026-08-01T09:00:00.000Z');
  const client = clientForBooking(row);
  const result = await recordV51Withdrawal(client, {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    raw: { scope: 'booking_contract', acknowledgedConsequences: true },
    idempotencyKey: 'withdrawal-late-1',
    now,
  });
  assert.equal(result.withdrawal.eligibilityStatus, 'manual_review_required');
  assert.equal(result.withdrawal.effectStatus, 'manual_review_required');
  assert.equal(result.booking.workflowStatus, 'active');
  assert.equal(result.rentRefund, null);
  assert.equal(result.sitFeeRefund, null);
  assert.equal(client.calls.some(({ sql }) => sql.includes('UPDATE bookings')), false);
  assert.equal(
    client.calls.some(({ sql }) => sql.includes('INSERT INTO v51_refund_obligations')),
    false,
  );
});

test('withdrawal accepts no reason field and fails closed without exact V5.1 document', async () => {
  await assert.rejects(recordV51Withdrawal({ async query() { return { rowCount: 0, rows: [] }; } }, {
    actor: { id: 'renter-1', role: 'user' },
    raw: { scope: 'account_contract', acknowledgedConsequences: true, reason: 'not required' },
    idempotencyKey: 'withdrawal-account-1',
  }), (error) => error instanceof V51WithdrawalError
    && error.code === 'v51_withdrawal_reason_must_not_be_requested');

  const client = {
    async query(sql) {
      if (sql.includes('FROM v51_withdrawals WHERE idempotency_key')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT email, profile FROM users')) {
        return { rowCount: 1, rows: [{ email: 'renter@example.test', profile: {} }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  await assert.rejects(recordV51Withdrawal(client, {
    actor: { id: 'renter-1', role: 'user' },
    raw: { scope: 'account_contract', acknowledgedConsequences: true },
    idempotencyKey: 'withdrawal-account-2',
  }), (error) => error instanceof V51WithdrawalError
    && error.code === 'v51_withdrawal_document_unavailable');
});

test('withdrawal receipt is owner-only, hash checked and first delivery idempotent', async () => {
  const html = '<h1>confirmation</h1>';
  const hash = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
  const calls = [];
  const receipt = await getV51WithdrawalReceipt({
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM v51_withdrawal_receipts')) {
        return { rowCount: 1, rows: [{ id: 'receipt-1', content_html: html, artifact_sha256: hash }] };
      }
      return { rowCount: 1, rows: [] };
    },
  }, { actorId: 'renter-1', withdrawalId: 'withdrawal-1', deliveredAt: now });
  assert.equal(receipt.contentHtml, html);
  assert.match(calls[1].sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/u);

  await assert.rejects(getV51WithdrawalReceipt({
    async query() { return { rowCount: 0, rows: [] }; },
  }, { actorId: 'other', withdrawalId: 'withdrawal-1' }),
  (error) => error instanceof V51WithdrawalError
    && error.code === 'v51_withdrawal_receipt_not_found');
});

test('verified return resolves the pending rent refund through an immutable event', async () => {
  const calls = [];
  const result = await settleV51WithdrawalRefundAtReturn({
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM v51_refund_obligations AS obligation')) {
        return {
          rowCount: 1,
          rows: [{
            obligation_id: 'obligation-rent-1',
            withdrawal_id: 'withdrawal-1',
            maximum_minor: 10000,
            starts_at: new Date('2026-08-16T10:00:00.000Z'),
            ends_at: new Date('2026-08-20T10:00:00.000Z'),
            rental_subtotal_minor: 10000,
            platform_fee_minor: 1000,
            workflow_status: 'withdrawalReturnRequired',
          }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  }, {
    bookingId: 'booking-1',
    confirmedReturnAt: new Date('2026-08-18T10:00:00.000Z'),
    idempotencyKey: 'return-settlement-1',
  });
  assert.equal(result.amountDueMinor, 5000);
  assert.equal(result.status, 'required');
  const event = calls.find(({ sql }) => sql.includes('INSERT INTO v51_refund_obligation_events'));
  assert.equal(event.values[1], 5000);
  assert.match(event.sql, /ON CONFLICT \(obligation_id, event_type\) DO NOTHING/u);
  assert.ok(calls.some(({ sql }) => sql.includes('platform.withdrawal_refund_calculated')));
});
