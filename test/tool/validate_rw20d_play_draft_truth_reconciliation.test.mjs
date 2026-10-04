import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateRw20dPlayDraftTruthReconciliation,
} from '../../tool/validate_rw20d_play_draft_truth_reconciliation.mjs';

const root = new URL('../../', import.meta.url).pathname;
const paths = {
  reconciliation: '../../store/google-play/rw20d-play-draft-truth-reconciliation.json',
  candidateManifest: '../../store/google-play/rw20-current-internal-candidate-manifest.json',
  currentUploadHandoff: '../../store/google-play/rw20-current-internal-upload-handoff.json',
  ownerDraftHandoff: '../../store/google-play/rw20a-internal-draft-oneplus-handoff.json',
  historicalBuildEvidence:
    '../../docs/evidence/release-readiness/rw20-current-play-internal-candidate-2026082601.json',
};
const canonical = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [
    key,
    JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')),
  ]),
));

function validate(mutate = () => {}) {
  const value = structuredClone(canonical);
  mutate(value);
  return validateRw20dPlayDraftTruthReconciliation({ root, ...value });
}

test('separates the historical BUILD_READY snapshot from current draft truth', () => {
  assert.deepEqual(validate(), {
    status: 'reconciled-owner-handover-release-gated',
    historicalUploadAtBuild: false,
    currentExactDraftUploaded: true,
    candidateVersionCode: '2026082601',
    activeInternalVersionCode: '2026081509',
    releaseActivated: false,
    nextRequiredGate: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    verificationState: 'verified-exact-sha',
  });
});

test('rejects rewriting historical BUILD_READY facts as current upload facts', () => {
  for (const mutate of [
    (value) => { value.historicalBuildEvidence.evidenceScope = 'current'; },
    (value) => { value.historicalBuildEvidence.closedGates.googlePlayUpload = 'performed'; },
    (value) => { value.candidateManifest.providerAndLiveHolds.storeUploadPerformed = true; },
    (value) => { value.reconciliation.contradiction.historicalFactsChanged = true; },
  ]) assert.throws(() => validate(mutate), /drifted/u);
});

test('rejects stale upload-pending state or candidate provenance drift', () => {
  for (const mutate of [
    (value) => {
      value.currentUploadHandoff.status = 'build-ready-awaiting-play-upload-approved';
    },
    (value) => {
      value.currentUploadHandoff.requiredFutureOwnerGates.PLAY_UPLOAD_APPROVED =
        'not-granted';
    },
    (value) => { value.candidateManifest.postBuildPlayState.draftSaved = false; },
    (value) => { value.currentUploadHandoff.candidate.aabSha256 = 'a'.repeat(64); },
  ]) assert.throws(() => validate(mutate), /drifted/u);
});

test('rejects release, review, device and external mutation overclaims', () => {
  for (const mutate of [
    (value) => { value.currentUploadHandoff.currentDraftState.releaseActivated = true; },
    (value) => { value.ownerDraftHandoff.playState.sentForReview = true; },
    (value) => {
      value.currentUploadHandoff.currentDraftState.candidateInstalledOnSecondAndroid = true;
    },
    (value) => { value.currentUploadHandoff.postUploadBoundaries.testerListChanged = true; },
    (value) => { value.reconciliation.boundaries.consoleAccessed = true; },
  ]) assert.throws(() => validate(mutate), /drifted|boundaries|remain false/u);
});

test('rejects private identity, URL, path, network and credential-shaped additions', () => {
  const credentialShapedKey = ['pass', 'word'].join('');
  for (const unsafe of [
    { note: 'person@example.invalid' },
    { note: 'https://example.invalid/private' },
    { note: '/Users/person/private' },
    { note: '192.0.2.44:39211' },
    { [credentialShapedKey]: 'do-not-store' },
  ]) assert.throws(() => validate((value) => {
    value.reconciliation.unsafe = unsafe;
  }), /email|URL|filesystem|network|credential/u);
});

test('accepts only structurally exact successful verification evidence', () => {
  const exactHead = 'a'.repeat(40);
  const verified = (value) => {
    value.reconciliation.verification = {
      state: 'verified-exact-sha',
      implementationHead: exactHead,
      localTechnicalRegression: 'passed-standard-parallelism-no-workaround',
      githubRegression: {
        runId: 1,
        headSha: exactHead,
        conclusion: 'success',
        publishApiImage: 'skipped',
      },
      githubCodeql: {
        runId: 2,
        headSha: exactHead,
        conclusion: 'success',
      },
      openCodeScanningAlerts: 0,
      workaroundIntroduced: false,
    };
  };
  assert.equal(validate(verified).verificationState, 'verified-exact-sha');

  for (const mutate of [
    (value) => { value.reconciliation.verification.githubRegression.headSha = 'b'.repeat(40); },
    (value) => { value.reconciliation.verification.githubCodeql.conclusion = 'failure'; },
    (value) => { value.reconciliation.verification.githubRegression.publishApiImage = 'success'; },
    (value) => { value.reconciliation.verification.openCodeScanningAlerts = 1; },
    (value) => { value.reconciliation.verification.workaroundIntroduced = true; },
  ]) assert.throws(() => validate((value) => {
    verified(value);
    mutate(value);
  }), /drifted/u);
});
