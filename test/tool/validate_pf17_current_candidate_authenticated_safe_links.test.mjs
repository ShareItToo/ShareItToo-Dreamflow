import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf17CurrentCandidateAuthenticatedSafeLinks,
} from '../../tool/validate_pf17_current_candidate_authenticated_safe_links.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-candidate-authenticated-safe-links-2026082302.json',
), 'utf8'));
const pf16Evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json',
), 'utf8'));
const pf14bEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json',
), 'utf8'));

function validate(changed = evidence) {
  return validatePf17CurrentCandidateAuthenticatedSafeLinks({
    root,
    evidence: changed,
    pf16Evidence,
    pf14bEvidence,
    checkGitCommit: false,
  });
}

test('accepts the exact current-candidate safe-link pass while all external gates stay open', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-safe-app-link-diagnostic',
    buildNumber: '2026082302',
    candidateCommit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
    exactInstalledApkVerified: true,
    authenticatedSafeLinksPassed: true,
    authenticatedSessionPreserved: true,
    authenticatedFixtureLinksPassed: false,
    bookingFlowPassed: false,
    realPushPassed: false,
    fullDeviceMatrixPassed: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
});

test('rejects candidate, installed APK or device drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.buildNumber = '2026082301';
  assert.throws(() => validate(candidate), /not bound to the exact current candidate/u);

  const installed = structuredClone(evidence);
  installed.installed.delivery = 'google-play-split';
  assert.throws(() => validate(installed), /overstates Store delivery/u);

  const device = structuredClone(evidence);
  device.device.osVersion = '16';
  assert.throws(() => validate(device), /physical-device summary/u);
});

test('rejects missing session preservation and external or mutation overclaims', () => {
  const missing = structuredClone(evidence);
  missing.tests.authenticatedNotificationsAfter.status = 'failed';
  assert.throws(() => validate(missing), /checks are incomplete or overstated/u);

  for (const key of [
    'storeInstallationGateSatisfied',
    'authenticatedFixtureLinksPassed',
    'bookingFlowPassed',
    'realPushPassed',
    'logoutPerformed',
    'accountMutationPerformed',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validate(changed), /boundaries must remain fail-closed/u);
  }
});

test('rejects retained private identifiers', () => {
  const changed = structuredClone(evidence);
  changed.note = 'ssid=private-network';
  assert.throws(() => validate(changed), /private path, account, device or network identifier/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_pf17_current_candidate_authenticated_safe_links.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
