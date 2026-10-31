#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n9-heilbronn-wave0-preparation-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N9 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N9 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN9HeilbronnWave0({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'implemented-targeted-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n10',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n9-heilbronn-wave0-preparation'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== '9ba15e519edf1fdec01e4bdf74a94c9c03bd0ea8') {
    fail('N9 evidence identity is invalid.');
  }
  if (!exact(value.wave, {
    pilotId: 'heilbronn_wave0',
    nature: ['CLOSED', 'INVITED', 'NON-BINDING', 'ANDROID-FIRST', 'NO-REAL-MONEY', 'PRODUCT-AND-PROCESS-PILOT'],
    plannedAdultParticipantCount: 3,
    plannedListingMinimum: 9,
    plannedListingMaximum: 15,
    plannedListingsPerParticipantMinimum: 3,
    plannedListingsPerParticipantMaximum: 5,
    activated: false,
    testerRosterStoredInGit: false,
    spiegelbergChanged: false,
  })) fail('N9 Wave-0 scope is invalid.');
  if (!exact(value.preparedArtifacts, {
    runbook: 'docs/operations/BLUE_OCEAN_HEILBRONN_WAVE0_RUNBOOK.md',
    feedbackForm: 'docs/templates/BLUE_OCEAN_HEILBRONN_WAVE0_FEEDBACK_FORM.md',
    evaluationSheet: 'docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv',
    safePhotoInstructions: 'complete',
    aiDisclosureAndConsent: 'complete',
    meetingPointLabels: ['Pilot Treffpunkt A', 'Pilot Treffpunkt B', 'Pilot Treffpunkt C'],
    pauseAbortProcedure: 'complete',
    uiNonBindingNoMoneyNotice: 'complete',
    operatorConfigChecker: 'tool/check_stage_a_operator_config.mjs',
  })) fail('N9 prepared artifact map is invalid.');
  if (!exact(value.operatorConfig, {
    requiredFields: ['SIT_OPERATOR_LEGAL_NAME', 'SIT_OPERATOR_POSTAL_ADDRESS', 'SIT_OPERATOR_CONTACT_EMAIL'],
    currentRepositoryEvidenceState: 'facts-open',
    valuesStoredInRepository: false,
    factsAloneActivatePilot: false,
  })) fail('N9 operator configuration boundary is invalid.');
  if (!exact(value.remainingActivationGates, [
    'HEILBRONN_WAVE0_ACTIVATION_GO',
    'exact-signed-android-internal-candidate-owner-approved',
    'operator-config-complete-outside-repository',
    'three-adult-roster-and-consent-outside-repository',
    'exact-candidate-privacy-export-erasure-retention-revalidation',
    'external-ai-provider-budget-approval-or-explicit-manual-mock-limitation',
    'physical-safety-pause-abort-and-owner-support-acknowledgement',
  ])) fail('N9 activation gates are invalid.');
  if (!Object.values(value.initialServiceState ?? {}).every((state) => state === 'off')) {
    fail('N9 initial services must remain off.');
  }
  if (!exact(value.boundaries, {
    humanPilotActivated: false,
    realTesterEnrolled: false,
    realPersonDataStored: false,
    externalProviderCallPerformed: false,
    paidCallPerformed: false,
    billingActivated: false,
    realMoneyEnabled: false,
    playConsoleChanged: false,
    storeUploadPerformed: false,
    firebaseChanged: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    historyRewritten: false,
  })) fail('N9 mutation boundary is invalid.');
  const fullPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === 'verified-ready-for-n10';
  if (!exact(value.targetedVerification, {
    operatorConfigDomainTests: 'passed-6',
    operatorConfigHelperTests: 'passed-2',
    wave0WiringTests: 'passed-4',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) fail('N9 verification record is invalid for its status.');
  if (value.nextPackage !== 'N10') fail('N9 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N9 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N9 cannot bind exact GitHub verification before CI is complete.');
  }

  const runbook = source(repositoryRoot, value.preparedArtifacts.runbook);
  requireMarkers(runbook, value.preparedArtifacts.runbook, [
    'PREPARED — NOT ACTIVATED', '`heilbronn_wave0`', 'Three invited adults',
    'nine to fifteen listings total', 'SIT_OPERATOR_LEGAL_NAME',
    'Pilot Treffpunkt A', 'Pilot Treffpunkt B', 'Pilot Treffpunkt C',
    'HEILBRONN_WAVE0_ACTIVATION_GO', 'does not authorize activation',
  ]);
  const feedback = source(repositoryRoot, value.preparedArtifacts.feedbackForm);
  requireMarkers(feedback, value.preparedArtifacts.feedbackForm, [
    'BLANK TEMPLATE', 'HW0-A | HW0-B | HW0-C', 'Unsupported claim observed',
    'Support needed', 'abort-wave',
  ]);
  const evaluation = source(repositoryRoot, value.preparedArtifacts.evaluationSheet).trim();
  const rows = evaluation.split('\n').map((row) => row.split(','));
  if (rows.length !== 2 || rows[0].length !== rows[1].length
      || rows[1][1] !== 'BLUE_OCEAN' || rows[1][2] !== '3'
      || rows[1][3] !== '9' || rows[1][4] !== '15'
      || rows[1].at(-1) !== 'BLANK_TEMPLATE_NOT_OBSERVED_HUMAN_RESULTS') {
    fail('N9 evaluation sheet is not an exact blank aggregate template.');
  }
  const operator = source(repositoryRoot, 'backend/src/stage_a_operator_config.js');
  requireMarkers(operator, 'backend/src/stage_a_operator_config.js', [
    'SIT_OPERATOR_LEGAL_NAME', 'SIT_OPERATOR_POSTAL_ADDRESS',
    'SIT_OPERATOR_CONTACT_EMAIL', 'activationAllowed: false', 'containsValues: false',
  ]);
  const config = source(repositoryRoot, 'lib/config/private_pilot_config.dart');
  const screen = source(repositoryRoot, 'lib/screens/create_listing_screen.dart');
  requireMarkers(config, 'lib/config/private_pilot_config.dart', [
    'Pilot-Simulation', 'keine verbindliche SIT-Miete', 'keine echten Zahlungen',
    'Erstattungen oder Auszahlungen', 'Nichts ist öffentlich',
  ]);
  requireMarkers(screen, 'lib/screens/create_listing_screen.dart', [
    'PrivatePilotConfig.blueOceanStageANonBindingNotice',
  ]);
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('N9 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    pilotId: value.wave.pilotId,
    plannedParticipants: value.wave.plannedAdultParticipantCount,
    plannedListingRange: `${value.wave.plannedListingMinimum}-${value.wave.plannedListingMaximum}`,
    activated: value.wave.activated,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateBlueOceanN9HeilbronnWave0();
  process.stdout.write(
    `Blue Ocean N9 Wave 0 valid: pilot=${result.pilotId}, participants=${result.plannedParticipants}, listings=${result.plannedListingRange}, activated=${result.activated}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
