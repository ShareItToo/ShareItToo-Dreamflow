import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw11RegressionCompletenessStaleSupportWiring,
} from '../../tool/validate_rw11_regression_completeness_stale_support_wiring.mjs';

const root = new URL('../../', import.meta.url);
const repositoryRoot = new URL('.', root).pathname;
const evidence = () => JSON.parse(readFileSync(
  new URL(
    'docs/evidence/48h-remote/rw11-regression-completeness-stale-support-wiring-20260825.json',
    root,
  ),
  'utf8',
));

test('accepts the current bounded RW11 evidence state', () => {
  const result = validateRw11RegressionCompletenessStaleSupportWiring({
    repositoryRoot,
    evidence: evidence(),
  });
  assert.equal(result.resolvedFindings, 3);
  assert.equal(result.completeToolInventoryPassed, 'passed-1867');
  assert.equal(result.residualRisks, 3);
});

test('rejects a product behavior scope expansion', () => {
  const value = evidence();
  value.scope.productBehaviorChanged = true;
  assert.throws(
    () => validateRw11RegressionCompletenessStaleSupportWiring({
      repositoryRoot,
      evidence: value,
    }),
    /scope or deterministic-test policy/u,
  );
});

test('rejects removal of the complete tool-test invocation', () => {
  assert.throws(
    () => validateRw11RegressionCompletenessStaleSupportWiring({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        'scripts/technical_regression_check.sh': '#!/usr/bin/env bash\n',
      },
    }),
    /complete tool-test execution is not registered/u,
  );
});

test('rejects a granted live gate', () => {
  const value = evidence();
  value.gates.PR7_MERGE_APPROVED = 'granted';
  assert.throws(
    () => validateRw11RegressionCompletenessStaleSupportWiring({
      repositoryRoot,
      evidence: value,
    }),
    /gate or boundary truth/u,
  );
});

test('rejects source drift', () => {
  assert.throws(
    () => validateRw11RegressionCompletenessStaleSupportWiring({
      repositoryRoot,
      evidence: evidence(),
      sourceTexts: {
        'test/tool/harassment_block_report_wiring.test.mjs': '// drift\n',
      },
    }),
    /source inventory hash is stale/u,
  );
});

test('rejects CI closure without an exact candidate', () => {
  const value = evidence();
  value.status = 'verified-regression-and-codeql-passed';
  value.implementationHead = null;
  value.localRegression = null;
  value.verification.fullTechnicalRegression = 'passed';
  value.verification.githubRegression = 'passed';
  value.verification.githubCodeql = 'passed-no-new-alerts';
  assert.throws(
    () => validateRw11RegressionCompletenessStaleSupportWiring({
      repositoryRoot,
      evidence: value,
    }),
    /full-regression evidence is invalid/u,
  );
});
