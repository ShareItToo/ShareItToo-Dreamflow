import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateR12CodexHookGuardrails } from '../../tool/validate_r12_codex_hook_guardrails.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r12-codex-hook-guardrails-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR12CodexHookGuardrails({ repositoryRoot: root, evidence: changed });
}

test('accepts exact optional R12 guardrails with pending trust review', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    guardrailCount: 5,
    trustState: 'pending-official-review-after-definition-change',
    productRuntimeDependency: false,
    next48hPackage: 'R14',
  });
});

test('rejects official-support or activation overclaims', () => {
  const support = structuredClone(evidence);
  support.officialSupport.completeEnforcementBoundary = true;
  assert.throws(() => validate(support), /official support/u);

  const activation = structuredClone(evidence);
  activation.implementation.hookTrustedOrActivatedByR12 = true;
  assert.throws(() => validate(activation), /implementation boundary/u);
});

test('rejects a missing guardrail or hidden limitation', () => {
  const guardrail = structuredClone(evidence);
  guardrail.guardrails.hookDPackageCompletion = 'missing';
  assert.throws(() => validate(guardrail), /guardrail map/u);

  const limitation = structuredClone(evidence);
  limitation.limitations.pop();
  assert.throws(() => validate(limitation), /limitations/u);
});

test('rejects live mutations or credential extraction', () => {
  const live = structuredClone(evidence);
  live.boundaries.productionChanged = true;
  assert.throws(() => validate(live), /live boundary/u);

  const credential = structuredClone(evidence);
  credential.boundaries.credentialExtracted = true;
  assert.throws(() => validate(credential), /live boundary/u);
});

test('rejects premature or malformed GitHub verification', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-focused-tests-passed-full-regression-pending';
  premature.focusedVerification.fullTechnicalRegression = 'pending';
  premature.focusedVerification.githubRegression = 'pending';
  premature.focusedVerification.githubCodeql = 'pending';
  premature.githubVerification = {
    implementationCommit: '0'.repeat(40),
    regressionRunId: 1,
    regressionConclusion: 'success',
    flutterJobId: 2,
    backendJobId: 3,
    postgresJobId: 4,
    cleanCheckoutJobId: 5,
    signedCandidateBuilt: false,
    parallelStressExecuted: false,
    apiImagePublished: false,
    codeqlRunId: 6,
    codeqlConclusion: 'success',
    advancedSecurityCheckId: 7,
    advancedSecurityConclusion: 'success',
    newAlerts: 0,
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      checkId: 8,
      conclusion: 'failure',
      historicalFindingReinspected: false,
      credentialDetailsInspected: false,
      classifiedAsR12Regression: false,
    },
  };
  assert.throws(() => validate(premature), /cannot bind GitHub/u);

  const malformed = structuredClone(evidence);
  malformed.status = 'verified-regression-and-codeql-passed-ready-for-r14';
  malformed.focusedVerification.fullTechnicalRegression = 'passed-candidate-rollover-ci-metadata-mode';
  malformed.focusedVerification.githubRegression = 'passed';
  malformed.focusedVerification.githubCodeql = 'passed-no-new-alerts';
  malformed.githubVerification = {
    implementationCommit: 'bad',
    regressionRunId: 1,
    regressionConclusion: 'success',
    flutterJobId: 2,
    backendJobId: 3,
    postgresJobId: 4,
    cleanCheckoutJobId: 5,
    signedCandidateBuilt: false,
    parallelStressExecuted: false,
    apiImagePublished: false,
    codeqlRunId: 6,
    codeqlConclusion: 'success',
    advancedSecurityCheckId: 7,
    advancedSecurityConclusion: 'success',
    newAlerts: 0,
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      checkId: 97579664956,
      conclusion: 'failure',
      historicalFindingReinspected: false,
      credentialDetailsInspected: false,
      classifiedAsR12Regression: false,
    },
  };
  assert.throws(() => validate(malformed), /GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'owner@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
