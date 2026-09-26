#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateV54LegalAssets } from './validate_v54_legal_assets.mjs';
import {
  boundDigest,
  materializeBoundSourceTexts,
  readBoundSource,
  resolveBoundSnapshot,
} from './read_bound_source.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp152-v54-contract-draft-20260915.json';
const handoverPath =
  'docs/operations/WP152_V54_CONTRACT_SCOPE_OFFER_REFUND_RECEIPT_DRAFT_2026-09-15.md';

export const wp152SourcePaths = Object.freeze([
  'assets/legal/de/legal_manifest_v52.json',
  'assets/legal/de/legal_manifest_v53.json',
  'assets/legal/de/legal_manifest_v54.json',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/manifest.json',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/02_verdict_matrix.json',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/manifest.json',
  'assets/legal/de/v54/part_a_platform_terms.html',
  'assets/legal/de/v54/part_b_private_rental_terms.html',
  'assets/legal/de/v54/part_c_cancellation_refund.html',
  'assets/legal/de/v54/part_d_handover_return_damage.html',
  'assets/legal/de/v54/part_e_payment_payout.html',
  'assets/legal/de/v54/part_f_community_safety.html',
  'assets/legal/de/v54/part_g_reporting_moderation_review.html',
  'assets/legal/de/v54/part_h_privacy.html',
  'assets/legal/de/v54/part_i_imprint_withdrawal_shorttexts.html',
  'backend/src/legal_contract_version_registry.js',
  'backend/src/v52_contract_workflow.js',
  'backend/test/legal_contract_version_registry.test.js',
  'backend/test/v52_contract_workflow.test.js',
  'docs/current_state.md',
  'docs/current_work_package.md',
  'docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md',
  'docs/operations/WP152_V54_CONTRACT_SCOPE_OFFER_REFUND_RECEIPT_DRAFT_2026-09-15.md',
  'store/legal-readiness.json',
  'store/privacy-disclosures.json',
  'test/tool/validate_legal_readiness.test.mjs',
  'test/tool/validate_v54_legal_assets.test.mjs',
  'test/tool/validate_wp152_v54_contract_draft.test.mjs',
  'tool/validate_legal_readiness.mjs',
  'tool/validate_v54_legal_assets.mjs',
  'tool/validate_wp152_v54_contract_draft.mjs',
]);

const legalDocumentSourcePaths = Object.freeze([
  'lib/screens/legal_terms_screen.dart',
  'lib/screens/legal_community_rules_screen.dart',
  'lib/screens/legal_cancellation_policy_screen.dart',
  'lib/screens/legal_fees_payments_screen.dart',
  'lib/screens/legal_privacy_screen.dart',
  'lib/screens/legal_imprint_screen.dart',
]);

const addressedCorrections = Object.freeze([
  'groupPlatformContractScope',
  'completeOfferAndCounterOfferSemantics',
  'checkoutAndDurableConfirmation',
  'withdrawalAndFixedPeriodRental',
  'partialPerformanceAndDivisibilityConsequences',
  'groupAndPositionCancellationRefundRules',
  'groupConfirmationAndReceiptIssuerContent',
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
  throw new Error(`WP152 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function digest(repositoryRoot, path, sourceTexts, revision, expectedDigest) {
  return boundDigest({ repositoryRoot, path, revision, sourceTexts, expectedDigest });
}

function inventoryDigest(inventory) {
  return createHash('sha256')
    .update(Object.entries(inventory)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, hash]) => `${path}\0${hash}\n`)
      .join(''))
    .digest('hex');
}

export function validateWp152V54ContractDraft({
  repositoryRoot = root,
  evidence,
  handover,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  const baselineRevision = value.repository?.finalHead ?? value.repository?.baselineHead;
  let boundSnapshot;
  try {
    boundSnapshot = resolveBoundSnapshot({
      repositoryRoot,
      baselineHead: baselineRevision,
      inventory: value.sourceInventory,
      anchorPath: evidencePath,
      finalHead: value.repository?.finalHead,
    });
  } catch (error) {
    fail(error?.message ?? 'bound source snapshot unavailable.');
  }
  const boundRevision = boundSnapshot.revision;
  sourceTexts = {
    ...materializeBoundSourceTexts({
      repositoryRoot,
      snapshot: boundSnapshot,
    }),
    ...sourceTexts,
  };
  for (const path of legalDocumentSourcePaths) {
    if (!Object.hasOwn(sourceTexts, path)) {
      sourceTexts[path] = readBoundSource({
        repositoryRoot,
        revision: boundRevision,
        path,
      }).toString('utf8');
    }
  }
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.package, 'WP152-V54-CONTRACT-DRAFT-20260915', 'package');
  exact(value?.status, 'technical-draft-closure-v54-inactive-external-gates-hold', 'status');
  exact(value?.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineHead: '146b2e3f5441944dab7764cc077131effadfc6b3',
    remoteAhead: 0,
    remoteBehind: 0,
  }, 'repository');
  exact(value?.decision, {
    historicalV52Unchanged: true,
    inactiveV53Unchanged: true,
    successorVersion: 'V5.4-2026-09-15',
    successorDocumentCount: 9,
    successorActivationAllowed: false,
    professionalLegalApproval: false,
    astraOutcome: 'CORRECTIONS_REQUIRED',
    astraRawCaptureComplete: false,
  }, 'decision');
  exact(value?.corrections?.addressed, addressedCorrections, 'addressed corrections');
  exact(value?.corrections?.remaining, [
    'positionNeedsReviewAndUnrelatedRelease',
    'privacyPurposesLegalBasesAndRecipients',
    'accountExportCompletenessAndCounterpartyProtection',
    'retentionDeletionLegalHoldPeriodsAndTriggers',
    'marketplaceTransparencyDsaAndModeration',
  ], 'remaining corrections');
  exact(value?.corrections?.insufficientExternalEvidence, [
    'operatorIdentityAndImprint',
    'groupPaymentAuthorizationAndProviderContract',
    'businessGlobalConsumerAndTraderVariants',
  ], 'insufficient external evidence');
  exact(value?.contractModel, {
    platformContract: 'renter-and-sit',
    privateRentalContract: 'renter-and-private-owner-itemized-group',
    lateOrChangedAcceptance: 'new-counteroffer-new-quote-new-consent',
    providerUnknown: 'unresolved-no-success-no-denial-no-duplicate-payment',
    partialFailure: 'position-first-unaffected-positions-continue',
    rentDebtor: 'renter',
    rentCreditor: 'private-owner',
    platformFeeDebtor: 'renter',
    platformFeeCreditor: 'sit',
    providerReceiptIsUnderlyingInvoice: false,
  }, 'contract model');
  exact(value?.runtime, {
    activeBindingVersion: 'V5.2-2026-08-16',
    preparedInactiveVersion: 'V5.4-2026-09-15',
    preparedVersionError: 'legal_contract_version_inactive',
    unknownVersionError: 'legal_contract_version_unsupported',
    v52ReadinessGuarded: true,
    v52PersistenceGuarded: true,
    runtimeActivationChanged: false,
  }, 'runtime');
  exact(value?.verification?.focusedLegalTests, 'passed-19-of-19',
    'focused legal tests');
  exact(value?.verification?.focusedBackendTests, 'passed-10-of-10',
    'focused backend tests');
  exact(value?.verification?.backendStaticCheck, 'passed', 'backend static check');
  exact(value?.verification?.allToolTests, 'passed-3026-of-3026', 'all tool tests');
  exact(value?.verification?.backendTests, 'passed-988-skipped-2', 'backend tests');
  exact(value?.verification?.postgresIntegrationTests,
    'passed-2-of-2-and-cleaned', 'PostgreSQL tests');
  exact(value?.verification?.flutterTests, 'passed-952-skipped-33', 'Flutter tests');
  exact(value?.verification?.flutterAnalyzer, 'passed-zero-issues', 'Flutter analyzer');
  exact(value?.verification?.webWasmLoopbackAndroid,
    'passed-web-wasm-loopback-android-minsdk24', 'platform regression');
  exact(value?.verification?.fullTechnicalRegression,
    'passed-ci-equivalent-exit-0', 'full technical regression');
  exact(value?.verification?.githubRegression, 'pending', 'GitHub Regression');
  exact(value?.verification?.githubCodeql, 'pending', 'GitHub CodeQL');

  exact(value?.gates, {
    professionalLegalApproval: false,
    ownerAdoptionRecorded: false,
    bindingV54Allowed: false,
    realMoneyAllowed: false,
    providerActivationAllowed: false,
    publicActivationAllowed: false,
    productionAllowed: false,
  }, 'gates');
  exact(Object.keys(value?.boundaries ?? {}).sort(), [...boundaryKeys].sort(),
    'external boundary keys');
  for (const key of boundaryKeys) exact(value.boundaries[key], false, `boundaries.${key}`);

  exact(Object.keys(value?.sourceInventory ?? {}).sort(), [...wp152SourcePaths].sort(),
    'source inventory paths');
  exact(value?.captureAttestation?.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory algorithm');
  exact(value?.captureAttestation?.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp152SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) {
      fail(`source inventory ${path} does not contain a SHA-256 digest.`);
    }
    exact(digest(repositoryRoot, path, sourceTexts, boundRevision, value.sourceInventory[path]), value.sourceInventory[path],
      `source inventory ${path}`);
  }

  const legalResult = validateV54LegalAssets({ repositoryRoot, sourceTexts });
  exact(legalResult, {
    status: 'draft-blocked-after-ai-corrections',
    documentCount: 9,
    activeBindingVersion: 'V5.2-2026-08-16',
    preparedInactiveVersion: 'V5.4-2026-09-15',
    activationAllowed: false,
  }, 'V5.4 legal validation');

  const handoverText = handover ?? source(repositoryRoot, handoverPath, sourceTexts);
  for (const marker of [
    'V5.4-2026-09-15',
    'CORRECTIONS_REQUIRED',
    'not professional legal advice',
    'Zahlungspflichtige Mietanfrage senden',
    'renter = debtor of the private rent',
    'private owner = creditor and service provider',
    'legal_contract_version_inactive',
    'legal_contract_version_unsupported',
    '19/19',
    '10/10',
    'All external gates remain closed',
  ]) {
    if (!handoverText.includes(marker)) fail(`handover is missing ${marker}.`);
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|accessToken|refreshToken|password/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    successorVersion: value.decision.successorVersion,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
    bindingV54Allowed: false,
    realMoneyAllowed: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp152V54ContractDraft())}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP152 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
