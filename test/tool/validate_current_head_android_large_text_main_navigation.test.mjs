import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidLargeTextMainNavigation,
} from '../../tool/validate_current_head_android_large_text_main_navigation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-large-text-main-navigation-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateCurrentHeadAndroidLargeTextMainNavigation({
    root,
    evidence: changed,
    candidateEvidence,
    checkGitCommit: false,
  });
}

test('accepts five exact 200-percent destinations with exact scale restoration', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-large-text-main-navigation-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    targetFontScale: 2,
    exactPreviousFontScaleRestored: true,
    authenticatedMainNavigationAtLargeTextPassed: true,
    destinationCount: 5,
    manualVisualLargeTextReviewPassed: false,
    manualTalkBackTraversalPassed: false,
    stateMutationPerformed: false,
    stageAReady: false,
  });
});

test('rejects a missing or failed large-text destination', () => {
  const missing = structuredClone(evidence);
  delete missing.tests.Nachrichten;
  assert.throws(() => validate(missing), /checks are incomplete or overstated/u);

  const failed = structuredClone(evidence);
  failed.tests.Mietkorb.status = 'failed';
  assert.throws(() => validate(failed), /checks are incomplete or overstated/u);
});

test('rejects font-scale or restoration drift', () => {
  for (const [key, value] of [
    ['targetFontScale', 1.99],
    ['restoredFontScale', 1],
    ['exactPreviousFontScaleRestored', false],
  ]) {
    const changed = structuredClone(evidence);
    changed.configuration[key] = value;
    assert.throws(() => validate(changed), /font-scale application or exact restoration/u);
  }
});

test('rejects visual, TalkBack, Store, mutation and screenshot overclaims', () => {
  for (const key of [
    'manualVisualLargeTextReviewPassed',
    'manualTalkBackTraversalPassed',
    'talkBackSettingModified',
    'storeInstallationGateSatisfied',
    'messageSent',
    'cartMutationPerformed',
    'accountMutationPerformed',
    'screenshotCaptured',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validate(changed), /boundaries must remain exact and fail-closed/u);
  }
});

test('rejects private identifiers and unexpected device drift', () => {
  const privateValue = structuredClone(evidence);
  privateValue.note = 'deviceSerial=private';
  assert.throws(() => validate(privateValue), /private path, account or network/u);

  const changedDevice = structuredClone(evidence);
  changedDevice.device.apiLevel = 36;
  assert.throws(() => validate(changedDevice), /physical-device summary is invalid/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_large_text_main_navigation.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
