import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseOnePlusCandidatePreflightArguments,
  preflightOnePlusPlayInternalCandidate,
} from '../../tool/preflight_oneplus_play_internal_candidate.mjs';

const device = {
  serial: '192.0.2.44:39211',
  state: 'device',
  attributes: { model: 'CPH2581' },
};
const expectedCandidate = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026082601',
  minSdk: 24,
  targetSdk: 35,
  artifactSourceHead: 'a1aa3f2528f1923c092a1fb15bdd3dc083673890',
  aabSha256: '8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873',
};

function fakeRunner({
  manufacturer = 'OnePlus',
  versionCode = expectedCandidate.versionCode,
  minSdk = 24,
  targetSdk = 35,
  installer = 'com.android.vending',
  packagePathOutput = 'package:/data/app/example/base.apk\npackage:/data/app/example/split_config.arm64_v8a.apk\n',
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
      return `versionCode=${versionCode} minSdk=${minSdk} targetSdk=${targetSdk}\nversionName=1.0.0\n`;
    }
    if (command === 'shell pm path com.shareittoo.app') {
      return packagePathOutput;
    }
    if (command === 'shell pm list packages -i com.shareittoo.app') {
      return `package:com.shareittoo.app installer=${installer}\n`;
    }
    if (command === 'shell pidof com.shareittoo.app') return '777 888\n';
    throw new Error(`Unexpected command: ${command}`);
  };
  return { runner, calls };
}

function preflight(fake, overrides = {}) {
  return preflightOnePlusPlayInternalCandidate({
    commandRunner: fake.runner,
    device,
    expectedCandidate,
    releaseGoConfirmed: true,
    capturedAt: '2026-08-27T01:00:00.000Z',
    ...overrides,
  });
}

test('requires the exact release gate before any future CLI device access', () => {
  assert.throws(
    () => parseOnePlusCandidatePreflightArguments([]),
    /remains closed/u,
  );
  assert.throws(
    () => parseOnePlusCandidatePreflightArguments([
      '--confirm-release-go', 'WRONG',
    ]),
    /exact Google Play Internal release gate/u,
  );
  assert.deepEqual(parseOnePlusCandidatePreflightArguments([
    '--confirm-release-go', 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    '--adb', '/opt/android/adb',
  ]), { adbPath: '/opt/android/adb', releaseGoConfirmed: true });
});

test('refuses programmatic device inspection while the release gate is closed', () => {
  const fake = fakeRunner();
  assert.throws(() => preflightOnePlusPlayInternalCandidate({
    commandRunner: fake.runner,
    device,
    expectedCandidate,
  }), /not authorized/u);
  assert.equal(fake.calls.length, 0);
});

test('proves exact version and Play delivery without binary or behavior overclaim', () => {
  const fake = fakeRunner();
  const result = preflight(fake);
  assert.equal(result.installedApplication.versionCode, '2026082601');
  assert.equal(result.installedApplication.installerPackageName, 'com.android.vending');
  assert.equal(result.installedApplication.exactAabBinaryEquivalenceClaimed, false);
  assert.equal(result.installedApplication.playAppSigningCertificateVerified, false);
  assert.equal(result.installedApplication.functionalBehaviorClaimed, false);
  assert.equal(result.readiness.nonDestructiveManualMatrixMayBegin, true);
  assert.equal(result.readiness.authenticatedMatrixMayBegin, false);
  assert.equal(Object.values(result.boundaries).every((value) => value === false), true);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(device.serial), false);
  assert.equal(serialized.includes('777'), false);
  for (const forbidden of [
    'force-stop', ' install ', 'uninstall', 'pm clear', 'input', 'logcat',
    'screencap', 'uiautomator', 'settings put',
  ]) {
    assert.equal(fake.calls.some((args) => ` ${args.join(' ')} `.includes(forbidden)), false);
  }
});

test('fails closed for wrong device, transport, candidate SDK or installer', () => {
  assert.throws(() => preflight(fakeRunner({ manufacturer: 'Google' })), /not identified as OnePlus/u);
  assert.throws(() => preflight(fakeRunner(), {
    device: { serial: 'PRIVATE', state: 'device', attributes: { usb: '1-2' } },
  }), /Wireless debugging/u);
  assert.throws(() => preflight(fakeRunner({ versionCode: '2026081509' })), /exact expected/u);
  assert.throws(() => preflight(fakeRunner({ targetSdk: 34 })), /exact expected/u);
  assert.throws(() => preflight(fakeRunner({ installer: 'com.example.sideload' })), /not delivered by Google Play/u);
  assert.throws(() => preflight(fakeRunner({
    packagePathOutput: 'package:/data/app/example/split_config.arm64_v8a.apk\n',
  })), /split paths are missing or ambiguous/u);
  assert.throws(() => preflight(fakeRunner({
    packagePathOutput: 'package:/data/app/one/base.apk\npackage:/data/app/two/base.apk\n',
  })), /split paths are missing or ambiguous/u);
});

test('permits an explicitly scoped USB transport without weakening the wireless default', () => {
  const fake = fakeRunner();
  const result = preflight(fake, {
    device: { serial: 'SYNTHETIC_USB', state: 'device', attributes: { usb: '1-2' } },
    allowedTransports: ['usb', 'wireless-adb'],
  });
  assert.equal(result.transport.type, 'usb');
  assert.equal(result.installedApplication.versionCode, '2026082601');

  assert.throws(() => preflight(fake, {
    allowedTransports: ['usb', 'unknown'],
  }), /transports are invalid/u);
});
