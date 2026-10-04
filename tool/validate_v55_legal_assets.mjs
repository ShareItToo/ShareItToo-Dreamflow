#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const version = 'V5.5-2026-09-15';
const activeVersion = 'V5.2-2026-08-16';
const predecessorVersion = 'V5.4-2026-09-15';
const manifestPath = 'assets/legal/de/legal_manifest_v55.json';
const predecessorPath = 'assets/legal/de/legal_manifest_v54.json';
const predecessorHash = '061c29a9f3b2b83ee6f1af7efed1c33d4896cdaafd0ad6ade1598c20d69196e4';
const historicalBindings = Object.freeze({
  'assets/legal/de/legal_manifest_v52.json':
    '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b',
  'assets/legal/de/legal_manifest_v53.json':
    'd1265d31f68a7c616d782a78cd77c22eadb03dabbbd7e9ebe36a485d6d1a49c6',
  [predecessorPath]: predecessorHash,
});
const documentContract = Object.freeze([
  ['A', 'platform_terms', 'part_a_platform_terms.html', 'Zwei getrennte Vertragsverhältnisse'],
  ['B', 'private_rental_terms', 'part_b_private_rental_terms.html', 'Position vor Gruppe'],
  ['C', 'cancellation_refund', 'part_c_cancellation_refund.html', 'Getrennte Rechtsgründe'],
  ['D', 'handover_return_damage', 'part_d_handover_return_damage.html', 'Positionsgebundener Prüfstatus'],
  ['E', 'payment_payout', 'part_e_payment_payout.html', 'kanonisch gebundenen Positionsfall'],
  ['F', 'community_safety', 'part_f_community_safety.html', 'ShareItToo ersetzt keine Notfallhilfe'],
  ['G', 'reporting_moderation_review', 'part_g_reporting_moderation_review.html', 'Positionsfall und Mitteilung'],
  ['H', 'privacy', 'part_h_privacy.html', 'Fehlende Matrix'],
  ['I', 'imprint_withdrawal_shorttexts', 'part_i_imprint_withdrawal_shorttexts.html', 'Zahlungspflichtige Mietanfrage senden'],
]);
const addressedCorrections = Object.freeze([
  'groupPlatformContractScope',
  'completeOfferAndCounterOfferSemantics',
  'checkoutAndDurableConfirmation',
  'withdrawalAndFixedPeriodRental',
  'partialPerformanceAndDivisibilityConsequences',
  'groupAndPositionCancellationRefundRules',
  'groupConfirmationAndReceiptIssuerContent',
  'positionNeedsReviewAndUnrelatedRelease',
]);
const remainingCorrections = Object.freeze([
  'privacyPurposesLegalBasesAndRecipients',
  'accountExportCompletenessAndCounterpartyProtection',
  'retentionDeletionLegalHoldPeriodsAndTriggers',
  'marketplaceTransparencyDsaAndModeration',
]);
const insufficientFacts = Object.freeze([
  'operatorIdentityAndImprint',
  'groupPaymentAuthorizationAndProviderContract',
  'businessGlobalConsumerAndTraderVariants',
]);
const forbiddenLegacyClaims = /ShareItToo\s+UG|\bGmbH\b|Geschäftsführer|Bernhaldenweg\s+37|Spiegelberg-Jux/iu;

function fail(message) {
  throw new Error(`V5.5 legal validation failed: ${message}`);
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function exactFalse(value, label) {
  if (value !== false) fail(`${label} must remain false.`);
}

export function validateV55LegalAssets({ repositoryRoot, sourceTexts = {} }) {
  const manifest = JSON.parse(source(repositoryRoot, manifestPath, sourceTexts));
  if (manifest.schemaVersion !== 5
      || manifest.version !== version
      || manifest.status !== 'draft-blocked-after-position-review-correction'
      || manifest.effectiveDate !== null) {
    fail('manifest must remain the exact inactive V5.5 draft.');
  }
  for (const [label, value] of Object.entries({
    activationAllowed: manifest.activationAllowed,
    publiclyPublished: manifest.publiclyPublished,
    professionalLegalApproval: manifest.professionalLegalApproval,
    ownerAdoptionRecorded: manifest.ownerAdoptionRecorded,
  })) exactFalse(value, label);

  for (const [path, expected] of Object.entries(historicalBindings)) {
    if (hash(source(repositoryRoot, path, sourceTexts)) !== expected) {
      fail(`historical manifest hash is invalid: ${path}.`);
    }
  }
  if (manifest.derivation?.historicalV52V53AndV54RemainUnchanged !== true
      || manifest.derivation?.predecessorV54ManifestPath !== predecessorPath
      || manifest.derivation?.predecessorV54ManifestSha256 !== predecessorHash
      || manifest.derivation?.astraOutcome !== 'CORRECTIONS_REQUIRED'
      || manifest.derivation?.astraCaptureComplete !== false) {
    fail('derivation must preserve predecessor truth and Astra uncertainty.');
  }

  exact(manifest.correctionScope?.addressedInThisDraft, addressedCorrections,
    'addressed corrections');
  exact(manifest.correctionScope?.stillOpenForLaterPackages, remainingCorrections,
    'remaining corrections');
  exact(manifest.correctionScope?.insufficientExternalEvidence, insufficientFacts,
    'insufficient external evidence');
  exact(manifest.contractModel?.positionReview, {
    scope: 'exact-booking-position',
    canonicalSource: 'append-only-v52-return-case-plus-booking-case-status',
    hold: 'proportional-owner-share-of-contested-authorized-amount',
    unrelatedPositionRelease: 'independent-own-gates-only',
    missingOrContradictoryTruth: 'fail-closed-no-release-no-liability-decision',
    ordinaryCaseAfterPayoutStart: 'rejected-no-ordinary-return-case-no-payout-success-claim',
    humanDecisionRequired: true,
    appeal: 'after-formal-decision-when-applicable',
  }, 'position review contract');

  if (manifest.runtimePreparation?.activeBindingVersion !== activeVersion
      || manifest.runtimePreparation?.preparedInactiveVersion !== version
      || manifest.runtimePreparation?.preparedVersionBindingAcceptanceAllowed !== false
      || manifest.runtimePreparation?.unknownVersionFallbackAllowed !== false
      || manifest.runtimePreparation?.runtimeActivationChanged !== false) {
    fail('runtime preparation is invalid.');
  }
  if (!Array.isArray(manifest.documents)
      || manifest.documents.length !== documentContract.length) {
    fail('documents must contain exactly nine parts.');
  }
  for (const [index, [part, type, name, marker]] of documentContract.entries()) {
    const expectedPath = `assets/legal/de/v55/${name}`;
    const descriptor = manifest.documents[index];
    if (descriptor?.part !== part || descriptor?.type !== type
        || descriptor?.path !== expectedPath
        || !/^[a-f0-9]{64}$/u.test(descriptor?.sha256 ?? '')) {
      fail(`document ${part} descriptor is invalid.`);
    }
    const content = source(repositoryRoot, expectedPath, sourceTexts);
    if (hash(content) !== descriptor.sha256) fail(`document ${part} hash is stale.`);
    if (!content.includes(`data-legal-version="${version}"`)
        || !content.includes('data-activation-allowed="false"')
        || !content.includes(marker)
        || forbiddenLegacyClaims.test(content)) {
      fail(`document ${part} is missing ${marker} or contains a forbidden claim.`);
    }
  }
  const combined = manifest.documents
    .map((entry) => source(repositoryRoot, entry.path, sourceTexts))
    .join('\n');
  for (const marker of [
    'konkret streitigen Anteil',
    'Unstreitige Anteile und andere Positionen',
    'menschliche oder rechtliche Prüfung',
    'principalgebunden mitgeteilt',
    'allgemeine Providerreserve',
    'weder als Auszahlungserfolg noch als abgeschlossene Ablehnung',
  ]) {
    if (!combined.includes(marker)) fail(`documents are missing ${marker}.`);
  }

  const registry = source(
    repositoryRoot,
    'backend/src/legal_contract_version_registry.js',
    sourceTexts,
  );
  for (const marker of [
    `activeBindingContractVersion = '${activeVersion}'`,
    `preparedBindingContractVersion = '${predecessorVersion}'`,
    `positionReviewDraftContractVersion = '${version}'`,
    "status: 'draft-blocked-after-position-review-correction'",
    'bindingContractAcceptanceAllowed: false',
  ]) {
    if (!registry.includes(marker)) fail(`runtime registry is missing ${marker}.`);
  }
  if (/\/(?:Users|home)\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue|accessToken|refreshToken|password/iu.test(
    JSON.stringify(manifest),
  )) {
    fail('manifest contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: manifest.status,
    documentCount: manifest.documents.length,
    activeBindingVersion: activeVersion,
    preparedInactiveVersion: version,
    activationAllowed: false,
  });
}

async function main() {
  try {
    const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
    process.stdout.write(`${JSON.stringify(validateV55LegalAssets({ repositoryRoot }))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
