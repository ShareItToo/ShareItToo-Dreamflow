import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp131CurrentCandidateAndroidPermissionLifecycle,
} from '../../tool/validate_wp131_current_candidate_android_permission_lifecycle.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp131-current-candidate-android-permission-lifecycle-20260912.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));
const validate = (evidence = readEvidence()) => validateWp131CurrentCandidateAndroidPermissionLifecycle({
  repositoryRoot: root,
  evidence,
  checkGitState: false,
});

test('accepts exact-current Android permission lifecycle closure', () => {
  assert.deepEqual(validateWp131CurrentCandidateAndroidPermissionLifecycle({ repositoryRoot: root }), {
    status: 'complete-exact-current-android-permission-lifecycle',
    versionCode: '2026091201',
    promotedRequirement: 'android-permission-lifecycle',
    passCount: 16,
    partialCount: 8,
    openCount: 8,
  });
});

test('rejects candidate, source and portfolio drift', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091202'; },
    (value) => { value.sourceInventory[1].sha256 = '0'.repeat(64); },
    (value) => { value.portfolioEffect.passCount = 17; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects timing, retry, restoration and completion-signal overclaims', () => {
  for (const mutate of [
    (value) => { value.lifecycle.retryCount = 1; },
    (value) => { value.lifecycle.elapsedTimeAcceptedAsSuccess = true; },
    (value) => { value.lifecycle.broadcastBarrierSignalConfirmed = false; },
    (value) => { value.lifecycle.exactAppOpStateRestored = false; },
    (value) => { value.privateJournal.recoveryRequired = true; },
  ]) {
    const invalid = readEvidence();
    mutate(invalid);
    assert.throws(() => validate(invalid));
  }
});

test('rejects OnePlus contact and private-content overclaim', () => {
  const boundary = readEvidence();
  boundary.boundaries.onePlusContacted = true;
  assert.throws(() => validate(boundary), /authorization boundary/u);

  const identity = readEvidence();
  identity.email = 'owner@example.test';
  assert.throws(() => validate(identity), /private field/u);

  const privatePath = readEvidence();
  privatePath.privatePath = '/Users/owner/private.json';
  assert.throws(() => validate(privatePath), /private or secret-shaped/u);
});
