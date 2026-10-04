import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidRestart,
} from '../../tool/validate_current_head_android_restart.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-restart-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence, changedCandidate = candidateEvidence) {
  return validateCurrentHeadAndroidRestart({
    root,
    evidence: changed,
    candidateEvidence: changedCandidate,
    checkGitCommit: false,
  });
}

test('accepts the exact bounded current-head restart without closing A14 or Stage A', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-process-restart-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    processRestart: true,
    dataContainerIdentityPreserved: true,
    fullPilotScenarioA14Passed: false,
    stageAReady: false,
  });
});

test('rejects candidate drift and incomplete restart results', () => {
  const changedCandidate = structuredClone(evidence);
  changedCandidate.candidate.apkSha256 = '0'.repeat(64);
  assert.throws(() => validate(changedCandidate), /does not match the PF6 candidate/u);

  const changedTest = structuredClone(evidence);
  changedTest.tests.launcherProcessRestarted.status = 'failed';
  assert.throws(() => validate(changedTest), /checks are incomplete or overstated/u);
});

test('rejects a full A14, Store or sensitive-data overclaim', () => {
  for (const field of [
    'fullPilotScenarioA14Passed',
    'storeInstallationGateSatisfied',
    'accountContentInspected',
    'containsRawDeviceIdentifiers',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[field] = true;
    assert.throws(() => validate(changed), /boundaries must remain exact and fail-closed/u);
  }
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private/device-record';
  assert.throws(() => validate(changed), /private path, identifier or account datum/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_restart.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
