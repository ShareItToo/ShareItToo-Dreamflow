import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw20cOnePlusOwnerSmokeReadiness,
} from '../../tool/validate_rw20c_oneplus_owner_smoke_readiness.mjs';

const root = new URL('../../', import.meta.url).pathname;
const source = JSON.parse(readFileSync(new URL(
  '../../store/google-play/rw20c-oneplus-owner-smoke-readiness.json',
  import.meta.url,
), 'utf8'));

function clone() {
  return structuredClone(source);
}

test('accepts only the honestly verified, gate-closed RW20C readiness', () => {
  assert.deepEqual(validateRw20cOnePlusOwnerSmokeReadiness({ root, readiness: clone() }), {
    status: 'prepared-not-run-owner-and-release-gated',
    candidateVersionCode: '2026082601',
    preparedCheckCount: 7,
    runnableNow: false,
    nextRequired: 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    executionResult: 'NOT_RUN',
    verificationState: 'verified-exact-sha',
  });
});

test('rejects gate, execution, result and mutation overclaims', () => {
  const mutations = [
    (value) => { value.currentTruth.releaseGate = 'granted'; },
    (value) => { value.currentTruth.ownerWindowGate = 'granted'; },
    (value) => { value.currentTruth.smokeExecutionPerformed = true; },
    (value) => { value.currentTruth.smokeResult = 'passed'; },
    (value) => { value.preparedChecks[0].result = 'PASS'; },
    (value) => { value.boundaries.adbQueried = true; },
    (value) => { value.boundaries.appLaunched = true; },
  ];
  for (const mutate of mutations) {
    const value = clone();
    mutate(value);
    assert.throws(() => validateRw20cOnePlusOwnerSmokeReadiness({ root, readiness: value }));
  }
});

test('rejects weakened command, scope, candidate or exclusion bindings', () => {
  const mutations = [
    (value) => { value.authorization.futureCommand = 'adb devices'; },
    (value) => { value.authorization.bothExactGatesRequiredBeforeFirstAdbQuery = false; },
    (value) => { value.candidate.versionCode = '2026081509'; },
    (value) => { value.preparedChecks.pop(); },
    (value) => { value.explicitExclusions.splice(3, 1); },
  ];
  for (const mutate of mutations) {
    const value = clone();
    mutate(value);
    assert.throws(() => validateRw20cOnePlusOwnerSmokeReadiness({ root, readiness: value }));
  }
});

test('rejects private identity, location and credential-shaped additions', () => {
  const credentialShapedKey = ['pass', 'word'].join('');
  for (const unsafe of [
    { note: 'person@example.invalid' },
    { note: 'https://example.invalid/private' },
    { note: '/Users/person/private' },
    { note: '192.0.2.44:39211' },
    { [credentialShapedKey]: 'do-not-store' },
  ]) {
    const value = clone();
    value.unsafe = unsafe;
    assert.throws(() => validateRw20cOnePlusOwnerSmokeReadiness({ root, readiness: value }));
  }
});

test('accepts only structurally exact successful verification evidence', () => {
  const value = clone();
  value.verification = {
    state: 'verified-exact-sha',
    implementationHead: 'a'.repeat(40),
    localTechnicalRegression: 'passed-standard-parallelism-no-workaround',
    githubRegression: {
      runId: 1,
      headSha: 'a'.repeat(40),
      conclusion: 'success',
      publishApiImage: 'skipped',
    },
    githubCodeql: {
      runId: 2,
      headSha: 'a'.repeat(40),
      conclusion: 'success',
    },
    openCodeScanningAlerts: 0,
    workaroundIntroduced: false,
  };
  assert.equal(
    validateRw20cOnePlusOwnerSmokeReadiness({ root, readiness: value })
      .verificationState,
    'verified-exact-sha',
  );

  for (const mutate of [
    (candidate) => { candidate.verification.githubRegression.headSha = 'b'.repeat(40); },
    (candidate) => { candidate.verification.githubCodeql.conclusion = 'failure'; },
    (candidate) => { candidate.verification.githubRegression.publishApiImage = 'success'; },
    (candidate) => { candidate.verification.openCodeScanningAlerts = 1; },
    (candidate) => { candidate.verification.workaroundIntroduced = true; },
  ]) {
    const invalid = structuredClone(value);
    mutate(invalid);
    assert.throws(() => validateRw20cOnePlusOwnerSmokeReadiness({
      root,
      readiness: invalid,
    }));
  }
});
