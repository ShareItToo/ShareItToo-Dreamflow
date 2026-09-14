import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateWp149PaymentV52ContractBindingParity } from
  '../../tool/validate_wp149_payment_v52_contract_binding_parity.mjs';

const evidenceUrl = new URL(
  '../../docs/evidence/release-readiness/wp149-payment-v52-contract-binding-parity-20260914.json',
  import.meta.url,
);
const handoverUrl = new URL(
  '../../docs/operations/WP149_PAYMENT_V52_CONTRACT_BINDING_PARITY_2026-09-14.md',
  import.meta.url,
);
const domainUrl = new URL('../../backend/src/payment_domain.js', import.meta.url);
const workflowUrl = new URL('../../backend/src/payment_workflow.js', import.meta.url);
const bookingUrl = new URL('../../backend/src/booking_workflow.js', import.meta.url);
const actualLossUrl = new URL('../../backend/src/v52_actual_loss_workflow.js', import.meta.url);
const withdrawalUrl = new URL('../../backend/src/v51_withdrawal_workflow.js', import.meta.url);
const contractUrl = new URL('../../backend/src/v52_contract_workflow.js', import.meta.url);
const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const sourcePaths = [
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/01_crosscheck_result.md',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/02_verdict_matrix.json',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/manifest.json',
  'assets/legal/de/v52/part_c_cancellation_refund.html',
  'backend/sql/migrations/015_v51_contract_persistence.up.sql',
  'backend/sql/migrations/017_v51_contract_receipts.up.sql',
  'backend/sql/migrations/023_v52_contract_binding.up.sql',
  'backend/src/booking_workflow.js',
  'backend/src/payment_domain.js',
  'backend/src/payment_workflow.js',
  'backend/src/return_calendar_policy.js',
  'backend/src/v51_contract_workflow.js',
  'backend/src/v51_withdrawal_workflow.js',
  'backend/src/v52_actual_loss_workflow.js',
  'backend/src/v52_contract_workflow.js',
  'backend/test/booking_withdrawal_deadline.test.js',
  'backend/test/payment_domain.test.js',
  'backend/test/postgres_foundation.integration.test.js',
  'backend/test/return_calendar_policy.test.js',
  'backend/test/v51_withdrawal_workflow.test.js',
  'backend/test/v52_actual_loss_persistence.test.js',
  'backend/test/v52_actual_loss_workflow.test.js',
  'backend/test/v52_contract_workflow.test.js',
  'docs/current_state.md',
  'docs/current_work_package.md',
  'docs/operations/WP149_PAYMENT_V52_CONTRACT_BINDING_PARITY_2026-09-14.md',
  'scripts/technical_regression_check.sh',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'test/tool/payment_provider_truthfulness_wiring.test.mjs',
  'test/tool/v51_withdrawal_and_cancellation_wiring.test.mjs',
  'test/tool/validate_p0b_astra_ai_legal_crosscheck.test.mjs',
  'test/tool/validate_privacy_disclosures.test.mjs',
  'test/tool/validate_retention_deletion_readiness.test.mjs',
  'test/tool/validate_wp149_payment_v52_contract_binding_parity.test.mjs',
  'tool/validate_p0b_ai_legal_preassessment.mjs',
  'tool/validate_p0b_astra_ai_legal_crosscheck.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_wp149_payment_v52_contract_binding_parity.mjs',
];

function fixture() {
  const value = JSON.parse(readFileSync(evidenceUrl, 'utf8'));
  value.status = 'technical-closure-astra-corrections-required-real-money-hold';
  value.verification.backendTests = 'passed-921-skipped-2';
  value.sourceInventory = Object.fromEntries(sourcePaths.map((path) => [
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

function handoverFixture() {
  return readFileSync(handoverUrl, 'utf8');
}

test('accepts the exact fail-closed WP149 contract-binding closure', () => {
  const result = validateWp149PaymentV52ContractBindingParity({ evidence: fixture() });
  assert.equal(result.status, 'technical-closure-astra-corrections-required-real-money-hold');
  assert.equal(result.contractVersion, 'V5.2-2026-08-16');
  assert.equal(result.astraOutcome, 'CORRECTIONS_REQUIRED');
  assert.deepEqual(result.verdictCounts, {
    CONFIRM: 3,
    CORRECT: 12,
    INSUFFICIENT_EVIDENCE: 3,
  });
  assert.equal(result.realMoneyAllowed, false);
  assert.equal(result.crosscheckScopeComplete, false);
});

for (const mutate of [
  (value) => { value.status = 'complete'; },
  (value) => { value.repository.baselineHead = '0'.repeat(40); },
  (value) => { value.policy.allPaymentTransportsRequireExactContract = false; },
  (value) => { value.policy.contractPrincipalMustEqualBookingRenter = false; },
  (value) => { value.policy.contractAcceptanceMustMatchPersistenceClock = false; },
  (value) => { value.policy.legalDeadlineUsesLaterBoundContractInstant = false; },
  (value) => { value.policy.cancellationAndWithdrawalUseExactVersionAllowlist = false; },
  (value) => { value.policy.legalDeadlineTimeZone = 'UTC'; },
  (value) => { value.policy.usesBookingTimezone = true; },
  (value) => { value.policy.expiresAtEndOfLastCalendarDay = false; },
  (value) => { value.policy.usesDatabaseClock = false; },
  (value) => { value.policy.section193WeekendHolidayExtensionImplemented = true; },
]) {
  test('rejects status, baseline or legal deadline policy drift', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp149PaymentV52ContractBindingParity({ evidence: value }),
      /WP149/u,
    );
  });
}

for (const mutate of [
  (value) => { value.implementation.directReleaseStrict = false; },
  (value) => { value.implementation.reconcilerStrict = false; },
  (value) => { value.implementation.principalBindingStrict = false; },
  (value) => { value.implementation.contractClockBindingStrict = false; },
  (value) => { value.implementation.cancellationFinancialEffectsUseSingleDatabaseClock = false; },
  (value) => { value.implementation.automatedRenterNoShowFinancialPathAllowed = true; },
  (value) => { value.implementation.renterNoShowManualReviewRequiredBeforeEffects = false; },
  (value) => { value.implementation.withdrawalVersionAllowlistStrict = false; },
  (value) => { value.implementation.contractBlockedHealthVisible = false; },
  (value) => {
    value.implementation.databaseCompletenessScope
      .databaseAloneProvesDeclarationAndReceiptExistence = true;
  },
  (value) => { value.verification.principalMismatchFailsClosed = false; },
  (value) => { value.verification.contractBlockedHealthVisible = false; },
  (value) => {
    value.verification.malformedContractDirectReconcilerAndHealthParity = false;
  },
  (value) => {
    value.verification.staleAcceptanceDirectReconcilerAndHealthParity = false;
  },
  (value) => { value.verification.renterNoShowManualReviewPrecedesEffects = false; },
]) {
  test('rejects implementation or verification overstatement', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp149PaymentV52ContractBindingParity({ evidence: value }),
      /WP149/u,
    );
  });
}

for (const mutate of [
  (value) => { value.legalCrosscheck.outcome = 'CONFIRM'; },
  (value) => { value.legalCrosscheck.verdictCounts.CORRECT = 11; },
  (value) => { value.legalCrosscheck.professionalApprovalClaimed = true; },
  (value) => { value.legalCrosscheck.realMoneyAllowed = true; },
  (value) => { value.boundaries.paymentPerformed = true; },
]) {
  test('rejects Astra, professional, real-money or external-gate drift', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp149PaymentV52ContractBindingParity({ evidence: value }),
      /WP149/u,
    );
  });
}

test('rejects missing or stale source inventory entries', () => {
  for (const mutate of [
    (value) => { delete value.sourceInventory['backend/src/payment_domain.js']; },
    (value) => { value.sourceInventory['backend/src/payment_domain.js'] = '0'.repeat(64); },
    (value) => { value.sourceInventory['unexpected.js'] = '1'.repeat(64); },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp149PaymentV52ContractBindingParity({ evidence: value }),
      /WP149/u,
    );
  }
});

test('rejects a reintroduced transport bypass in runtime wiring', () => {
  const domain = readFileSync(domainUrl, 'utf8');
  assert.throws(
    () => validateWp149PaymentV52ContractBindingParity({
      evidence: fixture(),
      sourceTexts: {
        'backend/src/payment_domain.js': `${domain}\nconst requireV52Contract = false;\n`,
      },
    }),
    /WP149/u,
  );
  assert.throws(
    () => validateWp149PaymentV52ContractBindingParity({
      evidence: fixture(),
      sourceTexts: {
        'backend/src/payment_domain.js': domain.replace(
          '? platformContractVersion',
          '? platformContractVersion.trim()',
        ),
      },
    }),
    /WP149/u,
  );
});

test('rejects relaxed persistence clocks, principal checks or version allowlists', () => {
  const cases = [
    [
      'backend/src/v52_contract_workflow.js',
      readFileSync(contractUrl, 'utf8').replace('300_000;', '30_000_000;'),
    ],
    [
      'backend/src/payment_workflow.js',
      readFileSync(workflowUrl, 'utf8').replace(
        "OR date_trunc('milliseconds', contract.accepted_at)\n                 < date_trunc('milliseconds', contract.created_at) - INTERVAL '5 minutes'",
        'OR false',
      ),
    ],
    [
      'backend/src/v52_contract_workflow.js',
      readFileSync(contractUrl, 'utf8').replace(
        '$20, clock_timestamp(), $21',
        '$20, $21, $22',
      ),
    ],
    [
      'backend/src/booking_workflow.js',
      readFileSync(bookingUrl, 'utf8').replace(
        '[v51ContractDocument.version, v52ContractDocument.version].includes(version)',
        "version.startsWith('V5.')",
      ),
    ],
    [
      'backend/src/v51_withdrawal_workflow.js',
      readFileSync(withdrawalUrl, 'utf8').replace(
        'row.platform_contract_user_id !== row.renter_id',
        'String(row.platform_contract_user_id).trim() !== row.renter_id',
      ),
    ],
    [
      'backend/src/payment_domain.js',
      readFileSync(domainUrl, 'utf8').replace(
        'const authoritativeContractAt = contractTime.acceptedAt > contractTime.createdAt\n    ? contractTime.acceptedAt\n    : contractTime.createdAt;',
        'const authoritativeContractAt = contractTime.acceptedAt;',
      ),
    ],
    [
      'backend/src/v51_withdrawal_workflow.js',
      readFileSync(withdrawalUrl, 'utf8').replace(
        'const authoritativeContractAt = contractTime.acceptedAt > contractTime.createdAt\n        ? contractTime.acceptedAt\n        : contractTime.createdAt;',
        'const authoritativeContractAt = contractTime.acceptedAt;',
      ),
    ],
    [
      'backend/src/booking_workflow.js',
      readFileSync(bookingUrl, 'utf8').replace(
        'const authoritativeContractAt = contractTime.acceptedAt > contractTime.createdAt\n      ? contractTime.acceptedAt\n      : contractTime.createdAt;',
        'const authoritativeContractAt = contractTime.acceptedAt;',
      ),
    ],
    [
      'backend/src/booking_workflow.js',
      readFileSync(bookingUrl, 'utf8').replace(
        'cancelAt: occurredAt,',
        'cancelAt: new Date(),',
      ),
    ],
    [
      'backend/src/booking_workflow.js',
      readFileSync(bookingUrl, 'utf8').replace(
        'renter_no_show_manual_review_required',
        'renter_no_show_automated',
      ),
    ],
    [
      'backend/src/v52_actual_loss_workflow.js',
      readFileSync(actualLossUrl, 'utf8').replace(
        'row.contract_version !== v52ContractDocument.version',
        "!String(row.contract_version).startsWith('V5.2-')",
      ),
    ],
  ];
  for (const [path, changedSource] of cases) {
    assert.throws(
      () => validateWp149PaymentV52ContractBindingParity({
        evidence: fixture(),
        sourceTexts: { [path]: changedSource },
      }),
      /WP149/u,
    );
  }
});

test('rejects incomplete handover or private-shaped evidence', () => {
  assert.throws(
    () => validateWp149PaymentV52ContractBindingParity({
      evidence: fixture(),
      handover: handoverFixture().replace('§ 193 BGB', 'holiday rule'),
    }),
    /WP149/u,
  );
  const value = fixture();
  value.privateNote = 'owner@example.com';
  assert.throws(
    () => validateWp149PaymentV52ContractBindingParity({ evidence: value }),
    /WP149/u,
  );
  for (const mutate of [
    (entry) => { entry.capturedAt = '2026-09-13T23:59:59Z'; },
    (entry) => { entry.captureAttestation.semantics = 'trusted-external-time'; },
    (entry) => { entry.captureAttestation.sourceInventoryDigest = '0'.repeat(64); },
    (entry) => { entry.verification.githubRegression = 'passed'; },
    (entry) => { entry.verification.githubCodeql = 'passed'; },
    (entry) => { entry.legalCrosscheck.sourceCommit = '0'.repeat(40); },
    (entry) => { entry.legalCrosscheck.taskCompleted = false; },
    (entry) => { entry.legalCrosscheck.scopeEvidenceComplete = true; },
    (entry) => { entry.legalCrosscheck.rawResponsePersisted = true; },
    (entry) => { entry.legalCrosscheck.normalizedResultCaptured = false; },
  ]) {
    const drifted = fixture();
    mutate(drifted);
    assert.throws(
      () => validateWp149PaymentV52ContractBindingParity({ evidence: drifted }),
      /WP149/u,
    );
  }
});
