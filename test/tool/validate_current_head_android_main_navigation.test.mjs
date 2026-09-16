import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidMainNavigation,
} from '../../tool/validate_current_head_android_main_navigation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-main-navigation-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateCurrentHeadAndroidMainNavigation({
    root,
    evidence: changed,
    candidateEvidence,
    checkGitCommit: false,
  });
}

test('accepts five exact read-only destinations without closing Stage A', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-main-navigation-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    authenticatedMainNavigationPassed: true,
    destinationCount: 5,
    stateMutationPerformed: false,
    fullFunctionalMatrixPassed: false,
    stageAReady: false,
  });
});

test('rejects a missing or failed authenticated destination', () => {
  const missing = structuredClone(evidence);
  delete missing.tests.Nachrichten;
  assert.throws(() => validate(missing), /checks are incomplete or overstated/u);

  const failed = structuredClone(evidence);
  failed.tests.Mietkorb.status = 'failed';
  assert.throws(() => validate(failed), /checks are incomplete or overstated/u);
});

test('rejects Store, mutation, full-matrix and private-data overclaims', () => {
  for (const [key, value] of [
    ['storeInstallationGateSatisfied', true],
    ['messageSent', true],
    ['cartMutationPerformed', true],
    ['accountMutationPerformed', true],
    ['manualTalkBackTraversalPassed', true],
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = value;
    assert.throws(() => validate(changed), /boundaries must remain exact and fail-closed/u);
  }

  const privateValue = structuredClone(evidence);
  privateValue.note = 'deviceSerial=private';
  assert.throws(() => validate(privateValue), /private path, account or network identifier/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_main_navigation.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
