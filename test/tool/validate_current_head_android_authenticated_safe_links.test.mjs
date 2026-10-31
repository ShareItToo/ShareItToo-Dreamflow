import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidAuthenticatedSafeLinks,
} from '../../tool/validate_current_head_android_authenticated_safe_links.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-authenticated-safe-links-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateCurrentHeadAndroidAuthenticatedSafeLinks({
    root,
    evidence: changed,
    candidateEvidence,
    checkGitCommit: false,
  });
}

test('accepts exact authenticated safe links without closing fixture or Stage A gates', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-safe-app-link-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    authenticatedSafeLinksPassed: true,
    authenticatedSessionPreserved: true,
    authenticatedFixtureLinksPassed: false,
    bookingFlowPassed: false,
    fullDeviceMatrixPassed: false,
    stageAReady: false,
  });
});

test('rejects missing pre/post authentication or an unsafe-link overclaim', () => {
  for (const path of [
    ['tests', 'authenticatedNotificationsBefore', 'status'],
    ['tests', 'unsafeIdentifierRejected', 'status'],
    ['tests', 'authenticatedNotificationsAfter', 'status'],
  ]) {
    const changed = structuredClone(evidence);
    changed[path[0]][path[1]][path[2]] = 'failed';
    assert.throws(() => validate(changed), /checks are incomplete or overstated/u);
  }
});

test('rejects Store, fixture, booking and private-data overclaims', () => {
  const changedBoundary = structuredClone(evidence);
  changedBoundary.boundaries.authenticatedFixtureLinksPassed = true;
  assert.throws(
    () => validate(changedBoundary),
    /boundaries must remain exact and fail-closed/u,
  );
  const changedDelivery = structuredClone(evidence);
  changedDelivery.installed.delivery = 'google-play-split';
  assert.throws(() => validate(changedDelivery), /overstates Store delivery/u);
  const changedPrivate = structuredClone(evidence);
  changedPrivate.note = 'ssid=private-network';
  assert.throws(() => validate(changedPrivate), /private path, account or network identifier/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_authenticated_safe_links.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
