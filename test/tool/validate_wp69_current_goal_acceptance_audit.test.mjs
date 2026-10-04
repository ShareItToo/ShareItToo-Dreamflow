import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp69CurrentGoalAcceptanceAudit,
} from '../../tool/validate_wp69_current_goal_acceptance_audit.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp69-current-goal-acceptance-audit-20260909.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp69CurrentGoalAcceptanceAudit({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts the conservative current-goal acceptance audit', () => {
  assert.deepEqual(validate(), {
    status: 'complete-local-github',
    candidateVersionCode: '2026090904',
    passCount: 11,
    partialCount: 12,
    openCount: 9,
    nextPackage: 'WP70',
    releaseDecision: 'hold-not-production-ready',
  });
});

test('rejects package verification drift', () => {
  const changed = structuredClone(evidence);
  changed.packageVerification.githubRegressionRun = 0;
  assert.throws(() => validate(changed), /package verification/u);
});

test('rejects candidate and runtime lineage promotion', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.versionCode = '2026090905';
  assert.throws(() => validate(candidate), /exact candidate/u);

  const lineage = structuredClone(evidence);
  lineage.lineage.mobileOrBackendRuntimePathsChangedAfterCurrentCandidate = ['lib/example.dart'];
  assert.throws(() => validate(lineage), /lineage contract/u);
});

test('rejects source hash and predecessor fact drift', () => {
  const changed = structuredClone(evidence);
  changed.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(changed), /source hash drift/u);
});

test('rejects PASS promotion, missing requirements and aggregate dilution', () => {
  const promotion = structuredClone(evidence);
  promotion.requirements.find((entry) => entry.id === 'facebook-signin').state = 'PASS';
  assert.throws(() => validate(promotion), /state or order/u);

  const missing = structuredClone(evidence);
  missing.requirements.pop();
  assert.throws(() => validate(missing), /state or order/u);

  const aggregate = structuredClone(evidence);
  aggregate.aggregate.openCount = 8;
  assert.throws(() => validate(aggregate), /aggregate/u);
});

test('requires explicit remaining conditions for every unresolved item', () => {
  const changed = structuredClone(evidence);
  changed.requirements.find((entry) => entry.state === 'PARTIAL').remaining = null;
  assert.throws(() => validate(changed), /remaining condition/u);
});

test('rejects release, provider or sensitive-data overclaims', () => {
  const release = structuredClone(evidence);
  release.aggregate.releaseDecision = 'go';
  assert.throws(() => validate(release), /aggregate/u);

  const provider = structuredClone(evidence);
  provider.boundaries.providerConfigurationChanged = true;
  assert.throws(() => validate(provider), /boundary/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});

test('keeps the next package Pixel-only and external-mutation-free', () => {
  const changed = structuredClone(evidence);
  changed.nextSafePackage.externalMutationAllowed = true;
  assert.throws(() => validate(changed), /next safe package/u);
});
