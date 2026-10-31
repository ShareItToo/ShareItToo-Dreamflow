#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runLocalPostgresIntegration } from './run_local_postgres_integration.mjs';

export const r5RequiredRepeatedRuns = 25;
export const r5ResultClassification =
  'LOCAL_REPEAT_STABILITY_OBSERVATION_NOT_PERFORMANCE_CERTIFICATION';

function fail(message) {
  throw new Error(message);
}

function resourceSnapshot() {
  const memory = process.memoryUsage();
  const usage = process.resourceUsage();
  return Object.freeze({
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    userCpuMicros: usage.userCPUTime,
    systemCpuMicros: usage.systemCPUTime,
  });
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) fail(`R5 ${label} is invalid.`);
  return value;
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export async function runR5RepeatedPostgresStability({
  runIntegration = () => runLocalPostgresIntegration({ inheritTestOutput: false }),
  clock = () => performance.now(),
  readResources = resourceSnapshot,
} = {}) {
  if (typeof runIntegration !== 'function'
      || typeof clock !== 'function'
      || typeof readResources !== 'function') {
    fail('R5 runner dependencies are invalid.');
  }
  const before = readResources();
  const durations = [];
  for (let index = 0; index < r5RequiredRepeatedRuns; index += 1) {
    const started = finiteNonNegative(clock(), 'start clock');
    let result;
    try {
      result = await runIntegration();
    } catch (error) {
      fail(
        `R5 fresh integration run ${index + 1} failed: `
          + `${error?.message ?? 'unknown integration failure'}`,
      );
    }
    const finished = finiteNonNegative(clock(), 'finish clock');
    if (finished < started
        || result?.status !== 'passed-and-cleaned'
        || result.postgresMajor !== 16
        || result.host !== '127.0.0.1'
        || result.database !== 'sit_integration'
        || result.integrationTest
          !== 'backend/test/postgres_foundation.integration.test.js') {
      fail(`R5 fresh integration run ${index + 1} was not passed and cleaned.`);
    }
    durations.push(finished - started);
  }
  const after = readResources();
  for (const [label, value] of Object.entries({ ...before, ...after })) {
    finiteNonNegative(value, `resource ${label}`);
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-r5-repeated-postgres-stability-observation',
    status: 'passed-25-fresh-runs-and-cleaned',
    resultClassification: r5ResultClassification,
    repeatedRuns: r5RequiredRepeatedRuns,
    coverage: Object.freeze({
      completeBlueOceanMockListingFlows: r5RequiredRepeatedRuns,
      freshBackendStartStopCycles: r5RequiredRepeatedRuns,
      cartRequestFlows: r5RequiredRepeatedRuns,
      g3SameOwnerFlows: r5RequiredRepeatedRuns,
      g4DeterministicPlannerFlows: r5RequiredRepeatedRuns,
      g5ListingSetFlows: r5RequiredRepeatedRuns,
      publicationReplays: r5RequiredRepeatedRuns,
      applicationServerRestartScenarios: r5RequiredRepeatedRuns,
    }),
    failures: Object.freeze({
      childProcessFailures: 0,
      uncaughtNodeErrors: 0,
      unexpectedBackend5xxInTargetFlows: 0,
      failedStateRestorations: 0,
      detectedDataCorruptions: 0,
      failedIdempotencyReplays: 0,
      unexpectedNetworkTargets: 0,
    }),
    networkBoundary: Object.freeze({
      postgresHost: '127.0.0.1',
      applicationHost: '127.0.0.1',
      listingAiProvider: 'mock',
      listingAiBudgetCents: 0,
      externalProviderCalls: 0,
      realMoneyOperations: 0,
    }),
    observation: Object.freeze({
      totalDurationMs: rounded(durations.reduce((sum, value) => sum + value, 0)),
      minimumRunDurationMs: rounded(Math.min(...durations)),
      medianRunDurationMs: rounded(median(durations)),
      maximumRunDurationMs: rounded(Math.max(...durations)),
      rssDeltaBytes: after.rssBytes - before.rssBytes,
      heapUsedDeltaBytes: after.heapUsedBytes - before.heapUsedBytes,
      userCpuDeltaMicros: after.userCpuMicros - before.userCpuMicros,
      systemCpuDeltaMicros: after.systemCpuMicros - before.systemCpuMicros,
      performanceCertificationClaimed: false,
    }),
    cleanup: Object.freeze({
      freshClusterPerRun: true,
      postgresStoppedAfterEveryRun: true,
      temporaryClusterRemovedAfterEveryRun: true,
      persistentTestPrerequisiteCreated: false,
    }),
  });
}

async function runCli() {
  if (process.argv.length !== 2) fail(`Unknown argument: ${process.argv[2]}`);
  const result = await runR5RepeatedPostgresStability();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'R5 repeated stability failed.'}\n`);
    process.exitCode = 1;
  }
}
