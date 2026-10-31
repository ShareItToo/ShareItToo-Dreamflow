import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validatePf20CurrentCandidateDeviceServicesOptIn,
} from '../../tool/validate_pf20_current_candidate_device_services_opt_in.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/external-gates/current-candidate-firebase-device-services-opt-in-2026082302.json',
), 'utf8'));

function validate(changed = evidence) {
  return validatePf20CurrentCandidateDeviceServicesOptIn({
    repositoryRoot: root,
    evidence: changed,
    checkGitCommit: false,
  });
}

test('accepts the exact independent default-off physical-device preflight', () => {
  assert.deepEqual(validate(), {
    status: 'passed-bounded-default-off-device-services-preflight',
    buildNumber: '2026082302',
    candidateCommit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
    exactInstalledApkVerified: true,
    independentSwitchCount: 2,
    pushControlPresent: true,
    pushEnabled: false,
    crashDiagnosticsControlPresent: true,
    crashDiagnosticsEnabled: false,
    consentChanged: false,
    controlledCrashDiagnosticTriggered: false,
    optInDependentRegistrationOrReportRequested: false,
    exploreSurfaceRestored: true,
    firebaseOwnerGateSatisfied: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
});

test('rejects candidate, installed APK and device drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.buildNumber = '2026082301';
  assert.throws(() => validate(candidate), /not bound to the exact current candidate/u);

  const installed = structuredClone(evidence);
  installed.installed.delivery = 'google-play-split';
  assert.throws(() => validate(installed), /overstates Store delivery/u);

  const device = structuredClone(evidence);
  device.device.model = 'Unknown';
  assert.throws(() => validate(device), /physical-device summary/u);
});

test('rejects enabled controls, a consent dialog or changed second observation', () => {
  for (const [key, value] of [
    ['pushEnabled', true],
    ['crashDiagnosticsEnabled', true],
    ['consentDialogOpened', true],
    ['exactSecondObservationUnchanged', false],
  ]) {
    const changed = structuredClone(evidence);
    changed.controls[key] = value;
    assert.throws(() => validate(changed), /exact independent default-off control truth/u);
  }
});

test('rejects any Firebase, Push, Store or mutation overclaim', () => {
  for (const key of [
    'externalServiceConsentChanged',
    'pushActivationAttempted',
    'crashDiagnosticsActivationAttempted',
    'controlledCrashDiagnosticTriggered',
    'optInDependentRegistrationOrReportRequested',
    'realPushPassed',
    'firebaseOwnerGateSatisfied',
    'storeInstallationGateSatisfied',
    'accountMutationPerformed',
  ]) {
    const changed = structuredClone(evidence);
    changed.boundaries[key] = true;
    assert.throws(() => validate(changed), /boundaries are incomplete or overstate/u);
  }
});

test('rejects retained private identifiers', () => {
  const changed = structuredClone(evidence);
  changed.note = 'token=private';
  assert.throws(() => validate(changed), /private path, account, device or network/u);
});
