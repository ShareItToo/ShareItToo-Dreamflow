#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateLegalReadiness } from './validate_legal_readiness.mjs';
import { validateV55LegalAssets } from './validate_v55_legal_assets.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp153-position-review-release-parity-20260915.json';
const handoverPath =
  'docs/operations/WP153_POSITION_REVIEW_AND_UNRELATED_RELEASE_PARITY_2026-09-15.md';

export const wp153SourcePaths = Object.freeze([
  'assets/legal/de/legal_manifest_v52.json',
  'assets/legal/de/legal_manifest_v53.json',
  'assets/legal/de/legal_manifest_v54.json',
  'assets/legal/de/legal_manifest_v55.json',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/01_ai_rechtliche_vorpruefung.md',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/02_verdict_matrix.json',
  'assets/legal/de/v55/part_a_platform_terms.html',
  'assets/legal/de/v55/part_b_private_rental_terms.html',
  'assets/legal/de/v55/part_c_cancellation_refund.html',
  'assets/legal/de/v55/part_d_handover_return_damage.html',
  'assets/legal/de/v55/part_e_payment_payout.html',
  'assets/legal/de/v55/part_f_community_safety.html',
  'assets/legal/de/v55/part_g_reporting_moderation_review.html',
  'assets/legal/de/v55/part_h_privacy.html',
  'assets/legal/de/v55/part_i_imprint_withdrawal_shorttexts.html',
  'backend/src/booking_group_handover_domain.js',
  'backend/src/booking_group_handover_workflow.js',
  'backend/src/legal_contract_version_registry.js',
  'backend/src/payment_domain.js',
  'backend/src/payment_workflow.js',
  'backend/src/v52_handover_return_workflow.js',
  'backend/test/booking_group_handover_workflow.test.js',
  'backend/test/legal_contract_version_registry.test.js',
  'backend/test/payment_domain.test.js',
  'backend/test/position_review_release_integrity.test.js',
  'backend/test/postgres_foundation.integration.test.js',
  'backend/test/v52_handover_return_workflow.test.js',
  'docs/current_state.md',
  'docs/current_work_package.md',
  handoverPath,
  'lib/models/booking_group.dart',
  'scripts/technical_regression_check.sh',
  'store/legal-readiness.json',
  'test/tool/validate_legal_readiness.test.mjs',
  'test/tool/validate_v55_legal_assets.test.mjs',
  'test/tool/validate_wp153_position_review_release_parity.test.mjs',
  'tool/validate_legal_readiness.mjs',
  'tool/validate_v55_legal_assets.mjs',
  'tool/validate_wp153_position_review_release_parity.mjs',
]);

const boundaryKeys = Object.freeze([
  'providerRequestPerformed',
  'paymentPerformed',
  'moneyMoved',
  'deploymentChanged',
  'productionChanged',
  'publicActivationChanged',
  'storeChanged',
  'firebaseChanged',
  'cloudOrVpsChanged',
  'credentialReadOrRecorded',
  'deviceChanged',
  'pullRequestMerged',
]);

function fail(message) {
  throw new Error(`WP153 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
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

export function validateWp153PositionReviewReleaseParity({
  repositoryRoot = root,
  evidence,
  handover,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.package, 'WP153-POSITION-REVIEW-RELEASE-PARITY-20260915', 'package');
  exact(value?.status,
    'technical-closure-full-regression-passed-v55-inactive-external-gates-hold',
    'status');
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '753e32a136284640f3e79df1aaa5f317b3e296d1',
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository');
  exact(value?.decision, {
    defect: 'mutable-request-payload-could-drive-position-payout-hold',
    canonicalSource: 'exact-v52-return-case-plus-booking-case-status',
    reviewScope: 'booking-position',
    unrelatedPositionRelease: 'independent-own-gates-only',
    successorVersion: 'V5.5-2026-09-15',
    successorActivationAllowed: false,
    activeBindingVersion: 'V5.2-2026-08-16',
    professionalLegalApproval: false,
  }, 'decision');
  exact(value?.invariants, {
    mutablePayloadMayAuthorizeHold: false,
    exactBookingCaseRequired: true,
    canonicalAmountArithmeticRequired: true,
    proportionalOwnerShareHold: true,
    unrelatedPositionsBlockedByDerivedGroupState: false,
    postLockDatabaseClockRequired: true,
    ordinaryReturnCaseAfterPayoutStartAllowed: false,
    humanReviewRequired: true,
    principalBoundAuditRequired: true,
  }, 'invariants');
  exact(value?.legalCorrections?.addressed,
    ['positionNeedsReviewAndUnrelatedRelease'], 'addressed legal corrections');
  exact(value?.legalCorrections?.remaining, [
    'privacyPurposesLegalBasesAndRecipients',
    'accountExportCompletenessAndCounterpartyProtection',
    'retentionDeletionLegalHoldPeriodsAndTriggers',
    'marketplaceTransparencyDsaAndModeration',
  ], 'remaining legal corrections');
  exact(value?.verification, {
    focusedBackend: 'passed-60-of-60',
    focusedFlutter: 'passed-5-of-5',
    focusedLegalAndReadiness: 'passed-19-of-19',
    backendSuite: 'passed-988-top-level-997-pass-skipped-2',
    backendStaticCheck: 'passed',
    postgresIntegration: 'passed-2-of-2-and-cleaned',
    allToolTests: 'passed-3036-of-3036',
    fullTechnicalRegression: 'passed-ci-equivalent-exit-0',
    githubRegression: 'pending',
    githubCodeql: 'pending',
  }, 'verification');
  exact(value?.gates, {
    bindingV55Allowed: false,
    professionalLegalApproval: false,
    realMoneyAllowed: false,
    providerActivationAllowed: false,
    publicActivationAllowed: false,
    productionAllowed: false,
  }, 'gates');
  exact(Object.keys(value?.boundaries ?? {}).sort(), [...boundaryKeys].sort(),
    'external boundary keys');
  for (const key of boundaryKeys) exact(value.boundaries[key], false, `boundaries.${key}`);

  exact(Object.keys(value?.sourceInventory ?? {}).sort(), [...wp153SourcePaths].sort(),
    'source inventory paths');
  exact(value?.captureAttestation?.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory algorithm');
  exact(value?.captureAttestation?.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp153SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) {
      fail(`source inventory ${path} does not contain a SHA-256 digest.`);
    }
    exact(digest(repositoryRoot, path), value.sourceInventory[path],
      `source inventory ${path}`);
  }

  validateV55LegalAssets({ repositoryRoot, sourceTexts });
  validateLegalReadiness({
    root: repositoryRoot,
    legalManifest: JSON.parse(source(repositoryRoot, 'store/legal-readiness.json', sourceTexts)),
    submissionManifest: JSON.parse(source(repositoryRoot, 'store/submission.json', sourceTexts)),
    sourceTexts,
  });

  const payment = source(repositoryRoot, 'backend/src/payment_workflow.js', sourceTexts);
  const returnCase = source(
    repositoryRoot,
    'backend/src/v52_handover_return_workflow.js',
    sourceTexts,
  );
  const group = source(
    repositoryRoot,
    'backend/src/booking_group_handover_domain.js',
    sourceTexts,
  );
  const client = source(repositoryRoot, 'lib/models/booking_group.dart', sourceTexts);
  for (const [text, marker] of [
    [payment, 'canonicalPositionReviewHold({'],
    [payment, 'WHERE return_case.booking_id = booking.id'],
    [payment, "reviewScope: prepared.positionReview?.reviewCaseId"],
    [returnCase, 'SELECT clock_timestamp() AS database_now'],
    [returnCase, 'v52_return_case_conflicts_with_payout'],
    [group, "scope: 'booking_position'"],
    [group, 'unrelatedPositionsBlocked: false'],
    [client, 'Invalid item review truth'],
  ]) {
    if (!text.includes(marker)) fail(`implementation is missing ${marker}.`);
  }
  const handoverText = handover ?? source(repositoryRoot, handoverPath, sourceTexts);
  for (const marker of [
    'mutable `rental_requests.payload`',
    'v52_return_case_conflicts_with_payout',
    'V5.5-2026-09-15',
    'V5.2 remains the only binding version',
    'not professional legal advice',
    '60/60 passed',
    'No provider request, payment, money movement',
  ]) {
    if (!handoverText.includes(marker)) fail(`handover is missing ${marker}.`);
  }
  if (/\/(?:Users|home)\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|accessToken|refreshToken|password/iu.test(
    JSON.stringify(value),
  )) {
    fail('evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    successorVersion: value.decision.successorVersion,
    exactBookingCaseRequired: value.invariants.exactBookingCaseRequired,
    bindingV55Allowed: false,
    realMoneyAllowed: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp153PositionReviewReleaseParity())}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP153 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
