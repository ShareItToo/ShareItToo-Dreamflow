import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp132CurrentCandidateReportBlock,
} from '../../tool/validate_wp132_current_candidate_report_block.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp132-current-candidate-report-block-20260913.json',
);
const rolloverPath = resolve(root, 'store/google-play/current-rollover-candidate.json');
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const readRollover = () => JSON.parse(readFileSync(rolloverPath, 'utf8'));
const validate = (evidence = readEvidence(), rollover = readRollover()) => (
  validateWp132CurrentCandidateReportBlock({
    repositoryRoot: root,
    evidence,
    rollover,
    checkGitState: false,
  })
);

test('accepts exact-current Pixel report/block closure', () => {
  assert.deepEqual(validateWp132CurrentCandidateReportBlock({ repositoryRoot: root }), {
    status: 'complete-exact-current-report-block',
    versionCode: '2026091309',
    promotedRequirement: 'support-report-block',
    passCount: 16,
    partialCount: 8,
    openCount: 8,
  });
});

test('rejects candidate, source and current-pointer drift', () => {
  const candidate = readEvidence();
  candidate.candidate.apkSha256 = '0'.repeat(64);
  assert.throws(() => validate(candidate), /candidate binding/u);

  const source = readEvidence();
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source digest drift/u);

  const pointer = readRollover();
  pointer.deviceVerification.preferredDeviceExactApkInstalled = false;
  assert.throws(() => validate(readEvidence(), pointer), /current candidate pointer/u);
});

test('rejects incomplete lifecycle, cleanup and portfolio claims', () => {
  for (const mutate of [
    (value) => { value.physicalLifecycle.blockedUsersEntryVisible = false; },
    (value) => { value.cleanup.recoveryRequired = true; },
    (value) => { value.cleanup.retainedModerationReportCount = 0; },
    (value) => { value.portfolioEffect.passCount = 17; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects OnePlus contact and private content', () => {
  const boundary = readEvidence();
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /authorization boundary/u);

  const identity = readEvidence();
  identity.email = 'owner@example.test';
  assert.throws(() => validate(identity), /private field/u);

  const fixture = readEvidence();
  fixture.fixture = 'n22-private-run';
  assert.throws(() => validate(fixture), /fixture-shaped/u);
});
