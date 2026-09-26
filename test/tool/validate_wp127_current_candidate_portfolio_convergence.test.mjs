import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp127CurrentCandidatePortfolioConvergence,
} from '../../tool/validate_wp127_current_candidate_portfolio_convergence.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp127-current-candidate-portfolio-convergence-20260912.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const readRollover = () => JSON.parse(execFileSync('git', [
  'show',
  '66df6b1f3501f3920192c6e73609d441070f65b0:store/google-play/current-rollover-candidate.json',
], { cwd: root, encoding: 'utf8' }));

function validate(evidence = readEvidence(), rollover = readRollover()) {
  return validateWp127CurrentCandidatePortfolioConvergence({
    repositoryRoot: root,
    evidence,
    rollover,
    checkGitState: false,
  });
}

test('accepts the conservative exact-current portfolio convergence', () => {
  assert.deepEqual(
    validateWp127CurrentCandidatePortfolioConvergence({ repositoryRoot: root }),
    {
      status: 'partial-current-candidate-acceptance-external-gates-open',
      versionCode: '2026091201',
      passCount: 12,
      partialCount: 12,
      openCount: 8,
      onePlus: 'disconnected-owner-took-device',
    },
  );
});

test('rejects an unsupported promotion or transfer basis', () => {
  const promoted = readEvidence();
  const google = promoted.requirements.find((entry) => entry.id === 'google-signin');
  google.state = 'PASS';
  google.remaining = null;
  assert.throws(() => validate(promoted), /classification google-signin/u);

  const unreviewed = readEvidence();
  unreviewed.requirements.find((entry) => (
    entry.id === 'logout-password-session-account-switch-isolation'
  )).basis = 'transferred-without-review';
  assert.throws(() => validate(unreviewed), /classification logout-password/u);
});

test('rejects candidate, delta, CI, aggregate and device drift', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091202'; },
    (value) => { value.runtimeDelta.changedPaths.pop(); },
    (value) => { value.verification.wp126PortfolioBaseRegression.conclusion = 'pending'; },
    (value) => { value.aggregate.passCount = 13; },
    (value) => { value.candidate.onePlusCurrentAvailability = 'connected'; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects source, rollover, boundary and private-content drift', () => {
  const source = readEvidence();
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source digest/u);

  const rollover = readRollover();
  rollover.artifact.apkSha256 = '0'.repeat(64);
  assert.throws(() => validate(readEvidence(), rollover), /candidate pointer/u);

  const boundary = readEvidence();
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /boundary onePlusContacted/u);

  const privateEvidence = readEvidence();
  privateEvidence.privatePath = '/Users/owner/private.json';
  assert.throws(() => validate(privateEvidence), /private or secret-shaped/u);
});
