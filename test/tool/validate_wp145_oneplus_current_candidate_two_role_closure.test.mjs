import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp145OnePlusClosure,
} from '../../tool/validate_wp145_oneplus_current_candidate_two_role_closure.mjs';

const source = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/wp145-oneplus-current-candidate-two-role-closure-20260914.json',
  import.meta.url,
), 'utf8'));

function validate(value) {
  return validateWp145OnePlusClosure({ evidence: value, checkGitState: false });
}

test('WP145 accepts the exact sanitized physical OnePlus closure', () => {
  const result = validate(structuredClone(source));
  assert.equal(result.onePlusCrossDeviceTwoRole, 'PASS');
  assert.deepEqual(result.portfolio, { pass: 22, partial: 4, open: 6 });
});

test('WP145 rejects candidate, device, principal or FCM drift', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091313'; },
    (value) => { value.physicalExecution.device.model = 'Pixel 7 Pro'; },
    (value) => { value.physicalExecution.ownerPushPreflight = 'guest'; },
    (value) => { value.physicalExecution.deviceServices.pushEnabled = false; },
    (value) => { value.physicalExecution.tests.controlledFcm = 'partial'; },
    (value) => { value.physicalExecution.tests.principalSwitchIsolation = 'failed'; },
  ]) {
    const value = structuredClone(source);
    mutate(value);
    assert.throws(() => validate(value), /WP145/u);
  }
});

test('WP145 rejects cleanup, privacy, portfolio or workaround overclaims', () => {
  for (const mutate of [
    (value) => { value.physicalExecution.tests.protectedOwnerSessionRestored = false; },
    (value) => { value.postRunPrivateState.exactSource.activeSourceVaultCount = 1; },
    (value) => { value.postRunPrivateState.journeyRoot.unsafeEntryCount = 1; },
    (value) => { value.rootCauseAndCorrection.workaroundRetained = true; },
    (value) => { value.boundaries.paymentEndpointCalled = true; },
    (value) => { value.boundaries.containsAccountIdentity = true; },
    (value) => { value.portfolio.after.open = 5; },
  ]) {
    const value = structuredClone(source);
    mutate(value);
    assert.throws(() => validate(value), /WP145/u);
  }
});
