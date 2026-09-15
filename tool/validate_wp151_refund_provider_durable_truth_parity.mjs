#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp151-refund-provider-durable-truth-parity-20260914.json';
const handoverPath =
  'docs/operations/WP151_REFUND_PROVIDER_DURABLE_TRUTH_PARITY_2026-09-14.md';
const trustedModel = 'separate_charge_manual_transfer_reversal_v1';

export const wp151SourcePaths = Object.freeze([
  'backend/sql/migrations/007_b8_payments_and_ledger.up.sql',
  'backend/sql/migrations/075_refund_transfer_reversal_recovery.up.sql',
  'backend/sql/migrations/076_payment_command_result_immutability.up.sql',
  'backend/sql/migrations/077_refund_provider_truth_parity.down.sql',
  'backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
  'backend/src/account_financial_fence.js',
  'backend/src/app.js',
  'backend/src/compliance_review.js',
  'backend/src/financial_documents.js',
  'backend/src/moderation_workflow.js',
  'backend/src/notifications.js',
  'backend/src/payment_domain.js',
  'backend/src/payment_refund_obligations.js',
  'backend/src/payment_workflow.js',
  'backend/src/pilot_cockpit.js',
  'backend/src/privacy_export.js',
  'backend/src/refund_truth.js',
  'backend/src/stripe_provider.js',
  'backend/src/v51_withdrawal_workflow.js',
  'backend/test/account_deletion_refund_truth.test.js',
  'backend/test/account_financial_fence.test.js',
  'backend/test/compliance_review.test.js',
  'backend/test/financial_documents.test.js',
  'backend/test/payment_checkout_principal_cleanup.test.js',
  'backend/test/payment_command_completion_replay.test.js',
  'backend/test/payment_command_replay_expiry.test.js',
  'backend/test/payment_command_replay_integrity.test.js',
  'backend/test/payment_domain.test.js',
  'backend/test/payment_refund_obligations.test.js',
  'backend/test/pilot_cockpit.test.js',
  'backend/test/postgres_foundation.integration.test.js',
  'backend/test/privacy_export_refund_truth.test.js',
  'backend/test/refund_finalization_snapshot_guard.test.js',
  'backend/test/refund_notification_truth.test.js',
  'backend/test/refund_provider_truth_parity.test.js',
  'backend/test/stripe_webhook_destinations.test.js',
  'backend/test/v51_withdrawal_workflow.test.js',
  'docs/compliance/u0-pilot-cockpit-unit-economics-2026-08-20.md',
  'docs/current_state.md',
  'docs/current_work_package.md',
  'docs/operations/WP151_REFUND_PROVIDER_DURABLE_TRUTH_PARITY_2026-09-14.md',
  'lib/models/invoice.dart',
  'lib/screens/invoice_detail_screen.dart',
  'lib/screens/invoices_screen.dart',
  'lib/screens/moderation_admin_screen.dart',
  'lib/screens/payment_checkout_screen.dart',
  'lib/services/invoice_pdf_service.dart',
  'lib/services/invoices_service.dart',
  'scripts/technical_regression_check.sh',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'test/invoice_pdf_dependency_compatibility_test.dart',
  'test/invoice_review_truth_ui_test.dart',
  'test/invoice_server_snapshot_model_test.dart',
  'test/payment_provider_truthfulness_test.dart',
  'test/tool/no_demo_payment_surfaces.test.mjs',
  'test/tool/payment_provider_truthfulness_wiring.test.mjs',
  'test/tool/run_r9_database_recovery.test.mjs',
  'test/tool/v51_withdrawal_and_cancellation_wiring.test.mjs',
  'test/tool/validate_wp151_refund_provider_durable_truth_parity.test.mjs',
  'tool/run_r9_database_recovery.mjs',
  'tool/validate_wp151_refund_provider_durable_truth_parity.mjs',
]);

const boundaryKeys = Object.freeze([
  'providerRequestPerformed',
  'stripeConfigurationChanged',
  'paymentPerformed',
  'moneyMoved',
  'deploymentChanged',
  'productionChanged',
  'publicActivationChanged',
  'storeChanged',
  'firebaseChanged',
  'credentialReadOrRecorded',
  'deviceChanged',
  'pullRequestMerged',
]);

function fail(message) {
  throw new Error(`WP151 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function includes(text, marker, label) {
  if (!text.includes(marker)) fail(`${label} is incomplete.`);
}

function excludes(text, pattern, label) {
  if (pattern.test(text)) fail(`${label} contains a forbidden construct.`);
}

function ordered(text, markers, label) {
  let cursor = -1;
  for (const marker of markers) {
    const found = text.indexOf(marker, cursor + 1);
    if (found < 0 || found <= cursor) fail(`${label} ordering is invalid.`);
    cursor = found;
  }
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function digest(repositoryRoot, path) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

function inventoryDigest(inventory) {
  return createHash('sha256')
    .update(Object.entries(inventory)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, hash]) => `${path}\0${hash}\n`)
      .join(''))
    .digest('hex');
}

function validateRuntime(repositoryRoot, sourceTexts) {
  const up = source(
    repositoryRoot,
    'backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
    sourceTexts,
  );
  const down = source(
    repositoryRoot,
    'backend/sql/migrations/077_refund_provider_truth_parity.down.sql',
    sourceTexts,
  );
  const financialFence = source(
    repositoryRoot,
    'backend/src/account_financial_fence.js',
    sourceTexts,
  );
  const app = source(repositoryRoot, 'backend/src/app.js', sourceTexts);
  const compliance = source(repositoryRoot, 'backend/src/compliance_review.js', sourceTexts);
  const documents = source(repositoryRoot, 'backend/src/financial_documents.js', sourceTexts);
  const moderation = source(repositoryRoot, 'backend/src/moderation_workflow.js', sourceTexts);
  const notifications = source(repositoryRoot, 'backend/src/notifications.js', sourceTexts);
  const workflow = source(repositoryRoot, 'backend/src/payment_workflow.js', sourceTexts);
  const domain = source(repositoryRoot, 'backend/src/payment_domain.js', sourceTexts);
  const obligations = source(
    repositoryRoot,
    'backend/src/payment_refund_obligations.js',
    sourceTexts,
  );
  const cockpit = source(repositoryRoot, 'backend/src/pilot_cockpit.js', sourceTexts);
  const privacy = source(repositoryRoot, 'backend/src/privacy_export.js', sourceTexts);
  const refundTruth = source(repositoryRoot, 'backend/src/refund_truth.js', sourceTexts);
  const provider = source(repositoryRoot, 'backend/src/stripe_provider.js', sourceTexts);
  const withdrawal = source(
    repositoryRoot,
    'backend/src/v51_withdrawal_workflow.js',
    sourceTexts,
  );
  const postgres = source(
    repositoryRoot,
    'backend/test/postgres_foundation.integration.test.js',
    sourceTexts,
  );
  const recovery = source(repositoryRoot, 'tool/run_r9_database_recovery.mjs', sourceTexts);
  const invoiceModel = source(repositoryRoot, 'lib/models/invoice.dart', sourceTexts);
  const invoicePdf = source(repositoryRoot, 'lib/services/invoice_pdf_service.dart', sourceTexts);
  const invoicesService = source(repositoryRoot, 'lib/services/invoices_service.dart', sourceTexts);
  const paymentCheckout = source(
    repositoryRoot,
    'lib/screens/payment_checkout_screen.dart',
    sourceTexts,
  );
  const focusedProofs = [
    'backend/test/account_deletion_refund_truth.test.js',
    'backend/test/account_financial_fence.test.js',
    'backend/test/compliance_review.test.js',
    'backend/test/financial_documents.test.js',
    'backend/test/payment_checkout_principal_cleanup.test.js',
    'backend/test/payment_refund_obligations.test.js',
    'backend/test/pilot_cockpit.test.js',
    'backend/test/privacy_export_refund_truth.test.js',
    'backend/test/refund_finalization_snapshot_guard.test.js',
    'backend/test/refund_notification_truth.test.js',
    'backend/test/refund_provider_truth_parity.test.js',
    'backend/test/v51_withdrawal_workflow.test.js',
    'test/invoice_review_truth_ui_test.dart',
    'test/invoice_server_snapshot_model_test.dart',
    'test/payment_provider_truthfulness_test.dart',
  ].map((path) => source(repositoryRoot, path, sourceTexts)).join('\n');

  for (const marker of [
    'LOCK TABLE refunds IN ACCESS EXCLUSIVE MODE',
    'RENAME COLUMN refund_platform_fee TO legacy_refund_platform_fee_claim',
    'legacy_refund_platform_fee_claim DROP DEFAULT',
    'legacy_refund_platform_fee_claim DROP NOT NULL',
    'ADD COLUMN provider_refund_model TEXT',
    "provider_refund_model = 'separate_charge_manual_transfer_reversal_v1'",
    'Unverified pre-WP151 application claim',
    'never provider outcome evidence',
    'refunds_provider_refund_model_check',
    'refund_provider_record_delete_forbidden',
    'refund_provider_model_required',
    'refund_provider_outcome_initial_state_invalid',
    'refund_provider_truth_immutable',
    'refund_provider_outcome_immutable',
    'refund_preparation_immutable',
    'BEFORE INSERT OR UPDATE OR DELETE ON refunds',
  ]) includes(up, marker, 'migration up');
  excludes(up, /\b(?:UPDATE|DELETE FROM|TRUNCATE)\s+refunds\b/iu,
    'historical migration');

  ordered(down, [
    'post-migration refunds exist',
    'DROP TRIGGER IF EXISTS refunds_provider_truth_guard',
    'DROP COLUMN provider_refund_model',
    'RENAME COLUMN legacy_refund_platform_fee_claim TO refund_platform_fee',
  ], 'rollback guard');
  for (const marker of [
    'legacy_refund_platform_fee_claim IS NULL',
    'provider_refund_model IS NOT NULL',
    'Refund provider truth rollback blocked: post-migration refunds exist',
    'refund_platform_fee SET DEFAULT true',
    'refund_platform_fee SET NOT NULL',
  ]) includes(down, marker, 'migration down');
  excludes(down, /\b(?:UPDATE|DELETE FROM|TRUNCATE)\s+refunds\b/iu,
    'rollback migration');

  for (const marker of [
    'export async function lockFinancialPrincipals',
    'pg_advisory_xact_lock(hashtextextended($1, 0))',
    '`account-financial:${id}`',
    'export async function lockPaymentFinancialPrincipals',
    'export async function lockBookingFinancialPrincipals',
    'SELECT id, account_status, deactivated_at',
    'FOR UPDATE',
    'principalsPresent:',
    'commerceActive:',
  ]) includes(financialFence, marker, 'financial principal fence');

  for (const marker of [
    'export function parsePaymentRefundTruthRow',
    "['none', 'pending', 'providerBound', 'needsReview']",
    'provider_bound_local_pending_count',
    'provider_bound_local_review_count',
    'export async function readPaymentRefundTruth',
    'SELECT * FROM sit_payment_refund_truth WHERE payment_id = $1',
    'function baseTruthReliable',
    'truth.untrustedCount === 0',
    'truth.invalidCount === 0',
    'export function assertRefundTruthSettled',
    'export function assertRefundTruthRecoverableFor',
    'export function publicPaymentRefundTruth',
    'refundedMinor: needsReview || pending ? null : truth.settledMinor',
  ]) includes(refundTruth, marker, 'central refund truth');

  for (const marker of [
    'export const trustedRefundProviderModel =',
    `'${trustedModel}'`,
  ]) includes(domain, marker, 'canonical provider model export');
  for (const marker of [
    'trustedRefundProviderModel,',
    'refund?.provider_refund_model !== trustedRefundProviderModel',
    'refund?.legacy_refund_platform_fee_claim != null',
    "throw new PaymentDomainError(409, 'refund_provider_semantics_untrusted')",
  ]) includes(workflow, marker, 'trusted provider model');

  const replay = workflow.slice(
    workflow.indexOf('export function validateCompletedRefundCommandReplay'),
    workflow.indexOf('export function validateCompletedPayoutCommandReplay'),
  );
  for (const marker of [
    'validCompletedCommand({',
    'refund.provider_refund_model !== trustedRefundProviderModel',
    'refund.legacy_refund_platform_fee_claim != null',
    'validLedgerEntries(ledgerEntries, refundLedger({',
  ]) includes(replay, marker, 'completed refund replay');

  const refund = workflow.slice(
    workflow.indexOf('export async function refundPayment'),
    workflow.indexOf('async function markPayoutTransferFailure'),
  );
  ordered(refund, [
    'const existingRefund = await client.query',
    'assertPreparedRefundIntegrity({',
    'providerLookupRequired: true',
  ], 'existing refund trust check');
  for (const marker of [
    'reverse_transfer, provider_refund_model, local_settlement_status,',
    'provider_observation_status, livemode',
    "'pending', 'none', $11",
    'false, trustedRefundProviderModel, config.payments.livemode',
    'refund: refund.rows[0],',
    "providerOperationIdempotencyKey('refund', prepared.refund.id)",
    'sit_refund_model: trustedRefundProviderModel',
  ]) includes(refund, marker, 'fresh refund persistence');
  excludes(refund, /\brefund_platform_fee\b/u, 'fresh refund persistence');

  const providerCallAt = refund.indexOf(
    'providerRefund = await stripeProvider.createRefund',
  );
  const providerCall = refund.slice(
    providerCallAt,
    refund.indexOf('assertProviderRefundBinding({', providerCallAt),
  );
  for (const marker of [
    'chargeId: prepared.payment.provider_charge_id',
    'amountMinor: Number(prepared.refund.amount_minor)',
    'idempotencyKey:',
    'sit_booking_id:',
    'sit_payment_id:',
    'sit_refund_id:',
    'sit_refund_model:',
  ]) includes(providerCall, marker, 'provider refund request');
  excludes(providerCall,
    /refundPlatformFee|reverseTransfer|refund_application_fee|reverse_transfer/u,
    'provider refund request');

  includes(domain,
    'metadata.sit_refund_model !== refund.provider_refund_model',
    'provider readback model binding');

  const providerRefund = provider.slice(
    provider.indexOf('async createRefund('),
    provider.indexOf('async findRefund('),
  );
  includes(providerRefund,
    'async createRefund({ chargeId, amountMinor, idempotencyKey, metadata })',
    'Stripe refund adapter signature');
  includes(providerRefund,
    'client.refunds.create({\n      charge: chargeId,\n      amount: amountMinor,\n      metadata,',
    'Stripe refund adapter payload');
  excludes(providerRefund,
    /refundPlatformFee|reverseTransfer|refund_application_fee|reverse_transfer/u,
    'Stripe refund adapter');

  const health = workflow.slice(
    workflow.indexOf('export async function paymentHealth'),
  );
  for (const marker of [
    'JOIN sit_payment_refund_truth AS refund_truth',
    "refund_truth.refund_truth_status IN ('none', 'providerBound')",
    "WHERE refund_truth_status = 'pending'",
    "WHERE refund_truth_status = 'needsReview'",
  ]) includes(health, marker, 'payment health classification');

  for (const marker of [
    'function assertRefundFinalizationPaymentIntegrity',
    "throw new PaymentDomainError(409, 'provider_refund_local_state_mismatch')",
    'FOR UPDATE OF payment, booking, refund, command',
    'assertPreparedRefundIntegrity({',
    'assertRefundFinalizationPaymentIntegrity({ current, prepared })',
    'assertProviderRefundBinding({',
    "eventKey: `refund:${currentRefund.id}:succeeded`",
    'async function assertNoRefundFinalizationDisputeConflict',
    'AS active_provider_dispute',
    'AS active_transfer_recovery',
    'await assertNoRefundFinalizationDisputeConflict(client, paymentId)',
    "throw new PaymentDomainError(409, 'provider_refund_dispute_conflict')",
    "throw new PaymentDomainError(409, 'provider_refund_transfer_recovery_conflict')",
  ]) includes(workflow, marker, 'post-provider finalization snapshot');
  for (const marker of [
    'COALESCE(sum(amount_minor) FILTER (',
    "WHERE status = 'succeeded'",
    'const expectedMinor = Math.min(',
    'split.ownerShareMinor,',
    'Number(payment.transferred_minor) + succeededMinor,',
    "throw new PaymentDomainError(409, 'refund_transfer_exposure_mismatch')",
    'stored.refund_provider_model !== trustedRefundProviderModel',
    'stored.refund_legacy_claim != null',
  ]) includes(workflow, marker, 'durable transfer reversal truth');

  for (const marker of [
    'JOIN sit_payment_refund_truth AS refund_truth',
    "refund_truth.refund_truth_status IN ('pending', 'needsReview')",
    'AS open_refunds',
    "notification.event_key =\n                       'refund:' || refund.id::text || ':succeeded'",
    "refund.status = 'succeeded'",
    'refund.provider_refund_id IS NOT NULL',
    'refund.succeeded_at IS NOT NULL',
    'refund.failure_code IS NULL',
  ]) includes(app, marker, 'account deletion and notification readback truth');

  for (const marker of [
    'JOIN sit_payment_refund_truth AS refund_truth',
    'sum(refund_truth.settled_refund_minor)',
    'sum(refund_truth.untrusted_refund_count)',
    "refund_truth.refund_truth_status IN ('pending', 'needsReview')",
    'AS succeeded_minor',
    'AS untrusted_count',
    'const providerTruthNeedsReview = untrustedRefundCount > 0',
  ]) includes(obligations, marker, 'refund obligation truth');

  ordered(withdrawal, [
    'FOR UPDATE OF booking, request',
    'const refundTruth = await client.query(',
    'AS locally_settled_refund_minor',
    'AS refund_truth_review_count',
    'AS refund_truth_pending_count',
  ], 'V5.1 refund-truth lock and fresh snapshot');
  for (const marker of [
    'const exactFullLocalRefund = paymentCount > 0',
    'const partialLocalRefund = locallySettledRefundMinor > 0',
    "row.workflow_status === 'cancelled'",
    "row.workflow_status !== 'refunded' && exactFullLocalRefund",
    "row.workflow_status === 'refunded' && !exactFullLocalRefund",
    'eligibilityStatus = !providerTruthNeedsReview && submittedAt <= rightExpiresAt',
    ": 'manual_review_required'",
  ]) includes(withdrawal, marker, 'V5.1 fail-closed classification');

  for (const marker of [
    "row.kind !== 'booking_refunded'",
    "$3 = 'refund:' || refund.id::text || ':succeeded'",
    "refund.status = 'succeeded'",
    'refund.provider_refund_id IS NOT NULL',
    'refund.succeeded_at IS NOT NULL',
    'refund.failure_code IS NULL',
    "provider: 'refund_truth_guard'",
    "sourceTruthStatus: 'historical_unverified'",
    'needsReview: true',
    'JOIN sit_payment_refund_truth AS refund_truth',
    "refund_truth.refund_truth_status = 'providerBound'",
  ]) includes(notifications, marker, 'refund notification truth');

  for (const marker of [
    "row.status !== 'succeeded'",
    'row.provider_refund_model !== trustedRefundProviderModel',
    'row.legacy_refund_platform_fee_claim != null',
    "typeof row.provider_refund_id !== 'string'",
    'row.succeeded_at == null',
    'row.failure_code != null',
    "throw new FinancialDocumentError(409, 'financial_document_refund_truth_unverified')",
    'JOIN sit_payment_refund_truth AS refund_truth',
    "refund_truth.refund_truth_status = 'providerBound'",
  ]) includes(documents, marker, 'financial document exact success tuple');

  for (const marker of [
    'async expirePaymentCheckout({ sessionId })',
    "session.status = 'expired'",
    'client.checkout.sessions.expire(sessionId)',
  ]) includes(provider, marker, 'provider Checkout expiration');
  for (const marker of [
    'async function expireAndRecordAbandonedCheckout',
    'payment.checkout_expired_before_delivery',
    "status = 'cancelled'",
    'await stripeProvider.expirePaymentCheckout({ sessionId: session.id })',
    'await expireAndRecordAbandonedCheckout({',
    "throw new PaymentDomainError(409, 'payment_checkout_expired')",
  ]) includes(workflow, marker, 'Checkout principal-race cleanup');

  for (const marker of [
    "THEN 'provider_bound'",
    "THEN 'provider_outcome_unconfirmed'",
    "ELSE 'historical_unverified'",
    'refund.provider_refund_model = $2',
    'refund.legacy_refund_platform_fee_claim IS NULL',
  ]) includes(privacy, marker, 'privacy refund truth taxonomy');

  for (const marker of [
    "WHEN refund_truth.refund_truth_status IN ('pending', 'needsReview')",
    'ELSE refund_truth.settled_refund_minor',
    'JOIN sit_payment_refund_truth AS refund_truth',
    'END AS verified_refunded_minor',
    'refundedMinor: row.verified_refunded_minor === null',
    'refundTruthStatus: row.refund_truth_status',
  ]) includes(moderation, marker, 'staff aggregate truth');

  for (const marker of [
    'unresolvedRefundCount = 0',
    'const refundTruthExact = untrustedRefunds === 0 && unresolvedRefunds === 0',
    "professional_review_required_untrusted_refund_truth",
    "professional_review_required_unresolved_refund_truth",
    'AS untrusted_refund_count',
    'AS unresolved_refund_count',
    "refund_truth.refund_truth_status = 'needsReview'",
    "refund_truth.refund_truth_status = 'pending'",
    'JOIN sit_payment_refund_truth AS refund_truth',
  ]) includes(compliance, marker, 'professional review refund truth');

  for (const marker of [
    "const refundTruthReason = refundTruthStatus === 'needsReview'",
    "? 'needs_review_refund_truth'",
    "? 'pending_refund_truth'",
    'const refundTruthExact = refundTruthReason === null',
    'capturedCash: actualMetric(',
    "profitability: normalizedComplete\n        ? (knownNormalizedResult > 0 ? 'positive' : 'non_positive')\n        : 'undetermined'",
    'contributionPerCapturedBooking: perUnit(',
    'contributionPerCompletedHandover: perUnit(',
    'AS pending_refund_count',
  ]) includes(cockpit, marker, 'pilot cockpit refund truth');

  for (const marker of [
    'final String sourceTruthStatus;',
    'final bool needsReview;',
    'bool get canDownloadArtifact =>',
    "!needsReview && (sourceKind == 'qa_simulation' || downloadPath != null)",
    "sourceTruthStatus == 'historical_unverified'",
    'Review-only financial document must not be downloadable',
  ]) includes(invoiceModel, marker, 'financial document UI model truth');
  includes(invoicePdf, 'if (!invoice.canDownloadArtifact)',
    'financial document PDF guard');
  for (const marker of [
    'if (!invoice.canDownloadArtifact)',
    'if (!invoice.needsReview && invoice.issuedAt.year == year)',
  ]) includes(invoicesService, marker, 'financial document service truth');
  for (const marker of [
    '_state = null;',
    '_capabilities = null;',
    "refundTruthStatus == 'pending' || refundTruthStatus == 'needsReview'",
    '!refundVerificationPending',
  ]) includes(paymentCheckout, marker, 'checkout refund truth');

  for (const marker of [
    'account deletion blocks legacy or noncanonical refund provider truth',
    'unresolved canonical refund truth forces review and suppresses an exact net threshold result',
    'refund receipt exists only after success and preserves separate debtors',
    'refund obligations release only after one unambiguous family is fully refunded',
    'central pending truth keeps every refund-derived metric unavailable',
    'provider success cannot finalize after ${drift.label}',
    'refund delivery requires the exact event-bound canonical provider success',
    'staff pending, cancelled or payment-status drift never exposes an amount',
    'unresolved canonical refund forces withdrawal review without any booking effect',
    'pseudonymized principal remains settlement-bound but cannot start commerce',
    'privacy payment export separates provider and local settlement truth',
    'review-only refund hides money and removes download and share actions',
    'mixed valid and historical server response preserves both and excludes review amount from totals',
    'refresh failure clears previously confirmed payment truth',
    'account suspension after provider creation expires checkout before rejection',
  ]) includes(focusedProofs, marker, 'focused proof inventory');

  for (const marker of [
    '077_refund_provider_truth_parity.up.sql',
    'legacy_refund_platform_fee_claim: true',
    'provider_refund_model: null',
    `providerModel: '${trustedModel}'`,
    'refund_provider_truth_immutable',
    'Refund provider truth rollback blocked: post-migration refunds exist',
    'partialProviderRefund.metadata.sit_refund_model',
  ]) includes(postgres, marker, 'PostgreSQL proof');

  for (const marker of [
    'export const r9RequiredMigrationCount = 77',
    "filename: '077_refund_provider_truth_parity.down.sql'",
    'Refund provider truth rollback blocked: post-migration refunds exist',
    "requiredLastMigration = '077_refund_provider_truth_parity.up.sql'",
  ]) includes(recovery, marker, 'R9 recovery inventory');
}

export function validateWp151RefundProviderDurableTruthParity({
  evidence,
  handover,
  repositoryRoot = root,
  sourceTexts,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp151-refund-provider-durable-truth-parity', 'kind');
  exact(value?.status,
    'technical-closure-full-regression-passed-external-gates-hold',
    'status');
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '4acc618f287549c6874e1fae7510a47037d25262',
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository state');
  if (!/^2026-09-15T\d{2}:\d{2}:\d{2}Z$/u.test(value?.capturedAt ?? '')) {
    fail('capture instant is invalid.');
  }
  exact(value?.captureAttestation?.semantics,
    'declared-after-final-source-inventory-assembly-not-external-time-proof',
    'capture semantics');
  exact(value?.captureAttestation?.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory algorithm');

  exact(value?.decision, {
    providerRefundModel: trustedModel,
    chargePattern: 'separate-charges-and-transfers',
    platformChargeRefunded: true,
    ownerTransfersReversedSeparately: true,
    stripeConnectRefundFlagsSent: false,
    platformShareIsStripeApplicationFee: false,
    paymentEconomicsChanged: false,
  }, 'refund decision');
  exact(value?.historicalSemantics, {
    originalColumnRenamedNotDeleted: true,
    preservedColumn: 'legacy_refund_platform_fee_claim',
    preservedValueIsProviderOutcomeEvidence: false,
    historicalProviderModel: null,
    historicalRowsBackfilledToCanonicalModel: false,
    legacyOrAmbiguousReplayTrusted: false,
    legacyOrAmbiguousProviderWorkAllowed: false,
    legacyOrAmbiguousRowsNeedReview: true,
    postMigrationTruthImmutable: true,
    preparedRefundIdentityImmutable: true,
    confirmedProviderOutcomeImmutable: true,
    refundDeletionForbidden: true,
    unsafeDownMigrationRefused: true,
  }, 'historical semantics');
  exact(value?.runtime, {
    freshRefundPersistsExactModel: true,
    providerMetadataBindsExactModel: true,
    providerReadbackRequiresExactModel: true,
    completedReplayRequiresExactModel: true,
    uncertainResponseLookupRequiresExactModel: true,
    providerRefundUsesIdempotencyKey: true,
    stripeRefundApplicationFeeFlagEmitted: false,
    stripeReverseTransferFlagEmitted: false,
    ownerTransferReversalPlanRemainsDurable: true,
    residualTransferReversalRetryExact: true,
    postProviderFinalizationSnapshotRevalidated: true,
    postProviderDisputeAndRecoveryFenceRevalidated: true,
    checkoutPrincipalFenceRevalidatedAfterProviderCreation: true,
    undeliverableCheckoutSessionExpired: true,
    payoutAndReconcilerRejectUntrustedHistory: true,
    localMinorUnitSplitRemainsAuthoritative: true,
  }, 'runtime contract');
  exact(value?.downstreamTruth, {
    accountDeletionBlocksUntrustedOrUnresolvedRefunds: true,
    refundObligationsUseCanonicalSucceededOnly: true,
    withdrawalUntrustedOrUnresolvedRequiresManualReview: true,
    withdrawalLocksBeforeFreshRefundTruthRead: true,
    withdrawalCancelledOrStatusDriftRequiresManualReview: true,
    notificationRequiresEventBoundSuccessTuple: true,
    notificationRequiresCentralProviderBoundTruth: true,
    notificationHistoricalTruthNeutralized: true,
    financialDocumentExactSuccessTupleRequired: true,
    financialDocumentRequiresCentralProviderBoundTruth: true,
    financialDocumentReadbackRevalidatesTruth: true,
    privacyTaxonomySeparatesUnconfirmedAndHistorical: true,
    staffAggregateStoredVsCanonicalParityRequired: true,
    staffCancelledOrStatusDriftRequiresReview: true,
    complianceUntrustedOrUnresolvedRequiresReview: true,
    complianceExactNetSuppressed: true,
    cockpitGrossCaptureMayRemainActual: true,
    cockpitRefundDerivedEconomicsSuppressed: true,
    cockpitPerUnitReasonParityRequired: true,
  }, 'downstream truth');
  exact(value?.verification, {
    focusedBackendTests: 'passed-128-of-128',
    targetedToolTests: 'passed-64-of-64',
    allToolTests: 'passed-3015-of-3015',
    focusedFlutterTests: 'passed-20-of-20',
    backendTests: 'passed-985-skipped-2',
    postgresIntegrationTests: 'passed-2-of-2-and-cleaned',
    exactLegacyValuePreservationProved: true,
    canonicalInsertAndImmutabilityProved: true,
    unsafeRollbackRefusalProved: true,
    providerPayloadNoConnectFlagsProved: true,
    completedReplayFailClosedProved: true,
    legacyInFlightFailClosedProved: true,
    legacyHealthNeedsReviewProved: true,
    finalizationSnapshotDriftProved: true,
    finalizationDisputeAndRecoveryRaceProved: true,
    checkoutPrincipalRaceCleanupProved: true,
    residualTransferReversalRetryProved: true,
    notificationEventIdentityBindingProved: true,
    withdrawalReadCommittedRaceProved: true,
    downstreamConsumerParityProved: true,
    unresolvedCanonicalTruthSuppressed: true,
    staffAndCockpitClassificationParityProved: true,
    r9InventoryUpdated: true,
    deterministicClosureValidator: true,
    fullTechnicalRegression: 'passed-ci-equivalent-exit-0',
    githubRegression: 'pending',
    githubCodeql: 'pending',
  }, 'verification');
  exact(value?.gates, {
    professionalLegalApproval: false,
    ownerAdoptionRecorded: false,
    realMoneyAllowed: false,
    providerActivationAllowed: false,
    publicActivationAllowed: false,
    productionAllowed: false,
  }, 'external gates');
  exact(Object.keys(value?.boundaries ?? {}).sort(), [...boundaryKeys].sort(),
    'external boundary keys');
  for (const key of boundaryKeys) exact(value.boundaries[key], false, `boundaries.${key}`);

  exact(Object.keys(value?.sourceInventory ?? {}).sort(), [...wp151SourcePaths],
    'source inventory paths');
  exact(value?.captureAttestation?.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp151SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) {
      fail(`source inventory ${path} does not contain a SHA-256 digest.`);
    }
    exact(digest(repositoryRoot, path), value.sourceInventory[path],
      `source inventory ${path}`);
  }

  validateRuntime(repositoryRoot, sourceTexts);
  const handoverText = handover
    ?? readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'separate_charge_manual_transfer_reversal_v1',
    'Separate Charges and Transfers',
    'legacy_refund_platform_fee_claim',
    'unverified pre-WP151 application claim',
    'never promoted to provider-outcome evidence',
    'sit_refund_model',
    'no Connect refund flag',
    'fails closed before authorization',
    'needsReview',
    'refund:<id>:succeeded',
    'fresh second statement under PostgreSQL READ COMMITTED',
    'successful refund for the same Booking cannot promote',
    'per-completed-handover metrics carry the same refund-truth reason',
    'no historical UPDATE',
    'unsafe-rollback refusal',
    '128/128',
    '985 with 2 intentional skips',
    '64/64',
    '3015/3015',
    '20/20',
    '2/2 and cleans up',
    'technical regression passes with exit 0',
    'still pending',
    'All external gates remain closed',
  ]) includes(handoverText, marker, 'handover');

  const serialized = JSON.stringify({ value, handoverText });
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|accessToken|refreshToken|password/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    baselineHead: value.repository.baselineHead,
    providerRefundModel: value.decision.providerRefundModel,
    focusedBackendTests: value.verification.focusedBackendTests,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
    githubRegression: value.verification.githubRegression,
    githubCodeql: value.verification.githubCodeql,
    realMoneyAllowed: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp151RefundProviderDurableTruthParity(),
    )}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP151 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
