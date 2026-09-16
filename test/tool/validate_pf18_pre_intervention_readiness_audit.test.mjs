import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf18PreInterventionReadinessAudit,
} from '../../tool/validate_pf18_pre_intervention_readiness_audit.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/pre-intervention-readiness-audit-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validatePf18PreInterventionReadinessAudit({
    root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact fail-closed pre-intervention audit', () => {
  assert.deepEqual(validate(), {
    status: 'autonomous-technical-lanes-exhausted-external-evidence-required',
    technicallyPreparedGateCount: 11,
    externallyReadyGateCount: 0,
    supportTechnicalCoverageCount: 167,
    supportExternalEvidenceRequiredCount: 47,
    currentAndroidBuildNumber: '2026082302',
    protectedFixtureVaultPresent: false,
    nextActionBlock: 'A1',
    releaseDecision: 'hold-no-go',
  });
});

test('rejects repository, CI and Drive drift', () => {
  const repository = structuredClone(evidence);
  repository.repository.pullRequest.merged = true;
  assert.throws(() => validate(repository), /repository, PR or exact-CI baseline/u);

  const drive = structuredClone(evidence);
  drive.driveSource.repositoryHashMatchesDrive = false;
  assert.throws(() => validate(drive), /Drive source binding/u);
});

test('rejects false external readiness or a softened next gate', () => {
  const ready = structuredClone(evidence);
  ready.technicalPreparation.externallyReadyGateCount = 1;
  assert.throws(() => validate(ready), /aggregate gate or Support state/u);

  const next = structuredClone(evidence);
  next.nextExternalGate.automaticContinuationAllowed = true;
  assert.throws(() => validate(next), /bounded A1 Walid decision/u);
});

test('rejects fixture, Store, accessibility or mutation overclaims', () => {
  const fixture = structuredClone(evidence);
  fixture.protectedFixture.standardVaultPresent = true;
  assert.throws(() => validate(fixture), /protected-fixture boundary/u);

  const store = structuredClone(evidence);
  store.currentAndroidCandidate.delivery = 'google-play-split';
  assert.throws(() => validate(store), /candidate observation/u);

  const accessibility = structuredClone(evidence);
  accessibility.currentAndroidCandidate.accessibilityEnabled = true;
  assert.throws(() => validate(accessibility), /candidate observation/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.storeChanged = true;
  assert.throws(() => validate(mutation), /external mutation/u);
});

test('rejects private or secret-shaped additions', () => {
  const privateField = structuredClone(evidence);
  privateField.deviceId = 'forbidden';
  assert.throws(() => validate(privateField), /private field is forbidden/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped content/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_pf18_pre_intervention_readiness_audit.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
