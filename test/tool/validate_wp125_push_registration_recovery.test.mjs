import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp125PushRegistrationRecovery,
} from '../../tool/validate_wp125_push_registration_recovery.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp125-push-registration-recovery-20260912.json',
);

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('accepts source closure while keeping physical delivery unproven', () => {
  const result = validateWp125PushRegistrationRecovery({ repositoryRoot: root });
  assert.equal(result.sourceHead, 'a695306350bd868eda64fb9af8b388ed61923578');
  assert.equal(result.physicalSuccessProven, false);
  assert.equal(result.githubRegression, 'success');
});

test('rejects device success, candidate, source, CI or boundary overclaims', () => {
  const observation = evidence();
  observation.onePlusObservation.physicalSuccessProven = true;
  assert.throws(
    () => validateWp125PushRegistrationRecovery({ evidence: observation, checkGitState: false }),
    /OnePlus observation/u,
  );
  const candidate = evidence();
  candidate.installedCandidate.containsWp125 = true;
  assert.throws(
    () => validateWp125PushRegistrationRecovery({ evidence: candidate, checkGitState: false }),
    /installed-candidate boundary/u,
  );
  const source = evidence();
  source.implementation.resumeRegistrationRecovery = false;
  assert.throws(
    () => validateWp125PushRegistrationRecovery({ evidence: source, checkGitState: false }),
    /implementation contract/u,
  );
  const ci = evidence();
  ci.verification.githubRegression.status = 'pending';
  assert.throws(
    () => validateWp125PushRegistrationRecovery({ evidence: ci, checkGitState: false }),
    /verification contract/u,
  );
  const boundary = evidence();
  boundary.boundaries.googlePlayChanged = true;
  assert.throws(
    () => validateWp125PushRegistrationRecovery({ evidence: boundary, checkGitState: false }),
    /boundary contract/u,
  );
});
