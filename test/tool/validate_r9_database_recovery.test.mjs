import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR9DatabaseRecovery,
} from '../../tool/validate_r9_database_recovery.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r9-database-recovery-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR9DatabaseRecovery({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact implementation-head R9 recovery evidence', () => {
  assert.deepEqual(validate(), {
    status: 'verified-r9-regression-and-codeql-passed',
    migrations: 71,
    tables: 136,
    nextPackage: 'R10',
  });
});

test('rejects a changed source identity or retained run', () => {
  const source = structuredClone(evidence);
  source.source.implementationHead = '0'.repeat(40);
  assert.throws(() => validate(source), /identity/u);

  const observation = structuredClone(evidence);
  observation.observation.migration.schemaFingerprintSha256 = '0'.repeat(64);
  assert.throws(() => validate(observation), /exact implementation-head run/u);
});

test('rejects a weakened restore or rollback proof', () => {
  const restore = structuredClone(evidence);
  restore.observation.backupRestore.dataDigestMatch = false;
  assert.throws(() => validate(restore), /backup and restore/u);

  const rollback = structuredClone(evidence);
  rollback.observation.rollback.restoredDataDigestUnchanged = false;
  assert.throws(() => validate(rollback), /rollback proof/u);
});

test('rejects a premature GitHub claim or live action', () => {
  const github = structuredClone(evidence);
  github.status = 'verified-local-r9-regression-passed-ci-pending';
  github.verification.githubRegression = 'pending';
  github.verification.githubCodeql = 'pending';
  github.githubVerification = {};
  assert.throws(() => validate(github), /must not claim GitHub/u);

  const changedCheck = structuredClone(evidence);
  changedCheck.githubVerification.codeql.newAlerts = 1;
  assert.throws(() => validate(changedCheck), /exact GitHub verification/u);

  const live = structuredClone(evidence);
  live.boundaries.productionChanged = true;
  assert.throws(() => validate(live), /live, credential or retention/u);
});

test('rejects retained credentials or private evidence', () => {
  const credential = structuredClone(evidence);
  credential.observation.syntheticDataset.syntheticCredentialsRetained = true;
  assert.throws(() => validate(credential), /synthetic dataset/u);

  const privateEvidence = structuredClone(evidence);
  privateEvidence.note = '/Users/example/private';
  assert.throws(() => validate(privateEvidence), /private or secret-shaped/u);
});
