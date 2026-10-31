#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/r3-blue-ocean-pixel-flow-20260824.json';
const implementationCommit =
  '19fc3221bc3879788db9c48b70a89a33656116b6';
const verifiedHead =
  '40eb46c39b95ad54fa67b40fa54977bc0d034523';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, {
    label: `R3 source ${path}`,
  });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) {
      fail(`R3 marker missing in ${path}: ${marker}`);
    }
  }
}

export function validateR3BlueOceanPixelFlow({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'verified-pixel-flow-regression-pending',
    'verified-pixel-flow-and-regression-passed-ci-pending',
    'verified-pixel-flow-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r3-blue-ocean-pixel-flow'
      || !validStatuses.includes(value.status)
      || value.observedOn !== '2026-08-24'
      || !exact(value.source, {
        branch: 'codex/master-workflow-20260808',
        implementationCommit,
        applicationId: 'com.shareittoo.app',
        versionName: '1.0.0',
        buildNumber: '2026082404',
      })) {
    fail('R3 evidence identity is invalid.');
  }
  if (!exact(value.candidate, {
    ownerOnlyArchiveVerified: true,
    canonicalSigningRelationshipVerified: true,
    debuggableLocalQaOnly: true,
    releaseChannel: 'internal',
    apiBaseUrl: 'http://127.0.0.1:18080/api/v1',
    aabCreated: false,
    storeUploaded: false,
  })) fail('R3 candidate boundary is invalid.');
  if (!exact(value.device, {
    platform: 'android',
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  })) fail('R3 physical-device evidence is invalid.');
  if (!exact(value.installation, {
    installedVersionBefore: '1.0.0+2026082403',
    installedVersionAfter: '1.0.0+2026082404',
    dataPreservingDirectUpdate: true,
    firstInstallTimePreserved: true,
    ceDataInodePreserved: true,
    installedCandidateHashMatched: true,
    foregroundActivityVerified: true,
    uninstallUsed: false,
    dataResetUsed: false,
  })) fail('R3 installation evidence is invalid.');
  if (!exact(value.localHarness, {
    postgresMajor: 16,
    ephemeralDatabase: true,
    loopbackBinding: '127.0.0.1',
    adbReverse: 'tcp:18080',
    apiPrefix: '/api/v1',
    syntheticAccountOnly: true,
    transientCredentialsOwnerOnly: true,
    listingAiProvider: 'mock',
    listingAiBudgetCents: 0,
    externalProviderExecutionAllowed: false,
    paymentTransport: 'memory',
    paymentLivemode: false,
    publicComplianceApproved: false,
  })) fail('R3 local harness boundary is invalid.');
  if (!exact(value.syntheticFixture, {
    repositoryPath: 'store/assets/synthetic-listings/cordless-drill.png',
    repositorySha256:
      '6028e8b513f5ead1a38362cc057c246ebbf1203604420baf18ddd94f7c1914bc',
    deviceSelection: 'exact-filename-through-android-documents-ui',
    processedWebpSha256:
      'c8d8d316b3e317609370e4ec9cd6b2b56be9365536661c8b16d01ba5465c2b5a',
    privateGalleryImageSelectedOrAnalyzed: false,
  })) fail('R3 synthetic fixture evidence is invalid.');
  if (!exact(value.observedFlow, {
    analysisStatus: 'draft_ready',
    title: 'Akku-Bohrschrauber',
    category: 'cat8',
    categoryLabel: 'Werkzeuge & Kleingeräte',
    subcategory: 'Bohrmaschinen',
    editableFieldsVerified: true,
    clarificationQuestionCount: 2,
    clarificationMaximum: 3,
    initialPriceAutofillInvalidatedOwnerConfirmation: true,
    firstCompleteReviewState: 'READY_TO_PUBLISH',
    oneDayOwnerRentMinor: 1000,
    oneDaySitContributionMinor: 100,
    oneDayRenterTotalMinor: 1100,
    sevenDayOwnerRentMinor: 4900,
    sevenDaySitContributionMinor: 490,
    sevenDayRenterTotalMinor: 5390,
    explicitPublicationActionPerformed: false,
    listingCreated: false,
  })) fail('R3 observed listing flow is invalid.');
  if (!exact(value.staleReviewRegression, {
    trigger: 'owner-edited-model-after-ready',
    itemIdentityConfirmationReset: true,
    finalPublicationConfirmationReset: true,
    clarificationAnswersReset: true,
    staleReadyPresentationHidden: true,
    stateAfterEdit: 'NEEDS_REVIEW',
    publicationFingerprintMismatchFailsClosed: true,
    stateAfterFreshReview: 'READY_TO_PUBLISH',
    implementationCommits: [
      '897ff5582b381d6bf6ee1b34a14cda78d4427da6',
      implementationCommit,
    ],
  })) fail('R3 stale-review regression evidence is invalid.');
  if (!exact(value.cleanup, {
    adbReverseRemoved: true,
    syntheticDeviceFixtureRemoved: true,
    transientSessionRemoved: true,
    ephemeralDatabaseRemoved: true,
    temporaryUploadsRemoved: true,
    localBackendStopped: true,
  })) fail('R3 cleanup evidence is invalid.');
  if (!exact(value.boundaries, {
    apiBillingCreated: false,
    externalAiProviderCalled: false,
    realMoneyUsed: false,
    productionChanged: false,
    cloudChanged: false,
    firebaseChanged: false,
    paymentChanged: false,
    storeChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicRegistrationEnabled: false,
    pilotActivated: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    credentialsPersistedInRepository: false,
    containsSecrets: false,
  })) fail('R3 live boundary is invalid.');
  if (value.nextPackage !== 'R4_ANDROID_LIFECYCLE_FAILURE_MATRIX') {
    fail('R3 next package is invalid.');
  }

  const regressionPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === validStatuses[2];
  if (!exact(value.verification, {
    blueOceanUiWiringTests: 'passed-10',
    privacyRetentionAndProviderTests: 'passed-71',
    focusedTotalTests: 'passed-81',
    flutterAnalyze: 'passed-no-issues',
    fullTechnicalRegression: regressionPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R3 verification record is invalid.');

  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.implementationCommit !== implementationCommit
        || github.verifiedHead !== verifiedHead
        || github.regression?.conclusion !== 'success'
        || !Number.isInteger(github.regression?.runId)
        || github.regression.runId <= 0
        || github.regression.signedCandidateBuilt !== false
        || github.regression.apiImagePublished !== false
        || github.codeql?.workflowConclusion !== 'success'
        || !Number.isInteger(github.codeql?.workflowRunId)
        || github.codeql.workflowRunId <= 0
        || github.codeql.advancedSecurityConclusion !== 'success'
        || !Number.isInteger(github.codeql?.advancedSecurityCheckId)
        || github.codeql.advancedSecurityCheckId <= 0
        || github.codeql.newAlerts !== 0) {
      fail('R3 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('R3 pending evidence must not claim GitHub verification.');
  }

  const screenPath = 'lib/screens/create_listing_screen.dart';
  requireMarkers(source(repositoryRoot, screenPath), screenPath, [
    'void _invalidateBlueOceanReviewState',
    "_blueOceanConfirmations['final_publication'] = false;",
    'String _blueOceanEditableFingerprint()',
    '_blueOceanReadyFingerprint != _blueOceanEditableFingerprint()',
    'final exactCurrentStateIsReady = readiness is Map',
    "? 'READY_TO_PUBLISH: Die vollständige Vorschau '",
    ": 'NEEDS_REVIEW: Prüfe offene Rückfragen, '",
  ]);
  const harnessPath = 'tool/run_android_local_qa_backend.mjs';
  requireMarkers(source(repositoryRoot, harnessPath), harnessPath, [
    "BIND_HOST: '127.0.0.1'",
    "SIT_LISTING_AI_PROVIDER: 'mock'",
    "SIT_LISTING_AI_BUDGET_CENTS: '0'",
    "PAYMENT_TRANSPORT: 'memory'",
    "SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true'",
    'if (sessionPath) rmSync(sessionPath, { force: true });',
    'rmSync(runRoot, { recursive: true, force: true });',
  ]);
  const screeningPath = 'backend/src/local_qa_synthetic_image_screening.js';
  requireMarkers(source(repositoryRoot, screeningPath), screeningPath, [
    'c8d8d316b3e317609370e4ec9cd6b2b56be9365536661c8b16d01ba5465c2b5a',
    "configuration?.listingAi?.provider !== 'mock'",
    'configuration?.listingAi?.budgetCents !== 0',
    'allowedSyntheticImageDigests.has(sha256)',
  ]);
  const fixtureBindingPath = 'tool/prepare_store_screenshot_fixture.mjs';
  requireMarkers(source(repositoryRoot, fixtureBindingPath), fixtureBindingPath, [
    "imageName: 'cordless-drill.png'",
    "imageSha256: '6028e8b513f5ead1a38362cc057c246ebbf1203604420baf18ddd94f7c1914bc'",
  ]);

  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R3 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    buildNumber: value.source.buildNumber,
    device: value.device.model,
    firstReady: value.observedFlow.firstCompleteReviewState,
    staleEditState: value.staleReviewRegression.stateAfterEdit,
    published: false,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateR3BlueOceanPixelFlow();
  process.stdout.write(
    `R3 Pixel listing flow valid: build=${result.buildNumber}, device=${result.device}, first=${result.firstReady}, afterEdit=${result.staleEditState}, published=${result.published}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
