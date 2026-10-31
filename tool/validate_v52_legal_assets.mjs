#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedVersion = 'V5.2-2026-08-16';
const expectedSource = Object.freeze({
  title: 'ShareItToo Rechtsmappe Privat-Launch V5.2',
  fileName: '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf',
  date: '2026-08-16',
  driveFileId: '1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2',
  driveUrl: 'https://drive.google.com/file/d/1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2/view',
  createdTime: '2026-08-18T17:23:13.235Z',
  modifiedTime: '2026-08-18T17:51:36.056Z',
  mediaType: 'application/pdf',
  bytes: 285180,
  pages: 55,
  sha256: 'aa6f631457c9b73fdae3c5d4415ba6681b86f63b51df3fd5937c50f80a27b8a8',
});

const expectedDocuments = Object.freeze([
  {
    part: 'A',
    type: 'platform_terms',
    file: 'part_a_platform_terms.html',
    title: 'Teil A - Plattform-Nutzungsbedingungen',
    pages: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    contractRole: 'platform-contract',
    markers: [
      'Allgemeine Geschäftsbedingungen für die Nutzung von ShareItToo',
      'ausschließlich zwischen Vermieter und Mieter zustande',
      'Marketplace-Zahlungsdienstleister',
    ],
  },
  {
    part: 'B',
    type: 'private_rental_terms',
    file: 'part_b_private_rental_terms.html',
    title: 'Teil B - Privat-Mietbedingungen zwischen Nutzern',
    pages: [19, 20, 21, 22, 23],
    contractRole: 'private-rental-contract',
    markers: [
      'Diese Bedingungen werden bei jeder Buchung Bestandteil des Mietvertrags zwischen den beiden privaten Nutzern',
      'Eigenverantwortliche Risiko- und Versicherungsprüfung',
      'ShareItToo wird durch diese Regelung nicht Partei des Mietvertrags',
    ],
  },
  {
    part: 'C',
    type: 'cancellation_refund',
    file: 'part_c_cancellation_refund.html',
    title: 'Teil C - Storno-, No-Show- und Refund-Regelwerk',
    pages: [24, 25],
    contractRole: 'private-rental-contract',
    markers: [
      'mindestens 24 Stunden vor Mietbeginn',
      '50 %',
      '60 Minuten',
      'keine separate Refund-Gebühr',
    ],
  },
  {
    part: 'D',
    type: 'handover_return_damage',
    file: 'part_d_handover_return_damage.html',
    title: 'Teil D - Übergabe-, Rückgabe- und Schadenregeln',
    pages: [26, 27, 28],
    contractRole: 'private-rental-contract',
    markers: [
      'QR-Code verwenden; bei technischem Ausfall sechsstelligen Fallback-Code nutzen',
      'Keine Kaution, Versicherung oder Schadengarantie',
      'entscheidet nicht verbindlich über zivilrechtliche Haftung',
    ],
  },
  {
    part: 'E',
    type: 'payment_payout',
    file: 'part_e_payment_payout.html',
    title: 'Teil E - Zahlungs- und Auszahlungsbedingungen',
    pages: [29, 30, 31],
    contractRole: 'platform-contract',
    markers: [
      'Einheitliche Zeitachse nach Rückgabe',
      'needsReview ab Falleröffnung T1',
      'SIT-Plattformgebühr 5,40 EUR',
      'darf nicht als Umsatz von ShareItToo ausgewiesen werden',
    ],
  },
  {
    part: 'F',
    type: 'community_safety',
    file: 'part_f_community_safety.html',
    title: 'Teil F - Community-, Sicherheits- und Verbotsregeln',
    pages: [32],
    contractRole: 'platform-contract',
    markers: [
      'Fahrzeuge und Verkehrsmittel',
      'Waffen',
      'ShareItToo ersetzt keinen Notfalldienst',
    ],
  },
  {
    part: 'G',
    type: 'reporting_moderation_review',
    file: 'part_g_reporting_moderation_review.html',
    title: 'Teil G - Melde-, Moderations- und Überprüfungsverfahren',
    pages: [33, 34],
    contractRole: 'platform-contract',
    markers: [
      'mindestens sechs Monate ab Mitteilung der Entscheidung eine interne Überprüfung beantragen',
      'Begründung und Überprüfung',
      'maschinenlesbaren Format bereitgestellt',
    ],
  },
  {
    part: 'H',
    type: 'privacy',
    file: 'part_h_privacy.html',
    title: 'Teil H - Datenschutzerklärung für ShareItToo',
    pages: [35, 36, 37, 38, 39, 40, 41],
    contractRole: 'statutory-information',
    markers: [
      'Firebase Cloud Messaging (FCM)',
      'Firebase Crashlytics',
      'Google Analytics,',
      'Ein Dienst, dessen Betreiber, Vertragsrolle, Region, Datenfelder oder Löschfrist nicht dokumentiert sind, darf im Produktivsystem nicht aktiviert werden',
    ],
  },
  {
    part: 'I',
    type: 'imprint_withdrawal_shorttexts',
    file: 'part_i_imprint_withdrawal_shorttexts.html',
    title: 'Teil I - Impressum, Widerruf und In-App-Kurztexte',
    pages: [42, 43, 44, 45],
    contractRole: 'statutory-information',
    markers: [
      'Impressum nach § 5 DDG',
      'Widerrufsbelehrung für die entgeltliche Plattformleistung',
      'Muster-Widerrufsformular',
      'Bestätigen und bezahlen',
    ],
  },
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireExactObject(actual, expected, label) {
  if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
    fail(`${label} does not match the reviewed V5.2 source evidence.`);
  }
}

export function validateV52LegalAssets({ repositoryRoot }) {
  const assetRoot = resolve(repositoryRoot, 'assets/legal/de');
  const documentRoot = resolve(assetRoot, 'v52');
  const manifest = JSON.parse(
    readFileSync(resolve(assetRoot, 'legal_manifest_v52.json'), 'utf8'),
  );

  if (manifest.schemaVersion !== 2
      || manifest.version !== expectedVersion
      || manifest.status !== 'draft-blocked'
      || manifest.activationAllowed !== false
      || manifest.productionProvisioningAllowed !== false
      || manifest.effectiveDate !== null) {
    fail('V5.2 legal manifest must remain an inactive draft while facts and approvals are open.');
  }
  requireExactObject(manifest.source, expectedSource, 'V5.2 source binding');
  if (!jsonEqual(manifest.sourceTopology?.userParts, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
      || !jsonEqual(manifest.sourceTopology?.internalPartsExcluded, ['J', 'K', 'L'])) {
    fail('V5.2 source topology must expose only user parts A-I and exclude internal parts J-L.');
  }

  const requiredFacts = [
    'exactRegisteredCompany',
    'registryCourt',
    'registryNumber',
    'registeredBusinessAddressAndContact',
    'authorizedLegalRepresentative',
    'vatIdIfIssuedOrLineRemoved',
    'economicIdentificationNumberIfIssuedOrLineRemoved',
    'editorialResponsiblePersonIfApplicableOrLineRemoved',
    'withdrawalPublicUrlOrExactInAppPlacement',
    'marketplacePspNameAddressAndTermsLink',
    'marketplacePspContractRegionAndActivationEvidence',
    'smtpProviderSeatPrivacyNoticeAndSendingRegion',
    'hostingDatabaseStorageProviderSeatAndRegion',
    'googlePlacesActivationProviderAndTransferConfiguration',
    'mapsProviderDpaRegionAndTransferEvidence',
    'firebaseAuthenticationContractEntityDpaRegionAndTransferEvidence',
    'firebaseCloudMessagingContractEntityDpaRegionTransferAndRetentionEvidence',
    'firebaseCrashlyticsContractEntityDpaRegionTransferAndRetentionEvidence',
    'privacySupervisoryAuthorityConfirmedAgainstRegisteredSeat',
    'dsaContactPointOperationalEvidence',
    'publicLegalUrlsAndDownloadDelivery',
  ];
  if (!Array.isArray(manifest.openFacts)
      || new Set(manifest.openFacts).size !== manifest.openFacts.length
      || requiredFacts.some((key) => !manifest.openFacts.includes(key))) {
    fail('V5.2 legal manifest hides a mandatory open operator, provider, or publication fact.');
  }

  const push = manifest.productDecisions?.firebaseCloudMessaging;
  const crash = manifest.productDecisions?.firebaseCrashlytics;
  const optionalServices = manifest.productDecisions?.adsMarketingAnalyticsAndExternalGenAi;
  if (push?.decision !== 'retained-transactional-only'
      || push.defaultEnabled !== false
      || push.devicePermissionRequired !== true
      || push.marketingPushAllowed !== false
      || push.shortestEventRelatedTtlRequired !== true
      || push.independentFromCrashlytics !== true
      || crash?.decision !== 'retained-voluntary'
      || crash.defaultEnabled !== false
      || crash.requiresSeparateVoluntaryOptIn !== true
      || crash.independentFromPush !== true
      || crash.userIdAllowed !== false
      || optionalServices?.decision !== 'disabled-unless-separately-approved') {
    fail('V5.2 legal manifest must preserve the fail-closed Push, Crashlytics, analytics, and external-AI decisions.');
  }
  if (manifest.legalReview?.status !== 'not-professionally-reviewed'
      || manifest.legalReview.professionalApprovalClaimAllowed !== false
      || manifest.legalReview.preLaunchReviewRequiredBySource !== false
      || manifest.legalReview.futureTriggerImplementationStatus !== 'open-c1h'
      || manifest.legalReview.sourceDisclosure !== 'Entschiedene Launchfassung - keine anwaltliche Freigabe') {
    fail('V5.2 legal manifest must preserve the disclosed review status and later internal trigger.');
  }
  if (manifest.boundaries?.containsLivePlaceholders !== true
      || manifest.boundaries?.sourcePartsJToLInternalOnly !== true
      || manifest.boundaries?.databaseProvisioned !== false
      || manifest.boundaries?.publiclyPublished !== false
      || manifest.boundaries?.storeActivated !== false
      || manifest.boundaries?.realPaymentsEnabled !== false) {
    fail('V5.2 legal draft boundaries are not fail-closed.');
  }

  if (!Array.isArray(manifest.documents)
      || manifest.documents.length !== expectedDocuments.length) {
    fail('V5.2 legal manifest must bind exactly nine user documents for parts A-I.');
  }

  for (const [index, expected] of expectedDocuments.entries()) {
    const document = manifest.documents[index];
    const expectedPath = `assets/legal/de/v52/${expected.file}`;
    if (document?.part !== expected.part
        || document.type !== expected.type
        || document.path !== expectedPath
        || document.title !== expected.title
        || document.version !== expectedVersion
        || document.contractRole !== expected.contractRole
        || !jsonEqual(document.sourcePages, expected.pages)
        || document.status !== 'draft-blocked'
        || document.publicUrl !== null
        || document.downloadUrl !== null) {
      fail(`Invalid V5.2 legal document entry for part ${expected.part}.`);
    }

    const content = readFileSync(resolve(documentRoot, expected.file));
    if (sha256(content) !== document.sha256) {
      fail(`V5.2 legal asset hash drift: ${expected.file}`);
    }
    const text = content.toString('utf8');
    const normalizedText = text.replace(/\s+/gu, ' ');
    for (const marker of [
      '<!doctype html>',
      '<html lang="de"',
      `data-legal-version="${expectedVersion}"`,
      `data-legal-part="${expected.part}"`,
      'data-activation-allowed="false"',
      `content="${expectedSource.sha256}"`,
      'Nicht veröffentlichen',
      expected.title,
    ]) {
      if (!text.includes(marker)) {
        fail(`V5.2 legal asset missing marker ${marker}: ${expected.file}`);
      }
    }
    for (const marker of expected.markers) {
      if (!normalizedText.includes(marker)) {
        fail(`V5.2 legal asset missing marker ${marker}: ${expected.file}`);
      }
    }
    const observedPages = [...text.matchAll(/data-source-page="(\d+)"/gu)]
      .map((match) => Number(match[1]));
    if (!jsonEqual(observedPages, expected.pages)) {
      fail(`V5.2 legal asset source-page drift: ${expected.file}`);
    }
    if (text.includes('Pflichtdaten vor Veröffentlichung einsetzen')
        || /Gründungsvorhaben ShareItToo - geplante UG \(haftungsbeschränkt\) Seite \d+/u.test(text)) {
      fail(`V5.2 legal asset retained a source header or footer: ${expected.file}`);
    }
    if (/Teil (?:J|K|L) -/u.test(text)) {
      fail(`Internal V5.2 source part leaked into user asset: ${expected.file}`);
    }
    if (/<script\b|<iframe\b|<object\b|<embed\b|<base\b|<form\b|<link\b[^>]*\bhref=|<img\b[^>]*\bsrc=|\son[a-z]+\s*=/iu.test(text)) {
      fail(`V5.2 legal asset contains executable, interactive, or remote content: ${expected.file}`);
    }
    const needsPlaceholders = ['A', 'H', 'I'].includes(expected.part);
    if (needsPlaceholders !== text.includes('[VOR LIVEGANG EINTRAGEN:')) {
      fail(`V5.2 legal placeholder topology drift: ${expected.file}`);
    }
  }

  return {
    status: manifest.status,
    documentCount: manifest.documents.length,
    sourceSha256: manifest.source.sha256,
    sourcePages: manifest.source.pages,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateV52LegalAssets({ repositoryRoot });
  process.stdout.write(
    `V5.2 legal assets valid: status=${result.status}, documents=${result.documentCount}, sourcePages=${result.sourcePages}, source=${result.sourceSha256}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'V5.2 legal asset validation failed.'}\n`);
    process.exitCode = 1;
  }
}
