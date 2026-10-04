import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN11CodexLocalGuardrails } from '../../tool/validate_blue_ocean_n11_codex_local_guardrails.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n11-codex-local-guardrails-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN11CodexLocalGuardrails({ repositoryRoot: root, evidence: changed });
}

test('accepts supported optional repo-local guardrails awaiting trust review', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    officialSupport: 'supported',
    trustState: 'pending-official-review-on-next-hook-discovery',
    productDependency: false,
    nextPackage: 'N12',
  });
});

test('rejects official support or trust-state overclaims', () => {
  const enforcement = structuredClone(evidence);
  enforcement.officialSupport.completeEnforcementBoundary = true;
  assert.throws(() => validate(enforcement), /official support/u);

  const trust = structuredClone(evidence);
  trust.implementation.trustState = 'trusted';
  assert.throws(() => validate(trust), /implementation boundary/u);
});

test('rejects missing guardrails or hidden limitations', () => {
  const guardrail = structuredClone(evidence);
  guardrail.guardrails.fastSitValidatorsBeforeCommit = 'missing';
  assert.throws(() => validate(guardrail), /guardrail map/u);

  const limitation = structuredClone(evidence);
  limitation.limitations.pop();
  assert.throws(() => validate(limitation), /limitation map/u);
});

test('rejects hook activation or any live mutation claim', () => {
  const trusted = structuredClone(evidence);
  trusted.boundaries.hookTrustedOrActivatedByN11 = true;
  assert.throws(() => validate(trusted), /mutation boundary/u);

  const production = structuredClone(evidence);
  production.boundaries.productionChanged = true;
  assert.throws(() => validate(production), /mutation boundary/u);
});

test('rejects verification-count drift', () => {
  const changed = structuredClone(evidence);
  changed.targetedVerification.hookBehaviorTests = 'passed-9';
  assert.throws(() => validate(changed), /verification record/u);
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

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'tester@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
