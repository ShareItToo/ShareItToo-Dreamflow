import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { diagnoseAndroidSyntheticRoleBooking } from
  '../../tool/diagnose_android_synthetic_role_booking.mjs';

const runnerSource = readFileSync(
  new URL('../../tool/diagnose_android_synthetic_role_booking.mjs', import.meta.url),
  'utf8',
);

const apkBytes = Buffer.from('verified synthetic booking candidate');
const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026081303',
  commit: '4144d0c0a3a2e19e89b6523594607c14625b0119',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: { apkSha256 },
};
const archive = { apkSha256 };
const device = { serial: 'private-device-id' };
const deviceSummary = {
  platform: 'android', physical: true, manufacturer: 'Google', model: 'Pixel 7 Pro',
  osVersion: '16', apiLevel: 36, securityPatch: '2026-04-05', containsRawDeviceIdentifier: false,
};
const lifecycle = {
  status: 'passed-bounded-synthetic-role-booking-lifecycle',
  workflow: ['requested', 'accepted', 'active', 'completed'],
  paymentEndpointCalled: false,
  stripeLivemode: false,
  tests: {
    ownerRequestVisibility: { status: 'passed', result: 'requested-visible-to-owner' },
    renterUpcomingVisibility: { status: 'passed', result: 'accepted-visible-to-renter' },
    renterRunningVisibility: { status: 'passed', result: 'active-visible-to-renter' },
    renterCompletedVisibility: { status: 'passed', result: 'completed-visible-to-renter' },
  },
  confirmations: {
    pickup: {
      status: 'passed', presenterRole: 'owner', verifierRole: 'renter', verificationVersion: 3,
    },
    return: {
      status: 'passed', presenterRole: 'renter', verifierRole: 'owner', verificationVersion: 3,
    },
  },
};

function fakeRunner({ playSplit = false, playInstaller = 'com.android.vending', locked = false } = {}) {
  const calls = [];
  const runner = (_file, args, options = {}) => {
    calls.push(args);
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell dumpsys window policy') return locked ? 'keyguardShowing=true' : 'keyguardShowing=false';
    if (joined === 'shell pm path com.shareittoo.app') {
      return playSplit
        ? 'package:/data/app/com.shareittoo.app/base.apk\npackage:/data/app/com.shareittoo.app/split_config.de.apk'
        : 'package:/data/app/base.apk';
    }
    if (joined === 'exec-out cat /data/app/base.apk') return options.binary ? apkBytes : apkBytes.toString();
    if (joined === 'shell pm list packages -i com.shareittoo.app') {
      return `package:com.shareittoo.app installer=${playInstaller}`;
    }
    if (joined === 'shell dumpsys package com.shareittoo.app') {
      return 'versionName=1.0.0\nversionCode=2026081303 minSdk=24 targetSdk=35';
    }
    throw new Error(`unexpected command: ${joined}`);
  };
  return { runner, calls };
}

async function run(fake) {
  return diagnoseAndroidSyntheticRoleBooking({
    vaultFile: '/private/accounts.json', commandRunner: fake.runner, adbPath: 'adb',
    device, deviceSummary, candidate, archive, capturedAt: '2026-08-14T12:00:00.000Z',
    lifecycleRunner: async () => lifecycle,
  });
}

test('accepts the exact Google Play split for the two-role booking lifecycle', async () => {
  const evidence = await run(fakeRunner({ playSplit: true }));
  assert.equal(evidence.installed.delivery, 'google-play-split');
  assert.equal(evidence.installed.installerPackageName, 'com.android.vending');
  assert.equal(evidence.boundaries.directDiagnosticOnly, false);
  assert.equal(evidence.boundaries.storeInstallationGateSatisfied, true);
  assert.deepEqual(evidence.backendFixture.workflow, ['requested', 'accepted', 'active', 'completed']);
  assert.equal(evidence.backendFixture.confirmations.pickup.verifierRole, 'renter');
  assert.equal(evidence.backendFixture.confirmations.return.verifierRole, 'owner');
  assert.equal(JSON.stringify(evidence).includes(device.serial), false);
});

test('keeps exact direct APK hashing support', async () => {
  const evidence = await run(fakeRunner());
  assert.equal(evidence.installed.delivery, 'direct-apk');
  assert.equal(evidence.installed.apkSha256, apkSha256);
  assert.equal(evidence.boundaries.storeInstallationGateSatisfied, false);
});

test('rejects a split not delivered by Google Play', async () => {
  await assert.rejects(
    run(fakeRunner({ playSplit: true, playInstaller: 'com.example.unknown' })),
    /not delivered by Google Play/,
  );
});

test('refuses a locked phone without entering a passcode', async () => {
  const fake = fakeRunner({ locked: true });
  await assert.rejects(run(fake), /locked.*never enters a passcode/);
  assert.equal(fake.calls.some((args) => args.includes('input')), false);
});

test('the executable runner requires the explicit current-head archive', () => {
  assert.match(runnerSource, /validateCurrentHeadAndroidReleaseArchive/u);
  assert.match(runnerSource, /--candidate-dir is required/u);
  assert.doesNotMatch(runnerSource, /store\/device-validation\.json/u);
  assert.doesNotMatch(runnerSource, /validateCandidateArchive/u);
});
