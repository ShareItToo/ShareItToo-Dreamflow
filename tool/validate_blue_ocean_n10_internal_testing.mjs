#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n10-google-play-internal-testing-preparation-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N10 source ${path}` });
}

function json(repositoryRoot, path) {
  return JSON.parse(source(repositoryRoot, path));
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N10 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value, label) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail(`${label} contains private or secret-shaped material.`);
  }
}

export function validateBlueOceanN10InternalTesting({
  repositoryRoot = root,
  evidence,
  plan,
} = {}) {
  const value = evidence ?? json(repositoryRoot, evidencePath);
  const planValue = plan ?? json(repositoryRoot, value.planRef);
  const validStatuses = [
    'implemented-targeted-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n11',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n10-google-play-internal-testing-preparation'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== 'b606e2864b6ab429a9dd64c04280968720454581'
      || value.planRef !== 'store/google-play/blue-ocean-internal-testing-plan.json') {
    fail('N10 evidence identity is invalid.');
  }
  if (planValue.schemaVersion !== 1
      || planValue.kind !== 'sit-stage-a-blue-ocean-n10-google-play-internal-testing-plan'
      || planValue.status !== 'prepared-not-executed'
      || planValue.pilotId !== 'heilbronn_wave0'
      || planValue.track !== 'internal') {
    fail('N10 Internal Testing plan identity is invalid.');
  }

  const candidate = planValue.candidatePlan ?? {};
  if (!exact(candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    currentRepositoryBuildNumber: '2026082302',
    plannedBuildNumber: '2026082401',
    exactSourceCommit: 'pending-final-candidate-cut',
    aabSha256: 'pending-local-signed-build',
    archiveState: 'pending-owner-only-local-archive',
    releaseName: '1.0.0-internal-2026082401',
    releaseNotesPath: 'store/google-play/de-DE/blue_ocean_internal_release_notes.txt',
  })) fail('N10 candidate plan is invalid.');
  if (BigInt(candidate.plannedBuildNumber) <= BigInt(candidate.currentRepositoryBuildNumber)) {
    fail('N10 planned build number must advance monotonically.');
  }
  const pubspec = source(repositoryRoot, 'pubspec.yaml');
  const currentVersion = /^version:\s+([^+\s]+)\+(\d+)$/mu.exec(pubspec);
  if (currentVersion === null
      || currentVersion[1] !== candidate.versionName
      || BigInt(currentVersion[2]) < BigInt(candidate.currentRepositoryBuildNumber)) {
    fail('N10 current repository version regressed below its historical baseline.');
  }

  if (!exact(planValue.requiredBeforeCandidateBuild, [
    'N10-through-N13-source-and-documentation-complete',
    'full-technical-regression-green-at-exact-source-commit',
    'release-signing-config-present-without-secret-output',
    'staging-only-api-and-no-real-money-flags-verified',
    'owner-approves-exact-local-candidate-build',
  ]) || !exact(planValue.requiredBeforeConsoleAction, [
    'exact-aab-sha256-recorded',
    'exact-source-commit-recorded',
    'owner-only-local-archive-verified',
    'privacy-permission-and-product-truth-rescan-green',
    'GOOGLE_PLAY_INTERNAL_UPLOAD_GO',
    'owner-present-in-google-play-console',
  ])) fail('N10 candidate or Console gate sequence is invalid.');
  if (!exact(planValue.ownerConsoleActions, [
    'verify-package-com.shareittoo.app-and-internal-track',
    'create-new-internal-release-with-exact-bound-aab-only',
    'review-play-app-signing-and-all-upload-warnings',
    'add-only-the-private-three-slot-tester-list-outside-git',
    'save-draft-then-recheck-version-code-hash-and-release-notes',
    'activate-internal-release-only-after-GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'share-private-opt-in-link-outside-git-and-public-channels',
    'install-from-google-play-and-record-sanitized-exact-build-evidence',
  ])) fail('N10 owner Console action sequence is invalid.');
  if (!exact(planValue.testerDistribution, {
    plannedAdultSlots: ['HW0-A', 'HW0-B', 'HW0-C'],
    testerEmailsStoredInGit: false,
    optInLinkStoredInGit: false,
    instructionsPath: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTER_INSTRUCTIONS.md',
    feedbackPath: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTING_FEEDBACK.md',
    aggregateEvaluationPath: 'docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv',
  })) fail('N10 tester-distribution boundary is invalid.');

  const hardStopNames = [
    'productionTrack', 'openTestingTrack', 'closedTestingTrack', 'sendForReview',
    'publicRollout', 'differentOrUnhashedArtifact', 'realMoney', 'publicRegistration',
    'credentialsOrPersonalDataInRepository', 'unapprovedExternalProviderOrBilling',
  ];
  if (!exact(Object.keys(planValue.hardStops ?? {}), hardStopNames)
      || !Object.values(planValue.hardStops ?? {}).every((entry) => entry === true)) {
    fail('N10 hard-stop map is invalid.');
  }
  const expectedBoundaries = {
    aabBuilt: false,
    aabUploaded: false,
    playConsoleChanged: false,
    testerListCreatedOrChanged: false,
    testerInvited: false,
    optInLinkGeneratedOrShared: false,
    firebaseChanged: false,
    productionChanged: false,
    paymentChanged: false,
    cloudChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
  };
  if (!exact(planValue.boundaries, expectedBoundaries)
      || !exact(value.boundaries, expectedBoundaries)) {
    fail('N10 mutation boundary is invalid.');
  }
  const rollback = planValue.rollbackAndPreservation ?? {};
  if (rollback.pauseNewInvitations !== true
      || rollback.disableBlueOceanFlag !== true
      || rollback.keepPreviousVerifiedInternalReleaseAvailableUntilReplacementVerified !== true
      || rollback.preserveExactCandidateArchiveAndHashes !== true
      || rollback.preserveSanitizedEvidence !== true
      || rollback.preserveHumanRightsRequestsAndRequiredRetention !== true
      || rollback.deleteOrRewriteExistingEvidence !== false
      || rollback.consoleRollbackRequiresOwner !== true
      || rollback.runbookPath !== 'docs/operations/BLUE_OCEAN_GOOGLE_PLAY_INTERNAL_TESTING_HANDOFF.md') {
    fail('N10 rollback and preservation contract is invalid.');
  }
  if (!exact(value.candidateState, {
    versionName: '1.0.0',
    currentRepositoryBuildNumber: '2026082302',
    plannedBuildNumber: '2026082401',
    exactCommitBound: false,
    exactAabHashBound: false,
    signedAabBuilt: false,
    privateArchiveVerified: false,
  })) fail('N10 evidence candidate state is invalid.');
  if (!exact(value.preparedArtifacts, {
    handoffRunbook: 'docs/operations/BLUE_OCEAN_GOOGLE_PLAY_INTERNAL_TESTING_HANDOFF.md',
    testerInstructions: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTER_INSTRUCTIONS.md',
    feedbackTemplate: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTING_FEEDBACK.md',
    aggregateEvaluation: 'docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv',
    releaseNotes: 'store/google-play/de-DE/blue_ocean_internal_release_notes.txt',
  })) fail('N10 prepared artifact map is invalid.');

  const fullPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === 'verified-ready-for-n11';
  if (!exact(value.targetedVerification, {
    planWiringTests: 'passed-8',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) fail('N10 verification record is invalid for its status.');
  if (value.nextPackage !== 'N11') fail('N10 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N10 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N10 cannot bind exact GitHub verification before CI is complete.');
  }

  const runbook = source(repositoryRoot, value.preparedArtifacts.handoffRunbook);
  requireMarkers(runbook, value.preparedArtifacts.handoffRunbook, [
    'PREPARED — NOT BUILT — NOT UPLOADED — NOT ACTIVATED',
    '`GOOGLE_PLAY_INTERNAL_UPLOAD_GO`', '`GOOGLE_PLAY_INTERNAL_RELEASE_GO`',
    'Rollback and data preservation', 'Internal testing',
  ]);
  const instructions = source(repositoryRoot, value.preparedArtifacts.testerInstructions);
  requireMarkers(instructions, value.preparedArtifacts.testerInstructions, [
    'BLANK FUTURE TESTER TEMPLATE', 'HW0-A', 'HW0-B', 'HW0-C',
    'wrong build', 'no-money',
  ]);
  const feedback = source(repositoryRoot, value.preparedArtifacts.feedbackTemplate);
  requireMarkers(feedback, value.preparedArtifacts.feedbackTemplate, [
    'BLANK TEMPLATE', 'NO OBSERVED HUMAN RESULT', 'wrong-build-stop',
    'yes-stop', 'abort-wave',
  ]);
  const releaseNotes = source(repositoryRoot, value.preparedArtifacts.releaseNotes);
  requireMarkers(releaseNotes, value.preparedArtifacts.releaseNotes, [
    'Interner ShareItToo-Test:', 'nicht bindender', 'Keine öffentliche Veröffentlichung',
  ]);
  assertSanitized(value, 'N10 evidence');
  assertSanitized(planValue, 'N10 plan');
  return {
    status: value.status,
    track: planValue.track,
    plannedBuildNumber: candidate.plannedBuildNumber,
    aabBuilt: value.boundaries.aabBuilt,
    playConsoleChanged: value.boundaries.playConsoleChanged,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateBlueOceanN10InternalTesting();
  process.stdout.write(
    `Blue Ocean N10 Internal Testing valid: track=${result.track}, plannedBuild=${result.plannedBuildNumber}, aabBuilt=${result.aabBuilt}, consoleChanged=${result.playConsoleChanged}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
