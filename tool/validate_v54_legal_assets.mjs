#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const version = 'V5.4-2026-09-15';
const v52Version = 'V5.2-2026-08-16';
const v52ManifestPath = 'assets/legal/de/legal_manifest_v52.json';
const v52ManifestHash = '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b';
const v53ManifestPath = 'assets/legal/de/legal_manifest_v53.json';
const v53ManifestHash = 'd1265d31f68a7c616d782a78cd77c22eadb03dabbbd7e9ebe36a485d6d1a49c6';
const manifestPath = 'assets/legal/de/legal_manifest_v54.json';
const registryPath = 'backend/src/legal_contract_version_registry.js';
const workflowPath = 'backend/src/v52_contract_workflow.js';
const sourceBindings = Object.freeze({
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/manifest.json':
    'ff752ea1a9192d91d0940678d3ba403fda327cc25bf413eaaa59f8d89477552e',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/manifest.json':
    'b5c062ab65c3c651d983a3624bf1e236d8de8881ccc79f64bd5d3818569c3772',
  'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/02_verdict_matrix.json':
    'f1c66c993d966b0d6c83c1e7b5201e7da9de9d515b53aa77f10aa6faffeb48d8',
});
const documents = Object.freeze([
  ['A', 'platform_terms', 'part_a_platform_terms.html', 'Zwei getrennte Vertragsverhältnisse'],
  ['B', 'private_rental_terms', 'part_b_private_rental_terms.html', 'Position vor Gruppe'],
  ['C', 'cancellation_refund', 'part_c_cancellation_refund.html', 'Getrennte Rechtsgründe'],
  ['D', 'handover_return_damage', 'part_d_handover_return_damage.html', 'Gemeinsamer Termin, einzelne Positionen'],
  ['E', 'payment_payout', 'part_e_payment_payout.html', 'Mieter Schuldner und der private Vermieter Gläubiger'],
  ['F', 'community_safety', 'part_f_community_safety.html', 'ShareItToo ersetzt keine Notfallhilfe'],
  ['G', 'reporting_moderation_review', 'part_g_reporting_moderation_review.html', 'ohne Konto'],
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
]);
const stillOpenCorrections = Object.freeze([
  'positionNeedsReviewAndUnrelatedRelease',
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
  throw new Error(`V5.4 legal validation failed: ${message}`);
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

export function validateV54LegalAssets({ repositoryRoot, sourceTexts = {} }) {
  const manifestText = source(repositoryRoot, manifestPath, sourceTexts);
  const manifest = JSON.parse(manifestText);
  if (manifest.schemaVersion !== 4
      || manifest.version !== version
      || manifest.status !== 'draft-blocked-after-ai-corrections'
      || manifest.effectiveDate !== null) {
    fail('manifest must remain the exact inactive V5.4 draft.');
  }
  exactFalse(manifest.activationAllowed, 'activationAllowed');
  exactFalse(manifest.publiclyPublished, 'publiclyPublished');
  exactFalse(manifest.professionalLegalApproval, 'professionalLegalApproval');
  exactFalse(manifest.ownerAdoptionRecorded, 'ownerAdoptionRecorded');

  const derivation = manifest.derivation;
  if (derivation?.historicalV52AndV53RemainUnchanged !== true
      || derivation.historicalV52ManifestPath !== v52ManifestPath
      || derivation.historicalV52ManifestSha256 !== v52ManifestHash
      || derivation.predecessorV53ManifestPath !== v53ManifestPath
      || derivation.predecessorV53ManifestSha256 !== v53ManifestHash
      || derivation.astraOutcome !== 'CORRECTIONS_REQUIRED'
      || derivation.astraCaptureComplete !== false) {
    fail('historical derivation or Astra limitation is incomplete.');
  }
  exact(hash(source(repositoryRoot, v52ManifestPath, sourceTexts)), v52ManifestHash,
    'historical V5.2 manifest hash');
  exact(hash(source(repositoryRoot, v53ManifestPath, sourceTexts)), v53ManifestHash,
    'historical V5.3 manifest hash');
  for (const [path, expectedHash] of Object.entries(sourceBindings)) {
    exact(hash(source(repositoryRoot, path, sourceTexts)), expectedHash, `source binding ${path}`);
  }

  exact(manifest.correctionScope?.addressedInThisDraft, addressedCorrections,
    'addressed correction scope');
  exact(manifest.correctionScope?.stillOpenForLaterPackages, stillOpenCorrections,
    'still-open correction scope');
  exact(manifest.correctionScope?.insufficientExternalEvidence, insufficientFacts,
    'insufficient external evidence');

  const sources = manifest.officialSources;
  const requiredSourceKeys = [
    'bgbOfferBinding145', 'bgbAcceptancePeriod147', 'bgbChangedAcceptance150',
    'bgbSuspensiveCondition158', 'bgbTextForm126b', 'bgbDurableConfirmation312f',
    'bgbElectronicOrder312j', 'bgbWithdrawal355', 'bgbElectronicWithdrawal356a',
    'bgbWithdrawalConsequences357', 'bgbRentalDuties535',
    'egbgbConsumerInformation246a1', 'egbgbInformationForm246a4',
    'egbgbMarketplaceInformation246d1',
  ];
  exact(Object.keys(sources ?? {}).sort(), [...requiredSourceKeys].sort(),
    'official source key set');
  for (const url of Object.values(sources)) {
    if (!/^https:\/\/www\.gesetze-im-internet\.de\//u.test(url)) {
      fail('official sources must be primary BMJ/BfJ law pages.');
    }
  }

  exact(manifest.contractModel, {
    platformContractParty: 'renter-and-sit',
    privateRentalContractParties: 'renter-and-private-owner',
    privateRentalStructure: 'one-group-contract-with-ordered-position-annex',
    listingMeaning: 'invitation-to-offer',
    changedOrLateAcceptanceMeaning: 'rejection-plus-new-counteroffer',
    paymentCondition: 'suspensive-condition-only-when-prominently-disclosed',
    transportUnknownMeaning: 'outcome-unknown-reconciliation-required',
    unrelatedPositionsRemainUnaffected: true,
  }, 'contract model');
  exact(manifest.receiptRoles, {
    rentDebtor: 'renter',
    rentCreditorAndServiceProvider: 'private-owner',
    platformFeeDebtor: 'renter',
    platformFeeCreditorAndServiceProvider: 'sit',
    paymentConfirmationIssuer: 'licensed-provider-after-separate-approval',
    paymentConfirmationIsUnderlyingInvoice: false,
    combinedOverviewMayBeSingleInvoice: false,
  }, 'receipt and debtor-creditor roles');

  exact(manifest.runtimePreparation, {
    registryPath,
    activeBindingVersion: v52Version,
    preparedInactiveVersion: version,
    preparedVersionBindingAcceptanceAllowed: false,
    unknownVersionFallbackAllowed: false,
    runtimeActivationChanged: false,
  }, 'runtime preparation');

  if (!Array.isArray(manifest.documents) || manifest.documents.length !== documents.length) {
    fail('manifest must bind exactly nine documents.');
  }
  for (const [index, [part, type, file, marker]] of documents.entries()) {
    const entry = manifest.documents[index];
    const path = `assets/legal/de/v54/${file}`;
    if (entry?.part !== part || entry.type !== type || entry.path !== path
        || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`document ${part} manifest entry is invalid.`);
    }
    const text = source(repositoryRoot, path, sourceTexts);
    exact(hash(text), entry.sha256, `document ${part} hash`);
    for (const required of [
      '<!doctype html>', '<html lang="de"', `data-legal-version="${version}"`,
      `data-legal-part="${part}"`, 'data-activation-allowed="false"',
      'Inaktiver KI-Rechtsentwurf V5.4', marker,
    ]) {
      if (!text.includes(required)) fail(`document ${part} is missing ${required}.`);
    }
    if (forbiddenLegacyClaims.test(text) || /<script\b|<form\b|https?:\/\//iu.test(text)) {
      fail(`document ${part} contains legacy, executable, or remote content.`);
    }
  }

  const boundaries = manifest.externalBoundaries;
  const boundaryKeys = [
    'publicCommercialOperation', 'publicRegistration', 'realInvitations',
    'bindingContractAcceptance', 'realMoney', 'paymentProviderActivation',
    'storeActivation', 'productionRelease', 'firebaseChanged', 'cloudOrVpsChanged',
    'pullRequestMerged',
  ];
  exact(Object.keys(boundaries ?? {}).sort(), [...boundaryKeys].sort(),
    'external boundary key set');
  for (const key of boundaryKeys) exactFalse(boundaries[key], `externalBoundaries.${key}`);
  if (!Array.isArray(manifest.openProfessionalReviewGates)
      || manifest.openProfessionalReviewGates.length < 10) {
    fail('professional review gates are incomplete.');
  }

  const registry = source(repositoryRoot, registryPath, sourceTexts);
  for (const marker of [
    `activeBindingContractVersion = '${v52Version}'`,
    `preparedBindingContractVersion = '${version}'`,
    "status: 'draft-blocked-after-ai-corrections'",
    'bindingContractAcceptanceAllowed: false',
    "throw new LegalContractVersionError('legal_contract_version_unsupported')",
    "throw new LegalContractVersionError('legal_contract_version_inactive')",
  ]) {
    if (!registry.includes(marker)) fail(`runtime registry is missing ${marker}.`);
  }
  const workflow = source(repositoryRoot, workflowPath, sourceTexts);
  if ((workflow.match(/assertActiveBindingContractVersion\(v52ContractDocument\.version\)/gu) ?? []).length !== 2) {
    fail('existing V5.2 readiness and persistence must both pass the exact active-version guard.');
  }
  if (workflow.includes(version)) {
    fail('existing V5.2 runtime must not select the V5.4 draft.');
  }

  return Object.freeze({
    status: manifest.status,
    documentCount: manifest.documents.length,
    activeBindingVersion: v52Version,
    preparedInactiveVersion: version,
    activationAllowed: false,
  });
}

async function main() {
  try {
    const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
    process.stdout.write(`${JSON.stringify(validateV54LegalAssets({ repositoryRoot }))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
