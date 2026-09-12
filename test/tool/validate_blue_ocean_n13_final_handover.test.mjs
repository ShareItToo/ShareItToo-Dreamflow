import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN13FinalHandover } from '../../tool/validate_blue_ocean_n13_final_handover.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n13-final-regression-handover-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN13FinalHandover({ repositoryRoot: root, evidence: changed });
}

function pendingEvidence() {
  const pending = structuredClone(evidence);
  pending.status = 'implemented-local-gates-passed-ci-pending';
  delete pending.repositorySnapshot.verifiedImplementationHead;
  delete pending.repositorySnapshot.finalTreeState;
  pending.remainingBlockers.unshift('exact-n13-regression-and-codeql');
  delete pending.exactGitHubVerification;
  pending.driveHandover.uploaded = false;
  pending.driveHandover.fileId = null;
  return pending;
}

test('accepts the exact verified N13 decision handover', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    finalGate: 'STAGE_A_BLUE_OCEAN_DECISION',
    packageCount: 13,
    completedSyntheticFlows: 37,
    liveMutation: false,
    driveUploaded: true,
  });
});

test('accepts the bounded pre-CI state without final external bindings', () => {
  assert.equal(validate(pendingEvidence()).driveUploaded, false);
});

test('rejects repository identity or stale package-state drift', () => {
  const repository = structuredClone(evidence);
  repository.repositorySnapshot.branch = 'main';
  assert.throws(() => validate(repository), /repository snapshot/u);

  const portfolio = structuredClone(evidence);
  portfolio.packageStates.N8 = 'pending';
  assert.throws(() => validate(portfolio), /package-state portfolio/u);
});

test('rejects invented local verification or synthetic human evidence', () => {
  const tests = structuredClone(evidence);
  tests.localVerification.postgres16FreshClusterIntegration = 'pending';
  assert.throws(() => validate(tests), /local verification/u);

  const synthetic = structuredClone(evidence);
  synthetic.syntheticComparison.classification = 'HUMAN_EVIDENCE';
  assert.throws(() => validate(synthetic), /synthetic comparison/u);
});

test('rejects readiness, blocker, cost or risk overclaims', () => {
  const readiness = structuredClone(evidence);
  readiness.readiness.heilbronnWave0 = 'activated';
  assert.throws(() => validate(readiness), /product-readiness/u);

  const cost = structuredClone(evidence);
  cost.costState.optionalAiPilotBudgetApproved = true;
  assert.throws(() => validate(cost), /cost boundary/u);

  const risk = structuredClone(evidence);
  risk.acceptedAndDeferredRisk.professionalApprovalClaimed = true;
  assert.throws(() => validate(risk), /risk record/u);
});

test('rejects weakened HOLD recommendations or any live mutation', () => {
  const token = structuredClone(evidence);
  token.recommendedCurrentTokens[0] = 'AI_LISTING_PILOT_BUDGET_5_EUR_GO';
  assert.throws(() => validate(token), /owner-token/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.playConsoleOrTesterChanged = true;
  assert.throws(() => validate(mutation), /live mutation/u);
});

test('rejects premature final CI or Drive binding', () => {
  const github = pendingEvidence();
  github.exactGitHubVerification = {
    headSha: '0'.repeat(40), regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(github), /cannot bind final external evidence/u);

  const drive = pendingEvidence();
  drive.driveHandover = { targetFolderId: 'folder', uploaded: true, fileId: 'file-id-12345' };
  assert.throws(() => validate(drive), /cannot bind final external evidence/u);
});

test('rejects malformed final exact GitHub verification', () => {
  const final = structuredClone(evidence);
  final.status = 'verified-stage-a-blue-ocean-decision';
  final.repositorySnapshot.verifiedImplementationHead = 'bad';
  final.repositorySnapshot.finalTreeState = 'clean-and-synchronized-after-evidence-closure';
  final.exactGitHubVerification = {
    headSha: 'bad', regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(final), /repository snapshot|final state|exact GitHub/u);
});

test('accepts a structurally complete final decision binding', () => {
  const final = structuredClone(evidence);
  const headSha = 'a'.repeat(40);
  final.status = 'verified-stage-a-blue-ocean-decision';
  final.repositorySnapshot.verifiedImplementationHead = headSha;
  final.repositorySnapshot.finalTreeState = 'clean-and-synchronized-after-evidence-closure';
  final.exactGitHubVerification = {
    headSha, regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  final.driveHandover = {
    targetFolderId: '1YOBStKRnK1jOxWiCQz17MlGj7F3yNKWc',
    uploaded: true,
    fileId: 'drive-file-id-12345',
  };
  assert.equal(validate(final).status, 'verified-stage-a-blue-ocean-decision');
});

test('rejects private or secret-shaped handover evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'tester@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
