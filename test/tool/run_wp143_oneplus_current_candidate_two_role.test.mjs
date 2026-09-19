import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  assertWp143AdbInstallSuccess,
  assertWp143ExactCandidate,
  assertWp143PushOptInReady,
  classifyWp143Installation,
  establishWp143OwnerPushPreflight,
  parseWp143Arguments,
  parseWp143InstalledPackage,
  validateWp143JourneyResult,
  wp143Candidate,
  wp143ExecutionGate,
  wp143InstallGate,
} from '../../tool/run_wp143_oneplus_current_candidate_two_role.mjs';

const candidate = {
  ...wp143Candidate,
  firebaseConfigured: true,
  privacyScan: 'passed',
};

function journey() {
  return {
    schemaVersion: 1,
    kind: 'android-oneplus-email-verified-two-role-product-journey',
    status: 'passed-oneplus-email-verified-two-role-product-journey',
    candidate: {
      applicationId: wp143Candidate.applicationId,
      versionName: wp143Candidate.versionName,
      buildNumber: wp143Candidate.buildNumber,
      commit: wp143Candidate.commit,
      apkSha256: wp143Candidate.apkSha256,
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

test('binds WP143 to the exact current signed Internal Staging candidate', () => {
  assert.equal(assertWp143ExactCandidate(candidate), true);
  for (const mutate of [
    (value) => { value.buildNumber = '2026091313'; },
    (value) => { value.commit = '0'.repeat(40); },
    (value) => { value.apkSha256 = '0'.repeat(64); },
    (value) => { value.firebaseConfigured = false; },
    (value) => { value.privacyScan = 'failed'; },
    (value) => { value.socialAuth.googleEnabled = false; },
    (value) => { value.socialAuth.appleEnabled = true; },
    (value) => { value.socialAuth.facebookEnabled = true; },
  ]) {
    const value = structuredClone(candidate);
    mutate(value);
    assert.throws(() => assertWp143ExactCandidate(value), /WP143/u);
  }
});

test('preserves the exact candidate and never resets app data', () => {
  assert.deepEqual(classifyWp143Installation({
    packagePresent: true,
    exactCandidateInstalled: true,
    installedVersionName: wp143Candidate.versionName,
    installedBuildNumber: wp143Candidate.buildNumber,
    installAllowed: false,
  }), {
    action: 'preserve-exact-installed-candidate',
    installRequired: false,
    dataPreservingUpdate: false,
    localAppDataReset: false,
  });
  assert.throws(() => classifyWp143Installation({
    packagePresent: false,
    exactCandidateInstalled: false,
    installAllowed: false,
  }), /exact data-preserving install gate/u);
  assert.deepEqual(classifyWp143Installation({
    packagePresent: false,
    exactCandidateInstalled: false,
    installAllowed: true,
  }), {
    action: 'install-exact-candidate-without-existing-package',
    installRequired: true,
    dataPreservingUpdate: false,
    localAppDataReset: false,
  });
  assert.deepEqual(classifyWp143Installation({
    packagePresent: true,
    exactCandidateInstalled: false,
    installedVersionName: '1.0.0',
    installedBuildNumber: '2026091110',
    installAllowed: true,
  }), {
    action: 'data-preserving-update-to-exact-candidate',
    installRequired: true,
    dataPreservingUpdate: true,
    localAppDataReset: false,
  });
});

test('accepts ADB progress only when exact installation success is terminal', () => {
  assert.equal(assertWp143AdbInstallSuccess('Success\n'), true);
  assert.equal(assertWp143AdbInstallSuccess(`
    Performing Push Install
    candidate.apk: 1 file pushed
    Success
  `), true);
  for (const output of [
    '',
    'Performing Push Install',
    'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]',
    'Error\nSuccess',
  ]) {
    assert.throws(() => assertWp143AdbInstallSuccess(output), /WP143/u);
  }
});

test('establishes the exact owner role before inspecting push settings', async () => {
  const calls = [];
  const result = await establishWp143OwnerPushPreflight({
    sourceVaultFile: '/private/source.json',
    commandRunner: () => '',
    adbPath: '/opt/android/adb',
    device: { serial: 'opaque' },
    wait: async () => {},
    readVault: () => ({ vault: { accounts: [{ role: 'owner' }, { role: 'renter' }] } }),
    bindRole: async (value) => {
      calls.push(value.role);
      return { account: { role: 'owner' }, other: { role: 'renter' } };
    },
    restoreRole: async ({ operation }) => operation(),
  });
  assert.deepEqual(calls, ['owner']);
  assert.deepEqual(result, {
    status: 'exact-owner-session-established-for-push-preflight',
    containsAccountIdentity: false,
    containsSecrets: false,
    containsTokens: false,
  });
});

test('rejects an inexact principal before the push preflight', async () => {
  await assert.rejects(() => establishWp143OwnerPushPreflight({
    sourceVaultFile: '/private/source.json',
    commandRunner: () => '',
    adbPath: '/opt/android/adb',
    device: { serial: 'opaque' },
    wait: async () => {},
    readVault: () => ({ vault: { accounts: [{ role: 'owner' }, { role: 'renter' }] } }),
    bindRole: async () => ({
      account: { role: 'renter' },
      other: { role: 'owner' },
    }),
    restoreRole: async ({ operation }) => operation(),
  }), /exact owner session/u);
});

test('rejects unsafe or ambiguous non-exact installations', () => {
  for (const value of [
    {
      packagePresent: true,
      exactCandidateInstalled: false,
      installedVersionName: '2.0.0',
      installedBuildNumber: '2026091110',
      installAllowed: true,
    },
    {
      packagePresent: true,
      exactCandidateInstalled: false,
      installedVersionName: '1.0.0',
      installedBuildNumber: wp143Candidate.buildNumber,
      installAllowed: true,
    },
    {
      packagePresent: true,
      exactCandidateInstalled: false,
      installedVersionName: '1.0.0',
      installedBuildNumber: '2026091313',
      installAllowed: true,
    },
    {
      packagePresent: true,
      exactCandidateInstalled: false,
      installedVersionName: '1.0.0',
      installedBuildNumber: 'invalid',
      installAllowed: true,
    },
    {
      packagePresent: false,
      exactCandidateInstalled: true,
      installAllowed: true,
    },
  ]) {
    assert.throws(() => classifyWp143Installation(value), /WP143/u);
  }
});

test('parses only a complete installed ShareItToo version identity', () => {
  assert.deepEqual(parseWp143InstalledPackage(`
    Packages:
      versionCode=2026091312 minSdk=24 targetSdk=35
      versionName=1.0.0
  `), {
    versionName: '1.0.0',
    buildNumber: '2026091312',
  });
  assert.throws(() => parseWp143InstalledPackage('versionName=1.0.0'), /WP143/u);
  assert.throws(() => parseWp143InstalledPackage('versionCode=2026091312'), /WP143/u);
});

test('requires private inputs and exact WP143 gates', () => {
  assert.throws(() => parseWp143Arguments([]), /source-vault-file is required/u);
  const common = [
    '--source-vault-file', '/private/source.json',
    '--candidate-dir', '/private/candidate',
    '--private-artifact-dir', '/private/evidence',
  ];
  assert.throws(() => parseWp143Arguments([
    ...common,
    '--confirm-execution', 'WRONG',
  ]), /exact execution gate/u);
  assert.throws(() => parseWp143Arguments([
    ...common,
    '--confirm-execution', wp143ExecutionGate,
    '--confirm-data-preserving-install', 'WRONG',
  ]), /exact data-preserving install gate/u);
  const value = parseWp143Arguments([
    ...common,
    '--confirm-execution', wp143ExecutionGate,
    '--confirm-data-preserving-install', wp143InstallGate,
    '--adb', '/opt/android/adb',
  ]);
  assert.equal(value.executionAllowed, true);
  assert.equal(value.installAllowed, true);
  assert.equal(value.adbPath, '/opt/android/adb');
});

test('unknown arguments and missing private inputs never expose private paths', () => {
  assert.throws(() => parseWp143Arguments([
    '--private/owner-only-value',
  ]), (error) => {
    assert.match(error.message, /unknown argument/u);
    assert.equal(error.message.includes('/private/'), false);
    return true;
  });
  const result = spawnSync(process.execPath, [
    new URL('../../tool/run_wp143_oneplus_current_candidate_two_role.mjs', import.meta.url)
      .pathname,
    '--source-vault-file', '/private/missing-source.json',
    '--candidate-dir', '/private/missing-candidate',
    '--private-artifact-dir', '/private/missing-evidence',
    '--confirm-execution', wp143ExecutionGate,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private input is not an owner-only path/u);
  assert.equal(result.stderr.includes('/private/'), false);
});

test('requires stable visible ShareItToo push opt-in before product mutation', () => {
  const ready = {
    independentSwitchCount: 2,
    pushEnabled: true,
    crashDiagnosticsEnabled: false,
    exactSecondObservationUnchanged: true,
    consentDialogOpened: false,
    exploreSurfaceRestored: true,
  };
  assert.equal(assertWp143PushOptInReady(ready), true);
  for (const mutate of [
    (value) => { value.pushEnabled = false; },
    (value) => { value.exactSecondObservationUnchanged = false; },
    (value) => { value.consentDialogOpened = true; },
    (value) => { value.exploreSurfaceRestored = false; },
  ]) {
    const value = { ...ready };
    mutate(value);
    assert.throws(() => assertWp143PushOptInReady(value), /WP143/u);
  }
});

test('accepts only a complete sanitized current-candidate OnePlus journey', () => {
  assert.equal(validateWp143JourneyResult(journey()), true);
  for (const mutate of [
    (value) => { value.device.model = 'Pixel 7 Pro'; },
    (value) => { value.boundaries.contractCreated = true; },
    (value) => { value.boundaries.listingLeftActive = true; },
    (value) => { value.candidate.buildNumber = '2026091110'; },
    (value) => { value.boundaries.containsRawDeviceIdentifiers = true; },
  ]) {
    const value = journey();
    mutate(value);
    assert.throws(() => validateWp143JourneyResult(value), /WP143/u);
  }
});
