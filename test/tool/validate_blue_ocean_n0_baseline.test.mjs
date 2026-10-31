import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN0Baseline } from '../../tool/validate_blue_ocean_n0_baseline.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n0-baseline-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN0Baseline({
    repositoryRoot: root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact Blue Ocean N0 baseline', () => {
  assert.deepEqual(validate(), {
    status: 'verified-ready-for-n1',
    baselineHead: '763aecc12122d34e332bc2a561d3fb55fff544c3',
    driveInstructionId: '1sftFS7vGUPFuXwFIQad_fC204VGIGxK-',
    externallyReadyGateCount: 0,
    nextPackage: 'N1',
  });
});

test('rejects repository, CI or Drive instruction drift', () => {
  const repository = structuredClone(evidence);
  repository.repository.pullRequest.merged = true;
  assert.throws(() => validate(repository), /repository, PR or exact-CI/u);

  const drive = structuredClone(evidence);
  drive.driveInstruction.selectedFileId = 'older-duplicate';
  assert.throws(() => validate(drive), /Drive instruction selection/u);
});

test('rejects owner-decision or external-gate overclaim', () => {
  const legal = structuredClone(evidence);
  legal.ownerDecisions.professionalReview = ['PROFESSIONAL_REVIEW_APPROVED'];
  assert.throws(() => validate(legal), /binding owner decisions/u);

  const gate = structuredClone(evidence);
  gate.externalGateState.externallyReadyGateCount = 1;
  assert.throws(() => validate(gate), /external-gate state/u);
});

test('rejects a permissive feature baseline or changed intake', () => {
  const flags = structuredClone(evidence);
  flags.featureFlagBaseline.broadAiFeaturesEnabled = true;
  assert.throws(() => validate(flags), /feature-flag baseline/u);

  const intake = structuredClone(evidence);
  intake.implementationIntake.historicalDataMustRemain = false;
  assert.throws(() => validate(intake), /implementation intake/u);
});

test('rejects forbidden mutation or private-shaped evidence', () => {
  const mutation = structuredClone(evidence);
  mutation.boundaries.playConsoleChanged = true;
  assert.throws(() => validate(mutation), /forbidden mutation/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});

test('keeps CI metadata-only mode restricted to CI', () => {
  const direct = spawnSync(
    process.execPath,
    ['tool/validate_blue_ocean_n0_baseline.mjs', '--ci-metadata-only'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /restricted to CI/u);
});
