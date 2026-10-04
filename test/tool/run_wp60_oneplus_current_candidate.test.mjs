import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectWp60OnePlusInstall,
  parseWp60OnePlusArguments,
  runWp60OnePlusMode,
} from '../../tool/run_wp60_oneplus_current_candidate.mjs';

const device = {
  serial: 'SYNTHETIC_USB_DEVICE',
  state: 'device',
  attributes: { model: 'CPH2581', usb: '1-2' },
};
const binding = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026090711',
  minSdk: 24,
  targetSdk: 36,
  artifactSourceHead: 'c819c5f4445d0b998b2ee319e64f8c95cfb01eda',
  aabSha256: 'a2e72a5afd09e44a20c82d60236e63143d963f7a3ba6ac6e95389e87ce1e3681',
  previousVersionCode: '2026090204',
  allowedAdbTransports: ['usb', 'wireless-adb'],
};

function fakeRunner({
  versionCode = binding.previousVersionCode,
  targetSdk = versionCode === binding.versionCode ? 36 : 35,
  manufacturer = 'OnePlus',
  installer = 'com.android.vending',
  continuity = true,
} = {}) {
  const calls = [];
  const runner = (_file, args) => {
    calls.push(args);
    const command = args.slice(2).join(' ');
    if (command === 'shell getprop ro.product.manufacturer') return `${manufacturer}\n`;
    if (command === 'shell getprop ro.product.model') return 'CPH2581\n';
    if (command === 'shell getprop ro.build.version.release') return '16\n';
    if (command === 'shell getprop ro.build.version.sdk') return '36\n';
    if (command === 'shell getprop ro.build.version.security_patch') return '2026-08-05\n';
    if (command === 'shell dumpsys package com.shareittoo.app') {
      return `versionCode=${versionCode} minSdk=24 targetSdk=${targetSdk}\n`
        + 'versionName=1.0.0\n'
        + (continuity
          ? 'firstInstallTime=2026-08-26 18:00:00\nceDataInode=456789\n'
          : 'firstInstallTime=2026-08-26 18:00:00\n');
    }
    if (command === 'shell pm path com.shareittoo.app') {
      return 'package:/data/app/example/base.apk\n'
        + 'package:/data/app/example/split_config.arm64_v8a.apk\n';
    }
    if (command === 'shell pm list packages -i com.shareittoo.app') {
      return `package:com.shareittoo.app installer=${installer}\n`
        + 'package:com.shareittoo.app.qa installer=com.google.android.packageinstaller\n';
    }
    if (command === 'shell pidof com.shareittoo.app') return '987654321\n';
    throw new Error(`Unexpected command: ${command}`);
  };
  return { runner, calls };
}

function inspect(fake, overrides = {}) {
  return inspectWp60OnePlusInstall({
    commandRunner: fake.runner,
    device,
    expectedCandidate: {
      applicationId: binding.applicationId,
      versionName: binding.versionName,
      versionCode: binding.versionCode,
      minSdk: binding.minSdk,
      targetSdk: binding.targetSdk,
      artifactSourceHead: binding.artifactSourceHead,
      aabSha256: binding.aabSha256,
    },
    previousVersionCode: binding.previousVersionCode,
    allowedTransports: binding.allowedAdbTransports,
    capturedAt: '2026-09-08T17:30:00Z',
    ...overrides,
  });
}

test('requires exact bounded owner and Internal-release confirmations', () => {
  assert.throws(() => parseWp60OnePlusArguments([]), /mode must/u);
  assert.throws(() => parseWp60OnePlusArguments([
    '--mode', 'inspect',
  ]), /both exact gates/u);
  assert.throws(() => parseWp60OnePlusArguments([
    '--mode', 'inspect',
    '--confirm-release-go', 'WRONG',
  ]), /exact Google Play Internal/u);
  assert.deepEqual(parseWp60OnePlusArguments([
    '--mode', 'verify',
    '--confirm-release-go', 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    '--confirm-owner-window', 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
    '--adb', '/opt/android/adb',
  ]), {
    adbPath: '/opt/android/adb',
    mode: 'verify',
    releaseGoConfirmed: true,
    ownerWindowConfirmed: true,
  });
});

test('reports an older Play build as update-required without mutating the device', () => {
  const fake = fakeRunner();
  const result = inspect(fake);
  assert.equal(result.status, 'play-update-required-previous-candidate-preserved');
  assert.equal(result.installedApplication.versionCode, '2026090204');
  assert.equal(result.installedApplication.installerPackageName, 'com.android.vending');
  assert.equal(result.readiness.googlePlayUpdateRequired, true);
  assert.equal(Object.values(result.boundaries).every((value) => value === false), true);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(device.serial), false);
  assert.equal(serialized.includes('987654321'), false);
  assert.equal(serialized.includes('456789'), false);
  for (const forbidden of [
    ' install ', 'uninstall', 'pm clear', 'force-stop', 'am start', 'input',
    'logcat', 'screencap', 'uiautomator', 'settings put',
  ]) {
    assert.equal(fake.calls.some((args) => ` ${args.join(' ')} `.includes(forbidden)), false);
  }
});

test('accepts the exact current Play build over USB and opens the bounded next phase', () => {
  const fake = fakeRunner({ versionCode: binding.versionCode });
  const result = inspect(fake);
  assert.equal(result.status, 'passed-current-candidate-play-delivery-read-only');
  assert.equal(result.transport.type, 'usb');
  assert.equal(result.installedApplication.targetSdk, 36);
  assert.equal(result.readiness.currentCandidatePresent, true);
  assert.equal(result.readiness.lifecycleMayBegin, true);

  const verified = runWp60OnePlusMode({
    mode: 'verify',
    commandRunner: fake.runner,
    device,
    binding,
    releaseGoConfirmed: true,
    ownerWindowConfirmed: true,
    capturedAt: '2026-09-08T17:31:00Z',
  });
  assert.equal(verified.installedApplication.versionCode, '2026090711');
  assert.equal(verified.transport.type, 'usb');
});

test('fails closed on unknown build, wrong device, wrong installer or missing continuity', () => {
  assert.throws(() => inspect(fakeRunner({ versionCode: '2026090301' })), /neither the exact/u);
  assert.throws(() => inspect(fakeRunner({ manufacturer: 'Google' })), /not identified as OnePlus/u);
  assert.throws(() => inspect(fakeRunner({ installer: 'com.example.sideload' })), /not delivered by Google Play/u);
  assert.throws(() => inspect(fakeRunner({ continuity: false })), /continuity markers/u);
  assert.throws(() => inspect(fakeRunner(), {
    device: { serial: 'UNKNOWN', state: 'device', attributes: {} },
  }), /explicitly allowed/u);
});

test('refuses every mode before authorization without touching ADB', () => {
  const fake = fakeRunner({ versionCode: binding.versionCode });
  for (const authorization of [
    {},
    { releaseGoConfirmed: true },
    { ownerWindowConfirmed: true },
  ]) {
    assert.throws(() => runWp60OnePlusMode({
      mode: 'inspect',
      commandRunner: fake.runner,
      device,
      binding,
      ...authorization,
    }), /not authorized/u);
  }
  assert.equal(fake.calls.length, 0);
});
