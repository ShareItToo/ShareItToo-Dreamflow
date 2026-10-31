#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const version = 'V5.3-2026-09-09';
const historicalV52Hash = '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b';
const operator = Object.freeze({
  businessDesignation: 'ShareItToo – Inhaber Walid Chraibi',
  ownerName: 'Walid Chraibi',
  legalForm: 'sole-proprietor',
  serviceAddress: 'Bernhaldenweg 47, 71579 Spiegelberg, Deutschland',
  contactEmail: 'contact@shareittoo.com',
  businessRegistration: 'required-at-actual-start-not-yet-recorded',
  taxNumber: 'applied-for-not-issued-not-recorded',
  vatId: 'not-recorded',
  economicIdentificationNumber: 'not-recorded',
  registerEntry: 'not-recorded',
  managingDirector: 'not-applicable',
});
const documents = Object.freeze([
  ['A', 'platform_terms', 'part_a_platform_terms.html', 'Teil A – Plattform-Nutzungsbedingungen', 'weder eine öffentliche Registrierung'],
  ['B', 'private_rental_terms', 'part_b_private_rental_terms.html', 'Teil B – Private Mietbedingungen', 'nicht Partei eines privaten Mietvertrags'],
  ['C', 'cancellation_refund', 'part_c_cancellation_refund.html', 'Teil C – Storno und Erstattung', 'keine echten Zahlungen'],
  ['D', 'handover_return_damage', 'part_d_handover_return_damage.html', 'Teil D – Übergabe, Rückgabe und Schäden', 'keine verbindliche'],
  ['E', 'payment_payout', 'part_e_payment_payout.html', 'Teil E – Zahlung und Auszahlung', 'umsatzsteuerliche Einordnung'],
  ['F', 'community_safety', 'part_f_community_safety.html', 'Teil F – Community und Sicherheit', 'Notfallhilfe'],
  ['G', 'reporting_moderation_review', 'part_g_reporting_moderation_review.html', 'Teil G – Meldung, Moderation und Review', 'Notice-and-action'],
  ['H', 'privacy', 'part_h_privacy.html', 'Teil H – Datenschutz', 'DPA'],
  ['I', 'imprint_withdrawal_shorttexts', 'part_i_imprint_withdrawal_shorttexts.html', 'Teil I – Impressum, Widerruf und Kurztexte', 'eingestellte EU-ODR-Plattform'],
]);
const forbiddenLegacyClaims = /ShareItToo\s+UG|\bGmbH\b|Geschäftsführer|Bernhaldenweg\s+37|Spiegelberg-Jux/iu;

function fail(message) {
  throw new Error(message);
}

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} is invalid.`);
}

function exactFalse(value, label) {
  if (value !== false) fail(`${label} must remain false.`);
}

export function validateV53LegalAssets({ repositoryRoot }) {
  const legalRoot = resolve(repositoryRoot, 'assets/legal/de');
  const manifest = JSON.parse(readFileSync(resolve(legalRoot, 'legal_manifest_v53.json'), 'utf8'));
  if (manifest.schemaVersion !== 3 || manifest.version !== version
      || manifest.status !== 'draft-blocked' || manifest.effectiveDate !== null) {
    fail('V5.3 legal manifest must remain a versioned inactive draft.');
  }
  exactFalse(manifest.activationAllowed, 'activationAllowed');
  exactFalse(manifest.publiclyPublished, 'publiclyPublished');
  for (const [key, value] of Object.entries(operator)) same(manifest.operator?.[key], value, `operator.${key}`);

  if (manifest.derivation?.historicalV5AndV52RemainUnchanged !== true
      || manifest.derivation?.historicalV52ManifestPath !== 'assets/legal/de/legal_manifest_v52.json'
      || manifest.derivation?.historicalV52ManifestSha256 !== historicalV52Hash
      || hash(readFileSync(resolve(legalRoot, 'legal_manifest_v52.json'))) !== historicalV52Hash) {
    fail('V5.3 must preserve the V5.2 historical baseline exactly.');
  }

  const sources = manifest.officialSources;
  for (const key of ['ddgSection5', 'businessRegistration', 'ustgSection19', 'vsbgSection36', 'vsbgSection37', 'dsa']) {
    if (typeof sources?.[key] !== 'string' || !sources[key].startsWith('https://')) {
      fail('V5.3 official-source binding is incomplete.');
    }
  }
  const tax = manifest.taxAndConsumerBoundaries;
  exactFalse(tax?.taxTreatmentAssumed, 'taxTreatmentAssumed');
  exactFalse(tax?.invoiceOrTaxLogicEnabled, 'invoiceOrTaxLogicEnabled');
  exactFalse(tax?.paymentOrPayoutEnabled, 'paymentOrPayoutEnabled');
  exactFalse(tax?.euOdrLinkIncluded, 'euOdrLinkIncluded');
  same(tax?.vsbgSection36Status, 'employment-count-and-participation-review-open', 'vsbgSection36Status');
  same(tax?.vsbgSection37Status, 'case-specific-unresolved-dispute-process-open', 'vsbgSection37Status');
  exactFalse(tax?.withdrawalFlowEnabled, 'withdrawalFlowEnabled');

  const dsa = manifest.dsaBoundaries;
  if (dsa?.classificationProfessionalReviewOpen !== true
      || dsa.microSmallEnterpriseStatusIsNotGeneralExemptionClaim !== true) {
    fail('V5.3 DSA review boundary is incomplete.');
  }
  for (const key of ['authorityContactPointOperational', 'recipientContactPointOperational', 'termsTransparencyImplementationComplete', 'noticeAndActionImplementationComplete']) exactFalse(dsa?.[key], `dsa.${key}`);

  const requiredGates = [
    'operator-and-imprint-completeness', 'business-registration-at-actual-start',
    'tax-treatment-and-invoice-logic', 'consumer-and-marketplace-classification',
    'contract-acceptance-cancellation-and-withdrawal', 'payment-service-provider-and-refund-flow',
    'privacy-retention-deletion-and-supervisory-authority', 'processor-dpa-region-and-transfer-evidence',
    'dsa-classification-contact-points-terms-and-notice-action', 'public-route-and-download-delivery',
  ];
  if (!Array.isArray(manifest.openProfessionalReviewGates)
      || requiredGates.some((gate) => !manifest.openProfessionalReviewGates.includes(gate))) {
    fail('V5.3 hides an open professional-review gate.');
  }
  for (const key of ['publicCommercialOperation', 'publicRegistration', 'realInvitations', 'bindingContractAcceptance', 'realMoney', 'paymentProviderActivation', 'storeActivation', 'productionRelease', 'mapsConfigurationChanged']) exactFalse(manifest.externalBoundaries?.[key], `externalBoundaries.${key}`);
  same(manifest.externalBoundaries?.mapsArchitecture, 'server-side-key-only; later-restrict-to-confirmed-vps-egress-ip-and-required-places-api', 'mapsArchitecture');

  if (!Array.isArray(manifest.documents) || manifest.documents.length !== documents.length) {
    fail('V5.3 must bind exactly nine user-facing draft parts.');
  }
  for (const [index, [part, type, file, title, marker]] of documents.entries()) {
    const document = manifest.documents[index];
    const path = `assets/legal/de/v53/${file}`;
    if (document?.part !== part || document.type !== type || document.path !== path || document.title !== title
        || !/^[a-f0-9]{64}$/u.test(document.sha256)) fail(`V5.3 manifest entry ${part} is invalid.`);
    const content = readFileSync(resolve(legalRoot, 'v53', file));
    if (hash(content) !== document.sha256) fail(`V5.3 legal asset hash drift: ${file}`);
    const text = content.toString('utf8');
    for (const required of ['<!doctype html>', '<html lang="de"', `data-legal-version="${version}"`, `data-legal-part="${part}"`, 'data-activation-allowed="false"', operator.businessDesignation, 'Walid Chraibi', 'Bernhaldenweg 47', '71579 Spiegelberg', 'contact@shareittoo.com', marker]) {
      if (!text.includes(required)) fail(`V5.3 document ${part} is missing required draft content.`);
    }
    if (forbiddenLegacyClaims.test(text) || /<script\b|<form\b|https?:\/\//iu.test(text)) {
      fail(`V5.3 document ${part} contains legacy, executable, or remote content.`);
    }
  }
  return Object.freeze({ status: 'draft-blocked', documentCount: documents.length, activationAllowed: false });
}

async function main() {
  try {
    const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
    process.stdout.write(`${JSON.stringify(validateV53LegalAssets({ repositoryRoot }))}\n`);
  } catch (error) {
    process.stderr.write(`V5.3 legal validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
