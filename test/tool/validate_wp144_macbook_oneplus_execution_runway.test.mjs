import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp144MacbookOnePlusExecutionRunway,
} from '../../tool/validate_wp144_macbook_oneplus_execution_runway.mjs';

const evidence = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/wp144-macbook-oneplus-execution-runway-20260913.json',
  import.meta.url,
), 'utf8'));
const clone = () => structuredClone(evidence);
const validate = (value) => validateWp144MacbookOnePlusExecutionRunway({
  evidence: value,
  checkGitState: false,
});

test('WP144 accepts the exact private MacBook execution runway without a device overclaim', () => {
  assert.deepEqual(validate(clone()), {
    status: 'prepared-exact-current-candidate-on-macbook-oneplus-device-pending',
    macbookHead: '07ce24325648ed797893ac39a6fec6472273135e',
    exactOnePlusConnected: false,
    onePlusCrossDeviceTwoRole: 'OPEN',
  });
});

test('WP144 rejects checkout, candidate or source drift', () => {
  for (const mutate of [
    (value) => { value.macbookRunway.head = '0'.repeat(40); },
    (value) => { value.macbookRunway.legacyCheckoutUsed = true; },
    (value) => { value.candidate.apkSha256 = '0'.repeat(64); },
    (value) => { value.candidate.facebookEnabled = true; },
    (value) => { value.syntheticSource.priorListingStatus = 'active'; },
    (value) => { value.syntheticSource.credentialMaterialRecorded = true; },
  ]) {
    const value = clone();
    mutate(value);
    assert.throws(() => validate(value), /WP144/u);
  }
});

test('WP144 rejects transfer, device or portfolio overclaim', () => {
  for (const mutate of [
    (value) => { value.transfer.temporaryServerStopped = false; },
    (value) => { value.freshDeviceReadback.exactOnePlusConnected = true; },
    (value) => { value.boundaries.physicalJourneyExecuted = true; },
    (value) => { value.nextExecution.stagingLoginStillRequiresRuntimeVerification = false; },
    (value) => { value.portfolio.onePlusCrossDeviceTwoRole = 'PASS'; },
  ]) {
    const value = clone();
    mutate(value);
    assert.throws(() => validate(value), /WP144/u);
  }
});
