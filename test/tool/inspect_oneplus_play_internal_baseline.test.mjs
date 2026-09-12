import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAdbTransport,
  inspectOnePlusPlayInternalBaseline,
  parseInstalledOnePlusPackage,
  parsePlayInstaller,
} from '../../tool/inspect_oneplus_play_internal_baseline.mjs';

const device = {
  serial: '192.0.2.25:37123',
  state: 'device',
  attributes: { model: 'CPH2581' },
};
const expectedActive = {
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  versionCode: '2026081509',
};
const futureCandidate = { versionName: '1.0.0', versionCode: '2026082601' };

function fakeRunner({
  manufacturer = 'OnePlus',
  versionCode = '2026081509',
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
      return `  versionCode=${versionCode} minSdk=24 targetSdk=35\n  versionName=1.0.0\n`;
    }
    if (command === 'shell pm path com.shareittoo.app') {
      return packagePathOutput;
    }
    if (command === 'shell pm list packages -i com.shareittoo.app') {
      return `package:com.shareittoo.app installer=${installer}\n`;
    }
    if (command === 'shell pidof com.shareittoo.app') return '321 654\n';
    throw new Error(`Unexpected command: ${command}`);
  };
  return { runner, calls };
}

function inspect(fake, selectedDevice = device) {
  return inspectOnePlusPlayInternalBaseline({
    commandRunner: fake.runner,
    device: selectedDevice,
    expectedActive,
    futureCandidate,
    capturedAt: '2026-08-27T00:00:00.000Z',
  });
}

test('parses only the bounded installed package and Play installer truth', () => {
  assert.deepEqual(parseInstalledOnePlusPackage(
    'versionCode=2026081509 minSdk=24 targetSdk=35\nversionName=1.0.0\n',
  ), {
    versionName: '1.0.0',
    versionCode: '2026081509',
    minSdk: 24,
    targetSdk: 35,
  });
  assert.equal(
    parsePlayInstaller(
      'package:com.shareittoo.app installer=com.android.vending\n'
        + 'package:com.shareittoo.app.qa installer=com.google.android.packageinstaller\n',
      'com.shareittoo.app'),
    'com.android.vending',
  );
});

test('selects only the exact package and rejects missing or ambiguous exact sources', () => {
  assert.equal(
    parsePlayInstaller(
      'package:com.shareittoo.app.qa installer=com.google.android.packageinstaller\n'
        + 'package:com.shareittoo.app installer=com.android.vending\n',
      'com.shareittoo.app',
    ),
    'com.android.vending',
  );
  assert.throws(() => parsePlayInstaller(
    'package:com.shareittoo.app.qa installer=com.android.vending\n',
    'com.shareittoo.app',
  ), /source is unavailable/u);
  assert.throws(() => parsePlayInstaller(
    'package:com.shareittoo.app installer=com.android.vending\n'
      + 'package:com.shareittoo.app installer=com.android.vending\n',
    'com.shareittoo.app',
  ), /source is unavailable/u);
  assert.throws(() => parsePlayInstaller(
    'package:com.shareittoo.app installer=com.android.vending\n'
      + 'package:com.shareittoo.app installer=com.example.sideload\n',
    'com.shareittoo.app',
  ), /source is unavailable/u);
});

test('classifies wireless ADB without returning the address', () => {
  assert.equal(classifyAdbTransport(device), 'wireless-adb');
  assert.equal(classifyAdbTransport({
    serial: 'adb-private._adb-tls-connect._tcp',
    attributes: {},
  }), 'wireless-adb');
  assert.equal(classifyAdbTransport({
    serial: 'PRIVATE',
    attributes: { usb: '1-2' },
  }), 'usb');
});

test('produces a sanitized read-only baseline for the active Play build only', () => {
  const fake = fakeRunner();
  const result = inspect(fake);
  assert.equal(result.status, 'passed-active-internal-install-baseline-only');
  assert.equal(result.transport.type, 'wireless-adb');
  assert.equal(result.installedApplication.versionCode, '2026081509');
  assert.equal(result.installedApplication.installerPackageName, 'com.android.vending');
  assert.equal(result.installedApplication.functionalBehaviorClaimed, false);
  assert.equal(result.futureCandidate.installed, false);
  assert.equal(Object.values(result.boundaries).every((value) => value === false), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(device.serial), false);
  assert.equal(serialized.includes('321'), false);
  assert.equal(fake.calls.some((args) => args.includes('force-stop')), false);
  assert.equal(fake.calls.some((args) => args.includes('install')), false);
  assert.equal(fake.calls.some((args) => args.includes('input')), false);
});

test('fails closed for wrong device, transport, build or installer', () => {
  assert.throws(() => inspect(fakeRunner({ manufacturer: 'Google' })), /not identified as OnePlus/u);
  assert.throws(() => inspect(fakeRunner(), {
    serial: 'PRIVATE', state: 'device', attributes: { usb: '1-2' },
  }), /Wireless debugging/u);
  assert.throws(() => inspect(fakeRunner({ versionCode: '2026082601' })), /expected active/u);
  assert.throws(() => inspect(fakeRunner({ installer: 'com.example.sideload' })), /not delivered by Google Play/u);
  assert.throws(() => inspect(fakeRunner({
    packagePathOutput: 'package:/data/app/example/split_config.arm64_v8a.apk\n',
  })), /split paths are missing or ambiguous/u);
  assert.throws(() => inspect(fakeRunner({
    packagePathOutput: 'package:/data/app/one/base.apk\npackage:/data/app/two/base.apk\n',
  })), /split paths are missing or ambiguous/u);
});
