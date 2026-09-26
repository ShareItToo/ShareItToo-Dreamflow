#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultEvidencePath =
  'store/google-play/google-play-internal-release-2026082601-completion.json';
const forbiddenKey =
  /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/iu;

function fail(message) {
  throw new Error(message);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} has drifted.`);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function assertSanitized(value, path = 'evidence') {
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
  if (/https?:\/\//iu.test(value)) fail(`${path} contains a URL.`);
  if (/(?:^|\s)\/Users\/|[A-Z]:\\/u.test(value)) {
    fail(`${path} contains a private filesystem path.`);
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

export function validateGooglePlayInternalRelease2026082601Completion({
  root = defaultRoot,
  evidence = readJson(root, defaultEvidencePath, 'completion evidence'),
  candidateManifest,
  preReleaseHandoff,
} = {}) {
  assertSanitized(evidence);
  same(evidence.schemaVersion, 1, 'schemaVersion');
  same(evidence.kind, 'google-play-internal-release-completion', 'kind');
  same(evidence.status, 'google-play-internal-release-complete', 'status');
  same(evidence.recordedOn, '2026-08-27', 'recordedOn');
  same(evidence.source?.classification,
    'direct-authenticated-google-play-console-readback', 'source.classification');
  same(evidence.source?.consoleReadOnlyGateCompleted, true,
    'source.consoleReadOnlyGateCompleted');
  same(evidence.source?.postReleaseReadbackCompleted, true,
    'source.postReleaseReadbackCompleted');

  const candidate = object(evidence.candidate, 'candidate');
  candidateManifest ??=
    readJson(root, candidate.candidateManifestRef, 'candidate manifest');
  preReleaseHandoff ??=
    readJson(root, candidate.preReleaseHandoffRef, 'pre-release handoff');
  const expectedCandidate = candidateManifest.candidate;
  const expectedArtifact = candidateManifest.artifact;
  for (const [key, expected] of Object.entries({
    applicationId: expectedCandidate?.applicationId,
    versionName: expectedCandidate?.versionName,
    versionCode: expectedCandidate?.versionCode,
    artifactSourceHead: candidateManifest.provenance?.artifactSourceHead,
    aabBytes: expectedArtifact?.aabBytes,
    aabSha256: expectedArtifact?.aabSha256,
    uploadCertificateSha256: expectedArtifact?.uploadCertificateSha256,
  })) same(candidate[key], expected, `candidate.${key}`);
  same(candidate.versionCode, preReleaseHandoff.candidate?.versionCode,
    'candidate versus pre-release handoff versionCode');
  same(candidate.aabSha256, preReleaseHandoff.candidate?.aabSha256,
    'candidate versus pre-release handoff aabSha256');
  if (!/^[a-f0-9]{64}$/u.test(candidate.playAppSigningCertificateSha256)) {
    fail('candidate.playAppSigningCertificateSha256 is invalid.');
  }

  const verification = object(evidence.artifactVerification, 'artifactVerification');
  for (const key of [
    'originalBundleDownloadedReadOnly',
    'byteCountConfirmed',
    'sha256Confirmed',
    'zipStructureValid',
    'jarSignatureVerified',
    'uploadCertificateConfirmed',
    'packageNameConfirmed',
  ]) same(verification[key], true, `artifactVerification.${key}`);
  same(verification.minSdkVersion, candidateManifest.candidate?.minSdkVersion,
    'artifactVerification.minSdkVersion');
  same(verification.targetSdkVersion, candidateManifest.candidate?.targetSdkVersion,
    'artifactVerification.targetSdkVersion');

  const release = object(evidence.release, 'release');
  same(release.track, 'internal-testing', 'release.track');
  same(release.releaseName, preReleaseHandoff.preparedRelease?.name,
    'release.releaseName');
  same(release.releaseNotesLanguage, preReleaseHandoff.preparedRelease?.language,
    'release.releaseNotesLanguage');
  same(release.releaseNotesBoundToPreparedRepositorySource, true,
    'release.releaseNotesBoundToPreparedRepositorySource');
  same(release.status, 'available-to-internal-testers', 'release.status');
  same(release.rollout, 'full-rollout', 'release.rollout');
  same(release.activeInternalVersionCode, candidate.versionCode,
    'release.activeInternalVersionCode');
  same(release.reviewed, false, 'release.reviewed');
  same(release.sentForReview, false, 'release.sentForReview');

  const readback = object(evidence.postReleaseReadback, 'postReleaseReadback');
  same(readback.testerListName, 'SIT interner Test', 'postReleaseReadback.testerListName');
  same(readback.testerCount, 2, 'postReleaseReadback.testerCount');
  same(readback.testerListUnchanged, true, 'postReleaseReadback.testerListUnchanged');
  same(readback.testerIdentityStored, false, 'postReleaseReadback.testerIdentityStored');
  for (const key of [
    'productionTrackChanged',
    'openTestingTrackChanged',
    'closedTestingTrackChanged',
    'publishingOverviewSubmitEnabled',
    'competingNewerReleaseObserved',
  ]) same(readback[key], false, `postReleaseReadback.${key}`);
  same(readback.knownClosedTestingVersionCode, '2026081506',
    'postReleaseReadback.knownClosedTestingVersionCode');
  same(readback.publishingOverviewPendingChangeCount, 13,
    'postReleaseReadback.publishingOverviewPendingChangeCount');
  same(readback.otherTracksUnchanged, true, 'postReleaseReadback.otherTracksUnchanged');

  same(evidence.ownerGate?.gate, 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'ownerGate.gate');
  same(evidence.ownerGate?.state,
    'consumed-for-exact-candidate-internal-testing-only', 'ownerGate.state');
  const boundaries = object(evidence.boundaries, 'boundaries');
  same(boundaries.exactInternalReleaseActivated, true,
    'boundaries.exactInternalReleaseActivated');
  for (const [key, value] of Object.entries(boundaries)) {
    if (key !== 'exactInternalReleaseActivated') same(value, false, `boundaries.${key}`);
  }
  same(evidence.nextGate?.gate, 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
    'nextGate.gate');
  same(evidence.nextGate?.state, 'not-granted', 'nextGate.state');
  same(evidence.nextGate?.candidateDeviceResults, 'NOT_RUN',
    'nextGate.candidateDeviceResults');
  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsOptInUrl',
    'containsPrivateFilesystemPath',
  ]) same(evidence[key], false, key);

  return Object.freeze({
    status: evidence.status,
    track: release.track,
    versionCode: candidate.versionCode,
    candidateHashConfirmed: verification.sha256Confirmed,
    releaseStatus: release.status,
    testerListUnchanged: readback.testerListUnchanged,
    otherTracksUnchanged: readback.otherTracksUnchanged,
    nextGate: evidence.nextGate.gate,
  });
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateGooglePlayInternalRelease2026082601Completion(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
