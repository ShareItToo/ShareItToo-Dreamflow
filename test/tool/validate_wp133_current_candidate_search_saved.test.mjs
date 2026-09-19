import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp133CurrentCandidateSearchSaved,
} from '../../tool/validate_wp133_current_candidate_search_saved.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp133-current-candidate-search-saved-20260913.json',
);
const rolloverPath = resolve(root, 'store/google-play/current-rollover-candidate.json');
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const readRollover = () => JSON.parse(readFileSync(rolloverPath, 'utf8'));
const validate = (evidence = readEvidence(), rollover = readRollover()) => (
  validateWp133CurrentCandidateSearchSaved({
    repositoryRoot: root,
    evidence,
    rollover,
    checkGitState: false,
  })
);

test('accepts exact-current Pixel search and saved-state closure', () => {
  assert.deepEqual(validateWp133CurrentCandidateSearchSaved({ repositoryRoot: root }), {
    status: 'complete-exact-current-search-saved',
    versionCode: '2026091309',
    promotedRequirement: 'search-filter-favorites-wishlists',
    passCount: 17,
    partialCount: 7,
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
  pointer.deviceVerification.authenticatedPilotMatrix = 'stale';
  assert.throws(() => validate(readEvidence(), pointer), /current candidate pointer/u);
});

test('rejects incomplete lifecycle, false empty truth, cleanup and portfolio claims', () => {
  for (const mutate of [
    (value) => { value.physicalLifecycle.processRestartPersistenceStableObservations = 2; },
    (value) => { value.physicalLifecycle.loadingOrErrorAcceptedAsEmptyTruth = true; },
    (value) => { value.cleanup.recoveryRequired = true; },
    (value) => { value.portfolioEffect.passCount = 18; },
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
