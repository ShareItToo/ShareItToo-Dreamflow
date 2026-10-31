import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  diagnoseAndroidControlledFcm,
  foregroundPushContractVisible,
} from '../../tool/diagnose_android_controlled_fcm.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

const apkBytes = Buffer.from('verified controlled FCM candidate');
const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
const candidate = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026081303',
  commit: '4144d0c0a3a2e19e89b6523594607c14625b0119',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  stripeLivemode: false,
  android: { apkSha256 },
};
const archive = { apkSha256 };
const device = { serial: 'private-device-id' };
const deviceSummary = {
  platform: 'android', physical: true, manufacturer: 'Google', model: 'Pixel 7 Pro',
  osVersion: '16', apiLevel: 36, securityPatch: '2026-04-05', containsRawDeviceIdentifier: false,
};

function fakeRunner({ playSplit = false, playInstaller = 'com.android.vending', locked = false } = {}) {
  let notificationRecords = 0;
  let processPresent = true;
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
      return 'versionName=1.0.0\nversionCode=2026081303 minSdk=23 targetSdk=36';
    }
    if (command[0] === 'shell' && command[1] === 'am' && command[2] === 'force-stop') {
      processPresent = false;
      return '';
    }
    if (command[0] === 'shell' && command[1] === 'monkey') {
      processPresent = true;
      return 'Events injected: 1';
    }
    if (joined === 'shell input keyevent KEYCODE_HOME') return '';
    if (joined === 'shell am kill com.shareittoo.app') { processPresent = false; return ''; }
    if (joined === 'shell pidof com.shareittoo.app') {
      if (!processPresent) throw new Error('no process');
      return '1234';
    }
    if (joined === 'shell cmd notification list') {
      return Array.from({ length: notificationRecords }, (_, index) => `0|com.shareittoo.app|${index}`).join('\n');
    }
    if (command[0] === 'shell' && command[1] === 'uiautomator') return 'UI hierarchy dumped';
    if (joined === 'exec-out cat /sdcard/sit-controlled-fcm.xml') {
      return '<hierarchy><node content-desc="Neue ShareItToo-Aktualisierung"/><node content-desc="Benachrichtigung: Neue ShareItToo-Aktualisierung. In der App ansehen."/></hierarchy>';
    }
    if (command[0] === 'shell' && command[1] === 'rm') return '';
    if (joined === 'shell cmd statusbar expand-notifications' || joined === 'shell cmd statusbar collapse') return '';
    if (joined === 'exec-out screencap -p') return Buffer.alloc(12_000, 7);
    throw new Error(`unexpected command: ${joined}`);
  };
  const sender = async () => {
    notificationRecords += 1;
    return {
      status: 'synthetic-booking-diagnostic-message-sent',
      paymentEndpointCalled: false,
      stripeLivemode: false,
    };
  };
  return { runner, sender, calls };
}

async function run(fake) {
  return diagnoseAndroidControlledFcm({
    vaultFile: '/private/accounts.json',
    privateArtifactDirectory: tempFixtures.makeSync('sit-fcm-'),
    commandRunner: fake.runner,
    adbPath: 'adb', device, deviceSummary, candidate, archive,
    capturedAt: '2026-08-14T10:00:00.000Z', wait: async () => {}, sender: fake.sender,
  });
}

test('recognizes only the current privacy-preserving V5.2 foreground copy', () => {
  assert.equal(foregroundPushContractVisible(
    '<node content-desc="Benachrichtigung: Neue ShareItToo-Aktualisierung. In der App ansehen."/>',
  ), true);
  assert.equal(foregroundPushContractVisible(
    '<node text="Benachrichtigung: Neue Nachricht"/><node text="Du hast eine neue Nachricht"/>',
  ), false);
});

test('accepts the exact Google Play split candidate for controlled FCM', async () => {
  const result = await run(fakeRunner({ playSplit: true }));
  assert.equal(result.evidence.installed.delivery, 'google-play-split');
  assert.equal(result.evidence.installed.installerPackageName, 'com.android.vending');
  assert.equal(result.evidence.boundaries.directDiagnosticOnly, false);
  assert.equal(result.evidence.boundaries.storeInstallationGateSatisfied, true);
  assert.equal(result.evidence.tests.foregroundPushDelivery.status, 'passed');
  assert.equal(result.evidence.tests.backgroundPushDelivery.status, 'passed');
  assert.equal(result.evidence.tests.terminatedProcessPushDelivery.status, 'passed');
  assert.equal(result.evidence.tests.notificationIconVisual.privateDiagnosticScreenshotCommitted, false);
  assert.equal(result.evidence.tests.notificationIconVisual.privateDiagnosticScreenshotAssumedSensitive, true);
  assert.equal(
    result.evidence.tests.notificationIconVisual.privateDiagnosticScreenshotMayContainUnrelatedNotifications,
    true,
  );
  assert.equal(result.evidence.tests.notificationIconVisual.privateDiagnosticScreenshotDistributionAllowed, false);
  assert.equal(result.evidence.boundaries.repositoryEvidenceContainsPersonalAccountData, false);
  assert.equal('containsPersonalAccountData' in result.evidence.boundaries, false);
  assert.equal(JSON.stringify(result).includes('private-device-id'), false);
});

test('keeps exact direct APK hashing support', async () => {
  const result = await run(fakeRunner());
  assert.equal(result.evidence.installed.delivery, 'direct-apk');
  assert.equal(result.evidence.installed.apkSha256, apkSha256);
  assert.equal(result.evidence.boundaries.directDiagnosticOnly, true);
  assert.equal(result.evidence.boundaries.storeInstallationGateSatisfied, false);
});

test('rejects a Play split not delivered by Google Play', async () => {
  await assert.rejects(run(fakeRunner({ playSplit: true, playInstaller: 'com.example.unknown' })), /not delivered by Google Play/);
});

test('refuses a locked phone without entering a passcode', async () => {
  const fake = fakeRunner({ locked: true });
  await assert.rejects(run(fake), /locked.*never enters a passcode/);
  assert.equal(fake.calls.some((args) => args.includes('input')), false);
});
