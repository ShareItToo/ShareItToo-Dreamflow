#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateP0bAstraAiLegalCrosscheck } from
  './validate_p0b_astra_ai_legal_crosscheck.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp149-payment-v52-contract-binding-parity-20260914.json';
const handoverPath =
  'docs/operations/WP149_PAYMENT_V52_CONTRACT_BINDING_PARITY_2026-09-14.md';

const sourcePaths = Object.freeze([
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
  throw new Error(`WP149 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function digest(repositoryRoot, path) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

function inventoryDigest(inventory) {
  const canonical = Object.entries(inventory)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, hash]) => `${path}\0${hash}\n`)
    .join('');
  return createHash('sha256').update(canonical).digest('hex');
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path]
    ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function includes(text, marker, label) {
  if (!text.includes(marker)) fail(`${label} is incomplete.`);
}

function matches(text, pattern, label) {
  if (!pattern.test(text)) fail(`${label} is incomplete.`);
}

function validateRuntimeWiring(repositoryRoot, sourceTexts) {
  const cancellationTerms = source(
    repositoryRoot,
    'assets/legal/de/v52/part_c_cancellation_refund.html',
    sourceTexts,
  );
  const domain = source(repositoryRoot, 'backend/src/payment_domain.js', sourceTexts);
  const workflow = source(repositoryRoot, 'backend/src/payment_workflow.js', sourceTexts);
  const calendar = source(repositoryRoot, 'backend/src/return_calendar_policy.js', sourceTexts);
  const withdrawal = source(
    repositoryRoot,
    'backend/src/v51_withdrawal_workflow.js',
    sourceTexts,
  );
  const booking = source(repositoryRoot, 'backend/src/booking_workflow.js', sourceTexts);
  const actualLoss = source(
    repositoryRoot,
    'backend/src/v52_actual_loss_workflow.js',
    sourceTexts,
  );
  const contract = source(repositoryRoot, 'backend/src/v52_contract_workflow.js', sourceTexts);

  includes(cancellationTerms, '30 Minuten nach der beidseitig',
    'bound renter no-show grace wording');
  includes(cancellationTerms, 'mindestens zwei dokumentierte Kontaktversuche',
    'bound renter no-show contact wording');

  matches(domain, /version !== v52ContractDocument\.version/u,
    'exact contract-version guard');
  matches(domain, /contractUserId !== renterId/u, 'contract principal guard');
  matches(
    domain,
    /const authoritativeContractAt = contractTime\.acceptedAt > contractTime\.createdAt[\s\S]{0,140}\? contractTime\.acceptedAt[\s\S]{0,80}: contractTime\.createdAt[\s\S]{0,160}endOfReturnPolicyCalendarDay\([\s\S]{0,80}authoritativeContractAt,[\s\S]{0,80}14,[\s\S]{0,100}deLegalDeadlineTimeZone/u,
    'payout legal deadline',
  );
  matches(domain, /platformContractAcceptanceTimeBinding\([\s\S]{0,140}platformContractCreatedAt/u,
    'payout acceptance-persistence clock binding');
  if (/requireV52Contract|rentalTimezone/u.test(domain)) {
    fail('payment domain contains a transport or booking-timezone bypass.');
  }
  if (/platformContractVersion\.trim|platformContractUserId\.trim|bookingRenterId\.trim/u
    .test(domain)) {
    fail('payment domain normalizes an exact persisted contract binding.');
  }

  exact(
    workflow.match(/platformContractUserId: [^,\n]+/gu)?.length,
    2,
    'direct and reconciler principal wiring',
  );
  exact(
    workflow.match(/bookingRenterId: [^,\n]+/gu)?.length,
    2,
    'direct and reconciler renter wiring',
  );
  exact(
    workflow.match(/platformContractCreatedAt: [^,\n]+/gu)?.length,
    2,
    'direct and reconciler contract-clock wiring',
  );
  if (/requireV52Contract/u.test(workflow)) {
    fail('payment workflow contains a transport-dependent contract bypass.');
  }
  matches(workflow, /clock_timestamp\(\) AS database_now/u,
    'authoritative payout database clock');
  matches(workflow, /contract\.user_id AS platform_contract_user_id/u,
    'contract principal selection');
  matches(workflow, /contract\.contract_version IS DISTINCT FROM \$1/u,
    'health exact-version classification');
  matches(workflow, /contract\.user_id IS DISTINCT FROM booking\.renter_id/u,
    'health principal classification');
  matches(workflow, /OR NOT isfinite\(contract\.accepted_at\)/u,
    'health finite-acceptance classification');
  matches(workflow, /OR NOT isfinite\(contract\.created_at\)/u,
    'health finite-persistence classification');
  matches(
    workflow,
    /date_trunc\('milliseconds', contract\.accepted_at\)[\s\S]{0,120}< date_trunc\('milliseconds', contract\.created_at\) - INTERVAL '5 minutes'[\s\S]{0,180}date_trunc\('milliseconds', contract\.accepted_at\)[\s\S]{0,120}> date_trunc\('milliseconds', contract\.created_at\) \+ INTERVAL '5 minutes'/u,
    'health acceptance-persistence clock classification',
  );
  matches(workflow, /active_payout\.status IS DISTINCT FROM 'failed'/u,
    'health failed-payout eligibility');
  matches(
    workflow,
    /booking\.payout_instruction_due_at <= now\(\)[\s\S]{0,240}booking\.completed_at <= now\(\) - \(\$2::text \|\| ' hours'\)::interval/u,
    'health payout-due eligibility',
  );
  matches(workflow, /AS contract_blocked/u, 'contract-blocked health query');
  matches(workflow, /contractBlocked: result\.rows\[0\]\.contract_blocked/u,
    'contract-blocked health response');
  matches(
    workflow,
    /\(SELECT total FROM contract_blocked\)[\s\S]{0,100}AS recovery_needs_review/u,
    'contract-blocked review ratchet',
  );

  matches(calendar, /export const deLegalDeadlineTimeZone = 'Europe\/Berlin'/u,
    'German legal timezone');
  matches(calendar, /export function endOfReturnPolicyCalendarDay/u,
    'calendar-day deadline helper');
  matches(calendar, /nextDayStartsAt\.getTime\(\) - 1/u,
    'inclusive end-of-day boundary');
  matches(
    withdrawal,
    /const authoritativeContractAt = contractTime\.acceptedAt > contractTime\.createdAt[\s\S]{0,140}\? contractTime\.acceptedAt[\s\S]{0,80}: contractTime\.createdAt[\s\S]{0,160}endOfReturnPolicyCalendarDay\([\s\S]{0,80}authoritativeContractAt,[\s\S]{0,100}14,[\s\S]{0,100}deLegalDeadlineTimeZone/u,
    'withdrawal legal deadline',
  );
  matches(withdrawal, /row\.contract_version !== v52ContractDocument\.version/u,
    'withdrawal exact-version allowlist');
  matches(withdrawal, /row\.platform_contract_user_id !== row\.renter_id/u,
    'withdrawal principal binding');
  matches(withdrawal, /platform_contract_created_at/u,
    'withdrawal persistence-clock selection');
  matches(booking, /export function v52CancellationWithdrawalGate/u,
    'cancellation withdrawal gate');
  matches(
    booking,
    /\[v51ContractDocument\.version, v52ContractDocument\.version\]\.includes\(version\)/u,
    'cancellation exact-version allowlist',
  );
  matches(booking, /contractPrincipal !== renterPrincipal/u,
    'cancellation principal binding');
  matches(booking, /platformContractAcceptanceTimeBinding\([\s\S]{0,140}contractCreatedAt/u,
    'cancellation acceptance-persistence clock binding');
  matches(
    booking,
    /const contractTime = platformContractAcceptanceTimeBinding\([\s\S]{0,260}if \(version === v51ContractDocument\.version\)/u,
    'V5.1 cancellation clock parity',
  );
  matches(booking, /clock_timestamp\(\) AS database_now/u,
    'cancellation database clock');
  matches(
    booking,
    /export function v51CancellationDecisionAtDatabaseTime[\s\S]{0,1500}cancelAt: occurredAt/u,
    'cancellation financial database clock',
  );
  matches(
    booking,
    /calculatedAt: transitionedAt\.toISOString\(\)/u,
    'cancellation persisted calculation clock',
  );
  matches(booking, /renter_no_show_manual_review_required/u,
    'owner-declared renter no-show manual-review hold');
  if (booking.indexOf('renter_no_show_manual_review_required')
      >= booking.indexOf('let cancellationDecision = null')) {
    fail('renter no-show manual review occurs after the cancellation decision path.');
  }
  matches(actualLoss, /row\.contract_version !== v52ContractDocument\.version/u,
    'actual-loss exact V5.2 version guard');
  matches(actualLoss, /row\.platform_contract_user_id !== row\.renter_id/u,
    'actual-loss renter-principal guard');
  if (/startsWith\('V5\.2-'\)/u.test(actualLoss)) {
    fail('actual-loss accepts a V5.2 prefix instead of the exact version.');
  }
  matches(
    booking,
    /const authoritativeContractAt = contractTime\.acceptedAt > contractTime\.createdAt[\s\S]{0,140}\? contractTime\.acceptedAt[\s\S]{0,80}: contractTime\.createdAt[\s\S]{0,160}endOfReturnPolicyCalendarDay\([\s\S]{0,80}authoritativeContractAt,[\s\S]{0,100}14,[\s\S]{0,100}deLegalDeadlineTimeZone/u,
    'cancellation legal deadline',
  );
  matches(contract, /export const platformContractClockToleranceMs = 300_000/u,
    'contract clock tolerance');
  matches(
    contract,
    /Math\.abs\(accepted\.getTime\(\) - created\.getTime\(\)\) > platformContractClockToleranceMs/u,
    'contract two-sided clock guard',
  );
  matches(
    contract,
    /SELECT clock_timestamp\(\) AS database_now[\s\S]{0,160}platformContractAcceptanceTimeBinding/u,
    'new contract database-clock preflight',
  );
  matches(
    contract,
    /client_build, accepted_at, created_at,[\s\S]{0,220}\$19, \$20, clock_timestamp\(\), \$21/u,
    'new contract independent database persistence clock',
  );
}

export function validateWp149PaymentV52ContractBindingParity({
  evidence,
  handover,
  repositoryRoot = root,
  sourceTexts,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp149-payment-v52-contract-binding-parity', 'kind');
  exact(
    value?.status,
    'technical-closure-astra-corrections-required-real-money-hold',
    'status',
  );
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'repository branch');
  exact(
    value?.repository?.baselineHead,
    '2db2b90aab385aeba527fd559a33c269c8dc00cf',
    'repository baseline',
  );
  exact(value?.repository?.remoteAhead, 0, 'repository remote ahead');
  exact(value?.repository?.remoteBehind, 0, 'repository remote behind');
  if (!/^2026-09-14T\d{2}:\d{2}:\d{2}Z$/u.test(value?.capturedAt ?? '')) {
    fail('capture instant is invalid.');
  }
  exact(value?.captureAttestation?.semantics,
    'declared-after-final-source-inventory-assembly-not-external-time-proof',
    'capture attestation semantics');
  exact(value?.captureAttestation?.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'capture inventory digest algorithm');

  const policy = value?.policy;
  exact(policy?.contractVersion, 'V5.2-2026-08-16', 'contract version');
  exact(policy?.allPaymentTransportsRequireExactContract, true,
    'all-transport contract policy');
  exact(policy?.contractPrincipalMustEqualBookingRenter, true,
    'contract principal policy');
  exact(policy?.contractAcceptanceMustMatchPersistenceClock, true,
    'contract acceptance-persistence policy');
  exact(policy?.legalDeadlineUsesLaterBoundContractInstant, true,
    'conservative legal-deadline contract instant');
  exact(policy?.contractClockToleranceMs, 300000, 'contract clock tolerance');
  exact(policy?.cancellationAndWithdrawalUseExactVersionAllowlist, true,
    'cancellation and withdrawal version policy');
  exact(policy?.principalBinding, 'platform_contracts.user_id=bookings.renter_id',
    'contract principal binding');
  exact(policy?.missingContractError, 'payout_contract_binding_invalid',
    'missing-contract error');
  exact(policy?.unsupportedContractError, 'payout_contract_version_unsupported',
    'unsupported-contract error');
  exact(policy?.invalidAcceptanceError, 'payout_contract_time_invalid',
    'invalid-acceptance error');
  exact(policy?.usesCalendarDays, true, 'calendar-day policy');
  exact(policy?.legalDeadlineTimeZone, 'Europe/Berlin', 'legal deadline timezone');
  exact(policy?.usesBookingTimezone, false, 'booking-timezone policy');
  exact(policy?.expiresAtEndOfLastCalendarDay, true, 'day-end policy');
  exact(policy?.usesDatabaseClock, true, 'database-clock policy');
  exact(policy?.deadlineIsInclusiveHold, true, 'inclusive deadline hold');
  exact(policy?.section193WeekendHolidayExtensionImplemented, false,
    'section 193 implementation status');

  const implementation = value?.implementation;
  for (const key of [
    'transportDependentBypassRemoved',
    'directReleaseStrict',
    'reconcilerStrict',
    'principalBindingStrict',
    'contractClockBindingStrict',
    'newContractDatabaseClockIndependent',
    'healthAndRuntimeClockPrecisionParity',
    'v51CancellationAndWithdrawalClockParity',
    'cancellationFinancialEffectsUseSingleDatabaseClock',
    'renterNoShowManualReviewRequiredBeforeEffects',
    'actualLossExactV52VersionAndPrincipalBinding',
    'cancellationPrincipalBindingStrict',
    'withdrawalPrincipalBindingStrict',
    'cancellationVersionAllowlistStrict',
    'withdrawalVersionAllowlistStrict',
    'contractBlockedHealthVisible',
    'contractBlockedCountsTowardRecoveryNeedsReview',
    'cancellationUsesDatabaseClock',
  ]) exact(implementation?.[key], true, `implementation.${key}`);
  exact(implementation?.automatedRenterNoShowFinancialPathAllowed, false,
    'automated renter no-show financial path');
  exact(implementation?.canonicalContractVersionSource,
    'backend/src/v52_contract_workflow.js', 'canonical contract source');
  exact(implementation?.calendarPolicySource,
    'backend/src/return_calendar_policy.js', 'calendar policy source');
  exact(implementation?.migrationAdded, false, 'migration status');
  exact(implementation?.databaseCompletenessScope, {
    v52ContractRowRequiresSnapshotReferencesAndAcceptanceUpperBound: true,
    declarationMetadataShapeConstrained: true,
    applicationPathRequiresNineVerifiedSnapshotsAndPersistsTwoDeclarationsContractAndReceiptAtomically:
      true,
    runtimeRequiresTwoSidedAcceptancePersistenceClockBinding: true,
    databaseAloneProvesHistoricalAcceptanceClockBinding: false,
    databaseAloneProvesDeclarationAndReceiptExistence: false,
    databaseAloneProvesProfessionalLegalCompleteness: false,
  }, 'database completeness scope');

  const verification = value?.verification;
  exact(verification?.redFirstFailureObserved, true, 'red-first verification');
  exact(verification?.focusedUnitAndWiringTests,
    'passed-145-of-145', 'focused verification');
  exact(verification?.dynamicCancellationBoundaryAndWiring,
    'passed-26-of-26', 'dynamic cancellation verification');
  exact(verification?.backendCheck, 'passed', 'backend check');
  exact(verification?.backendTests, 'passed-921-skipped-2', 'backend tests');
  exact(verification?.postgresIntegration, 'passed-and-cleaned', 'PostgreSQL integration');
  exact(verification?.postgresIntegrationTests,
    'passed-2-of-2', 'PostgreSQL integration tests');
  exact(verification?.dependentPrivacyTests,
    'passed-22-of-22', 'dependent privacy tests');
  exact(verification?.dependentRetentionTests,
    'passed-46-of-46', 'dependent retention tests');
  exact(verification?.dependentInventoryRefreshOnly, true,
    'dependent inventory refresh scope');
  for (const key of [
    'missingContractDirectAndReconcilerNoMoneyMutation',
    'missingContractNoPayoutNotificationMutation',
    'validHistoricalContractRowPreservesExistingLifecycle',
    'principalMismatchFailsClosed',
    'contractBlockedHealthVisible',
    'malformedContractDirectReconcilerAndHealthParity',
    'staleAcceptanceDirectReconcilerAndHealthParity',
    'staleApplicationClockRejectedBeforeWrites',
    'microsecondClockPrecisionParity',
    'berlinMidnightContractDriftParity',
    'cancellationFinancialBoundaryDatabaseClock',
    'renterNoShowManualReviewPrecedesEffects',
    'actualLossUnknownVersionAndPrincipalMismatchFailClosed',
    'cancellationAndWithdrawalMalformedBindingNoEffect',
  ]) exact(verification?.[key], true, `verification.${key}`);
  exact(verification?.fullTechnicalRegression, 'passed',
    'full technical regression status');
  exact(verification?.githubRegression, 'pending',
    'GitHub Regression pre-push status');
  exact(verification?.githubCodeql, 'pending',
    'GitHub CodeQL pre-push status');

  const crosscheck = value?.legalCrosscheck;
  exact(crosscheck?.target, 'astra-ultra-sit-macbook', 'Astra target');
  exact(crosscheck?.taskId, '01a09e1b-0c59-71d2-b323-8c79b0b73bbd',
    'Astra task id');
  exact(crosscheck?.sourceCommit,
    '2db2b90aab385aeba527fd559a33c269c8dc00cf', 'Astra source commit');
  exact(crosscheck?.dispatched, true, 'Astra dispatch');
  exact(crosscheck?.taskCompleted, true, 'Astra task completion');
  exact(crosscheck?.scopeEvidenceComplete, false,
    'Astra cross-check scope evidence');
  exact(crosscheck?.outcome, 'CORRECTIONS_REQUIRED', 'Astra outcome');
  exact(crosscheck?.verdictCounts, {
    CONFIRM: 3,
    CORRECT: 12,
    INSUFFICIENT_EVIDENCE: 3,
  }, 'Astra verdict counts');
  exact(crosscheck?.professionalApprovalClaimed, false,
    'professional legal approval');
  exact(crosscheck?.rawResponsePersisted, false, 'Astra raw-response retention');
  exact(crosscheck?.normalizedResultCaptured, true, 'Astra normalized result');
  exact(crosscheck?.realMoneyAllowed, false, 'real-money legal gate');
  exact(crosscheck?.bgb193WeekendAndHolidayExtensionOpen, true,
    'section 193 open gate');
  const astra = validateP0bAstraAiLegalCrosscheck({ repositoryRoot });
  exact(astra.outcome, crosscheck.outcome, 'captured Astra outcome');
  exact(astra.verdictCounts, crosscheck.verdictCounts, 'captured Astra verdict counts');
  exact(astra.professionalLegalApproval, false, 'captured professional approval');
  exact(astra.realMoneyAllowed, false, 'captured real-money gate');
  exact(astra.crosscheckScopeComplete, false, 'captured cross-check scope');

  exact(value?.gates, {
    professionalLegalApproval: false,
    ownerAdoptionRecorded: false,
    realMoneyAllowed: false,
    publicActivationAllowed: false,
    productionAllowed: false,
  }, 'external gates');

  exact(value?.portfolio, { pass: 22, partial: 5, open: 5 }, 'portfolio');
  exact(value?.nextBoundedPackage, 'completed-payment-command-replay-binding',
    'next bounded package');
  if (value?.boundaries === null || typeof value.boundaries !== 'object') {
    fail('external boundaries are missing.');
  }
  exact(Object.keys(value.boundaries).sort(), [...boundaryKeys].sort(),
    'external boundary keys');
  for (const key of boundaryKeys) exact(value.boundaries[key], false, `boundaries.${key}`);
  if (Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('cannot claim an external or live mutation.');
  }

  exact(Object.keys(value?.sourceInventory ?? {}).sort(), [...sourcePaths],
    'source inventory paths');
  exact(
    value?.captureAttestation?.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory),
    'capture source inventory digest',
  );
  for (const path of sourcePaths) {
    const expected = value.sourceInventory[path];
    if (!/^[a-f0-9]{64}$/u.test(expected ?? '')) {
      fail(`source inventory ${path} does not contain a SHA-256 digest.`);
    }
    exact(digest(repositoryRoot, path), expected, `source inventory ${path}`);
  }

  validateRuntimeWiring(repositoryRoot, sourceTexts);
  const handoverText = handover
    ?? readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    'V5.2-2026-08-16',
    'contract.user_id',
    'booking.renter_id',
    'Europe/Berlin',
    'clock_timestamp()',
    'created_at',
    'exact version allowlist',
    'contractBlocked',
    'renter_no_show_manual_review_required',
    'owner-declared renter-no-show',
    'CORRECTIONS_REQUIRED',
    '3 CONFIRM / 12 CORRECT / 3',
    'INSUFFICIENT_EVIDENCE',
    '§ 193 BGB',
    'nicht implementiert',
    'keine professionelle Rechtsfreigabe',
    'kein Echtgeld',
  ]) includes(handoverText, marker, 'handover');

  const serialized = JSON.stringify({ value, handoverText });
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|accessToken|refreshToken|password/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    baselineHead: value.repository.baselineHead,
    contractVersion: policy.contractVersion,
    astraOutcome: crosscheck.outcome,
    verdictCounts: crosscheck.verdictCounts,
    fullTechnicalRegression: verification.fullTechnicalRegression,
    githubRegression: verification.githubRegression,
    githubCodeql: verification.githubCodeql,
    realMoneyAllowed: false,
    crosscheckScopeComplete: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp149PaymentV52ContractBindingParity();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP149 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
