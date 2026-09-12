#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const classificationPath =
  'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json';
const privacyPath = 'store/privacy-disclosures.json';
const requiredServiceIds = [
  'hostingerVps',
  'firebaseCloudMessaging',
  'firebaseCrashlytics',
  'firebaseAuthentication',
  'googleWorkspaceSmtpRelay',
  'googleMapsPlatform',
  'stripe',
  'openAiHelpers',
];
const requiredActiveProcessors = [
  'hostingerVps',
  'firebaseCloudMessaging',
  'firebaseCrashlytics',
  'firebaseAuthentication',
  'googleWorkspaceSmtpRelay',
];

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    fail(`${label} must contain exactly the approved keys.`);
  }
}

function load(root, path, overrides) {
  return Object.hasOwn(overrides, path)
    ? overrides[path]
    : JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

export function validateGooglePlayServiceProviderSharingClassification({
  root,
  classification: classificationOverride,
  privacy: privacyOverride,
  allowCandidateRollover = false,
} = {}) {
  const repositoryRoot = root ?? resolve(fileURLToPath(new URL('..', import.meta.url)));
  const overrides = {};
  if (classificationOverride) overrides[classificationPath] = classificationOverride;
  if (privacyOverride) overrides[privacyPath] = privacyOverride;
  const classification = object(
    load(repositoryRoot, classificationPath, overrides),
    'classification',
  );
  const privacy = object(load(repositoryRoot, privacyPath, overrides), 'privacy');

  if (classification.schemaVersion !== 1
      || classification.kind !== 'google-play-service-provider-sharing-classification'
      || classification.status !==
        'technical-provider-roles-classified-owner-contract-and-legal-approval-open') {
    fail('Provider sharing classification must remain technically complete but legally unapproved.');
  }
  const encoded = JSON.stringify(classification);
  if (/@/.test(encoded)
      || classification.boundaries?.containsSecrets !== false
      || classification.boundaries?.containsEmailAddresses !== false
      || classification.boundaries?.containsAccountIdentifiers !== false) {
    fail('Provider sharing classification must remain sanitized.');
  }

  const candidate = object(classification.candidate, 'candidate');
  const expectedCandidate = object(privacy.candidate, 'privacy candidate');
  const candidateBuildNumber = String(candidate.buildNumber ?? '');
  const expectedBuildNumber = String(expectedCandidate.buildNumber ?? '');
  const buildNumbersValid = /^\d+$/.test(candidateBuildNumber) && /^\d+$/.test(expectedBuildNumber);
  const buildBindingValid = allowCandidateRollover
    ? buildNumbersValid && BigInt(candidateBuildNumber) <= BigInt(expectedBuildNumber)
    : candidate.buildNumber === expectedCandidate.buildNumber;
  if (candidate.applicationId !== expectedCandidate.applicationId
      || candidate.versionName !== expectedCandidate.versionName
      || !buildBindingValid
      || (!allowCandidateRollover && candidate.commit !== expectedCandidate.commit)
      || candidate.releaseChannel !== 'internal'
      || candidate.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1') {
    fail('Provider sharing classification is not bound to the exact candidate.');
  }
  if (classification.playRule?.url !==
        'https://support.google.com/googleplay/android-developer/answer/10787469?hl=en'
      || typeof classification.playRule?.technicalConclusion !== 'string'
      || classification.playRule.technicalConclusion.length < 100) {
    fail('Provider classification must retain the official Google Play rule.');
  }

  if (!Array.isArray(classification.services)
      || classification.services.map((entry) => entry?.id).join(',') !== requiredServiceIds.join(',')) {
    fail('Provider classification must inventory every active, disabled, and future service exactly once.');
  }
  const byId = new Map(classification.services.map((entry) => [entry.id, object(entry, entry.id)]));
  for (const processorId of requiredActiveProcessors.filter(
    (id) => id !== 'firebaseAuthentication',
  )) {
    const service = byId.get(processorId);
    if (service.technicalRole !== 'processor'
        || !service.candidateState.startsWith('active')
        || !Array.isArray(service.actualCandidateTransfers)
        || service.actualCandidateTransfers.length === 0
        || service.playTechnicalRecommendation !==
          'service-provider-sharing-exception-supported-subject-to-account-contract-and-legal-confirmation'
        || typeof service.officialContractUrl !== 'string'
        || typeof service.officialFinding !== 'string'
        || service.officialFinding.length < 80) {
      fail(`${processorId} must remain an evidence-backed active processor recommendation.`);
    }
  }
  const maps = byId.get('googleMapsPlatform');
  if (maps.technicalRole !== 'independent-controller-if-activated'
      || privacy.externalServices?.googleMapsPlatform?.role !==
        'independent-controller-if-activated'
      || privacy.externalServices?.googleMapsPlatform?.activeTransferProven !== false
      || maps.actualCandidateTransfers.length !== 0
      || maps.potentialTransfersIfActivated.length !== 3
      || maps.playDataTypes.length !== 0
      || !maps.playTechnicalRecommendation.includes('reclassification-required-before-release')) {
    fail('Google Maps must remain inactive/unproven and fail closed before activation.');
  }
  const social = byId.get('firebaseAuthentication');
  if (social.candidateState !== 'phone-active-staging-social-provider-login-disabled'
      || social.technicalRole !==
        'processor-for-firebase-authentication-phone-active-separate-social-provider-role-review-if-enabled'
      || privacy.externalServices?.firebaseAuthentication?.enabledInBoundEnvironment !== true
      || social.actualCandidateTransfers.length !== 3
      || social.playDataTypes.join(',') !== 'phoneNumber,userId,deviceOrOtherIds'
      || !social.playTechnicalRecommendation.includes('active-processor-transfer')) {
    fail('Firebase Authentication must classify active phone verification while social login remains disabled.');
  }
  for (const disabledId of ['stripe', 'openAiHelpers']) {
    const service = byId.get(disabledId);
    if (!service.candidateState.startsWith('disabled')
        || service.actualCandidateTransfers.length !== 0
        || service.playDataTypes.length !== 0
        || !service.playTechnicalRecommendation.includes('not-applicable-to-bound-candidate')) {
      fail(`${disabledId} must remain excluded from the bound candidate.`);
    }
  }

  const conclusion = object(classification.technicalConclusion, 'technicalConclusion');
  if (conclusion.classificationResearchComplete !== true
      || conclusion.activeIndependentControllerTransferProven !== false
      || JSON.stringify(conclusion.activeProcessorServices) !== JSON.stringify(requiredActiveProcessors)
      || conclusion.preparedOverallSharingAnswer !==
        'no-subject-to-owner-contract-acceptance-and-legal-approval'
      || conclusion.consoleAnswerAllowed !== false) {
    fail('Technical conclusion must prepare but never authorize the final Play answer.');
  }

  const gates = object(classification.blockingGates, 'blockingGates');
  exactKeys(gates, [
    'currentAccountContractAcceptanceConfirmed',
    'ownerProviderRoleConfirmation',
    'legalApproval',
    'retentionAndDeletionScheduleApproved',
    'googleMapsActivationAllowed',
    'consoleDraftSaveAllowed',
    'submissionAllowed',
  ], 'blockingGates');
  if (Object.values(gates).some((value) => value !== false)) {
    fail('Every owner, contract, legal, map, save, and submission gate must remain closed.');
  }
  for (const ref of classification.evidenceRefs ?? []) readFileSync(resolve(repositoryRoot, ref));
  if (classification.evidenceRefs?.length !== 5) fail('Provider evidence references are incomplete.');
  const boundaries = object(classification.boundaries, 'boundaries');
  if (boundaries.technicalClassificationOnly !== true
      || Object.entries(boundaries).some(([key, value]) => (
        key !== 'technicalClassificationOnly' && value !== false
      ))) {
    fail('Provider classification must not claim legal, console, map, or production authority.');
  }

  return {
    services: classification.services.length,
    activeProcessors: conclusion.activeProcessorServices.length,
    preparedOverallSharingAnswer: conclusion.preparedOverallSharingAnswer,
    consoleAnswerAllowed: conclusion.consoleAnswerAllowed,
  };
}

function runCli() {
  const allowCandidateRollover = process.argv.includes('--allow-candidate-rollover');
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--allow-candidate-rollover');
  if (unknownArgs.length > 0) fail(`Unknown argument: ${unknownArgs[0]}`);
  const result = validateGooglePlayServiceProviderSharingClassification({ allowCandidateRollover });
  process.stdout.write(
    `Google Play provider sharing classification: PASS (${result.activeProcessors} active processors, console blocked)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Provider sharing classification failed.'}\n`);
    process.exitCode = 1;
  }
}
