#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  r9ResultClassification,
  validateR9Observation,
} from './run_r9_database_recovery.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';
import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/48h-remote/r9-database-recovery-20260824.json';
const implementationHead = 'c249221e64c0ede0d1918a431200069064dd3558';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R9 source ${path}` });
}

function sourceAtImplementationHead(repositoryRoot, path) {
  return readHistoricalRepositoryFile(repositoryRoot, implementationHead, path, {
    label: `R9 implementation source`,
  });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R9 marker missing in ${path}: ${marker}`);
  }
}

export function validateR9DatabaseRecovery({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-r9-recovery-and-targeted-tests-passed-full-regression-pending',
    'verified-local-r9-regression-passed-ci-pending',
    'verified-r9-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r9-database-recovery'
      || !statuses.includes(value.status)
      || value.observedOn !== '2026-08-24'
      || !exact(value.source, {
        branch: 'codex/master-workflow-20260808',
        r8ClosureHead: 'b783b3d18baee40aad9caae673cb0332b956e21e',
        implementationHead,
      })) {
    fail('R9 evidence identity is invalid.');
  }
  if (!exact(value.ciRedFirstFinding, {
    failingHead: 'c53a43981cc44777c276527801475136d109d1c3',
    regressionRunId: 32754735549,
    postgresR9JobPassed: true,
    flutterUnitImportFailed: 'backend-pg-loaded-before-execution',
    permanentCorrection: 'lazy-load-pg-only-inside-exact-recovery-execution',
    dependencyInstalledOutsidePostgresJob: false,
    retryOrTimingWorkaround: false,
  })) fail('R9 CI red-first finding is invalid.');

  validateR9Observation(value.observation, {
    requiredMigrationCount: 71,
    requiredLastMigration: '071_stripe_connect_accounts_v2.up.sql',
  });
  const observation = value.observation;
  if (observation.resultClassification !== r9ResultClassification
      || !exact(observation.migration, {
        emptyDatabaseTablesBeforeBootstrap: 0,
        totalMigrations: 71,
        firstMigration: '001_b3_foundation.up.sql',
        lastMigration: '071_stripe_connect_accounts_v2.up.sql',
        secondRunAppliedMigrations: 0,
        checksumMismatches: 0,
        schemaFingerprintSha256:
          '898c438f03f65f98f5e7a627edb3bb4b54f1aed8f3bcfb3c6c0eada577bc632c',
        tableCount: 136,
        columnCount: 1925,
        constraintCount: 1564,
        indexCount: 519,
        functionCount: 304,
        triggerCount: 174,
      })
      || observation.backupRestore.archiveSha256
      !== '1859dabe000c02a75a7df86ab17525900d552930e8396e4bf4788da8eedcf3d7') {
    fail('R9 retained observation is not the exact implementation-head run.');
  }

  const localPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    exactRecoveryRunner: 'passed-and-cleaned',
    runnerUnitTests: 'passed-3',
    ciWiringTests: 'passed-3',
    artifactValidatorTests: 'passed-5',
    artifactValidator: 'passed',
    fullTechnicalRegression: localPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R9 verification state is invalid.');
  if (!githubPassed && value.githubVerification !== undefined) {
    fail('R9 pending evidence must not claim GitHub verification.');
  }
  if (githubPassed && !exact(value.githubVerification, {
    implementationHead,
    verifiedHead: '8bd608ebbdd798118867d80412a5948e3eee26cf',
    regression: {
      runId: 32755197710,
      conclusion: 'success',
      postgresJobId: 97521209463,
      postgresConclusion: 'success',
      r9RecoveryExecuted: true,
      backendJobId: 97521209332,
      backendConclusion: 'success',
      flutterJobId: 97521208951,
      flutterConclusion: 'success',
      parallelStabilityExecuted: false,
      signedCandidateBuilt: false,
      apiImageBuilt: true,
      apiImagePublished: false,
      publishApiImageJobId: 97523186151,
      publishApiImageConclusion: 'skipped',
    },
    codeql: {
      workflowRunId: 32755197705,
      workflowConclusion: 'success',
      advancedSecurityCheckId: 97521988626,
      advancedSecurityConclusion: 'success',
      newAlerts: 0,
    },
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      documentedBaseCommit: 'e64defd0df62fb047c6fbc90733e4caf318ac7c4',
      documentedBaseCheckId: 97395091283,
      currentCheckId: 97521000640,
      currentConclusion: 'failure',
      reportedPullRequestCommitScope: 250,
      credentialDetailsInspected: false,
      classifiedAsR9Regression: false,
    },
  })) fail('R9 exact GitHub verification is invalid.');
  if (!exact(value.limitations, {
    isolatedLocalPostgresOnly: true,
    productionBackupEvaluated: false,
    vpsBackupEvaluated: false,
    productionRecoveryTimeClaimed: false,
    productionRecoveryPointClaimed: false,
    disasterRecoveryCertificationClaimed: false,
  })) fail('R9 limitation record is invalid.');
  if (Object.values(value.boundaries ?? {}).some((entry) => entry !== false)) {
    fail('R9 live, credential or retention boundary is invalid.');
  }
  if (value.nextPackage !== 'R10') fail('R9 next package is invalid.');

  const runnerPath = 'tool/run_r9_database_recovery.mjs';
  requireMarkers(sourceAtImplementationHead(repositoryRoot, runnerPath), runnerPath, [
    "r9SyntheticAccountCount = 12",
    "r9SyntheticListingCount = 6",
    "'pg_dump'",
    "'pg_restore'",
    'applyMigrationPrefix(legacyPool, plan, 27)',
    'assertRollbackGuardRefusals(restoredPool, root)',
    'backupArchiveRemoved: true',
  ]);
  const workflowPath = '.github/workflows/regression.yml';
  requireMarkers(sourceAtImplementationHead(repositoryRoot, workflowPath), workflowPath, [
    'Run repository-owned PostgreSQL 16 R9 recovery proof',
    'node ../tool/run_r9_database_recovery.mjs',
  ]);
  const regressionPath = 'scripts/technical_regression_check.sh';
  requireMarkers(sourceAtImplementationHead(repositoryRoot, regressionPath), regressionPath, [
    'node --check tool/run_r9_database_recovery.mjs',
    'node --test test/tool/run_r9_database_recovery.test.mjs',
    'node --check tool/validate_r9_database_recovery.mjs',
    'node --test test/tool/validate_r9_database_recovery.test.mjs',
    'node tool/validate_r9_database_recovery.mjs',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R9 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    migrations: observation.migration.totalMigrations,
    tables: observation.migration.tableCount,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateR9DatabaseRecovery();
  process.stdout.write(
    `R9 database recovery valid: migrations=${result.migrations}, `
      + `tables=${result.tables}, status=${result.status}, `
      + `next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
