#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultReconciliationPath =
  'store/google-play/rw20d-play-draft-truth-reconciliation.json';
const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/iu;

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

function assertSanitized(value, path = 'value') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key)) fail(`${path}.${key} is credential-shaped.`);
      assertSanitized(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) {
    fail(`${path} contains an email address.`);
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('http://') || normalized.includes('https://')) {
    fail(`${path} contains a URL.`);
  }
  if (/(?:^|\s)\/Users\/|[A-Z]:\\/u.test(value)) {
    fail(`${path} contains a private filesystem path.`);
  }
  if (/(?:^|\s)(?:\d{1,3}\.){3}\d{1,3}:\d+(?:\s|$)/u.test(value)) {
    fail(`${path} contains a network address.`);
  }
}

function readJson(root, reference, label) {
  if (typeof reference !== 'string'
      || !/^[a-zA-Z0-9_./-]+\.json$/u.test(reference)
      || reference.includes('..')) {
    fail(`${label} is not a safe repository JSON reference.`);
  }
  try {
    return JSON.parse(readFileSync(resolve(root, reference), 'utf8'));
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
}

const expectedRefs = Object.freeze({
  candidateManifest: 'store/google-play/rw20-current-internal-candidate-manifest.json',
  currentUploadHandoff: 'store/google-play/rw20-current-internal-upload-handoff.json',
  ownerDraftHandoff: 'store/google-play/rw20a-internal-draft-oneplus-handoff.json',
  historicalBuildEvidence:
    'docs/evidence/release-readiness/rw20-current-play-internal-candidate-2026082601.json',
  operation: 'docs/operations/RW20D_PLAY_DRAFT_TRUTH_RECONCILIATION_2026-08-27.md',
});

export function validateRw20dPlayDraftTruthReconciliation({
  root = defaultRoot,
  reconciliation = readJson(root, defaultReconciliationPath, 'RW20D reconciliation'),
  candidateManifest,
  currentUploadHandoff,
  ownerDraftHandoff,
  historicalBuildEvidence,
} = {}) {
  assertSanitized(reconciliation, 'reconciliation');
  same(reconciliation.schemaVersion, 1, 'schemaVersion');
  same(reconciliation.kind, 'rw20d-google-play-draft-truth-reconciliation', 'kind');
  same(reconciliation.status, 'reconciled-owner-handover-release-gated', 'status');

  const refs = object(reconciliation.references, 'references');
  for (const [key, expected] of Object.entries(expectedRefs)) {
    same(refs[key], expected, `references.${key}`);
  }
  candidateManifest ??= readJson(root, refs.candidateManifest, 'candidate manifest');
  currentUploadHandoff ??= readJson(root, refs.currentUploadHandoff, 'current upload handoff');
  ownerDraftHandoff ??= readJson(root, refs.ownerDraftHandoff, 'owner draft handoff');
  historicalBuildEvidence ??=
    readJson(root, refs.historicalBuildEvidence, 'historical BUILD_READY evidence');

  const contradiction = object(reconciliation.contradiction, 'contradiction');
  for (const key of [
    'historicalBuildSnapshotSaidUploadNotPerformed',
    'laterOwnerHandoffSaidExactDraftUploaded',
    'resolvedByTemporalScopeSeparation',
  ]) same(contradiction[key], true, `contradiction.${key}`);
  same(contradiction.historicalFactsChanged, false,
    'contradiction.historicalFactsChanged');

  same(historicalBuildEvidence.status, 'passed-build-ready-local-only',
    'historicalBuildEvidence.status');
  same(historicalBuildEvidence.evidenceScope, 'artifact-build-time-snapshot',
    'historicalBuildEvidence.evidenceScope');
  same(historicalBuildEvidence.postBuildPlayStateRef, refs.ownerDraftHandoff,
    'historicalBuildEvidence.postBuildPlayStateRef');
  same(historicalBuildEvidence.closedGates?.PLAY_UPLOAD_APPROVED, 'not-granted',
    'historicalBuildEvidence.closedGates.PLAY_UPLOAD_APPROVED');
  same(historicalBuildEvidence.closedGates?.googlePlayUpload, 'not-performed',
    'historicalBuildEvidence.closedGates.googlePlayUpload');

  same(candidateManifest.status, 'build-ready-local-only', 'candidateManifest.status');
  same(candidateManifest.manifestScope,
    'artifact-build-snapshot-with-post-build-play-state',
    'candidateManifest.manifestScope');
  same(candidateManifest.generatedAt, historicalBuildEvidence.generatedAt,
    'candidateManifest.generatedAt');
  same(candidateManifest.providerAndLiveHolds?.snapshotScope, 'artifact-build-time',
    'candidateManifest.providerAndLiveHolds.snapshotScope');
  same(candidateManifest.providerAndLiveHolds?.storeUploadPerformed, false,
    'candidateManifest.providerAndLiveHolds.storeUploadPerformed');

  same(ownerDraftHandoff.status, 'uploaded-draft-not-active-oneplus-install-only',
    'ownerDraftHandoff.status');
  same(ownerDraftHandoff.source?.type, 'owner-provided-macbook-codex-handover',
    'ownerDraftHandoff.source.type');
  same(ownerDraftHandoff.source?.directConsoleReverificationFromThisWorktree, false,
    'ownerDraftHandoff.source.directConsoleReverificationFromThisWorktree');
  same(ownerDraftHandoff.playState?.exactCandidateUploaded, true,
    'ownerDraftHandoff.playState.exactCandidateUploaded');
  same(ownerDraftHandoff.playState?.bundleProcessed, true,
    'ownerDraftHandoff.playState.bundleProcessed');
  same(ownerDraftHandoff.playState?.draftSaved, true,
    'ownerDraftHandoff.playState.draftSaved');
  same(ownerDraftHandoff.playState?.releaseActivated, false,
    'ownerDraftHandoff.playState.releaseActivated');
  same(ownerDraftHandoff.playState?.sentForReview, false,
    'ownerDraftHandoff.playState.sentForReview');

  const candidate = object(candidateManifest.candidate, 'candidateManifest.candidate');
  const ownerCandidate = object(ownerDraftHandoff.candidate, 'ownerDraftHandoff.candidate');
  for (const key of ['applicationId', 'versionName', 'versionCode']) {
    same(candidate[key], ownerCandidate[key], `candidate.${key}`);
  }
  same(candidateManifest.artifact?.aabSha256, ownerCandidate.aabSha256,
    'candidate aabSha256');
  same(candidateManifest.artifact?.uploadCertificateSha256,
    ownerCandidate.uploadCertificateSha256, 'candidate uploadCertificateSha256');

  const activeVersion = ownerDraftHandoff.playState?.activeInternalRelease?.versionCode;
  const postBuild = object(candidateManifest.postBuildPlayState,
    'candidateManifest.postBuildPlayState');
  assertSanitized(postBuild, 'candidateManifest.postBuildPlayState');
  same(postBuild.sourceRef, refs.ownerDraftHandoff, 'postBuildPlayState.sourceRef');
  same(postBuild.sourceClassification, ownerDraftHandoff.source.type,
    'postBuildPlayState.sourceClassification');
  same(postBuild.directConsoleReverifiedFromThisWorktree, false,
    'postBuildPlayState.directConsoleReverifiedFromThisWorktree');
  for (const key of ['exactCandidateUploaded', 'bundleProcessed', 'draftSaved']) {
    same(postBuild[key], true, `postBuildPlayState.${key}`);
  }
  for (const key of ['releaseActivated', 'sentForReview', 'candidateExpectedInstalledOnOnePlus']) {
    same(postBuild[key], false, `postBuildPlayState.${key}`);
  }
  same(postBuild.activeInternalVersionCode, activeVersion,
    'postBuildPlayState.activeInternalVersionCode');

  same(currentUploadHandoff.schemaVersion, 1, 'currentUploadHandoff.schemaVersion');
  same(currentUploadHandoff.kind, 'rw20-current-google-play-internal-upload-handoff',
    'currentUploadHandoff.kind');
  same(currentUploadHandoff.status,
    'uploaded-draft-awaiting-google-play-internal-release-go',
    'currentUploadHandoff.status');
  same(currentUploadHandoff.submissionAllowed, false,
    'currentUploadHandoff.submissionAllowed');
  same(currentUploadHandoff.track, 'internal', 'currentUploadHandoff.track');
  same(currentUploadHandoff.source?.type, ownerDraftHandoff.source.type,
    'currentUploadHandoff.source.type');
  same(currentUploadHandoff.source?.currentStateRef, refs.ownerDraftHandoff,
    'currentUploadHandoff.source.currentStateRef');
  same(currentUploadHandoff.source?.directConsoleReverificationFromThisWorktree, false,
    'currentUploadHandoff.source.directConsoleReverificationFromThisWorktree');
  same(currentUploadHandoff.candidateManifestRef, refs.candidateManifest,
    'currentUploadHandoff.candidateManifestRef');

  const uploadCandidate = object(currentUploadHandoff.candidate,
    'currentUploadHandoff.candidate');
  for (const [key, expected] of Object.entries({
    applicationId: candidate.applicationId,
    versionName: candidate.versionName,
    versionCode: candidate.versionCode,
    artifactSourceHead: candidateManifest.provenance?.artifactSourceHead,
    aabSha256: candidateManifest.artifact?.aabSha256,
    uploadCertificateSha256: candidateManifest.artifact?.uploadCertificateSha256,
  })) same(uploadCandidate[key], expected, `currentUploadHandoff.candidate.${key}`);

  const draft = object(currentUploadHandoff.currentDraftState,
    'currentUploadHandoff.currentDraftState');
  assertSanitized(draft, 'currentUploadHandoff.currentDraftState');
  for (const key of ['exactCandidateUploaded', 'bundleProcessed', 'draftSaved']) {
    same(draft[key], ownerDraftHandoff.playState[key], `currentDraftState.${key}`);
  }
  for (const key of ['releaseActivated', 'published', 'sentForReview']) {
    same(draft[key], ownerDraftHandoff.playState[key], `currentDraftState.${key}`);
  }
  same(draft.activeInternalVersionCode, activeVersion,
    'currentDraftState.activeInternalVersionCode');
  same(draft.candidateInstalledOnSecondAndroid, false,
    'currentDraftState.candidateInstalledOnSecondAndroid');
  same(currentUploadHandoff.preparedRelease?.uploadCompleted, true,
    'preparedRelease.uploadCompleted');
  same(currentUploadHandoff.preparedRelease?.uploadAllowed, false,
    'preparedRelease.uploadAllowed');
  same(currentUploadHandoff.preparedRelease?.activationAllowed, false,
    'preparedRelease.activationAllowed');
  same(currentUploadHandoff.preUploadChecks?.state,
    'completed-for-exact-owner-reported-draft-upload', 'preUploadChecks.state');
  same(currentUploadHandoff.requiredFutureOwnerGates?.PLAY_UPLOAD_APPROVED,
    'consumed-for-exact-bound-aab', 'requiredFutureOwnerGates.PLAY_UPLOAD_APPROVED');
  same(currentUploadHandoff.requiredFutureOwnerGates?.GOOGLE_PLAY_INTERNAL_RELEASE_GO,
    'not-granted', 'requiredFutureOwnerGates.GOOGLE_PLAY_INTERNAL_RELEASE_GO');
  const postUploadBoundaries = object(currentUploadHandoff.postUploadBoundaries,
    'currentUploadHandoff.postUploadBoundaries');
  if (!Object.values(postUploadBoundaries).every((value) => value === false)) {
    fail('currentUploadHandoff.postUploadBoundaries must all remain false.');
  }

  const truth = object(reconciliation.currentTruth, 'currentTruth');
  same(truth.sourceClassification, ownerDraftHandoff.source.type,
    'currentTruth.sourceClassification');
  same(truth.directConsoleReverifiedFromThisWorktree, false,
    'currentTruth.directConsoleReverifiedFromThisWorktree');
  for (const key of ['exactCandidateUploaded', 'bundleProcessed', 'draftSaved']) {
    same(truth[key], true, `currentTruth.${key}`);
  }
  for (const key of ['releaseActivated', 'sentForReview', 'candidateExpectedInstalledOnOnePlus']) {
    same(truth[key], false, `currentTruth.${key}`);
  }
  same(truth.activeInternalVersionCode, activeVersion,
    'currentTruth.activeInternalVersionCode');
  same(truth.candidateVersionCode, candidate.versionCode,
    'currentTruth.candidateVersionCode');
  same(truth.nextRequiredGate, 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'currentTruth.nextRequiredGate');

  const boundaries = object(reconciliation.boundaries, 'boundaries');
  if (!Object.values(boundaries).every((value) => value === false)) {
    fail('RW20D boundaries must all remain false.');
  }

  const verification = object(reconciliation.verification, 'verification');
  if (verification.state === 'pending-exact-sha') {
    same(verification.implementationHead, null, 'verification.implementationHead');
    same(verification.localTechnicalRegression, 'pending',
      'verification.localTechnicalRegression');
    for (const key of ['githubRegression', 'githubCodeql', 'openCodeScanningAlerts']) {
      same(verification[key], null, `verification.${key}`);
    }
  } else if (verification.state === 'verified-exact-sha') {
    if (!/^[a-f0-9]{40}$/u.test(verification.implementationHead)) {
      fail('verification.implementationHead must be an exact commit SHA.');
    }
    same(verification.localTechnicalRegression,
      'passed-standard-parallelism-no-workaround',
      'verification.localTechnicalRegression');
    for (const key of ['githubRegression', 'githubCodeql']) {
      const run = object(verification[key], `verification.${key}`);
      if (!Number.isSafeInteger(run.runId) || run.runId <= 0) {
        fail(`verification.${key}.runId is invalid.`);
      }
      same(run.headSha, verification.implementationHead,
        `verification.${key}.headSha`);
      same(run.conclusion, 'success', `verification.${key}.conclusion`);
    }
    same(verification.githubRegression.publishApiImage, 'skipped',
      'verification.githubRegression.publishApiImage');
    same(verification.openCodeScanningAlerts, 0,
      'verification.openCodeScanningAlerts');
  } else {
    fail('verification.state is invalid.');
  }
  same(verification.workaroundIntroduced, false,
    'verification.workaroundIntroduced');

  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsOptInUrl',
    'containsRawDeviceIdentifier',
    'containsNetworkAddress',
  ]) same(reconciliation[key], false, key);

  return Object.freeze({
    status: reconciliation.status,
    historicalUploadAtBuild: false,
    currentExactDraftUploaded: true,
    candidateVersionCode: candidate.versionCode,
    activeInternalVersionCode: activeVersion,
    releaseActivated: false,
    nextRequiredGate: truth.nextRequiredGate,
    verificationState: verification.state,
  });
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateRw20dPlayDraftTruthReconciliation(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'RW20D reconciliation validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
