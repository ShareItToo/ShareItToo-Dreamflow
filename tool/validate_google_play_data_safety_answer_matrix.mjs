#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const matrixPath =
  'docs/evidence/b11/google-play-data-safety-answer-matrix-2026081505-20260815.json';
const privacyPath = 'store/privacy-disclosures.json';
const expectedEvidenceRefs = [
  privacyPath,
  'docs/evidence/b11/android-binary-privacy-release-check-2026081505.json',
  'docs/evidence/b11/google-play-data-safety-step2-20260812.json',
  'docs/evidence/b11/google-play-data-safety-datatypes-20260812.json',
  'docs/evidence/b11/privacy-provider-retention-sources-20260812.json',
  'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json',
];
const expectedGuidance = [
  'https://support.google.com/googleplay/android-developer/answer/10787469?hl=en',
  'https://firebase.google.com/docs/android/play-data-disclosure',
  'https://support.google.com/googleplay/android-developer/answer/13327111?hl=en',
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
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} must contain exactly the approved keys.`);
  }
}

function load(root, path, overrides) {
  return Object.hasOwn(overrides, path)
    ? overrides[path]
    : JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

export function validateGooglePlayDataSafetyAnswerMatrix({
  root,
  matrix: matrixOverride,
  privacy: privacyOverride,
  allowCandidateRollover = false,
} = {}) {
  const repositoryRoot = root ?? resolve(fileURLToPath(new URL('..', import.meta.url)));
  const overrides = {};
  if (matrixOverride) overrides[matrixPath] = matrixOverride;
  if (privacyOverride) overrides[privacyPath] = privacyOverride;
  const matrix = object(load(repositoryRoot, matrixPath, overrides), 'matrix');
  const privacy = object(load(repositoryRoot, privacyPath, overrides), 'privacy');

  if (matrix.schemaVersion !== 1
      || matrix.kind !== 'google-play-data-safety-answer-matrix'
      || matrix.status !== 'all-data-type-answers-prepared-console-save-blocked') {
    fail('Data Safety matrix must remain a prepared, unsaved answer set.');
  }
  const encoded = JSON.stringify(matrix);
  if (/@/.test(encoded)
      || matrix.boundaries?.containsSecrets !== false
      || matrix.boundaries?.containsEmailAddresses !== false
      || matrix.boundaries?.containsAccountIdentifiers !== false) {
    fail('Data Safety matrix must remain sanitized.');
  }

  const candidate = object(matrix.candidate, 'candidate');
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
    fail('Data Safety matrix is not bound to the reviewed internal candidate.');
  }

  const baseline = object(matrix.consoleBaseline, 'consoleBaseline');
  if (baseline.collectsOrSharesRequiredDataSaved !== true
      || baseline.encryptedInTransitSaved !== true
      || JSON.stringify(baseline.accountCreationMethodsSaved) !== JSON.stringify(['username-and-password'])
      || baseline.deleteAccountUrlSaved !== false
      || baseline.partialDataDeletionAnswerSaved !== false
      || baseline.dataTypeAnswersSaved !== false) {
    fail('Console baseline must not claim unsaved Data Safety work.');
  }

  const globals = object(matrix.preparedGlobalAnswers, 'preparedGlobalAnswers');
  if (globals.collectsOrTransmitsUserData !== true
      || globals.encryptedInTransit !== true
      || globals.sellsData !== false
      || globals.advertisingOrCrossAppTracking !== false
      || globals.dataSharingOverall !== 'pending-service-provider-contract-classification'
      || globals.preparedDeleteAccountUrl !== 'https://shareittoo.com/account-deletion'
      || globals.preparedPartialDataDeletionAnswer !== false
      || globals.oauthAccountCreationPreparedButUnavailable !== true) {
    fail('Prepared global answers no longer match the fail-closed product truth.');
  }

  if (!Array.isArray(matrix.dataTypes)
      || !Array.isArray(privacy.dataTypes)
      || matrix.dataTypes.length !== privacy.dataTypes.length
      || matrix.dataTypes.length !== 18) {
    fail('Data Safety matrix must evaluate all 18 reviewed data types exactly once.');
  }
  const matrixById = new Map(matrix.dataTypes.map((entry) => [entry?.id, entry]));
  if (matrixById.size !== matrix.dataTypes.length) fail('Data Safety matrix contains duplicate data types.');
  for (const reviewed of privacy.dataTypes) {
    const answer = object(matrixById.get(reviewed.id), `dataTypes.${reviewed.id}`);
    exactKeys(answer, [
      'id', 'google', 'selected', 'collected', 'shared', 'ephemeral', 'required', 'purposes',
    ], `dataTypes.${reviewed.id}`);
    if (answer.google !== reviewed.google
        || answer.collected !== reviewed.collected
        || answer.selected !== reviewed.collected
        || answer.required !== !reviewed.optional
        || answer.ephemeral !== false
        || JSON.stringify(answer.purposes) !== JSON.stringify(reviewed.collected ? reviewed.purposes : [])) {
      fail(`Data Safety answer drifted from the reviewed disclosure: ${reviewed.id}.`);
    }
    const expectedSharing = reviewed.collected
      ? 'pending-service-provider-contract-classification'
      : 'not-applicable-not-collected';
    if (answer.shared !== expectedSharing) {
      fail(`Data Safety sharing must remain unresolved until provider classification: ${reviewed.id}.`);
    }
  }
  const selected = matrix.dataTypes.filter((entry) => entry.selected);
  if (selected.length !== 17 || selected.some((entry) => !entry.collected)) {
    fail('Exactly 17 collected data types must remain selected.');
  }

  if (!Array.isArray(matrix.officialGuidance)
      || JSON.stringify(matrix.officialGuidance.map((entry) => entry?.url)) !== JSON.stringify(expectedGuidance)
      || matrix.officialGuidance.some((entry) => typeof entry.finding !== 'string' || entry.finding.length < 40)) {
    fail('Data Safety matrix must retain all reviewed official guidance.');
  }
  if (JSON.stringify(matrix.evidenceRefs) !== JSON.stringify(expectedEvidenceRefs)) {
    fail('Data Safety evidence references are incomplete or out of order.');
  }
  for (const ref of matrix.evidenceRefs) readFileSync(resolve(repositoryRoot, ref));

  const gates = object(matrix.blockingGates, 'blockingGates');
  exactKeys(gates, [
    'serviceProviderContractClassificationComplete',
    'retentionAndDeletionScheduleApproved',
    'publicAccountDeletionRouteOperationalAndApproved',
    'legalApproval',
    'consoleDraftSaveAllowed',
    'submissionAllowed',
  ], 'blockingGates');
  if (Object.values(gates).some((value) => value !== false)) {
    fail('Every legal, provider, public-route, save, and submission gate must remain closed.');
  }
  const sharingClassification = object(
    load(repositoryRoot,
      'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json',
      overrides),
    'sharingClassification',
  );
  if (sharingClassification.status !==
        'technical-provider-roles-classified-owner-contract-and-legal-approval-open'
      || sharingClassification.technicalConclusion?.classificationResearchComplete !== true
      || sharingClassification.technicalConclusion?.preparedOverallSharingAnswer !==
        'no-subject-to-owner-contract-acceptance-and-legal-approval'
      || sharingClassification.technicalConclusion?.consoleAnswerAllowed !== false
      || sharingClassification.blockingGates?.currentAccountContractAcceptanceConfirmed !== false
      || sharingClassification.blockingGates?.legalApproval !== false) {
    fail('Data Safety matrix must bind the complete but unapproved provider classification.');
  }
  const boundaries = object(matrix.boundaries, 'boundaries');
  for (const value of Object.values(boundaries)) {
    if (value !== false) fail('Data Safety preparation must not mutate console, routes, or production.');
  }

  return {
    evaluated: matrix.dataTypes.length,
    selected: selected.length,
    consoleSaved: baseline.dataTypeAnswersSaved,
    submissionAllowed: gates.submissionAllowed,
  };
}

function runCli() {
  const allowCandidateRollover = process.argv.includes('--allow-candidate-rollover');
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--allow-candidate-rollover');
  if (unknownArgs.length > 0) fail(`Unknown argument: ${unknownArgs[0]}`);
  const result = validateGooglePlayDataSafetyAnswerMatrix({ allowCandidateRollover });
  process.stdout.write(
    `Google Play Data Safety answer matrix: PASS (${result.selected}/${result.evaluated} selected, unsaved)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Google Play Data Safety answer matrix failed.'}\n`);
    process.exitCode = 1;
  }
}
