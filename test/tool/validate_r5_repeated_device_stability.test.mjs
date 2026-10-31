import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR5RepeatedDeviceStability,
} from '../../tool/validate_r5_repeated_device_stability.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r5-repeated-device-stability-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR5RepeatedDeviceStability({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact bounded R5 backend, Flutter and physical observations', () => {
  assert.deepEqual(validate(), {
    status: 'verified-r5-regression-and-codeql-passed',
    backendRuns: 25,
    deviceCycles: 25,
    draftCycles: 25,
    nextPackage: 'R6',
  });
});

test('rejects missing repetitions or a target-flow failure', () => {
  const runs = structuredClone(evidence);
  runs.backendObservation.repeatedRuns = 24;
  assert.throws(() => validate(runs), /backend observation/u);

  const failure = structuredClone(evidence);
  failure.backendObservation.failures.failedIdempotencyReplays = 1;
  assert.throws(() => validate(failure), /backend observation/u);
});

test('rejects device crashes, state loss or raw identifiers', () => {
  const crash = structuredClone(evidence);
  crash.physicalDeviceObservation.failures.crashesOrAnr = 1;
  assert.throws(() => validate(crash), /physical device observation/u);

  const state = structuredClone(evidence);
  state.physicalDeviceObservation.state.appDataIdentityPreserved = false;
  assert.throws(() => validate(state), /physical device observation/u);

  const identifier = structuredClone(evidence);
  identifier.physicalDeviceObservation.state.containsRawDeviceIdentifier = true;
  assert.throws(() => validate(identifier), /physical device observation/u);
});

test('rejects weakened install preservation or permanent timing workarounds', () => {
  const reset = structuredClone(evidence);
  reset.candidateUpdate.dataResetUsed = true;
  assert.throws(() => validate(reset), /candidate update boundary/u);

  const sleep = structuredClone(evidence);
  sleep.permanentCorrections.timingSleepMadePrerequisite = true;
  assert.throws(() => validate(sleep), /permanent-correction record/u);
});

test('rejects performance, packet-capture or full-device-flow overclaims', () => {
  const performance = structuredClone(evidence);
  performance.limitations.performanceCertificationClaimed = true;
  assert.throws(() => validate(performance), /limitation record/u);

  const network = structuredClone(evidence);
  network.limitations.networkObservation = 'PACKET_CAPTURE_CERTIFIED';
  assert.throws(() => validate(network), /limitation record/u);

  const ui = structuredClone(evidence);
  ui.limitations.fullBlueOceanUiFlowRepeatedOnDevice = true;
  assert.throws(() => validate(ui), /limitation record/u);
});

test('rejects premature GitHub claims and live changes', () => {
  const github = structuredClone(evidence);
  github.status = 'verified-r5-full-regression-passed-ci-pending';
  github.verification.githubRegression = 'pending';
  github.verification.githubCodeql = 'pending';
  assert.throws(() => validate(github), /must not claim GitHub/u);

  const incomplete = structuredClone(evidence);
  incomplete.githubVerification = {};
  assert.throws(() => validate(incomplete), /GitHub verification is invalid/u);

  const live = structuredClone(evidence);
  live.boundaries.storeChanged = true;
  assert.throws(() => validate(live), /live or privacy boundary/u);
});

test('rejects secret-shaped or private evidence', () => {
  const privatePath = structuredClone(evidence);
  privatePath.note = '/Users/example/private';
  assert.throws(() => validate(privatePath), /private or secret-shaped/u);
});
