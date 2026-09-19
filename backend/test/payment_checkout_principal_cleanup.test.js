import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.PAYMENT_TRANSPORT = 'memory';
process.env.STRIPE_LIVEMODE = 'false';
process.env.PUBLIC_COMPLIANCE_APPROVED = 'false';
process.env.FINANCIAL_DOCUMENTS_LIVE_ISSUANCE_APPROVED = 'false';
process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.FIREBASE_PHONE_VERIFICATION_ENABLED = 'false';
process.env.FIREBASE_CRASH_REPORT_DELETION_ENABLED = 'false';
process.env.PUSH_TRANSPORT = 'memory';
process.env.MAIL_TRANSPORT = 'memory';
process.env.SIT_LISTING_AI_PROVIDER = 'mock';
process.env.SIT_LISTING_AI_BUDGET_CENTS = '0';

const {
  createPaymentCheckout,
  stripeProvider,
} = await import('../src/payment_workflow.js');
const { requestHash } = await import('../src/payment_domain.js');
const { pool } = await import('../src/db.js');

after(() => pool.end());

function compactSql(sql) {
  return String(sql).replace(/\s+/gu, ' ').trim();
}

function transactionClient(handler) {
  const statements = [];
  return {
    statements,
    client: {
      async query(sql, parameters = []) {
        const statement = compactSql(sql);
        statements.push({ statement, parameters });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
          return { rowCount: 0, rows: [] };
        }
        if (statement.includes('pg_advisory_xact_lock')) {
          return { rowCount: 1, rows: [{}] };
        }
        return handler(statement, parameters);
      },
      release() {},
    },
  };
}

function principalFence(statement, parameters, {
  bookingId,
  ownerId,
  renterId,
  active,
}) {
  if (statement.startsWith('SELECT owner_id, renter_id FROM bookings')) {
    assert.deepEqual(parameters, [bookingId]);
    return { rowCount: 1, rows: [{ owner_id: ownerId, renter_id: renterId }] };
  }
  if (statement.startsWith('SELECT id, account_status, deactivated_at FROM users')) {
    const ids = [ownerId, renterId].sort();
    assert.deepEqual(parameters, [ids]);
    return {
      rowCount: 2,
      rows: ids.map((id) => ({
        id,
        account_status: !active && id === ownerId ? 'suspended' : 'active',
        deactivated_at: null,
      })),
    };
  }
  return null;
}

test('account suspension after provider creation expires checkout before rejection', async (t) => {
  const actor = {
    id: 'wp151-checkout-renter',
    role: 'user',
    email: 'renter@example.invalid',
    profile: { displayName: 'WP151 renter' },
  };
  const ownerId = 'wp151-checkout-owner';
  const bookingId = 'wp151-checkout-booking';
  const paymentId = '89898989-8989-4989-8989-898989898989';
  const key = 'wp151-checkout-principal-race';
  const checkoutExpiresAt = new Date(Date.now() + 40 * 60_000);
  const command = {
    idempotency_key: key,
    actor_id: actor.id,
    command_type: 'payment.checkout',
    request_hash: requestHash({ bookingId }),
    booking_id: bookingId,
    payment_id: null,
    response_payload: null,
    response_payload_sha256: null,
    completed_at: null,
    completion_integrity_version: null,
    settlement_refunded_minor: null,
    settlement_transferred_minor: null,
  };
  const booking = {
    id: bookingId,
    renter_id: actor.id,
    owner_id: ownerId,
    workflow_status: 'payment_pending',
    simulation_only: false,
    quoted_total_minor: '3300',
    rental_subtotal_minor: '3000',
    owner_payout_minor: '3000',
    currency: 'EUR',
    provider_account_id: 'acct_wp151_checkout_owner',
    account_api_version: 'v2',
    recipient_transfers_status: 'active',
    payouts_enabled: true,
    dashboard_type: 'express',
    fees_collector: 'application',
    losses_collector: 'application',
    listing_payload: {},
  };
  const payment = {
    id: paymentId,
    booking_id: bookingId,
    status: 'created',
    amount_minor: '3300',
    rental_subtotal_minor: '3000',
    platform_fee_minor: '300',
    owner_payout_minor: '3000',
    security_deposit_minor: '0',
    captured_minor: '0',
    refunded_minor: '0',
    transferred_minor: '0',
    currency: 'EUR',
    failure_code: null,
    captured_at: null,
    checkout_command_key: key,
    checkout_expires_at: checkoutExpiresAt,
    transfer_group: `booking_${bookingId}`,
    livemode: false,
    updated_at: new Date(),
  };

  const prepare = transactionClient(async (statement, parameters) => {
    const fence = principalFence(statement, parameters, {
      bookingId, ownerId, renterId: actor.id, active: true,
    });
    if (fence) return fence;
    if (statement.startsWith('INSERT INTO payment_commands')) {
      return { rowCount: 1, rows: [] };
    }
    if (statement.startsWith('SELECT * FROM payment_commands')) {
      return { rowCount: 1, rows: [command] };
    }
    if (statement.includes('FROM bookings AS booking')) {
      return { rowCount: 1, rows: [booking] };
    }
    if (statement.startsWith('SELECT * FROM payments')) {
      return { rowCount: 1, rows: [payment] };
    }
    if (statement.startsWith('UPDATE payment_commands SET payment_id')) {
      assert.deepEqual(parameters, [key, paymentId]);
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected_wp151_checkout_prepare_sql:${statement}`);
  });
  const rejectCompletion = transactionClient(async (statement, parameters) => {
    const fence = principalFence(statement, parameters, {
      bookingId, ownerId, renterId: actor.id, active: false,
    });
    if (fence) return fence;
    throw new Error(`unexpected_wp151_checkout_reject_sql:${statement}`);
  });
  const cleanup = transactionClient(async (statement, parameters) => {
    const fence = principalFence(statement, parameters, {
      bookingId, ownerId, renterId: actor.id, active: false,
    });
    if (fence) return fence;
    if (statement.startsWith('UPDATE payments SET provider_checkout_session_id')) {
      assert.deepEqual(parameters, [
        paymentId,
        'cs_wp151_principal_race',
        'payment_principal_inactive',
      ]);
      return { rowCount: 1, rows: [{ id: paymentId }] };
    }
    if (statement.startsWith('INSERT INTO audit_log')) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected_wp151_checkout_cleanup_sql:${statement}`);
  });
  let transactionIndex = 0;
  const transactions = [prepare, rejectCompletion, cleanup];
  t.mock.method(pool, 'connect', async () => {
    const transaction = transactions[transactionIndex];
    transactionIndex += 1;
    if (!transaction) throw new Error('unexpected_wp151_checkout_transaction');
    return transaction.client;
  });
  t.mock.method(pool, 'query', async (sql, parameters = []) => {
    assert.equal(compactSql(sql), 'SELECT * FROM stripe_customers WHERE user_id = $1');
    assert.deepEqual(parameters, [actor.id]);
    return {
      rowCount: 1,
      rows: [{ user_id: actor.id, provider_customer_id: 'cus_wp151_checkout_renter' }],
    };
  });
  const create = t.mock.method(stripeProvider, 'createPaymentCheckout', async () => ({
    id: 'cs_wp151_principal_race',
    object: 'checkout.session',
    status: 'open',
    payment_intent: 'pi_wp151_principal_race',
    url: 'https://checkout.example.invalid/wp151',
    expires_at: Math.floor(checkoutExpiresAt.getTime() / 1000),
  }));
  const expire = t.mock.method(stripeProvider, 'expirePaymentCheckout', async ({ sessionId }) => ({
    id: sessionId,
    object: 'checkout.session',
    status: 'expired',
    url: null,
  }));

  await assert.rejects(
    createPaymentCheckout({ actor, bookingId, key }),
    (error) => error?.status === 409 && error?.code === 'payment_principal_inactive',
  );

  assert.equal(create.mock.callCount(), 1);
  assert.equal(expire.mock.callCount(), 1);
  assert.equal(transactionIndex, 3);
  assert.equal(prepare.statements.at(-1)?.statement, 'COMMIT');
  assert.equal(rejectCompletion.statements.at(-1)?.statement, 'ROLLBACK');
  assert.equal(cleanup.statements.at(-1)?.statement, 'COMMIT');
  assert.equal(cleanup.statements.some(({ statement }) => (
    statement.startsWith('UPDATE payments SET provider_checkout_session_id')
  )), true);
});
