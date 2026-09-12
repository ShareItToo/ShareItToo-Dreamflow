import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [
  migration,
  withdrawalWorkflow,
  bookingWorkflow,
  paymentWorkflow,
  withdrawalScreen,
  cancellationPolicy,
  cancellationCopy,
  bookingDetail,
  regressionScript,
] = await Promise.all([
  read('backend/sql/migrations/018_v51_withdrawal_and_refund_obligations.up.sql'),
  read('backend/src/v51_withdrawal_workflow.js'),
  read('backend/src/booking_workflow.js'),
  read('backend/src/payment_workflow.js'),
  read('lib/screens/platform_withdrawal_screen.dart'),
  read('lib/services/private_pilot_cancellation_policy.dart'),
  read('lib/utils/cancellation_policy_text.dart'),
  read('lib/screens/booking_detail_screen.dart'),
  read('scripts/technical_regression_check.sh'),
]);

test('withdrawal is race-safe, 14-day bounded and preserves later-right review', () => {
  assert.match(migration, /v51_withdrawals_one_booking_contract_idx/u);
  assert.match(
    withdrawalWorkflow,
    /ON CONFLICT \(booking_id\) WHERE scope = 'booking_contract' DO NOTHING/u,
  );
  assert.match(withdrawalWorkflow, /14 \* 24 \* 60 \* 60 \* 1000/u);
  assert.match(withdrawalWorkflow, /manual_review_required/u);
  assert.match(
    withdrawalWorkflow,
    /Buchung und Erstattungen werden bis dahin nicht automatisch verändert/u,
  );
});

test('withdrawal creates separate immutable obligations and resolves rent only at return', () => {
  for (const marker of [
    'v51_refund_obligations',
    'v51_refund_obligation_events',
    "'rent_refund'",
    "'sit_fee_refund'",
    "debtor_role = 'owner'",
    "debtor_role = 'sit'",
  ]) assert.match(migration, new RegExp(marker, 'u'));
  assert.match(withdrawalWorkflow, /settleV51WithdrawalRefundAtReturn/u);
  assert.match(withdrawalWorkflow, /source: 'verified_return_transition'/u);
  assert.match(
    bookingWorkflow,
    /if \(next === 'returned' && !simulationOnly\)[\s\S]*settleV51WithdrawalRefundAtReturn/u,
  );
});

test('cancellation stores two obligations and never invents an after-start amount', () => {
  assert.match(migration, /v51_cancellation_refund_obligations/u);
  assert.match(bookingWorkflow, /pending_actual_loss_assessment/u);
  assert.match(bookingWorkflow, /'rent_refund'[\s\S]*'sit_fee_refund'/u);
  assert.match(
    bookingWorkflow,
    /\$\{commandKey\}:cancellation:\$\{refundType\}/u,
  );
  assert.match(
    paymentWorkflow,
    /calculationStatus !== 'final'[\s\S]*continue/u,
  );
  assert.match(cancellationPolicy, /refundBasisPoints: null/u);
  assert.match(cancellationCopy, /keine starre Stornopauschale/u);
  assert.doesNotMatch(cancellationCopy, /keine Rückerstattung/u);
});

test('app uses two-step withdrawal and a durable authenticated receipt', () => {
  assert.match(withdrawalScreen, /'account_contract'/u);
  assert.match(withdrawalScreen, /'booking_contract'/u);
  assert.match(withdrawalScreen, /Folgen prüfen/u);
  assert.match(withdrawalScreen, /Widerruf bestätigen/u);
  assert.match(withdrawalScreen, /downloadWithdrawalReceipt/u);
  assert.match(withdrawalScreen, /shareittoo-widerrufsbestaetigung\.html/u);
  assert.match(withdrawalScreen, /Eine Begründung ist nicht erforderlich/u);
});

test('cancelled booking UI reads stored outcomes and never recomputes at render time', () => {
  const refundSection = bookingDetail.match(
    /\/\/ Refund info[\s\S]*?\/\/ Show receipt download/u,
  )?.[0] ?? '';
  assert.notEqual(refundSection, '');
  assert.match(refundSection, /cancellationOutcome/u);
  assert.match(refundSection, /pending_actual_loss_assessment/u);
  assert.match(refundSection, /Mietpreis-Erstattung · Vermieter/u);
  assert.match(refundSection, /SIT-Gebühren-Erstattung · SIT/u);
  assert.doesNotMatch(refundSection, /DateTime\.now/u);
  assert.doesNotMatch(refundSection, /refundRatio/u);
});

test('the permanent regression gate runs the V5.1 withdrawal wiring contract', () => {
  assert.match(
    regressionScript,
    /node --test test\/tool\/v51_withdrawal_and_cancellation_wiring\.test\.mjs/u,
  );
});
