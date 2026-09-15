import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp151RefundProviderDurableTruthParity,
  wp151SourcePaths,
} from '../../tool/validate_wp151_refund_provider_durable_truth_parity.mjs';

const evidenceUrl = new URL(
  '../../docs/evidence/release-readiness/wp151-refund-provider-durable-truth-parity-20260914.json',
  import.meta.url,
);
const handoverUrl = new URL(
  '../../docs/operations/WP151_REFUND_PROVIDER_DURABLE_TRUTH_PARITY_2026-09-14.md',
  import.meta.url,
);
const upUrl = new URL(
  '../../backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
  import.meta.url,
);
const downUrl = new URL(
  '../../backend/sql/migrations/077_refund_provider_truth_parity.down.sql',
  import.meta.url,
);
const financialFenceUrl = new URL(
  '../../backend/src/account_financial_fence.js',
  import.meta.url,
);
const refundTruthUrl = new URL('../../backend/src/refund_truth.js', import.meta.url);
const workflowUrl = new URL('../../backend/src/payment_workflow.js', import.meta.url);
const domainUrl = new URL('../../backend/src/payment_domain.js', import.meta.url);
const providerUrl = new URL('../../backend/src/stripe_provider.js', import.meta.url);
const appUrl = new URL('../../backend/src/app.js', import.meta.url);
const complianceUrl = new URL('../../backend/src/compliance_review.js', import.meta.url);
const documentsUrl = new URL('../../backend/src/financial_documents.js', import.meta.url);
const moderationUrl = new URL('../../backend/src/moderation_workflow.js', import.meta.url);
const notificationsUrl = new URL('../../backend/src/notifications.js', import.meta.url);
const cockpitUrl = new URL('../../backend/src/pilot_cockpit.js', import.meta.url);
const privacyUrl = new URL('../../backend/src/privacy_export.js', import.meta.url);
const withdrawalUrl = new URL('../../backend/src/v51_withdrawal_workflow.js', import.meta.url);
const invoiceModelUrl = new URL('../../lib/models/invoice.dart', import.meta.url);
const paymentCheckoutUrl = new URL(
  '../../lib/screens/payment_checkout_screen.dart',
  import.meta.url,
);
const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function fixture() {
  const value = JSON.parse(readFileSync(evidenceUrl, 'utf8'));
  value.sourceInventory = Object.fromEntries(wp151SourcePaths.map((path) => [
    path,
    createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex'),
  ]));
  value.captureAttestation.sourceInventoryDigest = createHash('sha256')
    .update(Object.entries(value.sourceInventory)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, hash]) => `${path}\0${hash}\n`)
      .join(''))
    .digest('hex');
  return value;
}

test('accepts the exact fail-closed WP151 refund-provider truth closure', () => {
  const result = validateWp151RefundProviderDurableTruthParity({ evidence: fixture() });
  assert.equal(result.providerRefundModel, 'separate_charge_manual_transfer_reversal_v1');
  assert.equal(result.focusedBackendTests, 'passed-128-of-128');
  assert.equal(result.fullTechnicalRegression, 'passed-ci-equivalent-exit-0');
  assert.equal(result.realMoneyAllowed, false);
});

for (const mutate of [
  (value) => { value.status = 'complete'; },
  (value) => { value.repository.baselineHead = '0'.repeat(40); },
  (value) => { value.decision.chargePattern = 'destination-charges'; },
  (value) => { value.decision.stripeConnectRefundFlagsSent = true; },
  (value) => { value.decision.platformShareIsStripeApplicationFee = true; },
  (value) => { value.decision.paymentEconomicsChanged = true; },
  (value) => { value.historicalSemantics.preservedValueIsProviderOutcomeEvidence = true; },
  (value) => { value.historicalSemantics.historicalRowsBackfilledToCanonicalModel = true; },
  (value) => { value.historicalSemantics.legacyOrAmbiguousReplayTrusted = true; },
  (value) => { value.historicalSemantics.legacyOrAmbiguousProviderWorkAllowed = true; },
  (value) => { value.historicalSemantics.refundDeletionForbidden = false; },
  (value) => { value.runtime.providerReadbackRequiresExactModel = false; },
  (value) => { value.runtime.postProviderFinalizationSnapshotRevalidated = false; },
  (value) => { value.runtime.stripeRefundApplicationFeeFlagEmitted = true; },
  (value) => { value.runtime.stripeReverseTransferFlagEmitted = true; },
  (value) => { value.downstreamTruth.accountDeletionBlocksUntrustedOrUnresolvedRefunds = false; },
  (value) => { value.downstreamTruth.withdrawalLocksBeforeFreshRefundTruthRead = false; },
  (value) => { value.downstreamTruth.notificationRequiresEventBoundSuccessTuple = false; },
  (value) => { value.downstreamTruth.financialDocumentExactSuccessTupleRequired = false; },
  (value) => { value.downstreamTruth.staffCancelledOrStatusDriftRequiresReview = false; },
  (value) => { value.downstreamTruth.complianceUntrustedOrUnresolvedRequiresReview = false; },
  (value) => { value.downstreamTruth.cockpitPerUnitReasonParityRequired = false; },
  (value) => { value.verification.legacyInFlightFailClosedProved = false; },
  (value) => { value.verification.unsafeRollbackRefusalProved = false; },
  (value) => { value.gates.realMoneyAllowed = true; },
  (value) => { value.boundaries.providerRequestPerformed = true; },
]) {
  test('rejects financial truth, legacy trust or external-boundary drift', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp151RefundProviderDurableTruthParity({ evidence: value }),
      /WP151/u,
    );
  });
}

test('rejects missing, stale or unexpected source inventory entries', () => {
  for (const mutate of [
    (value) => { delete value.sourceInventory['backend/src/payment_workflow.js']; },
    (value) => { value.sourceInventory['backend/src/payment_workflow.js'] = '0'.repeat(64); },
    (value) => { value.sourceInventory['unexpected.js'] = '1'.repeat(64); },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp151RefundProviderDurableTruthParity({ evidence: value }),
      /WP151/u,
    );
  }
});

test('rejects migration inference, weakened binding or Stripe Connect refund flags', () => {
  const up = readFileSync(upUrl, 'utf8');
  const down = readFileSync(downUrl, 'utf8');
  const financialFence = readFileSync(financialFenceUrl, 'utf8');
  const refundTruth = readFileSync(refundTruthUrl, 'utf8');
  const workflow = readFileSync(workflowUrl, 'utf8');
  const domain = readFileSync(domainUrl, 'utf8');
  const provider = readFileSync(providerUrl, 'utf8');
  const app = readFileSync(appUrl, 'utf8');
  const compliance = readFileSync(complianceUrl, 'utf8');
  const documents = readFileSync(documentsUrl, 'utf8');
  const moderation = readFileSync(moderationUrl, 'utf8');
  const notifications = readFileSync(notificationsUrl, 'utf8');
  const cockpit = readFileSync(cockpitUrl, 'utf8');
  const privacy = readFileSync(privacyUrl, 'utf8');
  const withdrawal = readFileSync(withdrawalUrl, 'utf8');
  const invoiceModel = readFileSync(invoiceModelUrl, 'utf8');
  const paymentCheckout = readFileSync(paymentCheckoutUrl, 'utf8');
  for (const [path, changedSource] of [
    [
      'backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
      up.replace(
        'ALTER TABLE refunds\n  RENAME COLUMN',
        `UPDATE refunds SET refund_platform_fee = false;\n+\n+ALTER TABLE refunds\n  RENAME COLUMN`,
      ),
    ],
    [
      'backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
      up.replace('refund_provider_truth_immutable', 'refund_provider_truth_mutable'),
    ],
    [
      'backend/sql/migrations/077_refund_provider_truth_parity.up.sql',
      up.replace(
        'BEFORE INSERT OR UPDATE OR DELETE ON refunds',
        'BEFORE INSERT OR UPDATE ON refunds',
      ),
    ],
    [
      'backend/sql/migrations/077_refund_provider_truth_parity.down.sql',
      down.replace('post-migration refunds exist', 'post-migration rows ignored'),
    ],
    [
      'backend/src/account_financial_fence.js',
      financialFence.replace(
        'pg_advisory_xact_lock(hashtextextended($1, 0))',
        'pg_advisory_xact_lock(1)',
      ),
    ],
    [
      'backend/src/refund_truth.js',
      refundTruth.replace('truth.invalidCount === 0', 'true'),
    ],
    [
      'backend/src/payment_workflow.js',
      workflow.replace(
        'refund.provider_refund_model !== trustedRefundProviderModel',
        'false',
      ),
    ],
    [
      'backend/src/payment_workflow.js',
      workflow.replace(
        'amountMinor: Number(prepared.refund.amount_minor),',
        'amountMinor: Number(prepared.refund.amount_minor),\n        refundPlatformFee: true,',
      ),
    ],
    [
      'backend/src/payment_workflow.js',
      workflow.replace(
        'await assertNoRefundFinalizationDisputeConflict(client, paymentId)',
        '// dispute fence skipped',
      ),
    ],
    [
      'backend/src/payment_domain.js',
      domain.replace(
        'metadata.sit_refund_model !== refund.provider_refund_model',
        'false',
      ),
    ],
    [
      'backend/src/payment_domain.js',
      domain.replace('export const trustedRefundProviderModel =', 'const trustedRefundProviderModel ='),
    ],
    [
      'backend/src/stripe_provider.js',
      provider.replace(
        'amount: amountMinor,\n      metadata,',
        'amount: amountMinor,\n      refund_application_fee: true,\n      metadata,',
      ),
    ],
    [
      'backend/src/stripe_provider.js',
      provider.replace(
        'client.checkout.sessions.expire(sessionId)',
        'client.checkout.sessions.retrieve(sessionId)',
      ),
    ],
    [
      'backend/src/app.js',
      app.replace(
        "refund_truth.refund_truth_status IN ('pending', 'needsReview')",
        "refund_truth.refund_truth_status = 'pending'",
      ),
    ],
    [
      'backend/src/compliance_review.js',
      compliance.replace(
        'const refundTruthExact = untrustedRefunds === 0 && unresolvedRefunds === 0',
        'const refundTruthExact = untrustedRefunds === 0',
      ),
    ],
    [
      'backend/src/financial_documents.js',
      documents.replace("row.status !== 'succeeded'", 'false'),
    ],
    [
      'backend/src/financial_documents.js',
      documents.replaceAll(
        "refund_truth.refund_truth_status = 'providerBound'",
        'true',
      ),
    ],
    [
      'backend/src/moderation_workflow.js',
      moderation.replace(
        "WHEN refund_truth.refund_truth_status IN ('pending', 'needsReview')",
        "WHEN refund_truth.refund_truth_status = 'pending'",
      ),
    ],
    [
      'backend/src/notifications.js',
      notifications.replace(
        "$3 = 'refund:' || refund.id::text || ':succeeded'",
        'true',
      ),
    ],
    [
      'backend/src/notifications.js',
      notifications.replace(
        "refund_truth.refund_truth_status = 'providerBound'",
        'true',
      ),
    ],
    [
      'backend/src/pilot_cockpit.js',
      cockpit.replace("? 'pending_refund_truth'", "? 'normalized_input_unavailable'"),
    ],
    [
      'backend/src/privacy_export.js',
      privacy.replace("THEN 'provider_outcome_unconfirmed'", "THEN 'provider_bound'"),
    ],
    [
      'backend/src/v51_withdrawal_workflow.js',
      withdrawal.replace(
        'FOR UPDATE OF booking, request',
        'FOR UPDATE OF booking',
      ),
    ],
    [
      'lib/models/invoice.dart',
      invoiceModel.replace(
        "!needsReview && (sourceKind == 'qa_simulation' || downloadPath != null)",
        "sourceKind == 'qa_simulation' || downloadPath != null",
      ),
    ],
    [
      'lib/screens/payment_checkout_screen.dart',
      paymentCheckout.replaceAll('_state = null;', '// stale payment retained'),
    ],
  ]) {
    assert.throws(
      () => validateWp151RefundProviderDurableTruthParity({
        evidence: fixture(),
        sourceTexts: { [path]: changedSource },
      }),
      /WP151/u,
    );
  }
});

test('rejects an incomplete handover or secret-shaped evidence', () => {
  const handover = readFileSync(handoverUrl, 'utf8');
  assert.throws(
    () => validateWp151RefundProviderDurableTruthParity({
      evidence: fixture(),
      handover: handover.replace(
        'never promoted to provider-outcome evidence',
        'treated as verified provider truth',
      ),
    }),
    /WP151/u,
  );
  const value = fixture();
  value.privateNote = 'owner@example.invalid';
  assert.throws(
    () => validateWp151RefundProviderDurableTruthParity({ evidence: value }),
    /WP151/u,
  );
});
