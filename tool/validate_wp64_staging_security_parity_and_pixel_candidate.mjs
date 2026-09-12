#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const candidateSourceHead = '2055a5c508689596c0f776c2cdf38b54f7e106c3';
const technicalHead = '7a73de4aba2b4ae4d6785e8dfbd466a5ad5aa60c';
const backendTreeSha = '59c29921d9787ec8bece9a085cfce3aea035d5cc';
const versionCode = '2026090902';
const aabSha256 = 'b1de03f47d8d185f6cbfe2e28b0db6bd56163e8d1aeeed5f9ebe289a40a3af5c';
const apkSha256 = 'a30404283c92c2dd20e231d385af80e2dcbef510c12210a461f5469759f82dd6';
const uploadCertificateSha256 =
  '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} has drifted.`);
}

function noPrivateIdentityOrPath(value, path = 'evidence') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => noPrivateIdentityOrPath(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:serial|deviceId|testerEmail|accountEmail|screenshotPath)$/iu.test(key)) {
        fail(`${path}.${key} is a forbidden private identity or path field.`);
      }
      noPrivateIdentityOrPath(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) {
      fail(`${path} must not contain an email address.`);
    }
    if (/^(?:\/Users\/|[A-Za-z]:\\Users\\)/u.test(value)) {
      fail(`${path} must not contain a private filesystem path.`);
    }
  }
}

export function validateWp64StagingSecurityParityAndPixelCandidate({ evidence, rollover }) {
  object(evidence, 'evidence');
  object(rollover, 'rollover');
  noPrivateIdentityOrPath(evidence);

  same(evidence.schemaVersion, 1, 'schemaVersion');
  same(evidence.kind, 'sit-wp64-staging-security-parity-and-pixel-candidate', 'kind');
  same(
    evidence.status,
    'complete-staging-and-pixel-play-internal-upload-pending',
    'status',
  );

  const repository = object(evidence.repository, 'repository');
  same(repository.branch, 'codex/master-workflow-20260808', 'repository.branch');
  same(repository.candidateSourceHead, candidateSourceHead, 'repository.candidateSourceHead');
  same(repository.technicalHead, technicalHead, 'repository.technicalHead');
  same(repository.candidateSourceIsAncestor, true, 'repository.candidateSourceIsAncestor');
  same(repository.mobileRuntimeChangedAfterCandidateSource, false,
    'repository.mobileRuntimeChangedAfterCandidateSource');
  same(repository.candidateAndTechnicalBackendTreeSha, backendTreeSha,
    'repository.candidateAndTechnicalBackendTreeSha');

  const candidate = object(evidence.candidate, 'candidate');
  for (const [actual, expected, label] of [
    [candidate.applicationId, 'com.shareittoo.app', 'candidate.applicationId'],
    [candidate.versionName, '1.0.0', 'candidate.versionName'],
    [candidate.versionCode, versionCode, 'candidate.versionCode'],
    [candidate.releaseChannel, 'internal', 'candidate.releaseChannel'],
    [candidate.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'candidate.apiBaseUrl'],
    [candidate.aabSha256, aabSha256, 'candidate.aabSha256'],
    [candidate.apkSha256, apkSha256, 'candidate.apkSha256'],
    [candidate.uploadCertificateSha256, uploadCertificateSha256,
      'candidate.uploadCertificateSha256'],
    [candidate.signatureVerified, true, 'candidate.signatureVerified'],
    [candidate.binaryPrivacyScan, 'passed', 'candidate.binaryPrivacyScan'],
    [candidate.firebaseAndroidConfigured, true, 'candidate.firebaseAndroidConfigured'],
    [candidate.storeUploaded, false, 'candidate.storeUploaded'],
  ]) same(actual, expected, label);

  const archive = object(evidence.sourceArchiveTransfer, 'sourceArchiveTransfer');
  same(archive.sourceHead, technicalHead, 'sourceArchiveTransfer.sourceHead');
  same(archive.archiveBytes, 101109760, 'sourceArchiveTransfer.archiveBytes');
  same(
    archive.archiveSha256,
    '6d0661ce61349e6e5b63d8aad6dd2272cec359b103fb6affc608bf7095f75645',
    'sourceArchiveTransfer.archiveSha256',
  );
  same(archive.serverCheckoutHashVerified, true,
    'sourceArchiveTransfer.serverCheckoutHashVerified');
  same(archive.protectedEnvironmentCopiedWithoutReadingValues, true,
    'sourceArchiveTransfer.protectedEnvironmentCopiedWithoutReadingValues');

  const github = object(evidence.github, 'github');
  for (const [actual, expected, label] of [
    [github.apiImagePublishAndRegressionRunId, 34296797104,
      'github.apiImagePublishAndRegressionRunId'],
    [github.apiImagePublishAndRegressionConclusion, 'success',
      'github.apiImagePublishAndRegressionConclusion'],
    [github.pullRequestRegressionRunId, 34296801776, 'github.pullRequestRegressionRunId'],
    [github.pullRequestRegressionConclusion, 'success',
      'github.pullRequestRegressionConclusion'],
    [github.codeqlRunId, 34296801791, 'github.codeqlRunId'],
    [github.codeqlConclusion, 'success', 'github.codeqlConclusion'],
    [github.verifiedHead, technicalHead, 'github.verifiedHead'],
    [github.backendRegression, 'passed', 'github.backendRegression'],
    [github.postgresRunnerProof, 'passed', 'github.postgresRunnerProof'],
    [github.flutterRegression, 'passed', 'github.flutterRegression'],
    [github.cleanCheckoutReproducibility, 'passed', 'github.cleanCheckoutReproducibility'],
    [github.apiImagePublished, true, 'github.apiImagePublished'],
    [github.openCurrentPrMergeCodeScanningAlerts, 0,
      'github.openCurrentPrMergeCodeScanningAlerts'],
    [github.pullRequestNumber, 7, 'github.pullRequestNumber'],
    [github.pullRequestState, 'open-draft-mergeable-unmerged', 'github.pullRequestState'],
  ]) same(actual, expected, label);

  const staging = object(evidence.staging, 'staging');
  for (const [actual, expected, label] of [
    [staging.deployedSourceHead, technicalHead, 'staging.deployedSourceHead'],
    [staging.imageRevision, technicalHead, 'staging.imageRevision'],
    [staging.apiHealthy, true, 'staging.apiHealthy'],
    [staging.postgresHealthy, true, 'staging.postgresHealthy'],
    [staging.apiRestartCount, 0, 'staging.apiRestartCount'],
    [staging.postgresRestartCount, 0, 'staging.postgresRestartCount'],
    [staging.foreignKeyConstraintsVerified, 354, 'staging.foreignKeyConstraintsVerified'],
    [staging.protectedEmailVerifiedRolesRestored, true,
      'staging.protectedEmailVerifiedRolesRestored'],
    [staging.finalPublicActiveListingCount, 0, 'staging.finalPublicActiveListingCount'],
    [staging.fcmEnabled, true, 'staging.fcmEnabled'],
    [staging.smtpEnabled, true, 'staging.smtpEnabled'],
    [staging.listingAiProvider, 'mock', 'staging.listingAiProvider'],
    [staging.externalListingAiEnabled, false, 'staging.externalListingAiEnabled'],
    [staging.externalListingAiBudget, 0, 'staging.externalListingAiBudget'],
    [staging.paymentTransport, 'memory', 'staging.paymentTransport'],
    [staging.paymentLivemode, false, 'staging.paymentLivemode'],
    [staging.noncriticalSupportFollowupsOverdue, 2,
      'staging.noncriticalSupportFollowupsOverdue'],
    [staging.criticalRuntimeBlocker, false, 'staging.criticalRuntimeBlocker'],
    [staging.rollbackImageAvailable, true, 'staging.rollbackImageAvailable'],
  ]) same(actual, expected, label);
  if (!/^[A-Za-z0-9.-]+\.json$/u.test(staging.deploymentEvidenceFileName ?? '')) {
    fail('staging.deploymentEvidenceFileName must be a safe basename.');
  }

  const pixel = object(evidence.pixel, 'pixel');
  for (const [actual, expected, label] of [
    [pixel.model, 'Pixel 7 Pro', 'pixel.model'],
    [pixel.rawDeviceIdentifierRecorded, false, 'pixel.rawDeviceIdentifierRecorded'],
    [pixel.installedVersionName, '1.0.0', 'pixel.installedVersionName'],
    [pixel.installedVersionCode, versionCode, 'pixel.installedVersionCode'],
    [pixel.dataPreservingUpdate, true, 'pixel.dataPreservingUpdate'],
    [pixel.singleDirectApkInstall, true, 'pixel.singleDirectApkInstall'],
    [pixel.installedApkSha256, apkSha256, 'pixel.installedApkSha256'],
    [pixel.authenticatedColdStart, 'passed', 'pixel.authenticatedColdStart'],
    [pixel.mainDestinationsVerified, 5, 'pixel.mainDestinationsVerified'],
    [pixel.legalDocumentsVerified, 7, 'pixel.legalDocumentsVerified'],
    [pixel.largeTextDestinationsVerified, 5, 'pixel.largeTextDestinationsVerified'],
    [pixel.minimumTouchTargetDp, 48, 'pixel.minimumTouchTargetDp'],
    [pixel.processRestartsVerified, 5, 'pixel.processRestartsVerified'],
    [pixel.systemLightAndDarkApplied, true, 'pixel.systemLightAndDarkApplied'],
    [pixel.customBackgroundsVerified, 4, 'pixel.customBackgroundsVerified'],
    [pixel.accountSurfacesVerified, 9, 'pixel.accountSurfacesVerified'],
    [pixel.twoDistinctEmailVerifiedSyntheticRoles, true,
      'pixel.twoDistinctEmailVerifiedSyntheticRoles'],
    [pixel.listingPublishedAndServerConfirmed, true,
      'pixel.listingPublishedAndServerConfirmed'],
    [pixel.renterDiscovery, true, 'pixel.renterDiscovery'],
    [pixel.nonBindingRequestAndAcceptance, true, 'pixel.nonBindingRequestAndAcceptance'],
    [pixel.pilotSimulationTruthVisibleToBothRoles, true,
      'pixel.pilotSimulationTruthVisibleToBothRoles'],
    [pixel.chatVisible, true, 'pixel.chatVisible'],
    [pixel.principalIsolationAccountAToB, true, 'pixel.principalIsolationAccountAToB'],
    [pixel.fcmForeground, 'passed', 'pixel.fcmForeground'],
    [pixel.fcmBackground, 'passed', 'pixel.fcmBackground'],
    [pixel.fcmTerminated, 'passed', 'pixel.fcmTerminated'],
    [pixel.temporaryBookingCanceled, true, 'pixel.temporaryBookingCanceled'],
    [pixel.temporaryListingEnded, true, 'pixel.temporaryListingEnded'],
    [pixel.protectedOwnerRestored, true, 'pixel.protectedOwnerRestored'],
    [pixel.contractCreated, false, 'pixel.contractCreated'],
    [pixel.reservationCreated, false, 'pixel.reservationCreated'],
    [pixel.paymentCreated, false, 'pixel.paymentCreated'],
    [pixel.realMoneyMoved, false, 'pixel.realMoneyMoved'],
  ]) same(actual, expected, label);

  const notification = object(evidence.notificationEvidence, 'notificationEvidence');
  if (!/^[a-f0-9]{64}$/u.test(notification.screenshotSha256 ?? '')) {
    fail('notificationEvidence.screenshotSha256 is invalid.');
  }
  same(notification.shareItTooNotificationAndIconVisuallyConfirmed, true,
    'notificationEvidence.shareItTooNotificationAndIconVisuallyConfirmed');
  same(notification.containedUnrelatedPersonalNotifications, true,
    'notificationEvidence.containedUnrelatedPersonalNotifications');
  same(notification.retained, false, 'notificationEvidence.retained');
  same(notification.deletedImmediatelyAfterReview, true,
    'notificationEvidence.deletedImmediatelyAfterReview');
  same(notification.recoverableFromThisWork, false,
    'notificationEvidence.recoverableFromThisWork');

  const debt = object(evidence.registryDeliveryDebt, 'registryDeliveryDebt');
  same(debt.status, 'open-release-infrastructure-technical-debt',
    'registryDeliveryDebt.status');
  same(debt.workflowPublishedExactCommitImage, true,
    'registryDeliveryDebt.workflowPublishedExactCommitImage');
  same(debt.serverPulledPublishedImage, false,
    'registryDeliveryDebt.serverPulledPublishedImage');
  same(debt.stagingUsedExactHashVerifiedServerCheckoutBuild, true,
    'registryDeliveryDebt.stagingUsedExactHashVerifiedServerCheckoutBuild');
  same(debt.sameBackendTreeAndImageLabelsVerified, true,
    'registryDeliveryDebt.sameBackendTreeAndImageLabelsVerified');
  same(debt.acceptedAsPermanentReleasePrerequisite, false,
    'registryDeliveryDebt.acceptedAsPermanentReleasePrerequisite');
  if (!String(debt.requiredClosure).includes('reproducible-pull-test')) {
    fail('registryDeliveryDebt requires a reproducible pull-test closure.');
  }

  const boundaries = object(evidence.boundaries, 'boundaries');
  for (const [key, value] of Object.entries(boundaries)) {
    same(value, false, `boundaries.${key}`);
  }

  same(rollover.schemaVersion, 1, 'rollover.schemaVersion');
  same(rollover.kind, 'android-current-rollover-candidate', 'rollover.kind');
  same(rollover.status, 'build-ready-play-internal-upload-pending', 'rollover.status');
  same(rollover.candidate?.artifactSourceHead, candidateSourceHead,
    'rollover.candidate.artifactSourceHead');
  same(rollover.candidate?.versionCode, versionCode, 'rollover.candidate.versionCode');
  same(rollover.artifact?.aabSha256, aabSha256, 'rollover.artifact.aabSha256');
  same(rollover.artifact?.apkSha256, apkSha256, 'rollover.artifact.apkSha256');
  same(rollover.sourceVerification?.githubVerifiedHead, technicalHead,
    'rollover.sourceVerification.githubVerifiedHead');
  same(rollover.sourceVerification?.githubApiImagePublishRunId, 34296797104,
    'rollover.sourceVerification.githubApiImagePublishRunId');
  same(rollover.stagingStateAtReadback?.sourceHead, technicalHead,
    'rollover.stagingStateAtReadback.sourceHead');
  same(rollover.stagingStateAtReadback?.clientBuild, '1.0.0+2026090902',
    'rollover.stagingStateAtReadback.clientBuild');
  same(rollover.deviceVerification?.preferredDeviceExactApkInstalled, true,
    'rollover.deviceVerification.preferredDeviceExactApkInstalled');
  same(rollover.deviceVerification?.preferredDeviceDataPreserved, true,
    'rollover.deviceVerification.preferredDeviceDataPreserved');
  same(rollover.deviceVerification?.authenticatedPilotMatrix,
    'passed-non-binding-two-role-pixel-core',
    'rollover.deviceVerification.authenticatedPilotMatrix');
  same(rollover.evidenceRef,
    'docs/evidence/release-readiness/wp64-staging-security-parity-and-pixel-candidate-20260909.json',
    'rollover.evidenceRef');
  same(rollover.handoverRef,
    'docs/operations/WP64_STAGING_SECURITY_PARITY_AND_PIXEL_CANDIDATE_2026-09-09.md',
    'rollover.handoverRef');

  return Object.freeze({
    technicalHead,
    candidateSourceHead,
    versionCode,
    stagingDeployed: true,
    pixelVerified: true,
    playInternalUploadPending: true,
  });
}

export function validateWp64Files({ root }) {
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/wp64-staging-security-parity-and-pixel-candidate-20260909.json',
  ), 'utf8'));
  const rollover = JSON.parse(readFileSync(resolve(
    root,
    'store/google-play/rollover-candidate-2026090902.json',
  ), 'utf8'));
  return validateWp64StagingSecurityParityAndPixelCandidate({ evidence, rollover });
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateWp64Files({ root });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
