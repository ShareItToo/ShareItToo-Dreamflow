import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateCurrentHeadAndroidLegalRoutes,
} from '../../tool/validate_current_head_android_legal_routes.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-legal-routes-2026082301.json',
), 'utf8'));
const candidateEvidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-head-android-candidate-2026082301.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateCurrentHeadAndroidLegalRoutes({
    root,
    evidence: changed,
    candidateEvidence,
    checkGitCommit: false,
  });
}

test('accepts seven read-only legal routes without claiming legal approval', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-authenticated-legal-route-diagnostic',
    buildNumber: '2026082301',
    exactCandidate: true,
    authenticatedLegalRoutesPassed: true,
    documentCount: 7,
    professionalLegalApprovalPassed: false,
    platformWithdrawalOpened: false,
    stateMutationPerformed: false,
    stageAReady: false,
  });
});

test('rejects a missing or failed legal document', () => {
  const missing = structuredClone(evidence);
  delete missing.tests.Datenschutz;
  assert.throws(() => validate(missing), /checks are incomplete or overstated/u);

  const failed = structuredClone(evidence);
  failed.tests.AGB.status = 'failed';
  assert.throws(() => validate(failed), /checks are incomplete or overstated/u);
});

test('rejects legal approval, withdrawal, mutation, Store and contact overclaims', () => {
  for (const key of [
    'professionalLegalApprovalPassed',
    'platformWithdrawalOpened',
    'platformWithdrawalSubmitted',
    'supportSubmitted',
    'contactActionPerformed',
    'accountMutationPerformed',
    'storeInstallationGateSatisfied',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validate(changed), /boundaries must remain exact and fail-closed/u);
  }
});

test('rejects retained contact values and private identifiers', () => {
  for (const note of ['contact@example.test', 'deviceSerial=private']) {
    const changed = structuredClone(evidence);
    changed.note = note;
    assert.throws(() => validate(changed), /private path, contact, account or network/u);
  }
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_current_head_android_legal_routes.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
