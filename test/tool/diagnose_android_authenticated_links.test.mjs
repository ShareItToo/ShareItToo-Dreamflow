import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { diagnoseAndroidAuthenticatedLinks } from '../../tool/diagnose_android_authenticated_links.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

const apkBytes = Buffer.from('verified authenticated-link candidate bytes');
const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
const device = { serial: 'private-device-id', state: 'device', attributes: {} };
const deviceSummary = {
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '16',
  apiLevel: 36,
  securityPatch: '2026-04-05',
  containsRawDeviceIdentifier: false,
};
const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026081018',
  commit: '555946e64e583e5b6ee3321de2c1f74f35fbf238',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: { apkSha256 },
};
const archive = { apkSha256 };

function privateVault({ status = 'synthetic-booking-completed', threadId = 'private-thread-id' } = {}) {
  const root = tempFixtures.makeSync('sit-authenticated-links-');
  chmodSync(root, 0o700);
  const vaultFile = resolve(root, 'accounts.json');
  writeFileSync(vaultFile, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    status,
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    stripeLivemode: false,
    accounts: [{ role: 'owner' }, { role: 'renter' }],
    syntheticBooking: {
      listingId: 'private-listing-id',
      bookingId: 'private-booking-id',
      threadId,
      title: 'Private synthetic fixture title',
      workflowStatus: 'completed',
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
  }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(vaultFile, 0o600);
  return vaultFile;
}

const listingHierarchy = '<hierarchy><node text="Private synthetic fixture title"/><node text="Anzeige"/></hierarchy>';
const bookingHierarchy = '<hierarchy><node text="Private synthetic fixture title"/><node text="Abgeschlossen"/></hierarchy>';
const chatHierarchy = '<hierarchy><node text="Private synthetic fixture title"/><node text="Der Buchungs-Chat ist geöffnet"/></hierarchy>';
const guestHierarchy = '<hierarchy><node text="Bitte zuerst anmelden"/><node text="Nach der Anmeldung öffnen wir den sicheren Chat-Kontext."/></hierarchy>';

function fakeRunner({ locked = false, guestChat = false, bytes = apkBytes, playSplit = false } = {}) {
  let surface = 'listing';
  const links = [];
  const calls = [];
  const runner = (_file, args, options = {}) => {
    calls.push(args);
    const command = args.slice(2);
    if (command.join(' ') === 'shell dumpsys window policy') {
      return locked ? 'keyguardShowing=true' : 'keyguardShowing=false';
    }
    if (command.join(' ') === 'shell pm path com.shareittoo.app') {
      return playSplit
        ? 'package:/data/app/com.shareittoo.app/base.apk\npackage:/data/app/com.shareittoo.app/split_config.de.apk'
        : 'package:/data/app/base.apk';
    }
    if (command.join(' ') === 'shell pm list packages -i com.shareittoo.app') {
      return 'package:com.shareittoo.app installer=com.android.vending';
    }
    if (command.join(' ') === 'exec-out cat /data/app/base.apk') return options.binary ? bytes : bytes.toString();
    if (command.join(' ') === 'shell dumpsys package com.shareittoo.app') {
      return '  versionName=1.0.0\n  versionCode=2026081018 minSdk=23 targetSdk=36';
    }
    if (command[0] === 'shell' && command[1] === 'am' && command[2] === 'force-stop') return '';
    if (command[0] === 'shell' && command[1] === 'am' && command[2] === 'start') {
      const uri = command[command.indexOf('-d') + 1];
      links.push(uri);
      surface = uri.includes('/listing/') ? 'listing' : uri.includes('/booking/') ? 'booking' : 'chat';
      return 'Status: ok\nActivity: com.shareittoo.app/.MainActivity';
    }
    if (command[0] === 'shell' && command[1] === 'uiautomator') return 'UI hierarchy dumped';
    if (command.join(' ') === 'exec-out cat /sdcard/sit-authenticated-links-diagnostic.xml') {
      if (surface === 'listing') return listingHierarchy;
      if (surface === 'booking') return bookingHierarchy;
      return guestChat ? guestHierarchy : chatHierarchy;
    }
    if (command[0] === 'shell' && command[1] === 'rm') return '';
    if (command[0] === 'shell' && command[1] === 'monkey') return 'Events injected: 1';
    throw new Error(`unexpected command: ${command.join(' ')}`);
  };
  return { runner, calls, links };
}

test('proves three authenticated fixture links without emitting private fixture data', async () => {
  const fake = fakeRunner();
  const evidence = await diagnoseAndroidAuthenticatedLinks({
    vaultFile: privateVault(),
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    archive,
    capturedAt: '2026-08-10T10:30:00.000Z',
    wait: async () => {},
  });
  assert.equal(evidence.status, 'passed-bounded-authenticated-deep-link-diagnostic');
  assert.equal(evidence.tests.authenticatedHttpsListing.status, 'passed');
  assert.equal(evidence.tests.authenticatedHttpsBooking.status, 'passed');
  assert.equal(evidence.tests.authenticatedCustomSchemeChat.status, 'passed');
  assert.equal(evidence.boundaries.authenticatedDeepLinksPassed, true);
  assert.equal(evidence.boundaries.messageSent, false);
  assert.equal(evidence.boundaries.paymentEndpointCalled, false);
  const serialized = JSON.stringify(evidence);
  for (const privateValue of [
    'private-device-id',
    'private-listing-id',
    'private-booking-id',
    'private-thread-id',
    'Private synthetic fixture title',
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(fake.links.length, 3);
});

test('accepts the exact Google Play split installation for authenticated links', async () => {
  const fake = fakeRunner({ playSplit: true });
  const evidence = await diagnoseAndroidAuthenticatedLinks({
    vaultFile: privateVault(),
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    archive,
    wait: async () => {},
  });
  assert.equal(evidence.installed.delivery, 'google-play-split');
  assert.equal(evidence.installed.installerPackageName, 'com.android.vending');
  assert.equal(evidence.boundaries.storeInstallationGateSatisfied, true);
  assert.equal(evidence.boundaries.directDiagnosticOnly, false);
});

test('refuses a locked phone without entering a passcode', async () => {
  const fake = fakeRunner({ locked: true });
  await assert.rejects(
    diagnoseAndroidAuthenticatedLinks({
      vaultFile: privateVault(),
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /locked.*never enters a passcode/,
  );
  assert.equal(fake.calls.some((args) => args.includes('input')), false);
});

test('does not misclassify the guest chat surface as authenticated', async () => {
  const fake = fakeRunner({ guestChat: true });
  await assert.rejects(
    diagnoseAndroidAuthenticatedLinks({
      vaultFile: privateVault(),
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /authenticated ShareItToo chat link surface did not appear/,
  );
});

test('rejects an incomplete private fixture before ADB', async () => {
  const fake = fakeRunner();
  await assert.rejects(
    diagnoseAndroidAuthenticatedLinks({
      vaultFile: privateVault({ status: 'synthetic-booking-active', threadId: 'not/safe' }),
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /not a completed, isolated Staging role fixture/,
  );
  assert.equal(fake.calls.length, 0);
});

test('rejects an installed APK that differs from the candidate', async () => {
  const fake = fakeRunner({ bytes: Buffer.from('different bytes') });
  await assert.rejects(
    diagnoseAndroidAuthenticatedLinks({
      vaultFile: privateVault(),
      commandRunner: fake.runner,
      adbPath: 'adb',
      device,
      deviceSummary,
      candidate,
      archive,
      wait: async () => {},
    }),
    /APK does not match/,
  );
});
