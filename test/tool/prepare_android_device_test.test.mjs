import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import {
  installAndLaunchCandidate,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from '../../tool/prepare_android_device_test.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function privateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  chmodSync(path, 0o600);
}

function archiveFixture() {
  const root = tempFixtures.makeSync('sit-device-prep-');
  const candidateDirectory = resolve(root, 'candidate');
  const apk = Buffer.from('verified apk fixture');
  const aab = Buffer.from('verified aab fixture');
  const privacy = {
    status: 'passed',
    identity: {
      applicationId: 'com.shareittoo.app',
      versionName: '1.0.0',
      versionCode: '2026080903',
      commit: 'a'.repeat(40),
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    },
    artifacts: {
      apk: { sha256: digest(apk) },
      aab: { sha256: digest(aab) },
    },
    findings: [],
  };
  const privacyContents = `${JSON.stringify(privacy, null, 2)}\n`;
  const candidate = {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026080903',
    commit: 'a'.repeat(40),
    channel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    signingCertificateSha256: 'd'.repeat(64),
    androidBinaryPrivacyScan: 'passed',
    androidBinaryPrivacyReportSha256: digest(privacyContents),
    apkSha256: digest(apk),
    aabSha256: digest(aab),
  };
  const deviceManifest = {
    candidate: {
      applicationId: 'com.shareittoo.app',
      bundleId: 'com.shareittoo.app',
      versionName: '1.0.0',
      buildNumber: '2026080903',
      commit: 'a'.repeat(40),
      releaseChannel: 'internal',
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      firebaseConfigured: true,
      paymentMode: 'memory',
      stripeLivemode: false,
      android: {
        apkSha256: digest(apk),
        aabSha256: digest(aab),
        signingCertificateSha256: 'd'.repeat(64),
      },
    },
  };

  privateFile(resolve(root, 'store/device-validation.json'), `${JSON.stringify(deviceManifest, null, 2)}\n`);
  privateFile(resolve(candidateDirectory, 'shareittoo.apk'), apk);
  privateFile(resolve(candidateDirectory, 'shareittoo.aab'), aab);
  privateFile(resolve(candidateDirectory, 'privacy-scan.json'), privacyContents);
  privateFile(resolve(candidateDirectory, 'manifest.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  return { root, candidateDirectory };
}

test('parses and selects exactly one authorized physical Android device', () => {
  const devices = parseAdbDevices(
    'List of devices attached\nPRIVATE-SERIAL device usb:1-2 product:panther model:Pixel_7 device:panther transport_id:4\n',
  );
  const selected = selectSinglePhysicalDevice(devices);
  assert.equal(selected.serial, 'PRIVATE-SERIAL');
  assert.equal(selected.attributes.model, 'Pixel_7');
});

test('rejects an emulator even when it is online', () => {
  const devices = parseAdbDevices(
    'List of devices attached\nemulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64\n',
  );
  assert.throws(() => selectSinglePhysicalDevice(devices), /physical Android phone/);
});

test('explains an unconfirmed USB-debugging prompt without exposing an identifier', () => {
  const devices = parseAdbDevices('List of devices attached\nPRIVATE-SERIAL unauthorized usb:1-2\n');
  assert.throws(
    () => selectSinglePhysicalDevice(devices),
    (error) => /confirm the USB-debugging trust prompt/.test(error.message) && !error.message.includes('PRIVATE-SERIAL'),
  );
});

test('rejects ambiguous multiple physical devices', () => {
  const devices = parseAdbDevices(
    'List of devices attached\nONE device model:Pixel_7\nTWO device model:Galaxy_S25\n',
  );
  assert.throws(() => selectSinglePhysicalDevice(devices), /exactly one connected/);
});

test('verifies the private candidate archive against every release record', async () => {
  const fixture = archiveFixture();
  const result = await validateCandidateArchive(fixture);
  assert.equal(result.buildNumber, '2026080903');
  assert.equal(result.firebaseConfigured, true);
  assert.equal(result.privacyScan, 'passed');
});

test('rejects a candidate archive hash mismatch', async () => {
  const fixture = archiveFixture();
  const apkPath = resolve(fixture.candidateDirectory, 'shareittoo.apk');
  privateFile(apkPath, 'tampered apk');
  await assert.rejects(() => validateCandidateArchive(fixture), /APK SHA-256/);
});

test('direct installation evidence never contains the raw ADB serial and never claims a Store install', () => {
  const privateSerial = 'PRIVATE-SERIAL';
  const calls = [];
  const commandRunner = (_file, args) => {
    calls.push(args);
    const command = args.slice(2);
    if (command[0] === 'install') return 'Performing Streamed Install\nSuccess\n';
    if (command.join(' ') === 'shell pm path com.shareittoo.app') return 'package:/data/app/base.apk\n';
    if (command.join(' ') === 'shell dumpsys package com.shareittoo.app') {
      return '  versionCode=2026080903 minSdk=23 targetSdk=35\n  versionName=1.0.0\n';
    }
    if (command[0] === 'shell' && command[1] === 'monkey') return 'Events injected: 1\n';
    if (command.join(' ') === 'shell dumpsys activity activities') {
      return 'ResumedActivity: ActivityRecord{fixture com.shareittoo.app/.MainActivity}\n';
    }
    throw new Error(`Unexpected fake ADB command: ${command.join(' ')}`);
  };
  const evidence = installAndLaunchCandidate({
    commandRunner,
    device: { serial: privateSerial, attributes: {}, state: 'device' },
    capturedAt: '2026-08-09T20:00:00.000Z',
    candidate: {
      applicationId: 'com.shareittoo.app',
      bundleId: 'com.shareittoo.app',
      versionName: '1.0.0',
      buildNumber: '2026080903',
      commit: 'a'.repeat(40),
      releaseChannel: 'internal',
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      firebaseConfigured: true,
      paymentMode: 'memory',
      stripeLivemode: false,
      apkSha256: 'b'.repeat(64),
      signingCertificateSha256: 'd'.repeat(64),
      privacyScan: 'passed',
      apkPath: '/private/candidate.apk',
    },
  });
  assert.equal(evidence.installation.storeInstallationGateSatisfied, false);
  assert.equal(evidence.boundaries.playInternalInstallPassed, false);
  assert.equal(JSON.stringify(evidence).includes(privateSerial), false);
  assert.equal(calls.every((args) => args[0] === '-s' && args[1] === privateSerial), true);
});

test('an ADB command failure never leaks the raw serial through the error message', () => {
  const privateSerial = 'PRIVATE-SERIAL';
  assert.throws(
    () => installAndLaunchCandidate({
      commandRunner: () => {
        throw new Error(`Command failed: adb -s ${privateSerial}`);
      },
      device: { serial: privateSerial, attributes: {}, state: 'device' },
      candidate: {
        applicationId: 'com.shareittoo.app',
        bundleId: 'com.shareittoo.app',
        versionName: '1.0.0',
        buildNumber: '2026080903',
        commit: 'a'.repeat(40),
        releaseChannel: 'internal',
        apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
        firebaseConfigured: true,
        paymentMode: 'memory',
        stripeLivemode: false,
        apkSha256: 'b'.repeat(64),
        signingCertificateSha256: 'd'.repeat(64),
        privacyScan: 'passed',
        apkPath: '/private/candidate.apk',
      },
    }),
    (error) => /ADB device command failed/.test(error.message) && !error.message.includes(privateSerial),
  );
});
