import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateRw20bOnePlusRemoteTestPlan,
} from '../../tool/validate_rw20b_oneplus_remote_test_plan.mjs';

const root = new URL('../../', import.meta.url).pathname;
const canonical = JSON.parse(await readFile(new URL(
  '../../store/google-play/rw20b-oneplus-remote-test-plan.json',
  import.meta.url,
), 'utf8'));

function validate(mutate = () => {}) {
  const plan = structuredClone(canonical);
  mutate(plan);
  return validateRw20bOnePlusRemoteTestPlan({ root, plan });
}

test('accepts the release-gated seven-part OnePlus parity plan', () => {
  const result = validate();
  assert.equal(result.candidateVersionCode, '2026082601');
  assert.equal(result.parityItemCount, 7);
  assert.equal(result.runnableNow, false);
  assert.equal(result.nextRequired, 'GOOGLE_PLAY_INTERNAL_RELEASE_GO');
  assert.equal(result.implementationHead, 'fd874bb9584ee3445047c0c7a300754905cb7c3a');
  assert.equal(result.openCodeScanningAlerts, 0);
});

test('rejects execution or result claims before the external gate', () => {
  for (const mutate of [
    (value) => { value.currentTruth.releaseGate = 'granted'; },
    (value) => { value.currentTruth.candidateInstalledOnOnePlus = true; },
    (value) => { value.remoteExecution.automaticExecutionStarted = true; },
    (value) => { value.boundaries.deviceAccessed = true; },
    (value) => { value.pixelParityInventory[0].result = 'PASS'; },
  ]) assert.throws(() => validate(mutate), /drifted|boundaries/u);
});

test('rejects weakened Pixel-parity classifications and ordering', () => {
  assert.throws(() => validate((value) => {
    value.pixelParityInventory[1].excluded = [];
  }), /excluded/u);
  assert.throws(() => validate((value) => {
    value.pixelParityInventory[5].transfer = 'PREPARED_AFTER_RELEASE';
  }), /transfer/u);
  assert.throws(() => validate((value) => {
    value.executionOrder.reverse();
  }), /executionOrder/u);
});

test('rejects candidate drift, private values, URLs and network addresses', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026082602'; },
    (value) => { value.ownerEmail = 'person@example.com'; },
    (value) => { value.optIn = 'https://play.example.test/private'; },
    (value) => { value.localPath = '/Users/person/private'; },
    (value) => { value.deviceAddress = '192.0.2.44:39211'; },
  ]) assert.throws(() => validate(mutate), /drifted|email|URL|filesystem|network address/u);
});

test('rejects stale CI, open alerts and execution workarounds', () => {
  for (const mutate of [
    (value) => { value.verification.githubRegression.headSha = 'a'.repeat(40); },
    (value) => { value.verification.githubCodeql.conclusion = 'failure'; },
    (value) => { value.verification.githubRegression.publishApiImage = 'success'; },
    (value) => { value.verification.openCodeScanningAlerts = 1; },
    (value) => { value.verification.workaroundIntroduced = true; },
  ]) assert.throws(() => validate(mutate), /drifted/u);
});
