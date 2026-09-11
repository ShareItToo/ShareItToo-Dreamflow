import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assertWp117ExactCandidate,
  classifyWp117Installation,
  parseWp117Arguments,
  validateWp117JourneyResult,
  wp117Candidate,
  wp117ExecutionGate,
  wp117ScopedResetGate,
} from '../../tool/run_wp117_oneplus_current_candidate_two_role.mjs';

const candidate = {
  ...wp117Candidate,
  firebaseConfigured: true,
  privacyScan: 'passed',
};

function journey() {
  return {
    schemaVersion: 1,
    kind: 'android-oneplus-email-verified-two-role-product-journey',
    status: 'passed-oneplus-email-verified-two-role-product-journey',
    candidate: {
      applicationId: wp117Candidate.applicationId,
      versionName: wp117Candidate.versionName,
      buildNumber: wp117Candidate.buildNumber,
      commit: wp117Candidate.commit,
      apkSha256: wp117Candidate.apkSha256,
    },
    device: { physical: true, manufacturer: 'OnePlus', model: 'CPH2581' },
    boundaries: {
      physicalOnePlusOnly: true,
      onePlusContacted: true,
      listingLeftActive: false,
      testBookingLeftActive: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      contractCreated: false,
      reservationCreated: false,
      productionChanged: false,
      googlePlayChanged: false,
      publicRegistrationChanged: false,
      realMoneyUsed: false,
      containsAccountIdentity: false,
      containsSecrets: false,
      containsTokens: false,
      containsFixtureIdentifiers: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  };
}

test('binds WP117 to the one exact signed Internal Staging candidate', () => {
  assert.equal(assertWp117ExactCandidate(candidate), true);
  for (const mutate of [
    (value) => { value.buildNumber = '2026091111'; },
    (value) => { value.apkSha256 = '0'.repeat(64); },
    (value) => { value.firebaseConfigured = false; },
    (value) => { value.privacyScan = 'failed'; },
  ]) {
    const value = structuredClone(candidate);
    mutate(value);
    assert.throws(() => assertWp117ExactCandidate(value), /WP117/u);
  }
});

test('preserves an exact installation and gates only a non-exact package reset', () => {
  assert.deepEqual(classifyWp117Installation({
    packagePresent: true,
    exactCandidateInstalled: true,
    scopedResetAllowed: false,
  }), {
    action: 'preserve-exact-installed-candidate',
    uninstallRequired: false,
    installRequired: false,
    localAppDataReset: false,
  });
  assert.throws(() => classifyWp117Installation({
    packagePresent: true,
    exactCandidateInstalled: false,
    scopedResetAllowed: false,
  }), /exact scoped package-reset gate/u);
  assert.deepEqual(classifyWp117Installation({
    packagePresent: true,
    exactCandidateInstalled: false,
    scopedResetAllowed: true,
  }), {
    action: 'reset-shareittoo-package-and-install-exact-candidate',
    uninstallRequired: true,
    installRequired: true,
    localAppDataReset: true,
  });
  assert.deepEqual(classifyWp117Installation({
    packagePresent: false,
    exactCandidateInstalled: false,
    scopedResetAllowed: false,
  }), {
    action: 'install-exact-candidate-without-reset',
    uninstallRequired: false,
    installRequired: true,
    localAppDataReset: false,
  });
});

test('requires private execution inputs and exact scoped-reset wording', () => {
  assert.throws(() => parseWp117Arguments([]), /source-vault-file is required/u);
  assert.throws(() => parseWp117Arguments([
    '--source-vault-file', '/private/source.json',
    '--candidate-dir', '/private/candidate',
    '--private-artifact-dir', '/private/evidence',
    '--confirm-execution', wp117ExecutionGate,
    '--confirm-scoped-app-reset', 'WRONG',
  ]), /exact WP117 package-reset gate/u);
  assert.throws(() => parseWp117Arguments([
    '--source-vault-file', '/private/source.json',
    '--candidate-dir', '/private/candidate',
    '--private-artifact-dir', '/private/evidence',
  ]), /exact WP117 execution gate is required/u);
  assert.throws(() => parseWp117Arguments([
    '--source-vault-file', '/private/source.json',
    '--candidate-dir', '/private/candidate',
    '--private-artifact-dir', '/private/evidence',
    '--confirm-execution', 'WRONG',
  ]), /exact WP117 execution gate was not supplied/u);
  const value = parseWp117Arguments([
    '--source-vault-file', '/private/source.json',
    '--candidate-dir', '/private/candidate',
    '--private-artifact-dir', '/private/evidence',
    '--confirm-execution', wp117ExecutionGate,
    '--confirm-scoped-app-reset', wp117ScopedResetGate,
    '--adb', '/opt/android/adb',
  ]);
  assert.equal(value.scopedResetAllowed, true);
  assert.equal(value.executionAllowed, true);
  assert.equal(value.adbPath, '/opt/android/adb');
});

test('a missing private input never exposes its path', () => {
  const result = spawnSync(process.execPath, [
    new URL('../../tool/run_wp117_oneplus_current_candidate_two_role.mjs', import.meta.url)
      .pathname,
    '--source-vault-file', '/private/missing-source.json',
    '--candidate-dir', '/private/missing-candidate',
    '--private-artifact-dir', '/private/missing-evidence',
    '--confirm-execution', wp117ExecutionGate,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private input is not an owner-only path/u);
  assert.equal(result.stderr.includes('/private/'), false);
});

test('an unknown argument never exposes private input text', () => {
  assert.throws(() => parseWp117Arguments([
    '--private/owner-only-value',
  ]), (error) => {
    assert.match(error.message, /Unknown WP117 argument\./u);
    assert.equal(error.message.includes('/private/'), false);
    return true;
  });
});

test('accepts only a complete sanitized OnePlus two-role result', () => {
  assert.equal(validateWp117JourneyResult(journey()), true);
  for (const mutate of [
    (value) => { value.device.model = 'Pixel 7 Pro'; },
    (value) => { value.boundaries.contractCreated = true; },
    (value) => { value.boundaries.listingLeftActive = true; },
    (value) => { value.candidate.buildNumber = '2026091109'; },
  ]) {
    const value = journey();
    mutate(value);
    assert.throws(() => validateWp117JourneyResult(value), /WP117/u);
  }
});
