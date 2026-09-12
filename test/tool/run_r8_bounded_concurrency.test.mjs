import assert from 'node:assert/strict';
import test from 'node:test';

import {
  r8ConcurrentPrivacyExportAccounts,
  r8ForbiddenFindings,
  r8MaximumConcurrentWorkers,
  r8RequiredScenarios,
  r8ResultClassification,
  r8SyntheticAccountCount,
} from '../../tool/r8_bounded_concurrency_contract.mjs';
import { runR8BoundedConcurrency } from '../../tool/run_r8_bounded_concurrency.mjs';

const passedIntegration = Object.freeze({
  status: 'passed-and-cleaned',
  postgresMajor: 16,
  host: '127.0.0.1',
  database: 'sit_integration',
  integrationTest: 'backend/test/postgres_foundation.integration.test.js',
});

test('R8 reports the complete bounded non-capacity concurrency contract', async () => {
  let scenarioRuns = 0;
  let integrationRuns = 0;
  const result = await runR8BoundedConcurrency({
    runScenarioTests: async () => { scenarioRuns += 1; },
    runIntegration: async () => {
      integrationRuns += 1;
      return passedIntegration;
    },
    clock: (() => {
      let value = 100;
      return () => {
        value += 25;
        return value;
      };
    })(),
  });

  assert.equal(scenarioRuns, 1);
  assert.equal(integrationRuns, 1);
  assert.equal(result.status, 'passed-bounded-concurrency-and-cleaned');
  assert.equal(result.resultClassification, r8ResultClassification);
  assert.deepEqual(result.syntheticLoad, {
    accountCount: r8SyntheticAccountCount,
    maximumConcurrentWorkers: r8MaximumConcurrentWorkers,
    concurrentPrivacyExportAccounts: r8ConcurrentPrivacyExportAccounts,
    productionCapacityClaimed: false,
  });
  assert.deepEqual(result.scenarios, r8RequiredScenarios);
  assert.deepEqual(result.findings, Object.fromEntries(
    r8ForbiddenFindings.map((finding) => [finding, 0]),
  ));
  assert.equal(result.assertions.cartIsolationRows, r8SyntheticAccountCount);
  assert.equal(result.assertions.supportIsolationRows, r8SyntheticAccountCount);
  assert.equal(
    result.assertions.privacyExportsVerified,
    r8ConcurrentPrivacyExportAccounts,
  );
  assert.equal(result.observation.durationMs, 25);
  assert.equal(result.observation.productionCapacityClaimed, false);
  assert.equal(result.cleanup.syntheticCredentialsRetained, false);
  assert.ok(Object.isFrozen(result));
});

test('R8 fails closed on an incomplete integration or invalid dependency', async () => {
  await assert.rejects(
    runR8BoundedConcurrency({ runIntegration: null }),
    /dependencies are invalid/u,
  );
  await assert.rejects(
    runR8BoundedConcurrency({
      runScenarioTests: async () => {},
      runIntegration: async () => ({ ...passedIntegration, status: 'failed' }),
      clock: () => 1,
    }),
    /not passed and cleaned/u,
  );
  await assert.rejects(
    runR8BoundedConcurrency({
      runScenarioTests: async () => {},
      runIntegration: async () => passedIntegration,
      clock: (() => {
        let calls = 0;
        return () => calls++ === 0 ? 2 : 1;
      })(),
    }),
    /clock is invalid/u,
  );
});
