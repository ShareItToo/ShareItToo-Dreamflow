#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/48h-remote/r14-heilbronn-wave0-operations-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R14 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R14 marker missing in ${path}: ${marker}`);
  }
}

export function validateR14HeilbronnWave0Operations({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed-ready-for-r15',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r14-heilbronn-wave0-operations'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== 'a8eb996db3056053a2201e652e8c1c24d9524a03') {
    fail('R14 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'N9',
    evidence: 'docs/evidence/blue-ocean/n9-heilbronn-wave0-preparation-20260824.json',
    status: 'verified-ready-for-n10',
    verifiedHead: 'b606e2864b6ab429a9dd64c04280968720454581',
    scopeChanged: false,
  })) fail('R14 predecessor binding is invalid.');
  if (!exact(value.preparedArtifacts, {
    operations: 'docs/operations/48H_R14_HEILBRONN_WAVE0_OPERATIONS_2026-08-24.md',
    n9Runbook: 'docs/operations/BLUE_OCEAN_HEILBRONN_WAVE0_RUNBOOK.md',
    threeTesterScript: 'docs/templates/48H_R14_3_TESTER_WAVE0_SCRIPT_DE.md',
    safePhotoOnePager: 'docs/templates/48H_R14_SAFE_LISTING_PHOTOS_ONE_PAGER_DE.md',
    testerInstructions: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTER_INSTRUCTIONS.md',
    feedbackForm: 'docs/templates/BLUE_OCEAN_HEILBRONN_WAVE0_FEEDBACK_FORM.md',
    aggregateEvaluationSheet: 'docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv',
  })) fail('R14 artifact map is invalid.');

  const expectedTaskIds = [
    'HW0-A1', 'HW0-A2', 'HW0-A3', 'HW0-A4', 'HW0-A5',
    'HW0-B1', 'HW0-B2', 'HW0-B3', 'HW0-B4', 'HW0-B5',
    'HW0-C1', 'HW0-C2', 'HW0-C3', 'HW0-C4', 'HW0-C5',
  ];
  if (!exact(value.testerPlan, {
    opaqueSlots: ['HW0-A', 'HW0-B', 'HW0-C'],
    realTesterIdentityStored: false,
    requiredTasksPerSlot: 3,
    optionalTasksPerSlot: 2,
    minimumTotalTasks: 9,
    maximumTotalTasks: 15,
    taskIds: expectedTaskIds,
    meetingPointLabels: ['Pilot Treffpunkt A', 'Pilot Treffpunkt B', 'Pilot Treffpunkt C'],
    physicalMeetingAuthorized: false,
  })) fail('R14 three-tester plan is invalid.');
  if (!exact(value.participantMaterials, {
    safePhotographyOnePager: 'complete',
    aiDisclosureCopy: 'complete',
    pilotNonBindingNoMoneyCopy: 'complete',
    exactTaskSequence: 'complete-10-steps',
    severityGuide: ['P0', 'P1', 'P2', 'P3'],
    postTaskQuestionCount: 9,
    blueOceanValueQuestionCount: 5,
    freeTextStoredInGit: false,
    rawPhotosOrModelOutputStoredInGit: false,
  })) fail('R14 participant-material contract is invalid.');
  if (!exact(value.activationState, {
    humanPilotActivated: false,
    testerInvitedOrEnrolled: false,
    playInternalCandidateApproved: false,
    externalAiProviderApproved: false,
    manualMockFallbackOnlyUntilProviderGate: true,
    operatorPrivacyRetentionGatesSatisfiedByR14: false,
    ownerActivationGateSatisfiedByR14: false,
  })) fail('R14 activation boundary is invalid.');
  if (!exact(value.boundaries, {
    realPersonDataStored: false,
    realTesterContacted: false,
    realPhotoCollected: false,
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
  })) fail('R14 live boundary is invalid.');
  if (value.next48hPackage !== 'R15') fail('R14 next package is invalid.');

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.focusedVerification, {
    n9WiringTests: 'passed-4',
    n9ArtifactValidatorTests: 'passed-7',
    n9ArtifactValidator: 'passed',
    r14ArtifactValidatorTests: 'passed-8',
    r14ArtifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-ci-metadata-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R14 verification record is invalid.');
  if (!exact(value.technicalDebtClosure, {
    finding: 'r9-postgres-pool-administrative-shutdown-unhandled',
    discoveredByRegressionRunId: 32776316335,
    failedJobId: 97588090203,
    observedPostgresCode: '57P01',
    closure: githubPassed
      ? 'verified-in-follow-up-regression'
      : 'passed-unit-and-three-fresh-local-proofs-ci-pending',
    unexpectedPoolErrorsRemainFatal: true,
    permanentTimingOrRetryWorkaroundAdded: false,
  })) fail('R14 R9 shutdown Technical Debt closure is invalid.');
  if (githubPassed) {
    const verification = value.githubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.implementationCommit ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success'
        || !Number.isSafeInteger(verification.advancedSecurityCheckId)
        || verification.advancedSecurityConclusion !== 'success'
        || verification.newAlerts !== 0) {
      fail('R14 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('R14 cannot bind GitHub verification before CI succeeds.');
  }

  const n9 = JSON.parse(source(repositoryRoot, value.predecessor.evidence));
  if (n9.status !== value.predecessor.status
      || n9.exactGitHubVerification?.headSha !== value.predecessor.verifiedHead
      || n9.wave?.activated !== false
      || n9.wave?.plannedAdultParticipantCount !== 3) {
    fail('R14 N9 source state drifted.');
  }
  const operations = source(repositoryRoot, value.preparedArtifacts.operations);
  requireMarkers(operations, value.preparedArtifacts.operations, [
    'PREPARED — NOT ACTIVATED — NO TESTER INVITED', 'Coordinator preflight',
    'Three-tester task cards', 'Exact sequence per task', 'Issue severity and action',
    'Pilot Treffpunkt A', 'Pilot Treffpunkt B', 'Pilot Treffpunkt C',
    'HEILBRONN_WAVE0_ACTIVATION_GO', 'R14 itself satisfies none of these gates',
  ]);
  const taskIds = [...operations.matchAll(/`(HW0-[ABC][1-5])`/gu)].map((match) => match[1]);
  if (!exact(taskIds, expectedTaskIds)
      || (operations.match(/\| yes \|/gu) ?? []).length !== 9
      || (operations.match(/\| optional \|/gu) ?? []).length !== 6) {
    fail('R14 task-card topology is invalid.');
  }
  const photo = source(repositoryRoot, value.preparedArtifacts.safePhotoOnePager);
  requireMarkers(photo, value.preparedArtifacts.safePhotoOnePager, [
    'PILOT NICHT AKTIVIERT', 'keine Personen', 'Standortmarkierung',
    'höchstens vier Bilder', 'Es wird nichts automatisch', 'Sofort stoppen',
  ]);
  const testerScript = source(repositoryRoot, value.preparedArtifacts.threeTesterScript);
  requireMarkers(testerScript, value.preparedArtifacts.threeTesterScript, [
    'KEINE EINLADUNG — NOCH NICHT STARTEN', '`HW0-A`', '`HW0-B`', '`HW0-C`',
    'drei sichere Gegenstände', 'ein bis vier sichere Fotos',
    'nichts automatisch', 'neun kurzen Fragen',
    'Pilot Treffpunkt A', 'Sofort stoppen und den Koordinator informieren',
  ]);
  const feedback = source(repositoryRoot, value.preparedArtifacts.feedbackForm);
  requireMarkers(feedback, value.preparedArtifacts.feedbackForm, [
    'Post-task questions', 'War die Anzeige nach den Fotos fast fertig?',
    'Musstest du viel korrigieren?', 'War die Preisempfehlung verständlich?',
    'Würdest du den vorgeschlagenen Preis verwenden?',
    'War klar, warum SIT diesen Preis empfiehlt?', 'War der SIT Planer hilfreich?',
    'Waren Mietkorb und Projekt verständlich?', 'Würdest du SIT selbst benutzen?',
    'Würdest du einen eigenen Gegenstand einstellen?', 'Blue-Ocean value questions',
  ]);
  const instructions = source(repositoryRoot, value.preparedArtifacts.testerInstructions);
  requireMarkers(instructions, value.preparedArtifacts.testerInstructions, [
    'future R15 candidate handoff', '48H_R14_HEILBRONN_WAVE0_OPERATIONS',
    '48H_R14_SAFE_LISTING_PHOTOS_ONE_PAGER_DE', 'NOT AN INVITATION',
  ]);
  if (instructions.includes('2026082401')) fail('R14 tester instructions retain a stale build identity.');
  const aggregate = source(repositoryRoot, value.preparedArtifacts.aggregateEvaluationSheet).trim();
  const rows = aggregate.split('\n').map((row) => row.split(','));
  if (rows.length !== 2 || rows[0].length !== rows[1].length
      || rows[1][1] !== 'BLUE_OCEAN'
      || rows[1].at(-1) !== 'BLANK_TEMPLATE_NOT_OBSERVED_HUMAN_RESULTS') {
    fail('R14 aggregate template is not blank and structurally exact.');
  }
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R14 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    testerSlots: value.testerPlan.opaqueSlots.length,
    taskRange: `${value.testerPlan.minimumTotalTasks}-${value.testerPlan.maximumTotalTasks}`,
    activated: value.activationState.humanPilotActivated,
    next48hPackage: value.next48hPackage,
  };
}

function main() {
  const result = validateR14HeilbronnWave0Operations();
  process.stdout.write(
    `R14 Heilbronn Wave 0 valid: testers=${result.testerSlots}, tasks=${result.taskRange}, activated=${result.activated}, status=${result.status}, next=${result.next48hPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
