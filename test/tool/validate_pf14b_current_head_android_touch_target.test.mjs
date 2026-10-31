import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf14bCurrentHeadAndroidTouchTarget,
} from '../../tool/validate_pf14b_current_head_android_touch_target.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json',
), 'utf8'));

function validate(changed = evidence) {
  return validatePf14bCurrentHeadAndroidTouchTarget({
    root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts exact signed, data-preserving physical touch-target remediation', () => {
  assert.deepEqual(validate(), {
    status: 'passed-signed-data-preserving-physical-touch-target-remediation',
    buildNumber: '2026082302',
    candidateCommit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
    exactCiPassed: true,
    privateArchiveVerified: true,
    dataPreservingDirectUpdate: true,
    targetCount: 5,
    minimumWidthDp: 96.81,
    minimumHeightDp: 70.92,
    exactPreviousFontScaleRestored: true,
    technicalDebtClosed: true,
    manualVisualReview: false,
    manualTalkBackTraversal: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
});

test('rejects any weakened update-preservation fact', () => {
  for (const key of [
    'strictlyNewerBuildInstalled',
    'candidateSignatureMatchedInstalledApp',
    'installedCandidateHashMatches',
    'firstInstallTimePreserved',
    'ceDataInodePreserved',
    'foregroundActivityVerified',
  ]) {
    const changed = structuredClone(evidence);
    changed.dataPreservingUpdate[key] = false;
    assert.throws(() => validate(changed), /data-preserving direct update/u);
  }
});

test('rejects sub-48dp, overlapping or incomplete physical geometry', () => {
  for (const [key, value] of [
    ['minimumHeightDp', 47.99],
    ['targetCount', 4],
    ['allTargetsAtLeast48Dp', false],
    ['allTargetsPairwiseNonOverlapping', false],
    ['allTargetsEnabledClickableAndroidButtons', false],
  ]) {
    const changed = structuredClone(evidence);
    changed.touchTargetDiagnostic[key] = value;
    assert.throws(() => validate(changed), /touch-target geometry or font restoration/u);
  }
});

test('rejects font restoration, Store, manual-review and live-boundary overclaims', () => {
  const font = structuredClone(evidence);
  font.touchTargetDiagnostic.restoredFontScale = 1;
  assert.throws(() => validate(font), /touch-target geometry or font restoration/u);

  const store = structuredClone(evidence);
  store.releaseGate.googlePlayInternalDistribution = true;
  assert.throws(() => validate(store), /release gate/u);

  for (const key of [
    'productionChanged',
    'paymentChanged',
    'manualVisualReviewClaimed',
    'manualTalkBackClaimed',
    'talkBackSettingModified',
    'screenshotCaptured',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validate(changed), /boundaries must all remain false/u);
  }
});

test('rejects stale CI, open Technical Debt and private identifiers', () => {
  const stale = structuredClone(evidence);
  stale.exactCommitVerification.headCommitMatched = false;
  assert.throws(() => validate(stale), /exact-commit CI/u);

  const debt = structuredClone(evidence);
  debt.technicalDebt.status = 'open';
  assert.throws(() => validate(debt), /Technical Debt/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = 'deviceSerial=private';
  assert.throws(() => validate(privateValue), /private path, account, certificate or network/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_pf14b_current_head_android_touch_target.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
