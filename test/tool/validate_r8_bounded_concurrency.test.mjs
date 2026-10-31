import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR8BoundedConcurrency,
} from '../../tool/validate_r8_bounded_concurrency.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r8-bounded-concurrency-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR8BoundedConcurrency({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact GitHub-verified R8 bounded observation', () => {
  assert.deepEqual(validate(), {
    status: 'verified-r8-regression-and-codeql-passed',
    accountCount: 120,
    maximumConcurrentWorkers: 24,
    nextPackage: 'R9',
  });
});

test('rejects a missing scenario or any retained race finding', () => {
  const scenario = structuredClone(evidence);
  scenario.scenarios.pop();
  assert.throws(() => validate(scenario), /scenario matrix/u);

  const finding = structuredClone(evidence);
  finding.findingsAfterCorrection.lost_update = 1;
  assert.throws(() => validate(finding), /finding result/u);
});

test('rejects erased red-first evidence or weakened conflict assertions', () => {
  const redFirst = structuredClone(evidence);
  redFirst.redFirstFinding.standardOwnerListingEditPreviouslyCheckedClientRevision = true;
  assert.throws(() => validate(redFirst), /red-first finding/u);

  const assertion = structuredClone(evidence);
  assertion.assertions.listingEditConflictContract = 'last-write-wins';
  assert.throws(() => validate(assertion), /concurrency assertions/u);
});

test('rejects a capacity overclaim or an incomplete cleanup', () => {
  const capacity = structuredClone(evidence);
  capacity.syntheticLoad.productionCapacityClaimed = true;
  assert.throws(() => validate(capacity), /load boundary/u);

  const cleanup = structuredClone(evidence);
  cleanup.execution.temporaryClusterRemoved = false;
  assert.throws(() => validate(cleanup), /retained execution/u);
});

test('rejects a retained workaround, premature GitHub claim or live action', () => {
  const workaround = structuredClone(evidence);
  workaround.workaroundAudit.sourceRotationUsedInRetainedRun = true;
  assert.throws(() => validate(workaround), /workaround audit/u);

  const github = structuredClone(evidence);
  github.status = 'verified-local-r8-regression-passed-ci-pending';
  github.verification.githubRegression = 'pending';
  github.verification.githubCodeql = 'pending';
  github.githubVerification = {};
  assert.throws(() => validate(github), /must not claim GitHub/u);

  const changedCheck = structuredClone(evidence);
  changedCheck.githubVerification.codeql.newAlerts = 1;
  assert.throws(() => validate(changedCheck), /exact GitHub verification/u);

  const live = structuredClone(evidence);
  live.boundaries.realMoneyUsed = true;
  assert.throws(() => validate(live), /live, provider, money or data/u);
});

test('rejects a request-stack overclaim or secret-shaped evidence', () => {
  const limitation = structuredClone(evidence);
  limitation.limitations.supportAndPrivacyRequestStackFullyLoadTested = true;
  assert.throws(() => validate(limitation), /limitation record/u);

  const secret = structuredClone(evidence);
  secret.note = '/Users/example/private';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});
