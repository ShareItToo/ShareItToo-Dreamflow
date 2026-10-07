import assert from 'node:assert/strict';
import test from 'node:test';

import {
  r5RequiredRepeatedRuns,
  r5ResultClassification,
  runR5RepeatedPostgresStability,
} from '../../tool/run_r5_repeated_postgres_stability.mjs';

const passed = Object.freeze({
  status: 'passed-and-cleaned',
  postgresMajor: 16,
  host: '127.0.0.1',
  database: 'sit_integration',
  integrationTest: 'backend/test/postgres_foundation.integration.test.js',
});

function resources(index) {
  return {
    rssBytes: 1_000_000 + (index * 1_000),
    heapUsedBytes: 500_000 + (index * 500),
    userCpuMicros: 10_000 + (index * 100),
    systemCpuMicros: 5_000 + (index * 50),
  };
}

test('R5 runs exactly 25 fresh complete integrations and records bounded observations', async () => {
  let runs = 0;
  let clock = 0;
  let resourceReads = 0;
  const result = await runR5RepeatedPostgresStability({
    runIntegration: async () => {
      runs += 1;
      return passed;
    },
    clock: () => {
      clock += 10;
      return clock;
    },
    readResources: () => resources(resourceReads++),
  });

  assert.equal(runs, r5RequiredRepeatedRuns);
  assert.equal(result.status, 'passed-25-fresh-runs-and-cleaned');
  assert.equal(result.resultClassification, r5ResultClassification);
  assert.deepEqual(result.coverage, {
    completeBlueOceanMockListingFlows: 25,
    freshBackendStartStopCycles: 25,
    cartRequestFlows: 25,
    g3SameOwnerFlows: 25,
    g4DeterministicPlannerFlows: 25,
    g5ListingSetFlows: 25,
    publicationReplays: 25,
    applicationServerRestartScenarios: 25,
  });
  assert.deepEqual(result.failures, {
    childProcessFailures: 0,
    uncaughtNodeErrors: 0,
    unexpectedBackend5xxInTargetFlows: 0,
    failedStateRestorations: 0,
    detectedDataCorruptions: 0,
    failedIdempotencyReplays: 0,
    unexpectedNetworkTargets: 0,
  });
  assert.equal(result.observation.minimumRunDurationMs, 10);
  assert.equal(result.observation.medianRunDurationMs, 10);
  assert.equal(result.observation.maximumRunDurationMs, 10);
  assert.equal(result.observation.performanceCertificationClaimed, false);
  assert.equal(result.cleanup.persistentTestPrerequisiteCreated, false);
  assert.ok(Object.isFrozen(result));
});

test('R5 stops immediately on an incomplete or dirty integration result', async () => {
  let runs = 0;
  await assert.rejects(
    runR5RepeatedPostgresStability({
      runIntegration: async () => {
        runs += 1;
        return runs === 4 ? { ...passed, status: 'failed' } : passed;
      },
      clock: (() => {
        let value = 0;
        return () => value += 1;
      })(),
      readResources: () => resources(0),
    }),
    /run 4 was not passed and cleaned/u,
  );
  assert.equal(runs, 4);
});

test('R5 identifies the exact repeated run when the integration throws', async () => {
  let runs = 0;
  await assert.rejects(
    runR5RepeatedPostgresStability({
      runIntegration: async () => {
        runs += 1;
        if (runs === 5) throw new Error('deterministic_child_failure');
        return passed;
      },
      clock: (() => {
        let value = 0;
        return () => value += 1;
      })(),
      readResources: () => resources(0),
    }),
    /run 5 failed: deterministic_child_failure/u,
  );
  assert.equal(runs, 5);
});

test('R5 rejects invalid clocks and dependency injection', async () => {
  await assert.rejects(
    runR5RepeatedPostgresStability({ runIntegration: null }),
    /dependencies are invalid/u,
  );
  await assert.rejects(
    runR5RepeatedPostgresStability({
      runIntegration: async () => passed,
      clock: (() => {
        let calls = 0;
        return () => calls++ === 0 ? 2 : 1;
      })(),
      readResources: () => resources(0),
    }),
    /run 1 was not passed and cleaned/u,
  );
});
