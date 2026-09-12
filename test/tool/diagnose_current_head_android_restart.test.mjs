import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  diagnoseCurrentHeadAndroidRestart,
} from '../../tool/diagnose_current_head_android_restart.mjs';

const apkBytes = Buffer.from('verified current-head restart candidate');
const apkSha256 = createHash('sha256').update(apkBytes).digest('hex');
const device = { serial: 'PRIVATE-DEVICE-ID', state: 'device', attributes: {} };
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
  buildNumber: '2026082301',
  commit: '76e6565cdb20d6a49fb417e87b044b237a1ae6c1',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: { apkSha256 },
};

function fakeRunner({
  locked = false,
  changedInode = false,
  bytes = apkBytes,
  failFirstLaunch = false,
} = {}) {
  let running = true;
  let snapshots = 0;
  let launches = 0;
  let launchAttempts = 0;
  const calls = [];
  const runner = (_file, args, options = {}) => {
    calls.push(args);
    const command = args.slice(2);
    const joined = command.join(' ');
    if (joined === 'shell dumpsys window policy') {
      return locked ? 'KeyguardStateMonitor mIsShowing=true' : 'KeyguardStateMonitor mIsShowing=false';
    }
    if (joined === 'shell pm path com.shareittoo.app') return 'package:/data/app/test/base.apk';
    if (joined === 'exec-out cat /data/app/test/base.apk') {
      return options.binary ? bytes : bytes.toString();
    }
    if (joined === 'shell dumpsys package com.shareittoo.app') {
      snapshots += 1;
      const inode = changedInode && snapshots > 1 ? '9002' : '9001';
      return [
        '  versionCode=2026082301 minSdk=24 targetSdk=36',
        '  versionName=1.0.0',
        `  User 0: ceDataInode=${inode} installed=true`,
        '    firstInstallTime=2026-08-17 08:45:28',
      ].join('\n');
    }
    if (joined === 'shell am force-stop com.shareittoo.app') {
      running = false;
      return '';
    }
    if (joined === 'shell pidof com.shareittoo.app') {
      if (!running) throw new Error('process absent');
      return '12345';
    }
    if (joined === 'get-state') return 'device';
    if (command[0] === 'shell' && command[1] === 'monkey') {
      launchAttempts += 1;
      if (failFirstLaunch && launchAttempts === 1) throw new Error('launcher unavailable');
      running = true;
      launches += 1;
      return 'Events injected: 1';
    }
    throw new Error(`Unexpected fake ADB command: ${joined}`);
  };
  return {
    runner,
    calls,
    get launches() { return launches; },
    get launchAttempts() { return launchAttempts; },
  };
}

function diagnose(fake) {
  return diagnoseCurrentHeadAndroidRestart({
    commandRunner: fake.runner,
    adbPath: 'adb',
    device,
    deviceSummary,
    candidate,
    capturedAt: '2026-08-23T11:00:00.000Z',
  });
}

test('proves a bounded exact-candidate force-stop and restart without sensitive output', () => {
  const fake = fakeRunner();
  const evidence = diagnose(fake);
  assert.equal(evidence.status, 'passed-bounded-process-restart-diagnostic');
  assert.deepEqual(
    Object.values(evidence.tests).map((entry) => entry.status),
    ['passed', 'passed', 'passed', 'passed', 'passed'],
  );
  assert.equal(evidence.boundaries.fullPilotScenarioA14Passed, false);
  assert.equal(evidence.boundaries.storeInstallationGateSatisfied, false);
  assert.equal(evidence.boundaries.accountContentInspected, false);
  assert.equal(JSON.stringify(evidence).includes(device.serial), false);
  assert.equal(JSON.stringify(evidence).includes('12345'), false);
  assert.equal(fake.launches, 1);
});

test('refuses a locked phone without attempting a force-stop or passcode entry', () => {
  const fake = fakeRunner({ locked: true });
  assert.throws(() => diagnose(fake), /locked.*never enters a passcode/u);
  assert.equal(fake.calls.some((args) => args.includes('force-stop')), false);
  assert.equal(fake.calls.some((args) => args.includes('input')), false);
});

test('rejects a different installed APK before changing process state', () => {
  const fake = fakeRunner({ bytes: Buffer.from('different APK') });
  assert.throws(() => diagnose(fake), /does not match the current-head candidate/u);
  assert.equal(fake.calls.some((args) => args.includes('force-stop')), false);
});

test('rejects app-data identity drift and leaves the app relaunched', () => {
  const fake = fakeRunner({ changedInode: true });
  assert.throws(() => diagnose(fake), /data identity changed across restart/u);
  assert.equal(fake.launches, 1);
});

test('makes one bounded recovery launch when the diagnostic launch fails', () => {
  const fake = fakeRunner({ failFirstLaunch: true });
  assert.throws(() => diagnose(fake), /ADB restart diagnostic command failed/u);
  assert.equal(fake.launchAttempts, 2);
  assert.equal(fake.launches, 1);
});
