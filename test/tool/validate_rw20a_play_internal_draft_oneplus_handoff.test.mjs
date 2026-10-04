import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateRw20aPlayInternalDraftOnePlusHandoff,
} from '../../tool/validate_rw20a_play_internal_draft_oneplus_handoff.mjs';

const root = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../store/google-play/rw20a-internal-draft-oneplus-handoff.json',
  import.meta.url,
), 'utf8'));

function validate(mutate = () => {}) {
  const handoff = structuredClone(canonical);
  mutate(handoff);
  return validateRw20aPlayInternalDraftOnePlusHandoff({ root, handoff });
}

test('accepts the exact uploaded-but-inactive candidate and old OnePlus baseline truth', () => {
  const result = validate();
  assert.equal(result.candidateVersionCode, '2026082601');
  assert.equal(result.activeInternalVersionCode, '2026081509');
  assert.equal(result.exactCandidateUploadedAsDraft, true);
  assert.equal(result.releaseActivated, false);
  assert.equal(result.onePlusBaselineReady, true);
  assert.equal(result.implementationHead, '8dbe9b6071b79507eac6414096b8f45949d31d91');
  assert.equal(result.openCodeScanningAlerts, 0);
});

test('rejects activation, publication and test overclaims', () => {
  for (const mutate of [
    (value) => { value.playState.releaseActivated = true; },
    (value) => { value.playState.sentForReview = true; },
    (value) => { value.secondAndroid.functionalTestsPerformed = true; },
    (value) => { value.secondAndroid.newDraftCandidateInstalled = true; },
    (value) => { value.boundaries.storeChanged = true; },
  ]) assert.throws(() => validate(mutate), /drifted|boundaries/u);
});

test('rejects artifact, active-version and transfer drift', () => {
  assert.throws(() => validate((value) => {
    value.candidate.aabSha256 = 'a'.repeat(64);
  }), /aabSha256/u);
  assert.throws(() => validate((value) => {
    value.playState.activeInternalRelease.versionCode = '2026082601';
  }), /versionCode/u);
  assert.throws(() => validate((value) => {
    value.transferVerification.partBytes[1] -= 1;
  }), /reassemble/u);
});

test('rejects tester identity, opt-in URL, credentials and private paths', () => {
  for (const mutate of [
    (value) => { value.testerState.accountAddress = 'person@example.com'; },
    (value) => { value.testerState.optIn = 'https://play.example.test/private'; },
    (value) => { value.testerState.optIn = 'HTTPS://staging.shareittoo.com/api/v1'; },
    (value) => { value.testerState.accessToken = 'never'; },
    (value) => { value.transferVerification.localPath = '/Users/person/Downloads/private'; },
  ]) assert.throws(() => validate(mutate), /email|URL|credential|filesystem/u);
});

test('rejects stale CI, open alerts and weakened security-ratchet evidence', () => {
  for (const mutate of [
    (value) => { value.verification.githubRegression.headSha = 'a'.repeat(40); },
    (value) => { value.verification.githubCodeql.conclusion = 'failure'; },
    (value) => { value.verification.openCodeScanningAlerts = 1; },
    (value) => { value.verification.securityRatchet.workaroundIntroduced = true; },
    (value) => { value.verification.securityRatchet.resolution = 'host allowlist'; },
  ]) assert.throws(() => validate(mutate), /drifted/u);
});
