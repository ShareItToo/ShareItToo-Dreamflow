import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateR16Pr7PilotFreezeIntegrationReview } from '../../tool/validate_r16_pr7_pilot_freeze_integration_review.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r16-pr7-pilot-freeze-integration-review-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR16Pr7PilotFreezeIntegrationReview({
    repositoryRoot: root,
    evidence: changed,
  });
}

test('accepts the exact pending R16 audit', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    decision: 'HOLD_PR7_DRAFT_UNMERGED',
    migrationCount: 72,
    findingCount: 3,
    next48hPackage: 'R17',
  });
});

test('preserves the frozen R16 prefix while allowing later paired migrations', () => {
  assert.equal(validate().migrationCount, 72);
});

test('rejects a merged, non-Draft or rewritten PR claim', () => {
  const merged = structuredClone(evidence);
  merged.pullRequestSnapshot.draft = false;
  assert.throws(() => validate(merged), /PR snapshot/u);

  const rewrite = structuredClone(evidence);
  rewrite.boundaries.historyRewritten = true;
  assert.throws(() => validate(rewrite), /boundary/u);
});

test('rejects migration count or rollback drift', () => {
  const count = structuredClone(evidence);
  count.migrationInventory.orderedUpScripts = 68;
  assert.throws(() => validate(count), /migration inventory/u);

  const rollback = structuredClone(evidence);
  rollback.migrationInventory.defaultRollback = 'down-scripts';
  assert.throws(() => validate(rollback), /migration inventory/u);
});

test('rejects incomplete review groups or domain coverage', () => {
  const groups = structuredClone(evidence);
  groups.reviewGroups.pop();
  assert.throws(() => validate(groups), /reviewer groups/u);

  const domains = structuredClone(evidence);
  domains.domainAudit.privacy = 'green';
  assert.throws(() => validate(domains), /domain audit/u);
});

test('rejects hidden feature enablement or a binding-truth overclaim', () => {
  const g3 = structuredClone(evidence);
  g3.featureTruth.g3BookingGroups = 'on';
  assert.throws(() => validate(g3), /feature truth/u);

  const binding = structuredClone(evidence);
  binding.featureTruth.v52SingleItemCore = 'on-non-binding';
  assert.throws(() => validate(binding), /feature truth/u);
});

test('rejects missing or downgraded R17 findings', () => {
  const missing = structuredClone(evidence);
  missing.findings.pop();
  assert.throws(() => validate(missing), /finding set/u);

  const priority = structuredClone(evidence);
  priority.findings[0].priority = 'P2';
  assert.throws(() => validate(priority), /finding drift/u);
});

test('rejects premature or malformed GitHub freeze binding', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-audit-findings-bound-ready-for-freeze-commit';
  premature.pilotFreeze.commit = 'pending-r16-implementation-commit';
  premature.focusedVerification.githubRegression = 'pending';
  premature.focusedVerification.githubCodeql = 'pending';
  premature.githubVerification = {
    implementationCommit: '0'.repeat(40),
    regressionRunId: 1,
    regressionConclusion: 'success',
    codeqlRunId: 2,
    codeqlConclusion: 'success',
    advancedSecurityCheckId: 3,
    advancedSecurityConclusion: 'success',
    newAlerts: 0,
  };
  assert.throws(() => validate(premature), /cannot bind GitHub/u);

  const malformed = structuredClone(evidence);
  malformed.pilotFreeze.commit = 'bad';
  malformed.focusedVerification.fullTechnicalRegression = 'passed-candidate-rollover-ci-metadata-mode';
  malformed.focusedVerification.githubRegression = 'passed';
  malformed.focusedVerification.githubCodeql = 'passed-no-new-alerts';
  malformed.githubVerification = premature.githubVerification;
  malformed.githubVerification.implementationCommit = 'bad';
  assert.throws(() => validate(malformed), /pilot-freeze|GitHub verification/u);
});

test('rejects private or secret-shaped machine evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = 'reviewer@example.test';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
