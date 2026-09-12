import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf16CurrentCandidateReadOnly,
} from '../../tool/validate_pf16_current_candidate_read_only.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json',
), 'utf8'));
const regression = readFileSync(resolve(root, 'scripts/technical_regression_check.sh'), 'utf8');

function validate(changed = evidence) {
  return validatePf16CurrentCandidateReadOnly({
    root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact sanitized PF16 read-only physical regression', () => {
  assert.deepEqual(validate(), {
    status: 'passed-current-candidate-read-only-physical-regression',
    buildNumber: '2026082302',
    candidateCommit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
    privateArchiveVerified: true,
    exactInstalledApkVerified: true,
    processRestartPassed: true,
    authenticatedColdStartCycleCount: 2,
    offlineRecoveryPassed: true,
    mainNavigationDestinationCount: 5,
    legalRouteCount: 7,
    largeTextDestinationCount: 5,
    exactPreviousFontScaleRestored: true,
    manualVisualReview: false,
    manualTalkBackTraversal: false,
    completeDeviceMatrix: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
});

test('rejects candidate drift and an incomplete read-only check', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.buildNumber = '2026082301';
  assert.throws(() => validate(candidate), /candidate or installed APK binding/u);

  const check = structuredClone(evidence);
  check.checks.authenticatedColdStart = 'passed-one-cycle';
  assert.throws(() => validate(check), /read-only checks/u);
});

test('rejects incomplete offline or font restoration evidence', () => {
  const offline = structuredClone(evidence);
  offline.checks.offlineColdStartAndRecovery = 'offline-only';
  assert.throws(() => validate(offline), /read-only checks/u);

  const font = structuredClone(evidence);
  font.checks.largeTextMainNavigation.restoredFontScale = 1;
  assert.throws(() => validate(font), /exact setting restoration/u);
});

test('rejects manual, Store, complete-matrix and Stage-A overclaims', () => {
  for (const key of [
    'manualVisualReview',
    'manualTalkBackTraversal',
    'googlePlayDistribution',
    'completeDeviceMatrix',
    'storeSubmissionAllowed',
    'stageAReady',
  ]) {
    const changed = structuredClone(evidence);
    changed.releaseGate[key] = true;
    assert.throws(() => validate(changed), /release gate/u);
  }

  const boundary = structuredClone(evidence);
  boundary.boundaries.cartMutationPerformed = true;
  assert.throws(() => validate(boundary), /boundaries must remain false/u);

  const missingBoundary = structuredClone(evidence);
  delete missingBoundary.boundaries.accountMutationPerformed;
  assert.throws(() => validate(missingBoundary), /boundaries must remain false/u);
});

test('rejects private identifiers and keeps CI metadata-only mode restricted', () => {
  const privateValue = structuredClone(evidence);
  privateValue.note = 'deviceSerial=private';
  assert.throws(() => validate(privateValue), /private path, account, device or network/u);

  const direct = spawnSync(
    process.execPath,
    ['tool/validate_pf16_current_candidate_read_only.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});

test('permanent regression retains the PF16 diagnostic and evidence gate', () => {
  assert.match(
    regression,
    /node --check tool\/diagnose_pf16_current_candidate_read_only\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/diagnose_pf16_current_candidate_read_only\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node --check tool\/validate_pf16_current_candidate_read_only\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_pf16_current_candidate_read_only\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node tool\/validate_pf16_current_candidate_read_only\.mjs --ci-metadata-only/u,
  );
});
