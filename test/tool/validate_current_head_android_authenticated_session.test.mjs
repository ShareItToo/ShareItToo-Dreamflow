import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidAuthenticatedSession,
} from '../../tool/validate_current_head_android_authenticated_session.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-authenticated-session-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateCurrentHeadAndroidAuthenticatedSession({
    root,
    evidence: changed,
    candidateEvidence,
    checkGitCommit: false,
  });
}

test('accepts exact direct authenticated cold-start evidence without closing A14', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-session-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    directDiagnosticOnly: true,
    authenticatedColdStart: true,
    bookingFlowPassed: false,
    fullPilotScenarioA14Passed: false,
    stageAReady: false,
  });
});

test('rejects candidate drift, Store delivery or an incomplete cold start', () => {
  const changedHash = structuredClone(evidence);
  changedHash.installed.apkSha256 = '0'.repeat(64);
  assert.throws(() => validate(changedHash), /package binding is invalid/u);

  const changedDelivery = structuredClone(evidence);
  changedDelivery.installed.delivery = 'google-play-split';
  assert.throws(() => validate(changedDelivery), /overstates Store delivery/u);

  const changedTest = structuredClone(evidence);
  changedTest.tests.coldStartSessionRestore.status = 'failed';
  assert.throws(() => validate(changedTest), /checks are incomplete or overstated/u);
});

test('rejects booking, deep-link, identity or sensitive-data overclaims', () => {
  for (const field of [
    'bookingFlowPassed',
    'authenticatedDeepLinksPassed',
    'accountIdentityRecorded',
    'containsPersonalAccountData',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[field] = true;
    assert.throws(() => validate(changed), /boundaries must remain exact and fail-closed/u);
  }
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private/account@example.com';
  assert.throws(() => validate(changed), /private path, identifier or credential/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_authenticated_session.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
