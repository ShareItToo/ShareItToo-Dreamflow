#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validateCurrentHeadAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const expectedHardStops = [
  'productionRelease',
  'openTestingRelease',
  'closedTestingRelease',
  'sendForReview',
  'publicRollout',
  'differentArtifact',
  'credentialsInRepository',
];

const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/i;

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
  if (actual !== expected) fail(`${label} does not match the bound candidate.`);
}

function assertNoCredentials(value, path = 'handoff') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCredentials(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
      fail(`${path} must not contain email addresses.`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKey.test(key)) fail(`${path}.${key} is a forbidden credential-shaped field.`);
    assertNoCredentials(entry, `${path}.${key}`);
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} could not be read as JSON: ${error.message}`);
  }
}

function safeEvidencePath(repositoryRoot, reference, label) {
  if (typeof reference !== 'string' ||
      !/^docs\/evidence\/b11\/[a-zA-Z0-9._-]+\.json$/u.test(reference)) {
    fail(`${label} must reference a safe B11 evidence JSON file.`);
  }
  const path = resolve(repositoryRoot, reference);
  if (!path.startsWith(`${realpathSync(repositoryRoot)}/`)) {
    fail(`${label} left the repository.`);
  }
  return path;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export const playApi36ReplacementStatus =
  'superseded-play-api36-replacement-pending';

export const candidateRolloverNonRuntimePrefixes = Object.freeze([
  '.github/',
  'backend/test/',
  'docs/',
  'scripts/',
  'store/',
  'test/',
  'tool/',
]);

export const candidateRolloverNonRuntimeExactPaths = Object.freeze([
  'AGENTS.md',
]);

export function candidateRolloverRuntimeDrift(changedPaths) {
  return [...changedPaths].filter((path) =>
    !candidateRolloverNonRuntimeExactPaths.includes(path)
    && !candidateRolloverNonRuntimePrefixes.some((prefix) => path.startsWith(prefix)));
}

export const playApi36ReplacementRuntimePaths = Object.freeze([
  'android/app/build.gradle',
  'android/build.gradle',
  'android/settings.gradle',
  'lib/config/private_pilot_config.dart',
  'pubspec.yaml',
]);

export function validatePlayApi36ReplacementTransition({
  repositoryRoot,
  rollover,
  changedPaths,
}) {
  const candidate = object(rollover.candidate, 'current rollover candidate.candidate');
  const replacement = object(
    rollover.replacement,
    'current rollover candidate.replacement',
  );
  same(rollover.status, playApi36ReplacementStatus,
    'current rollover candidate.status');
  same(candidate.compileSdkVersion, 35,
    'superseded candidate.compileSdkVersion');
  same(candidate.targetSdkVersion, 35,
    'superseded candidate.targetSdkVersion');
  same(replacement.reason, 'google-play-target-api-36-required-after-2026-08-31',
    'replacement.reason');
  same(replacement.versionName, candidate.versionName, 'replacement.versionName');
  if (!/^\d{10}$/u.test(replacement.versionCode ?? '')
      || BigInt(replacement.versionCode) <= BigInt(candidate.versionCode ?? '0')) {
    fail('replacement.versionCode must be a newer ten-digit candidate build.');
  }
  same(replacement.compileSdkVersion, 36, 'replacement.compileSdkVersion');
  same(replacement.targetSdkVersion, 36, 'replacement.targetSdkVersion');
  same(replacement.androidGradlePluginVersion, '8.9.1',
    'replacement.androidGradlePluginVersion');
  same(replacement.uploadAttempted, false, 'replacement.uploadAttempted');
  same(replacement.activationAttempted, false, 'replacement.activationAttempted');

  const expectedRuntimePaths = new Set(playApi36ReplacementRuntimePaths);
  const actualRuntimePaths = new Set(changedPaths.filter((path) =>
    !['.github/', 'docs/', 'scripts/', 'store/', 'test/', 'tool/']
      .some((prefix) => path.startsWith(prefix))));
  for (const path of expectedRuntimePaths) {
    if (!actualRuntimePaths.has(path)) {
      fail(`Play API 36 replacement is missing required runtime change: ${path}.`);
    }
  }
  const unexpectedRuntimePaths = [...actualRuntimePaths].filter(
    (path) => !expectedRuntimePaths.has(path),
  );
  if (unexpectedRuntimePaths.length > 0) {
    fail(`Play API 36 replacement contains unexpected runtime change: ${unexpectedRuntimePaths[0]}.`);
  }

  const pubspec = readFileSync(resolve(repositoryRoot, 'pubspec.yaml'), 'utf8');
  if (!new RegExp(
    `^version:\\s+${replacement.versionName.replaceAll('.', '\\.')}`
      + `\\+${replacement.versionCode}$`,
    'mu',
  ).test(pubspec)) {
    fail('pubspec.yaml is not bound to the declared Play API 36 replacement.');
  }
  const appGradle = readFileSync(resolve(repositoryRoot, 'android/app/build.gradle'), 'utf8');
  if (!/^\s*compileSdk\s*=\s*36\s*$/mu.test(appGradle)
      || !/^\s*targetSdk\s*=\s*36\s*$/mu.test(appGradle)) {
    fail('Android app compileSdk and targetSdk must both be exactly 36.');
  }
  const rootGradle = readFileSync(resolve(repositoryRoot, 'android/build.gradle'), 'utf8');
  if (!/classpath ['"]com\.android\.tools\.build:gradle:8\.9\.1['"]/u.test(rootGradle)
      || !/^\s*compileSdkVersion\s+36\s*$/mu.test(rootGradle)) {
    fail('Android root build must enforce AGP 8.9.1 and compileSdkVersion 36.');
  }
  const settingsGradle = readFileSync(resolve(repositoryRoot, 'android/settings.gradle'), 'utf8');
  if (!/id ['"]com\.android\.application['"] version ['"]8\.9\.1['"] apply false/u
    .test(settingsGradle)) {
    fail('Android settings must pin the application plugin to AGP 8.9.1.');
  }
  const pilotConfig = readFileSync(
    resolve(repositoryRoot, 'lib/config/private_pilot_config.dart'),
    'utf8',
  );
  if (!pilotConfig.includes(`defaultValue: '${replacement.versionName}+${replacement.versionCode}'`)) {
    fail('Private pilot client build is not bound to the Play API 36 replacement.');
  }
  return Object.freeze({
    versionName: replacement.versionName,
    buildNumber: replacement.versionCode,
    compileSdkVersion: replacement.compileSdkVersion,
    targetSdkVersion: replacement.targetSdkVersion,
  });
}

export function validateGooglePlayInternalHandoff({
  repositoryRoot,
  archiveRoot = resolve(homedir(), 'Library', 'Application Support', 'ShareItToo', 'release', 'android'),
  handoffPath = resolve(repositoryRoot, 'store', 'google-play', 'internal-upload-handoff.json'),
  evidencePath = null,
  liveReadinessPath = null,
  internalReleasePath = null,
  shortDescriptionPath = null,
  allowMissingPrivateArtifact = false,
}) {
  const handoff = object(readJson(handoffPath, 'Google Play handoff'), 'handoff');
  const resolvedEvidencePath = evidencePath ?? resolve(repositoryRoot, handoff.evidenceRef ?? '');
  const evidence = object(readJson(resolvedEvidencePath, 'candidate evidence'), 'candidate evidence');
  assertNoCredentials(handoff);

  same(handoff.schemaVersion, 1, 'schemaVersion');
  const supersededStatuses = new Set([
    'superseded-privacy-rescan-failed-replacement-pending',
    'superseded-product-truth-failed-replacement-pending',
  ]);
  const superseded = supersededStatuses.has(handoff.status);
  const internalActiveStatuses = new Set([
    'internal-release-active-store-install-pending',
    'internal-release-active-store-install-verified',
  ]);
  const internalActive = internalActiveStatuses.has(handoff.status);
  const storeInstallVerified =
    handoff.status === 'internal-release-active-store-install-verified';
  if (!superseded && !internalActive &&
      handoff.status !== 'verified-artifact-ready-immediate-reverification-pending') {
    fail('status must describe either the verified artifact or its fail-closed supersession.');
  }
  same(handoff.submissionAllowed, false, 'submissionAllowed');
  same(handoff.track, 'internal', 'track');
  same(handoff.containsSecrets, false, 'containsSecrets');
  same(handoff.containsReviewCredentials, false, 'containsReviewCredentials');
  if (superseded) {
    if (!/^\d{10}$/u.test(handoff.replacementBuildNumber ?? '')
        || BigInt(handoff.replacementBuildNumber) <= BigInt(handoff.candidate?.buildNumber ?? '0')) {
      fail('replacementBuildNumber must be a newer ten-digit candidate build.');
    }
    const supersessionPath = resolve(repositoryRoot, handoff.supersessionEvidenceRef ?? '');
    const supersession = object(readJson(supersessionPath, 'supersession evidence'), 'supersession evidence');
    const expectedSupersessionStatus = handoff.status.startsWith('superseded-product-truth')
      ? 'superseded-product-truth-failed'
      : 'superseded-privacy-rescan-failed';
    same(supersession.status, expectedSupersessionStatus, 'supersession status');
    same(supersession.remediation?.replacementBuildNumber, handoff.replacementBuildNumber,
      'supersession replacement build number');
    same(supersession.boundaries?.uploadedToStore, false, 'supersession uploadedToStore');
    same(supersession.boundaries?.submissionAllowed, false, 'supersession submissionAllowed');
  }

  const candidate = object(handoff.candidate, 'candidate');
  const evidenceCandidate = object(evidence.candidate, 'candidate evidence.candidate');
  const evidenceAndroid = object(evidence.android, 'candidate evidence.android');
  same(candidate.applicationId, evidenceCandidate.applicationId, 'applicationId');
  same(candidate.versionName, evidenceCandidate.versionName, 'versionName');
  same(candidate.buildNumber, evidenceCandidate.buildNumber, 'buildNumber');
  same(candidate.commit, evidenceCandidate.commit, 'commit');
  same(candidate.apiBaseUrl, evidenceCandidate.apiBaseUrl, 'apiBaseUrl');
  same(candidate.firebaseConfigured, true, 'firebaseConfigured');
  same(candidate.aabSha256, evidenceAndroid.aabSha256, 'aabSha256');
  same(candidate.uploadCertificateSha256, evidenceAndroid.signingCertificateSha256,
    'uploadCertificateSha256');

  const artifact = object(handoff.artifact, 'artifact');
  if (!/^[a-zA-Z0-9._-]+$/.test(artifact.archiveDirectoryName) ||
      !/^[a-zA-Z0-9._-]+\.aab$/.test(artifact.fileName)) {
    fail('Artifact location must use safe fixed names.');
  }
  same(artifact.ownerOnlyPermissionsRequired, true, 'ownerOnlyPermissionsRequired');
  const artifactPath = resolve(archiveRoot, artifact.archiveDirectoryName, artifact.fileName);
  let artifactVerified = false;
  if (!existsSync(archiveRoot) || !existsSync(artifactPath)) {
    if (!allowMissingPrivateArtifact) {
      fail('The bound AAB is unavailable in the private release archive.');
    }
  } else {
    const archiveReal = realpathSync(archiveRoot);
    const metadata = lstatSync(artifactPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail('The bound AAB must be a normal file.');
    if ((metadata.mode & 0o077) !== 0) fail('The bound AAB must have owner-only permissions.');
    if (!realpathSync(artifactPath).startsWith(`${archiveReal}/`)) fail('The bound AAB left the private archive.');
    same(sha256File(artifactPath), candidate.aabSha256, 'archived AAB SHA-256');
    artifactVerified = true;
  }

  const releaseDraft = object(handoff.releaseDraft, 'releaseDraft');
  same(releaseDraft.name, `1.0.0-internal-${candidate.buildNumber}`, 'releaseDraft.name');
  same(releaseDraft.notesPath, 'store/google-play/de-DE/internal_release_notes.txt',
    'releaseDraft.notesPath');
  same(releaseDraft.language, 'de-DE', 'releaseDraft.language');
  same(releaseDraft.saveOnly, !internalActive, 'releaseDraft.saveOnly');
  same(releaseDraft.rolloutAllowed, internalActive, 'releaseDraft.rolloutAllowed');
  const notesPath = resolve(repositoryRoot, releaseDraft.notesPath);
  if (!notesPath.startsWith(`${realpathSync(repositoryRoot)}/`)) {
    fail('Release notes left the repository.');
  }
  const notes = readFileSync(notesPath, 'utf8').trim();
  if (!/interner ShareItToo-Test:/iu.test(notes) ||
      !notes.includes('ausschließlich Staging und Testzahlungen')) {
    fail('Release notes must describe the bounded internal Staging build.');
  }

  const preUpload = object(handoff.preUploadGates, 'preUploadGates');
  same(preUpload.personalIdentityVerification, 'verified', 'personalIdentityVerification');
  same(preUpload.deviceVerification, 'verified', 'deviceVerification');
  same(preUpload.phoneVerification, 'verified', 'phoneVerification');
  same(preUpload.developerProgramPoliciesDeclaration, 'accepted-with-owner-approval',
    'developerProgramPoliciesDeclaration');
  same(preUpload.playAppSigningTerms, 'accepted-with-owner-approval', 'playAppSigningTerms');
  same(preUpload.usExportLawsDeclaration, 'accepted-with-owner-approval',
    'usExportLawsDeclaration');
  same(preUpload.playAppRecordCreated, true, 'playAppRecordCreated');
  same(preUpload.immediateArtifactReverification, internalActive,
    'immediateArtifactReverification');

  const expectedPostUploadChecks = {
    uploadedArtifactHashRecorded: internalActive ?
      'passed-exact-bound-candidate' : 'pending',
    playAppSigningFingerprintRecorded: 'passed-pre-upload-console',
    uploadWarningsReviewed: internalActive ?
      'passed-only-missing-testers-warning-resolved' : 'pending',
    internalStoreInstallCompleted: storeInstallVerified ?
      'passed-google-play-installer' : 'pending',
  };
  const postUploadChecks = object(handoff.postUploadChecks, 'postUploadChecks');
  for (const [key, value] of Object.entries(expectedPostUploadChecks)) {
    same(postUploadChecks[key], value, `postUploadChecks.${key}`);
  }
  const crashAssignment = postUploadChecks.crashlyticsCandidateAssignmentVerified;
  if (!['pending', 'passed-exact-controlled-event'].includes(crashAssignment)) {
    fail('postUploadChecks.crashlyticsCandidateAssignmentVerified has an invalid state.');
  }
  if (crashAssignment === 'passed-exact-controlled-event') {
    const crashReleasePath = safeEvidencePath(
      repositoryRoot,
      handoff.crashReleaseEvidenceRef,
      'crashReleaseEvidenceRef',
    );
    const crashRelease = object(
      readJson(crashReleasePath, 'Crashlytics release evidence'),
      'Crashlytics release evidence',
    );
    assertNoCredentials(crashRelease, 'Crashlytics release evidence');
    same(crashRelease.kind, 'release-check', 'Crashlytics release evidence.kind');
    same(crashRelease.status, 'passed', 'Crashlytics release evidence.status');
    same(crashRelease.candidate?.buildNumber, candidate.buildNumber,
      'Crashlytics release evidence.candidate.buildNumber');
    same(crashRelease.candidate?.commit, candidate.commit,
      'Crashlytics release evidence.candidate.commit');
    same(crashRelease.releaseCheck?.id, 'crashReleaseMapping',
      'Crashlytics release evidence.releaseCheck.id');
    same(crashRelease.releaseCheck?.status, 'passed',
      'Crashlytics release evidence.releaseCheck.status');
    same(crashRelease.boundaries?.productionCrashGenerated, false,
      'Crashlytics release evidence.boundaries.productionCrashGenerated');
    same(crashRelease.boundaries?.controlledStagingEventGenerated, true,
      'Crashlytics release evidence.boundaries.controlledStagingEventGenerated');
  }
  same(postUploadChecks.sharedChatStability, 'passed-exact-build',
    'postUploadChecks.sharedChatStability');
  same(postUploadChecks.messageComposerKeyboard, 'pending-exact-build',
    'postUploadChecks.messageComposerKeyboard');
  same(postUploadChecks.messageSendPersistence, 'passed-exact-build',
    'postUploadChecks.messageSendPersistence');
  same(postUploadChecks.messageRefreshPattern, 'passed-exact-build',
    'postUploadChecks.messageRefreshPattern');

  const postUploadEvidenceRefs = object(
    handoff.postUploadEvidenceRefs,
    'postUploadEvidenceRefs',
  );
  const sharedChatReview = object(readJson(safeEvidencePath(
    repositoryRoot,
    postUploadEvidenceRefs.sharedChatReviewAccess,
    'postUploadEvidenceRefs.sharedChatReviewAccess',
  ), 'shared Chat review evidence'), 'shared Chat review evidence');
  same(sharedChatReview.kind, 'store-review-access-diagnostic',
    'shared Chat review evidence.kind');
  same(sharedChatReview.candidate?.buildNumber, candidate.buildNumber,
    'shared Chat review evidence.candidate.buildNumber');
  same(sharedChatReview.candidate?.commit, candidate.commit,
    'shared Chat review evidence.candidate.commit');
  same(sharedChatReview.checks?.sharedChatVisibleToBothRoles, true,
    'shared Chat review evidence.checks.sharedChatVisibleToBothRoles');
  same(sharedChatReview.checks?.sharedChatReadableByBothRoles, true,
    'shared Chat review evidence.checks.sharedChatReadableByBothRoles');
  same(sharedChatReview.boundaries?.containsSecrets, false,
    'shared Chat review evidence.boundaries.containsSecrets');
  same(sharedChatReview.boundaries?.containsEmailAddresses, false,
    'shared Chat review evidence.boundaries.containsEmailAddresses');
  same(sharedChatReview.boundaries?.containsTokens, false,
    'shared Chat review evidence.boundaries.containsTokens');

  const sharedChatDeepLink = object(readJson(safeEvidencePath(
    repositoryRoot,
    postUploadEvidenceRefs.sharedChatDeepLink,
    'postUploadEvidenceRefs.sharedChatDeepLink',
  ), 'shared Chat deep-link evidence'), 'shared Chat deep-link evidence');
  assertNoCredentials(sharedChatDeepLink, 'shared Chat deep-link evidence');
  same(sharedChatDeepLink.kind, 'android-authenticated-deep-link-diagnostic',
    'shared Chat deep-link evidence.kind');
  same(sharedChatDeepLink.candidate?.buildNumber, candidate.buildNumber,
    'shared Chat deep-link evidence.candidate.buildNumber');
  same(sharedChatDeepLink.candidate?.commit, candidate.commit,
    'shared Chat deep-link evidence.candidate.commit');
  same(sharedChatDeepLink.installed?.delivery, 'google-play-split',
    'shared Chat deep-link evidence.installed.delivery');
  same(sharedChatDeepLink.tests?.authenticatedCustomSchemeChat?.status, 'passed',
    'shared Chat deep-link evidence.tests.authenticatedCustomSchemeChat.status');

  const messageRecovery = object(readJson(safeEvidencePath(
    repositoryRoot,
    postUploadEvidenceRefs.messagePersistenceAndRefresh,
    'postUploadEvidenceRefs.messagePersistenceAndRefresh',
  ), 'message persistence evidence'), 'message persistence evidence');
  assertNoCredentials(messageRecovery, 'message persistence evidence');
  same(messageRecovery.kind, 'android-offline-realtime-diagnostic',
    'message persistence evidence.kind');
  same(messageRecovery.candidate?.buildNumber, candidate.buildNumber,
    'message persistence evidence.candidate.buildNumber');
  same(messageRecovery.candidate?.commit, candidate.commit,
    'message persistence evidence.candidate.commit');
  same(messageRecovery.installed?.delivery, 'google-play-split',
    'message persistence evidence.installed.delivery');
  same(messageRecovery.tests?.messageHiddenWhileOffline?.status, 'passed',
    'message persistence evidence.tests.messageHiddenWhileOffline.status');
  same(messageRecovery.tests?.sameProcessRealtimeRecovery?.status, 'passed',
    'message persistence evidence.tests.sameProcessRealtimeRecovery.status');
  same(messageRecovery.diagnostic?.appProcessSurvived, true,
    'message persistence evidence.diagnostic.appProcessSurvived');
  same(messageRecovery.diagnostic?.networkRestored, true,
    'message persistence evidence.diagnostic.networkRestored');
  same(messageRecovery.boundaries?.messageSent, true,
    'message persistence evidence.boundaries.messageSent');
  if (internalActive) {
    const resolvedInternalReleasePath = internalReleasePath ?? safeEvidencePath(
      repositoryRoot,
      handoff.internalReleaseEvidenceRef,
      'internalReleaseEvidenceRef',
    );
    const internalEvidence = object(readJson(
      resolvedInternalReleasePath,
      'internal release evidence'), 'internal release evidence');
    assertNoCredentials(internalEvidence, 'internal release evidence');
    same(internalEvidence.kind, 'google-play-internal-release-active',
      'internal release evidence.kind');
    same(internalEvidence.status, storeInstallVerified ?
      'available-and-store-install-verified' : 'available-to-internal-testers',
      'internal release evidence.status');
    same(internalEvidence.candidate?.buildNumber, candidate.buildNumber,
      'internal release evidence.candidate.buildNumber');
    same(internalEvidence.candidate?.aabSha256, candidate.aabSha256,
      'internal release evidence.candidate.aabSha256');
    same(internalEvidence.release?.track, 'internal',
      'internal release evidence.release.track');
    same(internalEvidence.release?.statusObserved, 'available-to-internal-testers',
      'internal release evidence.release.statusObserved');
    same(internalEvidence.validation?.errorCount, 0,
      'internal release evidence.validation.errorCount');
    same(internalEvidence.testers?.emailListCreated, true,
      'internal release evidence.testers.emailListCreated');
    same(internalEvidence.testers?.joinLinkAvailable, true,
      'internal release evidence.testers.joinLinkAvailable');
    same(internalEvidence.postReleaseChecks?.playStoreInstallCompleted,
      storeInstallVerified,
      'internal release evidence.postReleaseChecks.playStoreInstallCompleted');
    same(internalEvidence.postReleaseChecks?.installedVersionVerified,
      storeInstallVerified,
      'internal release evidence.postReleaseChecks.installedVersionVerified');
    if (storeInstallVerified) {
      same(internalEvidence.postReleaseChecks?.installedVersionName,
        candidate.versionName,
        'internal release evidence.postReleaseChecks.installedVersionName');
      same(internalEvidence.postReleaseChecks?.installedBuildNumber,
        candidate.buildNumber,
        'internal release evidence.postReleaseChecks.installedBuildNumber');
      same(internalEvidence.postReleaseChecks?.installerPackage,
        'com.android.vending',
        'internal release evidence.postReleaseChecks.installerPackage');
      same(internalEvidence.postReleaseChecks?.coldLaunchCompleted, true,
        'internal release evidence.postReleaseChecks.coldLaunchCompleted');
      same(internalEvidence.postReleaseChecks?.coldLaunchCrashObserved, false,
        'internal release evidence.postReleaseChecks.coldLaunchCrashObserved');
      same(internalEvidence.postReleaseChecks?.stagingFeedLoaded, true,
        'internal release evidence.postReleaseChecks.stagingFeedLoaded');
    }
    const controlledCrashDiagnostic =
      internalEvidence.exactCandidateDiagnostics?.controlledCrashDiagnostic;
    if (crashAssignment === 'passed-exact-controlled-event') {
      same(
        controlledCrashDiagnostic,
        'passed-once-exact-console-assignment',
        'internal release evidence.exactCandidateDiagnostics.controlledCrashDiagnostic',
      );
    } else if (!['not-sent', 'sent-once-console-assignment-pending'].includes(
      controlledCrashDiagnostic,
    )) {
      fail('Pending Crashlytics assignment must truthfully record whether the diagnostic was sent.');
    }
    same(internalEvidence.boundaries?.internalReleaseActivated, true,
      'internal release evidence.boundaries.internalReleaseActivated');
    for (const key of [
      'closedTestingStarted', 'openTestingStarted', 'productionChanged',
      'publicRolloutStarted', 'sentForProductionReview', 'containsSecrets',
      'containsEmailAddresses', 'containsAccountIdentifiers',
    ]) {
      same(internalEvidence.boundaries?.[key], false,
        `internal release evidence.boundaries.${key}`);
    }
  }
  const hardStops = object(handoff.hardStops, 'hardStops');
  for (const key of expectedHardStops) same(hardStops[key], true, `hardStops.${key}`);

  const resolvedLiveReadinessPath = liveReadinessPath ?? safeEvidencePath(
    repositoryRoot,
    handoff.preUploadLiveReadinessEvidenceRef,
    'preUploadLiveReadinessEvidenceRef',
  );
  const live = object(readJson(resolvedLiveReadinessPath, 'pre-upload live readiness'),
    'pre-upload live readiness');
  assertNoCredentials(live, 'pre-upload live readiness');
  same(live.schemaVersion, 1, 'pre-upload live readiness.schemaVersion');
  same(live.kind, 'google-play-pre-upload-live-readiness', 'pre-upload live readiness.kind');
  same(
    live.status,
    superseded ? handoff.status : 'ready-awaiting-explicit-internal-upload-approval',
    'pre-upload live readiness.status',
  );
  if (typeof live.capturedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(live.capturedAt) ||
      !Number.isFinite(Date.parse(live.capturedAt))) {
    fail('pre-upload live readiness.capturedAt must be a UTC RFC 3339 timestamp.');
  }
  const liveCandidate = object(live.candidate, 'pre-upload live readiness.candidate');
  for (const key of ['applicationId', 'versionName', 'uploadCertificateSha256']) {
    same(liveCandidate[key], candidate[key], `pre-upload live readiness.candidate.${key}`);
  }
  const readinessReuse = handoff.preUploadLiveReadinessReuse;
  if (readinessReuse === undefined) {
    for (const key of ['buildNumber', 'commit', 'aabSha256']) {
      same(liveCandidate[key], candidate[key], `pre-upload live readiness.candidate.${key}`);
    }
  } else {
    const reuse = object(readinessReuse, 'preUploadLiveReadinessReuse');
    same(reuse.sourceBuildNumber, liveCandidate.buildNumber,
      'preUploadLiveReadinessReuse.sourceBuildNumber');
    same(reuse.scope, 'account-console-gates-only',
      'preUploadLiveReadinessReuse.scope');
    same(reuse.exactCandidateReverified, true,
      'preUploadLiveReadinessReuse.exactCandidateReverified');
    if (!internalActive
        || !/^\d{10}$/u.test(liveCandidate.buildNumber ?? '')
        || BigInt(liveCandidate.buildNumber) >= BigInt(candidate.buildNumber)) {
      fail('Pre-upload live readiness may only reuse older account and Console gates for an active exact candidate.');
    }
  }
  same(
    liveCandidate.playAppSigningCertificateSha256,
    '36488abf86c51da07ab2258f31b00e2f1ba8a36d076107b9f006376ade80b956',
    'pre-upload live readiness.candidate.playAppSigningCertificateSha256',
  );

  const consoleState = object(live.googlePlayConsole, 'pre-upload live readiness.googlePlayConsole');
  same(consoleState.appStatus, 'draft', 'pre-upload live readiness.googlePlayConsole.appStatus');
  const internal = object(consoleState.internalTesting,
    'pre-upload live readiness.googlePlayConsole.internalTesting');
  const replacementPending = internal.status === 'active-existing-release-replacement-pending';
  if (!replacementPending && internal.status !== 'inactive-draft-release') {
    fail('pre-upload live readiness.googlePlayConsole.internalTesting.status is unsupported.');
  }
  const expectedInternal = replacementPending ? {
    status: 'active-existing-release-replacement-pending',
    draftReleaseShellPresent: true,
    completedTaskCount: 3,
    totalTaskCount: 3,
    maximumTesterCount: 100,
    emailListCreated: true,
    publishedJoinLinkAvailable: true,
    uploadedBundleCount: 1,
  } : {
    status: 'inactive-draft-release',
    draftReleaseShellPresent: true,
    completedTaskCount: 1,
    totalTaskCount: 3,
    maximumTesterCount: 100,
    emailListCreated: false,
    publishedJoinLinkAvailable: false,
    uploadedBundleCount: 0,
  };
  for (const [key, value] of Object.entries(expectedInternal)) {
    same(internal[key], value, `pre-upload live readiness.googlePlayConsole.internalTesting.${key}`);
  }
  if (replacementPending) {
    if (!/^\d{10}$/u.test(internal.existingReleaseBuildNumber ?? '') ||
        BigInt(internal.existingReleaseBuildNumber) >= BigInt(candidate.buildNumber)) {
      fail('pre-upload live readiness existing release must be an older ten-digit build.');
    }
  }
  const closed = object(consoleState.closedTesting,
    'pre-upload live readiness.googlePlayConsole.closedTesting');
  const expectedClosed = {
    status: 'locked-app-setup-incomplete',
    minimumContinuousTesterCount: 12,
    minimumConsecutiveDays: 14,
    currentOptedInTesterCount: 0,
    productionAccessAllowed: false,
  };
  for (const [key, value] of Object.entries(expectedClosed)) {
    same(closed[key], value, `pre-upload live readiness.googlePlayConsole.closedTesting.${key}`);
  }
  const appContent = object(consoleState.appContent,
    'pre-upload live readiness.googlePlayConsole.appContent');
  same(appContent.completedTaskCount, replacementPending ? 9 : 8,
    'pre-upload live readiness.googlePlayConsole.appContent.completedTaskCount');
  same(appContent.totalTaskCount, 11,
    'pre-upload live readiness.googlePlayConsole.appContent.totalTaskCount');
  same(
    [...(appContent.openTasks ?? [])].sort().join(','),
    (replacementPending ? ['privacy-policy', 'data-safety'] :
      ['privacy-policy', 'data-safety', 'store-listing']).sort().join(','),
    'pre-upload live readiness.googlePlayConsole.appContent.openTasks',
  );
  const privacyPolicy = object(consoleState.privacyPolicy,
    'pre-upload live readiness.googlePlayConsole.privacyPolicy');
  const expectedPrivacyPolicy = {
    urlSaved: false,
    preparedUrl: 'https://shareittoo.com/privacy',
    publicRouteReleaseReady: false,
  };
  for (const [key, value] of Object.entries(expectedPrivacyPolicy)) {
    same(privacyPolicy[key], value, `pre-upload live readiness.googlePlayConsole.privacyPolicy.${key}`);
  }
  const dataSafety = object(consoleState.dataSafety,
    'pre-upload live readiness.googlePlayConsole.dataSafety');
  const expectedDataSafety = {
    currentStep: 1,
    totalSteps: 5,
    draftSaved: false,
    preparedAnswerMatrixAvailable: true,
  };
  for (const [key, value] of Object.entries(expectedDataSafety)) {
    same(dataSafety[key], value, `pre-upload live readiness.googlePlayConsole.dataSafety.${key}`);
  }
  const listing = object(consoleState.storeListing,
    'pre-upload live readiness.googlePlayConsole.storeListing');
  const expectedListing = replacementPending ? {
    language: 'de-DE',
    textFieldsPresent: true,
    shortDescriptionConsoleWarning: 'none',
    shortDescriptionLocalRemediationPrepared: true,
    appIconUploaded: true,
    featureGraphicUploaded: true,
    phoneScreenshotsUploaded: 4,
    validatedLocalPhoneScreenshots: 4,
    savedInThisObservation: false,
    previouslySaved: true,
  } : {
    language: 'de-DE',
    textFieldsPresent: true,
    shortDescriptionConsoleWarning: 'en-dash-instead-of-em-dash',
    shortDescriptionLocalRemediationPrepared: true,
    appIconUploaded: false,
    featureGraphicUploaded: false,
    phoneScreenshotsUploaded: 0,
    validatedLocalPhoneScreenshots: superseded ? 0 : 4,
    savedInThisObservation: false,
  };
  for (const [key, value] of Object.entries(expectedListing)) {
    same(listing[key], value, `pre-upload live readiness.googlePlayConsole.storeListing.${key}`);
  }
  const shortDescription = readFileSync(
    shortDescriptionPath ?? resolve(repositoryRoot, 'store/google-play/de-DE/short_description.txt'),
    'utf8',
  ).trim();
  same(
    shortDescription,
    'Miete und vermiete Dinge in deiner Nähe — mit Buchung, Chat und Übergabe.',
    'prepared Google Play short description',
  );
  if (shortDescription.includes('–') || shortDescription.includes('--')) {
    fail('The prepared Google Play short description must use an em dash.');
  }
  const signing = object(consoleState.appSigning,
    'pre-upload live readiness.googlePlayConsole.appSigning');
  const expectedSigning = {
    releasesSignedByPlay: true,
    playAppSigningFingerprintObserved: true,
    uploadCertificateFingerprintVisibleAfterFirstBundle: replacementPending,
    automaticProtectionActive: true,
    playIntegrityApiIntegrated: false,
    storeListingDeviceChecksEnabled: false,
  };
  for (const [key, value] of Object.entries(expectedSigning)) {
    same(signing[key], value, `pre-upload live readiness.googlePlayConsole.appSigning.${key}`);
  }

  const crossChecks = object(live.localCrossChecks, 'pre-upload live readiness.localCrossChecks');
  same(
    crossChecks.assetLinksWithUploadAndPlayFingerprints,
    replacementPending ? 'passed-deployed' : 'passed-local-not-deployed',
    'pre-upload live readiness.localCrossChecks.assetLinksWithUploadAndPlayFingerprints',
  );
  const device = object(crossChecks.connectedAndroidDevice,
    'pre-upload live readiness.localCrossChecks.connectedAndroidDevice');
  same(device.manufacturer, 'Google', 'pre-upload live readiness.connectedAndroidDevice.manufacturer');
  same(device.model, 'Pixel 7 Pro', 'pre-upload live readiness.connectedAndroidDevice.model');
  same(device.osVersion, '16', 'pre-upload live readiness.connectedAndroidDevice.osVersion');
  same(device.installedVersionName, candidate.versionName,
    'pre-upload live readiness.connectedAndroidDevice.installedVersionName');
  same(device.installedBuildNumber,
    readinessReuse === undefined ? candidate.buildNumber : liveCandidate.buildNumber,
    'pre-upload live readiness.connectedAndroidDevice.installedBuildNumber');
  same(device.installMethod, 'direct-apk-diagnostic',
    'pre-upload live readiness.connectedAndroidDevice.installMethod');
  same(device.storeInstall, 'pending', 'pre-upload live readiness.connectedAndroidDevice.storeInstall');

  const decisionGate = object(live.decisionGate, 'pre-upload live readiness.decisionGate');
  const expectedDecisionGate = {
    explicitCurrentInternalUploadApprovalRequired: true,
    submissionAllowed: false,
    saveDraftAllowed: false,
    rolloutAllowed: false,
    testerInvitationsAllowed: false,
  };
  for (const [key, value] of Object.entries(expectedDecisionGate)) {
    same(decisionGate[key], value, `pre-upload live readiness.decisionGate.${key}`);
  }

  const boundaries = object(live.boundaries, 'pre-upload live readiness.boundaries');
  const expectedBoundaries = {
    browserReadOnly: true,
    uploadedToStore: false,
    releaseMetadataSaved: false,
    testerListChanged: false,
    testerInvitationSent: false,
    productionChanged: false,
    publicRoutesChanged: false,
    containsTesterPersonalData: false,
    containsAccountIdentifiers: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
  };
  for (const [key, value] of Object.entries(expectedBoundaries)) {
    same(boundaries[key], value, `pre-upload live readiness.boundaries.${key}`);
  }

  return {
    artifactPath,
    aabSha256: candidate.aabSha256,
    buildNumber: candidate.buildNumber,
    releaseName: releaseDraft.name,
    releaseNotes: notes,
    status: handoff.status,
    artifactVerified,
  };
}

async function runCli() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const ciMetadataOnly = process.argv.slice(2).includes('--ci-metadata-only');
  const candidateRollover = process.argv.slice(2).includes('--candidate-rollover');
  if (process.argv.slice(2).some((value) =>
    !['--ci-metadata-only', '--candidate-rollover'].includes(value))) {
    fail('Unknown Google Play internal handoff argument.');
  }
  if (ciMetadataOnly && candidateRollover) {
    fail('Google Play internal handoff modes are mutually exclusive.');
  }
  if (ciMetadataOnly && process.env.CI !== 'true') {
    fail('--ci-metadata-only is restricted to the isolated CI environment.');
  }
  if (candidateRollover && process.env.SIT_ALLOW_CANDIDATE_ROLLOVER !== '1') {
    fail('--candidate-rollover requires the explicit candidate-rollover environment.');
  }
  let rolloverCandidate = null;
  let rolloverMode = null;
  if (candidateRollover) {
    const rollover = object(readJson(
      resolve(repositoryRoot, 'store', 'google-play', 'current-rollover-candidate.json'),
      'current rollover candidate',
    ), 'current rollover candidate');
    const candidate = object(rollover.candidate, 'current rollover candidate.candidate');
    const artifact = object(rollover.artifact, 'current rollover candidate.artifact');
    same(rollover.schemaVersion, 1, 'current rollover candidate.schemaVersion');
    const allowedRolloverStatuses = new Set([
      'build-ready-play-internal-upload-pending',
      'build-ready-play-internal-activation-pending',
      'play-internal-active-device-verification-pending',
      playApi36ReplacementStatus,
    ]);
    if (!allowedRolloverStatuses.has(rollover.status)) {
      fail('current rollover candidate.status is not an allowed fail-closed Play state.');
    }
    const expectedIdentity = {
      versionName: candidate.versionName,
      buildNumber: candidate.versionCode,
      commit: candidate.artifactSourceHead,
    };
    rolloverCandidate = await validateCurrentHeadAndroidReleaseArchive({
      root: repositoryRoot,
      expectedIdentity,
    });
    same(rolloverCandidate.aabSha256, artifact.aabSha256,
      'current rollover candidate.artifact.aabSha256');
    same(rolloverCandidate.apkSha256, artifact.apkSha256,
      'current rollover candidate.artifact.apkSha256');
    same(rolloverCandidate.signingCertificateSha256, artifact.uploadCertificateSha256,
      'current rollover candidate.artifact.uploadCertificateSha256');
    const git = (args) => String(execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })).trim();
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', expectedIdentity.commit, 'HEAD'], {
        cwd: repositoryRoot,
        stdio: 'ignore',
      });
    } catch {
      fail('The rollover artifact source is not an ancestor of the current repository HEAD.');
    }
    const changedPaths = new Set([
      ...git(['diff', '--name-only', `${expectedIdentity.commit}..HEAD`]).split('\n'),
      ...git(['diff', '--name-only']).split('\n'),
      ...git(['diff', '--cached', '--name-only']).split('\n'),
    ].filter(Boolean));
    if (rollover.status === playApi36ReplacementStatus) {
      validatePlayApi36ReplacementTransition({
        repositoryRoot,
        rollover,
        changedPaths: [...changedPaths],
      });
      rolloverMode = 'api36-replacement-transition-verified';
    } else {
      const runtimeDrift = candidateRolloverRuntimeDrift(changedPaths);
      if (runtimeDrift.length > 0) {
        fail('Runtime-affecting files changed after the rollover artifact source commit.');
      }
      rolloverMode = 'historical-metadata-with-newer-rollover-artifact-verified';
    }
  }
  const result = validateGooglePlayInternalHandoff({
    repositoryRoot,
    allowMissingPrivateArtifact: ciMetadataOnly || candidateRollover,
  });
  if (rolloverCandidate !== null &&
      BigInt(rolloverCandidate.buildNumber) <= BigInt(result.buildNumber)) {
    fail('The verified rollover candidate must be newer than the historical Play handoff.');
  }
  process.stdout.write(
    `Google Play internal handoff: PASS (build ${result.buildNumber}; `
      + `privateArtifact=${result.artifactVerified ? 'verified' :
        candidateRollover ? rolloverMode :
          'CI-unavailable-metadata-validated'})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Google Play internal handoff failed.'}\n`);
    process.exitCode = 1;
  }
}
