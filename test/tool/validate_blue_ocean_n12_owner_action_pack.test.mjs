import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN12OwnerActionPack } from '../../tool/validate_blue_ocean_n12_owner_action_pack.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n12-owner-action-pack-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN12OwnerActionPack({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact prepared and unexecuted six-section action pack', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    sections: 6,
    replyTokens: 6,
    optionalAiPilotHardCapEur: 5,
    liveMutation: false,
    nextPackage: 'N13',
  });
});

test('rejects a missing or reordered owner-action section', () => {
  const missing = structuredClone(evidence);
  missing.sections.pop();
  assert.throws(() => validate(missing), /six-section/u);

  const reordered = structuredClone(evidence);
  reordered.sections.reverse();
  assert.throws(() => validate(reordered), /six-section/u);
});

test('rejects missing minimum coverage or reply-token drift', () => {
  const coverage = structuredClone(evidence);
  coverage.minimumCoverage.marketplacePsp = 'ready';
  assert.throws(() => validate(coverage), /minimum owner-action coverage/u);

  const token = structuredClone(evidence);
  token.preparedReplyTokens.pop();
  assert.throws(() => validate(token), /reply-token/u);
});

test('rejects risk-resolution or cost-approval overclaims', () => {
  const risk = structuredClone(evidence);
  risk.acceptedAndDeferredRisk.riskResolvedClaimed = true;
  assert.throws(() => validate(risk), /risk record/u);

  const cost = structuredClone(evidence);
  cost.costState.aiBudgetApproved = true;
  assert.throws(() => validate(cost), /cost boundary/u);
});

test('rejects third-party contact or any live mutation', () => {
  const contact = structuredClone(evidence);
  contact.boundaries.thirdPartyContacted = true;
  assert.throws(() => validate(contact), /mutation boundary/u);

  const consoleMutation = structuredClone(evidence);
  consoleMutation.boundaries.playConsoleChanged = true;
  assert.throws(() => validate(consoleMutation), /mutation boundary/u);
});

test('rejects premature or malformed GitHub verification', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-regression-passed-ci-pending';
  premature.targetedVerification.githubRegression = 'pending';
  premature.targetedVerification.githubCodeql = 'pending';
  premature.exactGitHubVerification = {
    headSha: '0'.repeat(40), regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(premature), /cannot bind exact GitHub/u);

  const final = structuredClone(evidence);
  final.exactGitHubVerification = {
    headSha: 'bad', regressionRunId: 1, regressionConclusion: 'success',
    codeqlRunId: 2, codeqlConclusion: 'success',
  };
  assert.throws(() => validate(final), /exact GitHub verification/u);
});

test('rejects private or secret-shaped owner values', () => {
  const privateEvidence = structuredClone(evidence);
  privateEvidence.note = 'tester@example.test';
  assert.throws(() => validate(privateEvidence), /private or secret-shaped/u);
});
