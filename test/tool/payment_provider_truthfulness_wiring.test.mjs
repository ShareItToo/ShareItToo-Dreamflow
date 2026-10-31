import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('backend/src/app.js', 'utf8');
const repository = fs.readFileSync('lib/services/backend_repository.dart', 'utf8');
const methods = fs.readFileSync('lib/screens/payment_methods_screen.dart', 'utf8');
const payout = fs.readFileSync('lib/screens/stripe_payout_account_screen.dart', 'utf8');
const checkout = fs.readFileSync('lib/screens/payment_checkout_screen.dart', 'utf8');
const notifications = fs.readFileSync('backend/src/notifications.js', 'utf8');
const provider = fs.readFileSync('backend/src/stripe_provider.js', 'utf8');
const domain = fs.readFileSync('backend/src/payment_domain.js', 'utf8');
const workflow = fs.readFileSync('backend/src/payment_workflow.js', 'utf8');
const executionGuard = fs.readFileSync('backend/src/payment_execution_guard.js', 'utf8');
const withdrawalWorkflow = fs.readFileSync('backend/src/v51_withdrawal_workflow.js', 'utf8');
const bookingWorkflow = fs.readFileSync('backend/src/booking_workflow.js', 'utf8');
const migration = fs.readFileSync(
  'backend/sql/migrations/071_stripe_connect_accounts_v2.up.sql',
  'utf8',
);
const refundReversalMigration = fs.readFileSync(
  'backend/sql/migrations/075_refund_transfer_reversal_recovery.up.sql',
  'utf8',
);
const commandResultMigration = fs.readFileSync(
  'backend/sql/migrations/076_payment_command_result_immutability.up.sql',
  'utf8',
);
const refundTruthMigration = fs.readFileSync(
  'backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
  'utf8',
);

test('server exposes one account-bound provider capability truth', () => {
  assert.match(app, /function paymentCapabilitiesFor\(userId\)/u);
  assert.match(app, /providerBacked = config\.payments\.transport === 'stripe'/u);
  assert.match(app, /app\.get\('\/v1\/payments\/capabilities'/u);
  assert.match(
    app,
    /paymentMethodAvailable: paymentCapabilitiesFor\(req\.auth\.userId\)[\s\S]*?\.checkoutAvailable/u,
  );
  assert.match(
    app,
    /function paymentOnboardingExecutionAllowed\(userId\)[\s\S]*?deploymentEnvironment === 'test'[\s\S]*?transport === 'memory'/u,
  );
  assert.match(app, /if \(!paymentOnboardingExecutionAllowed\(req\.auth\.userId\)\)/u);
});

test('client reads capabilities instead of assuming a provider', () => {
  assert.match(repository, /getPaymentCapabilities\(\)/u);
  assert.match(repository, /path: '\/payments\/capabilities'/u);
  assert.match(methods, /BackendRepository\.getPaymentCapabilities/u);
  assert.match(methods, /_capabilities\?\['checkoutAvailable'\] == true/u);
  assert.match(methods, /Noch nicht freigeschaltet/u);
  assert.match(methods, /Zahlungstest verfügbar/u);
});

test('payout onboarding cannot render or start without server capability', () => {
  assert.match(payout, /BackendRepository\.getPaymentCapabilities/u);
  assert.match(
    payout,
    /capabilities\['payoutOnboardingAvailable'\] != true/u,
  );
  assert.match(
    payout,
    /if \(_capabilities\?\['payoutOnboardingAvailable'\] != true\) return;/u,
  );
  assert.match(payout, /if \(providerAvailable\)[\s\S]*?FilledButton\.icon/u);
  assert.match(payout, /Auszahlungen noch nicht freigeschaltet/u);
});

test('direct checkout is server- and client-gated by the same capability', () => {
  assert.match(
    app,
    /function paymentCheckoutExecutionAllowed\(userId\)[\s\S]*?deploymentEnvironment === 'test'[\s\S]*?transport === 'memory'/u,
  );
  assert.match(
    app,
    /if \(!paymentCheckoutExecutionAllowed\(req\.auth\.userId\)\)[\s\S]*?payment_provider_unavailable/u,
  );
  assert.match(checkout, /BackendRepository\.getPaymentCapabilities/u);
  assert.match(checkout, /if \(!_providerAvailable\(_capabilities\)\) return;/u);
  assert.match(
    checkout,
    /if \(providerAvailable &&\s*!captured &&\s*!refundVerificationPending\)[\s\S]*?FilledButton\.icon/u,
  );
  assert.match(checkout, /Zahlung noch nicht freigeschaltet/u);
  assert.match(checkout, /Test-Checkout öffnen/u);
  assert.match(checkout, /payment_checkout_reconciliation_required/u);
  assert.match(checkout, /es wird kein zweiter Zahlungsvorgang gestartet/u);
});

test('connected accounts use Accounts v2 recipient capability truth', () => {
  assert.match(provider, /client\.v2\.core\.accounts\.create/u);
  assert.match(provider, /dashboard: 'express'/u);
  assert.match(provider, /fees_collector: 'application'/u);
  assert.match(provider, /losses_collector: 'application'/u);
  assert.match(provider, /stripe_transfers: \{ requested: true \}/u);
  assert.doesNotMatch(provider, /type: 'express'/u);
  assert.match(provider, /client\.v2\.core\.accountLinks\.create/u);
  assert.match(provider, /client\.parseEventNotification/u);
  assert.match(provider, /client\.webhooks\.constructEvent/u);
  assert.match(provider, /client\.v2\.core\.accounts\.retrieve/u);
  assert.match(workflow, /account_api_version !== 'v2'/u);
  assert.match(workflow, /row\.recipient_transfers_status === 'active'/u);
  assert.match(workflow, /row\.payouts_enabled === true/u);
  assert.equal(workflow.match(/connectedAccountRowReady\(/gu)?.length >= 4, true);
  assert.match(workflow, /row\.dashboard_type === 'express'/u);
  assert.match(workflow, /row\.fees_collector === 'application'/u);
  assert.match(workflow, /row\.losses_collector === 'application'/u);
  assert.match(workflow, /event\?\.related_object\?\.id/u);
  assert.match(migration, /account_api_version TEXT NOT NULL DEFAULT 'v1'/u);
});

test('separate charges and transfers never use destination-refund flags', () => {
  assert.match(provider, /client\.refunds\.create/u);
  assert.doesNotMatch(provider, /reverse_transfer:/u);
  assert.doesNotMatch(provider, /refund_application_fee:/u);
  assert.match(provider, /client\.transfers\.create/u);
  assert.match(provider, /client\.transfers\.createReversal/u);
  assert.match(
    refundTruthMigration,
    /RENAME COLUMN refund_platform_fee TO legacy_refund_platform_fee_claim/u,
  );
  assert.match(
    refundTruthMigration,
    /provider_refund_model = 'separate_charge_manual_transfer_reversal_v1'/u,
  );
  assert.match(workflow, /sit_refund_model: trustedRefundProviderModel/u);
  assert.match(domain, /metadata\.sit_refund_model !== refund\.provider_refund_model/u);
  const refundProviderCall = workflow.slice(
    workflow.indexOf('providerRefund = await stripeProvider.createRefund'),
    workflow.indexOf('assertProviderRefundBinding({',
      workflow.indexOf('providerRefund = await stripeProvider.createRefund')),
  );
  assert.doesNotMatch(refundProviderCall, /refundPlatformFee|reverseTransfer/u);
});

test('refund-side transfer reversals are payout-bound and durably recoverable', () => {
  assert.match(refundReversalMigration, /CREATE TABLE refund_transfer_reversals/u);
  assert.match(refundReversalMigration, /UNIQUE \(refund_id, payout_id\)/u);
  assert.match(refundReversalMigration, /provider_idempotency_key TEXT NOT NULL UNIQUE/u);
  assert.match(refundReversalMigration, /'uncertain'/u);
  assert.match(refundReversalMigration, /FOREIGN KEY \(refund_id, payment_id\)/u);
  assert.match(refundReversalMigration, /FOREIGN KEY \(payout_id, payment_id\)/u);
  assert.match(workflow, /refundTransferReversalPlan/u);
  assert.match(workflow, /sit_refund_transfer_reversal_id/u);
  assert.match(workflow, /provider\.findTransferReversal/u);
  assert.match(workflow, /stripeProvider\.findRefund/u);
  assert.match(workflow, /assertProviderRefundBinding/u);
  assert.match(workflow, /providerOperationIdempotencyKey\('refund_transfer_reversal', id\)/u);
  assert.match(workflow, /UPDATE payments SET transferred_minor = transferred_minor - \$2/u);
  assert.match(provider, /refundTransferReversalId/u);
  assert.match(provider, /provider_refund_inventory_conflict/u);
});

test('refund and payout preparations form a durable mutually exclusive fence', () => {
  const refund = workflow.slice(
    workflow.indexOf('export async function refundPayment'),
    workflow.indexOf('async function markPayoutTransferFailure'),
  );
  const payoutRelease = workflow.slice(
    workflow.indexOf('export async function releasePayout'),
    workflow.indexOf('export async function reviewFailedPayout'),
  );
  assert.match(refund, /FOR UPDATE OF payment, booking/u);
  assert.match(
    refund,
    /FROM payouts[\s\S]{0,160}status IN \('scheduled', 'pending', 'failed'\)[\s\S]{0,160}refund_blocked_by_payout_in_flight/u,
  );
  assert.match(payoutRelease, /FOR UPDATE OF payment, booking/u);
  assert.match(
    payoutRelease,
    /FROM refunds[\s\S]{0,160}status <> 'succeeded'[\s\S]{0,160}local_settlement_status <> 'completed'[\s\S]{0,160}payout_blocked_by_refund_in_flight/u,
  );
  assert.equal(
    refund.indexOf('completedCommand?.completed_at')
      < refund.indexOf('refund_blocked_by_payout_in_flight'),
    true,
  );
  assert.equal(
    payoutRelease.indexOf('completedCommand?.completed_at')
      < payoutRelease.indexOf('payout_blocked_by_refund_in_flight'),
    true,
  );
  assert.match(refund, /completedCommand\.booking_id !== payment\.booking_id/u);
  assert.match(refund, /completedCommand\.actor_id !== \(actor\?\.id \?\? null\)/u);
  assert.match(payoutRelease, /completedCommand\.booking_id !== payment\.booking_id/u);
  assert.match(payoutRelease, /completedCommand\.actor_id !== \(actor\?\.id \?\? null\)/u);
});

test('a signed dispute event cannot be overtaken by local payout finalization', () => {
  const disputeBranch = workflow.slice(
    workflow.indexOf("if (event.type.startsWith('charge.dispute.'))"),
    workflow.indexOf('export async function applyProviderEvent'),
  );
  assert.match(disputeBranch, /FOR UPDATE OF payment, booking/u);
  assert.match(
    disputeBranch,
    /FROM payouts[\s\S]{0,120}status IN \('scheduled', 'pending'\)[\s\S]{0,180}provider_dispute_deferred_by_payout/u,
  );
  assert.equal(
    disputeBranch.indexOf('provider_dispute_deferred_by_payout')
      < disputeBranch.indexOf('INSERT INTO disputes'),
    true,
  );
  assert.match(
    workflow,
    /UPDATE payment_provider_events SET status = 'failed'[\s\S]{0,160}last_error_code/u,
  );
});

test('V5.2 payout waits for both the return timeline and fourteen-day solution window', () => {
  assert.match(domain, /export function payoutReleaseAvailableAt/u);
  assert.match(domain, /version !== v52ContractDocument\.version/u);
  assert.match(domain, /endOfReturnPolicyCalendarDay\([\s\S]{0,120}deLegalDeadlineTimeZone/u);
  assert.match(
    domain,
    /const authoritativeContractAt = contractTime\.acceptedAt > contractTime\.createdAt[\s\S]{0,140}\? contractTime\.acceptedAt[\s\S]{0,80}: contractTime\.createdAt/u,
  );
  assert.match(domain, /contractUserId !== renterId/u);
  assert.match(workflow, /contract\.accepted_at AS platform_contract_accepted_at/u);
  assert.match(workflow, /contract\.contract_version AS platform_contract_version/u);
  assert.match(workflow, /contract\.user_id AS platform_contract_user_id/u);
  assert.match(workflow, /payoutReleaseAvailableAt\(\{/u);
  assert.match(workflow, /clock_timestamp\(\) AS database_now/u);
  assert.doesNotMatch(workflow, /requireV52Contract/u);
  assert.doesNotMatch(domain, /requireV52Contract/u);
  assert.doesNotMatch(domain, /rentalTimezone/u);
  assert.doesNotMatch(
    domain,
    /platformContractVersion\.trim|platformContractUserId\.trim|bookingRenterId\.trim/u,
  );
  assert.match(workflow, /OR NOT isfinite\(contract\.accepted_at\)/u);
  assert.match(workflow, /active_payout\.status IS DISTINCT FROM 'failed'/u);
  assert.match(
    workflow,
    /booking\.payout_instruction_due_at <= now\(\)[\s\S]{0,240}booking\.completed_at <= now\(\) - \(\$2::text \|\| ' hours'\)::interval/u,
  );
  assert.match(workflow, /contractBlocked: result\.rows\[0\]\.contract_blocked/u);
  assert.equal(workflow.match(/databaseNow <= availableAt/gu)?.length, 1);
  assert.equal(workflow.match(/new Date\(row\.database_now\) <= availableAt/gu)?.length, 1);
});

test('payout transfer recovery binds inventory before final ledger mutation', () => {
  assert.match(provider, /async findTransfer\(\{ accountId, transferGroup, payoutId \}\)/u);
  assert.match(provider, /client\.transfers\.list\(\{/u);
  assert.match(provider, /transfer\.metadata\?\.sit_payout_id === payoutId/u);
  assert.match(provider, /provider_transfer_inventory_conflict/u);
  assert.match(domain, /export function assertProviderTransferBinding/u);
  assert.match(domain, /export async function recoverOrCreateProviderTransfer/u);
  assert.match(domain, /if \(recoverExisting\)/u);
  assert.match(domain, /provider\.findTransfer\(\{/u);
  assert.match(domain, /assertProviderTransferBinding\(\{ payout, payment, providerTransfer \}\)/u);
  assert.match(workflow, /recoverOrCreateProviderTransfer\(\{/u);
  assert.match(workflow, /recoverExisting: prepared\.recoverExistingPayout/u);
  assert.match(workflow, /beforeCreate: \(\) => assertPaymentExecutionActive\(config\)/u);
  assert.match(workflow, /payout\.provider_transfer_deferred/u);
  assert.match(workflow, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/u);
  assert.match(workflow, /SELECT \* FROM payment_commands WHERE idempotency_key = \$1 FOR UPDATE/u);
  assert.match(workflow, /FOR UPDATE OF payout, payment/u);
  assert.match(workflow, /if \(!ledger\.inserted\)/u);
});

test('sandbox authorization gates each outbound mutation without blocking bound webhooks', () => {
  assert.match(executionGuard, /export function boundedPaymentCheckoutExpiresAt/u);
  assert.match(executionGuard, /payment_sandbox_authorization_too_short/u);
  for (const mutation of [
    'createConnectedAccount',
    'createAccountLink',
    'createCustomer',
    'createPaymentCheckout',
    'createRefund',
    'reverseTransfer',
  ]) {
    assert.match(
      workflow,
      new RegExp(`assertPaymentExecutionActive\\(config\\);[\\s\\S]{0,1200}${mutation}`),
    );
  }
  const webhook = workflow.slice(
    workflow.indexOf('export async function verifyAndApplyWebhook'),
    workflow.indexOf('export async function simulatePaymentEvent'),
  );
  assert.doesNotMatch(webhook, /assertPaymentExecutionActive/u);
  assert.match(webhook, /parseWebhookEvent/u);
  assert.match(webhook, /provider_livemode_mismatch/u);
});

test('expired sandbox authorization does not hide exact completed payment truth or local review', () => {
  const enablement = workflow.slice(
    workflow.indexOf('function ensurePaymentsEnabled'),
    workflow.indexOf('function text'),
  );
  const connectRead = workflow.slice(
    workflow.indexOf('export async function getConnectStatus'),
    workflow.indexOf('export async function createConnectOnboarding'),
  );
  const paymentRead = workflow.slice(
    workflow.indexOf('export async function getBookingPayment'),
    workflow.indexOf('async function recordCapture'),
  );
  const review = workflow.slice(
    workflow.indexOf('export async function reviewFailedPayout'),
    workflow.indexOf('export async function reconcilePaymentLifecycle'),
  );
  const refund = workflow.slice(
    workflow.indexOf('export async function refundPayment'),
    workflow.indexOf('async function markPayoutTransferFailure'),
  );
  const payoutRelease = workflow.slice(
    workflow.indexOf('export async function releasePayout'),
    workflow.indexOf('export async function reviewFailedPayout'),
  );
  assert.doesNotMatch(enablement, /assertPaymentExecutionActive/u);
  assert.doesNotMatch(connectRead, /assertPaymentExecutionActive/u);
  assert.doesNotMatch(paymentRead, /assertPaymentExecutionActive/u);
  assert.doesNotMatch(review.split("if (normalizedAction === 'retry')")[0], /assertPaymentExecutionActive/u);
  assert.match(workflow, /createConnectOnboarding[\s\S]{0,180}assertPaymentExecutionActive/u);
  assert.ok(refund.indexOf('validatedRefundCommandReplay') >= 0);
  assert.ok(
    refund.indexOf('validatedRefundCommandReplay')
      < refund.indexOf('assertPaymentExecutionActive(config);'),
  );
  assert.ok(
    refund.indexOf('assertPaymentExecutionActive(config);')
      < refund.indexOf('beginCommand(client'),
  );
  assert.ok(payoutRelease.indexOf('validatedPayoutCommandReplay') >= 0);
  assert.ok(
    payoutRelease.indexOf('validatedPayoutCommandReplay')
      < payoutRelease.indexOf('assertPaymentExecutionActive(config);'),
  );
  assert.ok(
    payoutRelease.indexOf('assertPaymentExecutionActive(config);')
      < payoutRelease.indexOf('beginCommand(client'),
  );
});

test('completed payment command receipts are hash-bound, one-shot, and relation-bound', () => {
  assert.match(commandResultMigration, /ADD COLUMN response_payload_sha256 CHAR\(64\)/u);
  assert.match(commandResultMigration, /ADD COLUMN completion_integrity_version SMALLINT/u);
  assert.match(commandResultMigration, /ADD COLUMN settlement_refunded_minor BIGINT/u);
  assert.match(commandResultMigration, /ADD COLUMN settlement_transferred_minor BIGINT/u);
  assert.match(
    commandResultMigration,
    /payment_commands_result_null_parity[\s\S]*payment_commands_result_object[\s\S]*payment_commands_result_hash/u,
  );
  assert.match(
    commandResultMigration,
    /BEFORE INSERT OR UPDATE OR DELETE ON payment_commands/u,
  );
  assert.match(commandResultMigration, /payment_command_completed_result_immutable/u);
  assert.match(commandResultMigration, /payment_command_completed_deletion_forbidden/u);

  const commandLookup = workflow.slice(
    workflow.indexOf('async function paymentCommandForUpdate'),
    workflow.indexOf('async function validatedRefundCommandReplay'),
  );
  assert.match(commandLookup, /command\.response_payload_sha256 IS NOT NULL/u);
  assert.match(
    commandLookup,
    /digest\(command\.response_payload::text, 'sha256'\)/u,
  );
  assert.match(commandLookup, /AS response_payload_hash_valid/u);

  const commandCompletion = workflow.slice(
    workflow.indexOf('async function completeCommand'),
    workflow.indexOf('function replayIntegrityFailure'),
  );
  assert.equal(
    commandCompletion.match(/completed_at IS NULL/gu)?.length,
    2,
  );
  assert.match(commandCompletion, /RETURNING idempotency_key/u);
  assert.match(commandCompletion, /completed\.rowCount !== 1/u);
  assert.match(commandCompletion, /payment_command_completion_conflict/u);

  const commonValidator = workflow.slice(
    workflow.indexOf('function validTrustedCompletedCommand'),
    workflow.indexOf('export function validateCompletedRefundCommandReplay'),
  );
  for (const marker of [
    'command.response_payload_hash_valid === true',
    'command.completion_integrity_version === 1',
    'command.actor_id === actorId',
    'command.payment_id === paymentId',
    'command.booking_id === bookingId',
    'command.request_hash === requestHash(request)',
    'command.response_payload.payment.refundedMinor === Number(refundedSnapshot)',
    'command.response_payload.payment.transferredMinor === Number(transferredSnapshot)',
  ]) assert.ok(commonValidator.includes(marker));

  const connectCheckoutReplay = workflow.slice(
    workflow.indexOf('function validStoredConnectOnboardingResponse'),
    workflow.indexOf('function validStoredPaymentReceipt'),
  );
  assert.ok(connectCheckoutReplay.includes("exactKeys(response, ['account', 'onboardingUrl', 'expiresAt', 'providerMode', 'replayed'])"));
  assert.ok(connectCheckoutReplay.includes("exactKeys(response, ['payment', 'checkoutUrl', 'providerMode', 'replayed'])"));

  const refundValidator = workflow.slice(
    workflow.indexOf('export function validateCompletedRefundCommandReplay'),
    workflow.indexOf('export function validateCompletedPayoutCommandReplay'),
  );
  for (const marker of [
    'refund.idempotency_key !== key',
    'refund.payment_id !== paymentId',
    'refund.provider_refund_model !== trustedRefundProviderModel',
    'refund.legacy_refund_platform_fee_claim != null',
    'ledger.idempotency_key !== `${key}:refund-ledger`',
    "ledger.transaction_type !== 'payment_refunded'",
  ]) assert.ok(refundValidator.includes(marker));

  const payoutValidator = workflow.slice(
    workflow.indexOf('export function validateCompletedPayoutCommandReplay'),
    workflow.indexOf('async function paymentCommandForUpdate'),
  );
  for (const marker of [
    'payout.idempotency_key !== key',
    'payout.payment_id !== paymentId',
    'payout.booking_id !== payment.booking_id',
    'ledger.idempotency_key === `${key}:transfer-ledger`',
    "ledger.transaction_type === 'owner_transfer'",
  ]) assert.ok(payoutValidator.includes(marker));
});

test('completed refund and payout HTTP replays do not wake the notification worker', () => {
  const refundRoute = app.slice(
    app.indexOf("app.post('/v1/payments/:id/refunds'"),
    app.indexOf("app.post('/v1/payments/:id/payout-release'"),
  );
  const payoutRoute = app.slice(
    app.indexOf("app.post('/v1/payments/:id/payout-release'"),
    app.indexOf("app.post('/v1/admin/payouts/:id/review'"),
  );
  for (const route of [refundRoute, payoutRoute]) {
    assert.match(route, /if \(!result\.replayed\) kickNotificationWorker\(\);/u);
    assert.equal(route.match(/kickNotificationWorker\(\)/gu)?.length, 1);
  }
});

test('withdrawal and payout share one locked calendar cutoff', () => {
  assert.match(withdrawalWorkflow, /FOR UPDATE OF booking, request/u);
  assert.match(withdrawalWorkflow, /SELECT clock_timestamp\(\) AS database_now/u);
  assert.match(withdrawalWorkflow, /endOfReturnPolicyCalendarDay\([\s\S]{0,120}14,[\s\S]{0,120}deLegalDeadlineTimeZone/u);
  assert.match(bookingWorkflow, /endOfReturnPolicyCalendarDay\([\s\S]{0,120}14,[\s\S]{0,120}deLegalDeadlineTimeZone/u);
  assert.match(bookingWorkflow, /clock_timestamp\(\) AS database_now/u);
  for (const source of [domain, withdrawalWorkflow, bookingWorkflow]) {
    assert.match(
      source,
      /const authoritativeContractAt = contractTime\.acceptedAt > contractTime\.createdAt[\s\S]{0,140}\? contractTime\.acceptedAt[\s\S]{0,80}: contractTime\.createdAt/u,
    );
  }
  assert.doesNotMatch(withdrawalWorkflow, /14 \* 24 \* 60 \* 60/u);
  assert.doesNotMatch(bookingWorkflow, /14 \* 24 \* 60 \* 60/u);
});

test('failed payout cancellation requires positive definite rejection evidence', () => {
  assert.match(workflow, /isDefiniteProviderRejectionCode\(payout\.failure_code\)/u);
  assert.match(workflow, /payout_cancel_requires_definite_rejection/u);
  const review = workflow.slice(
    workflow.indexOf('export async function reviewFailedPayout'),
    workflow.indexOf('export async function reconcilePaymentLifecycle'),
  );
  assert.doesNotMatch(review, /findTransfer/u);
  assert.match(review, /manual_retry_pre_provider_rejected/u);
});

test('uncertain or review-required payouts keep account deletion blocked', () => {
  assert.match(
    app,
    /FROM payouts[\s\S]{0,160}payee_id = \$1[\s\S]{0,120}status IN \('scheduled', 'pending', 'failed'\)/u,
  );
  assert.match(workflow, /status IN \('scheduled', 'pending'\)[\s\S]{0,100}status = 'scheduled' OR \$2 = 'failed'/u);
  assert.match(workflow, /if \(!updated\.rowCount\) return;/u);
  assert.match(workflow, /status IN \('scheduled', 'pending'\)/u);
  assert.match(workflow, /payoutRefundObligationSnapshot/u);
  assert.match(app, /open_refund_obligations/u);
});

test('financial notification does not invent a provider name', () => {
  assert.match(notifications, /bestätigtes Auszahlungskonto/u);
  assert.doesNotMatch(notifications, /an dein Stripe-Konto übertragen/u);
});

test('push and Crashlytics boundaries remain untouched by payment truth', () => {
  const config = fs.readFileSync('backend/src/config.js', 'utf8');
  assert.match(config, /FIREBASE_CRASH_REPORT_DELETION_ENABLED/u);
  assert.match(config, /process\.env\.PUSH_TRANSPORT/u);
  assert.doesNotMatch(
    app,
    /paymentCapabilitiesFor[\s\S]{0,500}(crashReportDeletion|push\.)/u,
  );
});
