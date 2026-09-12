#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp126-exact-successor-pixel-push-closure-20260912.json';
const rolloverPath = 'store/google-play/current-rollover-candidate.json';
const toolPath = 'tool/run_isolated_android_device_message_diagnostic.mjs';
const toolTestPath = 'test/tool/run_isolated_android_device_message_diagnostic.test.mjs';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return Buffer.from(execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail(`WP126 source is unavailable: ${path}`);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP126 head is not an ancestor of HEAD: ${head}`);
  }
}

function validateCandidate(value, rollover) {
  const expected = {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091201',
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    minSdkVersion: 24,
    targetSdkVersion: 36,
    compileSdkVersion: 36,
    firebaseAndroidConfigured: true,
    aabBytes: 138736330,
    aabSha256: '81c204fd65d83a0403d203b606328880acb0787d076093240efab87d00575399',
    apkBytes: 199608577,
    apkSha256: 'a8bfda4c1a0e7302b2528db8edfbe1318e88322023f65588da032220a24badd4',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    signatureVerified: true,
    binaryPrivacyScanPassed: true,
    externalListingAiEnabled: false,
    listingAiExecutionLocation: 'android_on_device',
  };
  if (!exact(value.candidate, expected)) fail('WP126 candidate contract is invalid.');
  const identity = rollover?.candidate;
  const artifact = rollover?.artifact;
  if (rollover?.schemaVersion !== 1
      || rollover.kind !== 'android-current-rollover-candidate'
      || rollover.status !== 'build-ready-play-internal-upload-pending'
      || identity?.applicationId !== expected.applicationId
      || identity?.versionName !== expected.versionName
      || identity?.versionCode !== expected.versionCode
      || identity?.artifactSourceHead !== value.repository.artifactSourceHead
      || identity?.releaseChannel !== expected.releaseChannel
      || identity?.apiBaseUrl !== expected.apiBaseUrl
      || artifact?.aabBytes !== expected.aabBytes
      || artifact?.aabSha256 !== expected.aabSha256
      || artifact?.apkBytes !== expected.apkBytes
      || artifact?.apkSha256 !== expected.apkSha256
      || artifact?.uploadCertificateSha256 !== expected.uploadCertificateSha256
      || artifact?.signatureVerified !== true) {
    fail('WP126 rollover pointer is not bound to the candidate.');
  }
}

function validateRepository(repositoryRoot, value, checkGitState) {
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    artifactSourceHead: '1546812f625b4e8f1e700bf976410097cd45ac2f',
    candidateFreezeHead: 'f9c4c9523eb0f4dfcdb03d34516795a91e0bcbdd',
    diagnosticCorrectionHead: '4f4ae2a2cce6672a61ca77fc3fcec57fb0aac245',
  })) fail('WP126 repository identity is invalid.');
  if (checkGitState) {
    for (const head of Object.values(value.repository).filter((entry) => /^[a-f0-9]{40}$/u.test(entry))) {
      assertAncestor(repositoryRoot, head);
    }
  }
}

function validateVerification(value) {
  if (!exact(value.localVerification, {
    releasePreflightPassed: true,
    privateArchiveIndependentValidationPassed: true,
    completeTechnicalRegressionPassed: true,
    candidateFreezeHead: 'f9c4c9523eb0f4dfcdb03d34516795a91e0bcbdd',
    flutterAnalyzerIssues: 0,
    webWasmPassed: true,
    loopbackSmokePassed: true,
    androidBuildPassed: true,
    officialBootstrappedToolInventoryPassed: true,
    postCorrectionToolTestsPassed: 2743,
    postCorrectionToolTestsFailed: 0,
    unbootstrappedToolGlobAcceptedAsEvidence: false,
    unbootstrappedFailureCause: 'missing-generated-package-config-before-declared-bootstrap',
  })) fail('WP126 local verification contract is invalid.');

  if (!exact(value.github, {
    candidateFreezeRegression: {
      runId: 34703064328,
      headSha: 'f9c4c9523eb0f4dfcdb03d34516795a91e0bcbdd',
      conclusion: 'success',
      cleanCheckoutJob: 'success',
    },
    candidateFreezeCodeql: {
      runId: 34703064266,
      headSha: 'f9c4c9523eb0f4dfcdb03d34516795a91e0bcbdd',
      conclusion: 'success',
    },
    diagnosticCorrectionRegression: {
      runId: 34704553662,
      headSha: '4f4ae2a2cce6672a61ca77fc3fcec57fb0aac245',
      conclusion: 'success',
    },
    diagnosticCorrectionCodeql: {
      runId: 34704553654,
      headSha: '4f4ae2a2cce6672a61ca77fc3fcec57fb0aac245',
      conclusion: 'success',
    },
    openBranchCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-clean-mergeable-unmerged',
  })) fail('WP126 GitHub verification contract is invalid.');
}

function validateDeviceAndCleanup(value) {
  const pixel = value.pixel;
  if (pixel?.physical !== true
      || pixel.model !== 'Pixel 7 Pro'
      || pixel.installedVersionBefore !== '1.0.0+2026091110'
      || pixel.installedVersionAfter !== '1.0.0+2026091201'
      || ['strictlyNewerBuildInstalled', 'candidateSignatureMatchedInstalledApp',
        'installedCandidateHashMatched', 'firstInstallTimePreserved', 'dataInodePreserved',
        'foregroundActivityVerifiedAfterUpdate'].some((key) => pixel[key] !== true)
      || ['uninstallUsed', 'dataResetUsed', 'storeDeliveryUsed'].some((key) => pixel[key] !== false)) {
    fail('WP126 Pixel update contract is invalid.');
  }
  const fcm = value.controlledFcm;
  if (fcm?.status !== 'passed-exact-candidate-isolated-non-binding'
      || ['foreground', 'background', 'terminatedProcess',
        'sourceRecoveryContractsPassed', 'accountPrincipalEpochIsolationSourceContractsPassed']
        .some((key) => fcm[key] !== true)
      || fcm.notificationIconVisualReview !== 'passed-private-capture-brand-icon-clear'
      || !/^[a-f0-9]{64}$/u.test(fcm.privateCaptureSha256 ?? '')
      || fcm.privateCaptureCommitted !== false
      || fcm.privateCaptureMovedToTrash !== true
      || fcm.physicalTransportResponseLossInjected !== false) {
    fail('WP126 controlled FCM contract is invalid.');
  }
  if (!exact(value.cleanup, {
    nonBindingBookingCancelled: true,
    exactSyntheticListingPaused: true,
    publicCatalogEntryRemoved: true,
    protectedAccountIdentityRecorded: false,
    privateCaptureRetainedOutsideTrash: false,
    onePlusContacted: false,
  })) fail('WP126 cleanup contract is invalid.');
}

function validateDiagnostic(repositoryRoot, value) {
  const correction = value.diagnosticCorrection;
  if (correction?.sourceHead !== value.repository.diagnosticCorrectionHead
      || correction.focusedTestsPassed !== 6
      || ['emailLinkVerifiedSyntheticPairAccepted', 'fixtureVerifiedSyntheticPairRetained',
        'exactOwnerRenterRolesRequired', 'mixedOrUnknownVerificationRejected',
        'physicalCorrectedIsolationRunPassed'].some((key) => correction[key] !== true)
      || correction.toolSha256 !== sha256(sourceAtHead(repositoryRoot, correction.sourceHead, toolPath))
      || correction.testSha256 !== sha256(sourceAtHead(repositoryRoot, correction.sourceHead, toolTestPath))) {
    fail('WP126 diagnostic correction contract is invalid.');
  }
  if (!exact(value.safePreparationStops, {
    typedV52DocumentGateCount: 2,
    typedStatus: 409,
    typedCode: 'v52_contract_documents_unavailable',
    deviceSuccessClaimedFromStoppedAttempts: false,
    contractCreated: false,
    reservationCreated: false,
    paymentEndpointCalled: false,
    monetaryEffectMinor: 0,
  })) fail('WP126 safe preparation-stop contract is invalid.');
}

function validateBoundaries(value, rollover) {
  const expectedFalse = [
    'productionChanged', 'googlePlayChanged', 'testerListChanged',
    'firebaseProjectChanged', 'backendDeploymentChanged', 'paymentChanged',
    'realMoneyUsed', 'vpsDnsChanged', 'publicRegistrationChanged', 'prMerged',
    'containsSecrets', 'containsAccountIdentity', 'containsRawDeviceIdentifier',
    'containsPrivateFilesystemPath', 'containsFixtureIdentifier',
  ];
  if (expectedFalse.some((key) => value.boundaries?.[key] !== false)
      || rollover?.providerAndLiveHolds?.productionChanged !== false
      || rollover?.providerAndLiveHolds?.realPaymentsEnabled !== false
      || rollover?.providerAndLiveHolds?.pullRequestMerged !== false
      || rollover?.playStateAtReadback?.candidateUploaded !== false
      || rollover?.playStateAtReadback?.candidateActivated !== false
      || rollover?.deviceVerification?.preferredDeviceExactApkInstalled !== true
      || rollover?.deviceVerification?.secondaryDevice
        !== 'not-required-while-oneplus-disconnected'
      || rollover?.evidenceRef !== evidencePath) {
    fail('WP126 boundary or pointer state is invalid.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP126 evidence contains private or secret-shaped data.');
  }
}

export function validateWp126ExactSuccessorPixelPushClosure({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const pointer = rollover ?? JSON.parse(readFileSync(resolve(repositoryRoot, rolloverPath), 'utf8'));
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp126-exact-successor-pixel-push-closure'
      || value.status !== 'exact-successor-pixel-push-closure-passed'
      || value.capturedOn !== '2026-09-12') {
    fail('WP126 evidence identity is invalid.');
  }
  validateRepository(repositoryRoot, value, checkGitState);
  validateCandidate(value, pointer);
  validateVerification(value);
  validateDeviceAndCleanup(value);
  validateDiagnostic(repositoryRoot, value);
  validateBoundaries(value, pointer);
  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    pixelInstalled: value.pixel.installedVersionAfter,
    fcm: value.controlledFcm.status,
    onePlusContacted: value.cleanup.onePlusContacted,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp126ExactSuccessorPixelPushClosure(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP126 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
