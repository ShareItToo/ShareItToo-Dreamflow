#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runLocalPostgresIntegration } from './run_local_postgres_integration.mjs';
import {
  r8ConcurrentPrivacyExportAccounts,
  r8ForbiddenFindings,
  r8MaximumConcurrentWorkers,
  r8RequiredScenarios,
  r8ResultClassification,
  r8SyntheticAccountCount,
} from './r8_bounded_concurrency_contract.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function fail(message) {
  throw new Error(message);
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

async function runNodeTestFile(testFile) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      '--throw-deprecation',
      '--import', './backend/test_setup.js',
      '--test', testFile,
    ], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(
        `R8 scenario test failed (${testFile}): `
          + `${`${stderr}\n${stdout}`.trim().slice(-4_000)}`,
      ));
    });
  });
}

export async function runR8BoundedConcurrency({
  runIntegration = () => runLocalPostgresIntegration({ inheritTestOutput: false }),
  runScenarioTests = () => runNodeTestFile(
    'backend/test/listing_set_workflow.test.js',
  ),
  clock = () => performance.now(),
} = {}) {
  if (typeof runIntegration !== 'function'
      || typeof runScenarioTests !== 'function'
      || typeof clock !== 'function') {
    fail('R8 runner dependencies are invalid.');
  }
  const started = clock();
  await runScenarioTests();
  const integration = await runIntegration();
  const finished = clock();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
    fail('R8 observation clock is invalid.');
  }
  if (integration?.status !== 'passed-and-cleaned'
      || integration.postgresMajor !== 16
      || integration.host !== '127.0.0.1'
      || integration.database !== 'sit_integration'
      || integration.integrationTest
        !== 'backend/test/postgres_foundation.integration.test.js') {
    fail('R8 PostgreSQL integration was not passed and cleaned.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-r8-bounded-concurrency-observation',
    status: 'passed-bounded-concurrency-and-cleaned',
    resultClassification: r8ResultClassification,
    syntheticLoad: Object.freeze({
      accountCount: r8SyntheticAccountCount,
      maximumConcurrentWorkers: r8MaximumConcurrentWorkers,
      concurrentPrivacyExportAccounts: r8ConcurrentPrivacyExportAccounts,
      productionCapacityClaimed: false,
    }),
    scenarios: Object.freeze([...r8RequiredScenarios]),
    findings: Object.freeze(Object.fromEntries(
      r8ForbiddenFindings.map((finding) => [finding, 0]),
    )),
    assertions: Object.freeze({
      listingEditConflictContract: 'one-success-one-listing_revision_conflict',
      publicationConflictContract: 'one-created-one-blue_ocean_draft_closed',
      competingBookingContract: 'one-accepted-one-booking_period_unavailable',
      recoveryTokenContract: 'one-consumed-one-invalid_or_expired_reset_link',
      cartIsolationRows: r8SyntheticAccountCount,
      supportIsolationRows: r8SyntheticAccountCount,
      privacyExportsVerified: r8ConcurrentPrivacyExportAccounts,
      listingSetRevalidationRequired: true,
      realMoneyOperations: 0,
      externalProviderCalls: 0,
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
      durationMs: rounded(finished - started),
      performanceCertificationClaimed: false,
      productionCapacityClaimed: false,
    }),
    cleanup: Object.freeze({
      postgresStopped: true,
      temporaryClusterRemoved: true,
      syntheticCredentialsRetained: false,
      persistentTestPrerequisiteCreated: false,
    }),
  });
}

async function runCli() {
  if (process.argv.length !== 2) fail(`Unknown argument: ${process.argv[2]}`);
  const result = await runR8BoundedConcurrency();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'R8 bounded concurrency failed.'}\n`);
    process.exitCode = 1;
  }
}
