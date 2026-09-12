#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/48h-remote/r15-google-play-internal-ready-pack-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R15 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R15 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value, label) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail(`${label} contains private or secret-shaped material.`);
  }
}

export function validateR15GooglePlayInternalReadyPack({
  repositoryRoot = root,
  evidence,
  featureMatrix,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed-ready-for-r16',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r15-google-play-internal-ready-pack'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== '843f8803248b276ff9b843bcb206657cea4295af') {
    fail('R15 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'R14',
    evidence: 'docs/evidence/48h-remote/r14-heilbronn-wave0-operations-20260824.json',
    status: 'verified-regression-and-codeql-passed-ready-for-r15',
    implementationCommit: 'dd70f27f3681451db90124ba22287e07cd7b7dcf',
    closureHead: '843f8803248b276ff9b843bcb206657cea4295af',
  })) fail('R15 predecessor binding is invalid.');
  const r14 = JSON.parse(source(repositoryRoot, value.predecessor.evidence));
  if (r14.status !== value.predecessor.status
      || r14.githubVerification?.implementationCommit !== value.predecessor.implementationCommit
      || r14.activationState?.humanPilotActivated !== false) {
    fail('R15 R14 predecessor state drifted.');
  }
  if (!exact(value.preparedArtifacts, {
    readyPack: 'docs/operations/48H_R15_GOOGLE_PLAY_INTERNAL_READY_PACK_2026-08-24.md',
    featureFlagMatrix: 'store/google-play/r15-stage-a-feature-flag-matrix.json',
    n10Handoff: 'docs/operations/BLUE_OCEAN_GOOGLE_PLAY_INTERNAL_TESTING_HANDOFF.md',
    testerInstructions: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTER_INSTRUCTIONS.md',
    feedbackTemplate: 'docs/templates/BLUE_OCEAN_INTERNAL_TESTING_FEEDBACK.md',
    releaseNotes: 'store/google-play/de-DE/blue_ocean_internal_release_notes.txt',
    releaseBuilder: 'scripts/build_android_release_candidate.sh',
    releasePreflight: 'scripts/release_candidate_preflight.sh',
  })) fail('R15 artifact map is invalid.');
  if (!exact(value.candidatePlan, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    currentRepositoryBuildNumber: '2026082302',
    reservedNextBuildNumber: '2026082401',
    track: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    exactBuildSequenceSteps: 10,
    exactSourceCommitBound: false,
    exactAabHashBound: false,
    signedAabBuilt: false,
    privateArchiveVerified: false,
  }) || BigInt(value.candidatePlan.reservedNextBuildNumber)
      <= BigInt(value.candidatePlan.currentRepositoryBuildNumber)) {
    fail('R15 candidate plan is invalid.');
  }
  const pubspec = source(repositoryRoot, 'pubspec.yaml');
  const currentVersion = /^version:\s+([^+\s]+)\+(\d+)$/mu.exec(pubspec);
  if (currentVersion === null
      || currentVersion[1] !== value.candidatePlan.versionName
      || BigInt(currentVersion[2]) < BigInt(value.candidatePlan.reservedNextBuildNumber)) {
    fail('R15 repository build identity regressed below the reserved historical candidate.');
  }

  if (!exact(value.gateSeparation, {
    BUILD_READY: {
      state: 'not-granted',
      mayAuthorize: 'one-exact-local-internal-candidate-build',
      authorizesPlayUpload: false,
      authorizesHumanPilot: false,
    },
    PLAY_UPLOAD_APPROVED: {
      state: 'not-granted',
      mayAuthorize: 'one-exact-hash-bound-aab-upload-to-internal-track',
      authorizesReleaseActivation: false,
      authorizesHumanPilot: false,
    },
    HUMAN_PILOT_ACTIVATED: {
      state: 'not-granted',
      mayAuthorize: 'exact-three-adult-heilbronn-wave0-only',
      authorizesPublicRelease: false,
      authorizesRealMoney: false,
    },
  })) fail('R15 gate separation is invalid.');

  const githubPassed = value.status === statuses[2];
  if (!exact(value.localPreflight, githubPassed ? {
    observedHead: 'dd70f27f3681451db90124ba22287e07cd7b7dcf',
    canonicalAndroidSigning: 'passed-without-secret-output',
    androidFirebaseConfigured: true,
    firebaseAnalyticsConfigured: false,
    candidatePreflight: 'passed-without-artifact-creation',
    r15ExactInternalControls: 'passed-exact-implementation-head-without-artifacts',
    exactR15PreflightHead: value.githubVerification?.implementationCommit,
  } : {
    observedHead: 'dd70f27f3681451db90124ba22287e07cd7b7dcf',
    canonicalAndroidSigning: 'passed-without-secret-output',
    androidFirebaseConfigured: true,
    firebaseAnalyticsConfigured: false,
    candidatePreflight: 'passed-without-artifact-creation',
    r15ExactInternalControls: 'pending-clean-implementation-head',
  })) fail('R15 local preflight record is invalid.');
  if (!exact(value.featureTruth, {
    blueOceanCoreBuildable: true,
    externalListingAi: 'disabled-manual-fallback',
    fullN9G3G4G5EnvelopeBuildableAsSignedRelease: false,
    g3G4G5TasksMustRemainNotRun: true,
    fullN9EnvelopeBlocksHumanPilotActivation: true,
    realPayments: 'off',
    firebaseAnalytics: 'off',
    crashlyticsCollection: 'off',
    fcmPush: 'off',
    supportEvidenceUpload: 'off',
    publicRegistration: 'off',
    publicStoreRelease: 'off',
  })) fail('R15 feature truth is invalid.');
  const processNames = [
    'signingPreflight', 'aabHashBinding', 'releaseNotes', 'internalTrackChecklist',
    'testerOptIn', 'dataPreservationUpdate', 'rollback', 'stageAFeatureMatrix',
    'privacyCopyChecklist', 'feedbackRoute', 'testerRemoval', 'pilotShutdown',
  ];
  if (!exact(Object.keys(value.preparedProcesses ?? {}), processNames)
      || !Object.values(value.preparedProcesses ?? {}).every((entry) => entry === 'complete')) {
    fail('R15 prepared process set is invalid.');
  }

  const matrix = featureMatrix
    ?? JSON.parse(source(repositoryRoot, value.preparedArtifacts.featureFlagMatrix));
  if (matrix.schemaVersion !== 1
      || matrix.kind !== 'sit-48h-r15-stage-a-internal-candidate-feature-matrix'
      || matrix.status !== 'prepared-not-built-not-activated'
      || !exact(matrix.candidate, {
        applicationId: 'com.shareittoo.app',
        versionName: '1.0.0',
        currentRepositoryBuildNumber: '2026082302',
        reservedNextBuildNumber: '2026082401',
        releaseChannel: 'internal',
        apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
        exactSourceCommit: 'pending-r16-pilot-freeze',
        exactAabSha256: 'pending-approved-local-build',
        sourceCommitBound: false,
        aabHashBound: false,
      })) fail('R15 feature matrix identity is invalid.');
  const expectedStates = {
    v52_single_item_core: 'on',
    g2_discover_saved_cart: 'on-non-reserving',
    blue_ocean_listing_assistant: 'on-internal-staging-candidate-only',
    g3_booking_groups: 'off-release-mode-lock',
    g4_planner_technical_ui: 'off-release-mode-lock',
    g5_supply_enrichment_technical_ui: 'off-release-mode-lock',
    g5_listing_sets_technical_ui: 'off-release-mode-lock',
    external_listing_ai: 'disabled-manual-fallback',
    real_payments: 'off',
    delivery: 'off',
    firebase_analytics: 'off',
    crashlytics_collection: 'off',
    fcm_push: 'off',
    support_evidence_upload: 'off',
    public_registration: 'off',
    public_store_release: 'off',
  };
  if (!exact(Object.fromEntries(matrix.surfaces.map(({ id, targetState }) => [id, targetState])), expectedStates)
      || !exact(matrix.wave0Impact, {
        blueOceanCoreBuildable: true,
        fullN9G3G4G5EnvelopeBuildableAsSignedRelease: false,
        g3G4G5TasksMustRemainNotRun: true,
        blocksBuildReadyForReducedBlueOceanCandidate: false,
        blocksHumanPilotActivationForFullN9Envelope: true,
        requiresSeparateLegalAndInternalReleaseDecision: true,
      })) fail('R15 feature matrix state is invalid.');

  const expectedBoundaries = {
    aabBuilt: false,
    aabUploaded: false,
    playConsoleAccessed: false,
    playConsoleChanged: false,
    testerListChanged: false,
    optInLinkGeneratedOrShared: false,
    testerContacted: false,
    realPersonDataStored: false,
    humanPilotActivated: false,
    externalProviderCallPerformed: false,
    billingActivated: false,
    realMoneyEnabled: false,
    firebaseChanged: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    historyRewritten: false,
  };
  if (!exact(value.boundaries, expectedBoundaries)
      || !Object.values(matrix.boundaries).every((entry) => entry === false)) {
    fail('R15 mutation boundary is invalid.');
  }
  if (value.next48hPackage !== 'R16') fail('R15 next package is invalid.');

  const fullPassed = value.status !== statuses[0];
  if (!exact(value.focusedVerification, {
    androidSigningConfigTests: 'passed-7',
    archiveCandidateTests: 'passed-6',
    r15WiringTests: 'passed-9',
    r15ArtifactValidatorTests: 'passed-8',
    r15ArtifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-ci-metadata-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R15 verification record is invalid.');
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
      fail('R15 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('R15 cannot bind GitHub verification before CI succeeds.');
  }

  const readyPack = source(repositoryRoot, value.preparedArtifacts.readyPack);
  requireMarkers(readyPack, value.preparedArtifacts.readyPack, [
    'NO AAB BUILT — NO PLAY CHANGE — NO PILOT ACTIVATION',
    '`BUILD_READY`', '`PLAY_UPLOAD_APPROVED`', '`HUMAN_PILOT_ACTIVATED`',
    'Exact candidate build sequence', 'Signing and AAB hash binding',
    'Internal Testing owner checklist', 'Tester opt-in and data-preserving update',
    'Exact Stage-A feature truth', 'Privacy copy checklist and feedback route',
    'Rollback, tester removal and pilot shutdown',
    'G3 booking groups', 'G4 technical Planner', 'G5 technical UIs',
  ]);
  const builder = source(repositoryRoot, value.preparedArtifacts.releaseBuilder);
  requireMarkers(builder, value.preparedArtifacts.releaseBuilder, [
    'SIT_REQUIRE_CANONICAL_SIGNING', 'SIT_BLUE_OCEAN_LISTING_ASSISTANT',
    '--dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=$blue_ocean_listing_assistant',
    'Blue Ocean listing assistance is restricted to the non-public Internal Staging candidate.',
    'blueOceanListingAssistantEnabled', 'node tool/archive_android_release_candidate.mjs',
  ]);
  const preflight = source(repositoryRoot, value.preparedArtifacts.releasePreflight);
  requireMarkers(preflight, value.preparedArtifacts.releasePreflight, [
    'SIT_REQUIRE_CANONICAL_SIGNING', 'validate_android_signing_config.mjs --require-canonical',
  ]);
  for (const [path, markers] of [
    [value.preparedArtifacts.releaseNotes, ['Interner ShareItToo-Test:', 'Keine öffentliche Veröffentlichung']],
    [value.preparedArtifacts.testerInstructions, ['future R15 candidate handoff', 'wrong build']],
    [value.preparedArtifacts.feedbackTemplate, ['BLANK TEMPLATE', 'NO OBSERVED HUMAN RESULT']],
  ]) requireMarkers(source(repositoryRoot, path), path, markers);
  for (const path of [
    'lib/config/booking_group_technical_config.dart',
    'lib/config/planner_technical_config.dart',
    'lib/config/supply_enrichment_technical_config.dart',
    'lib/config/listing_sets_technical_config.dart',
  ]) requireMarkers(source(repositoryRoot, path), path, [
    'signedStageAInternalEnvelope',
    'technicalSurfaceAvailableFor',
  ]);
  assertSanitized(value, 'R15 evidence');
  assertSanitized(matrix, 'R15 feature matrix');
  return {
    status: value.status,
    track: value.candidatePlan.track,
    buildReady: value.gateSeparation.BUILD_READY.state,
    playUploadApproved: value.gateSeparation.PLAY_UPLOAD_APPROVED.state,
    humanPilotActivated: value.gateSeparation.HUMAN_PILOT_ACTIVATED.state,
    next48hPackage: value.next48hPackage,
  };
}

function main() {
  const result = validateR15GooglePlayInternalReadyPack();
  process.stdout.write(
    `R15 Google Play Internal ready pack valid: track=${result.track}, build=${result.buildReady}, upload=${result.playUploadApproved}, pilot=${result.humanPilotActivated}, status=${result.status}, next=${result.next48hPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
