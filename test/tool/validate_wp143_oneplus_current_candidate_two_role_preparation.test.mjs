import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp143OnePlusPreparation,
} from '../../tool/validate_wp143_oneplus_current_candidate_two_role_preparation.mjs';

const evidence = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/wp143-oneplus-current-candidate-two-role-preparation-20260913.json',
  import.meta.url,
), 'utf8'));
const clone = () => structuredClone(evidence);
const validate = (value) => validateWp143OnePlusPreparation({
  evidence: value,
  checkGitState: false,
});

test('WP143 accepts exact current-candidate preparation without physical overclaim', () => {
  assert.deepEqual(validate(clone()), {
    status: 'prepared-exact-current-candidate-oneplus-two-role-runner-device-pending',
    versionCode: '2026091312',
    exactOnePlusConnected: false,
    onePlusCrossDeviceTwoRole: 'OPEN',
  });
});

test('WP143 binds source inventory to the recorded snapshot and rejects tampering', () => {
  const value = clone();
  value.sourceInventory['tool/run_wp143_oneplus_current_candidate_two_role.mjs'] = '0'.repeat(64);
  assert.throws(() => validate(value), /source inventory/u);
});

test('WP143 rejects candidate or predecessor drift', () => {
  for (const mutate of [
    (value) => { value.candidate.versionCode = '2026091313'; },
    (value) => { value.candidate.apkSha256 = '0'.repeat(64); },
    (value) => { value.candidate.facebookEnabled = true; },
    (value) => { value.predecessorGap.historicalVersionCode = '2026091312'; },
    (value) => { value.predecessorGap.historicalRunnerModified = true; },
  ]) {
    const value = clone();
    mutate(value);
    assert.throws(() => validate(value), /WP143/u);
  }
});

test('WP143 rejects device, installation or portfolio overclaim', () => {
  for (const mutate of [
    (value) => { value.freshDeviceReadback.exactOnePlusConnected = true; },
    (value) => { value.runner.localAppDataReset = true; },
    (value) => { value.boundaries.physicalJourneyExecuted = true; },
    (value) => { value.portfolio.onePlusCrossDeviceTwoRole = 'PASS'; },
    (value) => { value.privateQaVault.sourceSelected = true; },
    (value) => { value.verification.fullTechnicalRegression = 'pending'; },
  ]) {
    const value = clone();
    mutate(value);
    assert.throws(() => validate(value), /WP143/u);
  }
});
