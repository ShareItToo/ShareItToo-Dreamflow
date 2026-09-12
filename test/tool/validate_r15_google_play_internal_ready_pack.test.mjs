import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateR15GooglePlayInternalReadyPack } from '../../tool/validate_r15_google_play_internal_ready_pack.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r15-google-play-internal-ready-pack-20260824.json',
), 'utf8'));
const featureMatrix = JSON.parse(readFileSync(resolve(
  root,
  'store/google-play/r15-stage-a-feature-flag-matrix.json',
), 'utf8'));

function validate(changedEvidence = evidence, changedMatrix = featureMatrix) {
  return validateR15GooglePlayInternalReadyPack({
    repositoryRoot: root,
    evidence: changedEvidence,
    featureMatrix: changedMatrix,
  });
}

test('accepts the exact prepared and non-activated R15 pack', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    track: 'internal',
    buildReady: 'not-granted',
    playUploadApproved: 'not-granted',
    humanPilotActivated: 'not-granted',
    next48hPackage: 'R16',
  });
});

test('rejects collapsed or granted R15 gates', () => {
  const build = structuredClone(evidence);
  build.gateSeparation.BUILD_READY.state = 'granted';
  assert.throws(() => validate(build), /gate separation/u);

  const upload = structuredClone(evidence);
  upload.gateSeparation.PLAY_UPLOAD_APPROVED.authorizesHumanPilot = true;
  assert.throws(() => validate(upload), /gate separation/u);
});

test('rejects stale candidate identity or non-monotonic build planning', () => {
  const candidate = structuredClone(evidence);
  candidate.candidatePlan.applicationId = 'other.app';
  assert.throws(() => validate(candidate), /candidate plan/u);

  const matrix = structuredClone(featureMatrix);
  matrix.candidate.reservedNextBuildNumber = '2026082301';
  assert.throws(() => validate(evidence, matrix), /feature matrix identity/u);
});

test('rejects a false G3 G4 G5 release-readiness claim', () => {
  const matrix = structuredClone(featureMatrix);
  matrix.surfaces.find(({ id }) => id === 'g3_booking_groups').targetState = 'on';
  assert.throws(() => validate(evidence, matrix), /feature matrix state/u);

  const changed = structuredClone(evidence);
  changed.featureTruth.fullN9G3G4G5EnvelopeBuildableAsSignedRelease = true;
  assert.throws(() => validate(changed), /feature truth/u);
});

test('rejects an incomplete owner-minimization process pack', () => {
  const changed = structuredClone(evidence);
  changed.preparedProcesses.pilotShutdown = 'pending';
  assert.throws(() => validate(changed), /prepared process/u);
});

test('rejects live mutation, built artifact or tester overclaims', () => {
  const upload = structuredClone(evidence);
  upload.boundaries.aabUploaded = true;
  assert.throws(() => validate(upload), /mutation boundary/u);

  const tester = structuredClone(evidence);
  tester.boundaries.testerContacted = true;
  assert.throws(() => validate(tester), /mutation boundary/u);
});

test('rejects premature or malformed GitHub verification', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-regression-passed-ci-pending';
  premature.localPreflight.r15ExactInternalControls = 'pending-clean-implementation-head';
  delete premature.localPreflight.exactR15PreflightHead;
  premature.focusedVerification.githubRegression = 'pending';
  premature.focusedVerification.githubCodeql = 'pending';
  premature.githubVerification = {
    implementationCommit: '0'.repeat(40), regressionRunId: 1,
    regressionConclusion: 'success', codeqlRunId: 2, codeqlConclusion: 'success',
    advancedSecurityCheckId: 3, advancedSecurityConclusion: 'success', newAlerts: 0,
  };
  assert.throws(() => validate(premature), /cannot bind GitHub/u);

  const malformed = structuredClone(evidence);
  malformed.status = 'verified-regression-and-codeql-passed-ready-for-r16';
  malformed.localPreflight.r15ExactInternalControls = 'passed-exact-implementation-head-without-artifacts';
  malformed.localPreflight.exactR15PreflightHead = 'bad';
  malformed.focusedVerification.fullTechnicalRegression = 'passed-candidate-rollover-ci-metadata-mode';
  malformed.focusedVerification.githubRegression = 'passed';
  malformed.focusedVerification.githubCodeql = 'passed-no-new-alerts';
  malformed.githubVerification = {
    implementationCommit: 'bad', regressionRunId: 1,
    regressionConclusion: 'success', codeqlRunId: 2, codeqlConclusion: 'success',
    advancedSecurityCheckId: 3, advancedSecurityConclusion: 'success', newAlerts: 0,
  };
  assert.throws(() => validate(malformed), /GitHub verification|local preflight/u);
});

test('rejects private or secret-shaped machine evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'tester@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
