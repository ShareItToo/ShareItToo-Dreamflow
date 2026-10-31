import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidOfflineSession,
} from '../../tool/validate_current_head_android_offline_session.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-offline-session-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateCurrentHeadAndroidOfflineSession({
    root,
    evidence: changed,
    candidateEvidence,
    checkGitCommit: false,
  });
}

test('accepts the exact offline cold start without closing A15 or Stage A', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-session-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    onlinePrecondition: true,
    offlineColdStart: true,
    onlineRestored: true,
    secondNetworkTested: false,
    safeMutationTested: false,
    fullPilotScenarioA15Passed: false,
    stageAReady: false,
  });
});

test('rejects a missing online precondition, offline gate or reconnect proof', () => {
  for (const [field, value] of [
    ['onlinePrecondition', 'missing'],
    ['connectivityGate', 'failed'],
    ['networkRestored', 'toggle-only'],
  ]) {
    const changed = structuredClone(evidence);
    changed.network[field] = value;
    assert.throws(() => validate(changed), /offline and reconnect proof is incomplete/u);
  }
});

test('rejects Store, functional-matrix or network-identifier overclaims', () => {
  const changedBoundary = structuredClone(evidence);
  changedBoundary.boundaries.bookingFlowPassed = true;
  assert.throws(
    () => validate(changedBoundary),
    /boundaries must remain exact and fail-closed/u,
  );
  const changedDelivery = structuredClone(evidence);
  changedDelivery.installed.delivery = 'google-play-split';
  assert.throws(() => validate(changedDelivery), /overstates Store delivery/u);
  const changedNetwork = structuredClone(evidence);
  changedNetwork.note = 'ssid=private-network';
  assert.throws(() => validate(changedNetwork), /network identifier/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_offline_session.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
