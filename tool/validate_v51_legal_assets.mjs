#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedSourceHash = '587bfd9e53539e5895c3d9dcb6fc437e0bf7c6e91db144841d0fe986b274b3fc';
const expectedFiles = [
  'cancellation_v5.html',
  'community_moderation_v5.html',
  'imprint_v5.html',
  'platform_terms_v5.html',
  'privacy_v5.html',
  'private_rental_terms_v5.html',
  'withdrawal_v5.html',
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateV51LegalAssets({ repositoryRoot }) {
  const assetRoot = resolve(repositoryRoot, 'assets/legal/de');
  const manifest = JSON.parse(
    readFileSync(resolve(assetRoot, 'legal_manifest_v5.json'), 'utf8'),
  );
  if (manifest.schemaVersion !== 1
      || manifest.version !== 'V5.1-2026-08-16'
      || manifest.status !== 'draft-blocked'
      || manifest.activationAllowed !== false
      || manifest.productionProvisioningAllowed !== false
      || manifest.effectiveDate !== null) {
    fail('V5.1 legal manifest must remain an inactive draft while facts are open.');
  }
  if (manifest.source?.sha256 !== expectedSourceHash || manifest.source?.pages !== 54) {
    fail('V5.1 legal assets are not bound to the reviewed 54-page source PDF.');
  }
  const requiredFacts = [
    'exactRegisteredCompany',
    'registryCourt',
    'registryNumber',
    'withdrawalPublicUrl',
    'hostingProviderAndRegion',
    'smtpProviderAndRegion',
    'mapsProviderAndRegion',
    'licensedMarketplacePspContractAndRegion',
    'firebasePushAndCrashProviderTransferEvidence',
  ];
  if (!Array.isArray(manifest.openFacts)
      || requiredFacts.some((key) => !manifest.openFacts.includes(key))) {
    fail('V5.1 legal manifest hides a mandatory open operator or provider fact.');
  }
  const push = manifest.productDecisions?.firebaseCloudMessaging;
  const crash = manifest.productDecisions?.firebaseCrashlytics;
  const optionalServices = manifest.productDecisions?.adsMarketingAnalyticsAndExternalGenAi;
  if (push?.decision !== 'retained'
      || push.defaultEnabled !== false
      || push.requiresSeparateVoluntaryOptIn !== true
      || push.independentFromCrashlytics !== true
      || crash?.decision !== 'retained'
      || crash.defaultEnabled !== false
      || crash.requiresSeparateVoluntaryOptIn !== true
      || crash.independentFromPush !== true
      || optionalServices?.decision !== 'disabled-unless-separately-approved') {
    fail('V5.1 legal manifest must preserve the approved independent Push and Crashlytics decision.');
  }
  const firebaseConflict = manifest.knownConflicts?.find(
    (entry) => entry?.id === 'firebase-push-crash-retained-after-v51-source',
  );
  if (firebaseConflict?.status !== 'source-superseded-activation-blocked'
      || firebaseConflict.successorDecisionDate !== '2026-08-17'
      || firebaseConflict.successorDecisionPath !== 'assets/legal/de/privacy_v5.html'
      || !firebaseConflict.sourcePages?.includes(38)) {
    fail('V5.1 source supersession for retained Push and Crashlytics must remain explicit and activation-blocking.');
  }
  if (manifest.boundaries?.containsLivePlaceholders !== true
      || manifest.boundaries?.databaseProvisioned !== false
      || manifest.boundaries?.publiclyPublished !== false
      || manifest.boundaries?.storeActivated !== false
      || manifest.boundaries?.realPaymentsEnabled !== false) {
    fail('V5.1 legal draft boundaries are not fail-closed.');
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length !== expectedFiles.length) {
    fail('V5.1 legal manifest must bind all seven required documents.');
  }
  const observedFiles = [];
  for (const document of manifest.documents) {
    const file = document.path?.replace('assets/legal/de/', '');
    if (!expectedFiles.includes(file)
        || document.version !== manifest.version
        || document.status !== 'draft-blocked'
        || document.publicUrl !== null
        || document.downloadUrl !== null
        || !Array.isArray(document.sourcePages)
        || document.sourcePages.length === 0) {
      fail(`Invalid V5.1 legal document entry: ${file ?? 'unknown'}`);
    }
    const content = readFileSync(resolve(assetRoot, file));
    if (sha256(content) !== document.sha256) {
      fail(`V5.1 legal asset hash drift: ${file}`);
    }
    const text = content.toString('utf8');
    for (const marker of [
      '<!doctype html>',
      'data-legal-version="V5.1-2026-08-16"',
      'data-activation-allowed="false"',
      `content="${expectedSourceHash}"`,
      'Nicht veröffentlichen',
    ]) {
      if (!text.includes(marker)) fail(`V5.1 legal asset missing marker ${marker}: ${file}`);
    }
    if (/<script\b|<iframe\b|<object\b|<link\b[^>]*\bhref=|<img\b[^>]*\bsrc=/iu.test(text)) {
      fail(`V5.1 legal asset contains executable or remote content: ${file}`);
    }
    observedFiles.push(file);
  }
  if (JSON.stringify(observedFiles.sort()) !== JSON.stringify([...expectedFiles].sort())) {
    fail('V5.1 legal asset set is incomplete.');
  }
  const platform = readFileSync(resolve(assetRoot, 'platform_terms_v5.html'), 'utf8');
  const normalizedPlatform = platform.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
  for (const marker of [
    'Teil A - Plattform-Nutzungsbedingungen',
    'Teil E - Zahlungs- und Auszahlungsbedingungen',
    'Teil F - Community-, Sicherheits- und Verbotsregeln',
    'Teil G - Melde-, Moderations- und Überprüfungsverfahren',
  ]) {
    if (!normalizedPlatform.includes(marker)) fail(`Platform terms missing ${marker}.`);
  }
  const rental = readFileSync(resolve(assetRoot, 'private_rental_terms_v5.html'), 'utf8');
  const normalizedRental = rental.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
  for (const marker of [
    'Teil B - Privat-Mietbedingungen zwischen Nutzern',
    'Teil C - Storno-, No-Show- und Refund-Regelwerk',
    'Teil D - Übergabe-, Rückgabe- und Schadenregeln',
    'Keine Kaution, Versicherung oder Schadengarantie',
  ]) {
    if (!normalizedRental.includes(marker)) fail(`Private rental terms missing ${marker}.`);
  }
  const privacy = readFileSync(resolve(assetRoot, 'privacy_v5.html'), 'utf8');
  for (const marker of [
    'data-successor-decision="2026-08-17"',
    'data-supersedes-source-page="38"',
    'Die Aktivierung von Push aktiviert Crashlytics nicht.',
    'Werbung, Marketingtracking, allgemeine Analytics und externe generative KI',
    'Der Nachtrag ist keine Live- oder Datenschutzfreigabe.',
  ]) {
    if (!privacy.includes(marker)) {
      fail(`V5.1 privacy asset missing retained Push/Crash successor decision marker ${marker}.`);
    }
  }
  return {
    status: manifest.status,
    documentCount: manifest.documents.length,
    sourceSha256: manifest.source.sha256,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateV51LegalAssets({ repositoryRoot });
  process.stdout.write(
    `V5.1 legal assets valid: status=${result.status}, documents=${result.documentCount}, source=${result.sourceSha256}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'V5.1 legal asset validation failed.'}\n`);
    process.exitCode = 1;
  }
}
